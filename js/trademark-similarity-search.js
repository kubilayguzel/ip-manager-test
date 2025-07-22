// public/js/trademark-similarity-search.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, getDocs, doc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { firebaseConfig } from '../firebase-config.js';

initializeApp(firebaseConfig);
const db = getFirestore();

const algoliaClient = algoliasearch('THCIEJJTZ9', 'b6c38850bfc00adcf0ecdd9a14638c27');
const index = algoliaClient.initIndex('trademark_bulletin_records');

const params = new URLSearchParams(window.location.search);
const trademarkId = params.get('trademarkId');

const resultContainer = document.getElementById('search-results');
const bulletinSelectContainer = document.getElementById('bulletin-select-container');

if (trademarkId) {
  showBulletinSelector(trademarkId);
}

async function showBulletinSelector(trademarkId) {
  const snapshot = await getDocs(collection(db, 'trademarkBulletins'));
  if (snapshot.empty) {
    resultContainer.innerHTML = '<p>Hiç bülten kaydı bulunamadı.</p>';
    return;
  }

  let selectHTML = `<label for="bulletin-select">Bültende Ara:</label>
    <select id="bulletin-select">
      <option value="">Bülten Seçiniz</option>`;

  snapshot.forEach(doc => {
    const data = doc.data();
    selectHTML += `<option value="${doc.id}">${data.bulletinNo} - ${data.bulletinDate}</option>`;
  });

  selectHTML += `</select>
    <button id="start-search">Ara</button>`;

  bulletinSelectContainer.innerHTML = selectHTML;

  document.getElementById('start-search').addEventListener('click', () => {
    const selectedId = document.getElementById('bulletin-select').value;
    if (!selectedId) {
      alert("Lütfen bir bülten seçiniz.");
      return;
    }
    runSimilaritySearch(trademarkId, selectedId);
  });
}

async function runSimilaritySearch(trademarkId, bulletinId) {
  resultContainer.innerHTML = '<p>Arama yapılıyor...</p>';

  const docRef = doc(db, 'monitoringTrademarks', trademarkId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    resultContainer.innerHTML = '<p>Marka bulunamadı.</p>';
    return;
  }

  const searchTarget = docSnap.data();
  const query = searchTarget.markName;
  const targetDate = new Date(searchTarget.priorityDate || searchTarget.applicationDate).getTime();
  const targetNice = (searchTarget.niceClasses || '').split(' '); // ["32", "33", "07"]

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
    const hitNice = (hit.niceClasses || '').split('/').map(cls => cls.trim()).filter(cls => cls); // ["07", "35"]

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
          Sınıflar: ${item.niceClasses || '-'}<br/>
          Başvuru Tarihi: ${new Date(item.applicationDate).toLocaleDateString('tr-TR')}
        </li>
      `).join('')}
    </ul>
  `;
}
