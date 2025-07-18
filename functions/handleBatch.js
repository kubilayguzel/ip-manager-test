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

// Bu fonksiyonu buraya taşıdık, artık handleBatch tarafından kullanılacak
function findMatchingImage(applicationNo, imagePaths) {
  const cleanNo = applicationNo.replace(/\D/g, ""); // Başvuru numarasındaki tüm rakam olmayan karakterleri kaldır
  
  // Resim yollarını döngüye al
  for (const imgPath of imagePaths) {
    const filename = path.basename(imgPath); // Sadece dosya adını al (örn: "TR2023_12345.png")
    
    // Dosya adındaki tüm rakam olmayan karakterleri kaldır (örn: "TR2023_12345.png" -> "202312345")
    const fileDigits = filename.replace(/\D/g, ""); 

    // Basit bir eşleşme stratejisi:
    // Eğer dosya adının rakamları, başvuru numarasının son 5 hanesini içeriyorsa eşleşti kabul et
    // Bu, "2023/12345" veya "12345" gibi formatlar için çalışır.
    if (fileDigits.includes(cleanNo.slice(-5))) {
      return imgPath; // Eşleşen resmin Storage yolunu döndür
    }
    // Daha esnek bir eşleşme gerekiyorsa buraya farklı regex veya algoritmalar eklenebilir.
  }
  return null; // Eşleşme bulunamazsa null döndür
}


exports.handleBatch = functions
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .pubsub.topic("trademark-batch-processing")
  .onPublish(async (message) => {
    const data = message.json;
    // imagePaths'i pubsub mesajından alıyoruz
    const { records, bulletinId, imagePaths } = data; 
    
    if (!records || !Array.isArray(records)) {
        console.error("Geçersiz mesaj verisi: 'records' bulunamadı veya dizi değil.", data);
        return null;
    }
    if (!imagePaths || !Array.isArray(imagePaths)) {
        console.warn("Uyarı: 'imagePaths' bulunamadı veya dizi değil. Görsel eşleşmesi yapılamayacak.", data);
        // imagePaths boş olsa bile işlem devam edebilir, sadece görseller null olur
    }

    const db = admin.firestore();
    const batch = db.batch();

    for (const record of records) {
      // Görsel yolu sadece imagePaths dizisinden findMatchingImage ile belirlenecek
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
        imagePath: matchedImagePath ?? null, // Eşleşen yolu veya null ata
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