const express = require("express");
const app = express();
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const passport = require("passport");
const cron = require("node-cron");
const http = require("http");
const https = require("https");
const {Server} = require("socket.io");

dotenv.config();

const sessionMiddleware = require("./middlewares/sessionConfig");

mongoose.connect(process.env.MONGO_URL);
app.set("trust proxy", 1);
const corsOptions = {
  origin: process.env.FRONT_END_URL,   
  credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet.crossOriginResourcePolicy({policy: "cross-origin"}));
app.use(morgan("common"));

// this needs to be before the express.json() because stripe wants raw data not json
const webHookRoute = require("./routes/webhookStripe");
app.use("/api/webhook", webHookRoute);

app.use(express.json());
app.use(cookieParser());

app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());



const authRoute = require("./routes/authController");
const userRoute = require("./routes/userController");
const passwordRoute = require("./routes/passwordController");
const emailVerificationRoute = require("./routes/emailVerificationController");
const categoryRoute = require("./routes/categoryController");
const brandRoute = require("./routes/brandController");
const productRoute = require("./routes/productController");
const reviewRoute = require("./routes/reviewController");
const notificationRoute = require("./routes/notificationController");
const cartRoute = require("./routes/cartController");
const orderRoute = require("./routes/orderController");
const transactionRoute = require("./routes/transactionController");
const twoFactorAuthRoute = require("./routes/2FA");
const stripePaymentsRoute = require("./routes/stripePayments");
const paypalPaymentsRoute = require("./routes/paypal");

const Order = require("./models/Order");

app.use("/api/auth", authRoute);
app.use("/api/user", userRoute);
app.use("/api/password", passwordRoute);
app.use("/api/emailVerification", emailVerificationRoute);
app.use("/api/category", categoryRoute);
app.use("/api/brand", brandRoute);
app.use("/api/product", productRoute);
app.use("/api/review", reviewRoute);
app.use("/api/notification", notificationRoute);
app.use("/api/cart", cartRoute);
app.use("/api/order", orderRoute);
app.use("/api/transaction", transactionRoute);
app.use("/api/pay", stripePaymentsRoute);
app.use("/api/payment", paypalPaymentsRoute);
app.use("/api/TFA", twoFactorAuthRoute);


cron.schedule("*/2 * * * *", async () => {
  const cutOff = new Date(Date.now() - 24 * 60 * 60 * 1000);  // 24 hours ago

  try{
    const result = await Order.updateMany(
      {
        status: "paid",
        type: "purchase",
        "payment.status": "paid",
        "payment.paidAt": {$lt: cutOff}
      },
      {
        $set: {status: "delivered", "payment.status": "delivered"}
      }
    );

    if (result.modifiedCount > 0){
      console.log(`Updated ${result.modifiedCount} orders to delivered`);
    }
  }
  catch(err){
    console.log("Error updating paid orders", err);
  }
});


app.get("/", (req, res) => {
  res.send("Server is Running!");
});

const server = http.createServer(app);
const io = new Server(server, {cors: corsOptions});
const users = new Map();
app.set("io", io);
app.set("users", users);

io.on("connection", (socket) => {
  socket.on("register", (userId) => {
    users.set(userId, socket.id);
    console.log("User registered:", userId);
  })

  socket.on("disconnect", () => {
    for (const [userId, socketId] of users.entries()) {
      if (socketId === socket.id) {
        users.delete(userId);
        break;
      }
    }
  });
});

const backendUrl = "https://rbmarketapi.arbihamolli.com/";
const job = cron.schedule('*/2 * * * *', function(){
  https.get(backendUrl, (res) => {
    if (res.statusCode === 200){
      console.log("server restarted")
    }
  }).on("error", (err) => {
      console.log("error");
  })
})
job.start();

const port = process.env.PORT || 8500;
server.listen(port, () => {
  console.log(`Backend is running on port: ${port}`);
})
