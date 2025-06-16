const admin = require('firebase-admin');
const { onSchedule } = require("firebase-functions/v2/scheduler"); // Yeni import

admin.initializeApp();

const db = admin.firestore();

// Yardımcı fonksiyonlar (addMonths, getMonthsAgo) aynı kalacak

// Zamanlanmış fonksiyon tanımını güncelleyin
exports.checkTrademarkRenewalsAndInvalidations = onSchedule({
        schedule: '0/3 * * * *', // Cron ifadesi aynı kalabilir veya ihtiyaca göre değiştirin
        timeZone: 'Europe/Istanbul'
    },
    async (context) => {
        console.log('Marka yenileme ve geçersiz kılma kontrol fonksiyonu çalıştı!');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const twelveMonthsFromNow = addMonths(today, 12);
        const sixMonthsAgo = addMonths(today, -6);

        try {
            // ... (fonksiyonun geri kalan tüm kodu buraya gelecek, değişiklik yok) ...

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
                    console.log(`Marka <span class="math-inline">\{record\.title\} \(</span>{record.applicationNumber}) için yenileme tarihi yok, atlandı.`);
                    continue;
                }

                const renewalDate = new Date(record.renewalDate);
                renewalDate.setHours(0, 0, 0, 0);

                // Senaryo 1: Yaklaşan Marka Yenilemeleri (12 Ay İçinde)
                if (renewalDate >= today && renewalDate <= twelveMonthsFromNow) {
                    const existingTasksQuery = await db.collection('tasks')
                        .where('relatedIpRecordId', '==', recordId)
                        .where('taskType', '==', 'trademark_renewal')
                        .where('status', '==', 'pending_client_approval')
                        .where('isAutomated', '==', true)
                        .where('createdAt', '>', getMonthsAgo(today, 12).toISOString())
                        .limit(1)
                        .get();

                    if (existingTasksQuery.empty) {
                        const newTaskId = db.collection('tasks').doc().id;
                        const taskData = {
                            id: newTaskId,
                            taskType: 'trademark_renewal',
                            title: `Marka Yenileme Onayı: <span class="math-inline">\{record\.title\} \(</span>{record.applicationNumber})`,
                            description: `${record.title} markasının yenileme tarihi ${record.renewalDate} yaklaşıyor. Müvekkil onayı bekleniyor.`,
                            priority: 'high',
                            assignedTo_uid: 'YOUR_ADMIN_UID', // Lütfen gerçek Admin UID ile değiştirin
                            assignedTo_email: 'your_admin_email@example.com', // Lütfen gerçek Admin E-postası ile değiştirin
                            dueDate: record.renewalDate,
                            status: 'pending_client_approval',
                            relatedIpRecordId: recordId,
                            relatedIpRecordTitle: record.title,
                            isAutomated: true,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            history: [{
                                timestamp: new Date().toISOString(),
                                userId: 'automated_system',
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
                if (renewalDate < sixMonthsAgo && record.status !== 'invalid_not_renewed') {
                    batch.update(ipRecordsRef.doc(recordId), {
                        status: 'invalid_not_renewed',
                        updatedAt: new Date().toISOString()
                    });
                    recordsInvalidatedCount++;
                    console.log(`Marka <span class="math-inline">\{record\.title\} \(</span>{record.applicationNumber}) yenilememe nedeniyle geçersiz kılındı.`);

                    const notificationRef = db.collection('notifications').doc();
                    const notificationData = {
                        id: notificationRef.id,
                        userId: 'all',
                        message: `Marka "<span class="math-inline">\{record\.title\}" \(</span>{record.applicationNumber}) yenilememe nedeniyle geçersiz kılınmıştır. Yenileme tarihi: ${record.renewalDate}. Lütfen kontrol edin.`,
                        type: 'warning',
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