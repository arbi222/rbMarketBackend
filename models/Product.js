const mongoose = require("mongoose");
const { v4: uuidv4 } = require('uuid');

const ProductSchema = new mongoose.Schema({
    slug: {
        type: String,
        required: true,
        unique: true,
        default: () => uuidv4()
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ""
    },
    price: {
        type: Number,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    imageFilePath:{
        type: String,
        required: true
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: true,
        index: true
    },
    brand: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Brand",
        required: true,
        index: true
    },
    condition: {
        type: String,
        enum: ["New", "Used"],
        default: "New"
    },
    stock: {
        type: Number,
        default: 1
    }
},
{timestamps: true});

ProductSchema.index({title: 'text'});

module.exports = mongoose.model("Product", ProductSchema);