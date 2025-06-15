// utils.js

/**
 * Kullanıcıya bildirim mesajı gösterir.
 * @param {string} message - Gösterilecek mesaj.
 * @param {'success' | 'error' | 'info'} type - Bildirim tipi (success, error, info).
 * @param {number} duration - Bildirimin ekranda kalma süresi (ms cinsinden, varsayılan 5000ms).
 */
export function showNotification(message, type = 'info', duration = 5000) {
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    const infoMessage = document.getElementById('infoMessage');

    // Tüm mesajları gizle
    if (successMessage) successMessage.style.display = 'none';
    if (errorMessage) errorMessage.style.display = 'none';
    if (infoMessage) infoMessage.style.display = 'none';

    let targetMessage;
    let targetText;

    // Hedef mesaj elementini ve metin elementini belirle
    switch (type) {
        case 'success':
            targetMessage = successMessage;
            targetText = document.getElementById('successText');
            break;
        case 'error':
            targetMessage = errorMessage;
            targetText = document.getElementById('errorText');
            break;
        case 'info':
            targetMessage = infoMessage;
            targetText = document.getElementById('infoText');
            break;
        default:
            targetMessage = infoMessage;
            targetText = document.getElementById('infoText');
    }

    if (targetMessage && targetText) {
        targetText.textContent = message;
        targetMessage.style.display = 'flex'; // Flex olarak göster
        setTimeout(() => {
            targetMessage.style.display = 'none';
        }, duration);
    }
}

/**
 * Belirli bir alandaki hata mesajını gösterir.
 * @param {string} fieldId - Hata mesajı gösterilecek input veya elementin ID'si.
 * @param {string} message - Gösterilecek hata mesajı.
 */
export function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorDiv = document.getElementById(`${fieldId}-error`);
    
    if (field) {
        field.classList.add('error-field'); // Hata stilini uygula
    }
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

/**
 * Tüm hata mesajlarını temizler ve alanlardan hata stilini kaldırır.
 */
export function clearAllFieldErrors() {
    document.querySelectorAll('.error-field').forEach(field => {
        field.classList.remove('error-field');
    });
    document.querySelectorAll('.error-message').forEach(errorDiv => {
        errorDiv.style.display = 'none';
        errorDiv.textContent = ''; // Mesajı da temizle
    });
}

/**
 * Verilen bir tarihin dosya boyutu formatını döndürür.
 * @param {number} bytes - Bayt cinsinden dosya boyutu.
 * @returns {string} Okunabilir dosya boyutu.
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Bir dosyayı Data URL olarak okur.
 * @param {File} file - Okunacak dosya objesi.
 * @returns {Promise<string>} Data URL stringi.
 */
export function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}