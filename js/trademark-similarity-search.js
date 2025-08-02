// js/trademark-similarity-search.js

// Firebase Firestore servislerini import et
import { db, personService, searchRecordService } from './firebase-config.js';
import { collection, getDocs, doc, getDoc, query, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Kendi arama modülümüzü import et (Bu artık Cloud Function'ı çağıracak)
import { runTrademarkSearch } from './js/trademark-similarity/run-search.js';
import Pagination from './js/pagination.js';
import { loadSharedLayout } from './js/layout-loader.js';

console.log("### trademark-similarity-search.html script yüklendi ###");

let allSimilarResults = [];
let monitoringTrademarks = [];
let filteredMonitoringTrademarks = [];
let allPersons = [];
let pagination;

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

async function loadInitialData() {
    console.log(">>> loadInitialData başladı");
    await loadSharedLayout({ activeMenuLink: 'trademark-similarity-search.html' });
    const personsResult = await personService.getPersons();
    if (personsResult.success) allPersons = personsResult.data;
    await loadBulletinOptions();

    const snapshot = await getDocs(collection(db, 'monitoringTrademarks'));
    monitoringTrademarks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    applyMonitoringListFilters();
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
                    bulletinDate: parsed.bulletinDate,
                    hasOriginalBulletin: false
                };
            }) : [];

        // 3) Tüm bültenleri birleştir - AYNI BÜLTEN NUMARASINI TEK KEZ GÖSTER
        const allBulletins = new Map();

        // Önce mevcut bültenleri ekle
        existingBulletins.forEach(bulletin => {
            // bulletinDate kullan, yoksa createdAt'den oluştur
            const dateForKey = bulletin.bulletinDate || 
                (bulletin.createdAt ? bulletin.createdAt.toDate().toISOString().slice(0,10).replace(/-/g, '') : '');
            
            const bulletinKey = createBulletinKey(bulletin.bulletinNo, dateForKey);
            
            allBulletins.set(bulletin.bulletinNo, {
                id: bulletin.id,
                bulletinNo: bulletin.bulletinNo,
                bulletinKey: bulletinKey,
                bulletinDate: bulletin.bulletinDate,
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
            option.dataset.actualId = bulletin.id; // Gerçek ID'yi de sakla
            
            if (bulletin.hasOriginalBulletin) {
                // bulletinDate kullan, yoksa createdAt kullan
                let dateText = 'Tarih yok';
                if (bulletin.bulletinDate) {
                    // bulletinDate formatı: YYYYMMDD -> DD.MM.YYYY
                    const dateStr = bulletin.bulletinDate;
                    if (dateStr.length === 8) {
                        const year = dateStr.substring(0, 4);
                        const month = dateStr.substring(4, 6);
                        const day = dateStr.substring(6, 8);
                        dateText = `${day}.${month}.${year}`;
                    }
                } else if (bulletin.createdAt && typeof bulletin.createdAt.toDate === 'function') {
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

document.getElementById('bulletinSelect').addEventListener('change', async (e) => {
    const selectedBulletinKey = e.target.value;
    if (!selectedBulletinKey) return;

    const selectedOption = e.target.querySelector(`option[value="${selectedBulletinKey}"]`);
    const hasOriginalBulletin = selectedOption?.dataset.hasOriginalBulletin === 'true';

    if (!hasOriginalBulletin) {
        const bulletinNo = selectedOption?.dataset.bulletinNo;
        alert(
            `"${bulletinNo}" bülteni sistemde kayıtlı değil, ancak izleme kayıtlarınız mevcut.\n` +
            "Bu bülten üzerinde arama yapabilmek için bülteni sisteme yüklemelisiniz."
        );
    }
});

function applyMonitoringListFilters() {
    const ownerFilter = ownerSearchInput.value.toLowerCase().trim();
    const niceFilter = niceClassSearchInput.value.trim();
    
    filteredMonitoringTrademarks = monitoringTrademarks.filter(data => {
        const ownerName = (data.owners?.[0]?.name || '').toLowerCase();
        const niceClasses = Array.isArray(data.niceClass) ? data.niceClass.join(' ') : (data.niceClass || '');
        return (!ownerFilter || ownerName.includes(ownerFilter)) && (!niceFilter || niceClasses.includes(niceFilter));
    });
    
    renderMonitoringList();
    checkCacheAndToggleButtonStates();
}

function renderMonitoringList() {
    const tbody = document.getElementById('monitoringListBody');
    tbody.innerHTML = filteredMonitoringTrademarks.length === 0 
        ? '<tr><td colspan="5" class="no-records">Filtreye uygun izlenecek marka bulunamadı.</td></tr>'
        : filteredMonitoringTrademarks.map(tm => `
            <tr>
                <td>${tm.title || tm.markName || '-'}</td>
                <td>${tm.applicationNumber || '-'}</td>
                <td>${getOwnerNames(tm)}</td> <td>${Array.isArray(tm.niceClass) ? tm.niceClass.join(', ') : (tm.niceClass || '-')}</td>
                <td>${tm.applicationDate || '-'}</td>
            </tr>`).join('');
}

// Yardımcı fonksiyon: Sahip isimlerini string olarak döndürür
function getOwnerNames(item) {
    if (item.owners && Array.isArray(item.owners)) {
        return item.owners.map(owner => {
            const person = allPersons.find(p => p.id === owner.id);
            return person ? person.name : owner.name || 'Bilinmeyen Sahip';
        }).join(', ');
    }
    return 'Sahip bilgisi yok';
}

function updateMonitoringCount() {
    const countElement = document.getElementById('monitoringCount');
    if (countElement) {
        countElement.textContent = `Toplam ${monitoringTrademarks.length}, Filtrelenmiş ${filteredMonitoringTrademarks.length}`;
    }
}

async function checkCacheAndToggleButtonStates() {
    const selectedBulletinKey = bulletinSelect.value;
    if (!selectedBulletinKey || filteredMonitoringTrademarks.length === 0) {
        startSearchBtn.disabled = true;
        researchBtn.disabled = true;
        return;
    }

    const selectedOption = bulletinSelect.querySelector(`option[value="${selectedBulletinKey}"]`);
    const hasOriginalBulletin = selectedOption?.dataset.hasOriginalBulletin === 'true';
    const selectedBulletinNo = selectedOption?.dataset.bulletinNo || '';

    if (!hasOriginalBulletin) {
        startSearchBtn.disabled = true;
        researchBtn.disabled = true;

        infoMessageContainer.innerHTML = `
            <div class="info-message" style="background-color: #fff3cd; color: #856404; border: 1px solid #ffeaa7;">
                ⚠️ <strong>${selectedBulletinNo}</strong> bülteni sistemde kayıtlı değil. Yalnızca mevcut izleme kayıtlarınızı görüntüleyebilirsiniz.
            </div>
        `;

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
        
        await loadDataFromCache();
    } else {
        startSearchBtn.disabled = false;
        infoMessageContainer.innerHTML = '';
    }
}

async function loadCachedResultsOnly() {
    const selectedBulletinKey = bulletinSelect.value;
    if (!selectedBulletinKey || filteredMonitoringTrademarks.length === 0) {
        return;
    }

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
        groupAndSortResults();
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

async function loadDataFromCache() {
    const selectedBulletinKey = bulletinSelect.value;
    if (!selectedBulletinKey) return;

    let cachedResults = [];
    
    // Yeni format ile cache'den veri çek
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
    }

    allSimilarResults = cachedResults;
    groupAndSortResults();
    
    if (allSimilarResults.length > 0) {
        infoMessageContainer.innerHTML = `<div class="info-message">Önbellekten ${allSimilarResults.length} benzer sonuç yüklendi.</div>`;
        pagination.update(allSimilarResults.length);
        renderCurrentPageOfResults();
        noRecordsMessage.style.display = 'none';
    } else {
        noRecordsMessage.style.display = 'block';
        resultsTableBody.innerHTML = '';
        infoMessageContainer.innerHTML = '';
        if(pagination) pagination.update(0);
    }
}

// Event listener'ları ekle
document.addEventListener('DOMContentLoaded', async () => {
    initializePagination();
    await loadInitialData();
    
    startSearchBtn.addEventListener('click', () => performSearch(false));
    researchBtn.addEventListener('click', handleResearch);
    clearFiltersBtn.addEventListener('click', () => {
        ownerSearchInput.value = '';
        niceClassSearchInput.value = '';
        applyMonitoringListFilters();
        updateMonitoringCount();
    });
    
    const debouncedFilter = debounce(() => {
        applyMonitoringListFilters();
        updateMonitoringCount();
    }, 300);
    
    ownerSearchInput.addEventListener('input', debouncedFilter);
    niceClassSearchInput.addEventListener('input', debouncedFilter);
    bulletinSelect.addEventListener('change', checkCacheAndToggleButtonStates);
});

async function handleResearch() {
    const selectedBulletinKey = bulletinSelect.value;
    if (!selectedBulletinKey) return alert('Lütfen önce bir bülten seçin.');
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
    // 🔍 TEST: Fonksiyon çağrıldığında mutlaka görünecek log
    console.log('🚨 PERFORMSEARCH ÇAĞRILDI! fromCacheOnly:', fromCacheOnly);
    console.log('🚨 selectedBulletinKey:', bulletinSelect.value);
    console.log('🚨 filteredMonitoringTrademarks.length:', filteredMonitoringTrademarks.length);
  
    const selectedBulletinKey = bulletinSelect.value;
    if (!selectedBulletinKey) return;
    if (filteredMonitoringTrademarks.length === 0) return;

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

    // Önbellekten veri çek - YENİ FORMAT
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
    if (!fromCacheOnly && trademarksToSearch.length > 0) {
        if (!runTrademarkSearch) {
            alert("Arama modülü henüz yüklenmedi, lütfen bekleyin.");
            loadingIndicator.style.display = 'none';
            checkCacheAndToggleButtonStates();
            return;
        }
        loadingIndicator.textContent = `${trademarksToSearch.length} marka için arama yapılıyor... (Bu biraz zaman alabilir)`;

        // Cloud Function'a giden veriyi kontrol etmek için log ekledik
        const monitoredMarksPayload = trademarksToSearch.map(tm => {
            const markName = (tm.title || tm.markName || '').trim();
            if (!markName) {
                console.warn(`⚠️ Bu markanın adı eksik (ID: ${tm.id})`, tm);
            }
            return {
                id: tm.id,
                markName: markName || 'BELİRSİZ_MARKA',
                applicationDate: tm.applicationDate || '',
                niceClasses: Array.isArray(tm.niceClass)
                    ? tm.niceClass
                    : (tm.niceClass ? [tm.niceClass] : [])
            };
        });
        console.log("Cloud Function'a gönderilen markalar:", monitoredMarksPayload);

        // DÜZELTME: bulletinKey'den gerçek bulletinId'yi al
        let actualBulletinId = null;
        
        try {
            const selectedOption = bulletinSelect.querySelector(`option[value="${selectedBulletinKey}"]`);
            const hasOriginalBulletin = selectedOption?.dataset.hasOriginalBulletin === 'true';
            
            if (hasOriginalBulletin) {
                // Option'dan gerçek ID'yi al
                actualBulletinId = selectedOption?.dataset.actualId;
                console.log('✅ Actual bulletinId bulundu:', actualBulletinId);
            } else {
                throw new Error('Yeni arama sadece sistemde kayıtlı bültenler için yapılabilir');
            }
            
        } catch (error) {
            console.error('❌ bulletinId alınırken hata:', error);
            alert('Arama hatası: ' + error.message);
            loadingIndicator.style.display = 'none';
            startSearchBtn.disabled = false;
            researchBtn.disabled = false;
            return;
        }

        try {
            const resultsFromCF = await runTrademarkSearch(
                monitoredMarksPayload,
                actualBulletinId
            );
            
            if (resultsFromCF && resultsFromCF.length > 0) {
                // Her sonuca marka ID'sini ekle
                newSearchResults = resultsFromCF.map(hit => {
                    // Marka adına göre ID bul
                    const matchingTrademark = trademarksToSearch.find(tm => 
                        (tm.title || tm.markName) === hit.monitoredTrademark
                    );
                    
                    return {
                        ...hit, 
                        source: 'new',
                        monitoredTrademarkId: matchingTrademark ? matchingTrademark.id : 'UNKNOWN',
                        monitoredTrademark: hit.monitoredTrademark || 'BELİRSİZ_MARKA'
                    };
                });

                // Gruplandırma - marka ID'sine göre
                const groupedResults = {};
                
                // Her aramada bulunan marka için grupla
                for (const tm of trademarksToSearch) {
                    const thisMarkResults = newSearchResults.filter(result => 
                        result.monitoredTrademarkId === tm.id
                    );
                    groupedResults[tm.id] = thisMarkResults;
                    
                    console.log(`📊 ${tm.title || tm.markName}: ${thisMarkResults.length} sonuç`);
                }

                // Her marka için YENİ FORMATTA önbelleğe kaydet
                for (const tm of trademarksToSearch) {
                    const specificResults = groupedResults[tm.id] || [];
                    
                    const saveData = { 
                        results: specificResults.map(r => {
                            const { source, ...rest } = r; 
                            return rest;
                        }), 
                        searchDate: new Date().toISOString(),
                        bulletinNo: parseBulletinKey(selectedBulletinKey).bulletinNo
                    };
                    
                    await searchRecordService.saveRecord(tm.id, saveData, selectedBulletinKey);
                    console.log(`✅ Kayıt: ${selectedBulletinKey}/${tm.id} (${specificResults.length} sonuç)`);
                }
            } else {
                // Hiç sonuç yoksa boş kayıt
                for (const tm of trademarksToSearch) {
                    const saveData = { 
                        results: [], 
                        searchDate: new Date().toISOString(),
                        bulletinNo: parseBulletinKey(selectedBulletinKey).bulletinNo
                    };
                    
                    await searchRecordService.saveRecord(tm.id, saveData, selectedBulletinKey);
                    console.log(`✅ Boş kayıt: ${selectedBulletinKey}/${tm.id}`);
                }
            }
        } catch (error) {
            console.error("❌ Hata:", error);
            loadingIndicator.style.display = 'none';
            startSearchBtn.disabled = false;
            return;
        }
    }

    // Sonuçları birleştir
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
            return scoreB - scoreA; // Yüksekten düşüğe
        });
    });
    
    // Grupları tekrar birleştir (marka adına göre alfabetik sıralayarak)
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
    
    console.log("📊 Gruplandırılmış sonuçlar:");
    sortedTrademarkIds.forEach(trademarkId => {
        const group = groupedByTrademark[trademarkId];
        console.log(`- ${group[0].monitoredTrademark}: ${group.length} sonuç`);
        group.forEach((r, i) => console.log(`  ${i+1}. ${r.markName} (${(r.similarityScore * 100).toFixed(0)}%)`));
    });
}

function renderCurrentPageOfResults() {
    resultsTableBody.innerHTML = '';
    if(!pagination) {
        console.error("Pagination objesi başlatılmamış!");
        return;
    }

    const { startIndex, endIndex } = pagination.getCurrentPageInfo();
    const currentPageResults = allSimilarResults.slice(startIndex, endIndex);

    if (currentPageResults.length === 0) {
        noRecordsMessage.style.display = 'block';
        return;
    }

    noRecordsMessage.style.display = 'none';
    currentPageResults.forEach(result => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${result.monitoredTrademark || '-'}</td>
            <td>${result.applicationNo || '-'}</td>
            <td>${result.markName || '-'}</td>
            <td>${result.applicationDate || '-'}</td>
            <td>${Array.isArray(result.niceClasses) ? result.niceClasses.join(', ') : (result.niceClasses || '-')}</td>
            <td>${result.similarityScore ? result.similarityScore.toFixed(2) : '-'}</td>
            <td>
                <button class="btn-similar ${result.isSimilar === true ? 'active' : ''}" 
                        onclick="toggleSimilarity('${result.objectID}', true)">Benzer</button>
                <button class="btn-not-similar ${result.isSimilar === false ? 'active' : ''}" 
                        onclick="toggleSimilarity('${result.objectID}', false)">Benzer Değil</button>
            </td>
            <td>
                <button class="btn-note" onclick="openNoteModal('${result.objectID}')">Not</button>
            </td>
        `;
        resultsTableBody.appendChild(row);
    });
}

// Benzerlik durumunu değiştirme
window.toggleSimilarity = async (resultId, isSimilar) => {
    const resultIndex = allSimilarResults.findIndex(r => r.objectID === resultId);
    if (resultIndex === -1) return;

    const result = allSimilarResults[resultIndex];
    result.isSimilar = isSimilar;

    console.log(`${isSimilar ? '✅' : '❌'} ${result.markName} - Benzerlik: ${isSimilar}`);
    renderCurrentPageOfResults();
}

// Not modalını açma
window.openNoteModal = (resultId) => {
    const result = allSimilarResults.find(r => r.objectID === resultId);
    if (!result) return;

    const noteModal = document.getElementById('noteModal');
    const noteText = document.getElementById('noteText');
    const saveNoteBtn = document.getElementById('saveNoteBtn');

    noteText.value = result.note || '';
    noteModal.classList.add('show');

    // Önceki event listener'ları temizle
    const newSaveBtn = saveNoteBtn.cloneNode(true);
    saveNoteBtn.parentNode.replaceChild(newSaveBtn, saveNoteBtn);

    // Yeni event listener ekle
    document.getElementById('saveNoteBtn').addEventListener('click', async () => {
        const newNoteValue = noteText.value.trim();
        
        const resultIndex = allSimilarResults.findIndex(r => r.objectID === resultId);
        if (resultIndex !== -1) {
            allSimilarResults[resultIndex].note = newNoteValue;
            
            // CSS sınıfını güncelle
            const noteBtn = document.querySelector(`button[onclick="openNoteModal('${resultId}')"]`);
            if (noteBtn) {
                noteBtn.className = newNoteValue ? 'btn-note note-text' : 'btn-note note-placeholder';
            }
            console.log(`✅ Not güncellendi: ${resultId} -> ${newNoteValue}`);
            noteModal.classList.remove('show');
        } else {
            console.error('❌ Not güncellenemedi: Sonuç bulunamadı');
            alert('Not güncellenirken hata oluştu.');
        }
    });
}

// Modal kapatma
document.addEventListener('DOMContentLoaded', () => {
    const noteModal = document.getElementById('noteModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            noteModal.classList.remove('show');
        });
    }
    
    // Modal dışına tıklayınca kapat
    noteModal?.addEventListener('click', (e) => {
        if (e.target === noteModal) {
            noteModal.classList.remove('show');
        }
    });
});

// Arama sonuçları başlığını güncelleme
function updateSearchResultsHeader() {
    const resultsHeader = document.querySelector('.results-header h3');
    if (resultsHeader) {
        // Sadece basit başlık, marka isimlerini gösterme
        resultsHeader.innerHTML = `Arama Sonuçları`;
    }
}

function resetUI() {
    allSimilarResults = [];
    resultsTableBody.innerHTML = '';
    infoMessageContainer.innerHTML = '';
    noRecordsMessage.style.display = 'none';
    if(pagination) pagination.update(0);
    checkCacheAndToggleButtonStates();
}

function getAllSearchResults() {
    return allSimilarResults
        .filter(r => r.isSimilar === true) // sadece Benzer olarak işaretlenenler
        .map(r => {
            // İzlenen markayı bul
            const monitoredTrademark = filteredMonitoringTrademarks.find(mt => mt.id === r.monitoredTrademarkId);
            
            return {
                monitoredMark: {
                    applicationNo: monitoredTrademark?.applicationNumber || r.monitoredTrademark || '-',
                    date: monitoredTrademark?.applicationDate || '-',
                    niceClass: Array.isArray(monitoredTrademark?.niceClass) 
                        ? monitoredTrademark.niceClass.join(', ') 
                        : (monitoredTrademark?.niceClass || '-'),
                    ownerName: getOwnerNames(monitoredTrademark) || 'Bilinmeyen Sahip',
                    imagePath: monitoredTrademark?.imagePath || null
                },
                similarMark: {
                    applicationNo: r.applicationNo || '-',
                    date: r.applicationDate || '-',
                    niceClass: Array.isArray(r.niceClasses) 
                        ? r.niceClasses.join(', ') 
                        : (r.niceClasses || '-'),
                    name: r.markName || '-',
                    imagePath: r.imagePath || null,
                    similarity: r.similarityScore ? r.similarityScore.toFixed(2) : '-',
                    note: r.note || ''
                }
            };
        });
}