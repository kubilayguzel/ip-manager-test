// js/trademark-similarity-search.js

// Firebase Firestore servislerini import et
import { db, personService, searchRecordService } from './firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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
        const snapshot = await getDocs(collection(db, 'trademarkBulletins'));
        const bulletins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Timestamp objeleriyle sıralama
        bulletins.sort((a, b) => {
            const dateA = (a.createdAt && typeof a.createdAt.toDate === 'function') ? a.createdAt.toDate() : new Date(0); // Güvenli dönüşüm
            const dateB = (b.createdAt && typeof b.createdAt.toDate === 'function') ? b.createdAt.toDate() : new Date(0); // Güvenli dönüşüm
            return dateB.getTime() - dateA.getTime(); // Tarih objelerini milisaniyeye çevirerek karşılaştır
        });

        bulletinSelect.innerHTML = '<option value="">Bülten seçin...</option>';
        bulletins.forEach(bulletin => {
            let dateText = 'Tarih yok';
            
            // bulletin.createdAt'ın bir Firestore Timestamp objesi olup olmadığını kontrol et
            if (bulletin.createdAt && typeof bulletin.createdAt.toDate === 'function') {
                try {
                    const dateObj = bulletin.createdAt.toDate();
                    // Date objesinin geçerli olup olmadığını kontrol et
                    if (!isNaN(dateObj.getTime())) {
                        dateText = dateObj.toLocaleDateString('tr-TR');
                    } else {
                        console.warn("Geçersiz tarih objesi:", bulletin.createdAt);
                        dateText = 'Geçersiz Tarih';
                    }
                } catch (e) {
                    console.error("Tarih objesinden string'e dönüştürülürken hata:", e);
                    dateText = 'Hata';
                }
            }
            
            // `split` hatası alıyorsanız, buradaki satırı dikkatlice kontrol edin.
            // Bu kısımda `split` çağrısı olmamalı.
            option.textContent = `${bulletin.bulletinNo} - ${dateText}`;
            bulletinSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Bülten seçenekleri yüklenirken hata:', error);
    }
}

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
            return person ? person.name : (owner.name || 'Bilinmeyen Sahip');
        }).filter(Boolean).join(', ');
    } else if (typeof item.holders === 'string') { // Algolia'dan gelen 'holders' string olabilir
        return item.holders;
    }
    return '-';
}

async function checkCacheAndToggleButtonStates() {
    const selectedBulletin = bulletinSelect.value;
    startSearchBtn.disabled = true;
    researchBtn.disabled = true;
    
    if (!selectedBulletin || filteredMonitoringTrademarks.length === 0) {
        return;
    }

    // Önbellek kontrolü artık her bir izlenen marka için yapılmalı
    const checkPromises = filteredMonitoringTrademarks.map(async tm => {
        const recordId = `${tm.id}_${selectedBulletin}`;
        const result = await searchRecordService.getRecord(recordId);
        return result.success && result.data;
    });
    const results = await Promise.all(checkPromises);
    const cachedCount = results.filter(Boolean).length; // true dönenleri say

    if (cachedCount > 0) {
        researchBtn.disabled = false;
    }

    if (cachedCount === filteredMonitoringTrademarks.length && filteredMonitoringTrademarks.length > 0) {
        startSearchBtn.disabled = true;
        infoMessageContainer.innerHTML = `<div class="info-message">Bu bülten için tüm sonuçlar önbellekte mevcut. Sonuçlar otomatik olarak yükleniyor...</div>`;
        await performSearch(true); // Önbellekten yükle
    } else {
        startSearchBtn.disabled = false;
        infoMessageContainer.innerHTML = ''; // Bilgi mesajını temizle
    }
}

async function performResearch() {
    const selectedBulletin = bulletinSelect.value;
    if (!selectedBulletin) return alert('Lütfen bir bülten seçin.');
    if (filteredMonitoringTrademarks.length === 0) return alert('Filtreye uygun izlenen marka bulunamadı.');

    const confirmMsg = `Seçili bülten için filtrelenmiş ${filteredMonitoringTrademarks.length} markanın mevcut arama sonuçları silinecek ve yeniden arama yapılacaktır. Onaylıyor musunuz?`;
    if (!confirm(confirmMsg)) return;

    loadingIndicator.textContent = 'Eski kayıtlar siliniyor...';
    loadingIndicator.style.display = 'block';
    startSearchBtn.disabled = true;
    researchBtn.disabled = true;

    // Firestore'daki önbellek kayıtlarını sil
    const deletePromises = filteredMonitoringTrademarks.map(tm => searchRecordService.deleteRecord(`${tm.id}_${selectedBulletin}`));
    await Promise.all(deletePromises);
    
    await performSearch(false); // Yeni arama yap
}
// js/trademark-similarity-search.js dosyasının düzeltilmiş kısmı
// trademark-similarity-search.js dosyasının performSearch fonksiyonunun düzeltilmiş hali
// trademark-similarity-search.js - Debug için geçici kod eklemeleri

async function performSearch(fromCacheOnly = false) {
    const selectedBulletin = bulletinSelect.value;
    if (!selectedBulletin) return;
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

    // Önbellekten çek
    for (const tm of filteredMonitoringTrademarks) {
        const recordId = `${tm.id}_${selectedBulletin}`;
        const result = await searchRecordService.getRecord(recordId);
        if (result.success && result.data) {
            cachedResults.push(...result.data.results.map(r => ({
                ...r,
                source: 'cache',
                monitoredTrademarkId: tm.id,
                monitoredTrademark: tm.title || tm.markName || 'BELİRSİZ_MARKA'
            })));
        } else {
            trademarksToSearch.push(tm);
        }
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

        console.log('🚀 Cloud Function\'a gönderilen payload:', {
            monitoredMarksCount: monitoredMarksPayload.length,
            selectedBulletin,
            detailPayload: monitoredMarksPayload
        });

        try {
            const resultsFromCF = await runTrademarkSearch(
                monitoredMarksPayload,
                selectedBulletin
            );
            
            // *** DETAYLI DEBUG LOGU ***
            console.log('🔍 Cloud Function\'dan dönen RAW yanıt:', resultsFromCF);
            
            if (resultsFromCF && resultsFromCF.length > 0) {
                console.log('🔍 İlk sonucun detayları:', {
                    keys: Object.keys(resultsFromCF[0]),
                    monitoredMarkId: resultsFromCF[0].monitoredMarkId,
                    monitoredTrademarkId: resultsFromCF[0].monitoredTrademarkId,
                    monitoredTrademark: resultsFromCF[0].monitoredTrademark,
                    fullObject: resultsFromCF[0]
                });
                
                newSearchResults = resultsFromCF.map(hit => ({...hit, source: 'new'}));
                
                // Gruplandırma öncesi debug
                console.log('🔍 Gruplandırma öncesi newSearchResults:', newSearchResults.slice(0, 2));
                
                const groupedResults = newSearchResults.reduce((acc, currentResult) => {
                    // Tüm olası alan adlarını kontrol et
                    const monitoredMarkId = currentResult.monitoredMarkId || 
                        currentResult.monitoredTrademarkId || 
                        currentResult.monitored_mark_id ||
                        currentResult.monitored_trademark_id;
                        
                    console.log('🔍 Gruplandırma detayı:', {
                        resultMarkName: currentResult.markName,
                        monitoredTrademark: currentResult.monitoredTrademark,
                        allPossibleIds: {
                            monitoredMarkId: currentResult.monitoredMarkId,
                            monitoredTrademarkId: currentResult.monitoredTrademarkId,
                            monitored_mark_id: currentResult.monitored_mark_id,
                            monitored_trademark_id: currentResult.monitored_trademark_id
                        },
                        finalMarkId: monitoredMarkId,
                        availableKeys: Object.keys(currentResult)
                    });
                        
                    if (monitoredMarkId) {
                        if (!acc[monitoredMarkId]) {
                            acc[monitoredMarkId] = [];
                        }
                        acc[monitoredMarkId].push(currentResult);
                        console.log(`✅ Sonuç gruplandırıldı: ${monitoredMarkId}`);
                    } else {
                        console.error("❌ monitoredMarkId bulunamadı:", {
                            currentResult,
                            trademarksToSearch: trademarksToSearch.map(tm => ({ id: tm.id, title: tm.title }))
                        });
                        
                        // Manuel eşleştirme deneme
                        const manualMatch = trademarksToSearch.find(tm => 
                            (tm.title || tm.markName) === currentResult.monitoredTrademark
                        );
                        
                        if (manualMatch) {
                            console.log(`🔧 Manuel eşleştirme bulundu: ${manualMatch.id}`);
                            if (!acc[manualMatch.id]) {
                                acc[manualMatch.id] = [];
                            }
                            acc[manualMatch.id].push(currentResult);
                        } else {
                            console.error("❌ Manuel eşleştirme de başarısız");
                        }
                    }
                    return acc;
                }, {});

                console.log('📊 Final gruplandırılmış sonuçlar:', groupedResults);

                // Her marka için önbelleğe kaydet
                for (const tm of trademarksToSearch) {
                    const recordId = `${tm.id}_${selectedBulletin}`;
                    const specificResultsForThisMark = groupedResults[tm.id] || [];
                    
                    console.log(`💾 ${tm.title || tm.markName} için kayıt:`, {
                        trademarkId: tm.id,
                        recordId,
                        resultsCount: specificResultsForThisMark.length,
                        hasResults: specificResultsForThisMark.length > 0
                    });
                    
                    await searchRecordService.saveRecord(recordId, { 
                        results: specificResultsForThisMark.map(r => {
                            const { source, ...rest } = r; 
                            return rest;
                        }), 
                        searchDate: new Date().toISOString() 
                    });
                    console.log(`✅ Kayıt tamamlandı: ${recordId}`);
                }
            } else {
                console.log('ℹ️ Cloud Function\'dan sonuç gelmedi, boş kayıtlar oluşturuluyor');
                for (const tm of trademarksToSearch) {
                    const recordId = `${tm.id}_${selectedBulletin}`;
                    await searchRecordService.saveRecord(recordId, { 
                        results: [], 
                        searchDate: new Date().toISOString() 
                    });
                    console.log(`✅ Boş kayıt oluşturuldu: ${recordId}`);
                }
            }
        } catch (error) {
            console.error("❌ Cloud Function çağrılırken kritik hata oluştu:", error);
            infoMessageContainer.innerHTML = `<div class="info-message" style="background-color: #ffe0e6; color: #721c24;">Hata: Arama sırasında bir sorun oluştu. Detaylar konsola yazıldı.</div>`;
            loadingIndicator.style.display = 'none';
            startSearchBtn.disabled = false;
            return;
        }
    }

    // Tüm sonuçları birleştir ve göster
    allSimilarResults = [...cachedResults, ...newSearchResults];
    
    loadingIndicator.style.display = 'none';
    
    const infoMessage = `Toplam ${allSimilarResults.length} benzer sonuç bulundu (${cachedResults.length} önbellekten, ${newSearchResults.length} yeni arama ile)`;
    infoMessageContainer.innerHTML = `<div class="info-message">${infoMessage}</div>`;

    pagination.update(allSimilarResults.length);
    renderCurrentPageOfResults();

    startSearchBtn.disabled = true;
    researchBtn.disabled = allSimilarResults.length === 0;
    console.log("📊 Tüm benzer sonuçlar (render öncesi):", allSimilarResults);
}

function renderCurrentPageOfResults() {
    resultsTableBody.innerHTML = '';
    if(!pagination) {
        console.error("Pagination objesi başlatılmamış.");
        return;
    }
    
    const currentPageData = pagination.getCurrentPageData(allSimilarResults);
    
    noRecordsMessage.style.display = 'none';
    if (allSimilarResults.length === 0 && !loadingIndicator.style.display || currentPageData.length === 0 && allSimilarResults.length === 0) {
         noRecordsMessage.textContent = 'Arama sonucu bulunamadı.';
         noRecordsMessage.style.display = 'block';
    }

    currentPageData.forEach(hit => {
        // `hit.holders` bir dizi olabilir, `getOwnerNames` fonksiyonu burada da kullanılabilir.
        // Ancak `runTrademarkSearch` içinde `hit.holders` zaten düz bir string olarak Algolia'dan geldiği gibi tutuluyor.
        // Kendi algoritmamızda `hit.holders` artık bir dizi `owner` objesi olacağı için, bunu düzgün formatlamalıyız.
        // `hit.holders` doğrudan bir dizi ise, map ile isme çevirip join yapın, yoksa direkt kullanın.
        const holders = Array.isArray(hit.holders) ? hit.holders.map(h => h.name || h.id).join(', ') : (hit.holders || '');

        const monitoredNice = hit.monitoredNiceClasses || [];
        const niceClassHtml = Array.isArray(hit.niceClasses) 
            ? hit.niceClasses.map(cls => `<span class="nice-class-badge ${monitoredNice.includes(cls) ? 'match' : ''}">${cls}</span>`).join('') 
            : (hit.niceClasses || '');
        const similarityScore = hit.similarityScore ? `${(hit.similarityScore * 100).toFixed(0)}%` : '-';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${hit.applicationNo || '-'}</td>
            <td><strong>${hit.markName || '-'}</strong><br><small>İzlenen: ${hit.monitoredTrademark}</small></td>
            <td>${holders}</td>
            <td>${niceClassHtml}</td>
            <td>${similarityScore}</td>
            <td><button class="btn btn-sm btn-primary" onclick="viewRecord('${hit.objectID}')">👁️ Görüntüle</button></td>
        `;
        resultsTableBody.appendChild(row);
    });
}

window.viewRecord = (recordId) => alert(`Kayıt ID: ${recordId} - Bu özellik geliştirilecek.`);

function resetUI() {
    allSimilarResults = [];
    resultsTableBody.innerHTML = '';
    infoMessageContainer.innerHTML = '';
    noRecordsMessage.style.display = 'none';
    pagination.update(0);
    checkCacheAndToggleButtonStates();
}

// --- Event listener'lar ---
startSearchBtn.addEventListener('click', () => performSearch(false));
researchBtn.addEventListener('click', performResearch);
clearFiltersBtn.addEventListener('click', () => {
    ownerSearchInput.value = '';
    niceClassSearchInput.value = '';
    bulletinSelect.selectedIndex = 0;
    resetUI();
    applyMonitoringListFilters();
});
ownerSearchInput.addEventListener('input', debounce(applyMonitoringListFilters, 400));
niceClassSearchInput.addEventListener('input', debounce(applyMonitoringListFilters, 400));
bulletinSelect.addEventListener('change', resetUI);

// --- Başlatma ---
console.log(">>> initializePagination çağrılıyor");
initializePagination();

console.log(">>> loadInitialData çağrılıyor");
loadInitialData(); // Artık await değil, çünkü asenkron yükleme kendi içinde handle ediliyor.