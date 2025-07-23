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

  // ÖNEMLİ DEBUG: BulletinId detaylarını logla
  console.log("🔍 BULLETIN ID DEBUG:");
  console.log("  - Gelen bulletinId:", selectedBulletinNo);
  console.log("  - Type:", typeof selectedBulletinNo);
  console.log("  - Length:", selectedBulletinNo?.length);
  console.log("  - First 10 chars:", selectedBulletinNo?.substring(0, 10));
  console.log("  - Last 10 chars:", selectedBulletinNo?.substring(-10));
  console.log("  - Full string split:", selectedBulletinNo?.split(''));

  const { markName, applicationDate, niceClasses } = monitoredMark;

  try {
    // Filter string'ini detaylı logla
    const filterString = `bulletinId:"${selectedBulletinNo}"`;
    console.log("🎯 FILTER DEBUG:");
    console.log("  - Filter string:", filterString);
    console.log("  - Filter length:", filterString.length);
    console.log("  - Encoded filter:", encodeURIComponent(filterString));

    // Algolia search parametrelerini detaylı logla
    const searchParams = {
      filters: filterString,
      getRankingInfo: true,
      hitsPerPage: 1000
    };
    
    console.log("📡 ALGOLIA REQUEST DEBUG:");
    console.log("  - Search term:", markName);
    console.log("  - Search params:", JSON.stringify(searchParams, null, 2));

    const searchResult = await index.search(markName, searchParams);

    console.log("🧾 Algolia sonuçları:", {
      nbHits: searchResult.nbHits,
      hitsLength: searchResult.hits.length,
      processingTime: searchResult.processingTimeMS + "ms"
    });

    // Eğer sonuç yoksa alternatif denemeler yap
    if (searchResult.hits.length === 0) {
      console.log("⚠️ Ana arama sonuç vermedi, alternatif denemeler yapılıyor...");
      
      // 1. Tırnak olmadan dene
      console.log("🔄 Deneme 1: Tırnak olmadan");
      const tryUnquoted = await index.search(markName, {
        filters: `bulletinId:${selectedBulletinNo}`,   // ✅ Numeric format
        hitsPerPage: 1000
      });
      console.log("   Sonuç:", tryUnquoted.nbHits);
      
      // 2. Farklı escape karakterleri dene
      console.log("🔄 Deneme 2: Farklı format");
      const tryDifferent = await index.search(markName, {
        filters: `bulletinId='${selectedBulletinNo}'`,
        hitsPerPage: 1000
      });
      console.log("   Sonuç:", tryDifferent.nbHits);
      
      // 3. BulletinId'nin bir kısmı ile dene (prefix search)
      if (selectedBulletinNo && selectedBulletinNo.length > 10) {
        console.log("🔄 Deneme 3: İlk 15 karakter ile");
        const prefix = selectedBulletinNo.substring(0, 15);
        console.log("   Prefix:", prefix);
        
        const tryPrefix = await index.search('', {
          filters: `bulletinId:"${prefix}"`,
          hitsPerPage: 100
        });
        console.log("   Sonuç:", tryPrefix.nbHits);
        
        if (tryPrefix.hits.length > 0) {
          console.log("   İlk sonucun bulletinId'si:", tryPrefix.hits[0].bulletinId);
          console.log("   Tam eşleşme kontrolü:", tryPrefix.hits[0].bulletinId === selectedBulletinNo);
        }
      }
    }

    if (searchResult.hits.length === 0) {
      console.log("⚠️ Bu marka için hiç sonuç bulunamadı");
      return [];
    }

    // Mevcut kod devam eder...
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