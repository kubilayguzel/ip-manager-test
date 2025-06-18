// --- Merkezi Sabitler ---

// Merkezi Tip Tanımlamaları
export const TYPE_NAMES = { 
    patent: 'Patent', 
    trademark: 'Marka', 
    design: 'Tasarım',
    copyright: 'Telif Hakkı'
};

// Merkezi Durum Tanımlamaları
export const STATUSES = {
    patent: [
        { text: 'Başvuru', value: 'başvuru' },
        { text: 'Yayınlandı', value: 'yayınlandı' },
        { text: 'Onaylandı', value: 'onaylandı' },
        { text: 'Reddedildi', value: 'reddedildi' },
        { text: 'Süresi Doldu', value: 'süresi_doldu' }
    ],
    trademark: [
        { text: 'Başvuru', value: 'başvuru' },
        { text: 'Yayınlandı', value: 'yayınlandı' },
        { text: 'Tescilli', value: 'tescilli' },
        { text: 'Reddedildi', value: 'reddedildi' },
        { text: 'Kısmi Ret', value: 'kısmi_ret' },
        { text: 'Yenilenmedi', value: 'yenilenmedi' },
        { text: 'İtiraz Geldi', value: 'itiraz_geldi' },
        { text: 'İtiraz Edildi', value: 'itiraz_edildi' },
        { text: 'Başvuru Geçersiz/Hükümsüz', value: 'başvuru_geçersiz_hükümsüz' },
        { text: 'Yenilememe Nedeniyle Geçersiz', value: 'yenilememe_nedeniyle_geçersiz' }
    ],
    copyright: [
        { text: 'Beklemede', value: 'beklemede' },
        { text: 'Tescilli', value: 'tescilli' },
        { text: 'Süresi Doldu', value: 'süresi_doldu' }
    ],
    design: [
        { text: 'Başvuru', value: 'başvuru' },
        { text: 'Yayınlandı', value: 'yayınlandı' },
        { text: 'Onaylandı', value: 'onaylandı' },
        { text: 'Reddedildi', value: 'reddedildi' },
        { text: 'Süresi Doldu', value: 'süresi_doldu' }
    ]
};

// Tüm durumları, değerine göre metnini kolayca almak için bir haritaya dönüştürür.
export const ALL_STATUS_MAP = Object.values(STATUSES).flat().reduce((map, status) => {
    map[status.value] = status.text;
    return map;
}, {});

// GÜNCEL: Bildirim türleri için sabitler
export const NOTIFICATION_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    INFO: 'info',
    WARNING: 'warning' // Bu türü de ekledik, istersen kullanabilirsin
};

// --- Yardımcı Fonksiyonlar ---

/**
 * Ekranda bilgilendirme mesajı gösterir.
 * @param {string} message - Gösterilecek mesaj.
 * @param {string} type - Mesajın türü (örn: 'success', 'error', 'info', 'warning').
 * @param {number} duration - Bildirimin ekranda kalma süresi (ms). Varsayılan 3000ms.
 */
export function showNotification(message, type = NOTIFICATION_TYPES.INFO, duration = 3000) {
    // Bildirim kapsayıcısını bul veya oluştur
    const notificationContainer = document.getElementById('notification-container') || createNotificationContainer();
    
    const notification = document.createElement('div');
    // GÜNCEL: notification-item sınıfını ekliyoruz
    notification.classList.add('notification-item'); 
    notification.classList.add(`notification-${type}`); 

    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    notification.appendChild(messageSpan);

    const closeButton = document.createElement('button');
    closeButton.textContent = '×'; // Çarpı işareti
    closeButton.classList.add('notification-close-btn');
    closeButton.addEventListener('click', () => {
        notification.classList.add('hide'); // Gizleme animasyonu için 'hide' sınıfı ekle
        // Animasyon bittikten sonra elementi DOM'dan kaldır
        notification.addEventListener('transitionend', () => notification.remove(), { once: true });
    });
    notification.appendChild(closeButton);

    notificationContainer.appendChild(notification);

    // Bildirimi otomatik olarak gizle
    setTimeout(() => {
        notification.classList.add('hide'); // Gizleme animasyonunu başlat
        // Animasyon bittikten sonra elementi DOM'dan kaldır
        notification.addEventListener('transitionend', () => notification.remove(), { once: true });
    }, duration);
}

// GÜNCEL: createNotificationContainer fonksiyonu
function createNotificationContainer() {
    // Eğer element zaten varsa, onu döndür, yoksa oluştur
    let container = document.getElementById('notification-container');
    if (container) {
        return container;
    }

    container = document.createElement('div');
    container.id = 'notification-container';
    container.classList.add('notification-container'); // GÜNCEL: CSS sınıfını da ekle
    document.body.appendChild(container); // Body'nin sonuna ekle
    return container;
}

/**
 * Bir dosyayı Base64 formatına çevirir.
 * @param {File} file - Çevrilecek dosya.
 * @returns {Promise<object>} Dosya adı, tipi, boyutu ve base64 içeriğini içeren bir nesne.
 */
export function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({
            name: file.name,
            type: file.type,
            size: file.size,
            content: reader.result
        });
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

/**
 * Dosya boyutunu okunabilir bir formata çevirir (örn: KB, MB).
 * @param {number} bytes - Dosya boyutu (byte cinsinden).
 * @returns {string} Formatlanmış dosya boyutu.
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Belirli bir form alanında hata mesajı gösterir ve alanı vurgular.
 * @param {string} fieldId - Hata gösterilecek alanın ID'si.
 * @param {string} message - Gösterilecek hata mesajı.
 */
export function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    // Hata mesajı elementi `fieldId` + "Error" olarak varsayılır. Örn: "email" -> "emailError"
    const errorElement = document.getElementById(`${fieldId}Error`);

    if (field) {
        field.classList.add('error-field');
    }
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

/**
 * Formlardaki tüm hata mesajlarını ve alan vurgularını temizler.
 */
export function clearAllFieldErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
    });
    document.querySelectorAll('.form-input.error-field, .form-select.error-field').forEach(el => {
        el.classList.remove('error-field');
    });
}