// js/indexing-detail-module.js

// Firebase servisleri ve yardımcı fonksiyonları import et
import {
    authService,
    ipRecordsService,
    transactionTypeService,
    taskService,
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
    showNotification,
    addMonthsToDate,
    isWeekend,
    isHoliday,
    findNextWorkingDay,
    TURKEY_HOLIDAYS
} from '../utils.js';

// Constants
const UNINDEXED_PDFS_COLLECTION = 'unindexed_pdfs';

// Selcan'ın bilgileri (indexing.html'den alındı)
const SELCAN_UID = '5GD0KCpyeVUneDJq4pP0yxZEP6r1';
const SELCAN_EMAIL = 'selcan@gmail.com';

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
            }

            // Transaction türlerini yükle
            const transactionTypesResult = await transactionTypeService.getTransactionTypes();
            if (transactionTypesResult.success) {
                this.allTransactionTypes = transactionTypesResult.data;
            } else {
                console.error('Transaction türleri yüklenemedi:', transactionTypesResult.error);
            }

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
            
            if (!transactionsResult.success) {
                document.getElementById('transactionsList').innerHTML = 
                    '<p class="text-muted p-2">İşlemler yüklenirken hata oluştu.</p>';
                return;
            }

            const transactions = transactionsResult.transactions;
            const parentTransactions = transactions
                .filter(tx => tx.transactionHierarchy === 'parent' || !tx.transactionHierarchy)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

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
                const transactionDisplayName = transactionType ? 
                    (transactionType.alias || transactionType.name) : 
                    (tx.designation || tx.type || 'Tanımsız İşlem');

                item.textContent = `${transactionDisplayName} - ${new Date(tx.timestamp).toLocaleDateString('tr-TR')}`;
                
                item.addEventListener('click', (e) => {
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

        // İndeksleme HTML'deki çalışan mantığı uygula
        const childTypes = this.allTransactionTypes.filter(type => 
            type.hierarchy === 'child' &&  // transactionHierarchy DEĞİL, hierarchy!
            indexFile && 
            Array.isArray(indexFile) && 
            indexFile.includes(type.id)
        ).sort((a, b) => (a.order || 999) - (b.order || 999)); // Sıralama da ekle

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

        const canSubmit = hasSelectedTransaction && hasSelectedChildType;
        document.getElementById('indexBtn').disabled = !canSubmit;
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

            console.log('İndeksleme başlangıç verileri:', {
                matchedRecord: this.matchedRecord.id,
                selectedTransactionId: this.selectedTransactionId,
                childTypeId,
                deliveryDateStr
            });

            // Alt işlem varsa oluştur
            if (childTypeId) {
                console.log('Alt işlem oluşturuluyor...');
                
                const childTransactionType = this.allTransactionTypes.find(type => type.id === childTypeId);
                if (!childTransactionType) {
                    throw new Error('Alt işlem türü bulunamadı: ' + childTypeId);
                }
                
                const deliveryDate = deliveryDateStr ? new Date(deliveryDateStr).toISOString() : null;

                const childTransactionData = {
                    type: childTypeId,
                    description: `${childTransactionType.name} alt işlemi.`,
                    parentId: this.selectedTransactionId,
                    transactionHierarchy: "child",  // Bu alan transaction'larda kullanılıyor
                    deliveryDate: deliveryDate
                };

                console.log('Oluşturulacak child transaction:', childTransactionData);

                try {
                    const childResult = await ipRecordsService.addTransactionToRecord(
                        this.matchedRecord.id, 
                        childTransactionData
                    );

                    console.log('Child transaction sonucu:', childResult);

                    if (childResult.success) {
                        console.log('Child transaction başarıyla oluşturuldu:', childResult);
                        // transaction ID'yi farklı field'lardan almaya çalış
                        const childTransactionId = childResult.transactionId || childResult.id || childResult.data?.id;
                        
                        if (childTransactionId) {
                            transactionIdToAssociateFiles = childTransactionId;
                            console.log('Child transaction ID kullanılacak:', transactionIdToAssociateFiles);
                        } else {
                            console.warn('Child transaction ID alınamadı, parent ID kullanılacak');
                        }
                        
                        // Task tetikleme
                        const taskType = this.mapTransactionToTask(childTransactionType, this.matchedRecord.type);
                        if (taskType) {
                            await this.createTaskForTransaction(transactionIdToAssociateFiles, taskType, childTransactionType);
                        }
                    } else {
                        console.error('Child transaction başarısız:', childResult);
                        console.warn('Parent transaction ID kullanılacak');
                    }
                } catch (transactionError) {
                    console.error('Child transaction oluşturma hatası:', transactionError);
                    console.warn('Parent transaction ID kullanılacak');
                }
            }

            console.log('Dosya ekleniyor, transaction ID:', transactionIdToAssociateFiles);

            // GEÇICI: Child transaction sorununu bypass et
            if (!transactionIdToAssociateFiles || transactionIdToAssociateFiles === undefined) {
                console.warn('Transaction ID hala undefined, parent transaction ID ZORUNLU olarak kullanılıyor:', this.selectedTransactionId);
                transactionIdToAssociateFiles = this.selectedTransactionId;
            }

            // EKSTRA GÜVENLIK: Hala undefined ise hata ver
            if (!transactionIdToAssociateFiles) {
                throw new Error('Hiçbir transaction ID bulunamadı! Parent: ' + this.selectedTransactionId);
            }

            // PDF'yi kayda dosya olarak ekle
            const fileToUpload = {
                name: this.pdfData.fileName,
                fileType: this.pdfData.fileType || 'application/pdf',
                fileSize: this.pdfData.fileSize || 0,
                fileUrl: this.pdfData.fileUrl,
                relatedTransactionId: transactionIdToAssociateFiles,    // Artık kesinlikle undefined olmayacak
                documentDesignation: 'İndekslenmiş Belge'
            };

            console.log('Yüklenecek dosya verisi:', fileToUpload);
            
            // Undefined alanları kontrol et
            Object.keys(fileToUpload).forEach(key => {
                if (fileToUpload[key] === undefined) {
                    console.error(`UNDEFINED ALAN BULUNDU: ${key}`, fileToUpload[key]);
                }
            });

            const fileAddResult = await ipRecordsService.addFileToRecord(this.matchedRecord.id, fileToUpload);
            
            if (!fileAddResult.success) {
                throw new Error('Dosya eklenemedi: ' + fileAddResult.error);
            }

            console.log('Dosya başarıyla eklendi:', fileAddResult);

            // PDF durumunu güncelle
            console.log('PDF durumu güncelleniyor...');
            await updateDoc(doc(collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION), this.pdfData.id), {
                status: 'indexed',
                indexedAt: new Date(),
                relatedRecordId: this.matchedRecord.id,
                relatedTransactionId: transactionIdToAssociateFiles
            });

            console.log('İndeksleme tamamlandı!');
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
        const taskTriggered = selectedChildTransactionType?.taskTriggered;
        console.log('Task tetikleniyor:', {
            childTransactionName: selectedChildTransactionType?.name,
            taskTriggered: taskTriggered,
            recordType
        });
        return taskTriggered || null;
    }

    async createTaskForTransaction(transactionId, taskType, childTransactionType = null) {
        console.log('createTaskForTransaction çağırıldı:', { 
            transactionId, 
            taskType, 
            childTransactionType: childTransactionType?.name,
            childTransactionId: childTransactionType?.id
        });
        
        if (!taskType) {
            console.log('Task type boş, task oluşturulmayacak');
            return;
        }
        
        try {
            // Task definition'ı bul
            const targetTaskDefinition = this.allTransactionTypes.find(t => t.id === taskType);
            if (!targetTaskDefinition) {
                console.error('Task definition bulunamadı:', taskType);
                return;
            }

            console.log('Task oluşturuluyor:', targetTaskDefinition);

            // Varsayılan atama: Selcan
            let defaultAssignedToUid = SELCAN_UID;
            let defaultAssignedToEmail = SELCAN_EMAIL;

            // Tebliğ tarihini al
            const deliveryDateStr = document.getElementById('deliveryDate').value;
            let taskDueDate = null;
            let officialDueDate = null;
            let officialDueDateDetails = null;

            // Tarih hesaplamalarını yap
            if (deliveryDateStr && targetTaskDefinition.duePeriod) {
                const deliveryDate = new Date(deliveryDateStr);
                deliveryDate.setHours(0, 0, 0, 0);

                console.log('Tarih hesaplaması:', {
                    deliveryDate: deliveryDate.toDateString(),
                    duePeriod: targetTaskDefinition.duePeriod
                });

                // Resmi son tarihi hesapla
                const rawOfficialDueDate = addMonthsToDate(deliveryDate, targetTaskDefinition.duePeriod);
                officialDueDate = findNextWorkingDay(rawOfficialDueDate);

                officialDueDateDetails = {
                    deliveryDate: deliveryDateStr,
                    periodMonths: targetTaskDefinition.duePeriod,
                    calculatedDate: officialDueDate.toISOString(),
                    isCalculated: true
                };

                // Operasyonel son tarih (resmi son tarihten 5 gün öncesi)
                const operationalDueDate = new Date(officialDueDate);
                operationalDueDate.setDate(operationalDueDate.getDate() - 5);
                taskDueDate = findNextWorkingDay(operationalDueDate).toISOString().split('T')[0]; // YYYY-MM-DD format

                console.log('Hesaplanan tarihler:', {
                    officialDueDate: officialDueDate.toDateString(),
                    operationalDueDate: taskDueDate
                });
            }

            // Task data objesi oluştur
            const newTaskData = {
                taskType: taskType,
                title: `[OTOMATİK GÖREV] ${targetTaskDefinition.taskDisplayName || targetTaskDefinition.alias || targetTaskDefinition.name} - ${this.matchedRecord.title} (${this.matchedRecord.applicationNumber})`,
                description: `${this.matchedRecord.title} (${this.matchedRecord.applicationNumber}) kaydının ${childTransactionType?.alias || childTransactionType?.name || 'işlem'} sonrasında otomatik oluşturulan görev.`,
                priority: 'medium',
                assignedTo_uid: defaultAssignedToUid,
                assignedTo_email: defaultAssignedToEmail,
                dueDate: taskDueDate,
                status: 'awaiting_client_approval',
                relatedIpRecordId: this.matchedRecord.id,
                relatedIpRecordTitle: this.matchedRecord.title,
                triggeringTransactionId: transactionId,                          // Child transaction ID'si
                triggeringTransactionType: childTransactionType?.id || null,     // Child transaction TYPE ID'si (DÜZELTME!)
                details: {
                    relatedParty: this.matchedRecord.details?.relatedParty || null
                }
            };

            // Resmi son tarih bilgilerini ekle
            if (officialDueDate) {
                newTaskData.officialDueDate = officialDueDate;
                newTaskData.officialDueDateDetails = officialDueDateDetails;
            }

            // Tebliğ tarihini de göreve ekle
            if (deliveryDateStr) {
                newTaskData.deliveryDate = deliveryDateStr;
            }

            console.log('Oluşturulacak task data:', {
                ...newTaskData,
                triggeringTransactionId: newTaskData.triggeringTransactionId,
                triggeringTransactionType: newTaskData.triggeringTransactionType,
                childTransactionName: childTransactionType?.name
            });

            // Task'ı oluştur
            const taskCreationResult = await taskService.createTask(newTaskData);
            
            if (taskCreationResult.success) {
                console.log('Task başarıyla oluşturuldu:', taskCreationResult);
                showNotification(`Yeni görev otomatik olarak oluşturuldu: "${newTaskData.title}".`, 'success', 5000);
            } else {
                console.error('Task oluşturma başarısız:', taskCreationResult);
                showNotification(`Otomatik görev oluşturulurken hata oluştu: ${taskCreationResult.error}`, 'error', 8000);
            }

        } catch (error) {
            console.error('Task oluşturma hatası:', error);
            showNotification('Görev oluşturulurken hata oluştu: ' + error.message, 'error');
        }
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