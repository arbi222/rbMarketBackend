const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    description: {
        type: String,
        required: true,
        default: ""
    },
    image: {
        type: String,
        default: ""
    },
    imageFilePath: {
        type: String,
        default: ""
    }
},
{timestamps: true});

module.exports = mongoose.model("Category", CategorySchema);