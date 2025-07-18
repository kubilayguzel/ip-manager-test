// functions/index.js
const functions = require('firebase-functions');
const cors = require('cors');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
const { Storage } = require("@google-cloud/storage");
const storage = new Storage();
const path = require("path");
const os = require("os");
const fs = require("fs");
const AdmZip = require("adm-zip");
const { createExtractorFromFile } = require("node-unrar-js");
const { google } = require("googleapis");
const { GoogleAuth } = require("google-auth-library");
const nodemailer = require("nodemailer");
const { handleBatch } = require("./handleBatch");
const { PubSub } = require("@google-cloud/pubsub");
const pubsub = new PubSub(); 

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// CORS ayarları - sadece kendi domain'inizden gelen istekleri kabul et
const corsOptions = {
    origin: [
        'https://kubilayguzel.github.io',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5173' // Vite dev server
    ],
    credentials: true,
    optionsSuccessStatus: 200
};

const corsHandler = cors(corsOptions);

// ETEBS API Proxy Function
exports.etebsProxy = functions
    .region('europe-west1') 
    .runWith({
        timeoutSeconds: 120, 
        memory: '256MB'
    })
    .https.onRequest((req, res) => {
        return corsHandler(req, res, async () => {
            if (req.method !== 'POST') {
                return res.status(405).json({ 
                    success: false,
                    error: 'Method not allowed' 
                });
            }

            try {
                console.log('🔥 ETEBS Proxy request:', req.body);
                
                const { action, token, documentNo } = req.body;

                if (!action || !token) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameters'
                    });
                }

                let apiUrl = '';
                let requestBody = { TOKEN: token };

                switch (action) {
                    case 'daily-notifications':
                        apiUrl = 'https://epats.turkpatent.gov.tr/service/TP/DAILY_NOTIFICATIONS?apikey=etebs';
                        break;
                    
                    case 'download-document':
                        if (!documentNo) {
                            return res.status(400).json({
                                success: false,
                                error: 'Document number required for download'
                            });
                        }
                        apiUrl = 'https://epats.turkpatent.gov.tr/service/TP/DOWNLOAD_DOCUMENT?apikey=etebs';
                        requestBody.DOCUMENT_NO = documentNo;
                        break;
                    
                    default:
                        return res.status(400).json({
                            success: false,
                            error: 'Invalid action'
                        });
                }

                console.log('📡 ETEBS API call:', apiUrl);

                const etebsResponse = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'IP-Manager-ETEBS-Proxy/1.0'
                    },
                    body: JSON.stringify(requestBody),
                    timeout: 30000 
                });

                if (!etebsResponse.ok) {
                    throw new Error(`ETEBS API HTTP ${etebsResponse.status}: ${etebsResponse.statusText}`);
                }

                const etebsData = await etebsResponse.json();
                
                console.log('✅ ETEBS API response received');

                res.json({
                    success: true,
                    data: etebsData,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                console.error('❌ ETEBS Proxy Error:', error);
                
                if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                    res.status(503).json({
                        success: false,
                        error: 'ETEBS service unavailable',
                        code: 'SERVICE_UNAVAILABLE'
                    });
                } else if (error.name === 'AbortError') {
                    res.status(408).json({
                        success: false,
                        error: 'Request timeout',
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: 'Internal proxy error',
                        code: 'PROXY_ERROR',
                        message: process.env.NODE_ENV === 'development' ? error.message : undefined
                    });
                }
            }
        });
    });

// Health Check Function
exports.etebsProxyHealth = functions
    .region('europe-west1')
    .https.onRequest((req, res) => {
        return corsHandler(req, res, () => {
            res.json({
                status: 'healthy',
                service: 'ETEBS Proxy',
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            });
        });
    });

// ETEBS Token Validation Function
exports.validateEtebsToken = functions
    .region('europe-west1')
    .https.onRequest((req, res) => {
        return corsHandler(req, res, () => {
            if (req.method !== 'POST') {
                return res.status(405).json({ error: 'Method not allowed' });
            }

            const { token } = req.body;
            
            if (!token) {
                return res.status(400).json({
                    valid: false,
                    error: 'Token required'
                });
            }

            const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            
            if (!guidRegex.test(token)) {
                return res.status(400).json({
                    valid: false,
                    error: 'Invalid token format'
                });
            }

            res.json({
                valid: true,
                format: 'GUID',
                timestamp: new Date().toISOString()
            });
        });
    });

// Rate Limiting Function (Scheduled)
exports.cleanupEtebsLogs = functions
    .region('europe-west1')
    .pubsub.schedule('every 24 hours')
    .onRun(async (context) => {
        console.log('🧹 ETEBS logs cleanup started');
        
        const admin = require('firebase-admin');
        if (!admin.apps.length) {
            admin.initializeApp();
        }

        const db = admin.firestore();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        try {
            const oldLogs = await db.collection('etebs_logs')
                .where('timestamp', '<', thirtyDaysAgo)
                .limit(500)
                .get();

            const batch = db.batch();
            oldLogs.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            
            console.log(`🗑️ Cleaned up ${oldLogs.docs.length} old ETEBS logs`);
        } catch (error) {
            console.error('❌ Cleanup error:', error);
        }

        return null;
    });

console.log('🔥 ETEBS Proxy Functions loaded');

// --- YENİ EKLENEN E-POSTA BİLDİRİM FONKSİYONU ---
exports.createMailNotificationOnDocumentIndex = functions.firestore
  .document("indexed_documents/{docId}")
  .onCreate(async (snap, context) => {
    const newDocument = snap.data();
    console.log(`Yeni belge algılandı: ${context.params.docId}`, newDocument);

    const db = admin.firestore();
    let missingFields = [];
    let rule = null;
    let template = null;
    let client = null;
    let subject = "";
    let body = "";
    let status = "pending";

    try {
      const rulesSnapshot = await db.collection("template_rules")
        .where("sourceType", "==", "document")
        .where("mainProcessType", "==", newDocument.mainProcessType)
        .where("subProcessType", "==", newDocument.subProcessType)
        .limit(1)
        .get();

      if (rulesSnapshot.empty) {
        console.warn("Kural bulunamadı.");
        missingFields.push("templateRule");
      } else {
        rule = rulesSnapshot.docs[0].data();
      }

      if (rule) {
        const templateSnapshot = await db.collection("mail_templates").doc(rule.templateId).get();
        if (!templateSnapshot.exists) {
          console.warn(`Şablon bulunamadı: ${rule.templateId}`);
          missingFields.push("mailTemplate");
        } else {
          template = templateSnapshot.data();
        }
      }

      if (newDocument.clientId) {
        const clientSnapshot = await db.collection("clients").doc(newDocument.clientId).get();
        if (!clientSnapshot.exists) {
          console.warn(`Müvekkil bulunamadı: ${newDocument.clientId}`);
          missingFields.push("client");
        } else {
          client = clientSnapshot.data();
        }
      } else {
        console.warn("clientId eksik.");
        missingFields.push("clientId");
      }

      if (template && client) {
        subject = template.subject;
        body = template.body;

        const parameters = { ...client, ...newDocument };

        for (const key in parameters) {
          const placeholder = new RegExp(`{{${key}}}`, "g");
          subject = subject.replace(placeholder, parameters[key]);
          body = body.replace(placeholder, parameters[key]);
        }

        if (!client.email) {
          missingFields.push("recipientEmail");
        }
        if (!subject) {
          missingFields.push("subject");
        }
        if (!body) {
          missingFields.push("body");
        }
      } else {
        subject = "Eksik Bilgi: Bildirim Tamamlanamadı";
        body = "Bu bildirim oluşturuldu ancak gönderim için eksik bilgiler mevcut. Lütfen tamamlayın.";
      }

      if (missingFields.length > 0) {
        status = "missing_info";
      }

      const notificationData = {
        recipientEmail: client?.email || null,
        clientId: newDocument.clientId || null,
        subject: subject,
        body: body,
        status: status,
        missingFields: missingFields, 
        sourceDocumentId: context.params.docId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await db.collection("mail_notifications").add(notificationData);
      console.log(`Mail bildirimi '${status}' olarak oluşturuldu.`);

      return null;

    } catch (error) {
      console.error("Mail bildirimi oluşturulurken hata:", error);
      return null;
    }
  });

exports.createMailNotificationOnDocumentStatusChange = functions.firestore
  .document("unindexed_pdfs/{docId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    if (before.status !== 'indexed' && after.status === 'indexed') {
      console.log(`Belge indexlendi: ${context.params.docId}`, after);

      const db = admin.firestore();

      let rule = null;
      let template = null;
      let client = null;
      let status = "pending";
      let subject = "";
      let body = "";

      try {
        const rulesSnapshot = await db.collection("template_rules")
          .where("sourceType", "==", "document")
          .where("mainProcessType", "==", after.mainProcessType)
          .where("subProcessType", "==", after.subProcessType)
          .limit(1)
          .get();

        if (rulesSnapshot.empty) {
          console.warn("Kural bulunamadı, eksik bilgi bildirimi oluşturulacak.");
          status = "missing_info";
        } else {
          rule = rulesSnapshot.docs[0].data();
          console.log(`Kural bulundu. Şablon ID: ${rule.templateId}`);

          const templateSnapshot = await db.collection("mail_templates").doc(rule.templateId).get();
          if (!templateSnapshot.exists) {
            console.warn(`Şablon bulunamadı: ${rule.templateId}`);
            status = "missing_info";
          } else {
            template = templateSnapshot.data();
          }
        }

        if (after.clientId) {
          const clientSnapshot = await db.collection("persons").doc(after.clientId).get();
          if (!clientSnapshot.exists) {
            console.warn(`Müvekkil bulunamadı: ${after.clientId}`);
            status = "missing_info";
          } else {
            client = clientSnapshot.data();
          }
        } else {
          console.warn("clientId alanı eksik.");
          status = "missing_info";
        }

        if (status === "pending" && template && client) {
          subject = template.subject;
          body = template.body;

          const parameters = { ...client, ...after };
          for (const key in parameters) {
            const placeholder = new RegExp(`{{${key}}}`, "g");
            subject = subject.replace(placeholder, parameters[key]);
            body = body.replace(placeholder, parameters[key]);
          }
        } else {
          subject = "Eksik Bilgi: Bildirim Tamamlanamadı";
          body = "Bu bildirim oluşturuldu ancak gönderim için eksik bilgiler mevcut. Lütfen eksiklikleri giderin.";
        }

        const missingFields = [];
        if (!client || !client.email) missingFields.push('recipientEmail');
        if (!after.clientId) missingFields.push('clientId');
        if (!template) missingFields.push('template');

        const notificationData = {
          recipientEmail: client?.email || null,
          clientId: after.clientId || null,
          subject: subject,
          body: body,
          status: status, 
          missingFields: missingFields, 
          sourceDocumentId: context.params.docId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await db.collection("mail_notifications").add(notificationData);
        console.log(`Mail bildirimi '${status}' olarak oluşturuldu.`);
        return null;

      } catch (error) {
        console.error("Bildirim oluşturulurken hata:", error);
        return null;
      }
    } else {
      console.log("Status değişimi indekslenme değil, işlem atlandı.");
      return null;
    }
  });

exports.createUniversalNotificationOnTaskComplete = functions.firestore
  .document("tasks/{taskId}")
  .onUpdate(async (change, context) => {
    const taskId = context.params.taskId;
    console.log(`--- FONKSİYON TETİKLENDİ: tasks/${taskId} ---`);

    const taskDataBefore = change.before.data();
    const taskDataAfter = change.after.data();

    const isStatusChangedToCompleted = taskDataBefore.status !== "completed" && taskDataAfter.status === "completed";

    const epatsDoc = taskDataAfter.details?.epatsDocument || null;
    const hasEpatsData = !!epatsDoc;

    const wasPreviouslyNotCompleted = taskDataBefore.status !== "completed";

    console.log(`Durum 'completed' olarak mı değişti?: ${isStatusChangedToCompleted}`);
    console.log(`EPATS dokümanı var mı?: ${hasEpatsData}`);
    console.log(`Önceki durum 'completed' değil miydi?: ${wasPreviouslyNotCompleted}`);

    if (isStatusChangedToCompleted && hasEpatsData && wasPreviouslyNotCompleted) {
      console.log("--> KOŞULLAR SAĞLANDI. Bildirim oluşturma işlemi başlıyor.");

      try {
        const rulesSnapshot = await db.collection("template_rules")
          .where("sourceType", "==", "task_completion_epats")
          .limit(1)
          .get();

        if (rulesSnapshot.empty) {
          console.error("HATA: 'task_completion_epats' için bir kural bulunamadı!");
          return null;
        }
        const rule = rulesSnapshot.docs[0].data();
        console.log(`Kural bulundu. Şablon ID: ${rule.templateId}`);

        const templateSnapshot = await db.collection("mail_templates").doc(rule.templateId).get();
        if (!templateSnapshot.exists) {
          console.error(`Hata: ${rule.templateId} ID'li mail şablonu bulunamadı!`);
          return null;
        }
        const template = templateSnapshot.data();

        const ipRecordSnapshot = await db.collection("ipRecords").doc(taskDataAfter.relatedIpRecordId).get();
        if (!ipRecordSnapshot.exists) {
          console.error(`Hata: Görevle ilişkili IP kaydı (${taskDataAfter.relatedIpRecordId}) bulunamadı!`);
          return null;
        }
        const ipRecord = ipRecordSnapshot.data();

        const primaryOwnerId = ipRecord.owners?.[0]?.id;
        if (!primaryOwnerId) {
          console.error('IP kaydına atanmış birincil hak sahibi bulunamadı.');
          return null;
        }
        const clientSnapshot = await db.collection("persons").doc(primaryOwnerId).get();
        const client = clientSnapshot.data();

        const parameters = {
          muvekkil_adi: client.name,
          is_basligi: taskDataAfter.title,
          epats_evrak_no: epatsDoc.turkpatentEvrakNo || "",
          basvuru_no: ipRecord.applicationNumber || "",
        };

        let subject = template.subject.replace(/{{(.*?)}}/g, (match, p1) => parameters[p1.trim()] || match);
        let body = template.body.replace(/{{(.*?)}}/g, (match, p1) => parameters[p1.trim()] || match);

        await db.collection("mail_notifications").add({
          recipientEmail: client.email,
          clientId: primaryOwnerId,
          subject: subject,
          body: body,
          status: "pending",
          sourceTaskId: taskId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log("--> BAŞARILI: Bildirim 'mail_notifications' koleksiyonuna eklendi.");
        return null;

      } catch (error) {
        console.error("HATA: Bildirim oluşturma bloğunda bir hata oluştu:", error);
        return null;
      }
    } else {
      console.log("--> KOŞULLAR SAĞLANMADI. Fonksiyon sonlandırılıyor.");
      return null;
    }
  });

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "kubilayguzel@evrekapatent.com",
    pass: "rqvl tpbm vkmu lmxi" 
  }
});

exports.sendEmailNotification = functions.https.onCall(async (data, context) => {
  const { notificationId } = data;

  if (!notificationId) {
    throw new functions.https.HttpsError("invalid-argument", "notificationId parametresi zorunludur.");
  }

  const notificationRef = db.collection("mail_notifications").doc(notificationId);
  const notificationDoc = await notificationRef.get();

  if (!notificationDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Bildirim bulunamadı.");
  }

  const notificationData = notificationDoc.data();

  const mailOptions = {
    from: `"IP Manager" <kubilayguzel@evrekapatent.com>`,
    to: notificationData.recipientEmail,
    subject: notificationData.subject,
    html: notificationData.body
  };

  try {
    console.log("SMTP üzerinden gönderim başlıyor...");
    await transporter.sendMail(mailOptions);

    console.log(`E-posta başarıyla gönderildi: ${notificationData.recipientEmail}`);
    await notificationRef.update({
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, message: "E-posta başarıyla gönderildi." };
  } catch (error) {
    console.error("SMTP gönderim hatası:", error);
    await notificationRef.update({
      status: "failed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      errorInfo: error.message
    });

    throw new functions.https.HttpsError("internal", "E-posta gönderilirken bir hata oluştu.", error.message);
  }
  });

function listAllFilesRecursive(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(listAllFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

function extractAppNoFromFilename(filename) {
  const match = filename.match(/(\d{4,})/); 
  return match ? match[1] : null;
}
function parseValues(raw) {
  const values = [];
  let current = '';
  let inString = false;
  let i = 0;

  while (i < raw.length) {
    const char = raw[i];
    
    if (char === "'") {
      if (inString && raw[i + 1] === "'") {
        current += "'";
        i += 2;
        continue;
      } else {
        inString = !inString;
      }
    } else if (char === ',' && !inString) {
      values.push(decodeValue(current.trim()));
      current = '';
      i++;
      continue;
    } else {
      current += char;
    }
    i++;
  }
  
  values.push(decodeValue(current.trim()));
  return values;
}
exports.processTrademarkBulletinUpload = functions
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .storage.object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    const fileName = path.basename(filePath);
    const bucket = admin.storage().bucket();

    if (!fileName.endsWith(".zip") && !fileName.endsWith(".rar")) return null; 

    const tempFilePath = path.join(os.tmpdir(), fileName);
    const extractDir = path.join(os.tmpdir(), `extract_${Date.now()}`);

    try {
      fs.mkdirSync(extractDir, { recursive: true });
      await bucket.file(filePath).download({ destination: tempFilePath });

      // Extract işlemi
      if (fileName.endsWith(".zip")) {
        const zip = new AdmZip(tempFilePath);
        zip.extractAllTo(extractDir, true);
      } else if (fileName.endsWith(".rar")) {
        const extractor = await createExtractorFromFile({ path: tempFilePath });
        const list = extractor.getFileList();
        if (list.files.length === 0) {
          throw new Error("RAR dosyası boş veya içerik listelenemedi.");
        }
        await extractor.extractAll(extractDir);
      }

      // Bulletin info okuma
      const allFiles = listAllFilesRecursive(extractDir);
      const bulletinPath = allFiles.find((p) =>
        ["bulletin.inf", "bulletin"].includes(path.basename(p).toLowerCase())
      );
      if (!bulletinPath) throw new Error("bulletin.inf bulunamadı.");

      const content = fs.readFileSync(bulletinPath, "utf8");
      const bulletinNo = (content.match(/NO\s*=\s*(.*)/) || [])[1]?.trim() || "Unknown";
      const bulletinDate = (content.match(/DATE\s*=\s*(.*)/) || [])[1]?.trim() || "Unknown";

      const bulletinRef = await db.collection("trademarkBulletins").add({
        bulletinNo,
        bulletinDate,
        type: "marka",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const bulletinId = bulletinRef.id;

      // Script content parse
      const scriptPath = allFiles.find((p) => path.basename(p).toLowerCase() === "tmbulletin.log");
      if (!scriptPath) throw new Error("tmbulletin.log bulunamadı.");
      
      // **ÖNEMLİ DEĞİŞİKLİK: Stream ile okuma**
      const scriptContent = fs.readFileSync(scriptPath, "utf8");
      const records = parseScriptContent(scriptContent);
      const imagePathsForPubSub = [];
      // Script content'i hafızadan temizle
      delete scriptContent;

      // Görselleri applicationNo'ya göre eşle
      const imageFiles = allFiles.filter((p) => /\.(jpg|jpeg|png)$/i.test(p));
      const imagePathMap = {};
      for (const localPath of imageFiles) {
        const filename = path.basename(localPath);
        const destinationPath = `bulletins/${bulletinNo}_images/${filename}`; // bulletinId yerine bulletinNo

        const match = filename.match(/^(\d{4}\/\d+)/); // Örn: 2024/175199_logo.jpg
        if (match) {
          const appNo = match[1];
          if (!imagePathMap[appNo]) imagePathMap[appNo] = [];
          imagePathMap[appNo].push(destinationPath);
        }
      }
      // Her kayda görsel yolunu ekle
      for (const record of records) {
        record.bulletinId = bulletinId;
        const matchingImages = imagePathMap[record.applicationNo] || [];
        record.imagePath = matchingImages.length > 0 ? matchingImages[0] : null; // İlk (ve tek) imajı al
      }
   
     // Görsel işlemleri (yeni hafifletilmiş base64 yöntemi)
     console.log(`📤 ${imageFiles.length} görsel base64 ile 20’lik Pub/Sub batch’lerinde gönderiliyor...`);

     const imageBatchSize = 20;
      for (let i = 0; i < imageFiles.length; i += imageBatchSize) {
        const batch = imageFiles.slice(i, i + imageBatchSize);
        const encodedImages = [];

      for (const localPath of batch) {
        const filename = path.basename(localPath);
        const destinationPath = `bulletins/${bulletinNo}_images/${filename}`; // bulletinId yerine bulletinNo
        imagePathsForPubSub.push(destinationPath);

          const imageStream = fs.createReadStream(localPath);
          let base64 = '';
          for await (const chunk of imageStream) {
            base64 += chunk.toString('base64');
          }

          encodedImages.push({
            destinationPath,
            base64,
            contentType: getContentType(filename)
          });
        }

        // Tek mesajda 100 görsel gönder
        await pubsub.topic("trademark-image-upload").publishMessage({
          data: Buffer.from(JSON.stringify(encodedImages)),
          attributes: { batchSize: batch.length.toString() }
        });

        await new Promise(resolve => setTimeout(resolve, 200)); // Hafıza toparlansın
      }
      console.log(`✅ ${records.length} kayıt ve ${imageFiles.length} görsel işleme alındı.`);
      // Firestore’a kayıtları ekle
      const batchSize = 500;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = db.batch();
        const chunk = records.slice(i, i + batchSize);

        chunk.forEach((record) => {
          const docRef = db.collection("trademarkBulletinRecords").doc();
          batch.set(docRef, {
            ...record,
            bulletinId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        });

        await batch.commit();
        console.log(`✅ Firestore’a ${chunk.length} kayıt eklendi (${i + chunk.length}/${records.length})`);
      }

      // **HAFIZA TEMİZLİĞİ**
      delete records;
      delete imagePathsForPubSub;
      delete allFiles;
      
      // Garbage collection'ı tetikle
      if (global.gc) {
        global.gc();
      }
      
    } catch (e) {
      console.error("İşlem hatası:", e);
      throw e;
    } finally {
      // Geçici dosyaları temizle
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
    }

    return null;
  });

exports.uploadImageWorker = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .pubsub.topic("trademark-image-upload")
  .onPublish(async (message) => {
    console.log('🔥 uploadImageWorker tetiklendi (Batch)...');

    const batchData = message.data.toString();
    let images;

    try {
      images = JSON.parse(batchData);
      if (!Array.isArray(images)) throw new Error("Geçersiz batch verisi.");
    } catch (err) {
      console.error("❌ JSON parse hatası:", err);
      return;
    }

    await Promise.all(images.map(async (img) => {
      const { destinationPath, base64, contentType } = img;

      if (!destinationPath || !base64) {
        console.warn('❌ Eksik veri, işlem atlandı:', img);
        return;
      }

      const imageBuffer = Buffer.from(base64, 'base64');
      const file = admin.storage().bucket().file(destinationPath);

      try {
        await file.save(imageBuffer, {
          contentType: contentType || 'image/jpeg',
          resumable: false,
        });
        console.log(`✅ Yüklendi: ${destinationPath}`);
      } catch (err) {
        console.error(`❌ Hata: ${destinationPath}`, err);
      }
    }));
  });

function parseScriptContent(content) {
  const recordsMap = {};
  
  // **HAFIZA OPTİMİZASYONU: Satır satır işleme**
  const lines = content.split('\n');
  
  // Her 1000 satırda bir progress log
  let processedLines = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line.length || !line.startsWith('INSERT INTO')) {
      continue;
    }
    
    processedLines++;
    if (processedLines % 1000 === 0) {
      console.log(`İşlenen satır: ${processedLines}/${lines.length}`);
    }
    
    const match = line.match(/INSERT INTO (\w+) VALUES\s*\((.*)\)$/);
    if (!match) continue;
    
    const table = match[1].toUpperCase();
    const values = parseValues(match[2]);
    
    const appNo = values[0];
    if (!appNo) continue;

    if (!recordsMap[appNo]) {
      recordsMap[appNo] = {
        applicationNo: appNo,
        applicationDate: null,
        markName: null,
        niceClasses: null,
        holders: [],
        goods: [],
        extractedGoods: [],
        attorneys: [],
      };
    }

    // Table'a göre işleme (aynı kaldı)
    if (table === "TRADEMARK") {
      recordsMap[appNo].applicationDate = values[1] ?? null;
      recordsMap[appNo].markName = values[5] ?? null;
      recordsMap[appNo].niceClasses = values[6] ?? null;
    } else if (table === "HOLDER") {
      const holderName = extractHolderName(values[2]);
      let addressParts = [values[3], values[4], values[5], values[6]].filter(Boolean).join(", ");
      if (addressParts.trim() === "") addressParts = null;
      recordsMap[appNo].holders.push({
        name: holderName,
        address: addressParts,
        country: values[7] ?? null,
      });
    } else if (table === "GOODS") {
      recordsMap[appNo].goods.push(values[3] ?? null);
    } else if (table === "EXTRACTEDGOODS") {
      recordsMap[appNo].extractedGoods.push(values[3] ?? null);
    } else if (table === "ATTORNEY") {
      recordsMap[appNo].attorneys.push(values[2] ?? null);
    }
  }
  
  return Object.values(recordsMap);
}

function decodeValue(str) {
  if (str === null || str === undefined) return null;
  if (str === "") return null;
  str = str.replace(/^'/, "").replace(/'$/, "").replace(/''/g, "'");
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (m, g1) => String.fromCharCode(parseInt(g1, 16)));
}

function extractHolderName(str) {
  if (!str) return null;
  str = str.trim();
  const parenMatch = str.match(/^\(\d+\)\s*(.*)$/);
  if (parenMatch) {
    return parenMatch[1].trim();
  }
  return str;
}

function getContentType(filePath) {
  if (/\.png$/i.test(filePath)) return "image/png";
  if (/\.jpe?g$/i.test(filePath)) return "image/jpeg";
  return "application/octet-stream";
}

exports.handleBatch = handleBatch;