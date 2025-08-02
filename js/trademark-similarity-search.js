// js/trademark-similarity-search.js

// === IMPORTS ===
import { db, personService, searchRecordService, similarityService } from './firebase-config.js';
import { collection, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { runTrademarkSearch } from './js/trademark-similarity/run-search.js';
import Pagination from './js/pagination.js';
import { loadSharedLayout } from './js/layout-loader.js';

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

        const snapshot = await getDocs(collection(db, 'trademarkBulletins'));
        const bulletins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        bulletins.sort((a, b) => {
            const dateA = (a.createdAt && typeof a.createdAt.toDate === 'function') ? a.createdAt.toDate() : new Date(0);
            const dateB = (b.createdAt && typeof b.createdAt.toDate === 'function') ? b.createdAt.toDate() : new Date(0);
            return dateB - dateA;
        });

        // Ekstra bültenleri de kontrol et
        const monitoringSnap = await getDocs(collection(db, 'monitoringTrademarkRecords'));
        const extraBulletins = {};
        monitoringSnap.forEach(doc => {
            const data = doc.data();
            if (data.bulletinId && data.bulletinNo) {
                extraBulletins[data.bulletinId] = data.bulletinNo;
            }
        });

        // Mevcut bültenleri ekle
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

        // Silinmiş bültenleri ekle
        Object.entries(extraBulletins).forEach(([bulletinId, bulletinNo]) => {
            const alreadyExists = bulletins.some(b => b.id === bulletinId);
            if (!alreadyExists) {
                const option = document.createElement('option');
                option.value = bulletinId;
                option.textContent = `${bulletinNo} (Silinmiş)`;
                bulletinSelect.appendChild(option);
            }
        });

        console.log('✅ Bülten seçenekleri yüklendi:', bulletins.length, 'adet');

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
async function checkCacheAndToggleButtonStates() {
    const selectedBulletin = bulletinSelect.value;
    startSearchBtn.disabled = true;
    researchBtn.disabled = true;
    
    if (!selectedBulletin || filteredMonitoringTrademarks.length === 0) {
        return;
    }

    const checkPromises = filteredMonitoringTrademarks.map(tm => 
        searchRecordService.getRecord(`${tm.id}_${selectedBulletin}`)
    );
    const results = await Promise.all(checkPromises);
    const cachedCount = results.filter(r => r.success && r.data).length;
    
    if (cachedCount > 0) {
        researchBtn.disabled = false;
        console.log('✅ Yeniden ara butonu aktif - önbellek var');
    }

    if (cachedCount === filteredMonitoringTrademarks.length && filteredMonitoringTrademarks.length > 0) {
        startSearchBtn.disabled = true;
        infoMessageContainer.innerHTML = `<div class="info-message">Bu bülten için tüm sonuçlar önbellekte mevcut. Sonuçlar otomatik olarak yükleniyor...</div>`;
        await performSearch(true);
    } else {
        startSearchBtn.disabled = false;
        infoMessageContainer.innerHTML = '';
    }
}

// === SEARCH FUNCTIONS ===
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

    const deletePromises = filteredMonitoringTrademarks.map(tm => 
        searchRecordService.deleteRecord(`${tm.id}_${selectedBulletin}`)
    );
    await Promise.all(deletePromises);
    
    await performSearch(false);
}

async function performSearch(fromCacheOnly = false) {
    const selectedBulletin = bulletinSelect.value;
    if (!selectedBulletin || filteredMonitoringTrademarks.length === 0) return;

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
    
    // Yeni arama yap (eğer gerekiyorsa)
    if (!fromCacheOnly && trademarksToSearch.length > 0) {
        loadingIndicator.textContent = `${trademarksToSearch.length} marka için arama yapılıyor...`;

        const monitoredMarksPayload = trademarksToSearch.map(tm => ({
            id: tm.id,
            markName: (tm.title || tm.markName || '').trim() || 'BELİRSİZ_MARKA',
            applicationDate: tm.applicationDate || '',
            niceClasses: Array.isArray(tm.niceClass) ? tm.niceClass : (tm.niceClass ? [tm.niceClass] : [])
        }));

        console.log("Cloud Function'a gönderilen markalar:", monitoredMarksPayload);

        try {
            const resultsFromCF = await runTrademarkSearch(monitoredMarksPayload, selectedBulletin);

            if (resultsFromCF && resultsFromCF.length > 0) {
                newSearchResults = resultsFromCF.map(hit => {
                    const monitoredTm = trademarksToSearch.find(tm => tm.id === hit.monitoredTrademarkId);
                    return {
                        ...hit,
                        source: 'new',
                        monitoredTrademark: monitoredTm ? (monitoredTm.title || monitoredTm.markName || 'BELİRSİZ_MARKA') : 'Bilinmeyen Marka'
                    };
                });

                // Sonuçları grupla ve kaydet
                const groupedResults = newSearchResults.reduce((acc, currentResult) => {
                    const monitoredTrademarkId = currentResult.monitoredTrademarkId;
                    if (!acc[monitoredTrademarkId]) {
                        acc[monitoredTrademarkId] = [];
                    }
                    acc[monitoredTrademarkId].push(currentResult);
                    return acc;
                }, {});

                // Her marka için önbelleğe kaydet
                for (const [monitoredTrademarkId, results] of Object.entries(groupedResults)) {
                    const recordId = `${monitoredTrademarkId}_${selectedBulletin}`;
                    await searchRecordService.saveRecord(recordId, { 
                        results: results, 
                        searchDate: new Date().toISOString() 
                    }, selectedBulletin);
                }
            }
        } catch (error) {
            console.error("Arama işlemi sırasında hata:", error);
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

    const infoMessage = `Toplam ${allSimilarResults.length} benzer sonuç bulundu. (${cachedResults.length} önbellekten, ${newSearchResults.length} yeni arama ile)`;
    infoMessageContainer.innerHTML = `<div class="info-message">${infoMessage}</div>`;

    pagination.update(allSimilarResults.length);
    renderCurrentPageOfResults();

    startSearchBtn.disabled = true;
    researchBtn.disabled = allSimilarResults.length === 0;
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
    updateSearchResultsHeader();

    // Grup bazlı render
    const pageGroups = {};
    currentPageData.forEach(hit => {
        const trademarkKey = hit.monitoredTrademarkId || 'unknown';
        if (!pageGroups[trademarkKey]) {
            pageGroups[trademarkKey] = [];
        }
        pageGroups[trademarkKey].push(hit);
    });

    const sortedGroupKeys = Object.keys(pageGroups).sort((a, b) => {
        const markA = pageGroups[a][0]?.monitoredTrademark || 'Bilinmeyen Marka';
        const markB = pageGroups[b][0]?.monitoredTrademark || 'Bilinmeyen Marka';
        return markA.localeCompare(markB);
    });

    let currentRowIndex = startIndex;

    sortedGroupKeys.forEach(trademarkKey => {
        const groupResults = pageGroups[trademarkKey];
        const monitoredTrademark = groupResults[0].monitoredTrademark || 'Bilinmeyen Marka';
        
        // Grup başlığı
        const totalCountForThisMark = allSimilarResults.filter(
            item => (item.monitoredTrademarkId || 'unknown') === trademarkKey
        ).length;

        const groupHeaderRow = document.createElement('tr');
        groupHeaderRow.classList.add('group-header');
        groupHeaderRow.innerHTML = `
            <td colspan="9">
                📋 <strong>${monitoredTrademark}</strong> markası için bulunan benzer sonuçlar (${totalCountForThisMark} adet)
            </td>
        `;
        resultsTableBody.appendChild(groupHeaderRow);

        // Grup içeriği
        groupResults.forEach((hit) => {
            currentRowIndex++;
            const row = createResultRow(hit, currentRowIndex);
            resultsTableBody.appendChild(row);
        });
    });

    // Event listener'ları ekle
    attachEventListeners();
}

function createResultRow(hit, rowIndex) {
    const holders = Array.isArray(hit.holders) 
        ? hit.holders.map(h => h.name || h.id).filter(Boolean).join(', ') 
        : (hit.holders || '');

    const monitoredNice = hit.monitoredNiceClasses || [];
    const niceClassHtml = Array.isArray(hit.niceClasses) 
        ? hit.niceClasses.map(cls => 
            `<span class="nice-class-badge ${monitoredNice.includes(cls) ? 'match' : ''}">${cls}</span>`
          ).join('') 
        : (hit.niceClasses || '');

    const similarityScore = hit.similarityScore ? `${(hit.similarityScore * 100).toFixed(0)}%` : '-';

    const isSimilar = hit.isSimilar;
    let similarityBtnClass = 'not-similar';
    let similarityBtnText = 'Benzemez';

    if (isSimilar === true) {
        similarityBtnClass = 'similar';
        similarityBtnText = 'Benzer';
    }
    
    const resultId = hit.objectID || hit.applicationNo;

    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${rowIndex}</td> 
        <td>${hit.applicationNo || '-'}</td>
        <td><strong>${hit.markName || '-'}</strong></td>
        <td>${holders}</td>
        <td>${niceClassHtml}</td>
        <td>${similarityScore}</td>
        <td>
            <button class="action-btn ${similarityBtnClass}" 
                    data-result-id="${resultId}" 
                    data-monitored-trademark-id="${hit.monitoredTrademarkId}" 
                    data-bulletin-id="${bulletinSelect.value}">
                ${similarityBtnText}
            </button>
        </td>
        <td>
            <select class="bs-select" 
                    data-result-id="${resultId}" 
                    data-monitored-trademark-id="${hit.monitoredTrademarkId}" 
                    data-bulletin-id="${bulletinSelect.value}">
                <option value="">B.Ş</option>
                <option value="%0" ${hit.bs === '%0' ? 'selected' : ''}>%0</option>
                <option value="%20" ${hit.bs === '%20' ? 'selected' : ''}>%20</option>
                <option value="%30" ${hit.bs === '%30' ? 'selected' : ''}>%30</option>
                <option value="%40" ${hit.bs === '%40' ? 'selected' : ''}>%40</option>
                <option value="%45" ${hit.bs === '%45' ? 'selected' : ''}>%45</option>
                <option value="%50" ${hit.bs === '%50' ? 'selected' : ''}>%50</option>
                <option value="%55" ${hit.bs === '%55' ? 'selected' : ''}>%55</option>
                <option value="%60" ${hit.bs === '%60' ? 'selected' : ''}>%60</option>
                <option value="%70" ${hit.bs === '%70' ? 'selected' : ''}>%70</option>
                <option value="%80" ${hit.bs === '%80' ? 'selected' : ''}>%80</option>
            </select>
        </td>
        <td class="note-cell" 
            data-result-id="${resultId}" 
            data-monitored-trademark-id="${hit.monitoredTrademarkId}" 
            data-bulletin-id="${bulletinSelect.value}">
            <div class="note-cell-content">
                <span class="note-icon">📝</span>
                ${hit.note 
                    ? `<span class="note-text">${hit.note}</span>` 
                    : `<span class="note-placeholder">Not ekle</span>`}
            </div>
        </td>
    `;
    return row;
}

// === EVENT HANDLERS ===
function attachEventListeners() {
    // Benzerlik butonları
    resultsTableBody.querySelectorAll('.action-btn').forEach(button => {
        button.addEventListener('click', handleSimilarityToggle);
    });

    // B.Ş. select'leri
    resultsTableBody.querySelectorAll('.bs-select').forEach(select => {
        select.addEventListener('change', handleBsChange);
    });

    // Not hücreleri
    resultsTableBody.querySelectorAll('.note-cell').forEach(cell => {
        const contentDiv = cell.querySelector('.note-cell-content');
        contentDiv.addEventListener('click', () => {
            const resultId = cell.dataset.resultId;
            const monitoredTrademarkId = cell.dataset.monitoredTrademarkId;
            const bulletinId = cell.dataset.bulletinId;
            const noteTextSpan = cell.querySelector('.note-text') || cell.querySelector('.note-placeholder');
            
            openNoteModal(resultId, monitoredTrademarkId, bulletinId, 
                noteTextSpan.textContent === 'Not ekle' ? '' : noteTextSpan.textContent);
        });
    });
}

async function handleSimilarityToggle(event) {
    const resultId = event.target.dataset.resultId;
    const monitoredTrademarkId = event.target.dataset.monitoredTrademarkId;
    const bulletinId = event.target.dataset.bulletinId;

    const currentHit = allSimilarResults.find(r => 
        (r.objectID === resultId || r.applicationNo === resultId) &&
        r.monitoredTrademarkId === monitoredTrademarkId
    );

    if (!currentHit) {
        console.error('Eşleşen sonuç bulunamadı:', resultId, monitoredTrademarkId);
        alert('Sonuç bilgileri bulunamadı, lütfen sayfayı yenileyin.');
        return;
    }

    const newSimilarityStatus = currentHit.isSimilar === true ? false : true;
    
    // UI'yi güncelle
    event.target.classList.remove('similar', 'not-similar');
    if (newSimilarityStatus === true) {
        event.target.classList.add('similar');
        event.target.textContent = 'Benzer';
    } else {
        event.target.classList.add('not-similar');
        event.target.textContent = 'Benzemez';
    }

    // Veritabanını güncelle
    const updateResult = await similarityService.updateSimilarityFields(
        monitoredTrademarkId, 
        bulletinId, 
        resultId, 
        { isSimilar: newSimilarityStatus }
    );

    if (updateResult.success) {
        const rIndex = allSimilarResults.findIndex(r => 
            (r.objectID === resultId || r.applicationNo === resultId) &&
            r.monitoredTrademarkId === monitoredTrademarkId
        );
        if (rIndex !== -1) {
            allSimilarResults[rIndex].isSimilar = newSimilarityStatus;
            allSimilarResults[rIndex].similarityUpdatedAt = new Date().toISOString();
        }
        console.log(`✅ Benzerlik durumu güncellendi: ${resultId} -> ${newSimilarityStatus ? 'Benzer' : 'Benzemez'}`);
    } else {
        // Hata durumunda UI'yi geri al
        event.target.classList.remove('similar', 'not-similar');
        if (currentHit.isSimilar === true) {
            event.target.classList.add('similar');
            event.target.textContent = 'Benzer';
        } else {
            event.target.classList.add('not-similar');
            event.target.textContent = 'Benzemez';
        }
        console.error('❌ Benzerlik durumu güncellenemedi:', updateResult.error);
        alert('Benzerlik durumu güncellenirken hata oluştu.');
    }
}

async function handleBsChange(event) {
    const resultId = event.target.dataset.resultId;
    const monitoredTrademarkId = event.target.dataset.monitoredTrademarkId;
    const bulletinId = event.target.dataset.bulletinId;
    const newValue = event.target.value;

    const updateResult = await similarityService.updateSimilarityFields(
        monitoredTrademarkId, 
        bulletinId, 
        resultId, 
        { bs: newValue }
    );

    if (updateResult.success) {
        const rIndex = allSimilarResults.findIndex(r => 
            (r.objectID === resultId || r.applicationNo === resultId) &&
            r.monitoredTrademarkId === monitoredTrademarkId
        );
        if (rIndex !== -1) {
            allSimilarResults[rIndex].bs = newValue;
        }
        console.log(`✅ B.Ş. güncellendi: ${resultId} -> ${newValue}`);
    } else {
        console.error('❌ B.Ş. güncellenemedi:', updateResult.error);
        alert('B.Ş. güncellenirken hata oluştu.');
    }
}

// === MODAL FUNCTIONS ===
function openNoteModal(resultId, monitoredTrademarkId, bulletinId, currentNote) {
    const noteModal = document.getElementById('noteModal');
    const noteInputModal = document.getElementById('noteInputModal');
    
    noteInputModal.value = currentNote;
    currentNoteModalData = { resultId, monitoredTrademarkId, bulletinId };

    noteModal.classList.add('show');
    noteInputModal.focus();
}

async function saveNote() {
    const { resultId, monitoredTrademarkId, bulletinId } = currentNoteModalData;
    const noteInputModal = document.getElementById('noteInputModal');
    const newNoteValue = noteInputModal.value;

    const updateResult = await similarityService.updateSimilarityFields(
        monitoredTrademarkId,
        bulletinId,
        resultId,
        { note: newNoteValue }
    );

    if (updateResult.success) {
        const hit = allSimilarResults.find(r =>
            (r.objectID === resultId || r.applicationNo === resultId) &&
            r.monitoredTrademarkId === monitoredTrademarkId
        );
        if (hit) hit.note = newNoteValue;

        const cell = resultsTableBody.querySelector(
            `td.note-cell[data-result-id="${resultId}"][data-monitored-trademark-id="${monitoredTrademarkId}"]`
        );
        if (cell) {
            const span = cell.querySelector('.note-text') || cell.querySelector('.note-placeholder');
            span.textContent = newNoteValue || 'Not ekle';
            span.className = newNoteValue ? 'note-text' : 'note-placeholder';
        }
        console.log(`✅ Not güncellendi: ${resultId} -> ${newNoteValue}`);
        document.getElementById('noteModal').classList.remove('show');
    } else {
        console.error('❌ Not güncellenemedi:', updateResult.error);
        alert('Not güncellenirken hata oluştu.');
    }
}

// === UTILITY FUNCTIONS ===
function updateSearchResultsHeader() {
    const resultsHeader = document.querySelector('.results-header h3');
    if (resultsHeader) {
        resultsHeader.innerHTML = `Arama Sonuçları`;
    }
}

function getAllSearchResults() {
    return allSimilarResults
        .filter(r => r.isSimilar === true)
        .map(r => {
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
                    similarity: r.similarityScore ? `${(r.similarityScore * 100).toFixed(0)}%` : null,
                    note: r.note || null
                }
            };
        });
}

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', async () => {
    console.log(">>> DOM yüklendi, başlatılıyor...");
    
    initializePagination();
    await loadInitialData();

    // Ana buton event listener'ları
    startSearchBtn.addEventListener('click', () => performSearch(false));
    researchBtn.addEventListener('click', performResearch);
    clearFiltersBtn.addEventListener('click', () => {
        ownerSearchInput.value = '';
        niceClassSearchInput.value = '';
        bulletinSelect.selectedIndex = 0;
        applyMonitoringListFilters();
    });

    // Filter event listener'ları
    ownerSearchInput.addEventListener('input', debounce(applyMonitoringListFilters, 400));
    niceClassSearchInput.addEventListener('input', debounce(applyMonitoringListFilters, 400));
    bulletinSelect.addEventListener('change', checkCacheAndToggleButtonStates);

    // Modal event listener'ları
    const noteModal = document.getElementById('noteModal');
    const closeNoteModalBtn = document.getElementById('closeNoteModal');
    const cancelNoteBtn = document.getElementById('cancelNoteBtn');
    const saveNoteBtn = document.getElementById('saveNoteBtn');

    if (closeNoteModalBtn) {
        closeNoteModalBtn.addEventListener('click', () => noteModal.classList.remove('show'));
    }
    if (cancelNoteBtn) {
        cancelNoteBtn.addEventListener('click', () => noteModal.classList.remove('show'));
    }
    if (saveNoteBtn) {
        saveNoteBtn.addEventListener('click', saveNote);
    }

    // Rapor oluşturma
    document.getElementById("btnGenerateReport").addEventListener("click", async () => {
        const results = getAllSearchResults();
        if (!results.length) {
            alert("Hiç benzer olarak işaretlenmiş sonuç yok.");
            return;
        }

        try {
            const generateSimilarityReport = httpsCallable(functions, "generateSimilarityReport");
            const response = await generateSimilarityReport({ results });

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