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
  .runWith({ timeoutSeconds: 540, memory: "2GB" }) // maksimum süre
  .pubsub.topic("trademark-bulletin-queue")
  .onPublish(async (message) => {
    const data = message.json;

    const { records, bulletinId, imageFiles } = data;

    if (!records || !Array.isArray(records)) {
      console.error("Geçersiz veya eksik kayıt dizisi.");
      return;
    }

    const batch = db.batch();
    let uploadedImageCount = 0;

    for (const record of records) {
      let imagePath = null;

      if (record.applicationNo) {
        const normalizedAppNo = record.applicationNo.replace(/\//g, "-");
        const alternativeAppNo = record.applicationNo.replace(/\//g, "_");

        const imageFile = imageFiles.find((f) => {
          const lowerF = f.toLowerCase();
          return lowerF.includes(normalizedAppNo) || lowerF.includes(alternativeAppNo);
        });

        if (imageFile && fs.existsSync(imageFile)) {
          const destFileName = `bulletins/${bulletinId}/${path.basename(imageFile)}`;
          console.log(`📦 Resim yükleniyor: ${destFileName}`);

          await bucket.upload(imageFile, {
            destination: destFileName,
            metadata: {
              contentType: getContentType(imageFile),
            },
          });

          imagePath = destFileName;
          uploadedImageCount++;
        } else {
          console.warn(`⚠️ Resim dosyası bulunamadı: ${record.applicationNo}`);
        }
      }

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
        imagePath: imagePath ?? null,
      };

      const docRef = db.collection("trademarkBulletinRecords").doc();
      batch.set(docRef, docData);
    }

    await batch.commit();
    console.log(`✅ Batch işlem tamamlandı. Yüklenen görsel sayısı: ${uploadedImageCount}`);
  });
