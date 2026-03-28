const router = require("express").Router();
const isAuthenticated = require("../middlewares/isAuthenticated");
const checkSessionExpiry = require("../middlewares/sessionExpiry");
const paypalService = require("../services/paypal.service");
const User = require("../models/User");
const Order = require("../models/Order");
const Transaction = require("../models/Transaction");
const checkUserStatus = require("../middlewares/accountStatus");
const checkWithdrawStatus = require("../middlewares/withdrawStatus");
const { applyFirstTransactionLock } = require("../utils/helper");
const checkEmailVerification = require("../middlewares/checkEmailVerification");


router.post("/create-order", checkSessionExpiry, isAuthenticated, checkUserStatus, checkEmailVerification, async (req, res) => {
    const fundValue = req.body.fundValue;
    const oldMarketOrderId = req.body.orderId;
    let oldOrder;
    if (!fundValue) return res.status(400).json({message: "Invalid paypal request!"});

    const fundList = {
        1: 500,
        2: 1000,
        3: 2500,
        4: 5000,
        5: 10000,
        6: 25000,
    }

    const amountInCents = fundList[fundValue];
    const userId = req.user.id;

    try{
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({message: "User does not exist!"});
        if (user.isAdmin) return res.status(400).json({message: "Admin can not add funds."});

        const amountInDollars = (amountInCents / 100).toFixed(2);
        const order = await paypalService.createOrder(amountInDollars);

        if (oldMarketOrderId){
            oldOrder = await Order.findById(oldMarketOrderId).populate("buyer", "firstName lastName slug");
            if (!oldOrder) return res.status(400).json({message: "Invalid retry request."});

            oldOrder.status = "expired";
            oldOrder.payment.status = "expired";
            await oldOrder.save();
        }
       
        const rbmarketOrder = await Order.create({
            buyer: userId,
            type: "deposit",
            totalAmount: amountInCents,
            currency: "usd",
            status: "pending",
            payment: {
                provider: "paypal",
                status: "pending",
                paymentIntentId: order.id
            },
            shippingAddress: {
                firstName: user.firstName,
                lastName: user.lastName || "N/A",
                email: user.email,
                country: "N/A",
                city: "N/A",
                street: "N/A",
                postalCode: 0,
                mobileNumber: "N/A"
            }
        });
        
        res.status(201).json({id: order.id, rbmarketOrderId: rbmarketOrder._id, oldOrder});
    }
    catch(err){
        console.log(err)
        res.status(500).json({message: "Could not create Paypal order"});
    }
});

router.post("/capture-order", checkSessionExpiry, isAuthenticated, checkUserStatus, checkEmailVerification, async (req, res) => {
  const orderId = req.body.orderId;
  const rbmarketOrderId = req.body.rbmarketOrderId;
  const userId = req.user.id;

  try {
    const data = await paypalService.captureOrder(orderId);

    if (data.status === "COMPLETED") {
      const amountFromPaypal = parseFloat(data.purchase_units[0].payments.captures[0].amount.value);
      const amountInCents = Math.round(amountFromPaypal * 100);

      const user = await User.findById(userId);
      user.walletBalance += amountInCents;
      await user.save();

      const order = await Order.findById(rbmarketOrderId);
      if (order){
        order.status = "paid";
        order.payment.status = "paid";
        order.payment.paidAt = new Date();
        await order.save();
      }

      await Transaction.create({
        user: userId,
        type: "deposit",
        amount: amountInCents,
        currency: "usd",
        relatedOrder: order?._id,
        provider: "paypal",
        providerReference: data.id,
        balanceAfter: user.walletBalance
      })
      
      await applyFirstTransactionLock(user);
    }

    res.json(data);
  } 
  catch (err) {
    console.log(err);
    if (rbmarketOrderId) {
            try {
                const failedOrder = await Order.findById(rbmarketOrderId);
                if (failedOrder && failedOrder.status !== "paid") {
                    failedOrder.status = "failed";
                    failedOrder.payment.status = "failed";
                    await failedOrder.save();
                }
            } 
            catch (updateErr) {
                console.error("Failed to mark PayPal capture order as failed:", updateErr.message);
            }
        }
    res.status(500).json({message: "Could not capture PayPal order"});
  }
});


router.post("/withdraw", checkSessionExpiry, isAuthenticated, checkUserStatus, checkWithdrawStatus, checkEmailVerification, async (req, res) => {
    const userId = req.user.id;
    const amountInCents = req.body.amount;
    const receiverEmail = req.body.receiverEmail;
    const oldMarketOrderId = req.body.orderId;
    let oldOrder;
    let order;

    if (!receiverEmail.includes("@")){
        return res.status(400).json({message: "Invalid PayPal email"});
    }

    if (!amountInCents || amountInCents <= 0) return res.status(400).json({message: "Invalid request"});

    try{
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({message: "User not found!"});

        if (user.walletBalance < amountInCents){
            return res.status(400).json({message: "Insufficient balance"});
        }

        if (oldMarketOrderId){
            oldOrder = await Order.findById(oldMarketOrderId).populate("buyer", "firstName lastName slug");
            if (!oldOrder) return res.status(400).json({message: "Invalid retry request."});

            oldOrder.status = "expired";
            oldOrder.payment.status = "expired";
            await oldOrder.save();
        }

        order = await Order.create({
            buyer: user._id,
            totalAmount: amountInCents,
            currency: "usd",
            status: "pending",
            type: "withdraw",
            payment: {
                provider: "paypal",
                status: "pending",
            },
            shippingAddress: {
                firstName: user.firstName,
                lastName: user.lastName || "N/A",
                email: user.email,
                country: "N/A",
                city: "N/A",
                street: "N/A",
                postalCode: 0,
                mobileNumber: "N/A"
            }
        });

        const amountInDollars = (amountInCents / 100).toFixed(2);
        const payoutData = await paypalService.sendPayout({
            receiverEmail,
            amount: parseFloat(amountInDollars),
            note: "Withdraw from RBMarket wallet"
        });

        order.payment.paymentIntentId = payoutData.batch_header.payout_batch_id;
        order.status = "paid";
        order.payment.status = "paid";
        order.payment.paidAt = new Date();
        await order.save();

        user.walletBalance -= amountInCents;
        await user.save();

        await Transaction.create({
          user: userId,
          type: "withdraw",
          amount: amountInCents,
          currency: "usd",
          provider: "paypal",
          providerReference: payoutData.batch_header.payout_batch_id,
          balanceAfter: user.walletBalance
        });

        res.status(200).json({message: "Withdraw successful", oldOrder});
    }
    catch(err){
        if (order) {
            try {
                order.status = "failed";
                order.payment.status = "failed";
                await order.save();
            } 
            catch (updateErr) {
                console.error("Failed to mark withdraw order as failed:", updateErr.message);
            }
        }
        if (err.response && err.response.name === "INSUFFICIENT_FUNDS"){
            return res.status(400).json({message: "RB Market can not payout at this moment with Paypal. Try again later, or try using Stripe for now."});
        }
        res.status(500).json({message: "Withdraw failed"});
    }
});

module.exports = router;