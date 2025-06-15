// layout-loader.js

// firebase-config.js'in yolu, layout-loader.js'in konumuna göre değişir.
// Eğer layout-loader.js, projenin kök dizinindeki bir 'js' klasörünün içindeyse: '../firebase-config.js'
// Eğer layout-loader.js, projenin kök dizinindeki 'js/layout' klasörünün içindeyse: '../../firebase-config.js'
// Lütfen kendi dosya yapınıza göre doğru yolu seçin.
import { authService } from '../firebase-config.js'; // Bu yolu kontrol edin ve düzeltin

/**
 * Ortak layout parçalarını (sidebar, top-header) yükler ve DOM'a ekler.
 * Sayfaya özgü ek CSS veya HTML içermemelidir.
 * @param {object} options - Yükleme seçenekleri.
 * @param {string | null} options.activeMenuLink - Aktif olarak işaretlenecek menü linkinin href değeri (örn: "dashboard.html").
 * @param {string | null} options.topHeaderLeftContentId - top-header'ın sol tarafına eklenecek HTML elementinin ID'si (örn: "breadcrumbContainer").
 */
export async function loadSharedLayout(options = {}) {
    // Sidebar'ı yükle
    // shared_layout_parts.html'in yolu da layout-loader.js'e göre değişir.
    // Eğer shared_layout_parts.html de layout-loader.js ile aynı dizindeyse './shared_layout_parts.html'
    // Eğer shared_layout_parts.html projenin kök dizinindeyse ve layout-loader.js bir alt klasördeyse: '../shared_layout_parts.html'
    const sidebarResponse = await fetch('../shared_layout_parts.html'); // Bu yolu kontrol edin ve düzeltin
    if (sidebarResponse.ok) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(await sidebarResponse.text(), 'text/html');
        const sidebar = doc.querySelector('aside.sidebar');
        const topHeaderTemplate = doc.querySelector('header.top-header'); // Şablon olarak alın

        if (sidebar) {
            document.body.prepend(sidebar); // Sidebar'ı body'nin başına ekle
        }
        if (topHeaderTemplate) {
            const topHeaderContainer = document.createElement('header');
            topHeaderContainer.className = 'top-header';

            // Top header'ın sol tarafındaki içeriği ekle
            if (options.topHeaderLeftContentId) {
                const leftContent = document.getElementById(options.topHeaderLeftContentId);
                if (leftContent) {
                    topHeaderContainer.appendChild(leftContent);
                }
            }
            
            // Kullanıcı bölümünü ekle
            const userSection = topHeaderTemplate.querySelector('.user-section');
            if (userSection) {
                 topHeaderContainer.appendChild(userSection.cloneNode(true)); // Klonlayarak ekle
            }

            const pageWrapper = document.querySelector('.page-wrapper');
            if (pageWrapper) {
                pageWrapper.prepend(topHeaderContainer); // page-wrapper'ın başına ekle
            } else {
                console.error("'.page-wrapper' elementi bulunamadı. Top header eklenemedi.");
            }

            // Kullanıcı bilgilerini güncelle
            updateUserInfo();
            setupLogoutButton();
        } else {
            console.error("Top header şablonu 'shared_layout_parts.html' içinde bulunamadı.");
        }
    } else {
        console.error('Shared layout parçaları yüklenemedi: ', sidebarResponse.statusText);
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