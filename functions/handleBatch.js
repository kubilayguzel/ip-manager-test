const functions = require("firebase-functions");
const admin = require("firebase-admin");
const path = require("path");

// Initialize admin only if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

function getContentType(filePath) {
  if (/\.png$/i.test(filePath)) return "image/png";
  if (/\.jpe?g$/i.test(filePath)) return "image/jpeg";
  return "application/octet-stream";
}

function findMatchingImage(applicationNo, imagePaths) {
  const cleanNo = applicationNo.replace(/\D/g, "");
  const lastFiveDigits = cleanNo.slice(-5);
  
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

// ❌ PROBLEM: Conditional check kaldırıldı
// ✅ ÇÖZÜM: Direkt functions.pubsub.topic kullan
exports.handleBatch = functions
  .runWith({
    memory: '2GB',
    timeoutSeconds: 540
  })
  .pubsub
  .topic("trademark-batch-processing")
  .onPublish(async (message) => {
    console.log("🚀 handleBatch fonksiyonu çalıştırılıyor...");
    
    const data = message.json;
    const { records, bulletinId, imagePaths } = data;

    if (!records || !Array.isArray(records)) {
      console.error("Geçersiz mesaj verisi: 'records' bulunamadı veya dizi değil.", data);
      return null;
    }

    if (!imagePaths || !Array.isArray(imagePaths)) {
      console.warn("Uyarı: 'imagePaths' bulunamadı veya dizi değil. Görsel eşleşmesi yapılamayacak.");
    }

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
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Create document reference and add to batch
      const docRef = db.collection("trademarkRecords").doc();
      batch.set(docRef, docData);

      // Commit batch every 500 operations (Firestore limit)
      if ((i + 1) % 500 === 0) {
        await batch.commit();
        batch = db.batch();
        console.log(`✅ ${i + 1} kayıt Firestore'a yazıldı`);
      }
    }

    // Commit remaining records
    if (records.length % 500 !== 0) {
      await batch.commit();
      console.log(`✅ Kalan kayıtlar Firestore'a yazıldı`);
    }

    console.log(`🎉 Toplam ${records.length} kayıt başarıyla işlendi`);
    return null;
  });
  // handleBatch.js dosyasının sonuna ekle:

// Debug fonksiyonu - Firebase Functions'ın çalışıp çalışmadığını test et
exports.debugTest = functions.https.onRequest((req, res) => {
  console.log("✅ Firebase Functions çalışıyor!");
  console.log("🔥 Functions object keys:", Object.keys(functions));
  console.log("📡 Pubsub available?", !!functions.pubsub);
  console.log("🌐 HTTPS available?", !!functions.https);
  
  res.status(200).json({
    message: "Firebase Functions çalışıyor!",
    functionsKeys: Object.keys(functions),
    pubsubAvailable: !!functions.pubsub,
    httpsAvailable: !!functions.https
  });
});