const functions = require("firebase-functions");
const admin = require("firebase-admin");
const path = require("path");
const os = require("os");
const fs = require("fs");

admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

function getContentType(filePath) {
  if (/\.png$/i.test(filePath)) return "image/png";
  if (/\.jpe?g$/i.test(filePath)) return "image/jpeg";
  return "application/octet-stream";
}

function findMatchingImage(applicationNo, imagePaths) {
  const cleanNo = applicationNo.replace(/\D/g, "");
  for (const imgPath of imagePaths) {
    const filename = path.basename(imgPath);
    const fileDigits = filename.replace(/\D/g, "");
    if (fileDigits.includes(cleanNo.slice(-5))) {
      return imgPath;
    }
  }
  return null;
}

exports.handleBatch = functions
  .region('europe-west1') // Bu satır eklendi veya değiştirildi
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .pubsub.topic("trademark-batch-processing")
  .onPublish(async (message) => {
    const data = message.json;
    const { records, bulletinId, imagePaths } = data;
    if (!records || !Array.isArray(records)) {
        console.error("Geçersiz mesaj verisi: 'records' bulunamadı veya dizi değil.", data);
        return null;
    }
    if (!imagePaths || !Array.isArray(imagePaths)) {
        console.warn("Uyarı: 'imagePaths' bulunamadı veya dizi değil. Görsel eşleşmesi yapılamayacak.", data);
    }

    const db = admin.firestore();
    const batch = db.batch();

    for (const record of records) {
      const matchedImagePath = imagePaths ? findMatchingImage(record.applicationNo, imagePaths) : null;

      const docData = {
        bulletinId,
        applicationNo: record.applicationNo ?? null,
        applicationDate: record.applicationDate ?? null,
        markName: record.markName ?? null,
        niceClasses: record.niceClasses ?? null,
        holders: record.holders ?? [],
        goods: record.goods ?? [],
        extractedGoods: record.extractedGoods ?? [],
        attorneys: record.attorneys ?? [],
        imagePath: matchedImagePath ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = db.collection("trademarkBulletinRecords").doc();
      batch.set(docRef, docData);
    }

    try {
      await batch.commit();
      console.log(`✅ ${records.length} kayıt işlendi (görsel path eşleştirme ile).`);
    } catch (error) {
      console.error("🔥 Batch kayıt hatası:", error);
    }

    return null;
  });