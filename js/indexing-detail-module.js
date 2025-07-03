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

// Selcan'ın bilgileri
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
        this.currentTransactions = [];
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
            
            // Hata durumunda alternatif göster
            pdfViewerIframe.onerror = () => {
                console.log('PDF yükleme hatası, alternatif gösteriliyor...');
                pdfViewerIframe.style.display = 'none';
                
                const altDiv = document.createElement('div');
                altDiv.style.cssText = 'padding: 40px; text-align: center; background: #f8f9fa; border-radius: 8px;';
                altDiv.innerHTML = `
                    <h4 style="color: #666; margin-bottom: 15px;">📄 PDF Görüntüleyici</h4>
                    <p style="color: #999; margin-bottom: 20px;">PDF dosyası güvenlik nedeniyle burada açılamıyor.</p>
                    <button class="btn btn-primary" onclick="window.open('${this.pdfData.fileUrl}', '_blank')" style="margin-right: 10px;">
                        🔗 Yeni Sekmede Aç
                    </button>
                    <button class="btn btn-secondary" onclick="window.indexingDetailModule.downloadPdf()">
                        📥 İndir
                    </button>
                `;
                pdfViewerIframe.parentNode.appendChild(altDiv);
            };
        }
        
        // Header butonlarını ayarla
        this.setupPdfViewerButtons();
    }

    setupPdfViewerButtons() {
    // PDF yükleme hatası varsa alternatif yöntem
    const pdfViewerIframe = document.getElementById('pdfViewer');
    if (pdfViewerIframe) {
        pdfViewerIframe.onerror = () => {
            console.log('PDF iframe hatası, alternatif yöntem deneniyor...');
            pdfViewerIframe.style.display = 'none';
            
            // Alternatif PDF görüntüleyici
            const altDiv = document.createElement('div');
            altDiv.style.cssText = 'padding: 20px; text-align: center; background: #f8f9fa;';
            altDiv.innerHTML = `
                <h4>PDF Görüntüleyici</h4>
                <p>PDF dosyası güvenlik nedeniyle iframe'de açılamıyor.</p>
                <button class="btn btn-primary" onclick="window.open('${this.pdfData.fileUrl}', '_blank')">
                    📄 PDF'yi Yeni Sekmede Aç
                </button>
            `;
            pdfViewerIframe.parentNode.insertBefore(altDiv, pdfViewerIframe);
        };
    }
    
    // İndir butonu
    const downloadBtn = document.getElementById('downloadPdfBtn');
    if (downloadBtn) {
        downloadBtn.onclick = () => this.downloadPdf();
    }
    
    // Yeni sekmede aç butonu
    const newTabBtn = document.getElementById('openNewTabBtn');
    if (newTabBtn) {
        newTabBtn.onclick = () => window.open(this.pdfData.fileUrl, '_blank');
    }
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
        
        // Ana işlemleri yükle
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

    setupEventListeners() {
        // Manuel kayıt arama
        this.setupRecordSearch();
        
        // İndeksleme butonu
        const indexBtn = document.getElementById('indexBtn');
        if (indexBtn) {
            indexBtn.addEventListener('click', () => this.handleIndexing());
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
        ).slice(0, 10);

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

    async selectRecord(recordId) {
        this.matchedRecord = this.allRecords.find(r => r.id === recordId);
        if (this.matchedRecord) {
            document.getElementById('searchResultsContainer').style.display = 'none';
            document.getElementById('recordSearchInput').value = '';
            this.displaySelectedRecord();
            await this.loadTransactionsForRecord();
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
        this.currentTransactions = [];
        document.getElementById('selectedRecordDisplay').style.display = 'none';
        document.getElementById('transactionSection').style.display = 'none';
        document.getElementById('childTransactionInputs').style.display = 'none';
        this.checkFormCompleteness();
    }

    async loadTransactionsForRecord() {
        if (!this.matchedRecord) return;
        
        const transactionSection = document.getElementById('transactionSection');
        const transactionsList = document.getElementById('transactionsList');
        
        transactionSection.style.display = 'block';
        
        try {
            const transactionsResult = await ipRecordsService.getRecordTransactions(this.matchedRecord.id);
            
            if (!transactionsResult.success) {
                transactionsList.innerHTML = '<p class="text-muted">İşlemler yüklenirken hata oluştu.</p>';
                return;
            }
            
            this.currentTransactions = transactionsResult.data;
            
            if (!this.currentTransactions || this.currentTransactions.length === 0) {
                transactionsList.innerHTML = '<p class="text-muted">Bu kayıtta henüz işlem bulunmuyor.</p>';
                return;
            }

            // Sadece parent transaction'ları göster
            const parentTransactions = this.currentTransactions
                .filter(tx => tx.transactionHierarchy === 'parent' || !tx.transactionHierarchy)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            if (parentTransactions.length === 0) {
                transactionsList.innerHTML = '<p class="text-muted">Bu kayıtta ana işlem bulunmuyor.</p>';
                return;
            }

            const transactionsHtml = parentTransactions.map(transaction => {
                const transactionType = this.allTransactionTypes.find(t => t.id === transaction.type);
                const typeName = transactionType ? (transactionType.alias || transactionType.name) : 'Bilinmeyen Tür';
                
                return `
                    <div class="transaction-item" onclick="window.indexingDetailModule.selectTransaction('${transaction.id}')">
                        <div class="transaction-main">${typeName}</div>
                        <div class="transaction-details">
                            ${transaction.description || 'Açıklama yok'}
                            ${transaction.deliveryDate ? ` • Tebliğ: ${transaction.deliveryDate}` : ''}
                        </div>
                        <div class="transaction-date">${new Date(transaction.timestamp).toLocaleDateString('tr-TR')}</div>
                    </div>
                `;
            }).join('');

            transactionsList.innerHTML = transactionsHtml;
            
        } catch (error) {
            console.error('Transactions yüklenirken hata:', error);
            transactionsList.innerHTML = '<p class="text-muted">İşlemler yüklenirken hata oluştu.</p>';
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
        if (!this.currentTransactions || !this.selectedTransactionId) return;

        const selectedTransaction = this.currentTransactions.find(t => t.id === this.selectedTransactionId);
        if (!selectedTransaction) return;

        const transactionType = this.allTransactionTypes.find(t => t.id === selectedTransaction.type);
        if (!transactionType || !transactionType.indexFile) {
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

        // ALT İŞLEM SEÇİM EVENT LISTENER'INI EKLE
        selectElement.addEventListener('change', () => {
            console.log('Alt işlem seçildi:', selectElement.value);
            this.checkFormCompleteness();
        });

        // Alt işlem bölümünü göster
        document.getElementById('childTransactionInputs').style.display = 'block';
    }

    // checkFormCompleteness() fonksiyonunu güncelle
    checkFormCompleteness() {
        const hasMatchedRecord = this.matchedRecord !== null;
        const hasSelectedTransaction = this.selectedTransactionId !== null;
        
        const childTransactionInputs = document.getElementById('childTransactionInputs');
        const childTransactionInputsVisible = childTransactionInputs && childTransactionInputs.style.display !== 'none';
        
        let hasSelectedChildType = true; // Default true
        if (childTransactionInputsVisible) {
            const childTypeSelect = document.getElementById('childTransactionType');
            if (childTypeSelect) {
                hasSelectedChildType = childTypeSelect.value !== '';
                console.log('Child type select value:', childTypeSelect.value);
            }
        }

        const canSubmit = hasMatchedRecord && hasSelectedTransaction && hasSelectedChildType;
        
        const indexBtn = document.getElementById('indexBtn');
        if (indexBtn) {
            indexBtn.disabled = !canSubmit;
            console.log('İndeksle butonu durumu:', canSubmit ? 'AKTİF' : 'PASİF');
        }
        
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
            let createdTaskId = null;

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
                
                const deliveryDate = deliveryDateStr ? new Date(deliveryDateStr + 'T00:00:00') : null;
                
                const childTransactionData = {
                    type: childTypeId,
                    description: childTransactionType.alias || childTransactionType.name,
                    deliveryDate: deliveryDateStr,
                    timestamp: deliveryDate || new Date(),
                    transactionHierarchy: 'child',
                    parentId: this.selectedTransactionId
                };

                console.log('Alt işlem verisi:', childTransactionData);
                
                const childResult = await ipRecordsService.addTransactionToRecord(
                    this.matchedRecord.id, 
                    childTransactionData
                );

                console.log('childResult tam:', childResult); // DEBUG için

                if (!childResult.success) {
                    throw new Error('Alt işlem kaydedilemedi: ' + childResult.error);
                }

                // ID'yi doğru şekilde al
                const childTransactionId = childResult.data?.id || childResult.id || childResult.data;
                console.log('Child transaction ID:', childTransactionId);

                if (!childTransactionId) {
                    console.error('Child transaction ID bulunamadı, childResult:', childResult);
                    throw new Error('Alt işlem ID\'si alınamadı');
                }

                transactionIdToAssociateFiles = childTransactionId;
                console.log('Alt işlem başarıyla oluşturuldu, ID:', childTransactionId);

                // İş tetiklemesi kontrolü
                if (childTransactionType.taskTriggered && deliveryDate) {
                    console.log('İş tetiklemesi yapılıyor...');
                    
                    const taskData = {
                        title: `${childTransactionType.alias || childTransactionType.name} - ${this.matchedRecord.title}`, // Title ekle
                        description: `${this.matchedRecord.title} için ${childTransactionType.alias || childTransactionType.name} işlemi`,
                        ipRecordId: this.matchedRecord.id,
                        transactionId: childTransactionId,
                        triggeringTransactionType: childTypeId,
                        deliveryDate: deliveryDateStr,
                        assignedTo_uid: SELCAN_UID,
                        assignedTo_email: SELCAN_EMAIL,
                        priority: 'normal',
                        status: 'open',
                        createdAt: new Date(),
                        createdBy: this.currentUser.uid,
                        taskType: childTransactionType.taskTriggered
                    };

                    console.log('Tetiklenecek iş verisi:', taskData);
                    
                    const taskResult = await taskService.createTask(taskData);
                    
                    console.log('taskResult tam:', taskResult); // DEBUG için
                    
                    if (taskResult.success) {
                        // ID'yi doğru şekilde al
                        const taskId = taskResult.data?.id || taskResult.id || taskResult.data;
                        console.log('Task ID:', taskId);
                        
                        if (taskId) {
                            createdTaskId = taskId;
                            console.log('İş başarıyla tetiklendi, ID:', taskId);
                            showNotification('Alt işlem oluşturuldu ve iş tetiklendi!', 'success');
                        } else {
                            console.log('İş oluşturuldu ama ID alınamadı');
                            showNotification('Alt işlem oluşturuldu ve iş tetiklendi!', 'success');
                        }
                    } else {
                        console.error('İş tetiklenemedi:', taskResult.error);
                        showNotification('Alt işlem oluşturuldu ama iş tetiklenemedi.', 'warning');
                    }
                } else {
                    console.log('İş tetiklemesi yok veya tebliğ tarihi girilmemiş');
                    showNotification('Alt işlem başarıyla oluşturuldu!', 'success');
                }
                }

            // PDF dosyasını transaction'a bağla
            console.log('PDF dosyası transaction\'a bağlanıyor...', transactionIdToAssociateFiles);
            
            if (!transactionIdToAssociateFiles) {
                throw new Error('Transaction ID bulunamadı');
            }

            const updateData = {
                status: 'indexed',
                indexedAt: new Date(),
                associatedTransactionId: transactionIdToAssociateFiles
            };

            await updateDoc(
                doc(collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION), this.pdfData.id),
                updateData
            );

            console.log('PDF indeksleme tamamlandı');
            
            // Başarı mesajı ve yönlendirme
            const successMessage = createdTaskId ? 
                'PDF başarıyla indekslendi ve iş tetiklendi!' : 
                'PDF başarıyla indekslendi!';
            
            showNotification(successMessage, 'success');
            
            // 2 saniye bekle ve bulk indexing sayfasına dön
            setTimeout(() => {
                window.location.href = 'bulk-indexing-page.html';
            }, 2000);

        } catch (error) {
            console.error('İndeksleme hatası:', error);
            showNotification('İndeksleme hatası: ' + error.message, 'error');
            indexBtn.disabled = false;
        }
    }
}