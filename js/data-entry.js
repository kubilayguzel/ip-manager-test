// js/data-entry.js
import { initializeNiceClassification, getSelectedNiceClasses } from './nice-classification.js';
import { personService } from '../firebase-config.js';

class DataEntryModule {
    constructor() {
        this.ipTypeSelect = document.getElementById('ipTypeSelect');
        this.dynamicFormContainer = document.getElementById('dynamicFormContainer');
        this.saveBtn = document.getElementById('savePortfolioBtn');
        
        // State variables
        this.selectedApplicants = [];
        this.isNiceInitialized = false;
        this.uploadedBrandImage = null;
        this.isFormComplete = false;
    }

    init() {
        console.log('🚀 Data Entry Module başlatılıyor...');
        this.setupEventListeners();
    }

    setupEventListeners() {
        // IP türü değişim listener
        this.ipTypeSelect.addEventListener('change', (e) => {
            this.handleIPTypeChange(e.target.value);
        });

        // Kaydet butonu listener
        this.saveBtn.addEventListener('click', () => {
            this.handleSavePortfolio();
        });
    }

    handleIPTypeChange(ipType) {
        console.log('📋 IP türü değişti:', ipType);
        
        // Formu temizle
        this.dynamicFormContainer.innerHTML = '';
        this.selectedApplicants = [];
        this.isNiceInitialized = false;
        this.uploadedBrandImage = null;
        this.updateSaveButtonState();

        // Seçili türe göre form render et
        switch(ipType) {
            case 'trademark':
                this.renderTrademarkForm();
                break;
            case 'patent':
                this.renderPatentForm();
                break;
            case 'design':
                this.renderDesignForm();
                break;
            default:
                console.log('⚠️ Geçersiz IP türü seçildi');
        }
    }

    renderTrademarkForm() {
        console.log('🏷️ Marka formu render ediliyor...');
        
        this.dynamicFormContainer.innerHTML = `
            <div class="form-section">
                <ul class="nav nav-tabs" id="portfolioTabs" role="tablist">
                    <li class="nav-item">
                        <a class="nav-link active" id="brand-info-tab" data-toggle="tab" href="#brand-info" role="tab">
                            <i class="fas fa-tag mr-1"></i>Marka Bilgileri
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="goods-services-tab" data-toggle="tab" href="#goods-services" role="tab">
                            <i class="fas fa-list-ul mr-1"></i>Mal/Hizmet Seçimi
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="applicants-tab" data-toggle="tab" href="#applicants" role="tab">
                            <i class="fas fa-users mr-1"></i>Başvuru Sahibi
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="priority-tab" data-toggle="tab" href="#priority" role="tab">
                            <i class="fas fa-calendar mr-1"></i>Rüçhan
                        </a>
                    </li>
                </ul>

                <div class="tab-content tab-content-card" id="portfolioTabContent">
                    <!-- Marka Bilgileri Tab -->
                    <div class="tab-pane fade show active" id="brand-info" role="tabpanel">
                        <div class="form-section">
                            <h3 class="section-title">Marka Bilgileri</h3>
                            
                            <!-- Marka Tipi -->
                            <div class="form-group row mb-3">
                                <label for="brandType" class="col-sm-3 col-form-label">Marka Tipi</label>
                                <div class="col-sm-9">
                                    <select class="form-control" id="brandType" required>
                                        <option value="Sadece Kelime">Sadece Kelime</option>
                                        <option value="Sadece Şekil">Sadece Şekil</option>
                                        <option value="Şekil + Kelime" selected>Şekil + Kelime</option>
                                        <option value="Ses">Ses</option>
                                        <option value="Hareket">Hareket</option>
                                        <option value="Diğer">Diğer</option>
                                    </select>
                                </div>
                            </div>

                            <!-- Başvuru No -->
                            <div class="form-group row mb-3">
                                <label for="applicationNumber" class="col-sm-3 col-form-label">Başvuru No</label>
                                <div class="col-sm-9">
                                    <input type="text" class="form-control" id="applicationNumber" placeholder="Örn: 2024-123456">
                                </div>
                            </div>

                            <!-- Marka Örneği Upload -->
                            <div class="form-group row mb-3">
                                <label for="brandExampleInput" class="col-sm-3 col-form-label">Marka Örneği</label>
                                <div class="col-sm-9">
                                    <div class="brand-upload-frame">
                                        <input type="file" id="brandExampleInput" class="form-control-file" accept="image/*" style="display:none;">
                                        <div id="brandUploadArea" class="upload-area">
                                            <i class="fas fa-cloud-upload-alt fa-2x mb-2 text-muted"></i>
                                            <p class="mb-1">Marka görselini yüklemek için tıklayın</p>
                                            <small class="text-muted">JPG, PNG formatları desteklenir</small>
                                        </div>
                                        <div id="brandExamplePreviewContainer" class="mt-3 text-center" style="display:none;">
                                            <img id="brandExamplePreview" src="#" alt="Marka Örneği" style="max-width:200px; max-height:200px; border:1px solid #ddd; padding:5px; border-radius:8px;">
                                            <br>
                                            <button id="removeBrandExampleBtn" type="button" class="btn btn-sm btn-danger mt-2">
                                                <i class="fas fa-trash mr-1"></i>Kaldır
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Marka Örneği Yazılı İfadesi -->
                            <div class="form-group row mb-3">
                                <label for="brandExampleText" class="col-sm-3 col-form-label">Marka Örneği Yazılı İfadesi</label>
                                <div class="col-sm-9">
                                    <input type="text" class="form-control" id="brandExampleText" placeholder="Markanın yazılı ifadesi">
                                </div>
                            </div>

                            <!-- Non-Latin Alphabet -->
                            <div class="form-group row mb-3">
                                <label for="nonLatinAlphabet" class="col-sm-3 col-form-label">Latin Alfabesi Dışında Harf</label>
                                <div class="col-sm-9">
                                    <input type="text" class="form-control" id="nonLatinAlphabet" placeholder="Varsa belirtiniz">
                                </div>
                            </div>

                            <!-- Önyazı Talebi -->
                            <div class="form-group row mb-3">
                                <label class="col-sm-3 col-form-label">Önyazı Talebi</label>
                                <div class="col-sm-9">
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="disclaimerRequest" id="disclaimerYes" value="Evet">
                                        <label class="form-check-label" for="disclaimerYes">Evet</label>
                                    </div>
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="disclaimerRequest" id="disclaimerNo" value="Hayır" checked>
                                        <label class="form-check-label" for="disclaimerNo">Hayır</label>
                                    </div>
                                </div>
                            </div>

                            <!-- Önyazı Metni -->
                            <div class="form-group row mb-3" id="disclaimerTextRow" style="display:none;">
                                <label for="disclaimerText" class="col-sm-3 col-form-label">Önyazı Metni</label>
                                <div class="col-sm-9">
                                    <textarea class="form-control" id="disclaimerText" rows="3" placeholder="Önyazı metnini buraya yazınız"></textarea>
                                </div>
                            </div>

                            <!-- Renkli Marka -->
                            <div class="form-group row mb-3">
                                <label class="col-sm-3 col-form-label">Renkli Marka</label>
                                <div class="col-sm-9">
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="colorBrand" id="colorYes" value="Evet">
                                        <label class="form-check-label" for="colorYes">Evet</label>
                                    </div>
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="colorBrand" id="colorNo" value="Hayır" checked>
                                        <label class="form-check-label" for="colorNo">Hayır</label>
                                    </div>
                                </div>
                            </div>

                            <!-- Renk Açıklaması -->
                            <div class="form-group row mb-3" id="colorDescriptionRow" style="display:none;">
                                <label for="colorDescription" class="col-sm-3 col-form-label">Renk Açıklaması</label>
                                <div class="col-sm-9">
                                    <textarea class="form-control" id="colorDescription" rows="2" placeholder="Kullanılan renkleri açıklayınız"></textarea>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Mal/Hizmet Seçimi Tab -->
                    <div class="tab-pane fade" id="goods-services" role="tabpanel">
                        <div class="nice-classification-container">
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

                                        <div class="classes-list" id="niceClassificationList" 
                                            style="height: 450px; overflow-y: auto; background: #fafafa;">
                                            <div class="loading-spinner">
                                                <div class="spinner-border text-primary" role="status">
                                                    <span class="sr-only">Yükleniyor...</span>
                                                </div>
                                                <p class="mt-2 text-muted">Nice sınıfları yükleniyor...</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- Custom Class Section -->
                                    <div class="custom-class-frame">
                                        <div class="custom-class-section">
                                            <div class="d-flex align-items-center mb-2">
                                                <span class="badge badge-danger mr-2" style="font-size: 11px;">99</span>
                                                <strong class="text-danger">Özel Mal/Hizmet Tanımı</strong>
                                            </div>
                                            <p class="small text-muted mb-2">
                                                <i class="fas fa-info-circle mr-1"></i>
                                                Yukarıdaki sınıflarda yer almayan özel mal/hizmetler için kullanın.
                                            </p>
                                            <textarea class="form-control mb-2" id="customClassInput" 
                                                placeholder="Özel mal/hizmet tanımınızı buraya yazın..." maxlength="500"></textarea>
                                            <div class="d-flex justify-content-between align-items-center">
                                                <small class="text-muted">
                                                    <span id="customClassCharCount">0</span>/500 karakter
                                                </small>
                                                <button type="button" class="btn btn-sm btn-outline-danger" id="addCustomClassBtn">
                                                    <i class="fas fa-plus mr-1"></i>Ekle
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="col-lg-4">
                                    <div class="card h-100">
                                        <div class="card-header bg-light">
                                            <h6 class="mb-0">
                                                <i class="fas fa-check-circle mr-2 text-success"></i>
                                                Seçilen Sınıflar
                                            </h6>
                                        </div>
                                        <div class="card-body">
                                            <div id="selectedNiceClasses" class="selected-items-list">
                                                <div class="empty-state">
                                                    <i class="fas fa-clipboard-list fa-2x"></i>
                                                    <p>Henüz sınıf seçilmedi</p>
                                                    <small class="text-muted">Sol panelden sınıfları seçerek ekleyin</small>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="border-top p-3">
                                            <button type="button" class="btn btn-outline-danger btn-sm btn-block" onclick="clearAllSelectedClasses()">
                                                <i class="fas fa-trash mr-1"></i>Tümünü Temizle
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Başvuru Sahibi Tab -->
                    <div class="tab-pane fade" id="applicants" role="tabpanel">
                        <div class="form-section">
                            <h3 class="section-title">Başvuru Sahibi Bilgileri</h3>
                            <p class="text-muted mb-3">İlgili başvuru sahiplerini arayarak ekleyebilir veya yeni bir kişi oluşturabilirsiniz.</p>
                            
                            <div class="form-group full-width">
                                <label for="applicantSearchInput" class="form-label">Başvuru Sahibi Ara</label>
                                <div class="d-flex gap-2">
                                    <input type="text" id="applicantSearchInput" class="form-control" placeholder="Aramak için en az 2 karakter...">
                                    <button type="button" id="addNewApplicantBtn" class="btn btn-outline-primary">
                                        <i class="fas fa-user-plus mr-1"></i>Yeni Kişi
                                    </button>
                                </div>
                                <div id="applicantSearchResults" class="search-results-list" style="display:none;"></div>
                            </div>

                            <div class="form-group full-width mt-4">
                                <label class="form-label">Seçilen Başvuru Sahipleri</label>
                                <div id="selectedApplicantsList" class="selected-items-list">
                                    <div class="empty-state">
                                        <i class="fas fa-user-plus fa-2x"></i>
                                        <p>Henüz başvuru sahibi seçilmedi</p>
                                        <small class="text-muted">Yukarıdaki arama alanını kullanarak kişi ekleyin</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Rüçhan Tab -->
                    <div class="tab-pane fade" id="priority" role="tabpanel">
                        <div class="form-section">
                            <h3 class="section-title">Rüçhan Bilgileri</h3>
                            
                            <div class="form-group row mb-3">
                                <label class="col-sm-3 col-form-label">Rüçhan Var Mı?</label>
                                <div class="col-sm-9">
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="hasPriority" id="priorityYes" value="Evet">
                                        <label class="form-check-label" for="priorityYes">Evet</label>
                                    </div>
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="hasPriority" id="priorityNo" value="Hayır" checked>
                                        <label class="form-check-label" for="priorityNo">Hayır</label>
                                    </div>
                                </div>
                            </div>

                            <div id="priorityFields" style="display:none;">
                                <div class="form-group row mb-3">
                                    <label for="priorityDate" class="col-sm-3 col-form-label">Rüçhan Tarihi</label>
                                    <div class="col-sm-9">
                                        <input type="date" class="form-control" id="priorityDate">
                                    </div>
                                </div>

                                <div class="form-group row mb-3">
                                    <label for="priorityNumber" class="col-sm-3 col-form-label">Rüçhan Numarası</label>
                                    <div class="col-sm-9">
                                        <input type="text" class="form-control" id="priorityNumber" placeholder="Rüçhan başvuru numarası">
                                    </div>
                                </div>

                                <div class="form-group row mb-3">
                                    <label for="priorityCountry" class="col-sm-3 col-form-label">Rüçhan Ülkesi</label>
                                    <div class="col-sm-9">
                                        <select class="form-control" id="priorityCountry">
                                            <option value="">Seçiniz...</option>
                                            <option value="TR">Türkiye</option>
                                            <option value="US">Amerika Birleşik Devletleri</option>
                                            <option value="EP">Avrupa Patent Ofisi</option>
                                            <option value="DE">Almanya</option>
                                            <option value="FR">Fransa</option>
                                            <option value="GB">İngiltere</option>
                                            <option value="JP">Japonya</option>
                                            <option value="CN">Çin</option>
                                            <option value="Other">Diğer</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="form-group row mb-3" id="otherCountryRow" style="display:none;">
                                    <label for="otherCountry" class="col-sm-3 col-form-label">Diğer Ülke</label>
                                    <div class="col-sm-9">
                                        <input type="text" class="form-control" id="otherCountry" placeholder="Ülke adını yazınız">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Event listener'ları setup et
        this.setupTrademarkFormListeners();
    }

    renderPatentForm() {
        console.log('🔬 Patent formu render ediliyor...');
        
        this.dynamicFormContainer.innerHTML = `
            <div class="form-section">
                <h3 class="section-title">Patent Bilgileri</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="patentTitle" class="form-label">Patent Başlığı *</label>
                        <input type="text" id="patentTitle" class="form-input" required placeholder="Patent başlığını giriniz">
                    </div>
                    <div class="form-group">
                        <label for="patentNumber" class="form-label">Başvuru No</label>
                        <input type="text" id="patentNumber" class="form-input" placeholder="Örn: 2024-123456">
                    </div>
                    <div class="form-group">
                        <label for="patentDate" class="form-label">Başvuru Tarihi</label>
                        <input type="date" id="patentDate" class="form-input">
                    </div>
                    <div class="form-group">
                        <label for="patentStatus" class="form-label">Patent Durumu</label>
                        <select id="patentStatus" class="form-select">
                            <option value="Başvuru">Başvuru</option>
                            <option value="İnceleme">İnceleme</option>
                            <option value="Tescil">Tescil</option>
                            <option value="Red">Red</option>
                        </select>
                    </div>
                    <div class="form-group full-width">
                        <label for="patentDescription" class="form-label">Patent Açıklaması</label>
                        <textarea id="patentDescription" class="form-textarea" rows="4" placeholder="Patent açıklamasını giriniz"></textarea>
                    </div>
                    <div class="form-group full-width">
                        <label for="patentInventors" class="form-label">Buluş Sahipleri</label>
                        <textarea id="patentInventors" class="form-textarea" rows="2" placeholder="Buluş sahiplerinin isimlerini giriniz"></textarea>
                    </div>
                </div>
            </div>
        `;

        this.updateSaveButtonState();
    }

    renderDesignForm() {
        console.log('🎨 Tasarım formu render ediliyor...');
        
        this.dynamicFormContainer.innerHTML = `
            <div class="form-section">
                <h3 class="section-title">Tasarım Bilgileri</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="designTitle" class="form-label">Tasarım Başlığı *</label>
                        <input type="text" id="designTitle" class="form-input" required placeholder="Tasarım başlığını giriniz">
                    </div>
                    <div class="form-group">
                        <label for="designNumber" class="form-label">Başvuru No</label>
                        <input type="text" id="designNumber" class="form-input" placeholder="Örn: 2024-123456">
                    </div>
                    <div class="form-group">
                        <label for="designDate" class="form-label">Başvuru Tarihi</label>
                        <input type="date" id="designDate" class="form-input">
                    </div>
                    <div class="form-group">
                        <label for="designStatus" class="form-label">Tasarım Durumu</label>
                        <select id="designStatus" class="form-select">
                            <option value="Başvuru">Başvuru</option>
                            <option value="İnceleme">İnceleme</option>
                            <option value="Tescil">Tescil</option>
                            <option value="Red">Red</option>
                        </select>
                    </div>
                    <div class="form-group full-width">
                        <label for="designDescription" class="form-label">Tasarım Açıklaması</label>
                        <textarea id="designDescription" class="form-textarea" rows="4" placeholder="Tasarım açıklamasını giriniz"></textarea>
                    </div>
                    <div class="form-group full-width">
                        <label for="designCategory" class="form-label">Tasarım Kategorisi</label>
                        <input type="text" id="designCategory" class="form-input" placeholder="Tasarım kategorisini giriniz">
                    </div>
                </div>
            </div>
        `;

        this.updateSaveButtonState();
    }

    setupTrademarkFormListeners() {
        console.log('🎛️ Marka form listeners kuruluyor...');

        // Tab geçişlerini dinle
        $('#portfolioTabs a').on('shown.bs.tab', (e) => {
            const tabId = e.target.getAttribute('href').substring(1);
            console.log('📑 Tab değişti:', tabId);

            // Mal/Hizmet sekmesi açıldığında Nice Classification'ı başlat
            if (tabId === 'goods-services' && !this.isNiceInitialized) {
                console.log('🏷️ Nice Classification başlatılıyor...');
                setTimeout(() => {
                    initializeNiceClassification();
                    this.isNiceInitialized = true;
                }, 100);
            }

            // Başvuru sahibi sekmesi açıldığında arama setup'ını yap
            if (tabId === 'applicants') {
                this.setupApplicantSearch();
            }
        });

        // Brand image upload
        this.setupBrandImageUpload();

        // Disclaimer radio buttons
        document.querySelectorAll('input[name="disclaimerRequest"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const disclaimerTextRow = document.getElementById('disclaimerTextRow');
                if (e.target.value === 'Evet') {
                    disclaimerTextRow.style.display = 'flex';
                } else {
                    disclaimerTextRow.style.display = 'none';
                }
            });
        });

        // Color brand radio buttons
        document.querySelectorAll('input[name="colorBrand"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const colorDescriptionRow = document.getElementById('colorDescriptionRow');
                if (e.target.value === 'Evet') {
                    colorDescriptionRow.style.display = 'flex';
                } else {
                    colorDescriptionRow.style.display = 'none';
                }
            });
        });

        // Priority radio buttons
        document.querySelectorAll('input[name="hasPriority"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const priorityFields = document.getElementById('priorityFields');
                if (e.target.value === 'Evet') {
                    priorityFields.style.display = 'block';
                } else {
                    priorityFields.style.display = 'none';
                }
            });
        });

        // Priority country change
        const priorityCountrySelect = document.getElementById('priorityCountry');
        if (priorityCountrySelect) {
            priorityCountrySelect.addEventListener('change', (e) => {
                const otherCountryRow = document.getElementById('otherCountryRow');
                if (e.target.value === 'Other') {
                    otherCountryRow.style.display = 'flex';
                } else {
                    otherCountryRow.style.display = 'none';
                }
            });
        }

        // Custom class character count
        const customClassInput = document.getElementById('customClassInput');
        const charCountSpan = document.getElementById('customClassCharCount');
        if (customClassInput && charCountSpan) {
            customClassInput.addEventListener('input', (e) => {
                charCountSpan.textContent = e.target.value.length;
            });
        }

        // Form completion check
        this.setupFormCompletionCheck();
    }

    setupBrandImageUpload() {
        const uploadArea = document.getElementById('brandUploadArea');
        const fileInput = document.getElementById('brandExampleInput');
        const previewContainer = document.getElementById('brandExamplePreviewContainer');
        const previewImg = document.getElementById('brandExamplePreview');
        const removeBtn = document.getElementById('removeBrandExampleBtn');

        if (!uploadArea || !fileInput) return;

        // Upload area click
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewImg.src = e.target.result;
                    previewContainer.style.display = 'block';
                    uploadArea.style.display = 'none';
                    this.uploadedBrandImage = file;
                    console.log('📷 Marka görseli yüklendi:', file.name);
                };
                reader.readAsDataURL(file);
            }
        });

        // Remove button
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                previewImg.src = '#';
                previewContainer.style.display = 'none';
                uploadArea.style.display = 'block';
                fileInput.value = '';
                this.uploadedBrandImage = null;
                console.log('🗑️ Marka görseli kaldırıldı');
            });
        }
    }

    setupApplicantSearch() {
        const searchInput = document.getElementById('applicantSearchInput');
        const searchResults = document.getElementById('applicantSearchResults');
        const addNewBtn = document.getElementById('addNewApplicantBtn');

        if (!searchInput || !searchResults) return;

        // Search functionality
        searchInput.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            
            if (query.length < 2) {
                searchResults.style.display = 'none';
                return;
            }

            try {
                // Mock data for now - replace with actual personService call
                const mockResults = [
                    { id: 1, name: 'Ahmet Yılmaz', email: 'ahmet@example.com' },
                    { id: 2, name: 'Ayşe Kaya', email: 'ayse@example.com' },
                    { id: 3, name: 'Mehmet Öz', email: 'mehmet@example.com' }
                ].filter(person => person.name.toLowerCase().includes(query.toLowerCase()));

                this.renderSearchResults(mockResults, searchResults);
            } catch (error) {
                console.error('❌ Kişi arama hatası:', error);
                searchResults.innerHTML = '<div class="search-result-item text-danger">Arama sırasında hata oluştu</div>';
                searchResults.style.display = 'block';
            }
        });

        // Add new person button
        if (addNewBtn) {
            addNewBtn.addEventListener('click', () => {
                $('#newPersonModal').modal('show');
            });
        }

        // New person modal save
        const savePersonBtn = document.getElementById('savePersonBtn');
        if (savePersonBtn) {
            savePersonBtn.addEventListener('click', () => {
                this.handleSaveNewPerson();
            });
        }
    }

    renderSearchResults(results, container) {
        if (results.length === 0) {
            container.innerHTML = '<div class="search-result-item text-muted">Sonuç bulunamadı</div>';
        } else {
            container.innerHTML = results.map(person => `
                <div class="search-result-item" data-person-id="${person.id}" data-person-name="${person.name}" data-person-email="${person.email || ''}">
                    <strong>${person.name}</strong>
                    ${person.email ? `<br><small class="text-muted">${person.email}</small>` : ''}
                </div>
            `).join('');

            // Add click listeners
            container.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const personData = {
                        id: item.dataset.personId,
                        name: item.dataset.personName,
                        email: item.dataset.personEmail
                    };
                    this.addApplicant(personData);
                    container.style.display = 'none';
                    document.getElementById('applicantSearchInput').value = '';
                });
            });
        }
        container.style.display = 'block';
    }

    addApplicant(person) {
        // Check if already added
        if (this.selectedApplicants.find(a => a.id === person.id)) {
            alert('Bu kişi zaten eklenmiş!');
            return;
        }

        this.selectedApplicants.push(person);
        this.renderSelectedApplicants();
        console.log('👤 Başvuru sahibi eklendi:', person.name);
    }

    renderSelectedApplicants() {
        const container = document.getElementById('selectedApplicantsList');
        if (!container) return;

        if (this.selectedApplicants.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-plus fa-2x"></i>
                    <p>Henüz başvuru sahibi seçilmedi</p>
                    <small class="text-muted">Yukarıdaki arama alanını kullanarak kişi ekleyin</small>
                </div>
            `;
        } else {
            container.innerHTML = this.selectedApplicants.map(applicant => `
                <div class="selected-item">
                    <span><strong>${applicant.name}</strong></span>
                    ${applicant.email ? `<br><small class="text-muted">${applicant.email}</small>` : ''}
                    <button type="button" class="remove-item" onclick="dataEntryInstance.removeApplicant('${applicant.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');
        }
    }

    removeApplicant(personId) {
        this.selectedApplicants = this.selectedApplicants.filter(a => a.id !== personId);
        this.renderSelectedApplicants();
        console.log('🗑️ Başvuru sahibi kaldırıldı:', personId);
    }

    handleSaveNewPerson() {
        const form = document.getElementById('newPersonForm');
        const formData = new FormData(form);
        
        const personData = {
            id: Date.now().toString(), // Temporary ID
            name: document.getElementById('personName').value.trim(),
            email: document.getElementById('personEmail').value.trim(),
            phone: document.getElementById('personPhone').value.trim(),
            address: document.getElementById('personAddress').value.trim()
        };

        if (!personData.name) {
            alert('Lütfen kişi adını giriniz!');
            return;
        }

        // Add to applicants
        this.addApplicant(personData);
        
        // Close modal and reset form
        $('#newPersonModal').modal('hide');
        form.reset();
        
        console.log('✅ Yeni kişi eklendi:', personData.name);
    }

    setupFormCompletionCheck() {
        // Monitor form completion for save button state
        const requiredFields = ['brandType', 'applicationNumber'];
        
        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('input', () => {
                    this.updateSaveButtonState();
                });
                field.addEventListener('change', () => {
                    this.updateSaveButtonState();
                });
            }
        });
    }

    updateSaveButtonState() {
        const ipType = this.ipTypeSelect.value;
        let isValid = false;

        if (ipType === 'trademark') {
            const brandType = document.getElementById('brandType')?.value;
            const applicationNumber = document.getElementById('applicationNumber')?.value;
            isValid = brandType && applicationNumber;
        } else if (ipType === 'patent') {
            const patentTitle = document.getElementById('patentTitle')?.value;
            isValid = patentTitle;
        } else if (ipType === 'design') {
            const designTitle = document.getElementById('designTitle')?.value;
            isValid = designTitle;
        }

        this.saveBtn.disabled = !isValid;
        console.log('💾 Kaydet butonu durumu:', isValid ? 'Aktif' : 'Pasif');
    }

    handleSavePortfolio() {
        console.log('💾 Portföy kaydı başlatılıyor...');

        const ipType = this.ipTypeSelect.value;
        let portfolioData = {
            ipType: ipType,
            createdAt: new Date().toISOString(),
            status: 'Aktif'
        };

        try {
            if (ipType === 'trademark') {
                portfolioData.trademark = this.collectTrademarkData();
            } else if (ipType === 'patent') {
                portfolioData.patent = this.collectPatentData();
            } else if (ipType === 'design') {
                portfolioData.design = this.collectDesignData();
            }

            console.log('📄 Toplanan portföy verisi:', portfolioData);
            
            // Here you would typically save to Firebase or your backend
            this.saveToBackend(portfolioData);
            
        } catch (error) {
            console.error('❌ Portföy kaydı hatası:', error);
            alert('Kayıt sırasında bir hata oluştu: ' + error.message);
        }
    }

    collectTrademarkData() {
        const selectedClasses = getSelectedNiceClasses ? getSelectedNiceClasses() : [];
        
        return {
            brandType: document.getElementById('brandType')?.value,
            applicationNumber: document.getElementById('applicationNumber')?.value,
            brandExampleText: document.getElementById('brandExampleText')?.value,
            nonLatinAlphabet: document.getElementById('nonLatinAlphabet')?.value,
            disclaimerRequest: document.querySelector('input[name="disclaimerRequest"]:checked')?.value,
            disclaimerText: document.getElementById('disclaimerText')?.value,
            colorBrand: document.querySelector('input[name="colorBrand"]:checked')?.value,
            colorDescription: document.getElementById('colorDescription')?.value,
            selectedClasses: selectedClasses,
            applicants: this.selectedApplicants,
            priority: {
                hasPriority: document.querySelector('input[name="hasPriority"]:checked')?.value,
                priorityDate: document.getElementById('priorityDate')?.value,
                priorityNumber: document.getElementById('priorityNumber')?.value,
                priorityCountry: document.getElementById('priorityCountry')?.value,
                otherCountry: document.getElementById('otherCountry')?.value
            },
            uploadedImage: this.uploadedBrandImage
        };
    }

    collectPatentData() {
        return {
            title: document.getElementById('patentTitle')?.value,
            number: document.getElementById('patentNumber')?.value,
            date: document.getElementById('patentDate')?.value,
            status: document.getElementById('patentStatus')?.value,
            description: document.getElementById('patentDescription')?.value,
            inventors: document.getElementById('patentInventors')?.value
        };
    }

    collectDesignData() {
        return {
            title: document.getElementById('designTitle')?.value,
            number: document.getElementById('designNumber')?.value,
            date: document.getElementById('designDate')?.value,
            status: document.getElementById('designStatus')?.value,
            description: document.getElementById('designDescription')?.value,
            category: document.getElementById('designCategory')?.value
        };
    }

    async saveToBackend(portfolioData) {
        try {
            // Mock save operation
            console.log('🚀 Backend\'e kaydediliyor...', portfolioData);
            
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            alert('✅ Portföy kaydı başarıyla oluşturuldu!');
            
            // Redirect to portfolio page
            window.location.href = 'portfolio.html';
            
        } catch (error) {
            console.error('❌ Backend kayıt hatası:', error);
            throw new Error('Kayıt işlemi başarısız oldu');
        }
    }
}

// Global instance for remove functions
let dataEntryInstance;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM yüklendi, Data Entry Module başlatılıyor...');
    dataEntryInstance = new DataEntryModule();
    dataEntryInstance.init();
    
    // Make instance globally accessible
    window.dataEntryInstance = dataEntryInstance;
});