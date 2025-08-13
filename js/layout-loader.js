// js/layout-loader.js
import { authService, personService } from '../firebase-config.js';

// Menü yapısını daha yönetilebilir bir veri formatında tanımlıyoruz
const menuItems = [
    { id: 'dashboard', text: 'Dashboard', link: 'dashboard.html', icon: 'fas fa-tachometer-alt', category: 'Ana Menü' },
    
    // Yeni Portföy Yönetimi Akordiyonu eklendi
    {
        id: 'portfolio-management-accordion',
        text: 'Portföy Yönetimi',
        icon: 'fas fa-folder', // Portföy Yönetimi için uygun bir ikon
        category: 'Portföy Yönetimi', // Yeni kategori
        subItems: [
            { id: 'portfolio', text: 'Portföy', link: 'portfolio.html' }, // Buraya taşındı
            { id: 'data-entry', text: 'Yeni Kayıt', link: 'data-entry.html' }, // Buraya taşındı
            { id: 'excel-upload', text: 'Excel ile Yükle', link: 'excel-upload.html', adminOnly: true } // Buraya taşındı
        ]
    },

    // Hatırlatmalar sekmesi Kişi Yönetimi'nden önce ve ayrı sekme olarak taşındı
    { id: 'reminders', text: 'Hatırlatmalar', link: 'reminders.html', icon: 'fas fa-bell', category: 'Yönetim' },
    
    // Mevcut 'tasks-accordion' değiştirildi ve adı 'İş Yönetimi' oldu
    {
        id: 'task-management-accordion', // ID güncellendi
        text: 'İş Yönetimi', // Adı güncellendi
        icon: 'fas fa-briefcase', // İkon güncellendi
        category: 'Yönetim',
        subItems: [
            { id: 'task-management', text: 'İş Yönetimi', link: 'task-management.html' }, // Konumu korundu
            { id: 'my-tasks', text: 'İşlerim', link: 'my-tasks.html' }, // Konumu korundu
            { id: 'create-task', text: 'Yeni İş Oluştur', link: 'create-task.html', specialClass: 'new-task-link' } // Konumu korundu
            // 'Hatırlatmalar' ve 'Zamanlanmış Görevler' buradan kaldırıldı
        ]
    },
    {
        id: 'new-tasks-accordion',
        text: 'Görevler',
        icon: 'fas fa-clipboard-check', // ← YENİ İKON
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
        icon: 'fas fa-users', // Kişi Yönetimi ikonu
        category: 'Yönetim',
        subItems: [
            { id: 'persons', text: 'Kişiler Yönetimi', link: 'persons.html' },
            { id: 'user-management', text: 'Kullanıcı Yönetimi', link: 'user-management.html', superAdminOnly: true }
        ]
    },
    { id: 'accruals', text: 'Tahakkuklarım', link: 'accruals.html', icon: 'fas fa-file-invoice-dollar', category: 'Finans' },
    
    // GÜNCELLENMIŞ: indexing.html → bulk-indexing-page.html
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
        // Font Awesome kütüphanesini ekle
        if (!document.querySelector('link[href*="font-awesome"]')) {
            const fontAwesomeLink = document.createElement('link');
            fontAwesomeLink.rel = 'stylesheet';
            fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
            document.head.appendChild(fontAwesomeLink);
        }
        // shared-styles.css dosyasını da buraya ekleyelim, eğer zaten eklenmemişse
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
            renderMenu(sidebarNav, userRole); // activeMenuLink parametresi renderMenu'den kaldırıldı
        } else {
            console.error('Sidebar navigation container (.sidebar-nav) not found in layout.');
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.signOut(); });

        const currentPath = window.location.pathname.split('/').pop();
        setupMenuInteractions(currentPath);


    } catch (error) {
        console.error('Error loading shared layout:', error);
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'padding: 20px; background-color: #f8d7da; color: #721c24; border-radius: 8px; margin: 20px;';
        errorDiv.textContent = 'Uygulama arayüzü yüklenirken bir hata oluştu. Lütfen sayfayı yenilemeyi deneyin.';
        document.body.prepend(errorDiv);
    }
}

function renderMenu(container, userRole) { // currentPage parametresi kaldırıldı
    let currentCategory = '';
    container.innerHTML = ''; // Mevcut içeriği temizle

    menuItems.forEach(item => {
        // Kategori başlığını ekle
        if (item.category && item.category !== currentCategory) {
            const categoryTitle = document.createElement('div');
            categoryTitle.className = 'nav-category-title';
            categoryTitle.textContent = item.category;
            container.appendChild(categoryTitle);
            currentCategory = item.category;
        }

        // Yetki kontrolü
        if ((item.adminOnly && userRole !== 'admin' && userRole !== 'superadmin') || (item.superAdminOnly && userRole !== 'superadmin')) {
            return; // Menü öğesini atla
        }

        const hasSubItems = item.subItems && item.subItems.length > 0;
        
        let linkClass = 'sidebar-nav-item';
        // isDirectActive, isParentActive ve active sınıfı ekleme mantığı renderMenu'den kaldırıldı
        // if (isDirectActive || isParentActive) {
        //     linkClass += ' active';
        // }
        if (item.specialClass) { // create-task için özel sınıf
            linkClass += ` ${item.specialClass}`;
        }

        if (hasSubItems) {
            const accordionHtml = `
                <div class="accordion">
                    <div class="accordion-header"> <span class="nav-icon"><i class="${item.icon}"></i></span>
                        <span>${item.text}</span>
                    </div>
                    <div class="accordion-content">
                        ${item.subItems.map(subItem => `
                            <a href="${subItem.link}" class="${subItem.specialClass || ''}">${subItem.text}</a> `).join('')}
                    </div>
                </div>
            `;
            container.innerHTML += accordionHtml;
        } else {
            const singleLinkHtml = `
                <a href="${item.link}" class="${linkClass}" ${item.disabled ? 'style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                    <span class="nav-icon"><i class="${item.icon}"></i></span>
                    <span>${item.text}</span>
                </a>
            `;
            container.innerHTML += singleLinkHtml;
        }
    });
}

function setupMenuInteractions(currentPage) {
    // 1. Accordion başlıklarına tıklama olay dinleyicilerini ekle
    // Bu kısım, accordionların tıklama ile açılıp kapanmasını sağlar.
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isActive = header.classList.contains('active');

            // Tüm accordion'ları kapat
            document.querySelectorAll('.accordion-header').forEach(h => h.classList.remove('active'));
            document.querySelectorAll('.accordion-content').forEach(c => c.style.maxHeight = '0');

            // Eğer tıklanan accordion kapalıydı, aç
            if (!isActive) {
                header.classList.add('active');
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        });
    });

    // 2. Aktif sayfanın menüsünü vurgula
    highlightActiveMenu(currentPage);
}

function highlightActiveMenu(currentPage) {
    // Tüm aktif sınıfları temizle
    document.querySelectorAll('.sidebar-nav-item, .accordion-content a').forEach(link => {
        link.classList.remove('active');
    });

    // Aktif linki bul
    let activeLink = null;
    let parentAccordion = null;

    document.querySelectorAll('.sidebar-nav-item, .accordion-content a').forEach(link => {
        const href = link.getAttribute('href');
        if (href && href === currentPage) {
            link.classList.add('active');
            activeLink = link;
            
            // Eğer accordion içindeyse, parent accordion'ı bul
            const accordion = link.closest('.accordion');
            if (accordion) {
                parentAccordion = accordion;
            }
        }
    });

    // Eğer aktif link accordion içindeyse, accordion'ı aç
    if (parentAccordion) {
        const accordionHeader = parentAccordion.querySelector('.accordion-header');
        const accordionContent = parentAccordion.querySelector('.accordion-content');
        
        accordionHeader.classList.add('active');
        accordionContent.style.maxHeight = accordionContent.scrollHeight + 'px';
    }
}

// ==== Reusable Person Create Modal (App-wide) ====
// This injects a single global modal and exposes window.openPersonCreate(options)
// options: { targetField?: 'applicant' | 'relatedParty' | 'tpInvoiceParty' | 'serviceInvoiceParty' }
// Usage (example):
// if (window.openPersonCreate) window.openPersonCreate({ targetField: 'applicant' }).then(person => { ... });

function ensureGlobalPersonModal() {
    if (document.getElementById('globalPersonModal')) return;

    // Basic styles scoped to this modal to avoid conflicts
    const styleEl = document.createElement('style');
    styleEl.textContent = `
    .gpm-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: none; z-index: 1040; }
    .gpm-wrap { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; z-index: 1050; }
    .gpm-dialog { width: 720px; max-width: calc(100% - 32px); background: #fff; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.25); overflow: hidden; }
    .gpm-header { padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #eee; }
    .gpm-title { font-size: 18px; font-weight: 600; margin: 0; }
    .gpm-body { padding: 16px 18px; }
    .gpm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
    .gpm-grid .full { grid-column: 1 / -1; }
    .gpm-label { font-size: 12px; color: #333; margin-bottom: 4px; display: block; }
    .gpm-input, .gpm-select, .gpm-textarea { width: 100%; padding: 10px 12px; border: 1px solid #dcdcdc; border-radius: 10px; font-size: 14px; }
    .gpm-textarea { min-height: 70px; resize: vertical; }
    .gpm-footer { padding: 12px 18px; display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid #eee; }
    .gpm-btn { padding: 10px 14px; border-radius: 10px; border: none; cursor: pointer; }
    .gpm-btn.cancel { background: #f2f2f2; }
    .gpm-btn.save { background: #1e3c72; color: white; }
    .gpm-hidden { display: none !important; }
    `;
    document.head.appendChild(styleEl);

    const wrap = document.createElement('div');
    wrap.id = 'globalPersonModalWrap';
    wrap.className = 'gpm-wrap gpm-hidden';
    wrap.innerHTML = `
      <div id="globalPersonModalBackdrop" class="gpm-backdrop"></div>
      <div id="globalPersonModal" class="gpm-dialog" role="dialog" aria-modal="true" aria-labelledby="gpmTitle">
        <div class="gpm-header">
          <h5 id="gpmTitle" class="gpm-title">Yeni Kişi Ekle</h5>
          <button id="gpmCloseBtn" class="gpm-btn cancel" type="button" aria-label="Kapat">×</button>
        </div>
        <form id="globalPersonForm">
          <div class="gpm-body">
            <div class="gpm-grid">
              <div>
                <label class="gpm-label" for="gpmType">Kişi Türü</label>
                <select id="gpmType" class="gpm-select">
                  <option value="gercek">Gerçek Kişi</option>
                  <option value="tuzel">Tüzel Kişi</option>
                </select>
              </div>
              <div>
                <label class="gpm-label" for="gpmName">Ad Soyad / Unvan</label>
                <input id="gpmName" class="gpm-input" placeholder="Ad Soyad / Unvan" required />
              </div>
              <div>
                <label class="gpm-label" for="gpmEmail">E-posta</label>
                <input id="gpmEmail" class="gpm-input" type="email" placeholder="ornek@site.com" />
              </div>
              <div>
                <label class="gpm-label" for="gpmPhone">Telefon</label>
                <input id="gpmPhone" class="gpm-input" placeholder="+90..." />
              </div>

              <div class="full">
                <label class="gpm-label" for="gpmAddress">Adres</label>
                <textarea id="gpmAddress" class="gpm-textarea" placeholder="Adres"></textarea>
              </div>

              <div>
                <label class="gpm-label" for="gpmCountry">Ülke</label>
                <input id="gpmCountry" class="gpm-input" placeholder="TR / Türkiye" />
              </div>
              <div>
                <label class="gpm-label" for="gpmProvince">İl / Bölge</label>
                <input id="gpmProvince" class="gpm-input" placeholder="İstanbul" />
              </div>

              <div id="gpmGercekFields">
                <label class="gpm-label" for="gpmTckn">TCKN (opsiyonel)</label>
                <input id="gpmTckn" class="gpm-input" placeholder="TCKN" />
              </div>
              <div id="gpmTuzelFields" class="gpm-hidden">
                <label class="gpm-label" for="gpmVkn">VKN (opsiyonel)</label>
                <input id="gpmVkn" class="gpm-input" placeholder="VKN" />
              </div>
            </div>
          </div>
          <div class="gpm-footer">
            <button type="button" id="gpmCancelBtn" class="gpm-btn cancel">Vazgeç</button>
            <button type="submit" id="gpmSaveBtn" class="gpm-btn save">Kaydet</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(wrap);

    const typeSel = wrap.querySelector('#gpmType');
    const gercek = wrap.querySelector('#gpmGercekFields');
    const tuzel  = wrap.querySelector('#gpmTuzelFields');
    typeSel.addEventListener('change', () => {
        if (typeSel.value === 'tuzel') { gercek.classList.add('gpm-hidden'); tuzel.classList.remove('gpm-hidden'); }
        else { tuzel.classList.add('gpm-hidden'); gercek.classList.remove('gpm-hidden'); }
    });

    function show() {
        wrap.classList.remove('gpm-hidden');
        wrap.querySelector('.gpm-backdrop').style.display = 'block';
        wrap.style.display = 'flex';
        wrap.querySelector('#gpmName').focus();
    }
    function hide() {
        wrap.classList.add('gpm-hidden');
        wrap.querySelector('.gpm-backdrop').style.display = 'none';
        wrap.style.display = 'none';
        wrap.querySelector('#globalPersonForm').reset();
        typeSel.value = 'gercek';
        gercek.classList.remove('gpm-hidden');
        tuzel.classList.add('gpm-hidden');
    }

    wrap.querySelector('#gpmCancelBtn').addEventListener('click', hide);
    wrap.querySelector('#gpmCloseBtn').addEventListener('click', hide);
    wrap.querySelector('#globalPersonModalBackdrop').addEventListener('click', hide);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !wrap.classList.contains('gpm-hidden')) hide(); });

    // Submit handler
    wrap.querySelector('#globalPersonForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = wrap.querySelector('#gpmName').value.trim();
        if (!name) return;

        const payload = {
            name,
            type: wrap.querySelector('#gpmType').value || 'gercek',
            email: wrap.querySelector('#gpmEmail').value.trim() || '',
            phone: wrap.querySelector('#gpmPhone').value.trim() || '',
            address: wrap.querySelector('#gpmAddress').value.trim() || '',
            country: wrap.querySelector('#gpmCountry').value.trim() || '',
            province: wrap.querySelector('#gpmProvince').value.trim() || '',
            tckn: wrap.querySelector('#gpmTckn').value.trim() || '',
            vkn: wrap.querySelector('#gpmVkn').value.trim() || ''
        };

        try {
            const res = await personService.addPerson(payload);
            if (res?.success && res.data) {
                const evDetail = { person: res.data, targetField: window.__gpmTargetField || null };
                // Dispatch global event so pages like create-task.js can react
                window.dispatchEvent(new CustomEvent('personAdded', { detail: evDetail }));
                if (window.__gpmResolve) window.__gpmResolve(res.data);
                hide();
            } else {
                alert('Kişi kaydedilemedi: ' + (res?.error || 'Bilinmeyen hata'));
            }
        } catch (err) {
            console.error('addPerson error:', err);
            alert('Kişi kaydedilemedi.');
        }
    });

    // Expose opener
    window.openPersonCreate = function openPersonCreate(options = {}) {
        window.__gpmTargetField = options.targetField || null;
        return new Promise((resolve) => {
            window.__gpmResolve = resolve;
            show();
        });
    };
}

// After the shared layout is loaded, ensure the modal exists once.
ensureGlobalPersonModal();
