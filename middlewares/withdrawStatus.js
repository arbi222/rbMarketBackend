const checkWithdrawStatus = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({message: "Authentication required."});
    }

    if (req.user.withdrawLockedUntil && Date.now() < req.user.withdrawLockedUntil) {
        const msLeft = req.user.withdrawLockedUntil - Date.now();
        const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

        return res.status(403).json({
            message: `Withdraw will be available in ${daysLeft} days.`,
        });
    }
    next();
}

module.exports = checkWithdrawStatus;