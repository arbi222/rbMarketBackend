const { storageBucket } = require("./firebase");
const axios = require("axios");

async function uploadImage(imageUrl, folder) {
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer"
  });

  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 100000);
  const filePath = `RBMarket/${folder}/${timestamp}_${random}.jpg`;
  const file = storageBucket.file(filePath);

  await file.save(response.data, {
    metadata: {
      contentType: "image/jpeg"
    }
  });

  await file.makePublic();

  const publicUrl = `https://storage.googleapis.com/${storageBucket.name}/${filePath}`;

  return { downloadURL: publicUrl, filePath };
}

module.exports = { uploadImage };