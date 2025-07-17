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

exports.handleBatch = functions
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .pubsub.topic("trademark-batch-processing")
  .onPublish(async (message) => {
    const data = message.json;
    const { records, bulletinId, imagePaths } = data;
    if (!records || !Array.isArray(records)) return;

    const db = admin.firestore();
    const batch = db.batch();

    function findMatchingImage(applicationNo, imagePaths) {
      const cleanNo = applicationNo.replace(/\D/g, "");
      for (const path of imagePaths) {
        const digits = path.replace(/\D/g, "");
        if (digits.includes(cleanNo.slice(-5))) {
          return path;
        }
      }
      return null;
    }

    for (const record of records) {
      const matchedImagePath = findMatchingImage(record.applicationNo, imagePaths);

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
        imagePath: matchedImagePath ?? null, // sadece yol
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = db.collection("trademarkBulletinRecords").doc();
      batch.set(docRef, docData);
    }

    await batch.commit();
    console.log(`✅ ${records.length} kayıt işlendi (görsel path eşleştirme ile).`);
  });
