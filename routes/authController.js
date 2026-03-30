const router = require("express").Router();
const User = require("../models/User");
const passport = require("passport");
const { setAdminIfFirstUser } = require("../utils/helper");
const { uploadImage } = require("../firebase/upload");
const checkLoginAllowance = require("../middlewares/checkLoginAllowance");
const googleStrategy = require("passport-google-oauth20").Strategy;

passport.use(User.createStrategy());

passport.serializeUser(function (user, done){
    done(null, user.id);
});

passport.deserializeUser(async function (id, done){
    try{
        const user = await User.findById(id);
        done(null, user);
    }
    catch (err){
        done(err);
    }
});

passport.use(new googleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BACK_END_URL}/api/auth/google/rbmarket`,
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    passReqToCallback: true
},
async (req, accessToken, refreshToken, profile, done) => {
    try{
        const state = req.query.state ? JSON.parse(req.query.state) : {};
        const isDeleteFlow = state.deleteAccount;
        const isLinkingFlow = state.link;
        const loggedInUserId = state.userId;

        // case 1
        const existingUserGoogleId = await User.findOne({googleId: profile.id});
        if (isDeleteFlow){
            if (!existingUserGoogleId){
                return done(null, false, {errorCode: "GOOGLE_ID_MISMATCH"});
            }
            else{
                if (existingUserGoogleId.id === loggedInUserId){
                    return done(null, existingUserGoogleId);
                }
                else{
                    return done(null, false, {errorCode: "DELETE_ACCOUNT_MISMATCH"});
                }
            }
        }

        if (isLinkingFlow){
            if (existingUserGoogleId && existingUserGoogleId.id !== loggedInUserId){
                return done(null, false, {errorCode: "GOOGLE_ACCOUNT_IN_USE"});
            }
        }

        if (existingUserGoogleId){
            try {
                checkLoginAllowance(existingUserGoogleId);
            } 
            catch (e) {
                return done(null, false, {message: e.message, statusReason: existingUserGoogleId.statusReason});
            }

            return done(null, existingUserGoogleId);
        }

        // case 2
        const email = profile.emails?.[0]?.value;

        if (isLinkingFlow && !existingUserGoogleId){
            const loggedInUser = await User.findById(loggedInUserId);
            if (email !== loggedInUser.email){
                return done(null, false, {errorCode: "LINK_EMAIL_MISMATCH"});
            }
        }

        const existingUserEmail = await User.findOne({email});
        if (existingUserEmail){
            try{
                checkLoginAllowance(existingUserEmail);
            }
            catch(e){
                return done(null, false, { message: e.message, statusReason: existingUserEmail.statusReason });
            }

            existingUserEmail.googleId = profile.id;
            if (!existingUserEmail.avatar && profile.photos?.[0]?.value){
                const {downloadURL, filePath} = await uploadImage(profile.photos?.[0]?.value, "avatars");
                existingUserEmail.avatar = downloadURL;
                existingUserEmail.avatarFilePath = filePath;
            }
            await existingUserEmail.save();
            return done(null, existingUserEmail);
        }

        // case 3
        const newUser = new User({
            googleId: profile.id,
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            email: profile.emails[0].value,
        });
        if (profile.photos?.[0]?.value){
            const {downloadURL, filePath} = await uploadImage(profile.photos?.[0]?.value, "avatars");
            newUser.avatar = downloadURL;
            newUser.avatarFilePath = filePath;
        }
        await newUser.save();
        await setAdminIfFirstUser(newUser);
        done(null, newUser);
    }
    catch (err){
        done(err);
    }
}));

// Register a user 
router.post("/register", async (req, res) => {
    try{
        const user = await User.findOne({email: req.body.email});
        if (user) {
            return res.status(409).json({message: "This email is already in use by another user!"});
        }
        else{
            if (req.body.password.length < 8){
                return res.status(400).json({message: "Password must be at least 8 characters long."});
            }

            if (req.body.password !== req.body.confirmPassword){
                return res.status(400).json({message: "Password and confirm password does not match."});
            }

            const firstName = req.body.firstName.trim();
            const lastName = req.body.lastName.trim();

            const capitalizedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
            const capitalizedLastName = lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();

            User.register({
                firstName: capitalizedFirstName,
                lastName: capitalizedLastName,
                email: req.body.email.trim()
            }, req.body.password, async function(err, user){
                if (err){
                    return res.status(500).json({message: err.message});
                }

                await setAdminIfFirstUser(user);
                
                await passport.authenticate("local")(req, res, function (){     // here we are authenticating the user after they register
                    return res.status(201).json({user: user, message: user.isAdmin ? "Account created - you are the admin." : "Account created."});
                })
            })
        }
    }
    catch (err){
        return res.status(500).json({message: err.message});
    }
});

// Log in a user
router.post("/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
        if (err) return res.status(500).json({message: err.message});

        if (!user){
            if (info?.name === "NoSaltValueStoredError"){
                return res.status(400).json({message: "This account was created using Google, so it doesn’t have a password. Please log in with Google instead."})
            }
            else{
                return res.status(401).json({message: info?.message || "Invalid username or password"})
            }
        }

        try {
          checkLoginAllowance(user);
        } 
        catch (e) {
          return res.status(403).json({message: e.message, statusReason: user.statusReason});
        }
        
        if (user.isTwoFactorAuthOn){
            return res.status(200).json({message: "2FA is activated.", email: user.email, isTwoFactorAuthOn: true});
        }

        req.login(user, (err) => {
            if (err) return res.status(500).json("Login failed");

            if (!req.session.createdAt){
                req.session.createdAt = Date.now();
            }

            const { password, updatedAt, __v, hash, ...userInfo } = req.user._doc;
            return res.status(200).json({
                message: "Logged in successfully",
                user: userInfo
            });
        });
    })(req, res, next);
});

// Authenticate with google
router.get('/google', (req, res, next) => {
    const link = req.query.link === "true";
    const deleteAccount = req.query.deleteAccount === "true";
    let userId = null;
    if (deleteAccount || link){
        userId = req.session.passport.user;
    }

    passport.authenticate('google', { 
        scope: ['profile', "email"],
        state: JSON.stringify({link, deleteAccount, userId})
    })(req, res, next);
});

// The result of google authentication
router.get('/google/rbmarket', (req, res, next) => {

  if (req.query.error === "access_denied"){
      let state = {};  
      try {
        state = req.query.state ? JSON.parse(req.query.state) : {};
      } 
      catch (err) {
        console.error("Failed to parse state on cancel:", err);
      }
      
      const {link, deleteAccount} = state;
  
      if (link || deleteAccount) {
        return res.redirect(`${process.env.FRONT_END_URL}/settings?section=security&code=CANCELLED`);
      }
  
      return res.redirect(`${process.env.FRONT_END_URL}/sign-in?cancelled=true`);
  }

  passport.authenticate('google', (err, user, info) => {

    if (err){
        return res.redirect(`${process.env.FRONT_END_URL}/sign-in?authFailed=true`);
    }

    if (!user){
        if (info?.errorCode === "GOOGLE_ID_MISMATCH") {
            return res.redirect(`${process.env.FRONT_END_URL}/settings?section=security&code=GOOGLE_ID_MISMATCH`);
        }
        else if (info?.errorCode === "DELETE_ACCOUNT_MISMATCH"){
            return res.redirect(`${process.env.FRONT_END_URL}/settings?section=security&code=DELETE_ACCOUNT_MISMATCH`);
        }
        else if (info?.errorCode === "GOOGLE_ACCOUNT_IN_USE"){
            return res.redirect(`${process.env.FRONT_END_URL}/settings?section=security&code=GOOGLE_ACCOUNT_IN_USE`);
        }
        else if (info?.errorCode === "LINK_EMAIL_MISMATCH"){
            return res.redirect(`${process.env.FRONT_END_URL}/settings?section=security&code=LINK_EMAIL_MISMATCH`);
        }

        const reason = encodeURIComponent(info?.statusReason || "");
        const message = encodeURIComponent(info?.message || "Authentication failed");

        return res.redirect(
          `${process.env.FRONT_END_URL}/sign-in?loginBlocked=true&message=${message}&reason=${reason}`
        );
    }

    req.login(user, (err) => {
      if (err){
        return res.redirect(`${process.env.FRONT_END_URL}/sign-in?authFailed=true`);
      }

      req.session.createdAt = Date.now();

      let link = false;
      let deleteAccount = false;

      try{
        const state = req.query.state ? JSON.parse(req.query.state) : {};
        link = state.link;
        deleteAccount = state.deleteAccount;
      }
      catch(err){
        console.error("Failed to parse state:", err);
      }

      if (deleteAccount){
        return res.redirect(`${process.env.FRONT_END_URL}/settings?section=security&deleteSuccess=true`);
      }

      if (link){
        return res.redirect(`${process.env.FRONT_END_URL}/settings?section=security&googleLinked=true`);
      }

      return res.redirect(`${process.env.FRONT_END_URL}/?googleAuth=true`);
    });

  })(req, res, next);
});

// Log out a user
router.get("/logout", (req, res) => {
    req.logout(function (err){
        if (err){
            return res.status(500).json({message: err.message});
        } 

        req.session.destroy((sessionErr) => {
            if (sessionErr) return res.status(500).json({ message: sessionErr.message });
            res.clearCookie("connect.sid"); 
            return res.status(200).json({ message: "User logged out successfully" });
        });
    });
});

module.exports = router;