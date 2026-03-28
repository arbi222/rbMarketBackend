const router = require("express").Router();
const isAuthenticated = require("../middlewares/isAuthenticated");
const checkSessionExpiry = require("../middlewares/sessionExpiry");
const mongoose = require("mongoose");
const Review = require("../models/Review");
const Product = require("../models/Product");
const Order = require("../models/Order");
const User = require("../models/User");
const Notification = require("../models/Notification");

// create a review
router.post("/:productId", checkSessionExpiry, isAuthenticated, async (req, res) => {
    try{
        const loggedInUser = req.user.id;
        const isAdmin = req.user.isAdmin;
        const { productId } = req.params;
        const { comment, vote } = req.body;

        if (isAdmin){
            return res.status(403).json({message: "Admins can not leave a review because they dont buy products."});
        }

        if (!comment || !comment.trim()) {
            return res.status(400).json({message: "Comment cannot be empty."});
        }

        if (!["Positive", "Negative"].includes(vote)) {
          return res.status(400).json({ message: "Vote must be 'Positive' or 'Negative'." });
        }

        const product = await Product.findById(productId);
        if (!product){
            return res.status(404).json({message: "Product not found."});
        }

        const hasBought = await Order.findOne({buyer: loggedInUser, status: "delivered", "items.product": productId});
        if (!hasBought){
            return res.status(403).json({message: "You can only review products that are delivered to you."});
        }

        const existing = await Review.findOne({product: productId, user: loggedInUser});
        if (existing) {
            return res.status(400).json({message: "You have already reviewed this product."});
        }

        const review = new Review({
            user: loggedInUser,
            seller: product.seller,
            product: productId,
            comment: comment.trim(),
            vote 
        });

        await review.save();

        await User.findByIdAndUpdate(product.seller, {
            $inc: {
                feedbackPositive: vote === "Positive" ? 1 : 0,
                feedbackNegative: vote === "Negative" ? 1 : 0
            }
        });

        const notificationData = new Notification({
            recipient: product.seller,
            sender: loggedInUser,
            type: "NEW_REVIEW",
            message: `Your item "${product.title}" got a new review.`,
            link: `/item/${product.slug}#reviewForm`,
            read: false
        })
        await notificationData.save();

        const io = req.app.get("io");
        const users = req.app.get("users");
        const socketIdSeller = users.get(product.seller.toString());
        if (socketIdSeller){
            io.to(socketIdSeller).emit("notification", notificationData);
        }

        const populatedReview = await Review.findById(review._id).populate("user", "firstName lastName slug");  

        return res.status(201).json({review: populatedReview, message: "Review added successfully!"});
    }
    catch(err){
        res.status(500).json({message: err.message});
    }
});

// update a review
router.put("/:reviewId", checkSessionExpiry, isAuthenticated, async (req, res) => {
    try{
        const loggedInUser = req.user.id;
        const { reviewId } = req.params;
        const { comment, vote } = req.body;

        const review = await Review.findById(reviewId);
        if (!review){
            return res.status(404).json({message: "Review not found."});
        }

        if (review.user.toString() !== loggedInUser.toString()){
            return res.status(403).json({message: "Not allowed to edit this review."});
        }

        if (vote && !["Positive", "Negative"].includes(vote)) {
            return res.status(400).json({ message: "Vote must be 'Positive' or 'Negative'." });
        }

        const oldVote = review.vote;

        if (review.comment === comment && oldVote === vote){
            return res.status(400).json({ message: "No changes detected." });
        }

        if (comment !== undefined) review.comment = comment.trim();
        if (vote !== undefined) review.vote = vote;

        await review.save();

        if (oldVote !== vote) {
            const user = await User.findById(review.seller);

            let feedbackPositive = user.feedbackPositive;
            let feedbackNegative = user.feedbackNegative;

            feedbackPositive += vote === "Positive" ? 1 : -1;
            feedbackNegative += vote === "Negative" ? 1 : -1;
        
            feedbackPositive = Math.max(0, feedbackPositive);
            feedbackNegative = Math.max(0, feedbackNegative);
        
            await User.findByIdAndUpdate(review.seller, {
                feedbackPositive,
                feedbackNegative
            });
        }

        const populatedReview = await review.populate("user", "firstName lastName slug");    

        return res.json({review: populatedReview, message: "Review updated successfully!"});
    }
    catch(err){
        res.status(500).json({message: err.message});
    }
});

// check if the product can be reviewed by the current user 
router.get("/canReview/:productId", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userId = req.user.id;
    const productId = req.params.productId;

    try{
        const order = await Order.findOne({
            buyer: userId,
            status: "delivered",
            "items.product": productId
        });

        const alreadyReviewed = await Review.findOne({
            user: userId,
            product: productId
        });

        res.status(200).json({
            canReview: !!order && !alreadyReviewed
        })
    }
    catch(err){
        res.status(500).json({message: err.message});
    }
});

// get all reviews for a product
router.get("/product/:productId", async (req, res) => {
    try{
        const { productId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const totalReviews = await Review.countDocuments({product: productId});

        const reviews = await Review.find({product: productId})
                                    .populate("user", "firstName lastName slug")
                                    .sort({createdAt: -1})
                                    .skip(skip)
                                    .limit(limit);
        return res.status(200).json({
            reviews: reviews,
            page,
            totalPages: Math.ceil(totalReviews / limit),
            totalReviews
        });
    }
    catch(err){
        res.status(500).json({message: err.message});
    }
});

// get all reviews for a seller
router.get("/seller/:sellerId", async (req, res) => {
    try{
        const { sellerId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const totalReviews = await Review.countDocuments({seller: sellerId});

        const reviews = await Review.find({seller: sellerId})
                                    .populate("user product", "firstName lastName slug title")
                                    .sort({createdAt: -1})
                                    .skip(skip)
                                    .limit(limit);
        return res.status(200).json({
            reviews: reviews,
            page,
            totalPages: Math.ceil(totalReviews / limit),
            totalReviews
        });
    }
    catch(err){
        res.status(500).json({message: err.message});
    }
});

// get all reviews for the admin
router.get("/allReviews", checkSessionExpiry, isAuthenticated, async (req, res) => {
    try{
        const isAdmin = req.user.isAdmin;
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        if (!isAdmin){
            return res.status(403).json({message: "Not allowed to access the reviews."});
        }

        const totalReviews = await Review.countDocuments({});

        const reviews = await Review.find()
                                    .populate("product user", "slug title firstName lastName")
                                    .sort({createdAt: -1})
                                    .skip(skip)
                                    .limit(limit);
        return res.status(200).json({
            reviews,
            page,
            totalPages: Math.ceil(totalReviews / limit),
            totalReviews
        });
    }
    catch(err){
        res.status(500).json({message: err.message});
    }
});

// delete a review
router.delete("/:reviewId", checkSessionExpiry, isAuthenticated, async (req, res) => {
    try{
        const { reviewId } = req.params;
        const loggedInUser = req.user.id;
        const isAdmin = req.user?.isAdmin || false;

        const review = await Review.findById(reviewId);
        if (!review){
            return res.status(404).json({message: "Review not found."});
        }

        if (loggedInUser.toString() !== review.user.toString() && !isAdmin){
            return res.status(403).json({message: "Not allowed to delete this review."});
        }

        const oldVote = review.vote;

        await review.deleteOne();

        const user = await User.findById(review.seller);
        let feedbackPositive = user.feedbackPositive;
        let feedbackNegative = user.feedbackNegative;

        feedbackPositive += oldVote === "Positive" ? -1 : 0;
        feedbackNegative += oldVote === "Negative" ? -1 : 0;
    
        feedbackPositive = Math.max(0, feedbackPositive);
        feedbackNegative = Math.max(0, feedbackNegative);
    
        await User.findByIdAndUpdate(review.seller, {
            feedbackPositive,
            feedbackNegative
        });

        return res.status(200).json({message: "Review deleted successfully."});
    }
    catch(err){
        res.status(500).json({message: err.message});
    }
});

module.exports = router;