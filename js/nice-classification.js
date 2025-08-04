// js/nice-classification.js - MEVCUDUNUZDEKİ KODUN ÜZERİNE EKLEMELİ GÜNCELLEMESİ

import { db } from '../firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let allNiceData = [];
let selectedClasses = {};  // { key: { classNum, text } }

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

function selectItem(key, classNum, text) {
    if (selectedClasses[key]) return; // zaten seçili
    selectedClasses[key] = { classNum, text };
    renderSelectedClasses();
    updateVisualStates(); // YENİ

    const el = document.querySelector(`[data-code="${key}"]`);
    if (el) el.classList.add('selected');
}

function removeSelectedClass(key) {
    if (!selectedClasses[key]) return;
    delete selectedClasses[key];
    renderSelectedClasses();
    updateVisualStates(); // YENİ
    const el = document.querySelector(`[data-code="${key}"]`);
    if (el) el.classList.remove('selected');
}

// YENİ FONKSİYONLAR - ANA SINIF SEÇİMİ
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

// YENİ: Görsel durumları güncelle
function updateVisualStates() {
    allNiceData.forEach(cls => {
        const classNumber = cls.classNumber;
        const mainClassCode = `${classNumber}-main`;
        
        // Ana sınıf seçili mi kontrol et
        const isMainSelected = selectedClasses[mainClassCode];
        
        // Alt sınıflardan kaç tanesi seçili
        const selectedSubCount = cls.subClasses.filter((sc, index) => {
            const code = `${classNumber}-${index + 1}`;
            return selectedClasses[code];
        }).length;
        
        const allSubClassesSelected = selectedSubCount === cls.subClasses.length && cls.subClasses.length > 0;
        const someSubClassesSelected = selectedSubCount > 0;

        // Ana sınıf header'ını bul ve güncelle
        const headerElement = document.querySelector(`.class-header[data-id="${classNumber}"]`);
        if (headerElement) {
            headerElement.classList.remove('selected', 'partially-selected', 'fully-selected');
            
            if (isMainSelected || allSubClassesSelected) {
                headerElement.classList.add('selected', 'fully-selected');
            } else if (someSubClassesSelected) {
                headerElement.classList.add('selected', 'partially-selected');
            }
        }

        // Alt sınıfları güncelle
        cls.subClasses.forEach((sc, index) => {
            const code = `${classNumber}-${index + 1}`;
            const subElement = document.querySelector(`[data-code="${code}"]`);
            if (subElement) {
                if (selectedClasses[code]) {
                    subElement.classList.add('selected');
                } else {
                    subElement.classList.remove('selected');
                }
            }
        });
    });
}

export async function initializeNiceClassification() {
    const listContainer = document.getElementById('niceClassificationList');
    const searchInput = document.getElementById('niceClassSearch');
    const addCustomBtn = document.getElementById('addCustomClassBtn');
    const customInput = document.getElementById('customClassInput');
    const selectedContainer = document.getElementById('selectedNiceClasses');
    const charCountElement = document.getElementById('customClassCharCount');

    if (!listContainer) return;

    // KARAKTER SAYACI EKLEME - MEVCUT
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
                            <span class="class-number">${c.classNumber}</span>
                            <span class="class-title">${c.classTitle}</span>
                        </div>
                        <div class="class-header-actions">
                            <button class="select-class-btn" data-class-number="${c.classNumber}" title="Tüm sınıfı seç/kaldır">
                                <i class="fas fa-check"></i>
                            </button>
                            <i class="fas fa-chevron-down toggle-icon"></i>
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

        // GÜNCEL EVENT LİSTENERLAR
        listContainer.addEventListener('click', e => {
            // Ana sınıf seç/kaldır butonu - YENİ
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
            
            // Alt sınıf seçimi - GÜNCELLENDİ
            if (sub) {
                const code = sub.dataset.code;
                if (selectedClasses[code]) {
                    removeSelectedClass(code);
                } else {
                    selectItem(code, sub.dataset.classNum, sub.dataset.text);
                }
                return;
            }
            
            // Header tıklama (accordion) - MEVCUT
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
            selectItem(code, '99', text); // selectSubClass yerine selectItem
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
    updateVisualStates(); // YENİ
    document.querySelectorAll('.subclass-item.selected').forEach(el => el.classList.remove('selected'));
}

export function getSelectedNiceClasses() {
    return Object.entries(selectedClasses).map(([k, v]) => {
        return v.classNum === '99' ? `(99) ${v.text}` : `(${k}) ${v.text}`;
    });
}

window.clearAllSelectedClasses = clearAllSelectedClasses;
window.clearNiceSearch = () => {
    const input = document.getElementById('niceClassSearch');
    if (input) {
        input.value = '';
        input.dispatchEvent(new Event('input'));
    }
};