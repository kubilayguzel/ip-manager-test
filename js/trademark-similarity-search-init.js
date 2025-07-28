console.log("### trademark-similarity-search-init.js başladı ###");

import Pagination from './pagination.js'; 
import { loadSharedLayout } from './layout-loader.js';
import { db, personService, searchRecordService } from '../firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let runTrademarkSearch;
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
    const snapshot = await getDocs(collection(db, 'trademarkBulletins'));
    const bulletins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    bulletins.sort((a, b) => new Date(b.bulletinDate) - new Date(a.bulletinDate));
    bulletinSelect.innerHTML = '<option value="">Bülten seçin...</option>' +
        bulletins.map(b => `<option value="${b.id}">${b.bulletinNo} - ${b.bulletinDate}</option>`).join('');
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
                <td>${tm.owners?.[0]?.name || '-'}</td>
                <td>${Array.isArray(tm.niceClass) ? tm.niceClass.join(', ') : (tm.niceClass || '-')}</td>
                <td>${tm.applicationDate || '-'}</td>
            </tr>`).join('');
}

async function checkCacheAndToggleButtonStates() {
    const selectedBulletin = bulletinSelect.value;
    startSearchBtn.disabled = true;
    researchBtn.disabled = true;
    
    if (!selectedBulletin || filteredMonitoringTrademarks.length === 0) {
        return;
    }

    const checkPromises = filteredMonitoringTrademarks.map(tm => searchRecordService.getRecord(`${tm.id}_${selectedBulletin}`));
    const results = await Promise.all(checkPromises);
    const cachedCount = results.filter(r => r.success && r.data).length;
    
    if (cachedCount > 0) researchBtn.disabled = false;

    if (cachedCount === filteredMonitoringTrademarks.length) {
        startSearchBtn.disabled = true;
        infoMessageContainer.innerHTML = `<div class="info-message">Bu bülten için tüm sonuçlar önbellekte mevcut. Sonuçlar otomatik olarak yükleniyor...</div>`;
        await performSearch(true);
    } else {
        startSearchBtn.disabled = false;
    }
}

async function performResearch() {
    const selectedBulletin = bulletinSelect.value;
    if (!selectedBulletin) return alert('Lütfen bir bülten seçin.');
    if (filteredMonitoringTrademarks.length === 0) return alert('Filtreye uygun izlenen marka bulunamadı.');

    const confirmMsg = `Seçili bülten için filtrelenmiş ${filteredMonitoringTrademarks.length} markanın mevcut arama sonuçları silinecek ve Algolia'da yeniden arama yapılacaktır. Onaylıyor musunuz?`;
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

    for (const tm of filteredMonitoringTrademarks) {
        const recordId = `${tm.id}_${selectedBulletin}`;
        const result = await searchRecordService.getRecord(recordId);
        if (result.success && result.data) {
            cachedResults.push(...result.data.results.map(r => ({...r, source: 'cache', monitoredTrademark: tm.title})));
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
        loadingIndicator.textContent = `Algolia'da ${trademarksToSearch.length} marka için arama yapılıyor...`;
        const searchPromises = trademarksToSearch.map(async (trademark) => {
            const monitoredMark = {
                markName: trademark.title,
                applicationDate: trademark.applicationDate,
                niceClasses: trademark.niceClass
            };
            const results = await runTrademarkSearch(monitoredMark, selectedBulletin);
            console.log(`✅ Algolia ${trademark.title} için ${results.length} sonuç döndürdü:`, results);
            const recordId = `${trademark.id}_${selectedBulletin}`;
            await searchRecordService.saveRecord(recordId, { results: results, searchDate: new Date().toISOString() });
            return results.map(hit => ({...hit, source: 'new', monitoredTrademark: trademark.title}));
        });
        const resultsArrays = await Promise.all(searchPromises);
        newSearchResults = resultsArrays.flat();
    }
    
    allSimilarResults = [...cachedResults, ...newSearchResults];
    loadingIndicator.style.display = 'none';
    
    const infoMessage = `Toplam ${allSimilarResults.length} benzer sonuç bulundu. (${cachedResults.length} önbellekten, ${newSearchResults.length} yeni arama ile)`;
    infoMessageContainer.innerHTML = `<div class="info-message">${infoMessage}</div>`;
    
    pagination.update(allSimilarResults.length);
    renderCurrentPageOfResults(1, pagination.getItemsPerPage());
            
    startSearchBtn.disabled = true;
    researchBtn.disabled = allSimilarResults.length === 0;
    console.log("📊 Tüm benzer sonuçlar (render öncesi):", allSimilarResults);
}

function renderCurrentPageOfResults() {
    resultsTableBody.innerHTML = '';
    if(!pagination) return;
    
    const currentPageData = pagination.getCurrentPageData(allSimilarResults);
    
    noRecordsMessage.style.display = 'none';
    if (allSimilarResults.length === 0) {
         noRecordsMessage.textContent = 'Arama sonucu bulunamadı.';
         noRecordsMessage.style.display = 'block';
    }

    currentPageData.forEach(hit => {
        const holders = Array.isArray(hit.holders) ? hit.holders.join(', ') : (hit.holders || '');
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
initializePagination();
await loadInitialData();

const algoliaReady = await window.algoliaLoadPromise;
if (algoliaReady) {
    try {
        console.log(">>> run-search import başlatılıyor");
        const module = await import('./trademark-similarity/run-search.js');
        console.log(">>> run-search import tamamlandı", module);

        runTrademarkSearch = module.runTrademarkSearch;
        if (typeof runTrademarkSearch !== "function") {
            console.error("runTrademarkSearch fonksiyonu bulunamadı!");
        } else {
            console.log(">>> runTrademarkSearch başarıyla atandı");
        }
    } catch (e) {
        console.error("Arama modülü yüklenemedi:", e);
    }
} else {
    console.error("Algolia kütüphanesi yüklenmedi!");
}
