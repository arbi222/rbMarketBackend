const User = require("../models/User");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const mongoose = require("mongoose");
const formData = require("form-data");
const Mailgun = require("mailgun.js");

const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_SENDER_API_KEY,
  url: "https://api.eu.mailgun.net"
});

// A helper function for setting the password
const promisifySetPassword = (user, newPassword) => {
    return new Promise((resolve, reject) => {
        user.setPassword(newPassword, (err, updatedUser) => {
            if (err) return reject(err);
            resolve(updatedUser);
        });
    });
};

const setAdminIfFirstUser = async (user) => {
    const adminExists = await User.exists({isAdmin: true});
    if (!adminExists) {
        user.isAdmin = true;
        await user.save();
    }
};

const buildFilters = async (query, options = {}) => {
  const { title, category, brand, sellerSlug } = query;
  const { excludeSellerId, excludeOutOfStock, currentUser, isAdmin, isOwnProfile } = options;

  const condition = parseInt(query.condition);
  const price = parseInt(query.price);
  let filter = {};

  if (excludeSellerId){
    filter.seller = {$ne: excludeSellerId};
  }

  if (excludeOutOfStock){
    filter.stock = {$gt: 0};
  }

  if (title) {
    const terms = title.trim().split(/\s+/).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    filter.$and = terms.map(term => ({ title: { $regex: term, $options: "i" } }));
  }

  if (category) {
    if (!mongoose.Types.ObjectId.isValid(category)) {
      throw new Error("Invalid category ID");
    }

    const catExists = await Category.findById(category);
    if (!catExists) {
      throw new Error("Category not found");
    }

    filter.category = category;
  }

  if (brand) {
    if (!mongoose.Types.ObjectId.isValid(brand)) {
      throw new Error("Invalid brand ID");
    }

    const brandExists = await Brand.findById(brand);
    if (!brandExists) {
      throw new Error("Brand not found");
    }

    filter.brand = brand;
  }

  if (!isNaN(condition)) filter.condition = condition === 1 ? "New" : condition === 2 ? "Used" : undefined;

  if (!isNaN(price)) {
    switch (price) {
      case 1: filter.price = { $lt: 5000 }; break;
      case 2: filter.price = { $gte: 5000, $lte: 10000 }; break;
      case 3: filter.price = { $gte: 10100, $lte: 50000 }; break;
      case 4: filter.price = { $gt: 50000 }; break;
    }
  }

  if (sellerSlug) {
    const seller = await User.findOne({slug: sellerSlug});
    if (!seller) throw new Error("Seller not found");
    filter.seller = seller._id;
  }

  if (!isAdmin) {
    if (currentUser) {
      if (currentUser.accountStatus === "frozen"){
        if (isOwnProfile){
          filter.seller = currentUser._id
        }
        else{
          filter._id = null
        }
      }
      else{
        filter.$or = [
          {seller: currentUser._id}, 
          {seller: {$in: await User.find({accountStatus: "active", _id: {$ne: currentUser._id}}).distinct("_id")}}
        ];
      }
    } else {
      filter.seller = {$in: await User.find({accountStatus: "active"}).distinct("_id")};
    }
  }

  return filter;
};

const applyFirstTransactionLock = async (user) => {
  if (!user.withdrawLockedUntil){
    const lockDate = new Date();
    lockDate.setDate(lockDate.getDate() + 7);
    user.withdrawLockedUntil = lockDate;
    await user.save();
  }
};

module.exports = { mg, promisifySetPassword, setAdminIfFirstUser, buildFilters, applyFirstTransactionLock };