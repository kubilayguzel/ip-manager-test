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
const algoliasearch = require('algoliasearch'); // Algolia SDK'sı
const { PubSub } = require('@google-cloud/pubsub'); // Pub/Sub mesajı yayınlamak için

// Firebase Admin SDK'sını başlatın
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const pubsubClient = new PubSub(); // pubsubClient'ı burada tanımlayın

// **************************** ALGOLIA YAPILANDIRMASI ****************************
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
exports.processTrademarkBulletinUploadV2 = onRequest(
    {
        region: 'europe-west1',
        timeoutSeconds: 540,
        memory: '1GiB',
    },
    async (req, res) => {
        const tempDir = path.join(os.tmpdir(), `bulletin_${Date.now()}`);
        let extractDir = null;

        try {
            console.log('📁 Dosya işleme başlatıldı...');
            
            // Multipart dosya okuma
            const buffer = Buffer.concat(req.rawBody || []);
            if (!buffer || buffer.length === 0) {
                throw new Error("Dosya verisi bulunamadı.");
            }

            const tempFilePath = path.join(tempDir, "uploaded_file");
            fs.mkdirSync(tempDir, { recursive: true });
            fs.writeFileSync(tempFilePath, buffer);

            console.log(`📦 Dosya kaydedildi: ${buffer.length} bytes`);

            // Dosya tipini kontrol et ve extract işlemi
            extractDir = path.join(tempDir, "extracted");
            fs.mkdirSync(extractDir, { recursive: true });

            console.log('🔓 Dosya extract ediliyor...');
            
            if (tempFilePath.toLowerCase().endsWith('.zip')) {
                const zip = new AdmZip(tempFilePath);
                zip.extractAllTo(extractDir, true);
                console.log('✅ ZIP dosyası extract edildi');
            } else {
                // RAR dosyası
                const extractor = await createExtractorFromFile({
                    filepath: tempFilePath,
                    targetPath: extractDir,
                });
                
                if (!extractor) {
                    throw new Error("RAR extractor oluşturulamadı.");
                }
                await extractor.extractAll(extractDir);
                console.log('✅ RAR dosyası extract edildi');
            }

            // Bulletin info okuma
            console.log('📄 Bulletin bilgileri okunuyor...');
            const allFiles = listAllFilesRecursive(extractDir);
            const bulletinPath = allFiles.find((p) =>
                ["bulletin.inf", "bulletin"].includes(path.basename(p).toLowerCase())
            );
            if (!bulletinPath) throw new Error("bulletin.inf bulunamadı.");

            const content = fs.readFileSync(bulletinPath, "utf8");
            const bulletinNo = (content.match(/NO\s*=\s*(.*)/) || [])[1]?.trim() || "Unknown";
            const bulletinDate = (content.match(/DATE\s*=\s*(.*)/) || [])[1]?.trim() || "Unknown";

            console.log(`📋 Bulletin bilgisi: ${bulletinNo} - ${bulletinDate}`);

            // Firestore'a bulletin kaydı
            const bulletinRef = await db.collection("trademarkBulletins").add({
                bulletinNo,
                bulletinDate,
                type: "marka",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            const bulletinId = bulletinRef.id;
            console.log(`✅ Bulletin Firestore'a kaydedildi: ${bulletinId}`);

            // Script content parse (STREAMING)
            console.log('📄 Script content streaming ile parse ediliyor...');
            const scriptPath = allFiles.find((p) => path.basename(p).toLowerCase() === "tmbulletin.log");
            if (!scriptPath) throw new Error("tmbulletin.log bulunamadı.");

            const scriptContent = fs.readFileSync(scriptPath, "utf8");
            console.log(`📊 Script content boyutu: ${scriptContent.length} characters`);
            
            const records = parseScriptContent(scriptContent); // ← STREAMING PARSING
            console.log(`✅ Parse tamamlandı: ${records.length} kayıt`);

            // Görselleri applicationNo'ya göre eşle
            console.log('🖼️ Görseller eşleniyor...');
            const imageFiles = allFiles.filter((p) => /\.(jpg|jpeg|png)$/i.test(p));
            const imagePathMap = {};
            
            // Storage'a görsel yükleme ve path mapping
            const bucket = admin.storage().bucket();
            let uploadedImages = 0;
            
            for (const localPath of imageFiles) {
                const filename = path.basename(localPath);
                const destinationPath = `bulletins/trademark_${bulletinNo}_images/${filename}`;

                try {
                    // Storage'a yükle
                    await bucket.upload(localPath, {
                        destination: destinationPath,
                        metadata: {
                            contentType: getContentType(localPath),
                        },
                    });
                    
                    uploadedImages++;
                    
                    // ApplicationNo ile eşle
                    const match = filename.match(/^(\d{4})[_\-]?(\d{5,})/);
                    if (match) {
                        const appNo = `${match[1]}/${match[2]}`;
                        if (!imagePathMap[appNo]) imagePathMap[appNo] = [];
                        imagePathMap[appNo].push(destinationPath);
                    }
                    
                    if (uploadedImages % 100 === 0) {
                        console.log(`📤 ${uploadedImages}/${imageFiles.length} görsel yüklendi`);
                    }
                } catch (uploadError) {
                    console.error(`❌ Görsel yükleme hatası (${filename}):`, uploadError.message);
                }
            }
            
            console.log(`✅ ${uploadedImages} görsel Storage'a yüklendi`);

            // Kayıtlara görsel yolu ekle ve BulletinId ata
            console.log('🔗 Kayıtlar hazırlanıyor...');
            for (const record of records) {
                record.bulletinId = bulletinId;
                const matchingImages = imagePathMap[record.applicationNo] || [];
                record.imagePath = matchingImages.length > 0 ? matchingImages[0] : null;
            }

            // Batch processing ile Firestore'a kaydetme
            console.log('💾 Kayıtlar Firestore\'a kaydediliyor...');
            const batchSize = 100; // Firestore için optimum batch size
            let savedCount = 0;
            
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                const promises = batch.map(record => {
                    return db.collection("trademarkBulletinRecords").add(record);
                });
                
                await Promise.all(promises);
                savedCount += batch.length;
                
                console.log(`💾 ${savedCount}/${records.length} kayıt Firestore'a kaydedildi (${(savedCount/records.length*100).toFixed(1)}%)`);
                
                // Memory temizliği
                if (global.gc && savedCount % 500 === 0) {
                    global.gc();
                    console.log('🧹 Memory temizliği yapıldı');
                }
            }

            // Cleanup temp files
            console.log('🧹 Geçici dosyalar temizleniyor...');
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }

            console.log('🎉 İşlem başarıyla tamamlandı!');

            return res.status(200).send({
                success: true,
                message: `Bulletin başarıyla işlendi: ${savedCount} kayıt, ${uploadedImages} görsel yüklendi.`,
                bulletinId,
                bulletinNo,
                bulletinDate,
                totalRecords: savedCount,
                totalImages: uploadedImages,
                processingStats: {
                    parsed: records.length,
                    saved: savedCount,
                    images: uploadedImages
                }
            });

        } catch (error) {
            console.error("❌ Processing hatası:", error);
            
            // Cleanup on error
            if (extractDir && fs.existsSync(extractDir)) {
                fs.rmSync(extractDir, { recursive: true, force: true });
            }
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }

            return res.status(500).send({
                success: false,
                error: `Processing hatası: ${error.message}`,
                stack: error.stack
            });
        }
    }
);

// =========================================================
//              PUB/SUB TRIGGER FONKSİYONLARI (v2)
// =========================================================

// Upload Image Worker (v2 Pub/Sub Trigger)
exports.uploadImageWorkerV2 = onMessagePublished(
    {
        topic: "trademark-image-upload",
        region: 'europe-west1',
        timeoutSeconds: 300,
        memory: '512MiB'
    },
    async (event) => {
        console.log('🔥 uploadImageWorker tetiklendi (Batch)...');

        let images;
        try {
            const batchData = Buffer.from(event.data.message.data, 'base64').toString();
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
    }
);

// =========================================================
//              HELPER FONKSİYONLARI
// =========================================================

function listAllFilesRecursive(dir) {
    const files = [];
    
    function traverse(currentDir) {
        const items = fs.readdirSync(currentDir);
        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                traverse(fullPath);
            } else {
                files.push(fullPath);
            }
        }
    }
    
    traverse(dir);
    return files;
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

function parseScriptContent(content) {
    console.log('🚀 Streaming parsing başlatıldı...');
    
    const recordsMap = {};
    let processedLines = 0;
    let totalLines = 0;
    
    // İlk geçiş: Toplam satır sayısını hesapla (memory efficient)
    for (let i = 0; i < content.length; i++) {
        if (content[i] === '\n') {
            totalLines++;
        }
    }
    console.log(`📊 Toplam satır sayısı: ${totalLines}`);
    
    // İkinci geçiş: Streaming processing
    const CHUNK_SIZE = 200000; // 200KB chunks
    let currentPos = 0;
    let lineBuffer = '';
    
    while (currentPos < content.length) {
        // Chunk okuma
        const chunkEnd = Math.min(currentPos + CHUNK_SIZE, content.length);
        const chunk = content.slice(currentPos, chunkEnd);
        
        // Son satırı tamamla
        lineBuffer += chunk;
        const lines = lineBuffer.split('\n');
        
        // Son satırı sonraki chunk için sakla
        lineBuffer = lines.pop() || '';
        
        // Chunk'taki satırları işle
        for (const line of lines) {
            processedLines++;
            
            // Progress log
            if (processedLines % 5000 === 0) {
                console.log(`📈 İşlenen: ${processedLines}/${totalLines} (${(processedLines/totalLines*100).toFixed(1)}%)`);
                
                // Memory temizliği için
                if (global.gc) {
                    global.gc();
                }
            }
            
            // Satır işleme
            const trimmedLine = line.trim();
            if (!trimmedLine.length || !trimmedLine.startsWith('INSERT INTO')) {
                continue;
            }
            
            const match = trimmedLine.match(/INSERT INTO (\w+) VALUES\s*\((.*)\)$/);
            if (!match) continue;
            
            const table = match[1].toUpperCase();
            const values = parseValues(match[2]);
            
            const appNo = values[0];
            if (!appNo) continue;

            // RecordsMap'e ekleme
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
        
        currentPos = chunkEnd;
    }
    
    // Son kalan satırı işle
    if (lineBuffer.trim()) {
        processedLines++;
        const trimmedLine = lineBuffer.trim();
        if (trimmedLine.startsWith('INSERT INTO')) {
            const match = trimmedLine.match(/INSERT INTO (\w+) VALUES\s*\((.*)\)$/);
            if (match) {
                const table = match[1].toUpperCase();
                const values = parseValues(match[2]);
                const appNo = values[0];
                
                if (appNo && !recordsMap[appNo]) {
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
                
                // Table processing logic aynı...
                if (appNo) {
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
            }
        }
    }
    
    console.log(`✅ Streaming parsing tamamlandı: ${processedLines} satır, ${Object.keys(recordsMap).length} kayıt`);
    
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
//              ALGOLIA İLK İNDEKSLEME FONKSİYONU (v2 onRequest)
// =========================================================

// DÜZELTME 1: indexTrademarkBulletinRecords - Streaming Algolia Transfer
exports.indexTrademarkBulletinRecords = onRequest(
  {
    region: 'europe-west1',
    timeoutSeconds: 540,
    memory: '2GiB' // Güvenlik için biraz artırıldı
  },
  async (req, res) => {
    console.log('Algolia: trademarkBulletinRecords için streaming indeksleme başlatıldı.');
    
    let totalProcessed = 0;
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

        // Batch'i hazırla
        const currentBatch = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            objectID: doc.id,
            markName: data.markName || null,
            applicationNo: data.applicationNo || null,
            applicationDate: data.applicationDate || null,
            niceClasses: data.niceClasses || null,
            bulletinId: String(data.bulletinId || ''), // ← STRING GARANTİSİ!
            holders: Array.isArray(data.holders) 
              ? data.holders.map(h => h.name).join(', ') 
              : '',
            imagePath: data.imagePath || null,
            createdAt: data.createdAt 
              ? data.createdAt.toDate().getTime() 
              : null
          };
        });

        // ✅ HEMEN ALGOLIA'YA GÖNDER (Memory'de biriktirme!)
        console.log(`📤 ${currentBatch.length} kayıt Algolia'ya gönderiliyor...`);
        const { objectIDs } = await algoliaIndex.saveObjects(currentBatch);
        
        totalProcessed += currentBatch.length;
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        
        console.log(`✅ Toplam ${totalProcessed} kayıt işlendi`);
        
        // Memory temizliği
        currentBatch.length = 0;
        
        if (snapshot.docs.length < batchSize) break;
      }

      console.log(`🎉 Streaming transfer tamamlandı: ${totalProcessed} kayıt`);
      
      return res.status(200).send({
        status: 'success',
        message: `${totalProcessed} kayıt streaming ile Algolia'ya başarıyla transfer edildi.`,
        totalRecords: totalProcessed
      });
      
    } catch (error) {
      console.error('❌ Streaming Algolia transfer hatası:', error);
      return res.status(500).send({
        status: 'error',
        message: 'Streaming transfer sırasında hata oluştu.',
        error: error.message,
        processedSoFar: totalProcessed
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
      console.log('Algolia client başarıyla initialize edildi.');
    } catch (error) {
      console.error('Algolia client initialize edilemedi:', error);
      return null;
    }

    const oldData = change.data.before.exists ? change.data.before.data() : null;
    const newData = change.data.after.exists ? change.data.after.data() : null;

    // Silme durumu
    if (!change.data.after.exists) {
      console.log(`Algolia: Belge silindi, kaldırılıyor: ${recordId}`);
      try {
        await algoliaIndex.deleteObject(recordId);
        console.log(`Algolia: ${recordId} başarıyla kaldırıldı.`);
      } catch (error) {
        console.error(`Algolia: Silme hatası: ${recordId}`, error);
      }
      return null;
    }

    // Ekleme veya güncelleme durumu
    if (newData) {
      console.log(`Algolia: Belge indeksleniyor/güncelleniyor: ${recordId}`);
      const record = {
        objectID: recordId,
        markName: newData.markName || null,
        applicationNo: newData.applicationNo || null,
        applicationDate: newData.applicationDate || null,
        niceClasses: newData.niceClasses || null,
        bulletinId: String(newData.bulletinId || ''),
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
        console.log(`Algolia: ${recordId} başarıyla indekslendi.`);
      } catch (error) {
        console.error(`Algolia: İndeksleme hatası: ${recordId}`, error);
      }
    }

    return null;
  }
);
exports.deleteBulletin = onCall(async (req) => {
  const { bulletinId } = req.data;

  if (!bulletinId) {
    throw new functions.https.HttpsError('invalid-argument', 'bulletinId is required');
  }

  // 1. Firestore kayıtları
  const snapshot = await db.collection('trademarkBulletinRecords')
                           .where('bulletinId', '==', bulletinId)
                           .get();
  const batch = db.batch();
  snapshot.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  // 2. Algolia kayıtları
  await index.deleteBy({ filters: `bulletinId:"${bulletinId}"` });

  // 3. Storage görselleri
  const [files] = await bucket.getFiles({ prefix: `bulletins/trademark_${bulletinId}_images/` });
  await Promise.all(files.map(file => file.delete()));

  return { success: true, deleted: snapshot.size, files: files.length };
});
