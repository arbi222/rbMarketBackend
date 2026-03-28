const axios = require("axios");
const BASE = "https://api-m.sandbox.paypal.com";

const getAccessToken = async () => {
  const res = await axios.post(
    `${BASE}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      auth: {
        username: process.env.PAYPAL_CLIENT_ID,
        password: process.env.PAYPAL_SECRET
      }
    }
  );

  return res.data.access_token;
};

// adding funds
exports.createOrder = async (amount) => {
  const token = await getAccessToken();

  const res = await axios.post(
    `${BASE}/v2/checkout/orders`,
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: amount
          }
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return res.data;
};

exports.captureOrder = async (orderId) => {
  const token = await getAccessToken();

  const res = await axios.post(
    `${BASE}/v2/checkout/orders/${orderId}/capture`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return res.data;
};

// withdrawing
exports.sendPayout = async ({receiverEmail, amount, currency = "USD", note = ""}) => {
  const token = await getAccessToken();

  const batchId = "batch_" + Date.now();

  const res = await axios.post(
    `${BASE}/v1/payments/payouts`,
    {
      sender_batch_header: {
        sender_batch_id: batchId,
        email_subject: "You have a payout!",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: {
            value: amount.toFixed(2),
            currency
          },
          note,
          receiver: receiverEmail,
          sender_item_id: "item_" + Date.now()
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data;
};