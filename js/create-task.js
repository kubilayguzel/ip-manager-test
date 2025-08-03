import { authService, taskService, ipRecordsService, personService, accrualService, auth, transactionTypeService, generateUUID } from '../firebase-config.js';
import { loadSharedLayout } from './layout-loader.js';

class CreateTaskModule {
    constructor() {
        this.currentUser = null;
        this.allIpRecords = [];
        this.allPersons = [];
        this.allUsers = [];
        this.uploadedFiles = [];
        this.selectedIpRecord = null;
        this.selectedRelatedParty = null;
        this.selectedTpInvoiceParty = null;
        this.selectedServiceInvoiceParty = null;
        this.pendingChildTransactionData = null;
    }

    async init() {
        this.currentUser = authService.getCurrentUser();
        if (!this.currentUser) { window.location.href = 'index.html'; return; }
        
        try {
            const [ipRecordsResult, personsResult, usersResult, transactionTypesResult] = await Promise.all([
                ipRecordsService.getRecords(), 
                personService.getPersons(), 
                taskService.getAllUsers(),
                transactionTypeService.getTransactionTypes()
            ]);
            this.allIpRecords = ipRecordsResult.data || [];
            this.allPersons = personsResult.data || [];
            this.allUsers = usersResult.data || [];
            this.allTransactionTypes = transactionTypesResult.data || [];
            
            console.log('Kullanıcılar yüklendi:', this.allUsers.length);
            console.log('Tüm işlem tipleri yüklendi:', this.allTransactionTypes.length);
            
        } catch (error) {
            console.error("Veri yüklenirken hata oluştu:", error);
            alert("Gerekli veriler yüklenemedi, lütfen sayfayı yenileyin.");
            return;
        }
        this.setupEventListeners();
    }

    populateAssignedToDropdown() {
        console.log('populateAssignedToDropdown çağrıldı, kullanıcı sayısı:', this.allUsers.length);
        
        const assignedToSelect = document.getElementById('assignedTo');
        if (!assignedToSelect) {
            console.error('assignedTo select elementi bulunamadı - HTML\'de eksik olabilir');
            return;
        }
        
        assignedToSelect.innerHTML = '<option value="">Seçiniz...</option>';
        
        this.allUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.displayName || user.email;
            assignedToSelect.appendChild(option);
        });
        
        console.log('Dropdown başarıyla dolduruldu');
    }
    
    setupEventListeners() {
        document.getElementById('mainIpType').addEventListener('change', (e) => this.handleMainTypeChange(e));
        document.getElementById('specificTaskType').addEventListener('change', (e) => this.handleSpecificTypeChange(e));
        document.getElementById('createTaskForm').addEventListener('submit', (e) => this.handleFormSubmit(e));
        document.getElementById('cancelBtn').addEventListener('click', () => { window.location.href = 'task-management.html'; });
        document.getElementById('closeAddPersonModal').addEventListener('click', () => this.hideAddPersonModal());
        document.getElementById('cancelPersonBtn').addEventListener('click', () => this.hideAddPersonModal());
        document.getElementById('savePersonBtn').addEventListener('click', () => this.saveNewPerson());
        const closeParentModalBtn = document.getElementById('closeSelectParentModal');
        if(closeParentModalBtn) closeParentModalBtn.addEventListener('click', () => this.hideParentSelectionModal());
        const cancelParentSelectionBtn = document.getElementById('cancelParentSelectionBtn');
        if(cancelParentSelectionBtn) cancelParentSelectionBtn.addEventListener('click', () => this.hideParentSelectionModal());

        // Yeni eklenen Bootstrap tab listener'ı
        $(document).on('click', '#myTaskTabs a', function (e) {
            e.preventDefault();
            $(this).tab('show');
        });
    }

    async handleMainTypeChange(e) {
        const mainType = e.target.value;
        const specificTypeSelect = document.getElementById('specificTaskType');
        const conditionalFieldsContainer = document.getElementById('conditionalFieldsContainer');
        conditionalFieldsContainer.innerHTML = '';
        document.getElementById('saveTaskBtn').disabled = true;

        specificTypeSelect.innerHTML = '<option value="">Önce İşin Ana Türünü Seçin</option>';
        if (mainType) {
            specificTypeSelect.innerHTML = '<option value="">Seçiniz...</option>';
            
            const filteredTransactionTypes = this.allTransactionTypes.filter(type => {
                const isParentAndMatchesIpType = (type.hierarchy === 'parent' && type.ipType === mainType);
                const isTopLevelChildAndMatchesIpType = (
                    type.hierarchy === 'child' &&
                    type.isTopLevelSelectable &&
                    (type.applicableToMainType.includes(mainType) || type.applicableToMainType.includes('all'))
                );
                return isParentAndMatchesIpType || isTopLevelChildAndMatchesIpType;
            });

            filteredTransactionTypes.sort((a, b) => (a.order || 999) - (b.order || 999));

            filteredTransactionTypes.forEach(type => {
                specificTypeSelect.innerHTML += `<option value="${type.id}">${type.alias || type.name}</option>`;
            });
            specificTypeSelect.disabled = false;
        } else {
            specificTypeSelect.disabled = true;
        }
    }

    async handleSpecificTypeChange(e) {
        const taskTypeId = e.target.value;
        const selectedTaskType = this.allTransactionTypes.find(type => type.id === taskTypeId);

        const container = document.getElementById('conditionalFieldsContainer');
        container.innerHTML = '';
        this.resetSelections();
        document.getElementById('saveTaskBtn').disabled = true;

        if (!selectedTaskType) return;
        
        // Marka başvurusu için özel formu render etme
        if (selectedTaskType.alias === 'Başvuru' && selectedTaskType.ipType === 'trademark') {
            this.renderTrademarkApplicationForm(container);
        } else {
            this.renderBaseForm(container, selectedTaskType.name, selectedTaskType.id);
        }

        this.checkFormCompleteness();
    }
    
    renderTrademarkApplicationForm(container) {
        container.innerHTML = `
            <div class="card-body">
                <ul class="nav nav-tabs" id="myTaskTabs" role="tablist">
                    <li class="nav-item">
                        <a class="nav-link active" id="brand-info-tab" data-toggle="tab" href="#brand-info" role="tab" aria-controls="brand-info" aria-selected="true">Marka Bilgileri</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="goods-services-tab" data-toggle="tab" href="#goods-services" role="tab" aria-controls="goods-services" aria-selected="false">Mal/Hizmet Seçimi</a>
                    </li>
                </ul>
                <div class="tab-content mt-3" id="myTaskTabContent">
                    <div class="tab-pane fade show active" id="brand-info" role="tabpanel" aria-labelledby="brand-info-tab">
                        <div class="form-section">
                            <h3 class="section-title">2. Marka Bilgileri</h3>
                            <div class="form-group row">
                                <label for="brandType" class="col-sm-3 col-form-label">Marka Tipi</label>
                                <div class="col-sm-9">
                                    <select class="form-control" id="brandType">
                                        <option value="Sadece Kelime">Sadece Kelime</option>
                                        <option value="Sadece Şekil">Sadece Şekil</option>
                                        <option value="Şekil + Kelime" selected>Şekil + Kelime</option>
                                        <option value="Ses">Ses</option>
                                        <option value="Hareket">Hareket</option>
                                        <option value="Renk">Renk</option>
                                        <option value="Üç Boyutlu">Üç Boyutlu</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group row">
                                <label for="brandCategory" class="col-sm-3 col-form-label">Marka Türü</label>
                                <div class="col-sm-9">
                                    <select class="form-control" id="brandCategory">
                                        <option value="Ticaret/Hizmet Markası" selected>Ticaret/Hizmet Markası</option>
                                        <option value="Garanti Markası">Garanti Markası</option>
                                        <option value="Ortak Marka">Ortak Marka</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group row">
                                <label for="brandExample" class="col-sm-3 col-form-label">Marka Örneği</label>
                                <div class="col-sm-9">
                                    <input type="file" class="form-control-file" id="brandExample">
                                    <small class="form-text text-muted">Yüklenen marka örneği 591x591 px ve 300 DPI özelliklerinde olmalıdır. Aksi halde otomatik olarak dönüştürülecektir.</small>
                                </div>
                            </div>
                            <div class="form-group row" id="brandExamplePreviewContainer" style="display:none;">
                                <div class="col-sm-9 offset-sm-3">
                                    <img id="brandExamplePreview" src="#" alt="Marka Örneği Önizlemesi" style="max-width: 200px; max-height: 200px; border: 1px solid #ddd; padding: 5px; margin-top: 10px;">
                                </div>
                            </div>
                            <div class="form-group row">
                                <label for="brandExampleText" class="col-sm-3 col-form-label">Marka Örneği Yazılı İfadesi</label>
                                <div class="col-sm-9">
                                    <input type="text" class="form-control" id="brandExampleText">
                                </div>
                            </div>
                            <div class="form-group row">
                                <label for="nonLatinAlphabet" class="col-sm-3 col-form-label">Marka Örneğinde Latin Alfabesi Haricinde Harf Var Mı?</label>
                                <div class="col-sm-9">
                                    <input type="text" class="form-control" id="nonLatinAlphabet">
                                </div>
                            </div>
                            <div class="form-group row">
                                <label class="col-sm-3 col-form-label">Önyazı Talebi</label>
                                <div class="col-sm-9">
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="coverLetterRequest" id="coverLetterRequestVar" value="var">
                                        <label class="form-check-label" for="coverLetterRequestVar">Var</label>
                                    </div>
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="coverLetterRequest" id="coverLetterRequestYok" value="yok" checked>
                                        <label class="form-check-label" for="coverLetterRequestYok">Yok</label>
                                    </div>
                                </div>
                            </div>
                            <div class="form-group row">
                                <label class="col-sm-3 col-form-label">Muvafakat Talebi</label>
                                <div class="col-sm-9">
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="consentRequest" id="consentRequestVar" value="var">
                                        <label class="form-check-label" for="consentRequestVar">Var</label>
                                    </div>
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="consentRequest" id="consentRequestYok" value="yok" checked>
                                        <label class="form-check-label" for="consentRequestYok">Yok</label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="tab-pane fade" id="goods-services" role="tabpanel" aria-labelledby="goods-services-tab">
                        <p>Bu sekmedeki içerik henüz tanımlanmamıştır.</p>
                    </div>
                </div>
            </div>
        `;
        this.setupDynamicFormListeners();
        this.populateAssignedToDropdown();
    }

    renderBaseForm(container, taskTypeName, taskTypeId) {
        const transactionLikeTasks = ['Devir', 'Lisans', 'Birleşme', 'Veraset ile İntikal', 'Rehin/Teminat', 'YİDK Kararının İptali'];
        const needsRelatedParty = transactionLikeTasks.includes(taskTypeName);
        const partyLabels = { 
            'Devir': 'Devralan Taraf', 'Lisans': 'Lisans Alan Taraf', 'Rehin': 'Rehin Alan Taraf', 
            'Birleşme': 'Birleşilen Taraf', 'Veraset ile İntikal': 'Mirasçı', 'Rehin/Teminat': 'Rehin Alan Taraf',
            'YİDK Kararının İptali': 'Davacı/Davalı'
        };
        const partyLabel = partyLabels[taskTypeName] || 'İlgili Taraf';

        let specificFieldsHtml = '';
        if (taskTypeId === 'litigation_yidk_annulment') {
            specificFieldsHtml = `
                <div class="form-group full-width">
                    <label for="subjectOfLawsuit" class="form-label">Dava Konusu</label>
                    <textarea id="subjectOfLawsuit" name="subjectOfLawsuit" class="form-textarea"></textarea>
                </div>
                <div class="form-group">
                    <label for="courtName" class="form-label">Mahkeme Adı</label>
                    <input type="text" id="courtName" name="courtName" class="form-input">
                </div>
                <div class="form-group">
                    <label for="courtFileNumber" class="form-label">Dava Dosya Numarası</label>
                    <input type="text" id="courtFileNumber" name="courtFileNumber" class="form-input">
                </div>
                <div class="form-group date-picker-group">
                    <label for="lawsuitDate" class="form-label">Dava Tarihi</label>
                    <input type="date" id="lawsuitDate" name="lawsuitDate" class="form-input">
                </div>
            `;
        }

        container.innerHTML = `
            <div class="form-section">
                <h3 class="section-title">2. İşleme Konu Varlık</h3>
                <div class="form-group full-width">
                    <label for="portfolioSearchInput" class="form-label">Portföyden Ara</label>
                    <input type="text" id="portfolioSearchInput" class="form-input" placeholder="Aramak için en az 3 karakter...">
                    <div id="portfolioSearchResults" class="search-results-list"></div>
                    <div id="selectedIpRecordDisplay" class="search-result-display" style="display:none; align-items: center;"></div>
                </div>
            </div>
            
            ${needsRelatedParty ? `
            <div class="form-section">
                <h3 class="section-title">3. ${partyLabel}</h3>
                <div class="form-group full-width">
                    <label for="personSearchInput" class="form-label">Sistemdeki Kişilerden Ara</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="personSearchInput" class="form-input" placeholder="Aramak için en az 2 karakter...">
                        <button type="button" id="addNewPersonBtn" class="btn-small btn-add-person"><span>&#x2795;</span> Yeni Kişi</button>
                    </div>
                    <div id="personSearchResults" class="search-results-list"></div>
                    <div id="selectedRelatedPartyDisplay" class="search-result-display" style="display:none;"></div>
                </div>
            </div>
            ` : ''}

            ${specificFieldsHtml} <div class="form-section">
                <h3 class="section-title">Tahakkuk Bilgileri</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="officialFee" class="form-label">Resmi Ücret</label>
                        <div class="input-with-currency">
                            <input type="number" id="officialFee" class="form-input" placeholder="0.00" step="0.01">
                            <select id="officialFeeCurrency" class="currency-select">
                                <option value="TRY" selected>TL</option>
                                <option value="EUR">EUR</option>
                                <option value="USD">USD</option>
                                <option value="CHF">CHF</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="serviceFee" class="form-label">Hizmet Bedeli</label>
                        <div class="input-with-currency">
                            <input type="number" id="serviceFee" class="form-input" placeholder="0.00" step="0.01">
                            <select id="serviceFeeCurrency" class="currency-select">
                                <option value="TRY" selected>TL</option>
                                <option value="EUR">EUR</option>
                                <option value="USD">USD</option>
                                <option value="CHF">CHF</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="vatRate" class="form-label">KDV Oranı (%)</label>
                        <input type="number" id="vatRate" class="form-input" value="20">
                    </div>
                    <div class="form-group">
                        <label for="totalAmountDisplay" class="form-label">Toplam Tutar</label>
                        <div id="totalAmountDisplay" class="total-amount-display">0.00 TRY</div>
                    </div>
                    <div class="form-group full-width">
                        <label class="checkbox-label">
                            <input type="checkbox" id="applyVatToOfficialFee" checked>
                            Resmi Ücrete KDV Uygula
                        </label>
                    </div>
                    <div class="form-group full-width">
                        <label for="tpInvoicePartySearch" class="form-label">Türk Patent Faturası Tarafı</label>
                        <input type="text" id="tpInvoicePartySearch" class="form-input" placeholder="Fatura tarafı arayın...">
                        <div id="tpInvoicePartyResults" class="search-results-list"></div>
                        <div id="selectedTpInvoicePartyDisplay" class="search-result-display" style="display:none;"></div>
                    </div>
                    <div class="form-group full-width">
                        <label for="serviceInvoicePartySearch" class="form-label">Hizmet Faturası Tarafı</label>
                        <input type="text" id="serviceInvoicePartySearch" class="form-input" placeholder="Fatura tarafı arayın...">
                        <div id="serviceInvoicePartyResults" class="search-results-list"></div>
                        <div id="selectedServiceInvoicePartyDisplay" class="search-result-display" style="display:none;"></div>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <h3 class="section-title">İş Detayları ve Atama</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="taskPriority" class="form-label">Öncelik</label>
                        <select id="taskPriority" class="form-select">
                            <option value="medium">Orta</option>
                            <option value="high">Yüksek</option>
                            <option value="low">Düşük</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="assignedTo" class="form-label">Atanacak Kullanıcı</label>
                        <select id="assignedTo" class="form-select">
                            <option value="">Seçiniz...</option>
                        </select>
                    </div>
                    <div class="form-group full-width">
                        <label for="taskDueDate" class="form-label">Operasyonel Son Tarih</label>
                        <input type="date" id="taskDueDate" class="form-input">
                    </div>
                </div>
            </div>
        `;
        this.setupDynamicFormListeners();
        this.populateAssignedToDropdown();
    }

    setupDynamicFormListeners() {
        const portfolioSearchInput = document.getElementById('portfolioSearchInput');
        if (portfolioSearchInput) {
            portfolioSearchInput.addEventListener('input', (e) => this.searchPortfolio(e.target.value));
        }

        const brandExampleInput = document.getElementById('brandExample');
        if (brandExampleInput) {
            brandExampleInput.addEventListener('change', (e) => this.handleBrandExampleChange(e));
        }

        const personSearch = document.getElementById('personSearchInput');
        if (personSearch) personSearch.addEventListener('input', (e) => this.searchPersons(e.target.value, 'relatedParty'));

        const tpInvoicePartySearch = document.getElementById('tpInvoicePartySearch');
        if (tpInvoicePartySearch) tpInvoicePartySearch.addEventListener('input', (e) => this.searchPersons(e.target.value, 'tpInvoiceParty'));
        
        const serviceInvoicePartySearch = document.getElementById('serviceInvoicePartySearch');
        if (serviceInvoicePartySearch) serviceInvoicePartySearch.addEventListener('input', (e) => this.searchPersons(e.target.value, 'serviceInvoiceParty'));

        const addNewPersonBtn = document.getElementById('addNewPersonBtn');
        if (addNewPersonBtn) addNewPersonBtn.addEventListener('click', () => this.showAddPersonModal());
        
        ['officialFee', 'serviceFee', 'vatRate', 'applyVatToOfficialFee'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this.calculateTotalAmount());
        });
    }

    handleBrandExampleChange(e) {
        const file = e.target.files[0];
        const previewContainer = document.getElementById('brandExamplePreviewContainer');
        const previewImage = document.getElementById('brandExamplePreview');

        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(event) {
                previewImage.src = event.target.result;
                previewContainer.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            previewContainer.style.display = 'none';
            previewImage.src = '';
        }
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
        if(applyVatToOfficial) {
            total = (officialFee + serviceFee) * (1 + vatRate / 100);
        } else {
            total = officialFee + (serviceFee * (1 + vatRate / 100));
        }

        totalAmountDisplay.textContent = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(total);
    }

    resetSelections() {
        this.selectedIpRecord = null;
        this.selectedRelatedParty = null;
        this.selectedTpInvoiceParty = null;
        this.selectedServiceInvoiceParty = null;
        this.uploadedFiles = [];
    }

    searchPortfolio(query) {
        const container = document.getElementById('portfolioSearchResults');
        if (!container) return;
        container.innerHTML = '';
        if (query.length < 3) { 
            container.innerHTML = '<p class="no-results-message">Aramak için en az 3 karakter girin.</p>'; 
            return; 
        }
        
        const mainIpType = document.getElementById('mainIpType').value;
        const searchLower = query.toLowerCase(); 
        
        const filtered = this.allIpRecords.filter(r => {
            const rTypeLower = r.type ? r.type.toLowerCase() : '';
            const mainIpTypeLower = mainIpType ? mainIpType.toLowerCase() : '';
            
            if (mainIpTypeLower === 'litigation') {
                const rTitleLower = r.title ? r.title.toLowerCase() : '';
                const rAppNumberLower = r.applicationNumber ? r.applicationNumber.toLowerCase() : '';
                return rTitleLower.includes(searchLower) || rAppNumberLower.includes(searchLower);
            }

            if (rTypeLower !== mainIpTypeLower) return false;

            const rTitleLower = r.title ? r.title.toLowerCase() : '';
            const rAppNumberLower = r.applicationNumber ? r.applicationNumber.toLowerCase() : '';
            
            return rTitleLower.includes(searchLower) || rAppNumberLower.includes(searchLower);
        });

        if (filtered.length === 0) {
            container.innerHTML = '<p class="no-results-message">Kayıt bulunamadı.</p>';
            return;
        }

        filtered.forEach(r => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.dataset.id = r.id;
            item.innerHTML = `<div><b>${r.title}</b> (${r.applicationNumber || 'Numara Yok'})<br><small>Durum: ${r.status}</small></div>`;
            item.addEventListener('click', () => this.selectIpRecord(r.id));
            container.appendChild(item);
        });
    }

    selectIpRecord(recordId) {
        this.selectedIpRecord = this.allIpRecords.find(r => r.id === recordId);
        const display = document.getElementById('selectedIpRecordDisplay');
        if (display) {
            display.innerHTML = `<p><b>Seçilen Varlık:</b> ${this.selectedIpRecord.title}</p>`;
            display.style.display = 'flex';
        }
        const searchResults = document.getElementById('portfolioSearchResults');
        if(searchResults) searchResults.innerHTML = '';
        this.checkFormCompleteness();
    }

    searchPersons(query, target) {
        const resultsContainerId = {
            'relatedParty': 'personSearchResults',
            'tpInvoiceParty': 'tpInvoicePartyResults',
            'serviceInvoiceParty': 'serviceInvoicePartyResults'
        }[target];

        const container = document.getElementById(resultsContainerId);
        if (!container) return;
        container.innerHTML = '';
        if (query.length < 2) { container.innerHTML = '<p class="no-results-message">Aramak için en az 2 karakter girin.</p>'; return; }
        
        const filtered = this.allPersons.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
        
        if (filtered.length === 0) { container.innerHTML = '<p class="no-results-message">Kişi bulunamadı.</p>'; return; }

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
        const displayId = {
            'relatedParty': 'selectedRelatedPartyDisplay',
            'tpInvoiceParty': 'selectedTpInvoicePartyDisplay',
            'serviceInvoiceParty': 'selectedServiceInvoicePartyDisplay'
        }[target];

        const inputId = {
            'relatedParty': 'personSearchInput',
            'tpInvoiceParty': 'tpInvoicePartySearch',
            'serviceInvoiceParty': 'serviceInvoicePartySearch'
        }[target];

        const resultsId = {
            'relatedParty': 'personSearchResults',
            'tpInvoiceParty': 'tpInvoicePartyResults',
            'serviceInvoiceParty': 'serviceInvoicePartyResults'
        }[target];
        
        if(target === 'relatedParty') this.selectedRelatedParty = person;
        else if(target === 'tpInvoiceParty') this.selectedTpInvoiceParty = person;
        else if(target === 'serviceInvoiceParty') this.selectedServiceInvoiceParty = person;

        const display = document.getElementById(displayId);
        if(display) {
            display.innerHTML = `<p><b>Seçilen:</b> ${person.name}</p>`;
            display.style.display = 'block';
        }

        const resultsContainer = document.getElementById(resultsId);
        if(resultsContainer) resultsContainer.innerHTML = '';
        const inputField = document.getElementById(inputId);
        if(inputField) inputField.value = '';
        this.checkFormCompleteness();
    }

    showAddPersonModal() {
        const modal = document.getElementById('addPersonModal');
        if(modal) {
            modal.classList.add('show');
            const form = document.getElementById('personForm');
            if(form) form.reset();
        }
    }

    hideAddPersonModal() {
        const modal = document.getElementById('addPersonModal');
        if(modal) modal.classList.remove('show');
    }
    
    showParentSelectionModal(parentTransactions, childTransactionData) {
        const modal = document.getElementById('selectParentModal');
        const parentListContainer = document.getElementById('parentListContainer');
        if(!modal || !parentListContainer) return;
        
        parentListContainer.innerHTML = '';
        this.pendingChildTransactionData = childTransactionData;

        if (parentTransactions.length === 0) {
            parentListContainer.innerHTML = '<p>Uygun ana işlem bulunamadı.</p>';
            const cancelBtn = document.getElementById('cancelParentSelectionBtn');
            if(cancelBtn) cancelBtn.textContent = 'Kapat';
        } else {
            parentTransactions.forEach(parent => {
                const parentItem = document.createElement('div');
                parentItem.className = 'parent-selection-item';
                parentItem.style = 'border: 1px solid #ddd; padding: 10px; margin-bottom: 8px; border-radius: 8px; cursor: pointer; transition: background-color 0.2s;';
                parentItem.innerHTML = `
                    <b>İşlem Tipi:</b> ${parent.type ? (this.allTransactionTypes.find(t => t.id === parent.type)?.name || parent.type) : 'Bilinmiyor'}<br>
                    <b>Açıklama:</b> ${parent.description}<br>
                    <b>Tarih:</b> ${new Date(parent.timestamp).toLocaleDateString('tr-TR')}
                `;
                parentItem.addEventListener('click', () => this.handleParentSelection(parent.id));
                parentListContainer.appendChild(parentItem);
            });
            const cancelBtn = document.getElementById('cancelParentSelectionBtn');
            if(cancelBtn) cancelBtn.textContent = 'İptal';
        }
        modal.style.display = 'block';
    }

    hideParentSelectionModal() {
        const modal = document.getElementById('selectParentModal');
        if(modal) modal.style.display = 'none';
        this.pendingChildTransactionData = null;
    }

    async handleParentSelection(selectedParentId) {
        if (!this.pendingChildTransactionData) return;

        const childTransactionData = {
            ...this.pendingChildTransactionData,
            parentId: selectedParentId,
            transactionHierarchy: "child"
        };

        const addResult = await ipRecordsService.addTransactionToRecord(this.selectedIpRecord.id, childTransactionData);
        if (addResult.success) {
            alert('İş ve ilgili alt işlem başarıyla oluşturuldu!');
            this.hideParentSelectionModal();
            window.location.href = 'task-management.html';
        } else {
            alert('Alt işlem kaydedilirken hata oluştu: ' + addResult.error);
            this.hideParentSelectionModal();
        }
    }

    async saveNewPerson() {
        const personNameInput = document.getElementById('personName');
        const personTypeSelect = document.getElementById('personType');
        
        if (!personNameInput || !personTypeSelect) return;

        const name = personNameInput.value.trim();
        const type = personTypeSelect.value;
        if (!name || !type) { alert('Ad Soyad ve Kişi Türü zorunludur.'); return; }
        
        const personData = {
            name, type,
            email: document.getElementById('personEmail')?.value.trim(),
            phone: document.getElementById('personPhone')?.value.trim(),
            address: document.getElementById('personAddress')?.value.trim()
        };

        try {
            const result = await personService.addPerson(personData);
            if (result.success) {
                alert('Yeni kişi başarıyla eklendi.');
                this.allPersons.push({ ...result.data });
                this.hideAddPersonModal();
            } else {
                alert('Hata: ' + result.error);
            }
        } catch (error) {
            alert("Kişi kaydedilirken beklenmeyen bir hata oluştu.");
        }
    }
    
    checkFormCompleteness() {
        const specificTaskTypeId = document.getElementById('specificTaskType').value;
        const selectedTaskType = this.allTransactionTypes.find(type => type.id === specificTaskTypeId);

        let isComplete = false;
        
        if (selectedTaskType && selectedTaskType.alias === 'Başvuru' && selectedTaskType.ipType === 'trademark') {
            isComplete = !!this.selectedIpRecord;
        } else if (selectedTaskType) {
            const transactionLikeTasks = ['Devir', 'Lisans', 'Birleşme', 'Veraset ile İntikal', 'Rehin/Teminat'];
            if (transactionLikeTasks.includes(selectedTaskType.name)) {
                isComplete = this.selectedIpRecord && this.selectedRelatedParty;
            } else {
                isComplete = !!this.selectedIpRecord;
            }
        }
        
        const saveTaskBtn = document.getElementById('saveTaskBtn');
        if(saveTaskBtn) saveTaskBtn.disabled = !isComplete;
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        const specificTaskTypeId = document.getElementById('specificTaskType').value;
        const selectedTransactionType = this.allTransactionTypes.find(type => type.id === specificTaskTypeId);

        if (!selectedTransactionType) {
            alert('Geçerli bir işlem tipi seçmediniz.');
            return;
        }
        
        const assignedToUser = this.allUsers.find(u => u.id === document.getElementById('assignedTo').value);
        
        let taskData = {
            taskType: selectedTransactionType.id,
            title: selectedTransactionType.alias || selectedTransactionType.name,
            description: `'${this.selectedIpRecord.title}' adlı varlık için ${selectedTransactionType.alias || selectedTransactionType.name} işlemi.`,
            priority: document.getElementById('taskPriority').value,
            assignedTo_uid: assignedToUser ? assignedToUser.id : null, 
            assignedTo_email: assignedToUser ? assignedToUser.email : null, 
            dueDate: document.getElementById('taskDueDate').value || null,
            status: 'open',
            relatedIpRecordId: this.selectedIpRecord.id,
            relatedIpRecordTitle: this.selectedIpRecord.title,
            details: {}
        };
        
        if (selectedTransactionType.alias === 'Başvuru' && selectedTransactionType.ipType === 'trademark') {
            taskData.details.brandInfo = {
                brandType: document.getElementById('brandType').value,
                brandCategory: document.getElementById('brandCategory').value,
                brandExampleText: document.getElementById('brandExampleText').value,
                nonLatinAlphabet: document.getElementById('nonLatinAlphabet').value,
                coverLetterRequest: document.querySelector('input[name="coverLetterRequest"]:checked').value,
                consentRequest: document.querySelector('input[name="consentRequest"]:checked').value,
            };
        }

        if (this.selectedRelatedParty) {
            taskData.details.relatedParty = { id: this.selectedRelatedParty.id, name: this.selectedRelatedParty.name };
        }

        const taskResult = await taskService.createTask(taskData);
        if (!taskResult.success) {
            alert('İş oluşturulurken hata oluştu: ' + taskResult.error);
            return;
        }

        const officialFee = parseFloat(document.getElementById('officialFee').value) || 0;
        const serviceFee = parseFloat(document.getElementById('serviceFee').value) || 0;

        if (officialFee > 0 || serviceFee > 0) {
            const vatRate = parseFloat(document.getElementById('vatRate').value) || 0;
            const applyVatToOfficial = document.getElementById('applyVatToOfficialFee').checked;
            let totalAmount;
            if(applyVatToOfficial) {
                totalAmount = (officialFee + serviceFee) * (1 + vatRate / 100);
            } else {
                totalAmount = officialFee + (serviceFee * (1 + vatRate / 100));
            }

            const accrualData = {
                taskId: taskResult.id,
                taskTitle: taskData.title,
                officialFee: {
                    amount: officialFee,
                    currency: document.getElementById('officialFeeCurrency').value
                },
                serviceFee: {
                    amount: serviceFee,
                    currency: document.getElementById('serviceFeeCurrency').value
                },
                vatRate,
                applyVatToOfficialFee: applyVatToOfficial,
                totalAmount,
                totalAmountCurrency: 'TRY',
                tpInvoiceParty: this.selectedTpInvoiceParty ? {id: this.selectedTpInvoiceParty.id, name: this.selectedTpInvoiceParty.name} : null,
                serviceInvoiceParty: this.selectedServiceInvoiceParty ? {id: this.selectedServiceInvoiceParty.id, name: this.selectedServiceInvoiceParty.name} : null,
            };

            const accrualResult = await accrualService.addAccrual(accrualData);
            if (!accrualResult.success) {
                alert('İş oluşturuldu ancak tahakkuk kaydedilirken bir hata oluştu: ' + accrualResult.error);
                return;
            }
        }
        
        if (selectedTransactionType.hierarchy === 'parent') {
            const transactionData = {
                type: selectedTransactionType.id,
                description: `${selectedTransactionType.name} işlemi.`,
                parentId: null,
                transactionHierarchy: "parent"
            };
            console.log("📤 Firestore'a transaction ekleniyor:", transactionData);

            const addResult = await ipRecordsService.addTransactionToRecord(this.selectedIpRecord.id, transactionData);

            if (addResult.success) {
                console.log("✅ Transaction Firestore'a kaydedildi:", addResult.data);
                alert('İş ve ilgili tahakkuk başarıyla oluşturuldu!');
                window.location.href = 'task-management.html';
            } else {
                console.error("❌ Transaction kaydı başarısız:", addResult.error);
                alert('İş oluşturuldu ama işlem Firestore\'a kaydedilemedi.');
            }
        } else if (selectedTransactionType.hierarchy === 'child' && selectedTransactionType.isTopLevelSelectable) {
            const recordTransactionsResult = await ipRecordsService.getRecordTransactions(this.selectedIpRecord.id);
            if (!recordTransactionsResult.success) {
                alert('Portföy geçmişi yüklenirken hata oluştu: ' + recordTransactionsResult.error);
                return;
            }
            const existingTransactions = recordTransactionsResult.data;
            const suitableParents = existingTransactions.filter(t =>
                t.transactionHierarchy === 'parent' &&
                selectedTransactionType.expectedParentTypeIds &&
                selectedTransactionType.expectedParentTypeIds.includes(t.type)
            );

            const childTransactionData = {
                type: selectedTransactionType.id,
                description: `${selectedTransactionType.name} alt işlemi.`,
            };

            if (suitableParents.length === 0) {
                alert(`Bu alt işlem (${selectedTransactionType.name}) için portföyde uygun bir ana işlem bulunamadı. Lütfen önce ilgili ana işlemi oluşturun.`);
                return;
            } else if (suitableParents.length === 1) {
                childTransactionData.parentId = suitableParents[0].id;
                childTransactionData.transactionHierarchy = "child";
                await ipRecordsService.addTransactionToRecord(this.selectedIpRecord.id, childTransactionData);
                alert('İş ve ilgili alt işlem başarıyla oluşturuldu!');
                window.location.href = 'task-management.html';
            } else {
                this.showParentSelectionModal(suitableParents, childTransactionData);
            }
        } else {
            alert('Geçersiz işlem tipi seçimi. Lütfen geçerli bir ana veya alt işlem tipi seçin.');
        }
    }
}

const module = new CreateTaskModule();
auth.onAuthStateChanged(user => {
    if(user || authService.getCurrentUser()) {
        module.init();
        window.createTaskModule = module;
        loadSharedLayout({ activeMenuLink: 'create-task.html' });
    } else { window.location.href = 'index.html'; }
});