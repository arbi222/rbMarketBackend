const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    type: {
        type: String,
        enum: [
            "ITEM_SOLD",
            "NEW_MESSAGE",
            "NEW_REVIEW",
            "ORDER_UPDATE",
        ],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    link: {
        type: String
    },
    read: {
        type: Boolean,
        default: false
    }
},
{timestamps: true});

module.exports = mongoose.model("Notification", NotificationSchema);