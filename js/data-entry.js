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
        this.isNiceClassificationInitialized = false;
        this.selectedApplicants = [];
        this.priorities = [];
        this.brandExampleFile = null;
    }

    async init() {
        console.log('📋 DataEntry modülü başlatılıyor...');
        this.currentUser = authService.getCurrentUser();
        if (!this.currentUser) {
            console.error('❌ Kullanıcı oturum açmamış');
            window.location.href = 'index.html';
            return;
        }

        await loadSharedLayout();
        console.log('📊 Veriler yükleniyor...');
        const [personsResult, typesResult] = await Promise.all([
            personService.getPersons(),
            transactionTypeService.getTransactionTypes()
        ]);
        this.allPersons = personsResult.data || [];
        this.allTransactionTypes = typesResult.data || [];
        console.log('✅ Veriler yüklendi:', {
            persons: this.allPersons.length,
            transactionTypes: this.allTransactionTypes.length
        });
        
        try {
            await initializeNiceClassification();
            this.isNiceClassificationInitialized = true;
            this._adjustSelectedListHeight();
            console.log('✅ Nice Classification init esnasında yüklendi');
        } catch (err) {
            console.error('❌ Nice Classification init hatası:', err);
        }
        
        this.setupEventListeners();
        this.renderTransactionTypes();
        this.setupApplicantListeners();
        this.renderSelectedApplicants();
        this.renderPriorities();
        
        console.log('✅ DataEntry modülü başarıyla başlatıldı');
    }

setupEventListeners() {
    console.log('🔧 Event listeners kuruluyor...');
    
    // Tab değişiklikleri
    $('.nav-link[data-toggle="tab"]').on('shown.bs.tab', (e) => {
        const targetTabId = e.target.getAttribute('aria-controls');
        this.activeTab = targetTabId;
        
        console.log('📂 Tab değişti:', targetTabId);
        
        // Başvuru Sahipleri sekmesine geçildiğinde listeyi yeniden çiz
        if (targetTabId === 'applicants') {
            this.renderSelectedApplicants();
        }

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

    setupApplicantListeners() {
    console.log('🔍 Applicant dinleyicileri kuruluyor...');

    // Arama kutusuna yazdıkça
    $('#applicantSearchInput')
        .off('input')
        .on('input', e => this.searchPersons(e.target.value, 'applicant'));
    
    // Arama sonuçlarından tıklayınca ekle
    $('#applicantSearchResults')
        .off('click')
        .on('click', '.search-result-item', (e) => {
            const id = $(e.currentTarget).data('id');
            this.selectPerson(id, 'applicant');
        });

    // **Bu dinleyiciyi eklememiz gerekiyor:** Başvuru sahibi listesinden kaldırma
    // `selectedApplicantsList` ID'si içindeki `remove-selected-item-btn` class'ına sahip elemanlara tıklandığında çalışır.
    $('#selectedApplicantsList')
        .off('click', '.remove-selected-item-btn')
        .on('click', '.remove-selected-item-btn', (e) => {
            const id = $(e.currentTarget).data('id');
            this.removeApplicant(id);
        });
}

    searchPersons(query) {
        if (query.length < 2) {
            $('#applicantSearchResults').hide();
            return;
        }
        const matches = this.allPersons
            .filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 10);
        const html = matches.map(p => `
            <div class="search-result-item p-2 border-bottom" data-id="${p.id}">
                <strong>${p.name}</strong><br><small class="text-muted">${p.email || ''}</small>
            </div>
        `).join('');
        $('#applicantSearchResults').html(html).show();
    }
    
    selectPerson(personId, type) {
        const person = this.allPersons.find(p => p.id === personId);
        if (!person) {
            console.error(`❌ Person bulunamadı: ${personId}`);
            return;
        }

        if (type === 'applicant') {
            this.addApplicant(person);
        } else {
            // Diğer person tipleri için mantık burada olabilir
        }

        $('#applicantSearchResults').hide();
        $('#applicantSearchInput').val('');
    }

    addApplicant(person) {
        if (this.selectedApplicants.some(p => p.id === person.id)) {
            alert('Bu başvuru sahibi zaten eklenmiş.');
            return;
        }
        this.selectedApplicants.push(person);
        this.renderSelectedApplicants();
    }

    removeApplicant(personId) {
        this.selectedApplicants = this.selectedApplicants.filter(p => p.id !== personId);
        this.renderSelectedApplicants();
    }

    renderSelectedApplicants() {
        const container = document.getElementById('selectedApplicantsList');
        if (!container) return;

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
                    <button type="button" class="btn btn-sm btn-danger remove-selected-item-btn" data-id="${person.id}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
        });
        container.innerHTML = html;
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
            $c.html(`
                <div class="empty-state text-center">
                    <i class="fas fa-info-circle fa-3x text-muted mb-3"></i>
                    <p class="text-muted">Henüz rüçhan bilgisi eklenmedi.</p>
                </div>
            `);
            return;
        }
        const html = this.priorities.map(p => `
            <div class="d-flex justify-content-between align-items-center mb-2 p-2 border rounded">
                <div>
                    <b>Tip:</b> ${p.type}<br>
                    <b>Tarih:</b> ${p.date}<br>
                    <b>Ülke:</b> ${p.country}<br>
                    <b>Numara:</b> ${p.number}
                </div>
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

    renderTransactionTypes() {
        const sel = document.getElementById('specificTaskType');
        if (!sel) return;
        sel.innerHTML = '<option value="">Seçiniz...</option>';
        this.allTransactionTypes
            .filter(t => t.ipType === 'trademark')
            .forEach(t => {
                const o = document.createElement('option');
                o.value = t.id;
                o.textContent = t.alias || t.name;
                sel.appendChild(o);
            });
    }

    async handleFormSubmit() {
        const txId = $('#specificTaskType').val();
        const tx = this.allTransactionTypes.find(t => t.id === txId);
        if (!tx) {
            alert('Lütfen işlem tipini seçin.');
            return $('#brand-info-tab').tab('show');
        }
        if (tx.alias !== 'Başvuru' || tx.ipType !== 'trademark') {
            return alert('Sadece marka başvuru işlemleri desteklenmektedir.');
        }
        const goodsAndServices = getSelectedNiceClasses();
        if (goodsAndServices.length === 0) {
            alert('Lütfen en az bir mal veya hizmet sınıfı seçin.');
            return $('#goods-services-tab').tab('show');
        }
        if (this.selectedApplicants.length === 0) {
            alert('Lütfen en az bir başvuru sahibi seçin.');
            return $('#applicants-tab').tab('show');
        }
        const brandExampleText = $('#brandExampleText').val().trim();
        if (!brandExampleText) {
            alert('Lütfen marka örneği yazılı ifadesi girin.');
            $('#brand-info-tab').tab('show');
            return $('#brandExampleText').focus();
        }

        if (!confirm(`"${brandExampleText}" markası için ${goodsAndServices.length} sınıfta başvuru oluşturulsun mu?`)) {
            return;
        }

        const taskData = {
            taskType: tx.id,
            title: brandExampleText,
            description: `'${brandExampleText}' adlı marka için ${tx.alias} işlemi.`,
            priority: null,
            assignedTo_uid: null,
            assignedTo_email: null,
            dueDate: null,
            status: 'open',
            relatedIpRecordId: null,
            relatedIpRecordTitle: null,
            details: {}
        };
        const newIpRecordData = {
            title: brandExampleText,
            type: tx.ipType,
            status: 'application_filed',
            details: {
                brandInfo: {
                    brandType: document.getElementById('brandType')?.value,
                    brandCategory: document.getElementById('brandCategory')?.value,
                    brandExampleText,
                    nonLatinAlphabet: document.getElementById('nonLatinAlphabet')?.value || null,
                    coverLetterRequest: document.querySelector('input[name="coverLetterRequest"]:checked')?.value,
                    consentRequest: document.querySelector('input[name="consentRequest"]:checked')?.value,
                    goodsAndServices
                },
                applicants: this.selectedApplicants.map(p => ({ id: p.id, name: p.name, email: p.email || null })),
                priorities: this.priorities.length > 0 ? this.priorities : null,
                transactionType: { id: tx.id, name: tx.name, alias: tx.alias }
            }
        };

        let brandUrl = null;
        if (this.brandExampleFile) {
            const uploadResult = await uploadFileToStorage(this.brandExampleFile, 'brand-examples');
            brandUrl = uploadResult.url;
        }

        newIpRecordData.details.brandInfo.brandExampleUrl = brandUrl;
        const formData = { taskData, newIpRecordData, accrualData: null, brandExampleFile: brandUrl };

        const $btn = $('#saveTaskBtn');
        const orig = $btn.html();
        $btn.html('<i class="fas fa-spinner fa-spin mr-2"></i>Kaydediliyor...').prop('disabled', true);
        try {
            const res = await createTrademarkApplication(formData);
            if (res.success) {
                alert('🎉 Marka başvurusu başarıyla oluşturuldu!');
                this.resetForm();
            } else {
                throw new Error(res.error);
            }
        } catch (err) {
            console.error('❌ Oluşturma hatası:', err);
            alert('Hata: ' + err.message);
        } finally {
            $btn.html(orig).prop('disabled', false);
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
        $('#brandExampleText,#applicantSearchInput,#priorityDate,#priorityCountry,#priorityNumber').val('');
        $('input[name="coverLetterRequest"][value="yok"]').prop('checked', true);
        $('input[name="consentRequest"][value="yok"]').prop('checked', true);
        this.selectedApplicants = [];
        this.priorities = [];
        this.renderSelectedApplicants();
        this.renderPriorities();
        if (window.clearAllSelectedClasses) window.clearAllSelectedClasses();
        $('#myTaskTabs a').first().tab('show');
    }
}

// GLOBAL INSTANCE
window.dataEntryInstance = null;

$(async () => {
    window.dataEntryInstance = new DataEntryModule();
    await window.dataEntryInstance.init();
});