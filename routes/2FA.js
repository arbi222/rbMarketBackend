const router = require("express").Router();
const User = require("../models/User");
const crypto = require("crypto");
const checkSessionExpiry = require("../middlewares/sessionExpiry");
const isAuthenticated = require("../middlewares/isAuthenticated");
const { mg } = require("../utils/helper");

// Requesting an auth code to use it later for activation or deactivation of 2FA
router.post("/requestTFACode", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const { enable2FA } = req.body;
    const userId = req.user.id;

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({message: "User not found."});

        if (enable2FA && user.isTwoFactorAuthOn) {
            return res.status(400).json({message: "2FA is already enabled."});
        }
        if (!enable2FA && !user.isTwoFactorAuthOn) {
            return res.status(400).json({message: "2FA is already disabled."});
        }

        const tfaCode = crypto.randomBytes(4).toString("hex");
        const hashedCode = crypto.createHash("sha256").update(tfaCode).digest("hex");
        const timeRemaining = 10;

        user.twoFactorAuthCode = hashedCode;
        user.tFACodeExpires = Date.now() + timeRemaining * 60 * 1000;
        await user.save();

        const mailOptions = {
            from: `"RBMarket Security" <noreply@${process.env.MAILGUN_DOMAIN}>`,
            to: [user.email],
            subject: `RBMarket - Confirm ${enable2FA ? "2FA Activation" : "2FA Deactivation"}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background: #ffffff; border-radius: 8px; max-width: 600px; margin: auto;">
                    <h2 style="color: #007bff;">Confirm Two-Factor Authentication ${enable2FA ? "Activation" : "Deactivation"}</h2>
                    <p>Hello <strong>${user.firstName || 'User'}</strong>,</p>
                    <p>You're requesting to <strong>${enable2FA ? "enable" : "disable"}</strong> 2FA for your RBMarket account.</p>
                    <p>Use the following code:</p>
                    <div style="background: #f4f4f4; padding: 12px 18px; border-radius: 5px; font-size: 20px; font-weight: bold; display: inline-block;">${tfaCode}</div>
                    <p style="margin-top: 20px;">This code will expire in ${timeRemaining} minutes.</p>
                    <p>If this wasn't you, please secure your account immediately.</p>
                    <p style="margin-top: 32px;">Stay safe,<br/>The RBMarket Team</p>
                </div>
            `
        };

        await mg.messages.create(process.env.MAILGUN_DOMAIN, mailOptions);
        return res.status(200).json({message: "2FA auth code was sent to your email."});
    } catch (err) {
        return res.status(500).json({message: err.message});
    }
});

// Checking the auth code for the 2FA activation or deactivation
router.post("/checkTFA", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const { enable2FA, TFACode } = req.body;
    const userId = req.user.id;

    if (!TFACode){
        return res.status(400).json({message: "TFA code is required."});
    }

    try {
        const user = await User.findById(userId);
        if (!user){
            return res.status(404).json({message: "User not found."});
        }

        if (enable2FA && user.isTwoFactorAuthOn) {
            return res.status(400).json({message: "TFA is already enabled."});
        }

        if (!enable2FA && !user.isTwoFactorAuthOn) {
            return res.status(400).json({message: "TFA is already disabled."});
        }

        if (!user.twoFactorAuthCode || Date.now() > user.tFACodeExpires) {
            return res.status(400).json({ message: "TFA code is missing or expired." });
        }

        const hashedCode = crypto.createHash("sha256").update(TFACode).digest("hex");

        if (user.twoFactorAuthCode !== hashedCode) {
            return res.status(401).json({ message: "Invalid code." });
        }

        user.isTwoFactorAuthOn = enable2FA;
        user.twoFactorAuthCode = undefined;
        user.tFACodeExpires = undefined;
        await user.save();

        const mailOptions = {
            from: `"RBMarket Security" <noreply@${process.env.MAILGUN_DOMAIN}>`,
            to: [user.email],
            subject: `Two-Factor Authentication ${enable2FA ? "Enabled" : "Disabled"}`,
            text: `Hello ${user.firstName || 'User'},

                Two-Factor Authentication has been ${enable2FA ? "enabled" : "disabled"} on your RBMarket account.

                If this wasn't you, please secure your account immediately.

                — The RBMarket Team`,
            html: `
                <div style="max-width: 600px; margin: auto; font-family: Arial, sans-serif; border: 1px solid #ddd; border-radius: 8px; padding: 24px; background-color: #ffffff;">
                    <h2 style="color: #007bff;">RBMarket Security Notice</h2>
                    <p>Hello <strong>${user.firstName || 'User'}</strong>,</p>
                    <p>
                        This is to inform you that <strong>Two-Factor Authentication</strong> has been 
                        <span style="color: ${enable2FA ? 'green' : 'red'}; font-weight: bold;">${enable2FA ? 'ENABLED' : 'DISABLED'}</span>
                        on your RBMarket account.
                    </p>
                    <p style="background-color: #f8f9fa; padding: 12px; border-radius: 5px; font-size: 14px;">
                        ${enable2FA 
                            ? "You will now be required to enter a verification code sent to your email each time you log in."
                            : "Your account will no longer require a second verification code during login."}
                    </p>
                    <p>If you did not perform this action, we recommend you reset your password</a> immediately and contact support.</p>
                    <p style="margin-top: 32px;">Stay secure,<br/>— The RBMarket Team</p>
                    <hr style="margin-top: 32px;"/>
                    <p style="font-size: 12px; color: #888888;">
                        This is an automated message from RBMarket. Do not reply directly to this email.
                    </p>
                </div>
            `
        };

        await mg.messages.create(process.env.MAILGUN_DOMAIN, mailOptions);
        return res.status(200).json({
            message: `Two-factor Authentication ${enable2FA ? "enabled" : "disabled"} successfully.`, 
            isTwoFactorAuthOn: user.isTwoFactorAuthOn
        });
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Send an auth code to the email in order for the user to log in with 2FA
router.post("/sendAuthCode", async (req, res) => {
    const userEmail = req.body.email;
    if (!userEmail){
        return res.status(400).json({message: "Email field is missing."});
    }

    try{
        const user = await User.findOne({email: userEmail});
        if (!user) {
            return res.status(404).json({message: "User not found."});
        }

        const authCode = crypto.randomBytes(4).toString("hex");
        const hashedCode = crypto.createHash("sha256").update(authCode).digest("hex");
        const timeRemaining = 10; // 10 minutes
        user.twoFactorAuthCode = hashedCode;
        user.tFACodeExpires = Date.now() + (timeRemaining * 60 * 1000);     
        await user.save();
        
        const mailOptions = {
            from: `"RBMarket Support" <noreply@${process.env.MAILGUN_DOMAIN}>`,
            to: [userEmail],
            subject: 'Your RBMarket Two-Factor Authentication Code',
            text: `Hello ${user.firstName || 'User'},

                    Your authentication code is: ${authCode}

                    This code will expire in ${timeRemaining} minutes.

                    If you did not request this code, please secure your account by changing your password immediately.

                    — The RBMarket Team
                    `.trim(),
            html: `
              <div style="font-family: Arial, sans-serif; color: #333;">
                <p>Hello ${user.firstName || 'User'},</p>
                <p>You made a login request for your <strong>RBMarket</strong> account.</p>
                <p><strong>Your authentication code:</strong></p>
                <p style="font-size: 24px; font-weight: bold; background: #f4f4f4; padding: 10px 15px; display: inline-block; border-radius: 5px;">${authCode}</p>
                <p>This code expires in ${timeRemaining} minutes.</p>
                <p>If you did not request this, we recommend changing your password immediately.</p>
                <p>— The RBMarket Team</p>
              </div>
            `
        };

        await mg.messages.create(process.env.MAILGUN_DOMAIN, mailOptions);
        return res.status(200).json({message: "Auth code was sent to your email!"}); 
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// Verify the auth code that the user provides in order to log in
router.post("/verifyAuthCode", async (req, res) => {
    const { email, authCode } = req.body;

    if (!email || !authCode){
        return res.status(400).json({message: "Email and auth code is required."});
    }

    try{
        const user = await User.findOne({email});
        if (!user){
            return res.status(404).json({message: "User not found."});
        }

        if (!user.twoFactorAuthCode || !user.tFACodeExpires){
            return res.status(400).json({message: "No 2FA code found. Please request a new one."});
        }

        if (Date.now() > user.tFACodeExpires){
            return res.status(400).json({message: "The code has expired. Please request a new one."});
        }

        const hashedCode = crypto.createHash("sha256").update(authCode).digest("hex");

        if (user.twoFactorAuthCode !== hashedCode){
            return res.status(400).json({message: "Invalid auth code."});
        }

        user.twoFactorAuthCode = undefined;
        user.tFACodeExpires = undefined;
        await user.save();

        req.login(user, (err) => {
            if (err) return res.status(500).json("Login failed");

            if (!req.session.createdAt){
                req.session.createdAt = Date.now();
            }

            const { password, createdAt, updatedAt, __v, hash, ...userInfo } = req.user._doc;
            return res.status(200).json({
                message: "Logged in successfully",
                user: userInfo
            });
        });
    }
    catch (err){
        return res.status(500).json({message: err.message});
    }
});

module.exports = router;