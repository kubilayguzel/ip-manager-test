// js/trademark-similarity/run-search.js

// Firebase Firestore servislerini ve Cloud Function'ları çağırmak için gerekli modülleri import et
import { firebaseServices } from '../../firebase-config.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

// Kendi benzerlik algoritması modüllerini artık client tarafında doğrudan kullanmıyoruz
// import { calculateSimilarityScore } from './scorer.js';
// import { isValidBasedOnDate, hasOverlappingNiceClasses } from './filters.js';

console.log(">>> run-search.js modülü yüklendi ve Firebase servisleri kullanılıyor <<<");

// Firebase Functions instance'ı oluştur
const functions = getFunctions(firebaseServices.app); // firebaseServices.app, Firebase app objenizi temsil etmeli

// performTrademarkSimilaritySearch Cloud Function'ını çağırılabilir yap
const performSearchCallable = httpsCallable(functions, 'performTrademarkSimilaritySearch');


/**
 * Marka benzerliği aramasını çalıştıran ana fonksiyon.
 * Artık tüm hesaplama bir Firebase Cloud Function üzerinde gerçekleşir.
 *
 * @param {Object} monitoredMark - İzlenen marka bilgileri (markName, applicationDate, niceClasses).
 * @param {string} selectedBulletinId - Seçilen bültenin Firestore doküman ID'si.
 * @returns {Array} Benzerlik skorlarına göre sıralanmış eşleşen markalar listesi.
 */
export async function runTrademarkSearch(monitoredMark, selectedBulletinId) {
    const response = await fetch(
      'https://europe-west1-<PROJECT_ID>.cloudfunctions.net/performTrademarkSimilaritySearchHttp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          monitoredMarks: [monitoredMark],
          selectedBulletinId 
        })
      }
    );
    const data = await response.json();
    return data.results || [];
}


// Artık client tarafında tüm kayıtları önbelleğe almaya gerek kalmadı.
// loadAllTrademarkBulletinRecords() kaldırıldı.