// data-entry.js - Revize Edilmiş Tam Kod

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
            await loadSharedLayout({ activeMenuLink: 'data-entry.html' });
            
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
            
            this.setupEventListeners();
            this.renderTransactionTypes();
            this.setupDynamicListeners();
            
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
        // 1) href'ten id al
        const targetTabId = e.target.getAttribute('href').substring(1);
        this.activeTab = targetTabId;
        console.log('📂 Tab değişti:', targetTabId);
        
        // 2) goods-services için Nice başlat
        if (targetTabId === 'goods-services' && !this.isNiceClassificationInitialized) {
            setTimeout(() => this.initializeNiceClassification(), 100);
        }
        
        // 3) applicants tab'ı gelince listeyi yeniden çiz
        if (targetTabId === 'applicants') {
            this.renderSelectedApplicants();
        }
        
        // 4) summary tab'ı gelince özet güncelle
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
    setupDynamicListeners() {
        console.log('🔗 Dinamik element listeners kuruluyor...');
        
        // Event delegation for person search result selection
        $(document).on('click', '.search-result-item', (e) => {
            const item = $(e.currentTarget);
            const personId = item.data('person-id');
            const type = item.data('type');
            this.selectPerson(personId, type);
        });

        // Event delegation for removing a person
        $(document).on('click', '.remove-person-btn', (e) => {
            const btn = $(e.currentTarget);
            const personId = btn.data('person-id');
            const type = btn.data('type');
            this.removeSelectedPerson(personId, type);
        });
        
        // Search inputs
        const searchTypes = ['applicant', 'tpInvoiceParty', 'serviceInvoiceParty', 'relatedParty'];
        searchTypes.forEach(type => {
            $(`#${type}SearchInput`).on('input', e => this.searchPersons($(e.target).val(), type));
            $(`#${type}SearchInput`).on('blur', () => {
                setTimeout(() => this.hidePersonSearchResults(type), 200);
            });
            $(`#${type}SearchInput`).on('focus', e => {
                if ($(e.target).val().length >= 2) {
                    this.searchPersons($(e.target).val(), type);
                }
            });
        });
        
        // Priority type change
        $('#priorityType').on('change', (e) => {
            $('#priorityDateLabel').text(e.target.value === 'sergi' ? 'Sergi Tarihi' : 'Rüçhan Tarihi');
        });
        
        console.log('✅ Dinamik element listeners kuruldu');
    }
    
    async initializeNiceClassification() {
        if (this.isNiceClassificationInitialized) {
            console.log('⚠️ Nice Classification zaten initialize edilmiş');
            return;
        }

        console.log('🔄 Nice Classification başlatılıyor...');
        try {
            await initializeNiceClassification();
            this.isNiceClassificationInitialized = true;
            this._adjustSelectedListHeight();
            console.log('✅ Nice Classification başarıyla başlatıldı');
        } catch (error) {
            console.error('❌ Nice Classification başlatılamadı:', error);
            const container = document.getElementById('niceClassificationList');
            if (container) {
                container.innerHTML = `<div class="text-center text-danger p-4"><i class="fas fa-exclamation-triangle fa-2x mb-2"></i><p>Nice Classification yüklenemedi</p></div>`;
            }
        }
    }
    
    renderTransactionTypes() {
        const transactionTypeSelect = document.getElementById('specificTaskType');
        if (!transactionTypeSelect) { return; }
        
        const trademarkTypes = this.allTransactionTypes.filter(t => t.ipType === 'trademark');
        
        transactionTypeSelect.innerHTML = '<option value="">Seçiniz...</option>';
        trademarkTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.name || type.alias;
            transactionTypeSelect.appendChild(option);
        });
    }

    searchPersons(query, type) {
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
        if (!resultsContainer) { return; }
        
        if (persons.length === 0) {
            resultsContainer.innerHTML = '<div class="search-result-item text-muted">Sonuç bulunamadı</div>';
        } else {
            resultsContainer.innerHTML = persons.slice(0, 10).map(person => `
                <div class="search-result-item p-2 border-bottom" data-person-id="${person.id}" data-type="${type}">
                    <div class="result-name"><strong>${person.name}</strong></div>
                    <div class="result-details"><small class="text-muted">${person.email || 'Email yok'} • ${person.phone || 'Telefon yok'}</small></div>
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

    renderSelectedApplicants() {
        const container = document.getElementById('selectedApplicantsList');
        if (!container) { return; }
        
        if (this.selectedApplicants.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-plus fa-3x text-muted mb-3"></i>
                    <p class="text-muted">Henüz başvuru sahibi seçilmedi.</p>
                </div>`;
            return;
        }
        
        let html = '';
        this.selectedApplicants.forEach(person => {
            html += `
                <div class="selected-item d-flex justify-content-between align-items-center p-2 mb-2 border rounded">
                    <span>${person.name} (${person.email || 'E-posta Yok'})</span>
                    <button type="button" class="btn btn-sm btn-danger remove-person-btn" data-person-id="${person.id}" data-type="applicant">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
        });
        container.innerHTML = html;
    }
    
    renderSelectedTpInvoiceParty() {
        const container = document.getElementById('selectedTpInvoiceParty');
        if (!container) return;
        if (!this.selectedTpInvoiceParty) {
            container.innerHTML = '<div class="text-muted">Henüz TP fatura tarafı seçilmedi</div>';
            return;
        }
        container.innerHTML = `<div class="selected-person-item"><div class="person-info"><strong>${this.selectedTpInvoiceParty.name}</strong><br><small class="text-muted">${this.selectedTpInvoiceParty.email || 'Email yok'}</small></div><button class="remove-person-btn" data-person-id="${this.selectedTpInvoiceParty.id}" data-type="tpInvoiceParty" title="Kaldır">×</button></div>`;
    }
    
    renderSelectedServiceInvoiceParty() {
        const container = document.getElementById('selectedServiceInvoiceParty');
        if (!container) return;
        if (!this.selectedServiceInvoiceParty) {
            container.innerHTML = '<div class="text-muted">Henüz hizmet fatura tarafı seçilmedi</div>';
            return;
        }
        container.innerHTML = `<div class="selected-person-item"><div class="person-info"><strong>${this.selectedServiceInvoiceParty.name}</strong><br><small class="text-muted">${this.selectedServiceInvoiceParty.email || 'Email yok'}</small></div><button class="remove-person-btn" data-person-id="${this.selectedServiceInvoiceParty.id}" data-type="serviceInvoiceParty" title="Kaldır">×</button></div>`;
    }
    
    renderSelectedRelatedParty() {
        const container = document.getElementById('selectedRelatedParty');
        if (!container) return;
        if (!this.selectedRelatedParty) {
            container.innerHTML = '<div class="text-muted">Henüz ilgili taraf seçilmedi</div>';
            return;
        }
        container.innerHTML = `<div class="selected-person-item"><div class="person-info"><strong>${this.selectedRelatedParty.name}</strong><br><small class="text-muted">${this.selectedRelatedParty.email || 'Email yok'}</small></div><button class="remove-person-btn" data-person-id="${this.selectedRelatedParty.id}" data-type="relatedParty" title="Kaldır">×</button></div>`;
    }

    addPriority() {
        const date = $('#priorityDate').val();
        const country = $('#priorityCountry').val();
        const number = $('#priorityNumber').val();
        const type = $('#priorityType').val();
        if (!date || !country || !number) {
            return alert('Lütfen tüm rüçhan bilgilerini doldurun.');
        }
        this.priorities.push({ id: Date.now().toString(), type, date, country, number });
        this.renderPriorities();
        $('#priorityDate,#priorityCountry,#priorityNumber').val('');
    }

    handleBrandExampleUpload(file) {
        this.brandExampleFile = file;
        const reader = new FileReader();
        reader.onload = () => {
            document.getElementById('brandExamplePreview').src = reader.result;
            document.getElementById('brandExamplePreviewContainer').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
    
    renderPriorities() {
        const $c = $('#addedPrioritiesList');
        if (this.priorities.length === 0) {
            $c.html(`<div class="empty-state text-center"><i class="fas fa-info-circle fa-3x text-muted mb-3"></i><p class="text-muted">Henüz rüçhan bilgisi eklenmedi.</p></div>`);
            return;
        }
        const html = this.priorities.map(p => `
            <div class="d-flex justify-content-between align-items-center mb-2 p-2 border rounded">
                <div><b>Tip:</b> ${p.type}<br><b>Tarih:</b> ${p.date}<br><b>Ülke:</b> ${p.country}<br><b>Numara:</b> ${p.number}</div>
                <button class="btn btn-sm btn-danger remove-priority-btn" data-id="${p.id}">&times;</button>
            </div>
        `).join('');
        $c.html(html);
        $c.find('.remove-priority-btn').on('click', e => {
            const id = $(e.currentTarget).data('id');
            this.priorities = this.priorities.filter(x => x.id !== id);
            this.renderPriorities();
        });
    }

    updateSummary() {
        const brandInfo = document.getElementById('summaryBrandInfo');
        if (brandInfo) {
            const brandName = document.getElementById('brandExampleText')?.value || 'Girilmedi';
            const brandType = document.getElementById('brandType')?.value || 'Seçilmedi';
            const brandCategory = document.getElementById('brandCategory')?.value || 'Seçilmedi';
            brandInfo.innerHTML = `<strong>Marka Adı:</strong> ${brandName}<br><strong>Tür:</strong> ${brandType}<br><strong>Kategori:</strong> ${brandCategory}`;
        }
        const selectedClassesInfo = document.getElementById('summarySelectedClasses');
        if (selectedClassesInfo) {
            const selectedClasses = getSelectedNiceClasses();
            if (selectedClasses.length === 0) {
                selectedClassesInfo.innerHTML = '<span class="text-danger">Hiç sınıf seçilmedi!</span>';
            } else {
                selectedClassesInfo.innerHTML = `<strong>${selectedClasses.length} sınıf seçildi</strong><br><small>${selectedClasses.slice(0, 3).join(', ')}${selectedClasses.length > 3 ? '...' : ''}</small>`;
            }
        }
        const applicantsInfo = document.getElementById('summaryApplicants');
        if (applicantsInfo) {
            if (this.selectedApplicants.length === 0) {
                applicantsInfo.innerHTML = '<span class="text-danger">Hiç başvuru sahibi seçilmedi!</span>';
            } else {
                applicantsInfo.innerHTML = `<strong>${this.selectedApplicants.length} başvuru sahibi</strong><br><small>${this.selectedApplicants.map(a => a.name).join(', ')}</small>`;
            }
        }
        const statusInfo = document.getElementById('summaryStatus');
        if (statusInfo) {
            const selectedClasses = getSelectedNiceClasses();
            const hasRequiredFields = document.getElementById('brandExampleText')?.value && selectedClasses.length > 0 && this.selectedApplicants.length > 0;
            if (hasRequiredFields) {
                statusInfo.className = 'badge badge-success';
                statusInfo.textContent = 'Kayda Hazır';
            } else {
                statusInfo.className = 'badge badge-warning';
                statusInfo.textContent = 'Eksik Bilgiler Var';
            }
        }
    }

    async handleFormSubmit() {
        try {
            const selectedTransactionTypeId = document.getElementById('specificTaskType')?.value;
            if (!selectedTransactionTypeId) {
                alert('Lütfen işlem tipini seçin.');
                const firstTab = document.querySelector('a[href="#brand-info"]');
                if (firstTab) $(firstTab).tab('show');
                return;
            }
            const selectedTransactionType = this.allTransactionTypes.find(t => t.id === selectedTransactionTypeId);
            if (!selectedTransactionType || selectedTransactionType.alias !== 'Başvuru' || selectedTransactionType.ipType !== 'trademark') {
                alert('Sadece marka başvuru işlemleri desteklenmektedir.');
                return;
            }
            
            const goodsAndServices = getSelectedNiceClasses();
            if (goodsAndServices.length === 0) {
                alert('Lütfen en az bir mal veya hizmet sınıfı seçin.');
                const goodsServicesTab = document.querySelector('a[href="#goods-services"]');
                if (goodsServicesTab) $(goodsServicesTab).tab('show');
                return;
            }

            if (this.selectedApplicants.length === 0) {
                alert('Lütfen en az bir başvuru sahibi seçin.');
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
            
            if (!confirm(`"${brandExampleText}" markası için ${goodsAndServices.length} sınıfta başvuru oluşturulacak. Devam etmek istiyor musunuz?`)) {
                return;
            }
            
            const taskData = {
                taskType: selectedTransactionType.id,
                title: brandExampleText,
                description: `'${brandExampleText}' adlı marka için ${selectedTransactionType.alias} işlemi.`,
                priority: 'medium',
                assignedTo_uid: null,
                assignedTo_email: null,
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
                        brandExampleText: brandExampleText,
                        nonLatinAlphabet: document.getElementById('nonLatinAlphabet')?.value || null,
                        coverLetterRequest: document.querySelector('input[name="coverLetterRequest"]:checked')?.value,
                        consentRequest: document.querySelector('input[name="consentRequest"]:checked')?.value,
                        goodsAndServices: goodsAndServices
                    },
                    applicants: this.selectedApplicants.map(p => ({ id: p.id, name: p.name, email: p.email || null })),
                    priorities: this.priorities,
                    tpInvoiceParty: this.selectedTpInvoiceParty ? { id: this.selectedTpInvoiceParty.id, name: this.selectedTpInvoiceParty.name, email: this.selectedTpInvoiceParty.email } : null,
                    serviceInvoiceParty: this.selectedServiceInvoiceParty ? { id: this.selectedServiceInvoiceParty.id, name: this.selectedServiceInvoiceParty.name, email: this.selectedServiceInvoiceParty.email } : null,
                    relatedParty: this.selectedRelatedParty ? { id: this.selectedRelatedParty.id, name: this.selectedRelatedParty.name, email: this.selectedRelatedParty.email } : null,
                }
            };
            const formData = { taskData, newIpRecordData, accrualData: null, brandExampleFile: null };

            const saveBtn = document.getElementById('saveTaskBtn');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Kaydediliyor...';
            saveBtn.disabled = true;

            const result = await createTrademarkApplication(formData);
            
            if (result.success) {
                alert('🎉 Marka başvurusu başarıyla oluşturuldu!');
                if (confirm('İşlem tamamlandı! Ana sayfaya dönmek ister misiniz?')) {
                    window.location.href = 'dashboard.html';
                } else {
                    this.resetForm();
                }
            } else {
                alert('❌ Başvuru oluşturulurken hata oluştu:\n' + result.error);
            }
            
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
            
        } catch (error) {
            console.error('❌ Form submit hatası:', error);
            alert('Form gönderilirken hata oluştu:\n' + error.message);
        }
    }

    _adjustSelectedListHeight() {
        const left = document.getElementById('niceClassificationList');
        const right = document.getElementById('selectedNiceClasses');
        if (left && right) {
            right.style.maxHeight = `${left.clientHeight}px`;
        }
    }

    resetForm() {
        document.getElementById('brandExampleText').value = '';
        document.getElementById('brandType').value = '';
        document.getElementById('brandCategory').value = '';
        document.getElementById('nonLatinAlphabet').value = '';
        document.getElementById('specificTaskType').value = '';
        document.querySelectorAll('input[type="radio"]').forEach(radio => radio.checked = false);
        document.getElementById('coverLetterRequestYok').checked = true;
        document.getElementById('consentRequestYok').checked = true;
        this.selectedApplicants = [];
        this.priorities = [];
        this.selectedTpInvoiceParty = null;
        this.selectedServiceInvoiceParty = null;
        this.selectedRelatedParty = null;
        this.selectedIpRecord = null;
        this.renderSelectedApplicants();
        this.renderSelectedTpInvoiceParty();
        this.renderSelectedServiceInvoiceParty();
        this.renderSelectedRelatedParty();
        if (window.clearAllSelectedClasses) window.clearAllSelectedClasses();
        const firstTab = document.querySelector('.nav-link[data-toggle="tab"]');
        if (firstTab) $(firstTab).tab('show');
    }
}

window.dataEntryInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    window.dataEntryInstance = new DataEntryModule();
    window.dataEntryInstance.init().catch(error => {
        console.error('❌ DataEntry başlatılamadı:', error);
        alert('Uygulama başlatılamadı. Lütfen sayfayı yenileyin.');
    });
});