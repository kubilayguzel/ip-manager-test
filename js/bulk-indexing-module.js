// js/bulk-indexing-module.js

// Firebase servisleri ve yardımcı fonksiyonları import et
import {
    authService,
    ipRecordsService,
    bulkIndexingService,
    generateUUID,
    db, // db instance'ı hala firebase-config'den geliyor
    firebaseServices // Yeni eklenen Firebase Storage servisleri için
} from '../firebase-config.js';

// Firestore'dan doğrudan gereken fonksiyonları import et
import { 
    collection, query, where, orderBy, doc, updateDoc, 
    getDocs, setDoc, onSnapshot, serverTimestamp, 
    deleteField, deleteDoc // Kalıcı silme için eklendi
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// utils.js'den yardımcı fonksiyonları import et
import {
    showNotification,
    formatFileSize
} from '../utils.js';

// Constants
const UNINDEXED_PDFS_COLLECTION = 'unindexed_pdfs';

export class BulkIndexingModule {
    constructor() {
        this.currentUser = authService.getCurrentUser();
        if (!this.currentUser) {
            window.location.href = 'index.html'; // Kullanıcı yoksa giriş sayfasına yönlendir
            return;
        }

        this.uploadedFiles = []; // Firestore'dan çekilen tüm PDF'ler (pending, indexed, removed)
        this.portfolioRecords = []; // Gerçek IP kayıtları Firestore'dan yüklenecek
        this.activeFileTab = 'all-files-pane'; // Varsayılan aktif sekme
        this.unsubscribe = null; // Firestore dinleyicisini kapatmak için

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadPortfolioRecords(); // Gerçek IP kayıtlarını yükle
        await this.loadPdfsFromFirestore(); // Sayfa yüklendiğinde PDF'leri Firestore'dan çek
        this.setupRealtimeListener(); // Firestore'dan gerçek zamanlı güncellemeler için dinleyici kur
        this.updateUI(); // Başlangıç UI güncellemesi
    }

    async loadPortfolioRecords() {
        // Gerçek IP kayıtlarını Firestore'dan çek
        const result = await ipRecordsService.getRecords();
        if (result.success) {
            this.portfolioRecords = result.data;
            console.log("Portföy kayıtları yüklendi:", this.portfolioRecords.length);
        } else {
            console.error("Portföy kayıtları yüklenemedi:", result.error);
            showNotification("Portföy kayıtları yüklenirken hata oluştu.", "error");
        }
    }

    async loadPdfsFromFirestore() {
        try {
            const q = query(
                collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION),
                where('userId', '==', this.currentUser.uid),
                orderBy('uploadedAt', 'desc')
            );

            const snapshot = await getDocs(q);
            this.uploadedFiles = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                uploadedAt: doc.data().uploadedAt ? doc.data().uploadedAt.toDate() : new Date()
            }));
            this.updateUI();
        } catch (error) {
            console.error("PDF'ler yüklenirken hata:", error);
            showNotification("Dosya listesi yüklenirken bir hata oluştu.", "error");
        }
    }

    setupRealtimeListener() {
        const q = query(
            collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION),
            where('userId', '==', this.currentUser.uid),
            orderBy('uploadedAt', 'desc')
        );

        this.unsubscribe = onSnapshot(q, (snapshot) => {
            this.uploadedFiles = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                uploadedAt: doc.data().uploadedAt ? doc.data().uploadedAt.toDate() : new Date()
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
        console.log('switchFileTab çağrıldı:', targetPane);
        
        // Sadece file section içindeki tab button'ları etkile
        document.querySelectorAll('#fileListSection .tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        document.querySelectorAll('#fileListSection .tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });

        // Tıklanan tab'ı active yap
        const selectedTab = document.querySelector(`#fileListSection [data-tab="${targetPane}"]`);
        if (selectedTab) {
            selectedTab.classList.add('active');
            console.log('Tab aktif edildi:', selectedTab);
        }

        // İlgili pane'i göster
        const selectedPane = document.getElementById(targetPane);
        if (selectedPane) {
            selectedPane.classList.add('active');
            console.log('Pane aktif edildi:', selectedPane);
        }

        // Aktif tab'ı güncelle ve UI'yi yeniden render et
        this.activeFileTab = targetPane;
        console.log('Aktif tab güncellendi:', this.activeFileTab);
        
        // UI'yi yeniden render et
        this.updateUI();
    }

    updateUI() {
        console.log('updateUI çağrıldı, dosya sayısı:', this.uploadedFiles.length);
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
                fileInfo.textContent = `${this.uploadedFiles.filter(f => f.status !== 'removed').length} PDF dosyası yüklendi ve işleme alınıyor.`;
            } else {
                fileInfo.textContent = 'Henüz PDF dosyası seçilmedi. Birden fazla PDF dosyası seçebilirsiniz.';
            }
        }

        // Badge güncellemeleri - Tüm elementleri kontrol et
        const totalBadgeElement = document.getElementById('totalBadge');
        const allCountElement = document.getElementById('allCount');
        const unmatchedCountElement = document.getElementById('unmatchedCount');

        const totalCount = this.uploadedFiles.filter(f => f.status !== 'removed').length;
        const indexableCount = this.uploadedFiles.filter(f => f.status !== 'unmatched_by_user' && f.status !== 'removed').length;
        const unmatchedCount = this.uploadedFiles.filter(f => f.status === 'unmatched_by_user').length;

        if (totalBadgeElement) totalBadgeElement.textContent = totalCount;
        if (allCountElement) allCountElement.textContent = indexableCount;
        if (unmatchedCountElement) unmatchedCountElement.textContent = unmatchedCount;
    }

    renderFileLists() {
        console.log('renderFileLists çağrıldı, aktif tab:', this.activeFileTab);
        
        // "İndekslenecek Dokümanlar" sekmesi için
        const indexableDocs = this.uploadedFiles.filter(f => f.status !== 'unmatched_by_user' && f.status !== 'removed');
        
        // "Eşleşmeyenler" sekmesi için
        const unmatchedByUserDocs = this.uploadedFiles.filter(f => f.status === 'unmatched_by_user');

        console.log('İndekslenebilir dokümanlar:', indexableDocs.length);
        console.log('Eşleşmeyen dokümanlar:', unmatchedByUserDocs.length);

        const allFilesListElement = document.getElementById('allFilesList');
        const unmatchedFilesListElement = document.getElementById('unmatchedFilesList');

        if (allFilesListElement) {
            allFilesListElement.innerHTML = this.renderFileListHtml(indexableDocs);
            console.log('allFilesList güncellendi');
        }
        if (unmatchedFilesListElement) {
            unmatchedFilesListElement.innerHTML = this.renderFileListHtml(unmatchedByUserDocs);
            console.log('unmatchedFilesList güncellendi');
        }
    }

    renderFileListHtml(files) {
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
                        <span>Boyut: ${formatFileSize(file.fileSize)}</span> • 
                        <span>Yükleme: ${file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString('tr-TR') : 'Bilinmiyor'}</span>
                    </div>
                    <div class="pdf-meta">
                        <strong>Çıkarılan Uygulama No:</strong> ${file.extractedAppNumber || 'Bulunamadı'}
                    </div>
                    <div class="match-status ${file.matchedRecordId ? 'matched' : 'unmatched'}">
                        ${file.matchedRecordId ? 
                            `✅ Eşleşti: ${file.matchedRecordDisplay}` : 
                            '❌ Portföy kaydı ile eşleşmedi'
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
                    ` : file.status === 'unmatched_by_user' ? `
                        <button class="action-btn info-btn" onclick="window.indexingModule.restoreFile('${file.id}')">
                            ↩️ Geri Yükle
                        </button>
                    ` : ''}
                    
                    ${file.status !== 'unmatched_by_user' ? `
                        <button class="action-btn warning-btn" onclick="window.indexingModule.removeFile('${file.id}')">
                            🗑️ Kaldır
                        </button>
                    ` : ''}
                    
                    <!-- Kaydı Kalıcı Sil Butonu -->
                    <button class="action-btn danger-btn" onclick="window.indexingModule.deleteFilePermanently('${file.id}')">
                        🚫 Kaydı Sil
                    </button>
                </div>
            </div>
        `).join('');
    }

    getStatusText(status) {
        switch(status) {
            case 'pending': return 'Beklemede';
            case 'indexed': return 'İndekslendi';
            case 'removed': return 'Kaldırıldı';
            case 'unmatched_by_user': return 'Eşleşmeyen';
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

            await updateDoc(doc(collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION), fileId), {
                status: 'unmatched_by_user',
                unmatchedAt: serverTimestamp()
            });

            showNotification(`'${fileToRemove.fileName}' eşleşmeyen olarak işaretlendi.`, 'info');
        } catch (error) {
            console.error("Dosya eşleşmeyen olarak işaretlenirken hata:", error);
            showNotification("Dosya eşleşmeyen olarak işaretlenirken bir hata oluştu.", "error");
        }
    }

    async restoreFile(fileId) {
        try {
            const fileToRestore = this.uploadedFiles.find(f => f.id === fileId);
            if (!fileToRestore) {
                showNotification('Dosya bulunamadı.', 'error');
                return;
            }

            await updateDoc(doc(collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION), fileId), {
                status: 'pending',
                unmatchedAt: deleteField()
            });

            showNotification(`'${fileToRestore.fileName}' tekrar indekslenecek dokümanlara eklendi.`, 'success');
        } catch (error) {
            console.error("Dosya geri yüklenirken hata:", error);
            showNotification("Dosya geri yüklenirken bir hata oluştu.", "error");
        }
    }

    async deleteFilePermanently(fileId) {
        const confirmMessage = 'Bu dosyayı kalıcı olarak silmek istediğinizden emin misiniz?\n\n' +
                              '⚠️ Bu işlem geri alınamaz!\n' +
                              '• Dosya Firebase Storage\'dan silinecek\n' +
                              '• Veritabanı kaydı silinecek\n' +
                              '• Tüm veriler kaybolacak';
        
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            const fileToDelete = this.uploadedFiles.find(f => f.id === fileId);
            if (!fileToDelete) {
                showNotification('Dosya bulunamadı.', 'error');
                return;
            }

            showNotification('Dosya kalıcı olarak siliniyor...', 'info');

            // 1. Firebase Storage'dan dosyayı sil
            if (fileToDelete.fileUrl) {
                try {
                    // Storage reference'ı URL'den çıkar
                    const storageRef = firebaseServices.storageRef(firebaseServices.storage, 
                        `${UNINDEXED_PDFS_COLLECTION}/${this.currentUser.uid}/${fileId}_${fileToDelete.fileName.replaceAll(' ', '_')}`
                    );
                    await firebaseServices.deleteObject(storageRef);
                    console.log('Dosya Storage\'dan silindi');
                } catch (storageError) {
                    console.warn('Storage\'dan silinirken hata (devam ediliyor):', storageError);
                }
            }

            // 2. Firestore'dan kaydı sil
            await deleteDoc(doc(collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION), fileId));

            showNotification(`'${fileToDelete.fileName}' kalıcı olarak silindi.`, 'success');
            console.log('Dosya başarıyla silindi:', fileToDelete.fileName);

        } catch (error) {
            console.error("Dosya kalıcı olarak silinirken hata:", error);
            showNotification("Dosya silinirken bir hata oluştu: " + error.message, "error");
        }
    }

    async resetForm() {
        if (!this.currentUser) return;
        
        showNotification('Form sıfırlanıyor...', 'info');

        try {
            const q = query(
                collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION),
                where('userId', '==', this.currentUser.uid),
                where('status', 'in', ['pending', 'indexed'])
            );

            const snapshot = await getDocs(q);
            const batch = firebaseServices.db.batch();

            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { 
                    status: 'unmatched_by_user',
                    unmatchedAt: serverTimestamp()
                });
            });
            await batch.commit();

            document.getElementById('bulkFiles').value = '';
            showNotification('Yükleme alanı temizlendi ve listedeki PDF\'ler "Eşleşmeyenler" sekmesine taşındı.', 'info');
        } catch (error) {
            console.error("Form sıfırlanırken hata:", error);
            showNotification("Form sıfırlanırken bir hata oluştu.", "error");
        }
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

        // Ana tab olayları
        document.querySelectorAll('.tabs-container .tab-btn').forEach(tab => {
            if (!tab.closest('.tab-content-container')) {
                tab.addEventListener('click', (e) => {
                    const targetTab = e.target.getAttribute('data-tab');
                    this.switchMainTab(targetTab);
                });
            }
        });

        // Dosya tab olayları - Event delegation kullan
        document.addEventListener('click', (e) => {
            // Tab button'a tıklandığında
            if (e.target.classList.contains('tab-btn') && 
                e.target.closest('#fileListSection')) {
                const targetPane = e.target.getAttribute('data-tab');
                if (targetPane === 'all-files-pane' || targetPane === 'unmatched-files-pane') {
                    this.switchFileTab(targetPane);
                }
            }
        });

        const resetFormBtn = document.getElementById('resetBulkFormBtn');
        if (resetFormBtn) {
            resetFormBtn.addEventListener('click', () => this.resetForm());
        }

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
            const fileNameForStorage = file.name.replaceAll(' ', '_'); 
            const storagePath = `${UNINDEXED_PDFS_COLLECTION}/${this.currentUser.uid}/${pdfId}_${fileNameForStorage}`;
            const storageRef = firebaseServices.storageRef(firebaseServices.storage, storagePath);
            const uploadTask = firebaseServices.uploadBytesResumable(storageRef, file);

            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    console.log('Upload is ' + progress + '% done for ' + file.name);
                },
                (error) => {
                    console.error("Dosya yüklenirken hata:", error);
                    showNotification(`'${file.name}' yüklenemedi: ${error.message}`, 'error', 8000);
                },
                async () => {
                    const downloadURL = await firebaseServices.getDownloadURL(uploadTask.snapshot.ref);
                    let extractedAppNumber = this.extractApplicationNumber(file.name);
                    let matchedRecord = null;
                    let matchedRecordDisplay = 'Eşleşme Yok';

                    if (extractedAppNumber) {
                        const normalizedExtracted = extractedAppNumber.replace(/[-_]/g, '/');
                        matchedRecord = this.portfolioRecords.find(record =>
                            record.applicationNumber &&
                            record.applicationNumber.toLowerCase().replace(/[-_]/g, '/') === normalizedExtracted.toLowerCase()
                        );
                        if (matchedRecord) {
                            matchedRecordDisplay = `${matchedRecord.title} (${matchedRecord.applicationNumber})`;
                        }
                    }

                    const newPdfDoc = {
                        id: pdfId,
                        fileName: file.name,
                        fileSize: file.size,
                        fileType: file.type,
                        fileUrl: downloadURL,
                        extractedAppNumber: extractedAppNumber,
                        matchedRecordId: matchedRecord ? matchedRecord.id : null,
                        matchedRecordDisplay: matchedRecordDisplay,
                        status: 'pending',
                        uploadedAt: serverTimestamp(),
                        userId: this.currentUser.uid,
                        userEmail: this.currentUser.email
                    };

                    try {
                        await setDoc(doc(collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION), pdfId), newPdfDoc); 
                        showNotification(`'${file.name}' başarıyla yüklendi ve işleme alındı!`, 'success', 3000);
                    } catch (firestoreError) {
                        console.error("Firestore'a kaydedilirken hata:", firestoreError);
                        showNotification(`'${file.name}' bilgisi kaydedilemedi: ${firestoreError.message}`, 'error', 8000);
                    }
                }
            );
        }
        document.getElementById('bulkFiles').value = '';
    }

    extractApplicationNumber(fileName) {
        const regex = /(TR)?\d{4}[-_/]\d+/i;
        const match = fileName.match(regex);
        return match ? match[0].toUpperCase() : null;
    }

    // Cleanup function
    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}