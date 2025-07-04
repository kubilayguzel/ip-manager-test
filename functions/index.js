// functions/index.js
const functions = require('firebase-functions');
const cors = require('cors');
const fetch = require('node-fetch');

const admin = require('firebase-admin');
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

    try {
      // 1. Kuralı Bul
      console.log("Doğru şablon kuralı aranıyor...");
      const rulesSnapshot = await db.collection("template_rules")
        .where("sourceType", "==", "document")
        .where("mainProcessType", "==", newDocument.mainProcessType)
        .where("subProcessType", "==", newDocument.subProcessType)
        .limit(1)
        .get();

      if (rulesSnapshot.empty) {
        console.log("Bu belge tipi için uygun bir kural bulunamadı. İşlem sonlandırılıyor.");
        return null;
      }

      const rule = rulesSnapshot.docs[0].data();
      console.log(`Kural bulundu. Kullanılacak şablon ID: ${rule.templateId}`);

      // 2. Mail Şablonunu Al
      console.log("Mail şablonu veritabanından alınıyor...");
      const templateSnapshot = await db.collection("mail_templates").doc(rule.templateId).get();

      if (!templateSnapshot.exists) {
          console.error(`Hata: ${rule.templateId} ID'li mail şablonu bulunamadı!`);
          return null;
      }
      const template = templateSnapshot.data();

      // 3. Müvekkil Bilgilerini Al (Varsayım: newDocument içinde clientId var)
      console.log("Müvekkil bilgileri alınıyor...");
      const clientSnapshot = await db.collection("clients").doc(newDocument.clientId).get();
      if (!clientSnapshot.exists) {
        console.error(`Hata: ${newDocument.clientId} ID'li müvekkil bulunamadı!`);
        return null;
      }
      const client = clientSnapshot.data();

      // 4. Parametreleri Doldur
      console.log("Parametreler dolduruluyor...");
      let subject = template.subject;
      let body = template.body;

      const parameters = { ...client, ...newDocument };

      for (const key in parameters) {
          const placeholder = new RegExp(`{{${key}}}`, "g");
          subject = subject.replace(placeholder, parameters[key]);
          body = body.replace(placeholder, parameters[key]);
      }
      console.log("Nihai mail içeriği oluşturuldu.");

      // 5. Mail Bildirimini Oluştur
      console.log("'mail_notifications' koleksiyonuna kayıt ekleniyor...");
      const notificationData = {
        recipientEmail: client.email,
        clientId: newDocument.clientId,
        subject: subject,
        body: body,
        status: "pending",
        sourceDocumentId: context.params.docId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await db.collection("mail_notifications").add(notificationData);
      console.log("Mail bildirimi başarıyla oluşturuldu ve gönderim için sıraya alındı.");

      return null;

    } catch (error) {
      console.error("Mail bildirimi oluşturulurken beklenmedik bir hata oluştu:", error);
      return null;
    }
  });

  // --- YENİ EKLENEN ÇAĞRILABİLİR E-POSTA GÖNDERME FONKSİYONU ---

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { google } = require("googleapis");
const { GoogleAuth } = require("google-auth-library");

// Gmail API için gerekli yetki kapsamı
const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send"];

/**
 * Ön yüzden çağrılarak 'mail_notifications' koleksiyonundaki bir bildirimi
 * Gmail API üzerinden gönderir.
 */
exports.sendEmailNotification = onCall(async (request) => {
  // 1. Yeni: Fonksiyonu çağıran kullanıcının e-postasını al
  const userEmail = request.data.userEmail; // Arayüzden bu bilgiyi göndermemiz gerekecek
  const notificationId = request.data.notificationId;

  if (!notificationId || !userEmail) {
    throw new HttpsError("invalid-argument", "notificationId ve userEmail parametreleri zorunludur.");
  }
  
  // ... (notification dökümanını alma kodu aynı kalıyor) ...
  const notificationRef = db.collection("mail_notifications").doc(notificationId);
  const notificationDoc = await notificationRef.get();
  if (!notificationDoc.exists) { throw new HttpsError("not-found", "Bildirim bulunamadı.");}
  const notificationData = notificationDoc.data();

  // 2. Yeni: Kimlik doğrulamayı, taklit edilecek kullanıcıyı belirterek yap
  const auth = new GoogleAuth({
    scopes: GMAIL_SCOPES,
    // Kimi taklit edeceğimizi 'subject' ile belirtiyoruz
    clientOptions: {
      subject: userEmail 
    }
  });
  const authClient = await auth.getClient();
  const gmail = google.gmail({ version: "v1", auth: authClient });

  // 3. Yeni: "From" alanını dinamik olarak ayarla
  const rawMessage = [
    `From: <${userEmail}>`, // "IP Manager" gibi bir isim de ekleyebilirsiniz
    `To: ${notificationData.recipientEmail}`,
    `Content-Type: text/html; charset=utf-8`,
    `MIME-Version: 1.0`,
    `Subject: =?utf-8?B?${Buffer.from(notificationData.subject).toString("base64")}?=`, // Türkçe karakterler için
    "",
    notificationData.body,
  ].join("\n");

  const encodedMessage = Buffer.from(rawMessage).toString("base64")
                                .replace(/\+/g, "-")
                                .replace(/\//g, "_")
                                .replace(/=+$/, "");

  try {
    console.log("Gmail API'ye gönderme isteği yapılıyor...");
    await gmail.users.messages.send({
      userId: "me", // 'me' anahtar kelimesi, kimliği doğrulanmış kullanıcıyı ifade eder
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log("E-posta başarıyla gönderildi.");
    // Firestore'daki dökümanın durumunu güncelle
    await notificationRef.update({
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, message: "E-posta başarıyla gönderildi." };

  } catch (error) {
    console.error("Gmail API hatası:", error);
    // Hata durumunda dökümanın durumunu güncelle
    await notificationRef.update({
      status: "failed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      errorInfo: error.message,
    });
    throw new HttpsError("internal", "E-posta gönderilirken bir hata oluştu.", error.message);
  }
});
exports.createMailNotificationOnDocumentStatusChange = functions.firestore
  .document("unindexed_pdfs/{docId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Sadece status 'indexed' olduğunda tetikle
    if (before.status !== 'indexed' && after.status === 'indexed') {
      console.log(`Belge indexlendi: ${context.params.docId}`, after);

      const admin = require("firebase-admin");
      if (!admin.apps.length) {
        admin.initializeApp();
      }
      const db = admin.firestore();

      try {
        // Şablon kuralını bul
        const rulesSnapshot = await db.collection("template_rules")
          .where("sourceType", "==", "document")
          .where("mainProcessType", "==", after.mainProcessType)
          .where("subProcessType", "==", after.subProcessType)
          .limit(1)
          .get();

        if (rulesSnapshot.empty) {
          console.log("Kural bulunamadı, işlem sonlandırılıyor.");
          return null;
        }

        const rule = rulesSnapshot.docs[0].data();
        const templateSnapshot = await db.collection("mail_templates").doc(rule.templateId).get();

        if (!templateSnapshot.exists) {
          console.error(`Şablon bulunamadı: ${rule.templateId}`);
          return null;
        }

        const template = templateSnapshot.data();

        // Müvekkil bilgilerini al
        const clientSnapshot = await db.collection("clients").doc(after.clientId).get();
        if (!clientSnapshot.exists) {
          console.error(`Müvekkil bulunamadı: ${after.clientId}`);
          return null;
        }
        const client = clientSnapshot.data();

        // Şablon parametrelerini doldur
        let subject = template.subject;
        let body = template.body;
        const parameters = { ...client, ...after };

        for (const key in parameters) {
          const placeholder = new RegExp(`{{${key}}}`, "g");
          subject = subject.replace(placeholder, parameters[key]);
          body = body.replace(placeholder, parameters[key]);
        }

        // Bildirimi oluştur
        const notificationData = {
          recipientEmail: client.email,
          clientId: after.clientId,
          subject: subject,
          body: body,
          status: "pending",
          sourceDocumentId: context.params.docId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await db.collection("mail_notifications").add(notificationData);
        console.log("Mail bildirimi başarıyla oluşturuldu.");

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
