const router = require("express").Router();
const isAuthenticated = require("../middlewares/isAuthenticated");
const checkSessionExpiry = require("../middlewares/sessionExpiry");
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const User = require("../models/User");

// Get all notifications of a user
router.get("/", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userId = req.user.id;

    try{    
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({message: "User not found!"});

        const notifications = await Notification.find({recipient: userId}).sort({createdAt: -1});
        res.status(200).json({notifications});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// get unread notifications
router.get("/unread-count", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userId = req.user.id;

    try{
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({message: "User not found!"});

        const count = await Notification.countDocuments({recipient: userId, read: false});
        res.status(200).json({count});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// read all notifications
router.patch("/readAll", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userId = req.user.id;

    try{ 
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({message: "User not found!"});
        
        await Notification.updateMany({recipient: userId, read: false}, {$set: {read: true}});
        res.status(200).json({message: "All notifications marked as read."});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// read a notification
router.patch("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const notificationId = req.params.id;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
        return res.status(400).json({message: "Invalid notification ID format"});
    }

    try{
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({message: "User not found!"});

        const updatedNotif = await Notification.findByIdAndUpdate(notificationId, {read: true});
        res.status(200).json({message: "Notification marked as read.", updatedNotification: updatedNotif});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Delete all notifications
router.delete("/deleteAll", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userId = req.user.id;

    try{
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({message: "User not found!"});

        await Notification.deleteMany({recipient: userId});
        return res.status(200).json({message: "All notifications have been deleted."});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Delete a notification
router.delete("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const notificationId = req.params.id;
    const userId = req.user.id;
    
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
        return res.status(400).json({message: "Invalid notification ID format"});
    }

    try{
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({message: "User not found!"});

        const deletedNotification = await Notification.findByIdAndDelete(notificationId);
        if (!deletedNotification) {
            return res.status(404).json({message: "Notification not found."});
        }

        return res.status(200).json({message: "Notification has been deleted.", deletedNotification});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

module.exports = router;