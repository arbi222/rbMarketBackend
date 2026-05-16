# RB Market — Backend API

> Full-stack eCommerce platform backend built with Node.js, Express, MongoDB, and Socket.io. Supports multi-vendor selling, real-time notifications, dual payment gateways, and a full admin dashboard.

🌐 **Live Demo:** [rbmarket.arbihamolli.com](https://rbmarket.arbihamolli.com)  
💻 **Frontend Repo:** [rbmarketfrontend](https://github.com/arbi222/rbmarketfrontend)

---

## What Is RB Market?

RB Market is a production-ready multi-vendor eCommerce platform where users can register as buyers or sellers. Sellers list and manage products, buyers purchase using Internal Wallet which can be funded by Stripe or PayPal, and admins have full control through a dedicated dashboard. The platform supports guest shopping, real-time notifications, and a complete order and transaction management system.

---

## Features

### Authentication & Security
- Session-based authentication with persistent sessions stored in MongoDB
- Google OAuth 2.0 login
- Two-Factor Authentication (2FA) via email OTP
- Email verification required to sell products
- Password strength validation
- Security headers with Helmet
- Passwords hashed using passport.js

### Products & Orders
- Full product CRUD with image uploads via Firebase Storage
- Guest cart and checkout — no account required to browse and buy
- Order management with status tracking
- Transaction history for both buyers and sellers
- Product review

### Payments
- **Internal Wallet**
- **Stripe** — credit/debit card payments
- **PayPal** — PayPal checkout integration

### Real-Time
- Socket.io for real-time notifications (new orders, account status updates)

### Email
- Transactional emails via **Mailgun** on a custom domain
- Used for: email verification and 2FA OTP

### Admin Panel
- Full platform management dashboard
- Revenue and transaction analytics
- Account banning and freezing
- Product and user moderation
- Scheduled background tasks with node-cron

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MongoDB + Mongoose |
| Authentication | Passport.js, express-session |
| Real-Time | Socket.io |
| Payments | Internal Wallet, Stripe, PayPal |
| Email | Mailgun |
| File Storage | Firebase Admin SDK |
| Security | Helmet, passport |
| Scheduling | node-cron |

---

## Project Structure

```
rbMarketBackend/
├── firebase/         # Firebase admin config & storage helpers
├── middlewares/      # Auth guards, error handlers
├── models/           # Mongoose schemas (User, Product, Order, Transaction...)
├── routes/           # Express route handlers
├── services/         # Business logic (payments, email, notifications)
├── utils/            # Helper functions
└── index.js          # App entry point
```

---

## Author

**Arbi Hamolli** — Full-Stack Web Developer  
[arbihamolli.com](https://arbihamolli.com) · [LinkedIn](https://linkedin.com/in/arbi-hamolli) · [GitHub](https://github.com/arbi222)
