import { authService } from '../firebase-config.js';

// Menü yapısını daha yönetilebilir bir veri formatında tanımlıyoruz
const menuItems = [
    { id: 'dashboard', text: 'Dashboard', link: 'dashboard.html', icon: 'fa-tachometer-alt' },
    { id: 'portfolio', text: 'Portföy', link: 'portfolio.html', icon: 'fa-briefcase' },
    { id: 'data-entry', text: 'Yeni Kayıt', link: 'data-entry.html', icon: 'fa-plus-circle' },
    { id: 'indexing', text: 'Belge İndeksleme', link: 'indexing.html', icon: 'fa-file-import' },
    {
        id: 'tasks',
        text: 'Görevler',
        icon: 'fa-tasks',
        subItems: [
            { id: 'my-tasks', text: 'Görevlerim', link: 'my-tasks.html' },
            { id: 'create-task', text: 'Yeni İş Oluştur', link: 'create-task.html' },
            { id: 'task-management', text: 'İş Yönetimi', link: 'task-management.html' }
        ]
    },
    { id: 'accruals', text: 'Tahakkuklar', link: 'accruals.html', icon: 'fa-file-invoice-dollar' },
    { id: 'persons', text: 'Kişiler', link: 'persons.html', icon: 'fa-users' },
    { id: 'excel-upload', text: 'Excel Yükle', link: 'excel-upload.html', icon: 'fa-file-excel', adminOnly: true },
    { id: 'user-management', text: 'Kullanıcı Yönetimi', link: 'user-management.html', icon: 'fa-user-cog', superAdminOnly: true }
];

async function renderMenu(container, currentPage, userRole) {
    let menuHtml = '';
    for (const item of menuItems) {
        if ((item.adminOnly && userRole !== 'admin' && userRole !== 'superadmin') || (item.superAdminOnly && userRole !== 'superadmin')) {
            continue;
        }

        const hasSubItems = item.subItems && item.subItems.length > 0;
        const isParentActive = hasSubItems && item.subItems.some(sub => sub.link === currentPage);
        const isDirectActive = !hasSubItems && item.link === currentPage;

        if (hasSubItems) {
            const subItemsHtml = item.subItems.map(subItem => `
                <li>
                    <a href="${subItem.link}" class="${subItem.link === currentPage ? 'active' : ''}">${subItem.text}</a>
                </li>
            `).join('');
            menuHtml += `
                <li class="menu-item has-submenu ${isParentActive ? 'open active' : ''}">
                    <a href="#" class="menu-link"><i class="fas ${item.icon}"></i><span class="menu-text">${item.text}</span><i class="fas fa-chevron-right arrow"></i></a>
                    <ul class="submenu">${subItemsHtml}</ul>
                </li>`;
        } else {
            menuHtml += `
                <li class="menu-item ${isDirectActive ? 'active' : ''}">
                    <a href="${item.link}" class="menu-link"><i class="fas ${item.icon}"></i><span class="menu-text">${item.text}</span></a>
                </li>`;
        }
    }
    container.innerHTML = menuHtml;

    // Dropdown tıklama olayları
    document.querySelectorAll('.sidebar .has-submenu > a').forEach(menuLink => {
        menuLink.addEventListener('click', function (e) {
            e.preventDefault();
            this.parentElement.classList.toggle('open');
        });
    });
}

export async function loadSharedLayout(options = {}) {
    const { activeMenuLink } = options;
    const placeholder = document.getElementById('layout-placeholder');

    if (!placeholder) {
        console.error('Layout placeholder not found. Ensure you have <div id="layout-placeholder"></div> in your HTML.');
        return;
    }

    try {
        const response = await fetch('shared_layout_parts.html');
        if (!response.ok) throw new Error('shared_layout_parts.html could not be loaded.');
        placeholder.innerHTML = await response.text();

        const user = authService.getCurrentUser();
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        const userRole = user.role || 'user';
        
        const userNameEl = document.getElementById('user-name');
        if (userNameEl) userNameEl.textContent = user.displayName || 'Kullanıcı';
        const userRoleEl = document.getElementById('user-role');
        if (userRoleEl) userRoleEl.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);

        const menuContainer = document.querySelector('.sidebar ul.menu-list');
        if(menuContainer) {
            await renderMenu(menuContainer, activeMenuLink, userRole);
        } else {
            console.error('Menu container (.sidebar ul.menu-list) not found in layout.');
        }

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.signOut(); });

        const menuToggle = document.getElementById('menu-toggle');
        const sidebar = document.querySelector('.sidebar');
        if (menuToggle && sidebar) menuToggle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));

    } catch (error) {
        console.error('Error loading shared layout:', error);
    }
}