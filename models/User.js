const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");
const { v4: uuidv4 } = require('uuid');

const UserSchema = new mongoose.Schema({
    slug: {
        type: String,
        required: true,
        unique: true,
        default: () => uuidv4()
    },
    email: { 
        type: String, 
        required: true, 
        unique: true 
    },
    password: {
        type: String,
    },
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        default: ""
    },
    googleId: {
        type: String,
    },
    avatar: {
        type: String,
        default: ""
    },
    avatarFilePath: {
        type: String,
        default: ""
    },
    mobileNumber: {
        type: String,
        default: ""
    },
    aboutBio: {
        type: String,
        default: ""
    },
    city: {
        type: String,
        default: ""
    },
    country: {
        type: String,
        default: ""
    },
    street: {
        type: String,
        default: ""
    },
    postalCode: {
        type: String,
        default: ""
    },
    feedbackPositive: {
        type: Number,
        default: 0
    },
    feedbackNegative: {
        type: Number,
        default: 0
    },
    resetPasswordToken: { 
        type: String,
    },
    resetPasswordExpires: {
        type: Date,
    },
    isTwoFactorAuthOn: {
        type: Boolean,
        default: false
    },
    twoFactorAuthCode: {  
        type: String,
    },
    tFACodeExpires: {
        type: Date,
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    accountStatus: {
        type: String,
        enum: ["active", "frozen", "banned"],
        default: "active"
    },
    statusReason: {
        type: String,
        default: ""
    },
    verifyEmailToken: { 
        type: String,
    },
    verifyEmailExpires: {
        type: Date,
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    walletBalance: {
        type: Number,
        default: 0
    },
    withdrawLockedUntil: {
        type: Date,
        default: null
    },
    stripeAccountId: {
        type: String,
        default: ""
    }
},
{timestamps: true});

UserSchema.index({firstName: 'text', lastName: 'text'});
UserSchema.plugin(passportLocalMongoose, { usernameField: 'email' });

module.exports = mongoose.model("User", UserSchema);