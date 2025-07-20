// functions/index.js

// Firebase Admin SDK'sı ve diğer temel modüller
const admin = require('firebase-admin');
const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { createExtractorFromFile } = require('node-unrar-js');
const nodemailer = require('nodemailer');

// Firebase Functions v2 SDK importları
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onPublish } = require('firebase-functions/v2/pubsub'); // Pub/Sub fonksiyonları için v2 importu
const { onObjectFinalized } = require('firebase-functions/v2/storage'); // Storage triggerları için v2 importu
const { PubSub } = require('@google-cloud/pubsub'); // Pub/Sub mesajı yayınlamak için
const pubsubClient = new PubSub();

// Dış modüller (npm install ile yüklenmiş)
const cors = require('cors');
const fetch = require('node-fetch'); // node-fetch hala v2 ise gerekli
const algoliasearch = require('algoliasearch'); // Algolia SDK'sı

// Firebase Admin SDK'sını başlatın
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// **************************** ALGOLIA YAPILANDIRMASI ****************************
// Kendi Algolia Uygulama ID'niz ve Yönetici API Anahtarınız ile güncelleyin
const ALGOLIA_APP_ID = functions.config().algolia.app_id;
const ALGOLIA_ADMIN_API_KEY = functions.config().algolia.api_key;
const ALGOLIA_INDEX_NAME = 'trademark_bulletin_records_live';

const algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);
const algoliaIndex = algoliaClient.initIndex(ALGOLIA_INDEX_NAME);
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

// ETEBS API Proxy Function (v2 sözdizimi)
exports.etebsProxy = onRequest(
    {
        region: 'europe-west1',
        timeoutSeconds: 120,
        memory: '256MiB' // memory için 'MiB' veya 'GiB' kullanılır
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
exports.etebsProxyHealth = onRequest(
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
exports.validateEtebsToken = onRequest(
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

// Rate Limiting Function (Scheduled) (v2 sözdizimi)
exports.cleanupEtebsLogs = onSchedule(
    {
        schedule: 'every 24 hours',
        region: 'europe-west1'
    },
    async (context) => {
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


// --- YENİ EKLENEN E-POSTA BİLDİRİM FONKSİYONLARI (v2 sözdizimi) ---
exports.createMailNotificationOnDocumentIndex = onDocumentCreated(
    {
        document: "indexed_documents/{docId}",
        region: 'europe-west1'
    },
    async (snap, context) => {
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
    }
);

exports.createMailNotificationOnDocumentStatusChange = onDocumentUpdated(
    {
        document: "unindexed_pdfs/{docId}",
        region: 'europe-west1'
    },
    async (change, context) => {
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
    }
);

exports.createUniversalNotificationOnTaskComplete = onDocumentUpdated(
    {
        document: "tasks/{taskId}",
        region: 'europe-west1'
    },
    async (change, context) => {
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
                console.error("HATA: Bildirim oluşturulurken hata:", error);
                return null;
            }
        } else {
            console.log("--> KOŞULLAR SAĞLANMADI. Fonksiyon sonlandırılıyor.");
            return null;
        }
    }
);

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

// Yardımcı fonksiyonlar
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

// !!! handleBatch.js'den taşınan kod (v2 sözdizimi) !!!
// index.js'in en altına eklenmelidir

const { onPublish: onPublishV2 } = require("firebase-functions/v2/pubsub"); // onPublishV2 olarak yeniden adlandırıldı
const { onObjectFinalized: onObjectFinalizedV2 } = require("firebase-functions/v2/storage"); // onObjectFinalizedV2 olarak yeniden adlandırıldı

// handleBatch.js içeriği exports.handleBatch = onPublishV2(...) olarak değiştirildi
// exports.handleBatch = handleBatch (önceki satır) kaldırıldı

exports.handleBatch = onPublishV2(
  {
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "1GiB",
    topic: "trademark-batch-processing"
  },
  async (event) => {
    const data = event.data;

    const { records, bulletinId, imagePaths } = data;

    if (!records || !Array.isArray(records)) {
      console.error("Geçersiz mesaj verisi: 'records' bulunamadı veya dizi değil.", data);
      return;
    }

    if (!imagePaths || !Array.isArray(imagePaths)) {
      console.warn("Uyarı: 'imagePaths' bulunamadı veya dizi değil. Görsel eşleşmesi yapılamayacak.", data);
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

    if (global.gc) {
      global.gc();
    }

    return null;
  }
);


exports.processTrademarkBulletinUpload = onObjectFinalizedV2( // onObjectFinalizedV2 kullanıldı
  {
    bucket: admin.storage().bucket().name, // Kovan adını dinamik olarak alın
    region: 'europe-west1',
    timeoutSeconds: 540,
    memory: "1GiB"
  },
  async (event) => {
    const object = event.data;
    const filePath = object.name;
    const fileName = path.basename(filePath);
    const bucket = admin.storage().bucket();

    if (!fileName.endsWith(".zip") && !fileName.endsWith(".rar")) return null;

    const tempFilePath = path.join(os.tmpdir(), fileName);
    const extractDir = path.join(os.tmpdir(), `extract_${Date.now()}`);

    try {
      fs.mkdirSync(extractDir, { recursive: true });
      await bucket.file(filePath).download({ destination: tempFilePath });

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
      const records = parseScriptContent(scriptContent);
      const imagePathsForPubSub = [];
      delete scriptContent;

      const imageFiles = allFiles.filter((p) => /\.(jpg|jpeg|png)$/i.test(p));
      const imagePathMap = {};
      for (const localPath of imageFiles) {
        const filename = path.basename(localPath);
        const destinationPath = `bulletins/trademark_${bulletinNo}_images/${filename}`;

        const match = filename.match(/^(\d{4})[_\-]?(\d{5,})/);
        if (match) {
          const appNo = `${match[1]}/${match[2]}`;
          if (!imagePathMap[appNo]) imagePathMap[appNo] = [];
          imagePathMap[appNo].push(destinationPath);
        }
      }

      for (const record of records) {
        record.bulletinId = bulletinId;
        const matchingImages = imagePathMap[record.applicationNo] || [];
        record.imagePath = matchingImages.length > 0 ? matchingImages[0] : null;
      }

      console.log(`📤 ${imageFiles.length} görsel base64 ile 200’lük Pub/Sub batch’lerinde gönderiliyor...`);

      const imageBatchSize = 200;
      for (let i = 0; i < imageFiles.length; i += imageBatchSize) {
        const batch = imageFiles.slice(i, i + imageBatchSize);
        const encodedImages = [];

        for (const localPath of batch) {
          const filename = path.basename(localPath);
          const destinationPath = `bulletins/trademark_${bulletinNo}_images/${filename}`;
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

        await pubsubClient.topic("trademark-image-upload").publishMessage({ // pubsubClient kullanıldı
          data: Buffer.from(JSON.stringify(encodedImages)),
          attributes: { batchSize: batch.length.toString() }
        });

        await new Promise(resolve => setTimeout(resolve, 200));
      }
      console.log(`✅ ${records.length} kayıt ve ${imageFiles.length} görsel işleme alındı.`);
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

      delete records;
      delete imagePathsForPubSub;
      delete allFiles;

      if (global.gc) {
        global.gc();
      }

    } catch (e) {
      console.error("İşlem hatası:", e);
      throw e;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
    }

    return null;
  }
);


exports.uploadImageWorker = onPublishV2( // onPublishV2 kullanıldı
  {
    region: 'europe-west1',
    timeoutSeconds: 300,
    memory: "512MiB", // memory için "MiB" kullanılır
    topic: "trademark-image-upload"
  },
  async (message) => {
    console.log('🔥 uploadImageWorker tetiklendi (Batch)...');

    let images;
    try {
      const batchData = Buffer.from(message.data, 'base64').toString();
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

// exports.indexTrademarkBulletinRecords fonksiyonu buraya taşınmamıştır,
// index.js'in en üst kısımlarından çağrılıyordu. Orayı da v2'ye uyarlayacağız.
// Önceki adımda yorum satırı yaptığımız Algolia indeksleme fonksiyonunu da v2 sözdizimine taşıyalım.

exports.indexTrademarkBulletinRecords = onRequest( // HttpsCallable fonksiyonu onRequest'e dönüştü
  {
    region: 'europe-west1',
    timeoutSeconds: 540,
    memory: '2GiB' // memory için "GiB" kullanılır
  },
  async (req, res) => { // onRequest olduğu için req, res parametreleri
    if (!req.body || !req.body.data || !req.body.data.auth) { // Callable'dan onRequest'e dönüşüm için basic auth kontrolü
      console.warn('Kimlik doğrulaması yapılmamış çağrı veya eksik auth verisi.');
      return res.status(401).send('Yetkisiz');
    }
    // Basit bir auth kontrolü, gerçek uygulamada daha sağlam bir kontrol gerekir
    if (req.body.data.auth.uid !== 'ADMIN_UID_FROM_FIREBASE_AUTH') { // Sadece belirli bir admin UID'si çağırabilsin
      console.warn('Yetkisiz kullanıcıdan çağrı girişimi.');
      return res.status(403).send('Yasaklı');
    }

    console.log('Algolia: trademarkBulletinRecords için toplu indeksleme başlatıldı.');
    let recordsToIndex = [];
    let lastDoc = null;
    const batchSize = 500;

    try {
      while (true) {
        let query = db.collection('trademarkBulletinRecords').orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize);
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
          break;
        }

        const currentBatch = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            objectID: doc.id,
            markName: data.markName || null,
            applicationNo: data.applicationNo || null,
            applicationDate: data.applicationDate || null,
            niceClasses: data.niceClasses || null,
            bulletinId: data.bulletinId || null,
            holders: Array.isArray(data.holders) ? data.holders.map(h => h.name).join(', ') : '',
            goods: Array.isArray(data.goods) ? data.goods.join(', ') : '',
            extractedGoods: Array.isArray(data.extractedGoods) ? data.extractedGoods.join(', ') : '',
            attorneys: Array.isArray(data.attorneys) ? data.attorneys.map(a => a.name).join(', ') : '',
            imagePath: data.imagePath || null,
            createdAt: data.createdAt ? data.createdAt.toDate().getTime() : null
          };
        });

        recordsToIndex = recordsToIndex.concat(currentBatch);
        lastDoc = snapshot.docs[snapshot.docs.length - 1];

        console.log(`Firestore'dan ${recordsToIndex.length} belge okundu.`);

        if (snapshot.docs.length < batchSize) {
          break;
        }
      }

      console.log(`Algolia'ya toplam ${recordsToIndex.length} belge gönderiliyor.`);
      const { objectIDs } = await algoliaIndex.saveObjects(recordsToIndex);
      console.log(`Algolia'ya ${objectIDs.length} belge başarıyla eklendi/güncellendi.`);

      return res.status(200).send({ status: 'success', message: `${objectIDs.length} belge Algolia'ya eklendi/güncellendi.` });

    } catch (error) {
      console.error('Algolia indeksleme hatası:', error);
      return res.status(500).send({ status: 'error', message: 'Algolia indeksleme sırasında bir hata oluştu.', error: error.message });
    }
  }
);