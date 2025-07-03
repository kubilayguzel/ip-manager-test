// js/etebs-module.js
// ETEBS Tebligatları Yönetim Modülü

import { etebsService, etebsAutoProcessor } from '../firebase-config.js';
import { authService } from '../firebase-config.js';

// Notification helper - mevcut sisteminizi kullanır
function showNotification(message, type = 'info') {
    // Önce mevcut showNotification fonksiyonunu kontrol et
    if (window.showNotification && typeof window.showNotification === 'function') {
        window.showNotification(message, type);
    } else {
        // Fallback: basit console log veya alert
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Alternatif: basit DOM notification
        const notificationContainer = document.querySelector('.notification-container');
        if (notificationContainer) {
            const notification = document.createElement('div');
            notification.className = `notification notification-${type}`;
            notification.textContent = message;
            notification.style.cssText = `
                background: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : '#d1ecf1'};
                color: ${type === 'success' ? '#155724' : type === 'error' ? '#721c24' : '#0c5460'};
                padding: 12px 20px;
                margin: 5px 0;
                border-radius: 8px;
                border: 1px solid ${type === 'success' ? '#c3e6cb' : type === 'error' ? '#f5c6cb' : '#bee5eb'};
            `;
            notificationContainer.appendChild(notification);
            
            // 5 saniye sonra kaldır
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 5000);
        } else {
            // Son çare: alert
            alert(`${type.toUpperCase()}: ${message}`);
        }
    }
}

export class ETEBSManager {
    constructor() {
        this.currentMode = 'etebs';
        this.notifications = [];
        this.filteredNotifications = [];
        this.isInitialized = false;
        
        // Wait for DOM and firebase to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        // Check if we're on the right page
        if (!document.getElementById('bulk-indexing-pane')) {
            return;
        }

        this.bindEvents();
        this.bindTabEvents(); // YENİ: Tab event listeners
        this.loadSavedToken();
        this.isInitialized = true;
        
        console.log('✅ ETEBS Manager initialized');
    }
    // 2. YENİ: Tab event binding fonksiyonu ekleyin
    bindTabEvents() {
        try {
            // Notifications tab switching
            document.querySelectorAll('.notifications-tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.switchNotificationsTab(btn.getAttribute('data-notifications-tab'));
                });
            });
        } catch (error) {
            console.error('Error binding tab events:', error);
        }
    }

    // 3. YENİ: Tab switching fonksiyonu ekleyin
    switchNotificationsTab(tabName) {
        try {
            // Update tab buttons
            document.querySelectorAll('.notifications-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-notifications-tab') === tabName);
            });

            // Update tab content
            document.querySelectorAll('.notifications-tab-pane').forEach(pane => {
                pane.classList.toggle('active', pane.id === `${tabName}-notifications-tab`);
            });
        } catch (error) {
            console.error('Error switching notifications tab:', error);
        }
    }
    bindEvents() {
        try {
            // Mode switching
            document.querySelectorAll('.mode-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.switchMode(e.target.closest('.mode-btn').dataset.mode);
                });
            });

            // Token fetch
            const fetchBtn = document.getElementById('fetchNotificationsBtn');
            if (fetchBtn) {
                fetchBtn.addEventListener('click', () => this.fetchNotifications());
            }

            // Refresh notifications
            const refreshBtn = document.getElementById('refreshNotificationsBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => this.refreshNotifications());
            }

            // Filter change
            const filterSelect = document.getElementById('dosyaTuruFilter');
            if (filterSelect) {
                filterSelect.addEventListener('change', (e) => this.filterNotifications(e.target.value));
            }

            // Token input validation
            const tokenInput = document.getElementById('etebsTokenInput');
            if (tokenInput) {
                tokenInput.addEventListener('input', (e) => this.validateTokenInput(e.target.value));
            }

            // Tab switching integration with existing system
            document.querySelectorAll('[data-tab="bulk-indexing-pane"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    // Update badge when ETEBS tab is opened
                    this.updateTabBadge();
                });
            });

        } catch (error) {
            console.error('Error binding ETEBS events:', error);
        }
    }

    switchMode(mode) {
        this.currentMode = mode;
        
        try {
            // Update button states
            document.querySelectorAll('.mode-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === mode);
            });

            // Show/hide content
            const etebsMode = document.getElementById('etebs-mode');
            const uploadMode = document.getElementById('upload-mode');
            
            if (etebsMode && uploadMode) {
                etebsMode.style.display = mode === 'etebs' ? 'block' : 'none';
                uploadMode.style.display = mode === 'upload' ? 'block' : 'none';
            }

            // Update tab badge based on mode
            this.updateTabBadge();

        } catch (error) {
            console.error('Error switching mode:', error);
        }
    }

    updateTabBadge() {
        try {
            const badge = document.querySelector('.tab-badge');
            if (!badge) return;

            if (this.currentMode === 'etebs') {
                badge.textContent = this.notifications.length || '0';
            } else {
                // Get uploaded files count from existing bulk upload logic
                const uploadedFiles = document.querySelectorAll('#allFilesList .pdf-list-item');
                badge.textContent = uploadedFiles.length || '0';
            }
        } catch (error) {
            console.error('Error updating tab badge:', error);
        }
    }

    async loadSavedToken() {
        try {
            const currentUser = authService.getCurrentUser();
            if (!currentUser) return;

            const tokenResult = await etebsService.getToken(currentUser.uid);
            if (tokenResult.success) {
                const tokenInput = document.getElementById('etebsTokenInput');
                if (tokenInput) {
                    tokenInput.value = tokenResult.data.token;
                    this.showTokenStatus('success', 'Kaydedilmiş token yüklendi');
                }
            }
        } catch (error) {
            console.log('No saved token found or error loading token:', error);
        }
    }

    validateTokenInput(token) {
        try {
            const validation = etebsService.validateToken(token);
            const input = document.getElementById('etebsTokenInput');
            
            if (!input) return;
            
            if (token.length === 0) {
                input.style.borderColor = '#e1e8ed';
                return;
            }
            
            if (validation.valid) {
                input.style.borderColor = '#27ae60';
            } else {
                input.style.borderColor = '#e74c3c';
            }
        } catch (error) {
            console.error('Error validating token:', error);
        }
    }

    async fetchNotifications() {
        const tokenInput = document.getElementById('etebsTokenInput');
        if (!tokenInput) return;

        const token = tokenInput.value.trim();
        
        if (!token) {
            this.showTokenStatus('error', 'Token giriniz');
            return;
        }

        const fetchBtn = document.getElementById('fetchNotificationsBtn');
        if (!fetchBtn) return;

        const originalText = fetchBtn.innerHTML;
        
        try {
            // Show loading state
            fetchBtn.innerHTML = '<span class="loading-spinner"></span><span>Yükleniyor...</span>';
            fetchBtn.disabled = true;
            
            this.showTokenStatus('loading', 'Tebligatlar çekiliyor...');

            // Fetch notifications from ETEBS
            const result = await etebsService.getDailyNotifications(token);

            if (result.success) {
                // Save token for future use
                const currentUser = authService.getCurrentUser();
                if (currentUser) {
                    await etebsService.saveToken(token, currentUser.uid);
                }
                
                this.notifications = result.data;
                this.filteredNotifications = [...this.notifications];
                
                this.showTokenStatus('success', 
                    `${result.totalCount} tebligat alındı (${result.matchedCount} eşleşen, ${result.unmatchedCount} eşleşmeyen)`
                );
                
                this.displayNotifications();
                this.updateStatistics();
                this.showNotificationsSection();
                this.updateTabBadge();
                
                showNotification(`${result.totalCount} ETEBS tebligatı başarıyla alındı`, 'success');
                
            } else {
                this.showTokenStatus('error', result.error);
                showNotification(`ETEBS Hatası: ${result.error}`, 'error');
            }

        } catch (error) {
            console.error('Fetch notifications error:', error);
            this.showTokenStatus('error', 'Beklenmeyen bir hata oluştu');
            showNotification('ETEBS bağlantısında hata oluştu', 'error');
        } finally {
            // Restore button state
            if (fetchBtn) {
                fetchBtn.innerHTML = originalText;
                fetchBtn.disabled = false;
            }
        }
    }

    async refreshNotifications() {
        const tokenInput = document.getElementById('etebsTokenInput');
        if (tokenInput && tokenInput.value.trim()) {
            await this.fetchNotifications();
        }
    }

    filterNotifications(dosyaTuru) {
        try {
            if (dosyaTuru) {
                this.filteredNotifications = this.notifications.filter(n => n.dosyaTuru === dosyaTuru);
            } else {
                this.filteredNotifications = [...this.notifications];
            }
            
            this.displayNotifications();
            this.updateStatistics();
        } catch (error) {
            console.error('Error filtering notifications:', error);
        }
    }
    // 5. YENİ: Otomatik tab switching fonksiyonu
    autoSwitchTab(matchedCount, unmatchedCount) {
        try {
            const activeTab = document.querySelector('.notifications-tab-btn.active');
            if (!activeTab) return;

            const currentTab = activeTab.getAttribute('data-notifications-tab');
            
            // If current tab is empty but other tab has items, switch automatically
            if (currentTab === 'matched' && matchedCount === 0 && unmatchedCount > 0) {
                this.switchNotificationsTab('unmatched');
            } else if (currentTab === 'unmatched' && unmatchedCount === 0 && matchedCount > 0) {
                this.switchNotificationsTab('matched');
            }
        } catch (error) {
            console.error('Error in auto tab switch:', error);
        }
    }

    displayNotifications() {
        try {
            const matchedList = document.getElementById('matchedNotificationsList');
            const unmatchedList = document.getElementById('unmatchedNotificationsList');
            
            if (!matchedList || !unmatchedList) return;

            const matchedNotifications = this.filteredNotifications.filter(n => n.matched);
            const unmatchedNotifications = this.filteredNotifications.filter(n => !n.matched);

            // Set data attributes for styling
            matchedList.setAttribute('data-type', 'matched');
            unmatchedList.setAttribute('data-type', 'unmatched');

            // Display matched notifications
            this.renderNotificationsList(matchedList, matchedNotifications, true);
            
            // Display unmatched notifications  
            this.renderNotificationsList(unmatchedList, unmatchedNotifications, false);

            // Update tab badges
            const matchedTabBadge = document.getElementById('matchedTabBadge');
            const unmatchedTabBadge = document.getElementById('unmatchedTabBadge');
            
            if (matchedTabBadge) matchedTabBadge.textContent = matchedNotifications.length;
            if (unmatchedTabBadge) unmatchedTabBadge.textContent = unmatchedNotifications.length;

            // Auto-switch to appropriate tab if current tab is empty
            this.autoSwitchTab(matchedNotifications.length, unmatchedNotifications.length);

        } catch (error) {
            console.error('Error displaying notifications:', error);
        }
    }

    // 6. renderNotificationsList fonksiyonunu güncelleyin (değişiklik yok ama kontrol için)
    renderNotificationsList(container, notifications, isMatched) {
        if (!container) return;

        if (notifications.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span>📋</span>
                    <p>Henüz ${isMatched ? 'eşleşen' : 'eşleşmeyen'} tebligat yok</p>
                </div>
            `;
            return;
        }

        container.innerHTML = notifications.map(notification => 
            this.createNotificationHTML(notification, isMatched)
        ).join('');

        // Bind action buttons
        container.querySelectorAll('.notification-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const action = e.target.closest('.notification-action-btn').dataset.action;
                const evrakNo = e.target.closest('.notification-action-btn').dataset.evrakNo;
                const notification = notifications.find(n => n.evrakNo === evrakNo);
                
                if (notification) {
                    this.handleNotificationAction(action, notification);
                }
            });
        });
    }

        createNotificationHTML(notification, isMatched) {
            try {
                const date = new Date(notification.belgeTarihi).toLocaleDateString('tr-TR');
                const konmaTarihi = new Date(notification.uygulamaKonmaTarihi).toLocaleDateString('tr-TR');

                return `
                    <div class="notification-card" data-evrak="${notification.evrakNo}">
                        <div class="card-header">
                            <span class="evrak-no">${notification.evrakNo}</span>
                            <span class="status ${isMatched ? 'status-matched' : 'status-unmatched'}">
                                ${isMatched ? '✔ Eşleşti' : '⚠ Eşleşmedi'}
                            </span>
                        </div>
                        <div class="card-body">
                            <div><strong>📁 Dosya No:</strong> ${notification.dosyaNo}</div>
                            <div><strong>📋 Tür:</strong> ${notification.dosyaTuru}</div>
                            <div><strong>📅 Belge Tarihi:</strong> ${date}</div>
                            <div><strong>📮 Konma Tarihi:</strong> ${konmaTarihi}</div>
                            <div><strong>📝 Açıklama:</strong> ${notification.belgeAciklamasi}</div>
                            ${isMatched ? `
                                <div class="matched-info">
                                    <strong>🎯 Eşleşen Kayıt:</strong><br>
                                    ${notification.matchedRecord?.title || notification.matchedRecord?.applicationNumber || 'Bilinmeyen Kayıt'}
                                    <br><small>✨ Otomatik eşleştirme (${notification.matchConfidence || 100}% güven)</small>
                                </div>
                            ` : ''}
                        </div>
                        <div class="card-footer">
                            ${isMatched ? `
                                <button class="btn btn-success btn-sm notification-action-btn" 
                                        data-action="downloadAndIndex" 
                                        data-evrak-no="${notification.evrakNo}">
                                    📥 İndir & İndeksle
                                </button>
                            ` : `
                                <button class="btn btn-primary btn-sm notification-action-btn" 
                                        data-action="download" 
                                        data-evrak-no="${notification.evrakNo}">
                                    📥 İndir
                                </button>
                            `}
                            <button class="btn btn-secondary btn-sm notification-action-btn" 
                                    data-action="preview" 
                                    data-evrak-no="${notification.evrakNo}">
                                👁️ Önizle
                            </button>
                        </div>
                    </div>
                `;
            } catch (error) {
                console.error('Error creating notification HTML:', error);
                return `
                    <div class="notification-card error">
                        <div class="card-header">
                            <span class="evrak-no">Hata</span>
                            <span class="status status-unmatched">❌ Hatalı</span>
                        </div>
                        <div class="card-body">
                            Tebligat gösterilemiyor: ${error.message}
                        </div>
                    </div>
                `;
            }
        }


    async handleNotificationAction(action, notification) {
        const tokenInput = document.getElementById('etebsTokenInput');
        if (!tokenInput) return;

        const token = tokenInput.value.trim();
        
        switch (action) {
            case 'downloadAndIndex':
                await this.downloadAndIndexNotification(token, notification);
                break;
            case 'download':
                await this.downloadNotification(token, notification);
                break;
            case 'preview':
                await this.previewNotification(token, notification);
                break;
        }
    }

    async downloadAndIndexNotification(token, notification) {
        try {
            showNotification('Evrak indiriliyor ve indeksleniyor...', 'info');
            
            // Download document
            const downloadResult = await etebsService.downloadDocument(token, notification.evrakNo);
            
            if (downloadResult.success) {
                // Auto-process the matched notification
                const currentUser = authService.getCurrentUser();
                if (!currentUser) {
                    showNotification('Kullanıcı girişi gerekli', 'error');
                    return;
                }

                const processResult = await etebsAutoProcessor.autoProcessMatched([notification], currentUser.uid);
                
                if (processResult[0]?.success) {
                    showNotification('Evrak başarıyla indekslendi!', 'success');
                    
                    // Update notification status
                    notification.processStatus = 'completed';
                    this.displayNotifications();
                } else {
                    showNotification(`İndeksleme hatası: ${processResult[0]?.error || 'Bilinmeyen hata'}`, 'error');
                }
            } else {
                showNotification(`İndirme hatası: ${downloadResult.error}`, 'error');
            }
            
        } catch (error) {
            console.error('Download and index error:', error);
            showNotification('Beklenmeyen bir hata oluştu', 'error');
        }
    }

    async downloadNotification(token, notification) {
        try {
            showNotification('Evrak indiriliyor...', 'info');
            
            const downloadResult = await etebsService.downloadDocument(token, notification.evrakNo);
            
            if (downloadResult.success) {
                // Redirect to indexing detail page for manual processing
                const queryParams = new URLSearchParams({
                    source: 'etebs',
                    evrakNo: notification.evrakNo,
                    dosyaNo: notification.dosyaNo,
                    description: notification.belgeAciklamasi,
                    dosyaTuru: notification.dosyaTuru
                });
                
                showNotification('Evrak indirildi. İndeksleme sayfasına yönlendiriliyor...', 'success');
                
                // Open in new tab
                setTimeout(() => {
                    window.open(`indexing-detail.html?${queryParams.toString()}`, '_blank');
                }, 1000);
                
            } else {
                showNotification(`İndirme hatası: ${downloadResult.error}`, 'error');
            }
            
        } catch (error) {
            console.error('Download error:', error);
            showNotification('İndirme sırasında hata oluştu', 'error');
        }
    }

    async previewNotification(token, notification) {
        try {
            // Create a detailed preview modal or alert
            const details = `
📄 ETEBS Tebligat Detayları

🆔 Evrak No: ${notification.evrakNo}
📁 Dosya No: ${notification.dosyaNo}  
📋 Dosya Türü: ${notification.dosyaTuru}
📅 Tarih: ${new Date(notification.belgeTarihi).toLocaleDateString('tr-TR')}
📝 Açıklama: ${notification.belgeAciklamasi}

${notification.matched ? 
    `✅ Eşleşen Kayıt: ${notification.matchedRecord?.title || notification.matchedRecord?.applicationNumber}
🎯 Güven Oranı: ${notification.matchConfidence || 100}%` : 
    '❌ Eşleşen kayıt bulunamadı'
}

${notification.ilgiliVekil ? `👤 İlgili Vekil: ${notification.ilgiliVekil}` : ''}
${notification.tebellugeden ? `📨 Tebellüğ Eden: ${notification.tebellugeden}` : ''}
            `;
            
            alert(details.trim());
            
        } catch (error) {
            console.error('Preview error:', error);
            showNotification('Önizleme hatası', 'error');
        }
    }

    updateStatistics() {
        try {
            const total = this.filteredNotifications.length;
            const matched = this.filteredNotifications.filter(n => n.matched).length;
            const unmatched = total - matched;

            const totalCountEl = document.getElementById('totalCount');
            const matchedCountEl = document.getElementById('matchedCount');
            const unmatchedCountEl = document.getElementById('unmatchedCount');

            if (totalCountEl) totalCountEl.textContent = total;
            if (matchedCountEl) matchedCountEl.textContent = matched;
            if (unmatchedCountEl) unmatchedCountEl.textContent = unmatched;

            // Update tab badge
            this.updateTabBadge();
            
        } catch (error) {
            console.error('Error updating statistics:', error);
        }
    }

    showNotificationsSection() {
        try {
            const section = document.getElementById('notificationsSection');
            if (section) {
                section.style.display = 'block';
            }
        } catch (error) {
            console.error('Error showing notifications section:', error);
        }
    }

    showTokenStatus(type, message) {
        try {
            const statusEl = document.getElementById('tokenStatus');
            if (!statusEl) return;

            statusEl.className = `status-indicator status-${type}`;
            statusEl.style.display = 'flex';
            
            const icon = type === 'success' ? '✅' : 
                        type === 'error' ? '❌' : 
                        type === 'loading' ? '🔄' : 'ℹ️';
            
            statusEl.innerHTML = `<span>${icon}</span><span>${message}</span>`;
        } catch (error) {
            console.error('Error showing token status:', error);
        }
    }

    // Public methods for external access
    getNotifications() {
        return this.notifications;
    }

    getFilteredNotifications() {
        return this.filteredNotifications;
    }

    getCurrentMode() {
        return this.currentMode;
    }

    // Method to integrate with existing bulk indexing module
    integrateWithBulkIndexing(bulkIndexingModule) {
        try {
            // When upload mode is active, sync with bulk indexing
            if (this.currentMode === 'upload' && bulkIndexingModule) {
                // Observe changes in bulk indexing and update badge
                const observer = new MutationObserver(() => {
                    if (this.currentMode === 'upload') {
                        this.updateTabBadge();
                    }
                });

                const targetNode = document.getElementById('allFilesList');
                if (targetNode) {
                    observer.observe(targetNode, { 
                        childList: true, 
                        subtree: true 
                    });
                }
            }
        } catch (error) {
            console.error('Error integrating with bulk indexing:', error);
        }
    }
}

// Export for global access
window.ETEBSManager = ETEBSManager;

console.log('📁 ETEBS Module loaded successfully');