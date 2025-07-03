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
        // this.loadTransactionsForRecord(); // Bu satırı kaldırın
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
    // PDF başlığını güncelle
    const pdfTitle = document.getElementById('pdfTitle');
    if (pdfTitle) {
        pdfTitle.textContent = this.pdfData.fileName;
    }
    
    // PDF'i iframe'e yükle
    const pdfViewerIframe = document.getElementById('pdfViewer');
    if (pdfViewerIframe) {
        pdfViewerIframe.src = this.pdfData.fileUrl;
    }
    
    // Form kısmındaki PDF bilgilerini kaldır - artık gerek yok
}

    downloadPdf() {
        if (!this.pdfData || !this.pdfData.fileUrl) return;
        
        const a = document.createElement('a');
        a.href = this.pdfData.fileUrl;
        a.download = this.pdfData.fileName;
        a.click();
    }

    findMatchingRecord() {
        // Otomatik eşleşme kontrolü
        if (this.pdfData.matchedRecordId) {
            this.matchedRecord = this.allRecords.find(r => r.id === this.pdfData.matchedRecordId);
            if (this.matchedRecord) {
                this.showMatchedRecord();
                return;
            }
        }

        // Eşleşme yoksa manuel arama göster
        this.showManualRecordSearch();
    }
    showMatchedRecord() {
        const matchedDiv = document.getElementById('matchedRecordDisplay');
        const manualDiv = document.getElementById('manualRecordSearch');
        
        matchedDiv.style.display = 'block';
        manualDiv.style.display = 'none';
        
        matchedDiv.innerHTML = `
            <div class="matched-record-card" style="border: 2px solid #28a745; border-radius: 10px; padding: 15px; background: #f8fff9;">
                <h4 style="color: #28a745; margin: 0 0 10px 0;">✅ Otomatik Eşleşen Kayıt</h4>
                <p><strong>Başlık:</strong> ${this.matchedRecord.title}</p>
                <p><strong>Uygulama No:</strong> ${this.matchedRecord.applicationNumber}</p>
                <p><strong>Müvekkil:</strong> ${this.matchedRecord.client || 'Belirtilmemiş'}</p>
                <button type="button" class="btn btn-secondary" onclick="window.indexingDetailModule.showManualRecordSearch()">
                    🔄 Farklı Kayıt Seç
                </button>
            </div>
        `;
        
        // async olarak çağır
        this.loadTransactionsForRecord();
    }

    showManualRecordSearch() {
        const matchedDiv = document.getElementById('matchedRecordDisplay');
        const manualDiv = document.getElementById('manualRecordSearch');
        
        matchedDiv.style.display = 'none';
        manualDiv.style.display = 'block';
        
        // Eğer daha önce seçilen kayıt varsa göster
        if (this.matchedRecord) {
            this.displaySelectedRecord();
        }
    }

    setupRecordSearch() {
        const searchInput = document.getElementById('recordSearchInput');
        const resultsContainer = document.getElementById('searchResultsContainer');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                if (query.length < 2) {
                    resultsContainer.style.display = 'none';
                    return;
                }
                this.searchRecords(query);
            });

            searchInput.addEventListener('blur', () => {
                // Kısa gecikme ile kapat (tıklama olayının gerçekleşmesi için)
                setTimeout(() => {
                    resultsContainer.style.display = 'none';
                }, 200);
            });

            searchInput.addEventListener('focus', () => {
                if (searchInput.value.trim().length >= 2) {
                    resultsContainer.style.display = 'block';
                }
            });
        }
    }

    searchRecords(query) {
        const resultsContainer = document.getElementById('searchResultsContainer');
        
        const filteredRecords = this.allRecords.filter(record => 
            record.title.toLowerCase().includes(query.toLowerCase()) ||
            record.applicationNumber.toLowerCase().includes(query.toLowerCase()) ||
            (record.client && record.client.toLowerCase().includes(query.toLowerCase()))
        ).slice(0, 10); // İlk 10 sonuç

        if (filteredRecords.length === 0) {
            resultsContainer.innerHTML = '<div class="search-result-item">Hiç sonuç bulunamadı</div>';
        } else {
            resultsContainer.innerHTML = filteredRecords.map(record => `
                <div class="search-result-item" onclick="window.indexingDetailModule.selectRecord('${record.id}')">
                    <div class="search-result-title">${record.title}</div>
                    <div class="search-result-details">
                        <span>${record.applicationNumber}</span>
                        ${record.client ? ` • ${record.client}` : ''}
                    </div>
                </div>
            `).join('');
        }
        
        resultsContainer.style.display = 'block';
    }

    selectRecord(recordId) {
        this.matchedRecord = this.allRecords.find(r => r.id === recordId);
        if (this.matchedRecord) {
            document.getElementById('searchResultsContainer').style.display = 'none';
            document.getElementById('recordSearchInput').value = '';
            this.displaySelectedRecord();
            this.loadTransactionsForRecord();
        }
    }

    displaySelectedRecord() {
        const selectedDiv = document.getElementById('selectedRecordDisplay');
        
        if (!this.matchedRecord) {
            selectedDiv.style.display = 'none';
            return;
        }
        
        selectedDiv.style.display = 'block';
        selectedDiv.innerHTML = `
            <div class="selected-record-card" style="border: 2px solid #007bff; border-radius: 10px; padding: 15px; background: #f8f9ff;">
                <h4 style="color: #007bff; margin: 0 0 10px 0;">📋 Seçilen Kayıt</h4>
                <p><strong>Başlık:</strong> ${this.matchedRecord.title}</p>
                <p><strong>Uygulama No:</strong> ${this.matchedRecord.applicationNumber}</p>
                <p><strong>Müvekkil:</strong> ${this.matchedRecord.client || 'Belirtilmemiş'}</p>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.indexingDetailModule.clearSelectedRecord()">
                    ❌ Seçimi Temizle
                </button>
            </div>
        `;
    }

    clearSelectedRecord() {
        this.matchedRecord = null;
        this.selectedTransactionId = null;
        document.getElementById('selectedRecordDisplay').style.display = 'none';
        document.getElementById('transactionSection').style.display = 'none';
        document.getElementById('childTransactionInputs').style.display = 'none';
        this.checkFormCompleteness();
    }
    
    async loadChildTransactionTypes() {
        if (!this.matchedRecord || !this.selectedTransactionId) return;

        try {
            // API'den transaction'ları tekrar çek
            const transactionsResult = await ipRecordsService.getRecordTransactions(this.matchedRecord.id);
            if (!transactionsResult.success) {
                console.error('Transactions çekilemedi:', transactionsResult.error);
                return;
            }

            const transactions = transactionsResult.data;
            const selectedTransaction = transactions.find(t => t.id === this.selectedTransactionId);
            
            if (!selectedTransaction) {
                console.error('Seçilen transaction bulunamadı:', this.selectedTransactionId);
                return;
            }

            const transactionType = this.allTransactionTypes.find(t => t.id === selectedTransaction.type);
            if (!transactionType || !transactionType.indexFile) {
                console.log('Transaction type bulunamadı veya indexFile yok:', selectedTransaction.type);
                document.getElementById('childTransactionInputs').style.display = 'none';
                return;
            }

            const selectElement = document.getElementById('childTransactionType');
            selectElement.innerHTML = '<option value="" disabled selected>Alt işlem türü seçin...</option>';

            const childTypes = this.allTransactionTypes.filter(type => 
                type.hierarchy === 'child' &&  
                transactionType.indexFile && 
                Array.isArray(transactionType.indexFile) && 
                transactionType.indexFile.includes(type.id)
            ).sort((a, b) => (a.order || 999) - (b.order || 999));

            if (childTypes.length === 0) {
                const noOption = document.createElement('option');
                noOption.value = '';
                noOption.textContent = 'Bu ana işlem için alt işlem bulunamadı';
                noOption.disabled = true;
                selectElement.appendChild(noOption);
                document.getElementById('childTransactionInputs').style.display = 'none';
                return;
            }

            childTypes.forEach(type => {
                const option = document.createElement('option');
                option.value = type.id;
                option.textContent = type.alias || type.name;
                selectElement.appendChild(option);
            });

            // Alt işlem bölümünü göster
            document.getElementById('childTransactionInputs').style.display = 'block';
            
        } catch (error) {
            console.error('loadChildTransactionTypes error:', error);
        }
    }

    selectTransaction(transactionId) {
        this.selectedTransactionId = transactionId;
        
        // Seçili işlemi görsel olarak vurgula
        document.querySelectorAll('.transaction-item').forEach(item => {
            item.classList.remove('selected');
        });
        event.target.closest('.transaction-item').classList.add('selected');
        
        // Alt işlem türlerini yükle
        this.loadChildTransactionTypes();
        
        // Alt işlem bölümünü göster
        document.getElementById('childTransactionInputs').style.display = 'block';
        
        this.checkFormCompleteness();
    }

    loadChildTransactionTypes() {
        const selectedTransaction = this.matchedRecord.transactions.find(t => t.id === this.selectedTransactionId);
        if (!selectedTransaction) return;

        const transactionType = this.allTransactionTypes.find(t => t.id === selectedTransaction.type);
        if (!transactionType || !transactionType.indexFile) return;

        const selectElement = document.getElementById('childTransactionType');
        selectElement.innerHTML = '<option value="" disabled selected>Alt işlem türü seçin...</option>';

        const childTypes = this.allTransactionTypes.filter(type => 
            type.hierarchy === 'child' &&  
            transactionType.indexFile && 
            Array.isArray(transactionType.indexFile) && 
            transactionType.indexFile.includes(type.id)
        ).sort((a, b) => (a.order || 999) - (b.order || 999));

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
        const hasMatchedRecord = this.matchedRecord !== null;
        const hasSelectedTransaction = this.selectedTransactionId !== null;
        const childTransactionInputsVisible = document.getElementById('childTransactionInputs').style.display !== 'none';
        const hasSelectedChildType = childTransactionInputsVisible ? 
            document.getElementById('childTransactionType').value !== '' : true;

        const canSubmit = hasMatchedRecord && hasSelectedTransaction && hasSelectedChildType;
        document.getElementById('indexBtn').disabled = !canSubmit;
        
        console.log('Form completeness check:', {
            hasMatchedRecord,
            hasSelectedTransaction,
            childTransactionInputsVisible,
            hasSelectedChildType,
            canSubmit
        });
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
            if (deliveryDateStr && childTransactionType && childTransactionType.duePeriod) {
                const deliveryDate = new Date(deliveryDateStr);
                deliveryDate.setHours(0, 0, 0, 0);

                console.log('Tarih hesaplaması:', {
                    deliveryDate: deliveryDate.toDateString(),
                    duePeriod: childTransactionType.duePeriod,
                    childTransactionType: childTransactionType.name
                });

                // Resmi son tarihi hesapla (duePeriod kadar ay ekle)
                const rawOfficialDueDate = addMonthsToDate(deliveryDate, childTransactionType.duePeriod);
                officialDueDate = findNextWorkingDay(rawOfficialDueDate, TURKEY_HOLIDAYS);

                officialDueDateDetails = {
                    deliveryDate: deliveryDateStr,
                    periodMonths: childTransactionType.duePeriod,
                    calculatedDate: officialDueDate.toISOString(),
                    isCalculated: true,
                    transactionTypeId: childTransactionType.id,
                    transactionTypeName: childTransactionType.name
                };

                // Operasyonel son tarih (resmi son tarihten 3 gün öncesi, hafta sonu/tatil kontrolü ile)
                const operationalDueDate = new Date(officialDueDate);
                operationalDueDate.setDate(operationalDueDate.getDate() - 3);
                
                // Hafta sonu/tatil kontrolü
                while (isWeekend(operationalDueDate) || isHoliday(operationalDueDate, TURKEY_HOLIDAYS)) {
                    operationalDueDate.setDate(operationalDueDate.getDate() - 1);
                }
                
                taskDueDate = operationalDueDate.toISOString().split('T')[0]; // YYYY-MM-DD format

                console.log('Hesaplanan tarihler:', {
                    officialDueDate: officialDueDate.toDateString(),
                    operationalDueDate: taskDueDate,
                    duePeriodMonths: childTransactionType.duePeriod
                });
            } else if (deliveryDateStr && (!childTransactionType || !childTransactionType.duePeriod)) {
                console.warn('Tebliğ tarihi var ama transaction type duePeriod bilgisi yok - tarih hesaplaması yapılamıyor');
                showNotification('Alt işlem türünde süre bilgisi bulunamadı, sadece tebliğ tarihi kaydedilecek.', 'warning');
            }

// Task data objesi oluştur
            const newTaskData = {
                taskType: taskType,
                title: `[OTOMATİK GÖREV] ${targetTaskDefinition.taskDisplayName || targetTaskDefinition.alias || targetTaskDefinition.name} - ${this.matchedRecord.title} (${this.matchedRecord.applicationNumber})`,
                description: `${this.matchedRecord.title} (${this.matchedRecord.applicationNumber}) kaydının ${childTransactionType?.alias || childTransactionType?.name || 'işlem'} sonrasında otomatik oluşturulan görev.`,
                priority: 'medium',
                assignedTo_uid: defaultAssignedToUid,
                assignedTo_email: defaultAssignedToEmail,
                dueDate: taskDueDate, // Operasyonel tarih (YYYY-MM-DD string formatında)
                status: 'awaiting_client_approval',
                relatedIpRecordId: this.matchedRecord.id,
                relatedIpRecordTitle: this.matchedRecord.title,
                triggeringTransactionId: transactionId,
                triggeringTransactionType: childTransactionType?.id || null,
                details: {
                    relatedParty: this.matchedRecord.details?.relatedParty || null
                }
            };

            // Resmi son tarih bilgilerini ekle (Date objesi olarak)
            if (officialDueDate) {
                newTaskData.officialDueDate = officialDueDate; // Date objesi
                newTaskData.officialDueDateDetails = {
                    ...officialDueDateDetails,
                    calculatedDate: officialDueDate.toISOString() // ISO string olarak da kaydet
                };
            }

            // Tebliğ tarihini de göreve ekle
            if (deliveryDateStr) {
                newTaskData.deliveryDate = deliveryDateStr; // YYYY-MM-DD formatında
            }

            console.log('Oluşturulacak task data:', {
                ...newTaskData,
                officialDueDate: newTaskData.officialDueDate ? newTaskData.officialDueDate.toISOString() : null,
                dueDate: newTaskData.dueDate,
                deliveryDate: newTaskData.deliveryDate
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

        // Kayıt arama sistemi
        this.setupRecordSearch();

        // Klavye kısayolları
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                window.close();
            }
        });
    }
}