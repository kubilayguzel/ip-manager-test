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
const { onRequest, onCall } = require('firebase-functions/v2/https'); // HTTPS fonksiyonları için v2 importu
const { onSchedule } = require('firebase-functions/v2/scheduler'); // Scheduler triggerları için v2 importu
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore'); // Firestore triggerları için v2 importu
const { onPublish } = require('firebase-functions/v2/pubsub'); // Pub/Sub fonksiyonları için v2 importu
const { onObjectFinalized } = require('firebase-functions/v2/storage'); // Storage triggerları için v2 importu

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
// Kendi Algolia Uygulama ID'niz ve Yönetici API Anahtarınız ile güncelleyin
// Bu değerler functions:config:set ile ayarlanmalıdır.
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

// =========================================================
//              HTTPS FONKSİYONLARI (v2)
// =========================================================

// ETEBS API Proxy Function (v2 sözdizimi)
exports.etebsProxy = onRequest(
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

// Send Email Notification (v2 Callable Function)
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "kubilayguzel@evrekapatent.com",
      pass: "rqvl tpbm vkmu lmxi" // Uygulama şifresi
    }
});

exports.sendEmailNotification = onCall(async (data, context) => {
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


// =========================================================
//              SCHEDULER FONKSİYONLARI (v2)
// =========================================================

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

// =========================================================
//              FIRESTORE TRIGGER FONKSİYONLARI (v2)
// =========================================================

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
                const clientSnapshot = await db.collection("clients").doc(newDocument.clientId).get(); // 'clients' koleksiyonu var mı? 'persons' olmalı
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
                    const clientSnapshot = await db.collection("persons").doc(after.clientId).get(); // 'clients' koleksiyonu var mı? 'persons' olmalı
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

// =========================================================
//              YARDIMCI FONKSİYONLAR
// =========================================================

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