import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, getDocs
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { firebaseConfig } from '../firebase-config.js';

const algoliaClient = algoliasearch('THCIEJJTZ9', 'b6c38850bfc00adcf0ecdd9a14638c27');
const index = algoliaClient.initIndex('trademark_bulletin_records_live');

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

  const allResults = [];
  for (const trademark of monitored) {
    try {
      const hits = await runSimilaritySearch(trademark, selectedBulletin);
      allResults.push({ trademark, hits });
    } catch (e) {
      console.error("Arama hatası:", trademark.markName, e);
      allResults.push({ trademark, hits: [] });
    }
  }

  renderCombinedResults(allResults);
});

async function runSimilaritySearch(trademark, bulletinId) {
  const query = trademark.markName;
  const { hits } = await index.search(query, {
    filters: `bulletinId:"${bulletinId}"`,  // ← tek tırnak yerine çift tırnak
    hitsPerPage: 1000
  });
  return hits;
}

function renderCombinedResults(results) {
  let html = '';

  results.forEach(({ trademark, hits }) => {
    html += `<div class="result-block">
      <h3>${trademark.markName} (${trademark.applicationNo})</h3>`;
    if (hits.length > 0) {
      html += buildList(hits);
    } else {
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
