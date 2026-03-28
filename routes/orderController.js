const router = require("express").Router();
const isAuthenticated = require("../middlewares/isAuthenticated");
const checkSessionExpiry = require("../middlewares/sessionExpiry");
const mongoose = require("mongoose");
const User = require("../models/User");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Transaction = require("../models/Transaction");
const Notification = require("../models/Notification");
const { applyFirstTransactionLock } = require("../utils/helper");
const checkUserStatus = require("../middlewares/accountStatus");
const checkEmailVerification = require("../middlewares/checkEmailVerification");

// Create an order
router.post("/", checkSessionExpiry, isAuthenticated, checkUserStatus, checkEmailVerification, async (req, res) => {
    const buyerId = req.user.id;
    const { items, shippingAddress, paymentProvider } = req.body;

    if (!items || !items.length){
        return res.status(400).json({message: "Cart is empty."});
    }

    try{
        let totalAmount = 0;
        const orderItems = [];

        for (const item of items){
            const product = await Product.findById(item.product._id);
            if (!product) return res.status(404).json({message: "Product not found"});

            if (item.quantity > product.stock){
                return res.status(400).json({message: `Not enough stock for the product: ${product.title}`});
            }

            const subtotal = product.price * item.quantity;
            const platformFee = Math.round(subtotal * parseFloat(process.env.FEE_PERCENT) / 100);
            const sellerAmount = subtotal - platformFee;

            totalAmount += subtotal;
            orderItems.push({
                product: product._id,
                productTitle: product.title,
                productSlug: product.slug,
                productCondition: product.condition,
                seller: product.seller,
                unitPrice: product.price,
                quantity: item.quantity,
                subtotal,
                platformFee,
                sellerAmount
            })      
            
            const updated = await Product.findOneAndUpdate(
                {_id: product._id, stock: {$gte: item.quantity}},
                {$inc: {stock: -item.quantity}},
                {new: true}
            );

            if (!updated) return res.status(400).json({message: `Stock update failed for ${product.title}`});
        }

        const order = await Order.create({
            buyer: buyerId,
            type: "purchase",
            items: orderItems,
            totalAmount,
            currency: "usd",
            status: "pending",
            payment: {
                provider: paymentProvider
            },
            shippingAddress
        })

        return res.status(201).json({message: "Order placed successfully", order});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Get all orders of a user who is a buyer or admin can get all orders
router.get("/orders/:userId", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userId = req.params.userId;
    const isAdmin = req.user.isAdmin;
    const loggedInUserId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const status = req.query.status;
    const limit = 5;
    const skip = req.query.skip ? parseInt(req.query.skip) : (page - 1) * limit;

    if (!isAdmin){
        if (!mongoose.Types.ObjectId.isValid(userId)){
            return res.status(400).json({message: "Invalid user ID"});
        }

        if (loggedInUserId.toString() !== userId.toString()){
            return res.status(403).json({message: "Access denied."});
        }
    }

    try{
        let query = isAdmin ? {} : {buyer: userId, isDeletedByUser: false};

        if (status){
            query.status = status;
        }

        const orders = await Order.find(query)
                                .skip(skip)
                                .limit(limit)
                                .populate("buyer items.product items.seller", "title price image condition slug firstName lastName avatar")
                                .sort({createdAt: -1});
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        return res.status(200).json({
            orders, 
            totalPages,
            totalOrders,
            page,
            hasMore: skip + orders.length < totalOrders,
            nextSkip: skip + limit
        });
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Get an order
router.get("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const orderId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin;

    if (!mongoose.Types.ObjectId.isValid(orderId)){
        return res.status(400).json({message: "Invalid order ID"});
    }

    try{
        const order = await Order.findById(orderId).populate("buyer items.seller items.product", "firstName lastName avatar slug title image condition");
        if (!order){
            return res.status(404).json({message: "Order not found"});
        }

        if (userId !== order.buyer?._id.toString() && !isAdmin){
            return res.status(403).json({message: "You are not authorized to access this order"});
        }

        if (!isAdmin && order.isDeletedByUser){
            return res.status(403).json({message: "This order does not exist."});
        }

        return res.status(200).json({order});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

router.post("/:id/pay", checkSessionExpiry, isAuthenticated, checkUserStatus, checkEmailVerification, async (req, res) => {
    const buyerId = req.user.id;
    const {oneItem, fromCart} = req.body;

    try{
        const order = await Order.findById(req.params.id).populate("items.product items.seller");
        if (!order) return res.status(404).json({message: "Order not found"});

        if (order.buyer.toString() !== buyerId.toString()){
            return res.status(403).json({message: "Not your order"});
        }
        if (order.status !== "pending") return res.status(400).json({message: "Order already paid"});

        const buyer = await User.findById(buyerId);
        if (buyer.walletBalance < order.totalAmount){
            return res.status(400).json({message: "Insufficient balance"});
        }

        buyer.walletBalance -= order.totalAmount;
        await buyer.save();

        const transactions = [];
        const notifications = [];

        const io = req.app.get("io");
        const users = req.app.get("users");

        const admin = await User.findOne({isAdmin: true});

        for (const item of order.items){
            const seller = await User.findById(item.seller._id);
            if (seller._id.toString() === admin._id.toString()){
                admin.walletBalance += item.sellerAmount + item.platformFee;
                await admin.save();
            }
            else{
                seller.walletBalance += item.sellerAmount;
                await applyFirstTransactionLock(seller);
                admin.walletBalance += item.platformFee;
                await seller.save();
                await admin.save();
            }

            transactions.push(
                new Transaction({
                    user: seller._id.toString() === admin._id.toString() ? admin._id : seller._id,
                    type: "sale",
                    amount: seller._id.toString() === admin._id.toString() ? item.sellerAmount + item.platformFee : item.sellerAmount,
                    relatedOrder: order._id,
                    relatedProduct: item.product._id,
                    provider: "internal",
                    currency: order.currency,
                    balanceAfter: seller._id.toString() === admin._id.toString() ? admin.walletBalance : seller.walletBalance
                })
            );
           
            if (seller._id.toString() !== admin._id.toString()){
                transactions.push(
                    new Transaction({
                        user: admin._id,
                        type: "platform_fee",
                        amount: item.platformFee,
                        relatedOrder: order._id,
                        relatedProduct: item.product._id,
                        provider: "internal",
                        currency: order.currency,
                        balanceAfter: admin.walletBalance
                    })
                );
            }

            const copyText = item.quantity === 1 ? "copy" : "copies";
            let notificationData = {
                recipient: seller._id,
                sender: buyer._id,
                type: "ITEM_SOLD",
                message: `Your item "${item.productTitle}" has been sold ${item.quantity} ${copyText}.`,
                link: `/item/${item.productSlug}`,
                read: false
            }
            const notification = new Notification(notificationData);
            notifications.push(notification);

            notificationData._id = notification._id;
            notificationData.createdAt = notification._id.getTimestamp();

            const socketIdSeller = users.get(seller._id.toString());
            const socketIdAdmin = users.get(admin._id.toString());
            if (socketIdSeller){
                io.to(socketIdSeller).emit("notification", notificationData);
                if (seller._id.toString() === admin._id.toString()){
                    io.to(socketIdSeller).emit("balanceUpdate", {newBalance: admin.walletBalance});
                }
                else{
                    io.to(socketIdSeller).emit("balanceUpdate", {newBalance: seller.walletBalance});
                    io.to(socketIdAdmin).emit("balanceUpdate", {newBalance: admin.walletBalance});
                }
            }
        }

        transactions.push(
            new Transaction({
                user: buyer._id,
                type: "purchase",
                amount: order.totalAmount,
                relatedOrder: order._id,
                provider: "internal",
                currency: order.currency,
                balanceAfter: buyer.walletBalance
            })
        );

        const buyerNotificationData = {
            recipient: buyer._id,
            sender: admin._id,
            type: "ORDER_UPDATE",
            message: `Your order has been successfully paid and it will be delivered in 24 hours.`,
            link: `/order/${order._id}`,
            read: false
        }
        notifications.push(new Notification(buyerNotificationData));

        const socketIdBuyer = users.get(buyerId.toString());
        if (socketIdBuyer){
            io.to(socketIdBuyer).emit("notification", buyerNotificationData);
        }

        await Transaction.insertMany(transactions);
        await Notification.insertMany(notifications);

        order.status = "paid";
        order.payment.status = "paid";
        order.payment.paidAt = new Date();
        await order.save();

        if (!oneItem || fromCart){
            const userCart = await Cart.findOne({user: buyer._id});
            if (userCart){
                const orderedProductIds = order.items.map(item => item.product._id.toString());

                userCart.items = userCart.items.filter(cartItem => 
                    !orderedProductIds.includes(cartItem.product.toString())
                )
    
                await userCart.save();
            }
        }

        res.json({message: "Payment successful!", order});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

router.patch("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userId = req.user.id;
    const orderId = req.params.id;
    const orderStatus = req.body.status;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({message: "Invalid order ID"});
    }
    
    if (!orderStatus || (orderStatus !== "cancelled" && orderStatus !== "failed")){
        return res.status(400).json({message: "Invalid order status"});
    }

    try{
        const order = await Order.findById(orderId).populate("buyer", "firstName lastName slug");
        if (!order){
            return res.status(404).json({message: "Order does not exist or it has been deleted."});
        }

        if (order.status === "paid" || order.status === "delivered") {
           return res.status(400).json({message: "Completed orders cannot be modified."});
        }

        if (order.status !== "pending") {
           return res.status(400).json({message: "Only pending orders can be updated."});
        }

        if (order.buyer._id.toString() !== userId.toString()){
            return res.status(403).json({message: "You are not authorized to update this order."});
        }

        order.status = orderStatus;
        order.payment.status = orderStatus;
        await order.save();
        return res.status(200).json({message: "Order updated successfully!", order});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

router.delete("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin;
    const orderId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({message: "Invalid order ID"});
    }

    try{
        const order = await Order.findById(orderId);
        if (!order){
            return res.status(404).json({message: "Order does not exist or it has been deleted."});
        }

        if (order.buyer.toString() !== userId.toString() && !isAdmin){
            return res.status(403).json({message: "You are not authorized to delete this order."});
        }

        if (isAdmin){
            await Transaction.deleteMany({relatedOrder: orderId});
            await Order.findByIdAndDelete(orderId);
            return res.status(200).json({message: "Order and related transactions deleted successfully."});
        }

        if (order.buyer.toString() === userId.toString()){
            if (order.isDeletedByUser){
                return res.status(400).json({message: "Order is already deleted."});
            }
            order.isDeletedByUser = true;
            await order.save();
            return res.status(200).json({message: "Order has been deleted."});
        }

        return res.status(400).json({message: "Invalid operation."});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

module.exports = router;