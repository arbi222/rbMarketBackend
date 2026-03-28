const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    type: {
        type: String,
        enum: ["deposit", "purchase", "sale", "platform_fee", "withdraw"], 
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: "usd"
    },
    relatedOrder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
    },
    relatedProduct: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
    },
    provider: {
      type: String,
      enum: ["stripe", "paypal", "internal"],
      default: "internal"
    },
    providerReference: {
      type: String 
    },
    balanceAfter: {
      type: Number,
      required: true
    }
},
{timestamps: true});

module.exports = mongoose.model("Transaction", TransactionSchema);