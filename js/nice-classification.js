// js/nice-classification.js - Tamamen Revize Edilmiş Kod

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
    if (!container || !countBadge) return;

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
                    <button class="remove-selected-btn" data-key="${item.code}" title="Kaldır" onclick="removeSelectedClass('${item.code}')">&times;</button>
                </div>`;
        });
    });
    
    container.innerHTML = html;
}

// 35-5 MODAL FONKSİYONLARI
function openClass35_5Modal() {
    const modalHTML = `
<div class="class-35-5-modal" id="class35-5-modal">
    <div class="class-35-5-modal-content">
        <div class="class-35-5-modal-header">
            <h2>
                <i class="fas fa-shopping-cart mr-2"></i>
                (35-5) Müşterilerin Malları - Mal Seçimi
            </h2>
            <button class="close-modal-btn" onclick="closeClass35_5Modal(true)">&times;</button>
        </div>
        <div class="class-35-5-modal-body">
            <div class="nice-classification-container">
                <div class="row">
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
                                           placeholder="Mal sınıfı arayın...">
                                </div>
                            </div>
                            <div class="classification-list" id="class35-5-list">
                                <div class="text-center p-4">
                                    <div class="spinner-border text-primary" role="status"></div>
                                    <p class="mt-2">Mal sınıfları yükleniyor...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-4">
                        <div class="selected-classes-panel">
                            <div class="panel-header">
                                <h5 class="mb-0">
                                    <i class="fas fa-check-circle mr-2"></i>
                                    Seçilen Mallar
                                    <span class="badge badge-light ml-2" id="class35-5-selected-count">0</span>
                                </h5>
                            </div>
                            <div id="class35-5-selected-items" class="selected-items-container"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="class-35-5-modal-footer">
            <div class="d-flex align-items-center">
                <span class="text-muted">
                    <i class="fas fa-info-circle mr-1"></i>
                    <span id="class35-5-selected-count-footer">0</span> mal seçildi
                </span>
            </div>
            <div class="footer-buttons">
                <button class="btn btn-outline-secondary" onclick="closeClass35_5Modal(false)">
                    <i class="fas fa-times mr-1"></i>İptal
                </button>
                <button class="btn btn-primary" onclick="saveClass35_5Selection()">
                    <i class="fas fa-check mr-1"></i>Seçimi Kaydet
                </button>
            </div>
        </div>
    </div>
</div>`;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.getElementById('class35-5-modal').style.display = 'block';
    
    loadClass35_5ModalContent();
    setupClass35_5ModalEvents();
}

function closeClass35_5Modal(confirm = false) {
    if (confirm && Object.keys(class35_5_modalSelectedItems).length > 0) {
        if (!window.confirm('Seçimleriniz kaybolacak. Kapatmak istediğinizden emin misiniz?')) {
            return;
        }
    }
    
    const modal = document.getElementById('class35-5-modal');
    if (modal) modal.remove();
}

async function loadClass35_5ModalContent() {
    try {
        const goodsClasses = allNiceData.filter(cls => cls.classNumber >= 1 && cls.classNumber <= 34);
        
        class35_5_modalAllData = goodsClasses;
        
        let html = '';
        goodsClasses.forEach(c => {
            html += `
                <div class="class-item" data-search-text="${(c.classNumber + ' ' + c.classTitle).toLowerCase()}">
                    <div class="class-header" data-class-number="${c.classNumber}">
                        <div class="class-header-content">
                            <i class="fas fa-chevron-down toggle-icon"></i>
                            <span class="class-number">${c.classNumber}</span>
                            <span class="class-title">${c.classTitle}</span>
                        </div>
                        <div class="class-header-actions">
                            <button class="select-class-btn" data-class-number="${c.classNumber}" title="Tüm sınıfı seç/kaldır">
                                <i class="fas fa-check"></i>
                            </button>
                        </div>
                    </div>
                    <div class="subclasses-container" id="modal-subclasses-${c.classNumber}">`;
            
            if (c.subClasses.length > 0) {
                c.subClasses.forEach((sc, index) => {
                    const code = `${c.classNumber}-${index + 1}`;
                    const isSelected = class35_5_modalSelectedItems[code] ? 'selected' : '';
                    html += `
                        <div class="subclass-item ${isSelected}" data-code="${code}" data-class-num="${c.classNumber}" data-text="${sc.subClassDescription}">
                            <span class="subclass-code">(${code})</span> ${sc.subClassDescription}
                        </div>`;
                });
            } else {
                html += `<div class="p-3 text-muted">Bu sınıfta alt kategori bulunmuyor</div>`;
            }
            html += `</div></div>`;
        });
        
        document.getElementById('class35-5-list').innerHTML = html;
        updateClass35_5VisualStates();
        renderClass35_5Selected();

    } catch (error) {
        console.error('35-5 modal yüklenirken hata:', error);
        document.getElementById('class35-5-list').innerHTML = `
            <div class="alert alert-danger">Mal sınıfları yüklenemedi: ${error.message}</div>
        `;
    }
}

function setupClass35_5ModalEvents() {
    const modal = document.getElementById('class35-5-modal');
    if (!modal) return;

    // Arama fonksiyonu
    const searchInput = document.getElementById('class35-5-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const classItems = document.querySelectorAll('#class35-5-list .class-item');
            
            classItems.forEach(item => {
                const searchText = item.dataset.searchText || '';
                if (searchText.includes(searchTerm)) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    // Sınıf başlıklarına tıklama - toggle
    modal.addEventListener('click', (e) => {
        const classHeader = e.target.closest('.class-header');
        if (classHeader && !e.target.closest('.select-class-btn')) {
            const classNumber = classHeader.dataset.classNumber;
            toggleClass35_5Accordion(classNumber);
        }

        // Alt sınıf seçme
        const subclassItem = e.target.closest('.subclass-item');
        if (subclassItem) {
            const code = subclassItem.dataset.code;
            const classNum = subclassItem.dataset.classNum;
            const text = subclassItem.dataset.text;
            toggleSubclass35_5Selection(code, classNum, text);
        }

        // Ana sınıf seç/kaldır butonu
        const selectBtn = e.target.closest('.select-class-btn');
        if (selectBtn) {
            const classNumber = selectBtn.dataset.classNumber;
            toggleWholeClass35_5Selection(classNumber);
        }

        // Seçileni kaldır
        const removeBtn = e.target.closest('.remove-selected-btn');
        if (removeBtn) {
            const key = removeBtn.dataset.key;
            removeClass35_5(key);
        }
    });

    // Modal dışına tıklama
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeClass35_5Modal(true);
        }
    });
}

function toggleClass35_5Accordion(classNumber) {
    const container = document.getElementById(`modal-subclasses-${classNumber}`);
    if (!container) return;
    
    const isVisible = container.classList.contains('show');
    
    // Tüm accordion'ları kapat
    document.querySelectorAll('#class35-5-modal .subclasses-container').forEach(sc => {
        sc.classList.remove('show');
    });
    document.querySelectorAll('#class35-5-modal .class-header').forEach(ch => {
        ch.classList.remove('expanded');
    });
    
    // Eğer kapalıysa aç
    if (!isVisible) {
        container.classList.add('show');
        const header = document.querySelector(`#class35-5-modal .class-header[data-class-number="${classNumber}"]`);
        if (header) header.classList.add('expanded');
    }
}

function toggleSubclass35_5Selection(code, classNum, text) {
    if (class35_5_modalSelectedItems[code]) {
        removeClass35_5(code);
    } else {
        addClass35_5(code, classNum, text);
    }
}

function addClass35_5(code, classNum, text) {
    class35_5_modalSelectedItems[code] = { classNum, text };
    updateClass35_5VisualStates();
    renderClass35_5Selected();
}

function removeClass35_5(code) {
    if (class35_5_modalSelectedItems[code]) {
        delete class35_5_modalSelectedItems[code];
        updateClass35_5VisualStates();
        renderClass35_5Selected();
    }
}

function toggleWholeClass35_5Selection(classNumber) {
    const classData = class35_5_modalAllData.find(c => c.classNumber === parseInt(classNumber));
    if (!classData || !classData.subClasses || classData.subClasses.length === 0) return;

    const selectedSubCount = Object.keys(class35_5_modalSelectedItems).filter(key => key.startsWith(`${classNumber}-`)).length;
    const allSelected = selectedSubCount === classData.subClasses.length;

    if (allSelected) {
        // Tüm alt sınıfları kaldır
        deselectWholeClass35_5(classNumber);
    } else {
        // Tüm alt sınıfları seç
        selectWholeClass35_5(classNumber);
    }
}

function selectWholeClass35_5(classNumber) {
    const classData = class35_5_modalAllData.find(c => c.classNumber === parseInt(classNumber));
    if (!classData) return;

    classData.subClasses.forEach((sc, index) => {
        const code = `${classNumber}-${index + 1}`;
        addClass35_5(code, classNumber, sc.subClassDescription);
    });
}

function deselectWholeClass35_5(classNumber) {
    const classData = class35_5_modalAllData.find(c => c.classNumber === parseInt(classNumber));
    if (!classData) return;

    classData.subClasses.forEach((sc, index) => {
        const code = `${classNumber}-${index + 1}`;
        removeClass35_5(code);
    });
}

function updateClass35_5VisualStates() {
    // Seçili sayacları güncelle
    const count = Object.keys(class35_5_modalSelectedItems).length;
    const countBadge = document.getElementById('class35-5-selected-count');
    const countFooter = document.getElementById('class35-5-selected-count-footer');
    if (countBadge) countBadge.textContent = count;
    if (countFooter) countFooter.textContent = count;

    // Her sınıf için görsel durumları güncelle
    class35_5_modalAllData.forEach(cls => {
        const classNumber = cls.classNumber;
        
        const selectedSubCount = Object.keys(class35_5_modalSelectedItems).filter(key => key.startsWith(`${classNumber}-`)).length;
        const allSelected = selectedSubCount === cls.subClasses.length && cls.subClasses.length > 0;
        const someSelected = selectedSubCount > 0;

        const header = document.querySelector(`#class35-5-modal .class-header[data-class-number="${classNumber}"]`);
        if (header) {
            header.classList.remove('selected', 'partially-selected', 'fully-selected');
            
            if (allSelected) {
                header.classList.add('selected', 'fully-selected');
            } else if (someSelected) {
                header.classList.add('selected', 'partially-selected');
            }
        }

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

function renderClass35_5Selected() {
    const container = document.getElementById('class35-5-selected-items');
    if (!container) return;

    const count = Object.keys(class35_5_modalSelectedItems).length;

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
            html += `
                <div class="selected-class-item">
                    <div class="selected-class-number">Sınıf ${item.code}</div>
                    <p class="selected-class-description">${item.text}</p>
                    <button class="remove-selected-btn" data-key="${item.code}" title="Kaldır">&times;</button>
                </div>`;
        });
    });
    container.innerHTML = html;
}

function saveClass35_5Selection() {
    try {
        const itemCount = Object.keys(class35_5_modalSelectedItems).length;
        if (itemCount === 0) {
            alert('Lütfen en az bir mal seçin.');
            return;
        }

        // Seçilen malları ana sisteme aktar
        Object.entries(class35_5_modalSelectedItems).forEach(([code, item]) => {
            selectedClasses[code] = { classNum: item.classNum, text: item.text };
        });

        // 35-5 ana seçimini ekle
        selectedClasses['35-5'] = { classNum: '35', text: 'Müşterilerin malları (seçilen mallar için)' };

        // Ana sistemi güncelle
        renderSelectedClasses();
        updateVisualStates();

        // Modal'ı kapat
        closeClass35_5Modal(false);

        // Başarı mesajı
        console.log(`35-5 hizmeti için ${itemCount} mal seçildi ve kaydedildi.`);
        
    } catch (error) {
        console.error('35-5 seçimi kaydedilirken hata:', error);
        alert('Seçim kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.');
    }
}

// Diğer mevcut fonksiyonlar (değişiklik yok)
function updateVisualStates() {
    allNiceData.forEach(cls => {
        const classNumber = cls.classNumber;
        const classElement = document.querySelector(`[data-class-number="${classNumber}"]`);
        if (!classElement) return;

        const selectedSubCount = Object.keys(selectedClasses).filter(code => 
            selectedClasses[code] && selectedClasses[code].classNum == classNumber && !selectedClasses[code]);
        const hasMainClassSelected = selectedClasses[`${classNumber}-main`];
        const allSelected = hasMainClassSelected || selectedSubCount === cls.subClasses.length;
        const someSelected = selectedSubCount > 0 || hasMainClassSelected;

        classElement.classList.toggle('selected', someSelected);
        classElement.classList.toggle('partially-selected', someSelected && !allSelected);
        classElement.classList.toggle('fully-selected', allSelected);

        cls.subClasses.forEach((sc, index) => {
            const code = `${classNumber}-${index + 1}`;
            const subElement = document.querySelector(`[data-code="${code}"]`);
            if (subElement && selectedClasses[code]) {
                subElement.classList.add('selected');
            } else if (subElement) {
                subElement.classList.remove('selected');
            }
        });
    });
}

function selectItem(key, classNum, text) {
    if (key === "35-5") {
        openClass35_5Modal();
        return;
    }
    
    if (selectedClasses[key]) return;
    
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

function selectWholeClass(classNumber) {
    const classData = allNiceData.find(c => c.classNumber === parseInt(classNumber));
    if (!classData) return;

    const mainClassCode = `${classNumber}-main`;
    selectItem(mainClassCode, classNumber, classData.classTitle);

    classData.subClasses.forEach((sc, index) => {
        const code = `${classNumber}-${index + 1}`;
        selectItem(code, classNumber, sc.subClassDescription);
    });
}

function deselectWholeClass(classNumber) {
    const mainClassCode = `${classNumber}-main`;
    removeSelectedClass(mainClassCode);

    const classData = allNiceData.find(c => c.classNumber === parseInt(classNumber));
    if (classData) {
        classData.subClasses.forEach((sc, index) => {
            const code = `${classNumber}-${index + 1}`;
            removeSelectedClass(code);
        });
    }
}

function toggleAccordion(id) {
    const el = document.getElementById(`subclasses-${id}`);
    if (!el) return;
    el.classList.toggle('show');
    const header = document.querySelector(`.class-header[data-id="${id}"]`);
    if (header) header.classList.toggle('expanded');
}

// Export functions for global access
window.openClass35_5Modal = openClass35_5Modal;
window.closeClass35_5Modal = closeClass35_5Modal;
window.saveClass35_5Selection = saveClass35_5Selection;
window.removeClass35_5 = removeClass35_5;
window.selectItem = selectItem;
window.removeSelectedClass = removeSelectedClass;
window.selectWholeClass = selectWholeClass;
window.deselectWholeClass = deselectWholeClass;
window.toggleAccordion = toggleAccordion;

// Firebase'den veri yükleme ve diğer init fonksiyonları burada devam ediyor...
async function loadNiceClassificationData() {
    try {
        const querySnapshot = await getDocs(collection(db, "nice_classifications"));
        allNiceData = [];
        
        querySnapshot.forEach((doc) => {
            allNiceData.push(doc.data());
        });
        
        allNiceData.sort((a, b) => a.classNumber - b.classNumber);
        console.log('NICE verileri yüklendi:', allNiceData.length, 'sınıf');
        
    } catch (error) {
        console.error("NICE verileri yüklenirken hata:", error);
    }
}

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', function() {
    loadNiceClassificationData();
});