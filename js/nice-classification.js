// js/nice-classification.js
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
                    Sol panelden sınıf ve alt sınıfları seçin.
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
            // ALT SINIF KODU GÖSTER - 99. sınıf için sadece sınıf numarası, diğerleri için tam kod
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

    const el = document.querySelector(`[data-code="${key}"]`);
    if (el) el.classList.add('selected');
}

function removeSelectedClass(key) {
    if (!selectedClasses[key]) return;
    delete selectedClasses[key];
    renderSelectedClasses();
    const el = document.querySelector(`[data-code="${key}"]`);
    if (el) el.classList.remove('selected');
}

export async function initializeNiceClassification() {
    const listContainer = document.getElementById('niceClassificationList');
    const searchInput = document.getElementById('niceClassSearch');
    const addCustomBtn = document.getElementById('addCustomClassBtn');
    const customInput = document.getElementById('customClassInput');
    const selectedContainer = document.getElementById('selectedNiceClasses');
    const charCountElement = document.getElementById('customClassCharCount');

    if (!listContainer) return;

    // KARAKTER SAYACI EKLEME
    customInput?.addEventListener('input', (e) => {
        if (charCountElement) {
            charCountElement.textContent = e.target.value.length.toLocaleString('tr-TR');
        }
    });

    listContainer.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner-border text-primary" role="status">
                <span class="sr-only">Yükleniyor...</span>
            </div>
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
                        <span class="class-number">${c.classNumber}</span>
                        <span class="class-title">${c.classTitle}</span>
                        <i class="fas fa-chevron-down toggle-icon"></i>
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

        // Eventler
        listContainer.addEventListener('click', e => {
            const header = e.target.closest('.class-header');
            const sub = e.target.closest('.subclass-item');
            if (header) toggleAccordion(header.dataset.id);
            if (sub) selectItem(sub.dataset.code, sub.dataset.classNum, sub.dataset.text);
        });

        selectedContainer.addEventListener('click', e => {
            const btn = e.target.closest('.remove-selected-btn');
            if (btn) removeSelectedClass(btn.dataset.key);
        });

        searchInput.addEventListener('input', e => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#niceClassificationList .class-item').forEach(el => {
                el.style.display = el.dataset.searchText.includes(term) ? '' : 'none';
            });
        });

        addCustomBtn.addEventListener('click', () => {
            const text = customInput.value.trim();
            if (text) {
                const key = `99-${Date.now()}`;
                selectItem(key, '99', text);
                customInput.value = '';
            } else {
                alert('Özel sınıf metni giriniz');
            }
        });

        customInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
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
