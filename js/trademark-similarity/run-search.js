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
    console.log("🚀 runTrademarkSearch başlatılıyor (Firebase Cloud Function ile):", {
        monitoredMark,
        selectedBulletinId
    });

    try {
        // Cloud Function'ı çağır ve sonucu bekle
        const response = await performSearchCallable({
            monitoredMark: monitoredMark,
            selectedBulletinId: selectedBulletinId
        });

        // Cloud Function'dan gelen veriyi al
        const results = response.data.results || [];

        console.log(`✅ Cloud Function'dan ${results.length} sonuç döndürüldü.`);
        // console.log("Cloud Function sonuç örnekleri (ilk 5):", results.slice(0, 5));

        return results;

    } catch (error) {
        console.error("❌ Cloud Function çağrılırken hata oluştu:", error);
        // Hata durumunda boş bir dizi veya uygun bir hata mesajı döndür
        throw new Error('Arama sırasında sunucu hatası oluştu. Lütfen konsolu kontrol edin.');
    }
}

// Artık client tarafında tüm kayıtları önbelleğe almaya gerek kalmadı.
// loadAllTrademarkBulletinRecords() kaldırıldı.