// js/data-entry.js
import { initializeNiceClassification, getSelectedNiceClasses } from './nice-classification.js';
import { personService, ipRecordsService, storage } from '../firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

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
        
        const html = '<div class="form-section">' +
            '<h3 class="section-title">Marka Bilgileri</h3>' +
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
                '<div class="form-group full-width">' +
                    '<label for="brandDescription" class="form-label">Marka Açıklaması</label>' +
                    '<textarea id="brandDescription" class="form-textarea" rows="3" placeholder="Marka hakkında açıklama girin"></textarea>' +
                '</div>' +
            '</div>' +
        '</div>';

        this.dynamicFormContainer.innerHTML = html;
        this.setupDynamicFormListeners();
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
        this.dynamicFormContainer.addEventListener('input', () => {
            this.updateSaveButtonState();
        });
    }

    updateSaveButtonState() {
        const ipType = this.ipTypeSelect.value;
        let isComplete = false;

        if (ipType === 'trademark') {
            const brandText = document.getElementById('brandExampleText');
            isComplete = brandText && brandText.value.trim();
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
        const description = document.getElementById('brandDescription').value.trim();

        portfolioData.title = brandText;
        portfolioData.details = {
            brandText,
            applicationNumber: applicationNumber || null,
            applicationDate: applicationDate || null,
            registrationNumber: registrationNumber || null,
            description: description || null
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
    
    // Layout'un yüklenmesini bekle
    setTimeout(async () => {
        try {
            // Layout kontrol
            const layoutPlaceholder = document.getElementById('layout-placeholder');
            console.log('🔍 Layout placeholder:', layoutPlaceholder);
            console.log('🔍 Layout içeriği:', layoutPlaceholder ? layoutPlaceholder.innerHTML.length : 'YOK');
            
            const dataEntry = new DataEntryModule();
            await dataEntry.init();
            console.log('✅ Data Entry Module başlatıldı');
        } catch (error) {
            console.error('❌ Data Entry Module başlatma hatası:', error);
        }
    }, 1000); // 1 saniye bekle
});

export default DataEntryModule;