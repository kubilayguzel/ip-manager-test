// js/nice-classification.js
// Nice Classification mal/hizmet seçim sistemi

import { niceClassificationService, niceClassificationCache } from './services/nice-classification-service.js';

class NiceClassificationManager {
    constructor() {
        this.selectedClasses = [];
        this.allClasses = {};
        this.filteredClasses = {};
        this.isLoaded = false;
        
        this.init();
    }

    async init() {
        await this.loadClasses();
        this.setupEventListeners();
        this.renderClasses();
    }

    // Nice sınıflarını yükle
    async loadClasses() {
        try {
            // Önce cache'den dene
            await niceClassificationCache.cacheAllClasses();
            
            const result = await niceClassificationService.getActiveClasses();
            if (result.success) {
                this.allClasses = result.data;
                this.filteredClasses = { ...result.data };
                this.isLoaded = true;
                console.log('Nice sınıfları yüklendi:', Object.keys(this.allClasses).length, 'sınıf');
            } else {
                console.error('Nice sınıfları yüklenemedi:', result.error);
                this.showError('Nice sınıfları yüklenirken hata oluştu.');
                return;
            }
        } catch (error) {
            console.error('Nice sınıfları yükleme hatası:', error);
            this.showError('Nice sınıfları yüklenirken beklenmeyen bir hata oluştu.');
        }
    }

    // Event listener'ları ayarla
    setupEventListeners() {
        // Arama input'u
        const searchInput = document.getElementById('classSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterClasses(e.target.value);
            });
        }

        // Custom class input'u (Enter tuşu)
        const customInput = document.getElementById('customClassInput');
        if (customInput) {
            customInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addCustomClass();
                }
            });
        }
    }

    // Sınıfları filtrele
    filterClasses(searchTerm) {
        if (!searchTerm.trim()) {
            this.filteredClasses = { ...this.allClasses };
        } else {
            const term = searchTerm.toLowerCase();
            this.filteredClasses = {};
            
            Object.keys(this.allClasses).forEach(classKey => {
                const classData = this.allClasses[classKey];
                
                // Sınıf numarası, başlık veya açıklama eşleşmesi
                const titleMatch = classData.title?.toLowerCase().includes(term);
                const descriptionMatch = classData.description?.toLowerCase().includes(term);
                const numberMatch = classData.classNumber?.includes(searchTerm);
                
                // Alt sınıf eşleşmesi
                const subclassMatch = classData.subclasses?.some(sub => 
                    sub.description?.toLowerCase().includes(term) ||
                    sub.code?.toLowerCase().includes(term)
                );
                
                if (titleMatch || descriptionMatch || numberMatch || subclassMatch) {
                    this.filteredClasses[classKey] = classData;
                }
            });
        }
        
        this.renderClasses();
    }

    // Aramayı temizle
    clearSearch() {
        const searchInput = document.getElementById('classSearchInput');
        if (searchInput) {
            searchInput.value = '';
            this.filteredClasses = { ...this.allClasses };
            this.renderClasses();
        }
    }

    // Sınıfları render et
    renderClasses() {
        const container = document.getElementById('niceClassesList');
        if (!container) return;

        if (!this.isLoaded) {
            container.innerHTML = `
                <div class="text-center p-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="sr-only">Yükleniyor...</span>
                    </div>
                    <p class="mt-2 text-muted">Nice sınıfları yükleniyor...</p>
                </div>
            `;
            return;
        }

        if (Object.keys(this.filteredClasses).length === 0) {
            container.innerHTML = `
                <div class="text-center p-4">
                    <i class="fas fa-search fa-2x text-muted mb-3"></i>
                    <p class="text-muted">Arama kriterinize uygun sınıf bulunamadı.</p>
                </div>
            `;
            return;
        }

        let html = '';
        
        // Sınıfları numaraya göre sırala
        const sortedClasses = Object.values(this.filteredClasses)
            .sort((a, b) => parseInt(a.classNumber) - parseInt(b.classNumber));

        sortedClasses.forEach(classData => {
            if (classData.classNumber === '99') return; // 99'u ayrı gösteriyoruz
            
            html += this.renderClassItem(classData);
        });

        container.innerHTML = html;
    }

    // Tek bir sınıf öğesi render et
    renderClassItem(classData) {
        const hasSubclasses = classData.subclasses && classData.subclasses.length > 0;
        
        return `
            <div class="class-item">
                <div class="class-header" onclick="niceManager.toggleClass('${classData.classNumber}')" 
                     id="class-header-${classData.classNumber}">
                    <div class="d-flex align-items-center flex-grow-1">
                        <span class="class-number">${classData.classNumber}</span>
                        <span class="class-title">${classData.title || `Sınıf ${classData.classNumber}`}</span>
                    </div>
                    ${hasSubclasses ? '<i class="fas fa-chevron-down toggle-icon"></i>' : ''}
                </div>
                
                ${hasSubclasses ? `
                    <div class="subclasses-container" id="subclasses-${classData.classNumber}">
                        ${classData.subclasses.map(sub => `
                            <div class="subclass-item" 
                                 onclick="niceManager.selectSubclass('${classData.classNumber}', '${sub.code}', '${this.escapeHtml(sub.description)}')">
                                <span class="subclass-code">(${sub.code})</span>
                                ${sub.description}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Sınıfı aç/kapat
    toggleClass(classNumber) {
        const header = document.getElementById(`class-header-${classNumber}`);
        const subclasses = document.getElementById(`subclasses-${classNumber}`);
        
        if (header && subclasses) {
            header.classList.toggle('expanded');
            subclasses.classList.toggle('show');
        }
    }