const checkEmailVerification = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({message: "Authentication required."});
    }

    if (!req.user.isEmailVerified){
        return res.status(403).json({message: "Your email is not yet verified. Verify your email to proceed.", code: "EMAIL-VERIFICATION"});
    }

    next();
}

module.exports = checkEmailVerification;