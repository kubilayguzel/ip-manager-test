// functions/index.js

// Firebase Admin SDK'sı ve diğer temel modüller (ESM importları)
import admin from 'firebase-admin';
import path from 'path';
import os from 'os';
import fs from 'fs';
import AdmZip from 'adm-zip';
// import { createExtractorFromFile } from 'node-unrar-js'; // Kullanılmıyor, kaldırıldı
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url'; // __dirname/filename eşdeğeri için
import { createRequire } from 'module'; // Bazı eski CJS modüllerini import etmek için

const require = createRequire(import.meta.url); // __dirname gibi CommonJS işlevselliği için

import stream from 'stream';
import { pipeline } from 'stream/promises';

// Firebase Functions v2 SDK importları (ESM)
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { logger } from 'firebase-functions/logger';

// Dış modüller (npm install ile yüklenmiş)
import cors from 'cors';
import fetch from 'node-fetch'; // v3+ için böyle import edilir
import algoliasearch from 'algoliasearch';
import { PubSub } from '@google-cloud/pubsub';


// Firebase Admin SDK'sını başlatın
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const pubsubClient = new PubSub();

// **************************** ALGOLIA YAPILANDIRMASI (Henüz Kaldırılmadıysa yorum satırı yapın veya silin) ****************************
// Environment variables kullanarak Algolia konfigürasyonu
const ALGOLIA_APP_ID = 'THCIEJJTZ9';
const ALGOLIA_ADMIN_API_KEY = 'c48fd50edd0a398bbf6d75354b805494';
const ALGOLIA_INDEX_NAME = 'trademark_bulletin_records_live';

// Algolia client'ı sadece credentials varsa initialize et
let algoliaClient, algoliaIndex;
if (ALGOLIA_APP_ID && ALGOLIA_ADMIN_API_KEY) {
    algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);
    algoliaIndex = algoliaClient.initIndex(ALGOLIA_INDEX_NAME);
}

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
                logger.log('🔥 ETEBS Proxy request:', req.body);

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

                logger.log('📡 ETEBS API call:', apiUrl);

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

                logger.log('✅ ETEBS API response received');

                res.json({
                    success: true,
                    data: etebsData,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                logger.error('❌ ETEBS Proxy Error:', error);

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
            logger.log("SMTP üzerinden gönderim başlıyor...");
            await transporter.sendMail(mailOptions);

            logger.log(`E-posta başarıyla gönderildi: ${notificationData.recipientEmail}`);
            await notificationRef.update({
                status: "sent",
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, message: "E-posta başarıyla gönderildi." };
        } catch (error) {
            logger.error("SMTP gönderim hatası:", error);
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
        logger.log('🧹 ETEBS logs cleanup started');

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

            logger.log(`🗑️ Cleaned up ${oldLogs.docs.length} old ETEBS logs`);
        } catch (error) {
            logger.error('❌ Cleanup error:', error);
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
        
        logger.log(`Yeni belge algılandı: ${docId}`, newDocument);

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
                logger.warn("Kural bulunamadı.");
                missingFields.push("templateRule");
            } else {
                rule = rulesSnapshot.docs[0].data();
            }

            if (rule) {
                const templateSnapshot = await db.collection("mail_templates").doc(rule.templateId).get();
                if (!templateSnapshot.exists) {
                    logger.warn(`Şablon bulunamadı: ${rule.templateId}`);
                    missingFields.push("mailTemplate");
                } else {
                    template = templateSnapshot.data();
                }
            }

            if (newDocument.clientId) {
                const clientSnapshot = await db.collection("persons").doc(newDocument.clientId).get();
                if (!clientSnapshot.exists) {
                    logger.warn(`Müvekkil bulunamadı: ${newDocument.clientId}`);
                    missingFields.push("client");
                } else {
                    client = clientSnapshot.data();
                }
            } else {
                logger.warn("clientId eksik.");
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
            logger.log(`Mail bildirimi '${status}' olarak oluşturuldu.`);

            return null;

        } catch (error) {
            logger.error("Mail bildirimi oluşturulurken hata:", error);
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
            logger.log(`Belge indexlendi: ${docId}`, after);

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
                    logger.warn("Kural bulunamadı, eksik bilgi bildirimi oluşturulacak.");
                    status = "missing_info";
                } else {
                    rule = rulesSnapshot.docs[0].data();
                    logger.log(`Kural bulundu. Şablon ID: ${rule.templateId}`);

                    const templateSnapshot = await db.collection("mail_templates").doc(rule.templateId).get();
                    if (!templateSnapshot.exists) {
                        logger.warn(`Şablon bulunamadı: ${rule.templateId}`);
                        status = "missing_info";
                    } else {
                        template = templateSnapshot.data();
                    }
                }

                if (after.clientId) {
                    const clientSnapshot = await db.collection("persons").doc(after.clientId).get();
                    if (!clientSnapshot.exists) {
                        logger.warn(`Müvekkil bulunamadı: ${after.clientId}`);
                        status = "missing_info";
                    } else {
                        client = clientSnapshot.data();
                    }
                } else {
                    logger.warn("clientId alanı eksik.");
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
                logger.log(`Mail bildirimi '${status}' olarak oluşturuldu.`);
                return null;

            } catch (error) {
                logger.error("Bildirim oluşturulurken hata:", error);
                return null;
            }
        } else {
            logger.log("Status değişimi indekslenme değil, işlem atlandı.");
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
        logger.log(`--- FONKSİYON TETİKLENDİ: tasks/${taskId} ---`);

        const taskDataBefore = change.before.data();
        const taskDataAfter = change.after.data();

        const isStatusChangedToCompleted = taskDataBefore.status !== "completed" && taskDataAfter.status === "completed";

        const epatsDoc = taskDataAfter.details?.epatsDocument || null;
        const hasEpatsData = !!epatsDoc;

        const wasPreviouslyNotCompleted = taskDataBefore.status !== "completed";

        logger.log(`Durum 'completed' olarak mı değişti?: ${isStatusChangedToCompleted}`);
        logger.log(`EPATS dokümanı var mı?: ${hasEpatsData}`);
        logger.log(`Önceki durum 'completed' değil miydi?: ${wasPreviouslyNotCompleted}`);

        if (isStatusChangedToCompleted && hasEpatsData && wasPreviouslyNotCompleted) {
            logger.log("--> KOŞULLAR SAĞLANDI. Bildirim oluşturma işlemi başlıyor.");

            try {
                const rulesSnapshot = await db.collection("template_rules")
                    .where("sourceType", "==", "task_completion_epats")
                    .limit(1)
                    .get();

                if (rulesSnapshot.empty) {
                    logger.error("HATA: 'task_completion_epats' için bir kural bulunamadı!");
                    return null;
                }
                const rule = rulesSnapshot.docs[0].data();
                logger.log(`Kural bulundu. Şablon ID: ${rule.templateId}`);

                const templateSnapshot = await db.collection("mail_templates").doc(rule.templateId).get();
                if (!templateSnapshot.exists) {
                    logger.error(`Hata: ${rule.templateId} ID'li mail şablonu bulunamadı!`);
                    return null;
                }
                const template = templateSnapshot.data();

                const ipRecordSnapshot = await db.collection("ipRecords").doc(taskDataAfter.relatedIpRecordId).get();
                if (!ipRecordSnapshot.exists) {
                    logger.error(`Hata: Görevle ilişkili IP kaydı (${taskDataAfter.relatedIpRecordId}) bulunamadı!`);
                    return null;
                }
                const ipRecord = ipRecordSnapshot.data();

                const primaryOwnerId = ipRecord.owners?.[0]?.id;
                if (!primaryOwnerId) {
                    logger.error('IP kaydına atanmış birincil hak sahibi bulunamadı.');
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

                logger.log("--> BAŞARILI: Bildirim 'mail_notifications' koleksiyonuna eklendi.");
                return null;

            } catch (error) {
                logger.error("HATA: Bildirim oluşturulurken hata:", error);
                return null;
            }
        } else {
            logger.log("--> KOŞULLAR SAĞLANMADI. Fonksiyon sonlandırılıyor.");
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

    logger.log("🔥 Trademark Bulletin Upload V3 başladı:", filePath);

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

      logger.log(`📊 Bülten kaydedildi: ${bulletinNo} (${bulletinDate}) → ${bulletenId}`);

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
            `bulletins/trademark_${bulletenNo}_images/${filename}`
          );
        }
      }

      // **CHUNK UPLOAD - Bellek dostu**
      const CHUNK_SIZE = 200; // Aynı anda en fazla 50 dosya
      for (let i = 0; i < imagesDir.length; i += CHUNK_SIZE) {
        const chunk = imagesDir.slice(i, i + CHUNK_SIZE);
        logger.log(`📦 Görsel chunk yükleniyor: ${i + 1}-${i + chunk.length}/${imagesDir.length}`);

        await Promise.all(
          chunk.map((localPath) => {
            const destination = `bulletins/trademark_${bulletenNo}_images/${path.basename(localPath)}`;
            return bucket.upload(localPath, {
              destination,
              metadata: { contentType: getContentType(localPath) }
            });
          })
        );

        logger.log(`✅ Chunk tamamlandı (${i + chunk.length}/${imagesDir.length})`);
        if (global.gc) {
          global.gc();
          logger.log("🧹 Garbage collection tetiklendi (chunk sonrası)");
        }
      }

      logger.log(`📷 ${imagesDir.length} görsel doğrudan yüklendi`);

      // Firestore kayıtları (imagePath eşleştirilmiş)
      await writeBatchesToFirestore(records, bulletinId, imagePathMap);

      logger.log(
        `🎉 ZIP işleme tamamlandı: ${bulletenNo} → ${records.length} kayıt, ${imagesDir.length} görsel bulundu.`
      );
    } catch (e) {
      logger.error("❌ Hata:", e.message);
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
  logger.log(`📏 Script dosya boyutu: ${stats.size} bytes`);
  
  if (stats.size > 100 * 1024 * 1024) {
    logger.log("🔄 Büyük dosya - chunk'lı parsing kullanılıyor");
    return parseScriptInChunks(scriptPath);
  }
  
  logger.log("🔄 Normal parsing kullanılıyor");
  const content = fs.readFileSync(scriptPath, "utf8");
  return parseScriptContent(content);
}
function parseScriptContent(content) {
  logger.log(`🔍 Parse başlıyor... Content length: ${content.length} karakter`);
  
  const recordsMap = {};
  const lines = content.split('\n');
  
  logger.log(`📝 Toplam satır sayısı: ${lines.length}`);
  
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
      logger.log(`📈 İşlenen satır: ${processedLines}/${lines.length}`);
    }
    
    // ESKİ ÇALIŞAN REGEX PATTERN
    const match = line.match(/INSERT INTO (\w+) VALUES\s*\((.*)\)$/);
    if (!match) {
      if (insertCount <= 5) {
        logger.warn(`⚠️ Regex eşleşmedi (satır ${i + 1}): ${line.substring(0, 100)}...`);
      }
      continue;
    }
    
    const table = match[1].toUpperCase();
    const valuesRaw = match[2];
    
    // MEVCUT parseValuesFromRaw FONKSİYONUNU KULLAN
    const values = parseValuesFromRaw(valuesRaw);
    
    if (!values || values.length === 0) {
      if (valuesParsed < 3) {
        logger.warn(`⚠️ VALUES parse edilemedi: ${valuesRaw.substring(0, 50)}...`);
      }
      continue;
    }
    
    valuesParsed++;
    
    if (valuesParsed <= 3) {
      logger.log(`✅ Parse başarılı (${table}):`, {
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
  
  logger.log(`✅ Parse tamamlandı:`, {
    totalLines: lines.length,
    processedLines: processedLines,
    insertCount: insertCount,
    valuesParsed: valuesParsed,
    uniqueApplications: result.length,
    successRate: insertCount > 0 ? ((valuesParsed / insertCount) * 100).toFixed(1) + '%' : '0%'
  });
  
  if (result.length > 0) {
    logger.log(`📋 İlk kayıt örneği:`, JSON.stringify(result[0], null, 2));
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
    logger.log(`📝 ${Math.min(i + batchSize, records.length)}/${records.length} kayıt yazıldı`);
  }
}

function getContentType(filePath) {
  if (/\.png$/i.test(filePath)) return "image/png";
  if (/\.jpe?g$/i.test(filePath)) return "image/jpeg";
  return "application/octet-stream";
}


//              ALGOLIA İLK İNDEKSLEME FONKSİYONU (v2 onRequest)
// =========================================================

exports.indexTrademarkBulletinRecords = onRequest(
  {
    region: 'europe-west1',
    timeoutSeconds: 540,
    memory: '2GiB'
  },
  async (req, res) => {
    logger.log('Algolia: trademarkBulletinRecords için toplu indeksleme başlatıldı.');
    let recordsToIndex = [];
    let lastDoc = null;
    const batchSize = 500;

    try {
      while (true) {
        let query = db.collection('trademarkBulletinRecords')
          .orderBy(admin.firestore.FieldPath.documentId())
          .limit(batchSize);

        if (lastDoc) query = query.startAfter(lastDoc);
        const snapshot = await query.get();
        if (snapshot.empty) break;

        const currentBatch = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            objectID: doc.id,
            markName: data.markName || null,
            applicationNo: data.applicationNo || null,
            applicationDate: data.applicationDate || null,
            niceClasses: data.niceClasses || null,
            bulletinId: data.bulletinId ? String(data.bulletinId) : null,
            holders: Array.isArray(data.holders) ? data.holders.map(h => h.name).join(', ') : '',
            imagePath: data.imagePath || null,
            createdAt: data.createdAt ? data.createdAt.toDate().getTime() : null
          };
        });

        recordsToIndex = recordsToIndex.concat(currentBatch);
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        logger.log(`Firestore'dan şu ana kadar ${recordsToIndex.length} belge okundu.`);

        if (snapshot.docs.length < batchSize) break;
      }

      logger.log(`Algolia'ya toplam ${recordsToIndex.length} belge gönderiliyor.`);
      const { objectIDs } = await algoliaIndex.saveObjects(recordsToIndex);
      logger.log(`Algolia'ya ${objectIDs.length} belge başarıyla eklendi/güncellendi.`);

      return res.status(200).send({
        status: 'success',
        message: `${objectIDs.length} belge Algolia'ya eklendi/güncellendi.`
      });
    } catch (error) {
      logger.error('Algolia indeksleme hatası:', error);
      return res.status(500).send({
        status: 'error',
        message: 'Algolia indeksleme sırasında bir hata oluştu.',
        error: error.message
      });
    }
  }
);

exports.onTrademarkBulletinRecordWrite = onDocumentWritten(
  {
    document: 'trademarkBulletinRecords/{recordId}',
    region: 'europe-west1',
  },
  async (change) => {
    const recordId = change.params.recordId;

    // Algolia client'ını fonksiyon içinde initialize et
    let algoliaClient, algoliaIndex;
    try {
      algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);
      algoliaIndex = algoliaClient.initIndex('trademark_bulletin_records_live');
      logger.log('Algolia client başarıyla initialize edildi.');
    } catch (error) {
      logger.error('Algolia client initialize edilemedi:', error);
      return null;
    }

    const oldData = change.data.before.exists ? change.data.before.data() : null;
    const newData = change.data.after.exists ? change.data.after.data() : null;

    // Silme durumu
    if (!change.data.after.exists) {
      logger.log(`Algolia: Belge silindi, kaldırılıyor: ${recordId}`);
      try {
        await algoliaIndex.deleteObject(recordId);
        logger.log(`Algolia: ${recordId} başarıyla kaldırıldı.`);
      } catch (error) {
        logger.error(`Algolia: Silme hatası: ${recordId}`, error);
      }
      return null;
    }

    // Ekleme veya güncelleme durumu
    if (newData) {
      logger.log(`Algolia: Belge indeksleniyor/güncelleniyor: ${recordId}`);
      const record = {
        objectID: recordId,
        markName: newData.markName || null,
        applicationNo: newData.applicationNo || null,
        applicationDate: newData.applicationDate || null,
        niceClasses: newData.niceClasses || null,
        bulletinId: newData.bulletinId ? String(newData.bulletinId) : null,
        holders: Array.isArray(newData.holders)
          ? newData.holders.map(h => h.name).join(', ')
          : '',
        imagePath: newData.imagePath || null,
        createdAt: newData.createdAt
          ? newData.createdAt.toDate().getTime()
          : null
      };

      try {
        await algoliaIndex.saveObject(record);
        logger.log(`Algolia: ${recordId} başarıyla indekslendi.`);
      } catch (error) {
        logger.error(`Algolia: İndeksleme hatası: ${recordId}`, error);
      }
    }

    return null;
  }
);

// BÜLTEN SİLME 
exports.deleteBulletinV2 = onCall(
  { timeoutSeconds: 540, 
    memory: "1GiB", 
    region: "europe-west1" },
  async (request) => {
  logger.log('🔥 Bülten silme başladı');

  const { bulletinId } = request.data;
  if (!bulletinId) throw new Error('BulletinId gerekli');

  try {
    // 1. Bülten dokümanını al
    const bulletinDoc = await db.collection('trademarkBulletins').doc(bulletinId).get();
    if (!bulletinDoc.exists) throw new Error('Bülten bulunamadı');

    const bulletinData = bulletinDoc.data();
    const bulletinNo = bulletinData.bulletinNo;
    logger.log(`📋 Silinecek bülten: ${bulletinNo}`);

    // 2. İlişkili trademarkBulletinRecords silme (500'erli chunk)
    let totalDeleted = 0;
    const recordsQuery = db.collection('trademarkBulletinRecords').where('bulletinId', '==', bulletinId);
    let snapshot = await recordsQuery.limit(500).get();

    while (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      totalDeleted += snapshot.size;
      logger.log(`✅ ${totalDeleted} kayıt silindi (toplam)`);

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
            logger.warn(`⚠️ ${file.name} silinemedi: ${err.message}`)
          )
        )
      );
      totalImagesDeleted += chunk.length;
      logger.log(`🖼️ ${totalImagesDeleted} görsel silindi (toplam)`);

      // Yeni listeleme (kalan dosya varsa)
      if (files.length === 0) {
        [files] = await storage.getFiles({ prefix });
      }
    }

    // 4. Ana bulletin dokümanını sil
    await bulletinDoc.ref.delete();
    logger.log('✅ Ana bülten silindi');

    return {
      success: true,
      bulletinNo,
      recordsDeleted: totalDeleted,
      imagesDeleted: totalImagesDeleted,
      message: `Bülten ${bulletenNo} ve ${totalImagesDeleted} görsel başarıyla silindi (${totalDeleted} kayıt)`
    };

  } catch (error) {
    logger.error('❌ Silme hatası:', error);
    return { success: false, error: error.message };
  }
});

// ======== Yardımcı Fonksiyonlar ve Algoritmalar (scorer.js, preprocess.js, visual-match.js, phonetic.js'ten kopyalandı) ========

// GENERIC_WORDS (preprocess.js'ten kopyalandı ve güncellendi)
const GENERIC_WORDS = [
    // ======== ŞİRKET TİPLERİ ========
    'ltd', 'şti', 'aş', 'anonim', 'şirketi', 'şirket', 'limited', 'inc', 'corp', 'corporation', 'co', 'company', 'llc', 'group', 'grup',

    // ======== TİCARİ SEKTÖRLER ========
    'sanayi', 'ticaret', 'turizm', 'tekstil', 'gıda', 'inşaat', 'danışmanlık', 'hizmet', 'hizmetleri', 'bilişim', 'teknoloji', 'sigorta', 'yayıncılık', 'mobilya', 'otomotiv', 'tarım', 'enerji', 'petrol', 'kimya', 'kozmetik', 'ilaç', 'medikal', 'sağlık', 'eğitim', 'spor', 'müzik', 'film', 'medya', 'reklam', 'pazarlama', 'lojistik', 'nakliyat', 'kargo', 'finans', 'bankacılık', 'emlak', 'gayrimenkul', 'madencilik', 'metal', 'plastik', 'cam', 'seramik', 'ahşap',

    // ======== MESLEKİ TERİMLER ========
    'mühendislik', 'proje', 'taahhüt', 'ithalat', 'ihracat', 'üretim', 'imalat', 'veteriner', 'petshop', 'polikliniği', 'hastane', 'klinik', 'müşavirlik', 'muhasebe', 'hukuk', 'avukatlık', 'mimarlık', 'peyzaj', 'tasarım', 'dizayn', 'design', 'grafik', 'web', 'yazılım', 'software', 'donanım', 'hardware', 'elektronik', 'elektrik', 'makina', 'makine', 'endüstri', 'fabrika', 'laboratuvar', 'araştırma', 'geliştirme', 'ofis', 

    // ======== ÜRÜN/HİZMET TERİMLERİ ========
    'ürün', 
    'products', 'services', 'solutions', 'çözüm', 
    'sistem', 'systems', 'teknolojileri', 'teknoloji', 
    'malzeme', 'materials', 'ekipman', 'equipment', 'cihaz', 'device', 'araç', 'tools', 'yedek', 'parça', 'parts', 'aksesuar', 'accessories', 'gereç', 'malzeme',

    // ======== GENEL MARKALAŞMA TERİMLERİ ========
    'meşhur', 'ünlü', 'famous', 'since', 'est', 'established', 'tarihi', 'historical', 'geleneksel', 'traditional', 'klasik', 'classic', 'yeni', 'new', 'fresh', 'taze', 'özel', 'special', 'premium', 'lüks', 'luxury', 'kalite', 
    'quality', 'uygun', 

    // ======== LOKASYON TERİMLERİ ========
    'turkey', 'türkiye', 'international', 'uluslararası',

    // ======== EMLAK TERİMLERİ ========
    'realestate', 'emlak', 'konut', 'housing', 'arsa', 'ticari', 'commercial', 'ofis', 'office', 'plaza', 'shopping', 'alışveriş', 'residence', 'rezidans', 'villa', 'apartment', 'daire',

    // ======== DİJİTAL TERİMLERİ ========
    'online', 'digital', 'dijital', 'internet', 'web', 'app', 'mobile', 'mobil', 'network', 'ağ', 'server', 'sunucu', 'hosting', 'domain', 'platform', 'social', 'sosyal', 'media', 'medya',

    // ======== GIDA TERİMLERİ ========
    'gıda', 'food', 'yemek', 'restaurant', 'restoran', 'cafe', 'kahve', 'coffee', 'çay', 'tea', 'fırın', 'bakery', 'ekmek', 'bread', 'pasta', 'börek', 'pizza', 'burger', 'kebap', 'döner', 'pide', 'lahmacun', 'balık', 'fish', 'et', 'meat', 'tavuk', 'chicken', 'sebze', 'vegetable', 'meyve', 'fruit', 'süt', 'milk', 'peynir', 'cheese', 'yoğurt', 'yogurt', 'dondurma', 'şeker', 'sugar', 'bal', 'reçel', 'jam', 'konserve', 'canned', 'organic', 'organik', 'doğal', 'natural', 'taze', 'fresh',

    // ======== WEB/URL TERİMLERİ ========
    'www', 'http', 'https', 'com', 'net', 'org', 'tr', 'info', 'biz', 'edu', 'gov',

    // ======== BAĞLAÇLAR ve Yaygın Kelimeler ========
    've', 
    'ile', 'için', 'bir', 'bu', 'da', 'de', 'ki', 'mi', 'mı', 'mu', 'mü', 
    'sadece', 'tek', 'en', 'çok', 'az', 'üst', 'alt', 'yeni', 'eski'
];

// Helper for stemming (preprocess.js'ten kopyalandı ve geliştirildi)
function removeTurkishSuffixes(word) {
    if (!word) return '';
    
    // Basit çoğul ekleri: -ler, -lar
    if (word.endsWith('ler') || word.endsWith('lar')) {
        return word.substring(0, word.length - 3);
    }
    // Basit iyelik ekleri (3. tekil/çoğul şahıs): -si, -sı, -sü, -su, -i, -ı, -ü, -u
    if (word.length > 2 && (word.endsWith('si') || word.endsWith('sı') || word.endsWith('sü') || word.endsWith('su'))) {
        return word.substring(0, word.length - 2);
    }
    if (word.length > 1 && (word.endsWith('i') || word.endsWith('ı') || word.endsWith('u') || word.endsWith('ü'))) {
        // 'gıda' gibi kelimelerde 'ı' son ek olmayabilir, bu yüzden dikkatli olmak gerek.
        // Daha güvenli bir kontrol için kelime kökünün anlamı kontrol edilebilir ancak bu basit bir stemmer.
        return word.substring(0, word.length - 1);
    }
    
    return word;
}

// preprocess.js'ten kopyalandı ve geliştirildi
function cleanMarkName(name, removeGenericWords = true) {
    if (!name) return '';
    let cleaned = name.toLowerCase().replace(/[^a-z0-9ğüşöçı\s]/g, '').trim(); 

    cleaned = cleaned.replace(/\s+/g, ' ');

    if (removeGenericWords) {
        cleaned = cleaned.split(' ').filter(word => {
            const stemmedWord = removeTurkishSuffixes(word);
            // Kök kelime veya orijinal kelime stopwords listesinde mi kontrol et
            return !GENERIC_WORDS.includes(stemmedWord) && !GENERIC_WORDS.includes(word);
        }).join(' ');
    }

    return cleaned.trim();
}

// visual-match.js'ten kopyalandı
const visualMap = {
    "a": ["e", "o"], "b": ["d", "p"], "c": ["ç", "s"], "ç": ["c", "s"], "d": ["b", "p"], "e": ["a", "o"], "f": ["t"],
    "g": ["ğ", "q"], "ğ": ["g", "q"], "h": ["n"], "i": ["l", "j", "ı"], "ı": ["i"], "j": ["i", "y"], "k": ["q", "x"],
    "l": ["i", "1"], "m": ["n"], "n": ["m", "r"], "o": ["a", "0", "ö"], "ö": ["o"], "p": ["b", "q"], "q": ["g", "k"],
    "r": ["n"], "s": ["ş", "c", "z"], "ş": ["s", "z"], "t": ["f"], "u": ["ü", "v"], "ü": ["u", "v"], "v": ["u", "ü", "w"],
    "w": ["v"], "x": ["ks"], "y": ["j"], "z": ["s", "ş"], "0": ["o"], "1": ["l", "i"], "ks": ["x"], "Q": ["O","0"],
    "O": ["Q", "0"], "I": ["l", "1"], "L": ["I", "1"], "Z": ["2"], "S": ["5"], "B": ["8"], "D": ["O"]
};

function visualMismatchPenalty(a, b) {
    if (!a || !b) return 5; 

    const lenDiff = Math.abs(a.length - b.length);
    const minLen = Math.min(a.length, b.length);
    let penalty = lenDiff * 0.5;

    for (let i = 0; i < minLen; i++) {
        const ca = a[i].toLowerCase();
        const cb = b[i].toLowerCase();

        if (ca !== cb) {
            if (visualMap[ca] && visualMap[ca].includes(cb)) { 
                penalty += 0.25;
            } else {
                penalty += 1.0; 
            }
        }
    }
    return penalty;
}

// phonetic.js'ten kopyalandı
function normalizeString(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .replace(/[^a-z0-9ğüşöçı]/g, '')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/ı/g, 'i');
}

function isPhoneticallySimilar(a, b) {
    if (!a || !b) return 0.0;

    a = normalizeString(a);
    b = normalizeString(b);

    if (a === b) return 1.0;

    const lenA = a.length;
    const lenB = b.length;
    const minLen = Math.min(lenA, lenB);
    const maxLen = Math.max(lenA, lenB);

    if (maxLen === 0) return 1.0;
    if (maxLen > 0 && minLen === 0) return 0.0;

    const lengthMismatchPenalty = Math.abs(lenA - lenB) / maxLen;
    let score = 1.0 - lengthMismatchPenalty;

    let matchingChars = 0;
    const matchedA = new Array(lenA).fill(false);
    const matchedB = new Array(lenB).fill(false);

    const searchRange = Math.min(maxLen, Math.floor(maxLen / 2) + 1);
    for (let i = 0; i < lenA; i++) {
        for (let j = Math.max(0, i - searchRange); j < Math.min(lenB, i + searchRange + 1); j++) {
            if (a[i] === b[j] && !matchedB[j]) {
                matchingChars++;
                matchedA[i] = true;
                matchedB[j] = true;
                break;
            }
        }
    }

    if (matchingChars === 0) return 0.0;

    const commonality = matchingChars / Math.max(lenA, lenB);
    
    let positionalBonus = 0;
    if (lenA > 0 && lenB > 0) {
        if (a[0] === b[0]) positionalBonus += 0.2;
        if (lenA > 1 && lenB > 1 && a[1] === b[1]) positionalBonus += 0.1;
    }

    score = (commonality * 0.7) + (positionalBonus * 0.3);

    return Math.max(0.0, Math.min(1.0, score));
}

// filters.js'ten kopyalandı
function parseDate(value) {
  if (!value) return null;
  // dd/MM/yyyy formatı desteği
  const parts = value.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; 
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  return new Date(value); // ISO uyumlu ise
}

function isValidBasedOnDate(recordApplicationDate, monitoredApplicationDate) {
  if (!recordApplicationDate || !monitoredApplicationDate) return true;

  const hit = parseDate(recordApplicationDate);
  const monitored = parseDate(monitoredApplicationDate);

  if (!hit || !monitored || isNaN(hit.getTime()) || isNaN(monitored.getTime())) return true; // getTime() ile geçerli tarih kontrolü

  return hit >= monitored;
}

function hasOverlappingNiceClasses(monitoredNiceClasses, recordNiceClasses) {
    if (!Array.isArray(monitoredNiceClasses) || monitoredNiceClasses.length === 0) {
        return true; 
    }
    if (!Array.isArray(recordNiceClasses) || recordNiceClasses.length === 0) {
        return false; 
    }

    return monitoredNiceClasses.some(cls => recordNiceClasses.includes(cls));
}

// ======== Ana Benzerlik Skorlama Fonksiyonu (scorer.js'ten kopyalandı) ========

function levenshteinSimilarity(str1, str2) {
    const matrix = [];
    if (str1.length === 0) return str2.length === 0 ? 1.0 : 0.0;
    if (str2.length === 0) return str1.length === 0 ? 1.0 : 0.0;

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            const cost = str2.charAt(i - 1) === str1.charAt(j - 1) ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j - 1] + cost, // substitution
                matrix[i][j - 1] + 1,     // insertion
                matrix[i - 1][j] + 1      // deletion
            );
        }
    }
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1.0 : 1.0 - (matrix[str2.length][str1.length] / maxLength);
}

function jaroWinklerSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;

    let m = 0; // matching characters
    const s1_len = s1.length;
    const s2_len = s2.length;

    const range = Math.floor(Math.max(s1_len, s2_len) / 2) - 1;
    const s1_matches = new Array(s1_len);
    const s2_matches = new Array(s2_len);

    for (let i = 0; i < s1_len; i++) {
        const char_s1 = s1[i];
        for (let j = Math.max(0, i - range); j < Math.min(s2_len, i + range + 1); j++) {
            if (char_s1 === s2[j] && !s2_matches[j]) {
                s1_matches[i] = true;
                s2_matches[j] = true;
                m++;
                break;
            }
        }
    }

    if (m === 0) return 0.0;

    let k = 0;
    let t = 0; // transpositions
    for (let i = 0; i < s1_len; i++) {
        if (s1_matches[i]) {
            let j;
            for (j = k; j < s2_len; j++) {
                if (s2_matches[j]) {
                    k = j + 1;
                    break;
                }
            }
            if (s1[i] !== s2[j]) {
                t++;
            }
        }
    }
    t = t / 2;

    const jaro_score = (m / s1_len + m / s2_len + (m - t) / m) / 3;

    const p = 0.1; 
    let l = 0; 
    const max_prefix_len = 4; 

    for (let i = 0; i < Math.min(s1_len, s2_len, max_prefix_len); i++) {
        if (s1[i] === s2[i]) {
            l++;
        } else {
            break;
        }
    }

    return jaro_score + l * p * (1 - jaro_score);
}

function ngramSimilarity(s1, s2, n = 2) {
    if (!s1 || !s2) return 0.0;
    if (s1 === s2) return 1.0;

    const getNGrams = (s, num) => {
        const ngrams = new Set();
        for (let i = 0; i <= s.length - num; i++) {
            ngrams.add(s.substring(i, i + num));
        }
        return ngrams;
    };

    const ngrams1 = getNGrams(s1, n);
    const ngrams2 = getNGrams(s2, n);

    if (ngrams1.size === 0 && ngrams2.size === 0) return 1.0;
    if (ngrams1.size === 0 || ngrams2.size === 0) return 0.0;

    let common = 0;
    ngrams1.forEach(ngram => {
        if (ngrams2.has(ngram)) {
            common++;
        }
    });

    return common / Math.min(ngrams1.size, ngrams2.size);
}

function prefixSimilarity(s1, s2, length = 3) {
    if (!s1 || !s2) return 0.0;
    const prefix1 = s1.substring(0, Math.min(s1.length, length));
    const prefix2 = s2.substring(0, Math.min(s2.length, length));

    if (prefix1 === prefix2) return 1.0;
    if (prefix1.length === 0 && prefix2.length === 0) return 1.0;

    return levenshteinSimilarity(prefix1, prefix2);
}

function maxWordSimilarity(s1, s2) {
    if (!s1 || !s2) return 0.0;

    const words1 = s1.split(' ').filter(w => w.length > 0);
    const words2 = s2.split(' ').filter(w => w.length > 0);

    if (words1.length === 0 && words2.length === 0) return 1.0;
    if (words1.length === 0 || words2.length === 0) return 0.0;

    let maxSim = 0.0;
    for (const w1 of words1) {
        for (const w2 of words2) {
            maxSim = Math.max(maxSim, levenshteinSimilarity(w1, w2));
        }
    }
    return maxSim;
}


function calculateSimilarityScoreInternal(hitMarkName, searchMarkName, hitApplicationDate, searchApplicationDate, hitNiceClasses, searchNiceClasses) {
    const isSearchMultiWord = searchMarkName.trim().split(/\s+/).length > 1;
    const isHitMultiWord = (hitMarkName || '').trim().split(/\s+/).length > 1;

    const cleanedSearchName = cleanMarkName(searchMarkName || '', isSearchMultiWord).toLowerCase().trim();
    const cleanedHitName = cleanMarkName(hitMarkName || '', isHitMultiWord).toLowerCase().trim();

    logger.log(`📊 Skorlama: '${searchMarkName}' (temizlenmiş: '${cleanedSearchName}') vs '${hitMarkName}' (temizlenmiş: '${cleanedHitName}')`);

    if (!cleanedSearchName || !cleanedHitName) {
        return 0.0;
    }

    if (cleanedSearchName === cleanedHitName) {
        return 1.0;
    }

    const levenshteinScore = levenshteinSimilarity(cleanedSearchName, cleanedHitName);
    logger.log(`   - Levenshtein Score: ${levenshteinScore.toFixed(2)}`);

    const jaroWinklerScore = jaroWinklerSimilarity(cleanedSearchName, cleanedHitName);
    logger.log(`   - Jaro-Winkler Score: ${jaroWinklerScore.toFixed(2)}`);

    const ngramScore = ngramSimilarity(cleanedSearchName, cleanedHitName, 2);
    logger.log(`   - N-gram Score (n=2): ${ngramScore.toFixed(2)}`);

    const visualPenalty = visualMismatchPenalty(cleanedSearchName, cleanedHitName);
    const maxPossibleVisualPenalty = Math.max(cleanedSearchName.length, cleanedHitName.length) * 1.0;
    const visualScore = maxPossibleVisualPenalty === 0 ? 1.0 : (1.0 - (visualPenalty / maxPossibleVisualPenalty));
    logger.log(`   - Visual Score: ${visualScore.toFixed(2)}`);

    const prefixScore = prefixSimilarity(cleanedSearchName, cleanedHitName, 3);
    logger.log(`   - Prefix Score (len 3): ${prefixScore.toFixed(2)}`);

    const maxWordScore = maxWordSimilarity(cleanedSearchName, cleanedHitName);
    logger.log(`   - Max Word Score: ${maxWordScore.toFixed(2)}`);

    // ======== YENİ KURAL: Yüksek Kelime Benzerliği Kontrolü ve Önceliklendirme ========
    const HIGH_WORD_SIMILARITY_THRESHOLD = 0.70; 

    if (maxWordScore >= HIGH_WORD_SIMILARITY_THRESHOLD) {
        logger.log(`   *** Yüksek kelime bazında benzerlik tespit edildi (${(maxWordScore * 100).toFixed(0)}%), doğrudan skor olarak kullanılıyor. ***`);
        return maxWordScore; 
    }

    const nameSimilarityRaw = (
        levenshteinScore * 0.30 +
        jaroWinklerScore * 0.25 +
        ngramScore * 0.15 +
        visualScore * 0.15 +
        prefixScore * 0.10 +
        maxWordScore * 0.05 
    );

    const nameSimilarityWeighted = nameSimilarityRaw * 0.95;
    logger.log(`   - Name Similarity (weighted 95%): ${nameSimilarityWeighted.toFixed(2)}`);

    const phoneticScoreRaw = isPhoneticallySimilar(searchMarkName, hitMarkName); 
    const phoneticSimilarityWeighted = phoneticScoreRaw * 0.05;
    logger.log(`   - Phonetic Score (weighted 5%): ${phoneticSimilarityWeighted.toFixed(2)}`);

    let finalScore = nameSimilarityWeighted + phoneticSimilarityWeighted;

    finalScore = Math.max(0.0, Math.min(1.0, finalScore));

    logger.log(`   - FINAL SCORE: ${finalScore.toFixed(2)}\n`);
    return finalScore;
}


// ======== Yeni Cloud Function: Sunucu Tarafında Toplu Marka Benzerliği Araması ========

exports.performTrademarkSimilaritySearch = onCall(
    {
        region: 'europe-west1',
        timeoutSeconds: 300, 
        memory: '1GB' 
    },
    async (request) => {
        const { monitoredMarks, selectedBulletinId } = request.data; 

        if (!Array.isArray(monitoredMarks) || monitoredMarks.length === 0 || !selectedBulletinId) {
            throw new HttpsError('invalid-argument', 'Missing required parameters: monitoredMarks (array) or selectedBulletinId');
        }

        logger.log('🚀 Cloud Function: performTrademarkSimilaritySearch başlatıldı (toplu arama)', { 
            numMonitoredMarks: monitoredMarks.length, 
            selectedBulletinId 
        });

        const trademarkRecordsRef = db.collection('trademarkBulletinRecords');
        const allResults = []; 

        try {
            const bulletinRecordsSnapshot = await trademarkRecordsRef
                .where('bulletinId', '==', selectedBulletinId)
                .get();

            const bulletinRecords = bulletinRecordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            logger.log(`✅ ${bulletinRecords.length} adet trademarkBulletinRecords bulundu (bülten ID'ye göre filtrelendi).`);

            for (const monitoredMark of monitoredMarks) {
                const { id: monitoredMarkId, markName, applicationDate, niceClasses } = monitoredMark; // id'yi de alıyoruz

                if (!markName) {
                    logger.warn(`⚠️ İzlenen markanın adı eksik. Atlanıyor: ${JSON.stringify(monitoredMark)}`);
                    continue;
                }

                logger.log(`🔎 İzlenen marka için arama: '${markName}' (ID: ${monitoredMarkId})`);
                
                for (const hit of bulletinRecords) {
                    const isDateValid = isValidBasedOnDate(hit.applicationDate, applicationDate);
                    if (!isDateValid) {
                        continue;
                    }

                    const hasNiceClassOverlap = hasOverlappingNiceClasses(niceClasses, hit.niceClasses);
                    if (niceClasses && Array.isArray(niceClasses) && niceClasses.length > 0 && !hasNiceClassOverlap) {
                        continue;
                    }

                    const similarityScore = calculateSimilarityScoreInternal(
                        hit.markName, 
                        markName, 
                        hit.applicationDate, 
                        applicationDate, 
                        hit.niceClasses, 
                        niceClasses
                    );

                    const SIMILARITY_THRESHOLD = 0.3; 
                    if (similarityScore < SIMILARITY_THRESHOLD) {
                        continue;
                    }

                    allResults.push({
                        objectID: hit.id,
                        markName: hit.markName,
                        applicationNo: hit.applicationNo,
                        applicationDate: hit.applicationDate,
                        niceClasses: hit.niceClasses,
                        holders: hit.holders,
                        imagePath: hit.imagePath,
                        bulletinId: hit.bulletinId,
                        similarityScore: similarityScore,
                        sameClass: hasNiceClassOverlap,
                        monitoredTrademark: markName, 
                        monitoredNiceClasses: niceClasses,
                        monitoredMarkId: monitoredMarkId // Hangi monitoredMark'tan geldiğini belirtiyoruz
                    });
                }
            }
            
            allResults.sort((a, b) => b.similarityScore - a.similarityScore);

            logger.log(`✅ Cloud Function: Toplam ${allResults.length} sonuç döndürüyor.`);
            return { success: true, results: allResults };

        } catch (error) {
            logger.error('❌ Cloud Function: performTrademarkSimilaritySearch hatası:', error);
            throw new HttpsError('internal', 'Marka benzerliği araması sırasında bir hata oluştu.', error.message);
        }
    }
);