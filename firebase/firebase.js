var fireBaseAdmin = require("firebase-admin");
var serviceAccount = require("../firebaseKey.json");

fireBaseAdmin.initializeApp({
  credential: fireBaseAdmin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET 
});

const storageBucket = fireBaseAdmin.storage().bucket();

module.exports = {fireBaseAdmin, storageBucket};