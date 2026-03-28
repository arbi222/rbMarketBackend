const router = require("express").Router();
const isAuthenticated = require("../middlewares/isAuthenticated");
const checkSessionExpiry = require("../middlewares/sessionExpiry");
const Category = require("../models/Category");
const mongoose = require("mongoose");
const Product = require("../models/Product");

// Create a category
router.post("/", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const isAdmin = req.user.isAdmin;
    const { name, description, image, imageFilePath } = req.body;

    if (!isAdmin) {
        return res.status(403).json({message: "You are not authorized to create categories."});
    }
    
    try{
        const category = await Category.findOne({name: name.trim()});

        if (category){
            return res.status(400).json({message: "A category with this name already exists."});
        }

        const newCategory = new Category({
            name: name.trim(),
            description: description.trim(),
            image,
            imageFilePath
        });
        await newCategory.save();
        return res.status(201).json({message: "The category is created."});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Update a category
router.put("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const isAdmin = req.user.isAdmin;
    const categoryId = req.params.id;
    const { name, description, image, imageFilePath } = req.body;
    
    if (!isAdmin) {
        return res.status(403).json({message: "You are not authorized to update categories."});
    }

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({ message: "Invalid category ID format" });
    }

    try{
        const categoryFound = await Category.findOne({name: name.trim(), _id: {$ne: categoryId}});

        if (categoryFound){
            return res.status(400).json({message: "There is already a category with this name."});
        }
        
        const updateData = {};
        if (name && name.trim()) updateData.name = name.trim();
        if (description && description.trim()) updateData.description = description.trim();
        if (image !== undefined) updateData.image = image;
        if (imageFilePath !== undefined) updateData.imageFilePath = imageFilePath;

        const category = await Category.findByIdAndUpdate(categoryId, 
                                                        updateData,
                                                        {new: true, runValidators: true}
                                                        ).select("-createdAt -__v");
        if (!category){
            return res.status(404).json({message: "Category is not found"});
        }

        return res.status(200).json({message: "Category has been updated."});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Get a list of all categories 
router.get("/all/categories", async (req, res) => {
    try{
        const categories = await Category.find().select("-createdAt -updatedAt -__v").sort({name: 1});

        if (!categories.length){
            return res.status(200).json({message: "No categories available yet", categories: []});
        }

        return res.status(200).json({categories: categories});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Get a category
router.get("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => { 
    const isAdmin = req.user.isAdmin;
    const categoryId = req.params.id;

    if (!isAdmin) {
        return res.status(403).json({message: "You are not authorized to get this category."});
    }

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({ message: "Invalid category ID format" });
    }

    try{
        const category = await Category.findById(categoryId).select("-__v -createdAt -updatedAt");

        if (!category){
            return res.status(404).json({message: "Category is not found"});
        }

        return res.status(200).json({category: category});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Delete a category
router.delete("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const isAdmin = req.user.isAdmin;
    const categoryId = req.params.id;
    
    if (!isAdmin) {
        return res.status(403).json({message: "You are not authorized to delete categories."});
    }

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({ message: "Invalid category ID format" });
    }

    try{
        const productsUsingCategory = await Product.countDocuments({category: categoryId});
        if (productsUsingCategory > 0){
            return res.status(409).json({message: "Category is in use and cannot be deleted."});
        }

        const deletedCategory = await Category.findByIdAndDelete(categoryId);

        if (!deletedCategory) {
            return res.status(404).json({ message: "Category not found." });
        }

        return res.status(200).json({message: "Category has been deleted."});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

module.exports = router;