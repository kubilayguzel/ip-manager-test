// data-entry.js - Basitleştirilmiş versiyon (tahakkuk olmadan)

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
        this.setupFileUpload();
        
        console.log('🎉 DataEntry modülü başarıyla başlatıldı');
    }

    setupEventListeners() {
        console.log('🔧 Event listeners kuruluyor...');
        
        // Form submit olayını dinliyoruz
        const form = document.getElementById('dataEntryForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        // Tablar arası geçiş
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
        });

        // Dinamik form olayları
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
            const applicantId = e.target.closest('button').dataset.id;
            this.removeApplicant(applicantId);
        });

        // Rüçhan silme
        $(document).on('click', '.remove-priority-btn', (e) => {
            const priorityId = e.target.closest('button').dataset.id;
            this.removePriority(priorityId);
        });
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
            console.log('✅ Dosya işlendi ve hazırlandı');
        };
    }

    async initializeNiceClassification() {
        if (this.isNiceClassificationInitialized) return;
        
        console.log('🔄 Nice Classification başlatılıyor...');
        
        try {
            await initializeNiceClassification();
            this.isNiceClassificationInitialized = true;
            console.log('✅ Nice Classification başlatıldı');
        } catch (error) {
            console.error('Nice Classification başlatılamadı:', error);
            alert('Mal ve hizmet sınıfları yüklenemedi. Lütfen sayfayı yenileyin.');
        }
    }

    showPersonSearchModal(target) {
        // Basit prompt ile geçici çözüm - sonra modal implement edilecek
        const personName = prompt('Başvuru sahibinin adını girin:');
        if (personName && personName.trim()) {
            const newApplicant = {
                id: Date.now().toString(), // Geçici ID
                name: personName.trim(),
                email: null
            };
            this.selectedApplicants.push(newApplicant);
            this.renderSelectedApplicants();
        }
    }

    showAddPriorityModal() {
        // Basit prompt ile geçici çözüm - sonra modal implement edilecek
        const priorityCountry = prompt('Rüçhan ülkesini girin:');
        const priorityNumber = prompt('Rüçhan numarasını girin:');
        const priorityDate = prompt('Rüçhan tarihini girin (YYYY-MM-DD):');
        
        if (priorityCountry && priorityNumber && priorityDate) {
            const newPriority = {
                id: Date.now().toString(), // Geçici ID
                type: 'başvuru',
                country: priorityCountry.trim(),
                number: priorityNumber.trim(),
                date: priorityDate.trim()
            };
            this.priorities.push(newPriority);
            this.renderPriorities();
        }
    }

    renderSelectedApplicants() {
        const container = document.getElementById('selectedApplicantsContainer');
        if (!container) return;

        if (this.selectedApplicants.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-plus"></i>
                    <p>Henüz başvuru sahibi seçilmedi</p>
                </div>
            `;
            return;
        }

        let html = '';
        this.selectedApplicants.forEach(applicant => {
            html += `
                <div class="selected-item">
                    <div>
                        <strong>${applicant.name}</strong>
                        ${applicant.email ? `<br><small class="text-muted">${applicant.email}</small>` : ''}
                    </div>
                    <button type="button" class="remove-item-btn remove-applicant-btn" data-id="${applicant.id}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    renderPriorities() {
        const container = document.getElementById('prioritiesContainer');
        if (!container) return;

        if (this.priorities.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-flag"></i>
                    <p>Henüz rüçhan eklenmedi</p>
                </div>
            `;
            return;
        }

        let html = '';
        this.priorities.forEach(priority => {
            html += `
                <div class="selected-item">
                    <div>
                        <strong>${priority.type === 'sergi' ? 'Sergi' : 'Başvuru'} Rüçhanı</strong>
                        <br><small>Tarih: ${priority.date} | Ülke: ${priority.country} | Numara: ${priority.number}</small>
                    </div>
                    <button type="button" class="remove-item-btn remove-priority-btn" data-id="${priority.id}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    removeApplicant(applicantId) {
        this.selectedApplicants = this.selectedApplicants.filter(a => a.id !== applicantId);
        this.renderSelectedApplicants();
        console.log('👤 Başvuru sahibi silindi:', applicantId);
    }

    removePriority(priorityId) {
        this.priorities = this.priorities.filter(p => p.id !== priorityId);
        this.renderPriorities();
        console.log('🏴 Rüçhan silindi:', priorityId);
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        console.log('📤 Form gönderiliyor...');

        // Validasyonlar
        if (!this.validateForm()) {
            return;
        }

        try {
            // Loading state
            const submitBtn = document.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Kaydediliyor...';
            submitBtn.disabled = true;

            // Form verilerini topla
            const formData = this.collectFormData();
            
            // Marka başvurusu oluştur
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
            // Loading state'i kaldır
            const submitBtn = document.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        }
    }

    validateForm() {
        // Marka yazılı ifadesi kontrolü
        const brandExampleText = document.getElementById('brandExampleText')?.value?.trim();
        if (!brandExampleText) {
            alert('❌ Lütfen marka yazılı ifadesini girin.');
            $('#dataEntryTabs a[href="#brand-info"]').tab('show');
            document.getElementById('brandExampleText')?.focus();
            return false;
        }

        // Mal ve hizmet sınıfları kontrolü
        const goodsAndServices = getSelectedNiceClasses();
        if (goodsAndServices.length === 0) {
            alert('❌ Lütfen en az bir mal veya hizmet sınıfı seçin.');
            $('#dataEntryTabs a[href="#goods-services"]').tab('show');
            return false;
        }

        // Başvuru sahibi kontrolü
        if (this.selectedApplicants.length === 0) {
            alert('❌ Lütfen en az bir başvuru sahibi seçin.');
            $('#dataEntryTabs a[href="#applicants"]').tab('show');
            return false;
        }

        console.log('✅ Form validasyonu başarılı');
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

        const title = document.getElementById('brandExampleText')?.value || 'Yeni Marka Başvurusu';
        const goodsAndServices = getSelectedNiceClasses();

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

        console.log('📋 Form verileri toplandı:', { taskData, newIpRecordData });

        return {
            taskData,
            newIpRecordData,
            accrualData: null, // Tahakkuk kısmı kaldırıldı
            brandExampleFile: this.uploadedFiles[0] || null
        };
    }
}

// DataEntryModule class'ını başlatma
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 DOM Content Loaded - DataEntry initialize ediliyor...');
    
    // Shared layout'u yükle
    await loadSharedLayout({ activeMenuLink: 'data-entry.html' });
    
    // DataEntry instance'ını oluştur ve initialize et
    const dataEntryInstance = new DataEntryModule();
    
    // Global erişim için (debugging amaçlı)
    window.dataEntryInstance = dataEntryInstance;
    
    // Initialize et
    await dataEntryInstance.init();
    
    console.log('✅ DataEntry başarıyla initialize edildi');
});