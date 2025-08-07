searchPersons(searchTerm, type) {
        const resultsContainer = document.getElementById(`${type}SearchResults`);
        if (!resultsContainer) return;

        if (searchTerm.length < 2) {
            resultsContainer.style.display = 'none';
            return;
        }

        const filteredPersons = this.allPersons.filter(person => 
            person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (person.email && person.email.toLowerCase().includes(searchTerm.toLowerCase()))
        );

        if (filteredPersons.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results-message">Sonuç bulunamadı</div>';
        } else {
            resultsContainer.innerHTML = filteredPersons.map(person => 
                '<div class="search-result-item" data-person-id="' + person.id + '">' +
                    '<strong>' + person.name + '</strong>' +
                    (person.email ? '<br><small class="text-muted">' + person.email + '</small>' : '') +
                '</div>'
            ).join('');

            // Tıklama listener'ları ekle
            resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const personId = item.dataset.personId;
                    const person = this.allPersons.find(p => p.id === personId);
                    if (person) {
                        this.addSelectedPerson(person, type);
                        document.getElementById(`${type}Search`).value = '';
                        resultsContainer.style.display = 'none';
                    }
                });
            });
        }

        resultsContainer.style.display = 'block';
    }

    addSelectedPerson(person, type) {
        if (type === 'applicant') {
            // Zaten seçili mi kontrol et
            if (this.selectedApplicants.find(p => p.id === person.id)) {
                alert('Bu kişi zaten seçili');
                return;
            }

            this.selectedApplicants.push(person);
            this.renderSelectedApplicants();
        }
        
        this.updateSaveButtonState();
    }

    renderSelectedApplicants() {
        const container = document.getElementById('selectedApplicantsContainer');
        if (!container) return;

        if (this.selectedApplicants.length === 0) {
            container.innerHTML = 
                '<div class="empty-state text-center py-4">' +
                    '<i class="fas fa-users fa-2x text-muted mb-2"></i>' +
                    '<p class="text-muted">Henüz başvuru sahibi seçilmedi</p>' +
                '</div>';
        } else {
            container.innerHTML = this.selectedApplicants.map(person => 
                '<div class="selected-item">' +
                    '<span><strong>' + person.name + '</strong>' + (person.email ? ' (' + person.email + ')' : '') + '</span>' +
                    '<button type="button" class="remove-selected-item-btn" data-person-id="' + person.id + '">' +
                        '&times;' +
                    '</button>' +
                '</div>'
            ).join('');

            // Kaldır butonları için listener'lar
            container.querySelectorAll('.remove-selected-item-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const personId = btn.dataset.personId;
                    this.selectedApplicants = this.selectedApplicants.filter(p => p.id !== personId);
                    this.renderSelectedApplicants();
                    this.updateSaveButtonState();
                });
            });
        }
    }

    setupBrandExampleUploader() {
        const uploadArea = document.getElementById('brandExampleUploadArea');
        const fileInput = document.getElementById('brandExample');
        
        if (!uploadArea || !fileInput) return;

        // Drag & Drop olayları
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.backgroundColor = '#e9ecef';
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.backgroundColor = '#f8f9fa';
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.backgroundColor = '#f8f9fa';
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleBrandExampleFile(files[0]);
            }
        });

        // Tıklama olayı
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        // Dosya seçim olayı
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleBrandExampleFile(e.target.files[0]);
            }
        });

        // Kaldır butonu
        const removeBtn = document.getElementById('removeBrandExampleBtn');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                const previewContainer = document.getElementById('brandExamplePreviewContainer');
                const previewImage = document.getElementById('brandExamplePreview');
                
                if (previewContainer) previewContainer.style.display = 'none';
                if (previewImage) previewImage.src = '';
                if (fileInput) fileInput.value = '';
                
                this.uploadedBrandImage = null;
                this.updateSaveButtonState();
            });
        }
    }

    handleBrandExampleFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('Lütfen geçerli bir resim dosyası seçin (PNG, JPG, JPEG)');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const previewContainer = document.getElementById('brandExamplePreviewContainer');
            const previewImage = document.getElementById('brandExamplePreview');
            
            if (previewImage) previewImage.src = e.target.result;
            if (previewContainer) previewContainer.style.display = 'block';
            
            this.uploadedBrandImage = file;
            this.updateSaveButtonState();
        };
        
        reader.readAsDataURL(file);
    }// js/data-entry.js
import { initializeNiceClassification, getSelectedNiceClasses } from './nice-classification.js';
import { personService, ipRecordsService, storage } from '../firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { loadSharedLayout } from './layout-loader.js';

class DataEntryModule {
    constructor() {
        this.ipTypeSelect = document.getElementById('ipTypeSelect');
        this.dynamicFormContainer = document.getElementById('dynamicFormContainer');
        this.saveBtn = document.getElementById('savePortfolioBtn');
        
        // State variables
        this.selectedApplicants = [];
        this.isNiceInitialized = false;
        this.uploadedBrandImage = null;
        this.allPersons = [];
    }

    async init() {
        console.log('🚀 Data Entry Module başlatılıyor...');
        try {
            await this.loadAllData();
            this.setupEventListeners();
            this.setupModalCloseButtons();
        } catch (error) {
            console.error('Data Entry Module init hatası:', error);
        }
    }

    async loadAllData() {
        try {
            const personsResult = await personService.getPersons();
            this.allPersons = personsResult.success ? personsResult.data : [];
            console.log('📊 Tüm veriler yüklendi:', this.allPersons.length, 'kişi');
        } catch (error) {
            console.error('Veriler yüklenirken hata:', error);
            this.allPersons = [];
        }
    }

    setupEventListeners() {
        console.log('🎯 Event listener kuruluyor...');
        
        if (this.ipTypeSelect) {
            this.ipTypeSelect.addEventListener('change', (e) => {
                this.handleIPTypeChange(e.target.value);
            });
        }

        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => {
                this.handleSavePortfolio();
            });
        }
    }

    setupModalCloseButtons() {
        const cancelPersonBtn = document.getElementById('cancelPersonBtn');
        if (cancelPersonBtn) {
            cancelPersonBtn.addEventListener('click', () => this.hideAddPersonModal());
        }
        
        const savePersonBtn = document.getElementById('savePersonBtn');
        if (savePersonBtn) {
            savePersonBtn.addEventListener('click', () => this.saveNewPerson());
        }
    }

    handleIPTypeChange(ipType) {
        console.log('📋 IP türü değişti:', ipType);
        
        this.dynamicFormContainer.innerHTML = '';
        this.selectedApplicants = [];
        this.isNiceInitialized = false;
        this.uploadedBrandImage = null;
        this.updateSaveButtonState();

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
        }
    }

    renderTrademarkForm() {
        console.log('🏷️ Marka formu render ediliyor...');
        
        const html = 
            '<div class="form-section">' +
                '<ul class="nav nav-tabs" id="portfolioTabs" role="tablist">' +
                    '<li class="nav-item">' +
                        '<a class="nav-link active" id="brand-info-tab" data-toggle="tab" href="#brand-info" role="tab">' +
                            '<i class="fas fa-tag mr-1"></i>Marka Bilgileri' +
                        '</a>' +
                    '</li>' +
                    '<li class="nav-item">' +
                        '<a class="nav-link" id="applicants-tab" data-toggle="tab" href="#applicants" role="tab">' +
                            '<i class="fas fa-users mr-1"></i>Başvuru Sahipleri' +
                        '</a>' +
                    '</li>' +
                    '<li class="nav-item">' +
                        '<a class="nav-link" id="goods-services-tab" data-toggle="tab" href="#goods-services" role="tab">' +
                            '<i class="fas fa-list-ul mr-1"></i>Mal ve Hizmetler' +
                        '</a>' +
                    '</li>' +
                '</ul>' +
                
                '<div class="tab-content tab-content-card" id="portfolioTabContent">' +
                    // Tab 1: Marka Bilgileri
                    '<div class="tab-pane fade show active" id="brand-info" role="tabpanel">' +
                        '<div class="form-grid">' +
                            '<div class="form-group">' +
                                '<label for="brandExampleText" class="form-label">Marka Metni</label>' +
                                '<input type="text" id="brandExampleText" class="form-input" placeholder="Marka adını girin">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label for="applicationNumber" class="form-label">Başvuru Numarası</label>' +
                                '<input type="text" id="applicationNumber" class="form-input" placeholder="Başvuru numarasını girin">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label for="applicationDate" class="form-label">Başvuru Tarihi</label>' +
                                '<input type="date" id="applicationDate" class="form-input">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label for="registrationNumber" class="form-label">Tescil Numarası</label>' +
                                '<input type="text" id="registrationNumber" class="form-input" placeholder="Tescil numarasını girin">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label for="registrationDate" class="form-label">Tescil Tarihi</label>' +
                                '<input type="date" id="registrationDate" class="form-input">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label for="renewalDate" class="form-label">Yenileme Tarihi</label>' +
                                '<input type="date" id="renewalDate" class="form-input">' +
                            '</div>' +
                            '<div class="form-group full-width">' +
                                '<label for="brandDescription" class="form-label">Marka Açıklaması</label>' +
                                '<textarea id="brandDescription" class="form-textarea" rows="3" placeholder="Marka hakkında açıklama girin"></textarea>' +
                            '</div>' +
                            '<div class="form-group full-width">' +
                                '<label class="form-label">Marka Görseli</label>' +
                                '<div class="brand-upload-frame">' +
                                    '<input type="file" id="brandExample" accept="image/*" style="display: none;">' +
                                    '<div id="brandExampleUploadArea" class="upload-area">' +
                                        '<i class="fas fa-cloud-upload-alt fa-2x text-muted"></i>' +
                                        '<p class="mt-2 mb-0">Dosya seçmek için tıklayın veya sürükleyip bırakın</p>' +
                                        '<small class="text-muted">PNG, JPG, JPEG dosyaları kabul edilir</small>' +
                                    '</div>' +
                                    '<div id="brandExamplePreviewContainer" style="display: none;" class="text-center mt-3">' +
                                        '<img id="brandExamplePreview" src="" alt="Marka Örneği" style="max-width: 200px; max-height: 200px; border: 1px solid #ddd; border-radius: 8px;">' +
                                        '<br>' +
                                        '<button type="button" id="removeBrandExampleBtn" class="btn btn-danger btn-sm mt-2">' +
                                            '<i class="fas fa-trash"></i> Kaldır' +
                                        '</button>' +
                                    '</div>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    
                    // Tab 2: Başvuru Sahipleri
                    '<div class="tab-pane fade" id="applicants" role="tabpanel">' +
                        '<div class="d-flex justify-content-between align-items-center mb-3">' +
                            '<h5>Başvuru Sahipleri</h5>' +
                            '<button type="button" class="btn-add-person btn-small" id="addApplicantBtn">' +
                                '<i class="fas fa-plus"></i> Yeni Kişi Ekle' +
                            '</button>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label for="applicantSearch" class="form-label">Başvuru Sahibi Ara</label>' +
                            '<div class="search-input-wrapper">' +
                                '<input type="text" id="applicantSearch" class="search-input" placeholder="İsim veya e-mail ile ara...">' +
                                '<div id="applicantSearchResults" class="search-results-list" style="display: none;"></div>' +
                            '</div>' +
                        '</div>' +
                        '<div id="selectedApplicantsContainer" class="selected-items-container">' +
                            '<div class="empty-state text-center py-4">' +
                                '<i class="fas fa-users fa-2x text-muted mb-2"></i>' +
                                '<p class="text-muted">Henüz başvuru sahibi seçilmedi</p>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    
                    // Tab 3: Mal ve Hizmetler (Nice Classification)
                    '<div class="tab-pane fade" id="goods-services" role="tabpanel">' +
                        '<div class="nice-classification-container">' +
                            '<div class="row">' +
                                '<div class="col-lg-8">' +
                                    '<div class="classification-panel mb-3">' +
                                        '<div class="panel-header">' +
                                            '<h5 class="mb-0">' +
                                                '<i class="fas fa-list-ul mr-2"></i>' +
                                                'Nice Classification - Mal ve Hizmet Sınıfları' +
                                            '</h5>' +
                                            '<small class="text-white-50">1-45 arası sınıflardan seçim yapın</small>' +
                                        '</div>' +
                                        '<div class="search-section">' +
                                            '<div class="input-group">' +
                                                '<div class="input-group-prepend">' +
                                                    '<span class="input-group-text">' +
                                                        '<i class="fas fa-search"></i>' +
                                                    '</span>' +
                                                '</div>' +
                                                '<input type="text" class="form-control" id="niceClassSearch" placeholder="Sınıf ara... (örn: kozmetik, kimyasal, teknoloji)">' +
                                                '<div class="input-group-append">' +
                                                    '<button class="btn btn-outline-secondary" type="button" onclick="clearNiceSearch()">' +
                                                        '<i class="fas fa-times"></i>' +
                                                    '</button>' +
                                                '</div>' +
                                            '</div>' +
                                        '</div>' +
                                        '<div class="classes-list" id="niceClassificationList">' +
                                            '<!-- Nice classification sınıfları buraya yüklenecek -->' +
                                        '</div>' +
                                    '</div>' +
                                '</div>' +
                                '<div class="col-lg-4">' +
                                    '<div class="selected-classes-panel">' +
                                        '<div class="panel-header">' +
                                            '<h5 class="mb-0">' +
                                                '<i class="fas fa-check-circle mr-2"></i>' +
                                                'Seçilen Sınıflar' +
                                            '</h5>' +
                                            '<small class="text-white-50">Toplam: <span id="selectedClassCount">0</span></small>' +
                                        '</div>' +
                                        '<div class="scrollable-list p-3" id="selectedNiceClasses">' +
                                            '<div class="empty-state text-center py-4">' +
                                                '<i class="fas fa-clipboard-list fa-2x text-muted mb-2"></i>' +
                                                '<p class="text-muted">Henüz sınıf seçilmedi</p>' +
                                            '</div>' +
                                        '</div>' +
                                        '<div class="custom-class-frame">' +
                                            '<div class="custom-class-section">' +
                                                '<label class="form-label">Özel Mal/Hizmet Tanımı</label>' +
                                                '<textarea id="customClassInput" class="form-control" rows="3" placeholder="Standart sınıflarda olmayan özel mal/hizmetlerinizi buraya yazabilirsiniz..."></textarea>' +
                                                '<div class="d-flex justify-content-between align-items-center mt-2">' +
                                                    '<small class="text-muted">' +
                                                        '<span id="customClassCharCount">0</span>/500 karakter' +
                                                    '</small>' +
                                                    '<button type="button" class="btn btn-warning btn-sm" id="addCustomClassBtn">' +
                                                        '<i class="fas fa-plus mr-1"></i>Ekle' +
                                                    '</button>' +
                                                '</div>' +
                                            '</div>' +
                                        '</div>' +
                                    '</div>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';

        this.dynamicFormContainer.innerHTML = html;
        this.setupDynamicFormListeners();
        this.setupBrandExampleUploader();
        this.updateSaveButtonState();
    }

    renderPatentForm() {
        console.log('⚗️ Patent formu render ediliyor...');
        
        const html = '<div class="form-section">' +
            '<h3 class="section-title">Patent Bilgileri</h3>' +
            '<div class="form-grid">' +
                '<div class="form-group">' +
                    '<label for="patentTitle" class="form-label">Patent Başlığı</label>' +
                    '<input type="text" id="patentTitle" class="form-input" placeholder="Patent başlığını girin">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="patentApplicationNumber" class="form-label">Başvuru Numarası</label>' +
                    '<input type="text" id="patentApplicationNumber" class="form-input" placeholder="Başvuru numarasını girin">' +
                '</div>' +
                '<div class="form-group full-width">' +
                    '<label for="patentDescription" class="form-label">Patent Açıklaması</label>' +
                    '<textarea id="patentDescription" class="form-textarea" rows="4" placeholder="Patent hakkında detaylı açıklama girin"></textarea>' +
                '</div>' +
            '</div>' +
        '</div>';

        this.dynamicFormContainer.innerHTML = html;
        this.updateSaveButtonState();
    }

    renderDesignForm() {
        console.log('🎨 Tasarım formu render ediliyor...');
        
        const html = '<div class="form-section">' +
            '<h3 class="section-title">Tasarım Bilgileri</h3>' +
            '<div class="form-grid">' +
                '<div class="form-group">' +
                    '<label for="designTitle" class="form-label">Tasarım Başlığı</label>' +
                    '<input type="text" id="designTitle" class="form-input" placeholder="Tasarım başlığını girin">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="designApplicationNumber" class="form-label">Başvuru Numarası</label>' +
                    '<input type="text" id="designApplicationNumber" class="form-input" placeholder="Başvuru numarasını girin">' +
                '</div>' +
                '<div class="form-group full-width">' +
                    '<label for="designDescription" class="form-label">Tasarım Açıklaması</label>' +
                    '<textarea id="designDescription" class="form-textarea" rows="4" placeholder="Tasarım hakkında detaylı açıklama girin"></textarea>' +
                '</div>' +
            '</div>' +
        '</div>';

        this.dynamicFormContainer.innerHTML = html;
        this.updateSaveButtonState();
    }

    setupDynamicFormListeners() {
        console.log('🎯 Dynamic form listeners kuruluyor...');
        
        // Tab değişim listener'ları
        const tabLinks = document.querySelectorAll('#portfolioTabs a[data-toggle="tab"]');
        tabLinks.forEach(tabLink => {
            tabLink.addEventListener('shown.bs.tab', (e) => {
                const targetTab = e.target.getAttribute('href');
                console.log('📋 Tab değişti:', targetTab);
                
                // Nice Classification tab'ına geçildiğinde başlat
                if (targetTab === '#goods-services' && !this.isNiceInitialized) {
                    console.log('🔄 Nice Classification başlatılıyor...');
                    this.isNiceInitialized = true;
                    setTimeout(() => {
                        initializeNiceClassification();
                    }, 100);
                }
            });
        });

        // Başvuru sahibi arama
        const applicantSearch = document.getElementById('applicantSearch');
        if (applicantSearch) {
            applicantSearch.addEventListener('input', (e) => {
                this.searchPersons(e.target.value, 'applicant');
            });
        }

        // Yeni kişi ekleme butonu
        const addApplicantBtn = document.getElementById('addApplicantBtn');
        if (addApplicantBtn) {
            addApplicantBtn.addEventListener('click', () => {
                this.showAddPersonModal();
            });
        }

        // Form input change listeners
        this.dynamicFormContainer.addEventListener('input', () => {
            this.updateSaveButtonState();
        });
    }

    updateSaveButtonState() {
        const ipType = this.ipTypeSelect.value;
        let isComplete = false;

        if (ipType === 'trademark') {
            const brandText = document.getElementById('brandExampleText');
            const hasApplicants = this.selectedApplicants.length > 0;
            isComplete = brandText && brandText.value.trim() && hasApplicants;
        } else if (ipType === 'patent') {
            const patentTitle = document.getElementById('patentTitle');
            isComplete = patentTitle && patentTitle.value.trim();
        } else if (ipType === 'design') {
            const designTitle = document.getElementById('designTitle');
            isComplete = designTitle && designTitle.value.trim();
        }

        if (this.saveBtn) {
            this.saveBtn.disabled = !isComplete;
        }
    }

    showAddPersonModal() {
        const modal = document.getElementById('addPersonModal');
        if (modal && window.$) {
            window.$('#addPersonModal').modal('show');
        }
    }

    hideAddPersonModal() {
        if (window.$) {
            window.$('#addPersonModal').modal('hide');
            document.getElementById('addPersonForm').reset();
        }
    }

    async saveNewPerson() {
        const name = document.getElementById('personName').value.trim();
        const email = document.getElementById('personEmail').value.trim();
        const phone = document.getElementById('personPhone').value.trim();
        const address = document.getElementById('personAddress').value.trim();

        if (!name) {
            alert('İsim alanı zorunludur');
            return;
        }

        const personData = {
            name,
            email: email || null,
            phone: phone || null,
            address: address || null
        };

        try {
            const result = await personService.createPerson(personData);
            if (result.success) {
                const newPerson = { id: result.id, ...personData };
                this.allPersons.push(newPerson);
                this.hideAddPersonModal();
                alert('Kişi başarıyla eklendi');
            } else {
                alert('Kişi eklenirken hata oluştu: ' + result.error);
            }
        } catch (error) {
            console.error('Kişi kaydetme hatası:', error);
            alert('Kişi eklenirken bir hata oluştu');
        }
    }

    async uploadFileToStorage(file, path) {
        if (!file || !path) {
            return null;
        }
        
        const storageRef = ref(storage, path);
        try {
            const uploadResult = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(uploadResult.ref);
            return downloadURL;
        } catch (error) {
            console.error("Dosya yüklenirken hata oluştu:", error);
            return null;
        }
    }

    async handleSavePortfolio() {
        const ipType = this.ipTypeSelect.value;
        
        if (!ipType) {
            alert('Lütfen bir IP türü seçin');
            return;
        }

        let portfolioData = {
            ipType: ipType,
            status: 'active',
            createdAt: new Date().toISOString(),
            details: {}
        };

        try {
            if (ipType === 'trademark') {
                await this.saveTrademarkPortfolio(portfolioData);
            } else if (ipType === 'patent') {
                await this.savePatentPortfolio(portfolioData);
            } else if (ipType === 'design') {
                await this.saveDesignPortfolio(portfolioData);
            }
        } catch (error) {
            console.error('Portföy kaydı kaydetme hatası:', error);
            alert('Portföy kaydı kaydedilirken bir hata oluştu');
        }
    }

    async saveTrademarkPortfolio(portfolioData) {
        const brandText = document.getElementById('brandExampleText').value.trim();
        const applicationNumber = document.getElementById('applicationNumber').value.trim();
        const applicationDate = document.getElementById('applicationDate').value;
        const registrationNumber = document.getElementById('registrationNumber').value.trim();
        const registrationDate = document.getElementById('registrationDate').value;
        const renewalDate = document.getElementById('renewalDate').value;
        const description = document.getElementById('brandDescription').value.trim();

        // Mal ve hizmet sınıflarını al (Nice Classification'dan)
        const goodsAndServices = getSelectedNiceClasses();

        // Marka görseli yükle
        let brandImageUrl = null;
        if (this.uploadedBrandImage) {
            const imagePath = `brands/${Date.now()}_${this.uploadedBrandImage.name}`;
            brandImageUrl = await this.uploadFileToStorage(this.uploadedBrandImage, imagePath);
        }

        portfolioData.title = brandText;
        portfolioData.details = {
            brandText,
            applicationNumber: applicationNumber || null,
            applicationDate: applicationDate || null,
            registrationNumber: registrationNumber || null,
            registrationDate: registrationDate || null,
            renewalDate: renewalDate || null,
            description: description || null,
            brandImageUrl,
            goodsAndServices,
            applicants: this.selectedApplicants.map(p => ({
                id: p.id,
                name: p.name,
                email: p.email || null
            }))
        };

        const result = await ipRecordsService.createRecord(portfolioData);
        if (result.success) {
            alert('Marka portföy kaydı başarıyla oluşturuldu!');
            window.location.href = 'portfolio-management.html';
        } else {
            throw new Error(result.error);
        }
    }

    async savePatentPortfolio(portfolioData) {
        const patentTitle = document.getElementById('patentTitle').value.trim();
        const applicationNumber = document.getElementById('patentApplicationNumber').value.trim();
        const description = document.getElementById('patentDescription').value.trim();

        portfolioData.title = patentTitle;
        portfolioData.details = {
            patentTitle,
            applicationNumber: applicationNumber || null,
            description: description || null
        };

        const result = await ipRecordsService.createRecord(portfolioData);
        if (result.success) {
            alert('Patent portföy kaydı başarıyla oluşturuldu!');
            window.location.href = 'portfolio-management.html';
        } else {
            throw new Error(result.error);
        }
    }

    async saveDesignPortfolio(portfolioData) {
        const designTitle = document.getElementById('designTitle').value.trim();
        const applicationNumber = document.getElementById('designApplicationNumber').value.trim();
        const description = document.getElementById('designDescription').value.trim();

        portfolioData.title = designTitle;
        portfolioData.details = {
            designTitle,
            applicationNumber: applicationNumber || null,
            description: description || null
        };

        const result = await ipRecordsService.createRecord(portfolioData);
        if (result.success) {
            alert('Tasarım portföy kaydı başarıyla oluşturuldu!');
            window.location.href = 'portfolio-management.html';
        } else {
            throw new Error(result.error);
        }
    }
}

// Global fonksiyonlar
window.clearNiceSearch = function() {
    const searchInput = document.getElementById('niceClassSearch');
    if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
    }
};

// Sayfa yüklendiğinde modülü başlat
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Data Entry sayfası yükleniyor...');
    
    try {
        // Önce layout'u yükle
        console.log('📐 Layout yükleniyor...');
        await loadSharedLayout();
        console.log('✅ Layout yüklendi');
        
        // Sonra data entry modülünü başlat
        console.log('📋 Data Entry Module başlatılıyor...');
        const dataEntry = new DataEntryModule();
        await dataEntry.init();
        console.log('✅ Data Entry Module başlatıldı');
        
    } catch (error) {
        console.error('❌ Sayfa yükleme hatası:', error);
    }
});

export default DataEntryModule;