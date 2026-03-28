const router = require("express").Router();
const isAuthenticated = require("../middlewares/isAuthenticated");
const checkSessionExpiry = require("../middlewares/sessionExpiry");
const Transaction = require("../models/Transaction");
const mongoose = require("mongoose");

// admin can get all transactions
router.get("/all", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const isAdmin = req.user.isAdmin;
    const type = req.query.type;
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    if (!isAdmin){
        return res.status(403).json({message: "Access denied."});
    }

    try{
        let query = {};

        if (type){
            query.type = type;
        }

        const transactions = await Transaction.find(query)
                                .skip(skip)
                                .limit(limit)
                                .populate("user relatedProduct", "title slug firstName lastName")
                                .sort({createdAt: -1});
        const totalTransactions = await Transaction.countDocuments(query);
        const totalPages = Math.ceil(totalTransactions / limit);

        return res.status(200).json({
            transactions, 
            totalPages,
            totalTransactions,
            page
        });
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// get a transaction
router.get("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const transactionId = req.params.id;
    const isAdmin = req.user.isAdmin;

    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
        return res.status(400).json({message: "Invalid transaction ID"});
    }

    try{
        if (!isAdmin) return res.status(403).json({message: "Only admin can access the transaction."})

        const transaction = await Transaction.findById(transactionId).populate("user relatedProduct", "title slug image price firstName lastName");
        if (!transaction){
            return res.status(404).json({message: "Transaction does not exist or it has been deleted."});
        }

        return res.status(200).json({transaction});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// delete a transaction
router.delete("/:id", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const isAdmin = req.user.isAdmin;
    const transactionId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
        return res.status(400).json({message: "Invalid transaction ID"});
    }

    try{
        const transaction = await Transaction.findById(transactionId);
        if (!transaction){
            return res.status(404).json({message: "Transaction does not exist or it has been deleted."});
        }

        if (isAdmin){
            await Transaction.findByIdAndDelete(transactionId);
            return res.status(200).json({message: "Transaction deleted successfully."});
        }

        return res.status(400).json({message: "Invalid operation."});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

module.exports = router;