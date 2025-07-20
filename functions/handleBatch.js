const functions = require("firebase-functions");
console.log("🔥 Firebase Functions nesnesi:", Object.keys(functions));
const admin = require("firebase-admin");
const path = require("path");

admin.initializeApp();
const db = admin.firestore();

function getContentType(filePath) {
  if (/\.png$/i.test(filePath)) return "image/png";
  if (/\.jpe?g$/i.test(filePath)) return "image/jpeg";
  return "application/octet-stream";
}

function findMatchingImage(applicationNo, imagePaths) {
  const cleanNo = applicationNo.replace(/\D/g, "");
  const lastFiveDigits = cleanNo.slice(-5);
  
  // **HAFIZA OPTİMİZASYONU: Early return ile arama optimizasyonu**
  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i];
    const filename = path.basename(imgPath);
    const fileDigits = filename.replace(/\D/g, "");
    
    if (fileDigits.includes(lastFiveDigits)) {
      return imgPath;
    }
  }
  return null;
}

exports.handleBatch = functions.pubsub
  ? functions.pubsub
      .topic("trademark-batch-processing")
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
        let batch = db.batch();

        console.log(`📊 ${records.length} kayıt işlenmeye başlanıyor...`);

        for (let i = 0; i < records.length; i++) {
          const record = records[i];

          if (i % 50 === 0) {
            console.log(`İşlenen: ${i}/${records.length} kayıt`);
          }

          const matchedImagePath = (record.imagePaths && record.imagePaths.length > 0)
            ? record.imagePaths[0]
            : null;

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

          if ((i + 1) % 100 === 0) {
            try {
              await batch.commit();
              console.log(`✅ ${i + 1} kayıt commit edildi`);
              batch = db.batch();
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
              console.error(`🔥 Batch commit hatası (${i + 1}. kayıt):`, error);
              throw error;
            }
          }
        }

        try {
          if (batch._writes && batch._writes.length > 0) {
            await batch.commit();
            console.log(`✅ Kalan kayıtlar commit edildi`);
          }
          console.log(`✅ Toplam ${records.length} kayıt işlendi (görsel path eşleştirme ile).`);
        } catch (error) {
          console.error("🔥 Final batch kayıt hatası:", error);
          throw error;
        }

        delete records;
        delete imagePaths;

        if (global.gc) global.gc();

        return null;
      })
  : console.error("❌ UYARI: functions.pubsub tanımsız!");