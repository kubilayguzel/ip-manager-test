// js/trademark-similarity/run-search.js

// Firebase Firestore servislerini import et
import { firebaseServices } from '../../firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Kendi benzerlik algoritması modüllerini import et
import { calculateSimilarityScore } from './scorer.js';
import { isValidBasedOnDate, hasOverlappingNiceClasses } from './filters.js';

console.log(">>> run-search.js modülü yüklendi ve Firebase servisleri kullanılıyor <<<");

let allTrademarkBulletinRecords = []; // Tüm marka kayıtlarını burada saklayacağız

/**
 * Tüm trademarkBulletinRecords'ı Firestore'dan bir kez yükler.
 * Bu veriler uygulama içinde önbellekte tutulacak.
 */
async function loadAllTrademarkBulletinRecords() {
    console.log("Firestore'dan tüm trademarkBulletinRecords yükleniyor...");
    try {
        const querySnapshot = await getDocs(collection(firebaseServices.db, 'trademarkBulletinRecords'));
        allTrademarkBulletinRecords = querySnapshot.docs.map(doc => ({
            id: doc.id, // Firestore doküman ID'sini sakla
            ...doc.data()
        }));
        console.log(`✅ ${allTrademarkBulletinRecords.length} adet trademarkBulletinRecords yüklendi.`);
        return allTrademarkBulletinRecords;
    } catch (error) {
        console.error("❌ trademarkBulletinRecords yüklenirken hata oluştu:", error);
        throw error;
    }
}

// Modül yüklendiğinde veriyi önbelleğe al
loadAllTrademarkBulletinRecords();

/**
 * Marka benzerliği aramasını çalıştıran ana fonksiyon.
 * Algolia yerine Firestore verisi ve özel algoritma kullanır.
 *
 * @param {Object} monitoredMark - İzlenen marka bilgileri (markName, applicationDate, niceClasses).
 * @param {string} selectedBulletinId - Seçilen bültenin Firestore doküman ID'si.
 * @returns {Array} Benzerlik skorlarına göre sıralanmış eşleşen markalar listesi.
 */
export async function runTrademarkSearch(monitoredMark, selectedBulletinId) {
    console.log("🚀 runTrademarkSearch başlatılıyor (Firebase Firestore ve özel algoritma ile):", {
        monitoredMark,
        selectedBulletinId
    });

    const { markName, applicationDate, niceClasses } = monitoredMark;

    // Veri henüz yüklenmediyse bekle
    if (allTrademarkBulletinRecords.length === 0) {
        await loadAllTrademarkBulletinRecords();
    }

    if (!allTrademarkBulletinRecords || allTrademarkBulletinRecords.length === 0) {
        console.warn("⚠️ Arama yapılabilecek marka kaydı bulunamadı.");
        return [];
    }

    const results = [];

    for (const hit of allTrademarkBulletinRecords) {
        // İlk filtreleme: Bülten ID'si ile eşleşenleri al
        if (hit.bulletinId !== selectedBulletinId) {
            continue;
        }

        // İkinci filtreleme: Tarih filtresi (monitoredMark.applicationDate'ten sonraki başvurular)
        const isDateValid = isValidBasedOnDate(hit.applicationDate, applicationDate);
        if (!isDateValid) {
            console.log(`🚫 Tarih filtresi: ${hit.markName} (${hit.applicationDate}) geçersiz.`);
            continue;
        }

        // Üçüncü filtreleme: Nice sınıfı çakışması (isteğe bağlı, ama genelde istenir)
        // Eğer niceClasses veya hit.niceClasses boşsa (tanımlı değilse) bu filtreyi atla veya farklı ele al.
        // Mevcut durumda, hasOverlappingNiceClasses boş array geldiğinde false dönecektir.
        const hasNiceClassOverlap = hasOverlappingNiceClasses(niceClasses, hit.niceClasses);
        // Eğer aranan marka için Nice sınıfı verilmişse ve bültendeki hit'in Nice sınıfıyla çakışma yoksa, bu hit'i atla.
        // Yoksa, çakışma olması durumunda devam et.
        if (niceClasses && niceClasses.length > 0 && !hasNiceClassOverlap) {
            console.log(`🚫 Nice sınıfı çakışması yok: ${hit.markName} (Sınıflar: ${hit.niceClasses?.join(', ') || '-'})`);
            continue;
        }


        // Benzerlik skorunu hesapla
        const similarityScore = calculateSimilarityScore(hit, markName);

        // Belirli bir eşik değerinin üzerindeki sonuçları dahil et
        // Bu eşik, testleriniz sırasında optimize edilebilir.
        const SIMILARITY_THRESHOLD = 0.3; // Örneğin, %30 benzerlik altı ilgisiz kabul edilebilir
        if (similarityScore < SIMILARITY_THRESHOLD) {
            // console.log(`📉 Düşük benzerlik skoru (${similarityScore.toFixed(2)}): ${hit.markName}`);
            continue;
        }

        results.push({
            // Algolia'dan gelen objectID yerine Firestore doküman ID'si kullanılıyor
            objectID: hit.id, // Firestore'dan gelen ID'yi objectID olarak kullan
            markName: hit.markName,
            applicationNo: hit.applicationNo,
            applicationDate: hit.applicationDate,
            niceClasses: hit.niceClasses,
            holders: hit.holders, // Holders verisini de ekliyoruz
            imagePath: hit.imagePath, // Görsel yolunu da ekliyoruz
            bulletinId: hit.bulletinId, // Bülten ID'si
            similarityScore: similarityScore,
            sameClass: hasNiceClassOverlap, // Nice sınıfı çakışması bilgisini sakla
            monitoredTrademark: monitoredMark.markName, // Hangi markanın izlendiği bilgisi
            monitoredNiceClasses: niceClasses // İzlenen markanın Nice sınıfları
        });
    }

    // Sonuçları benzerlik skoruna göre azalan sırada sırala
    results.sort((a, b) => b.similarityScore - a.similarityScore);

    console.log(`✅ ${results.length} filtrelenmiş ve sıralanmış sonuç döndürülüyor.`);
    // console.log("Sonuç örnekleri:", results.slice(0, 5)); // İlk 5 sonucu logla

    return results;
}

// Modül yüklendiğinde Firestore'dan verileri çekmek için çağrı
// Bu, runTrademarkSearch çağrılmadan önce verilerin hazır olmasını sağlar.
// Ancak emin olmak için runTrademarkSearch içinde de kontrol/yükleme mantığı var.
loadAllTrademarkBulletinRecords();