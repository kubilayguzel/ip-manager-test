// js/layout-loader.js
import { authService, personService, db } from '../firebase-config.js';
import { getDoc, doc, collection, addDoc, getDocs, query, where, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showNotification } from './utils.js';

// Menü yapısı
const menuItems = [
    { id: 'dashboard', text: 'Dashboard', link: 'dashboard.html', icon: 'fas fa-tachometer-alt', category: 'Ana Menü' },
    {
        id: 'portfolio-management-accordion',
        text: 'Portföy Yönetimi',
        icon: 'fas fa-folder',
        category: 'Portföy Yönetimi',
        subItems: [
            { id: 'portfolio', text: 'Portföy', link: 'portfolio.html' },
            { id: 'data-entry', text: 'Yeni Kayıt', link: 'data-entry.html' },
            { id: 'excel-upload', text: 'Excel ile Yükle', link: 'excel-upload.html', adminOnly: true }
        ]
    },
    { id: 'reminders', text: 'Hatırlatmalar', link: 'reminders.html', icon: 'fas fa-bell', category: 'Yönetim' },
    {
        id: 'task-management-accordion',
        text: 'İş Yönetimi',
        icon: 'fas fa-briefcase',
        category: 'Yönetim',
        subItems: [
            { id: 'task-management', text: 'İş Yönetimi', link: 'task-management.html' },
            { id: 'my-tasks', text: 'İşlerim', link: 'my-tasks.html' },
            { id: 'create-task', text: 'Yeni İş Oluştur', link: 'create-task.html', specialClass: 'new-task-link' }
        ]
    },
    {
        id: 'new-tasks-accordion',
        text: 'Görevler',
        icon: 'fas fa-clipboard-check',
        category: 'Yönetim',
        subItems: [
            { id: 'scheduled-tasks', text: 'Zamanlanmış Görevler', link: 'scheduled-tasks.html' },
            { id: 'triggered-tasks', text: 'Tetiklenen Görevler', link: 'triggered-tasks.html' },
            { id: 'client-notifications', text: 'Müvekkil Bildirimleri', link: 'notifications.html' }
        ]
    },
    {
        id: 'person-management-accordion',
        text: 'Kişi Yönetimi',
        icon: 'fas fa-users',
        category: 'Yönetim',
        subItems: [
            { id: 'persons', text: 'Kişiler Yönetimi', link: 'persons.html' },
            { id: 'user-management', text: 'Kullanıcı Yönetimi', link: 'user-management.html', superAdminOnly: true }
        ]
    },
    { id: 'accruals', text: 'Tahakkuklarım', link: 'accruals.html', icon: 'fas fa-file-invoice-dollar', category: 'Finans' },
    { id: 'indexing', text: 'Belge İndeksleme', link: 'bulk-indexing-page.html', icon: 'fas fa-folder-open', category: 'Araçlar' },
    { id: 'bulletin-management-accordion', text: 'Bülten Yönetimi', icon: 'fas fa-book', category: 'Araçlar', subItems: [
        { id: 'bulletin-upload', text: 'Bülten Yükleme/Silme', link: 'bulletin-upload.html' },
        { id: 'bulletin-search', text: 'Bülten Sorgulama', link: 'bulletin-search.html' }
    ]
    },
    {id: 'monitoring-accordion', text: 'İzleme', icon: 'fas fa-eye', category: 'Araçlar', subItems: [
        {id: 'trademark-similarity-search', text: 'Marka İzleme', link: 'trademark-similarity-search.html' },
        { id: 'monitoring-trademarks', text: 'Marka İzleme Listesi', link: 'monitoring-trademarks.html' },
        { id: 'monitoring-designs', text: 'Tasarım İzleme', link: 'monitoring-designs.html' }
    ]
    },
    { id: 'reports', text: 'Raporlar', link: '#', icon: 'fas fa-chart-line', category: 'Araçlar', disabled: true },
    { id: 'settings', text: 'Ayarlar', link: '#', icon: 'fas fa-cog', category: 'Araçlar', disabled: true }
];

export async function loadSharedLayout(options = {}) {
    const { activeMenuLink } = options;
    const placeholder = document.getElementById('layout-placeholder');

    if (!placeholder) {
        console.error('Layout placeholder not found. Ensure you have <div id="layout-placeholder"></div> in your HTML.');
        return;
    }

    try {
        if (!document.querySelector('link[href*="font-awesome"]')) {
            const fontAwesomeLink = document.createElement('link');
            fontAwesomeLink.rel = 'stylesheet';
            fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
            document.head.appendChild(fontAwesomeLink);
        }
        if (!document.querySelector('link[href*="shared-styles.css"]')) {
            const sharedStylesLink = document.createElement('link');
            sharedStylesLink.rel = 'stylesheet';
            sharedStylesLink.href = 'css/shared-styles.css';
            document.head.appendChild(sharedStylesLink);
        }

        const response = await fetch('shared_layout_parts.html');
        if (!response.ok) throw new Error('shared_layout_parts.html could not be loaded.');
        placeholder.innerHTML = await response.text();
        const user = authService.getCurrentUser();
        if (!user && window.top === window) {
            window.location.href = 'index.html';
            return;
        }

        const userRole = user.role || 'user';
        
        const userNameEl = document.getElementById('userName');
        if (userNameEl) {
            userNameEl.textContent = user.displayName || user.email.split('@')[0];
        }
        const userRoleEl = document.getElementById('userRole');
        if (userRoleEl) {
            userRoleEl.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
        }
        const userAvatarEl = document.getElementById('userAvatar');
        if (userAvatarEl) {
            userAvatarEl.textContent = (user.displayName || user.email.charAt(0)).charAt(0).toUpperCase();
        }

        const sidebarNav = document.querySelector('.sidebar-nav');
        if(sidebarNav) {
            renderMenu(sidebarNav, userRole);
        } else {
            console.error('Sidebar navigation container (.sidebar-nav) not found in layout.');
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.signOut(); });

        const currentPath = window.location.pathname.split('/').pop();
        setupMenuInteractions(currentPath);

        // -- YENİ: MERKEZİ KİŞİ EKLEME MODALINI ENTEGRE ETME --
        // Modalı DOM'a ekle ve olay dinleyicilerini kur
        createAndAppendPersonModal();
        
        window.addEventListener('personAdded', (e) => {
            // Modal kapandığında ve yeni kişi eklendiğinde bu event tetiklenir
            console.log('Merkezi modalden kişi eklendi:', e.detail);
        });

    } catch (error) {
        console.error('Error loading shared layout:', error);
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'padding: 20px; background-color: #f8d7da; color: #721c24; border-radius: 8px; margin: 20px;';
        errorDiv.textContent = 'Uygulama arayüzü yüklenirken bir hata oluştu. Lütfen sayfayı yenilemeyi deneyin.';
        document.body.prepend(errorDiv);
    }
}

// -- YENİ: MERKEZİ KİŞİ EKLEME MODALI VE İLGİLİ FONKSİYONLAR --
function createAndAppendPersonModal() {
    const personModalHTML = `
        <div id="personModal" class="modal">
            <div class="modal-content">
                <span class="close-modal-btn" id="closePersonModal">&times;</span>
                <h3 class="modal-title" id="personModalTitle">Yeni Kişi Ekle</h3>
                <form id="personForm">
                    <input type="hidden" id="personId">
                    <div class="form-group">
                        <label for="personType" class="form-label">Kişi Tipi:</label>
                        <select id="personType" class="form-select" required>
                            <option value="">Seçiniz</option>
                            <option value="gercek">Gerçek</option>
                            <option value="tuzel">Tüzel</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="personName" class="form-label"><span id="personNameLabel">Ad Soyad</span>:</label>
                        <input type="text" id="personName" class="form-input" required>
                    </div>
                    <div class="form-group" id="tcknGroup" style="display:none;">
                        <label for="personTckn" class="form-label">TC Kimlik No:</label>
                        <input type="text" id="personTckn" class="form-input" maxlength="11" inputmode="numeric" placeholder="11 haneli">
                        <small class="text-muted">Sadece rakam, 11 hane</small>
                    </div>
                    <div class="form-group" id="birthDateGroup" style="display:none;">
                        <label for="personBirthDate" class="form-label">Doğum Tarihi:</label>
                        <input type="date" id="personBirthDate" class="form-input">
                    </div>
                    <div class="form-group" id="vknGroup" style="display:none;">
                        <label for="personVkn" class="form-label">Vergi No:</label>
                        <input type="text" id="personVkn" class="form-input" maxlength="10" inputmode="numeric" placeholder="10 haneli">
                        <small class="text-muted">Sadece rakam, 10 hane</small>
                    </div>
                    <div class="form-group" id="tpeNoGroup">
                        <label for="personTpeNo" class="form-label">TPE Müşteri No:</label>
                        <input type="text" id="personTpeNo" class="form-input">
                    </div>
                    <div class="form-group">
                        <label for="personEmail" class="form-label">E-posta:</label>
                        <input type="email" id="personEmail" class="form-input">
                    </div>
                    <div class="form-group">
                        <label for="personPhone" class="form-label">Telefon:</label>
                        <input type="tel" id="personPhone" class="form-input" placeholder="+90 5__ ___ __ __">
                    </div>
                    <div class="form-group">
                        <label for="personAddress" class="form-label">Adres:</label>
                        <textarea id="personAddress" class="form-textarea" min-height="60px"></textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Adres Ülke / İl:</label>
                        <div style="display:flex;gap:10px;flex-wrap:wrap">
                            <select id="countrySelect" class="form-select" style="flex:1 1 200px"></select>
                            <select id="provinceSelect" class="form-select" style="flex:1 1 200px"></select>
                            <input type="text" id="provinceText" class="form-input" style="display:none;flex:1 1 200px" placeholder="Eyalet / İl">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" id="cancelPersonBtn">İptal</button>
                        <button type="submit" class="btn btn-primary" id="savePersonBtn" form="personForm">Kaydet</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', personModalHTML);
    initializePersonModalLogic();
}

function initializePersonModalLogic() {
    const modal = document.getElementById('personModal');
    const form = document.getElementById('personForm');
    const closeBtn = document.getElementById('closePersonModal');
    const cancelBtn = document.getElementById('cancelPersonBtn');
    const personTypeSelect = document.getElementById('personType');
    const personNameLabel = document.getElementById('personNameLabel');

    let allPersonsCache = [];

    // Veri yükleme ve önbelleğe alma
    const loadAllPersons = async () => {
        const result = await personService.getPersons();
        if (result.success) {
            allPersonsCache = result.data;
        } else {
            console.error('Kişiler yüklenirken hata:', result.error);
        }
    };

    // Kişi tipi değişimine göre etiket ve inputları güncelleme
    const updateFieldsByType = (type) => {
        personNameLabel.textContent = (type === 'tuzel') ? 'Firma Adı' : 'Ad Soyad';
        document.getElementById('tcknGroup').style.display = (type === 'gercek') ? 'flex' : 'none';
        document.getElementById('birthDateGroup').style.display = (type === 'gercek') ? 'flex' : 'none';
        document.getElementById('vknGroup').style.display = (type === 'tuzel') ? 'flex' : 'none';
    };

    // Modal kapatma
    const closeModal = () => {
        modal.classList.remove('show');
        form.reset();
        modal.removeAttribute('data-target-field');
    };

    // Modal açma
    const openModal = async (options = {}) => {
        form.reset();
        const { targetField, personId, prefill = {} } = options;
        modal.dataset.targetField = targetField;

        // Düzenleme modu
        if (personId) {
            const person = allPersonsCache.find(p => p.id === personId);
            if (!person) {
                showNotification('Kişi bulunamadı.', 'error');
                return;
            }
            document.getElementById('personModalTitle').textContent = 'Kişiyi Düzenle';
            document.getElementById('personId').value = person.id;
            document.getElementById('personName').value = person.name;
            document.getElementById('personEmail').value = person.email || '';
            document.getElementById('personPhone').value = person.phone || '';
            document.getElementById('personTpeNo').value = person.tpeNo || '';
            personTypeSelect.value = person.type;
            document.getElementById('personTckn').value = person.tckn || '';
            document.getElementById('personVkn').value = person.taxNo || '';
            document.getElementById('personAddress').value = person.address || '';
        } else {
            // Ekleme modu
            document.getElementById('personModalTitle').textContent = 'Yeni Kişi Ekle';
            personTypeSelect.value = prefill.type || 'gercek';
            document.getElementById('personName').value = prefill.name || '';
            document.getElementById('personEmail').value = prefill.email || '';
            document.getElementById('personPhone').value = prefill.phone || '';
        }

        updateFieldsByType(personTypeSelect.value);

        // Ülke ve il yükleme
        // Bu kısım için `persons.html`'den taşınan mantık eklenebilir
        // Şimdilik sadece placeholder olarak kalsın
        const countrySelect = document.getElementById('countrySelect');
        countrySelect.innerHTML = '<option value="TR">Türkiye</option>';
        document.getElementById('provinceSelect').innerHTML = '<option value="">İl Seçiniz</option>';

        modal.classList.add('show');
    };

    // Form kaydetme
    const handleSavePerson = async (e) => {
        e.preventDefault();
        const personId = document.getElementById('personId').value;
        const personData = {
            name: document.getElementById('personName').value,
            type: personTypeSelect.value,
            email: document.getElementById('personEmail').value,
            phone: document.getElementById('personPhone').value,
            address: document.getElementById('personAddress').value,
            tpeNo: document.getElementById('personTpeNo').value,
            tckn: document.getElementById('personTckn').value,
            taxNo: document.getElementById('personVkn').value,
        };

        if (!personData.name || !personData.type) {
            alert('Ad Soyad ve Kişi Tipi zorunludur.');
            return;
        }

        let result;
        if (personId) {
            result = await personService.updatePerson(personId, personData);
        } else {
            result = await personService.addPerson(personData);
        }
        
        if (result.success) {
            const addedOrUpdatedPerson = { id: personId || result.id, ...personData };
            // `personAdded` olayını tetikle ve veriyi gönder
            window.dispatchEvent(new CustomEvent('personAdded', {
                detail: {
                    person: addedOrUpdatedPerson,
                    targetField: modal.dataset.targetField
                }
            }));
            closeModal();
            // Önbelleği güncelle
            await loadAllPersons();
        } else {
            alert('Kişi kaydedilirken hata oluştu: ' + result.error);
        }
    };

    // Event listener'ları ata
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    form.addEventListener('submit', handleSavePerson);
    personTypeSelect.addEventListener('change', (e) => updateFieldsByType(e.target.value));

    // Dışarıdan erişim için bir global fonksiyon tanımla
    window.openPersonModal = openModal;
    
    // Uygulama yüklendiğinde bir kere kişileri yükle
    loadAllPersons();
}

function renderMenu(container, userRole) { /* ... */ }
function setupMenuInteractions(currentPage) { /* ... */ }
function highlightActiveMenu(currentPage) { /* ... */ }