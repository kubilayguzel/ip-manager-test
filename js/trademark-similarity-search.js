// public/js/trademark-similarity-search.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, getDocs
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { firebaseConfig } from '../firebase-config.js';

const algoliaClient = algoliasearch('THCIEJJTZ9', 'b6c38850bfc00adcf0ecdd9a14638c27');
const index = algoliaClient.initIndex('trademark_bulletin_records');

initializeApp(firebaseConfig);
const db = getFirestore();

const startButton = document.getElementById('start-search');
const bulletinSelect = document.getElementById('bulletin-select');
const ownerFilterInput = document.getElementById('owner-filter');
const niceFilterInput = document.getElementById('nice-filter');
const trademarkListEl = document.getElementById('trademark-list');
const resultsContainer = document.getElementById('search-results');

// Sayfa yüklendiğinde bültenleri doldur
loadBulletinOptions();

async function loadBulletinOptions() {
  const snapshot = await getDocs(collection(db, 'trademarkBulletins'));
  const bulletins = [];
  snapshot.forEach(doc => bulletins.push({ id: doc.id, ...doc.data() }));
  bulletinSelect.innerHTML = bulletins
    .map(b => `<option value="${b.id}">${b.bulletinNo} - ${b.bulletinDate}</option>`)
    .join('');
}

startButton.addEventListener('click', async () => {
  const selectedBulletin = bulletinSelect.value;
  if (!selectedBulletin) return alert('Lütfen bir bülten seçin.');

  const ownerFilter = ownerFilterInput.value.toLowerCase();
  const niceFilter = niceFilterInput.value;

  const snapshot = await getDocs(collection(db, 'monitoringTrademarks'));
  const monitored = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    const owner = (data.owners?.[0]?.name || '').toLowerCase();
    const niceMatch = !niceFilter || data.niceClasses?.includes(niceFilter);
    if (owner.includes(ownerFilter) && niceMatch) {
      monitored.push({ id: doc.id, ...data });
    }
  });

  trademarkListEl.innerHTML = monitored.map(m => `
    <li><strong>${m.markName}</strong> (${m.applicationNo})</li>
  `).join('');

  // Aramaları sırayla başlat
  const allResults = [];
  for (const trademark of monitored) {
    const results = await runSimilaritySearch(trademark, selectedBulletin);
    allResults.push({ trademark, ...results });
  }

  renderSearchResults(allResults);
});

async function runSimilaritySearch(trademark, bulletinId) {
  const query = trademark.markName;
  const targetDate = new Date(trademark.priorityDate || trademark.applicationDate).getTime();
  const targetNice = trademark.niceClasses || [];

const { hits } = await index.search(query, {
  filters: `bulletinId:"${bulletinId}"`,
  hitsPerPage: 1000,
});

  const previous = [], differentNice = [], normal = [];

  for (const hit of hits) {
    const hitDate = new Date(hit.priorityDate || hit.applicationDate).getTime();
    const hitNice = hit.niceClasses || [];

    const hasCommonNice = targetNice.some(cls =>
      hitNice.some(h => h.replace(/\D/g, '') === cls.replace(/\D/g, ''))
    );
    const isPrevious = hitDate < targetDate;

    if (isPrevious) {
      previous.push(hit);
    } else if (!hasCommonNice) {
      differentNice.push(hit);
    } else {
      normal.push(hit);
    }
  }

  return { previous, differentNice, normal };
}

function renderSearchResults(results) {
  let html = '';

  results.forEach(({ trademark, previous, normal, differentNice }) => {
    html += `<div class="result-block">
      <h3>${trademark.markName} (${trademark.applicationNo})</h3>`;

    if (previous.length > 0) {
      html += `<h4>Önceki Tarihli Benzer Marka</h4>${buildList(previous)}`;
    }
    if (normal.length > 0) {
      html += `<h4>Benzer Markalar</h4>${buildList(normal)}`;
    }
    if (differentNice.length > 0) {
      html += `<h4>Farklı Nice Sınıfı</h4>${buildList(differentNice)}`;
    }

    if (previous.length + normal.length + differentNice.length === 0) {
      html += `<p>Benzer marka bulunamadı.</p>`;
    }

    html += `</div><hr/>`;
  });

  resultsContainer.innerHTML = html;
}

function buildList(list) {
  return `
    <ul class="similarity-list">
      ${list.map(item => `
        <li>
          <strong>${item.markName}</strong> (${item.applicationNo})<br/>
          Sınıflar: ${item.niceClasses?.join(', ') || '-'}<br/>
          Başvuru Tarihi: ${new Date(item.applicationDate).toLocaleDateString('tr-TR')}
        </li>
      `).join('')}
    </ul>
  `;
}
