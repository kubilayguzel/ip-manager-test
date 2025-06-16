/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
// functions/index.js
// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Firebase Admin SDK'yı başlat (Cloud Functions ortamında otomatik kimlik doğrular)
admin.initializeApp();

const db = admin.firestore();

// Yardımcı fonksiyon: Tarihten belirli ay öncesini/sonrasını hesaplar
function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

// Belirli bir tarihten 6 ay öncesini hesaplayan yardımcı fonksiyon (duplikasyon kontrolü için)
function getMonthsAgo(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() - months);
    return d;
}

// Her gün gece yarısı çalışacak zamanlanmış fonksiyon
exports.checkTrademarkRenewalsAndInvalidations = functions.pubsub.schedule('2 * * * *')
    .timeZone('Europe/Istanbul') // Türkiye saati
    .onRun(async (context) => {
        console.log('Marka yenileme ve geçersiz kılma kontrol fonksiyonu çalıştı!');

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Sadece tarih bazında kıyaslama için saat, dakika, saniye sıfırla

        const twelveMonthsFromNow = addMonths(today, 12);
        const sixMonthsAgo = addMonths(today, -6);

        try {
            const ipRecordsRef = db.collection('ipRecords');
            const trademarkSnapshot = await ipRecordsRef.where('type', '==', 'trademark').get();

            if (trademarkSnapshot.empty) {
                console.log('Hiç marka kaydı bulunamadı.');
                return null;
            }

            const batch = db.batch();
            let tasksCreatedCount = 0;
            let recordsInvalidatedCount = 0;
            let notificationsCreatedCount = 0;

            for (const doc of trademarkSnapshot.docs) {
                const record = doc.data();
                const recordId = doc.id;

                if (!record.renewalDate) {
                    console.log(`Marka ${record.title} (${record.applicationNumber}) için yenileme tarihi yok, atlandı.`);
                    continue;
                }

                const renewalDate = new Date(record.renewalDate);
                renewalDate.setHours(0, 0, 0, 0); // Kıyaslama için saat, dakika, saniye sıfırla

                // Senaryo 1: Yaklaşan Marka Yenilemeleri (12 Ay İçinde)
                // (Bugün <= Yenileme Tarihi <= Bugün + 12 Ay) VE henüz "Müvekkil Onayı Bekliyor" işi oluşturulmamışsa
                if (renewalDate >= today && renewalDate <= twelveMonthsFromNow) {
                    // Duplikasyon kontrolü: Son 12 ay içinde bu kayıt için otomatik "Müvekkil Onayı Bekliyor" işi var mı?
                    const existingTasksQuery = await db.collection('tasks')
                        .where('relatedIpRecordId', '==', recordId)
                        .where('taskType', '==', 'trademark_renewal')
                        .where('status', '==', 'pending_client_approval') // Sadece bu statüdeki işleri kontrol et
                        .where('isAutomated', '==', true)
                        .where('createdAt', '>', getMonthsAgo(today, 12).toISOString()) // Son 12 ayda oluşturulmuş otomatik iş
                        .limit(1)
                        .get();

                    if (existingTasksQuery.empty) {
                        const newTaskId = db.collection('tasks').doc().id; // Firestore'da otomatik ID oluştur
                        const taskData = {
                            id: newTaskId,
                            taskType: 'trademark_renewal',
                            title: `Marka Yenileme Onayı: ${record.title} (${record.applicationNumber})`,
                            description: `${record.title} markasının yenileme tarihi ${record.renewalDate} yaklaşıyor. Müvekkil onayı bekleniyor.`,
                            priority: 'high',
                            assignedTo_uid: 'S8DVLPHlt3a6aMhHxGBCHqR0ANz2', // Lütfen gerçek Admin UID ile değiştirin
                            assignedTo_email: 'sas@gmail.com', // Lütfen gerçek Admin E-postası ile değiştirin
                            dueDate: record.renewalDate,
                            status: 'pending_client_approval', // Yeni statü
                            relatedIpRecordId: recordId,
                            relatedIpRecordTitle: record.title,
                            isAutomated: true, // Bu işin otomatik oluşturulduğunu işaretle
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            history: [{
                                timestamp: new Date().toISOString(),
                                userId: 'automated_system', // Sistem kullanıcısı
                                userEmail: 'system@ipmanager.com',
                                action: `Otomatik olarak marka yenileme onay işi oluşturuldu. Yenileme Tarihi: ${record.renewalDate}`
                            }]
                        };
                        batch.set(db.collection('tasks').doc(newTaskId), taskData);
                        tasksCreatedCount++;
                        console.log(`Yeni "Müvekkil Onayı Bekliyor" işi oluşturuldu: ${record.title}`);
                    } else {
                        console.log(`Marka ${record.title} için zaten "Müvekkil Onayı Bekliyor" işi mevcut veya tamamlandı.`);
                    }
                }

                // Senaryo 2: Süresi Geçmiş ve Yenilenmemiş Markalar (6 Aydan Daha Uzun Süre Önce Geçmiş)
                // (Yenileme Tarihi < Bugün - 6 Ay) VE markanın durumu henüz "invalid_not_renewed" değilse
                if (renewalDate < sixMonthsAgo && record.status !== 'invalid_not_renewed') {
                    // Kaydın statüsünü güncelle
                    batch.update(ipRecordsRef.doc(recordId), {
                        status: 'invalid_not_renewed', // Yeni statü
                        updatedAt: new Date().toISOString()
                    });
                    recordsInvalidatedCount++;
                    console.log(`Marka ${record.title} (${record.applicationNumber}) yenilememe nedeniyle geçersiz kılındı.`);

                    // Hatırlatma bildirimi oluştur
                    const notificationRef = db.collection('notifications').doc(); // Yeni koleksiyon
                    const notificationData = {
                        id: notificationRef.id,
                        userId: 'all', // Tüm kullanıcılara veya ilgili adminlere
                        message: `Marka "${record.title}" (${record.applicationNumber}) yenilememe nedeniyle geçersiz kılınmıştır. Yenileme tarihi: ${record.renewalDate}. Lütfen kontrol edin.`,
                        type: 'warning', // Bildirim tipi
                        createdAt: new Date().toISOString(),
                        isRead: false,
                        relatedRecordId: recordId,
                        relatedRecordTitle: record.title,
                        action: 'Yenileme Gecikti'
                    };
                    batch.set(notificationRef, notificationData);
                    notificationsCreatedCount++;
                    console.log(`Hatırlatma bildirimi oluşturuldu: ${record.title}`);
                }
            }

            if (tasksCreatedCount > 0 || recordsInvalidatedCount > 0 || notificationsCreatedCount > 0) {
                await batch.commit();
                console.log(`İşlem özeti: ${tasksCreatedCount} iş oluşturuldu, ${recordsInvalidatedCount} kayıt geçersiz kılındı, ${notificationsCreatedCount} bildirim oluşturuldu.`);
            } else {
                console.log('Herhangi bir yeni işlem yapılmadı.');
            }

            return null;
        } catch (error) {
            console.error('Marka yenileme ve geçersiz kılma kontrolünde hata oluştu:', error);
            return null;
        }
    });