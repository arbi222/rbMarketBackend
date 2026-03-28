const router = require("express").Router();
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const bodyParser = require("body-parser");
const User = require("../models/User");
const Order = require("../models/Order");
const Transaction = require("../models/Transaction");
const { applyFirstTransactionLock } = require("../utils/helper");

// stipe webhook
router.post("/stripe-webhook", bodyParser.raw({type: "application/json"}), async (req, res) => {
    const signature = req.headers["stripe-signature"];
    let event;

    try{
        event = stripe.webhooks.constructEvent(
            req.body,
            signature,
            process.env.STRIPE_WEBHOOK_SIGN_SECRET
        );
    }
    catch(err){
        return res.status(400).json({message: `Webhook Error: ${err.message}`});
    }

    if (event.type === "checkout.session.completed"){
        const session = event.data.object;
        const {userId, amount, orderId} = session.metadata;

        try{
            const order = await Order.findById(orderId);
            if (!order) return res.status(404).send({message: "Order not found"});

            if (order.payment.status === "paid"){
                return res.status(200).send({message: "Order already processed"});
            }

            order.status = "paid";
            order.payment.status = "paid";
            order.payment.paidAt = new Date();
            await order.save();

            const user = await User.findById(userId);
            user.walletBalance += Number(amount);
            await user.save();

            await Transaction.create({
                user: userId,
                type: "deposit",
                amount: Number(amount),
                currency: "usd",
                relatedOrder: order._id,
                provider: "stripe",
                providerReference: session.payment_intent,
                balanceAfter: user.walletBalance
            })
            await applyFirstTransactionLock(user);
            res.status(200).send({message: "Top-up processed."});
        }
        catch(err){
            if (orderId) {
                try {
                    const failedOrder = await Order.findById(orderId);
                    if (failedOrder && failedOrder.status !== "paid") {
                        failedOrder.status = "failed";
                        failedOrder.payment.status = "failed";
                        await failedOrder.save();
                    }
                } 
                catch (updateErr) {
                    console.error("Failed to update order status to failed:", updateErr.message);
                }
            }
            return res.status(400).send({message: `Error updating wallet: ${err.message}`});
        }
    }
});

module.exports = router;