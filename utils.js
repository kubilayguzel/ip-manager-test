// js/utils.js

// Bildirimleri göstermek için kullanılan fonksiyon
export function showNotification(message, type = 'info', duration = 3000) {
    const container = document.getElementById('notification-container');
    if (!container) {
        console.warn('Bildirim konteyneri bulunamadı: #notification-container');
        alert(message); // Fallback to alert if container not found
        return;
    }

    const notificationItem = document.createElement('div');
    notificationItem.classList.add('notification-item', `notification-${type}`);
    notificationItem.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.classList.add('notification-close-btn');
    closeBtn.innerHTML = '&times;'; // 'x' icon
    closeBtn.onclick = () => {
        notificationItem.classList.add('hide');
        notificationItem.addEventListener('transitionend', () => notificationItem.remove());
    };

    notificationItem.appendChild(closeBtn);
    container.appendChild(notificationItem);

    // Otomatik olarak kaybolma
    if (duration > 0) {
        setTimeout(() => {
            notificationItem.classList.add('hide');
            notificationItem.addEventListener('transitionend', () => notificationItem.remove());
        }, duration);
    }
}

// Formlardaki tüm hata mesajlarını ve hata stillerini temizleyen fonksiyon
export function clearAllFieldErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = ''; // Hata mesajını temizle
        el.style.display = 'none'; // Hata mesajını gizle
    });
    document.querySelectorAll('.form-input, .form-select, .form-textarea').forEach(el => {
        el.classList.remove('error-field'); // Hata stilini kaldır
    });
}
// Form alanında hata göstermek için kullanılan fonksiyon
export function showFieldError(fieldId, errorMessage) {
    const input = document.getElementById(fieldId);
    if (!input) return;

    const errorContainer = input.closest('.form-group')?.querySelector('.error-message');
    if (errorContainer) {
        errorContainer.textContent = errorMessage;
        errorContainer.style.display = 'block';
    }

    input.classList.add('error-field');
}

// Dosya boyutunu okunabilir formata çeviren fonksiyon
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Dosyayı Base64 Data URL'sine çeviren fonksiyon
export function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// Benzersiz UUID oluşturan fonksiyon
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Görev durumları (task-management.html ve task-detail.html'de kullanılır)
export const TASK_STATUSES = [
    { value: 'open', text: 'Açık' },
    { value: 'in-progress', text: 'Devam Ediyor' },
    { value: 'completed', text: 'Tamamlandı' },
    { value: 'pending', text: 'Beklemede' },
    { value: 'cancelled', text: 'İptal Edildi' },
    { value: 'on-hold', text: 'Askıda' },
    { value: 'awaiting-approval', text: 'Onay Bekliyor' }
];
// js/utils.js (Mevcut TASK_STATUSES sabiti altına ekleyin)

// IP Kayıt durumları (data-entry.html'de kullanılır)
export const STATUSES = {
    patent: [
        { value: 'application', text: 'Başvuru' },
        { value: 'pending', text: 'Beklemede' },
        { value: 'published', text: 'Yayınlandı' },
        { value: 'approved', text: 'Onaylandı' },
        { value: 'registered', text: 'Tescil Edildi' },
        { value: 'rejected', text: 'Reddedildi' },
        { value: 'expired', text: 'Süresi Doldu' },
        { value: 'invalid_not_renewed', text: 'Yenilenmedi (Geçersiz)' }
    ],
    trademark: [
        { value: 'application', text: 'Başvuru' },
        { value: 'pending', text: 'Beklemede' },
        { value: 'published', text: 'Yayınlandı' },
        { value: 'opposition_received', text: 'İtiraz Alındı' },
        { value: 'opposition_filed', text: 'İtiraz Edildi' },
        { value: 'approved', text: 'Onaylandı' },
        { value: 'registered', text: 'Tescil Edildi' },
        { value: 'refused', text: 'Reddedildi' },
        { value: 'partial_refusal', text: 'Kısmi Ret' },
        { value: 'expired', text: 'Süresi Doldu' },
        { value: 'invalid_void', text: 'İptal Edildi (Geçersiz)' },
        { value: 'invalid_not_renewed', text: 'Yenilenmedi (Geçersiz)' }
    ],
    design: [
        { value: 'application', text: 'Başvuru' },
        { value: 'pending', text: 'Beklemede' },
        { value: 'published', text: 'Yayınlandı' },
        { value: 'approved', text: 'Onaylandı' },
        { value: 'registered', text: 'Tescil Edildi' },
        { value: 'rejected', text: 'Reddedildi' },
        { value: 'expired', text: 'Süresi Doldu' },
        { value: 'invalid_not_renewed', text: 'Yenilenmedi (Geçersiz)' }
    ],
    copyright: [
        { value: 'registered', text: 'Tescil Edildi' },
        { value: 'pending', text: 'Beklemede' },
        { value: 'active', text: 'Aktif' },
        { value: 'expired', text: 'Süresi Doldu' }
    ]
};

export async function exportTableToExcel(tableId, filename = 'rapor') {
    const table = document.getElementById(tableId);
    if (!table) {
        console.error(`Tablo bulunamadı: #${tableId}`);
        showNotification(`Hata: '${tableId}' ID'li tablo bulunamadı.`, 'error');
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Veriler');

    const headerRowHtml = table.querySelector('thead tr#portfolioTableHeaderRow');
    const headerCellsHtml = Array.from(headerRowHtml.children);

    let headersForExcel = [];
    let imageColExcelIndex = -1;
    const htmlIndexToExcelIndexMap = new Map();

    let currentExcelColIndexCounter = 0;
    headerCellsHtml.forEach((th, htmlColIndex) => {
        const headerText = th.textContent.trim();
        if (headerText === 'İşlemler') return;

        headersForExcel.push(headerText);
        htmlIndexToExcelIndexMap.set(htmlColIndex, currentExcelColIndexCounter);

        if (headerText === 'Marka Görseli') {
            imageColExcelIndex = currentExcelColIndexCounter;
        }
        currentExcelColIndexCounter++;
    });

    worksheet.addRow(headersForExcel);

    worksheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1E3C72' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });

    const rowsHtml = table.querySelectorAll('tbody tr');
    const imagePromises = [];

    rowsHtml.forEach((rowHtml) => {
        if (rowHtml.style.display === 'none') return;

        const rowData = new Array(headersForExcel.length).fill('');
        const cellsHtml = Array.from(rowHtml.children);

        cellsHtml.forEach((cell, htmlColIndex) => {
            const excelColIndex = htmlIndexToExcelIndexMap.get(htmlColIndex);
            if (excelColIndex === undefined) return;

            if (excelColIndex === imageColExcelIndex) {
                const imgElement = cell.querySelector('img.trademark-image-thumbnail');
                if (imgElement && imgElement.src) {
                    rowData[excelColIndex] = ''; // Placeholder
                    // Satırı önce ekle, sonra doğru Excel satır numarasını al
                    worksheet.addRow(rowData);
                    const currentRowNumber = worksheet.lastRow.number;

                    imagePromises.push(new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const imgSize = 50;
                            canvas.width = imgSize;
                            canvas.height = imgSize;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, imgSize, imgSize);
                            const base64Data = canvas.toDataURL('image/png').split(';base64,')[1];
                            resolve({
                                base64: base64Data,
                                excelCol: excelColIndex,
                                excelRow: currentRowNumber
                            });
                        };
                        img.onerror = () => resolve(null);
                        img.src = imgElement.src;
                    }));
                } else {
                    rowData[excelColIndex] = cell.textContent.trim() || '-';
                    worksheet.addRow(rowData); // Resim yoksa yine de satırı ekle
                }
            } else {
                rowData[excelColIndex] = cell.textContent.trim();
            }
        });

        // Not: Eğer resim varsa satır zaten yukarıda eklendi
        if (rowData.every(v => v !== '')) {
            worksheet.addRow(rowData); // Eğer tüm hücreler doluysa ayrıca ekle
        }
    });

    const loadedImages = await Promise.all(imagePromises);
    loadedImages.forEach(imgData => {
        if (imgData && imgData.base64) {
            const imageId = workbook.addImage({
                base64: imgData.base64,
                extension: 'png',
            });

            worksheet.addImage(imageId, {
                tl: { col: imgData.excelCol, row: imgData.excelRow - 1 }, // 0-indexed
                ext: { width: 50, height: 50 }
            });

            worksheet.getRow(imgData.excelRow).height = 40; // 1-indexed
        }
    });

    worksheet.columns.forEach

    // PDF dışa aktarma için (html2pdf.js kütüphanesini varsayar)
export function exportTableToPdf(tableId, filename = 'rapor') {
    const table = document.getElementById(tableId);
    if (!table) {
        console.error(`Tablo bulunamadı: #${tableId}`);
        showNotification(`Hata: '${tableId}' ID'li tablo bulunamadı.`, 'error');
        return;
    }

    // Clone the table content for printing
    const printContent = table.cloneNode(true);
    
    // Remove Actions column and filter row
    const headerRow = printContent.querySelector('thead tr#portfolioTableHeaderRow');
    const filterRow = printContent.querySelector('thead tr#portfolioTableFilterRow');

    let actionsHeaderIndex = -1;
    if (headerRow) {
        Array.from(headerRow.children).forEach((th, index) => {
            if (th.textContent.includes('İşlemler')) {
                actionsHeaderIndex = index;
                th.remove(); // Remove header cell
            }
        });
    }

    if (filterRow) {
        filterRow.remove(); // Remove filter row
    }
    
    if (actionsHeaderIndex !== -1) {
        Array.from(printContent.querySelectorAll('tbody tr')).forEach(row => {
            if (row.children[actionsHeaderIndex]) {
                row.children[actionsHeaderIndex].remove(); // Remove action cell from each row
            }
        });
    }

    // Reset trademark image styles for PDF export
    Array.from(printContent.querySelectorAll('img.trademark-image-thumbnail')).forEach(img => {
        img.style.transition = 'none';
        img.style.transform = 'none';
        img.style.position = 'static';
        img.style.zIndex = 'auto';
        img.style.boxShadow = 'none';
        img.style.border = 'none';
        img.style.backgroundColor = 'transparent';
        img.style.padding = '0';
        img.style.width = '50px'; 
        img.style.height = '50px';
        img.style.objectFit = 'contain';

        const wrapper = img.closest('.trademark-image-wrapper');
        if (wrapper) {
            wrapper.style.position = 'static';
            wrapper.style.overflow = 'hidden';
            wrapper.style.height = 'auto';
            wrapper.style.width = 'auto';
        }
    });

    const opt = {
        margin: 10,
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
            scale: 2, 
            logging: true, 
            dpi: 192, 
            letterRendering: true,
            onclone: (document) => {
                document.querySelectorAll('.trademark-image-thumbnail').forEach(img => {
                    img.style.transition = 'none';
                    img.style.transform = 'none';
                    img.style.position = 'static';
                    img.style.zIndex = 'auto';
                    img.style.boxShadow = 'none';
                    img.style.border = 'none';
                    img.style.backgroundColor = 'transparent';
                    img.style.padding = '0';
                    img.style.width = '50px'; 
                    img.style.height = '50px';
                    img.style.objectFit = 'contain';

                    const wrapper = img.closest('.trademark-image-wrapper');
                    if (wrapper) {
                        wrapper.style.position = 'static';
                        wrapper.style.overflow = 'hidden';
                        wrapper.style.height = 'auto';
                        wrapper.style.width = 'auto';
                    }
                });
            }
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    html2pdf().from(printContent).set(opt).save();
    showNotification(`Tablo başarıyla '${filename}.pdf' olarak dışa aktarıldı!`, 'success');
}