// nice-classification.js - Debug ve seçim sorunları düzeltildi

import { db } from '../firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let allNiceData = [];
let selectedClasses = {};  // { key: { classNum, text } }

// 35-5 özel modal değişkenleri
let class35_5_modalSelectedItems = {};
let class35_5_modalAllData = [];

// DEBUG: Seçim durumunu takip et
function debugSelection(action, key, classNum, text) {
    console.log(`🎯 NICE DEBUG [${action}]:`, {
        key,
        classNum,
        text: text?.substring(0, 50),
        totalSelected: Object.keys(selectedClasses).length,
        selectedClasses: Object.keys(selectedClasses)
    });
}

// RENDER FONKSİYONLARI
function renderSelectedClasses() {
    const container = document.getElementById('selectedNiceClasses');
    const countBadge = document.getElementById('selectedClassCount');
    if (!container) {
        console.error('❌ selectedNiceClasses container bulunamadı');
        return;
    }

    const selectedCount = Object.keys(selectedClasses).length;
    if (countBadge) {
        countBadge.textContent = selectedCount;
    }

    console.log('🔄 renderSelectedClasses çalışıyor, toplam:', selectedCount);

    if (selectedCount === 0) {
        container.innerHTML = `
            <div class="empty-state text-center">
                <i class="fas fa-list-alt fa-3x text-muted mb-3"></i>
                <p class="text-muted">
                    Henüz hiçbir sınıf seçilmedi.<br>
                    Sol panelden sınıf başlığına veya alt sınıfları seçin.
                </p>
            </div>`;
        return;
    }

    // Sınıfları grupla ve sırala
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
    console.log('✅ Selected classes render edildi:', selectedCount);
}

function toggleAccordion(id) {
    console.log('📂 toggleAccordion:', id);
    const el = document.getElementById(`subclasses-${id}`);
    if (!el) {
        console.error('❌ Accordion element bulunamadı:', `subclasses-${id}`);
        return;
    }
    el.classList.toggle('show');
    const header = document.querySelector(`.class-header[data-id="${id}"]`);
    if (header) header.classList.toggle('expanded');
}

// SEÇIM FONKSİYONLARI
function selectItem(key, classNum, text) {
    if (selectedClasses[key]) {
        console.log('⚠️ Sınıf zaten seçili:', key);
        return; // zaten seçili
    }
    
    debugSelection('SELECT', key, classNum, text);
    
    // 35-5 kontrolü - ÖZEL DURUM
    if (key === "35-5") {
        selectedClasses[key] = { classNum, text };
        renderSelectedClasses();
        updateVisualStates();
        
        const el = document.querySelector(`[data-code="${key}"]`);
        if (el) el.classList.add('selected');
        
        // Modal'ı aç (eğer varsa)
        setTimeout(() => {
            if (typeof openClass35_5Modal === 'function') {
                openClass35_5Modal();
            }
        }, 300);
        
        return;
    }
    
    // Normal seçim işlemi
    selectedClasses[key] = { classNum, text };
    renderSelectedClasses();
    updateVisualStates();

    const el = document.querySelector(`[data-code="${key}"]`);
    if (el) {
        el.classList.add('selected');
        console.log('✅ Element selected class eklendi:', key);
    } else {
        console.warn('⚠️ Element bulunamadı:', key);
    }
}

function removeSelectedClass(key) {
    if (!selectedClasses[key]) {
        console.log('⚠️ Sınıf zaten seçili değil:', key);
        return;
    }
    
    debugSelection('REMOVE', key, selectedClasses[key].classNum, selectedClasses[key].text);
    
    delete selectedClasses[key];
    renderSelectedClasses();
    updateVisualStates();
    
    const el = document.querySelector(`[data-code="${key}"]`);
    if (el) {
        el.classList.remove('selected');
        console.log('✅ Element selected class kaldırıldı:', key);
    }
}

// ANA SINIF SEÇİMİ FONKSİYONLARI
function selectWholeClass(classNumber) {
    const classData = allNiceData.find(c => c.classNumber === parseInt(classNumber));
    if (!classData) {
        console.error('❌ Class data bulunamadı:', classNumber);
        return;
    }

    console.log('🔘 Ana sınıf seçiliyor:', classNumber, 'alt sınıf sayısı:', classData.subClasses.length);

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

    console.log('🔘 Ana sınıf kaldırılıyor:', classNumber);

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

// 35-5 MODAL FONKSİYONLARI (Placeholder)
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

    console.log('🔄 Nice Classification başlatılıyor...');
    console.log('📋 DOM Elementleri kontrol:', {
        listContainer: !!listContainer,
        searchInput: !!searchInput,
        addCustomBtn: !!addCustomBtn,
        customInput: !!customInput,
        selectedContainer: !!selectedContainer,
        charCountElement: !!charCountElement
    });

    if (!listContainer) {
        console.error('❌ niceClassificationList container bulunamadı');
        return;
    }

    // Karakter sayacı
    if (customInput && charCountElement) {
        customInput.addEventListener('input', (e) => {
            const length = e.target.value.length;
            charCountElement.textContent = length.toLocaleString('tr-TR');
            
            // Renk uyarıları
            if (length > 45000) {
                charCountElement.style.color = '#dc3545';
                charCountElement.style.fontWeight = 'bold';
            } else if (length > 40000) {
                charCountElement.style.color = '#fd7e14';
            } else {
                charCountElement.style.color = '#6c757d';
                charCountElement.style.fontWeight = 'normal';
            }
        });
    }

    listContainer.innerHTML = `
        <div class="loading-spinner text-center p-4">
            <div class="spinner-border text-primary"></div>
            <p class="mt-2 text-muted">Nice sınıfları yükleniyor...</p>
        </div>`;

    try {
        console.log('🔄 Firebase\'dan nice sınıfları yükleniyor...');
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
            listContainer.innerHTML = '<div class="empty-state text-center p-4">Hiçbir sınıf bulunamadı</div>';
            return;
        }

        console.log('✅ Nice sınıfları yüklendi:', allNiceData.length, 'sınıf');

        // HTML'i render et
        renderClassificationList();
        
        // Event listener'ları kur
        setupEventListeners();
        
    } catch (err) {
        console.error("❌ Nice sınıfları yüklenirken hata:", err);
        listContainer.innerHTML = `<div class="error-state text-center p-4 text-danger">Sınıflar yüklenemedi: ${err.message}</div>`;
    }
}

function renderClassificationList() {
    const listContainer = document.getElementById('niceClassificationList');
    if (!listContainer) return;

    console.log('🔄 Classification listesi render ediliyor...');

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

        if (cls.subClasses.length > 0) {
            cls.subClasses.forEach((sc, index) => {
                const code = `${cls.classNumber}-${index + 1}`;
                html += `
                    <div class="subclass-item" data-code="${code}" data-class-num="${cls.classNumber}" data-text="${sc.subClassDescription}">
                        <span class="subclass-code">(${code})</span> ${sc.subClassDescription}
                    </div>`;
            });
        } else {
            html += `<div class="p-3 text-muted text-center">Bu sınıfta alt kategori bulunmuyor</div>`;
        }

        html += `</div></div>`;
    });

    listContainer.innerHTML = html;
    console.log('✅ Classification listesi render edildi');
}

function setupEventListeners() {
    const listContainer = document.getElementById('niceClassificationList');
    const searchInput = document.getElementById('niceClassSearch');
    const addCustomBtn = document.getElementById('addCustomClassBtn');
    const customInput = document.getElementById('customClassInput');
    const selectedContainer = document.getElementById('selectedNiceClasses');

    console.log('🔧 Nice Classification event listeners kuruluyor...');

    if (!listContainer) {
        console.error('❌ listContainer yok, event listeners kurulamıyor');
        return;
    }

    // ANA CLICK HANDLER - ACCORDION SORUNUNU ÇÖZER
    listContainer.addEventListener('click', e => {
        console.log('🖱️ List container click:', e.target);

        // Ana sınıf seç/kaldır butonu
        const selectBtn = e.target.closest('.select-class-btn');
        if (selectBtn) {
            e.preventDefault();
            e.stopPropagation();
            const classNumber = selectBtn.dataset.classNumber;
            
            console.log('🔘 Ana sınıf butonu tıklandı:', classNumber);
            
            if (isClassFullySelected(classNumber)) {
                deselectWholeClass(classNumber);
            } else {
                selectWholeClass(classNumber);
            }
            return;
        }

        // Alt sınıf seçimi - ACCORDION KAPANMA SORUNU BURADA ÇÖZÜLÜYOR
        const subclass = e.target.closest('.subclass-item');
        if (subclass) {
            e.preventDefault();
            e.stopPropagation(); // ÇOK ÖNEMLİ!
            
            const code = subclass.dataset.code;
            const classNum = subclass.dataset.classNum;
            const text = subclass.dataset.text;
            
            console.log('🎯 Alt sınıf tıklandı:', { code, classNum, text: text?.substring(0, 30) });
            
            if (selectedClasses[code]) {
                removeSelectedClass(code);
            } else {
                selectItem(code, classNum, text);
            }
            return;
        }

        // Header tıklama (accordion toggle)
        const header = e.target.closest('.class-header');
        if (header && !e.target.closest('.select-class-btn')) {
            const headerId = header.dataset.id;
            console.log('📂 Header tıklandı, accordion toggle:', headerId);
            toggleAccordion(headerId);
        }
    });

    // Seçilen sınıfları kaldırma
    if (selectedContainer) {
        selectedContainer.addEventListener('click', e => {
            const btn = e.target.closest('.remove-selected-btn');
            if (btn) {
                e.preventDefault();
                const key = btn.dataset.key;
                console.log('🗑️ Remove button tıklandı:', key);
                removeSelectedClass(key);
            }
        });
    }

    // Arama
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            const term = e.target.value.toLowerCase();
            console.log('🔍 Arama yapılıyor:', term);
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

    // 99. SINIF EKLEME - ANA SORUNUN ÇÖZÜMÜ
    if (addCustomBtn) {
        console.log('✅ 99. sınıf butonu bulundu, event listener ekleniyor');
        
        addCustomBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            const text = customInput.value.trim();
            console.log('➕ 99. sınıf ekleme denemesi:', text?.substring(0, 50));
            
            if (!text) {
                alert('Lütfen özel sınıf metnini girin');
                customInput.focus();
                return;
            }
            
            if (text.length < 5) {
                alert('Özel sınıf metni en az 5 karakter olmalıdır');
                customInput.focus();
                return;
            }
            
            if (text.length > 50000) {
                alert('Özel sınıf metni maksimum 50,000 karakter olabilir');
                customInput.focus();
                return;
            }
            
            const code = `99-${Date.now()}`;
            console.log('🆔 99. sınıf kodu:', code);
            
            // Sınıfı ekle
            selectItem(code, '99', text);
            
            // Input'u temizle
            customInput.value = '';
            const charCountElement = document.getElementById('customClassCharCount');
            if (charCountElement) {
                charCountElement.textContent = '0';
                charCountElement.style.color = '#6c757d';
                charCountElement.style.fontWeight = 'normal';
            }
            
            console.log('✅ 99. sınıf başarıyla eklendi');
        });
    } else {
        console.warn('⚠️ addCustomClassBtn bulunamadı');
    }

    // Enter tuşu ile 99. sınıf ekleme
    if (customInput) {
        customInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (addCustomBtn) {
                    addCustomBtn.click();
                }
            }
        });
    }

    console.log('✅ Nice Classification event listeners kuruldu');
}

// EXPORT FONKSİYONLARI
export function clearAllSelectedClasses() {
    console.log('🧹 Tüm seçimler temizleniyor...');
    selectedClasses = {};
    renderSelectedClasses();
    updateVisualStates();
    document.querySelectorAll('.subclass-item.selected').forEach(el => el.classList.remove('selected'));
    console.log('✅ Tüm seçimler temizlendi');
}

export function getSelectedNiceClasses() {
    const result = Object.entries(selectedClasses).map(([k, v]) => {
        return v.classNum === '99' ? `(99) ${v.text}` : `(${k}) ${v.text}`;
    });
    
    console.log('📋 getSelectedNiceClasses çağrıldı, sonuç:', result.length, 'adet');
    return result;
}

// GLOBAL FONKSİYONLARI WINDOW'A EKLE
window.selectItem = selectItem;
window.removeSelectedClass = removeSelectedClass;
window.toggleAccordion = toggleAccordion;
window.selectWholeClass = selectWholeClass;
window.deselectWholeClass = deselectWholeClass;
window.isClassFullySelected = isClassFullySelected;
window.clearAllSelectedClasses = clearAllSelectedClasses;
window.getSelectedNiceClasses = getSelectedNiceClasses;

window.clearNiceSearch = () => {
    const input = document.getElementById('niceClassSearch');
    if (input) {
        input.value = '';
        input.dispatchEvent(new Event('input'));
    }
};

// 35-5 Modal fonksiyonları
window.openClass35_5Modal = openClass35_5Modal;
window.closeClass35_5Modal = closeClass35_5Modal;
window.clearClass35_5Search = clearClass35_5Search;
window.removeClass35_5 = removeClass35_5;
window.addClass35_5 = addClass35_5;

// Debug fonksiyonu
window.debugNiceClassification = () => {
    console.log('🔍 === NICE CLASSIFICATION DEBUG ===');
    console.log('📊 Seçili sınıflar:', selectedClasses);
    console.log('📋 Toplam data:', allNiceData.length, 'sınıf');
    console.log('🎯 getSelectedNiceClasses() sonucu:', getSelectedNiceClasses());
    console.log('🌐 Global fonksiyonlar:', [
        'selectItem', 'removeSelectedClass', 'toggleAccordion',
        'selectWholeClass', 'deselectWholeClass', 'isClassFullySelected'
    ].map(fn => `${fn}: ${typeof window[fn] === 'function' ? '✅' : '❌'}`));
    
    // DOM elementleri kontrol
    const elements = [
        'niceClassificationList', 'selectedNiceClasses', 
        'customClassInput', 'addCustomClassBtn'
    ];
    console.log('🏗️ DOM elementleri:', elements.map(id => 
        `${id}: ${document.getElementById(id) ? '✅' : '❌'}`
    ));
    
    return { 
        selectedClasses, 
        allNiceData: allNiceData.length,
        selectedCount: Object.keys(selectedClasses).length 
    };
};

// İlk yükleme mesajı
console.log('✅ Nice Classification modülü yüklendi');
console.log('🔧 Debug için: window.debugNiceClassification()');