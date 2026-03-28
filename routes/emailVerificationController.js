const router = require("express").Router();
const User = require("../models/User");
const crypto = require("crypto");
const checkSessionExpiry = require("../middlewares/sessionExpiry");
const isAuthenticated = require("../middlewares/isAuthenticated");
const { transporter } = require("../utils/helper");

// Send an email verification link to the user's email
router.post("/sendEmail", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userIdFromSession = req.user.id;

    try{
        const user = await User.findById(userIdFromSession);

        if (!user) {
            return res.status(404).json({message: "User does not exist"});
        }

        if (user.isEmailVerified){
            return res.status(400).json({message: "Email is already verified."});
        }

        const token = crypto.randomBytes(25).toString("hex");
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
        const timeRemaining = 45; 
        user.verifyEmailToken = hashedToken;
        user.verifyEmailExpires = Date.now() + (timeRemaining * 60 * 1000);     // 45 minutes

        const resetUrl = `${process.env.FRONT_END_URL}/verify-email/${token}`
        const mailOptions = {
            from: `"RBMarket Support" <${process.env.RB_EMAIL}>`,
            to: user.email,
            subject: 'Verify email for your RBMarket account',
            text: `You requested an email verification. Click below:\n\n${resetUrl}\n\nThis link expires in ${timeRemaining} minutes.\n\nIf you did not request an email verification, we recommend changing your password immediately to help secure your account.`,
            html: `
              <p>Hello ${user.firstName || ''},</p>
              <p>You requested an email verification for your <strong>RBMarket</strong> account.</p>
              <p>Click the button below to verify your email. This link expires in ${timeRemaining} minutes.</p>
              <p>
                <a href="${resetUrl}" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a>
              </p>
              <p>If you did not request an email verification, we recommend changing your password immediately to help secure your account.</p>
              <p>— The RBMarket Team</p>
            `
        };

        await user.save();
        await transporter.sendMail(mailOptions);
        return res.status(200).json({message: "Email verification link sent to your email!"}); 
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Verify Email
router.get("/verifyEmail/:token", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const { token } = req.params;
    const userIdFromSession = req.user.id;

    if (!token){
        return res.status(403).json({message: "The token is missing"});
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    try{
        const user = await User.findOne({
            _id: userIdFromSession,
            verifyEmailToken: hashedToken,
            verifyEmailExpires: {$gt: Date.now()}
        });

        if (!user) {
            return res.status(400).json({message: "Email verification link is invalid or has expired."});
        }

        if (user.isEmailVerified){
            return res.status(400).json({message: "Email is already verified."});
        }

        user.verifyEmailToken = undefined;
        user.verifyEmailExpires = undefined;
        user.isEmailVerified = true;
        await user.save();
  
        return res.status(200).json({ status: "ok", message: "Email has been verified successfully." });
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
}); 

module.exports = router;