// js/trademark-similarity-search.js

import { db, personService, searchRecordService, similarityService } from '../firebase-config.js';
import { collection, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { runTrademarkSearch } from './trademark-similarity/run-search.js';
import Pagination from './pagination.js';
import { loadSharedLayout } from './layout-loader.js';

console.log("### trademark-similarity-search.js yüklendi ###");

let allSimilarResults = [];
let monitoringTrademarks = [];
let filteredMonitoringTrademarks = [];
let allPersons = [];
let pagination;
let currentNoteModalData = {};

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

const functions = getFunctions(undefined, "europe-west1");

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
    if (personsResult.success) {
        allPersons = personsResult.data;
        console.log("👥 Persons yüklendi:", allPersons.length);
    }

    await loadBulletinOptions();
    
    const snapshot = await getDocs(collection(db, 'monitoringTrademarks'));
    monitoringTrademarks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    filteredMonitoringTrademarks = [...monitoringTrademarks];
    
    console.log("🏷️ Monitoring trademarks yüklendi:", monitoringTrademarks.length);

    renderMonitoringList();
    updateMonitoringCount();
     
    // ✅ Butonları başlangıçta devre dışı bırak
    startSearchBtn.disabled = true;
    researchBtn.disabled = true;

    console.log("✅ loadInitialData tamamlandı");
}

// Bu debug kodunu loadBulletinOptions() fonksiyonuna ekleyin
async function loadBulletinOptions() {
    try {
        const bulletinSelect = document.getElementById('bulletinSelect');
        bulletinSelect.innerHTML = '<option value="">Bülten seçin...</option>';

        const trademarkBulletinsSnap = await getDocs(collection(db, 'trademarkBulletins'));
        const existingBulletins = trademarkBulletinsSnap.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(),
            hasOriginalBulletin: true 
        }));

        const monitoringSnap = await getDocs(collection(db, 'monitoringTrademarkRecords'));
        const monitoringBulletinMap = new Map();
        
        monitoringSnap.forEach(doc => {
            const data = doc.data();
            if (data.bulletinNo && data.bulletinDate) {
                const key = `${data.bulletinNo}_${data.bulletinDate}`;
                if (!monitoringBulletinMap.has(key)) {
                    monitoringBulletinMap.set(key, {
                        bulletinNo: data.bulletinNo,
                        bulletinDate: data.bulletinDate,
                        hasOriginalBulletin: false
                    });
                }
            }
        });

        const allBulletins = new Map();
        
        // MEVCUT BÜLTENLER İÇİN BULLETİN KEY OLUŞTUR
        existingBulletins.forEach(bulletin => {
            const bulletinDate = bulletin.bulletinDate || '';
            
            // Tarihi farklı formatlardan temizle
            let dateFormatted = '';
            if (bulletinDate) {
                if (bulletinDate.includes('/')) {
                    // "27/05/2025" -> "27052025"
                    dateFormatted = bulletinDate.replace(/\//g, '');
                } else if (bulletinDate.includes('.')) {
                    // "27.05.2025" -> "27052025"
                    dateFormatted = bulletinDate.replace(/\./g, '');
                } else if (bulletinDate.includes('-')) {
                    // "27-05-2025" -> "27052025"
                    dateFormatted = bulletinDate.replace(/\-/g, '');
                } else {
                    // Zaten temiz format
                    dateFormatted = bulletinDate;
                }
            }
            
            const bulletinKey = `${bulletin.bulletinNo}_${dateFormatted}`;
            
            allBulletins.set(bulletin.bulletinNo, {
                id: bulletin.id,
                bulletinNo: bulletin.bulletinNo,
                bulletinDate: bulletin.bulletinDate,
                bulletinKey: bulletinKey,
                createdAt: bulletin.createdAt,
                hasOriginalBulletin: true
            });
        });
        
        // Monitoring kayıtlarından gelen bültenler
        monitoringBulletinMap.forEach((value, key) => {
            if (!allBulletins.has(value.bulletinNo)) {
                allBulletins.set(value.bulletinNo, {
                    id: key,
                    bulletinNo: value.bulletinNo,
                    bulletinDate: value.bulletinDate,
                    bulletinKey: key,
                    createdAt: null,
                    hasOriginalBulletin: false
                });
            }
        });

        // Sıralama
        const sortedBulletins = Array.from(allBulletins.values()).sort((a, b) => {
            if (a.createdAt && b.createdAt) {
                const dateA = typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate() : new Date(0);
                const dateB = typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate() : new Date(0);
                return dateB - dateA;
            }
            if (a.hasOriginalBulletin && !b.hasOriginalBulletin) return -1;
            if (!a.hasOriginalBulletin && b.hasOriginalBulletin) return 1;
            return b.bulletinNo.localeCompare(a.bulletinNo);
        });

        // Option'ları oluştur - VALUE olarak bulletinKey kullan
        sortedBulletins.forEach(bulletin => {
            const option = document.createElement('option');
            option.value = bulletin.bulletinKey; // 469_27052025 formatı
            option.dataset.hasOriginalBulletin = bulletin.hasOriginalBulletin;
            option.dataset.bulletinNo = bulletin.bulletinNo;
            option.dataset.bulletinDate = bulletin.bulletinDate;
            option.textContent = `${bulletin.bulletinNo} - ${bulletin.bulletinDate || ''}`;
            bulletinSelect.appendChild(option);
        });

        console.log('✅ Bülten seçenekleri yüklendi:', {
            mevcutBultenler: existingBulletins.length,
            izlemeKayitlari: monitoringBulletinMap.size,
            toplam: allBulletins.size
        });

    } catch (error) {
        console.error('❌ Bülten seçenekleri yüklenirken hata:', error);
    }
}

function updateMonitoringCount() {
    document.getElementById('monitoringCount').textContent = filteredMonitoringTrademarks.length;
}

function applyMonitoringListFilters() {
    const ownerFilter = ownerSearchInput.value.toLowerCase();
    const niceFilter = niceClassSearchInput.value.toLowerCase();
    
    filteredMonitoringTrademarks = monitoringTrademarks.filter(data => {
        const ownerNames = getOwnerNames(data).toLowerCase();
        const niceClasses = Array.isArray(data.niceClass) ? 
            data.niceClass.join(' ') : (data.niceClass || '');
        
        return (!ownerFilter || ownerNames.includes(ownerFilter)) && 
               (!niceFilter || niceClasses.includes(niceFilter));
    });
    
    renderMonitoringList();
    updateMonitoringCount();
    
    // Buton durumlarını yeniden kontrol et
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

async function checkCacheAndToggleButtonStates() {
    console.log("🔍 checkCacheAndToggleButtonStates çağrıldı");
    
    const bulletinKey = bulletinSelect.value;
    
    console.log("🔑 Seçilen bulletinKey:", bulletinKey);
    console.log("👥 Filtrelenmiş izlenen markalar sayısı:", filteredMonitoringTrademarks?.length || 0);
    
    // Eğer bülten seçilmemişse
    if (!bulletinKey) {
        console.log("❌ Bülten seçilmemiş - butonlar devre dışı");
        startSearchBtn.disabled = true;
        researchBtn.disabled = true;
        return;
    }
    
    // Eğer izlenen marka yoksa
    if (!filteredMonitoringTrademarks || filteredMonitoringTrademarks.length === 0) {
        console.log("❌ İzlenen marka yok - butonlar devre dışı");
        startSearchBtn.disabled = true;
        researchBtn.disabled = true;
        
        if (infoMessageContainer) {
            infoMessageContainer.innerHTML = `
                <div class="info-message warning">
                    <strong>Uyarı:</strong> İzlenen marka bulunamadı. Önce izlenecek markalar ekleyin.
                </div>
            `;
        }
        return;
    }
    
    console.log("✅ Koşullar sağlandı, cache kontrolü yapılıyor...");
    
    // Cache kontrolü yap
    try {
        // ✅ SUBCOLLECTION PATH ile cache kontrolü
        console.log("🔍 Firestore path:", `monitoringTrademarkRecords/${bulletinKey}/trademarks`);
        const snapshot = await getDocs(collection(db, 'monitoringTrademarkRecords', bulletinKey, 'trademarks'));
        console.log("💾 Cache snapshot:", snapshot.docs.length, "doküman bulundu");
        
        const hasCache = snapshot.docs.some(docSnap => {
            const data = docSnap.data();
            const hasResults = data.results && data.results.length > 0;
            console.log(`📄 Doküman ${docSnap.id}:`, hasResults ? `${data.results.length} sonuç var` : "sonuç yok");
            return hasResults;
        });
        
        console.log("🗂️ Cache durumu:", hasCache ? "VAR" : "YOK");
        console.log("🔘 Buton durumu değiştiriliyor...");
        
        // Buton durumlarını ayarla
        if (hasCache) {
            startSearchBtn.disabled = true;    // Cache varsa "Başlat" devre dışı
            researchBtn.disabled = false;      // "Yeniden Ara" aktif
            console.log("✅ Cache VAR - Arama Başlat: DEVRE DIŞI, Yeniden Ara: AKTİF");
            
            // Cache'ten verileri yükle
            console.log("📊 Cache'ten veriler yükleniyor...");
            await loadDataFromCache(bulletinKey);
        } else {
            startSearchBtn.disabled = false;   // Cache yoksa "Başlat" aktif
            researchBtn.disabled = true;       // "Yeniden Ara" devre dışı
            console.log("✅ Cache YOK - Arama Başlat: AKTİF, Yeniden Ara: DEVRE DIŞI");
            
            // Bilgilendirme mesajı göster
            if (infoMessageContainer) {
                const selectedOption = bulletinSelect.options[bulletinSelect.selectedIndex];
                const displayText = selectedOption ? selectedOption.textContent : bulletinKey;
                
                infoMessageContainer.innerHTML = `
                    <div class="info-message info">
                        <strong>Bilgi:</strong> ${displayText} bülteni için önbellekte veri bulunamadı. "Arama Başlat" butonuna tıklayarak arama yapabilirsiniz.
                    </div>
                `;
            }
        }
        
        console.log("🔘 FINAL - startSearchBtn.disabled:", startSearchBtn.disabled);
        console.log("🔘 FINAL - researchBtn.disabled:", researchBtn.disabled);
        
    } catch (error) {
        console.error('❌ Cache kontrol hatası:', error);
        // Hata durumunda güvenli varsayılan
        startSearchBtn.disabled = false;
        researchBtn.disabled = true;
        console.log("⚠️ Hata nedeniyle varsayılan durum: Arama Başlat AKTİF");
    }
}
async function loadDataFromCache(bulletinKey) {
    // ✅ SUBCOLLECTION PATH ile cache'ten veri yükleme
    const snapshot = await getDocs(collection(db, 'monitoringTrademarkRecords', bulletinKey, 'trademarks'));
    let cachedResults = [];
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        cachedResults.push(...(data.results || []).map(r => ({
            ...r,
            source: 'cache',
            monitoredTrademarkId: docSnap.id,
            monitoredTrademark: filteredMonitoringTrademarks.find(tm => tm.id === docSnap.id)?.title || 'BELİRSİZ_MARKA'
        })));
    });
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
        if (pagination) pagination.update(0);
    }
}

async function performSearch(fromCacheOnly = false) {
    const bulletinKey = bulletinSelect.value;
    if (!bulletinKey || filteredMonitoringTrademarks.length === 0) return;
    
    console.log("🚀 performSearch başladı", { bulletinKey, markaSayisi: filteredMonitoringTrademarks.length });
    
    loadingIndicator.textContent = 'Arama yapılıyor...';
    loadingIndicator.style.display = 'block';
    noRecordsMessage.style.display = 'none';
    infoMessageContainer.innerHTML = '';
    resultsTableBody.innerHTML = '';
    allSimilarResults = [];

    let cachedResults = [];
    let trademarksToSearch = [];

    // Cache kontrol kısmına debug ekleyin
    console.log("🔍 Cache kontrol ediliyor...");
    for (const tm of filteredMonitoringTrademarks) {
        console.log(`📋 Marka kontrol ediliyor: ${tm.id} - ${tm.title || tm.markName}`);
        const result = await searchRecordService.getRecord(bulletinKey, tm.id);
        console.log(`💾 Cache sonucu:`, result);
        
        if (result.success && result.data) {
            console.log(`✅ Cache bulundu! ${result.data.results?.length || 0} sonuç`);
            cachedResults.push(...(result.data.results || []).map(r => ({
                ...r,
                source: 'cache',
                monitoredTrademarkId: tm.id,
                monitoredTrademark: tm.title || tm.markName || 'BELİRSİZ_MARKA'
            })));
        } else {
            console.log(`❌ Cache yok: ${result.error || 'Veri bulunamadı'}`);
            trademarksToSearch.push(tm);
        }
    }

    console.log(`📊 Cache özet: ${cachedResults.length} cache sonuç, ${trademarksToSearch.length} aranacak marka`);

    let newSearchResults = [];
    if (!fromCacheOnly && trademarksToSearch.length > 0) {
        loadingIndicator.textContent = `${trademarksToSearch.length} marka için arama yapılıyor...`;
        const monitoredMarksPayload = trademarksToSearch.map(tm => ({
            id: tm.id,
            markName: (tm.title || tm.markName || '').trim() || 'BELİRSİZ_MARKA',
            applicationDate: tm.applicationDate || '',
            niceClasses: Array.isArray(tm.niceClass) ? tm.niceClass : (tm.niceClass ? [tm.niceClass] : [])
        }));
        
        console.log("🔎 Arama payload hazırlandı:", monitoredMarksPayload);
        
        try {
            console.log("📡 Cloud Function çağrılıyor...");
            const resultsFromCF = await runTrademarkSearch(monitoredMarksPayload, bulletinKey);
            console.log("📨 Cloud Function sonucu:", resultsFromCF);
            
            if (resultsFromCF?.length > 0) {
                console.log(`✅ ${resultsFromCF.length} yeni sonuç bulundu`);
                newSearchResults = resultsFromCF.map(hit => ({
                    ...hit,
                    source: 'new',
                    monitoredTrademark: trademarksToSearch.find(tm => tm.id === hit.monitoredTrademarkId)?.title || hit.markName
                }));
                
                const groupedResults = newSearchResults.reduce((acc, r) => {
                    if (!acc[r.monitoredTrademarkId]) acc[r.monitoredTrademarkId] = [];
                    acc[r.monitoredTrademarkId].push(r);
                    return acc;
                }, {});
                
                console.log("💾 Sonuçlar gruplandı:", groupedResults);
                console.log("💾 Arama sonuçları kaydediliyor...");
                
                for (const [monitoredTrademarkId, results] of Object.entries(groupedResults)) {
                    console.log(`📝 Kaydediliyor: ${bulletinKey}/${monitoredTrademarkId} - ${results.length} sonuç`);
                    
                    const saveResult = await searchRecordService.saveRecord(bulletinKey, monitoredTrademarkId, {
                        results,
                        searchDate: new Date().toISOString()
                    });
                    
                    console.log(`💾 Kaydetme sonucu:`, saveResult);
                    
                    if (!saveResult.success) {
                        console.error(`❌ KAYDETME HATASI: ${saveResult.error}`);
                    } else {
                        console.log(`✅ Başarıyla kaydedildi: ${bulletinKey}/${monitoredTrademarkId}`);
                    }
                }
            } else {
                console.log("⚠️ Cloud Function'dan sonuç gelmedi");
            }
        } catch (error) {
            console.error("❌ Arama işlemi sırasında hata:", error);
            loadingIndicator.style.display = 'none';
            startSearchBtn.disabled = false;
            researchBtn.disabled = false;
            return;
        }
    }

    allSimilarResults = [...cachedResults, ...newSearchResults];
    console.log(`🎯 Toplam sonuç: ${allSimilarResults.length} (${cachedResults.length} cache + ${newSearchResults.length} yeni)`);
    
    groupAndSortResults();
    loadingIndicator.style.display = 'none';
    infoMessageContainer.innerHTML = `<div class="info-message">Toplam ${allSimilarResults.length} benzer sonuç bulundu.</div>`;
    pagination.update(allSimilarResults.length);
    renderCurrentPageOfResults();

    // ✅ Buton durumlarını güncelle
    try {
        if (newSearchResults.length > 0 || cachedResults.length > 0) {
            startSearchBtn.disabled = true;   // Artık cache var
            researchBtn.disabled = false;     // Yeniden ara aktif
            console.log("✅ Arama tamamlandı - Butonlar güncellendi (Başlat: DEVRE DIŞI, Yeniden Ara: AKTİF)");
        } else {
            startSearchBtn.disabled = false;  // Tekrar arama yapabilsin
            researchBtn.disabled = true;      // Yeniden ara devre dışı
            console.log("⚠️ Hiç sonuç bulunamadı - Butonlar sıfırlandı");
        }
    } catch (error) {
        console.error("⚠️ Buton durumu güncelleme hatası:", error);
    }
}

function groupAndSortResults() {
    const groupedByTrademark = {};
    allSimilarResults.forEach(result => {
        const trademarkId = result.monitoredTrademarkId || 'unknown';
        if (!groupedByTrademark[trademarkId]) groupedByTrademark[trademarkId] = [];
        groupedByTrademark[trademarkId].push(result);
    });
    Object.keys(groupedByTrademark).forEach(id =>
        groupedByTrademark[id].sort((a, b) => (b.similarityScore || 0) - (a.similarityScore || 0))
    );
    const sortedIds = Object.keys(groupedByTrademark).sort((a, b) => {
        const markA = groupedByTrademark[a][0]?.monitoredTrademark || '';
        const markB = groupedByTrademark[b][0]?.monitoredTrademark || '';
        return markA.localeCompare(markB);
    });
    allSimilarResults = [];
    sortedIds.forEach(id => allSimilarResults.push(...groupedByTrademark[id]));
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
async function performResearch() {
    console.log("🔄 Yeniden arama başlatılıyor...");
    
    const bulletinKey = bulletinSelect.value;
    if (!bulletinKey) {
        console.error("❌ Bülten seçilmemiş!");
        return;
    }
    
    try {
        loadingIndicator.textContent = 'Cache temizleniyor...';
        loadingIndicator.style.display = 'block';
        noRecordsMessage.style.display = 'none';
        infoMessageContainer.innerHTML = '';
        resultsTableBody.innerHTML = '';
        
        // ✅ ÖNCELİKLE CACHE'İ TEMİZLE
        console.log("🗑️ Cache temizleniyor...");
        for (const tm of filteredMonitoringTrademarks) {
            console.log(`🗑️ Cache siliniyor: ${bulletinKey}/${tm.id}`);
            const deleteResult = await searchRecordService.deleteRecord(bulletinKey, tm.id);
            console.log(`🗑️ Silme sonucu:`, deleteResult);
        }
        
        console.log("✅ Cache temizlendi, yeni arama başlatılıyor...");
        
        // ✅ SONRA YENİ ARAMA YAP
        await performSearch(false); // false = cache'ten değil, yeni arama yap
        
        console.log("✅ Yeniden arama tamamlandı!");
        
    } catch (error) {
        console.error("❌ Yeniden arama hatası:", error);
        
        // Hata durumunda butonları resetle
        startSearchBtn.disabled = false;
        researchBtn.disabled = true;
        loadingIndicator.style.display = 'none';
        
        // Hata mesajı göster
        if (infoMessageContainer) {
            infoMessageContainer.innerHTML = `
                <div class="info-message error">
                    <strong>Hata:</strong> Yeniden arama sırasında bir hata oluştu. Lütfen tekrar deneyin.
                </div>
            `;
        }
    }
}

// ✅ BONUS: Cache'i temizleyerek yeniden arama fonksiyonu
async function performResearchWithCacheClear() {
    console.log("🔄 Cache temizleyerek yeniden arama başlatılıyor...");
    
    const bulletinKey = bulletinSelect.value;
    if (!bulletinKey) {
        console.error("❌ Bülten seçilmemiş!");
        return;
    }
    
    try {
        loadingIndicator.textContent = 'Cache temizleniyor...';
        loadingIndicator.style.display = 'block';
        
        // Cache'i temizle
        console.log("🗑️ Cache temizleniyor...");
        for (const tm of filteredMonitoringTrademarks) {
            const deleteResult = await searchRecordService.deleteRecord(bulletinKey, tm.id);
            console.log(`🗑️ ${tm.id} cache silindi:`, deleteResult);
        }
        
        // Sonuçları temizle
        allSimilarResults = [];
        resultsTableBody.innerHTML = '';
        noRecordsMessage.style.display = 'none';
        infoMessageContainer.innerHTML = '';
        if (pagination) pagination.update(0);
        
        // Yeni arama yap
        loadingIndicator.textContent = 'Yeniden arama yapılıyor...';
        await performSearch(false);
        
        console.log("✅ Cache temizleyerek yeniden arama tamamlandı!");
        
    } catch (error) {
        console.error("❌ Cache temizleyerek yeniden arama hatası:", error);
        
        // Hata durumunda butonları resetle
        startSearchBtn.disabled = false;
        researchBtn.disabled = true;
        loadingIndicator.style.display = 'none';
        
        // Hata mesajı göster
        if (infoMessageContainer) {
            infoMessageContainer.innerHTML = `
                <div class="info-message error">
                    <strong>Hata:</strong> Cache temizleme ve yeniden arama sırasında bir hata oluştu.
                </div>
            `;
        }
    }
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

    // ✅ Bülten seçimi event listener'ını buraya ekleyin
    if (bulletinSelect) {
        bulletinSelect.addEventListener('change', async () => {
            console.log("🔍 Bulletin select change event tetiklendi!");
            const bulletinKey = bulletinSelect.value;
            console.log("🔑 Seçilen bülten:", bulletinKey);
            
            if (bulletinKey) {
                // Cache kontrolü yap
                await checkCacheAndToggleButtonStates();
            } else {
                // Bülten seçilmemişse her iki butonu da devre dışı bırak
                startSearchBtn.disabled = true;
                researchBtn.disabled = true;
                console.log("❌ Hiç bülten seçilmedi, butonlar devre dışı!");
                
                // Sonuçları temizle
                allSimilarResults = [];
                resultsTableBody.innerHTML = '';
                noRecordsMessage.style.display = 'none';
                infoMessageContainer.innerHTML = '';
                if (pagination) pagination.update(0);
            }
        });
        
        // Sayfa yüklendiğinde eğer bir bülten seçiliyse cache kontrol et
        if (bulletinSelect.value) {
            console.log("🚀 Sayfa yüklendiğinde bülten zaten seçili, cache kontrol ediliyor...");
            await checkCacheAndToggleButtonStates();
        }
    }
});