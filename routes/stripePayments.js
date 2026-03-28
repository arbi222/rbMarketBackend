const router = require("express").Router();
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const isAuthenticated = require("../middlewares/isAuthenticated");
const checkSessionExpiry = require("../middlewares/sessionExpiry");
const Order = require("../models/Order");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const checkUserStatus = require("../middlewares/accountStatus");
const checkWithdrawStatus = require("../middlewares/withdrawStatus");
const checkEmailVerification = require("../middlewares/checkEmailVerification");

// create a pay session
router.post("/create-pay-session", checkSessionExpiry, isAuthenticated, checkUserStatus, checkEmailVerification, async (req, res) => {
    const userId = req.user.id;
    const {fundValue, paymentFrom, orderId: oldOrderId} = req.body;
    let oldOrder;

    if (!fundValue || !paymentFrom){
        return res.status(400).json({message: "Invalid stripe session request!"});
    }

    const fundList = {
        1: 500,
        2: 1000,
        3: 2500,
        4: 5000,
        5: 10000,
        6: 25000,
    }

    const amount = fundList[fundValue];
    if (!amount){
        return res.status(400).json({message: "Invalid fund option!"});
    }

    try{
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({message: "User not found!"});
        if (user.isAdmin) return res.status(400).json({message: "Admin can not add funds."});

        if (oldOrderId){
            oldOrder = await Order.findById(oldOrderId).populate("buyer", "firstName lastName slug");
            if (!oldOrder) return res.status(400).json({message: "Invalid retry request."});

            oldOrder.status = "expired";
            oldOrder.payment.status = "expired";
            await oldOrder.save();
        }

        const order = await Order.create({
            buyer: user._id,
            totalAmount: amount,
            type: "deposit",
            currency: "usd",
            status: "pending",
            payment: {
                provider: "stripe",
                status: "pending",
            },
            shippingAddress: {
                firstName: user.firstName,
                lastName: user.lastName || "N/A",
                email: user.email,
                country: "N/A",
                city: "N/A",
                street: "N/A",
                postalCode: 0,
                mobileNumber: "N/A"
            }
        });

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {name: `RB Market Wallet Top-up $${(amount / 100).toFixed(2)}.`},
                        unit_amount: amount
                    },
                    quantity: 1
                }
            ],
            success_url: `${process.env.FRONT_END_URL}${paymentFrom}paymentSuccess=true${oldOrderId ? "&oldOrder=true" : ""}`,
            cancel_url: `${process.env.FRONT_END_URL}${paymentFrom}failed=true`,
            metadata: {
                userId: userId.toString(),
                amount: amount.toString(),
                orderId: order._id.toString(),
            },   
        })

        order.payment.paymentIntentId = session.id;
        await order.save();

        res.status(201).json({url: session.url});
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// router.post("/test-add-funds", async (req, res) => {
//   try {
//     const paymentIntent = await stripe.paymentIntents.create({
//       amount: 100000,
//       currency: "usd",
//       payment_method: "pm_card_bypassPending",
//       confirm: true,
//       automatic_payment_methods: {
//         enabled: true,
//         allow_redirects: "never",
//     },
//     });

//     res.json({
//       message: "Test funds added instantly",
//       paymentIntent
//     });
//   } catch (err) {
//     console.log(err)
//     res.status(500).json({ error: err.message });
//   }
// });

router.get("/account-status", checkSessionExpiry, isAuthenticated, async (req, res) => {
    const userId = req.user.id;

    try{
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({message: "User not found!"});

        if (!user.stripeAccountId) {
            return res.json({
                payoutsEnabled: false,
                detailsSubmitted: false,
                hasAccount: false
            });
        }

        const account = await stripe.accounts.retrieve(user.stripeAccountId);
        return res.json({
            hasAccount: true,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted
        });
    }
    catch(err){
        return res.status(500).json({message: err.message});
    }
});

// create a withdraw request
router.post("/withdraw", checkSessionExpiry, isAuthenticated, checkUserStatus, checkWithdrawStatus, checkEmailVerification, async (req, res) => {
    const amountInCents = req.body.amount;
    const oldMarketOrderId = req.body.orderId;
    const userId = req.user.id;
    let oldOrder;
    let order;

    try{
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({message: "User not found"});

        if (!user.stripeAccountId){
            const account = await stripe.accounts.create({type: "express"});
            user.stripeAccountId = account.id;
            await user.save();

            const accountLink = await stripe.accountLinks.create({
                account: user.stripeAccountId,
                refresh_url: `${process.env.FRONT_END_URL}/settings?section=payment&failed=true`,     
                return_url: `${process.env.FRONT_END_URL}/settings?section=payment&withdrawAccount=true`,
                type: "account_onboarding",
            });

            return res.status(200).json({onboardingUrl: accountLink.url});
        }

        const account = await stripe.accounts.retrieve(user.stripeAccountId);
        if (!account.payouts_enabled){
            const accountLink = await stripe.accountLinks.create({
                account: user.stripeAccountId,
                refresh_url: `${process.env.FRONT_END_URL}/settings?section=payment&failed=true`,
                return_url: `${process.env.FRONT_END_URL}/settings?section=payment&withdrawAccount=true`,
                type: "account_onboarding",
            });

            return res.status(200).json({onboardingUrl: accountLink.url});
        }

        if (!amountInCents || amountInCents <= 0) return res.status(400).json({message: "Invalid amount"});

        if (user.walletBalance < amountInCents){
            return res.status(400).json({message: "Insufficient balance"});
        }

        if (oldMarketOrderId){
            oldOrder = await Order.findById(oldMarketOrderId).populate("buyer", "firstName lastName slug");
            if (!oldOrder) return res.status(400).json({message: "Invalid retry request."});  

            oldOrder.status = "expired";
            oldOrder.payment.status = "expired";
            await oldOrder.save();
        }

        order = await Order.create({
            buyer: user._id,
            totalAmount: amountInCents,
            currency: "usd",
            status: "pending",
            type: "withdraw",
            payment: {
                provider: "stripe",
                status: "pending",
            },
            shippingAddress: {
                firstName: user.firstName,
                lastName: user.lastName || "N/A",
                email: user.email,
                country: "N/A",
                city: "N/A",
                street: "N/A",
                postalCode: 0,
                mobileNumber: "N/A"
            }
        });

        const transfer = await stripe.transfers.create({
            amount: amountInCents,
            currency: "usd",
            destination: user.stripeAccountId,
            transfer_group: `withdraw_${order._id}`
        });

        order.payment.paymentIntentId = transfer.id;
        order.status = "paid";
        order.payment.status = "paid";
        order.payment.paidAt = new Date();
        await order.save();

        user.walletBalance -= amountInCents;
        await user.save();

        await Transaction.create({
            user: user._id,
            type: "withdraw",
            amount: amountInCents,
            currency: "usd",
            relatedOrder: order._id,
            provider: "stripe",
            providerReference: transfer.id,
            balanceAfter: user.walletBalance
        })

        res.status(200).json({message: "Withdraw completed. Funds sent to your Stripe account.", oldOrder});
    }
    catch(err){
        if (order) {
            try {
                order.status = "failed";
                order.payment.status = "failed";
                await order.save();
            } 
            catch (updateErr) {
                console.error("Failed to mark withdraw order as failed:", updateErr.message);
            }
        }
        if (err.code === "balance_insufficient"){
            return res.status(400).json({message: "RB Market can not payout at this moment with Stripe. Try again later, or try using Paypal for now."});
        }
        return res.status(500).json({message: err.message});
    }
});

module.exports = router;