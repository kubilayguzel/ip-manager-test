// public/js/trademark-similarity-search.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, doc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { firebaseConfig } from '../firebase-config.js';

initializeApp(firebaseConfig);
const db = getFirestore();

const algoliaClient = algoliasearch('THCIEJJTZ9', 'YOUR_SEARCH_ONLY_API_KEY'); // 🔐
const index = algoliaClient.initIndex('trademark_bulletin_records');

// ✅ URL'den marka ID ve hedef bülteni al
const params = new URLSearchParams(window.location.search);
const trademarkId = params.get('trademarkId');
const bulletinId = params.get('bulletinId');

const resultContainer = document.getElementById('search-results');

if (trademarkId && bulletinId) {
  runSimilaritySearch(trademarkId, bulletinId);
}

async function runSimilaritySearch(trademarkId, bulletinId) {
  // 1. İzlenen markayı al
  const docRef = doc(db, 'monitoringTrademarks', trademarkId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    resultContainer.innerHTML = '<p>Marka bulunamadı.</p>';
    return;
  }

  const searchTarget = docSnap.data();

  const query = searchTarget.markName;
  const targetDate = new Date(searchTarget.priorityDate || searchTarget.applicationDate).getTime();
  const targetNice = searchTarget.niceClasses || [];

  // 2. Algolia araması
  const { hits } = await index.search(query, {
    filters: `bulletinId:"${bulletinId}"`,
    hitsPerPage: 1000,
  });

  // 3. Sınıflandırma
  const grouped = {
    previous: [],
    differentNice: [],
    normal: []
  };

  for (const hit of hits) {
    const hitDate = new Date(hit.priorityDate || hit.applicationDate).getTime();
    const hitNice = hit.niceClasses || [];

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
          Sınıflar: ${item.niceClasses?.join(', ') || '-'}<br/>
          Başvuru Tarihi: ${new Date(item.applicationDate).toLocaleDateString('tr-TR')}
        </li>
      `).join('')}
    </ul>
  `;
}
