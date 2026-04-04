const router = require("express").Router();
const User = require("../models/User");
const crypto = require("crypto");
const checkSessionExpiry = require("../middlewares/sessionExpiry");
const isAuthenticated = require("../middlewares/isAuthenticated");
const { mg, promisifySetPassword } = require("../utils/helper");

// Forgot password
router.post("/forgotPassword", async (req,res) => {
    const email = req.body.email;

    if (!email) {
        return res.status(403).json({message: "Enter your email!"});
    }

    try{
        const user = await User.findOne({email: email});
        if (!user) {
            return res.status(404).json({message: "The provided email is not linked to any user!"});
        }
        
        const resetToken = crypto.randomBytes(25).toString("hex");
        const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
        const timeRemaining = 5; 
        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = Date.now() + (timeRemaining * 60 * 1000);     // 5 minutes
        await user.save();

        const resetUrl = `${process.env.FRONT_END_URL}/reset-password/${resetToken}`

        const mailOptions = {
            from: `"RBMarket Support" <noreply@${process.env.MAILGUN_DOMAIN}>`,
            to: [user.email],
            subject: 'Password reset for your RBMarket account',
            text: `You requested a password reset. Click below:\n\n${resetUrl}\n\nThis link expires in ${timeRemaining} minutes.\n\nIf you didn't request this, ignore this email.`,
            html: `
              <p>Hello ${user.firstName || ''},</p>
              <p>You requested a password reset for your <strong>RBMarket</strong> account.</p>
              <p>Click the button below to reset your password. This link expires in ${timeRemaining} minutes.</p>
              <p>
                <a href="${resetUrl}" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
              </p>
              <p>If you did not request a password reset, we recommend changing your password immediately to help secure your account.</p>
              <p>— The RBMarket Team</p>
            `
        };

        await mg.messages.create(process.env.MAILGUN_DOMAIN, mailOptions);
        return res.status(200).json({message: "Reset password link was successfully sent to email!"}); 
    }
    catch(err){
        console.log(err)
        return res.status(500).json({message: err.message});
    }
});

// Reset password
router.post("/resetPassword/:token", async (req, res) => {
    const { token } = req.params;
    const { newPassword, confirmPassword } = req.body;

    if (!token){
        return res.status(403).json({message: "The token is missing"});
    }

    if (newPassword !== confirmPassword){
        return res.status(403).json({message: "Passwords do not match!"});
    }

    if (newPassword.length < 8){
        return res.status(400).json({message: "Password must be at least 8 characters long."});
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    try{
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: {$gt: Date.now()}
        });

        if (!user) {
            return res.status(400).json({message: "Reset link is invalid or has expired."});
        }

        const updatedUser = await promisifySetPassword(user, newPassword);
        user.hash = updatedUser.hash;
        user.salt = updatedUser.salt;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        const mailOptions = {
            from: `"RBMarket Support" <${process.env.RB_EMAIL}>`,
            to: user.email,
            subject: "Your RBMarket password was changed",
            text: `Hi ${user.firstName || "User"},\n\nYour RBMarket account password has been successfully changed.\n\nIf this wasn't you, please contact support immediately or reset your password again.\n\n— The RBMarket Team`,
            html: `
              <p>Hello ${user.firstName || "User"},</p>
              <p>This is a confirmation that your <strong>RBMarket</strong> account password has been successfully changed.</p>
              <p>If this wasn’t you, please reset your password immediately to secure your account.</p>
              <p>— The RBMarket Team</p>
            `,
        };

        await transporter.sendMail(mailOptions);
        return res.status(200).json({ message: "Password has been successfully reset." });
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
}); 

// Setting a password for users who login with google authentication
router.post("/setPasswordGoogle", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userIdFromSession = req.user.id;
    const { newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword){
        return res.status(403).json({message: "Passwords do not match!"});
    }

    if (newPassword.length < 8){
        return res.status(400).json({message: "Password must be at least 8 characters long."});
    }
    
    try{
        const user = await User.findById(userIdFromSession).select("+hash +salt");

        if (!user) {
            return res.status(404).json({message: "User does not exist"});
        }

        if (user.hash && user.salt){ // if user has these 2 fields it means is not authenticated with google or he already set his password.
            return res.status(400).json({message: "Password already set."});
        }

        const updatedUser = await promisifySetPassword(user, newPassword);
        user.hash = updatedUser.hash;
        user.salt = updatedUser.salt;
        await user.save(); 
        return res.status(200).json({ message: "Password has been successfully set." });
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

module.exports = router;