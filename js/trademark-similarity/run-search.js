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

  // BulletinId debug
  console.log("🔍 BULLETIN ID DEBUG:", {
    type: typeof selectedBulletinNo,
    length: selectedBulletinNo?.length,
    previewStart: selectedBulletinNo?.substring(0, 10),
    previewEnd: selectedBulletinNo?.substring(-10)
  });

  const { markName, applicationDate, niceClasses } = monitoredMark;

  try {
    // Filter string
    const filterString = `bulletinId:"${selectedBulletinNo}"`;
    console.log("🎯 FILTER DEBUG:", {
      filterString,
      encoded: encodeURIComponent(filterString)
    });

    // Algolia search params
    const searchParams = {
      filters: filterString,
      getRankingInfo: true,
      hitsPerPage: 1000
    };

    // Algolia final request log
    console.log("🚀 Algolia final request:", {
      indexName: index.indexName,
      query: markName,
      params: searchParams
    });

    const searchResult = await index.search(markName, searchParams);

    // Sonuçları logla
    console.log("🧾 Algolia sonuç özeti:", {
      nbHits: searchResult.nbHits,
      hitsLength: searchResult.hits.length,
      processingTime: searchResult.processingTimeMS + "ms"
    });
    console.log("🔎 Algolia ham sonuçlar (ilk 5):", searchResult.hits.slice(0, 5));

    if (searchResult.hits.length === 0) {
      console.log("⚠️ Bu marka için hiç sonuç bulunamadı");
      return [];
    }

    const enriched = searchResult.hits
      .filter(hit => {
        const isValid = isValidBasedOnDate(hit.applicationDate, applicationDate);
        if (!isValid) {
          console.log(`📅 Tarih filtresi reddetti: ${hit.markName} (${hit.applicationDate})`);
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

    console.log("🔍 İşlenmiş sonuçlar özeti:", {
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
