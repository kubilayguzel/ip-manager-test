import { authService } from '../firebase-config.js';

// Menü elemanlarını daha yapısal bir formatta tanımlıyoruz.
// Bu, menüyü oluşturmayı ve aktif durumu yönetmeyi kolaylaştırır.
const menuItems = [
    {
        id: 'dashboard',
        text: 'Dashboard',
        link: 'dashboard.html',
        icon: 'fa-tachometer-alt'
    },
    {
        id: 'portfolio',
        text: 'Portföy',
        link: 'portfolio.html',
        icon: 'fa-briefcase'
    },
    {
        id: 'data-entry',
        text: 'Yeni Kayıt',
        link: 'data-entry.html',
        icon: 'fa-plus-circle'
    },
    {
        id: 'indexing',
        text: 'Belge İndeksleme',
        link: 'indexing.html',
        icon: 'fa-file-import'
    },
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
    {
        id: 'accruals',
        text: 'Tahakkuklar',
        link: 'accruals.html',
        icon: 'fa-file-invoice-dollar'
    },
    {
        id: 'persons',
        text: 'Kişiler',
        link: 'persons.html',
        icon: 'fa-users'
    },
    {
        id: 'excel-upload',
        text: 'Excel Yükle',
        link: 'excel-upload.html',
        icon: 'fa-file-excel',
        adminOnly: true // Sadece admin ve superadmin görebilir
    },
    {
        id: 'user-management',
        text: 'Kullanıcı Yönetimi',
        link: 'user-management.html',
        icon: 'fa-user-cog',
        superAdminOnly: true // Sadece superadmin görebilir
    }
];

async function renderMenu(container, currentPage, userRole) {
    let menuHtml = '';

    for (const item of menuItems) {
        // Rol kontrolleri
        if (item.adminOnly && userRole !== 'admin' && userRole !== 'superadmin') continue;
        if (item.superAdminOnly && userRole !== 'superadmin') continue;

        const hasSubItems = item.subItems && item.subItems.length > 0;
        
        // Mevcut sayfanın bu menü veya alt menülerinden biri olup olmadığını kontrol et
        const isParentActive = hasSubItems && item.subItems.some(sub => sub.link === currentPage);
        const isDirectActive = !hasSubItems && item.link === currentPage;

        if (hasSubItems) {
            // Alt menüsü olan ana menü elemanı
            const subItemsHtml = item.subItems
                .map(subItem => {
                    const isSubItemActive = subItem.link === currentPage;
                    return `
                        <li>
                            <a href="${subItem.link}" class="${isSubItemActive ? 'active' : ''}">
                                ${subItem.text}
                            </a>
                        </li>
                    `;
                })
                .join('');
            
            // Eğer bir alt menü aktifse, ana menüyü "open" ve "active" olarak işaretle
            menuHtml += `
                <li class="menu-item has-submenu ${isParentActive ? 'open active' : ''}">
                    <a href="#" class="menu-link">
                        <i class="fas ${item.icon}"></i>
                        <span class="menu-text">${item.text}</span>
                        <i class="fas fa-chevron-right arrow"></i>
                    </a>
                    <ul class="submenu">
                        ${subItemsHtml}
                    </ul>
                </li>
            `;
        } else {
            // Düz menü elemanı
            menuHtml += `
                <li class="menu-item ${isDirectActive ? 'active' : ''}">
                    <a href="${item.link}" class="menu-link">
                        <i class="fas ${item.icon}"></i>
                        <span class="menu-text">${item.text}</span>
                    </a>
                </li>
            `;
        }
    }
    container.innerHTML = menuHtml;

    // Dropdown menülerin tıklama olaylarını ayarla
    document.querySelectorAll('.sidebar .has-submenu > a').forEach(menuLink => {
        menuLink.addEventListener('click', function (e) {
            e.preventDefault();
            const parentLi = this.parentElement;
            
            // Eğer zaten açıksa kapat, değilse aç
            if (parentLi.classList.contains('open')) {
                parentLi.classList.remove('open');
            } else {
                // Diğer tüm açık menüleri kapat
                document.querySelectorAll('.sidebar .has-submenu.open').forEach(openMenu => {
                    openMenu.classList.remove('open');
                });
                parentLi.classList.add('open');
            }
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

        const layoutHtml = await response.text();
        placeholder.innerHTML = layoutHtml;

        const user = authService.getCurrentUser();
        if (!user) {
            console.warn("User not logged in, redirecting to login page.");
            window.location.href = 'index.html';
            return;
        }

        const userRole = user.role || 'user'; // Varsayılan rol
        
        // Kullanıcı adını ve rolünü header'a yazdır
        const userNameEl = document.getElementById('user-name');
        const userRoleEl = document.getElementById('user-role');
        if (userNameEl) userNameEl.textContent = user.displayName || 'Kullanıcı';
        if (userRoleEl) userRoleEl.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);

        // Menüyü oluştur
        const menuContainer = document.querySelector('.sidebar ul');
        if(menuContainer) {
            await renderMenu(menuContainer, activeMenuLink, userRole);
        } else {
            console.error('Menu container not found in layout.');
        }

        // Çıkış butonu
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                authService.signOut();
            });
        }

        // Mobil menü toggle
        const menuToggle = document.getElementById('menu-toggle');
        const sidebar = document.querySelector('.sidebar');
        if (menuToggle && sidebar) {
            menuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
            });
        }

    } catch (error) {
        console.error('Error loading shared layout:', error);
        placeholder.innerHTML = '<p style="color:red; text-align:center;">Layout could not be loaded.</p>';
    }
}