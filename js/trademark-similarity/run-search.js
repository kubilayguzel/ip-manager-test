// js/trademark-similarity/run-search.js

import { calculateSimilarityScore } from './scorer.js';
import { isValidBasedOnDate, hasOverlappingNiceClasses } from './filters.js';

const algoliasearch = window.algoliasearch;
const client = algoliasearch('THCIEJJTZ9', 'b6c38850bfc00adcf0ecdd9a14638c27');
const index = client.initIndex('trademark_bulletin_records_live');

// run-search.js içinde değiştirilecek bölüm

export async function runTrademarkSearch(monitoredMark, selectedBulletinNo) {
  console.log("🚀 runTrademarkSearch başlatılıyor:", {
    markName: monitoredMark.markName,
    selectedBulletinNo,
    applicationDate: monitoredMark.applicationDate,
    niceClasses: monitoredMark.niceClasses
  });

  const { markName, applicationDate, niceClasses } = monitoredMark;

  try {
    // ÖNCESİNDE: Seçilen bültende hiç veri var mı kontrol et
    console.log("🔍 Bülten veri kontrolü yapılıyor...");
    const bulletinCheck = await index.search('', {
      filters: `bulletinId:${selectedBulletinNo}`,  // Tırnak olmadan dene
      hitsPerPage: 10
    });
    
    console.log(`📊 Bülten ${selectedBulletinNo} toplam kayıt: ${bulletinCheck.nbHits}`);
    
    if (bulletinCheck.nbHits === 0) {
      // Tırnakla da dene
      const bulletinCheckQuoted = await index.search('', {
        filters: `bulletinId:"${selectedBulletinNo}"`,
        hitsPerPage: 10
      });
      console.log(`📊 Tırnaklı format ile: ${bulletinCheckQuoted.nbHits} kayıt`);
      
      if (bulletinCheckQuoted.nbHits === 0) {
        throw new Error(`Seçilen bülten (${selectedBulletinNo}) için hiç veri bulunamadı`);
      }
    }

    // Ana arama - önce tırnaksız dene
    let searchResult = await index.search(markName, {
      filters: `bulletinId:${selectedBulletinNo}`,
      getRankingInfo: true,
      hitsPerPage: 1000
    });

    console.log("🧾 Algolia sonuçları (tırnaksız):", {
      nbHits: searchResult.nbHits,
      hitsLength: searchResult.hits.length,
      processingTime: searchResult.processingTimeMS + "ms"
    });

    // Eğer boş sonuç dönerse tırnaklı format dene
    if (searchResult.hits.length === 0) {
      console.log("⚠️ Tırnaksız format boş döndü, tırnaklı deneniyor...");
      
      searchResult = await index.search(markName, {
        filters: `bulletinId:"${selectedBulletinNo}"`,
        getRankingInfo: true,
        hitsPerPage: 1000
      });
      
      console.log("🧾 Algolia sonuçları (tırnaklı):", {
        nbHits: searchResult.nbHits,
        hitsLength: searchResult.hits.length
      });
    }

    // Hala boş sonuç dönerse daha geniş arama yap
    if (searchResult.hits.length === 0) {
      console.log("⚠️ Tam eşleşme bulunamadı, kısmi arama deneniyor...");
      
      // Marka adının ilk 3 harfi ile arama
      const partialName = markName.length >= 3 ? markName.substring(0, 3) : markName;
      
      searchResult = await index.search(partialName, {
        filters: `bulletinId:${selectedBulletinNo}`,
        getRankingInfo: true,
        hitsPerPage: 1000
      });
      
      console.log("🧾 Kısmi arama sonuçları:", {
        searchTerm: partialName,
        nbHits: searchResult.nbHits,
        hitsLength: searchResult.hits.length
      });
    }

    if (searchResult.hits.length === 0) {
      console.log("⚠️ Bu marka için hiç sonuç bulunamadı");
      return [];
    }

    // Sonuçları işle ve filtrele (mevcut kod devam eder...)
    const enriched = searchResult.hits
      .filter(hit => {
        const isValid = isValidBasedOnDate(hit.applicationDate, applicationDate);
        if (!isValid) {
          console.log(`📅 Tarih filtresi: ${hit.markName} reddedildi`);
        }
        return isValid;
      })
      .map(hit => {
        const similarityScore = calculateSimilarityScore(hit, markName);
        const sameClass = hasOverlappingNiceClasses(hit.niceClasses || [], niceClasses || []);
        
        console.log(`📊 ${hit.markName}: score=${similarityScore.toFixed(2)}, sameClass=${sameClass}`);
        
        return { 
          ...hit, 
          similarityScore, 
          sameClass, 
          monitoredNiceClasses: niceClasses || []
        };
      })
      .sort((a, b) => {
        if (a.sameClass && !b.sameClass) return -1;
        if (!a.sameClass && b.sameClass) return 1;
        return b.similarityScore - a.similarityScore;
      });

    console.log("🔍 İşlenmiş sonuçlar:", {
      total: enriched.length,
      sameClass: enriched.filter(r => r.sameClass).length,
      highSimilarity: enriched.filter(r => r.similarityScore > 0.7).length
    });

    return enriched;

  } catch (error) {
    console.error("❌ runTrademarkSearch hatası:", error);
    throw error;
  }
}