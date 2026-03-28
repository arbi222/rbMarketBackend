var fireBaseAdmin = require("firebase-admin");
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

fireBaseAdmin.initializeApp({
  credential: fireBaseAdmin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET 
});

const storageBucket = fireBaseAdmin.storage().bucket();

module.exports = {fireBaseAdmin, storageBucket};