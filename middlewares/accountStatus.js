const checkUserStatus = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({message: "Authentication required."});
    }

    if (req.user.accountStatus === "banned"){
        return res.status(403).json({message: "Your account is permanently banned.", code: "ACCOUNT-STATUS"});
    }

    if (req.user.accountStatus === "frozen") {
        return res.status(403).json({
          message: "Account is restricted from financial operations. Please contact support for more information.",
          code: "ACCOUNT-STATUS"
        });
    }
    next();
}

module.exports = checkUserStatus;