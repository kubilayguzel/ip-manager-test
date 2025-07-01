// js/bulk-indexing-module.js

// Firebase servisleri ve yardımcı fonksiyonları import et
import {
    authService,
    ipRecordsService,
    bulkIndexingService,
    generateUUID,
    db,
    firebaseServices
} from '../firebase-config.js';

// Firestore'dan doğrudan gereken fonksiyonları import et
import { 
    collection, query, where, orderBy, doc, updateDoc, 
    getDocs, setDoc, onSnapshot, serverTimestamp, 
    deleteField, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// utils.js'den yardımcı fonksiyonları import et
import {
    showNotification
} from '../utils.js';

// Constants
const UNINDEXED_PDFS_COLLECTION = 'unindexed_pdfs';

export class BulkIndexingModule {
    constructor() {
        this.currentUser = authService.getCurrentUser();
        if (!this.currentUser) {
            window.location.href = 'index.html';
            return;
        }

        this.uploadedFiles = [];
        this.portfolioRecords = [];
        this.activeFileTab = 'all-files-pane';
        this.unsubscribe = null;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadPortfolioRecords();
        await this.loadPdfsFromFirestore();
        this.setupRealtimeListener();
        this.updateUI();
    }

    async loadPortfolioRecords() {
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
            showNotification("Dosya listesi yüklenirken hata oluştu.", "error");
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
        document.querySelectorAll('#fileListSection .tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        document.querySelectorAll('#fileListSection .tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });

        const selectedTab = document.querySelector(`#fileListSection [data-tab="${targetPane}"]`);
        if (selectedTab) {
            selectedTab.classList.add('active');
        }

        const selectedPane = document.getElementById(targetPane);
        if (selectedPane) {
            selectedPane.classList.add('active');
        }

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
                fileInfo.textContent = `${this.uploadedFiles.filter(f => f.status !== 'removed').length} PDF dosyası mevcut.`;
            } else {
                fileInfo.textContent = 'PDF dosyası seçin veya sürükleyip bırakın.';
            }
        }

        // Badge güncellemeleri
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
        const indexableDocs = this.uploadedFiles.filter(f => f.status !== 'unmatched_by_user' && f.status !== 'removed');
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
                <div class="pdf-icon">📄</div>
                <div class="pdf-details">
                    <div class="pdf-name">${file.fileName}</div>
                    <div class="pdf-meta">
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
                </div>
                <div class="pdf-actions">
                    <button class="action-btn view-btn" onclick="window.open('${file.fileUrl}', '_blank')">
                        👁️ Görüntüle
                    </button>
                    
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
                    
                    <button class="action-btn danger-btn" onclick="window.indexingModule.deleteFilePermanently('${file.id}')">
                        🚫 Kaydı Sil
                    </button>
                </div>
            </div>
        `).join('');
    }

    // getStatusText fonksiyonu artık gerekli değil - durum bilgisi gösterilmiyor

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

            showNotification(`${fileToRestore.fileName} geri yüklendi.`, 'success');
        } catch (error) {
            console.error("Dosya geri yüklenirken hata:", error);
            showNotification("Dosya geri yüklenirken hata oluştu.", "error");
        }
    }

    async deleteFilePermanently(fileId) {
        const confirmMessage = 'Bu dosyayı kalıcı olarak silmek istediğinizden emin misiniz?\n\n' +
                              '⚠️ Bu işlem geri alınamaz!\n' +
                              '• Dosya Firebase Storage\'dan silinecek\n' +
                              '• Veritabanı kaydı silinecek';
        
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            const fileToDelete = this.uploadedFiles.find(f => f.id === fileId);
            if (!fileToDelete) {
                showNotification('Dosya bulunamadı.', 'error');
                return;
            }

            // Firebase Storage'dan dosyayı sil
            if (fileToDelete.fileUrl) {
                try {
                    const storageRef = firebaseServices.storageRef(firebaseServices.storage, 
                        `${UNINDEXED_PDFS_COLLECTION}/${this.currentUser.uid}/${fileId}_${fileToDelete.fileName.replaceAll(' ', '_')}`
                    );
                    await firebaseServices.deleteObject(storageRef);
                } catch (storageError) {
                    console.warn('Storage\'dan silinirken hata:', storageError);
                }
            }

            // Firestore'dan kaydı sil
            await deleteDoc(doc(collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION), fileId));

            showNotification(`${fileToDelete.fileName} kalıcı olarak silindi.`, 'success');

        } catch (error) {
            console.error("Dosya silinirken hata:", error);
            showNotification("Dosya silinirken hata oluştu.", "error");
        }
    }

    async resetForm() {
        if (!this.currentUser) return;

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
            showNotification('Form sıfırlandı.', 'info');
        } catch (error) {
            console.error("Form sıfırlanırken hata:", error);
            showNotification("Form sıfırlanırken hata oluştu.", "error");
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

        // Dosya tab olayları
        document.addEventListener('click', (e) => {
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

        // TEK BİLDİRİM: Başlangıç
        showNotification(`${files.length} PDF dosyası yükleniyor...`, 'info', 2000);

        let matchedCount = 0;
        let unmatchedCount = 0;

        for (const file of files) {
            const pdfId = generateUUID();
            const fileNameForStorage = file.name.replaceAll(' ', '_'); 
            const storagePath = `${UNINDEXED_PDFS_COLLECTION}/${this.currentUser.uid}/${pdfId}_${fileNameForStorage}`;
            const storageRef = firebaseServices.storageRef(firebaseServices.storage, storagePath);
            const uploadTask = firebaseServices.uploadBytesResumable(storageRef, file);

            uploadTask.on('state_changed',
                (snapshot) => {
                    // Progress log kaldırıldı
                },
                (error) => {
                    console.error("Dosya yüklenirken hata:", error);
                    showNotification(`${file.name} yüklenemedi.`, 'error');
                },
                async () => {
                    const downloadURL = await firebaseServices.getDownloadURL(uploadTask.snapshot.ref);
                    let extractedAppNumber = this.extractApplicationNumber(file.name);
                    let matchedRecord = null;
                    let matchedRecordDisplay = 'Eşleşme Yok';

                    // Eşleşme kontrolü
                    if (extractedAppNumber) {
                        const normalizedExtracted = extractedAppNumber.replace(/[-_]/g, '/');
                        matchedRecord = this.portfolioRecords.find(record =>
                            record.applicationNumber &&
                            record.applicationNumber.toLowerCase().replace(/[-_]/g, '/') === normalizedExtracted.toLowerCase()
                        );
                        if (matchedRecord) {
                            matchedRecordDisplay = `${matchedRecord.title} (${matchedRecord.applicationNumber})`;
                            matchedCount++;
                        } else {
                            unmatchedCount++;
                        }
                    } else {
                        unmatchedCount++;
                    }

                    // Otomatik status belirleme
                    const fileStatus = matchedRecord ? 'pending' : 'unmatched_by_user';

                    const newPdfDoc = {
                        id: pdfId,
                        fileName: file.name,
                        fileSize: file.size,
                        fileType: file.type,
                        fileUrl: downloadURL,
                        extractedAppNumber: extractedAppNumber,
                        matchedRecordId: matchedRecord ? matchedRecord.id : null,
                        matchedRecordDisplay: matchedRecordDisplay,
                        status: fileStatus,
                        uploadedAt: serverTimestamp(),
                        userId: this.currentUser.uid,
                        userEmail: this.currentUser.email,
                        unmatchedAt: fileStatus === 'unmatched_by_user' ? serverTimestamp() : null
                    };

                    try {
                        await setDoc(doc(collection(firebaseServices.db, UNINDEXED_PDFS_COLLECTION), pdfId), newPdfDoc);
                    } catch (firestoreError) {
                        console.error("Firestore'a kaydedilirken hata:", firestoreError);
                        showNotification(`${file.name} kaydedilemedi.`, 'error');
                    }
                }
            );
        }

        // TEK BİLDİRİM: Sonuç (Upload tamamlandıktan sonra)
        setTimeout(() => {
            let resultMessage = `${files.length} dosya yüklendi.`;
            if (matchedCount > 0 && unmatchedCount > 0) {
                resultMessage += ` ${matchedCount} eşleşti, ${unmatchedCount} eşleşmedi.`;
            } else if (matchedCount > 0) {
                resultMessage += ` Tümü eşleşti.`;
            } else if (unmatchedCount > 0) {
                resultMessage += ` Hiçbiri eşleşmedi.`;
            }
            showNotification(resultMessage, 'success', 3000);
        }, 2000);

        document.getElementById('bulkFiles').value = '';
    }

    extractApplicationNumber(fileName) {
        const regex = /(TR)?\d{4}[-_/]\d+/i;
        const match = fileName.match(regex);
        return match ? match[0].toUpperCase() : null;
    }

    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}