// data-entry.js - Tüm sorunlar düzeltildi

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
            
            // UI'yi initialize et
            this.setupEventListeners();
            this.renderTransactionTypes();
            this.setupPersonSearchListeners();
            
            // İlk render'lar
            this.renderSelectedApplicants();
            this.renderSelectedTpInvoiceParty();
            this.renderSelectedServiceInvoiceParty();
            this.renderSelectedRelatedParty();
            
            console.log('✅ DataEntry modülü başarıyla başlatıldı');
            
        } catch (error) {
            console.error("❌ DataEntry başlatılamadı:", error);
            alert("Uygulama başlatılamadı: " + error.message);
        }
    }

    setupEventListeners() {
        console.log('🔧 Event listeners kuruluyor...');
        
        // Tab değişiklikleri
        $('.nav-link[data-toggle="tab"]').on('shown.bs.tab', (e) => {
            const targetTabId = e.target.getAttribute('aria-controls');
            this.activeTab = targetTabId;
            
            console.log('📂 Tab değişti:', targetTabId);
            
            // Nice classification'ı sadece goods-services tab'ında başlat
            if (targetTabId === 'goods-services' && !this.isNiceClassificationInitialized) {
                setTimeout(() => {
                    this.initializeNiceClassification();
                }, 100);
            }
            
            // Summary tab'ına geçildiğinde özeti güncelle
            if (targetTabId === 'summary') {
                this.updateSummary();
            }
        });

        // Form submit
        $(document).on('click', '#saveTaskBtn', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });
        
        console.log('✅ Ana event listeners kuruldu');
    }

    // PERSON SEARCH EVENT LISTENERS
    setupPersonSearchListeners() {
        console.log('🔍 Person search listeners kuruluyor...');

        // Search input event listeners
        const searchTypes = ['applicant', 'tpInvoiceParty', 'serviceInvoiceParty', 'relatedParty'];
        
        searchTypes.forEach(type => {
            const searchInput = document.getElementById(`${type}SearchInput`);
            if (searchInput) {
                // Input event
                searchInput.addEventListener('input', (e) => {
                    this.searchPersons(e.target.value, type);
                });
                
                // Focus event - show results if there's a value
                searchInput.addEventListener('focus', (e) => {
                    if (e.target.value.trim().length >= 2) {
                        this.searchPersons(e.target.value, type);
                    }
                });
                
                // Blur event - hide results after a delay
                searchInput.addEventListener('blur', (e) => {
                    setTimeout(() => {
                        this.hidePersonSearchResults(type);
                    }, 200);
                });
                
                console.log(`✅ ${type} search listener eklendi`);
            }
        });
    }

    // NICE CLASSIFICATION İNİTİALİZATION
    async initializeNiceClassification() {
        if (this.isNiceClassificationInitialized) {
            console.log('⚠️ Nice Classification zaten initialize edilmiş');
            return;
        }

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

    renderTransactionTypes() {
        const transactionTypeSelect = document.getElementById('specificTaskType');
        if (!transactionTypeSelect) {
            console.error('❌ specificTaskType select elementi bulunamadı');
            return;
        }
        
        const trademarkTypes = this.allTransactionTypes.filter(t => t.ipType === 'trademark');
        
        transactionTypeSelect.innerHTML = '<option value="">Seçiniz...</option>';
        trademarkTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.name || type.alias;
            transactionTypeSelect.appendChild(option);
        });
        
        console.log('✅ Transaction types render edildi:', trademarkTypes.length);
    }

    // PERSON SEARCH METHODS
    searchPersons(query, type) {
        console.log(`🔍 ${type} aranıyor:`, query);
        
        if (query.length < 2) {
            this.hidePersonSearchResults(type);
            return;
        }
        
        const filtered = this.allPersons.filter(person => 
            person.name.toLowerCase().includes(query.toLowerCase()) ||
            (person.email && person.email.toLowerCase().includes(query.toLowerCase())) ||
            (person.phone && person.phone.includes(query))
        );
        
        this.showPersonSearchResults(filtered, type);
    }

    showPersonSearchResults(persons, type) {
        const resultsContainer = document.getElementById(`${type}SearchResults`);
        if (!resultsContainer) {
            console.error(`❌ ${type}SearchResults container bulunamadı`);
            return;
        }
        
        if (persons.length === 0) {
            resultsContainer.innerHTML = '<div class="search-result-item text-muted">Sonuç bulunamadı</div>';
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
        if (!person) {
            console.error(`❌ Person bulunamadı: ${personId}`);
            return;
        }
        
        console.log(`👤 ${type} seçildi:`, person);
        
        switch (type) {
            case 'applicant':
                if (!this.selectedApplicants.find(a => a.id === personId)) {
                    this.selectedApplicants.push(person);
                    this.renderSelectedApplicants();
                    console.log('✅ Applicant eklendi, toplam:', this.selectedApplicants.length);
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
        if (!container) {
            console.error('❌ selectedApplicants container bulunamadı');
            return;
        }
        
        if (this.selectedApplicants.length === 0) {
            container.innerHTML = '<div class="text-muted">Henüz başvuru sahibi seçilmedi</div>';
            return;
        }
        
        container.innerHTML = this.selectedApplicants.map(applicant => `
            <div class="selected-person-item">
                <div class="person-info">
                    <strong>${applicant.name}</strong>
                    <br><small class="text-muted">${applicant.email || 'Email yok'} • ${applicant.phone || 'Telefon yok'}</small>
                </div>
                <button class="remove-person-btn" data-person-id="${applicant.id}" data-type="applicant" title="Kaldır">×</button>
            </div>
        `).join('');
        
        console.log('✅ Selected applicants render edildi:', this.selectedApplicants.length);
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
                    <br><small class="text-muted">${this.selectedTpInvoiceParty.email || 'Email yok'}</small>
                </div>
                <button class="remove-person-btn" data-person-id="${this.selectedTpInvoiceParty.id}" data-type="tpInvoiceParty" title="Kaldır">×</button>
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
                    <br><small class="text-muted">${this.selectedServiceInvoiceParty.email || 'Email yok'}</small>
                </div>
                <button class="remove-person-btn" data-person-id="${this.selectedServiceInvoiceParty.id}" data-type="serviceInvoiceParty" title="Kaldır">×</button>
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
                    <br><small class="text-muted">${this.selectedRelatedParty.email || 'Email yok'}</small>
                </div>
                <button class="remove-person-btn" data-person-id="${this.selectedRelatedParty.id}" data-type="relatedParty" title="Kaldır">×</button>
            </div>
        `;
    }

    // SUMMARY UPDATE
    updateSummary() {
        console.log('📋 Özet güncelleniyor...');
        
        // Marka bilgileri
        const brandInfo = document.getElementById('summaryBrandInfo');
        if (brandInfo) {
            const brandName = document.getElementById('brandExampleText')?.value || 'Girilmedi';
            const brandType = document.getElementById('brandType')?.value || 'Seçilmedi';
            const brandCategory = document.getElementById('brandCategory')?.value || 'Seçilmedi';
            
            brandInfo.innerHTML = `
                <strong>Marka Adı:</strong> ${brandName}<br>
                <strong>Tür:</strong> ${brandType}<br>
                <strong>Kategori:</strong> ${brandCategory}
            `;
        }
        
        // Seçilen sınıflar
        const selectedClassesInfo = document.getElementById('summarySelectedClasses');
        if (selectedClassesInfo) {
            const selectedClasses = getSelectedNiceClasses();
            if (selectedClasses.length === 0) {
                selectedClassesInfo.innerHTML = '<span class="text-danger">Hiç sınıf seçilmedi!</span>';
            } else {
                selectedClassesInfo.innerHTML = `
                    <strong>${selectedClasses.length} sınıf seçildi</strong><br>
                    <small>${selectedClasses.slice(0, 3).join(', ')}${selectedClasses.length > 3 ? '...' : ''}</small>
                `;
            }
        }
        
        // Başvuru sahipleri
        const applicantsInfo = document.getElementById('summaryApplicants');
        if (applicantsInfo) {
            if (this.selectedApplicants.length === 0) {
                applicantsInfo.innerHTML = '<span class="text-danger">Hiç başvuru sahibi seçilmedi!</span>';
            } else {
                applicantsInfo.innerHTML = `
                    <strong>${this.selectedApplicants.length} başvuru sahibi</strong><br>
                    <small>${this.selectedApplicants.map(a => a.name).join(', ')}</small>
                `;
            }
        }
        
        // Status
        const statusInfo = document.getElementById('summaryStatus');
        if (statusInfo) {
            const selectedClasses = getSelectedNiceClasses();
            const hasRequiredFields = 
                document.getElementById('brandExampleText')?.value &&
                document.getElementById('specificTaskType')?.value &&
                selectedClasses.length > 0 &&
                this.selectedApplicants.length > 0;
                
            if (hasRequiredFields) {
                statusInfo.className = 'badge badge-success';
                statusInfo.textContent = 'Kayda Hazır';
            } else {
                statusInfo.className = 'badge badge-warning';
                statusInfo.textContent = 'Eksik Bilgiler Var';
            }
        }
    }

    // FORM SUBMIT
    async handleFormSubmit() {
        console.log('💾 Form submit işlemi başlıyor...');
        
        try {
            const selectedTransactionTypeId = document.getElementById('specificTaskType')?.value;
            if (!selectedTransactionTypeId) {
                alert('Lütfen işlem tipini seçin.');
                // İlk tab'a geç
                const firstTab = document.querySelector('a[href="#brand-info"]');
                if (firstTab) $(firstTab).tab('show');
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
                    if (goodsServicesTab) $(goodsServicesTab).tab('show');
                    return;
                }

                if (this.selectedApplicants.length === 0) {
                    alert('Lütfen en az bir başvuru sahibi seçin.');
                    // Applicants tab'ına geç
                    const applicantsTab = document.querySelector('a[href="#applicants"]');
                    if (applicantsTab) $(applicantsTab).tab('show');
                    return;
                }
                
                const brandExampleText = document.getElementById('brandExampleText')?.value;
                if (!brandExampleText) {
                    alert('Lütfen marka adını girin.');
                    const firstTab = document.querySelector('a[href="#brand-info"]');
                    if (firstTab) $(firstTab).tab('show');
                    document.getElementById('brandExampleText')?.focus();
                    return;
                }
                
                // Onay
                if (!confirm(`"${brandExampleText}" markası için ${goodsAndServices.length} sınıfta başvuru oluşturulacak. Devam etmek istiyor musunuz?`)) {
                    return;
                }
                
                // Form verilerini hazırla
                const taskData = {
                    taskType: selectedTransactionType.id,
                    title: brandExampleText,
                    description: `'${brandExampleText}' adlı marka için ${selectedTransactionType.alias} işlemi.`,
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
                            brandExampleText: brandExampleText,
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
                        tpInvoiceParty: this.selectedTpInvoiceParty ? {
                            id: this.selectedTpInvoiceParty.id,
                            name: this.selectedTpInvoiceParty.name,
                            email: this.selectedTpInvoiceParty.email
                        } : null,
                        serviceInvoiceParty: this.selectedServiceInvoiceParty ? {
                            id: this.selectedServiceInvoiceParty.id,
                            name: this.selectedServiceInvoiceParty.name,
                            email: this.selectedServiceInvoiceParty.email
                        } : null,
                        relatedParty: this.selectedRelatedParty ? {
                            id: this.selectedRelatedParty.id,
                            name: this.selectedRelatedParty.name,
                            email: this.selectedRelatedParty.email
                        } : null
                    }
                };

                const formData = {
                    taskData,
                    newIpRecordData,
                    accrualData: null,
                    brandExampleFile: null
                };

                // Loading state
                const saveBtn = document.getElementById('saveTaskBtn');
                const originalText = saveBtn.innerHTML;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Kaydediliyor...';
                saveBtn.disabled = true;

                // Başvuruyu oluştur
                const result = await createTrademarkApplication(formData);
                
                if (result.success) {
                    console.log('✅ Başvuru başarıyla oluşturuldu:', result);
                    alert('🎉 Marka başvurusu başarıyla oluşturuldu!');
                    
                    // Başarı sayfasına yönlendir veya formu sıfırla
                    if (confirm('İşlem tamamlandı! Ana sayfaya dönmek ister misiniz?')) {
                        window.location.href = 'dashboard.html';
                    } else {
                        this.resetForm();
                    }
                    
                } else {
                    console.error('❌ Başvuru oluşturulamadı:', result.error);
                    alert('❌ Başvuru oluşturulurken hata oluştu:\n' + result.error);
                }
                
                // Loading state'i kaldır
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
                
            } else {
                alert('Sadece marka başvuru işlemleri desteklenmektedir.');
            }
            
        } catch (error) {
            console.error('❌ Form submit hatası:', error);
            alert('Form gönderilirken hata oluştu:\n' + error.message);
            
            // Loading state'i kaldır
            const saveBtn = document.getElementById('saveTaskBtn');
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Marka Başvurusunu Kaydet';
                saveBtn.disabled = false;
            }
        }
    }

    resetForm() {
        console.log('🧹 Form sıfırlanıyor...');
        
        // Form alanlarını sıfırla
        document.getElementById('brandExampleText').value = '';
        document.getElementById('brandType').value = '';
        document.getElementById('brandCategory').value = '';
        document.getElementById('nonLatinAlphabet').value = '';
        document.getElementById('specificTaskType').value = '';
        
        // Radio buttonları sıfırla
        document.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.checked = false;
        });
        
        // Varsayılan radio seçimlerini yap
        document.getElementById('coverLetterRequestYok').checked = true;
        document.getElementById('consentRequestYok').checked = true;
        
        // Seçimleri sıfırla
        this.selectedApplicants = [];
        this.priorities = [];
        this.selectedTpInvoiceParty = null;
        this.selectedServiceInvoiceParty = null;
        this.selectedRelatedParty = null;
        this.selectedIpRecord = null;
        
        // Render'ları güncelle
        this.renderSelectedApplicants();
        this.renderSelectedTpInvoiceParty();
        this.renderSelectedServiceInvoiceParty();
        this.renderSelectedRelatedParty();
        
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

// EVENT DELEGATION FOR DYNAMIC ELEMENTS
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

console.log('✅ DataEntry modülü yüklendi');