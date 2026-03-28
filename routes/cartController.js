const router = require("express").Router();
const isAuthenticated = require("../middlewares/isAuthenticated");
const checkSessionExpiry = require("../middlewares/sessionExpiry");
const Cart = require("../models/Cart");
const Product = require("../models/Product");

// get cart
router.get("/", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userIdFromSession = req.user.id;
    const isAdmin = req.user.isAdmin;

    if (isAdmin){
        return res.status(403).json({message: "Admins do not have a cart because they dont buy products."});
    }

    try{
        const cart = await Cart.findOne({user: userIdFromSession})
                                .populate({
                                    path: "items.product",
                                    select: "title slug image price stock",
                                    populate: {
                                        path: "seller",
                                        select: "slug firstName lastName avatar feedbackPositive feedbackNegative"
                                    }
                                });
        res.status(200).json({items: cart ? cart.items : []});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// hydrate the guest cart with some more info for the products
router.post("/hydrateGuest", async (req, res) => {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0){
        return res.status(200).json([]);
    }

    try{
        const productIds = items.map((i) => i.productId);

        const products = await Product.find({
            _id: {$in: productIds}
        }).select("title price slug image stock").populate("seller", "firstName lastName slug avatar feedbackPositive feedbackNegative");

        const hydratedCart = items.map(item => {
            const product = products.find(
              p => p._id.toString() === item.productId
            );

            if (!product) return null;

            return {
              product: {
                _id: product._id,
                slug: product.slug,
                title: product.title,
                price: product.price,
                image: product.image,
                stock: product.stock,
                seller: product.seller
              },
              quantity: item.quantity,
            };
        }).filter(Boolean);

        res.status(200).json({items: hydratedCart});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
})

// add to cart for authenticated users
router.post("/add", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userIdFromSession = req.user.id;
    const isAdmin = req.user.isAdmin;
    const { productId, quantity } = req.body;

    if (isAdmin){
        return res.status(403).json({message: "Admins can not add to cart because they dont buy products."});
    }

    try{
        const product = await Product.findById(productId);
        if (!product){
            return res.status(404).json({message: "Product not found!"});
        }

        if (product.seller.toString() === userIdFromSession){
            return res.status(400).json({message: "You cannot add your own product to the cart."});
        }

        if (product.stock < 1){
            return res.status(400).json({message: `This product has already been sold.`});
        }

        let cart = await Cart.findOne({user: userIdFromSession});

        if (!cart){
            cart = new Cart({
                user: userIdFromSession,
                items: [{product: productId, quantity}]
            });
        }
        else{
            const itemExists = cart.items.find(i => i.product.toString() === productId);
            if (itemExists){
                if (itemExists.quantity + quantity > product.stock){
                    itemExists.quantity = product.stock;
                }
                else{
                    itemExists.quantity += quantity;
                }
            }
            else{
                cart.items.push({product: productId, quantity});
            }
        }

        await cart.save();

        const populatedCart = await cart.populate({
            path: "items.product",
            select: "title slug image price stock",
            populate: {
                path: "seller",
                select: "slug firstName lastName avatar feedbackPositive feedbackNegative"
            }
        });

        return res.status(200).json({
            items: 
                populatedCart.items
                .filter(i => i.product)
                .map(i => ({
                    product: {
                        _id: i.product._id,
                        slug: i.product.slug,
                        title: i.product.title,
                        price: i.product.price,
                        image: i.product.image,
                        stock: i.product.stock,
                        seller: i.product.seller
                    },
                    quantity: i.quantity
                })), 
            message: "Product added to cart."
        });
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// update cart quantity for items
router.put("/updateCart", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userIdFromSession = req.user.id;
    const { productId, quantity } = req.body;

    try{
        if (!Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).json({message: "Quantity must be a positive number."});
        }

        const product = await Product.findById(productId);
        if (!product){
            return res.status(404).json({message: "Product not found!"});
        }

        if (product.stock === 0) {
            return res.status(400).json({message: "Product is out of stock."});
        }

        const cart = await Cart.findOne({user: userIdFromSession});
        if (!cart){
            return res.status(404).json({message: "Cart is empty."});
        }

        const itemExists = cart.items.find(i => i.product.toString() === productId);
        if (!itemExists){
            return res.status(404).json({message: "Item does not exist in the cart."});
        }
        
        if (quantity > product.stock){
            itemExists.quantity = product.stock;
        }
        else{
            itemExists.quantity = quantity;
        }

        await cart.save();

        const populatedCart = await cart.populate({
            path: "items.product",
            select: "title slug image price stock",
            populate: {
                path: "seller",
                select: "slug firstName lastName avatar feedbackPositive feedbackNegative"
            }
        });

        return res.status(200).json({
            items: 
                populatedCart.items
                .filter(i => i.product)
                .map(i => ({
                    product: {
                        _id: i.product._id,
                        slug: i.product.slug,
                        title: i.product.title,
                        price: i.product.price,
                        image: i.product.image,
                        stock: i.product.stock,
                        seller: i.product.seller
                    },
                    quantity: i.quantity
                })), 
            message: "Quantity updated."
        });
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
})

// merge guest cart with user cart after log in
router.post("/merge", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userIdFromSession = req.user.id;
    const isAdmin = req.user.isAdmin;
    const guestItems = req.body;

    if (isAdmin){
        return res.status(403).json({message: "Admins can not add to cart because they dont buy products."});
    }

    try{
        let cart = await Cart.findOne({user: userIdFromSession});

        if (!cart) {
          cart = new Cart({
            user: userIdFromSession,
            items: []
          });
        }

        for (const guestItem of guestItems) {
            const product = await Product.findById(guestItem.productId);

            if (!product) continue;

            if (product.seller.toString() === userIdFromSession) continue; // we should not add to cart our own products

            const existingItem = cart.items.find(
              i => i.product.toString() === guestItem.productId
            );

            if (!existingItem) {
              cart.items.push({
                product: guestItem.productId,
                quantity: Number(guestItem.quantity)
              });
            } 
        }

        await cart.save();

        const populatedCart = await cart.populate({
          path: "items.product",
          select: "title slug image price stock",
          populate: {
            path: "seller",
            select: "slug firstName lastName avatar feedbackPositive feedbackNegative"
          }
        });

        res.status(200).json({
            items: 
                populatedCart.items
                .filter(i => i.product)
                .map(i => ({
                    product: {
                        _id: i.product._id,
                        slug: i.product.slug,
                        title: i.product.title,
                        price: i.product.price,
                        image: i.product.image,
                        stock: i.product.stock,
                        seller: i.product.seller
                    },
                    quantity: i.quantity
                })),
            message: "Cart merged successfully"
        });
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// remove item from cart
router.delete("/deleteItem/:productId", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userIdFromSession = req.user.id;
    const productId = req.params.productId;

    try {
        const result = await Cart.updateOne(
          {user: userIdFromSession},
          {$pull: {items: {product: productId}}}
        );
    
        if (result.modifiedCount === 0) {
          return res.status(404).json({message: "Item not found in cart."});
        }

        const populatedCart = await Cart.findOne({user: userIdFromSession}).populate({
            path: "items.product", 
            select: "title slug image price stock",
            populate: {
                path: "seller",
                select: "slug firstName lastName avatar feedbackPositive feedbackNegative"
            }
        });

        return res.status(200).json({
            items: populatedCart.items
            .filter(i => i.product)
            .map(i => ({
                product: {
                    _id: i.product._id,
                    slug: i.product.slug,
                    title: i.product.title,
                    price: i.product.price,
                    image: i.product.image,
                    stock: i.product.stock,
                    seller: i.product.seller
                },
                quantity: i.quantity
            })),
            message: "Item deleted successfully!"
        });
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// clear cart
router.delete("/deleteAll", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userIdFromSession = req.user.id;

    try{
       const deletedCart = await Cart.findOneAndDelete({user: userIdFromSession});

        if (!deletedCart) {
            return res.status(404).json({message: "Cart has already been cleared."});
        }

        return res.status(200).json({items: [], message: "Cart has been cleared."});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

module.exports = router;