// js/indexing-detail-module.js

// Firebase servisleri ve yardımcı fonksiyonları import et
import {
    authService,
    ipRecordsService,
    transactionTypeService,
    generateUUID,
    db,
    firebaseServices
} from '../firebase-config.js';

// Firestore'dan doğrudan gereken fonksiyonları import et
import { 
    collection, query, where, doc, getDoc, updateDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// utils.js'den yardımcı fonksiyonları import et
import {
    showNotification
} from '../utils.js';

// Constants
const UNINDEXED_PDFS_COLLECTION = 'unindexed_pdfs';

export class IndexingDetailModule {
    constructor() {
        this.currentUser = authService.getCurrentUser();
        if (!this.currentUser) {
            window.location.href = 'index.html';
            return;
        }

        this.pdfData = null;
        this.matchedRecord = null;
        this.allRecords = [];
        this.allTransactionTypes = [];
        this.selectedTransactionId = null;

        this.init();
    }

    async init() {
        // URL parametresinden PDF ID'sini al
        const urlParams = new URLSearchParams(window.location.search);
        const pdfId = urlParams.get('pdfId');

        if (!pdfId) {
            showNotification('PDF ID bulunamadı.', 'error');
            window.close();
            return;
        }

        this.setupEventListeners();
        await this.loadPdfData(pdfId);
        await this.loadRecordsAndTransactionTypes();
        this.displayPdf();
        this.findMatchingRecord();
        this.loadTransactionsForRecord();
    }

    async loadPdfData(pdfId) {
        try {
            const docRef = doc(collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION), pdfId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                this.pdfData = { id: docSnap.id, ...docSnap.data() };
                console.log('PDF verisi yüklendi:', this.pdfData);
            } else {
                showNotification('PDF bulunamadı.', 'error');
                window.close();
            }
        } catch (error) {
            console.error('PDF verisi yüklenirken hata:', error);
            showNotification('PDF verisi yüklenirken hata oluştu.', 'error');
        }
    }

    async loadRecordsAndTransactionTypes() {
        try {
            // IP kayıtlarını yükle
            const recordsResult = await ipRecordsService.getRecords();
            if (recordsResult.success) {
                this.allRecords = recordsResult.data;
                console.log('IP kayıtları yüklendi:', this.allRecords.length);
            }

            // Transaction türlerini yükle
            const transactionTypesResult = await transactionTypeService.getTransactionTypes();
            if (transactionTypesResult.success) {
                this.allTransactionTypes = transactionTypesResult.data;
                console.log('Transaction türleri yüklendi:', this.allTransactionTypes.length);
                console.log('Örnek transaction türleri:', this.allTransactionTypes.slice(0, 3));
            } else {
                console.error('Transaction türleri yüklenemedi:', transactionTypesResult.error);
            }

            console.log('Kayıtlar ve transaction türleri yüklendi');
        } catch (error) {
            console.error('Veriler yüklenirken hata:', error);
            showNotification('Veriler yüklenirken hata oluştu.', 'error');
        }
    }

    displayPdf() {
        if (!this.pdfData) return;

        // PDF'yi iframe'de göster
        document.getElementById('pdfViewer').src = this.pdfData.fileUrl;
        document.getElementById('pdfTitle').textContent = this.pdfData.fileName;

        // Header butonlarını ayarla
        document.getElementById('downloadPdfBtn').onclick = () => {
            const a = document.createElement('a');
            a.href = this.pdfData.fileUrl;
            a.download = this.pdfData.fileName;
            a.click();
        };

        document.getElementById('openNewTabBtn').onclick = () => {
            window.open(this.pdfData.fileUrl, '_blank');
        };
    }

    findMatchingRecord() {
        if (!this.pdfData) return;

        // Eşleşme bilgisini göster
        const extractedAppNumber = this.pdfData.extractedAppNumber;
        document.getElementById('extractedAppNumber').textContent = 
            `Çıkarılan Uygulama No: ${extractedAppNumber || 'Bulunamadı'}`;

        if (this.pdfData.matchedRecordId) {
            // Eşleşen kayıt var
            this.matchedRecord = this.allRecords.find(r => r.id === this.pdfData.matchedRecordId);
            
            if (this.matchedRecord) {
                document.getElementById('matchStatus').innerHTML = `
                    <span>✅ ${this.pdfData.matchedRecordDisplay}</span>
                `;
                document.getElementById('matchStatus').className = 'match-status matched';
            }
        } else {
            // Eşleşme yok
            document.getElementById('matchStatus').innerHTML = `
                <span>❌ Portföy kaydı ile eşleşmedi</span>
            `;
            document.getElementById('matchStatus').className = 'match-status unmatched';
        }
    }

    async loadTransactionsForRecord() {
        if (!this.matchedRecord) {
            document.getElementById('transactionsList').innerHTML = 
                '<p class="text-muted p-2">Eşleşen kayıt bulunamadı. İndeksleme yapılamaz.</p>';
            return;
        }

        try {
            const transactionsResult = await ipRecordsService.getTransactionsForRecord(this.matchedRecord.id);
            
            console.log('getTransactionsForRecord sonucu:', transactionsResult);
            
            if (!transactionsResult.success) {
                document.getElementById('transactionsList').innerHTML = 
                    '<p class="text-muted p-2">İşlemler yüklenirken hata oluştu.</p>';
                return;
            }

            const transactions = transactionsResult.transactions;
            console.log('Kayıttan gelen transactions:', transactions);
            
            const parentTransactions = transactions
                .filter(tx => tx.transactionHierarchy === 'parent' || !tx.transactionHierarchy)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            console.log('Filtrelenmiş parent transactions:', parentTransactions);

            if (parentTransactions.length === 0) {
                document.getElementById('transactionsList').innerHTML = 
                    '<p class="text-muted p-2">Dosya eklenecek mevcut ana işlem bulunamadı.</p>';
                return;
            }

            // Ana işlem listesini oluştur
            const container = document.getElementById('transactionsList');
            container.innerHTML = '';

            parentTransactions.forEach(tx => {
                const item = document.createElement('div');
                item.className = 'transaction-list-item';
                item.dataset.id = tx.id;

                const transactionType = this.allTransactionTypes.find(t => t.id === tx.type);
                console.log(`Transaction ID: ${tx.id}, Type: ${tx.type}, Definition:`, transactionType);
                
                const transactionDisplayName = transactionType ? 
                    (transactionType.alias || transactionType.name) : 
                    (tx.designation || tx.type || 'Tanımsız İşlem');

                item.textContent = `${transactionDisplayName} - ${new Date(tx.timestamp).toLocaleDateString('tr-TR')}`;
                
                item.addEventListener('click', (e) => {
                    console.log('Transaction item tıklandı:', tx.id, tx.type);
                    this.selectTransaction(e.currentTarget.dataset.id, tx.type);
                });

                container.appendChild(item);
            });

        } catch (error) {
            console.error('İşlemler yüklenirken hata:', error);
            document.getElementById('transactionsList').innerHTML = 
                '<p class="text-muted p-2">İşlemler yüklenirken hata oluştu.</p>';
        }
    }

    selectTransaction(transactionId, transactionType) {
        this.selectedTransactionId = transactionId;

        console.log('selectTransaction çağırıldı:', { transactionId, transactionType });

        // Seçili işlemi vurgula
        document.querySelectorAll('.transaction-list-item').forEach(el => 
            el.classList.remove('selected'));
        document.querySelector(`[data-id="${transactionId}"]`).classList.add('selected');

        // Transaction definition'ı bul
        const selectedTransactionDefinition = this.allTransactionTypes.find(t => t.id === transactionType);
        
        console.log('Bulunan transaction definition:', selectedTransactionDefinition);

        if (selectedTransactionDefinition && selectedTransactionDefinition.indexFile) {
            console.log('indexFile bulundu:', selectedTransactionDefinition.indexFile);
            this.populateChildTransactionTypeSelect(selectedTransactionDefinition.indexFile);
            document.getElementById('childTransactionInputs').style.display = 'block';
        } else {
            console.log('indexFile bulunamadı veya boş');
            document.getElementById('childTransactionInputs').style.display = 'none';
        }

        // Form değerlerini temizle
        document.getElementById('childTransactionType').value = '';
        document.getElementById('deliveryDate').value = '';
        
        this.checkFormCompleteness();
    }

    populateChildTransactionTypeSelect(indexFile) {
        const selectElement = document.getElementById('childTransactionType');
        selectElement.innerHTML = '<option value="" disabled selected>Alt işlem türü seçin...</option>';

        console.log('indexFile array:', indexFile);
        console.log('Tüm transaction types:', this.allTransactionTypes);

        // DEBUGGING: İlk birkaç transaction'ın yapısını kontrol et
        console.log('İlk 5 transaction yapısı:', this.allTransactionTypes.slice(0, 5).map(t => ({
            id: t.id,
            hierarchy: t.hierarchy,
            transactionHierarchy: t.transactionHierarchy,
            name: t.name,
            alias: t.alias
        })));

        // DEBUGGING: Child hierarchy'e sahip tüm transaction'ları bul
        const allChildTypes = this.allTransactionTypes.filter(type => 
            type.hierarchy === 'child' || type.transactionHierarchy === 'child'
        );
        console.log('Tüm child types:', allChildTypes.map(t => ({
            id: t.id,
            name: t.name,
            hierarchy: t.hierarchy || t.transactionHierarchy
        })));

        // DEBUGGING: indexFile'daki ID'lerle eşleşen transaction'ları bul
        const matchingIds = this.allTransactionTypes.filter(type => 
            indexFile.includes(type.id) || indexFile.includes(String(type.id)) || indexFile.includes(Number(type.id))
        );
        console.log('indexFile ile eşleşen ID\'ler:', matchingIds.map(t => ({
            id: t.id,
            name: t.name,
            hierarchy: t.hierarchy || t.transactionHierarchy
        })));

        // Hem hierarchy kontrolü hem ID eşleşmesi
        const childTypes = this.allTransactionTypes.filter(type => {
            const isChild = type.hierarchy === 'child' || type.transactionHierarchy === 'child';
            const isInIndexFile = indexFile && Array.isArray(indexFile) && 
                (indexFile.includes(type.id) || indexFile.includes(String(type.id)) || indexFile.includes(Number(type.id)));
            
            console.log(`Transaction ${type.id} (${type.name}): isChild=${isChild}, isInIndexFile=${isInIndexFile}`);
            
            return isChild && isInIndexFile;
        });

        console.log('Final bulunan child types:', childTypes);

        if (childTypes.length === 0) {
            const noOption = document.createElement('option');
            noOption.value = '';
            noOption.textContent = 'Bu ana işlem için alt işlem bulunamadı';
            noOption.disabled = true;
            selectElement.appendChild(noOption);
            return;
        }

        childTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.alias || type.name;
            selectElement.appendChild(option);
        });
    }

    checkFormCompleteness() {
        const hasSelectedTransaction = this.selectedTransactionId !== null;
        const childTransactionInputsVisible = document.getElementById('childTransactionInputs').style.display !== 'none';
        const hasSelectedChildType = childTransactionInputsVisible ? 
            document.getElementById('childTransactionType').value !== '' : true;

        console.log('Form completeness check:', {
            hasSelectedTransaction,
            childTransactionInputsVisible,
            hasSelectedChildType,
            selectedTransactionId: this.selectedTransactionId
        });

        const canSubmit = hasSelectedTransaction && hasSelectedChildType;
        document.getElementById('indexBtn').disabled = !canSubmit;
        
        console.log('İndeksle butonu durumu:', canSubmit ? 'aktif' : 'pasif');
    }

    async handleIndexing() {
        if (!this.matchedRecord || !this.selectedTransactionId) {
            showNotification('Gerekli seçimler yapılmadı.', 'error');
            return;
        }

        const indexBtn = document.getElementById('indexBtn');
        indexBtn.disabled = true;
        showNotification('İndeksleme işlemi yapılıyor...', 'info');

        try {
            const childTypeId = document.getElementById('childTransactionType').value;
            const deliveryDateStr = document.getElementById('deliveryDate').value;
            
            let transactionIdToAssociateFiles = this.selectedTransactionId;

            // Alt işlem varsa oluştur
            if (childTypeId) {
                const childTransactionType = this.allTransactionTypes.find(type => type.id === childTypeId);
                const deliveryDate = deliveryDateStr ? new Date(deliveryDateStr).toISOString() : null;

                const childTransactionData = {
                    type: childTypeId,
                    description: `${childTransactionType.name} alt işlemi.`,
                    parentId: this.selectedTransactionId,
                    transactionHierarchy: "child",
                    deliveryDate: deliveryDate
                };

                const childResult = await ipRecordsService.addTransactionToRecord(
                    this.matchedRecord.id, 
                    childTransactionData
                );

                if (childResult.success) {
                    transactionIdToAssociateFiles = childResult.transactionId;
                    
                    // Task tetikleme
                    const taskType = this.mapTransactionToTask(childTransactionType, this.matchedRecord.type);
                    if (taskType) {
                        await this.createTaskForTransaction(childResult.transactionId, taskType);
                    }
                } else {
                    throw new Error('Alt işlem oluşturulamadı: ' + childResult.error);
                }
            }

            // PDF'yi kayda dosya olarak ekle
            const fileToUpload = {
                name: this.pdfData.fileName,
                fileType: this.pdfData.fileType,
                fileSize: this.pdfData.fileSize,
                fileUrl: this.pdfData.fileUrl,
                relatedTransactionId: transactionIdToAssociateFiles,
                documentDesignation: 'İndekslenmiş Belge'
            };

            const fileAddResult = await ipRecordsService.addFileToRecord(this.matchedRecord.id, fileToUpload);
            
            if (!fileAddResult.success) {
                throw new Error('Dosya eklenemedi: ' + fileAddResult.error);
            }

            // PDF durumunu güncelle
            await updateDoc(doc(collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION), this.pdfData.id), {
                status: 'indexed',
                indexedAt: new Date(),
                relatedRecordId: this.matchedRecord.id,
                relatedTransactionId: transactionIdToAssociateFiles
            });

            showNotification('İndeksleme başarıyla tamamlandı!', 'success');
            
            // 2 saniye sonra sayfayı kapat
            setTimeout(() => {
                window.close();
            }, 2000);

        } catch (error) {
            console.error('İndeksleme hatası:', error);
            showNotification('İndeksleme sırasında hata oluştu: ' + error.message, 'error');
            indexBtn.disabled = false;
        }
    }

    mapTransactionToTask(selectedChildTransactionType, recordType) {
        return selectedChildTransactionType.taskTriggered || null;
    }

    async createTaskForTransaction(transactionId, taskType) {
        // Task oluşturma mantığı burada implement edilecek
        // Şimdilik basit bir log
        console.log('Task oluşturulacak:', { transactionId, taskType });
    }

    setupEventListeners() {
        // İndeksle butonu
        document.getElementById('indexBtn').addEventListener('click', () => {
            this.handleIndexing();
        });

        // Alt işlem türü değişikliği
        document.getElementById('childTransactionType').addEventListener('change', () => {
            this.checkFormCompleteness();
        });

        // Form alanları değişiklikleri
        document.getElementById('deliveryDate').addEventListener('change', () => {
            this.checkFormCompleteness();
        });

        // Klavye kısayolları
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                window.close();
            }
        });
    }
}