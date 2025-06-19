// js/table-manager.js

class TableManager {
    constructor(options) {
        // Gerekli DOM element ID'leri
        this.tableId = options.tableId; // 'portfolio-table'
        this.tableBodyId = options.tableBodyId; // 'portfolioTableBody'
        this.tableHeaderRowId = options.tableHeaderRowId; // 'portfolioTableHeaderRow'
        this.tableFilterRowId = options.tableFilterRowId; // 'portfolioTableFilterRow'
        this.globalSearchInputId = options.globalSearchInputId; // 'searchBar' (opsiyonel)
        this.noRecordsMessageId = options.noRecordsMessageId; // 'noRecordsMessage'
        
        // Sütun tanımları: [{ key: 'id', label: 'ID', sortable: true, searchable: true, customFilter: (record, filterValue) => ... }]
        this.columnDefinitions = options.columnDefinitions;
        
        // Veri kaynağı (tüm kayıtlar)
        this.allRecords = options.allRecords; // Dışarıdan yüklenecek (örneğin PortfolioModule.allRecords)
        this.allPersons = options.allPersons; // Dışarıdan yüklenecek (örneğin PortfolioModule.allPersons - hak sahipleri için)
        this.allUsers = options.allUsers; // Dışarıdan yüklenecek (örneğin TaskManagementModule.allUsers - atanan kullanıcılar için)

        // Filtre ve sıralama durumları
        this.columnFilters = {};
        this.sortBy = { column: null, direction: 'asc' };

        // Debounce timeout'ları
        this.globalSearchTimeout = null;
        this.columnFilterTimeout = null;

        // Özel filtreleme veya sıralama için callback'ler
        this.customTypeFilter = options.customTypeFilter || null; // Tab filtrelemesi için
        this.customSortLogic = options.customSortLogic || null; // Varsayılan sıralama dışında özel sıralama için
        this.customRecordHtml = options.customRecordHtml || null; // Satır HTML'ini özelleştirmek için
    }

    initializeTable() {
        this.renderTableHeadersAndFilters(); // Başlıkları ve filtreleri oluştur
        this.populateTableBody();           // Tüm kayıtları DOM'a ekle
        this.setupTableEventListeners();    // Event listener'ları ayarla
        this.applyFiltersAndSort();         // İlk filtreleme ve sıralamayı uygula
    }

    // Tablo başlıklarını ve filtre inputlarını dinamik olarak oluşturur
    renderTableHeadersAndFilters() {
        const tableHeaderRow = document.getElementById(this.tableHeaderRowId);
        const tableFilterRow = document.getElementById(this.tableFilterRowId); 
        
        tableHeaderRow.innerHTML = ''; 
        tableFilterRow.innerHTML = ''; 

        // Başlıkları ve filtre inputlarını oluştur
        this.columnDefinitions.forEach(col => {
            // Header Row (Başlıklar)
            const th = document.createElement('th');
            if (col.sortable) {
                th.classList.add('sortable-header');
                th.dataset.column = col.key;
            }
            th.textContent = col.label; 
            tableHeaderRow.appendChild(th);

            // Filter Row (Filtre Inputları)
            const thFilter = document.createElement('th');
            if (col.searchable) {
                const input = document.createElement('input');
                input.type = 'text';
                input.classList.add('column-filter');
                input.dataset.column = col.key;
                input.placeholder = `${col.label} ara...`;
                input.value = this.columnFilters[col.key] || ''; 
                thFilter.appendChild(input);
            }
            tableFilterRow.appendChild(thFilter);
        });
    }

    // Tüm kayıtları DOM'a bir kez ekler
    populateTableBody() {
        const tableBody = document.getElementById(this.tableBodyId);
        tableBody.innerHTML = ''; // Önceki tüm satırları temizle

        this.allRecords.forEach(record => {
            const row = document.createElement('tr');
            row.dataset.recordId = record.id; // Her satıra record ID'sini ekle
            
            // Satır içeriğini oluşturmak için customRecordHtml callback'i kullanılır
            if (this.customRecordHtml) {
                row.innerHTML = this.customRecordHtml(record, this.allPersons, this.allUsers);
            } else {
                // Varsayılan HTML yapısı, temel bir tablo satırı
                row.innerHTML = `<td>${record.id}</td><td>${record.title}</td>`; // Örnek
            }
            
            tableBody.appendChild(row);
        });
    }

    // Tablo event listener'larını ayarlar
    setupTableEventListeners() {
        // Genel arama çubuğu için debounced event listener
        if (this.globalSearchInputId) {
            document.getElementById(this.globalSearchInputId).addEventListener('input', (e) => {
                clearTimeout(this.globalSearchTimeout);
                this.globalSearchTimeout = setTimeout(() => {
                    this.applyFiltersAndSort();
                }, 300); // 300ms gecikme
            });
        }

        // Sütun filtreleri için debounced event listener (delegation)
        // `<thead>` elementine event listener ekleyerek input değişikliklerini yakalayabiliriz
        document.getElementById(this.tableHeaderRowId).parentElement.addEventListener('input', (e) => {
            if (e.target.classList.contains('column-filter')) {
                clearTimeout(this.columnFilterTimeout);
                this.columnFilterTimeout = setTimeout(() => {
                    const columnKey = e.target.dataset.column;
                    this.columnFilters[columnKey] = e.target.value.toLowerCase();
                    this.applyFiltersAndSort();
                }, 300); // 300ms gecikme
            }
        });

        // Sıralama (Sorting) için event listener (delegation)
        document.getElementById(this.tableHeaderRowId).addEventListener('click', (e) => {
            const targetTh = e.target.closest('.sortable-header');
            if (targetTh) {
                const columnKey = targetTh.dataset.column;
                this.toggleSort(columnKey);
            }
        });
    }

    // Sıralama yönünü değiştirir ve filtrelemeyi yeniden tetikler
    toggleSort(columnKey) {
        if (this.sortBy.column === columnKey) {
            this.sortBy.direction = this.sortBy.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortBy.column = columnKey;
            this.sortBy.direction = 'asc';
        }
        this.applyFiltersAndSort(); 
    }

    // Filtreleri ve sıralamayı uygulayan ana fonksiyon
    applyFiltersAndSort() {
        const tableBody = document.getElementById(this.tableBodyId);
        const noRecordsMessage = document.getElementById(this.noRecordsMessageId);
        
        // Record ID'sinden gerçek record objesine harita oluştur (hızlı erişim için)
        const recordMap = new Map(this.allRecords.map(record => [record.id, record]));

        let filteredRecords = [...this.allRecords]; // Tüm kayıtların bir kopyası üzerinde çalış

        // 1. Özel Tab/Tip Filtrelemesi (dışarıdan verilen callback)
        if (this.customTypeFilter) {
            filteredRecords = filteredRecords.filter(record => this.customTypeFilter(record));
        }

        // 2. Genel Arama Çubuğu Filtrelemesi
        const globalSearchTerm = this.globalSearchInputId ? document.getElementById(this.globalSearchInputId).value.toLowerCase() : '';
        if (globalSearchTerm) {
            filteredRecords = filteredRecords.filter(record => {
                const searchContent = this.getRecordSearchContent(record); // Tüm aranabilir alanları birleştir
                return searchContent.includes(globalSearchTerm);
            });
        }

        // 3. Sütun Bazlı Filtreleme
        filteredRecords = filteredRecords.filter(record => {
            return this.columnDefinitions.every(col => {
                if (!col.searchable || !this.columnFilters[col.key]) {
                    return true; // Aranabilir değilse veya filtre boşsa True
                }

                // Eğer sütun sadece belirli bir tabda görünüyorsa ve o tab aktif değilse bu filtreyi atla
                // Bu kontrolün TableManager içinde değil, customTypeFilter içinde olması daha mantıklı olabilir.
                // Ancak şimdilik burada da bırakılabilir.
                if (col.onlyTrademark && this.customTypeFilter && !this.customTypeFilter(record)) { // Eğer customTypeFilter'a bağlıysa
                    return true;
                }

                let recordValue = this.getRecordValueForColumn(record, col.key);
                return String(recordValue).toLowerCase().includes(this.columnFilters[col.key]);
            });
        });

        // 4. Sıralama
        if (this.sortBy.column) {
            const sortColumn = this.sortBy.column;
            const sortDirection = this.sortBy.direction;
            
            filteredRecords.sort((a, b) => {
                // Özel sıralama mantığı varsa onu kullan
                if (this.customSortLogic && this.customSortLogic[sortColumn]) {
                    return this.customSortLogic[sortColumn](a, b, sortDirection, this.allPersons, this.allUsers);
                }

                // Varsayılan sıralama mantığı
                let valA = this.getRecordValueForColumn(a, sortColumn);
                let valB = this.getRecordValueForColumn(b, sortColumn);

                // Boş veya null değerleri sıralama sonunda göstermek için
                const isValANull = (valA === null || valA === undefined || valA === '');
                const isValBNull = (valB === null || valB === undefined || valB === '');

                if (isValANull && isValBNull) return 0;
                if (isValANull) return sortDirection === 'asc' ? 1 : -1; // Null sona
                if (isValBNull) return sortDirection === 'asc' ? -1 : 1; // Null sona

                if (typeof valA === 'string' && typeof valB === 'string') {
                    return sortDirection === 'asc' ? valA.localeCompare(valB, 'tr-TR') : valB.localeCompare(valA, 'tr-TR');
                } else if (typeof valA === 'number' && typeof valB === 'number') {
                    return sortDirection === 'asc' ? valA - valB : valB - valA;
                } else if (valA instanceof Date && valB instanceof Date) {
                    return sortDirection === 'asc' ? valA.getTime() - valB.getTime() : valB.getTime() - valA.getTime();
                }
                return 0; 
            });
        }
        
        // Sıralama ikonlarını güncelle
        document.querySelectorAll('.sortable-header').forEach(header => {
            header.classList.remove('asc', 'desc', 'inactive');
            if (header.dataset.column === this.sortBy.column) {
                header.classList.add(this.sortBy.direction);
            } else {
                header.classList.add('inactive');
            }
        });

        // Mevcut DOM satırlarını güncelle (gizle/göster ve sırala)
        tableBody.innerHTML = ''; // Tüm satırları kaldır
        if (filteredRecords.length === 0) {
            noRecordsMessage.style.display = 'block';
            tableBody.style.display = 'none';
        } else {
            noRecordsMessage.style.display = 'none';
            tableBody.style.display = 'table-row-group';
            filteredRecords.forEach(record => {
                const row = document.getElementById(this.tableBodyId).querySelector(`tr[data-record-id="${record.id}"]`);
                if (row) {
                    // Sütunların dinamik görünürlüğünü güncelle
                    // Bu kısım populateTableBody ve renderTableHeadersAndFilters ile birlikte çalışmalı.
                    // Şimdilik sadece marka görseli özel durumu var.
                    const currentTypeFilter_in_apply = this.customTypeFilter ? this.customTypeFilter.currentFilter : 'all'; // Eğer type filter varsa onun değerini al

                    const cells = Array.from(row.children); // Mevcut hücreleri al
                    let colIndex = 0;
                    this.columnDefinitions.forEach(col => {
                         if (col.onlyTrademark) { // Eğer marka görseli sütunu ise
                            const td = cells[colIndex];
                            if (currentTypeFilter_in_apply === 'trademark' && td) {
                                td.style.display = ''; // Göster
                                if (record.type === 'trademark' && record.trademarkImage && record.trademarkImage.content) {
                                    td.innerHTML = `<div class="trademark-image-wrapper"><img src="${record.trademarkImage.content}" alt="Marka Görseli" class="trademark-image-thumbnail"></div>`;
                                } else {
                                    td.innerHTML = `<td>-</td>`; // Boş veya tire
                                }
                            } else if (td) {
                                td.style.display = 'none'; // Gizle
                            }
                        }
                        colIndex++; // Sonraki sütuna geç
                    });


                    tableBody.appendChild(row); // DOM'a yeniden ekle
                }
            });
        }
    }

    // Bir kaydın arama içeriğini oluşturan yardımcı fonksiyon
    getRecordSearchContent(record) {
        const searchValues = [
            record.type, record.title, record.applicationNumber, record.status, record.description,
            record.patentClass, record.niceClass, record.copyrightType, record.designClass
        ].filter(Boolean).map(val => String(val));

        const ownerNames = record.owners ? record.owners.map(owner => this.allPersons.find(p => p.id === owner.id)?.name || '').filter(Boolean).join(' ') : '';
        if (ownerNames) searchValues.push(ownerNames);

        return searchValues.join(' ').toLowerCase();
    }

    // Bir kayıt ve sütun anahtarı için değeri döndüren yardımcı fonksiyon
    getRecordValueForColumn(record, columnKey) {
        if (columnKey === 'owners') {
            return record.owners ? record.owners.map(owner => this.allPersons.find(p => p.id === owner.id)?.name || '').filter(Boolean).join(' ') : '';
        } else if (columnKey === 'applicationDate') {
            return record.applicationDate ? new Date(record.applicationDate) : null;
        } else {
            return record[columnKey] !== undefined ? record[columnKey] : null;
        }
    }
}

// Global olarak kullanılması gereken fonksiyonları dışa aktar (eğer başka modüller kullanacaksa)
export { TableManager };