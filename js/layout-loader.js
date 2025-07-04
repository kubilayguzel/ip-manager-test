// js/layout-loader.js
import { authService } from '../firebase-config.js';

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