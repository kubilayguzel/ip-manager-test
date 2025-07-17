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
    .region('europe-west1') // En yakın region seçin
    .runWith({
        timeoutSeconds: 120, // 2 dakika timeout
        memory: '256MB'
    })
    .https.onRequest((req, res) => {
        return corsHandler(req, res, async () => {
            // Sadece POST isteklerini kabul et
            if (req.method !== 'POST') {
                return res.status(405).json({ 
                    success: false,
                    error: 'Method not allowed' 
                });
            }

            try {
                console.log('🔥 ETEBS Proxy request:', req.body);
                
                const { action, token, documentNo } = req.body;

                // Gerekli parametreleri kontrol et
                if (!action || !token) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameters'
                    });
                }

                // ETEBS API endpoint'ini belirle
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

                // ETEBS API'sine istek gönder
                const etebsResponse = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'IP-Manager-ETEBS-Proxy/1.0'
                    },
                    body: JSON.stringify(requestBody),
                    timeout: 30000 // 30 saniye timeout
                });

                if (!etebsResponse.ok) {
                    throw new Error(`ETEBS API HTTP ${etebsResponse.status}: ${etebsResponse.statusText}`);
                }

                const etebsData = await etebsResponse.json();
                
                console.log('✅ ETEBS API response received');

                // ETEBS response'unu frontend'e döndür
                res.json({
                    success: true,
                    data: etebsData,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                console.error('❌ ETEBS Proxy Error:', error);
                
                // Hata türüne göre response
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
                        code: 'TIMEOUT'
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

            // GUID format validation
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
        
        // Firestore'dan eski logları temizle
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

/**
 * 'indexed_documents' koleksiyonuna yeni bir belge eklendiğinde tetiklenir.
 * Doğru mail şablonunu bulur, verilerle doldurur ve 'mail_notifications'
 * koleksiyonuna gönderilmek üzere yeni bir kayıt ekler.
 */
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
      // 1️⃣ Kuralı bul
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

      // 2️⃣ Şablonu bul
      if (rule) {
        const templateSnapshot = await db.collection("mail_templates").doc(rule.templateId).get();
        if (!templateSnapshot.exists) {
          console.warn(`Şablon bulunamadı: ${rule.templateId}`);
          missingFields.push("mailTemplate");
        } else {
          template = templateSnapshot.data();
        }
      }

      // 3️⃣ Müvekkil bilgilerini al
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

      // 4️⃣ Parametreleri doldur
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

      // 5️⃣ Durumu belirle
      if (missingFields.length > 0) {
        status = "missing_info";
      }

      // 6️⃣ Bildirimi oluştur
      const notificationData = {
        recipientEmail: client?.email || null,
        clientId: newDocument.clientId || null,
        subject: subject,
        body: body,
        status: status,
        missingFields: missingFields, // 🎯 yeni alan
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

  // --- YENİ EKLENEN ÇAĞRILABİLİR E-POSTA GÖNDERME FONKSİYONU ---
// Gmail API için gerekli yetki kapsamı
const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send"];

/**
 * Ön yüzden çağrılarak 'mail_notifications' koleksiyonundaki bir bildirimi
 * Gmail API üzerinden gönderir.
 */

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
        // Şablon kuralını bul
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

          // Mail Şablonunu al
          const templateSnapshot = await db.collection("mail_templates").doc(rule.templateId).get();
          if (!templateSnapshot.exists) {
            console.warn(`Şablon bulunamadı: ${rule.templateId}`);
            status = "missing_info";
          } else {
            template = templateSnapshot.data();
          }
        }

        // Müvekkil bilgilerini al
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

        // Parametreleri doldur (sadece her şey tamamsa)
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

        // Bildirimi oluştur
        const missingFields = [];
        if (!client || !client.email) missingFields.push('recipientEmail');
        if (!after.clientId) missingFields.push('clientId');
        if (!template) missingFields.push('template');

        const notificationData = {
          recipientEmail: client?.email || null,
          clientId: after.clientId || null,
          subject: subject,
          body: body,
          status: status, // "pending" veya "missing_info"
          missingFields: missingFields, // EKLENDİ!
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

/**
 * Bir görev 'completed' olarak güncellendiğinde, EPATS Evrak No ve doküman varsa
 * tüm iş tipleri için geçerli olan genel bir müvekkil bildirimi oluşturur.
 */
// functions/index.js

// ... (diğer kodlarınız)

// functions/index.js içindeki fonksiyonun güncellenmiş hali

exports.createUniversalNotificationOnTaskComplete = functions.firestore
  .document("tasks/{taskId}")
  .onUpdate(async (change, context) => {
    const taskId = context.params.taskId;
    console.log(`--- FONKSİYON TETİKLENDİ: tasks/${taskId} ---`);

    const taskDataBefore = change.before.data();
    const taskDataAfter = change.after.data();

    // Status değişimini kontrol et
    const isStatusChangedToCompleted = taskDataBefore.status !== "completed" && taskDataAfter.status === "completed";

    // EPATS dokümanını kontrol et
    const epatsDoc = taskDataAfter.details?.epatsDocument || null;
    const hasEpatsData = !!epatsDoc;

    // Önceki durum "completed" değil mi? (herhangi başka bir statü)
    const wasPreviouslyNotCompleted = taskDataBefore.status !== "completed";

    console.log(`Durum 'completed' olarak mı değişti?: ${isStatusChangedToCompleted}`);
    console.log(`EPATS dokümanı var mı?: ${hasEpatsData}`);
    console.log(`Önceki durum 'completed' değil miydi?: ${wasPreviouslyNotCompleted}`);

    if (isStatusChangedToCompleted && hasEpatsData && wasPreviouslyNotCompleted) {
      console.log("--> KOŞULLAR SAĞLANDI. Bildirim oluşturma işlemi başlıyor.");

      try {
        // 1. KURALI BUL
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

        // 2. Mail Şablonunu ve Müvekkil Bilgilerini Al
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

        // 3. PARAMETRELERİ DOLDUR
        const parameters = {
          muvekkil_adi: client.name,
          is_basligi: taskDataAfter.title,
          epats_evrak_no: epatsDoc.turkpatentEvrakNo || "",
          basvuru_no: ipRecord.applicationNumber || "",
        };

        let subject = template.subject.replace(/{{(.*?)}}/g, (match, p1) => parameters[p1.trim()] || match);
        let body = template.body.replace(/{{(.*?)}}/g, (match, p1) => parameters[p1.trim()] || match);

        // 4. MAIL BİLDİRİMİNİ OLUŞTUR
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
// 🌟 SMTP transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "kubilayguzel@evrekapatent.com",
    pass: "rqvl tpbm vkmu lmxi" // Google'dan aldığın uygulama şifresini buraya koy
  }
});

/**
 * mail_notifications koleksiyonundaki bir bildirimi SMTP üzerinden gönderir.
 * Ön yüzden çağrılır.
 */
exports.sendEmailNotification = functions.https.onCall(async (data, context) => {
  const { notificationId } = data;

  if (!notificationId) {
    throw new functions.https.HttpsError("invalid-argument", "notificationId parametresi zorunludur.");
  }

  // Firestore'dan bildirimi al
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

exports.processTrademarkBulletinUpload = functions
  .runWith({ timeoutSeconds: 300, memory: "1GB" })
  .storage.object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    const fileName = path.basename(filePath);
    if (!fileName.endsWith(".zip")) return null;

    const tempFilePath = path.join(os.tmpdir(), fileName);
    const extractDir = path.join(os.tmpdir(), `extract_${Date.now()}`);

    try {
      fs.mkdirSync(extractDir, { recursive: true });
      await bucket.file(filePath).download({ destination: tempFilePath });

      const zip = new AdmZip(tempFilePath);
      zip.extractAllTo(extractDir, true);

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

      const scriptPath = allFiles.find((p) => path.basename(p).toLowerCase() === "tmbulletin.log");
      if (!scriptPath) throw new Error("tmbulletin.log bulunamadı.");
      const scriptContent = fs.readFileSync(scriptPath, "utf8");

      const imageFiles = allFiles.filter((p) => /\.(jpg|jpeg|png)$/i.test(p));
      console.log(`📤 ${imageFiles.length} görsel Pub/Sub kuyruğuna gönderiliyor...`);

      const imagePathsMap = {};
      for (const localPath of imageFiles) {
        const filename = path.basename(localPath);
        const appNo = extractAppNoFromFilename(filename);
        const destinationPath = `bulletins/${bulletinId}/${filename}`;
        if (appNo) imagePathsMap[appNo] = destinationPath;

        await pubsub.topic("trademark-image-upload").publishMessage({
          data: Buffer.from(JSON.stringify({ localPath, destinationPath })),
        });
      }

      const records = parseScriptContent(scriptContent, imagePathsMap);
      const batchSize = 100;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await pubsub.topic("trademark-batch-processing").publishMessage({
          data: Buffer.from(JSON.stringify({ bulletinId, records: batch })),
        });
      }

      console.log(`✅ ${records.length} kayıt ve ${imageFiles.length} görsel işleme alındı.`);
    } catch (e) {
      console.error("İşlem hatası:", e);
      throw e;
    } finally {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    }

    return null;
  });

exports.uploadImageWorker = functions
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .pubsub.topic("trademark-image-upload")
  .onPublish(async (message) => {
    const { localPath, destinationPath } = message.json;
    const bucket = admin.storage().bucket();
    try {
      const contentType = getContentType(destinationPath);
      await bucket.upload(localPath, {
        destination: destinationPath,
        metadata: { contentType },
      });
      console.log(`✅ Yüklendi: ${destinationPath}`);
    } catch (err) {
      console.error(`❌ Hata (${destinationPath}):`, err);
    }
  });

function parseScriptContent(content, imagePathsMap = {}) {
  const records = [];
  const insertRegex = /INSERT INTO (\w+) VALUES\s*\(([\s\S]*?)\)/g;
  let match;
  while ((match = insertRegex.exec(content)) !== null) {
    const table = match[1].toUpperCase();
    let raw = match[2];

    const values = [];
    let current = "";
    let inString = false;
    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      if (char === "'") {
        if (inString && raw[i + 1] === "'") {
          current += "'";
          i++;
        } else {
          inString = !inString;
        }
      } else if (char === "," && !inString) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    if (table === "TRADEMARK") {
      const applicationNo = values[1]?.replace(/'/g, "") ?? "UNKNOWN";
      const imagePath = imagePathsMap[applicationNo] || null;

      records.push({
        applicationNo,
        applicationDate: values[2]?.replace(/'/g, "") || null,
        markName: values[3]?.replace(/'/g, "") || null,
        niceClasses: values[7]?.replace(/'/g, "").split(",") || [],
        holders: [],
        goods: [],
        extractedGoods: [],
        attorneys: [],
        imagePath,
      });
    }
  }
  return records;
}


// Yardımcı Fonksiyonlar

function findMatchingImage(applicationNo, imageFiles) {
  const cleanNo = applicationNo.replace(/\D/g, "");
  for (const file of imageFiles) {
    const fileDigits = file.replace(/\D/g, "");
    if (fileDigits.includes(cleanNo.slice(-5))) {
      return file;
    }
  }
  return null;
}

function decodeValue(str) {
  if (str === null || str === undefined) return null;
  if (str === "") return null;
  str = str.replace(/^'/, "").replace(/'$/, "").replace(/''/g, "'");
  // Unicode decode
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (m, g1) => String.fromCharCode(parseInt(g1, 16)));
}

function extractHolderName(str) {
  if (!str) return null;
  str = str.trim();
  // Eğer "(123456) Şirket Adı" ise
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
exports.handleBatch = functions
  .region("europe-west1")
  .pubsub
  .topic("trademark-batch-processing")
  .onPublish(async (message) => {
    const data = message.json;
    if (!data || !data.bulletinId || !Array.isArray(data.records)) {
      console.error("Geçersiz mesaj verisi:", data);
      return null;
    }

    const { bulletinId, records } = data;
    const db = admin.firestore();
    const batch = db.batch();

    try {
      for (const record of records) {
        const docRef = db.collection("trademarkRecords").doc(); // Otomatik ID
        batch.set(docRef, {
          bulletinId,
          ...record,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();
      console.log(`✅ ${records.length} kayıt Firestore'a eklendi (bulletinId: ${bulletinId})`);
    } catch (error) {
      console.error("🔥 Batch kayıt hatası:", error);
    }

    return null;
  });
