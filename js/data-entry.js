// data-entry.js

// create-task.js'den dışa aktarılan fonksiyonlar
import { createTrademarkApplication, uploadFileToStorage } from './create-task.js';

// Gerekli diğer servisler ve modüller
import { authService, personService, transactionTypeService } from '../firebase-config.js';
import { initializeNiceClassification, getSelectedNiceClasses } from './nice-classification.js';
import { loadSharedLayout } from './layout-loader.js';

// Bu sınıf, portföy veri girişi sayfasının tüm mantığını yönetir.
class DataEntryModule {
    constructor() {
        this.currentUser = null;
        this.allPersons = [];
        this.allTransactionTypes = [];
        this.uploadedFiles = [];
        this.activeTab = 'brand-info';
        this.isNiceClassificationInitialized = false;
        this.selectedApplicants = [];
        this.priorities = [];
        this.selectedTpInvoiceParty = null;
        this.selectedServiceInvoiceParty = null;
    }

    async init() {
        this.currentUser = authService.getCurrentUser();
        if (!this.currentUser) {
            window.location.href = 'index.html';
            return;
        }

        try {
            const [personsResult, transactionTypesResult] = await Promise.all([
                personService.getPersons(),
                transactionTypeService.getTransactionTypes()
            ]);
            this.allPersons = personsResult.data || [];
            this.allTransactionTypes = transactionTypesResult.data || [];
        } catch (error) {
            console.error("Veri yüklenirken hata oluştu:", error);
            alert("Gerekli veriler yüklenemedi, lütfen sayfayı yenileyin.");
            return;
        }

        this.setupEventListeners();
        this.setupInitialForm();
    }

    setupInitialForm() {
        // Bu kısım, sayfa yüklendiğinde marka başvuru formunu oluşturur.
        // `create-task.js`'deki renderTrademarkApplicationForm() metoduyla aynı HTML içeriğini kullanabilirsiniz.
        const conditionalFieldsContainer = document.getElementById('conditionalFieldsContainer');
        if (conditionalFieldsContainer) {
            this.renderTrademarkApplicationForm(conditionalFieldsContainer);
        }
    }

    setupEventListeners() {
        // Form submit olayını dinliyoruz
        const form = document.getElementById('dataEntryForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        // Tablar arası geçiş ve ilgili olaylar
        $(document).on('click', '#dataEntryTabs a', (e) => {
            e.preventDefault();
            const targetTabId = e.target.getAttribute('href').substring(1);
            this.activeTab = targetTabId;
            $(e.target).tab('show');
        });
        $(document).on('shown.bs.tab', '#dataEntryTabs a', (e) => {
            const targetTabId = e.target.getAttribute('href').substring(1);
            if (targetTabId === 'goods-services' && !this.isNiceClassificationInitialized) {
                initializeNiceClassification();
                this.isNiceClassificationInitialized = true;
            }
            if (targetTabId === 'applicants') {
                this.renderSelectedApplicants();
            }
            if (targetTabId === 'priority') {
                this.renderPriorities();
            }
            if (targetTabId === 'accrual') {
                this.setupAccrualTabListeners();
            }
        });

        // Diğer dinamik form olayları için event listener'ları ayarlıyoruz
        this.setupDynamicFormListeners();
    }

    setupAccrualTabListeners() {
        const officialFeeInput = document.getElementById('officialFee');
        const serviceFeeInput = document.getElementById('serviceFee');
        const vatRateInput = document.getElementById('vatRate');
        const applyVatCheckbox = document.getElementById('applyVatToOfficialFee');
        
        if (officialFeeInput) officialFeeInput.addEventListener('input', () => this.calculateTotalAmount());
        if (serviceFeeInput) serviceFeeInput.addEventListener('input', () => this.calculateTotalAmount());
        if (vatRateInput) vatRateInput.addEventListener('input', () => this.calculateTotalAmount());
        if (applyVatCheckbox) applyVatCheckbox.addEventListener('change', () => this.calculateTotalAmount());
        
        const tpInvoicePartySearch = document.getElementById('tpInvoicePartySearch');
        if (tpInvoicePartySearch) tpInvoicePartySearch.addEventListener('input', (e) => this.searchPersons(e.target.value, 'tpInvoiceParty'));
        
        const serviceInvoicePartySearch = document.getElementById('serviceInvoicePartySearch');
        if (serviceInvoicePartySearch) serviceInvoicePartySearch.addEventListener('input', (e) => this.searchPersons(e.target.value, 'serviceInvoiceParty'));
    }

    setupDynamicFormListeners() {
        const brandExampleInput = document.getElementById('brandExample');
        if (brandExampleInput) {
            brandExampleInput.addEventListener('change', (e) => this.handleBrandExampleFile(e.target.files[0]));
        }

        const dropZone = document.getElementById('brand-example-drop-zone');
        if (dropZone) {
            dropZone.addEventListener('click', () => brandExampleInput.click());
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (eventName === 'dragenter' || eventName === 'dragover') {
                        dropZone.classList.add('drag-over');
                    } else {
                        dropZone.classList.remove('drag-over');
                    }
                });
            });
            dropZone.addEventListener('drop', (e) => {
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.handleBrandExampleFile(files[0]);
                }
            });
        }
        
        const removeBtn = document.getElementById('removeBrandExampleBtn');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                this.uploadedFiles = [];
                const previewContainer = document.getElementById('brandExamplePreviewContainer');
                if (previewContainer) previewContainer.style.display = 'none';
                const previewImage = document.getElementById('brandExamplePreview');
                if (previewImage) previewImage.src = '';
                const fileInput = document.getElementById('brandExample');
                if (fileInput) fileInput.value = '';
            });
        }

        const applicantSearchInput = document.getElementById('applicantSearchInput');
        if (applicantSearchInput) applicantSearchInput.addEventListener('input', (e) => this.searchPersons(e.target.value, 'applicant'));
        const addNewApplicantBtn = document.getElementById('addNewApplicantBtn');
        if (addNewApplicantBtn) addNewApplicantBtn.addEventListener('click', () => this.showAddPersonModal('applicant'));
        const selectedApplicantsList = document.getElementById('selectedApplicantsList');
        if (selectedApplicantsList) {
            selectedApplicantsList.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.remove-selected-item-btn');
                if (removeBtn) {
                    const personId = removeBtn.dataset.id;
                    this.removeApplicant(personId);
                }
            });
        }

        const addPriorityBtn = document.getElementById('addPriorityBtn');
        if (addPriorityBtn) addPriorityBtn.addEventListener('click', () => this.addPriority());
        const addedPrioritiesList = document.getElementById('addedPrioritiesList');
        if (addedPrioritiesList) {
            addedPrioritiesList.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.remove-priority-btn');
                if (removeBtn) {
                    const priorityId = removeBtn.dataset.id;
                    this.removePriority(priorityId);
                }
            });
        }

        const priorityTypeSelect = document.getElementById('priorityType');
        if (priorityTypeSelect) {
            priorityTypeSelect.addEventListener('change', (e) => this.handlePriorityTypeChange(e.target.value));
        }

        const savePersonBtn = document.getElementById('savePersonBtn');
        if (savePersonBtn) savePersonBtn.addEventListener('click', () => this.saveNewPerson());
        const closeAddPersonModalBtn = document.getElementById('closeAddPersonModal');
        if (closeAddPersonModalBtn) closeAddPersonModalBtn.addEventListener('click', () => this.hideAddPersonModal());
        const cancelPersonBtn = document.getElementById('cancelPersonBtn');
        if (cancelPersonBtn) cancelPersonBtn.addEventListener('click', () => this.hideAddPersonModal());
    }
    
    async handleFormSubmit(e) {
        e.preventDefault();

        // Gerekli veri kontrolleri
        const goodsAndServices = getSelectedNiceClasses();
        if (goodsAndServices.length === 0) {
            alert('Lütfen en az bir mal veya hizmet seçin.');
            return;
        }

        if (this.selectedApplicants.length === 0) {
            alert('Lütfen en az bir başvuru sahibi seçin.');
            return;
        }

        // Transaction Type bilgisini al
        const selectedTransactionType = this.allTransactionTypes.find(type => type.alias === 'Başvuru' && type.ipType === 'trademark');
        if (!selectedTransactionType) {
            alert('Marka başvuru işlem tipi bulunamadı.');
            return;
        }

        // 1. Task verilerini toplama
        const title = document.getElementById('brandExampleText')?.value || selectedTransactionType.alias || selectedTransactionType.name;
        const taskData = {
            taskType: selectedTransactionType.id,
            title: title,
            description: `'${title}' adlı marka için ${selectedTransactionType.alias} işlemi.`,
            priority: 'medium', // Formdan alabilirsiniz
            assignedTo_uid: this.currentUser.uid,
            assignedTo_email: this.currentUser.email,
            dueDate: null, // Formdan alabilirsiniz
            status: 'open',
            relatedIpRecordId: null,
            relatedIpRecordTitle: null,
            details: {}
        };

        // 2. IP kaydı verilerini toplama
        const newIpRecordData = {
            title: title,
            type: selectedTransactionType.ipType,
            status: 'application_filed',
            details: {
                brandInfo: {
                    brandType: document.getElementById('brandType')?.value,
                    brandCategory: document.getElementById('brandCategory')?.value,
                    brandExampleText: document.getElementById('brandExampleText')?.value,
                    nonLatinAlphabet: document.getElementById('nonLatinAlphabet')?.value || null,
                    coverLetterRequest: document.querySelector('input[name="coverLetterRequest"]:checked')?.value,
                    consentRequest: document.querySelector('input[name="consentRequest"]:checked')?.value,
                    goodsAndServices: goodsAndServices,
                },
                applicants: this.selectedApplicants.map(p => ({
                    id: p.id,
                    name: p.name,
                    email: p.email || null
                })),
                priorities: this.priorities.length > 0 ? this.priorities : null,
                transactionType: {
                    id: selectedTransactionType.id,
                    name: selectedTransactionType.name,
                    alias: selectedTransactionType.alias
                }
            }
        };

        // 3. Tahakkuk verilerini toplama
        let accrualData = null;
        const officialFee = parseFloat(document.getElementById('officialFee')?.value) || 0;
        const serviceFee = parseFloat(document.getElementById('serviceFee')?.value) || 0;

        if (officialFee > 0 || serviceFee > 0) {
            const vatRate = parseFloat(document.getElementById('vatRate')?.value) || 0;
            const applyVatToOfficial = document.getElementById('applyVatToOfficialFee')?.checked;
            let totalAmount;
            if (applyVatToOfficial) {
                totalAmount = (officialFee + serviceFee) * (1 + vatRate / 100);
            } else {
                totalAmount = officialFee + (serviceFee * (1 + vatRate / 100));
            }
            accrualData = {
                officialFee: { amount: officialFee, currency: document.getElementById('officialFeeCurrency')?.value },
                serviceFee: { amount: serviceFee, currency: document.getElementById('serviceFeeCurrency')?.value },
                vatRate,
                applyVatToOfficialFee: applyVatToOfficial,
                totalAmount,
                totalAmountCurrency: 'TRY',
                tpInvoiceParty: this.selectedTpInvoiceParty ? { id: this.selectedTpInvoiceParty.id, name: this.selectedTpInvoiceParty.name } : null,
                serviceInvoiceParty: this.selectedServiceInvoiceParty ? { id: this.selectedServiceInvoiceParty.id, name: this.selectedServiceInvoiceParty.name } : null,
                status: 'unpaid',
                createdAt: new Date().toISOString()
            };
        }

        // Tüm verileri tek bir nesne içinde toplayıp dışa aktarılan fonksiyona gönderiyoruz
        const formData = {
            taskData,
            newIpRecordData,
            accrualData,
            brandExampleFile: this.uploadedFiles[0]
        };

        // 4. `createTrademarkApplication` fonksiyonunu çağırma
        const result = await createTrademarkApplication(formData);

        // 5. Sonuca göre kullanıcıyı bilgilendirme
        if (result.success) {
            alert('Portföye marka kaydı başarıyla yapıldı!');
            window.location.href = 'portfolio.html'; // Başarılı işlem sonrası portföy sayfasına yönlendir
        } else {
            alert('Portföy kaydı sırasında bir hata oluştu: ' + result.error);
        }
    }
    
    // `create-task.js`'den alınan yardımcı metotların kopyaları
    handleBrandExampleFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            this.uploadedFiles = [];
            const previewContainer = document.getElementById('brandExamplePreviewContainer');
            if (previewContainer) previewContainer.style.display = 'none';
            return;
        }
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 591;
            canvas.height = 591;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 591, 591);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
            const newFile = new File([blob], 'brand-example.jpg', { type: 'image/jpeg' });
            const previewImage = document.getElementById('brandExamplePreview');
            const previewContainer = document.getElementById('brandExamplePreviewContainer');
            if (previewImage && previewContainer) {
                previewImage.src = URL.createObjectURL(blob);
                previewContainer.style.display = 'block';
            }
            this.uploadedFiles = [newFile];
        };
    }
    calculateTotalAmount() {
        const officialFeeInput = document.getElementById('officialFee');
        const serviceFeeInput = document.getElementById('serviceFee');
        const vatRateInput = document.getElementById('vatRate');
        const applyVatCheckbox = document.getElementById('applyVatToOfficialFee');
        const totalAmountDisplay = document.getElementById('totalAmountDisplay');
        if (!officialFeeInput || !serviceFeeInput || !vatRateInput || !applyVatCheckbox || !totalAmountDisplay) {
            return;
        }
        const officialFee = parseFloat(officialFeeInput.value) || 0;
        const serviceFee = parseFloat(serviceFeeInput.value) || 0;
        const vatRate = parseFloat(vatRateInput.value) || 0;
        const applyVatToOfficial = applyVatCheckbox.checked;
        let total;
        if (applyVatToOfficial) {
            total = (officialFee + serviceFee) * (1 + vatRate / 100);
        } else {
            total = officialFee + (serviceFee * (1 + vatRate / 100));
        }
        totalAmountDisplay.textContent = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(total);
    }
    searchPersons(query, target) {
        const resultsContainerId = {
            'tpInvoiceParty': 'tpInvoicePartyResults',
            'serviceInvoiceParty': 'serviceInvoicePartyResults',
            'applicant': 'applicantSearchResults'
        }[target];
        const container = document.getElementById(resultsContainerId);
        if (!container) return;
        container.innerHTML = '';
        if (query.length < 2) {
            container.innerHTML = '<p class="no-results-message">Aramak için en az 2 karakter girin.</p>';
            return;
        }
        const filtered = this.allPersons.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
        if (filtered.length === 0) {
            container.innerHTML = '<p class="no-results-message">Kişi bulunamadı.</p>';
            return;
        }
        filtered.forEach(p => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.dataset.id = p.id;
            item.innerHTML = `<div><b>${p.name}</b><br><small>${p.email || '-'}</small></div>`;
            item.addEventListener('click', () => this.selectPerson(p, target));
            container.appendChild(item);
        });
    }
    selectPerson(person, target) {
        const resultsId = {
            'tpInvoiceParty': 'tpInvoicePartyResults',
            'serviceInvoiceParty': 'serviceInvoicePartyResults',
            'applicant': 'applicantSearchResults'
        }[target];
        const inputId = {
            'tpInvoiceParty': 'tpInvoicePartySearch',
            'serviceInvoiceParty': 'serviceInvoicePartySearch',
            'applicant': 'applicantSearchInput'
        }[target];
        const displayId = {
            'tpInvoiceParty': 'selectedTpInvoicePartyDisplay',
            'serviceInvoiceParty': 'selectedServiceInvoicePartyDisplay',
            'applicant': 'selectedApplicantsList'
        }[target];
        
        if (target === 'tpInvoiceParty') this.selectedTpInvoiceParty = person;
        else if (target === 'serviceInvoiceParty') this.selectedServiceInvoiceParty = person;
        else if (target === 'applicant') {
            this.addApplicant(person);
        }
        
        const display = document.getElementById(displayId);
        if (display && target !== 'applicant') {
            display.innerHTML = `<p><b>Seçilen:</b> ${person.name}</p>`;
            display.style.display = 'block';
        }
        const resultsContainer = document.getElementById(resultsId);
        if (resultsContainer) resultsContainer.innerHTML = '';
        const inputField = document.getElementById(inputId);
        if (inputField) inputField.value = '';
    }
    addApplicant(person) {
        if (this.selectedApplicants.some(p => p.id === person.id)) {
            alert('Bu başvuru sahibi zaten eklenmiş.');
            return;
        }
        this.selectedApplicants.push(person);
        this.renderSelectedApplicants();
    }
    removeApplicant(personId) {
        this.selectedApplicants = this.selectedApplicants.filter(p => p.id !== personId);
        this.renderSelectedApplicants();
    }
    renderSelectedApplicants() {
        const container = document.getElementById('selectedApplicantsList');
        if (!container) return;
        if (this.selectedApplicants.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-user-plus fa-3x text-muted mb-3"></i><p class="text-muted">Henüz başvuru sahibi seçilmedi.</p></div>`;
            return;
        }
        let html = '';
        this.selectedApplicants.forEach(person => {
            html += `<div class="selected-item d-flex justify-content-between align-items-center p-2 mb-2 border rounded"><span>${person.name} (${person.email || 'E-posta Yok'})</span><button type="button" class="btn btn-sm btn-danger remove-selected-item-btn" data-id="${person.id}"><i class="fas fa-trash-alt"></i></button></div>`;
        });
        container.innerHTML = html;
    }
    addPriority() {
        const priorityType = document.getElementById('priorityType')?.value;
        const priorityDate = document.getElementById('priorityDate')?.value;
        const priorityCountry = document.getElementById('priorityCountry')?.value;
        const priorityNumber = document.getElementById('priorityNumber')?.value;
        if (!priorityDate || !priorityCountry || !priorityNumber) {
            alert('Lütfen tüm rüçhan bilgilerini doldurun.');
            return;
        }
        const newPriority = { id: Date.now().toString(), type: priorityType, date: priorityDate, country: priorityCountry, number: priorityNumber };
        this.priorities.push(newPriority);
        this.renderPriorities();
        document.getElementById('priorityDate').value = '';
        document.getElementById('priorityCountry').value = '';
        document.getElementById('priorityNumber').value = '';
    }
    removePriority(priorityId) {
        this.priorities = this.priorities.filter(p => p.id !== priorityId);
        this.renderPriorities();
    }
    renderPriorities() {
        const container = document.getElementById('addedPrioritiesList');
        if (!container) return;
        if (this.priorities.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-info-circle fa-3x text-muted mb-3"></i><p class="text-muted">Henüz rüçhan bilgisi eklenmedi.</p></div>`;
            return;
        }
        let html = '';
        this.priorities.forEach(priority => {
            html += `<div class="selected-item d-flex justify-content-between align-items-center p-2 mb-2 border rounded"><span><b>Tip:</b> ${priority.type === 'sergi' ? 'Sergi' : 'Başvuru'} | <b>Tarih:</b> ${priority.date} | <b>Ülke:</b> ${priority.country} | <b>Numara:</b> ${priority.number}</span><button type="button" class="btn btn-sm btn-danger remove-priority-btn" data-id="${priority.id}"><i class="fas fa-trash-alt"></i></button></div>`;
        });
        container.innerHTML = html;
    }
    handlePriorityTypeChange(value) {
        const priorityDateLabel = document.getElementById('priorityDateLabel');
        if (priorityDateLabel) {
            priorityDateLabel.textContent = value === 'sergi' ? 'Sergi Tarihi' : 'Rüçhan Tarihi';
        }
    }
    showAddPersonModal(target = null) {
        const modal = document.getElementById('addPersonModal');
        if (modal) {
            $(modal).modal('show');
            const form = document.getElementById('personForm');
            if (form) form.reset();
            modal.dataset.targetField = target;
        }
    }
    hideAddPersonModal() {
        const modal = document.getElementById('addPersonModal');
        if (modal) {
            $(modal).modal('hide');
        }
    }
    async saveNewPerson() {
        const personNameInput = document.getElementById('personName');
        const personTypeSelect = document.getElementById('personType');
        const modal = document.getElementById('addPersonModal');
        const targetField = modal ? modal.dataset.targetField : null;
        if (!personNameInput || !personTypeSelect) return;
        const name = personNameInput.value.trim();
        const type = personTypeSelect.value;
        if (!name || !type) {
            alert('Ad Soyad ve Kişi Türü zorunludur.');
            return;
        }
        const personData = { name, type, email: document.getElementById('personEmail')?.value.trim(), phone: document.getElementById('personPhone')?.value.trim(), address: document.getElementById('personAddress')?.value.trim() };
        try {
            const result = await personService.addPerson(personData);
            if (result.success) {
                alert('Yeni kişi başarıyla eklendi.');
                this.allPersons.push({ ...result.data });
                this.selectPerson(result.data, targetField);
                this.hideAddPersonModal();
            } else {
                alert('Hata: ' + result.error);
            }
        } catch (error) {
            alert("Kişi kaydedilirken beklenmeyen bir hata oluştu.");
        }
    }
    renderTrademarkApplicationForm(container) {
        // Bu kısım, data-entry.html dosyanızdaki form elemanlarını içerir.
        // create-task.html dosyasından kopyalayıp buraya yerleştirmelisiniz.
    }
}

// DataEntryModule class'ını başlatma
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded - DataEntry initialize ediliyor.');
    
    // Shared layout'u yükle
    await loadSharedLayout({ activeMenuLink: 'data-entry.html' }); // İlgili menü bağlantısını güncelleyin

    const dataEntryInstance = new DataEntryModule();
    window.dataEntryInstance = dataEntryInstance; // Hata ayıklama için
    await dataEntryInstance.init();
    console.log('DataEntry başarıyla initialize edildi.');
});