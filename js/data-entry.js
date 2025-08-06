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
        this.selectedNiceClasses = {};
    }

    async init() {
        console.log('📋 DataEntry modülü başlatılıyor...');
        
        this.currentUser = authService.getCurrentUser();
        if (!this.currentUser) {
            console.error('❌ Kullanıcı oturum açmamış');
            window.location.href = 'index.html';
            return;
        }

        try {
            console.log('📊 Veriler yükleniyor...');
            const [personsResult, transactionTypesResult] = await Promise.all([
                personService.getPersons(),
                transactionTypeService.getTransactionTypes()
            ]);
            this.allPersons = personsResult.data || [];
            this.allTransactionTypes = transactionTypesResult.data || [];
            
            console.log('✅ Veriler yüklendi:', {
                persons: this.allPersons.length,
                transactionTypes: this.allTransactionTypes.length
            });
        } catch (error) {
            console.error("❌ Veri yüklenirken hata oluştu:", error);
            alert("Gerekli veriler yüklenemedi, lütfen sayfayı yenileyin.");
            return;
        }

        this.setupInitialForm();
        this.setupEventListeners();
        this.setupNiceClassificationEvents();
        
        console.log('🎉 DataEntry modülü başarıyla başlatıldı');
    }

    setupInitialForm() {
        console.log('🏗️ Form oluşturuluyor...');
        const container = document.getElementById('conditionalFieldsContainer');
        if (container) {
            this.renderTrademarkApplicationForm(container);
            this.updateButtonsAndTabs();
        } else {
            console.error('❌ conditionalFieldsContainer bulunamadı');
        }
    }

    renderTrademarkApplicationForm(container) {
        console.log('📝 Marka başvuru formu render ediliyor...');
        container.innerHTML = `
            <div class="card-body">
                <ul class="nav nav-tabs" id="myTaskTabs" role="tablist">
                    <li class="nav-item">
                        <a class="nav-link active" id="brand-info-tab" data-toggle="tab" href="#brand-info" role="tab">Marka Bilgileri</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="goods-services-tab" data-toggle="tab" href="#goods-services" role="tab">Mal/Hizmet Seçimi</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="applicants-tab" data-toggle="tab" href="#applicants" role="tab">Başvuru Sahipleri</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="priority-tab" data-toggle="tab" href="#priority" role="tab">Rüçhan</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="summary-tab" data-toggle="tab" href="#summary" role="tab">Özet</a>
                    </li>
                </ul>

                <div class="tab-content mt-3 tab-content-card" id="myTaskTabContent">
                    <!-- Marka Bilgileri Tab -->
                    <div class="tab-pane fade show active" id="brand-info" role="tabpanel">
                        <div class="form-section">
                            <h3 class="section-title">
                                <span><i class="fas fa-info-circle mr-2"></i>Marka Bilgileri</span>
                            </h3>
                            
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

                            <!-- Marka Örneği Upload -->
                            <div class="form-group full-width">
                                <label class="form-label">Marka Örneği</label>
                                <div id="brand-example-drop-zone" class="brand-upload-frame">
                                    <input type="file" id="brandExample" accept="image/*" style="display:none;">
                                    <div class="upload-icon">🖼️</div>
                                    <h5>Marka örneğini buraya sürükleyin veya seçmek için tıklayın</h5>
                                    <p class="text-muted">İstenen format: 591x591px, 300 DPI, JPEG</p>
                                </div>
                                <div id="brandExamplePreviewContainer">
                                    <img id="brandExamplePreview" alt="Marka Önizleme">
                                </div>
                            </div>

                            <!-- Radio Button Groups -->
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
                    </div>

                    <!-- Mal/Hizmet Seçimi Tab -->
                    <div class="tab-pane fade" id="goods-services" role="tabpanel">
                        <div class="nice-classification-container mt-3">
                            <div class="row">
                                <div class="col-lg-8">
                                    <div class="classification-panel mb-3">
                                        <div class="panel-header">
                                            <h5 class="mb-0">
                                                <i class="fas fa-list-ul mr-2"></i>
                                                Nice Classification - Mal ve Hizmet Sınıfları
                                            </h5>
                                            <small class="text-white-50">1-45 arası sınıflardan seçim yapın</small>
                                        </div>
                                        
                                        <div class="search-section">
                                            <div class="input-group">
                                                <div class="input-group-prepend">
                                                    <span class="input-group-text">
                                                        <i class="fas fa-search"></i>
                                                    </span>
                                                </div>
                                                <input type="text" class="form-control" id="niceClassSearch" 
                                                       placeholder="Sınıf ara... (örn: kozmetik, kimyasal, teknoloji)">
                                                <div class="input-group-append">
                                                    <button class="btn btn-outline-secondary" type="button" onclick="clearNiceSearch()">
                                                        <i class="fas fa-times"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="search-results-container">
                                        <div id="niceClassificationList" class="classes-list">
                                            <div class="text-center p-4">
                                                <div class="spinner-border text-primary" role="status"></div>
                                                <p class="mt-2 text-muted">Nice sınıfları yükleniyor...</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="col-lg-4">
                                    <div class="selected-classes-panel">
                                        <div class="panel-header text-center p-3 bg-success text-white">
                                            <h6 class="mb-0">
                                                <i class="fas fa-check-circle mr-2"></i>
                                                Seçilen Sınıflar (<span id="selectedClassCount">0</span>)
                                            </h6>
                                        </div>
                                        <div id="selectedNiceClasses" class="p-3" style="max-height: 400px; overflow-y: auto;">
                                            <div class="empty-state">
                                                <i class="fas fa-list-alt fa-3x text-muted mb-3"></i>
                                                <p class="text-muted">
                                                    Henüz hiçbir sınıf seçilmedi.<br>
                                                    Sol panelden sınıf başlığına veya alt sınıfları seçin.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Başvuru Sahipleri Tab -->
                    <div class="tab-pane fade" id="applicants" role="tabpanel">
                        <div class="form-section">
                            <h3 class="section-title">
                                <span><i class="fas fa-users mr-2"></i>Başvuru Sahipleri</span>
                            </h3>
                            
                            <div class="form-group">
                                <label for="applicantSearchInput" class="form-label">Başvuru Sahibi Ara</label>
                                <input type="text" id="applicantSearchInput" class="form-input" 
                                       placeholder="Ad, soyad veya şirket adı girin...">
                                <div id="applicantSearchResults" class="search-results-list" style="display: none;"></div>
                            </div>
                            
                            <div class="mb-3">
                                <button type="button" id="addNewApplicantBtn" class="btn btn-primary">
                                    <i class="fas fa-plus mr-2"></i>Yeni Kişi Oluştur
                                </button>
                            </div>
                            
                            <div id="selectedApplicantsList" class="selected-items-list">
                                <div class="empty-state">
                                    <i class="fas fa-user-plus fa-2x mb-2"></i>
                                    <p>Henüz başvuru sahibi seçilmedi</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Rüçhan Tab -->
                    <div class="tab-pane fade" id="priority" role="tabpanel">
                        <div class="form-section">
                            <h3 class="section-title">
                                <span><i class="fas fa-flag mr-2"></i>Rüçhan Bilgileri</span>
                            </h3>
                            
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
                                    <input type="text" id="priorityNumber" class="form-input" placeholder="Rüçhan numarası">
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <button type="button" id="addPriorityBtn" class="btn btn-primary">
                                    <i class="fas fa-plus mr-2"></i>Rüçhan Ekle
                                </button>
                            </div>
                            
                            <div id="prioritiesContainer" class="selected-items-list">
                                <div class="empty-state">
                                    <i class="fas fa-flag fa-2x mb-2"></i>
                                    <p>Henüz rüçhan eklenmedi</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Özet Tab -->
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
        `;
        
        console.log('✅ Form HTML\'i oluşturuldu');
        this.setupDynamicFormListeners();
        this.setupBrandExampleUploader();
        this.updateButtonsAndTabs();
        console.log('✅ Form hazır');
    }

    setupEventListeners() {
        console.log('🔧 Ana event listeners kuruluyor...');
        
        // Tab değişim event'leri
        $(document).on('click', '#myTaskTabs a', (e) => {
            e.preventDefault();
            const targetTabId = e.target.getAttribute('href').substring(1);
            this.activeTab = targetTabId;
            $(e.target).tab('show');
        });
        
        $(document).on('shown.bs.tab', '#myTaskTabs a', (e) => {
            this.updateButtonsAndTabs();
            const targetTabId = e.target.getAttribute('href').substring(1);
            console.log('📑 Tab değişti:', targetTabId);
            
            if (targetTabId === 'goods-services' && !this.isNiceClassificationInitialized) {
                console.log('🔄 Nice Classification başlatılıyor...');
                this.initializeNiceClassificationWithDebug();
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

        // Save button
        $(document).on('click', '#saveTaskBtn', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });
        
        console.log('✅ Ana event listeners kuruldu');
    }

    async initializeNiceClassificationWithDebug() {
        try {
            console.log('🔄 Nice Classification debug ile başlatılıyor...');
            
            await initializeNiceClassification();
            this.isNiceClassificationInitialized = true;
            console.log('✅ Nice Classification başarıyla başlatıldı');
            
            // clearNiceSearch fonksiyonunu global scope'a ekle
            window.clearNiceSearch = function() {
                const searchInput = document.getElementById('niceClassSearch');
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input'));
                }
            };
            console.log('✅ clearNiceSearch fonksiyonu eklendi');
            
            // Event listener ekleme
            setTimeout(() => {
                this.setupNiceClassificationEvents();
            }, 1000);
            
        } catch (error) {
            console.error('❌ Nice Classification başlatılamadı:', error);
            const container = document.getElementById('niceClassificationList');
            if (container) {
                container.innerHTML = `
                    <div class="text-center text-danger p-4">
                        <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                        <p>Nice Classification yüklenemedi</p>
                        <small>Hata: ${error.message}</small>
                        <br><button class="btn btn-sm btn-primary mt-2" onclick="dataEntryInstance.initializeNiceClassificationWithDebug()">Tekrar Dene</button>
                    </div>
                `;
            }
        }
    }

 // data-entry.js içindeki setupNiceClassificationEvents fonksiyonu - düzeltilmiş versiyon

setupNiceClassificationEvents() {
    console.log('🔧 Nice Classification event listeners kuruluyor (düzeltilmiş versiyon)...');

    const listContainer = document.getElementById('niceClassificationList');
    const selectedContainer = document.getElementById('selectedNiceClasses');
    const customInput = document.getElementById('customClassInput');
    const addCustomBtn = document.getElementById('addCustomClassBtn');
    const charCountElement = document.getElementById('customClassCharCount');

    if (!listContainer) {
        console.error('❌ niceClassificationList container bulunamadı');
        return;
    }
    
    // Ana click handler - accordion kapanma sorununu çözer
    listContainer.addEventListener('click', e => {
        // Ana sınıf seç/kaldır butonu
        const selectBtn = e.target.closest('.select-class-btn');
        if (selectBtn) {
            e.preventDefault();
            e.stopPropagation();
            const classNumber = selectBtn.dataset.classNumber;
            
            // Global fonksiyonları kontrol et ve çağır
            if (window.isClassFullySelected && window.deselectWholeClass && window.selectWholeClass) {
                if (window.isClassFullySelected(classNumber)) {
                    window.deselectWholeClass(classNumber);
                } else {
                    window.selectWholeClass(classNumber);
                }
            } else {
                console.warn('⚠️ Global nice classification fonksiyonları yüklenmemiş');
            }
            return;
        }

        // Alt sınıf seçimi - accordion kapanma sorunu burada çözülüyor
        const subclass = e.target.closest('.subclass-item');
        if (subclass) {
            e.preventDefault();
            e.stopPropagation(); // Bu çok önemli - accordion'un kapanmasını engelliyor
            
            const code = subclass.dataset.code;
            const classNum = subclass.dataset.classNum;
            const text = subclass.dataset.text;
            
            console.log('🎯 Alt sınıf seçimi:', { code, classNum, text });
            
            // Global fonksiyonları ve yerel state'i senkronize et
            if (window.selectItem && window.removeSelectedClass) {
                if (this.selectedNiceClasses[code]) {
                    // Kaldır
                    window.removeSelectedClass(code);
                    delete this.selectedNiceClasses[code];
                } else {
                    // Ekle
                    window.selectItem(code, classNum, text);
                    this.selectedNiceClasses[code] = { classNum, text };
                }
                this.renderSelectedNiceClasses();
            } else {
                console.warn('⚠️ selectItem/removeSelectedClass fonksiyonları bulunamadı');
            }
            return;
        }

        // Header tıklama (accordion toggle)
        const header = e.target.closest('.class-header');
        if (header && !e.target.closest('.select-class-btn')) {
            e.preventDefault();
            if (window.toggleAccordion) {
                window.toggleAccordion(header.dataset.id);
            } else {
                console.warn('⚠️ toggleAccordion fonksiyonu bulunamadı');
            }
        }
    });

    // 99. sınıf (özel sınıf) ekleme - SORUN BURADA ÇÖZÜLÜYOR
    if (addCustomBtn) {
        addCustomBtn.addEventListener('click', () => {
            const text = customInput.value.trim();
            if (!text) {
                alert('Lütfen özel sınıf metnini girin');
                return;
            }
            
            if (text.length > 500) {
                alert('Özel sınıf metni maksimum 500 karakter olabilir');
                return;
            }
            
            const code = `99-${Date.now()}`;
            console.log('➕ 99. sınıf ekleniyor:', { code, text });
            
            // Global fonksiyonu çağır
            if (window.selectItem) {
                window.selectItem(code, '99', text);
            }
            
            // Yerel state'i güncelle
            this.selectedNiceClasses[code] = { classNum: '99', text };
            this.renderSelectedNiceClasses();
            
            // Input'u temizle
            customInput.value = '';
            if (charCountElement) charCountElement.textContent = '0';
            
            console.log('✅ 99. sınıf başarıyla eklendi');
        });
        
        console.log('✅ 99. sınıf ekleme butonu event listener eklendi');
    } else {
        console.error('❌ addCustomClassBtn bulunamadı');
    }

    // Enter tuşu ile 99. sınıf ekleme
    if (customInput) {
        customInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (addCustomBtn) addCustomBtn.click();
            }
        });
    }

    // Karakter sayacı
    if (customInput && charCountElement) {
        customInput.addEventListener('input', (e) => {
            const length = e.target.value.length;
            charCountElement.textContent = length.toLocaleString('tr-TR');
            
            // Karakter sınırı uyarısı
            if (length > 450) {
                charCountElement.style.color = length > 500 ? 'red' : 'orange';
            } else {
                charCountElement.style.color = '#6c757d';
            }
        });
    }

    // Seçilen sınıfları kaldırma
    if (selectedContainer) {
        selectedContainer.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-selected-btn');
            if (removeBtn) {
                e.preventDefault();
                const key = removeBtn.dataset.key;
                
                console.log('🗑️ Sınıf kaldırılıyor:', key);
                
                // Global fonksiyonu çağır
                if (window.removeSelectedClass) {
                    window.removeSelectedClass(key);
                }
                
                // Yerel state'den kaldır
                delete this.selectedNiceClasses[key];
                this.renderSelectedNiceClasses();
            }
        });
        
        console.log('✅ Seçilen sınıfları kaldırma event listener eklendi');
    }
    
    console.log('✅ Nice Classification event listeners başarıyla kuruldu');
}

    toggleNiceSubclass(code, classNum, text, element) {
        const isSelected = element.classList.contains('selected');
        
        if (isSelected) {
            element.classList.remove('selected');
            this.removeNiceSelection(code);
        } else {
            element.classList.add('selected');
            this.addNiceSelection(code, classNum, text);
        }
    }

    addNiceSelection(code, classNum, text) {
        console.log('➕ Nice seçim ekleniyor:', {code, classNum, text});
        
        this.selectedNiceClasses[code] = {classNum, text};
        this.renderSelectedNiceClasses();
    }

    removeNiceSelection(key) {
        console.log('🗑️ Nice seçim kaldırılıyor:', key);
        
        delete this.selectedNiceClasses[key];
        this.renderSelectedNiceClasses();
        
        // Element'ten de selected class'ını kaldır
        const element = document.querySelector(`[data-code="${key}"]`);
        if (element) {
            element.classList.remove('selected');
        }
    }

    renderSelectedNiceClasses() {
        const container = document.getElementById('selectedNiceClasses');
        if (!container) return;

        if (Object.keys(this.selectedNiceClasses).length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-list-alt fa-3x text-muted mb-3"></i>
                    <p class="text-muted">
                        Henüz hiçbir sınıf seçilmedi.<br>
                        Sol panelden sınıf başlığına veya alt sınıfları seçin.
                    </p>
                </div>
            `;
            
            const countElement = document.getElementById('selectedClassCount');
            if (countElement) countElement.textContent = '0';
            return;
        }

        let html = '';
        Object.entries(this.selectedNiceClasses).forEach(([code, item]) => {
            const displayCode = item.classNum === '99' ? item.classNum : code;
            html += `
                <div class="selected-class-item">
                    <div class="selected-class-number">Sınıf ${displayCode}</div>
                    <p class="selected-class-description">${item.text}</p>
                    <button class="remove-selected-class-btn" data-key="${code}" title="Kaldır">&times;</button>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
        const countElement = document.getElementById('selectedClassCount');
        if (countElement) countElement.textContent = Object.keys(this.selectedNiceClasses).length;
    }

    setupDynamicFormListeners() {
        console.log('🔧 Dinamik form listeners kuruluyor...');
        
        setTimeout(() => {
            const applicantSearchInput = document.getElementById('applicantSearchInput');
            console.log('🔍 applicantSearchInput elementi:', applicantSearchInput);
            
            if (applicantSearchInput) {
                console.log('✅ Başvuru sahibi arama input bulundu, event listener ekleniyor');
                applicantSearchInput.addEventListener('input', (e) => {
                    console.log('🔍 Arama yapılıyor:', e.target.value);
                    this.searchPersons(e.target.value, 'applicant');
                });
            } else {
                console.error('❌ applicantSearchInput elementi bulunamadı');
            }

            const addNewApplicantBtn = document.getElementById('addNewApplicantBtn');
            if (addNewApplicantBtn) {
                console.log('✅ Yeni kişi ekleme butonu bulundu');
                addNewApplicantBtn.addEventListener('click', () => {
                    console.log('👤 Yeni kişi ekleme modalı açılıyor');
                    this.showAddPersonModal('applicant');
                });
            }

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
        }, 100);

        setTimeout(() => {
            const priorityTypeSelect = document.getElementById('priorityType');
            if (priorityTypeSelect) {
                priorityTypeSelect.addEventListener('change', (e) => this.handlePriorityTypeChange(e.target.value));
            }

            const addPriorityBtn = document.getElementById('addPriorityBtn');
            if (addPriorityBtn) {
                addPriorityBtn.addEventListener('click', () => this.addPriority());
            }
        }, 100);
        
        console.log('✅ Dinamik form listeners kuruldu');
    }

    searchPersons(query, target) {
        console.log('🔍 Person search çağrıldı:', { query, target, personsCount: this.allPersons.length });
        
        const resultsContainerId = {
            'applicant': 'applicantSearchResults'
        }[target];
        
        const container = document.getElementById(resultsContainerId);
        console.log('📦 Results container:', container);
        
        if (!container) {
            console.error('❌ Results container bulunamadı:', resultsContainerId);
            return;
        }

        container.innerHTML = '';
        if (query.length < 2) {
            console.log('🔍 Query çok kısa, gizleniyor');
            container.style.display = 'none';
            return;
        }

        const filtered = this.allPersons.filter(p => 
            p.name.toLowerCase().includes(query.toLowerCase())
        );
        
        console.log('🔍 Filtrelenen kişiler:', filtered.length);

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
                console.log('👤 Kişi seçildi:', p.name);
                this.selectPerson(p, target);
            });
            container.appendChild(item);
        });
        container.style.display = 'block';
        console.log('✅ Arama sonuçları gösterildi');
    }

    selectPerson(person, target) {
        console.log('👤 Kişi seçildi:', person.name, 'için', target);
        
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
        console.log('👤 Başvuru sahibi eklendi:', person.name);
        this.renderSelectedApplicants();
        this.checkFormCompleteness();
    }

    removeApplicant(personId) {
        this.selectedApplicants = this.selectedApplicants.filter(p => p.id !== personId);
        console.log('👤 Başvuru sahibi silindi:', personId);
        this.renderSelectedApplicants();
        this.checkFormCompleteness();
    }

    renderSelectedApplicants() {
        const container = document.getElementById('selectedApplicantsList');
        if (!container) return;

        if (this.selectedApplicants.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-plus fa-2x mb-2"></i>
                    <p>Henüz başvuru sahibi seçilmedi</p>
                </div>
            `;
            return;
        }

        let html = '';
        this.selectedApplicants.forEach(applicant => {
            html += `
                <div class="selected-item">
                    <span><strong>${applicant.name}</strong>${applicant.email ? `<br><small class="text-muted">${applicant.email}</small>` : ''}</span>
                    <button type="button" class="remove-selected-item-btn" data-id="${applicant.id}">×</button>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    setupBrandExampleUploader() {
        const dropZone = document.getElementById('brand-example-drop-zone');
        const fileInput = document.getElementById('brandExample');

        if (dropZone && fileInput) {
            dropZone.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.handleBrandExampleFile(file);
            });

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('drag-over');
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file) this.handleBrandExampleFile(file);
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

        const newPriority = {
            id: Date.now().toString(),
            type,
            date,
            country,
            number
        };

        this.priorities.push(newPriority);
        this.renderPriorities();
        
        // Formu temizle
        document.getElementById('priorityDate').value = '';
        document.getElementById('priorityCountry').value = '';
        document.getElementById('priorityNumber').value = '';
    }

    renderPriorities() {
        const container = document.getElementById('prioritiesContainer');
        if (!container) return;

        if (this.priorities.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-flag fa-2x mb-2"></i>
                    <p>Henüz rüçhan eklenmedi</p>
                </div>
            `;
            return;
        }

        let html = '';
        this.priorities.forEach(priority => {
            html += `
                <div class="selected-item">
                    <span><b>${priority.type === 'sergi' ? 'Sergi' : 'Başvuru'}</b> | <b>Tarih:</b> ${priority.date} | <b>Ülke:</b> ${priority.country} | <b>Numara:</b> ${priority.number}</span>
                    <button type="button" class="remove-selected-item-btn" data-id="${priority.id}" onclick="dataEntryInstance.removePriority('${priority.id}')">×</button>
                </div>
            `;
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
        
        // Marka görseli
        const brandImage = document.getElementById('brandExamplePreview')?.src;
        if (brandImage && brandImage !== window.location.href + '#') {
            html += `<h4 class="section-title">Marka Örneği</h4>
                     <div class="summary-card text-center mb-4">
                        <img src="${brandImage}" alt="Marka Örneği" style="max-width:200px; border:1px solid #ddd; border-radius:8px;">
                     </div>`;
        }

        // 1. Marka Bilgileri
        html += `<h4 class="section-title">Marka Bilgileri</h4>`;
        html += `<div class="summary-card">
            <div class="summary-item">
                <span class="summary-label">Marka Tipi:</span>
                <span class="summary-value">${document.getElementById('brandType')?.value || '-'}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Marka Türü:</span>
                <span class="summary-value">${document.getElementById('brandCategory')?.value || '-'}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Yazılı İfadesi:</span>
                <span class="summary-value">${document.getElementById('brandExampleText')?.value || '-'}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Latin Alfabesi Dışı Harf:</span>
                <span class="summary-value">${document.getElementById('nonLatinAlphabet')?.value || '-'}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Önyazı Talebi:</span>
                <span class="summary-value">${document.querySelector('input[name="coverLetterRequest"]:checked')?.value || '-'}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Muvafakat Talebi:</span>
                <span class="summary-value">${document.querySelector('input[name="consentRequest"]:checked')?.value || '-'}</span>
            </div>
        </div>`;
    
        // 2. Mal ve Hizmet Sınıfları
        const goodsAndServices = this.getSelectedNiceClassesLocal();
        html += `<h4 class="section-title mt-4">Mal ve Hizmet Sınıfları</h4>`;
        if (goodsAndServices.length > 0) {
            html += `<div class="summary-card">
                <ul class="summary-list">`;
            goodsAndServices.forEach(item => {
                html += `<li>${item}</li>`;
            });
            html += `</ul></div>`;
        } else {
            html += `<p class="text-muted">Mal ve hizmet sınıfı seçilmedi.</p>`;
        }
    
        // 3. Başvuru Sahipleri
        html += `<h4 class="section-title mt-4">Başvuru Sahipleri</h4>`;
        if (this.selectedApplicants.length > 0) {
            html += `<div class="summary-card">
                <ul class="summary-list">`;
            this.selectedApplicants.forEach(applicant => {
                html += `<li>${applicant.name} (${applicant.email || '-'})</li>`;
            });
            html += `</ul></div>`;
        } else {
            html += `<p class="text-muted">Başvuru sahibi seçilmedi.</p>`;
        }
    
        // 4. Rüçhan Bilgileri
        html += `<h4 class="section-title mt-4">Rüçhan Bilgileri</h4>`;
        if (this.priorities.length > 0) {
            html += `<div class="summary-card">
                <ul class="summary-list">`;
            this.priorities.forEach(priority => {
                html += `<li><b>Tip:</b> ${priority.type === 'sergi' ? 'Sergi' : 'Başvuru'} | <b>Tarih:</b> ${priority.date} | <b>Ülke:</b> ${priority.country} | <b>Numara:</b> ${priority.number}</li>`;
            });
            html += `</ul></div>`;
        } else {
            html += `<p class="text-muted">Rüçhan bilgisi eklenmedi.</p>`;
        }
    
        container.innerHTML = html;
    }

    getSelectedNiceClassesLocal() {
        return Object.entries(this.selectedNiceClasses).map(([code, item]) => {
            return item.classNum === '99' ? `(99) ${item.text}` : `(${code}) ${item.text}`;
        });
    }

    showAddPersonModal(target = null) {
        console.log('🔧 Person modal açılıyor:', target);
        const modal = document.getElementById('addPersonModal');
        if (modal) {
            $(modal).modal('show');
            const form = document.getElementById('personForm');
            if (form) form.reset();
            modal.dataset.targetField = target;
        } else {
            console.error('❌ addPersonModal bulunamadı');
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

        const personData = {
            name,
            type,
            email: document.getElementById('personEmail')?.value.trim(),
            phone: document.getElementById('personPhone')?.value.trim(),
            address: document.getElementById('personAddress')?.value.trim()
        };

        try {
            const result = await personService.addPerson(personData);
            if (result.success) {
                alert('Yeni kişi başarıyla eklendi.');
                this.allPersons.push({ ...result.data });
                
                if (targetField === 'applicant') {
                    this.addApplicant(result.data);
                }
                
                this.hideAddPersonModal();
            } else {
                alert('Hata: ' + result.error);
            }
        } catch (error) {
            console.error('Kişi kaydetme hatası:', error);
            alert("Kişi kaydedilirken beklenmeyen bir hata oluştu.");
        }
    }

    checkFormCompleteness() {
        const isComplete = this.selectedApplicants.length > 0;
        const saveTaskBtn = document.getElementById('saveTaskBtn');
        if (saveTaskBtn) saveTaskBtn.disabled = !isComplete;
    }

    updateButtonsAndTabs() {
        this.checkFormCompleteness();
    }

    async handleFormSubmit() {
        console.log('📤 Form gönderiliyor...');

        const goodsAndServices = this.getSelectedNiceClassesLocal();
        if (goodsAndServices.length === 0) {
            alert('Lütfen en az bir mal veya hizmet seçin.');
            return;
        }

        if (this.selectedApplicants.length === 0) {
            alert('Lütfen en az bir başvuru sahibi seçin.');
            return;
        }

        const selectedTransactionType = this.allTransactionTypes.find(
            type => type.alias === 'Başvuru' && type.ipType === 'trademark'
        );
        
        if (!selectedTransactionType) {
            alert('Marka başvuru işlem tipi bulunamadı.');
            return;
        }

        try {
            const submitBtn = document.getElementById('saveTaskBtn');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Kaydediliyor...';
            submitBtn.disabled = true;

            const title = document.getElementById('brandExampleText')?.value || selectedTransactionType.alias || selectedTransactionType.name;

            let taskData = {
                taskType: selectedTransactionType.id,
                title: title,
                description: `'${title}' adlı marka için ${selectedTransactionType.alias || selectedTransactionType.name} işlemi.`,
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
                        goodsAndServices: goodsAndServices
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
            const submitBtn = document.getElementById('saveTaskBtn');
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Portföye Kaydet';
                submitBtn.disabled = false;
            }
        }
    }
}

// Global scope'a erişim için
window.dataEntryInstance = null;

// DataEntryModule class'ını başlatma
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 DOM Content Loaded - DataEntry initialize ediliyor...');
    
    try {
        await loadSharedLayout({ activeMenuLink: 'data-entry.html' });
        
        const dataEntryInstance = new DataEntryModule();
        window.dataEntryInstance = dataEntryInstance;
        
        setTimeout(() => {
            console.log('🔧 Modal event listeners kuruluyor...');
            
            const savePersonBtn = document.getElementById('savePersonBtn');
            const cancelPersonBtn = document.getElementById('cancelPersonBtn');
            const closeAddPersonModalBtn = document.getElementById('closeAddPersonModal');
            
            console.log('🔍 Modal elementleri:', {
                savePersonBtn: !!savePersonBtn,
                cancelPersonBtn: !!cancelPersonBtn,
                closeAddPersonModalBtn: !!closeAddPersonModalBtn
            });
            
            if (savePersonBtn) {
                console.log('✅ Save person button bulundu, event listener ekleniyor');
                savePersonBtn.addEventListener('click', () => dataEntryInstance.saveNewPerson());
            } else {
                console.error('❌ savePersonBtn bulunamadı - shared layout yüklenmemiş olabilir');
            }

            if (cancelPersonBtn) {
                console.log('✅ Cancel person button bulundu');
                cancelPersonBtn.addEventListener('click', () => dataEntryInstance.hideAddPersonModal());
            }
            
            if (closeAddPersonModalBtn) {
                console.log('✅ Close modal button bulundu');
                closeAddPersonModalBtn.addEventListener('click', () => dataEntryInstance.hideAddPersonModal());
            }
        }, 3000);
        
        await dataEntryInstance.init();
        
        console.log('✅ DataEntry başarıyla initialize edildi');
    } catch (error) {
        console.error('❌ DataEntry initialization hatası:', error);
    }
});