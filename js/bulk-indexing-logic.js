// js/bulk-indexing-logic.js
import { authService, ipRecordsService, generateUUID, bulkIndexingService } from '../firebase-config.js';
import { showNotification, formatFileSize, readFileAsDataURL } from '../utils.js';
import { getFirestore, writeBatch, doc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const CHILD_TRANSACTION_TYPES = [
    'Ret Kararı',
    'Kabul Kararı',
    'Eksiklik Bildirimi',
    'Karara İtiraz',
    'Yayına İtiraz',
    'İtiraza Cevap',
    'Genel',
    'Diğer'
];

export class BulkIndexingModule {
    constructor(allRecords) {
        this.currentUser = authService.getCurrentUser();
        this.allRecords = allRecords; // Ana modülden gelen kayıtlar
        this.pendingBulkIndexJobs = [];
        this.indexedBulkJobs = [];
        this.bulkIndexingRecordsCache = new Map();

        this.init();
    }

    async init() {
        if (!this.currentUser) {
            window.location.href = 'index.html'; // Kullanıcı yoksa ana sayfaya yönlendir
            return;
        }
        await this.loadBulkJobsFromFirestore();
        this.setupEventListeners();
        this.renderBulkIndexingTable(); // Başlangıçta tabloyu render et
        this.renderIndexedBulkTable(); // İndekslenmiş tabloyu render et
        this.checkFormCompleteness(); // Formun başlangıçtaki durumunu kontrol et
    }

    loadBulkJobsFromFirestore = async () => {
        if (!this.currentUser) return;

        const result = await bulkIndexingService.getPendingJobs(this.currentUser.uid);
        if (result.success) {
            this.pendingBulkIndexJobs = result.data.filter(job => job.status !== 'success');
            this.indexedBulkJobs = result.data.filter(job => job.status === 'success');
        } else {
            showNotification('Bekleyen toplu indeksleme işleri yüklenemedi: ' + result.error, 'error');
        }
    }

    setupEventListeners = () => {
        const bulkFilesInput = document.getElementById('bulkFiles');
        if (bulkFilesInput) {
            bulkFilesInput.addEventListener('change', this.handleBulkFilesChange);
        }
        const bulkFilesButton = document.getElementById('bulkFilesButton');
        if (bulkFilesButton) {
            bulkFilesButton.addEventListener('click', () => {
                if (bulkFilesInput) bulkFilesInput.click();
            });
        }
        const bulkDeliveryDateInput = document.getElementById('bulkDeliveryDate');
        if (bulkDeliveryDateInput) {
            bulkDeliveryDateInput.addEventListener('change', this.updateBulkJobsTebligDate);
        }

        const selectAllBulkJobsCheckbox = document.getElementById('selectAllBulkJobs');
        if(selectAllBulkJobsCheckbox) {
            selectAllBulkJobsCheckbox.addEventListener('change', this.toggleSelectAllBulkJobs);
        }

        document.querySelectorAll('.bulk-tabs-container .bulk-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBulkTab = e.currentTarget.dataset.bulkTab;
                this.activateBulkTab(targetBulkTab);
            });
        });

        const bulkIndexingTable = document.getElementById('bulkIndexingTable');
        if (bulkIndexingTable) {
            bulkIndexingTable.addEventListener('input', (e) => {
                const target = e.target;
                if (target.classList.contains('bulk-record-manual-search-input')) {
                    this.searchRecordsForBulkJob(e);
                }
            });

            bulkIndexingTable.addEventListener('blur', (e) => {
                const target = e.target;
                if (target.classList.contains('bulk-record-manual-search-input')) {
                    setTimeout(() => {
                        const jobId = target.dataset.jobId;
                        const resultsContainer = document.querySelector(`.bulk-search-results-container[data-job-id="${jobId}"]`);
                        if (resultsContainer) {
                            resultsContainer.style.display = 'none';
                        }
                    }, 200);
                }
            }, true);

            bulkIndexingTable.addEventListener('focus', (e) => {
                const target = e.target;
                if (target.classList.contains('bulk-record-manual-search-input')) {
                    const jobId = target.dataset.jobId;
                    const container = document.querySelector(`.bulk-search-results-container[data-job-id="${jobId}"]`);
                    if (container && container.innerHTML.trim() !== '<p class="no-results-message p-2">Arama yapmak için en az 3 karakter girin.</p>' && container.innerHTML.trim() !== '<p class="no-results-message p-2">Kayıt bulunamadı.</p>') {
                        container.style.display = 'block';
                    }
                }
            }, true);

            bulkIndexingTable.addEventListener('click', (e) => {
                const target = e.target;
                if (target.classList.contains('record-search-item')) {
                    const jobId = target.closest('.bulk-search-results-container').dataset.jobId;
                    const recordId = target.dataset.id;
                    this.selectRecordForBulkJob(recordId, jobId);
                } else if (target.classList.contains('bulk-parent-select')) {
                    this.selectParentForBulkJob(target.value, target.dataset.jobId);
                } else if (target.classList.contains('bulk-child-type-select')) {
                    this.updateJobSpecificChildType(target.value, target.dataset.jobId);
                } else if (target.classList.contains('bulk-job-delivery-date')) {
                    this.updateJobSpecificDeliveryDate(target.value, target.dataset.jobId);
                } else if (target.classList.contains('bulk-delete-btn')) { // DEĞİŞTİ
                    this.deleteBulkJob(e); // DEĞİŞTİ
                } else if (target.classList.contains('bulk-retry-btn')) {
                    this.retryBulkJob(e);
                } else if (target.classList.contains('bulk-job-checkbox')) {
                    this.handleBulkJobCheckboxChange(e);
                }
            });
        }

        const indexDocumentsBtn = document.getElementById('indexDocumentsBtn');
        if (indexDocumentsBtn) {
            indexDocumentsBtn.addEventListener('click', this.handleSubmit);
        }
        const resetIndexingFormBtn = document.getElementById('resetIndexingFormBtn');
        if (resetIndexingFormBtn) {
            resetIndexingFormBtn.addEventListener('click', this.resetForm);
        }
    }

    activateBulkTab = (bulkTabName) => {
        document.querySelectorAll('.bulk-tab-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.bulk-tab-btn[data-bulk-tab="${bulkTabName}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
        document.querySelectorAll('.bulk-tab-pane').forEach(pane => pane.classList.remove('active'));
        const activePane = document.getElementById(bulkTabName);
        if (activePane) {
            activePane.classList.add('active');
        }

        this.checkFormCompleteness();
    }

    toggleSelectAllBulkJobs = (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll('.bulk-job-checkbox').forEach(checkbox => {
            if (!checkbox.disabled) {
                checkbox.checked = isChecked;
                const jobId = checkbox.dataset.jobId;
                const job = this.pendingBulkIndexJobs.find(j => j.jobId === jobId);
                if (job) {
                    job.isSelected = isChecked;
                    job.status = this.checkJobCompleteness(job) ? 'ready' : 'pending';
                }
            }
        });
        this.renderBulkIndexingTable();
        this.checkFormCompleteness();
        this.saveBulkJobsToFirestore();
    }

    handleBulkJobCheckboxChange = (e) => {
        const jobId = e.target.dataset.jobId;
        const isChecked = e.target.checked;
        const job = this.pendingBulkIndexJobs.find(j => j.jobId === jobId);
        if (job) {
            job.isSelected = isChecked;
            job.status = this.checkJobCompleteness(job) ? 'ready' : 'pending';
        }
        const allChecked = Array.from(document.querySelectorAll('.bulk-job-checkbox')).every(cb => cb.checked || cb.disabled);
        document.getElementById('selectAllBulkJobs').checked = allChecked;

        this.renderBulkIndexingTable();
        this.checkFormCompleteness();
        this.saveBulkJobsToFirestore();
    }

    checkFormCompleteness = () => {
        const bulkDeliveryDateEl = document.getElementById('bulkDeliveryDate');
        const bulkDeliveryDate = bulkDeliveryDateEl ? bulkDeliveryDateEl.value : '';
        const bulkFilesInput = document.getElementById('bulkFiles');
        const filesExist = (bulkFilesInput && bulkFilesInput.files && bulkFilesInput.files.length > 0);

        const selectedJobs = this.pendingBulkIndexJobs.filter(job => job.isSelected);

        const allSelectedJobsValid = selectedJobs.every(job =>
            this.checkJobCompleteness(job)
        );

        const indexDocumentsBtn = document.getElementById('indexDocumentsBtn');
        if (indexDocumentsBtn) {
            indexDocumentsBtn.disabled = !(bulkDeliveryDate !== '' && filesExist && selectedJobs.length > 0 && allSelectedJobsValid);
        }
    }

    handleSubmit = async () => {
        const btn = document.getElementById('indexDocumentsBtn');
        if (!btn) return;
        btn.disabled = true;
        showNotification('İşlem kaydediliyor...', 'info');

        const bulkDeliveryDateFromInput = document.getElementById('bulkDeliveryDate').value;

        if (!bulkDeliveryDateFromInput) {
            showNotification('Lütfen toplu işlem için tebliğ tarihi seçin.', 'error');
            btn.disabled = false; return;
        }

        const selectedBulkJobs = this.pendingBulkIndexJobs.filter(job => job.isSelected);

        if (selectedBulkJobs.length === 0) {
            showNotification('İşlenecek PDF seçilmedi veya eksik bilgi var.', 'error');
            btn.disabled = false; return;
        }

        showNotification('Toplu indeksleme başlatılıyor...', 'info');
        let successfulJobs = 0;
        let failedJobs = 0;

        for (const job of selectedBulkJobs) {
            if (!this.checkJobCompleteness(job)) {
                job.status = 'error';
                job.errorMessage = job.errorMessage || 'Eksik veya hatalı bilgi.';
                failedJobs++;
                this.renderBulkIndexingTable();
                showNotification(`'${job.fileName}' işlenemedi: Eksik bilgi.`, 'error', 8000);
                continue;
            }

            job.status = 'processing';
            this.renderBulkIndexingTable();

            try {
                let recordToUpdate = this.allRecords.find(r => r.id === job.matchedRecordId);
                if (!recordToUpdate) {
                    const recordResult = await ipRecordsService.getRecordById(job.matchedRecordId);
                    if (recordResult.success) {
                        recordToUpdate = recordResult.data;
                        this.bulkIndexingRecordsCache.set(job.matchedRecordId, recordToUpdate);
                    } else {
                        throw new Error(`Kayıt bulunamadı: ${job.matchedRecordId}`);
                    }
                }

                const parentTransactionForChild = (recordToUpdate.transactions || []).find(tx => tx.transactionId === job.selectedParentTransactionId);

                if (!parentTransactionForChild) {
                    throw new Error('Seçilen parent işlem bulunamadı veya geçersiz.');
                }

                const newChildTransactionData = {
                    designation: job.childTransactionType,
                    transactionType: job.childTransactionType,
                    notes: `Toplu indeksleme ile eklenen PDF (${job.fileName}).`,
                    transactionHierarchy: 'child',
                    parentId: parentTransactionForChild.transactionId,
                    deliveryDate: new Date(job.tebligDate).toISOString()
                };
                const childTransactionAddResult = await ipRecordsService.addTransactionToRecord(recordToUpdate.id, newChildTransactionData);

                if (!childTransactionAddResult.success) {
                    throw new Error(childTransactionAddResult.error || 'Alt işlem oluşturulurken hata oluştu.');
                }
                const newChildTransactionId = childTransactionAddResult.data.transactionId;

                const fileContent = job.fileContent;
                const fileToUpload = {
                    fileName: job.fileName,
                    fileType: job.fileType,
                    fileSize: job.fileSize,
                    fileUrl: fileContent,
                    relatedTransactionId: newChildTransactionId,
                    documentDesignation: job.childTransactionType
                };
                const fileAddResult = await ipRecordsService.addFileToRecord(recordToUpdate.id, fileToUpload);

                if (!fileAddResult.success) {
                    console.error(`Dosya yüklenirken hata (${job.fileName}): ${fileAddResult.error}`);
                    throw new Error(fileAddResult.error || 'Dosya yüklenirken hata oluştu.');
                }

                job.status = 'success';
                successfulJobs++;
                showNotification(`'${job.fileName}' başarıyla indekslendi.`, 'success');

            } catch (jobError) {
                job.status = 'error';
                job.errorMessage = jobError.message;
                failedJobs++;
                console.error(`'${job.fileName}' işlenirken hata:`, jobError);
                showNotification(`'${job.fileName}' işlenirken hata: ${jobError.message}`, 'error', 8000);
            } finally {
                await bulkIndexingService.updateJob(job.jobId, { status: job.status, errorMessage: job.errorMessage || null });
                this.renderBulkIndexingTable();
            }
        }

        showNotification(`Toplu indeksleme tamamlandı. Başarılı: ${successfulJobs}, Hata: ${failedJobs}`, 'info', 5000);

        const jobsToKeepInPending = [];
        for (const job of this.pendingBulkIndexJobs) {
            if (job.status === 'success') {
                this.indexedBulkJobs.push(job);
                await bulkIndexingService.deleteJob(job.jobId);
            } else {
                jobsToKeepInPending.push(job);
            }
        }
        this.pendingBulkIndexJobs = jobsToKeepInPending;

        this.resetForm();
        this.saveBulkJobsToFirestore();
    }

    resetForm = () => {
        const bulkDeliveryDateInput = document.getElementById('bulkDeliveryDate');
        if (bulkDeliveryDateInput) bulkDeliveryDateInput.value = '';

        const bulkFilesInfo = document.getElementById('bulkFilesInfo');
        if (bulkFilesInfo) bulkFilesInfo.textContent = 'Henüz PDF dosyası seçilmedi.';

        const bulkFilesInput = document.getElementById('bulkFiles');
        if (bulkFilesInput) bulkFilesInput.value = '';

        this.pendingBulkIndexJobs = [];
        this.indexedBulkJobs = [];
        this.renderBulkIndexingTable();
        this.renderIndexedBulkTable();
        this.clearAllPendingBulkJobsInFirestore();
        this.checkFormCompleteness();
    }

    clearAllPendingBulkJobsInFirestore = async () => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return;
        try {
            const db = getFirestore();
            const result = await bulkIndexingService.getPendingJobs(currentUser.uid);
            if (result.success) {
                const batch = writeBatch(db);
                result.data.forEach(job => {
                    if (job.status !== 'success' && job.status !== 'processing') {
                        batch.delete(doc(bulkIndexingService.collectionRef, job.jobId));
                    }
                });
                await batch.commit();
            }
        } catch (error) {
            console.error("Firestore'daki beklemedeki işler silinirken hata:", error);
            showNotification("Bekleyen işler temizlenirken hata oluştu.", "error");
        }
    }

    saveBulkJobsToFirestore = async () => {
        if (!this.currentUser) return;
        try {
            const db = getFirestore();
            const batch = writeBatch(db);
            this.pendingBulkIndexJobs.forEach(job => {
                const jobRef = doc(bulkIndexingService.collectionRef, job.jobId);
                batch.set(jobRef, {
                    fileName: job.fileName,
                    fileSize: job.fileSize,
                    fileType: job.fileType,
                    fileContent: job.fileContent,
                    extractedAppNumber: job.extractedAppNumber,
                    matchedRecordId: job.matchedRecordId,
                    matchedRecordDisplay: job.matchedRecordDisplay,
                    selectedParentTransactionId: job.selectedParentTransactionId,
                    selectedParentTransactionDisplay: job.selectedParentTransactionDisplay,
                    childTransactionType: job.childTransactionType,
                    tebligDate: job.tebligDate,
                    status: job.status,
                    errorMessage: job.errorMessage || null,
                    isSelected: job.isSelected,
                    uploadedAt: job.uploadedAt,
                    userId: job.userId,
                    userEmail: job.userEmail
                }, { merge: true });
            });
            await batch.commit();
        } catch (error) {
            console.error("Toplu işleme işleri Firestore'a kaydedilirken hata:", error);
            showNotification("İşleme listesi kaydedilirken hata oluştu: " + error.message, "error");
        }
    }


    handleBulkFilesChange = async (event) => {
        const fileInput = document.getElementById('bulkFiles');
        const files = Array.from(fileInput.files);

        if (files.length === 0) {
            this.pendingBulkIndexJobs = [];
            const bulkFilesInfo = document.getElementById('bulkFilesInfo');
            if (bulkFilesInfo) bulkFilesInfo.textContent = 'Henüz PDF dosyası seçilmedi.';
            this.renderBulkIndexingTable();
            this.checkFormCompleteness();
            this.clearAllPendingBulkJobsInFirestore();
            return;
        }

        showNotification('PDF dosyaları işleniyor...', 'info', 3000);

        const commonTebligDateInput = document.getElementById('bulkDeliveryDate');
        const commonTebligDate = commonTebligDateInput ? commonTebligDateInput.value : '';

        if (!commonTebligDate) {
            showNotification('Lütfen toplu işlem için ortak tebliğ tarihini girin.', 'error');
            if (fileInput) fileInput.value = '';
            this.checkFormCompleteness();
            return;
        }

        const allExistingFileIdentifiers = new Set();
        this.allRecords.forEach(record => {
            (record.files || []).forEach(file => {
                allExistingFileIdentifiers.add(`${file.fileName}_${file.fileSize}`);
            });
        });
        this.pendingBulkIndexJobs.forEach(job => {
            if (job.fileName && job.fileSize) {
                allExistingFileIdentifiers.add(`${job.fileName}_${job.fileSize}`);
            }
        });

        this.pendingBulkIndexJobs = [];
        await this.clearAllPendingBulkJobsInFirestore();


        for (const file of files) {
            const fileIdentifier = `${file.name}_${file.size}`;
            if (allExistingFileIdentifiers.has(fileIdentifier)) {
                showNotification(`'${file.name}' (${formatFileSize(file.size)}) zaten indekslenmiş veya işleme listesinde mevcut ve atlandı.`, 'warning', 6000);
                continue;
            }
            allExistingFileIdentifiers.add(fileIdentifier);


            let extractedAppNumber = this.extractApplicationNumberFromFileName(file.name);

            if (extractedAppNumber) {
                extractedAppNumber = extractedAppNumber.replace(/[-_]/g, '/');
            }


            let matchedRecord = null;
            let matchedRecordDisplay = 'Eşleşme Yok';
            let status = 'pending';

            if (extractedAppNumber) {
                matchedRecord = this.allRecords.find(r =>
                    r.applicationNumber &&
                    r.applicationNumber.toLowerCase().replace(/[-_]/g, '/') === extractedAppNumber.toLowerCase()
                );

                if (matchedRecord) {
                    matchedRecordDisplay = `${matchedRecord.title} (${matchedRecord.applicationNumber})`;
                    status = 'ready';
                } else {
                    matchedRecordDisplay = `Eşleşme Yok (Başvuru No: ${extractedAppNumber})`;
                    status = 'pending';
                }
            } else {
                matchedRecordDisplay = 'Başvuru No Dosya Adında Yok';
                status = 'pending';
            }

            const fileContentBase64 = await readFileAsDataURL(file);

            const newJob = {
                jobId: generateUUID(),
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                fileContent: fileContentBase64,
                extractedAppNumber: extractedAppNumber,
                matchedRecordId: matchedRecord ? matchedRecord.id : null,
                matchedRecordDisplay: matchedRecordDisplay,
                selectedParentTransactionId: '',
                selectedParentTransactionDisplay: 'Parent Seçilmedi',
                childTransactionType: '',
                tebligDate: commonTebligDate,
                status: status,
                errorMessage: '',
                isSelected: status === 'ready',
                uploadedAt: new Date().toISOString(),
                userId: this.currentUser.uid,
                userEmail: this.currentUser.email
            };

            const addJobResult = await bulkIndexingService.addJob(newJob);
            if (addJobResult.success) {
                this.pendingBulkIndexJobs.push(addJobResult.data);
                showNotification(`'${newJob.fileName}' işleme listesine eklendi.`, 'info', 3000);
            } else {
                showNotification(`'${newJob.fileName}' işleme listesine eklenirken hata: ${addJobResult.error}`, 'error', 6000);
            }
        }
        const bulkFilesInfo = document.getElementById('bulkFilesInfo');
        if (bulkFilesInfo) bulkFilesInfo.textContent = files.length > 0 ? `${files.length} PDF dosyası seçildi.` : 'Henüz PDF dosyası seçilmedi.';
        this.renderBulkIndexingTable();
        this.checkFormCompleteness();
        this.saveBulkJobsToFirestore();
    }

    extractApplicationNumberFromFileName = (fileName) => {
        const fileNameWithoutExtension = fileName.split('.').slice(0, -1).join('.');

        const regex = /(TR)?\d{4}[_\-\/]?\d+/i;
        const match = fileNameWithoutExtension.match(regex);

        return match ? match[0] : '';
    }

    renderBulkIndexingTable = () => {
        const tableBody = document.getElementById('bulkIndexingTable').querySelector('tbody');
        const tableContainer = document.getElementById('bulkTableContainer');
        const noJobsMessage = document.getElementById('bulkTableNoJobs');
        tableBody.innerHTML = '';

        if (this.pendingBulkIndexJobs.length === 0) {
            tableContainer.style.display = 'none';
            noJobsMessage.style.display = 'block';
        } else {
            tableContainer.style.display = 'block';
            noJobsMessage.style.display = 'none';
        }

        const selectAllBulkJobsCheckbox = document.getElementById('selectAllBulkJobs');
        if (selectAllBulkJobsCheckbox) {
            const allSelectableJobs = this.pendingBulkIndexJobs.filter(job => job.status !== 'processing' && job.status !== 'success');
            const allSelected = allSelectableJobs.every(job => job.isSelected);
            selectAllBulkJobsCheckbox.checked = allSelected && allSelectableJobs.length > 0;
            selectAllBulkJobsCheckbox.disabled = allSelectableJobs.length === 0;
        }


        this.pendingBulkIndexJobs.forEach(job => {
            const row = tableBody.insertRow();
            row.dataset.jobId = job.jobId;

            const populateParentSelectHtml = (jobId, currentRecordId, currentParentId) => {
                const currentRecord = this.allRecords.find(r => r.id === currentRecordId);
                if (!currentRecord || !currentRecord.transactions) return `<select disabled class="form-select"><option value="">Parent Seçin...</option></select>`;

                const parentTransactions = (currentRecord.transactions || [])
                    .filter(tx => tx.transactionHierarchy === 'parent' || !tx.transactionHierarchy)
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                let optionsHtml = '<option value="">Parent Seçin...</option>';
                if (parentTransactions.length === 0) {
                    optionsHtml = '<option value="">Ana İşlem Yok</option>';
                } else {
                    parentTransactions.forEach(tx => {
                        const selected = tx.transactionId === currentParentId ? 'selected' : '';
                        optionsHtml += `<option value="${tx.transactionId}" ${selected}>${tx.designation || tx.transactionType} (${new Date(tx.timestamp).toLocaleDateString('tr-TR')})</option>`;
                    });
                }
                return `
                    <select class="form-select bulk-parent-select" data-job-id="${jobId}" ${job.status === 'processing' || job.status === 'success' ? 'disabled' : ''}>
                        ${optionsHtml}
                    </select>
                `;
            };

            const populateChildTypeSelectHtml = (jobId, currentChildType) => {
                let optionsHtml = '<option value="" disabled selected>Alt işlem türü seçin...</option>';
                CHILD_TRANSACTION_TYPES.forEach(type => {
                    const selected = type === currentChildType ? 'selected' : '';
                    optionsHtml += `<option value="${type}" ${selected}>${type}</option>`;
                });
                return `
                    <select class="form-select bulk-child-type-select" data-job-id="${jobId}" ${job.status === 'processing' || job.status === 'success' ? 'disabled' : ''}>
                        ${optionsHtml}
                    </select>
                `;
            };

            const isJobSelectable = job.status !== 'processing' && job.status !== 'success';

            row.innerHTML = `
                <td><input type="checkbox" class="bulk-job-checkbox" data-job-id="${job.jobId}" ${job.isSelected ? 'checked' : ''} ${!isJobSelectable ? 'disabled' : ''}></td>
                <td><a href="${job.fileContent || '#'}" target="_blank" title="PDF Görüntüle">${job.fileName}</a></td>
                <td>${job.extractedAppNumber || '-'}</td>
                <td class="matched-record-cell">
                    <span class="matched-record-display-text">${job.matchedRecordDisplay}</span>
                    ${job.status === 'pending' || job.status === 'error' || !job.matchedRecordId ?
                        `<div class="search-wrapper" style="margin-top: 5px;">
                            <input type="text" class="form-input bulk-record-manual-search-input"
                                data-job-id="${job.jobId}"
                                value="${job.matchedRecordDisplay === 'Eşleşme Yok' || job.matchedRecordDisplay === 'Başvuru No Dosya Adında Yok' ? '' : job.matchedRecordDisplay}"
                                placeholder="Manuel kayıt ara..."
                                ${!isJobSelectable ? 'disabled' : ''}>
                            <div class="search-results-container bulk-search-results-container" data-job-id="${job.jobId}"></div>
                        </div>` : ''}
                </td>
                <td>${job.matchedRecordId ? populateParentSelectHtml(job.jobId, job.matchedRecordId, job.selectedParentTransactionId) : '<select disabled class="form-select"><option value="">Önce Kayıt Seçin</option></select>'}</td>
                <td>${populateChildTypeSelectHtml(job.jobId, job.childTransactionType)}</td>
                <td><input type="date" class="form-input bulk-job-delivery-date" data-job-id="${job.jobId}" value="${job.tebligDate || ''}" ${!isJobSelectable ? 'disabled' : ''}></td>
                <td><span class="status-text ${job.status}">${job.status === 'pending' ? 'Beklemede' : job.status === 'ready' ? 'Hazır' : job.status === 'processing' ? 'İşleniyor' : job.status === 'success' ? 'Başarılı' : 'Hata'}</span>
                    ${job.errorMessage ? `<br><small style="color:red;">${job.errorMessage}</small>` : ''}
                </td>
                <td>
                    ${job.status === 'error' ? `<button type="button" class="btn btn-sm btn-secondary bulk-retry-btn" data-job-id="${job.jobId}">Tekrar Dene</button>` : ''}
                    ${(job.status === 'ready' || job.status === 'pending' || job.status === 'error') && isJobSelectable ? `<button type="button" class="btn btn-sm btn-danger bulk-delete-btn" data-job-id="${job.jobId}">Sil</button>` : ''}
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    renderIndexedBulkTable = () => {
        const tableBody = document.getElementById('indexedBulkTable').querySelector('tbody');
        const tableContainer = document.getElementById('indexedBulkTableContainerProcessed');
        const noJobsMessage = document.getElementById('indexedBulkTableNoJobs');
        tableBody.innerHTML = '';

        if (this.indexedBulkJobs.length === 0) {
            tableContainer.style.display = 'none';
            noJobsMessage.style.display = 'block';
        } else {
            tableContainer.style.display = 'block';
            noJobsMessage.style.display = 'none';
        }

        this.indexedBulkJobs.forEach(job => {
            const row = tableBody.insertRow();
            row.dataset.jobId = job.jobId;

            row.innerHTML = `
                <td><a href="${job.fileContent || '#'}" target="_blank" title="PDF Görüntüle">${job.fileName}</a></td>
                <td>${job.extractedAppNumber || '-'}</td>
                <td>${job.matchedRecordDisplay}</td>
                <td>${job.selectedParentTransactionDisplay || '-'}</td>
                <td>${job.childTransactionType || '-'}</td>
                <td>${job.tebligDate || '-'}</td>
                <td><span class="status-text ${job.status}">${job.status === 'success' ? 'Başarılı' : 'Hata'}</span></td>
            `;
            tableBody.appendChild(row);
        });
    }


    checkJobCompleteness = (job) => {
        return job.matchedRecordId !== null &&
               job.selectedParentTransactionId !== '' &&
               job.childTransactionType !== '' &&
               job.tebligDate !== '' &&
               job.status !== 'error';
    }

    searchRecordsForBulkJob = (e) => {
        const query = e.target.value;
        const jobId = e.target.dataset.jobId;
        const container = document.querySelector(`.bulk-search-results-container[data-job-id="${jobId}"]`);
        if (!container) return;
        container.innerHTML = '';
        if (query.length < 3) {
            container.innerHTML = '<p class="no-results-message p-2">Arama yapmak için en az 3 karakter girin.</p>';
            container.style.display = 'block';
            return;
        }
        const filtered = this.allRecords.filter(r =>
            (r.title && r.title.toLowerCase().includes(query.toLowerCase())) ||
            (r.applicationNumber && r.applicationNumber.toLowerCase().includes(query.toLowerCase()))
        );

        if(filtered.length === 0) {
            container.innerHTML = '<p class="no-results-message p-2">Kayıt bulunamadı.</p>';
        } else {
            filtered.forEach(record => {
                const item = document.createElement('div');
                item.className = 'record-search-item';
                item.dataset.id = record.id;
                item.innerHTML = `<div class="record-info"><div>${record.title}</div><small>${record.applicationNumber}</small></div>`;
                container.appendChild(item);
            });
        }
        container.style.display = 'block';
    }

    selectRecordForBulkJob = (recordId, jobId) => {
        const job = this.pendingBulkIndexJobs.find(j => j.jobId === jobId);
        const selectedRecord = this.allRecords.find(r => r.id === recordId);
        if (job && selectedRecord) {
            job.matchedRecordId = selectedRecord.id;
            job.matchedRecordDisplay = `${selectedRecord.title} (${selectedRecord.applicationNumber})`;

            job.status = this.checkJobCompleteness(job) ? 'ready' : 'pending';

            this.renderBulkIndexingTable();
        }
        this.checkFormCompleteness();
        this.saveBulkJobsToFirestore();
    }

    selectParentForBulkJob = (parentTransactionId, jobId) => {
        const job = this.pendingBulkIndexJobs.find(j => j.jobId === jobId);
        if (job) {
            job.selectedParentTransactionId = parentTransactionId;
            const currentRecord = this.allRecords.find(r => r.id === job.matchedRecordId);
            if (currentRecord && parentTransactionId) {
                const parentTx = currentRecord.transactions.find(tx => tx.transactionId === parentTransactionId);
                job.selectedParentTransactionDisplay = parentTx ? (parentTx.designation || parentTx.transactionType) : 'Seçili Parent';
            } else {
                job.selectedParentTransactionDisplay = 'Parent Seçilmedi';
            }

            job.status = this.checkJobCompleteness(job) ? 'ready' : 'pending';

            this.renderBulkIndexingTable();
        }
        this.checkFormCompleteness();
        this.saveBulkJobsToFirestore();
    }

    updateJobSpecificChildType = (newType, jobId) => {
        const job = this.pendingBulkIndexJobs.find(j => j.jobId === jobId);
        if (job) {
            job.childTransactionType = newType;

            job.status = this.checkJobCompleteness(job) ? 'ready' : 'pending';

            this.renderBulkIndexingTable();
        }
        this.checkFormCompleteness();
        this.saveBulkJobsToFirestore();
    }

    updateJobSpecificDeliveryDate = (newDate, jobId) => {
        const job = this.pendingBulkIndexJobs.find(j => j.jobId === jobId);
        if (job) {
            job.tebligDate = newDate;

            job.status = this.checkJobCompleteness(job) ? 'ready' : 'pending';

            this.renderBulkIndexingTable();
        }
        this.checkFormCompleteness();
        this.saveBulkJobsToFirestore();
    }

    deleteBulkJob = (e) => { // DEĞİŞTİ
        const jobId = e.target.dataset.jobId;
        const jobIndex = this.pendingBulkIndexJobs.findIndex(j => j.jobId === jobId);
        if (jobIndex > -1) {
            const deletedJob = this.pendingBulkIndexJobs.splice(jobIndex, 1)[0];
            showNotification(`İşlem listeden silindi: ${deletedJob.fileName}`, 'warning'); // DEĞİŞTİ
            bulkIndexingService.deleteJob(deletedJob.jobId);
            this.renderBulkIndexingTable();
            this.checkFormCompleteness();
            this.saveBulkJobsToFirestore();
        }
    }

    retryBulkJob = (e) => {
        const jobId = e.target.dataset.jobId;
        const job = this.pendingBulkIndexJobs.find(j => j.jobId === jobId);
        if (job) {
            job.status = 'pending';
            job.errorMessage = '';
            job.isSelected = true;
            showNotification(`İşlem tekrar denenmek üzere işaretlendi: ${job.fileName}`, 'info');
            bulkIndexingService.updateJob(job.jobId, { status: job.status, errorMessage: null, isSelected: true });
            this.renderBulkIndexingTable();
            this.checkFormCompleteness();
            this.saveBulkJobsToFirestore();
        }
    }

    updateBulkJobsTebligDate = (e) => {
        const newDate = e.target.value;
        this.pendingBulkIndexJobs.forEach(job => {
            if (job.status === 'pending' || job.status === 'ready' || job.status === 'error') {
                job.tebligDate = newDate;
                job.status = this.checkJobCompleteness(job) ? 'ready' : 'pending';
            }
        });
        this.renderBulkIndexingTable();
        this.checkFormCompleteness();
        this.saveBulkJobsToFirestore();
    }
}