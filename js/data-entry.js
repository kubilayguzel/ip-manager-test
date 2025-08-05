// data-entry.js - Düzeltilmiş ve genişletilmiş versiyon

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
        console.log('📋 DataEntry modülü başlatılıyor...');
        
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
            
            console.log('✅ Veriler yüklendi:', {
                persons: this.allPersons.length,
                transactionTypes: this.allTransactionTypes.length
            });
        } catch (error) {
            console.error("Veri yüklenirken hata oluştu:", error);
            alert("Gerekli veriler yüklenemedi, lütfen sayfayı yenileyin.");
            return;
        }

        this.setupEventListeners();
        this.setupInitialForm();
        this.setupFileUpload();
        
        console.log('🎉 DataEntry modülü başarıyla başlatıldı');
    }

    setupInitialForm() {
        // İlk tab'ı aktif yap
        this.activeTab = 'brand-info';
        
        // Toplam tutarı hesapla
        this.calculateTotalAmount();
    }

    setupEventListeners() {
        console.log('🔧 Event listeners kuruluyor...');
        
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
            console.log('📑 Tab değişti:', targetTabId);
            
            if (targetTabId === 'goods-services' && !this.isNiceClassificationInitialized) {
                this.initializeNiceClassification();
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
        
        console.log('✅ Event listeners kuruldu');
    }

    setupDynamicFormListeners() {
        // Başvuru sahibi ekleme butonu
        $(document).on('click', '#addApplicantBtn', () => {
            this.showPersonSearchModal('applicant');
        });

        // Rüçhan ekleme butonu
        $(document).on('click', '#addPriorityBtn', () => {
            this.showAddPriorityModal();
        });

        // Seçilen başvuru sahiplerini silme
        $(document).on('click', '.remove-applicant-btn', (e) => {
            const applicantId = e.target.dataset.id;
            this.removeApplicant(applicantId);
        });

        // Rüçhan silme
        $(document).on('click', '.remove-priority-btn', (e) => {
            const priorityId = e.target.dataset.id;
            this.removePriority(priorityId);
        });
    }

    setupAccrualTabListeners() {
        // Ücret hesaplama için event listener'lar
        const feeInputs = ['officialFee', 'serviceFee', 'vatRate'];
        feeInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => this.calculateTotalAmount());
            }
        });

        const vatCheckbox = document.getElementById('applyVatToOfficialFee');
        if (vatCheckbox) {
            vatCheckbox.addEventListener('change', () => this.calculateTotalAmount());
        }
    }

    setupFileUpload() {
        const dropZone = document.getElementById('brand-example-drop-zone');
        const fileInput = document.getElementById('brandExample');

        if (dropZone && fileInput) {
            // Click to upload
            dropZone.addEventListener('click', () => fileInput.click());

            // File input change
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.handleBrandExampleFile(file);
            });

            // Drag & drop
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
            alert('Lütfen geçerli bir resim dosyası seçin.');
            return;
        }

        console.log('🖼️ Dosya işleniyor:', file.name);

        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = async () => {
            // Resmi 591x591 boyutuna ayarla
            const canvas = document.createElement('canvas');
            canvas.width = 591;
            canvas.height = 591;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 591, 591);
            
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
            const newFile = new File([blob], 'brand-example.jpg', { type: 'image/jpeg' });
            
            // Önizleme göster
            const previewImage = document.getElementById('brandExamplePreview');
            const previewContainer = document.getElementById('brandExamplePreviewContainer');
            if (previewImage && previewContainer) {
                previewImage.src = URL.createObjectURL(blob);
                previewContainer.style.display = 'block';
            }
            
            this.uploadedFiles = [newFile];
            console.log('✅ Dosya hazırlandı');
        };
    }

    async initializeNiceClassification() {
        if (this.isNiceClassificationInitialized) return;
        
        console.log('🏷️ Nice Classification başlatılıyor...');
        
        try {
            await initializeNiceClassification();
            this.isNiceClassificationInitialized = true;
            console.log('✅ Nice Classification başlatıldı');
        } catch (error) {
            console.error('Nice Classification başlatılamadı:', error);
        }
    }

    showPersonSearchModal(target) {
        // Kişi arama modalını göster
        console.log('👤 Kişi seçim modalı açılıyor:', target);
        
        // Modal HTML'ini oluştur
        const modalHtml = `
            <div class="modal fade" id="personSearchModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Kişi Seç</h5>
                            <button type="button" class="close" data-dismiss="modal">
                                <span>&times;</span>
                            </button>
                        </div>
                        <div class="modal-body">
                            <div class="form-group">
                                <input type="text" class="form-control" id="personSearchInput" 
                                       placeholder="Kişi adı yazın...">
                            </div>
                            <div id="personSearchResults" class="border rounded p-3" style="max-height: 300px; overflow-y: auto;">
                                <p class="text-muted text-center">Arama yapmak için yukarıya yazın</p>
                            </div>
                            <hr>
                            <button type="button" class="btn btn-success" id="addNewPersonBtn">
                                <i class="fas fa-plus mr-2"></i>Yeni Kişi Ekle
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Modalı DOM'a ekle
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Event listener'ları kur
        const modal = document.getElementById('personSearchModal');
        const searchInput = document.getElementById('personSearchInput');
        
        searchInput.addEventListener('input', (e) => {
            this.searchPersons(e.target.value, target);
        });
        
        document.getElementById('addNewPersonBtn').addEventListener('click', () => {
            $(modal).modal('hide');
            this.showAddPersonModal(target);
        });
        
        // Modal kapandığında temizle
        $(modal).on('hidden.bs.modal', () => {
            modal.remove();
        });
        
        // Modalı göster
        $(modal).modal('show');
        
        // İlk yüklemede tüm kişileri göster
        this.searchPersons('', target);
    }

    searchPersons(query, target) {
        const resultsContainer = document.getElementById('personSearchResults');
        if (!resultsContainer) return;
        
        const filteredPersons = this.allPersons.filter(person => 
            person.name.toLowerCase().includes(query.toLowerCase())
        );
        
        if (filteredPersons.length === 0) {
            resultsContainer.innerHTML = '<p class="text-muted text-center">Kişi bulunamadı</p>';
            return;
        }
        
        const html = filteredPersons.map(person => `
            <div class="search-result-item p-2 border-bottom" data-id="${person.id}">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${person.name}</strong>
                        <br><small class="text-muted">${person.email || 'E-posta yok'}</small>
                    </div>
                    <button type="button" class="btn btn-sm btn-primary select-person-btn" 
                            data-id="${person.id}" data-target="${target}">
                        Seç
                    </button>
                </div>
            </div>
        `).join('');
        
        resultsContainer.innerHTML = html;
        
        // Seçim butonları için event listener
        resultsContainer.querySelectorAll('.select-person-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const personId = e.target.dataset.id;
                const person = this.allPersons.find(p => p.id === personId);
                if (person) {
                    if (target === 'applicant') {
                        this.addApplicant(person);
                    }
                    document.getElementById('personSearchModal').remove();
                }
            });
        });
    }

    addApplicant(person) {
        // Zaten ekli mi kontrol et
        if (this.selectedApplicants.find(a => a.id === person.id)) {
            alert('Bu kişi zaten başvuru sahibi olarak ekli.');
            return;
        }
        
        this.selectedApplicants.push(person);
        this.renderSelectedApplicants();
        console.log('👤 Başvuru sahibi eklendi:', person.name);
    }

    removeApplicant(applicantId) {
        this.selectedApplicants = this.selectedApplicants.filter(a => a.id !== applicantId);
        this.renderSelectedApplicants();
        console.log('👤 Başvuru sahibi kaldırıldı:', applicantId);
    }

    renderSelectedApplicants() {
        const container = document.getElementById('selectedApplicantsContainer');
        if (!container) return;
        
        if (this.selectedApplicants.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">Henüz başvuru sahibi seçilmedi</p>';
            return;
        }
        
        const html = this.selectedApplicants.map(applicant => `
            <div class="selected-item d-flex justify-content-between align-items-center p-2 mb-2 bg-light rounded">
                <div>
                    <strong>${applicant.name}</strong>
                    <br><small class="text-muted">${applicant.email || 'E-posta yok'}</small>
                </div>
                <button type="button" class="btn btn-sm btn-danger remove-applicant-btn" data-id="${applicant.id}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `).join('');
        
        container.innerHTML = html;
    }

    showAddPriorityModal() {
        // Rüçhan ekleme modalı
        const modalHtml = `
            <div class="modal fade" id="addPriorityModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Rüçhan Ekle</h5>
                            <button type="button" class="close" data-dismiss="modal">
                                <span>&times;</span>
                            </button>
                        </div>
                        <div class="modal-body">
                            <form id="priorityForm">
                                <div class="form-group">
                                    <label for="priorityType">Rüçhan Türü</label>
                                    <select class="form-control" id="priorityType" required>
                                        <option value="ruchan">Rüçhan</option>
                                        <option value="sergi">Sergi</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="priorityDate" id="priorityDateLabel">Rüçhan Tarihi</label>
                                    <input type="date" class="form-control" id="priorityDate" required>
                                </div>
                                <div class="form-group">
                                    <label for="priorityCountry">Ülke</label>
                                    <input type="text" class="form-control" id="priorityCountry" required>
                                </div>
                                <div class="form-group">
                                    <label for="priorityNumber">Başvuru Numarası</label>
                                    <input type="text" class="form-control" id="priorityNumber" required>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">İptal</button>
                            <button type="button" class="btn btn-primary" id="savePriorityBtn">Kaydet</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const modal = document.getElementById('addPriorityModal');
        
        // Event listeners
        document.getElementById('priorityType').addEventListener('change', (e) => {
            const label = document.getElementById('priorityDateLabel');
            label.textContent = e.target.value === 'sergi' ? 'Sergi Tarihi' : 'Rüçhan Tarihi';
        });
        
        document.getElementById('savePriorityBtn').addEventListener('click', () => {
            this.savePriority();
        });
        
        $(modal).on('hidden.bs.modal', () => {
            modal.remove();
        });
        
        $(modal).modal('show');
    }

    savePriority() {
        const form = document.getElementById('priorityForm');
        const formData = new FormData(form);
        
        const priority = {
            id: Date.now().toString(),
            type: document.getElementById('priorityType').value,
            date: document.getElementById('priorityDate').value,
            country: document.getElementById('priorityCountry').value,
            number: document.getElementById('priorityNumber').value
        };
        
        // Validation
        if (!priority.date || !priority.country || !priority.number) {
            alert('Lütfen tüm alanları doldurun.');
            return;
        }
        
        this.priorities.push(priority);
        this.renderPriorities();
        document.getElementById('addPriorityModal').remove();
        
        console.log('🏁 Rüçhan eklendi:', priority);
    }

    removePriority(priorityId) {
        this.priorities = this.priorities.filter(p => p.id !== priorityId);
        this.renderPriorities();
        console.log('🏁 Rüçhan kaldırıldı:', priorityId);
    }

    renderPriorities() {
        const container = document.getElementById('prioritiesContainer');
        if (!container) return;
        
        if (this.priorities.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">Henüz rüçhan eklenmedi</p>';
            return;
        }
        
        const html = this.priorities.map(priority => `
            <div class="selected-item d-flex justify-content-between align-items-center p-2 mb-2 bg-light rounded">
                <div>
                    <strong>${priority.type === 'sergi' ? 'Sergi' : 'Rüçhan'}</strong> |
                    <strong>Tarih:</strong> ${priority.date} |
                    <strong>Ülke:</strong> ${priority.country} |
                    <strong>Numara:</strong> ${priority.number}
                </div>
                <button type="button" class="btn btn-sm btn-danger remove-priority-btn" data-id="${priority.id}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `).join('');
        
        container.innerHTML = html;
    }

    calculateTotalAmount() {
        const officialFee = parseFloat(document.getElementById('officialFee')?.value) || 0;
        const serviceFee = parseFloat(document.getElementById('serviceFee')?.value) || 0;
        const vatRate = parseFloat(document.getElementById('vatRate')?.value) || 0;
        const applyVatToOfficial = document.getElementById('applyVatToOfficialFee')?.checked || false;
        
        let totalAmount;
        if (applyVatToOfficial) {
            totalAmount = (officialFee + serviceFee) * (1 + vatRate / 100);
        } else {
            totalAmount = officialFee + (serviceFee * (1 + vatRate / 100));
        }
        
        const displayElement = document.getElementById('totalAmountDisplay');
        if (displayElement) {
            displayElement.textContent = `${totalAmount.toFixed(2)} TRY`;
        }
    }

    showAddPersonModal(target) {
        // Yeni kişi ekleme modalı
        const modalHtml = `
            <div class="modal fade" id="addPersonModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Yeni Kişi Ekle</h5>
                            <button type="button" class="close" data-dismiss="modal">
                                <span>&times;</span>
                            </button>
                        </div>
                        <div class="modal-body">
                            <form id="personForm">
                                <div class="form-group">
                                    <label for="personName">Ad Soyad / Şirket Adı *</label>
                                    <input type="text" class="form-control" id="personName" required>
                                </div>
                                <div class="form-group">
                                    <label for="personType">Kişi Türü *</label>
                                    <select class="form-control" id="personType" required>
                                        <option value="private">Gerçek Kişi</option>
                                        <option value="legal">Tüzel Kişi</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="personEmail">E-posta</label>
                                    <input type="email" class="form-control" id="personEmail">
                                </div>
                                <div class="form-group">
                                    <label for="personPhone">Telefon</label>
                                    <input type="tel" class="form-control" id="personPhone">
                                </div>
                                <div class="form-group">
                                    <label for="personAddress">Adres</label>
                                    <textarea class="form-control" id="personAddress" rows="3"></textarea>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">İptal</button>
                            <button type="button" class="btn btn-primary" id="savePersonBtn">Kaydet</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const modal = document.getElementById('addPersonModal');
        modal.dataset.target = target;
        
        document.getElementById('savePersonBtn').addEventListener('click', () => {
            this.saveNewPerson();
        });
        
        $(modal).on('hidden.bs.modal', () => {
            modal.remove();
        });
        
        $(modal).modal('show');
    }

    async saveNewPerson() {
        const modal = document.getElementById('addPersonModal');
        const target = modal.dataset.target;
        
        const personData = {
            name: document.getElementById('personName').value.trim(),
            type: document.getElementById('personType').value,
            email: document.getElementById('personEmail').value.trim(),
            phone: document.getElementById('personPhone').value.trim(),
            address: document.getElementById('personAddress').value.trim()
        };
        
        if (!personData.name || !personData.type) {
            alert('Ad Soyad ve Kişi Türü zorunludur.');
            return;
        }
        
        try {
            const result = await personService.addPerson(personData);
            if (result.success) {
                alert('Yeni kişi başarıyla eklendi.');
                this.allPersons.push(result.data);
                
                if (target === 'applicant') {
                    this.addApplicant(result.data);
                }
                
                modal.remove();
            } else {
                alert('Hata: ' + result.error);
            }
        } catch (error) {
            console.error('Kişi kaydetme hatası:', error);
            alert('Kişi kaydedilirken beklenmeyen bir hata oluştu.');
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        
        console.log('📤 Form gönderiliyor...');
        
        // Validation
        if (!this.validateForm()) {
            return;
        }
        
        // Loading göster
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Kaydediliyor...';
        submitBtn.disabled = true;
        
        try {
            const formData = this.collectFormData();
            const result = await createTrademarkApplication(formData);
            
            if (result.success) {
                alert('Portföye marka kaydı başarıyla yapıldı!');
                window.location.href = 'portfolio.html';
            } else {
                alert('Portföy kaydı sırasında bir hata oluştu: ' + result.error);
            }
        } catch (error) {
            console.error('Form gönderme hatası:', error);
            alert('Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    validateForm() {
        // Marka metni zorunlu
        const brandText = document.getElementById('brandExampleText')?.value.trim();
        if (!brandText) {
            alert('Lütfen marka yazılı ifadesini girin.');
            // İlgili tab'a geç
            $('a[href="#brand-info"]').tab('show');
            document.getElementById('brandExampleText').focus();
            return false;
        }
        
        // Mal/hizmet sınıfı seçimi zorunlu
        const goodsAndServices = getSelectedNiceClasses();
        if (goodsAndServices.length === 0) {
            alert('Lütfen en az bir mal veya hizmet sınıfı seçin.');
            $('a[href="#goods-services"]').tab('show');
            return false;
        }
        
        // Başvuru sahibi zorunlu
        if (this.selectedApplicants.length === 0) {
            alert('Lütfen en az bir başvuru sahibi seçin.');
            $('a[href="#applicants"]').tab('show');
            return false;
        }
        
        return true;
    }

    collectFormData() {
        // Transaction Type bilgisini al
        const selectedTransactionType = this.allTransactionTypes.find(
            type => type.alias === 'Başvuru' && type.ipType === 'trademark'
        );
        
        if (!selectedTransactionType) {
            throw new Error('Marka başvuru işlem tipi bulunamadı.');
        }
        
        const goodsAndServices = getSelectedNiceClasses();
        const title = document.getElementById('brandExampleText')?.value.trim();
        
        // 1. Task verilerini toplama
        const taskData = {
            taskType: selectedTransactionType.id,
            title: title,
            description: `'${title}' adlı marka için ${selectedTransactionType.alias} işlemi.`,
            priority: 'medium',
            assignedTo_uid: this.currentUser.uid,
            assignedTo_email: this.currentUser.email,
            dueDate: null,
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
                    brandExampleText: title,
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
                officialFee: { 
                    amount: officialFee, 
                    currency: document.getElementById('officialFeeCurrency')?.value || 'TRY'
                },
                serviceFee: { 
                    amount: serviceFee, 
                    currency: document.getElementById('serviceFeeCurrency')?.value || 'TRY'
                },
                vatRate,
                applyVatToOfficialFee: applyVatToOfficial,
                totalAmount,
                totalAmountCurrency: 'TRY',
                tpInvoiceParty: this.selectedTpInvoiceParty ? {
                    id: this.selectedTpInvoiceParty.id,
                    name: this.selectedTpInvoiceParty.name
                } : null,
                serviceInvoiceParty: this.selectedServiceInvoiceParty ? {
                    id: this.selectedServiceInvoiceParty.id,
                    name: this.selectedServiceInvoiceParty.name
                } : null,
                status: 'unpaid',
                createdAt: new Date().toISOString()
            };
        }
        
        return {
            taskData,
            newIpRecordData,
            accrualData,
            brandExampleFile: this.uploadedFiles[0] || null
        };
    }
}

// DataEntryModule class'ını başlatma
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 DOM Content Loaded - DataEntry initialize ediliyor...');
    
    try {
        // Shared layout'u yükle
        await loadSharedLayout({ activeMenuLink: 'data-entry.html' });
        
        const dataEntryInstance = new DataEntryModule();
        window.dataEntryInstance = dataEntryInstance; // Debugging için
        
        await dataEntryInstance.init();
        
        console.log('✅ DataEntry başarıyla initialize edildi');
    } catch (error) {
        console.error('❌ DataEntry initialize hatası:', error);
        alert('Sayfa yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.');
    }
});