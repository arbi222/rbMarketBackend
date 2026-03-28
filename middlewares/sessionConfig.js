const session = require("express-session");
const mongoStore = require("connect-mongo");

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET_KEY,
  resave: false,
  saveUninitialized: false,
  rolling: true, // this resets expiration of session on each response 
  store: mongoStore.create({
    mongoUrl: process.env.MONGO_URL,
    collectionName: 'sessions'
  }),
  cookie: { 
    sameSite: "none",        // none for production
    secure: true,          // secure: false for http , true for https
    maxAge: 1000 * 60 * 60  // 60 min = 1 hour 
  }      
});

module.exports = sessionMiddleware;