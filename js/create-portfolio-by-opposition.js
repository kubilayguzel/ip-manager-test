// js/create-portfolio-by-opposition.js
// Yayına İtiraz işi oluşturulduğunda otomatik 3.taraf portföy kaydı oluşturma

import { getFirestore, doc, getDoc, addDoc, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

class PortfolioByOppositionCreator {
    constructor() {
        this.db = null;
        this.initFirebase();
    }

    initFirebase() {
        try {
            if (typeof getFirestore === 'function') {
                this.db = getFirestore();
                console.log('✅ PortfolioByOpposition: Firebase initialized');
            } else {
                console.error('❌ PortfolioByOpposition: Firebase not available');
            }
        } catch (error) {
            console.error('❌ PortfolioByOpposition Firebase init error:', error);
        }
    }

    /**
     * Bulletin kaydından 3.taraf portföy kaydı oluşturur
     * @param {string} bulletinRecordId - Seçilen bulletin kaydının ID'si
     * @param {string} transactionId - İtiraz işinin ID'si
     * @returns {Object} Oluşturulan portföy kaydı bilgisi
     */
    async createThirdPartyPortfolioFromBulletin(bulletinRecordId, transactionId) {
        try {
            console.log('🔄 3.taraf portföy kaydı oluşturuluyor...', { bulletinRecordId, transactionId });

            // 1. Bulletin kaydını al
            const bulletinData = await this.getBulletinRecord(bulletinRecordId);
            if (!bulletinData.success) {
                return { success: false, error: bulletinData.error };
            }

            // 2. Bulletin verisini portföy formatına dönüştür
            const portfolioData = this.mapBulletinToPortfolio(bulletinData.data, transactionId);

            // 3. Portföy kaydını oluştur
            const result = await this.createPortfolioRecord(portfolioData);

            if (result.success) {
                console.log('✅ 3.taraf portföy kaydı başarıyla oluşturuldu:', result.recordId);
                return {
                    success: true,
                    recordId: result.recordId,
                    message: '3.taraf portföy kaydı başarıyla oluşturuldu'
                };
            } else {
                return { success: false, error: result.error };
            }

        } catch (error) {
            console.error('❌ 3.taraf portföy kaydı oluşturma hatası:', error);
            return { 
                success: false, 
                error: `Portföy kaydı oluşturulamadı: ${error.message}` 
            };
        }
    }

    /**
     * Bulletin kaydını Firestore'dan alır
     * @param {string} bulletinRecordId - Bulletin kayıt ID'si
     * @returns {Object} Bulletin verisi
     */
    async getBulletinRecord(bulletinRecordId) {
        try {
            if (!this.db) {
                return { success: false, error: 'Firebase bağlantısı bulunamadı' };
            }

            const docRef = doc(this.db, 'trademarkBulletinRecords', bulletinRecordId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                return { success: false, error: 'Bulletin kaydı bulunamadı' };
            }

            const data = docSnap.data();
            console.log('📄 Bulletin kaydı alındı:', data.markName || data.applicationNo);

            return {
                success: true,
                data: {
                    id: docSnap.id,
                    ...data
                }
            };

        } catch (error) {
            console.error('❌ Bulletin kaydı alma hatası:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Bulletin verisini ipRecords portföy formatına dönüştürür
     * @param {Object} bulletinData - Bulletin verisi
     * @param {string} transactionId - İtiraz işi ID'si
     * @returns {Object} Portföy kayıt verisi
     */
    mapBulletinToPortfolio(bulletinData, transactionId) {
        const now = new Date().toISOString();

        // Başvuru sahiplerini dönüştür
        const applicants = [];
        if (Array.isArray(bulletinData.holders) && bulletinData.holders.length > 0) {
            bulletinData.holders.forEach(holder => {
                if (holder && holder.name) {
                    applicants.push({
                        id: `holder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        name: holder.name.trim(),
                        email: holder.email || null,
                        type: 'applicant'
                    });
                }
            });
        }

        // Nice sınıfları ve mal/hizmetleri dönüştür
        const goodsAndServices = [];
        if (Array.isArray(bulletinData.niceClasses)) {
            bulletinData.niceClasses.forEach(niceClass => {
                if (niceClass) {
                    goodsAndServices.push({
                        niceClass: niceClass.toString(),
                        goods: bulletinData.goods || [],
                        extractedGoods: bulletinData.extractedGoods || []
                    });
                }
            });
        }

        // Vekilleri dönüştür
        const attorneys = [];
        if (Array.isArray(bulletinData.attorneys) && bulletinData.attorneys.length > 0) {
            bulletinData.attorneys.forEach(attorney => {
                if (attorney && attorney.name) {
                    attorneys.push({
                        id: `attorney_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        name: attorney.name.trim(),
                        email: attorney.email || null,
                        type: 'attorney'
                    });
                }
            });
        }

        // Ana portföy kayıt yapısı
        const portfolioData = {
            // Temel bilgiler
            title: bulletinData.markName || '',
            type: 'trademark',
            
            // Durum bilgileri  
            portfoyStatus: 'active',
            status: '', // Boş bırak
            
            // Kayıt sahipliği - 3.taraf
            recordOwnerType: 'third-party',
            
            // Başvuru bilgileri
            applicationNumber: bulletinData.applicationNo || bulletinData.applicationNumber || null,
            applicationDate: bulletinData.applicationDate || null,
            registrationNumber: null, // Bulletin'de bu bilgi yok
            registrationDate: null,
            renewalDate: null,
            
            // Marka özellikleri
            brandText: bulletinData.markName || '',
            brandImageUrl: bulletinData.imagePath || null,
            
            // Açıklama
            description: `Yayına itiraz kapsamında oluşturulan 3.taraf dosyası (İşlem: ${transactionId})`,
            
            // Ana seviye veriler
            applicants: applicants,
            priorities: [], // Bulletin'de öncelik bilgisi yok
            goodsAndServices: goodsAndServices,
            attorneys: attorneys,
            
            // Detay bilgiler
            details: {
                source: 'bulletin_opposition',
                originalBulletinId: bulletinData.bulletinId || null,
                originalBulletinRecordId: bulletinData.id || null,
                relatedTransactionId: transactionId,
                brandInfo: {
                    brandType: null,
                    brandCategory: null,
                    brandExampleText: bulletinData.markName || '',
                    nonLatinAlphabet: null,
                    coverLetterRequest: null,
                    consentRequest: null,
                    brandImage: bulletinData.imagePath || null,
                    brandImageName: null,
                    goodsAndServices: goodsAndServices
                }
            },
            
            // Sistem bilgileri
            createdAt: now,
            updatedAt: now,
            createdBy: 'opposition_automation',
            createdFrom: 'bulletin_record'
        };

        console.log('📋 Bulletin → Portföy mapping tamamlandı:', {
            markName: bulletinData.markName,
            applicationNo: bulletinData.applicationNo,
            applicantsCount: applicants.length,
            goodsServicesCount: goodsAndServices.length
        });

        return portfolioData;
    }

    /**
     * Portföy kaydını ipRecords koleksiyonuna kaydet
     * @param {Object} portfolioData - Portföy kayıt verisi
     * @returns {Object} Kayıt sonucu
     */
    async createPortfolioRecord(portfolioData) {
        try {
            if (!this.db) {
                return { success: false, error: 'Firebase bağlantısı bulunamadı' };
            }

            // ipRecords koleksiyonuna yeni kayıt ekle
            const docRef = await addDoc(collection(this.db, 'ipRecords'), portfolioData);
            
            console.log('✅ Portföy kaydı oluşturuldu:', docRef.id);
            
            return {
                success: true,
                recordId: docRef.id,
                data: portfolioData
            };

        } catch (error) {
            console.error('❌ Portföy kaydı kaydetme hatası:', error);
            return { 
                success: false, 
                error: `Kayıt oluşturulamadı: ${error.message}` 
            };
        }
    }

    /**
     * Yayına itiraz işi türü kontrolü
     * @param {string} transactionTypeId - İşlem türü ID'si
     * @returns {boolean} Yayına itiraz işi mi?
     */
    isPublicationOpposition(transactionTypeId) {
        return transactionTypeId === 'trademark_publication_objection';
    }

    /**
     * İş oluşturulduğunda otomatik tetikleme kontrolü
     * @param {Object} transactionData - İş verisi
     * @returns {Promise<Object>} İşlem sonucu
     */
    async handleTransactionCreated(transactionData) {
        try {
            console.log('🔍 İş oluşturuldu, yayına itiraz kontrolü yapılıyor...');

            // Yayına itiraz işi mi kontrol et
            if (!this.isPublicationOpposition(transactionData.specificTaskType)) {
                console.log('ℹ️ Bu iş yayına itiraz değil, portföy oluşturulmayacak');
                return { success: true, message: 'Yayına itiraz işi değil' };
            }

            // Seçilen bulletin kaydı var mı kontrol et
            if (!transactionData.selectedIpRecord || !transactionData.selectedIpRecord.id) {
                console.warn('⚠️ Seçilen bulletin kaydı bulunamadı');
                return { 
                    success: false, 
                    error: 'Yayına itiraz için bulletin kaydı seçilmeli' 
                };
            }

            // 3.taraf portföy kaydı oluştur
            const result = await this.createThirdPartyPortfolioFromBulletin(
                transactionData.selectedIpRecord.id,
                transactionData.id
            );

            return result;

        } catch (error) {
            console.error('❌ İş oluşturulma sonrası işlem hatası:', error);
            return { 
                success: false, 
                error: `Otomatik portföy oluşturma hatası: ${error.message}` 
            };
        }
    }

    /**
     * Manuel portföy oluşturma (test amaçlı)
     * @param {string} bulletinRecordId - Bulletin kayıt ID'si
     * @returns {Promise<Object>} İşlem sonucu
     */
    async createManualPortfolio(bulletinRecordId) {
        const transactionId = `manual_${Date.now()}`;
        return await this.createThirdPartyPortfolioFromBulletin(bulletinRecordId, transactionId);
    }

    /**
     * Mevcut portföy kaydı var mı kontrol et
     * @param {string} applicationNo - Başvuru numarası
     * @param {string} markName - Marka adı
     * @returns {Promise<Object>} Kontrol sonucu
     */
    async checkExistingPortfolio(applicationNo, markName) {
        try {
            if (!this.db) {
                return { success: false, error: 'Firebase bağlantısı bulunamadı' };
            }

            // Başvuru numarası ile kontrol
            let querySnapshot = null;
            if (applicationNo) {
                const q = query(
                    collection(this.db, 'ipRecords'),
                    where('applicationNumber', '==', applicationNo),
                    where('recordOwnerType', '==', 'third-party')
                );
                querySnapshot = await getDocs(q);
            }

            // Başvuru numarası ile bulunamadıysa marka adı ile kontrol
            if (!querySnapshot || querySnapshot.empty) {
                if (markName) {
                    const q2 = query(
                        collection(this.db, 'ipRecords'),
                        where('title', '==', markName),
                        where('recordOwnerType', '==', 'third-party')
                    );
                    querySnapshot = await getDocs(q2);
                }
            }

            if (querySnapshot && !querySnapshot.empty) {
                const existingRecord = querySnapshot.docs[0];
                return {
                    success: true,
                    exists: true,
                    recordId: existingRecord.id,
                    data: existingRecord.data()
                };
            }

            return {
                success: true,
                exists: false
            };

        } catch (error) {
            console.error('❌ Mevcut portföy kontrolü hatası:', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }
}

// Global instance oluştur
window.portfolioByOppositionCreator = new PortfolioByOppositionCreator();

// Export et (ES6 modüller için)
export default PortfolioByOppositionCreator;