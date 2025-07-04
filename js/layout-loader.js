// js/layout-loader.js (Tam ve Düzeltilmiş Hali)

import { authService } from '../firebase-config.js';

// Menü yapısını daha yönetilebilir bir veri formatında tanımlıyoruz
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
            { id: 'client-notifications', text: 'Müvekkil Bildirimleri', link: 'notifications.html', isVanilla: true } // isVanilla eklendi
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

        // --- DİNAMİK YÜKLEME KISMI ---
        const mainContentElement = document.querySelector('.main-container');
        if (mainContentElement && mainContentElement.children.length > 0) {
            // Ana içerik zaten doluysa, sadece layout'u yükle, içeriği değiştirme
            const response = await fetch('shared_layout_parts.html');
            if (!response.ok) throw new Error('shared_layout_parts.html could not be loaded.');
            placeholder.innerHTML = await response.text();
        } else if (mainContentElement) {
            // Ana içerik boşsa, tüm sayfayı yükle
            // Bu senaryo artık pek kullanılmıyor ama fallback olarak durabilir.
        }
        
        const user = authService.getCurrentUser();
        if (!user && window.top === window) {
            window.location.href = 'index.html';
            return;
        }

        const userRole = user.role || 'user';
        
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = user.displayName || user.email.split('@')[0];
        
        const userRoleEl = document.getElementById('userRole');
        if (userRoleEl) userRoleEl.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
        
        const userAvatarEl = document.getElementById('userAvatar');
        if (userAvatarEl) userAvatarEl.textContent = (user.displayName || user.email.charAt(0)).charAt(0).toUpperCase();

        const sidebarNav = document.querySelector('.sidebar-nav');
        if(sidebarNav) {
            renderMenu(sidebarNav, userRole);
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.signOut(); });

        const currentPath = window.location.pathname.split('/').pop();
        setupMenuInteractions(currentPath);
        setupDynamicPageLoading(); // Dinamik sayfa yükleme mekanizmasını etkinleştir

    } catch (error) {
        console.error('Error loading shared layout:', error);
    }
}

function renderMenu(container, userRole) {
    let currentCategory = '';
    container.innerHTML = '';

    menuItems.forEach(item => {
        if (item.category && item.category !== currentCategory) {
            const categoryTitle = document.createElement('div');
            categoryTitle.className = 'nav-category-title';
            categoryTitle.textContent = item.category;
            container.appendChild(categoryTitle);
            currentCategory = item.category;
        }

        if ((item.adminOnly && userRole !== 'admin' && userRole !== 'superadmin') || (item.superAdminOnly && userRole !== 'superadmin')) {
            return;
        }

        const hasSubItems = item.subItems && item.subItems.length > 0;
        
        if (hasSubItems) {
            const accordionHtml = `
                <div class="accordion">
                    <div class="accordion-header">
                        <span class="nav-icon"><i class="${item.icon}"></i></span>
                        <span>${item.text}</span>
                    </div>
                    <div class="accordion-content">
                        ${item.subItems.map(subItem => {
                            const linkAttributes = subItem.isVanilla ? 'data-vanilla-nav="true"' : '';
                            return `<a href="${subItem.link}" class="${subItem.specialClass || ''}" ${linkAttributes}>${subItem.text}</a>`
                        }).join('')}
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', accordionHtml);
        } else {
            const singleLinkHtml = `
                <a href="${item.link}" class="sidebar-nav-item" ${item.disabled ? 'style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                    <span class="nav-icon"><i class="${item.icon}"></i></span>
                    <span>${item.text}</span>
                </a>
            `;
            container.insertAdjacentHTML('beforeend', singleLinkHtml);
        }
    });
}

function setupMenuInteractions(currentPage) {
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isActive = header.classList.contains('active');
            
            document.querySelectorAll('.accordion-header').forEach(h => h.classList.remove('active'));
            document.querySelectorAll('.accordion-content').forEach(c => c.style.maxHeight = '0');

            if (!isActive) {
                header.classList.add('active');
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        });
    });
    highlightActiveMenu(currentPage);
}

function highlightActiveMenu(currentPage) {
    document.querySelectorAll('.sidebar-nav-item, .accordion-content a').forEach(link => {
        link.classList.remove('active');
    });

    let activeLink = document.querySelector(`.sidebar-nav-item[href="${currentPage}"], .accordion-content a[href="${currentPage}"]`);
    
    if (activeLink) {
        activeLink.classList.add('active');
        const parentAccordion = activeLink.closest('.accordion');
        if (parentAccordion) {
            const header = parentAccordion.querySelector('.accordion-header');
            const content = parentAccordion.querySelector('.accordion-content');
            header.classList.add('active');
            content.style.maxHeight = content.scrollHeight + 'px';
        }
    }
}

function setupDynamicPageLoading() {
    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('a');

        if (link && link.href && link.target !== '_blank' && !link.hasAttribute('data-vanilla-nav')) {
            const url = new URL(link.href);
            if (url.origin === window.location.origin) {
                e.preventDefault();
                loadPageContent(url.pathname);
            }
        }
    });

    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.path) {
            loadPageContent(e.state.path, false);
        }
    });
}

async function loadPageContent(path, pushState = true) {
    const mainContent = document.querySelector('.main-container');
    if (!mainContent) return;

    mainContent.style.opacity = '0.5';

    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error('Sayfa yüklenemedi');
        
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const newMainContent = doc.querySelector('.main-container');
        const newTitle = doc.querySelector('title');

        if (newMainContent) {
            mainContent.innerHTML = newMainContent.innerHTML;
            document.title = newTitle ? newTitle.textContent : document.title;
            
            if (pushState) {
                history.pushState({ path: path }, '', path);
            }
            
            highlightActiveMenu(path.split('/').pop());

            // Yeni yüklenen script'leri çalıştır
            const scripts = mainContent.querySelectorAll('script');
            scripts.forEach(script => {
                const newScript = document.createElement('script');
                if (script.src) {
                    newScript.src = script.src;
                } else {
                    newScript.textContent = script.textContent;
                }
                if (script.type === 'module') {
                    newScript.type = 'module';
                }
                document.body.appendChild(newScript).remove();
            });
        }
    } catch (error) {
        console.error('İçerik yüklenirken hata oluştu:', error);
        mainContent.innerHTML = '<h1>Sayfa Yüklenemedi</h1>';
    } finally {
        mainContent.style.opacity = '1';
    }
}