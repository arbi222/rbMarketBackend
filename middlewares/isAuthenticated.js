const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    return res.status(401).json({message: "You are not authenticated"});
}

module.exports = isAuthenticated;