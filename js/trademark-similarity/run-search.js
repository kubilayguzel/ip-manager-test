// js/trademark-similarity/run-search.js

import { calculateSimilarityScore } from './scorer.js';
import { isValidBasedOnDate, hasOverlappingNiceClasses } from './filters.js';

const algoliasearch = window.algoliasearch;
const client = algoliasearch('THCIEJJTZ9', 'b6c38850bfc00adcf0ecdd9a14638c27');
const index = client.initIndex('trademark_bulletin_records_live');

export async function runTrademarkSearch(monitoredMark, selectedBulletinNo) {
  const { markName, applicationDate, niceClasses } = monitoredMark;
  
  console.log("🚀 runTrademarkSearch başlatılıyor:", {
    markName,
    selectedBulletinNo,
    applicationDate,
    niceClasses
  });

  try {
    // SORUN 1: Filter field adı yanlış - bulletinNo yerine bulletinId olmalı
    const searchResult = await index.search(markName, {
      filters: `bulletinId:"${selectedBulletinNo}"`, // bulletinNo değil bulletinId
      getRankingInfo: true,
      hitsPerPage: 1000
    });

    console.log("🧾 Algolia sonuçları:", searchResult);
    console.log("📊 Bulunan kayıt sayısı:", searchResult.hits.length);

    // SORUN 2: Eğer scorer.js ve filters.js dosyaları yoksa hata verecek
    // Bu durumda basit filtreleme yapalım
    const enriched = searchResult.hits
      .filter(hit => {
        // Tarih filtresi - eğer isValidBasedOnDate fonksiyonu yoksa basit kontrol
        if (typeof isValidBasedOnDate === 'function') {
          return isValidBasedOnDate(hit.applicationDate, applicationDate);
        }
        return true; // Eğer fonksiyon yoksa tüm sonuçları kabul et
      })
      .map(hit => {
        let similarityScore = 0;
        let sameClass = false;

        // Similarity score hesaplama - eğer calculateSimilarityScore fonksiyonu yoksa basit hesaplama
        if (typeof calculateSimilarityScore === 'function') {
          similarityScore = calculateSimilarityScore(hit, markName);
        } else {
          // Basit benzerlik hesaplama
          const hitMarkName = (hit.markName || '').toLowerCase();
          const searchMarkName = (markName || '').toLowerCase();
          if (hitMarkName.includes(searchMarkName) || searchMarkName.includes(hitMarkName)) {
            similarityScore = 0.8;
          } else {
            similarityScore = 0.3;
          }
        }

        // Nice class karşılaştırma
        if (typeof hasOverlappingNiceClasses === 'function') {
          sameClass = hasOverlappingNiceClasses(hit.niceClasses || [], niceClasses || []);
        } else {
          // Basit nice class karşılaştırma
          const hitClasses = hit.niceClasses || [];
          const monitoredClasses = niceClasses || [];
          sameClass = hitClasses.some(cls => monitoredClasses.includes(cls));
        }

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