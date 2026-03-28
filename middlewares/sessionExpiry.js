const MAX_SESSION_LIFETIME = 1000 * 60 * 60 * 4 

const checkSessionExpiry = (req, res, next) => {
    if (!req.session) return next();

    if (!req.session.createdAt){
      req.session.createdAt = Date.now();
    }
    else{
      const sessionAge = Date.now() - req.session.createdAt;

      if (sessionAge > MAX_SESSION_LIFETIME) {
        req.session.destroy(err => {
          if (err) return next(err);
          res.clearCookie('connect.sid');
          return res.status(401).json({ message: "Session expired, please log in again." });
        });
        return;
      }
    }
    next();
}

module.exports = checkSessionExpiry;