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

// Belirli bir form alanında hata mesajını gösteren ve hata stilini uygulayan fonksiyon
export function showFieldError(fieldId, errorMessage) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.classList.add('error-field'); // Alanı kırmızı kenarlıkla işaretle
        const errorContainer = field.nextElementSibling; // Genellikle hata mesajı input'un hemen sonrasındaki bir span veya div olur
        if (errorContainer && errorContainer.classList.contains('error-message')) {
            errorContainer.textContent = errorMessage;
            errorContainer.style.display = 'block';
        } else {
            // Eğer hata mesajı elementi yoksa, dinamik olarak oluştur
            const newErrorElement = document.createElement('div');
            newErrorElement.classList.add('error-message');
            newErrorElement.textContent = errorMessage;
            newErrorElement.style.display = 'block';
            field.parentNode.insertBefore(newErrorElement, field.nextSibling);
        }
    }
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

// Excel dışa aktarma için (ExcelJS kütüphanesini kullanır)
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
    const headerCellsHtml = Array.from(headerRowHtml.children); // Get children of the header row

    let headersForExcel = [];
    let imageColExcelIndex = -1; // 0-based index in the final Excel rowData array
    
    // Determine the columns to export and their final order in Excel
    headerCellsHtml.forEach((th, index) => {
        const headerText = th.textContent.trim();
        if (headerText === 'İşlemler') {
            return; // Skip Actions column
        }
        headersForExcel.push(headerText);
        if (headerText === 'Marka Görseli') {
            imageColExcelIndex = headersForExcel.length - 1; // 0-based index in headersForExcel
        }
    });
    worksheet.addRow(headersForExcel); // Add header row

    // Apply header style
    worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; // White font
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1E3C72' } // Dark blue background (#1e3c72)
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // 2. Add Table Data and Images
    const rowsHtml = table.querySelectorAll('tbody tr'); // Original table rows
    const imagePromises = [];

    let actualExcelDataRowIndex = 0; // 0-based index for data rows in Excel (after header)
    rowsHtml.forEach((rowHtml) => {
        // Only process visible rows (filtered by display style)
        if (rowHtml.style.display === 'none') {
            return;
        }

        const rowData = [];
        const cellsHtml = Array.from(rowHtml.children); // Cells of the current HTML row
        
        // Use a map for robust cell-to-header mapping
        const cellMap = new Map(); // Map: headerText -> cellElement
        headerCellsHtml.forEach((th, htmlColIndex) => {
            const headerText = th.textContent.trim();
            if (headerText !== 'İşlemler') { // Only map columns we intend to export
                cellMap.set(headerText, cellsHtml[htmlColIndex]);
            }
        });

        headersForExcel.forEach((headerLabel, excelColIndex) => {
            const cell = cellMap.get(headerLabel); // Get the corresponding HTML cell using headerLabel

            if (!cell) { // This should ideally not happen if headersForExcel is built from visible columns
                rowData.push(''); 
            } else if (headerLabel === 'Marka Görseli') { // Image column
                const imgElement = cell.querySelector('img.trademark-image-thumbnail');
                if (imgElement && imgElement.src) {
                    imagePromises.push(new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const imgSize = 50; // Standard size for thumbnail in Excel
                            canvas.width = imgSize;
                            canvas.height = imgSize;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, imgSize, imgSize); // Draw scaled image
                            const base64Data = canvas.toDataURL('image/png').split(';base64,')[1];
                            resolve({ 
                                base64: base64Data, 
                                excelCol: excelColIndex, // 0-based Excel column index for addImage
                                excelRow: actualExcelDataRowIndex // 0-based Excel row index for addImage (after header)
                            }); 
                        };
                        img.onerror = () => {
                            console.warn("Resim yüklenemedi veya erişilemedi:", imgElement.src);
                            resolve(null); 
                        };
                        img.src = imgElement.src;
                    }));
                    rowData.push(''); // Placeholder for the image cell
                } else {
                    rowData.push(cell.textContent.trim() || '-'); // Add text if no image
                }
            } else { // Other data columns
                rowData.push(cell.textContent.trim());
            }
        });
        worksheet.addRow(rowData); // Add data row to worksheet
        actualExcelDataRowIndex++; // Increment for the next actual data row in Excel
    });

    // Add images to Excel
    // Add images to Excel
    const loadedImages = await Promise.all(imagePromises);
    loadedImages.forEach(imgData => {
        if (imgData && imgData.base64) {
            const imageId = workbook.addImage({
                base64: imgData.base64,
                extension: 'png',
            });

            // Excel'deki 0-tabanlı satır ve sütun indeksleri
            const excelTargetRowIndex = imgData.excelRow + 1; // 0-based data row index + 1 for header row
            const excelTargetColIndex = imgData.excelCol; // 0-based col index

            // Resmin yerleşeceği hücreyi al (ExcelJS'in hücre objesi)
            const targetCell = worksheet.getCell(excelTargetRowIndex + 1, excelTargetColIndex + 1); // 1-based getCell

            worksheet.addImage(imageId, {
                tl: { col: excelTargetColIndex, row: excelTargetRowIndex }, // Resmin sol üst köşesi (0-tabanlı)
                ext: { width: 50, height: 50 } // Resmin kendi boyutu (50x50 piksel)
            });
            
            // Satır yüksekliğini artırıyoruz, böylece resimler rahat sığar.
            worksheet.getRow(excelTargetRowIndex + 1).height = 40; // excelTargetRowIndex 0-tabanlı olduğu için +1 (Excel'deki 1-tabanlı satır)
                                                                    // Eğer resimler bu yükseklikte hala üst üste biniyorsa,
                                                                    // bu değeri 50 veya 60 gibi daha büyük bir değere çıkarın.
        }
    });

    // Auto-adjust column widths
    worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
            const columnText = cell.value ? cell.value.toString() : '';
            maxLength = Math.max(maxLength, columnText.length);
        });
        const headerLabel = headersForExcel[column.number - 1]; // Get header label (0-based array index)
        if (headerLabel && headerLabel.includes('Marka Görseli')) { 
            column.width = 10; // Fixed width for image column
        } else {
            column.width = Math.max(maxLength + 2, 10); 
        }
    });
    
    // Save the file
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`);
    
    showNotification(`Tablo başarıyla '${filename}.xlsx' olarak dışa aktarıldı!`, 'success');
}

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