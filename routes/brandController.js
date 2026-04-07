const router = require("express").Router();
const isAuthenticated = require("../middlewares/isAuthenticated");
const checkSessionExpiry = require("../middlewares/sessionExpiry");
const Brand = require("../models/Brand");
const mongoose = require("mongoose");
const Product = require("../models/Product");

// Create a brand
router.post("/", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const isAdmin = req.user.isAdmin;
    const { name, description, image, imageFilePath } = req.body;

    if (!isAdmin) {
        return res.status(403).json({message: "You are not authorized to create brands."});
    }
    
    try{
        const brand = await Brand.findOne({name: name.trim()});

        if (brand){
            return res.status(400).json({message: "A brand with this name already exists."});
        }

        const newBrand = new Brand({
            name: name.trim(),
            description: description.trim(),
            image,
            imageFilePath
        });
        await newBrand.save();
        return res.status(201).json({message: "The brand is created."});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Update a brand
router.put("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const isAdmin = req.user.isAdmin;
    const brandId = req.params.id;
    const { name, description, image, imageFilePath } = req.body;
    
    if (!isAdmin) {
        return res.status(403).json({message: "You are not authorized to update brands."});
    }

    if (!mongoose.Types.ObjectId.isValid(brandId)) {
        return res.status(400).json({ message: "Invalid brand ID format" });
    }

    try{
        if (name){
            const brandFound = await Brand.findOne({name: name.trim(), _id: {$ne: brandId}});

            if (brandFound){
                return res.status(400).json({message: "There is already a brand with this name."});
            }
        }

        const updateData = {};
        if (name && name.trim()) updateData.name = name.trim();
        if (description && description.trim()) updateData.description = description.trim();
        if (image !== undefined) updateData.image = image;
        if (imageFilePath !== undefined) updateData.imageFilePath = imageFilePath;
        
        const brand = await Brand.findByIdAndUpdate(brandId, 
                                                    updateData, 
                                                    {new: true, runValidators: true}
                                                    ).select("-createdAt -__v");
        if (!brand){
            return res.status(404).json({message: "Brand is not found"});
        }

        return res.status(200).json({message: "Brand has been updated."});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Get 6 brands which have the most products on sale
router.get("/topBrands", async (req, res) => {
    try{
        const topBrands = await Product.aggregate([
            {$group: {
                _id: "$brand",
                productCount: {$sum: 1}
            }},
            {
                $sort: {productCount: -1}
            },
            {
                $limit: 10
            }
        ]);
        
        const brandIds = topBrands.map(brand => brand._id);

        const brands = await Brand.find({_id: {$in: brandIds}}).select("-__v -createdAt -updatedAt");

        const mergedBrands = brands.map(brand => ({
            ...brand.toObject(),
            productCount: topBrands.find(b => b._id.toString() === brand._id.toString()).productCount
        }));

        mergedBrands.sort(
            (a, b) =>
                topBrands.findIndex(t => t._id.toString() === a._id.toString()) -
                topBrands.findIndex(t => t._id.toString() === b._id.toString())
        );

        return res.status(200).json({topBrands: mergedBrands.slice(0, 6)});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Get a list of all brands
router.get("/", async (req, res) => {
    try{
        const brands = await Brand.find().select("-createdAt -updatedAt -__v").sort({name: 1});

        if (!brands.length){
            return res.status(200).json({message: "No brands available yet", brands: []});
        }

        return res.status(200).json({brands: brands});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Get a brand
router.get("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => { // admin only
    const brandId = req.params.id;
    const isAdmin = req.user.isAdmin;

    if (!isAdmin) {
        return res.status(403).json({message: "You are not authorized to get this brand."});
    }

    if (!mongoose.Types.ObjectId.isValid(brandId)) {
        return res.status(400).json({ message: "Invalid brand ID format" });
    }

    try{
        const brand = await Brand.findById(brandId).select("-__v -createdAt -updatedAt");

        if (!brand){
            return res.status(404).json({message: "Brand is not found"});
        }

        return res.status(200).json({brand: brand});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Delete a brand
router.delete("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const isAdmin = req.user.isAdmin;
    const brandId = req.params.id;
    
    if (!isAdmin) {
        return res.status(403).json({message: "You are not authorized to delete brands."});
    }

    if (!mongoose.Types.ObjectId.isValid(brandId)) {
        return res.status(400).json({ message: "Invalid brand ID format" });
    }

    try{
        const productsUsingBrand = await Product.countDocuments({brand: brandId});
        if (productsUsingBrand > 0){
            return res.status(409).json({message: "Brand is in use and cannot be deleted."});
        }

        const deletedBrand = await Brand.findByIdAndDelete(brandId);

        if (!deletedBrand) {
            return res.status(404).json({message: "Brand not found."});
        }

        return res.status(200).json({message: "Brand has been deleted."});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

module.exports = router;