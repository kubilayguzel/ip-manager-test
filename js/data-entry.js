// data-entry.js - Temiz ve çalışır versiyon

import { createTrademarkApplication, uploadFileToStorage } from './create-task.js';
import { authService, personService, transactionTypeService } from '../firebase-config.js';
import { initializeNiceClassification, getSelectedNiceClasses } from './nice-classification.js';
import { loadSharedLayout } from './layout-loader.js';

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
        this.selectedRelatedParty = null;
        this.selectedIpRecord = null;
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
    }

    setupEventListeners() {
        const form = document.getElementById('recordForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        const ipTypeSelect = document.getElementById('type');
        if (ipTypeSelect) {
            ipTypeSelect.addEventListener('change', (e) => this.handleIpTypeChange(e));
        }
        
        const savePersonBtn = document.getElementById('savePersonBtn');
        if (savePersonBtn) savePersonBtn.addEventListener('click', () => this.saveNewPerson());
        const cancelPersonBtn = document.getElementById('cancelPersonBtn');
        if (cancelPersonBtn) cancelPersonBtn.addEventListener('click', () => this.hideAddPersonModal());
        const closeAddPersonModalBtn = document.getElementById('closeAddPersonModal');
        if (closeAddPersonModalBtn) closeAddPersonModalBtn.addEventListener('click', () => this.hideAddPersonModal());

        $(document).on('click', '#myTaskTabs a', (e) => {
            e.preventDefault();
            const targetTabId = e.target.getAttribute('href').substring(1);
            this.activeTab = targetTabId;
            $(e.target).tab('show');
        });
        
        $(document).on('shown.bs.tab', '#myTaskTabs a', async (e) => {
            const targetTabId = e.target.getAttribute('href').substring(1);
            if (targetTabId === 'goods-services' && !this.isNiceClassificationInitialized) {
                await initializeNiceClassification();
                this.isNiceClassificationInitialized = true;
            }
            if (targetTabId === 'applicants') {
                this.renderSelectedApplicants();
            }
            if (targetTabId === 'priority') {
                this.renderPriorities();
            }
            if (targetTabId === 'summary') {
                this.renderSummaryTab();
            }
        });
    }

    handleIpTypeChange(e) {
        const selectedType = e.target.value;
        const dynamicFormContent = document.getElementById('type-specific-fields');
        if (!dynamicFormContent) {
            console.error('type-specific-fields elemanı bulunamadı.');
            return;
        }
        
        dynamicFormContent.innerHTML = '';
        this.resetSelections();

        if (selectedType === 'trademark') {
            this.renderTrademarkApplicationForm(dynamicFormContent);
            this.setupTrademarkFormListeners();
        } else if (selectedType === 'patent') {
            dynamicFormContent.innerHTML = `<p class="text-muted text-center">Patent formu bu alana gelecek.</p>`;
        } else if (selectedType === 'design') {
            dynamicFormContent.innerHTML = `<p class="text-muted text-center">Tasarım formu bu alana gelecek.</p>`;
        } else {
             dynamicFormContent.innerHTML = `<div class="form-group full-width"><p class="text-muted text-center">Lütfen yukarıdan bir Kayıt Türü seçiniz.</p></div>`;
        }
        
        document.getElementById('saveRecordBtn').disabled = !selectedType;
    }

    renderTrademarkApplicationForm(container) {
        container.innerHTML = `
            <div class="card-body">
                <ul class="nav nav-tabs" id="myTaskTabs" role="tablist">
                    <li class="nav-item">
                        <a class="nav-link active" id="brand-info-tab" data-toggle="tab" href="#brand-info" role="tab" aria-controls="brand-info" aria-selected="true"><i class="fas fa-tag mr-2"></i>Marka Bilgileri</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="goods-services-tab" data-toggle="tab" href="#goods-services" role="tab" aria-controls="goods-services" aria-selected="false"><i class="fas fa-list-ul mr-2"></i>Mal/Hizmet Seçimi</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="applicants-tab" data-toggle="tab" href="#applicants" role="tab" aria-controls="applicants" aria-selected="false"><i class="fas fa-users mr-2"></i>Başvuru Sahibi</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="priority-tab" data-toggle="tab" href="#priority" role="tab" aria-controls="priority" aria-selected="false"><i class="fas fa-flag mr-2"></i>Rüçhan</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="summary-tab" data-toggle="tab" href="#summary" role="tab" aria-controls="summary" aria-selected="false"><i class="fas fa-file-alt mr-2"></i>Özet</a>
                    </li>
                </ul>

                <div class="tab-content tab-content-card" id="myTaskTabContent">
                    <div class="tab-pane fade show active" id="brand-info" role="tabpanel">
                        <div class="form-section">
                            <h3 class="section-title"><span><i class="fas fa-info-circle mr-2"></i>Marka Bilgileri</span></h3>
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="brandType" class="form-label">Marka Tipi</label>
                                    <select id="brandType" class="form-select">
                                        <option value="Sadece Kelime">Sadece Kelime</option>
                                        <option value="Sadece Şekil">Sadece Şekil</option>
                                        <option value="Şekil + Kelime" selected>Şekil + Kelime</option>
                                        <option value="Ses">Ses</option>
                                        <option value="Hareket">Hareket</option>
                                        <option value="Renk">Renk</option>
                                        <option value="Üç Boyutlu">Üç Boyutlu</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="brandCategory" class="form-label">Marka Türü</label>
                                    <select id="brandCategory" class="form-select">
                                        <option value="Ticaret/Hizmet Markası" selected>Ticaret/Hizmet Markası</option>
                                        <option value="Garanti Markası">Garanti Markası</option>
                                        <option value="Ortak Marka">Ortak Marka</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="brandExampleText" class="form-label">Yazılı İfadesi</label>
                                    <input type="text" id="brandExampleText" class="form-input" placeholder="Marka metni">
                                </div>
                                <div class="form-group">
                                    <label for="nonLatinAlphabet" class="form-label">Latin Alfabesi Dışı Harf</label>
                                    <input type="text" id="nonLatinAlphabet" class="form-input" placeholder="Varsa yazın">
                                </div>
                            </div>
                            <div class="form-group full-width">
                                <label class="form-label">Marka Örneği</label>
                                <div id="brand-example-drop-zone" class="brand-upload-frame">
                                    <input type="file" id="brandExample" accept="image/*" style="display:none;">
                                    <div class="upload-icon">🖼️</div>
                                    <h5>Marka örneğini buraya sürükleyin veya seçmek için tıklayın</h5>
                                    <p class="text-muted">İstenen format: 591x591px, 300 DPI, JPEG</p>
                                </div>
                                <div id="brandExamplePreviewContainer" style="display: none;">
                                    <img id="brandExamplePreview" alt="Marka Önizleme" style="max-width: 200px;">
                                    <button id="removeBrandExampleBtn" type="button" class="btn btn-sm btn-danger mt-2">Kaldır</button>
                                </div>
                            </div>
                            <div class="form-grid">
                                <div class="form-group">
                                    <label class="form-label">Önyazı Talebi</label>
                                    <div class="radio-group">
                                        <div class="radio-option">
                                            <input type="radio" name="coverLetterRequest" id="coverLetterRequestVar" value="var">
                                            <label for="coverLetterRequestVar">Var</label>
                                        </div>
                                        <div class="radio-option">
                                            <input type="radio" name="coverLetterRequest" id="coverLetterRequestYok" value="yok" checked>
                                            <label for="coverLetterRequestYok">Yok</label>
                                        </div>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Muvafakat Talebi</label>
                                    <div class="radio-group">
                                        <div class="radio-option">
                                            <input type="radio" name="consentRequest" id="consentRequestVar" value="var">
                                            <label for="consentRequestVar">Var</label>
                                        </div>
                                        <div class="radio-option">
                                            <input type="radio" name="consentRequest" id="consentRequestYok" value="yok" checked>
                                            <label for="consentRequestYok">Yok</label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="tab-pane fade" id="goods-services" role="tabpanel">
                            <div class="form-section">
                                <h3 class="section-title"><span><i class="fas fa-list-ul mr-2"></i>Mal ve Hizmet Sınıfları</span></h3>
                                <p class="text-muted mb-4">Nice Classification sistemi kullanılarak mal ve hizmet sınıflarınızı seçin. Birden fazla sınıf seçebilirsiniz.</p>
                                <div class="nice-classification-container">
                                    <div class="row">
                                        <div class="col-lg-8">
                                            <div class="classification-panel mb-3">
                                                <div class="panel-header">
                                                    <h5 class="mb-0"><i class="fas fa-list-ul mr-2"></i>Nice Classification - Mal ve Hizmet Sınıfları</h5>
                                                    <small class="text-white-50">1-45 arası sınıflardan seçim yapın</small>
                                                </div>
                                                <div class="search-section">
                                                    <div class="input-group">
                                                        <div class="input-group-prepend"><span class="input-group-text"><i class="fas fa-search"></i></span></div>
                                                        <input type="text" class="form-control" id="niceClassSearch" placeholder="Sınıf ara... (örn: kozmetik, kimyasal, teknoloji)">
                                                        <div class="input-group-append"><button class="btn btn-outline-secondary" type="button" onclick="clearNiceSearch()"><i class="fas fa-times"></i></button></div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="search-results-container">
                                                <div id="niceClassificationList" class="classes-list">
                                                    <div class="text-center p-4"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">Nice sınıfları yükleniyor...</p></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-lg-4">
                                            <div class="selected-classes-panel">
                                                <div class="panel-header text-center p-3 bg-success text-white">
                                                    <h6 class="mb-0"><i class="fas fa-check-circle mr-2"></i>Seçilen Sınıflar (<span id="selectedClassCount">0</span>)</h6>
                                                </div>
                                                <div id="selectedNiceClasses" class="p-3" style="max-height: 400px; overflow-y: auto;">
                                                    <div class="empty-state"><i class="fas fa-list-alt fa-3x text-muted mb-3"></i><p class="text-muted">Henüz hiçbir sınıf seçilmedi.<br>Sol panelden sınıf başlığına veya alt sınıfları seçin.</p></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="tab-pane fade" id="applicants" role="tabpanel">
                            <div class="form-section">
                                <h3 class="section-title"><span><i class="fas fa-users mr-2"></i>Başvuru Sahipleri</span></h3>
                                <div class="form-group">
                                    <label for="applicantSearchInput" class="form-label">Başvuru Sahibi Ara</label>
                                    <input type="text" id="applicantSearchInput" class="form-input" placeholder="Ad, soyad veya şirket adı girin...">
                                    <div id="applicantSearchResults" class="search-results-list" style="display: none;"></div>
                                </div>
                                <div class="mb-3">
                                    <button type="button" id="addNewApplicantBtn" class="btn btn-primary"><i class="fas fa-plus mr-2"></i>Yeni Kişi Oluştur</button>
                                </div>
                                <div id="selectedApplicantsList" class="selected-items-list">
                                    <div class="empty-state"><i class="fas fa-user-plus fa-2x mb-2"></i><p>Henüz başvuru sahibi seçilmedi</p></div>
                                </div>
                            </div>
                        </div>

                        <div class="tab-pane fade" id="priority" role="tabpanel">
                            <div class="form-section">
                                <h3 class="section-title"><span><i class="fas fa-flag mr-2"></i>Rüçhan Bilgileri</span></h3>
                                <div class="form-grid">
                                    <div class="form-group">
                                        <label for="priorityType" class="form-label">Rüçhan Tipi</label>
                                        <select id="priorityType" class="form-select">
                                            <option value="başvuru" selected>Başvuru</option>
                                            <option value="sergi">Sergi</option>
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label id="priorityDateLabel" for="priorityDate" class="form-label">Rüçhan Tarihi</label>
                                        <input type="date" id="priorityDate" class="form-input">
                                    </div>
                                    <div class="form-group">
                                        <label for="priorityCountry" class="form-label">Ülke</label>
                                        <input type="text" id="priorityCountry" class="form-input" placeholder="Örn: TR, US, GB">
                                    </div>
                                    <div class="form-group">
                                        <label for="priorityNumber" class="form-label">Başvuru/Sergi Numarası</label>
                                        <input type="text" id="priorityNumber" class="form-input" placeholder="Numara">
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <button type="button" id="addPriorityBtn" class="btn btn-primary"><i class="fas fa-plus mr-2"></i>Rüçhan Ekle</button>
                                </div>
                                <div id="prioritiesContainer" class="selected-items-list">
                                    <div class="empty-state"><i class="fas fa-info-circle fa-2x mb-2"></i><p>Henüz rüçhan bilgisi eklenmedi.</p></div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="tab-pane fade" id="summary" role="tabpanel">
                            <div id="summaryContent" class="form-section">
                                <div class="empty-state">
                                    <i class="fas fa-search-plus fa-3x text-muted mb-3"></i>
                                    <p class="text-muted">Özet bilgileri yükleniyor...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.setupDynamicFormListeners();
        this.setupBrandExampleUploader();
        this.updateButtonsAndTabs();
    }
    
    // Diğer yardımcı metotlar (setupDynamicFormListeners, searchPersons, etc.)
    setupDynamicFormListeners() {
        const applicantSearchInput = document.getElementById('applicantSearchInput');
        if (applicantSearchInput) {
            applicantSearchInput.addEventListener('input', (e) => this.searchPersons(e.target.value, 'applicant'));
        }
        const addNewApplicantBtn = document.getElementById('addNewApplicantBtn');
        if (addNewApplicantBtn) {
            addNewApplicantBtn.addEventListener('click', () => this.showAddPersonModal('applicant'));
        }
        const selectedApplicantsList = document.getElementById('selectedApplicantsList');
        if (selectedApplicantsList) {
            selectedApplicantsList.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.remove-selected-item-btn');
                if (removeBtn) {
                    this.removeApplicant(removeBtn.dataset.id);
                }
            });
        }
        const priorityTypeSelect = document.getElementById('priorityType');
        if (priorityTypeSelect) {
            priorityTypeSelect.addEventListener('change', (e) => this.handlePriorityTypeChange(e.target.value));
        }
        const addPriorityBtn = document.getElementById('addPriorityBtn');
        if (addPriorityBtn) {
            addPriorityBtn.addEventListener('click', () => this.addPriority());
        }
        const prioritiesContainer = document.getElementById('prioritiesContainer');
        if (prioritiesContainer) {
            prioritiesContainer.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.remove-selected-item-btn');
                if (removeBtn) {
                    this.removePriority(removeBtn.dataset.id);
                }
            });
        }
        const brandExampleInput = document.getElementById('brandExample');
        if (brandExampleInput) {
            brandExampleInput.addEventListener('change', (e) => this.handleBrandExampleFile(e.target.files[0]));
        }
        const dropZone = document.getElementById('brand-example-drop-zone');
        if (dropZone) {
            dropZone.addEventListener('click', () => brandExampleInput.click());
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
            dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
            dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); const file = e.dataTransfer.files[0]; if (file) this.handleBrandExampleFile(file); });
        }
        const removeBrandExampleBtn = document.getElementById('removeBrandExampleBtn');
        if (removeBrandExampleBtn) {
            removeBrandExampleBtn.addEventListener('click', () => {
                this.uploadedFiles = [];
                const previewContainer = document.getElementById('brandExamplePreviewContainer');
                if (previewContainer) previewContainer.style.display = 'none';
                const fileInput = document.getElementById('brandExample');
                if (fileInput) fileInput.value = '';
            });
        }
    }
    
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

    handlePriorityTypeChange(value) {
        const priorityDateLabel = document.getElementById('priorityDateLabel');
        if (priorityDateLabel) {
            priorityDateLabel.textContent = value === 'sergi' ? 'Sergi Tarihi' : 'Rüçhan Tarihi';
        }
    }

    addPriority() {
        const type = document.getElementById('priorityType')?.value;
        const date = document.getElementById('priorityDate')?.value;
        const country = document.getElementById('priorityCountry')?.value?.trim();
        const number = document.getElementById('priorityNumber')?.value?.trim();

        if (!date || !country || !number) {
            alert('Lütfen tüm rüçhan bilgilerini girin.');
            return;
        }
        const newPriority = { id: Date.now().toString(), type, date, country, number };
        this.priorities.push(newPriority);
        this.renderPriorities();
        document.getElementById('priorityDate').value = '';
        document.getElementById('priorityCountry').value = '';
        document.getElementById('priorityNumber').value = '';
    }

    renderPriorities() {
        const container = document.getElementById('prioritiesContainer');
        if (!container) return;
        if (this.priorities.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-flag fa-2x mb-2"></i><p>Henüz rüçhan eklenmedi</p></div>`;
            return;
        }
        let html = '';
        this.priorities.forEach(priority => {
            html += `<div class="selected-item"><span><b>${priority.type === 'sergi' ? 'Sergi' : 'Başvuru'}</b> | <b>Tarih:</b> ${priority.date} | <b>Ülke:</b> ${priority.country} | <b>Numara:</b> ${priority.number}</span><button type="button" class="remove-selected-item-btn" data-id="${priority.id}" onclick="dataEntryInstance.removePriority('${priority.id}')">×</button></div>`;
        });
        container.innerHTML = html;
    }

    removePriority(priorityId) {
        this.priorities = this.priorities.filter(p => p.id !== priorityId);
        this.renderPriorities();
    }

    renderSummaryTab() {
        const container = document.getElementById('summaryContent');
        if (!container) return;
    
        let html = '';
        const brandImage = document.getElementById('brandExamplePreview')?.src;
        if (brandImage && brandImage !== window.location.href + '#') {
            html += `<h4 class="section-title">Marka Örneği</h4><div class="summary-card text-center mb-4"><img src="${brandImage}" alt="Marka Örneği" style="max-width:200px; border:1px solid #ddd; border-radius:8px;"></div>`;
        }
        html += `<h4 class="section-title">Marka Bilgileri</h4><div class="summary-card"><div class="summary-item"><span class="summary-label">Marka Tipi:</span><span class="summary-value">${document.getElementById('brandType')?.value || '-'}</span></div><div class="summary-item"><span class="summary-label">Yazılı İfadesi:</span><span class="summary-value">${document.getElementById('brandExampleText')?.value || '-'}</span></div></div>`;
        html += `<h4 class="section-title mt-4">Mal ve Hizmet Sınıfları</h4>`;
        const selectedClasses = getSelectedNiceClasses();
        if (selectedClasses.length > 0) {
            html += `<div class="summary-card"><ul class="summary-list">`;
            selectedClasses.forEach(item => {
                html += `<li>${item}</li>`;
            });
            html += `</ul></div>`;
        } else {
            html += `<p class="text-muted">Mal ve hizmet sınıfı seçilmedi.</p>`;
        }
        html += `<h4 class="section-title mt-4">Başvuru Sahipleri</h4>`;
        if (this.selectedApplicants.length > 0) {
            html += `<div class="summary-card"><ul class="summary-list">`;
            this.selectedApplicants.forEach(applicant => {
                html += `<li>${applicant.name} (${applicant.email || '-'})</li>`;
            });
            html += `</ul></div>`;
        } else {
            html += `<p class="text-muted">Başvuru sahibi seçilmedi.</p>`;
        }
        html += `<h4 class="section-title mt-4">Rüçhan Bilgileri</h4>`;
        if (this.priorities.length > 0) {
            html += `<div class="summary-card"><ul class="summary-list">`;
            this.priorities.forEach(priority => {
                html += `<li><b>Tip:</b> ${priority.type === 'sergi' ? 'Sergi' : 'Başvuru'} | <b>Tarih:</b> ${priority.date} | <b>Ülke:</b> ${priority.country} | <b>Numara:</b> ${priority.number}</li>`;
            });
            html += `</ul></div>`;
        } else {
            html += `<p class="text-muted">Rüçhan bilgisi eklenmedi.</p>`;
        }
        container.innerHTML = html;
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
        if (!name || !type) { alert('Ad Soyad ve Kişi Türü zorunludur.'); return; }
        const personData = { name, type, email: document.getElementById('personEmail')?.value.trim(), phone: document.getElementById('personPhone')?.value.trim(), address: document.getElementById('personAddress')?.value.trim() };
        try {
            const result = await personService.addPerson(personData);
            if (result.success) {
                alert('Yeni kişi başarıyla eklendi.');
                this.allPersons.push({ ...result.data });
                if (targetField === 'applicant') { this.addApplicant(result.data); }
                this.hideAddPersonModal();
            } else { alert('Hata: ' + result.error); }
        } catch (error) { alert("Kişi kaydedilirken beklenmeyen bir hata oluştu."); }
    }

    checkFormCompleteness() {
        const selectedType = document.getElementById('type')?.value;
        let isComplete = false;
        if (selectedType === 'trademark') {
            const goodsAndServices = getSelectedNiceClasses();
            isComplete = this.selectedApplicants.length > 0 && goodsAndServices.length > 0;
        }
        const saveRecordBtn = document.getElementById('saveRecordBtn');
        if (saveRecordBtn) saveRecordBtn.disabled = !isComplete;
    }

    updateButtonsAndTabs() {
        this.checkFormCompleteness();
    }

    resetSelections() {
        this.uploadedFiles = [];
        this.selectedApplicants = [];
        this.priorities = [];
        this.isNiceClassificationInitialized = false;
    }

    searchPersons(query, target) {
        const resultsContainerId = 'applicantSearchResults';
        const container = document.getElementById(resultsContainerId);
        if (!container) return;
        container.innerHTML = '';
        if (query.length < 2) {
            container.style.display = 'none';
            return;
        }
        const filtered = this.allPersons.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
        if (filtered.length === 0) {
            container.innerHTML = '<p class="no-results-message">Kişi bulunamadı.</p>';
            container.style.display = 'block';
            return;
        }
        filtered.forEach(p => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.dataset.id = p.id;
            item.innerHTML = `<div><b>${p.name}</b><br><small>${p.email || '-'}</small></div>`;
            item.addEventListener('click', () => {
                this.selectPerson(p, target);
            });
            container.appendChild(item);
        });
        container.style.display = 'block';
    }

    selectPerson(person, target) {
        if (target === 'applicant') {
            this.addApplicant(person);
        }
        const resultsContainer = document.getElementById('applicantSearchResults');
        if (resultsContainer) {
            resultsContainer.innerHTML = '';
            resultsContainer.style.display = 'none';
        }
        const inputField = document.getElementById('applicantSearchInput');
        if (inputField) inputField.value = '';
        this.checkFormCompleteness();
    }
    
    addApplicant(person) {
        if (this.selectedApplicants.some(p => p.id === person.id)) {
            alert('Bu başvuru sahibi zaten eklenmiş.');
            return;
        }
        this.selectedApplicants.push(person);
        this.renderSelectedApplicants();
        this.checkFormCompleteness();
    }

    removeApplicant(personId) {
        this.selectedApplicants = this.selectedApplicants.filter(p => p.id !== personId);
        this.renderSelectedApplicants();
        this.checkFormCompleteness();
    }

    renderSelectedApplicants() {
        const container = document.getElementById('selectedApplicantsList');
        if (!container) return;
        if (this.selectedApplicants.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-user-plus fa-2x mb-2"></i><p>Henüz başvuru sahibi seçilmedi</p></div>`;
            return;
        }
        let html = '';
        this.selectedApplicants.forEach(applicant => {
            html += `<div class="selected-item"><span><strong>${applicant.name}</strong>${applicant.email ? `<br><small class="text-muted">${applicant.email}</small>` : ''}</span><button type="button" class="remove-selected-item-btn" data-id="${applicant.id}" onclick="dataEntryInstance.removeApplicant('${applicant.id}')">×</button></div>`;
        });
        container.innerHTML = html;
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        const selectedType = document.getElementById('type')?.value;

        if (selectedType === 'trademark') {
            const goodsAndServices = getSelectedNiceClasses();
            if (goodsAndServices.length === 0) {
                alert('Lütfen en az bir mal veya hizmet seçin.');
                return;
            }
            if (this.selectedApplicants.length === 0) {
                alert('Lütfen en az bir başvuru sahibi seçin.');
                return;
            }

            const selectedTransactionType = this.allTransactionTypes.find(type => type.alias === 'Başvuru' && type.ipType === 'trademark');
            if (!selectedTransactionType) {
                alert('Marka başvuru işlem tipi bulunamadı.');
                return;
            }
            try {
                const submitBtn = document.getElementById('saveRecordBtn');
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Kaydediliyor...';
                submitBtn.disabled = true;

                const title = document.getElementById('brandExampleText')?.value || `Yeni Marka Kaydı`;

                let taskData = {
                    taskType: selectedTransactionType.id,
                    title: title,
                    description: `'${title}' adlı marka için yeni portföy kaydı.`,
                    priority: 'medium',
                    assignedTo_uid: this.currentUser.uid,
                    assignedTo_email: this.currentUser.email,
                    dueDate: null,
                    status: 'open',
                    relatedIpRecordId: null,
                    relatedIpRecordTitle: null,
                    details: {}
                };

                const newIpRecordData = {
                    title: taskData.title,
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

                const formData = {
                    taskData,
                    newIpRecordData,
                    accrualData: null,
                    brandExampleFile: this.uploadedFiles[0]
                };

                const result = await createTrademarkApplication(formData);

                if (result.success) {
                    alert('✅ Portföye marka kaydı başarıyla yapıldı!');
                    window.location.href = 'portfolio.html';
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                console.error('Form submit hatası:', error);
                alert('❌ Portföy kaydı sırasında bir hata oluştu: ' + error.message);
            } finally {
                const submitBtn = document.getElementById('saveRecordBtn');
                if (submitBtn) {
                    submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Kaydet';
                    submitBtn.disabled = false;
                }
            }
        } else {
            alert('Lütfen bir kayıt türü seçin.');
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadSharedLayout({ activeMenuLink: 'data-entry.html' });
        const dataEntryInstance = new DataEntryModule();
        window.dataEntryInstance = dataEntryInstance;
        await dataEntryInstance.init();
    } catch (error) {
        console.error('❌ DataEntry initialization hatası:', error);
    }
});