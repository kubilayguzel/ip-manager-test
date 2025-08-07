// js/nice-classification.js - EKSIKSIZ FINAL VERSION

import { db } from '../firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let allNiceData = [];
let selectedClasses = {};  // { key: { classNum, text } }

// 35-5 özel modal değişkenleri
let class35_5_modalSelectedItems = {};
let class35_5_modalAllData = [];

function renderSelectedClasses() {
    const container = document.getElementById('selectedNiceClasses');
    const countBadge = document.getElementById('selectedClassCount');
    if (!container) return;

    countBadge.textContent = Object.keys(selectedClasses).length;
    if (Object.keys(selectedClasses).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-list-alt fa-3x text-muted mb-3"></i>
                <p class="text-muted">
                    Henüz hiçbir sınıf seçilmedi.<br>
                    Sol panelden sınıf başlığına veya alt sınıfları seçin.
                </p>
            </div>`;
        return;
    }

    const grouped = {};
    Object.entries(selectedClasses).forEach(([code, item]) => {
        if (!grouped[item.classNum]) grouped[item.classNum] = [];
        grouped[item.classNum].push({ code, text: item.text });
    });

    let html = '';
    Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b)).forEach(classNum => {
        grouped[classNum].forEach(item => {
            const isCustom = classNum === '99';
            const displayCode = isCustom ? classNum : item.code;
            html += `
            <div class="selected-class-item ${isCustom ? 'custom' : ''}">
                <div class="selected-class-number">Sınıf ${displayCode}</div>
                <p class="selected-class-description">${item.text}</p>
                <button class="remove-selected-btn" data-key="${item.code}" title="Kaldır">&times;</button>
            </div>`;
        });
    });
    container.innerHTML = html;
}

function toggleAccordion(id) {
    const el = document.getElementById(`subclasses-${id}`);
    if (!el) return;
    el.classList.toggle('show');
    const header = document.querySelector(`.class-header[data-id="${id}"]`);
    if (header) header.classList.toggle('expanded');
}

// TEK selectItem FONKSIYONU - 35-5 DESTEKLİ
function selectItem(key, classNum, text) {
    if (selectedClasses[key]) return; // zaten seçili
    
    // 35-5 kontrolü - ÖZEL DURUM
    if (key === "35-5") {
        // 35-5 seçildiğinde modal aç
        selectedClasses[key] = { classNum, text };
        renderSelectedClasses();
        updateVisualStates();
        
        const el = document.querySelector(`[data-code="${key}"]`);
        if (el) el.classList.add('selected');
        
        // Modal'ı aç
        setTimeout(() => {
            openClass35_5Modal();
        }, 300);
        
        return;
    }
    
    // Normal seçim işlemi
    selectedClasses[key] = { classNum, text };
    renderSelectedClasses();
    updateVisualStates();

    const el = document.querySelector(`[data-code="${key}"]`);
    if (el) el.classList.add('selected');
}

function removeSelectedClass(key) {
    if (!selectedClasses[key]) return;
    delete selectedClasses[key];
    renderSelectedClasses();
    updateVisualStates();
    const el = document.querySelector(`[data-code="${key}"]`);
    if (el) el.classList.remove('selected');
}

// ANA SINIF SEÇİMİ FONKSİYONLARI
function selectWholeClass(classNumber) {
    const classData = allNiceData.find(c => c.classNumber === parseInt(classNumber));
    if (!classData) return;

    // Ana sınıf başlığını seç
    const mainClassCode = `${classNumber}-main`;
    selectItem(mainClassCode, classNumber, classData.classTitle);

    // Tüm alt sınıfları seç
    classData.subClasses.forEach((sc, index) => {
        const code = `${classNumber}-${index + 1}`;
        selectItem(code, classNumber, sc.subClassDescription);
    });

    // Sınıfı genişlet
    const collapseElement = document.getElementById(`subclasses-${classNumber}`);
    if (collapseElement) {
        collapseElement.classList.add('show');
    }
    const header = document.querySelector(`.class-header[data-id="${classNumber}"]`);
    if (header) header.classList.add('expanded');
}

function deselectWholeClass(classNumber) {
    const classData = allNiceData.find(c => c.classNumber === parseInt(classNumber));
    if (!classData) return;

    // Ana sınıf başlığını kaldır
    const mainClassCode = `${classNumber}-main`;
    removeSelectedClass(mainClassCode);

    // Tüm alt sınıfları kaldır
    classData.subClasses.forEach((sc, index) => {
        const code = `${classNumber}-${index + 1}`;
        removeSelectedClass(code);
    });
}

function isClassFullySelected(classNumber) {
    const classData = allNiceData.find(c => c.classNumber === parseInt(classNumber));
    if (!classData) return false;

    const mainClassCode = `${classNumber}-main`;
    const isMainSelected = selectedClasses[mainClassCode];
    
    const selectedSubCount = classData.subClasses.filter((sc, index) => {
        const code = `${classNumber}-${index + 1}`;
        return selectedClasses[code];
    }).length;
    
    const allSubClassesSelected = selectedSubCount === classData.subClasses.length && classData.subClasses.length > 0;
    
    return isMainSelected || allSubClassesSelected;
}

// Görsel durumları güncelle
function updateVisualStates() {
    allNiceData.forEach(cls => {
        const classNumber = cls.classNumber;
        const mainClassCode = `${classNumber}-main`;

        const isMainSelected = selectedClasses[mainClassCode];
        const selectedSubCount = cls.subClasses.filter((sc, index) => {
            const code = `${classNumber}-${index + 1}`;
            return selectedClasses[code];
        }).length;

        const allSubClassesSelected = selectedSubCount === cls.subClasses.length && cls.subClasses.length > 0;
        const someSubClassesSelected = selectedSubCount > 0;

        const headerElement = document.querySelector(`.class-header[data-id="${classNumber}"]`);
        const accordionElement = document.getElementById(`subclasses-${classNumber}`);

        if (headerElement) {
            headerElement.classList.remove('selected', 'partially-selected', 'fully-selected');

            if (isMainSelected || allSubClassesSelected) {
                headerElement.classList.add('selected', 'fully-selected');
                if (accordionElement) accordionElement.classList.add('show');
            } else if (someSubClassesSelected) {
                headerElement.classList.add('selected', 'partially-selected');
                if (accordionElement) accordionElement.classList.add('show');
            } else {
                // hiçbir seçim yok → accordion'u kapat
                if (accordionElement) accordionElement.classList.remove('show');
                headerElement.classList.remove('expanded');
            }
        }

        cls.subClasses.forEach((sc, index) => {
            const code = `${classNumber}-${index + 1}`;
            const subElement = document.querySelector(`[data-code="${code}"]`);
            if (subElement) {
                subElement.classList.toggle('selected', !!selectedClasses[code]);
            }
        });
    });
}

// 35-5 MODAL FONKSİYONLARI
function openClass35_5Modal() {
    // Modal HTML'ini oluştur
    const modalHTML = `
<div id="class35-5-modal" class="class-35-5-modal">
    <div class="class-35-5-modal-content">
        <div class="class-35-5-modal-header">
            <h3>
                <i class="fas fa-shopping-cart mr-2"></i>
                (35-5) Müşterilerin Malları - Mal Seçimi
            </h3>
            <button class="close-modal-btn" onclick="closeClass35_5Modal(false)">&times;</button>
        </div>
        
        <div class="class-35-5-modal-body">
            <div class="row align-items-stretch">
                <div class="col-lg-8">
                    <div class="classification-panel">
                        <div class="panel-header">
                            <h5 class="mb-0">
                                <i class="fas fa-list-ul mr-2"></i>
                                Mal Sınıfları (1-34)
                            </h5>
                            <small class="text-white-50">35-5 hizmeti için uygun mal sınıflarını seçin</small>
                        </div>
                        
                        <div class="search-section">
                            <div class="input-group">
                                <div class="input-group-prepend">
                                    <span class="input-group-text">
                                        <i class="fas fa-search"></i>
                                    </span>
                                </div>
                                <input type="text" class="form-control" id="class35-5-search" 
                                        placeholder="Mal sınıfı ara...">
                                <div class="input-group-append">
                                    <button class="btn btn-outline-secondary" type="button" onclick="clearClass35_5Search()">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="classes-list" id="class35-5-list" 
                                style="height: 450px; overflow-y: auto; background: #fafafa;">
                            <div class="loading-spinner text-center p-4">
                                <div class="spinner-border text-primary"></div>
                                <p class="mt-2 text-muted">Mal sınıfları yükleniyor...</p>
                            </div>
                        </div>

                        <div class="custom-class-section">
                            <div class="d-flex align-items-center mb-2">
                                <span class="badge badge-danger mr-2" style="font-size: 11px;">99</span>
                                <strong class="text-danger">Özel Mal Tanımı</strong>
                            </div>
                            <div class="input-group">
                                <textarea class="form-control" id="class35-5-custom-input" 
                                        placeholder="Özel mal tanımınızı yazın..."
                                        maxlength="1000" rows="2"></textarea>
                                <div class="input-group-append">
                                    <button class="btn btn-danger" type="button" id="class35-5-add-custom">
                                        <i class="fas fa-plus mr-1"></i>Ekle
                                    </button>
                                </div>
                            </div>
                            <small class="form-text text-muted">
                                <span id="class35-5-char-count">0</span> / 1.000 karakter
                            </small>
                        </div>
                    </div>
                </div>

                <div class="col-lg-4">
                    <div class="selected-classes-panel">
                        <div class="panel-header d-flex justify-content-between align-items-center">
                            <h5 class="mb-0">
                                <i class="fas fa-check-circle mr-2"></i>
                                Seçilen Mallar
                            </h5>
                            <span class="badge badge-light" id="class35-5-selected-count">0</span>
                        </div>
                        <div class="border-bottom p-2 d-flex justify-content-end">
                            <button type="button" class="btn btn-sm btn-outline-danger" id="clearGoodsBtn">
                                <i class="fas fa-trash-alt mr-1"></i>Temizle
                            </button>
                        </div>
                        <div class="selected-classes-content" id="class35-5-selected-items">
                            <div class="empty-state">
                                <i class="fas fa-shopping-basket fa-3x text-muted mb-3"></i>
                                <p class="text-muted">
                                    Henüz mal seçilmedi.<br>
                                    Sol panelden mal sınıflarını seçin.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="class-35-5-modal-footer">
            <button type="button" class="btn btn-secondary" onclick="closeClass35_5Modal(false)">
                <i class="fas fa-times mr-1"></i>İptal
            </button>
            <button type="button" class="btn btn-primary" id="class35-5-save-btn">
                <i class="fas fa-save mr-1"></i>Kaydet
            </button>
        </div>
    </div>
</div>
`;
    
    // Modal'ı DOM'a ekle
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Modal'ı göster
    document.getElementById('class35-5-modal').style.display = 'flex';
    
    // Modal içeriğini yükle
    loadClass35_5ModalContent();
    
    // Güncellenmiş event listener'ları kur
    setupClass35_5ModalEvents();
}

function closeClass35_5Modal(isCanceled) {
    try {
        console.log('Modal kapatılıyor...');
        
        // Eğer işlem iptal edildiyse, modal seçimlerini temizle
        if (isCanceled) {
            class35_5_modalSelectedItems = {};
            console.log('İşlem iptal edildi, modal seçimleri temizlendi.');
        }

        const modal = document.getElementById('class35-5-modal');
        if (modal) {
            modal.remove();
            console.log('Modal DOM\'dan kaldırıldı');
        }
        
    } catch (error) {
        console.error('Modal kapatma hatası:', error);
    }
}

async function loadClass35_5ModalContent() {
    try {
        // 1-34 arası mal sınıflarını filtrele
        const goodsClasses = allNiceData.filter(cls => 
            cls.classNumber >= 1 && cls.classNumber <= 34
        );
        
        class35_5_modalAllData = goodsClasses;
        
        let html = '';
        goodsClasses.forEach(cls => {
            html += `
                <div class="class-item" data-search-text="${(cls.classNumber + ' ' + cls.classTitle).toLowerCase()}">
                    <div class="class-header" data-class-number="${cls.classNumber}">
                        <div class="class-header-content">
                            <i class="fas fa-chevron-down toggle-icon"></i> <span class="class-number">${cls.classNumber}</span>
                            <span class="class-title">${cls.classTitle}</span>
                        </div>
                        <div class="class-header-actions">
                            <button class="select-class-btn" data-class-number="${cls.classNumber}" title="Tüm sınıfı seç">
                                <i class="fas fa-check"></i>
                            </button>
                        </div>
                    </div>
                    <div class="subclasses-container" id="modal-subclasses-${cls.classNumber}">`;
            
            if (cls.subClasses.length > 0) {
                cls.subClasses.forEach((sc, index) => {
                    const code = `${cls.classNumber}-${index + 1}`;
                    html += `
                        <div class="subclass-item" data-code="${code}" data-class-num="${cls.classNumber}" data-text="${sc.subClassDescription}">
                            <span class="subclass-code">(${code})</span> ${sc.subClassDescription}
                        </div>`;
                });
            } else {
                html += `<div class="p-3 text-muted">Bu sınıfta alt kategori bulunmuyor</div>`;
            }
            html += `</div></div>`;
        });
        
        document.getElementById('class35-5-list').innerHTML = html;
        
        // Event listener'ları ekle
        setupClass35_5ModalEvents();
        
    } catch (error) {
        console.error('35-5 modal yüklenirken hata:', error);
        document.getElementById('class35-5-list').innerHTML = `
            <div class="alert alert-danger">Mal sınıfları yüklenemedi: ${error.message}</div>
        `;
    }
}

function setupClass35_5ModalEvents() {
    const listContainer = document.getElementById('class35-5-list');
    const searchInput = document.getElementById('class35-5-search');
    const customInput = document.getElementById('class35-5-custom-input');
    const addCustomBtn = document.getElementById('class35-5-add-custom');
    const saveBtn = document.getElementById('class35-5-save-btn');
    const charCount = document.getElementById('class35-5-char-count');
    
    // YENİ EKLENDİ: Temizle butonu dinleyicisi
    const clearBtn = document.getElementById('clearGoodsBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearClass35_5Selection);
    }
    
    // Karakter sayacı
    if (customInput && charCount) {
        customInput.addEventListener('input', (e) => {
            charCount.textContent = e.target.value.length.toLocaleString('tr-TR');
        });
    }

    // Liste tıklamaları - BASİT VE NET
    if (listContainer) {
        listContainer.addEventListener('click', (e) => {
            console.log('Liste tıklama eventi:', e.target);
            
            // Ana sınıf seç butonu
            const selectBtn = e.target.closest('.select-class-btn');
            if (selectBtn) {
                e.preventDefault();
                e.stopPropagation();
                const classNumber = parseInt(selectBtn.dataset.classNumber);
                console.log('Ana sınıf seç butonu tıklandı:', classNumber);
                selectWholeClass35_5(classNumber);
                return;
            }

            // Alt sınıf seçimi
            const subclass = e.target.closest('.subclass-item');
            if (subclass) {
                e.preventDefault();
                e.stopPropagation();
                const code = subclass.dataset.code;
                const classNum = subclass.dataset.classNum;
                const text = subclass.dataset.text;
                
                console.log('Alt sınıf tıklandı:', { code, classNum, text });
                
                if (class35_5_modalSelectedItems[code]) {
                    removeClass35_5(code);
                } else {
                    addClass35_5(code, classNum, text);
                }
                return;
            }

            // Header tıklama (accordion)
            const header = e.target.closest('.class-header');
            if (header && !e.target.closest('.select-class-btn')) {
                const classNumber = header.dataset.classNumber;
                const container = document.getElementById(`modal-subclasses-${classNumber}`);
                if (container) {
                    container.classList.toggle('show');
                    header.classList.toggle('expanded');
                }
            }
        });
    }

    // Arama
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            listContainer.querySelectorAll('.class-item').forEach(item => {
                const shouldShow = item.dataset.searchText.includes(term);
                item.style.display = shouldShow ? '' : 'none';
                
                if (shouldShow && term.length > 2) {
                    const container = item.querySelector('.subclasses-container');
                    if (container) container.classList.add('show');
                    const header = item.querySelector('.class-header');
                    if (header) header.classList.add('expanded');
                }
            });
        });
    }

    // Özel mal ekleme
    if (addCustomBtn) {
        addCustomBtn.addEventListener('click', () => {
            const text = customInput.value.trim();
            if (!text) return alert('Lütfen özel mal tanımını girin');
            const code = `99-${Date.now()}`;
            addClass35_5(code, '99', text);
            customInput.value = '';
            if (charCount) charCount.textContent = '0';
        });
    }

    // Kaydet butonu
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            console.log('Kaydet butonu tıklandı');
            console.log('Kaydetme öncesi class35_5_modalSelectedItems:', class35_5_modalSelectedItems);
            saveClass35_5Selection();
        });
    }
}
// 35-5 modal yardımcı fonksiyonları
function addClass35_5(code, classNum, text) {
    try {
        if (class35_5_modalSelectedItems[code]) {
            console.log('Zaten seçili:', code);
            return;
        }
        
        console.log('Mal ekleniyor:', { code, classNum, text });
        class35_5_modalSelectedItems[code] = { classNum, text };
        
        renderClass35_5Selected();
        updateClass35_5VisualStates();
        
        console.log('Mal başarıyla eklendi. Toplam:', Object.keys(class35_5_modalSelectedItems).length);
        console.log('Güncel class35_5_modalSelectedItems:', class35_5_modalSelectedItems);
    } catch (error) {
        console.error('Mal ekleme hatası:', error);
    }
}

function removeClass35_5(code) {
    try {
        if (!class35_5_modalSelectedItems[code]) {
            console.log('Zaten seçili değil:', code);
            return;
        }
        
        console.log('Mal kaldırılıyor:', code);
        delete class35_5_modalSelectedItems[code];
        
        renderClass35_5Selected();
        updateClass35_5VisualStates();
        
        console.log('Mal başarıyla kaldırıldı. Kalan:', Object.keys(class35_5_modalSelectedItems).length);
    } catch (error) {
        console.error('Mal kaldırma hatası:', error);
    }
}

function selectWholeClass35_5(classNumber) {
    const classData = class35_5_modalAllData.find(c => c.classNumber === classNumber);
    if (!classData) return;

    // Ana sınıf başlığını ekle
    const mainCode = `${classNumber}-main`;
    addClass35_5(mainCode, classNumber, classData.classTitle);

    // Tüm alt sınıfları ekle
    classData.subClasses.forEach((sc, index) => {
        const code = `${classNumber}-${index + 1}`;
        addClass35_5(code, classNumber, sc.subClassDescription);
    });

    // Sınıfı genişlet
    const container = document.getElementById(`modal-subclasses-${classNumber}`);
    if (container) container.classList.add('show');
}

function renderClass35_5Selected() {
    const container = document.getElementById('class35-5-selected-items');
    const countBadge = document.getElementById('class35-5-selected-count');
    
    if (!container) return;

    const count = Object.keys(class35_5_modalSelectedItems).length;
    countBadge.textContent = count;

    if (count === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-basket fa-3x text-muted mb-3"></i>
                <p class="text-muted">
                    Henüz mal seçilmedi.<br>
                    Sol panelden mal sınıflarını seçin.
                </p>
            </div>`;
        return;
    }

    const grouped = {};
    Object.entries(class35_5_modalSelectedItems).forEach(([code, item]) => {
        if (!grouped[item.classNum]) grouped[item.classNum] = [];
        grouped[item.classNum].push({ code, text: item.text });
    });

    let html = '';
    Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b)).forEach(classNum => {
        grouped[classNum].forEach(item => {
            const isCustom = classNum === '99';
            const displayCode = isCustom ? classNum : item.code;
            html += `
            <div class="selected-class-item ${isCustom ? 'custom' : ''}">
                <div class="selected-class-number">Sınıf ${displayCode}</div>
                <p class="selected-class-description">${item.text}</p>
                <button class="remove-selected-btn" data-key="${item.code}" title="Kaldır" onclick="removeClass35_5('${item.code}')">&times;</button>
            </div>`;
        });
    });
    
    container.innerHTML = html;
}

function updateClass35_5VisualStates() {
    class35_5_modalAllData.forEach(cls => {
        const classNumber = cls.classNumber;
        
        // Alt sınıfları kontrol et
        const selectedSubCount = cls.subClasses.filter((sc, index) => {
            const code = `${classNumber}-${index + 1}`;
            return class35_5_modalSelectedItems[code];
        }).length;
        
        const allSelected = selectedSubCount === cls.subClasses.length && cls.subClasses.length > 0;
        const someSelected = selectedSubCount > 0;

        // Header'ı güncelle
        const header = document.querySelector(`#class35-5-modal .class-header[data-class-number="${classNumber}"]`);
        if (header) {
            header.classList.remove('selected', 'partially-selected', 'fully-selected');
            
            if (allSelected) {
                header.classList.add('selected', 'fully-selected');
            } else if (someSelected) {
                header.classList.add('selected', 'partially-selected');
            }
        }

        // Alt sınıfları güncelle
        cls.subClasses.forEach((sc, index) => {
            const code = `${classNumber}-${index + 1}`;
            const subElement = document.querySelector(`#class35-5-modal [data-code="${code}"]`);
            if (subElement) {
                if (class35_5_modalSelectedItems[code]) {
                    subElement.classList.add('selected');
                } else {
                    subElement.classList.remove('selected');
                }
            }
        });
    });
}

function saveClass35_5Selection() {
    try {
        console.log('=== KAYDETME BAŞLIYOR ===');
        console.log('class35_5_modalSelectedItems içeriği:', class35_5_modalSelectedItems);
        
        const itemCount = Object.keys(class35_5_modalSelectedItems).length;
        console.log('Seçili item sayısı:', itemCount);
        
        if (itemCount === 0) {
            console.log('❌ Hiç mal seçilmemiş');
            alert('Lütfen en az bir mal seçin.');
            return;
        }

        console.log('✅ Mallar bulundu, kaydetme devam ediyor...');

        // Seçilen malları metin olarak birleştir
        const selectedTexts = Object.values(class35_5_modalSelectedItems)
            .map(item => {
                console.log('İşlenen item:', item);
                return item.text || item;
            })
            .join(', ');

        console.log('Birleştirilmiş metin:', selectedTexts);

        // 35-5 metnini güncelle
        const originalText = "(35-5) Müşterilerin malları elverişli bir şekilde görüp satın alabilmeleri için … mallarının bir araya getirilmesi hizmetleri (belirtilen hizmetler perakende satış mağazaları, toptan satış mağazaları, elektronik ortamlar, katalog ve benzeri diğer yöntemler ile sağlanabilir)";
        const updatedText = originalText.replace('…', selectedTexts);

        // Ana sistemdeki 35-5 kaydını güncelle
        const code35_5 = "35-5";
        
        if (selectedClasses && selectedClasses[code35_5]) {
            selectedClasses[code35_5].text = updatedText;
            renderSelectedClasses();
            console.log('✅ 35-5 kaydı güncellendi');
        } else {
            console.log('35-5 kaydı bulunamadı, yeni kayıt oluşturuluyor...');
            if (selectedClasses) {
                selectedClasses[code35_5] = {
                    classNum: '35',
                    text: updatedText
                };
                renderSelectedClasses();
            }
        }

        // ÖNEMLİ: Modal'ı kapatmadan ÖNCE sayıyı kaydet
        const finalCount = itemCount;
        
        // Modal'ı kapat (bu seçimleri siler)
        closeClass35_5Modal();
        
        // Başarı mesajı - KAYDEDILEN SAYIYI KULLAN
        alert(`✅ 35-5 hizmeti başarıyla güncellendi!\n${finalCount} mal kategorisi eklendi.`);
        
    } catch (error) {
        console.error('❌ Kaydetme hatası:', error);
        alert('Kaydetme sırasında hata oluştu:\n' + error.message);
    }
}

function clearClass35_5Search() {
    const searchInput = document.getElementById('class35-5-search');
    if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
    }
}
function clearClass35_5Selection() {
    try {
        console.log('35-5 modal seçimleri temizleniyor...');
        class35_5_modalSelectedItems = {}; // Seçimleri sıfırla
        renderClass35_5Selected(); // Sağ paneli yeniden çiz
        updateClass35_5VisualStates(); // Sol paneli yeniden çiz
        console.log('✅ 35-5 modal seçimleri temizlendi.');
    } catch (error) {
        console.error('❌ 35-5 seçimlerini temizleme hatası:', error);
    }
}

// MAIN INITIALIZATION FUNCTION
export async function initializeNiceClassification() {
    const listContainer = document.getElementById('niceClassificationList');
    const searchInput = document.getElementById('niceClassSearch');
    const addCustomBtn = document.getElementById('addCustomClassBtn');
    const customInput = document.getElementById('customClassInput');
    const selectedContainer = document.getElementById('selectedNiceClasses');
    const charCountElement = document.getElementById('customClassCharCount');

    if (!listContainer) return;

    // Karakter sayacı
    if (customInput && charCountElement) {
        customInput.addEventListener('input', (e) => {
            charCountElement.textContent = e.target.value.length.toLocaleString('tr-TR');
        });
    }

    listContainer.innerHTML = `
        <div class="loading-spinner text-center p-4">
            <div class="spinner-border text-primary"></div>
            <p class="mt-2 text-muted">Nice sınıfları yükleniyor...</p>
        </div>`;

    try {
        const snapshot = await getDocs(collection(db, "niceClassification"));
        allNiceData = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                classNumber: data.classNumber,
                classTitle: data.classTitle,
                subClasses: data.subClasses || []
            };
        }).sort((a, b) => parseInt(a.classNumber) - parseInt(b.classNumber));

        let html = '';
        allNiceData.forEach(c => {
            html += `
                <div class="class-item" data-search-text="${(c.classNumber + ' ' + c.classTitle).toLowerCase()}">
                    <div class="class-header" data-id="${c.classNumber}">
                        <div class="class-header-content">
                            <i class="fas fa-chevron-down toggle-icon"></i> <span class="class-number">${c.classNumber}</span>
                            <span class="class-title">${c.classTitle}</span>
                        </div>
                        <div class="class-header-actions">
                            <button class="select-class-btn" data-class-number="${c.classNumber}" title="Tüm sınıfı seç/kaldır">
                                <i class="fas fa-check"></i>
                            </button>
                        </div>
                    </div>
                    <div class="subclasses-container" id="subclasses-${c.classNumber}">`;
            if (c.subClasses.length > 0) {
                c.subClasses.forEach((sc, index) => {
                    const code = `${c.classNumber}-${index + 1}`;
                    html += `
                        <div class="subclass-item" data-code="${code}" data-class-num="${c.classNumber}" data-text="${sc.subClassDescription}">
                            <span class="subclass-code">(${code})</span> ${sc.subClassDescription}
                        </div>`;
                });
            } else {
                html += `<div class="p-3 text-muted">Bu sınıfta alt kategori bulunmuyor</div>`;
            }
            html += `</div></div>`;
        });
        listContainer.innerHTML = html;

        // Event Listeners
        listContainer.addEventListener('click', e => {
            // Ana sınıf seç/kaldır butonu
            const selectBtn = e.target.closest('.select-class-btn');
            if (selectBtn) {
                e.preventDefault();
                e.stopPropagation();
                const classNumber = selectBtn.dataset.classNumber;
                
                if (isClassFullySelected(classNumber)) {
                    deselectWholeClass(classNumber);
                } else {
                    selectWholeClass(classNumber);
                }
                return;
            }

            const header = e.target.closest('.class-header');
            const sub = e.target.closest('.subclass-item');
            
            // Alt sınıf seçimi
            if (sub) {
                const code = sub.dataset.code;
                if (selectedClasses[code]) {
                    removeSelectedClass(code);
                } else {
                    selectItem(code, sub.dataset.classNum, sub.dataset.text);
                }
                return;
            }
            
            // Header tıklama (accordion)
            if (header && !e.target.closest('.select-class-btn')) {
                toggleAccordion(header.dataset.id);
            }
        });

        selectedContainer.addEventListener('click', e => {
            const btn = e.target.closest('.remove-selected-btn');
            if (btn) removeSelectedClass(btn.dataset.key);
        });

        searchInput.addEventListener('input', e => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#niceClassificationList .class-item').forEach(el => {
                const shouldShow = el.dataset.searchText.includes(term);
                el.style.display = shouldShow ? '' : 'none';
                
                // Arama sonuçları için sınıfları otomatik genişlet
                if (shouldShow && term.length > 2) {
                    const collapseElement = el.querySelector('.subclasses-container');
                    if (collapseElement) collapseElement.classList.add('show');
                    const header = el.querySelector('.class-header');
                    if (header) header.classList.add('expanded');
                }
            });
        });

        addCustomBtn?.addEventListener('click', () => {
            const text = customInput.value.trim();
            if (!text) return alert('Lütfen özel sınıf metnini girin');
            const code = `99-${Date.now()}`;
            selectItem(code, '99', text);
            customInput.value = '';
            // Karakter sayacını sıfırla
            if (charCountElement) charCountElement.textContent = '0';
        });

        customInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                addCustomBtn.click();
            }
        });

    } catch (err) {
        console.error("Nice sınıfları yüklenirken hata:", err);
        listContainer.innerHTML = `<div class="error-state">Sınıflar yüklenemedi: ${err.message}</div>`;
    }
}

export function clearAllSelectedClasses() {
    selectedClasses = {};
    renderSelectedClasses();
    updateVisualStates();
    document.querySelectorAll('.subclass-item.selected').forEach(el => el.classList.remove('selected'));
}

export function getSelectedNiceClasses() {
    return Object.entries(selectedClasses).map(([k, v]) => {
        return v.classNum === '99' ? `(99) ${v.text}` : `(${k}) ${v.text}`;
    });
}

// Global fonksiyonları window'a ekle
window.clearAllSelectedClasses = clearAllSelectedClasses;
window.clearNiceSearch = () => {
    const input = document.getElementById('niceClassSearch');
    if (input) {
        input.value = '';
        input.dispatchEvent(new Event('input'));
    }
};

// 35-5 Modal fonksiyonlarını window'a ekle  
window.openClass35_5Modal = openClass35_5Modal;
window.closeClass35_5Modal = closeClass35_5Modal;
window.clearClass35_5Search = clearClass35_5Search;
window.removeClass35_5 = removeClass35_5;
window.addClass35_5 = addClass35_5;