const functions = require("firebase-functions");
const admin = require("firebase-admin");

exports.handleTrademarkBatch = functions
  .runWith({ timeoutSeconds: 300, memory: "1GB" })
  .pubsub.topic("process-trademark-batch")
  .onPublish(async (message) => {
    const { records, bulletinId, imagePaths } = message.json;

    if (!records || !bulletinId) {
      console.error("Eksik veri: records veya bulletinId yok.");
      return null;
    }

    const batch = admin.firestore().batch();

    for (const record of records) {
      const docRef = admin.firestore().collection("trademarkBulletinRecords").doc();

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
        imagePath: imagePaths?.[record.applicationNo] ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      batch.set(docRef, docData);
    }

    await batch.commit();
    console.log(`✅ ${records.length} kayıt Firestore'a eklendi.`);

    return null;
  });
