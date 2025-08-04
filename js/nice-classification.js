// js/nice-classification.js
import { db } from '../firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let allNiceData = [];
let selectedClasses = {};

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
            html += `
            <div class="selected-class-item ${isCustom ? 'custom' : ''}">
                <div class="selected-class-number">Sınıf ${classNum}</div>
                <p class="selected-class-description">${item.text}</p>
                <button class="remove-selected-btn" data-key="${item.code}" title="Kaldır">&times;</button>
            </div>`;
        });
    });
    container.innerHTML = html;
}

function selectSubClass(code, classNum, text) {
    if (selectedClasses[code]) return;
    selectedClasses[code] = { classNum, text };
    renderSelectedClasses();
    document.querySelector(`[data-code="${code}"]`)?.classList.add('selected');
}

function removeSelectedClass(code) {
    if (!selectedClasses[code]) return;
    delete selectedClasses[code];
    renderSelectedClasses();
    document.querySelector(`[data-code="${code}"]`)?.classList.remove('selected');
}

export async function initializeNiceClassification() {
    const listContainer = document.getElementById('niceClassificationList');
    const searchInput = document.getElementById('niceClassSearch');
    const addCustomBtn = document.getElementById('addCustomClassBtn');
    const customInput = document.getElementById('customClassInput');
    const selectedContainer = document.getElementById('selectedNiceClasses');

    if (!listContainer) return;

    listContainer.innerHTML = `
        <div class="loading-spinner text-center p-4">
            <div class="spinner-border text-primary"></div>
            <p class="mt-2 text-muted">Nice sınıfları yükleniyor...</p>
        </div>`;

    try {
        const querySnapshot = await getDocs(collection(db, "niceClassification"));
        if (querySnapshot.empty) throw new Error('Nice sınıfları bulunamadı');

        allNiceData = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                classNumber: data.classNumber,
                classTitle: data.classTitle,
                subClasses: (data.subClasses || []).map((sc, idx) => ({
                    code: `${data.classNumber.toString().padStart(2, "0")}-${idx + 1}`,
                    description: sc.subClassDescription
                }))
            };
        }).sort((a, b) => a.classNumber - b.classNumber);

        let html = '';
        allNiceData.forEach(cls => {
            html += `
            <div class="class-item" data-search-text="${(cls.classTitle || '').toLowerCase()}">
                <div class="class-header" data-bs-toggle="collapse" data-bs-target="#subclasses-${cls.classNumber}">
                    <span class="class-number">${cls.classNumber}</span>
                    <span class="class-title">${cls.classTitle}</span>
                    <i class="fas fa-chevron-down toggle-icon"></i>
                </div>
                <div id="subclasses-${cls.classNumber}" class="subclasses-container collapse">`;

            if (cls.subClasses.length > 0) {
                cls.subClasses.forEach(sc => {
                    html += `
                        <div class="subclass-item" data-code="${sc.code}" data-class-num="${cls.classNumber}" data-text="${sc.description}">
                            <span class="subclass-code">(${sc.code})</span> ${sc.description}
                        </div>`;
                });
            } else {
                html += `<div class="text-muted p-3">Bu sınıfta alt kategori bulunmuyor</div>`;
            }
            html += `</div></div>`;
        });

        listContainer.innerHTML = html;

        listContainer.addEventListener('click', (e) => {
            const subclass = e.target.closest('.subclass-item');
            if (subclass) {
                selectSubClass(subclass.dataset.code, subclass.dataset.classNum, subclass.dataset.text);
                return;
            }
            const header = e.target.closest('.class-header');
            if (header) header.classList.toggle('expanded');
        });

        searchInput?.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            listContainer.querySelectorAll('.class-item').forEach(item => {
                item.style.display = item.dataset.searchText.includes(term) ? '' : 'none';
            });
        });

        addCustomBtn?.addEventListener('click', () => {
            const text = customInput.value.trim();
            if (!text) return alert('Lütfen özel sınıf metnini girin');
            const code = `99-${Date.now()}`;
            selectSubClass(code, '99', text);
            customInput.value = '';
        });

        customInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addCustomBtn.click();
        });

        selectedContainer.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-selected-btn');
            if (removeBtn) removeSelectedClass(removeBtn.dataset.key);
        });
    } catch (error) {
        listContainer.innerHTML = `<div class="alert alert-danger">Sınıflar yüklenemedi: ${error.message}</div>`;
        console.error(error);
    }
}

export function clearAllSelectedClasses() {
    selectedClasses = {};
    renderSelectedClasses();
    document.querySelectorAll('.subclass-item.selected').forEach(el => el.classList.remove('selected'));
}

export function getSelectedNiceClasses() {
    return Object.entries(selectedClasses).map(([code, val]) =>
        val.classNum === '99' ? `(99) ${val.text}` : `(${code}) ${val.text}`
    );
}

window.clearAllSelectedClasses = clearAllSelectedClasses;
window.clearNiceSearch = () => {
    const searchInput = document.getElementById('niceClassSearch');
    if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
    }
};
