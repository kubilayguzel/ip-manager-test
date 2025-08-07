// js/nice-classification.js - Complete implementation for Data Entry

import { db } from '../firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let allNiceData = [];
let selectedClasses = {};  // { key: { classNum, text } }

// 35-5 özel modal değişkenleri
let class35_5_modalSelectedItems = {};
let class35_5_modalAllData = [];

function renderSelectedClasses() {
    const container = document.getElementById('selectedClassesList');
    const countBadge = document.getElementById('selectedClassCount');
    
    if (!container) return;

    if (countBadge) {
        countBadge.textContent = Object.keys(selectedClasses).length;
    }

    if (Object.keys(selectedClasses).length === 0) {
        container.innerHTML = `
            <div class="empty-state text-center py-4">
                <i class="fas fa-clipboard-list fa-2x text-muted mb-2"></i>
                <p class="text-muted">Henüz sınıf seçilmedi</p>
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
                <div class="selected-class-number">${displayCode}</div>
                <div class="selected-class-description">${item.text}</div>
                <button class="remove-selected-btn" onclick="removeSelectedClass('${item.code}')">×</button>
            </div>`;
        });
    });
    
    container.innerHTML = html;
}

function selectItem(code, classNum, text) {
    selectedClasses[code] = { classNum, text };
    renderSelectedClasses();
    updateVisualStates();
}

function removeSelectedClass(code) {
    if (selectedClasses[code]) {
        delete selectedClasses[code];
        renderSelectedClasses();
        updateVisualStates();
    }
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
                subElement.classList.toggle('selected', selectedClasses[code]);
            }
        });
    });
}

function handleHeaderClick(classNumber) {
    const isFullySelected = isClassFullySelected(classNumber);
    
    if (isFullySelected) {
        deselectWholeClass(classNumber);
    } else {
        selectWholeClass(classNumber);
    }
}

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

function toggleAccordion(classNumber) {
    const element = document.getElementById(`subclasses-${classNumber}`);
    const header = document.querySelector(`.class-header[data-id="${classNumber}"]`);
    
    if (element && header) {
        element.classList.toggle('show');
        header.classList.toggle('expanded');
    }
}

// MAIN INITIALIZATION FUNCTION
export async function initializeNiceClassification() {
    const listContainer = document.getElementById('niceClassesList');
    const searchInput = document.getElementById('niceClassSearch');
    const customInput = document.getElementById('customGoodsServices');
    const selectedContainer = document.getElementById('selectedClassesList');
    const charCountElement = document.getElementById('customCharCount');

    if (!listContainer) {
        console.log('Nice classification container bulunamadı');
        return;
    }

    // Karakter sayacı
    if (customInput && charCountElement) {
        customInput.addEventListener('input', (e) => {
            const length = e.target.value.length;
            charCountElement.textContent = length;
            
            // Limit kontrolü
            if (length > 500) {
                customInput.value = customInput.value.substring(0, 500);
                charCountElement.textContent = '500';
            }
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
                        <div class="class-header-content" onclick="toggleAccordion(${c.classNumber})">
                            <span class="class-number-badge">${c.classNumber}</span>
                            <span class="class-title">${c.classTitle}</span>
                        </div>
                        <div class="class-header-actions">
                            <button class="select-class-btn" onclick="handleHeaderClick(${c.classNumber})" title="Tüm sınıfı seç/kaldır">
                                <i class="fas fa-check"></i>
                            </button>
                            <i class="fas fa-chevron-down toggle-icon" onclick="toggleAccordion(${c.classNumber})"></i>
                        </div>
                    </div>
                    <div class="subclasses-container" id="subclasses-${c.classNumber}">`;
            
            if (c.subClasses.length > 0) {
                c.subClasses.forEach((sc, index) => {
                    const code = `${c.classNumber}-${index + 1}`;
                    html += `
                        <div class="subclass-item" data-code="${code}" data-class-num="${c.classNumber}" data-text="${sc.subClassDescription}" onclick="handleSubclassClick('${code}', '${c.classNumber}', '${sc.subClassDescription.replace(/'/g, "\\'")}')">
                            <span class="subclass-code">(${code})</span> ${sc.subClassDescription}
                        </div>`;
                });
            } else {
                html += `<div class="p-3 text-muted">Bu sınıfta alt kategori bulunmuyor</div>`;
            }
            html += `</div></div>`;
        });
        
        listContainer.innerHTML = html;

        // Arama fonksiyonu
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().trim();
                const classItems = listContainer.querySelectorAll('.class-item');
                
                classItems.forEach(item => {
                    const searchText = item.dataset.searchText;
                    const shouldShow = !searchTerm || searchText.includes(searchTerm);
                    item.style.display = shouldShow ? 'block' : 'none';
                    
                    if (shouldShow && searchTerm.length > 2) {
                        const container = item.querySelector('.subclasses-container');
                        if (container) container.classList.add('show');
                        const header = item.querySelector('.class-header');
                        if (header) header.classList.add('expanded');
                    }
                });
            });
        }

        renderSelectedClasses();
        console.log('✅ Nice Classification başarıyla yüklendi:', allNiceData.length, 'sınıf');

    } catch (error) {
        console.error('❌ Nice Classification yükleme hatası:', error);
        listContainer.innerHTML = `
            <div class="text-center p-4 text-danger">
                <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                <p>Nice sınıfları yüklenirken hata oluştu</p>
                <small>${error.message}</small>
            </div>`;
    }
}

function handleSubclassClick(code, classNum, text) {
    if (selectedClasses[code]) {
        removeSelectedClass(code);
    } else {
        selectItem(code, classNum, text);
    }
}

// Export function to get selected classes
export function getSelectedNiceClasses() {
    const result = [];
    
    // Seçilen normal sınıfları ekle
    Object.entries(selectedClasses).forEach(([code, item]) => {
        result.push({
            code,
            classNumber: item.classNum,
            description: item.text,
            isCustom: item.classNum === '99'
        });
    });
    
    // Özel mal/hizmet tanımını ekle
    const customInput = document.getElementById('customGoodsServices');
    if (customInput && customInput.value.trim()) {
        result.push({
            code: `99-custom-${Date.now()}`,
            classNumber: '99',
            description: customInput.value.trim(),
            isCustom: true
        });
    }
    
    return result;
}

// Global fonksiyonları window objesine ekle
window.handleHeaderClick = handleHeaderClick;
window.handleSubclassClick = handleSubclassClick;
window.toggleAccordion = toggleAccordion;
window.removeSelectedClass = removeSelectedClass;
window.clearNiceSearch = function() {
    const searchInput = document.getElementById('niceClassSearch');
    if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
    }
};