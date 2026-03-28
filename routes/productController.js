const router = require("express").Router();
const isAuthenticated = require("../middlewares/isAuthenticated");
const checkSessionExpiry = require("../middlewares/sessionExpiry");
const User = require("../models/User");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const Review = require("../models/Review");
const mongoose = require("mongoose");
const { buildFilters } = require("../utils/helper");
const checkUserStatus = require("../middlewares/accountStatus");
const checkEmailVerification = require("../middlewares/checkEmailVerification");

// Create a product
router.post("/", checkSessionExpiry, isAuthenticated, checkUserStatus, checkEmailVerification, async (req, res) => {
    const userIdFromSession = req.user.id;
    const {title, description, price, image, imageFilePath, category, brand, condition, stock} = req.body;

    try{
        const user = await User.findById(userIdFromSession);
        if (!user) {
            return res.status(404).json({message: "User not found"});
        }

        if (!title || !title.trim()){
            return res.status(400).json({message: "Title should not be empty."});
        }

        if (image === "" || imageFilePath === ""){
            return res.status(400).json({message: "Image should not be empty."});
        }

        if (isNaN(price) || price <= 0) {
            return res.status(400).json({message: "Price must be a positive number."});
        }

        if (!Number.isInteger(stock) || stock < 0) {
            return res.status(400).json({message: "Stock must be a non-negative number."});
        }

        if (!mongoose.Types.ObjectId.isValid(category)) {
            return res.status(400).json({message: "Invalid category ID."});
        }

        if (!["New", "Used"].includes(condition)) {
          return res.status(400).json({ message: "Condition must be 'New' or 'Used'." });
        }

        const categoryExists = await Category.findById(category);
        if (!categoryExists){
            return res.status(404).json({ message: "Category not found." });
        }

        const brandExists = await Brand.findById(brand);
        if (!brandExists){
            return res.status(404).json({ message: "Brand not found." });
        }

        const newProduct = new Product ({
            title: title.trim(),
            description: description?.trim() || "",
            price: Math.round(price * 100),
            image,
            imageFilePath,
            seller: userIdFromSession,
            category,
            brand, 
            condition,
            stock
        });
        await newProduct.save();

        const populatedProduct = await Product.findById(newProduct._id).populate("category brand seller", "name firstName lastName email avatar feedbackPositive feedbackNegative createdAt aboutBio slug");

        const sellerCategoryIds = await Product.distinct("category", { seller: userIdFromSession });
        const sellerCategories = await Category.find({ _id: { $in: sellerCategoryIds } }).select("name");

        const productObj = populatedProduct.toObject();
        productObj.sellerCategories = sellerCategories;

        return res.status(201).json({message: "Product was created successfully", product: productObj});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Get all products 
router.get("/", async (req, res) => {
    const userIdFromSession = req.user?.id;
    const isAdmin = req.user?.isAdmin;
    const page = parseInt(req.query.page) || 1;
    const limit = 4; 
    const skip = req.query.skip ? parseInt(req.query.skip) : (page - 1) * limit;
    const globalSearch = req.query.globalSearch;
    const isOwnProfile = req.user && req.user.slug === req.query.sellerSlug;

    try{
        const filter = await buildFilters(req.query, {
            excludeSellerId: (req.user && !isAdmin) ? userIdFromSession : false,
            excludeOutOfStock: !(isOwnProfile || isAdmin),
            currentUser: req.user || null,
            isAdmin,
            isOwnProfile
        });

        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);

        const query = Product.find(filter).skip(skip).limit(limit).sort({createdAt: -1});

        if (isAdmin && !req.query.sellerSlug){
            query.populate("seller", "firstName lastName slug");
        }
        
        if (globalSearch === "true"){
            if (totalProducts === 0){
                return res.status(200).json({message: "No products found matching your search.", products: []});
            }
            query.select("title");
        }

        const products = await query;
                           
        return res.status(200).json({
            products,
            totalPages,
            totalProducts,
            page,
            hasMore: skip + products.length < totalProducts,
            nextSkip: skip + limit
        });
    }
    catch(err){
        if (
            err.message === "Invalid category ID" ||
            err.message === "Category not found" ||
            err.message === "Invalid brand ID" ||
            err.message === "Brand not found" ||
            err.message === "Seller not found"
        ) {
            return res.status(400).json({ message: err.message });
        }
        return res.status(500).json({message: err.message});
    }
});

// Get a product
router.get("/:slug", async (req, res) => {
    const productSlug = req.params.slug;

    try{                                                    
        const product = await Product.findOne({slug: productSlug})
                                    .populate("category brand seller", "name firstName lastName email avatar feedbackPositive feedbackNegative createdAt aboutBio slug");
        if (!product){
            return res.status(404).json({message: "This product was not found or it is deleted."});
        }

        const sellerCategoryIds = await Product.distinct("category", { seller: product.seller._id });
        const sellerCategories = await Category.find({ _id: { $in: sellerCategoryIds } }).select("name");

        const productObj = product.toObject();
        productObj.sellerCategories = sellerCategories;

        return res.status(200).json({product: productObj});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Update a product
router.put("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userIdFromSession = req.user.id;
    const productId = req.params.id;
    const isAdmin = req.user.isAdmin;
    const {title, description, price, image, imageFilePath, condition, stock, brand, category} = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({message: "Invalid product ID"});
    }

    try{
        const product = await Product.findById(productId).select("seller");
        
        if (!product){
            return res.status(404).json({message: "Product is not found"});
        }

        if (product.seller.toString() !== userIdFromSession && !isAdmin){
            return res.status(403).json({message: "You are not authorized to update this product."});
        }

        let priceInCents = 0;
        if (price !== undefined){
            priceInCents = Math.round(price * 100);
        }

        const updatedProduct = await Product.findByIdAndUpdate(productId, 
                                    {
                                    ...(title && { title: title.trim() }),
                                    ...(description !== undefined && { description: description }),
                                    ...(image && { image }),
                                    ...(imageFilePath && { imageFilePath }),
                                    ...(brand && { brand }),
                                    ...(category && { category }),
                                    ...(price !== undefined && { price: priceInCents }),
                                    ...(condition && { condition }),
                                    ...(stock !== undefined && { stock }),
                                    }, 
                                    {new: true, runValidators: true}
                                    ).populate("category brand seller", "name firstName lastName email avatar feedbackPositive feedbackNegative createdAt aboutBio slug");

        const sellerCategoryIds = await Product.distinct("category", {seller: updatedProduct.seller._id});
        const sellerCategories = await Category.find({ _id: { $in: sellerCategoryIds } }).select("name");

        const productObj = updatedProduct.toObject();
        productObj.sellerCategories = sellerCategories;
        
        return res.status(200).json({message: "Product has been updated.", product: productObj});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Delete a product
router.delete("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userIdFromSession = req.user.id;
    const productId = req.params.id;
    const isAdmin = req.user.isAdmin;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({message: "Invalid product ID"});
    }

    try{
        const product = await Product.findById(productId).select("seller");
        
        if (!product){
            return res.status(404).json({message: "Product does not exist or it has been deleted."});
        }

        if (product.seller.toString() !== userIdFromSession && !isAdmin){
            return res.status(403).json({message: "You are not authorized to delete this product."});
        }

        // delete all the reviews that this product has taken and also update the sellers feedback rating after deleting this product and its reviews
        await Review.deleteMany({product: productId});

        const result = await Review.aggregate([
          {$match: {seller: product.seller}},
          {
            $group: {
              _id: "$vote",
              count: {$sum: 1}
            }
          }
        ]);

        let feedbackPositive = 0;
        let feedbackNegative = 0;

        result.forEach(r => {
          if (r._id === "Positive") feedbackPositive = r.count;
          if (r._id === "Negative") feedbackNegative = r.count;
        });

        await User.findByIdAndUpdate(product.seller, {
            feedbackPositive,
            feedbackNegative
        });

        await Product.findByIdAndDelete(productId);
        return res.status(200).json({message: "Product and related reviews deleted successfully."});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

module.exports = router;