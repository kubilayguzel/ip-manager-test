// js/bulk-indexing-module.js - Genişletilmiş BulkIndexingModule

import { 
    firebaseServices, 
    authService, 
    ipRecordsService, 
    transactionTypeService,
    generateUUID 
} from '../firebase-config.js';

// Firestore fonksiyonlarını doğrudan Firebase'den import et
import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    deleteField,
    getDocs,
    setDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

import { showNotification, formatFileSize } from '../utils.js';

const UNINDEXED_PDFS_COLLECTION = 'unindexedPDFs';

export class BulkIndexingModule {
    constructor() {
        this.uploadedFiles = [];
        this.currentUser = null;
        this.activeTab = 'existing-transaction-pane'; // Default tab
        this.activeFileTab = 'all-files-pane';
        this.unsubscribe = null;
        
        // Data stores for indexing functionality  
        this.allRecords = [];
        this.allTransactionTypes = [];
        this.uploadedFiles = new Map(); // For file management per tab
        this.selectedRecordExisting = null;
        this.selectedRecordManual = null;
        this.selectedTransactionId = null;

        this.init();
    }

    async init() {
        try {
            this.currentUser = authService.getCurrentUser();
            if (!this.currentUser) {
                console.error('Kullanıcı oturum açmamış');
                return;
            }

            // Load data for indexing functionality
            await this.loadAllData();
            
            this.setupEventListeners();
            this.setupRealtimeListener();
            this.updateUI();
            
            console.log('✅ Enhanced BulkIndexingModule initialized');
        } catch (error) {
            console.error('BulkIndexingModule initialization error:', error);
            showNotification('Modül başlatılamadı: ' + error.message, 'error');
        }
    }

    async loadAllData() {
        try {
            const [recordsResult, transactionTypesResult] = await Promise.all([
                ipRecordsService.getRecords(),
                transactionTypeService.getTransactionTypes()
            ]);

            if (recordsResult.success) {
                this.allRecords = recordsResult.data;
                console.log('✅ Tüm kayıtlar yüklendi:', this.allRecords.length);
            } else {
                showNotification('Kayıtlar yüklenemedi: ' + recordsResult.error, 'error');
            }

            if (transactionTypesResult.success) {
                this.allTransactionTypes = transactionTypesResult.data;
                console.log('✅ Tüm işlem tipleri yüklendi:', this.allTransactionTypes.length);
            } else {
                showNotification('İşlem tipleri yüklenemedi: ' + transactionTypesResult.error, 'error');
            }
        } catch (error) {
            showNotification('Veriler yüklenirken hata oluştu: ' + error.message, 'error');
        }
    }

    setupEventListeners() {
        // Bulk upload tab listeners
        this.setupBulkUploadListeners();
        
        // Main tab switching listeners
        this.setupMainTabListeners();
        
        // Search and form listeners for existing transaction tab
        this.setupExistingTransactionListeners();
        
        // Search and form listeners for manual transaction tab
        this.setupManualTransactionListeners();
        
        // Common form listeners
        this.setupCommonFormListeners();
    }

    setupBulkUploadListeners() {
        const uploadButton = document.getElementById('bulkFilesButton');
        const fileInput = document.getElementById('bulkFiles');

        if (uploadButton) {
            uploadButton.addEventListener('click', () => fileInput?.click());
            uploadButton.addEventListener('dragover', this.handleDragOver.bind(this));
            uploadButton.addEventListener('dragleave', this.handleDragLeave.bind(this));
            uploadButton.addEventListener('drop', this.handleDrop.bind(this));
        }
        if (fileInput) {
            fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        }

        // File tab switching within bulk upload
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn') && 
                e.target.closest('#fileListSection')) {
                const targetPane = e.target.getAttribute('data-tab');
                if (targetPane === 'all-files-pane' || targetPane === 'unmatched-files-pane') {
                    this.switchFileTab(targetPane);
                }
            }
        });
    }

    setupMainTabListeners() {
        document.querySelectorAll('.tabs-container .tab-btn').forEach(btn => {
            if (!btn.closest('.tab-content-container')) { // Only main tabs, not nested tabs
                btn.addEventListener('click', (e) => {
                    const targetTab = e.currentTarget.dataset.tab;
                    this.activateTab(targetTab);
                });
            }
        });
    }

    setupExistingTransactionListeners() {
        const recordSearchInput = document.getElementById('recordSearchInputExisting');
        const recordSearchContainer = document.getElementById('searchResultsContainerExisting');
        
        if (recordSearchInput) {
            recordSearchInput.addEventListener('input', (e) => this.searchRecords(e.target.value, 'existing'));
            recordSearchInput.addEventListener('blur', () => {
                setTimeout(() => { 
                    if (recordSearchContainer) recordSearchContainer.style.display = 'none'; 
                }, 200);
            });
        }

        const filesExisting = document.getElementById('filesExisting');
        const filesExistingButton = document.getElementById('filesExistingButton');
        
        if (filesExisting) {
            filesExisting.addEventListener('change', (e) => {
                this.handleFileChange(e, 'existing-transaction-pane');
                const info = document.getElementById('filesExistingInfo');
                if (info) {
                    info.textContent = e.target.files.length > 0 ? 
                        `${e.target.files.length} dosya seçildi.` : 'Henüz dosya seçilmedi.';
                }
            });
        }

        if (filesExistingButton) {
            filesExistingButton.addEventListener('click', () => filesExisting?.click());
        }

        // Transaction type change listeners
        const childTransactionType = document.getElementById('specificChildTransactionType');
        const deliveryDate = document.getElementById('existingChildTransactionDeliveryDate');
        
        if (childTransactionType) {
            childTransactionType.addEventListener('change', () => this.checkFormCompleteness());
        }
        if (deliveryDate) {
            deliveryDate.addEventListener('change', () => this.checkFormCompleteness());
        }
    }

    setupManualTransactionListeners() {
        const recordSearchInput = document.getElementById('recordSearchInputManual');
        const recordSearchContainer = document.getElementById('searchResultsContainerManual');
        
        if (recordSearchInput) {
            recordSearchInput.addEventListener('input', (e) => this.searchRecords(e.target.value, 'manual'));
            recordSearchInput.addEventListener('blur', () => {
                setTimeout(() => { 
                    if (recordSearchContainer) recordSearchContainer.style.display = 'none'; 
                }, 200);
            });
        }

        const filesManual = document.getElementById('filesManual');
        const filesManualButton = document.getElementById('filesManualButton');
        
        if (filesManual) {
            filesManual.addEventListener('change', (e) => {
                this.handleFileChange(e, 'manual-indexing-pane');
                const info = document.getElementById('filesManualInfo');
                if (info) {
                    info.textContent = e.target.files.length > 0 ? 
                        `${e.target.files.length} dosya seçildi.` : 'Henüz dosya seçilmedi.';
                }
            });
        }

        if (filesManualButton) {
            filesManualButton.addEventListener('click', () => filesManual?.click());
        }

        // Manual transaction type listeners
        const manualTransactionType = document.getElementById('specificManualTransactionType');
        const manualDeliveryDate = document.getElementById('manualTransactionDeliveryDate');
        
        if (manualTransactionType) {
            manualTransactionType.addEventListener('change', () => this.checkFormCompleteness());
        }
        if (manualDeliveryDate) {
            manualDeliveryDate.addEventListener('change', () => this.checkFormCompleteness());
        }
    }

    setupCommonFormListeners() {
        // Form submission
        const submitBtn = document.getElementById('indexDocumentsBtn');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.handleSubmit());
        }

        // Form reset
        const resetBtn = document.getElementById('resetIndexingFormBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetForm());
        }

        // File removal listeners
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-uploaded-file')) {
                const fileId = e.target.dataset.fileId;
                const tabKey = e.target.dataset.tabKey;
                let files = this.uploadedFiles.get(tabKey) || [];
                this.uploadedFiles.set(tabKey, files.filter(f => f.id !== fileId));
                this.renderUploadedFilesList(tabKey);
                this.checkFormCompleteness();
            }
        });
    }

    // Tab Management
    activateTab(tabName) {
        // Remove active class from all main tabs
        document.querySelectorAll('.tabs-container .tab-btn').forEach(btn => {
            if (!btn.closest('.tab-content-container')) {
                btn.classList.remove('active');
            }
        });
        
        // Remove active class from all tab panes
        document.querySelectorAll('.tab-content-container > .tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        
        // Add active class to selected tab and pane
        const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]:not(.tab-content-container .tab-btn)`);
        if (activeBtn) activeBtn.classList.add('active');
        
        const activePane = document.getElementById(tabName);
        if (activePane) activePane.classList.add('active');

        this.activeTab = tabName;
        this.setRequiredFieldsForActiveTab();
        this.checkFormCompleteness();
    }

    setRequiredFieldsForActiveTab() {
        // Clear all required attributes first
        document.querySelectorAll('[required]').forEach(el => el.removeAttribute('required'));

        if (this.activeTab === 'existing-transaction-pane') {
            const elements = [
                'recordSearchInputExisting',
                'specificChildTransactionType', 
                'filesExisting'
            ];
            elements.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.setAttribute('required', 'required');
            });
        } else if (this.activeTab === 'manual-indexing-pane') {
            const elements = [
                'recordSearchInputManual',
                'specificManualTransactionType'
            ];
            elements.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.setAttribute('required', 'required');
            });
        }
    }

    // Search functionality
    searchRecords(query, tabContext) {
        const searchResultsContainerId = tabContext === 'existing' ?
            'searchResultsContainerExisting' : 'searchResultsContainerManual';
        const container = document.getElementById(searchResultsContainerId);

        if (!container) return;

        if (query.length < 3) {
            container.innerHTML = '<p class="no-results-message p-2">Arama yapmak için en az 3 karakter girin.</p>';
            container.style.display = 'block';
            return;
        }

        container.innerHTML = '';
        const filtered = this.allRecords.filter(r => 
            (r.title && r.title.toLowerCase().includes(query.toLowerCase())) ||
            (r.applicationNumber && r.applicationNumber.toLowerCase().includes(query.toLowerCase()))
        );
        
        if (filtered.length === 0) {
            container.innerHTML = '<p class="no-results-message p-2">Kayıt bulunamadı.</p>';
        } else {
            filtered.forEach(record => {
                const item = document.createElement('div');
                item.className = 'record-search-item';
                item.dataset.id = record.id;
                item.innerHTML = `
                    <div class="record-info">
                        <div>${record.title}</div>
                        <small>${record.applicationNumber}</small>
                    </div>
                `;
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.selectRecordBasedOnTab(record.id, tabContext);
                });
                container.appendChild(item);
            });
        }
        container.style.display = 'block';
    }

    async selectRecordBasedOnTab(recordId, tabContext) {
        const record = this.allRecords.find(r => r.id === recordId);
        if (!record) return;

        const selectedRecordDisplayId = tabContext === 'existing' ? 
            'selectedRecordDisplayExisting' : 'selectedRecordDisplayManual';
        const recordSearchInputId = tabContext === 'existing' ? 
            'recordSearchInputExisting' : 'recordSearchInputManual';
        const searchResultsContainerId = tabContext === 'existing' ?
            'searchResultsContainerExisting' : 'searchResultsContainerManual';

        // Update UI elements
        const displayElement = document.getElementById(selectedRecordDisplayId);
        const inputElement = document.getElementById(recordSearchInputId);
        const containerElement = document.getElementById(searchResultsContainerId);

        if (displayElement) displayElement.value = `${record.title} - ${record.applicationNumber}`;
        if (inputElement) inputElement.value = '';
        if (containerElement) containerElement.style.display = 'none';

        // Set selected record
        if (tabContext === 'existing') {
            this.selectedRecordExisting = record;
            await this.loadTransactionsForRecord(record.id);
        } else {
            this.selectedRecordManual = record;
            this.populateManualTransactionTypeSelect();
        }

        this.checkFormCompleteness();
    }

    async loadTransactionsForRecord(recordId) {
        try {
            const transactionsResult = await ipRecordsService.getRecordTransactions(recordId);
            if (transactionsResult.success) {
                this.populateTransactionsList(transactionsResult.data);
            }
        } catch (error) {
            console.error('Transactions loading error:', error);
        }
    }

    populateTransactionsList(transactions) {
        const container = document.getElementById('transactions-list-for-selection');
        if (!container) return;

        if (!transactions || transactions.length === 0) {
            container.innerHTML = '<p class="text-muted p-2">Bu kayıt için işlem bulunamadı.</p>';
            return;
        }

        const parentTransactions = transactions
            .filter(tx => tx.transactionHierarchy === 'parent' || !tx.transactionHierarchy)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (parentTransactions.length === 0) {
            container.innerHTML = '<p class="text-muted p-2">Dosya eklenecek mevcut ana işlem bulunamadı.</p>';
            return;
        }

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
                this.selectedTransactionId = e.currentTarget.dataset.id;
                
                // Update UI selection
                document.querySelectorAll('#transactions-list-for-selection .transaction-list-item')
                    .forEach(el => el.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                
                // Reset child transaction fields
                const childTypeSelect = document.getElementById('specificChildTransactionType');
                const deliveryDateInput = document.getElementById('existingChildTransactionDeliveryDate');
                if (childTypeSelect) childTypeSelect.value = '';
                if (deliveryDateInput) deliveryDateInput.value = '';
                
                // Populate child transaction types
                const selectedParentTransactionDefinition = this.allTransactionTypes.find(t => t.id === tx.type);
                if (selectedParentTransactionDefinition && selectedParentTransactionDefinition.indexFile) {
                    this.populateChildTransactionTypeSelect(selectedParentTransactionDefinition.indexFile);
                    const childInputs = document.getElementById('existingChildTransactionInputs');
                    if (childInputs) childInputs.style.display = 'block';
                } else {
                    this.populateChildTransactionTypeSelect([]);
                    const childInputs = document.getElementById('existingChildTransactionInputs');
                    if (childInputs) childInputs.style.display = 'none';
                }
                
                this.checkFormCompleteness();
            });
            container.appendChild(item);
        });
    }

    populateChildTransactionTypeSelect(allowedChildTypeIds = []) {
        const select = document.getElementById('specificChildTransactionType');
        if (!select) return;

        select.innerHTML = '<option value="" disabled selected>Alt işlem türü seçin...</option>';
        
        if (!allowedChildTypeIds || allowedChildTypeIds.length === 0) return;

        const childTypes = this.allTransactionTypes.filter(type => 
            type.hierarchy === 'child' && allowedChildTypeIds.includes(type.id)
        );

        childTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.alias || type.name;
            select.appendChild(option);
        });
    }

    populateManualTransactionTypeSelect() {
        const select = document.getElementById('specificManualTransactionType');
        if (!select) return;

        select.innerHTML = '<option value="" disabled selected>İşlem türü seçin...</option>';
        
        const parentTypes = this.allTransactionTypes.filter(type => 
            type.hierarchy === 'parent' || !type.hierarchy
        );

        parentTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.alias || type.name;
            select.appendChild(option);
        });
    }

    // File handling
    handleFileChange(event, tabKey) {
        const fileInput = event.target;
        const files = Array.from(fileInput.files);
        
        this.uploadedFiles.set(tabKey, []);
        
        files.forEach(file => {
            this.uploadedFiles.get(tabKey).push({
                id: `temp_${Date.now()}_${generateUUID()}`,
                fileObject: file,
                documentDesignation: ''
            });
        });
        
        this.renderUploadedFilesList(tabKey);
        this.checkFormCompleteness();
    }

    renderUploadedFilesList(tabKey) {
        const containerId = tabKey === 'existing-transaction-pane' ? 
            'fileListExisting' : 'fileListManual';
        const container = document.getElementById(containerId);
        if (!container) return;

        const files = this.uploadedFiles.get(tabKey) || [];
        if (files.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = files.map(file => `
            <div class="file-item" data-file-id="${file.id}">
                <div class="file-item-name">${file.fileObject.name}</div>
                <div class="file-item-controls">
                    <select class="file-item-select" data-file-id="${file.id}">
                        <option value="">Belge türü seçin...</option>
                        <option value="general">Genel Belge</option>
                        <option value="decision">Karar</option>
                        <option value="notice">Tebliğ</option>
                        <option value="application">Başvuru</option>
                    </select>
                    <button type="button" class="remove-file remove-uploaded-file" 
                            data-file-id="${file.id}" data-tab-key="${tabKey}">×</button>
                </div>
            </div>
        `).join('');
    }

    // Form validation
    checkFormCompleteness() {
        let canSubmit = false;

        if (this.activeTab === 'existing-transaction-pane') {
            const specificChildTransactionTypeSelected = document.getElementById('specificChildTransactionType')?.value;
            const filesSelected = this.uploadedFiles.get('existing-transaction-pane')?.length > 0;
            canSubmit = this.selectedRecordExisting !== null && 
                       this.selectedTransactionId !== null && 
                       specificChildTransactionTypeSelected && 
                       filesSelected;
        } else if (this.activeTab === 'manual-indexing-pane') {
            const specificManualTransactionTypeSelected = document.getElementById('specificManualTransactionType')?.value;
            const filesSelected = this.uploadedFiles.get('manual-indexing-pane')?.length > 0;
            canSubmit = this.selectedRecordManual !== null && specificManualTransactionTypeSelected && filesSelected;
        } else if (this.activeTab === 'bulk-indexing-pane') {
            canSubmit = false; // Bulk indexing has its own submission logic
        }

        const submitBtn = document.getElementById('indexDocumentsBtn');
        if (submitBtn) {
            submitBtn.disabled = !canSubmit;
        }
    }

    // Form submission
    async handleSubmit() {
        const btn = document.getElementById('indexDocumentsBtn');
        if (btn) btn.disabled = true;
        
        showNotification('İşlem kaydediliyor...', 'info');

        try {
            if (this.activeTab === 'existing-transaction-pane') {
                await this.handleExistingTransactionSubmit();
            } else if (this.activeTab === 'manual-indexing-pane') {
                await this.handleManualTransactionSubmit();
            }
        } catch (error) {
            console.error('Submit error:', error);
            showNotification('İşlem kaydedilirken hata oluştu: ' + error.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async handleExistingTransactionSubmit() {
        // Implementation for existing transaction submission
        const childTypeId = document.getElementById('specificChildTransactionType')?.value;
        const deliveryDateStr = document.getElementById('existingChildTransactionDeliveryDate')?.value;
        const files = this.uploadedFiles.get('existing-transaction-pane') || [];

        // Create child transaction and associate files
        const childTransactionData = {
            type: childTypeId,
            transactionHierarchy: 'child',
            parentTransactionId: this.selectedTransactionId,
            deliveryDate: deliveryDateStr ? new Date(deliveryDateStr).toISOString() : null,
            timestamp: new Date().toISOString()
        };

        const childResult = await ipRecordsService.addTransactionToRecord(
            this.selectedRecordExisting.id, 
            childTransactionData
        );

        if (!childResult.success) {
            throw new Error(childResult.error || 'Alt işlem oluşturulamadı');
        }

        // Process file uploads here
        showNotification('İşlem başarıyla kaydedildi!', 'success');
        this.resetForm();
    }

    async handleManualTransactionSubmit() {
        // Implementation for manual transaction submission
        const transactionTypeId = document.getElementById('specificManualTransactionType')?.value;
        const deliveryDateStr = document.getElementById('manualTransactionDeliveryDate')?.value;
        const notes = document.getElementById('manualTransactionNotes')?.value;
        const files = this.uploadedFiles.get('manual-indexing-pane') || [];

        const transactionData = {
            type: transactionTypeId,
            transactionHierarchy: 'parent',
            deliveryDate: deliveryDateStr ? new Date(deliveryDateStr).toISOString() : null,
            notes: notes || '',
            timestamp: new Date().toISOString()
        };

        const result = await ipRecordsService.addTransactionToRecord(
            this.selectedRecordManual.id, 
            transactionData
        );

        if (!result.success) {
            throw new Error(result.error || 'Manuel işlem oluşturulamadı');
        }

        // Process file uploads here
        showNotification('Manuel işlem başarıyla oluşturuldu!', 'success');
        this.resetForm();
    }

    // Form reset
    resetForm() {
        // Clear file inputs
        const fileInputs = ['filesExisting', 'filesManual', 'bulkFiles'];
        fileInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });

        // Clear file info texts
        const fileInfos = ['filesExistingInfo', 'filesManualInfo', 'bulkFilesInfo'];
        fileInfos.forEach(id => {
            const info = document.getElementById(id);
            if (info) info.textContent = 'Henüz dosya seçilmedi.';
        });

        // Clear record displays
        const recordDisplays = ['selectedRecordDisplayExisting', 'selectedRecordDisplayManual'];
        recordDisplays.forEach(id => {
            const display = document.getElementById(id);
            if (display) display.value = '';
        });

        // Clear transaction list
        const transactionsList = document.getElementById('transactions-list-for-selection');
        if (transactionsList) {
            transactionsList.innerHTML = '<p class="text-muted p-2">Lütfen bir kayıt seçin.</p>';
        }

        // Hide child transaction inputs
        const childInputs = document.getElementById('existingChildTransactionInputs');
        if (childInputs) childInputs.style.display = 'none';

        // Reset selections
        this.resetSelections();
        this.uploadedFiles.clear();

        // Activate first tab
        this.activateTab('existing-transaction-pane');
        this.checkFormCompleteness();

        showNotification('Form temizlendi.', 'info');
    }

    resetSelections() {
        this.selectedRecordExisting = null;
        this.selectedRecordManual = null;
        this.selectedTransactionId = null;
    }

    // Bulk upload specific methods (existing functionality)
    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
        if (files.length > 0) {
            this.processFiles(files);
        }
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.processFiles(files);
    }

    async processFiles(files) {
        // Implementation for bulk PDF processing
        console.log('Processing bulk files:', files);
        // Existing bulk processing logic here
    }

    switchFileTab(targetPane) {
        document.querySelectorAll('#fileListSection .tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        document.querySelectorAll('#fileListSection .tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });

        const selectedTab = document.querySelector(`#fileListSection [data-tab="${targetPane}"]`);
        if (selectedTab) selectedTab.classList.add('active');

        const selectedPane = document.getElementById(targetPane);
        if (selectedPane) selectedPane.classList.add('active');

        this.activeFileTab = targetPane;
        this.updateUI();
    }

    setupRealtimeListener() {
        // Implementation for real-time PDF status updates
        console.log('Setting up real-time listener for bulk files');
    }

    updateUI() {
        // Update UI based on current state
        this.updateBulkUploadUI();
    }

    updateBulkUploadUI() {
        // Update bulk upload specific UI elements
        const hasFiles = this.uploadedFiles.length > 0;
        const fileListSection = document.getElementById('fileListSection');
        if (fileListSection) {
            fileListSection.style.display = hasFiles ? 'block' : 'none';
        }
    }

    renderFileLists() {
        // Render file lists for bulk upload
        console.log('Rendering file lists for bulk upload');
    }

    // Cleanup
    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}