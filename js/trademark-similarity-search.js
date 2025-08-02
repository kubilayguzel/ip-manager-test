// js/trademark-similarity-search.js

// Firebase Firestore servislerini import et
import { db, personService, searchRecordService } from './firebase-config.js';
import { collection, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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
        const bulletinSelect = document.getElementById('bulletinSelect');
        bulletinSelect.innerHTML = '<option value="">Bülten seçin...</option>';

        // 1) Mevcut bültenleri al
        const snapshot = await getDocs(collection(db, 'trademarkBulletins'));
        const bulletins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        bulletins.sort((a, b) => {
            const dateA = (a.createdAt && typeof a.createdAt.toDate === 'function') ? a.createdAt.toDate() : new Date(0);
            const dateB = (b.createdAt && typeof b.createdAt.toDate === 'function') ? b.createdAt.toDate() : new Date(0);
            return dateB - dateA;
        });

        // 2) `monitoringTrademarkRecords` koleksiyonundan distinct bültenleri çek
        const monitoringSnap = await getDocs(collection(db, 'monitoringTrademarkRecords'));
        const extraBulletins = {};
        monitoringSnap.forEach(doc => {
            const data = doc.data();
            if (data.bulletinId && data.bulletinNo) {
                extraBulletins[data.bulletinId] = data.bulletinNo;
            }
        });

        // 3) Bültenleri ekle (mevcut olanlar)
        bulletins.forEach(bulletin => {
            let dateText = 'Tarih yok';
            if (bulletin.createdAt && typeof bulletin.createdAt.toDate === 'function') {
                const dateObj = bulletin.createdAt.toDate();
                if (!isNaN(dateObj.getTime())) dateText = dateObj.toLocaleDateString('tr-TR');
            }
            const option = document.createElement('option');
            option.value = bulletin.id;
            option.textContent = `${bulletin.bulletinNo} - ${dateText}`;
            bulletinSelect.appendChild(option);
        });

        // 4) Silinmiş bültenleri ekle
        Object.entries(extraBulletins).forEach(([bulletinId, bulletinNo]) => {
            const alreadyExists = bulletins.some(b => b.id === bulletinId);
            if (!alreadyExists) {
                const option = document.createElement('option');
                option.value = bulletinId;
                option.textContent = `${bulletinNo} (Silinmiş)`;
                bulletinSelect.appendChild(option);
            }
        });

    } catch (error) {
        console.error('Bülten seçenekleri yüklenirken hata:', error);
    }
}

document.getElementById('bulletinSelect').addEventListener('change', async (e) => {
    const selectedBulletinId = e.target.value;
    if (!selectedBulletinId) return;

    try {
        // Önce trademarkBulletins koleksiyonunda var mı kontrol et
        const docRef = doc(db, 'trademarkBulletins', selectedBulletinId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            // Eğer bülten yoksa kullanıcıya bilgi ver
            alert(
                "Bu bülten sistemde kayıtlı değil, ancak izleme kayıtlarınız mevcut.\n" +
                "Bu bülten üzerinde arama yapabilmek için bülteni sisteme yüklemelisiniz."
            );
            // Kullanıcıya yükleme yönlendirmesi yapılabilir
            // window.location.href = '/bulletin-upload.html'; // örnek yönlendirme
        }
    } catch (error) {
        console.error("Bülten kontrolü yapılırken hata:", error);
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

function checkCacheAndToggleButtonStates() {
    const selectedBulletin = bulletinSelect.value;
    if (!selectedBulletin || filteredMonitoringTrademarks.length === 0) {
        startSearchBtn.disabled = true;
        researchBtn.disabled = true;
        return;
    }

    let hasCache = false;
    let hasData = false;

    Promise.all(filteredMonitoringTrademarks.map(async tm => {
        const recordId = `${tm.id}_${selectedBulletin}`;
        const result = await searchRecordService.getRecord(recordId);
        if (result.success && result.data) {
            hasCache = true;
            if (result.data.results && result.data.results.length > 0) hasData = true;
        }
    })).then(() => {
        startSearchBtn.disabled = hasCache;
        researchBtn.disabled = !hasCache;
        
        if (hasCache) loadDataFromCache();
    });
}

async function loadDataFromCache() {
    const selectedBulletin = bulletinSelect.value;
    if (!selectedBulletin) return;

    let cachedResults = [];
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
        }
    }

    allSimilarResults = cachedResults;
    
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
    const selectedBulletin = bulletinSelect.value;
    if (!selectedBulletin) return alert('Lütfen önce bir bülten seçin.');
    if (filteredMonitoringTrademarks.length === 0) return alert('Filtreye uygun izlenen marka bulunamadı.');

    const confirmMsg = `Seçili bülten için filtrelenmiş ${filteredMonitoringTrademarks.length} markanın mevcut arama sonuçları silinecek ve yeniden arama yapılacaktır. Onaylıyor musunuz?`;
    if (!confirm(confirmMsg)) return;

    loadingIndicator.textContent = 'Eski kayıtlar siliniyor...';
    loadingIndicator.style.display = 'block';
    startSearchBtn.disabled = true;
    researchBtn.disabled = true;

    const deletePromises = filteredMonitoringTrademarks.map(tm => searchRecordService.deleteRecord(`${tm.id}_${selectedBulletin}`));
    await Promise.all(deletePromises);
    
    await performSearch(false);
}
async function performSearch(fromCacheOnly = false) {
        // 🔍 TEST: Fonksiyon çağrıldığında mutlaka görünecek log
    console.log('🚨 PERFORMSEARCH ÇAĞRILDI! fromCacheOnly:', fromCacheOnly);
    console.log('🚨 selectedBulletin:', bulletinSelect.value);
    console.log('🚨 filteredMonitoringTrademarks.length:', filteredMonitoringTrademarks.length);
  
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

        // --- EK: Cloud Function'a giden veriyi kontrol etmek için log ekledik ---
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

        // ✅ BÜLTEN NO'YU ÇEK (Cloud Function çağrısından önce)
        let bulletinNo = null;
        console.log('🔍 DEBUG: selectedBulletin ID:', selectedBulletin);
        
        try {
            const bulletinDocRef = doc(db, 'trademarkBulletins', selectedBulletin);
            const bulletinDocSnap = await getDoc(bulletinDocRef);
            
            console.log('🔍 DEBUG: bulletinDocSnap.exists():', bulletinDocSnap.exists());
            
            if (bulletinDocSnap.exists()) {
                const bulletinData = bulletinDocSnap.data();
                console.log('🔍 DEBUG: bulletinData:', bulletinData);
                bulletinNo = bulletinData.bulletinNo;
                console.log('🔍 DEBUG: bulletinNo:', bulletinNo);
            } else {
                console.warn('⚠️ Bülten dokümanı bulunamadı:', selectedBulletin);
            }
        } catch (error) {
            console.error('❌ bulletinNo alınırken hata:', error);
        }
        
        console.log('🔍 DEBUG: Final bulletinNo value:', bulletinNo);

        try {
            const resultsFromCF = await runTrademarkSearch(
                monitoredMarksPayload,
                selectedBulletin
            );
            
            if (resultsFromCF && resultsFromCF.length > 0) {
                // *** BASİT ÇÖZÜM: Her sonuca marka ID'sini ekle ***
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

                // Her marka için önbelleğe kaydet
                for (const tm of trademarksToSearch) {
                    const recordId = `${tm.id}_${selectedBulletin}`;
                    const specificResults = groupedResults[tm.id] || [];
                    
                    const saveData = { 
                        results: specificResults.map(r => {
                            const { source, ...rest } = r; 
                            return rest;
                        }), 
                        searchDate: new Date().toISOString() 
                    };
                    
                    console.log('🔍 DEBUG: saveRecord çağrılıyor:', {
                        recordId,
                        saveData,
                        bulletinNo,
                        bulletinNoType: typeof bulletinNo
                    });
                    
                    await searchRecordService.saveRecord(recordId, saveData, selectedBulletin);
                    console.log(`✅ Kayıt: ${recordId} (${specificResults.length} sonuç)`);
                }
            } else {
                // Hiç sonuç yoksa boş kayıt
                for (const tm of trademarksToSearch) {
                    const recordId = `${tm.id}_${selectedBulletin}`;
                    const saveData = { 
                        results: [], 
                        searchDate: new Date().toISOString() 
                    };
                    
                    console.log('🔍 DEBUG: Boş kayıt saveRecord çağrılıyor:', {
                        recordId,
                        bulletinNo,
                        bulletinNoType: typeof bulletinNo
                    });
                    
                    await searchRecordService.saveRecord(recordId, saveData, bulletinNo);
                    console.log(`✅ Boş kayıt: ${recordId}`);
                }
            }
        } catch (error) {
            console.error("❌ Hata:", error);
            loadingIndicator.style.display = 'none';
            startSearchBtn.disabled = false;
            return;
        }
    }
}
    // Sonuçları birleştir
    allSimilarResults = [...cachedResults, ...newSearchResults];
    
    // ✅ TAM GRUPLANDIRMA: Marka ID'sine göre grupla, sonra birleştir
    const groupedByTrademark = {};
    
    // Önce gruplara ayır
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
    
    loadingIndicator.style.display = 'none';

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