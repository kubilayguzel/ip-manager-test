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
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
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

// === Recipient Helpers ===
function mapMainProcessTypeToDomain(mainProcessType) {
    if ((mainProcessType || '').toLowerCase() === 'trademark') return 'marka';
    return 'marka'; // genişletilebilir: patent/tasarım
}

async function resolveRecipientsForDomain(ipRecord, domain) {
    const toSet = new Set();
    const ccSet = new Set();

    const applicantIds = Array.isArray(ipRecord?.owners)
        ? ipRecord.owners.map(o => o?.id).filter(Boolean)
        : [];

    if (applicantIds.length === 0) return { toList: [], ccList: [] };

    const ids = applicantIds.slice(0, 10); // Firestore IN max 10
    const prSnap = await db.collection('personsRelated')
        .where('personId', 'in', ids)
        .get();

    for (const doc of prSnap.docs) {
        const rel = doc.data() || {};
        if (rel?.responsible?.[domain] !== true) continue;

        const relatedPersonId = rel.personId;
        if (!relatedPersonId) continue;

        const pSnap = await db.collection('persons').doc(relatedPersonId).get();
        if (!pSnap.exists) continue;

        const email = (pSnap.data()?.email || '').trim();
        if (!email) continue;

        const n = rel?.notify?.[domain] || {};
        if (n.to === true) toSet.add(email);
        if (n.cc === true) ccSet.add(email);
    }

    return { toList: [...toSet], ccList: [...ccSet] };
}
// === /Recipient Helpers ===

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
//           HTTPS FONKSİYONLARI (v2)
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
    { region: 'europe-west1' },
    async (request) => {
        const { notificationId } = request.data;
        if (!notificationId) {
            throw new HttpsError("invalid-argument", "notificationId parametresi zorunludur.");
        }
        const ref = db.collection("mail_notifications").doc(notificationId);
        const snap = await ref.get();
        if (!snap.exists) {
            throw new HttpsError("not-found", "Bildirim bulunamadı.");
        }
        const n = snap.data();
        const toList = Array.isArray(n.toList) ? n.toList : (n.recipientEmail ? [n.recipientEmail] : []);
        const ccList = Array.isArray(n.ccList) ? n.ccList : [];
        if (toList.length === 0 && ccList.length === 0) {
            await ref.update({
                status: "missing_info",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                errorInfo: "Alıcı listesi boş (to/cc)."
            });
            throw new HttpsError("failed-precondition", "Alıcı listesi boş.");
        }
        const mailOptions = {
            from: `"IP Manager" <kubilayguzel@evrekapatent.com>`,
            to: toList.join(','),
            cc: ccList.length ? ccList.join(',') : undefined,
            subject: n.subject,
            html: n.body
        };
        try {
            await transporter.sendMail(mailOptions);
            await ref.update({
                status: "sent",
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            await ref.update({
                status: "failed",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                errorInfo: error.message
            });
            throw new HttpsError("internal", "E-posta gönderilirken hata oluştu.", error.message);
        }
    }
);

// =========================================================
//           SCHEDULER FONKSİYONLARI (v2)
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
//           FIRESTORE TRIGGER FONKSİYONLARI (v2)
// =========================================================

export const createMailNotificationOnDocumentIndexV2 = onDocumentCreated(
    { document: "indexed_documents/{docId}", region: 'europe-west1' },
    async (event) => {
        const newDocument = event.data.data();
        const docId = event.params.docId;

        let missingFields = [];
        let subject = "", body = "", status = "pending";

        try {
            const ruleQs = await db.collection("template_rules")
                .where("sourceType", "==", "document")
                .where("mainProcessType", "==", newDocument.mainProcessType)
                .where("subProcessType", "==", newDocument.subProcessType)
                .limit(1).get();
            const rule = ruleQs.empty ? null : ruleQs.docs[0].data();
            const template = rule ? (await db.collection("mail_templates").doc(rule.templateId).get()).data() : null;
            if (!rule) missingFields.push("templateRule");
            if (!template) missingFields.push("mailTemplate");

            if (template) {
                const params = { ...newDocument };
                subject = (template.subject || "").replace(/{{(.*?)}}/g, (m, p) => params[p.trim()] ?? m);
                body = (template.body || "").replace(/{{(.*?)}}/g, (m, p) => params[p.trim()] ?? m);
            } else {
                subject = "Eksik Bilgi: Bildirim Tamamlanamadı";
                body = "Şablon bulunamadı.";
                status = "missing_info";
            }

            const domain = mapMainProcessTypeToDomain(newDocument.mainProcessType);
            let toList = [], ccList = [], ipRecordId = newDocument.ipRecordId || null;
            if (ipRecordId) {
                const ipSnap = await db.collection('ipRecords').doc(ipRecordId).get();
                if (ipSnap.exists) {
                    const lists = await resolveRecipientsForDomain(ipSnap.data(), domain);
                    toList = lists.toList; ccList = lists.ccList;
                }
            }

            if (!subject) missingFields.push("subject");
            if (!body) missingFields.push("body");
            if (toList.length === 0 && ccList.length === 0) missingFields.push("recipientEmail");
            if (missingFields.length) status = "missing_info";

            await db.collection("mail_notifications").add({
                toList, ccList, domain,
                ipRecordId: ipRecordId || null,
                subject, body, status, missingFields,
                sourceDocumentId: docId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return null;
        } catch (e) {
            console.error("createMailNotificationOnDocumentIndexV2 error:", e);
            return null;
        }
    }
);

export const createMailNotificationOnDocumentStatusChangeV2 = onDocumentUpdated(
    { document: "unindexed_pdfs/{docId}", region: 'europe-west1' },
    async (event) => {
        const before = event.data.before.data() || {};
        const after = event.data.after.data() || {};
        const docId = event.params.docId;

        if (!(before.status !== 'indexed' && after.status === 'indexed')) {
            return null;
        }

        try {
            let status = "pending";
            const ruleQs = await db.collection("template_rules")
                .where("sourceType", "==", "document")
                .where("mainProcessType", "==", after.mainProcessType)
                .where("subProcessType", "==", after.subProcessType)
                .limit(1).get();
            const rule = ruleQs.empty ? null : ruleQs.docs[0].data();
            const template = rule ? (await db.collection("mail_templates").doc(rule.templateId).get()).data() : null;
            if (!rule || !template) status = "missing_info";

            const params = { ...after };
            const subject = template ? (template.subject || "").replace(/{{(.*?)}}/g, (m, p) => params[p.trim()] ?? m)
                : "Eksik Bilgi: Bildirim Tamamlanamadı";
            const body = template ? (template.body || "").replace(/{{(.*?)}}/g, (m, p) => params[p.trim()] ?? m)
                : "Şablon bulunamadı veya eksik.";

            const domain = mapMainProcessTypeToDomain(after.mainProcessType);
            let toList = [], ccList = [], ipRecordId = after.ipRecordId || null;
            if (ipRecordId) {
                const ipSnap = await db.collection('ipRecords').doc(ipRecordId).get();
                if (ipSnap.exists) {
                    const lists = await resolveRecipientsForDomain(ipSnap.data(), domain);
                    toList = lists.toList; ccList = lists.ccList;
                }
            }

            const missingFields = [];
            if (!subject) missingFields.push('subject');
            if (!body) missingFields.push('body');
            if (toList.length === 0 && ccList.length === 0) missingFields.push('recipientEmail');
            if (!template) missingFields.push('template');
            if (missingFields.length) status = "missing_info";

            await db.collection("mail_notifications").add({
                toList, ccList, domain,
                ipRecordId: ipRecordId || null,
                subject, body, status, missingFields,
                sourceDocumentId: docId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return null;
        } catch (e) {
            console.error("createMailNotificationOnDocumentStatusChangeV2 error:", e);
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
//           STORAGE TRIGGER FONKSİYONLARI (v2)
// =========================================================

export const processTrademarkBulletinUploadV3 = onObjectFinalized(
    {
        region: "europe-west1",
        timeoutSeconds: 540,
        memory: "2GiB"
    },
    async (event) => {
        const filePath = event.data.name || "";
        const fileName = path.basename(filePath);

        if (!filePath.startsWith("bulletins/") || !fileName.toLowerCase().endsWith(".zip")) {
            return null;
        }

        console.log("🔥 Trademark Bulletin Upload V3 başladı:", filePath);

        const bucket = admin.storage().bucket();
        const tempFilePath = path.join(os.tmpdir(), fileName);
        const extractDir = path.join(os.tmpdir(), `extract_${Date.now()}`);

        try {
            await downloadWithStream(bucket.file(filePath), tempFilePath);

            fs.mkdirSync(extractDir, { recursive: true });
            await extractZipStreaming(tempFilePath, extractDir);

            const allFiles = listAllFilesRecursive(extractDir);

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

            const scriptPath = allFiles.find(
                (p) => path.basename(p).toLowerCase() === "tmbulletin.log"
            );
            if (!scriptPath) throw new Error("tmbulletin.log bulunamadı.");

            const records = await parseScriptContentStreaming(scriptPath);

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

            const CHUNK_SIZE = 200;
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

            await writeBatchesToFirestore(records, bulletinId, bulletinNo, imagePathMap);

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
//           HELPER FONKSİYONLARI
// =========================================================
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

        const match = line.match(/INSERT INTO (\w+) VALUES\s*\((.*)\)$/);
        if (!match) {
            if (insertCount <= 5) {
                console.warn(`⚠️ Regex eşleşmedi (satır ${i + 1}): ${line.substring(0, 100)}...`);
            }
            continue;
        }

        const table = match[1].toUpperCase();
        const valuesRaw = match[2];

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
            console.log(`📋 Silinecek bülten: ${bulletenNo}`);

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

// ======== Yardımcı Fonksiyonlar ve Algoritmalar ========
const GENERIC_WORDS = [
    'ltd', 'şti', 'aş', 'anonim', 'şirketi', 'şirket', 'limited', 'inc', 'corp', 'corporation', 'co', 'company', 'llc', 'group', 'grup',
    'sanayi', 'ticaret', 'turizm', 'tekstil', 'gıda', 'inşaat', 'danışmanlık', 'hizmet', 'hizmetleri', 'bilişim', 'teknoloji', 'sigorta', 'yayıncılık', 'mobilya', 'otomotiv', 'tarım', 'enerji', 'petrol', 'kimya', 'kozmetik', 'ilaç', 'medikal', 'sağlık', 'eğitim', 'spor', 'müzik', 'film', 'medya', 'reklam', 'pazarlama', 'lojistik', 'nakliyat', 'kargo', 'finans', 'bankacılık', 'emlak', 'gayrimenkul', 'madencilik', 'metal', 'plastik', 'cam', 'seramik', 'ahşap',
    'mühendislik', 'proje', 'taahhüt', 'ithalat', 'ihracat', 'üretim', 'imalat', 'veteriner', 'petshop', 'polikliniği', 'hastane', 'klinik', 'müşavirlik', 'muhasebe', 'hukuk', 'avukatlık', 'mimarlık', 'peyzaj', 'tasarım', 'dizayn', 'design', 'grafik', 'web', 'yazılım', 'software', 'donanım', 'hardware', 'elektronik', 'elektrik', 'makina', 'makine', 'endüstri', 'fabrika', 'laboratuvar', 'araştırma', 'geliştirme', 'ofis',
    'ürün',
    'products', 'services', 'solutions', 'çözüm',
    'sistem', 'systems', 'teknolojileri', 'teknoloji',
    'malzeme', 'materials', 'ekipman', 'equipment', 'cihaz', 'device', 'araç', 'tools', 'yedek', 'parça', 'parts', 'aksesuar', 'accessories', 'gereç', 'malzeme',
    'meşhur', 'ünlü', 'famous', 'since', 'est', 'established', 'tarihi', 'historical', 'geleneksel', 'traditional', 'klasik', 'classic', 'yeni', 'new', 'fresh', 'taze', 'özel', 'special', 'premium', 'lüks', 'luxury', 'kalite',
    'quality', 'uygun',
    'turkey', 'türkiye', 'international', 'uluslararası',
    'realestate', 'emlak', 'konut', 'housing', 'arsa', 'ticari', 'commercial', 'ofis', 'office', 'plaza', 'shopping', 'alışveriş', 'residence', 'rezidans', 'villa', 'apartment', 'daire',
    'online', 'digital', 'dijital', 'internet', 'web', 'app', 'mobile', 'mobil', 'network', 'ağ', 'server', 'sunucu', 'hosting', 'domain', 'platform', 'social', 'sosyal', 'media', 'medya',
    'gıda', 'food', 'yemek', 'restaurant', 'restoran', 'cafe', 'kahve', 'coffee', 'çay', 'tea', 'fırın', 'bakery', 'ekmek', 'bread', 'pasta', 'börek', 'pizza', 'burger', 'kebap', 'döner', 'pide', 'lahmacun', 'balık', 'fish', 'et', 'meat', 'tavuk', 'chicken', 'sebze', 'vegetable', 'meyve', 'fruit', 'süt', 'milk', 'peynir', 'cheese', 'yoğurt', 'yogurt', 'dondurma', 'şeker', 'sugar', 'bal', 'reçel', 'jam', 'konserve', 'canned', 'organic', 'organik', 'doğal', 'natural', 'taze', 'fresh',
    've', 'ile', 'için', 'bir', 'bu', 'da', 'de', 'ki', 'mi', 'mı', 'mu', 'mü',
    'sadece', 'tek', 'en', 'çok', 'az', 'üst', 'alt', 'yeni', 'eski'
];

function removeTurkishSuffixes(word) {
    if (!word) return '';

    if (word.endsWith('ler') || word.endsWith('lar')) {
        return word.substring(0, word.length - 3);
    }
    if (word.endsWith('si') || word.endsWith('sı') || word.endsWith('sü') || word.endsWith('su')) {
        return word.substring(0, word.length - 2);
    }
    if (word.endsWith('i') || word.endsWith('ı') || word.endsWith('u') || word.endsWith('ü')) {
        if (word.length > 2 && ['i', 'ı', 'u', 'ü'].includes(word[word.length - 1])) {
            return word.substring(0, word.length - 1);
        }
    }

    return word;
}

export function cleanMarkName(name, removeGenericWords = true) {
    if (!name) return '';
    let cleaned = name.toLowerCase().replace(/[^a-z0-9ğüşöçı\s]/g, '').trim();

    cleaned = cleaned.replace(/\s+/g, ' ');

    if (removeGenericWords) {
        cleaned = cleaned.split(' ').filter(word => {
            const stemmedWord = removeTurkishSuffixes(word);
            return !GENERIC_WORDS.includes(stemmedWord) && !GENERIC_WORDS.includes(word);
        }).join(' ');
    }

    return cleaned.trim();
}

const visualMap = {
    "a": ["e", "o"], "b": ["d", "p"], "c": ["ç", "s"], "ç": ["c", "s"], "d": ["b", "p"], "e": ["a", "o"], "f": ["t"],
    "g": ["ğ", "q"], "ğ": ["g", "q"], "h": ["n"], "i": ["l", "j", "ı"], "ı": ["i"], "j": ["i", "y"], "k": ["q", "x"],
    "l": ["i", "1"], "m": ["n"], "n": ["m", "r"], "o": ["a", "0", "ö"], "ö": ["o"], "p": ["b", "q"], "q": ["g", "k"],
    "r": ["n"], "s": ["ş", "c", "z"], "ş": ["s", "z"], "t": ["f"], "u": ["ü", "v"], "ü": ["u", "v"], "v": ["u", "ü", "w"],
    "w": ["v"], "x": ["ks"], "y": ["j"], "z": ["s", "ş"], "0": ["o"], "1": ["l", "i"], "ks": ["x"], "Q": ["O", "0"],
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

    const parts = value.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);

        if (day > 0 && day <= 31 && month >= 0 && month <= 11 && year > 1900) {
            return new Date(year, month, day);
        }
    }

    const isoDate = new Date(value);
    return isNaN(isoDate) ? null : isoDate;
}

function isValidBasedOnDate(hitDate, monitoredDate) {
    if (!hitDate || !monitoredDate) return true;

    const hit = parseDate(hitDate);
    const monitored = parseDate(monitoredDate);

    if (!hit || !monitored || isNaN(hit) || isNaN(monitored)) return true;

    return hit >= monitored;
}

function hasOverlappingNiceClasses(monitoredNiceClasses, recordNiceClasses) {
    logger.log("🏷️ Nice sınıf karşılaştırması:", {
        monitoredNiceClasses,
        recordNiceClasses,
        monitoredType: typeof monitoredNiceClasses,
        recordType: typeof recordNiceClasses
    });

    try {
        if (!monitoredNiceClasses || (Array.isArray(monitoredNiceClasses) && monitoredNiceClasses.length === 0)) {
            logger.log("ℹ️ İzlenen markanın nice sınıfı yok, filtre atlanıyor");
            return true;
        }

        if (!recordNiceClasses) {
            logger.log("ℹ️ Kayıtta nice sınıf yok, çakışma yok");
            return false;
        }

        const normalizeNiceClasses = (classes) => {
            if (!classes) return [];

            let classArray = [];

            if (Array.isArray(classes)) {
                classArray = classes;
            } else if (typeof classes === 'string') {
                classArray = classes.split(/[\s\/,]+/).filter(c => c.trim());
            } else {
                classArray = [String(classes)];
            }

            return classArray
                .map(cls => String(cls).replace(/\D/g, ''))
                .filter(cls => cls && cls.length > 0);
        };

        const monitoredClasses = normalizeNiceClasses(monitoredNiceClasses);
        const recordClasses = normalizeNiceClasses(recordNiceClasses);

        logger.log("🔧 Normalize edilmiş sınıflar:", {
            monitoredClasses,
            recordClasses
        });

        if (monitoredClasses.length === 0 && recordClasses.length === 0) {
            logger.log("ℹ️ Her iki liste de boş, kabul ediliyor");
            return true;
        }

        if (monitoredClasses.length === 0) {
            logger.log("ℹ️ İzlenen marka sınıfları boş, kabul ediliyor");
            return true;
        }

        if (recordClasses.length === 0) {
            logger.log("ℹ️ Kayıt sınıfları boş, çakışma yok");
            return false;
        }

        const hasOverlap = monitoredClasses.some(monitoredClass =>
            recordClasses.some(recordClass => monitoredClass === recordClass)
        );

        logger.log(`🏷️ Nice sınıf kesişimi: ${hasOverlap ? 'VAR' : 'YOK'}`);

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
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
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
    const isSearchMultiWord = searchMarkName.trim().split(/\s+/).length > 1;
    const isHitMultiWord = (hitMarkName || '').trim().split(/\s+/).length > 1;

    const cleanedSearchName = cleanMarkName(searchMarkName || '', isSearchMultiWord).toLowerCase().trim();
    const cleanedHitName = cleanMarkName(hitMarkName || '', isHitMultiWord).toLowerCase().trim();

    logger.log(`📊 Skorlama: '${searchMarkName}' (temizlenmiş: '${cleanedSearchName}') vs '${hitMarkName}' (temizlenmiş: '${cleanedHitName}')`);

    if (!cleanedSearchName || !cleanedHitName) {
        return { finalScore: 0.0, positionalExactMatchScore: 0.0 };
    }

    if (cleanedSearchName === cleanedHitName) {
        return { finalScore: 1.0, positionalExactMatchScore: 1.0 };
    }

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
                    matrix[i - 1][j - 1] + cost,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
        const maxLength = Math.max(cleanedSearchName.length, cleanedHitName.length);
        return maxLength === 0 ? 1.0 : 1.0 - (matrix[cleanedHitName.length][cleanedSearchName.length] / maxLength);
    })();
    logger.log(`    - Levenshtein Score: ${levenshteinScore.toFixed(2)}`);

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
    logger.log(`    - Jaro-Winkler Score: ${jaroWinklerScore.toFixed(2)}`);

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
    logger.log(`    - N-gram Score (n=2): ${ngramScore.toFixed(2)}`);

    const visualScore = (() => {
        const visualPenalty = visualMismatchPenalty(cleanedSearchName, cleanedHitName);
        const maxPossibleVisualPenalty = Math.max(cleanedSearchName.length, cleanedHitName.length) * 1.0;
        return maxPossibleVisualPenalty === 0 ? 1.0 : (1.0 - (visualPenalty / maxPossibleVisualPenalty));
    })();
    logger.log(`    - Visual Score: ${visualScore.toFixed(2)}`);

    const prefixScore = (() => {
        const s1 = cleanedSearchName;
        const s2 = cleanedHitName;
        const length = 3;
        if (!s1 || !s2) return 0.0;
        const prefix1 = s1.substring(0, Math.min(s1.length, length));
        const prefix2 = s2.substring(0, Math.min(s2.length, length));

        if (prefix1 === prefix2) return 1.0;
        if (prefix1.length === 0 && prefix2.length === 0) return 1.0;

        return levenshteinSimilarity(prefix1, prefix2);
    })();
    logger.log(`    - Prefix Score (len 3): ${prefixScore.toFixed(2)}`);

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
    logger.log(`    - Max Word Score: ${maxWordScore.toFixed(2)}`);

    const positionalExactMatchScore = (() => {
        const s1 = cleanedSearchName;
        const s2 = cleanedHitName;
        if (!s1 || !s2) return 0.0;

        const len = Math.min(s1.length, s2.length, 3);
        if (len === 0) return 0.0;

        for (let i = 0; i < len; i++) {
            if (s1[i] !== s2[i]) {
                return 0.0;
            }
        }
        return 1.0;
    })();
    logger.log(`    - Positional Exact Match Score (first 3 chars): ${positionalExactMatchScore.toFixed(2)}`);

    const HIGH_WORD_SIMILARITY_THRESHOLD = 0.70;

    if (maxWordScore >= HIGH_WORD_SIMILARITY_THRESHOLD) {
        logger.log(`    *** Yüksek kelime bazında benzerlik tespit edildi (${(maxWordScore * 100).toFixed(0)}%), doğrudan skor olarak kullanılıyor. ***`);
        return { finalScore: maxWordScore, positionalExactMatchScore: positionalExactMatchScore };
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
    logger.log(`    - Name Similarity (weighted 95%): ${nameSimilarityWeighted.toFixed(2)}`);

    const phoneticScoreRaw = isPhoneticallySimilar(searchMarkName, hitMarkName);
    const phoneticSimilarityWeighted = phoneticScoreRaw * 0.05;
    logger.log(`    - Phonetic Score (weighted 5%): ${phoneticSimilarityWeighted.toFixed(2)}`);

    let finalScore = nameSimilarityWeighted + phoneticSimilarityWeighted;

    finalScore = Math.max(0.0, Math.min(1.0, finalScore));

    logger.log(`    - FINAL SCORE: ${finalScore.toFixed(2)}\n`);
    return { finalScore: finalScore, positionalExactMatchScore: positionalExactMatchScore };
}

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

            bulletinRecordsSnapshot = await db.collection('trademarkBulletinRecords')
                .where('bulletinId', '==', selectedBulletinId)
                .get();

            if (!bulletinRecordsSnapshot || bulletinRecordsSnapshot.empty) {
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

                const cleanedSearchName = cleanMarkName(markName, markName.trim().split(/\s+/).length > 1);

                logger.log(`🔎 Arama: '${markName}' (ID: ${monitoredMark.id})`);

                let matchCount = 0;

                for (const hit of bulletinRecords) {
                    if (!isValidBasedOnDate(hit.applicationDate, applicationDate)) {
                        continue;
                    }

                    const hasNiceClassOverlap = true;

                    const { finalScore: similarityScore, positionalExactMatchScore } = calculateSimilarityScoreInternal(
                        hit.markName,
                        markName,
                        hit.applicationDate,
                        applicationDate,
                        hit.niceClasses,
                        niceClasses
                    );

                    const SIMILARITY_THRESHOLD = 0.5;

                    const cleanedHitName = cleanMarkName(hit.markName, (hit.markName || '').trim().split(/\s+/).length > 1);
                    let isPrefixSuffixExactMatch = false;

                    const MIN_SEARCH_LENGTH = 3;

                    if (cleanedSearchName.length >= MIN_SEARCH_LENGTH) {
                        const searchWords = cleanedSearchName.split(' ').filter(word => word.length >= MIN_SEARCH_LENGTH);

                        for (const searchWord of searchWords) {
                            if (cleanedHitName.includes(searchWord)) {
                                isPrefixSuffixExactMatch = true;
                                logger.log(`🎯 Tam eşleşme bulundu: '${searchWord}' kelimesi '${cleanedHitName}' içinde geçiyor`);
                                break;
                            }
                        }

                        if (!isPrefixSuffixExactMatch && cleanedHitName.includes(cleanedSearchName)) {
                            isPrefixSuffixExactMatch = true;
                            logger.log(`🎯 Tam eşleşme bulundu: '${cleanedSearchName}' tamamı '${cleanedHitName}' içinde geçiyor`);
                        }
                    }

                    if (
                        similarityScore < SIMILARITY_THRESHOLD &&
                        positionalExactMatchScore < SIMILARITY_THRESHOLD &&
                        !isPrefixSuffixExactMatch
                    ) {
                        logger.log(`⏩ Atlandı: Final Skor: ${similarityScore.toFixed(2)}, Positional: ${positionalExactMatchScore.toFixed(2)}, Prefix/Suffix Eşleşme Yok - ${hit.markName}`);
                        continue;
                    }

                    matchCount++;

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
                        sameClass: hasNiceClassOverlap,

                        monitoredTrademark: markName,
                        monitoredNiceClasses: niceClasses,
                        monitoredTrademarkId: monitoredMark.id
                    });
                }

                logger.log(`📊 '${markName}' (ID: ${monitoredMark.id}) için ${matchCount} eşleşme bulundu`);
            }

            allResults.sort((a, b) => b.similarityScore - a.similarityScore);

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

            const owners = {};
            results.forEach((m) => {
                const owner = (m.monitoredMark && m.monitoredMark.ownerName) || "Bilinmeyen Sahip";
                if (!owners[owner]) owners[owner] = [];
                owners[owner].push(m);
            });

            const archive = archiver("zip", { zlib: { level: 9 } });
            const passthrough = new stream.PassThrough();
            archive.pipe(passthrough);

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

async function createProfessionalReport(ownerName, matches) {
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

    reportContent.push(...createReportHeader(ownerName, matches.length));

    reportContent.push(...createExecutiveSummary(grouped));

    reportContent.push(new Paragraph({
        children: [new PageBreak()]
    }));

    for (const [index, group] of Object.entries(grouped).entries()) {
        if (index > 0) {
            reportContent.push(new Paragraph({
                children: [new PageBreak()]
            }));
        }

        const [_, g] = group;
        reportContent.push(...createDetailedAnalysisSection(g, index + 1));
    }

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

function createReportHeader(ownerName, totalMatches) {
    const currentDate = new Date().toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    return [
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

function createExecutiveSummary(grouped) {
    const totalSimilarMarks = Object.keys(grouped).length;
    const totalMonitoredMarks = Object.values(grouped).reduce((sum, g) => sum + g.monitoredMarks.length, 0);

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

function createDetailedAnalysisSection(group, sectionIndex) {
    const elements = [];
    const similarMark = group.similarMark;
    const similarity = parseFloat(similarMark.similarity) || 0;

    let riskLevel = "DÜŞÜK";
    let riskColor = "28A745";
    if (similarity >= 70) {
        riskLevel = "YÜKSEK";
        riskColor = "DC3545";
    } else if (similarity >= 50) {
        riskLevel = "ORTA";
        riskColor = "FFC107";
    }

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