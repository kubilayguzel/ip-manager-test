// js/trademark-similarity-search.js

// === IMPORTS ===
import { db, personService, searchRecordService, similarityService } from '../firebase-config.js';
import { collection, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { runTrademarkSearch } from './trademark-similarity/run-search.js';
import Pagination from './pagination.js';
import { loadSharedLayout } from './layout-loader.js';

console.log("### trademark-similarity-search.js yüklendi ###");

// === GLOBAL VARIABLES ===
let allSimilarResults = [];
let monitoringTrademarks = [];
let filteredMonitoringTrademarks = [];
let allPersons = [];
let pagination;
let currentNoteModalData = {};

// === DOM ELEMENTS ===
const startSearchBtn = document.getElementById('startSearchBtn');
const researchBtn = document.getElementById('researchBtn');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const ownerSearchInput = document.getElementById('ownerSearch');
const niceClassSearchInput = document.getElementById('niceClassSearch');
const bulletinSelect = document.getElementById('bulletinSelect');
const resultsTableBody = document.getElementById('resultsTableBody');
const loadingIndicator = document.getElementById('loadingIndicator');
const noRecordsMessage = document.getElementById('noRecordsMessage');
const infoMessageContainer = document.getElementById('infoMessageContainer');

// Firebase Functions
const functions = getFunctions(undefined, "europe-west1");

// === UTILITY FUNCTIONS ===

// Bulletin key oluşturmak için yardımcı fonksiyon
function createBulletinKey(bulletinNo, bulletinDate) {
    // Format: "2024-123_20241201" 
    const dateStr = bulletinDate ? bulletinDate.replace(/[\/\-\.]/g, '') : '';
    return `${bulletinNo}_${dateStr}`;
}

// Bulletin bilgilerini parse etmek için fonksiyon
function parseBulletinKey(bulletinKey) {
    const parts = bulletinKey.split('_');
    return {
        bulletinNo: parts[0],
        bulletinDate: parts[1] || ''
    };
}

const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
};

function initializePagination() {
    pagination = new Pagination({
        containerId: 'paginationContainer',
        itemsPerPage: 10,
        onPageChange: renderCurrentPageOfResults
    });
}

// === DATA LOADING FUNCTIONS ===
async function loadInitialData() {
    console.log(">>> loadInitialData başladı");
    
    await loadSharedLayout({ activeMenuLink: 'trademark-similarity-search.html' });
    
    const personsResult = await personService.getPersons();
    if (personsResult.success) allPersons = personsResult.data;
    
    await loadBulletinOptions();
    
    const snapshot = await getDocs(collection(db, 'monitoringTrademarks'));
    monitoringTrademarks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    filteredMonitoringTrademarks = [...monitoringTrademarks];
    
    renderMonitoringList();
    updateMonitoringCount();
    checkCacheAndToggleButtonStates();
    
    console.log(">>> loadInitialData tamamlandı");
}

async function loadBulletinOptions() {
    try {
        const bulletinSelect = document.getElementById('bulletinSelect');
        bulletinSelect.innerHTML = '<option value="">Bülten seçin...</option>';

        // 1) Mevcut trademarkBulletins'leri al
        const trademarkBulletinsSnap = await getDocs(collection(db, 'trademarkBulletins'));
        const existingBulletins = trademarkBulletinsSnap.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(),
            hasOriginalBulletin: true 
        }));

        // 2) monitoringTrademarkRecords'dan bulletin key'lerini çek
        const monitoringBulletinKeys = await searchRecordService.getAllBulletinKeys();
        const monitoringBulletins = monitoringBulletinKeys.success ? 
            monitoringBulletinKeys.data.map(key => {
                const parsed = parseBulletinKey(key);
                return {
                    id: key,
                    bulletinNo: parsed.bulletinNo,
                    bulletinKey: key,
                    hasOriginalBulletin: false
                };
            }) : [];

        // 3) Tüm bültenleri birleştir - AYNI BÜLTEN NUMARASINI TEK KEZ GÖSTER
        const allBulletins = new Map();

        // Önce mevcut bültenleri ekle
        existingBulletins.forEach(bulletin => {
            const bulletinKey = createBulletinKey(
                bulletin.bulletinNo, 
                bulletin.createdAt ? bulletin.createdAt.toDate().toISOString().slice(0,10).replace(/-/g, '') : ''
            );
            
            allBulletins.set(bulletin.bulletinNo, {
                id: bulletin.id,
                bulletinNo: bulletin.bulletinNo,
                bulletinKey: bulletinKey,
                createdAt: bulletin.createdAt,
                hasOriginalBulletin: true
            });
        });

        // Monitoring'deki bültenleri ekle (sadece mevcut olmayan bülten numaraları için)
        monitoringBulletins.forEach(bulletin => {
            if (!allBulletins.has(bulletin.bulletinNo)) {
                allBulletins.set(bulletin.bulletinNo, bulletin);
            }
        });

        // 4) Sıralama ve select box'a ekleme
        const sortedBulletins = Array.from(allBulletins.values()).sort((a, b) => {
            // Önce tarih varsa tarihe göre sırala (yeni en üstte)
            if (a.createdAt && b.createdAt) {
                const dateA = (a.createdAt && typeof a.createdAt.toDate === 'function') ? a.createdAt.toDate() : new Date(0);
                const dateB = (b.createdAt && typeof b.createdAt.toDate === 'function') ? b.createdAt.toDate() : new Date(0);
                return dateB - dateA;
            }
            // Mevcut bültenler en üstte
            if (a.hasOriginalBulletin && !b.hasOriginalBulletin) return -1;
            if (!a.hasOriginalBulletin && b.hasOriginalBulletin) return 1;
            // Bülten numarasına göre sırala
            return b.bulletinNo.localeCompare(a.bulletinNo);
        });

        // 5) Options'ları ekle
        sortedBulletins.forEach(bulletin => {
            const option = document.createElement('option');
            option.value = bulletin.bulletinKey; // bulletinKey kullan
            option.dataset.hasOriginalBulletin = bulletin.hasOriginalBulletin;
            option.dataset.bulletinNo = bulletin.bulletinNo;
            option.dataset.bulletinKey = bulletin.bulletinKey;
            
            if (bulletin.hasOriginalBulletin) {
                let dateText = 'Tarih yok';
                if (bulletin.createdAt && typeof bulletin.createdAt.toDate === 'function') {
                    const dateObj = bulletin.createdAt.toDate();
                    if (!isNaN(dateObj.getTime())) dateText = dateObj.toLocaleDateString('tr-TR');
                }
                option.textContent = `${bulletin.bulletinNo} - ${dateText}`;
            } else {
                option.textContent = `${bulletin.bulletinNo}`;
            }
            
            bulletinSelect.appendChild(option);
        });

        console.log('✅ Bülten seçenekleri yüklendi:', {
            mevcutBultenler: existingBulletins.length,
            izlemeKayitlari: monitoringBulletins.length,
            toplam: allBulletins.size
        });

    } catch (error) {
        console.error('❌ Bülten seçenekleri yüklenirken hata:', error);
    }
}

// === FILTERING AND RENDERING FUNCTIONS ===
function updateMonitoringCount() {
    document.getElementById('monitoringCount').textContent = filteredMonitoringTrademarks.length;
}

function applyMonitoringListFilters() {
    const ownerFilter = ownerSearchInput.value.toLowerCase();
    const niceFilter = niceClassSearchInput.value.toLowerCase();
    
    filteredMonitoringTrademarks = monitoringTrademarks.filter(data => {
        const ownerNames = getOwnerNames(data).toLowerCase();
        const niceClasses = Array.isArray(data.niceClass) ? data.niceClass.join(' ') : (data.niceClass || '');
        return (!ownerFilter || ownerNames.includes(ownerFilter)) && (!niceFilter || niceClasses.includes(niceFilter));
    });
    
    renderMonitoringList();
    updateMonitoringCount();
    checkCacheAndToggleButtonStates();
}

function renderMonitoringList() {
    const tbody = document.getElementById('monitoringListBody');
    tbody.innerHTML = filteredMonitoringTrademarks.length === 0 
        ? '<tr><td colspan="5" class="no-records">Filtreye uygun izlenecek marka bulunamadı.</td></tr>'
        : filteredMonitoringTrademarks.map(tm => `
            <tr>
                <td style="text-align: left;">${tm.title || tm.markName || '-'}</td>
                <td>${tm.applicationNumber || '-'}</td>
                <td>${getOwnerNames(tm)}</td>
                <td>${Array.isArray(tm.niceClass) ? tm.niceClass.join(', ') : (tm.niceClass || '-')}</td>
                <td>${tm.applicationDate || '-'}</td>
            </tr>`).join('');
}

function getOwnerNames(item) {
    if (item.owners && Array.isArray(item.owners)) {
        return item.owners.map(owner => {
            if (owner.name) return owner.name;
            const person = allPersons.find(p => p.id === owner.id);
            return person ? person.name : 'Bilinmeyen Sahip';
        }).filter(Boolean).join(', ');
    } else if (typeof item.holders === 'string') {
        return item.holders;
    }
    return '-';
}

// === CACHE AND STATE MANAGEMENT ===

// loadCachedResultsOnly fonksiyonunu güncelle
async function loadCachedResultsOnly() {
    const selectedBulletinKey = bulletinSelect.value;
    if (!selectedBulletinKey || filteredMonitoringTrademarks.length === 0) {
        console.log('❌ loadCachedResultsOnly: selectedBulletin veya filteredMonitoringTrademarks boş');
        return;
    }

    const bulletinInfo = parseBulletinKey(selectedBulletinKey);
    console.log('🔍 loadCachedResultsOnly başladı:', {
        selectedBulletinKey,
        bulletinNo: bulletinInfo.bulletinNo,
        monitoringCount: filteredMonitoringTrademarks.length
    });

    loadingIndicator.textContent = 'İzleme kayıtları yükleniyor...';
    loadingIndicator.style.display = 'block';
    noRecordsMessage.style.display = 'none';
    resultsTableBody.innerHTML = '';
    allSimilarResults = [];

    // Yeni format ile sonuçları getir
    const allRecordsResult = await searchRecordService.getAllRecordsForBulletin(selectedBulletinKey);
    
    if (allRecordsResult.success && allRecordsResult.data.length > 0) {
        let cachedResults = [];
        
        allRecordsResult.data.forEach(record => {
            const matchedTrademark = filteredMonitoringTrademarks.find(tm => tm.id === record.monitoredTrademarkId);
            
            if (matchedTrademark && record.results) {
                record.results.forEach(r => {
                    cachedResults.push({
                        ...r,
                        source: 'cache',
                        monitoredTrademarkId: record.monitoredTrademarkId,
                        monitoredTrademark: matchedTrademark.title || matchedTrademark.markName || 'BELİRSİZ_MARKA'
                    });
                });
            }
        });

        allSimilarResults = cachedResults;

        if (allSimilarResults.length > 0) {
            groupAndSortResults();
        }
    }

    loadingIndicator.style.display = 'none';

    if (allSimilarResults.length > 0) {
        const infoMessage = `${allSimilarResults.length} mevcut izleme kaydı bulundu. (Yeni arama yapılamaz - bülten sistemde yok)`;
        infoMessageContainer.innerHTML = `<div class="info-message" style="background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; margin-top: 10px;">${infoMessage}</div>`;

        pagination.update(allSimilarResults.length);
        renderCurrentPageOfResults();
        noRecordsMessage.style.display = 'none';
    } else {
        noRecordsMessage.textContent = 'Bu bülten için izleme kaydı bulunamadı.';
        noRecordsMessage.style.display = 'block';
        pagination.update(0);
    }
}

// checkCacheAndToggleButtonStates fonksiyonunu güncelle
async function checkCacheAndToggleButtonStates() {
    const selectedBulletinKey = bulletinSelect.value;
    startSearchBtn.disabled = true;
    researchBtn.disabled = true;

    if (!selectedBulletinKey || filteredMonitoringTrademarks.length === 0) {
        return;
    }

    const selectedOption = bulletinSelect.querySelector(`option[value="${selectedBulletinKey}"]`);
    const hasOriginalBulletin = selectedOption?.dataset.hasOriginalBulletin === 'true';
    const selectedBulletinNo = selectedOption?.dataset.bulletinNo || '';

    console.log('🔍 Seçilen bülten kontrol:', {
        bulletinKey: selectedBulletinKey,
        bulletinNo: selectedBulletinNo,
        hasOriginalBulletin,
        optionText: selectedOption?.textContent
    });

    if (!hasOriginalBulletin) {
        startSearchBtn.disabled = true;
        researchBtn.disabled = true;

        infoMessageContainer.innerHTML = `
            <div class="info-message" style="background-color: #fff3cd; color: #856404; border: 1px solid #ffeaa7;">
                ⚠️ <strong>${selectedBulletinNo}</strong> bülteni sistemde kayıtlı değil. Yalnızca mevcut izleme kayıtlarınızı görüntüleyebilirsiniz.
            </div>
        `;

        console.log('🚀 loadCachedResultsOnly çağrılıyor...');
        await loadCachedResultsOnly();
        return;
    }

    infoMessageContainer.innerHTML = '';

    // Cache kontrolü - yeni format
    const monitoredTrademarkIds = filteredMonitoringTrademarks.map(tm => tm.id);
    const batchResults = await searchRecordService.getBatchRecords(monitoredTrademarkIds, selectedBulletinKey);
    const cachedCount = batchResults.success ? batchResults.data.length : 0;

    if (cachedCount > 0) {
        researchBtn.disabled = false;
        console.log('✅ Yeniden ara butonu aktif - önbellek var');
    }

    if (cachedCount === filteredMonitoringTrademarks.length && filteredMonitoringTrademarks.length > 0) {
        startSearchBtn.disabled = true;
        infoMessageContainer.innerHTML = `<div class="info-message">Bu bülten için tüm sonuçlar önbellekte mevcut. Sonuçları görmek için aşağıya bakın.</div>`;
        
        console.log('🚀 performSearch çağrılıyor (fromCacheOnly=true)...');
        loadingIndicator.textContent = 'Sonuçlar otomatik olarak yükleniyor...';
        await performSearch(true);
    } else {
        startSearchBtn.disabled = false;
        infoMessageContainer.innerHTML = '';
    }
}

// === SEARCH FUNCTIONS ===
async function performResearch() {
    const selectedBulletinKey = bulletinSelect.value;
    if (!selectedBulletinKey) return alert('Lütfen bir bülten seçin.');
    if (filteredMonitoringTrademarks.length === 0) return alert('Filtreye uygun izlenen marka bulunamadı.');

    const confirmMsg = `Seçili bülten için filtrelenmiş ${filteredMonitoringTrademarks.length} markanın mevcut arama sonuçları silinecek ve yeniden arama yapılacaktır. Onaylıyor musunuz?`;
    if (!confirm(confirmMsg)) return;

    loadingIndicator.textContent = 'Eski kayıtlar siliniyor...';
    loadingIndicator.style.display = 'block';
    startSearchBtn.disabled = true;
    researchBtn.disabled = true;

    // Yeni formatta silme işlemi
    const deletePromises = filteredMonitoringTrademarks.map(tm => 
        searchRecordService.deleteRecord(tm.id, selectedBulletinKey)
    );
    await Promise.all(deletePromises);
    
    await performSearch(false);
}

async function performSearch(fromCacheOnly = false) {
    const selectedBulletinKey = bulletinSelect.value;
    if (!selectedBulletinKey || filteredMonitoringTrademarks.length === 0) return;

    // UI'yi hazırla
    loadingIndicator.textContent = 'Arama yapılıyor...';
    loadingIndicator.style.display = 'block';
    noRecordsMessage.style.display = 'none';
    infoMessageContainer.innerHTML = '';
    resultsTableBody.innerHTML = '';
    allSimilarResults = [];
    startSearchBtn.disabled = true;
    researchBtn.disabled = true;

    let cachedResults = [];
    let trademarksToSearch = [];

    // Önbellekten veri çek
    const monitoredTrademarkIds = filteredMonitoringTrademarks.map(tm => tm.id);
    const batchResults = await searchRecordService.getBatchRecords(monitoredTrademarkIds, selectedBulletinKey);
    
    if (batchResults.success) {
        batchResults.data.forEach(record => {
            const tm = filteredMonitoringTrademarks.find(t => t.id === record.monitoredTrademarkId);
            if (tm && record.results) {
                cachedResults.push(...record.results.map(r => ({
                    ...r,
                    source: 'cache',
                    monitoredTrademarkId: tm.id,
                    monitoredTrademark: tm.title || tm.markName || 'BELİRSİZ_MARKA'
                })));
            }
        });
        
        // Cache'de olmayan markaları belirle
        const cachedTrademarkIds = batchResults.data.map(r => r.monitoredTrademarkId);
        trademarksToSearch = filteredMonitoringTrademarks.filter(tm => 
            !cachedTrademarkIds.includes(tm.id)
        );
    } else {
        trademarksToSearch = [...filteredMonitoringTrademarks];
    }

    let newSearchResults = [];
    
    // Yeni arama yap (eğer gerekiyorsa)
    if (!fromCacheOnly && trademarksToSearch.length > 0) {
        loadingIndicator.textContent = `${trademarksToSearch.length} marka için arama yapılıyor...`;

        // DÜZELTME 1: Cloud Function'ın beklediği format ile uyumlu payload
        const monitoredMarksPayload = trademarksToSearch.map(tm => ({
            id: tm.id,  // Cloud Function'da monitoredMark.id kullanılıyor
            markName: (tm.title || tm.markName || '').trim() || 'BELİRSİZ_MARKA',
            applicationDate: tm.applicationDate || '',
            niceClasses: Array.isArray(tm.niceClass) ? tm.niceClass : (tm.niceClass ? [tm.niceClass] : [])
        }));

        console.log("Cloud Function'a gönderilen markalar:", monitoredMarksPayload);

        try {
            // DÜZELTME 2: bulletinId parametresi - bulletinKey'den actual bulletinId'yi al
            const bulletinInfo = parseBulletinKey(selectedBulletinKey);
            
            // Gerçek bulletinId'yi almak için trademarkBulletins'ten sorgula
            let actualBulletinId = null;
            
            // Önce mevcut bültenlerde ara
            const selectedOption = bulletinSelect.querySelector(`option[value="${selectedBulletinKey}"]`);
            const hasOriginalBulletin = selectedOption?.dataset.hasOriginalBulletin === 'true';
            
            if (hasOriginalBulletin) {
                // Mevcut bülten - bulletinKey'in kendisi bulletinId
                const bulletinQuery = await getDocs(
                    query(collection(db, 'trademarkBulletins'), 
                          where('bulletinNo', '==', bulletinInfo.bulletinNo))
                );
                
                if (!bulletinQuery.empty) {
                    actualBulletinId = bulletinQuery.docs[0].id;
                    console.log('✅ Actual bulletinId bulundu:', actualBulletinId);
                } else {
                    throw new Error(`Bülten ID bulunamadı: ${bulletinInfo.bulletinNo}`);
                }
            } else {
                throw new Error('Yeni arama sadece sistemde kayıtlı bültenler için yapılabilir');
            }

            // DÜZELTME 3: Cloud Function'a doğru parametreleri gönder
            const resultsFromCF = await runTrademarkSearch(monitoredMarksPayload, actualBulletinId);

            if (resultsFromCF && resultsFromCF.length > 0) {
                newSearchResults = resultsFromCF.map(hit => {
                    const monitoredTm = trademarksToSearch.find(tm => tm.id === hit.monitoredTrademarkId);
                    return {
                        ...hit,
                        source: 'new',
                        monitoredTrademark: monitoredTm ? (monitoredTm.title || monitoredTm.markName || 'BELİRSİZ_MARKA') : 'Bilinmeyen Marka'
                    };
                });

                // Sonuçları grupla ve kaydet - YENİ FORMAT
                const groupedResults = newSearchResults.reduce((acc, currentResult) => {
                    const monitoredTrademarkId = currentResult.monitoredTrademarkId;
                    if (!acc[monitoredTrademarkId]) {
                        acc[monitoredTrademarkId] = [];
                    }
                    acc[monitoredTrademarkId].push(currentResult);
                    return acc;
                }, {});

                // Her marka için yeni formatta kaydet
                for (const [monitoredTrademarkId, results] of Object.entries(groupedResults)) {
                    await searchRecordService.saveRecord(
                        monitoredTrademarkId, 
                        { 
                            results: results, 
                            searchDate: new Date().toISOString(),
                            bulletinNo: bulletinInfo.bulletinNo,
                            actualBulletinId: actualBulletinId // Debug için
                        }, 
                        selectedBulletinKey
                    );
                }
                
                console.log('✅ Yeni sonuçlar kaydedildi:', {
                    bulletinNo: bulletinInfo.bulletinNo,
                    actualBulletinId: actualBulletinId,
                    resultCount: newSearchResults.length
                });
            } else {
                console.log('⚠️ Cloud Function sonuç döndürmedi');
            }
        } catch (error) {
            console.error("Arama işlemi sırasında hata:", error);
            alert('Arama hatası: ' + error.message);
            loadingIndicator.style.display = 'none';
            startSearchBtn.disabled = false;
            researchBtn.disabled = false;
            return;
        }
    }

    // Sonuçları birleştir ve grupla
    allSimilarResults = [...cachedResults, ...newSearchResults];
    groupAndSortResults();
    
    loadingIndicator.style.display = 'none';

    const infoMessage = `Toplam ${allSimilarResults.length} benzer sonuç bulundu (${cachedResults.length} önbellekten, ${newSearchResults.length} yeni arama ile)`;
    infoMessageContainer.innerHTML = `<div class="info-message">${infoMessage}</div>`;

    if (allSimilarResults.length > 0) {
        pagination.update(allSimilarResults.length);
        renderCurrentPageOfResults();
        noRecordsMessage.style.display = 'none';
    } else {
        noRecordsMessage.textContent = 'Hiçbir benzer sonuç bulunamadı.';
        noRecordsMessage.style.display = 'block';
        pagination.update(0);
    }

    // Butonları yeniden aktifleştir
    startSearchBtn.disabled = false;
    researchBtn.disabled = false;
}

function groupAndSortResults() {
    const groupedByTrademark = {};
    
    // Gruplara ayır
    allSimilarResults.forEach(result => {
        const trademarkId = result.monitoredTrademarkId || 'unknown';
        if (!groupedByTrademark[trademarkId]) {
            groupedByTrademark[trademarkId] = [];
        }
        groupedByTrademark[trademarkId].push(result);
    });
    
    // Her grup içinde benzerlik skoruna göre sırala
    Object.keys(groupedByTrademark).forEach(trademarkId => {
        groupedByTrademark[trademarkId].sort((a, b) => {
            const scoreA = a.similarityScore || 0;
            const scoreB = b.similarityScore || 0;
            return scoreB - scoreA;
        });
    });
    
    // Grupları marka adına göre alfabetik sırala
    const sortedTrademarkIds = Object.keys(groupedByTrademark).sort((a, b) => {
        const markA = groupedByTrademark[a][0]?.monitoredTrademark || 'Bilinmeyen Marka';
        const markB = groupedByTrademark[b][0]?.monitoredTrademark || 'Bilinmeyen Marka';
        return markA.localeCompare(markB);
    });
    
    // Final sonucu oluştur
    allSimilarResults = [];
    sortedTrademarkIds.forEach(trademarkId => {
        allSimilarResults.push(...groupedByTrademark[trademarkId]);
    });
    
    console.log("📊 Gruplandırılmış sonuçlar:", sortedTrademarkIds.length, "grup");
}

// === RENDERING FUNCTIONS ===
function renderCurrentPageOfResults() {
    resultsTableBody.innerHTML = '';
    if (!pagination) {
        console.error("Pagination objesi başlatılmamış.");
        return;
    }
    
    const currentPageData = pagination.getCurrentPageData(allSimilarResults);
    const startIndex = pagination.getStartIndex();

    if (allSimilarResults.length === 0) {
        noRecordsMessage.textContent = 'Arama sonucu bulunamadı.';
        noRecordsMessage.style.display = 'block';
        return;
    }

    noRecordsMessage.style.display = 'none';

    currentPageData.forEach((result, index) => {
        const actualIndex = startIndex + index;
        const row = createResultRow(result, actualIndex);
        resultsTableBody.appendChild(row);
    });
}

function createResultRow(result, index) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${index + 1}</td>
        <td style="text-align: left;">
            <strong>${result.monitoredTrademark || 'Bilinmeyen Marka'}</strong>
        </td>
        <td style="text-align: left;">
            <div class="result-mark-name">${result.markName || '-'}</div>
            ${result.imagePath ? `<img src="${result.imagePath}" alt="Marka Görseli" style="max-width: 50px; max-height: 50px; margin-top: 5px;">` : ''}
        </td>
        <td>${result.applicationNo || '-'}</td>
        <td>${result.applicationDate || '-'}</td>
        <td>${result.holders || '-'}</td>
        <td>${Array.isArray(result.niceClasses) ? result.niceClasses.join(', ') : (result.niceClasses || '-')}</td>
        <td>
            <span class="similarity-score">${(result.similarityScore || 0).toFixed(2)}</span>
        </td>
        <td>
            <div class="similarity-controls">
                <button class="btn-similar ${result.isSimilar === true ? 'active' : ''}" 
                        onclick="toggleSimilarity(this, '${result.monitoredTrademarkId}', '${bulletinSelect.value}', '${result.objectID}', true)">
                    Benzer
                </button>
                <button class="btn-not-similar ${result.isSimilar === false ? 'active' : ''}" 
                        onclick="toggleSimilarity(this, '${result.monitoredTrademarkId}', '${bulletinSelect.value}', '${result.objectID}', false)">
                    Benzemez
                </button>
            </div>
        </td>
        <td>
            <button class="btn-note" onclick="openNoteModal('${result.monitoredTrademarkId}', '${bulletinSelect.value}', '${result.objectID}', '${result.note || ''}')">
                ${result.note ? '📝' : '📝➕'}
            </button>
        </td>
        <td><span class="source-badge source-${result.source}">${result.source === 'cache' ? 'Önbellek' : 'Yeni'}</span></td>
    `;
    return row;
}

// === SIMILARITY TOGGLE FUNCTIONS ===
window.toggleSimilarity = async function(button, monitoredTrademarkId, bulletinKey, resultId, isSimilar) {
    try {
        const result = await similarityService.updateSimilarityFields(
            monitoredTrademarkId, 
            bulletinKey, 
            resultId, 
            { isSimilar }
        );

        if (result.success) {
            // UI'yi güncelle
            const row = button.closest('tr');
            const similarBtn = row.querySelector('.btn-similar');
            const notSimilarBtn = row.querySelector('.btn-not-similar');
            
            similarBtn.classList.toggle('active', isSimilar === true);
            notSimilarBtn.classList.toggle('active', isSimilar === false);
            
            // allSimilarResults array'ini de güncelle
            const resultIndex = allSimilarResults.findIndex(r => 
                r.monitoredTrademarkId === monitoredTrademarkId && 
                (r.objectID === resultId || r.applicationNo === resultId)
            );
            if (resultIndex !== -1) {
                allSimilarResults[resultIndex].isSimilar = isSimilar;
            }
            
            console.log(`✅ Benzerlik durumu güncellendi: ${resultId} -> ${isSimilar ? 'Benzer' : 'Benzemez'}`);
        } else {
            console.error('Benzerlik durumu güncellenemedi:', result.error);
            alert('Benzerlik durumu güncellenemedi: ' + result.error);
        }
    } catch (error) {
        console.error('Benzerlik durumu güncelleme hatası:', error);
        alert('Bir hata oluştu!');
    }
};

// === NOTE MODAL FUNCTIONS ===
window.openNoteModal = function(monitoredTrademarkId, bulletinKey, resultId, currentNote) {
    currentNoteModalData = { monitoredTrademarkId, bulletinKey, resultId };
    
    const modal = document.getElementById('noteModal');
    const textarea = document.getElementById('noteTextarea');
    
    textarea.value = currentNote || '';
    modal.style.display = 'block';
    textarea.focus();
};

window.closeNoteModal = function() {
    document.getElementById('noteModal').style.display = 'none';
    currentNoteModalData = {};
};

window.saveNote = async function() {
    const note = document.getElementById('noteTextarea').value.trim();
    const { monitoredTrademarkId, bulletinKey, resultId } = currentNoteModalData;
    
    if (!monitoredTrademarkId || !bulletinKey || !resultId) {
        alert('Not kaydedilemedi: Gerekli bilgiler eksik');
        return;
    }
    
    try {
        const result = await similarityService.updateSimilarityFields(
            monitoredTrademarkId, 
            bulletinKey, 
            resultId, 
            { note }
        );
        
        if (result.success) {
            // allSimilarResults array'ini güncelle
            const resultIndex = allSimilarResults.findIndex(r => 
                r.monitoredTrademarkId === monitoredTrademarkId && 
                (r.objectID === resultId || r.applicationNo === resultId)
            );
            if (resultIndex !== -1) {
                allSimilarResults[resultIndex].note = note;
            }
            
            // UI'yi güncelle
            renderCurrentPageOfResults();
            closeNoteModal();
            
            console.log(`✅ Not güncellendi: ${resultId}`);
        } else {
            alert('Not kaydedilemedi: ' + result.error);
        }
    } catch (error) {
        console.error('Not kaydetme hatası:', error);
        alert('Bir hata oluştu!');
    }
};

// === EVENT LISTENERS ===
document.addEventListener('DOMContentLoaded', async () => {
    console.log(">>> DOM Content Loaded");
    
    initializePagination();
    await loadInitialData();
    
    // Event Listeners
    startSearchBtn.addEventListener('click', () => performSearch(false));
    researchBtn.addEventListener('click', performResearch);
    clearFiltersBtn.addEventListener('click', () => {
        ownerSearchInput.value = '';
        niceClassSearchInput.value = '';
        applyMonitoringListFilters();
    });
    
    const debouncedFilter = debounce(applyMonitoringListFilters, 300);
    ownerSearchInput.addEventListener('input', debouncedFilter);
    niceClassSearchInput.addEventListener('input', debouncedFilter);
    bulletinSelect.addEventListener('change', checkCacheAndToggleButtonStates);
    
    // Modal kapatma event'leri
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('noteModal');
        if (event.target === modal) {
            closeNoteModal();
        }
    });
    
    // Escape tuşu ile modal kapatma
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeNoteModal();
        }
    });
    
    // Rapor oluşturma butonu
    document.getElementById('generateReportBtn').addEventListener('click', async () => {
        if (allSimilarResults.length === 0) {
            alert("Rapor oluşturmak için önce arama yapın.");
            return;
        }

        try {
            const generateSimilarityReport = httpsCallable(functions, "generateSimilarityReport");
            const response = await generateSimilarityReport({ results: allSimilarResults });

            if (!response.data.success) {
                alert("Rapor oluşturulamadı: " + (response.data.error || ""));
                return;
            }

            const byteCharacters = atob(response.data.file);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: "application/zip" });

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "similarity-reports.zip";
            a.click();
        } catch (error) {
            console.error("Rapor oluşturma hatası:", error);
            alert("Rapor oluşturulamadı!");
        }
    });

    console.log(">>> Başlatma tamamlandı");
});