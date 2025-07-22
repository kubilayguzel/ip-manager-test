// js/trademark-similarity/run-search.js

import { calculateSimilarityScore } from './scorer.js';
import { isValidBasedOnDate, hasOverlappingNiceClasses } from './filters.js';

const algoliasearch = window.algoliasearch;
const client = algoliasearch('THCIEJJTZ9', 'b6c38850bfc00adcf0ecdd9a14638c27');
const index = client.initIndex('trademark_bulletin_records_live');

export async function runTrademarkSearch(monitoredMark, selectedBulletinNo) {
  console.log("🚀 runTrademarkSearch başlatılıyor:", {
    markName: monitoredMark.markName,
    selectedBulletinNo
  });

  const { markName, applicationDate, niceClasses } = monitoredMark;

  try {
    // SORUN 1 DÜZELTİLDİ: bulletinNo yerine bulletinId ve console.log yanlış yerde
    const searchResult = await index.search(markName, {
      filters: `bulletinId:"${selectedBulletinNo}"`, // bulletinNo değil bulletinId
      getRankingInfo: true,
      hitsPerPage: 1000
    });

    console.log("🧾 Algolia sonuçları:", searchResult);
    console.log("📊 Bulunan kayıt sayısı:", searchResult.hits.length);

    // Sonuçları işle ve filtrele
    const enriched = searchResult.hits
      .filter(hit => isValidBasedOnDate(hit.applicationDate, applicationDate))
      .map(hit => {
        const similarityScore = calculateSimilarityScore(hit, markName);
        const sameClass = hasOverlappingNiceClasses(hit.niceClasses || [], niceClasses || []);
        return { 
          ...hit, 
          similarityScore, 
          sameClass, 
          monitoredNiceClasses: niceClasses 
        };
      })
      .sort((a, b) => b.similarityScore - a.similarityScore);

    console.log("🔍 Normalize edilmiş sonuçlar:", enriched);
    return enriched;

  } catch (error) {
    console.error("❌ runTrademarkSearch hatası:", error);
    throw error;
  }
}