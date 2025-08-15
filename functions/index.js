// functions/index.js
import admin from 'firebase-admin';
import path from 'path';
import os from 'os';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { createExtractorFromFile } from 'node-unrar-js';
import nodemailer from 'nodemailer';
import stream from 'stream';
import { pipeline } from 'stream/promises';
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import logger from 'firebase-functions/logger';
import cors from 'cors';
import fetch from 'node-fetch';
import { PubSub } from '@google-cloud/pubsub';
import archiver from 'archiver';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
         WidthType, AlignmentType, HeadingLevel, PageBreak } from 'docx';

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
export const etebsProxyV2 = onRequest(
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
export const etebsProxyHealthV2 = onRequest(
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
export const validateEtebsTokenV2 = onRequest(
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
export const sendEmailNotificationV2 = onCall(
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

        // **GÜNCELLENDİ**
        // Artık "to" ve "cc" alanları bir dizi olarak bekleniyor
        const mailOptions = {
            from: `"IP Manager" <kubilayguzel@evrekapatent.com>`,
            to: notificationData.recipientTo?.join(', ') || '',
            cc: notificationData.recipientCc?.join(', ') || '',
            subject: notificationData.subject,
            html: notificationData.body
        };

        if (!mailOptions.to && !mailOptions.cc) {
            throw new HttpsError("failed-precondition", "Gönderilecek alıcı adresi bulunamadı.");
        }

        try {
            console.log("SMTP üzerinden gönderim başlıyor...", { to: mailOptions.to, cc: mailOptions.cc });
            await transporter.sendMail(mailOptions);

            console.log(`E-posta başarıyla gönderildi.`);
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
export const cleanupEtebsLogsV2 = onSchedule(
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

export const createMailNotificationOnDocumentIndexV2 = onDocumentCreated(
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
        let client = null; // İlk muvekkil bilgisi
        let subject = "";
        let body = "";
        let status = "pending";

        // **GÜNCELLENDİ** Yeni alıcı listeleri
        let toRecipients = [];
        let ccRecipients = [];
        let notificationType = newDocument.mainProcessType; // Örneğin 'marka'

        try {
            // İlgili IP Record'u bulma - bu fonksiyonun dokümanında `relatedIpRecordId` olmadığından
            // `clientId` üzerinden `applicants` dizisini içeren IP Record'u arıyoruz.
            const ipRecordSnapshot = await db.collection("ipRecords")
                .where("applicants", "array-contains", { id: newDocument.clientId })
                .limit(1)
                .get();

            let ipRecordData = null;
            if (!ipRecordSnapshot.empty) {
                ipRecordData = ipRecordSnapshot.docs[0].data();
            } else {
                console.warn(`clientId (${newDocument.clientId}) için IP kaydı bulunamadı.`);
                missingFields.push("ipRecord");
            }

            // Alıcı listelerini belirleme
            const recipients = await getRecipientsByApplicantIds(ipRecordData?.applicants || [], notificationType);
            toRecipients = recipients.to;
            ccRecipients = recipients.cc;

            if (toRecipients.length === 0 && ccRecipients.length === 0) {
                console.warn("Gönderim için alıcı bulunamadı.");
                missingFields.push("recipients");
            }

            // Müşteri bilgisi (ilk alıcı veya varsa clientId'den)
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


            if (template && client) {
                subject = template.subject;
                body = template.body;

                const parameters = { ...client, ...newDocument };

                for (const key in parameters) {
                    const placeholder = new RegExp(`{{${key}}}`, "g");
                    subject = subject.replace(placeholder, parameters[key]);
                    body = body.replace(placeholder, parameters[key]);
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

            if (missingFields.length > 0 || toRecipients.length === 0) {
                status = "missing_info";
            }

            const notificationData = {
                // **GÜNCELLENDİ**
                recipientTo: toRecipients,
                recipientCc: ccRecipients,
                clientId: newDocument.clientId || null,
                subject: subject,
                body: body,
                status: status,
                missingFields: missingFields,
                sourceDocumentId: docId,
                notificationType: notificationType,
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

export const createMailNotificationOnDocumentStatusChangeV2 = onDocumentUpdated(
    {
        document: "unindexed_pdfs/{docId}",
        region: 'europe-west1'
    },
      async (event) => {
        const change = event.data;
        if (!change || !change.before || !change.after) {
          console.error("Unexpected Firestore event shape for onDocumentUpdated.", {
            hasChange: !!change,
            hasBefore: !!change?.before,
            hasAfter: !!change?.after,
          });
          return null;
        }
        const before = change.before.data() || {};
        const after  = change.after.data()  || {};
        const docId = event.params.docId;

        if (before.status !== 'indexed' && after.status === 'indexed') {
            console.log(`Belge indexlendi: ${docId}`, after);

            const db = admin.firestore();
            let rule = null;
            let template = null;
            let client = null; // İlk müvekkil bilgisi
            let status = "pending";
            let subject = "";
            let body = "";
            let ipRecordData = null;
            let applicants = [];
            
            const associatedTransactionId = after.associatedTransactionId;
            if (associatedTransactionId) {
                try {
                    // Önce hangi ipRecord'a ait olduğunu bulun
                    const ipRecordsSnapshot = await db.collection("ipRecords").get();
                    
                    let ipRecordData = null;
                    let applicants = [];
                    
                    for (const ipDoc of ipRecordsSnapshot.docs) {
                        const transactionRef = db.collection("ipRecords")
                            .doc(ipDoc.id)
                            .collection("transactions")
                            .doc(associatedTransactionId);
                        
                        const transactionDoc = await transactionRef.get();
                        if (transactionDoc.exists) {
                            ipRecordData = ipDoc.data();
                            applicants = ipRecordData.applicants || [];
                            console.log(`✅ Transaction found in ipRecord: ${ipDoc.id}`);
                            break;
                        }
                    }
                    
                    if (ipRecordData) {
                        console.log(`✅ IP kaydı bulundu. ${applicants.length} adet başvuru sahibi var.`);
                        
                        // ✅ Birincil başvuru sahibini müvekkil olarak al
                        if (applicants.length > 0) {
                            const primaryApplicantId = applicants[0].id;
                            try {
                                const clientSnapshot = await db.collection("persons").doc(primaryApplicantId).get();
                                if (clientSnapshot.exists) { // ✅ Düzeltildi: exists() değil exists
                                    client = clientSnapshot.data();
                                    console.log(`✅ Müvekkil bulundu: ${client.name || primaryApplicantId}`);
                                } else {
                                    console.warn(`❌ Müvekkil dokümanı bulunamadı: ${primaryApplicantId}`);
                                }
                            } catch (clientError) {
                                console.error("Müvekkil sorgusu sırasında hata:", clientError);
                            }
                        } else {
                            console.warn("❌ Başvuru sahibi listesi boş");
                        }
                    } else {
                        console.warn(`Associated transaction ID (${associatedTransactionId}) ile transaction kaydı bulunamadı.`);
                    }
                } catch (error) {
                    console.error("Transaction sorgusu sırasında hata:", error);
                }
            } else {
                console.warn("associatedTransactionId alanı eksik. Alıcı bulunamayabilir.");
            }
            
            // Alıcı listelerini belirleme
            const notificationType = after.mainProcessType || 'marka'; // Varsayılan olarak 'marka'
            const recipients = await getRecipientsByApplicantIds(applicants, notificationType);
            const toRecipients = recipients.to;
            const ccRecipients = recipients.cc;

            if (toRecipients.length === 0 && ccRecipients.length === 0) {
                console.warn("Gönderim için alıcı bulunamadı.");
                status = "missing_info";
            }
            // **YENİ ALGORİTMA SONU**

            if (after.clientId) {
                const clientSnapshot = await db.collection("persons").doc(after.clientId).get();
                if (!clientSnapshot.exists) {
                    console.warn(`Müvekkil bulunamadı: ${after.clientId}`);
                    status = "missing_info";
                } else {
                    client = clientSnapshot.data();
                }
            } else {
                // Eğer clientId alanı yoksa, IPRecord'daki ilk applicant'ı müvekkil olarak kabul edin
                if (applicants.length > 0) {
                    const primaryApplicantId = applicants[0].id;
                    const clientSnapshot = await db.collection("persons").doc(primaryApplicantId).get();
                    if (clientSnapshot.exists) {
                        client = clientSnapshot.data();
                    }
                }
                if (!client) {
                    console.warn("clientId alanı eksik ve ilk başvuru sahibi bulunamadı.");
                    status = "missing_info";
                }
            }
            
            const rulesSnapshot = await db.collection("template_rules")
                .where("sourceType", "==", "document")
                .where("mainProcessType", "==", after.mainProcessType)
                .where("subProcessType", "==", after.subProcessType)
                .limit(1)
                .get();

            if (!rulesSnapshot.empty) {
                rule = rulesSnapshot.docs[0].data();
                const templateSnapshot = await db.collection("mail_templates").doc(rule.templateId).get();
                if (templateSnapshot.exists) {
                    template = templateSnapshot.data();
                }
            }

            if (template && client) {
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
                status = "missing_info";
            }

            const missingFields = [];
            if (!client) missingFields.push('client');
            if (!template) missingFields.push('template');
            if (toRecipients.length === 0 && ccRecipients.length === 0) missingFields.push('recipients');

            const notificationData = {
                // **GÜNCELLENDİ**
                recipientTo: toRecipients,
                recipientCc: ccRecipients,
                clientId: after.clientId || (applicants.length > 0 ? applicants[0].id : null),
                subject: subject,
                body: body,
                status: status,
                missingFields: missingFields,
                sourceDocumentId: docId,
                notificationType: notificationType,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            await db.collection("mail_notifications").add(notificationData);
            console.log(`Mail bildirimi '${status}' olarak oluşturuldu.`);
            return null;

        } else {
            console.log("Status değişimi indekslenme değil, işlem atlandı.");
            return null;
        }
    }
);

export const createUniversalNotificationOnTaskCompleteV2 = onDocumentUpdated(
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

                // **GÜNCELLENDİ** İlgili IP Record'daki applicants'ları al ve alıcıları belirle
                const recipients = await getRecipientsByApplicantIds(ipRecord.applicants || [], 'marka'); // Varsayılan olarak 'marka' bildirimi
                const toRecipients = recipients.to;
                const ccRecipients = recipients.cc;

                const primaryOwnerId = ipRecord.owners?.[0]?.id;
                if (!primaryOwnerId) {
                    console.error('IP kaydına atanmış birincil hak sahibi bulunamadı.');
                    return null;
                }
                const clientSnapshot = await db.collection("persons").doc(primaryOwnerId).get();
                const client = clientSnapshot.data();

                const parameters = {
                    muvekkil_adi: client?.name || "Bilinmeyen Müvekkil",
                    is_basligi: taskDataAfter.title,
                    epats_evrak_no: epatsDoc.turkpatentEvrakNo || "",
                    basvuru_no: ipRecord.applicationNumber || "",
                };

                let subject = template.subject.replace(/{{(.*?)}}/g, (match, p1) => parameters[p1.trim()] || match);
                let body = template.body.replace(/{{(.*?)}}/g, (match, p1) => parameters[p1.trim()] || match);

                const missingFields = [];
                let status = "pending";
                if (toRecipients.length === 0 && ccRecipients.length === 0) {
                    status = "missing_info";
                    missingFields.push('recipients');
                }

                await db.collection("mail_notifications").add({
                    // **GÜNCELLENDİ**
                    recipientTo: toRecipients,
                    recipientCc: ccRecipients,
                    clientId: primaryOwnerId,
                    subject: subject,
                    body: body,
                    status: status,
                    missingFields: missingFields,
                    sourceTaskId: taskId,
                    notificationType: 'marka',
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
export const processTrademarkBulletinUploadV3 = onObjectFinalized(
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
      await writeBatchesToFirestore(records, bulletinId, bulletinNo,imagePathMap);

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
// =========================================================

/**
 * IPRecord'daki applicants'ları kullanarak "to" ve "cc" e-posta adreslerini belirler.
 * @param {Array} applicants IPRecord'daki applicants dizisi
 * @param {string} notificationType Bildirim türü (örn: 'marka')
 * @returns {Promise<{to: string[], cc: string[]}>} Alıcı listeleri
 */
async function getRecipientsByApplicantIds(applicants, notificationType) {
    const toRecipients = new Set();
    const ccRecipients = new Set();
    
    if (!applicants || applicants.length === 0) {
        return { to: [], cc: [] };
    }

    for (const applicant of applicants) {
        try {
            // applicants.id alanını persons koleksiyonundaki docId olarak kabul ediyoruz.
            // Bu ID'yi kullanarak hem persons dokümanını (e-posta adresi için)
            // hem de personsRelated dokümanını (sorumluluk ve bildirim ayarları için) sorguluyoruz.
            const personSnapshot = await db.collection("persons").doc(applicant.id).get();
            if (!personSnapshot.exists) {
                logger.warn(`Person bulunamadı: ${applicant.id}`);
                continue;
            }
            const personData = personSnapshot.data();

            // personsRelated tablosunda ilgili personId'yi arıyoruz.
            const personsRelatedSnapshot = await db.collection("personsRelated")
                .where("personId", "==", applicant.id)
                .limit(1)
                .get();
            
            if (personsRelatedSnapshot.empty) {
                logger.warn(`personsRelated kaydı bulunamadı: ${applicant.id}`);
                continue;
            }

            const personsRelatedData = personsRelatedSnapshot.docs[0].data();

            // Sorumluluk kontrolü
            if (personsRelatedData.responsible && personsRelatedData.responsible[notificationType]) {
                const notifySettings = personsRelatedData.notify[notificationType];
                
                if (notifySettings) {
                    if (notifySettings.to) {
                        if (personData.email) toRecipients.add(personData.email);
                    }
                    if (notifySettings.cc) {
                        if (personData.email) ccRecipients.add(personData.email);
                    }
                }
            }
        } catch (error) {
            logger.error(`Alıcı tespiti sırasında hata: ${error.message}`);
        }
    }

    return { to: Array.from(toRecipients), cc: Array.from(ccRecipients) };
}


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
async function writeBatchesToFirestore(records, bulletinId, bulletinNo, imagePathMap) {
  const batchSize = 250;
  for (let i = 0; i < records.length; i += batchSize) {
    const chunk = records.slice(i, i + batchSize);
    const batch = db.batch();
    chunk.forEach((record) => {
      record.bulletinId = bulletinId;
      record.bulletinNo = bulletinNo;
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

export const deleteBulletinV2 = onCall(
  { timeoutSeconds: 540, memory: "1GiB", region: "europe-west1" },
  async (request) => {
    console.log('🔥 Bülten silme başladı');

    const { bulletinId } = request.data;
    if (!bulletinId) {
      throw new HttpsError('invalid-argument', 'BulletinId gerekli.');
    }

    try {
      // === 1. Bülten dokümanını al ===
      const bulletinDoc = await admin.firestore().collection('trademarkBulletins').doc(bulletinId).get();
      if (!bulletinDoc.exists) {
        throw new HttpsError('not-found', 'Bülten bulunamadı.');
      }

      const bulletinData = bulletinDoc.data();
      const bulletinNo = bulletinData.bulletinNo;
      console.log(`📋 Silinecek bülten: ${bulletinNo}`);

      // === 2. İlişkili trademarkBulletinRecords silme ===
      let totalDeleted = 0;
      const recordsQuery = admin.firestore().collection('trademarkBulletinRecords').where('bulletinId', '==', bulletinId);
      let snapshot = await recordsQuery.limit(500).get();

      while (!snapshot.empty) {
        const batch = admin.firestore().batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        totalDeleted += snapshot.size;
        console.log(`✅ ${totalDeleted} kayıt silindi (toplam)`);
        snapshot = await recordsQuery.limit(500).get();
      }

      // === 3. Storage görsellerini sil ===
      const storage = admin.storage().bucket();
      const prefix = `bulletins/trademark_${bulletinNo}_images/`;
      let [files] = await storage.getFiles({ prefix });
      let totalImagesDeleted = 0;
      const chunkSize = 200;

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

        if (files.length === 0) {
          [files] = await storage.getFiles({ prefix });
        }
      }

      // === 4. Ana bülten dokümanını sil ===
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
      throw new HttpsError('internal', error.message || 'Bülten silinirken hata oluştu.');
    }
  }
);

// Bu modüllerin functions/ altında da bulunması veya fonksiyon içine taşınması gerekecek.
// Şimdilik varsayımsal olarak import edeceğiz ve deployment sırasında düzenleme gerekebilir.
// Eğer bu helper dosyalarını (preprocess, visual-match, phonetic) functions klasörüne kopyalamazsanız,
// aşağıdaki import yollarını Node.js ortamına uygun olarak ayarlamanız veya bu kodları doğrudan bu dosya içine taşımanız gerekebilir.
// En temiz yöntem, bu helper'ları functions klasörünün altında ayrı bir utils veya helperlar klasörüne taşımaktır.
// Şimdilik fonksiyonun içine doğrudan kopyalayacağım ki ek dosya bağımlılığı olmasın.


// ======== Yardımcı Fonksiyonlar ve Algoritmalar (scorer.js, preprocess.js, visual-match.js, phonetic.js'ten kopyalandı) ========

// GENERIC_WORDS (preprocess.js'ten kopyalandı)
const GENERIC_WORDS = [// ======== ŞİRKET TİPLERİ ========
    'ltd', 'şti', 'aş', 'anonim', 'şirketi', 'şirket', 'limited', 'inc', 'corp', 'corporation', 'co', 'company', 'llc', 'group', 'grup',

    // ======== TİCARİ SEKTÖRLER ========
    'sanayi', 'ticaret', 'turizm', 'tekstil', 'gıda', 'inşaat', 'danışmanlık', 'hizmet', 'hizmetleri', 'bilişim', 'teknoloji', 'sigorta', 'yayıncılık', 'mobilya', 'otomotiv', 'tarım', 'enerji', 'petrol', 'kimya', 'kozmetik', 'ilaç', 'medikal', 'sağlık', 'eğitim', 'spor', 'müzik', 'film', 'medya', 'reklam', 'pazarlama', 'lojistik', 'nakliyat', 'kargo', 'finans', 'bankacılık', 'emlak', 'gayrimenkul', 'madencilik', 'metal', 'plastik', 'cam', 'seramik', 'ahşap',

    // ======== MESLEKİ TERİMLER ========
    'mühendislik', 'proje', 'taahhüt', 'ithalat', 'ihracat', 'üretim', 'imalat', 'veteriner', 'petshop', 'polikliniği', 'hastane', 'klinik', 'müşavirlik', 'muhasebe', 'hukuk', 'avukatlık', 'mimarlık', 'peyzaj', 'tasarım', 'dizayn', 'design', 'grafik', 'web', 'yazılım', 'software', 'donanım', 'hardware', 'elektronik', 'elektrik', 'makina', 'makine', 'endüstri', 'fabrika', 'laboratuvar', 'araştırma', 'geliştirme', 'ofis', // 'ofis' eklendi

    // ======== ÜRÜN/HİZMET TERİMLERİ ========
    'ürün', // 'ürün' kökü eklendi (ürünleri, ürünler gibi varyasyonları kapsayacak)
    'products', 'services', 'solutions', 'çözüm', // 'çözümleri' yerine 'çözüm' kökü
    'sistem', 'systems', 'teknolojileri', 'teknoloji', // 'teknolojileri' yanına 'teknoloji'
    'malzeme', 'materials', 'ekipman', 'equipment', 'cihaz', 'device', 'araç', 'tools', 'yedek', 'parça', 'parts', 'aksesuar', 'accessories', 'gereç', 'malzeme',

    // ======== GENEL MARKALAŞMA TERİMLERİ ========
    'meşhur', 'ünlü', 'famous', 'since', 'est', 'established', 'tarihi', 'historical', 'geleneksel', 'traditional', 'klasik', 'classic', 'yeni', 'new', 'fresh', 'taze', 'özel', 'special', 'premium', 'lüks', 'luxury', 'kalite', // 'kalite' eklendi
    'quality', 'uygun', // 'uygun' eklendi

    // ======== LOKASYON TERİMLERİ ========
    'turkey', 'türkiye', 'international', 'uluslararası',

    // ======== EMLAK TERİMLERİ ========
    'realestate', 'emlak', 'konut', 'housing', 'arsa', 'ticari', 'commercial', 'ofis', 'office', 'plaza', 'shopping', 'alışveriş', 'residence', 'rezidans', 'villa', 'apartment', 'daire',

    // ======== DİJİTAL TERİMLERİ ========
    'online', 'digital', 'dijital', 'internet', 'web', 'app', 'mobile', 'mobil', 'network', 'ağ', 'server', 'sunucu', 'hosting', 'domain', 'platform', 'social', 'sosyal', 'media', 'medya',

    // ======== GIDA TERİMLERİ ========
    'gıda', 'food', 'yemek', 'restaurant', 'restoran', 'cafe', 'kahve', 'coffee', 'çay', 'tea', 'fırın', 'bakery', 'ekmek', 'bread', 'pasta', 'börek', 'pizza', 'burger', 'kebap', 'döner', 'pide', 'lahmacun', 'balık', 'fish', 'et', 'meat', 'tavuk', 'chicken', 'sebze', 'vegetable', 'meyve', 'fruit', 'süt', 'milk', 'peynir', 'cheese', 'yoğurt', 'yogurt', 'dondurma', 'şeker', 'sugar', 'bal', 'reçel', 'jam', 'konserve', 'canned', 'organic', 'organik', 'doğal', 'natural', 'taze', 'fresh',

    // ======== BAĞLAÇLAR ve Yaygın Kelimeler ========
    've', 'ile', 'için', 'bir', 'bu', 'da', 'de', 'ki', 'mi', 'mı', 'mu', 'mü',
    'sadece', 'tek', 'en', 'çok', 'az', 'üst', 'alt', 'yeni', 'eski'
];

function removeTurkishSuffixes(word) {
    if (!word) return '';
    
    // Çoğul ekleri: -ler, -lar
    if (word.endsWith('ler') || word.endsWith('lar')) {
        return word.substring(0, word.length - 3);
    }
    // İyelik ekleri (basit formlar): -im, -in, -i, -ımız, -ınız, -ları
    // Örneğin, 'ofisi' -> 'ofis'
    if (word.endsWith('si') || word.endsWith('sı') || word.endsWith('sü') || word.endsWith('su')) {
        return word.substring(0, word.length - 2);
    }
    if (word.endsWith('i') || word.endsWith('ı') || word.endsWith('u') || word.endsWith('ü')) {
        // 'gıda' gibi kelimelerde 'ı' son ek olmamalı, bu yüzden dikkatli olmalı
        // Daha güvenli bir kontrol için kelime kökü kontrol edilebilir
        // Şimdilik sadece iyelik ve yönelme eklerini çıkarıyoruz.
        // Basitçe son harfi kaldırmak riskli, ama şimdilik en yaygın olanları ele alalım
        if (word.length > 2 && ['i', 'ı', 'u', 'ü'].includes(word[word.length - 1])) {
             // 'ofis' gibi kelimelerde 'i' iyelik eki olabilir.
             // Daha sofistike bir çözüm için NLP kütüphanesi gerekir, bu basit bir yaklaşımdır.
             return word.substring(0, word.length - 1);
        }
    }
    // Fiilimsiler, durum ekleri vb. için daha karmaşık kurallar gerekebilir
    
    return word;
}

/**
 * Marka adını temizler: küçük harfe çevirir, özel karakterleri kaldırır, stopwords'ü çıkarır.
 *
 * @param {string} name Marka adı
 * @param {boolean} removeGenericWords Stopwords'ün çıkarılıp çıkarılmayacağını belirler.
 * Genellikle çok kelimeli isimler için true olmalı.
 * @returns {string} Temizlenmiş marka adı.
 */
export function cleanMarkName(name, removeGenericWords = true) {
    if (!name) return '';
    let cleaned = name.toLowerCase().replace(/[^a-z0-9ğüşöçı\s]/g, '').trim(); // Harf, rakam ve boşluk dışındaki her şeyi kaldır

    // Birden fazla boşluğu tek boşluğa indirge
    cleaned = cleaned.replace(/\s+/g, ' ');

    if (removeGenericWords) {
        // Kelimelere ayır, eklerini kaldır ve stopwords olmayanları filtrele
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
function parseDate(value) {
  if (!value) return null;
  
  // dd/MM/yyyy formatı desteği (Türkiye standartı)
  const parts = value.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const year = parseInt(parts[2], 10);
    
    // Geçerlilik kontrolü ekleyin
    if (day > 0 && day <= 31 && month >= 0 && month <= 11 && year > 1900) {
      return new Date(year, month, day);
    }
  }
  
  // ISO formatı veya başka formatlar için
  const isoDate = new Date(value);
  return isNaN(isoDate) ? null : isoDate;
}

function isValidBasedOnDate(hitDate, monitoredDate) {
  if (!hitDate || !monitoredDate) return true;

  const hit = parseDate(hitDate);
  const monitored = parseDate(monitoredDate);

  if (!hit || !monitored || isNaN(hit) || isNaN(monitored)) return true;

  // doğru mantık
  return hit >= monitored;
}

// functions/index.js - Düzeltilmiş nice sınıf fonksiyonu

function hasOverlappingNiceClasses(monitoredNiceClasses, recordNiceClasses) {
  logger.log("🏷️ Nice sınıf karşılaştırması:", {
    monitoredNiceClasses,
    recordNiceClasses,
    monitoredType: typeof monitoredNiceClasses,
    recordType: typeof recordNiceClasses
  });
  
  try {
    // Eğer izlenen markanın nice sınıfı yoksa, sınıf filtresini atla
    if (!monitoredNiceClasses || (Array.isArray(monitoredNiceClasses) && monitoredNiceClasses.length === 0)) {
      logger.log("ℹ️ İzlenen markanın nice sınıfı yok, filtre atlanıyor");
      return true;
    }
    
    // Kayıtta nice sınıf yoksa çakışma yok
    if (!recordNiceClasses) {
      logger.log("ℹ️ Kayıtta nice sınıf yok, çakışma yok");
      return false;
    }

    // Nice sınıfları normalize et (sadece rakamları al ve array'e çevir)
    const normalizeNiceClasses = (classes) => {
      if (!classes) return [];
      
      let classArray = [];
      
      if (Array.isArray(classes)) {
        classArray = classes;
      } else if (typeof classes === 'string') {
        // String ise önce " / " ile böl, sonra diğer ayırıcılarla da böl
        classArray = classes.split(/[\s\/,]+/).filter(c => c.trim());
      } else {
        classArray = [String(classes)];
      }
      
      // Her sınıftan sadece rakamları al
      return classArray
        .map(cls => String(cls).replace(/\D/g, '')) // Sadece rakamları al
        .filter(cls => cls && cls.length > 0); // Boş olanları çıkar
    };
    
    const monitoredClasses = normalizeNiceClasses(monitoredNiceClasses);
    const recordClasses = normalizeNiceClasses(recordNiceClasses);
    
    logger.log("🔧 Normalize edilmiş sınıflar:", {
      monitoredClasses,
      recordClasses
    });
    
    // Her iki liste de boşsa true döndür
    if (monitoredClasses.length === 0 && recordClasses.length === 0) {
      logger.log("ℹ️ Her iki liste de boş, kabul ediliyor");
      return true;
    }
    
    // İzlenen marka sınıfları boşsa kabul et
    if (monitoredClasses.length === 0) {
      logger.log("ℹ️ İzlenen marka sınıfları boş, kabul ediliyor");
      return true;
    }
    
    // Kayıt sınıfları boşsa çakışma yok
    if (recordClasses.length === 0) {
      logger.log("ℹ️ Kayıt sınıfları boş, çakışma yok");
      return false;
    }
    
    // Kesişim kontrolü
    const hasOverlap = monitoredClasses.some(monitoredClass => 
      recordClasses.some(recordClass => monitoredClass === recordClass)
    );
    
    logger.log(`🏷️ Nice sınıf kesişimi: ${hasOverlap ? 'VAR' : 'YOK'}`);
    
    // Debug: hangi sınıflar eşleşti?
    if (hasOverlap) {
      const matchingClasses = monitoredClasses.filter(monitoredClass => 
        recordClasses.some(recordClass => monitoredClass === recordClass)
      );
      logger.log(`✅ Eşleşen sınıflar: ${matchingClasses.join(', ')}`);
    }
    
    return hasOverlap;
    
  } catch (error) {
    logger.error('❌ Nice class karşılaştırma hatası:', error);
    return false;
  }
}

// ======== Ana Benzerlik Skorlama Fonksiyonu (scorer.js'ten kopyalandı) ========
function levenshteinDistance(a, b) {
  const matrix = [];

  const lenA = a.length;
  const lenB = b.length;

  for (let i = 0; i <= lenB; i++) matrix[i] = [i];
  for (let j = 0; j <= lenA; j++) matrix[0][j] = j;

  for (let i = 1; i <= lenB; i++) {
    for (let j = 1; j <= lenA; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[lenB][lenA];
}

function levenshteinSimilarity(a, b) {
  if (!a || !b) return 0;
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : (1 - distance / maxLen);
}

function calculateSimilarityScoreInternal(hitMarkName, searchMarkName, hitApplicationDate, searchApplicationDate, hitNiceClasses, searchNiceClasses) {
    // Jenerik ibare temizliği
    const isSearchMultiWord = searchMarkName.trim().split(/\s+/).length > 1;
    const isHitMultiWord = (hitMarkName || '').trim().split(/\s+/).length > 1;

    const cleanedSearchName = cleanMarkName(searchMarkName || '', isSearchMultiWord).toLowerCase().trim();
    const cleanedHitName = cleanMarkName(hitMarkName || '', isHitMultiWord).toLowerCase().trim();

    logger.log(`📊 Skorlama: '${searchMarkName}' (temizlenmiş: '${cleanedSearchName}') vs '${hitMarkName}' (temizlenmiş: '${cleanedHitName}')`);

    if (!cleanedSearchName || !cleanedHitName) {
        return { finalScore: 0.0, positionalExactMatchScore: 0.0 }; // Her iki skoru da döndür
    }

    // Tam eşleşme kontrolü (en yüksek öncelik)
    if (cleanedSearchName === cleanedHitName) {
        return { finalScore: 1.0, positionalExactMatchScore: 1.0 }; // Her iki skoru da döndür
    }

    // ======== Alt Benzerlik Skorları ========
    const levenshteinScore = (() => {
        const matrix = [];
        if (cleanedSearchName.length === 0) return cleanedHitName.length === 0 ? 1.0 : 0.0;
        if (cleanedHitName.length === 0) return cleanedSearchName.length === 0 ? 1.0 : 0.0;
    
        for (let i = 0; i <= cleanedHitName.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= cleanedSearchName.length; j++) {
            matrix[0][j] = j;
        }
    
        for (let i = 1; i <= cleanedHitName.length; i++) {
            for (let j = 1; j <= cleanedSearchName.length; j++) {
                const cost = cleanedHitName.charAt(i - 1) === cleanedSearchName.charAt(j - 1) ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + cost, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
        const maxLength = Math.max(cleanedSearchName.length, cleanedHitName.length);
        return maxLength === 0 ? 1.0 : 1.0 - (matrix[cleanedHitName.length][cleanedSearchName.length] / maxLength);
    })();
    logger.log(`   - Levenshtein Score: ${levenshteinScore.toFixed(2)}`);

    const jaroWinklerScore = (() => {
        const s1 = cleanedSearchName;
        const s2 = cleanedHitName;
        if (s1 === s2) return 1.0;

        let m = 0;
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
        let t = 0;
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
    })();
    logger.log(`   - Jaro-Winkler Score: ${jaroWinklerScore.toFixed(2)}`);

    const ngramScore = (() => {
        const s1 = cleanedSearchName;
        const s2 = cleanedHitName;
        const n = 2;
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
    })();
    logger.log(`   - N-gram Score (n=2): ${ngramScore.toFixed(2)}`);

    const visualScore = (() => {
        const visualPenalty = visualMismatchPenalty(cleanedSearchName, cleanedHitName);
        const maxPossibleVisualPenalty = Math.max(cleanedSearchName.length, cleanedHitName.length) * 1.0;
        return maxPossibleVisualPenalty === 0 ? 1.0 : (1.0 - (visualPenalty / maxPossibleVisualPenalty));
    })();
    logger.log(`   - Visual Score: ${visualScore.toFixed(2)}`);

    const prefixScore = (() => {
        const s1 = cleanedSearchName;
        const s2 = cleanedHitName;
        const length = 3;
        if (!s1 || !s2) return 0.0;
        const prefix1 = s1.substring(0, Math.min(s1.length, length));
        const prefix2 = s2.substring(0, Math.min(s2.length, length));

        if (prefix1 === prefix2) return 1.0;
        if (prefix1.length === 0 && prefix2.length === 0) return 1.0;

        return levenshteinSimilarity(prefix1, prefix2); // Önek karşılaştırması için levenshteinSimilarity kullan
    })();
    logger.log(`   - Prefix Score (len 3): ${prefixScore.toFixed(2)}`);

    // 6. Kelime Bazında En Yüksek Benzerlik Skoru
    const maxWordScore = (() => {
        const s1 = cleanedSearchName;
        const s2 = cleanedHitName;
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
    })();
    logger.log(`   - Max Word Score: ${maxWordScore.toFixed(2)}`);

    // Yeni: Konumsal Tam Eşleşme Skoru (örn: ilk 3 karakter tam eşleşiyorsa)
    const positionalExactMatchScore = (() => {
        const s1 = cleanedSearchName;
        const s2 = cleanedHitName;
        if (!s1 || !s2) return 0.0;

        // İlk 3 karakteri büyük/küçük harf duyarsız karşılaştır
        const len = Math.min(s1.length, s2.length, 3);
        if (len === 0) return 0.0; // Karşılaştırılacak karakter yok

        for (let i = 0; i < len; i++) {
            if (s1[i] === s2[i]) {
                return 1.0; // İlk 'len' karakterlerin hepsi tam eşleşiyor
            }
        }
        return 0.0; // İlk 'len' karakterlerde uyumsuzluk bulundu
    })();
    logger.log(`   - Positional Exact Match Score (first 3 chars): ${positionalExactMatchScore.toFixed(2)}`);

    // ======== YENİ KURAL: Yüksek Kelime Benzerliği Kontrolü ve Önceliklendirme ========
    const HIGH_WORD_SIMILARITY_THRESHOLD = 0.70;

    if (maxWordScore >= HIGH_WORD_SIMILARITY_THRESHOLD) {
        logger.log(`   *** Yüksek kelime bazında benzerlik tespit edildi (${(maxWordScore * 100).toFixed(0)}%), doğrudan skor olarak kullanılıyor. ***`);
        // Her iki skoru da döndür, finalScore maxWordScore olsun
        return { finalScore: maxWordScore, positionalExactMatchScore: positionalExactMatchScore };
    }
    
    // ======== İsim Benzerliği Alt Toplamı Hesaplama (%95 Ağırlık) ========
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

    // ======== Fonetik Benzerlik Skoru (%5 Ağırlık) ========
    const phoneticScoreRaw = isPhoneticallySimilar(searchMarkName, hitMarkName);
    const phoneticSimilarityWeighted = phoneticScoreRaw * 0.05;
    logger.log(`   - Phonetic Score (weighted 5%): ${phoneticSimilarityWeighted.toFixed(2)}`);

    // ======== Genel Benzerlik Skoru ========
    let finalScore = nameSimilarityWeighted + phoneticSimilarityWeighted;

    finalScore = Math.max(0.0, Math.min(1.0, finalScore));

    logger.log(`   - FINAL SCORE: ${finalScore.toFixed(2)}\n`);
    return { finalScore: finalScore, positionalExactMatchScore: positionalExactMatchScore }; // Her iki skoru da döndür
}

// ======== Yeni Cloud Function: Sunucu Tarafında Marka Benzerliği Araması ========
// functions/index.js - performTrademarkSimilaritySearch fonksiyonunun düzeltilmiş kısmı

// functions/index.js (sadece performTrademarkSimilaritySearch fonksiyonu güncellenmiştir)

export const performTrademarkSimilaritySearch = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 300,
    memory: '1GiB'
  },
  async (request) => {
    const { monitoredMarks, selectedBulletinId } = request.data;

    if (!Array.isArray(monitoredMarks) || monitoredMarks.length === 0 || !selectedBulletinId) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required parameters: monitoredMarks (array) or selectedBulletinId'
      );
    }

    logger.log('🚀 Cloud Function: performTrademarkSimilaritySearch BAŞLATILDI', {
      numMonitoredMarks: monitoredMarks.length,
      selectedBulletinId,
      monitoredMarksDetails: monitoredMarks.map(m => ({ id: m.id, markName: m.markName }))
    });

    try {
      let bulletinRecordsSnapshot;

      // Önce bulletinId olarak direkt ara
      bulletinRecordsSnapshot = await db.collection('trademarkBulletinRecords')
        .where('bulletinId', '==', selectedBulletinId)
        .get();

      // Eğer sonuç yoksa veya gönderilen değer "469_27052025" gibi ise → bulletinNo ile ara
      if (!bulletinRecordsSnapshot || bulletinRecordsSnapshot.empty) {
        // "_" içeriyorsa sadece ilk kısmı al
        let selectedBulletinNo = selectedBulletinId;
        if (selectedBulletinId.includes('_')) {
          selectedBulletinNo = selectedBulletinId.split('_')[0];
        }

        const bulletinDoc = await db.collection('trademarkBulletins')
          .where('bulletinNo', '==', selectedBulletinNo)
          .limit(1)
          .get();

        if (!bulletinDoc.empty) {
          const bulletinIdFromNo = bulletinDoc.docs[0].id;
          bulletinRecordsSnapshot = await db.collection('trademarkBulletinRecords')
            .where('bulletinId', '==', bulletinIdFromNo)
            .get();
        }
      }

      const bulletinRecords = bulletinRecordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      logger.log(`✅ ${bulletinRecords.length} kayıt bulundu.`);

      const allResults = [];

      for (const monitoredMark of monitoredMarks) {
        logger.log("🔍 İşlenen monitored mark:", {
          id: monitoredMark.id,
          markName: monitoredMark.markName,
          applicationDate: monitoredMark.applicationDate,
          niceClasses: monitoredMark.niceClasses
        });

        const markNameRaw = monitoredMark.markName || monitoredMark.title || '';
        const markName = (typeof markNameRaw === 'string') ? markNameRaw.trim() : '';
        const applicationDate = monitoredMark.applicationDate || null;
        const niceClasses = monitoredMark.niceClasses || [];

        if (!markName) {
          logger.warn(`⚠️ İzlenen markanın adı eksik:`, monitoredMark);
          continue;
        }

        // Aranan markanın temizlenmiş hali (burada tanımlanması gerekiyor)
        const cleanedSearchName = cleanMarkName(markName, markName.trim().split(/\s+/).length > 1); // cleanMarkName fonksiyonuna erişilebilir olmalı

        logger.log(`🔎 Arama: '${markName}' (ID: ${monitoredMark.id})`);

        let matchCount = 0;

        for (const hit of bulletinRecords) {
          // Tarih filtresi
          if (!isValidBasedOnDate(hit.applicationDate, applicationDate)) {
            continue;
          }

          // Nice sınıf filtresi devre dışı (mevcut durumda true)
          const hasNiceClassOverlap = true; //

          // Benzerlik skoru
          const { finalScore: similarityScore, positionalExactMatchScore } = calculateSimilarityScoreInternal(
            hit.markName,
            markName,
            hit.applicationDate,
            applicationDate,
            hit.niceClasses,
            niceClasses
          );

          const SIMILARITY_THRESHOLD = 0.5; //

          // Yeni Kriter Kontrolü: Aranan marka, bulunan markanın başında veya sonunda tam geçiyor mu?
        const cleanedHitName = cleanMarkName(hit.markName, (hit.markName || '').trim().split(/\s+/).length > 1);
        let isPrefixSuffixExactMatch = false;

        // Minimum uzunluk kontrolü eklendi, çok kısa kelimelerin eşleşmesi anlamsız olabilir.
        const MIN_SEARCH_LENGTH = 3; // En az 3 karakterlik bir eşleşme arıyoruz

        if (cleanedSearchName.length >= MIN_SEARCH_LENGTH) {
            // Aranan markanın tüm kelimelerini kontrol et
            const searchWords = cleanedSearchName.split(' ').filter(word => word.length >= MIN_SEARCH_LENGTH);
            
            for (const searchWord of searchWords) {
                // Bulunan markanın temizlenmiş halinde aranan kelime geçiyor mu?
                if (cleanedHitName.includes(searchWord)) {
                    isPrefixSuffixExactMatch = true;
                    logger.log(`🎯 Tam eşleşme bulundu: '${searchWord}' kelimesi '${cleanedHitName}' içinde geçiyor`);
                    break; // Bir eşleşme bulmak yeterli
                }
            }
            
            // Alternatif olarak: Aranan markanın tamamı bulunan markada geçiyor mu?
            // (kelime kelime değil, bütün olarak)
            if (!isPrefixSuffixExactMatch && cleanedHitName.includes(cleanedSearchName)) {
                isPrefixSuffixExactMatch = true;
                logger.log(`🎯 Tam eşleşme bulundu: '${cleanedSearchName}' tamamı '${cleanedHitName}' içinde geçiyor`);
            }
        }
          // GÜNCELLENMİŞ FİLTRELEME KOŞULU

          if (
              similarityScore < SIMILARITY_THRESHOLD && 
              positionalExactMatchScore < SIMILARITY_THRESHOLD && 
              !isPrefixSuffixExactMatch
          ) {
            // Hiçbir geçerli kriteri sağlamadı, bu yüzden atla
            logger.log(`⏩ Atlandı: Final Skor: ${similarityScore.toFixed(2)}, Positional: ${positionalExactMatchScore.toFixed(2)}, Prefix/Suffix Eşleşme Yok - ${hit.markName}`);
            continue;
          }

          // Bu noktaya ulaşan tüm kayıtlar, yukarıdaki üç 'continue' koşulundan en az birini karşılamadığı için eklenir.
          // Yani, ya similarityScore >= THRESHOLD, ya positionalExactMatchScore >= THRESHOLD, ya da isPrefixSuffixExactMatch === true.
          matchCount++;

          // *** ÖNEMLİ: Tüm gerekli alanları ekle ***
          allResults.push({
            objectID: hit.id,
            markName: hit.markName,
            applicationNo: hit.applicationNo,
            applicationDate: hit.applicationDate,
            niceClasses: hit.niceClasses,
            holders: hit.holders,
            imagePath: hit.imagePath,
            bulletinId: hit.bulletinId,
            similarityScore,
            positionalExactMatchScore,
            sameClass: hasNiceClassOverlap, // Şu anda true olarak ayarlı
            
            // *** FRONTEND İÇİN GEREKLİ ALANLAR ***
            monitoredTrademark: markName, // Frontend'in eşleştirme için kullandığı alan
            monitoredNiceClasses: niceClasses, //
            monitoredTrademarkId: monitoredMark.id // Eski uyumluluk için
          });
        }

        logger.log(`📊 '${markName}' (ID: ${monitoredMark.id}) için ${matchCount} eşleşme bulundu`);
      }

      allResults.sort((a, b) => b.similarityScore - a.similarityScore);
      
      // *** SON KONTROL LOGU ***
      logger.log(`✅ Toplam ${allResults.length} sonuç döndürülüyor`, {
        sampleResult: allResults[0] ? {
          markName: allResults[0].markName,
          monitoredTrademark: allResults[0].monitoredTrademark,
          monitoredMarkId: allResults[0].monitoredMarkId,
          monitoredTrademarkId: allResults[0].monitoredTrademarkId
        } : 'No results'
      });

      return { success: true, results: allResults };
    } catch (error) {
      logger.error('❌ Cloud Function hata:', error);
      throw new HttpsError('internal', 'Marka benzerliği araması sırasında hata oluştu.', error.message);
    }
  }
);
const bucket = admin.storage().bucket();
export const generateSimilarityReport = onCall(
  {
    timeoutSeconds: 540,
    memory: "1GiB",
    region: "europe-west1"
  },
  async (request) => {
    try {
      const { results } = request.data;
      if (!results || !Array.isArray(results)) {
        throw new Error("Geçersiz veri formatı");
      }

      // --- Sahip bazında grupla ---
      const owners = {};
      results.forEach((m) => {
        const owner = (m.monitoredMark && m.monitoredMark.ownerName) || "Bilinmeyen Sahip";
        if (!owners[owner]) owners[owner] = [];
        owners[owner].push(m);
      });

      const archive = archiver("zip", { zlib: { level: 9 } });
      const passthrough = new stream.PassThrough();
      archive.pipe(passthrough);

      // Her sahip için ayrı dosya oluştur
      for (const [ownerName, matches] of Object.entries(owners)) {
        const doc = await createProfessionalReport(ownerName, matches);
        const buffer = await Packer.toBuffer(doc);
        archive.append(buffer, { name: `${sanitizeFileName(ownerName)}_Benzerlik_Raporu.docx` });
      }

      await archive.finalize();
      const chunks = [];
      for await (const chunk of passthrough) chunks.push(chunk);
      const finalBuffer = Buffer.concat(chunks);

      return {
        success: true,
        file: finalBuffer.toString("base64")
      };
    } catch (error) {
      console.error("Rapor oluşturma hatası:", error);
      return { success: false, error: error.message };
    }
  }
);

// Ana rapor oluşturma fonksiyonu
async function createProfessionalReport(ownerName, matches) {
  // --- Benzer marka bazında grupla ---
  const grouped = {};
  matches.forEach((m) => {
    const key = (m.similarMark && m.similarMark.applicationNo) || 'unknown';
    if (!grouped[key]) {
      grouped[key] = { 
        similarMark: m.similarMark || {}, 
        monitoredMarks: [] 
      };
    }
    grouped[key].monitoredMarks.push(m.monitoredMark || {});
  });

  const reportContent = [];

  // === RAPOR BAŞLIĞI ===
  reportContent.push(...createReportHeader(ownerName, matches.length));
  
  // === ÖZ BİLGİLER ===
  reportContent.push(...createExecutiveSummary(grouped));
  
  // === SAYFA KESME ===
  reportContent.push(new Paragraph({ 
    children: [new PageBreak()]
  }));

  // === DETAY ANALİZ ===
  for (const [index, group] of Object.entries(grouped).entries()) {
    if (index > 0) {
      reportContent.push(new Paragraph({ 
        children: [new PageBreak()]
      }));
    }
    
    const [_, g] = group;
    reportContent.push(...createDetailedAnalysisSection(g, index + 1));
  }

  // === SONUÇ VE ÖNERİLER ===
  reportContent.push(new Paragraph({ 
    children: [new PageBreak()]
  }));
  reportContent.push(...createConclusionSection(grouped));

  return new Document({
    creator: "IP Manager",
    description: `${ownerName} Marka Benzerlik Raporu`,
    title: `Marka Benzerlik Raporu`,
    sections: [{
      properties: {},
      children: reportContent
    }]
  });
}

// === RAPOR BAŞLIĞI ===
function createReportHeader(ownerName, totalMatches) {
  const currentDate = new Date().toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return [
    // Ana başlık
    new Paragraph({
      children: [
        new TextRun({
          text: "MARKA BENZERLİK ANALİZİ RAPORU",
          bold: true,
          size: 32,
          color: "2E4BC7"
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    }),

    // Alt başlık
    new Paragraph({
      children: [
        new TextRun({
          text: `${ownerName} İçin Detaylı İnceleme`,
          bold: true,
          size: 24,
          color: "666666"
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 }
    }),

    // Rapor bilgileri tablosu
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createInfoCell("Rapor Tarihi:", currentDate),
            createInfoCell("Toplam Tespit:", `${totalMatches} adet benzer marka`)
          ]
        }),
        new TableRow({
          children: [
            createInfoCell("Analiz Kapsamı:", "Marka benzerlik tespiti"),
            createInfoCell("Rapor Durumu:", "Tamamlandı")
          ]
        })
      ]
    }),

    new Paragraph({ text: "", spacing: { after: 600 } })
  ];
}

// === ÖZ BİLGİLER BÖLÜMÜ ===
function createExecutiveSummary(grouped) {
  const totalSimilarMarks = Object.keys(grouped).length;
  const totalMonitoredMarks = Object.values(grouped).reduce((sum, g) => sum + g.monitoredMarks.length, 0);
  
  // Risk seviyesi analizi
  let highRisk = 0, mediumRisk = 0, lowRisk = 0;
  Object.values(grouped).forEach(g => {
    const similarity = parseFloat(g.similarMark.similarity) || 0;
    if (similarity >= 70) highRisk++;
    else if (similarity >= 50) mediumRisk++;
    else lowRisk++;
  });

  return [
    new Paragraph({
      children: [
        new TextRun({
          text: "YÖNETİCİ ÖZETİ",
          bold: true,
          size: 20,
          color: "2E4BC7"
        })
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 300 }
    }),

    new Paragraph({
      children: [
        new TextRun({
          text: "Bu rapor, izlenen markalarınıza yönelik benzerlik analizi sonuçlarını içermektedir. ",
          size: 22
        }),
        new TextRun({
          text: "Aşağıdaki önemli bulgular tespit edilmiştir:",
          size: 22,
          bold: true
        })
      ],
      spacing: { after: 300 }
    }),

    // Özet istatistikler tablosu
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createSummaryHeaderCell("Analiz Konusu"),
            createSummaryHeaderCell("Sonuç"),
            createSummaryHeaderCell("Değerlendirme")
          ]
        }),
        new TableRow({
          children: [
            createSummaryCell("Benzer Marka Sayısı"),
            createSummaryCell(`${totalSimilarMarks} adet`),
            createSummaryCell(totalSimilarMarks > 5 ? "Yüksek" : totalSimilarMarks > 2 ? "Orta" : "Düşük")
          ]
        }),
        new TableRow({
          children: [
            createSummaryCell("İzlenen Marka Sayısı"),
            createSummaryCell(`${totalMonitoredMarks} adet`),
            createSummaryCell("Aktif İzleme")
          ]
        }),
        new TableRow({
          children: [
            createSummaryCell("Yüksek Risk (≥%70)"),
            createSummaryCell(`${highRisk} adet`),
            createSummaryCell(highRisk > 0 ? "Acil İnceleme Gerekli" : "Risk Yok")
          ]
        }),
        new TableRow({
          children: [
            createSummaryCell("Orta Risk (%50-69)"),
            createSummaryCell(`${mediumRisk} adet`),
            createSummaryCell(mediumRisk > 0 ? "İzleme Gerekli" : "Risk Yok")
          ]
        }),
        new TableRow({
          children: [
            createSummaryCell("Düşük Risk (<50%)"),
            createSummaryCell(`${lowRisk} adet`),
            createSummaryCell("Düşük Öncelik")
          ]
        })
      ]
    })
  ];
}

// === DETAYLI ANALİZ BÖLÜMÜ ===
function createDetailedAnalysisSection(group, sectionIndex) {
  const elements = [];
  const similarMark = group.similarMark;
  const similarity = parseFloat(similarMark.similarity) || 0;
  
  // Risk seviyesi belirleme
  let riskLevel = "DÜŞÜK";
  let riskColor = "28A745";
  if (similarity >= 70) {
    riskLevel = "YÜKSEK";
    riskColor = "DC3545";
  } else if (similarity >= 50) {
    riskLevel = "ORTA";
    riskColor = "FFC107";
  }

  // Bölüm başlığı
  elements.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${sectionIndex}. BENZER MARKA ANALİZİ`,
          bold: true,
          size: 18,
          color: "2E4BC7"
        })
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 300 }
    })
  );

  // Benzer marka bilgi kartı
  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "🎯 BENZER MARKA BİLGİLERİ",
                      bold: true,
                      size: 32,
                      color: "FFFFFF"
                    })
                  ],
                  alignment: AlignmentType.CENTER
                })
              ],
              columnSpan: 2,
              shading: { fill: "2E4BC7", type: "clear", color: "auto" }
            })
          ]
        }),
        new TableRow({
          children: [
            createDetailCell("Marka Adı:", similarMark.name || "-"),
            createDetailCell("Başvuru No:", similarMark.applicationNo || "-")
          ]
        }),
        new TableRow({
          children: [
            createDetailCell("Başvuru Tarihi:", similarMark.date || "-"),
            createDetailCell("Nice Sınıfları:", Array.isArray(similarMark.niceClass) ? 
              similarMark.niceClass.join(", ") : (similarMark.niceClass || "-"))
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Benzerlik Oranı: ",
                      bold: true
                    }),
                    new TextRun({
                      text: `%${similarity.toFixed(1)}`,
                      bold: true,
                      color: riskColor,
                      size: 24
                    })
                  ]
                })
              ]
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Risk Seviyesi: ",
                      bold: true
                    }),
                    new TextRun({
                      text: riskLevel,
                      bold: true,
                      color: riskColor,
                      size: 24
                    })
                  ]
                })
              ]
            })
          ]
        })
      ]
    })
  );

  elements.push(new Paragraph({ text: "", spacing: { after: 300 } }));

  // İzlenen markalar tablosu
  elements.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "🔍 İZLENEN MARKALAR",
          bold: true,
          size: 16,
          color: "2E4BC7"
        })
      ],
      spacing: { before: 300, after: 200 }
    })
  );

  const monitoredTableRows = [
    new TableRow({
      children: [
        createTableHeaderCell("Marka Adı"),
        createTableHeaderCell("Başvuru No"),
        createTableHeaderCell("Başvuru Tarihi"),
        createTableHeaderCell("Nice Sınıfları"),
        createTableHeaderCell("Durum")
      ]
    })
  ];

  group.monitoredMarks.forEach(mark => {
    monitoredTableRows.push(
      new TableRow({
        children: [
          createTableDataCell(mark.markName || mark.name || "-"),
          createTableDataCell(mark.applicationNo || "-"),
          createTableDataCell(mark.date || mark.applicationDate || "-"),
          createTableDataCell(Array.isArray(mark.niceClass) ? 
            mark.niceClass.join(", ") : (mark.niceClass || mark.niceClasses || "-")),
          createTableDataCell("Aktif İzleme")
        ]
      })
    );
  });

  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: monitoredTableRows
    })
  );

  // Not alanı varsa ekle
  if (similarMark.note && similarMark.note.trim()) {
    elements.push(
      new Paragraph({ text: "", spacing: { after: 300 } }),
      new Paragraph({
        children: [
          new TextRun({
            text: "📝 NOTLAR",
            bold: true,
            size: 14,
            color: "2E4BC7"
          })
        ],
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: similarMark.note,
            italics: true,
            size: 22
          })
        ],
        spacing: { before: 100, after: 300 }
      })
    );
  }

  return elements;
}

// === SONUÇ VE ÖNERİLER ===
function createConclusionSection(grouped) {
  const totalMarks = Object.keys(grouped).length;
  const highRiskMarks = Object.values(grouped).filter(g => 
    parseFloat(g.similarMark.similarity) >= 70).length;

  return [
    new Paragraph({
      children: [
        new TextRun({
          text: "SONUÇ VE ÖNERİLER",
          bold: true,
          size: 20,
          color: "2E4BC7"
        })
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 300 }
    }),

    new Paragraph({
      children: [
        new TextRun({
          text: `Bu analiz kapsamında toplam ${totalMarks} adet benzer marka tespit edilmiştir. `,
          size: 22
        }),
        new TextRun({
          text: `Bunlardan ${highRiskMarks} adedi yüksek risk kategorisindedir.`,
          size: 22,
          bold: true,
          color: highRiskMarks > 0 ? "DC3545" : "28A745"
        })
      ],
      spacing: { after: 300 }
    }),

    new Paragraph({
      children: [
        new TextRun({
          text: "📋 ÖNERİLER:",
          bold: true,
          size: 16,
          color: "2E4BC7"
        })
      ],
      spacing: { before: 300, after: 200 }
    }),

    ...(highRiskMarks > 0 ? [
      new Paragraph({
        children: [
          new TextRun({ text: "🔴 ", size: 20 }),
          new TextRun({
            text: "Yüksek riskli markalar için acil hukuki inceleme yapılması önerilir.",
            size: 22,
            bold: true
          })
        ],
        spacing: { after: 150 }
      })
    ] : []),

    new Paragraph({
      children: [
        new TextRun({ text: "📊 ", size: 20 }),
        new TextRun({
          text: "Nice sınıf çakışmalarının detaylı analiz edilmesi",
          size: 22
        })
      ],
      spacing: { after: 150 }
    }),

    new Paragraph({
      children: [
        new TextRun({ text: "⚖️ ", size: 20 }),
        new TextRun({
          text: "Gerekli durumlarda itiraz prosedürlerinin başlatılması",
          size: 22
        })
      ],
      spacing: { after: 150 }
    }),

    new Paragraph({
      children: [
        new TextRun({ text: "🔍 ", size: 20 }),
        new TextRun({
          text: "Düzenli izleme sürecinin devam ettirilmesi",
          size: 22
        })
      ],
      spacing: { after: 400 }
    }),

    // Rapor footer
    new Paragraph({
      children: [
        new TextRun({
          text: "Bu rapor IP Manager - Marka Analiz Sistemi tarafından otomatik olarak oluşturulmuştur.",
          size: 18,
          italics: true,
          color: "666666"
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 }
    })
  ];
}

// === YARDIMCI FONKSİYONLAR ===

function createInfoCell(label, value) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: label, bold: true }),
          new TextRun({ text: ` ${value}` })
        ]
      })
    ],
    width: { size: 50, type: WidthType.PERCENTAGE }
  });
}

function createSummaryHeaderCell(text) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text,
            bold: true,
            color: "FFFFFF",
            size: 24
          })
        ],
        alignment: AlignmentType.CENTER
      })
    ],
    shading: { fill: "2E4BC7", type: "clear", color: "auto" }
  });
}

function createSummaryCell(text) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text: text, size: 22 })],
        alignment: AlignmentType.CENTER
      })
    ],
    shading: { fill: "F8F9FA", type: "clear", color: "auto" }
  });
}

function createDetailCell(label, value) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: label, bold: true, size: 22 }),
          new TextRun({ text: ` ${value}`, size: 22 })
        ]
      })
    ],
    width: { size: 50, type: WidthType.PERCENTAGE },
    shading: { fill: "F8F9FA", type: "clear", color: "auto" }
  });
}

function createTableHeaderCell(text) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text,
            bold: true,
            color: "FFFFFF",
            size: 24
          })
        ],
        alignment: AlignmentType.CENTER
      })
    ],
    shading: { fill: "495057", type: "clear", color: "auto" }
  });
}

function createTableDataCell(text) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || "-", size: 22 })]
      })
    ]
  });
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
}