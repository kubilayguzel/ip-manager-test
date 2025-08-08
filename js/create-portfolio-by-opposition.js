// Yayına İtiraz işi oluşturulduğunda otomatik 3.taraf portföy kaydı oluşturma

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
            
            // Marka öz