import { db } from '../firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Modülün durumunu (state) yöneten değişkenler
let allNiceData = [];
// Seçilen sınıfları saklamak için nesne yapısı. Anahtar: subclass-kodu, Değer: { classNum, text }
// Örnek: { '01-1': { classNum: '01', text: 'Kimyasallar...' }, '99-12345': { classNum: '99', text: 'Özel metin' } }
let selectedClasses = {};

/**
 * Seçilen sınıfları sağdaki panelde görüntüler.
 */
function renderSelectedClasses() {
    const container = document.getElementById('selectedNiceClasses');
    const countBadge = document.getElementById('selectedClassCount');
    if (!container || !countBadge) return;

    const selectedKeys = Object.keys(selectedClasses);
    countBadge.textContent = selectedKeys.length;

    if (selectedKeys.length === 0) {
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

    // Seçilenleri sınıf numarasına göre gruplayalım
    const grouped = {};
    selectedKeys.forEach(key => {
        const item = selectedClasses[key];
        if (!grouped[item.classNum]) {
            grouped[item.classNum] = [];
        }
        grouped[item.classNum].push({ key, text: item.text });
    });

    let html = '';
    // Ana sınıf numarasına göre sırala
    Object.keys(grouped).sort((a,b) => parseInt(a) - parseInt(b)).forEach(classNum => {
        const items = grouped[classNum];
        items.forEach(item => {
            const isCustom = classNum === '99';
            html += `
            <div class="selected-class-item ${isCustom ? 'custom' : ''}">
                <div class="selected-class-number">Sınıf ${classNum}</div>
                <p class="selected-class-description">${item.text}</p>
                <button class="remove-selected-btn" data-key="${item.key}" title="Kaldır">&times;</button>
            </div>`;
        });
    });

    container.innerHTML = html;
}

/**
 * Bir alt sınıf seçildiğinde veya seçimi kaldırıldığında tetiklenir.
 * @param {string} subClassCode - Benzersiz alt sınıf kodu (örn: "03-2")
 * @param {string} classNum - Ana sınıf numarası (örn: "03")
 * @param {string} text - Alt sınıfın tam metni
 */
function selectSubClass(subClassCode, classNum, text) {
    if (selectedClasses[subClassCode]) {
        // Zaten seçiliyse bir şey yapma (kaldırma butonu ayrı)
        return;
    }
    selectedClasses[subClassCode] = { classNum, text };
    renderSelectedClasses();
}

/**
 * Seçilen bir sınıfı listeden kaldırır.
 * @param {string} subClassCode - Kaldırılacak alt sınıfın kodu
 */
function removeSelectedClass(subClassCode) {
    if (selectedClasses[subClassCode]) {
        delete selectedClasses[subClassCode];
        renderSelectedClasses();
    }
}

/**
 * Nice sınıflandırma bileşenini başlatır.
 */
export async function initializeNiceClassification() {
    const listContainer = document.getElementById('niceClassificationList');
    const searchInput = document.getElementById('niceClassSearch');
    const addCustomBtn = document.getElementById('addCustomClassBtn');
    const customInput = document.getElementById('customClassInput');
    const selectedContainer = document.getElementById('selectedNiceClasses');

    if (!listContainer || !searchInput || !addCustomBtn || !customInput || !selectedContainer) {
        console.error('Nice Classification için gerekli HTML elementleri bulunamadı.');
        return;
    }

    listContainer.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner-border text-primary" role="status"><span class="sr-only">Yükleniyor...</span></div>
            <p class="mt-2 text-muted">Nice sınıfları yükleniyor...</p>
        </div>`;

    try {
        const querySnapshot = await getDocs(collection(db, "niceClassification"));
        allNiceData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allNiceData.sort((a, b) => parseInt(a.id) - parseInt(b.id));

        let html = '';
        allNiceData.forEach(classData => {
            const title = classData.title || `Sınıf ${classData.id} Başlıkları`;
            const searchableText = `${classData.id} ${title} ${Object.values(classData.subclasses || {}).join(' ')}`.toLowerCase();

            html += `
            <div class="class-item" data-search-text="${searchableText}">
                <div class="class-header" data-toggle="collapse" data-target="#subclasses-${classData.id}">
                    <span class="class-number">${classData.id}</span>
                    <span class="class-title">${title}</span>
                    <i class="fas fa-chevron-down toggle-icon"></i>
                </div>
                <div id="subclasses-${classData.id}" class="subclasses-container collapse">`;
            
            if (classData.subclasses) {
                const sortedSubclasses = Object.entries(classData.subclasses).sort((a, b) => a[0].localeCompare(b[0]));
                for (const [subClassCode, subClassText] of sortedSubclasses) {
                    html += `<div class="subclass-item" data-code="${subClassCode}" data-class-num="${classData.id}" data-text="${subClassText}">
                                <span class="subclass-code">(${subClassCode})</span> ${subClassText}
                             </div>`;
                }
            }
            html += `</div></div>`;
        });
        listContainer.innerHTML = html;

        // Event Listeners
        listContainer.addEventListener('click', (e) => {
            const subclass = e.target.closest('.subclass-item');
            if (subclass) {
                selectSubClass(subclass.dataset.code, subclass.dataset.classNum, subclass.dataset.text);
            }
            
            const header = e.target.closest('.class-header');
            if(header) {
                header.classList.toggle('expanded');
            }
        });

        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            listContainer.querySelectorAll('.class-item').forEach(item => {
                const searchableText = item.dataset.searchText;
                if (searchableText.includes(searchTerm)) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
        });

        addCustomBtn.addEventListener('click', () => {
            const text = customInput.value.trim();
            if (text) {
                const key = `99-${Date.now()}`;
                selectSubClass(key, '99', text);
                customInput.value = '';
            }
        });

        selectedContainer.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-selected-btn');
            if (removeBtn) {
                removeSelectedClass(removeBtn.dataset.key);
            }
        });

    } catch (error) {
        console.error("Nice sınıfları yüklenirken hata oluştu: ", error);
        listContainer.innerHTML = `<div class="error-state">Sınıflar yüklenemedi. Lütfen tekrar deneyin.</div>`;
    }
}

/**
 * Tüm seçilen sınıfları temizler.
 */
export function clearAllSelectedClasses() {
    selectedClasses = {};
    renderSelectedClasses();
}

/**
 * Kaydetme işlemi için seçilen sınıfları formatlanmış bir dizi olarak döndürür.
 * @returns {string[]} Seçilen mal ve hizmetlerin listesi.
 */
export function getSelectedNiceClasses() {
    return Object.entries(selectedClasses).map(([key, value]) => {
        // 99. sınıfın özel metni için formatlama
        if (value.classNum === '99') {
            return `(99) ${value.text}`;
        }
        return `(${key}) ${value.text}`;
    });
}

// Butonların global scope'ta erişilebilir olması için window'a ekliyoruz.
window.clearAllSelectedClasses = clearAllSelectedClasses;
window.clearNiceSearch = () => {
    const searchInput = document.getElementById('niceClassSearch');
    if (searchInput) {
        searchInput.value = '';
        // Arama olayını manuel tetikle
        searchInput.dispatchEvent(new Event('input'));
    }
};
