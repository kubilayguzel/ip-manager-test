// public/js/trademark-similarity-search.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, doc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { firebaseConfig } from '../firebase-config.js';

initializeApp(firebaseConfig);
const db = getFirestore();

const algoliaClient = algoliasearch('THCIEJJTZ9', 'b6c38850bfc00adcf0ecdd9a14638c27'); // 🔐
const index = algoliaClient.initIndex('trademark_bulletin_records');

const params = new URLSearchParams(window.location.search);
const trademarkId = params.get('trademarkId');
const bulletinId = params.get('bulletinId');

const resultContainer = document.getElementById('search-results');

if (trademarkId && bulletinId) {
  runSimilaritySearch(trademarkId, bulletinId);
}

function normalizeNiceClasses(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .flatMap(str => str.split(/[^0-9]+/))
      .map(s => s.trim())
      .filter(Boolean);
  } else if (typeof input === 'string') {
    return input
      .split(/[^0-9]+/)
      .map(s => s.trim())
      .filter(Boolean);
  } else {
    return [];
  }
}

async function runSimilaritySearch(trademarkId, bulletinId) {
  const docRef = doc(db, 'monitoringTrademarks', trademarkId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    resultContainer.innerHTML = '<p>Marka bulunamadı.</p>';
    return;
  }

  const searchTarget = docSnap.data();
  const query = searchTarget.markName;
  const targetDate = new Date(searchTarget.priorityDate || searchTarget.applicationDate).getTime();
  const targetNice = normalizeNiceClasses(searchTarget.niceClasses);

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
    const hitNice = normalizeNiceClasses(hit.niceClasses);

    const hasCommonNice = targetNice.some(cls => hitNice.includes(cls));
    const isPrevious = hitDate < targetDate;

    if (isPrevious) {
      grouped.previous.push(hit);
    } else if (!hasCommonNice) {
      grouped.differentNice.push(hit);
    } else {
      grouped.normal.push(hit);
    }
  }

  renderResults(grouped);
}

function renderResults(grouped) {
  let html = '';

  if (grouped.previous.length > 0) {
    html += `<h3>Önceki Tarihli Benzer Marka</h3>`;
    html += buildList(grouped.previous);
  }

  if (grouped.normal.length > 0) {
    html += `<h3>Benzer Markalar</h3>`;
    html += buildList(grouped.normal);
  }

  if (grouped.differentNice.length > 0) {
    html += `<h3>Farklı Nice Sınıfı</h3>`;
    html += buildList(grouped.differentNice);
  }

  if (html === '') {
    html = '<p>Benzer marka bulunamadı.</p>';
  }

  resultContainer.innerHTML = html;
}

function buildList(list) {
  return `
    <ul>
      ${list.map(item => `
        <li>
          <strong>${item.markName}</strong> (${item.applicationNo})<br/>
          Sınıflar: ${Array.isArray(item.niceClasses) ? item.niceClasses.join(', ') : item.niceClasses || '-'}<br/>
          Başvuru Tarihi: ${item.applicationDate ? new Date(item.applicationDate).toLocaleDateString('tr-TR') : '-'}
        </li>
      `).join('')}
    </ul>
  `;
}
