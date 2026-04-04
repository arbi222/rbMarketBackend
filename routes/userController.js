const router = require("express").Router();
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Brand = require("../models/Brand");
const Category = require("../models/Category");
const Review = require("../models/Review");
const Cart = require("../models/Cart");
const Notification = require("../models/Notification");
const isAuthenticated = require("../middlewares/isAuthenticated");
const checkSessionExpiry = require("../middlewares/sessionExpiry");
const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const { mg } = require("../utils/helper");

// Get the authenticated user
router.get("/me", checkSessionExpiry, isAuthenticated, async (req, res) => {
    try{
        const user = await User.findById(req.user.id).select("-password -hash -__v -updatedAt +salt");

        if (!user){
            return res.status(404).json({message: "User not found"});
        }

        return res.status(200).json(user);
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Get a user's public data
router.get("/:slug", checkSessionExpiry, isAuthenticated, async (req, res) => {
    try{
        const user = await User.findOne({slug: req.params.slug});

        if (!user){
            return res.status(404).json({message: "User not found"});
        }

        const { isAdmin, password, updatedAt, __v, salt, hash, googleId, 
                isTwoFactorAuthOn, isEmailVerified, ...userInfo } = user._doc;
        return res.status(200).json({user: userInfo});
    }
    catch (err){
        return res.status(500).json({message: err.message});
    }
});

// Update a user
router.put("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userIdFromSession = req.user.id;
    const isAdmin = req.user.isAdmin;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid user ID format" });
    }
    
    if (userIdFromSession === req.params.id || isAdmin){
        if (req.body.newPassword){
            if (req.body.newPassword === req.body.confirmPassword){
                try{
                    const user = await User.findById(req.params.id);
                    if (!user) {
                        return res.status(404).json({message: "User does not exist"});
                    }
    
                    await new Promise((resolve, reject) => {
                        user.changePassword(req.body.oldPassword, req.body.newPassword, (err) => {
                            if (err) return reject(err);
                            resolve();
                        });
                    });
                    await user.save();

                    const mailOptions = {
                        from: `"RBMarket Support" <noreply@${process.env.MAILGUN_DOMAIN}>`,
                        to: [user.email],
                        subject: "Your RBMarket password was changed",
                        text: `Hi ${user.firstName || "User"},\n\nYour RBMarket account password has been successfully changed.\n\nIf this wasn't you, please contact support immediately or reset your password again.\n\n— The RBMarket Team`,
                        html: `
                          <p>Hello ${user.firstName || "User"},</p>
                          <p>This is a confirmation that your <strong>RBMarket</strong> account password has been successfully changed.</p>
                          <p>If this wasn’t you, please reset your password immediately to secure your account.</p>
                          <p>— The RBMarket Team</p>
                        `,
                    };
                
                    await mg.messages.create(process.env.MAILGUN_DOMAIN, mailOptions);
                    return res.status(200).json({ message: "Password changed successfully!" });
                }
                catch(err){
                    return res.status(403).json({message: "Old password is wrong!"});
                }
            }
            else{
                return res.status(403).json({message: "Password & Confirm password do not match"});
            }
        }
        else{
            try{
                const { password, hash, salt, isAdmin, email, ...allowedUpdates } = req.body;

                 if (email) {
                    const emailExists = await User.findOne({email, _id: {$ne: req.params.id}});
                    if (emailExists) {
                        return res.status(400).json({message: "This email is already in use by another account."});
                    }
                    allowedUpdates.email = email;
                }

                await User.findByIdAndUpdate(req.params.id, { $set: allowedUpdates });
                return res.status(200).json({message: "Account has been updated!"});
            }
            catch(err) {
                return res.status(500).json({message: err.message});
            }
        }
    }
    else{
        return res.status(403).json({message: "You can update only your account!"});
    }
});

router.post("/verify-password", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userIdFromSession = req.user.id;
    const password = req.body.password;

    try{
        const user = await User.findById(userIdFromSession);

        if (!user) {
            return res.status(404).json({message: "User not found!"});
        }

        if (!password){
            return res.status(403).json({message: "Enter your password!"});
        }

        await new Promise((resolve, reject) => {
            user.authenticate(password, (err, matched, passError) => {
                if (err || passError || !matched) return reject(new Error("Password is incorrect!"));
                resolve(true);
            });
        });

        return res.status(200).json({verified: true});
    }
    catch(err){
        return res.status(403).json({message: "Password is incorrect!", verified: false});
    }
});

// Delete a user
router.delete("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => { // delete all his products along with his reviews
    const userIdFromSession = req.user.id;
    const isAdmin = req.user.isAdmin;
    
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid user ID format" });
    }

    if (isAdmin && userIdFromSession === req.params.id){
        return res.status(403).json({message: "Admin can not delete their own account."})
    }
    
    if (userIdFromSession === req.params.id || isAdmin){
        try{
            const user = await User.findById(req.params.id);

            if (!user) {
                return res.status(404).json({message: "User not found!"});
            }

            if (user.walletBalance > 0){
                return res.status(403).json({message: "Please withdraw your remaining wallet balance before deleting your account."});
            }

            if (!isAdmin){
                if (!req.body.password){
                    return res.status(403).json({message: "Enter your password!"});
                }

                await new Promise((resolve, reject) => {
                    user.authenticate(req.body.password, (err, matched, passError) => {
                        if (err || passError || !matched) return reject(new Error("Password is incorrect!"));
                        resolve(matched);
                    });
                });
            }

            await Cart.findOneAndDelete({user: user._id});

            await User.findByIdAndDelete(req.params.id);
            return res.status(200).json({message: "Account has been deleted"});
        }
        catch(err){
            return res.status(500).json({message: err.message});
        }
    }
    else{
        return res.status(403).json({message: "You can not delete this account!"});
    }
});

router.delete("/deleteAccount/google", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userIdFromSession = req.user.id;
    const googleId = req.body.googleId;
    
    if (!googleId){
        return res.status(403).json({message: "Google ID is missing!"});
    }

    try{
        const user = await User.findOne({_id: userIdFromSession, googleId: googleId});
        if (!user) return res.status(404).json({message: "User not found"});
        
        if (!user.googleId || user.googleId !== googleId) {
            return res.status(403).json({message: "Unauthorized Google delete request"});
        }

        if (user.walletBalance > 0){
            return res.status(403).json({status: 403, message: "Please withdraw your remaining wallet balance before deleting your account."});
        }

        await Cart.findOneAndDelete({user: user._id});

        await User.findByIdAndDelete(user._id);
        if (req.logout) {
            req.logout(function(err) {
                if (err) console.error("Logout error:", err);
            });
        }
        res.status(200).json({message: "User deleted successfully"});
    }
    catch(err){
        res.status(500).json({message: "Failed to delete user."});
    }
});

router.patch("/admin/setStatus/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const isAdmin = req.user.isAdmin;
    const adminUser = req.user.id;
    const userId = req.params.id;
    const accountStatus = req.body.accountStatus;
    const statusReason = req.body.statusReason;
    
    if (!isAdmin){
        return res.status(403).json({message: "Only the admin can change the status of a user."});
    }

    if (req.user._id.toString() === userId) {
        return res.status(400).json({message: "You cannot change your own account status."});
    }

    if (!["active", "frozen", "banned"].includes(accountStatus)) {
      return res.status(400).json({message: "Invalid status"});
    }

    if (["frozen", "banned"].includes(accountStatus) && !statusReason){
        return res.status(400).json({message: "Please specify a reason for this current choosen status."});
    }

    try{
        const update = {
            accountStatus,
            statusReason: ["frozen", "banned"].includes(accountStatus) ? statusReason : ""
        }

        const user = await User.findByIdAndUpdate(userId, update, {new: true});
        if (!user){
            return res.status(404).json({message: "User not found"});
        }

        if (accountStatus === "frozen"){
            const notificationData = new Notification({
                recipient: userId,
                sender: adminUser,
                type: "NEW_MESSAGE",
                message: statusReason,
                read: false
            })
            await notificationData.save();
    
            const io = req.app.get("io");
            const users = req.app.get("users");
            const socketIdSeller = users.get(userId.toString());
            if (socketIdSeller){
                io.to(socketIdSeller).emit("notification", notificationData);
            }
        }

        res.status(200).json({message: "User status updated"});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Get all users for admin
router.get("/admin/getUsers", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const isAdmin = req.user.isAdmin;
    const page = parseInt(req.query.page) || 1;
    const limit = 4;     
    const skip = (page - 1) * limit;
    const searchQuery = req.query.search;
    const accountStatus = req.query.accountStatus;  

    if (!isAdmin) {
        return res.status(403).json({message: "You are not an admin"});
    }

    try{
        let filter = {};

        if (searchQuery){
            const searchTerms = searchQuery.split(" ")
                .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .filter(term => term.trim() !== "");

            filter = {
                $and: searchTerms.map(term => ({
                    $or: [
                        { firstName: { $regex: term, $options: "i" } },
                        { lastName: { $regex: term, $options: "i" } }
                    ]
                }))
            };
        }

        if (accountStatus){
            filter.accountStatus = accountStatus;
        };

        const totalUsers = await User.countDocuments(filter);
        const totalPages = Math.ceil(totalUsers / limit);

        const users = await User.find(filter)
                                .select("-password -hash -salt -__v -googleId")
                                .skip(skip)
                                .limit(limit)
                                .sort({createdAt: -1});
        
        return res.status(200).json({
            users,
            page,
            totalPages,
            totalUsers,
            hasMore: page < totalPages,
        });
    }
    catch(err) {
        return res.status(500).json({message: err.message});
    }
});

router.get("/admin/getDashboard", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userId = req.user.id;

    try{
        const adminUser = await User.findById(userId);
        if (!adminUser) return res.status(404).json({message: "User not found!"});
        if (!adminUser.isAdmin) return res.status(404).json({message: "You are not the admin!"});

        const [
            usersCount,
            productsCount,
            ordersCount,
            transactionsCount,
            brandsCount,
            categoriesCount,
            reviewsCount
        ] = await Promise.all([
            User.countDocuments({isAdmin: false}),           
            Product.countDocuments({}),   
            Order.countDocuments({}),
            Transaction.countDocuments({}),        
            Brand.countDocuments({}),      
            Category.countDocuments({}),
            Review.countDocuments({})    
        ]);

        const dashboardData = {
            users: usersCount,
            products: productsCount,
            orders: ordersCount,
            transactions: transactionsCount,
            brands: brandsCount,
            categories: categoriesCount,
            reviews: reviewsCount,
            revenue: adminUser.walletBalance
        }

        return res.status(200).json(dashboardData);
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

module.exports = router;