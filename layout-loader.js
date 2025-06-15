// layout-loader.js

import { authService } from '../firebase-config.js'; // authService'i import edin

/**
 * Ortak layout parçalarını (sidebar, top-header) yükler ve DOM'a ekler.
 * Sayfaya özgü ek CSS veya HTML içermemelidir.
 * @param {object} options - Yükleme seçenekleri.
 * @param {string | null} options.activeMenuLink - Aktif olarak işaretlenecek menü linkinin href değeri (örn: "dashboard.html").
 * @param {string | null} options.topHeaderLeftContentId - top-header'ın sol tarafına eklenecek HTML elementinin ID'si (örn: "breadcrumbContainer").
 */
export async function loadSharedLayout(options = {}) {
    // Sidebar'ı yükle
    const sidebarResponse = await fetch('shared_layout_parts.html'); // Yolu doğru ayarlayın
    if (sidebarResponse.ok) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(await sidebarResponse.text(), 'text/html');
        const sidebar = doc.querySelector('aside.sidebar');
        const topHeader = doc.querySelector('header.top-header');

        if (sidebar) {
            document.body.prepend(sidebar); // Sidebar'ı body'nin başına ekle
        }
        if (topHeader) {
            // Top header'ın içeriğini özelleştirme
            const userSection = topHeader.querySelector('.user-section');
            const topHeaderContainer = document.createElement('header');
            topHeaderContainer.className = 'top-header'; // Kendi sınıfını koru

            if (options.topHeaderLeftContentId) {
                const leftContent = document.getElementById(options.topHeaderLeftContentId);
                if (leftContent) {
                    topHeaderContainer.appendChild(leftContent);
                }
            }
            topHeaderContainer.appendChild(userSection);
            document.querySelector('.page-wrapper').prepend(topHeaderContainer); // page-wrapper'ın başına ekle

            // Kullanıcı bilgilerini güncelle
            updateUserInfo();
            setupLogoutButton();
        }
    } else {
        console.error('Shared layout parçaları yüklenemedi.');
    }

    // Sidebar akordiyonlarını ve aktif menüyü ayarla
    setupSidebarAccordion();
    if (options.activeMenuLink) {
        setActiveMenu(options.activeMenuLink);
    }
}

/**
 * Sidebar akordiyonlarını ayarlar.
 */
function setupSidebarAccordion() {
    const accordions = document.querySelectorAll('.accordion-header');
    accordions.forEach(accordion => {
        accordion.addEventListener('click', function(event) {
            this.classList.toggle('active');
            const content = this.nextElementSibling;
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
            } else {
                content.style.maxHeight = content.scrollHeight + "px";
            }
        });
    });
}

/**
 * Mevcut sayfaya göre sidebar'daki aktif menüyü işaretler.
 * @param {string} currentPageUrl - Aktif olarak işaretlenecek sayfanın URL'si (örn: "dashboard.html").
 */
function setActiveMenu(currentPageUrl) {
    document.querySelectorAll('.sidebar-nav-item.active, .accordion-content a.active').forEach(el => el.classList.remove('active'));

    const activeLink = document.querySelector(`.sidebar-nav a[href="${currentPageUrl}"]`);
    if (!activeLink) return;

    activeLink.classList.add('active');

    const parentAccordionContent = activeLink.closest('.accordion-content');
    if (parentAccordionContent) {
        const parentAccordionHeader = parentAccordionContent.previousElementSibling;
        if (parentAccordionHeader && parentAccordionHeader.classList.contains('accordion-header')) {
            parentAccordionHeader.classList.add('active');
            parentAccordionContent.style.maxHeight = parentAccordionContent.scrollHeight + "px";
        }
    }
}

/**
 * Kullanıcı bilgilerini (avatar, ad, rol) günceller.
 */
function updateUserInfo() {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
        const userName = currentUser.displayName || currentUser.email.split('@')[0] || 'Kullanıcı';
        const userRole = currentUser.role === 'admin' ? 'Yönetici' : currentUser.role === 'superadmin' ? 'Süper Yönetici' : 'Kullanıcı';

        const userAvatarEl = document.getElementById('userAvatar');
        const userNameEl = document.getElementById('userName');
        const userRoleEl = document.getElementById('userRole');

        if (userAvatarEl) userAvatarEl.textContent = userName.charAt(0).toUpperCase();
        if (userNameEl) userNameEl.textContent = userName;
        if (userRoleEl) userRoleEl.textContent = userRole;
    }
}

/**
 * Çıkış butonuna event listener ekler.
 */
function setupLogoutButton() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => authService.signOut());
    }
}