// nice-classification.js - Düzeltilmiş versiyon
import { collection, getDocs, db } from '../firebase-config.js';

let selectedClasses = {};
let allNiceData = [];
let class35_5_modalSelectedItems = {};

// RENDER FONKSİYONU
function renderSelectedClasses() {
    const container = document.getElementById('selectedNiceClasses');
    if (!container) return;

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

    let html = '';
    Object.entries(selectedClasses).forEach(([key, item]) => {
        if (!item) return;
        
        const isCustom = item.classNum === '99';
        const displayCode = isCustom ? '99' : item.classNum || item.code;
        html += `
        <div class="selected-class-item ${isCustom ? 'custom' : ''}">
            <div class="selected-class-number">Sınıf ${displayCode}</div>
            <p class="selected-class-description">${item.text}</p>
            <button class="remove-selected-btn" data-key="${key}" title="Kaldır">&times;</button>
        </div>`;
    });
    
    container.innerHTML = html;
}

// ACCORDION FONKSİYONU
function toggleAccordion(id) {
    const el = document.getElementById(`subclasses-${id}`);
    if (!el) return;
    el.classList.toggle('show');
    const header = document.querySelector(`.class-header[data-id="${id}"]`);
    if (header) header.classList.toggle('expanded');
}

// SEÇIM FONKSİYONLARI
function selectItem(key, classNum, text) {
    if (selectedClasses[key]) return; // zaten seçili
    
    // 35-5 kontrolü - ÖZEL DURUM
    if (key === "35-5") {
        selectedClasses[key] = { classNum, text };
        renderSelectedClasses();
        updateVisualStates();
        
        const el = document.querySelector(`[data-code="${key}"]`);
        if (el) el.classList.add('selected');
        
        // Modal'ı aç
        setTimeout(() => {
            if (window.openClass35_5Modal) {
                window.openClass35_5Modal();
            }
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

// GÖRSEL DURUMLAR GÜNCELLEMESİ
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

// 35-5 MODAL FONKSİYONLARI (Placeholder - gerçek modal kodları eklenmeli)
function openClass35_5Modal() {
    console.log('35-5 Modal açılıyor...');
    // Modal açma kodları buraya gelecek
}

function closeClass35_5Modal() {
    console.log('35-5 Modal kapanıyor...');
    // Modal kapama kodları buraya gelecek
}

function clearClass35_5Search() {
    const searchInput = document.getElementById('class35-5-search');
    if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
    }
}

function removeClass35_5(code) {
    delete class35_5_modalSelectedItems[code];
    // Modal güncelleme kodları
}

function addClass35_5(code, classNum, text) {
    class35_5_modalSelectedItems[code] = { classNum, text };
    // Modal güncelleme kodları
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
        }).sort((a, b) => a.classNumber - b.classNumber);

        if (allNiceData.length === 0) {
            listContainer.innerHTML = '<div class="empty-state">Hiçbir sınıf bulunamadı</div>';
            return;
        }

        // Sınıfları render et
        renderClassificationList();
        
        // Event listener'ları kur
        setupEventListeners();
        
    } catch (err) {
        console.error("Nice sınıfları yüklenirken hata:", err);
        listContainer.innerHTML = `<div class="error-state">Sınıflar yüklenemedi: ${err.message}</div>`;
    }
}

function renderClassificationList() {
    const listContainer = document.getElementById('niceClassificationList');
    if (!listContainer) return;

    let html = '';
    allNiceData.forEach(cls => {
        const searchText = `${cls.classNumber} ${cls.classTitle} ${cls.subClasses.map(sc => sc.subClassDescription).join(' ')}`.toLowerCase();
        
        html += `
        <div class="class-item" data-search-text="${searchText}">
            <div class="class-header" data-id="${cls.classNumber}">
                <div class="class-header-content">
                    <span class="class-number">${cls.classNumber}</span>
                    <span class="class-title">${cls.classTitle}</span>
                </div>
                <div class="class-header-actions">
                    <button class="select-class-btn" data-class-number="${cls.classNumber}" title="Tüm sınıfı seç">
                        <i class="fas fa-check"></i>
                    </button>
                    <i class="fas fa-chevron-down toggle-icon"></i>
                </div>
            </div>
            <div class="subclasses-container" id="subclasses-${cls.classNumber}">`;

        cls.subClasses.forEach((sc, index) => {
            const code = `${cls.classNumber}-${index + 1}`;
            html += `
                <div class="subclass-item" data-code="${code}" data-class-num="${cls.classNumber}" data-text="${sc.subClassDescription}">
                    <span class="subclass-code">${code}</span>
                    <span class="subclass-description">${sc.subClassDescription}</span>
                </div>`;
        });

        html += `</div></div>`;
    });

    listContainer.innerHTML = html;
}

function setupEventListeners() {
    const listContainer = document.getElementById('niceClassificationList');
    const searchInput = document.getElementById('niceClassSearch');
    const addCustomBtn = document.getElementById('addCustomClassBtn');
    const customInput = document.getElementById('customClassInput');
    const selectedContainer = document.getElementById('selectedNiceClasses');
    const charCountElement = document.getElementById('customClassCharCount');

    if (!listContainer) return;

    // Ana click handler - accordion sorununu çözer
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

        // Alt sınıf tıklaması
        const subclass = e.target.closest('.subclass-item');
        if (subclass) {
            e.preventDefault();
            e.stopPropagation();
            const code = subclass.dataset.code;
            const classNum = subclass.dataset.classNum;
            const text = subclass.dataset.text;
            
            if (selectedClasses[code]) {
                removeSelectedClass(code);
            } else {
                selectItem(code, classNum, text);
            }
            return;
        }

        // Header tıklama (accordion)
        const header = e.target.closest('.class-header');
        if (header && !e.target.closest('.select-class-btn')) {
            toggleAccordion(header.dataset.id);
        }
    });

    // Seçilen sınıfları kaldırma
    if (selectedContainer) {
        selectedContainer.addEventListener('click', e => {
            const btn = e.target.closest('.remove-selected-btn');
            if (btn) {
                e.preventDefault();
                removeSelectedClass(btn.dataset.key);
            }
        });
    }

    // Arama
    if (searchInput) {
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
    }

    // 99. sınıf ekleme
    if (addCustomBtn) {
        addCustomBtn.addEventListener('click', () => {
            const text = customInput.value.trim();
            if (!text) return alert('Lütfen özel sınıf metnini girin');
            const code = `99-${Date.now()}`;
            selectItem(code, '99', text);
            customInput.value = '';
            if (charCountElement) charCountElement.textContent = '0';
        });
    }

    if (customInput) {
        customInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (addCustomBtn) addCustomBtn.click();
            }
        });
    }
}

// EXPORT FONKSİYONLARI
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

// GLOBAL FONKSİYONLARI WINDOW'A EKLE - SORUNUN ANA NEDENİ BURADA!
window.selectItem = selectItem;
window.removeSelectedClass = removeSelectedClass;
window.toggleAccordion = toggleAccordion;
window.selectWholeClass = selectWholeClass;
window.deselectWholeClass = deselectWholeClass;
window.isClassFullySelected = isClassFullySelected;
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