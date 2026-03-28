const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
    comment: {
        type: String,
        required: true
    },
    vote: {
        type: String,
        enum: ["Positive", "Negative"],
        required: true
    }
},
{timestamps: true});

module.exports = mongoose.model("Review", ReviewSchema);