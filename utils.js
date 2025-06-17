// utils.js

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

// Merkezi Tip Tanımlamaları
export const TYPE_NAMES = { 
    patent: 'Patent', 
    trademark: 'Marka', 
    design: 'Tasarım',
    copyright: 'Telif Hakkı'
};

// Tüm durumları tek bir haritada birleştirerek kolay erişim sağla
export const ALL_STATUS_MAP = Object.values(STATUSES).flat().reduce((map, status) => {
    map[status.value] = status.text;
    return map;
}, {});


export function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container') || createNotificationContainer();
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    container.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('hide');
        setTimeout(() => notification.remove(), 500);
    }, 5000);
}

function createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    document.body.appendChild(container);
    return container;
}

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