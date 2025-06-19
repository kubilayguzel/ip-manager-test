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

    // HTML içeriğini kopyalayalım ve PDF'tekine benzer şekilde işlem sütununu ve filtre inputlarını kaldıralım
    const exportTable = table.cloneNode(true);
    const headerRow = exportTable.querySelector('thead tr#portfolioTableHeaderRow');
    const filterRow = exportTable.querySelector('thead tr#portfolioTableFilterRow');

    let actionsHeaderIndex = -1;
    let imageColIndex = -1; 
    let headers = [];

    // Başlık satırını işle
    if (headerRow) {
        Array.from(headerRow.children).forEach((th, index) => {
            if (th.textContent.includes('İşlemler')) {
                actionsHeaderIndex = index;
            } else if (th.textContent.includes('Marka Görseli')) {
                imageColIndex = index;
                headers.push(th.textContent.trim()); // Marka Görseli başlığını ekle
            } else {
                headers.push(th.textContent.trim());
            }
        });
    }
    worksheet.addRow(headers); // Başlık satırını Excel'e ekle

    // Başlık stilini uygula
    worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; // Beyaz yazı
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1E3C72' } // Koyu mavi arka plan (#1e3c72)
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // 2. Tablo Verilerini ve Görseli Ekle
    const rowsHtml = table.querySelectorAll('tbody tr'); // Orijinal tabloyu kullanıyoruz
    const imagePromises = [];

    rowsHtml.forEach((rowHtml, rowIndex) => {
        const rowData = [];
        const cells = Array.from(rowHtml.children);
        
        let actualExcelColIndex = 1; // Excel sütunları 1'den başlar

        cells.forEach((cell, colIndex) => {
            // İşlemler sütununu hariç tut
            if (headerRow && headerRow.children[colIndex] && headerRow.children[colIndex].textContent.includes('İşlemler')) {
                return; 
            }

            if (colIndex === imageColIndex) { // Marka Görseli sütunu
                const imgElement = cell.querySelector('img.trademark-image-thumbnail');
                if (imgElement && imgElement.src) {
                    // Resim verisini al ve Promise dizisine ekle
                    imagePromises.push(new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            const base64Data = canvas.toDataURL('image/png').split(';base64,')[1]; // PNG formatına dönüştür
                            resolve({ base64: base64Data, excelCol: actualExcelColIndex, excelRow: rowIndex + 2 }); // Excel indexleri 1'den başlar, header sonrası +2
                        };
                        img.onerror = () => {
                            console.warn("Resim yüklenemedi veya erişilemedi:", imgElement.src);
                            resolve(null); // Hata durumunda null döndür
                        };
                        img.src = imgElement.src;
                    }));
                    rowData.push(''); // Resim hücresine şimdilik boş değer ekle, resim sonradan eklenecek
                } else {
                    rowData.push(cell.textContent.trim() || '-'); // Resim yoksa metni ekle
                }
            } else {
                rowData.push(cell.textContent.trim());
            }
            actualExcelColIndex++;
        });
        worksheet.addRow(rowData);
    });

    // Resimleri Excel'e ekle
    const loadedImages = await Promise.all(imagePromises);
    loadedImages.forEach(imgData => {
        if (imgData && imgData.base64) {
            const imageId = workbook.addImage({
                base64: imgData.base64,
                extension: 'png',
            });
            worksheet.addImage(imageId, {
                tl: { col: imgData.excelCol - 1, row: imgData.excelRow - 1 }, // Top-left corner (0-indexed)
                ext: { width: 50, height: 50 } // Resim boyutu
            });
            // Hücre yüksekliğini ayarlayalım ki resim sığsın
            worksheet.getRow(imgData.excelRow).height = 40; // Örnek yükseklik
        }
    });

    // Sütun genişliklerini otomatik ayarla
    worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
            const columnText = cell.value ? cell.value.toString() : '';
            maxLength = Math.max(maxLength, columnText.length);
        });
        column.width = Math.max(maxLength + 2, 10); // Minimum genişlik 10
    });
    // Marka Görseli sütunu için sabit genişlik
    if (imageColIndex !== -1) {
        worksheet.getColumn(imageColIndex + 1).width = 10; // +1 çünkü Excel sütunları 1'den başlar
    }

    // Dosyayı kaydet
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

    // HTML içeriğini kopyalayalım ve gereksiz butonları/filtreleri temizleyelim
    const printContent = table.cloneNode(true);
    
    // İşlem sütunu başlığını bul ve kaldır
    const headerRow = printContent.querySelector('thead tr#portfolioTableHeaderRow');
    const filterRow = printContent.querySelector('thead tr#portfolioTableFilterRow');

    let actionsHeaderIndex = -1;
    if (headerRow) {
        Array.from(headerRow.children).forEach((th, index) => {
            if (th.textContent.includes('İşlemler')) {
                actionsHeaderIndex = index;
                th.remove(); // Başlığı kaldır
            }
        });
    }

    // Filtre satırını tamamen kaldır
    if (filterRow) {
        filterRow.remove();
    }
    
    // Her satırdaki işlem hücresini kaldır
    if (actionsHeaderIndex !== -1) {
        Array.from(printContent.querySelectorAll('tbody tr')).forEach(row => {
            if (row.children[actionsHeaderIndex]) {
                row.children[actionsHeaderIndex].remove(); // Her satırdaki işlem hücresini kaldır
            }
        });
    }

    const opt = {
        margin: 10,
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
            scale: 2, // Çözünürlüğü artırmak için
            logging: true, 
            dpi: 192, 
            letterRendering: true,
            onclone: (document) => {
                // html2canvas'ın DOM'u klonladıktan sonra, bu klon üzerinde stil değişiklikleri yapabiliriz.
                // Bu, ana sayfadaki görünümü etkilemeden PDF'e özel render optimizasyonu sağlar.
                document.querySelectorAll('.trademark-image-thumbnail').forEach(img => {
                    // Hover efektinden kaynaklanan tüm transform ve position özelliklerini sıfırla
                    img.style.transition = 'none';
                    img.style.transform = 'none';
                    img.style.position = 'static'; // Fixed veya absolute yerine static
                    img.style.zIndex = 'auto';
                    img.style.boxShadow = 'none';
                    img.style.border = 'none';
                    img.style.backgroundColor = 'transparent';
                    img.style.padding = '0';
                    // PDF'te görünecek sabit boyutu ayarla
                    img.style.width = '50px'; 
                    img.style.height = '50px';
                    img.style.objectFit = 'contain';

                    // Wrapper div'in de gereksiz stillerini sıfırla
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
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } // Yatay A4 formatı
    };

    html2pdf().from(printContent).set(opt).save();
    showNotification(`Tablo başarıyla '${filename}.pdf' olarak dışa aktarıldı!`, 'success');
}