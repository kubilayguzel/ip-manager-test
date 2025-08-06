// nice-classification.js - Gelişmiş debug ve hata yakalama

import { db } from '../firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let allNiceData = [];
let selectedClasses = {};
let isInitialized = false;

// Enhanced Debug Logging
function debugLog(level, message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] NICE-${level}:`;
    
    if (data) {
        console.log(prefix, message, data);
    } else {
        console.log(prefix, message);
    }
}

// RENDER FONKSİYONLARI
function renderSelectedClasses() {
    const container = document.getElementById('selectedNiceClasses');
    const countBadge = document.getElementById('selectedClassCount');
    
    debugLog('RENDER', 'renderSelectedClasses başlatıldı');
    
    if (!container) {
        debugLog('ERROR', 'selectedNiceClasses container bulunamadı!');
        return;
    }

    const selectedCount = Object.keys(selectedClasses).length;
    if (countBadge) {
        countBadge.textContent = selectedCount;
    }

    debugLog('INFO', `Render ediliyor: ${selectedCount} seçili sınıf`);

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
    debugLog('SUCCESS', `${selectedCount} sınıf başarıyla render edildi`);
}

function toggleAccordion(id) {
    debugLog('ACTION', `toggleAccordion çağrıldı: ${id}`);
    const el = document.getElementById(`subclasses-${id}`);
    if (!el) {
        debugLog('ERROR', `Accordion element bulunamadı: subclasses-${id}`);
        return;
    }
    el.classList.toggle('show');
    const header = document.querySelector(`.class-header[data-id="${id}"]`);
    if (header) header.classList.toggle('expanded');
    debugLog('SUCCESS', `Accordion toggle tamamlandı: ${id}`);
}

// SEÇIM FONKSİYONLARI
function selectItem(key, classNum, text) {
    debugLog('ACTION', `selectItem çağrıldı`, { key, classNum, textPreview: text?.substring(0, 50) });
    
    if (selectedClasses[key]) {
        debugLog('WARN', `Sınıf zaten seçili: ${key}`);
        return;
    }
    
    selectedClasses[key] = { classNum, text };
    debugLog('SUCCESS', `Sınıf eklendi: ${key}`);
    
    renderSelectedClasses();
    updateVisualStates();

    const el = document.querySelector(`[data-code="${key}"]`);
    if (el) {
        el.classList.add('selected');
        debugLog('SUCCESS', `Element visual state güncellendi: ${key}`);
    } else {
        debugLog('WARN', `Element bulunamadı: ${key}`);
    }
}

function removeSelectedClass(key) {
    debugLog('ACTION', `removeSelectedClass çağrıldı: ${key}`);
    
    if (!selectedClasses[key]) {
        debugLog('WARN', `Sınıf zaten seçili değil: ${key}`);
        return;
    }
    
    delete selectedClasses[key];
    debugLog('SUCCESS', `Sınıf kaldırıldı: ${key}`);
    
    renderSelectedClasses();
    updateVisualStates();
    
    const el = document.querySelector(`[data-code="${key}"]`);
    if (el) {
        el.classList.remove('selected');
    }
}

// ANA SINIF FONKSİYONLARI
function selectWholeClass(classNumber) {
    debugLog('ACTION', `selectWholeClass çağrıldı: ${classNumber}`);
    const classData = allNiceData.find(c => c.classNumber === parseInt(classNumber));
    if (!classData) {
        debugLog('ERROR', `Class data bulunamadı: ${classNumber}`);
        return;
    }

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
    
    debugLog('SUCCESS', `Ana sınıf seçimi tamamlandı: ${classNumber}`);
}

function deselectWholeClass(classNumber) {
    debugLog('ACTION', `deselectWholeClass çağrıldı: ${classNumber}`);
    const classData = allNiceData.find(c => c.classNumber === parseInt(classNumber));
    if (!classData) return;

    const mainClassCode = `${classNumber}-main`;
    removeSelectedClass(mainClassCode);

    classData.subClasses.forEach((sc, index) => {
        const code = `${classNumber}-${index + 1}`;
        removeSelectedClass(code);
    });
    
    debugLog('SUCCESS', `Ana sınıf kaldırma tamamlandı: ${classNumber}`);
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

function updateVisualStates() {
    debugLog('RENDER', 'updateVisualStates başlatıldı');
    
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

// MAIN INITIALIZATION FUNCTION - GELİŞMİŞ HATA YAKALAMA
export async function initializeNiceClassification() {
    debugLog('INIT', '=== Nice Classification başlatılıyor ===');
    
    if (isInitialized) {
        debugLog('WARN', 'Nice Classification zaten initialize edilmiş');
        return;
    }

    // DOM elementleri kontrolü
    const elements = {
        listContainer: document.getElementById('niceClassificationList'),
        searchInput: document.getElementById('niceClassSearch'),
        addCustomBtn: document.getElementById('addCustomClassBtn'),
        customInput: document.getElementById('customClassInput'),
        selectedContainer: document.getElementById('selectedNiceClasses'),
        charCountElement: document.getElementById('customClassCharCount')
    };

    debugLog('INIT', 'DOM elementleri kontrol:', {
        listContainer: !!elements.listContainer,
        searchInput: !!elements.searchInput,
        addCustomBtn: !!elements.addCustomBtn,
        customInput: !!elements.customInput,
        selectedContainer: !!elements.selectedContainer,
        charCountElement: !!elements.charCountElement
    });

    if (!elements.listContainer) {
        debugLog('ERROR', 'KRITIK: niceClassificationList container bulunamadı!');
        return;
    }

    // Loading state
    elements.listContainer.innerHTML = `
        <div class="loading-spinner text-center p-4">
            <div class="spinner-border text-primary"></div>
            <p class="mt-2 text-muted">Nice sınıfları yükleniyor...</p>
        </div>`;

    try {
        // Firebase import kontrolü
        debugLog('INIT', 'Firebase modülleri kontrol ediliyor...');
        
        if (!db) {
            throw new Error('Firebase db nesnesi tanımsız');
        }
        
        debugLog('INIT', 'Firebase bağlantısı OK, veriler yükleniyor...');
        
        // Firestore'dan veri çekme
        const snapshot = await getDocs(collection(db, "niceClassification"));
        
        if (snapshot.empty) {
            throw new Error('niceClassification koleksiyonu boş');
        }
        
        allNiceData = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                classNumber: data.classNumber,
                classTitle: data.classTitle,
                subClasses: data.subClasses || []
            };
        }).sort((a, b) => a.classNumber - b.classNumber);

        debugLog('SUCCESS', `${allNiceData.length} nice sınıfı yüklendi`);

        // HTML render
        renderClassificationList();
        
        // Event listeners
        setupEventListeners();
        
        // Character counter
        if (elements.customInput && elements.charCountElement) {
            elements.customInput.addEventListener('input', (e) => {
                const length = e.target.value.length;
                elements.charCountElement.textContent = length.toLocaleString('tr-TR');
                
                if (length > 45000) {
                    elements.charCountElement.style.color = '#dc3545';
                    elements.charCountElement.style.fontWeight = 'bold';
                } else if (length > 40000) {
                    elements.charCountElement.style.color = '#fd7e14';
                } else {
                    elements.charCountElement.style.color = '#6c757d';
                    elements.charCountElement.style.fontWeight = 'normal';
                }
            });
        }
        
        isInitialized = true;
        debugLog('SUCCESS', '=== Nice Classification başarıyla initialize edildi ===');
        
    } catch (error) {
        debugLog('ERROR', 'KRITIK HATA:', error);
        
        elements.listContainer.innerHTML = `
            <div class="error-state text-center p-4">
                <div class="alert alert-danger">
                    <h5><i class="fas fa-exclamation-triangle"></i> Yükleme Hatası</h5>
                    <p><strong>Hata:</strong> ${error.message}</p>
                    <hr>
                    <div class="text-left small">
                        <strong>Olası Çözümler:</strong><br>
                        1. Sayfayı yenileyin (F5)<br>
                        2. Firebase bağlantısını kontrol edin<br>
                        3. niceClassification koleksiyonunun varlığını kontrol edin<br>
                        4. Konsolda detaylı hata mesajlarını inceleyin
                    </div>
                    <button class="btn btn-primary btn-sm mt-3" onclick="location.reload()">
                        <i class="fas fa-refresh"></i> Sayfayı Yenile
                    </button>
                </div>
            </div>`;
    }
}

function renderClassificationList() {
    const listContainer = document.getElementById('niceClassificationList');
    if (!listContainer) return;

    debugLog('RENDER', `Classification listesi render ediliyor: ${allNiceData.length} sınıf`);

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
    debugLog('SUCCESS', 'Classification listesi başarıyla render edildi');
}

function setupEventListeners() {
    debugLog('INIT', 'Event listeners kuruluyor...');
    
    const listContainer = document.getElementById('niceClassificationList');
    const searchInput = document.getElementById('niceClassSearch');
    const addCustomBtn = document.getElementById('addCustomClassBtn');
    const customInput = document.getElementById('customClassInput');
    const selectedContainer = document.getElementById('selectedNiceClasses');

    if (!listContainer) {
        debugLog('ERROR', 'listContainer yok, event listeners kurulamıyor');
        return;
    }

    // Ana click handler
    listContainer.addEventListener('click', e => {
        debugLog('EVENT', 'List container click', { target: e.target.className });

        // Ana sınıf seç/kaldır butonu
        const selectBtn = e.target.closest('.select-class-btn');
        if (selectBtn) {
            e.preventDefault();
            e.stopPropagation();
            const classNumber = selectBtn.dataset.classNumber;
            
            debugLog('ACTION', `Ana sınıf butonu tıklandı: ${classNumber}`);
            
            if (isClassFullySelected(classNumber)) {
                deselectWholeClass(classNumber);
            } else {
                selectWholeClass(classNumber);
            }
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
            
            debugLog('ACTION', `Alt sınıf tıklandı: ${code}`);
            
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
            debugLog('ACTION', `Header tıklandı, accordion toggle: ${headerId}`);
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
                debugLog('ACTION', `Remove button tıklandı: ${key}`);
                removeSelectedClass(key);
            }
        });
    }

    // Arama
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            const term = e.target.value.toLowerCase();
            debugLog('ACTION', `Arama yapılıyor: ${term}`);
            document.querySelectorAll('#niceClassificationList .class-item').forEach(el => {
                const shouldShow = el.dataset.searchText.includes(term);
                el.style.display = shouldShow ? '' : 'none';
                
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
        debugLog('INIT', '99. sınıf butonu event listener ekleniyor');
        
        addCustomBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            const text = customInput.value.trim();
            debugLog('ACTION', `99. sınıf ekleme denemesi: ${text?.substring(0, 30)}...`);
            
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
            selectItem(code, '99', text);
            
            customInput.value = '';
            const charCountElement = document.getElementById('customClassCharCount');
            if (charCountElement) {
                charCountElement.textContent = '0';
                charCountElement.style.color = '#6c757d';
                charCountElement.style.fontWeight = 'normal';
            }
            
            debugLog('SUCCESS', `99. sınıf başarıyla eklendi: ${code}`);
        });
    } else {
        debugLog('WARN', '99. sınıf butonu bulunamadı');
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

    debugLog('SUCCESS', 'Event listeners başarıyla kuruldu');
}

// EXPORT FONKSİYONLARI
export function clearAllSelectedClasses() {
    debugLog('ACTION', 'Tüm seçimler temizleniyor...');
    selectedClasses = {};
    renderSelectedClasses();
    updateVisualStates();
    document.querySelectorAll('.subclass-item.selected').forEach(el => el.classList.remove('selected'));
    debugLog('SUCCESS', 'Tüm seçimler temizlendi');
}

export function getSelectedNiceClasses() {
    const result = Object.entries(selectedClasses).map(([k, v]) => {
        return v.classNum === '99' ? `(99) ${v.text}` : `(${k}) ${v.text}`;
    });
    
    debugLog('INFO', `getSelectedNiceClasses çağrıldı, sonuç: ${result.length} adet`);
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

// Enhanced Debug fonksiyonu
window.debugNiceClassification = () => {
    debugLog('DEBUG', '=== NICE CLASSIFICATION DEBUG RAPORU ===');
    console.log('🔧 Initialize durumu:', isInitialized);
    console.log('📊 Seçili sınıflar:', selectedClasses);
    console.log('📋 Toplam data:', allNiceData.length, 'sınıf');
    console.log('🎯 getSelectedNiceClasses() sonucu:', getSelectedNiceClasses());
    
    // DOM elementleri kontrol
    const elements = [
        'niceClassificationList', 'selectedNiceClasses', 
        'customClassInput', 'addCustomClassBtn', 'niceClassSearch'
    ];
    console.log('🏗️ DOM elementleri:');
    elements.forEach(id => {
        const element = document.getElementById(id);
        console.log(`  ${id}: ${element ? '✅ Var' : '❌ Yok'}`);
    });
    
    // Global fonksiyonlar kontrol
    const functions = [
        'selectItem', 'removeSelectedClass', 'toggleAccordion',
        'selectWholeClass', 'deselectWholeClass', 'isClassFullySelected'
    ];
    console.log('🌐 Global fonksiyonlar:');
    functions.forEach(fn => {
        console.log(`  window.${fn}: ${typeof window[fn] === 'function' ? '✅ Tanımlı' : '❌ Tanımsız'}`);
    });
    
    return { 
        isInitialized,
        selectedClasses, 
        allNiceData: allNiceData.length,
        selectedCount: Object.keys(selectedClasses).length 
    };
};

debugLog('INIT', '✅ Nice Classification modülü yüklendi');
debugLog('INIT', '🔧 Debug için: window.debugNiceClassification()');