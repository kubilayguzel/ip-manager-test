// public/js/trademark-similarity-search.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, getDocs, query, where
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { firebaseConfig } from '../firebase-config.js';

initializeApp(firebaseConfig);
const db = getFirestore();

const algoliaClient = algoliasearch('THCIEJJTZ9', 'b6c38850bfc00adcf0ecdd9a14638c27');
const index = algoliaClient.initIndex('trademark_bulletin_records');

const trademarkListEl = document.getElementById('trademark-list');
const searchButton = document.getElementById('start-search');
const resultContainer = document.getElementById('search-results');
const bulletinSelect = document.getElementById('bulletin-select');

// 📥 Bültenleri Firestore'dan yükle
async function loadBulletins() {
  const snapshot = await getDocs(collection(db, 'trademarkBulletins'));
  const options = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    options.push({ id: doc.id, ...data });
  });

  options.sort((a, b) => b.bulletinDate?.seconds - a.bulletinDate?.seconds);

  bulletinSelect.innerHTML = options.map(b => `
    <option value="${b.id}">${b.bulletinNo} - ${new Date(b.bulletinDate.seconds * 1000).toLocaleDateString('tr-TR')}</option>
  `).join('');
}

// 📥 İzlenen markaları yükle
async function loadMonitoredTrademarks() {
  const ownerFilter = document.getElementById('owner-filter').value.toLowerCase();
  const niceFilter = document.getElementById('nice-filter').value;

  const snapshot = await getDocs(collection(db, 'monitoringTrademarks'));
  const trademarks = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    if (ownerFilter && !data.owners?.join(', ').toLowerCase().includes(ownerFilter)) return;
    if (niceFilter && !data.niceClasses?.split(' ').includes(niceFilter)) return;
    trademarks.push({ id: doc.id, ...data });
  });

  trademarkListEl.innerHTML = trademarks.map(m => `
    <li><strong>${m.markName}</strong> (${m.applicationNo}) - Sınıflar: ${m.niceClasses || '-'}</li>
  `).join('');

  return trademarks;
}

// 🔍 Benzerlik araştırması
async function performSearch() {
  const bulletinId = bulletinSelect.value;
  if (!bulletinId) {
    alert('Lütfen bir bülten seçin.');
    return;
  }

  const trademarks = await loadMonitoredTrademarks();
  resultContainer.innerHTML = '';

  for (const trademark of trademarks) {
    const query = trademark.markName;
    const targetDate = new Date(trademark.priorityDate || trademark.applicationDate).getTime();
    const targetNice = trademark.niceClasses?.split(' ') || [];

    const { hits } = await index.search(query, {
      filters: `bulletinId:"${bulletinId}"`,
      hitsPerPage: 1000,
    });

    const grouped = {
      previous: [],
      differentNice: [],
      normal: []
    };

    for (const hit of hits) {
      const hitDate = new Date(hit.priorityDate || hit.applicationDate).getTime();
      const hitNice = hit.niceClasses?.split(' / ') || [];
      const hasCommonNice = targetNice.some(nc => hitNice.includes(nc));
      const isPrevious = hitDate < targetDate;

      if (isPrevious) {
        grouped.previous.push(hit);
      } else if (!hasCommonNice) {
        grouped.differentNice.push(hit);
      } else {
        grouped.normal.push(hit);
      }
    }

    renderResults(trademark.markName, grouped);
  }
}

function renderResults(markName, grouped) {
  let html = `<h3>🔎 ${markName}</h3>`;

  if (grouped.previous.length > 0) {
    html += `<h4>Önceki Tarihli Benzer Marka</h4>`;
    html += buildList(grouped.previous);
  }

  if (grouped.normal.length > 0) {
    html += `<h4>Benzer Markalar</h4>`;
    html += buildList(grouped.normal);
  }

  if (grouped.differentNice.length > 0) {
    html += `<h4>Farklı Nice Sınıfı</h4>`;
    html += buildList(grouped.differentNice);
  }

  if (!grouped.previous.length && !grouped.normal.length && !grouped.differentNice.length) {
    html += `<p>Benzer marka bulunamadı.</p>`;
  }

  resultContainer.innerHTML += html;
}

function buildList(list) {
  return `
    <ul>
      ${list.map(item => `
        <li>
          <strong>${item.markName}</strong> (${item.applicationNo})<br/>
          Sınıflar: ${item.niceClasses || '-'}<br/>
          Başvuru Tarihi: ${new Date(item.applicationDate).toLocaleDateString('tr-TR')}
        </li>
      `).join('')}
    </ul>
  `;
}

// 🔄 Başlat
searchButton.addEventListener('click', performSearch);
loadBulletins();
loadMonitoredTrademarks();
