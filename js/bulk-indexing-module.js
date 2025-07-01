// js/bulk-indexing-module.js

// Firebase servisleri ve yardımcı fonksiyonları import et
import {
    authService,
    ipRecordsService, // IP kayıtlarını ve transaction'ları yönetmek için
    bulkIndexingService, // Bekleyen PDF'leri yönetmek için
    generateUUID,
    db, // Firestore instance
    firebaseServices // Yeni eklenen Firebase Storage servisleri için
} from '../firebase-config.js';

// utils.js'den yardımcı fonksiyonları import et
import {
    showNotification,
    formatFileSize
} from '../utils.js'; // readFileAsDataURL artık doğrudan kullanılmayacak

// Constants
const UNINDEXED_PDFS_COLLECTION = 'unindexed_pdfs';
const REMOVED_PDFS_COLLECTION = 'removed_pdfs'; // Kaldırılanlar için ayrı bir koleksiyon tutulacak

export class BulkIndexingModule {
    constructor() {
        this.currentUser = authService.getCurrentUser();
        if (!this.currentUser) {
            // Kullanıcı yoksa giriş sayfasına yönlendir, production ortamında kritik
            window.location.href = 'index.html';
            return;
        }

        this.uploadedFiles = []; // Sadece anlık UI durumu için, gerçek veri Firestore'dan gelecek
        this.activeFileTab = 'all-files-pane'; // Varsayılan aktif sekme
        this.unsubscribe = null; // Firestore dinleyicisini kapatmak için

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadPdfsFromFirestore(); // Sayfa yüklendiğinde PDF'leri Firestore'dan çek
        this.setupRealtimeListener(); // Firestore'dan gerçek zamanlı güncellemeler için dinleyici kur
        this.updateUI(); // Başlangıç UI güncellemesi
    }

    setupEventListeners() {
        const uploadButton = document.getElementById('bulkFilesButton');
        const fileInput = document.getElementById('bulkFiles');

        if (uploadButton) {
            uploadButton.addEventListener('click', () => fileInput.click());
            uploadButton.addEventListener('dragover', this.handleDragOver.bind(this));
            uploadButton.addEventListener('dragleave', this.handleDragLeave.bind(this));
            uploadButton.addEventListener('drop', this.handleDrop.bind(this));
        }
        if (fileInput) {
            fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        }

        // Ana tab olayları (İşleme Dosya Ekle, Manuel İşlem, PDF Yükleme ve Listeleme, Kaldırılanlar)
        document.querySelectorAll('.tabs-container .tab-btn').forEach(tab => {
            if (!tab.closest('.tab-content-container')) { // Sadece ana tablar için
                tab.addEventListener('click', (e) => {
                    const targetTab = e.target.getAttribute('data-tab');
                    this.switchMainTab(targetTab);
                });
            }
        });

        // Dosya listesi alt-tab olayları
        document.addEventListener('click', (e) => {
            // Bu kısım, bulk-indexing-page.html'deki dosya listesi tablarını yönetir
            if (e.target.closest('.tab-content-container') && e.target.classList.contains('tab-btn')) {
                const targetPane = e.target.getAttribute('data-tab');
                if (targetPane === 'all-files-pane' || targetPane === 'matched-files-pane' ||
                    targetPane === 'unmatched-files-pane' || targetPane === 'removed-files-pane') {
                    this.switchFileTab(targetPane);
                }
            }
        });

        const resetFormBtn = document.getElementById('resetBulkFormBtn');
        if (resetFormBtn) {
            resetFormBtn.addEventListener('click', this.resetForm.bind(this));
        }

        // Sayfadan ayrılırken dinleyiciyi kapat
        window.addEventListener('beforeunload', () => {
            if (this.unsubscribe) {
                this.unsubscribe();
            }
        });
    }

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.currentTarget.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
        this.uploadFiles(files);
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.uploadFiles(files);
    }

    async uploadFiles(files) {
        if (files.length === 0) return;

        showNotification('PDF dosyaları yükleniyor ve analiz ediliyor...', 'info', 3000);

        for (const file of files) {
            const pdfId = generateUUID();
            const storageRef = firebaseServices.storageRef(firebaseServices.storage, `${UNINDEXED_PDFS_COLLECTION}/${this.currentUser.uid}/${pdfId}_${file.name}`);
            const uploadTask = firebaseServices.uploadBytesResumable(storageRef, file);

            uploadTask.on('state_changed',
                (snapshot) => {
                    // Yükleme ilerlemesini burada gösterebilirsiniz
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    console.log('Upload is ' + progress + '% done');
                    // showNotification(`Yükleniyor: ${file.name} - %${progress.toFixed(0)}`, 'info'); // Çok sık bildirim göndermemek için yorum satırı
                },
                (error) => {
                    console.error("Dosya yüklenirken hata:", error);
                    showNotification(`'${file.name}' yüklenemedi: ${error.message}`, 'error', 8000);
                },
                async () => {
                    // Yükleme tamamlandı
                    const downloadURL = await firebaseServices.getDownloadURL(uploadTask.snapshot.ref);
                    let extractedAppNumber = this.extractApplicationNumber(file.name);
                    if (extractedAppNumber) {
                        extractedAppNumber = extractedAppNumber.replace(/[-_]/g, '/');
                    }

                    const newPdfDoc = {
                        id: pdfId,
                        fileName: file.name,
                        fileSize: file.size,
                        fileType: file.type,
                        fileUrl: downloadURL, // Firebase Storage URL'si
                        extractedAppNumber: extractedAppNumber,
                        matchedRecordId: null, // İndeksleme detay sayfasında eşleştirilecek
                        matchedRecordDisplay: 'Eşleşme Yok',
                        status: 'pending', // 'pending', 'indexed', 'removed'
                        uploadedAt: new Date().toISOString(),
                        userId: this.currentUser.uid,
                        userEmail: this.currentUser.email
                    };

                    try {
                        // Firestore'a kaydet
                        await firebaseServices.db.collection(UNINDEXED_PDFS_COLLECTION).doc(pdfId).set(newPdfDoc);
                        showNotification(`'${file.name}' başarıyla yüklendi ve işleme alındı!`, 'success', 3000);
                        // UI, realtime listener tarafından güncellenecek
                    } catch (firestoreError) {
                        console.error("Firestore'a kaydedilirken hata:", firestoreError);
                        showNotification(`'${file.name}' bilgisi kaydedilemedi: ${firestoreError.message}`, 'error', 8000);
                    }
                }
            );
        }
        // Dosya inputunu temizle
        document.getElementById('bulkFiles').value = '';
    }

    extractApplicationNumber(fileName) {
        // Dosya adından başvuru numarasını çıkarmak için regex
        const regex = /(TR)?\d{4}[-_/]\d+/i;
        const match = fileName.match(regex);
        return match ? match[0] : null;
    }

    async loadPdfsFromFirestore() {
        if (!this.currentUser) return;
        try {
            const q = firebaseServices.db.collection(UNINDEXED_PDFS_COLLECTION)
                .where('userId', '==', this.currentUser.uid)
                .where('status', 'in', ['pending', 'indexed', 'removed']) // Tüm durumları çek
                .orderBy('uploadedAt', 'desc');

            const snapshot = await q.get();
            this.uploadedFiles = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            this.updateUI();
        } catch (error) {
            console.error("PDF'ler Firestore'dan yüklenirken hata:", error);
            showNotification("PDF'ler yüklenirken bir hata oluştu.", "error");
        }
    }

    setupRealtimeListener() {
        if (!this.currentUser) return;
        const q = firebaseServices.db.collection(UNINDEXED_PDFS_COLLECTION)
            .where('userId', '==', this.currentUser.uid)
            .where('status', 'in', ['pending', 'indexed', 'removed'])
            .orderBy('uploadedAt', 'desc');

        this.unsubscribe = q.onSnapshot(snapshot => {
            this.uploadedFiles = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            this.updateUI();
        }, error => {
            console.error("Gerçek zamanlı dinleyici hatası:", error);
            showNotification("Dosya listesi güncellenirken bir hata oluştu.", "error");
        });
    }

    switchMainTab(targetTab) {
        document.querySelectorAll('.tabs-container .tab-btn').forEach(btn => {
            if (!btn.closest('.tab-content-container')) {
                btn.classList.remove('active');
            }
        });

        document.querySelectorAll('.tab-content-container > .tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });

        const selectedTab = document.querySelector(`[data-tab="${targetTab}"]:not(.tab-content-container .tab-btn)`);
        if (selectedTab) selectedTab.classList.add('active');

        const selectedPane = document.getElementById(targetTab);
        if (selectedPane) selectedPane.classList.add('active');
    }

    switchFileTab(targetPane) {
        document.querySelectorAll('.tab-content-container .tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        document.querySelectorAll('.tab-content-container .tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });

        const selectedTab = document.querySelector(`.tab-content-container [data-tab="${targetPane}"]`);
        if (selectedTab) selectedTab.classList.add('active');

        const selectedPane = document.getElementById(targetPane);
        if (selectedPane) selectedPane.classList.add('active');

        this.activeFileTab = targetPane;
        this.updateUI(); // Sekme değiştiğinde UI'ı güncelle
    }

    updateUI() {
        this.updateSections();
        this.renderFileLists();
    }

    updateSections() {
        const hasFiles = this.uploadedFiles.length > 0;

        document.getElementById('fileListSection').style.display = hasFiles ? 'block' : 'none';
        document.getElementById('bulkFormActions').style.display = hasFiles ? 'flex' : 'none';

        const fileInfo = document.getElementById('bulkFilesInfo');
        if (fileInfo) {
            if (hasFiles) {
                fileInfo.textContent = `${this.uploadedFiles.length} PDF dosyası yüklendi ve işleme alınıyor.`;
            } else {
                fileInfo.textContent = 'Henüz PDF dosyası seçilmedi. Birden fazla PDF dosyası seçebilirsiniz.';
            }
        }

        // Tab badge'lerini güncelle
        document.getElementById('totalBadge').textContent = this.uploadedFiles.filter(f => f.status !== 'removed').length;
        document.getElementById('allCount').textContent = this.uploadedFiles.filter(f => f.status !== 'removed').length;
        document.getElementById('matchedCount').textContent = this.uploadedFiles.filter(f => f.status !== 'removed' && f.matchedRecordId).length;
        document.getElementById('unmatchedCount').textContent = this.uploadedFiles.filter(f => f.status !== 'removed' && !f.matchedRecordId).length;
        document.getElementById('removedCount').textContent = this.uploadedFiles.filter(f => f.status === 'removed').length;
    }

    renderFileLists() {
        const allPending = this.uploadedFiles.filter(f => f.status !== 'removed');
        const matched = allPending.filter(f => f.matchedRecordId);
        const unmatched = allPending.filter(f => !f.matchedRecordId);
        const removed = this.uploadedFiles.filter(f => f.status === 'removed');


        document.getElementById('allFilesList').innerHTML = this.renderFileListHtml(allPending, 'all-files-pane');
        document.getElementById('matchedFilesList').innerHTML = this.renderFileListHtml(matched, 'matched-files-pane');
        document.getElementById('unmatchedFilesList').innerHTML = this.renderFileListHtml(unmatched, 'unmatched-files-pane');
        document.getElementById('removedFilesList').innerHTML = this.renderFileListHtml(removed, 'removed-files-pane'); // Yeni sekme
    }

    renderFileListHtml(files, currentTab) {
        if (files.length === 0) {
            return `
                <div class="empty-message">
                    <div class="empty-icon">📄</div>
                    <h3>Bu kategoride dosya bulunmuyor</h3>
                </div>
            `;
        }

        return files.map(file => `
            <div class="pdf-list-item ${file.matchedRecordId ? 'matched' : 'unmatched'}">
                <div class="pdf-icon">📄</div>
                <div class="pdf-details">
                    <div class="pdf-name">${file.fileName}</div>
                    <div class="pdf-meta">
                        Boyut: ${formatFileSize(file.fileSize)} • 
                        Çıkarılan No: ${file.extractedAppNumber || 'Tespit edilemedi'}
                    </div>
                    <div class="match-status ${file.matchedRecordId ? 'matched' : 'unmatched'}">
                        ${file.matchedRecordId ? 
                            `✅ Eşleşti: ${file.matchedRecordDisplay || file.extractedAppNumber}` : 
                            '❌ Portföyde eşleşme bulunamadı'
                        }
                    </div>
                    <div class="file-status">
                        Durum: <span class="status-text status-${file.status}">${this.getStatusText(file.status)}</span>
                    </div>
                </div>
                <div class="pdf-actions">
                    ${file.status === 'pending' ? `
                        <button class="action-btn complete-btn" onclick="window.location.href='indexing-detail.html?pdfId=${file.id}'">
                            ✨ İndeksle
                        </button>
                    ` : file.status === 'indexed' ? `
                        <button class="action-btn complete-btn" disabled>
                            ✅ İndekslendi
                        </button>
                    ` : file.status === 'removed' ? `
                        <button class="action-btn info-btn" onclick="indexing.restoreFile('${file.id}')">
                            ↩️ Geri Yükle
                        </button>
                    ` : ''}
                    
                    ${file.status !== 'removed' ? `
                        <button class="action-btn delete-btn" onclick="indexing.removeFile('${file.id}')">
                            🗑️ Kaldır
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    getStatusText(status) {
        switch(status) {
            case 'pending': return 'Beklemede';
            case 'indexed': return 'İndekslendi';
            case 'removed': return 'Kaldırıldı';
            default: return 'Bilinmiyor';
        }
    }

    async removeFile(fileId) {
        try {
            const fileToRemove = this.uploadedFiles.find(f => f.id === fileId);
            if (!fileToRemove) {
                showNotification('Dosya bulunamadı.', 'error');
                return;
            }

            // Firestore'da durumu 'removed' olarak güncelle
            await firebaseServices.db.collection(UNINDEXED_PDFS_COLLECTION).doc(fileId).update({
                status: 'removed',
                removedAt: new Date().toISOString()
            });

            // Gerçekten Storage'dan silmek istiyorsanız aşağıdaki kodu kullanın.
            // Bu senaryoda 'removed' sekmesinde tutmak için Storage'dan silmiyoruz.
            // const storageRef = firebaseServices.storageRef(firebaseServices.storage, new URL(fileToRemove.fileUrl).pathname);
            // await firebaseServices.deleteObject(storageRef);

            showNotification(`'${fileToRemove.fileName}' kaldırıldı.`, 'info');
        } catch (error) {
            console.error("Dosya kaldırılırken hata:", error);
            showNotification("Dosya kaldırılırken bir hata oluştu.", "error");
        }
    }

    async restoreFile(fileId) {
        try {
            const fileToRestore = this.uploadedFiles.find(f => f.id === fileId);
            if (!fileToRestore) {
                showNotification('Dosya bulunamadı.', 'error');
                return;
            }

            // Firestore'da durumu 'pending' olarak geri al
            await firebaseServices.db.collection(UNINDEXED_PDFS_COLLECTION).doc(fileId).update({
                status: 'pending',
                removedAt: firebaseServices.db.FieldValue.delete() // removedAt alanını sil
            });

            showNotification(`'${fileToRestore.fileName}' geri yüklendi.`, 'success');
        } catch (error) {
            console.error("Dosya geri yüklenirken hata:", error);
            showNotification("Dosya geri yüklenirken bir hata oluştu.", "error");
        }
    }

    async resetForm() {
        if (!this.currentUser) return;
        
        showNotification('Form sıfırlanıyor...', 'info');

        try {
            // Kullanıcının tüm bekleyen (pending) ve indekslenmiş (indexed) PDF'lerini sil veya kaldır.
            // Bu örnekte sadece "pending" ve "indexed" olanları 'removed' olarak işaretleyelim.
            // Tamamen silmek isterseniz:
            // const q = firebaseServices.db.collection(UNINDEXED_PDFS_COLLECTION)
            //     .where('userId', '==', this.currentUser.uid)
            //     .where('status', 'in', ['pending', 'indexed']);
            // const snapshot = await q.get();
            // const batch = firebaseServices.db.batch();
            // snapshot.docs.forEach(doc => {
            //     batch.update(doc.ref, { status: 'removed', removedAt: new Date().toISOString() });
            //     // Storage'dan da silmek isterseniz:
            //     // const storageRef = firebaseServices.storageRef(firebaseServices.storage, new URL(doc.data().fileUrl).pathname);
            //     // firebaseServices.deleteObject(storageRef);
            // });
            // await batch.commit();

            // Tüm dosyaları silmek yerine, sadece inputu temizleyelim ve UI listener'ın yenilemesini bekleyelim
            document.getElementById('bulkFiles').value = '';
            showNotification('Yükleme alanı temizlendi. Listelenen PDF\'ler Firestore\'da kalıcıdır.', 'info');
        } catch (error) {
            console.error("Form sıfırlanırken hata:", error);
            showNotification("Form sıfırlanırken bir hata oluştu.", "error");
        }
    }

    showNotification(message, type = 'info', duration = 3000) {
        // utils.js'den showNotification kullanılıyor. Eğer utils.js'ye erişim yoksa burada basit bir versiyonu olabilir.
        if (typeof showNotification === 'function') {
            showNotification(message, type, duration);
        } else {
            console.log(`Notification (${type}): ${message}`);
            // Basit bir fallback UI bildirimi
            const container = document.querySelector('.notification-container');
            if (container) {
                const alertDiv = document.createElement('div');
                alertDiv.className = `alert alert-${type}`;
                alertDiv.textContent = message;
                container.appendChild(alertDiv);
                setTimeout(() => alertDiv.remove(), duration);
            }
        }
    }
}