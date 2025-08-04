// Firebase servislerini projenizin ana yapılandırma dosyasından alıyoruz.
import { db } from '../firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Bu modülün durumunu (state) yönetecek değişkenler
let allNiceData = [];
// Seçilen sınıfları ve alt sınıfları saklamak için nesne yapısı.
// Örnek: { '01': { '01-1': 'Kimyasallar...', '01-2': 'Gübreler...' }, '99': {'99-12345': 'Özel metin'} }
let selectedClasses = {};

/**
 * Seçilen sınıfları sağdaki panelde görüntüler.
 */
function renderSelectedClasses() {
    const container = document.getElementById('selected-classes-list-container');
    if (!container) return;

    let html = '';
    // Sınıf numaralarına göre sıralama yapıyoruz (01, 02, ..., 45, 99)
    const sortedClassNumbers = Object.keys(selectedClasses).sort((a, b) => a - b);

    for (const classNum of sortedClassNumbers) {
        const subClasses = selectedClasses[classNum];
        // Sadece içinde en az bir alt sınıf seçilmiş olan ana sınıfları göster
        if (Object.keys(subClasses).length > 0) {
            html += `<div class="selected-class-group">`;
            html += `<h6>Sınıf ${classNum}</h6>`;
            html += `<ul>`;
            for (const subClassCode in subClasses) {
                html += `<li>(${subClassCode}) ${subClasses[subClassCode]}</li>`;
            }
            html += `</ul>`;
            html += `</div>`;
        }
    }
    container.innerHTML = html;
}

/**
 * Checkbox durum değişikliklerini yönetir ve seçilenleri günceller.
 * @param {Event} event - Checkbox'ın change event'i
 */
function handleCheckboxChange(event) {
    const checkbox = event.target;
    const classNum = checkbox.dataset.classNum;
    const subClassCode = checkbox.dataset.subclassCode;
    const subClassText = checkbox.dataset.subclassText;

    // Eğer bu sınıfa ait ilk seçim yapılıyorsa, ana sınıf için bir nesne oluştur.
    if (!selectedClasses[classNum]) {
        selectedClasses[classNum] = {};
    }

    // Tıklanan bir ana sınıf checkbox'ı ise (Sınıf 01, Sınıf 02 gibi)
    if (!subClassCode) {
        const subClassCheckboxes = document.querySelectorAll(`input[data-class-num='${classNum}'][data-subclass-code]`);
        // Ana checkbox seçiliyse, tüm alt checkbox'ları seç ve listeye ekle.
        if (checkbox.checked) {
            subClassCheckboxes.forEach(subCheckbox => {
                subCheckbox.checked = true;
                selectedClasses[classNum][subCheckbox.dataset.subclassCode] = subCheckbox.dataset.subclassText;
            });
        } else { // Seçim kaldırılıyorsa, tüm alt checkbox'ların seçimini kaldır ve ana sınıfı listeden sil.
            subClassCheckboxes.forEach(subCheckbox => {
                subCheckbox.checked = false;
            });
            delete selectedClasses[classNum];
        }
    }
    // Tıklanan bir alt sınıf checkbox'ı ise
    else {
        if (checkbox.checked) {
            selectedClasses[classNum][subClassCode] = subClassText;
        } else {
            delete selectedClasses[classNum][subClassCode];
            // Eğer bir ana sınıfın tüm alt sınıflarının seçimi kaldırıldıysa, ana sınıfı da listeden sil.
            if (Object.keys(selectedClasses[classNum]).length === 0) {
                delete selectedClasses[classNum];
            }
        }
        // Alt sınıflardaki değişime göre ana checkbox'ın durumunu güncelle (hepsi seçiliyse ana da seçili olsun).
        const allSubCheckboxes = document.querySelectorAll(`input[data-class-num='${classNum}'][data-subclass-code]`);
        const allChecked = Array.from(allSubCheckboxes).every(cb => cb.checked);
        document.querySelector(`input[data-class-num='${classNum}']:not([data-subclass-code])`).checked = allChecked;
    }

    renderSelectedClasses();
}

/**
 * Arama kutusuna yazılan metne göre sınıf listesini filtreler.
 * @param {Event} event - Arama kutusunun input event'i
 */
function handleSearch(event) {
    const searchTerm = event.target.value.toLowerCase().trim();
    const classItems = document.querySelectorAll('.nice-class-item');

    classItems.forEach(item => {
        const classTitle = item.querySelector('label').textContent.toLowerCase();
        const subClassItems = item.querySelectorAll('.nice-subclass-item');
        let hasMatchInSubClasses = false;

        subClassItems.forEach(subItem => {
            const subClassText = subItem.querySelector('label').textContent.toLowerCase();
            if (subClassText.includes(searchTerm)) {
                subItem.style.display = '';
                hasMatchInSubClasses = true;
            } else {
                subItem.style.display = 'none';
            }
        });

        // Eğer arama metni ana sınıf başlığında veya herhangi bir alt sınıf metninde geçiyorsa, ana sınıfı göster.
        if (classTitle.includes(searchTerm) || hasMatchInSubClasses) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

/**
 * Nice sınıflandırma bileşenini başlatır, verileri Firestore'dan çeker ve HTML'i oluşturur.
 */
export async function initializeNiceClassification() {
    const listContainer = document.getElementById('nice-classes-list-container');
    if (!listContainer) {
        console.error('Nice sınıflandırma listesi konteyneri bulunamadı!');
        return;
    }
    listContainer.innerHTML = '<p>Sınıflar yükleniyor...</p>';

    try {
        // 'niceclassification' koleksiyonundan verileri çekiyoruz.
        const querySnapshot = await getDocs(collection(db, "niceclassification"));
        allNiceData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sınıf numarasına göre sıralıyoruz.
        allNiceData.sort((a, b) => parseInt(a.id) - parseInt(b.id));

        let html = '';
        allNiceData.forEach(classData => {
            html += `<div class="nice-class-item">`;
            html += `<div class="form-check">
                        <input class="form-check-input" type="checkbox" value="" id="class-${classData.id}" data-class-num="${classData.id}">
                        <label class="form-check-label fw-bold" for="class-${classData.id}">Sınıf ${classData.id}</label>
                     </div>`;

            if (classData.subclasses) {
                // Alt sınıfları kodlarına göre sıralayarak ekliyoruz.
                const sortedSubclasses = Object.entries(classData.subclasses).sort((a, b) => a[0].localeCompare(b[0]));
                for (const [subClassCode, subClassText] of sortedSubclasses) {
                    html += `<div class="nice-subclass-item form-check">
                                <input class="form-check-input" type="checkbox" value="" id="subclass-${subClassCode}" data-class-num="${classData.id}" data-subclass-code="${subClassCode}" data-subclass-text="${subClassText}">
                                <label class="form-check-label" for="subclass-${subClassCode}">(${subClassCode}) ${subClassText}</label>
                             </div>`;
                }
            }
            html += `</div>`;
        });
        listContainer.innerHTML = html;

        // Event Listeners (Olay Dinleyicileri)
        listContainer.addEventListener('change', handleCheckboxChange);
        document.getElementById('nice-class-search').addEventListener('input', handleSearch);

        const add99Btn = document.getElementById('add-class-99-btn');
        const class99Container = document.getElementById('class-99-input-container');
        const save99Btn = document.getElementById('save-class-99-btn');
        const cancel99Btn = document.getElementById('cancel-class-99-btn');
        const text99Area = document.getElementById('class-99-text');

        add99Btn.addEventListener('click', () => { class99Container.style.display = 'block'; });
        cancel99Btn.addEventListener('click', () => { class99Container.style.display = 'none'; });

        save99Btn.addEventListener('click', () => {
            const text = text99Area.value.trim();
            if (text) {
                if (!selectedClasses['99']) {
                    selectedClasses['99'] = {};
                }
                // Benzersiz bir anahtar kullanıyoruz ki birden fazla 99. sınıf metni eklenebilsin.
                const uniqueKey = `99-${Date.now()}`;
                selectedClasses['99'][uniqueKey] = text;
                renderSelectedClasses();
                text99Area.value = '';
                class99Container.style.display = 'none';
            }
        });

    } catch (error) {
        console.error("Nice sınıfları yüklenirken hata oluştu: ", error);
        listContainer.innerHTML = '<p class="text-danger">Sınıflar yüklenemedi. Lütfen tekrar deneyin.</p>';
    }
}

/**
 * Kaydetme işlemi için seçilen sınıfları formatlanmış bir dizi olarak döndürür.
 * @returns {string[]} Seçilen mal ve hizmetlerin listesi. Örn: ["(01-1) Kimyasallar...", "(99) Özel metin"]
 */
export function getSelectedNiceClasses() {
    const goodsAndServices = [];
    const sortedClassNumbers = Object.keys(selectedClasses).sort((a, b) => a - b);

    for (const classNum of sortedClassNumbers) {
        const subClasses = selectedClasses[classNum];
        const sortedSubClassCodes = Object.keys(subClasses).sort();

        for (const subClassCode of sortedSubClassCodes) {
            const subClassText = subClasses[subClassCode];
            // 99. sınıf için özel formatlama
            if (classNum === '99') {
                 goodsAndServices.push(`(99) ${subClassText}`);
            } else {
                 goodsAndServices.push(`(${subClassCode}) ${subClassText}`);
            }
        }
    }
    return goodsAndServices;
}
