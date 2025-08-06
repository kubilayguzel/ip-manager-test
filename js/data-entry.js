// data-entry.js - Nice Classification bölümü sıfırdan yazıldı
// create-task.js'in çalışan implementasyonuna dayalı

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
        console.log('📋 DataEntry modülü başlatılıyor...');
        
        this.currentUser = authService.getCurrentUser();
        if (!this.currentUser) {
            console.error('❌ Kullanıcı oturum açmamış');
            window.location.href = 'index.html';
            return;
        }

        try {
            await loadSharedLayout();
            
            // Verileri yükle
            const [personsResult, transactionTypesResult] = await Promise.all([
                personService.getPersons(),
                transactionTypeService.getTransactionTypes()
            ]);
            
            this.allPersons = personsResult.data || [];
            this.allTransactionTypes = transactionTypesResult.data || [];
            
            // UI'yi initialize et
            this.setupEventListeners();
            this.renderTransactionTypes();
            
            // Nice Classification'ı initialize et
            this.initializeNiceClassification();
            
            console.log('✅ DataEntry modülü başarıyla başlatıldı');
            
        } catch (error) {
            console.error("❌ DataEntry başlatılamadı:", error);
            alert("Uygulama başlatılamadı: " + error.message);
        }
    }

    // NICE CLASSIFICATION İNİTİALİZATION - create-task.js'ten uyarlandı
    async initializeNiceClassification() {
        console.log('🔄 Nice Classification başlatılıyor...');
        
        try {
            // Nice classification'ı başlat
            await initializeNiceClassification();
            this.isNiceClassificationInitialized = true;
            
            // Global clearNiceSearch fonksiyonu
            window.clearNiceSearch = function() {
                const searchInput = document.getElementById('niceClassSearch');
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input'));
                }
            };
            
            console.log('✅ Nice Classification başarıyla başlatıldı');
            
        } catch (error) {
            console.error('❌ Nice Classification başlatılamadı:', error);
            const container = document.getElementById('niceClassificationList');
            if (container) {
                container.innerHTML = `
                    <div class="text-center text-danger p-4">
                        <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                        <p>Nice Classification yüklenemedi</p>
                        <small>Hata: ${error.message}</small>
                        <br><button class="btn btn-sm btn-primary mt-2" onclick="location.reload()">Sayfayı Yenile</button>
                    </div>
                `;
            }
        }
    }

    setupEventListeners() {
        console.log('🔧 Event listeners kuruluyor...');
        
        // Tab değişiklikleri
        $('.nav-link[data-toggle="tab"]').on('shown.bs.tab', (e) => {
            const targetTabId = e.target.getAttribute('aria-controls');
            this.activeTab = targetTabId;
            
            console.log('📂 Tab değişti:', targetTabId);
            
            if (targetTabId === 'goods-services' && !this.isNiceClassificationInitialized) {
                this.initializeNiceClassification();
            }
        });

        // Form submit
        $(document).on('click', '#saveTaskBtn', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });
        
        console.log('✅ Ana event listeners kuruldu');
    }

    renderTransactionTypes() {
        const transactionTypeSelect = document.getElementById('specificTaskType');
        if (!transactionTypeSelect) return;
        
        const trademarkTypes = this.allTransactionTypes.filter(t => t.ipType === 'trademark');
        
        transactionTypeSelect.innerHTML = '<option value="">Seçiniz...</option>';
        trademarkTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.name;
            transactionTypeSelect.appendChild(option);
        });
    }

    async handleFormSubmit() {
        console.log('💾 Form submit işlemi başlıyor...');
        
        try {
            const selectedTransactionTypeId = document.getElementById('specificTaskType')?.value;
            if (!selectedTransactionTypeId) {
                alert('Lütfen işlem tipini seçin.');
                return;
            }
            
            const selectedTransactionType = this.allTransactionTypes.find(t => t.id === selectedTransactionTypeId);
            if (!selectedTransactionType) {
                alert('Seçilen işlem tipi bulunamadı.');
                return;
            }

            // Marka başvuru işlemi kontrolü
            if (selectedTransactionType.alias === 'Başvuru' && selectedTransactionType.ipType === 'trademark') {
                const goodsAndServices = getSelectedNiceClasses();
                console.log('🎯 Seçilen sınıflar:', goodsAndServices);
                
                if (goodsAndServices.length === 0) {
                    alert('Lütfen en az bir mal veya hizmet sınıfı seçin.');
                    
                    // Goods-services tab'ına geç
                    const goodsServicesTab = document.querySelector('a[href="#goods-services"]');
                    if (goodsServicesTab) {
                        $(goodsServicesTab).tab('show');
                    }
                    return;
                }

                if (this.selectedApplicants.length === 0) {
                    alert('Lütfen en az bir başvuru sahibi seçin.');
                    return;
                }
                
                // Form verilerini hazırla
                const taskData = {
                    taskType: selectedTransactionType.id,
                    title: document.getElementById('brandExampleText')?.value || selectedTransactionType.alias,
                    description: `'${document.getElementById('brandExampleText')?.value || 'Yeni Başvuru'}' adlı marka için ${selectedTransactionType.alias} işlemi.`,
                    priority: document.getElementById('taskPriority')?.value || 'medium',
                    assignedTo_uid: null,
                    assignedTo_email: null,
                    dueDate: document.getElementById('taskDueDate')?.value || null,
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
                        priorities: this.priorities,
                        tpInvoiceParty: this.selectedTpInvoiceParty,
                        serviceInvoiceParty: this.selectedServiceInvoiceParty,
                        relatedParty: this.selectedRelatedParty
                    }
                };

                const formData = {
                    taskData,
                    newIpRecordData,
                    accrualData: null,
                    brandExampleFile: null
                };

                // Başvuruyu oluştur
                const result = await createTrademarkApplication(formData);
                
                if (result.success) {
                    console.log('✅ Başvuru başarıyla oluşturuldu:', result);
                    alert('Marka başvurusu başarıyla oluşturuldu!');
                    
                    // Formu sıfırla
                    this.resetForm();
                    
                } else {
                    console.error('❌ Başvuru oluşturulamadı:', result.error);
                    alert('Başvuru oluşturulurken hata oluştu: ' + result.error);
                }
            } else {
                alert('Sadece marka başvuru işlemleri desteklenmektedir.');
            }
            
        } catch (error) {
            console.error('❌ Form submit hatası:', error);
            alert('Form gönderilirken hata oluştu: ' + error.message);
        }
    }

    resetForm() {
        // Form alanlarını sıfırla
        const form = document.querySelector('form');
        if (form) {
            form.reset();
        }
        
        // Seçimleri sıfırla
        this.selectedApplicants = [];
        this.priorities = [];
        this.selectedTpInvoiceParty = null;
        this.selectedServiceInvoiceParty = null;
        this.selectedRelatedParty = null;
        this.selectedIpRecord = null;
        
        // Nice sınıflarını temizle
        if (window.clearAllSelectedClasses) {
            window.clearAllSelectedClasses();
        }
        
        // İlk tab'a dön
        const firstTab = document.querySelector('.nav-link[data-toggle="tab"]');
        if (firstTab) {
            $(firstTab).tab('show');
        }
        
        console.log('✅ Form sıfırlandı');
    }

    // PERSON SELECTİON METHODS (create-task.js pattern'i)
    searchPersons(query, type) {
        console.log(`🔍 ${type} aranıyor:`, query);
        
        if (query.length < 2) {
            this.hidePersonSearchResults(type);
            return;
        }
        
        const filtered = this.allPersons.filter(person => 
            person.name.toLowerCase().includes(query.toLowerCase()) ||
            (person.email && person.email.toLowerCase().includes(query.toLowerCase()))
        );
        
        this.showPersonSearchResults(filtered, type);
    }

    showPersonSearchResults(persons, type) {
        const resultsContainer = document.getElementById(`${type}SearchResults`);
        if (!resultsContainer) return;
        
        if (persons.length === 0) {
            resultsContainer.innerHTML = '<div class="search-result-item">Sonuç bulunamadı</div>';
        } else {
            resultsContainer.innerHTML = persons.slice(0, 10).map(person => `
                <div class="search-result-item" data-person-id="${person.id}" data-type="${type}">
                    <div class="result-name">${person.name}</div>
                    <div class="result-details">${person.email || 'Email yok'} • ${person.phone || 'Telefon yok'}</div>
                </div>
            `).join('');
        }
        
        resultsContainer.style.display = 'block';
    }

    hidePersonSearchResults(type) {
        const resultsContainer = document.getElementById(`${type}SearchResults`);
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
        }
    }

    selectPerson(personId, type) {
        const person = this.allPersons.find(p => p.id === personId);
        if (!person) return;
        
        console.log(`👤 ${type} seçildi:`, person);
        
        switch (type) {
            case 'applicant':
                if (!this.selectedApplicants.find(a => a.id === personId)) {
                    this.selectedApplicants.push(person);
                    this.renderSelectedApplicants();
                }
                break;
            case 'tpInvoiceParty':
                this.selectedTpInvoiceParty = person;
                this.renderSelectedTpInvoiceParty();
                break;
            case 'serviceInvoiceParty':
                this.selectedServiceInvoiceParty = person;
                this.renderSelectedServiceInvoiceParty();
                break;
            case 'relatedParty':
                this.selectedRelatedParty = person;
                this.renderSelectedRelatedParty();
                break;
        }
        
        this.hidePersonSearchResults(type);
        
        const searchInput = document.getElementById(`${type}SearchInput`);
        if (searchInput) {
            searchInput.value = '';
        }
    }

    removeSelectedPerson(personId, type) {
        console.log(`🗑️ ${type} kaldırılıyor:`, personId);
        
        switch (type) {
            case 'applicant':
                this.selectedApplicants = this.selectedApplicants.filter(a => a.id !== personId);
                this.renderSelectedApplicants();
                break;
            case 'tpInvoiceParty':
                this.selectedTpInvoiceParty = null;
                this.renderSelectedTpInvoiceParty();
                break;
            case 'serviceInvoiceParty':
                this.selectedServiceInvoiceParty = null;
                this.renderSelectedServiceInvoiceParty();
                break;
            case 'relatedParty':
                this.selectedRelatedParty = null;
                this.renderSelectedRelatedParty();
                break;
        }
    }

    // RENDER METHODS
    renderSelectedApplicants() {
        const container = document.getElementById('selectedApplicants');
        if (!container) return;
        
        if (this.selectedApplicants.length === 0) {
            container.innerHTML = '<div class="text-muted">Henüz başvuru sahibi seçilmedi</div>';
            return;
        }
        
        container.innerHTML = this.selectedApplicants.map(applicant => `
            <div class="selected-person-item">
                <div class="person-info">
                    <strong>${applicant.name}</strong>
                    <br><small>${applicant.email || 'Email yok'} • ${applicant.phone || 'Telefon yok'}</small>
                </div>
                <button class="remove-person-btn" data-person-id="${applicant.id}" data-type="applicant">×</button>
            </div>
        `).join('');
    }

    renderSelectedTpInvoiceParty() {
        const container = document.getElementById('selectedTpInvoiceParty');
        if (!container) return;
        
        if (!this.selectedTpInvoiceParty) {
            container.innerHTML = '<div class="text-muted">Henüz TP fatura tarafı seçilmedi</div>';
            return;
        }
        
        container.innerHTML = `
            <div class="selected-person-item">
                <div class="person-info">
                    <strong>${this.selectedTpInvoiceParty.name}</strong>
                    <br><small>${this.selectedTpInvoiceParty.email || 'Email yok'}</small>
                </div>
                <button class="remove-person-btn" data-person-id="${this.selectedTpInvoiceParty.id}" data-type="tpInvoiceParty">×</button>
            </div>
        `;
    }

    renderSelectedServiceInvoiceParty() {
        const container = document.getElementById('selectedServiceInvoiceParty');
        if (!container) return;
        
        if (!this.selectedServiceInvoiceParty) {
            container.innerHTML = '<div class="text-muted">Henüz hizmet fatura tarafı seçilmedi</div>';
            return;
        }
        
        container.innerHTML = `
            <div class="selected-person-item">
                <div class="person-info">
                    <strong>${this.selectedServiceInvoiceParty.name}</strong>
                    <br><small>${this.selectedServiceInvoiceParty.email || 'Email yok'}</small>
                </div>
                <button class="remove-person-btn" data-person-id="${this.selectedServiceInvoiceParty.id}" data-type="serviceInvoiceParty">×</button>
            </div>
        `;
    }

    renderSelectedRelatedParty() {
        const container = document.getElementById('selectedRelatedParty');
        if (!container) return;
        
        if (!this.selectedRelatedParty) {
            container.innerHTML = '<div class="text-muted">Henüz ilgili taraf seçilmedi</div>';
            return;
        }
        
        container.innerHTML = `
            <div class="selected-person-item">
                <div class="person-info">
                    <strong>${this.selectedRelatedParty.name}</strong>
                    <br><small>${this.selectedRelatedParty.email || 'Email yok'}</small>
                </div>
                <button class="remove-person-btn" data-person-id="${this.selectedRelatedParty.id}" data-type="relatedParty">×</button>
            </div>
        `;
    }
}

// GLOBAL INSTANCE
window.dataEntryInstance = null;

// DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DataEntry DOM yüklendi, modül başlatılıyor...');
    
    window.dataEntryInstance = new DataEntryModule();
    window.dataEntryInstance.init().catch(error => {
        console.error('❌ DataEntry başlatılamadı:', error);
        alert('Uygulama başlatılamadı. Lütfen sayfayı yenileyin.');
    });
});

// Event delegation for dynamic elements
document.addEventListener('click', (e) => {
    const target = e.target;
    
    // Person search result selection
    if (target.classList.contains('search-result-item') || target.closest('.search-result-item')) {
        const item = target.closest('.search-result-item');
        if (item && window.dataEntryInstance) {
            const personId = item.dataset.personId;
            const type = item.dataset.type;
            window.dataEntryInstance.selectPerson(personId, type);
        }
    }
    
    // Remove selected person
    if (target.classList.contains('remove-person-btn')) {
        if (window.dataEntryInstance) {
            const personId = target.dataset.personId;
            const type = target.dataset.type;
            window.dataEntryInstance.removeSelectedPerson(personId, type);
        }
    }
});

// Input delegation for search
document.addEventListener('input', (e) => {
    const target = e.target;
    
    // Person search inputs
    if (target.id && target.id.includes('SearchInput') && window.dataEntryInstance) {
        const type = target.id.replace('SearchInput', '').toLowerCase();
        window.dataEntryInstance.searchPersons(target.value, type);
    }
});

console.log('✅ DataEntry modülü yüklendi');