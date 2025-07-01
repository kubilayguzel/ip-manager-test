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
import { collection, query, where, orderBy, doc, updateDoc, getDocs, setDoc, onSnapshot, serverTimestamp, deleteField } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// utils.js'den yardımcı fonksiyonları import et
import {
    showNotification,
    formatFileSize
} from '../utils.js';


// Constants
const UNINDEXED_PDFS_COLLECTION = 'unindexed_pdfs';
// REMOVED_PDFS_COLLECTION artık kullanılmıyor, hepsi UNINDEXED_PDFS_COLLECTION içinde status ile yönetilecek

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

        // Dosya tab olayları - HER İKİ TAB İÇİN
        document.addEventListener('click', (e) => {
            if (e.target.closest('.tab-content-container') && e.target.classList.contains('tab-btn')) {
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
            // Dosya adında boşluklar olabileceği için replaceAll ile kaldırıldı
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
                        status: 'pending', // 'pending', 'indexed', 'removed'
                        uploadedAt: serverTimestamp(), // Firestore'un kendi zaman damgası
                        userId: this.currentUser.uid,
                        userEmail: this.currentUser.email
                    };

                    try {
                        // Firestore'a kaydet
                        await setDoc(doc(collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION), pdfId), newPdfDoc); 
                        showNotification(`'${file.name}' başarıyla yüklendi ve işleme alındı!`, 'success', 3000);
                    } catch (firestoreError) {
                        console.error("Firestore'a kaydedilirken hata:", firestoreError);
                        showNotification(`'${file.name}' bilgisi kaydedilemedi: ${firestoreError.message}`, 'error', 8000);
                    }
                }
            );
        }
        document.getElementById('bulkFiles').value = ''; // Dosya inputunu temizle
    }

    extractApplicationNumber(fileName) {
        const regex = /(TR)?\d{4}[-_/]\d+/i;
        const match = fileName.match(regex);
        return match ? match[0] : null;
    }

async loadPdfsFromFirestore() {
    if (!this.currentUser) return;
    try {
        const q = query(
            collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION), // collection çağrısı düzeltildi
            where('userId', '==', this.currentUser.uid), // where argüman olarak
            orderBy('uploadedAt', 'desc') // orderBy argüman olarak
        );

        const snapshot = await getDocs(q);
        this.uploadedFiles = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            uploadedAt: doc.data().uploadedAt ? doc.data().uploadedAt.toDate() : new Date() // Timestamp'i Date objesine çevir
        }));
        this.updateUI();
    } catch (error) {
        console.error("PDF'ler Firestore'dan yüklenirken hata:", error);
        showNotification("PDF'ler yüklenirken bir hata oluştu.", "error");
    }
}

setupRealtimeListener() {
    if (!this.currentUser) return;
    const q = query(
        collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION), // collection çağrısı düzeltildi
        where('userId', '==', this.currentUser.uid), // where argüman olarak
        orderBy('uploadedAt', 'desc') // orderBy argüman olarak
    );

    this.unsubscribe = onSnapshot(q, snapshot => { // onSnapshot'ı doğrudan kullanıyoruz
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
// Sadece tab-content-container içindeki tab button'ları etkile
    document.querySelectorAll('.tab-content-container .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.querySelectorAll('.tab-content-container .tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });

    // Tıklanan tab'ı active yap
    const selectedTab = document.querySelector(`.tab-content-container [data-tab="${targetPane}"]`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }

    // İlgili pane'i göster
    const selectedPane = document.getElementById(targetPane);
    if (selectedPane) {
        selectedPane.classList.add('active');
    }

    // Aktif tab'ı güncelle ve UI'yi yeniden render et
    this.activeFileTab = targetPane;
    this.updateUI();
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
            fileInfo.textContent = `${this.uploadedFiles.filter(f => f.status !== 'removed').length} PDF dosyası yüklendi ve işleme alınıyor.`;
        } else {
            fileInfo.textContent = 'Henüz PDF dosyası seçilmedi. Birden fazla PDF dosyası seçebilirsiniz.';
        }
    }

    // DÜZELTME: Badge'leri doğru şekilde güncelle
    const totalBadgeElement = document.getElementById('totalBadge');
    const allCountElement = document.getElementById('allCount');
    const unmatchedCountElement = document.getElementById('unmatchedCount');

    if (totalBadgeElement) {
        totalBadgeElement.textContent = this.uploadedFiles.filter(f => f.status !== 'removed').length;
    }
    if (allCountElement) {
        allCountElement.textContent = this.uploadedFiles.filter(f => f.status !== 'unmatched_by_user' && f.status !== 'removed').length;
    }
    if (unmatchedCountElement) {
        unmatchedCountElement.textContent = this.uploadedFiles.filter(f => f.status === 'unmatched_by_user').length;
    }
}
        renderFileLists() {
 // "İndekslenecek Dokümanlar" sekmesi için: Kullanıcı tarafından eşleşmeyen olarak işaretlenmemiş dosyalar
    const indexableDocs = this.uploadedFiles.filter(f => f.status !== 'unmatched_by_user' && f.status !== 'removed');
    // "Eşleşmeyenler" sekmesi için: Kullanıcı tarafından eşleşmeyen olarak işaretlenmiş dosyalar
    const unmatchedByUserDocs = this.uploadedFiles.filter(f => f.status === 'unmatched_by_user');

    const allFilesListElement = document.getElementById('allFilesList');
    const unmatchedFilesListElement = document.getElementById('unmatchedFilesList');

    if (allFilesListElement) {
        allFilesListElement.innerHTML = this.renderFileListHtml(indexableDocs);
    }
    if (unmatchedFilesListElement) {
        unmatchedFilesListElement.innerHTML = this.renderFileListHtml(unmatchedByUserDocs);
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
                <div class="file-status">
                    Durum: <span class="status-text status-${file.status}">${this.getStatusText(file.status)}</span>
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
                    ` : file.status === 'unmatched_by_user' ? ` <button class="action-btn info-btn" onclick="window.indexingModule.restoreFile('${file.id}')">
                            ↩️ Geri Yükle
                        </button>
                    ` : ''}
                    
                    ${file.status !== 'unmatched_by_user' ? ` <button class="action-btn delete-btn" onclick="window.indexingModule.removeFile('${file.id}')">
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
            case 'unmatched_by_user': return 'Eşleşmeyen'; // Yeni durum metni
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
                status: 'unmatched_by_user', // Durumu 'unmatched_by_user' olarak ayarla
                unmatchedAt: serverTimestamp() // Yeni bir zaman damgası ekleyebiliriz
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
                status: 'pending', // Durumu 'pending' olarak geri ayarla
                unmatchedAt: deleteField() // unmatchedAt alanını kaldır
            });

            showNotification(`'${fileToRestore.fileName}' tekrar indekslenecek dokümanlara eklendi.`, 'success');
        } catch (error) {
            console.error("Dosya geri yüklenirken hata:", error);
            showNotification("Dosya geri yüklenirken bir hata oluştu.", "error");
        }
    }

async resetForm() {
        if (!this.currentUser) return;
        
        showNotification('Form sıfırlanıyor...', 'info');

        try {
            const q = query(
                collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION),
                where('userId', '==', this.currentUser.uid),
                where('status', 'in', ['pending', 'indexed']) // Sadece beklemede ve indekslenmiş olanları hedefle
            );

            const snapshot = await getDocs(q);
            const batch = firebaseServices.db.batch();

            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { 
                    status: 'unmatched_by_user', // Durumu 'unmatched_by_user' olarak ayarla
                    unmatchedAt: serverTimestamp() // Yeni zaman damgası
                });
            });
            await batch.commit();

            document.getElementById('bulkFiles').value = '';
            showNotification('Yükleme alanı temizlendi ve listedeki PDF\'ler "Eşleşmeyenler" sekmesine taşındı.', 'info'); // Bildirim metni güncellendi
        } catch (error) {
            console.error("Form sıfırlanırken hata:", error);
            showNotification("Form sıfırlanırken bir hata oluştu.", "error");
        }
    }

    showNotification(message, type = 'info', duration = 3000) {
        if (typeof showNotification === 'function') {
            showNotification(message, type, duration);
        } else {
            console.log(`Notification (${type}): ${message}`);
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