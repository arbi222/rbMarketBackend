const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
    buyer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    type: {
        type: String,
        enum: ["deposit", "purchase", "withdraw"], 
    },
    items: [
        {
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product",
                required: true
            },
            seller: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true
            },
            productTitle: {
                type: String,
                required: true
            },
            productSlug: {
                type: String
            },
            productCondition: {
                type: String
            },
            unitPrice: {
                type: Number,
                required: true
            },
            quantity: {
                type: Number,
                min: 1,
                required: true
            },
            subtotal: {
                type: Number,
                required: true
            },
            platformFee: {
              type: Number,
              required: true
            },
            sellerAmount: {
              type: Number,
              required: true
            },
        }
    ],
    totalAmount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: "usd"
    },
    status: {
        type: String,
        enum: ["pending", "paid", "failed", "expired", "cancelled", "delivered"],
        default: "pending"
    },
    payment: {
        provider: {
            type: String,
            enum: ["stripe", "paypal", "internal"]
        },
        paymentIntentId: {type: String},
        status: {type: String},
        paidAt: {type: Date}
    },
    shippingAddress: {
        firstName: {type: String, required: true},
        lastName: {type: String, required: true},
        email: {type: String, required: true},
        country: {type: String, required: true},
        city: {type: String, required: true},
        street: {type: String, required: true},
        postalCode: {type: Number, required: true},
        mobileNumber: {type: String, required: true}
    },
    isDeletedByUser: {
        type: Boolean,
        default: false
    }
},
{timestamps: true});

module.exports = mongoose.model("Order", OrderSchema);