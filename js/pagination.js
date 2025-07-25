// js/pagination.js - Yeniden kullanılabilir pagination sistemi

/**
 * Hızlı ve esnek pagination sınıfı
 * Herhangi bir liste sayfasında kullanılabilir
 */
export class Pagination {
    constructor(options = {}) {
        this.options = {
            itemsPerPage: options.itemsPerPage || 20,
            maxVisiblePages: options.maxVisiblePages || 5,
            containerId: options.containerId || 'paginationContainer',
            onPageChange: options.onPageChange || (() => {}),
            showFirstLast: options.showFirstLast !== false,
            showPrevNext: options.showPrevNext !== false,
            showPageInfo: options.showPageInfo !== false,
            showItemsPerPageSelector: options.showItemsPerPageSelector !== false,
            itemsPerPageOptions: options.itemsPerPageOptions || [10, 20, 50, 100],
            strings: {
                first: 'İlk',
                previous: 'Önceki',
                next: 'Sonraki',
                last: 'Son',
                pageInfo: 'Sayfa {current} / {total}',
                itemsInfo: 'Toplam {total} kayıt ({start}-{end} arası gösteriliyor)',
                itemsPerPage: 'Sayfa başına:',
                noResults: 'Gösterilecek kayıt bulunamadı'
            },
            ...options.strings
        };

        this.currentPage = 1;
        this.totalItems = 0;
        this.totalPages = 0;
        this.container = null;

        this.init();
    }

    init() {
        this.container = document.getElementById(this.options.containerId);
        if (!this.container) {
            console.error(`Pagination container '${this.options.containerId}' bulunamadı!`);
            return;
        }
        
        // CSS'i dinamik olarak ekle
        this.injectCSS();
    }

    injectCSS() {
        const cssId = 'pagination-styles';
        if (!document.getElementById(cssId)) {
            const style = document.createElement('style');
            style.id = cssId;
            style.textContent = `
                .pagination-wrapper {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    align-items: center;
                    padding: 20px;
                    background: rgba(255, 255, 255, 0.95);
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
                }

                .pagination-controls {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex-wrap: wrap;
                    justify-content: center;
                }

                .pagination-nav {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }

                .pagination-btn {
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    background: white;
                    color: #333;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s ease;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    min-width: 40px;
                    justify-content: center;
                }

                .pagination-btn:hover:not(:disabled) {
                    background: #f8f9fa;
                    border-color: #007bff;
                    transform: translateY(-1px);
                }

                .pagination-btn:active:not(:disabled) {
                    transform: translateY(0);
                }

                .pagination-btn.current {
                    background: #007bff;
                    color: white;
                    border-color: #007bff;
                    font-weight: 600;
                }

                .pagination-btn:disabled {
                    background: #f8f9fa;
                    color: #6c757d;
                    border-color: #dee2e6;
                    cursor: not-allowed;
                    opacity: 0.6;
                }

                .pagination-ellipsis {
                    padding: 8px 4px;
                    color: #6c757d;
                    font-size: 14px;
                }

                .pagination-info {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 5px;
                    font-size: 14px;
                    color: #666;
                }

                .pagination-page-info {
                    font-weight: 500;
                }

                .pagination-items-info {
                    font-size: 13px;
                }

                .pagination-items-per-page {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    color: #666;
                }

                .pagination-items-select {
                    padding: 4px 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    background: white;
                    font-size: 14px;
                }

                .pagination-no-results {
                    text-align: center;
                    padding: 40px 20px;
                    color: #666;
                    font-style: italic;
                }

                @media (max-width: 768px) {
                    .pagination-wrapper {
                        padding: 15px;
                    }
                    
                    .pagination-controls {
                        flex-direction: column;
                        gap: 15px;
                    }
                    
                    .pagination-btn {
                        padding: 10px 12px;
                        min-width: 44px;
                    }
                    
                    .pagination-info {
                        order: -1;
                        text-align: center;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    update(totalItems, currentPage = 1) {
        this.totalItems = totalItems;
        this.currentPage = Math.max(1, Math.min(currentPage, this.getTotalPages()));
        this.totalPages = this.getTotalPages();
        
        this.render();
        return this;
    }

    getTotalPages() {
        return Math.ceil(this.totalItems / this.options.itemsPerPage);
    }

    getCurrentPageData(allData) {
        const startIndex = (this.currentPage - 1) * this.options.itemsPerPage;
        const endIndex = startIndex + this.options.itemsPerPage;
        return allData.slice(startIndex, endIndex);
    }

    getStartIndex() {
        return (this.currentPage - 1) * this.options.itemsPerPage;
    }

    getEndIndex() {
        return Math.min(this.currentPage * this.options.itemsPerPage, this.totalItems);
    }

    render() {
        if (!this.container) return;

        if (this.totalItems === 0) {
            this.container.innerHTML = `
                <div class="pagination-wrapper">
                    <div class="pagination-no-results">
                        ${this.options.strings.noResults}
                    </div>
                </div>
            `;
            return;
        }

        if (this.totalPages <= 1 && !this.options.showItemsPerPageSelector) {
            this.container.innerHTML = '';
            return;
        }

        const paginationHTML = this.generatePaginationHTML();
        this.container.innerHTML = paginationHTML;
        this.attachEventListeners();
    }

    generatePaginationHTML() {
        let html = '<div class="pagination-wrapper">';

        // Sayfa bilgisi
        if (this.options.showPageInfo) {
            html += `
                <div class="pagination-info">
                    <div class="pagination-page-info">
                        ${this.options.strings.pageInfo
                            .replace('{current}', this.currentPage)
                            .replace('{total}', this.totalPages)}
                    </div>
                    <div class="pagination-items-info">
                        ${this.options.strings.itemsInfo
                            .replace('{total}', this.totalItems)
                            .replace('{start}', this.getStartIndex() + 1)
                            .replace('{end}', this.getEndIndex())}
                    </div>
                </div>
            `;
        }

        html += '<div class="pagination-controls">';

        // Sayfa navigation butonları
        if (this.totalPages > 1) {
            html += '<div class="pagination-nav">';
            html += this.generateNavigationButtons();
            html += '</div>';
        }

        // Sayfa başına öğe seçici
        if (this.options.showItemsPerPageSelector) {
            html += `
                <div class="pagination-items-per-page">
                    <span>${this.options.strings.itemsPerPage}</span>
                    <select class="pagination-items-select" data-action="changeItemsPerPage">
                        ${this.options.itemsPerPageOptions.map(option => 
                            `<option value="${option}" ${option === this.options.itemsPerPage ? 'selected' : ''}>${option}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
        }

        html += '</div></div>';
        return html;
    }

    generateNavigationButtons() {
        let html = '';

        // İlk sayfa butonu
        if (this.options.showFirstLast) {
            html += `<button class="pagination-btn" data-action="goToPage" data-page="1" ${this.currentPage === 1 ? 'disabled' : ''}>
                ${this.options.strings.first}
            </button>`;
        }

        // Önceki sayfa butonu
        if (this.options.showPrevNext) {
            html += `<button class="pagination-btn" data-action="goToPage" data-page="${this.currentPage - 1}" ${this.currentPage === 1 ? 'disabled' : ''}>
                ${this.options.strings.previous}
            </button>`;
        }

        // Sayfa numaraları
        html += this.generatePageNumbers();

        // Sonraki sayfa butonu
        if (this.options.showPrevNext) {
            html += `<button class="pagination-btn" data-action="goToPage" data-page="${this.currentPage + 1}" ${this.currentPage === this.totalPages ? 'disabled' : ''}>
                ${this.options.strings.next}
            </button>`;
        }

        // Son sayfa butonu
        if (this.options.showFirstLast) {
            html += `<button class="pagination-btn" data-action="goToPage" data-page="${this.totalPages}" ${this.currentPage === this.totalPages ? 'disabled' : ''}>
                ${this.options.strings.last}
            </button>`;
        }

        return html;
    }

    generatePageNumbers() {
        let html = '';
        const maxVisible = this.options.maxVisiblePages;
        const current = this.currentPage;
        const total = this.totalPages;

        if (total <= maxVisible) {
            // Tüm sayfaları göster
            for (let i = 1; i <= total; i++) {
                html += `<button class="pagination-btn ${i === current ? 'current' : ''}" 
                         data-action="goToPage" data-page="${i}">${i}</button>`;
            }
        } else {
            // Akıllı sayfa numarası gösterimi
            let start = Math.max(1, current - Math.floor(maxVisible / 2));
            let end = Math.min(total, start + maxVisible - 1);

            if (end - start + 1 < maxVisible) {
                start = Math.max(1, end - maxVisible + 1);
            }

            // İlk sayfa ve ellipsis
            if (start > 1) {
                html += `<button class="pagination-btn" data-action="goToPage" data-page="1">1</button>`;
                if (start > 2) {
                    html += `<span class="pagination-ellipsis">...</span>`;
                }
            }

            // Orta sayfalar
            for (let i = start; i <= end; i++) {
                html += `<button class="pagination-btn ${i === current ? 'current' : ''}" 
                         data-action="goToPage" data-page="${i}">${i}</button>`;
            }

            // Son sayfa ve ellipsis
            if (end < total) {
                if (end < total - 1) {
                    html += `<span class="pagination-ellipsis">...</span>`;
                }
                html += `<button class="pagination-btn" data-action="goToPage" data-page="${total}">${total}</button>`;
            }
        }

        return html;
    }

    attachEventListeners() {
        if (!this.container) return;

        // Event delegation kullanarak tüm butonları dinle
        this.container.addEventListener('click', (e) => {
            const button = e.target.closest('[data-action]');
            if (!button) return;

            e.preventDefault();
            
            const action = button.dataset.action;
            
            if (action === 'goToPage') {
                const page = parseInt(button.dataset.page);
                if (page && !button.disabled) {
                    this.goToPage(page);
                }
            }
        });

        // Sayfa başına öğe sayısı değişikliği
        this.container.addEventListener('change', (e) => {
            if (e.target.dataset.action === 'changeItemsPerPage') {
                const newItemsPerPage = parseInt(e.target.value);
                this.setItemsPerPage(newItemsPerPage);
            }
        });
    }

    goToPage(page) {
        const newPage = Math.max(1, Math.min(page, this.totalPages));
        if (newPage !== this.currentPage) {
            this.currentPage = newPage;
            this.render();
            this.options.onPageChange(newPage, this.options.itemsPerPage);
        }
    }

    setItemsPerPage(itemsPerPage) {
        this.options.itemsPerPage = itemsPerPage;
        
        // Mevcut pozisyonu korumaya çalış
        const currentFirstItem = (this.currentPage - 1) * this.options.itemsPerPage + 1;
        this.currentPage = Math.ceil(currentFirstItem / itemsPerPage);
        
        this.totalPages = this.getTotalPages();
        this.currentPage = Math.max(1, Math.min(this.currentPage, this.totalPages));
        
        this.render();
        this.options.onPageChange(this.currentPage, this.options.itemsPerPage);
    }

    // Yardımcı metodlar
    reset() {
        this.currentPage = 1;
        this.render();
    }

    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    getCurrentPage() {
        return this.currentPage;
    }

    getItemsPerPage() {
        return this.options.itemsPerPage;
    }

    getTotalItems() {
        return this.totalItems;
    }
}

// Kullanım örneği ve yardımcı fonksiyonlar
export const PaginationHelper = {
    /**
     * Hızlı pagination oluşturma fonksiyonu
     */
    create(options) {
        return new Pagination(options);
    },

    /**
     * Dizi üzerinde client-side pagination
     */
    paginate(array, page, itemsPerPage) {
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return array.slice(startIndex, endIndex);
    },

    /**
     * Pagination state'ini URL'e kaydetme
     */
    saveToURL(page, itemsPerPage, baseUrl = window.location.pathname) {
        const url = new URL(baseUrl, window.location.origin);
        url.searchParams.set('page', page);
        url.searchParams.set('perPage', itemsPerPage);
        window.history.replaceState({}, '', url);
    },

    /**
     * URL'den pagination state'ini okuma
     */
    loadFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return {
            page: parseInt(urlParams.get('page')) || 1,
            itemsPerPage: parseInt(urlParams.get('perPage')) || 20
        };
    }
};

// Default export
export default Pagination;