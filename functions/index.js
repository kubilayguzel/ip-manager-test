// functions/index.js

// Firebase Admin SDK'sı ve diğer temel modüller
const admin = require('firebase-admin');
const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { createExtractorFromFile } = require('node-unrar-js');
const nodemailer = require('nodemailer');

const stream = require('stream');
const { pipeline } = require('stream/promises');

// Firebase Functions v2 SDK importları
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https'); // HTTPS fonksiyonları ve HttpsError için v2 importu
const { onSchedule } = require('firebase-functions/v2/scheduler'); // Scheduler triggerları için v2 importu
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore'); // Firestore triggerları için v2 importu
const { onMessagePublished } = require('firebase-functions/v2/pubsub'); // Pub/Sub mesaj trigger'ları için v2 importu
const { onObjectFinalized } = require('firebase-functions/v2/storage'); // Storage triggerları için v2 importu
const logger = require('firebase-functions/logger'); // Logger için
const { onDocumentWritten } = require("firebase-functions/v2/firestore");

// Dış modüller (npm install ile yüklenmiş)
const cors = require('cors');
const fetch = require('node-fetch');
const { PubSub } = require('@google-cloud/pubsub'); // Pub/Sub mesajı yayınlamak için

// Firebase Admin SDK'sını başlatın
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const pubsubClient = new PubSub(); // pubsubClient'ı burada tanımlayın

// ********************************************************************************

// CORS ayarları
const corsOptions = {
    origin: [
        'https://kubilayguzel.github.io',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5173'
    ],
    credentials: true,
    optionsSuccessStatus: 200
};
const corsHandler = cors(corsOptions);

// SMTP transporter configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "kubilayguzel@evrekapatent.com",
    pass: "rqvl tpbm vkmu lmxi" 
  }
});

// =========================================================
//              HTTPS FONKSİYONLARI (v2)
// =========================================================

// ETEBS API Proxy Function (v2 sözdizimi)
exports.etebsProxyV2 = onRequest(
    {
        region: 'europe-west1',
        timeoutSeconds: 120,
        memory: '256MiB'
    },
    async (req, res) => {
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
    }
);

// Health Check Function (v2 sözdizimi)
exports.etebsProxyHealthV2 = onRequest(
    {
        region: 'europe-west1'
    },
    (req, res) => {
        return corsHandler(req, res, () => {
            res.json({
                status: 'healthy',
                service: 'ETEBS Proxy',
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            });
        });
    }
);

// ETEBS Token Validation Function (v2 sözdizimi)
exports.validateEtebsTokenV2 = onRequest(
    {
        region: 'europe-west1'
    },
    (req, res) => {
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
    }
);

// Send Email Notification (v2 Callable Function)
exports.sendEmailNotificationV2 = onCall(
    {
        region: 'europe-west1'
    },
    async (request) => {
        const { notificationId } = request.data;

        if (!notificationId) {
            throw new HttpsError("invalid-argument", "notificationId parametresi zorunludur.");
        }

        const notificationRef = db.collection("mail_notifications").doc(notificationId);
        const notificationDoc = await notificationRef.get();

        if (!notificationDoc.exists) {
            throw new HttpsError("not-found", "Bildirim bulunamadı.");
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

            throw new HttpsError("internal", "E-posta gönderilirken bir hata oluştu.", error.message);
        }
    }
);

// =========================================================
//              SCHEDULER FONKSİYONLARI (v2)
// =========================================================

// Rate Limiting Function (Scheduled) (v2 sözdizimi)
exports.cleanupEtebsLogsV2 = onSchedule(
    {
        schedule: 'every 24 hours',
        region: 'europe-west1'
    },
    async (event) => {
        console.log('🧹 ETEBS logs cleanup started');

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
    }
);

// =========================================================
//              FIRESTORE TRIGGER FONKSİYONLARI (v2)
// =========================================================

exports.createMailNotificationOnDocumentIndexV2 = onDocumentCreated(
    {
        document: "indexed_documents/{docId}",
        region: 'europe-west1'
    },
    async (event) => {
        const snap = event.data;
        const newDocument = snap.data();
        const docId = event.params.docId;
        
        console.log(`Yeni belge algılandı: ${docId}`, newDocument);

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
                const clientSnapshot = await db.collection("persons").doc(newDocument.clientId).get();
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
                sourceDocumentId: docId,
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
    }
);

exports.createMailNotificationOnDocumentStatusChangeV2 = onDocumentUpdated(
    {
        document: "unindexed_pdfs/{docId}",
        region: 'europe-west1'
    },
    async (event) => {
        const change = event.data;
        const before = change.data.before.data();
        const after = change.after.data();
        const docId = event.params.docId;

        if (before.status !== 'indexed' && after.status === 'indexed') {
            console.log(`Belge indexlendi: ${docId}`, after);

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
                    sourceDocumentId: docId,
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
    }
);

exports.createUniversalNotificationOnTaskCompleteV2 = onDocumentUpdated(
    {
        document: "tasks/{taskId}",
        region: 'europe-west1'
    },
    async (event) => {
        const change = event.data;
        const taskId = event.params.taskId;
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
                console.error("HATA: Bildirim oluşturulurken hata:", error);
                return null;
            }
        } else {
            console.log("--> KOŞULLAR SAĞLANMADI. Fonksiyon sonlandırılıyor.");
            return null;
        }
    }
);

// =========================================================
//              STORAGE TRIGGER FONKSİYONLARI (v2)
// =========================================================

// Trademark Bulletin Upload Processing (v2 Storage Trigger)
// Debug edilmiş processTrademarkBulletinUploadV2 fonksiyonu
exports.processTrademarkBulletinUploadV3 = onObjectFinalized(
  {
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "2GiB" // Bellek limiti artırıldı
  },
  async (event) => {
    const filePath = event.data.name || "";
    const fileName = path.basename(filePath);

    // Sadece bulletins/ altındaki ZIP dosyalarını işle
    if (!filePath.startsWith("bulletins/") || !fileName.toLowerCase().endsWith(".zip")) {
      return null; // log atma
    }

    console.log("🔥 Trademark Bulletin Upload V3 başladı:", filePath);

    const bucket = admin.storage().bucket();
    const tempFilePath = path.join(os.tmpdir(), fileName);
    const extractDir = path.join(os.tmpdir(), `extract_${Date.now()}`);

    try {
      // ZIP indir
      await downloadWithStream(bucket.file(filePath), tempFilePath);

      // ZIP aç
      fs.mkdirSync(extractDir, { recursive: true });
      await extractZipStreaming(tempFilePath, extractDir);

      // Dosyaları tara
      const allFiles = listAllFilesRecursive(extractDir);

      // bulletin.inf oku
      const bulletinFile = allFiles.find((p) =>
        ["bulletin.inf", "bulletin"].includes(path.basename(p).toLowerCase())
      );
      if (!bulletinFile) throw new Error("bulletin.inf bulunamadı.");

      const content = fs.readFileSync(bulletinFile, "utf8");
      const bulletinNo = (content.match(/NO\s*=\s*(.*)/) || [])[1]?.trim() || "Unknown";
      const bulletinDate = (content.match(/DATE\s*=\s*(.*)/) || [])[1]?.trim() || "Unknown";

      const bulletinRef = await db.collection("trademarkBulletins").add({
        bulletinNo,
        bulletinDate,
        type: "marka",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      const bulletinId = bulletinRef.id;

      console.log(`📊 Bülten kaydedildi: ${bulletinNo} (${bulletinDate}) → ${bulletinId}`);

      // script parsing
      const scriptPath = allFiles.find(
        (p) => path.basename(p).toLowerCase() === "tmbulletin.log"
      );
      if (!scriptPath) throw new Error("tmbulletin.log bulunamadı.");

      const records = await parseScriptContentStreaming(scriptPath);

      // IMAGE PATH OLUŞTURMA
      const imagesDir = allFiles.filter((p) => p.includes(path.sep + "images" + path.sep));
      const imagePathMap = {};
      for (const imgPath of imagesDir) {
        const filename = path.basename(imgPath);
        const match = filename.match(/^(\d{4})[_\-]?(\d{5,})/);
        if (match) {
          const appNo = `${match[1]}/${match[2]}`;
          if (!imagePathMap[appNo]) imagePathMap[appNo] = [];
          imagePathMap[appNo].push(
            `bulletins/trademark_${bulletinNo}_images/${filename}`
          );
        }
      }

      // **CHUNK UPLOAD - Bellek dostu**
      const CHUNK_SIZE = 200; // Aynı anda en fazla 50 dosya
      for (let i = 0; i < imagesDir.length; i += CHUNK_SIZE) {
        const chunk = imagesDir.slice(i, i + CHUNK_SIZE);
        console.log(`📦 Görsel chunk yükleniyor: ${i + 1}-${i + chunk.length}/${imagesDir.length}`);

        await Promise.all(
          chunk.map((localPath) => {
            const destination = `bulletins/trademark_${bulletinNo}_images/${path.basename(localPath)}`;
            return bucket.upload(localPath, {
              destination,
              metadata: { contentType: getContentType(localPath) }
            });
          })
        );

        console.log(`✅ Chunk tamamlandı (${i + chunk.length}/${imagesDir.length})`);
        if (global.gc) {
          global.gc();
          console.log("🧹 Garbage collection tetiklendi (chunk sonrası)");
        }
      }

      console.log(`📷 ${imagesDir.length} görsel doğrudan yüklendi`);

      // Firestore kayıtları (imagePath eşleştirilmiş)
      await writeBatchesToFirestore(records, bulletinId, imagePathMap);

      console.log(
        `🎉 ZIP işleme tamamlandı: ${bulletinNo} → ${records.length} kayıt, ${imagesDir.length} görsel bulundu.`
      );
    } catch (e) {
      console.error("❌ Hata:", e.message);
      throw e;
    } finally {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    }

    return null;
  }
);


// =========================================================
//              HELPER FONKSİYONLARI
async function downloadWithStream(file, destination) {
  await pipeline(file.createReadStream(), fs.createWriteStream(destination));
}
async function extractZipStreaming(zipPath, extractDir) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const outputPath = path.join(extractDir, entry.entryName);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, zip.readFile(entry));
  }
}
function listAllFilesRecursive(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(listAllFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}
async function parseScriptContentStreaming(scriptPath) {
  const stats = fs.statSync(scriptPath);
  console.log(`📏 Script dosya boyutu: ${stats.size} bytes`);
  
  if (stats.size > 100 * 1024 * 1024) {
    console.log("🔄 Büyük dosya - chunk'lı parsing kullanılıyor");
    return parseScriptInChunks(scriptPath);
  }
  
  console.log("🔄 Normal parsing kullanılıyor");
  const content = fs.readFileSync(scriptPath, "utf8");
  return parseScriptContent(content);
}
function parseScriptContent(content) {
  console.log(`🔍 Parse başlıyor... Content length: ${content.length} karakter`);
  
  const recordsMap = {};
  const lines = content.split('\n');
  
  console.log(`📝 Toplam satır sayısı: ${lines.length}`);
  
  let processedLines = 0;
  let insertCount = 0;
  let valuesParsed = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line.length || !line.startsWith('INSERT INTO')) {
      continue;
    }
    
    processedLines++;
    insertCount++;
    
    if (processedLines % 1000 === 0) {
      console.log(`📈 İşlenen satır: ${processedLines}/${lines.length}`);
    }
    
    // ESKİ ÇALIŞAN REGEX PATTERN
    const match = line.match(/INSERT INTO (\w+) VALUES\s*\((.*)\)$/);
    if (!match) {
      if (insertCount <= 5) {
        console.warn(`⚠️ Regex eşleşmedi (satır ${i + 1}): ${line.substring(0, 100)}...`);
      }
      continue;
    }
    
    const table = match[1].toUpperCase();
    const valuesRaw = match[2];
    
    // MEVCUT parseValuesFromRaw FONKSİYONUNU KULLAN
    const values = parseValuesFromRaw(valuesRaw);
    
    if (!values || values.length === 0) {
      if (valuesParsed < 3) {
        console.warn(`⚠️ VALUES parse edilemedi: ${valuesRaw.substring(0, 50)}...`);
      }
      continue;
    }
    
    valuesParsed++;
    
    if (valuesParsed <= 3) {
      console.log(`✅ Parse başarılı (${table}):`, {
        appNo: values[0],
        totalValues: values.length,
        sample: values.slice(0, 3)
      });
    }
    
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
  
  const result = Object.values(recordsMap);
  
  console.log(`✅ Parse tamamlandı:`, {
    totalLines: lines.length,
    processedLines: processedLines,
    insertCount: insertCount,
    valuesParsed: valuesParsed,
    uniqueApplications: result.length,
    successRate: insertCount > 0 ? ((valuesParsed / insertCount) * 100).toFixed(1) + '%' : '0%'
  });
  
  if (result.length > 0) {
    console.log(`📋 İlk kayıt örneği:`, JSON.stringify(result[0], null, 2));
  }
  
  return result;
}
function parseValuesFromRaw(raw) {
  const values = [];
  let current = "";
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
    } else if (char === "," && !inString) {
      values.push(decodeValue(current.trim()));
      current = "";
      i++;
      continue;
    } else {
      current += char;
    }
    i++;
  }
  
  if (current.trim()) {
    values.push(decodeValue(current.trim()));
  }
  
  return values;
}

async function parseScriptInChunks(scriptPath) {
  const fd = fs.openSync(scriptPath, "r");
  const fileSize = fs.statSync(scriptPath).size;
  const chunkSize = 1024 * 1024;
  let buffer = "";
  let position = 0;
  const records = {};
  let currentTable = null;
  while (position < fileSize) {
    const chunk = Buffer.alloc(Math.min(chunkSize, fileSize - position));
    fs.readSync(fd, chunk, 0, chunk.length, position);
    position += chunk.length;
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("INSERT INTO")) {
        const match = line.match(/INSERT INTO (\w+)/);
        currentTable = match ? match[1] : null;
      }
      if (currentTable && line.includes("VALUES")) {
        const values = parseValuesFromLine(line);
        if (!values || !values.length) continue;
        const appNo = values[0];
        if (!records[appNo]) {
          records[appNo] = {
            applicationNo: appNo,
            applicationDate: null,
            markName: null,
            niceClasses: null,
            holders: [],
            goods: [],
            extractedGoods: [],
            attorneys: []
          };
        }
        if (currentTable === "TRADEMARK") {
          records[appNo].applicationDate = values[1] || null;
          records[appNo].markName = values[4] || null;
          records[appNo].niceClasses = values[6] || null;
        } else if (currentTable === "HOLDER") {
          records[appNo].holders.push({
            name: extractHolderName(values[2]),
            address: values[3],
            country: values[4]
          });
        } else if (currentTable === "GOODS") {
          records[appNo].goods.push(values[3]);
        } else if (currentTable === "EXTRACTEDGOODS") {
          records[appNo].extractedGoods.push(values[3]);
        } else if (currentTable === "ATTORNEY") {
          records[appNo].attorneys.push(values[2]);
        }
      }
    }
  }
  fs.closeSync(fd);
  return Object.values(records);
}
function parseValuesFromLine(line) {
  const valuesMatch = line.match(/VALUES\s*\((.*)\)/i);
  if (!valuesMatch) return null;
  
  return parseValuesFromRaw(valuesMatch[1]);
}
function decodeValue(str) {
    if (str === null || str === undefined) return null;
    if (str === "") return null;
    str = str.replace(/^'/, "").replace(/'$/, "").replace(/''/g, "'");
    // \uXXXX formatındaki unicode karakterleri çöz
    return str.replace(/\\u([0-9a-fA-F]{4})/g,
        (m, g1) => String.fromCharCode(parseInt(g1, 16))
    );
}
function extractHolderName(str) {
  if (!str) return null;
  const parenMatch = str.match(/^\(\d+\)\s*(.*)$/);
  return parenMatch ? parenMatch[1].trim() : str.trim();
}
async function writeBatchesToFirestore(records, bulletinId, imagePathMap) {
  const batchSize = 250;
  for (let i = 0; i < records.length; i += batchSize) {
    const chunk = records.slice(i, i + batchSize);
    const batch = db.batch();
    chunk.forEach((record) => {
      record.bulletinId = bulletinId;
      const matchingImages = imagePathMap[record.applicationNo] || [];
      record.imagePath = matchingImages.length > 0 ? matchingImages[0] : null;
      record.imageUploaded = false;
      batch.set(db.collection("trademarkBulletinRecords").doc(), {
        ...record,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
    console.log(`📝 ${Math.min(i + batchSize, records.length)}/${records.length} kayıt yazıldı`);
  }
}

function getContentType(filePath) {
  if (/\.png$/i.test(filePath)) return "image/png";
  if (/\.jpe?g$/i.test(filePath)) return "image/jpeg";
  return "application/octet-stream";
}

// BÜLTEN SİLME 
exports.deleteBulletinV2 = onCall(
  { timeoutSeconds: 540, 
    memory: "1GiB", 
    region: "europe-west1" },
  async (request) => {
  console.log('🔥 Bülten silme başladı');

  const { bulletinId } = request.data;
  if (!bulletinId) throw new Error('BulletinId gerekli');

  try {
    // 1. Bülten dokümanını al
    const bulletinDoc = await db.collection('trademarkBulletins').doc(bulletinId).get();
    if (!bulletinDoc.exists) throw new Error('Bülten bulunamadı');

    const bulletinData = bulletinDoc.data();
    const bulletinNo = bulletinData.bulletinNo;
    console.log(`📋 Silinecek bülten: ${bulletinNo}`);

    // 2. İlişkili trademarkBulletinRecords silme (500'erli chunk)
    let totalDeleted = 0;
    const recordsQuery = db.collection('trademarkBulletinRecords').where('bulletinId', '==', bulletinId);
    let snapshot = await recordsQuery.limit(500).get();

    while (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      totalDeleted += snapshot.size;
      console.log(`✅ ${totalDeleted} kayıt silindi (toplam)`);

      snapshot = await recordsQuery.limit(500).get();
    }

    // 3. Storage görsellerini sil (chunklı)
    const storage = admin.storage().bucket();
    const prefix = `bulletins/trademark_${bulletinNo}_images/`;
    let [files] = await storage.getFiles({ prefix });

    let totalImagesDeleted = 0;
    const chunkSize = 200; // aynı anda kaç dosya silinecek

    while (files.length > 0) {
      const chunk = files.splice(0, chunkSize);
      await Promise.all(
        chunk.map(file =>
          file.delete().catch(err =>
            console.warn(`⚠️ ${file.name} silinemedi: ${err.message}`)
          )
        )
      );
      totalImagesDeleted += chunk.length;
      console.log(`🖼️ ${totalImagesDeleted} görsel silindi (toplam)`);

      // Yeni listeleme (kalan dosya varsa)
      if (files.length === 0) {
        [files] = await storage.getFiles({ prefix });
      }
    }

    // 4. Ana bulletin dokümanını sil
    await bulletinDoc.ref.delete();
    console.log('✅ Ana bülten silindi');

    return {
      success: true,
      bulletinNo,
      recordsDeleted: totalDeleted,
      imagesDeleted: totalImagesDeleted,
      message: `Bülten ${bulletinNo} ve ${totalImagesDeleted} görsel başarıyla silindi (${totalDeleted} kayıt)`
    };

  } catch (error) {
    console.error('❌ Silme hatası:', error);
    return { success: false, error: error.message };
  }
});

