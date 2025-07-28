// js/trademark-similarity/run-search.js

import { calculateSimilarityScore } from './scorer.js';
import { isValidBasedOnDate, hasOverlappingNiceClasses } from './filters.js';

const algoliasearch = window.algoliasearch;
const client = algoliasearch('THCIEJJTZ9', 'b6c38850bfc00adcf0ecdd9a14638c27');
const index = client.initIndex('trademark_bulletin_records_live');

// Debug function - BulletinId'leri listeleyen fonksiyon
export async function debugBulletinIds() {
  try {
    console.log("🔍 Index'teki bulletinId'leri kontrol ediliyor...");
    const result = await index.search("", {
      hitsPerPage: 50,
      attributesToRetrieve: ['bulletinId', 'markName']
    });
    
    console.log("🔍 Index'teki bulletinId'ler:");
    const uniqueBulletinIds = [...new Set(result.hits.map(h => h.bulletinId))];
    uniqueBulletinIds.forEach(id => {
      console.log(`"${id}" (length: ${id?.length})`);
    });
    
    return uniqueBulletinIds;
  } catch (error) {
    console.error("❌ Debug BulletinIds failed:", error);
    return [];
  }
}

// Debug function - Farklı filter formatlarını test eden fonksiyon
export async function debugFilters(selectedBulletinNo, testQuery = "setcard") {
  console.log("🧪 Farklı filter formatları test ediliyor...");
  
  const filters = [
    `bulletinId:${selectedBulletinNo}`,  // Numeric format - tırnak yok
    `bulletinId:"${selectedBulletinNo}"`, // String format - tırnak var
    `bulletinId='${selectedBulletinNo}'`  // String format - tek tırnak
  ];

  for (const filter of filters) {
    try {
      console.log(`🧪 Testing filter: ${filter}`);
      const result = await index.search(testQuery, {
        filters: filter,
        hitsPerPage: 5
      });
      console.log(`✅ Result with "${filter}": ${result.nbHits} hits`);
      if (result.nbHits > 0) {
        console.log("📄 Sample hits:", result.hits.slice(0, 2).map(h => ({
          markName: h.markName,
          bulletinId: h.bulletinId
        })));
      }
    } catch (error) {
      console.log(`❌ Error with "${filter}":`, error.message);
      console.log(`❌ Error details:`, error);
    }
  }
}

// Debug function - Genel arama testi
export async function debugGeneralSearch(testQuery = "setcard") {
  try {
    console.log(`🔍 "${testQuery}" için genel arama yapılıyor (filter olmadan)...`);
    const generalResult = await index.search(testQuery, {
      hitsPerPage: 10
    });
    console.log(`🔍 Genel arama sonucu: ${generalResult.nbHits} hits`);
    
    if (generalResult.nbHits > 0) {
      console.log("🔍 Sonuçlardaki BulletinIds:", 
        generalResult.hits.map(h => `"${h.bulletinId}" (${h.markName})`));
    }
    
    return generalResult;
  } catch (error) {
    console.error("❌ Genel arama hatası:", error);
    return null;
  }
}

// Ana arama fonksiyonu - Debug logları eklenmiş
export async function runTrademarkSearch(monitoredMark, selectedBulletinNo) {
  console.log("🚀 runTrademarkSearch başlatılıyor:", {
    markName: monitoredMark.markName,
    selectedBulletinNo,
    applicationDate: monitoredMark.applicationDate,
    niceClasses: monitoredMark.niceClasses
  });

  // DETAYLI BULLETIN ID DEBUG
  console.log("🔍 DETAYLI DEBUG - BULLETIN ID:");
  console.log("Raw selectedBulletinNo:", selectedBulletinNo);
  console.log("Type:", typeof selectedBulletinNo);
  console.log("Length:", selectedBulletinNo?.length);
  console.log("Char codes:", Array.from(selectedBulletinNo || '').map(c => c.charCodeAt(0)));
  
  // Beklenen değer ile karşılaştırma
  const expectedBulletinId = "ABa9mcv07R3bltQgs6N8";
  console.log("Expected:", expectedBulletinId);
  console.log("Exact match?", selectedBulletinNo === expectedBulletinId);
  
  // Character by character comparison
  if (selectedBulletinNo && expectedBulletinId) {
    for (let i = 0; i < Math.max(selectedBulletinNo.length, expectedBulletinId.length); i++) {
      const actual = selectedBulletinNo[i] || 'undefined';
      const expected = expectedBulletinId[i] || 'undefined';
      if (actual !== expected) {
        console.log(`❌ Diff at position ${i}: '${actual}' (${actual.charCodeAt ? actual.charCodeAt(0) : 'N/A'}) vs '${expected}' (${expected.charCodeAt ? expected.charCodeAt(0) : 'N/A'})`);
      }
    }
  }

  const { markName, applicationDate, niceClasses } = monitoredMark;

  try {
    // Filter string - BULLETINID NUMERIC FORMAT (TRAK YOK!)
    // Algolia 400 hatası veriyordu çünkü bulletinId numeric field
    const filterString = `bulletinId:"${selectedBulletinNo}"`;
    console.log("🎯 FILTER DEBUG - NUMERIC FORMAT:", {
      filterString,
      bulletinIdType: typeof selectedBulletinNo,
      bulletinIdValue: selectedBulletinNo
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
      processingTime: searchResult.processingTimeMS + "ms",
      query: searchResult.query,
      params: searchResult.params
    });
    
    if (searchResult.hits.length > 0) {
      console.log("🔎 Algolia ham sonuçlar (ilk 5):", searchResult.hits.slice(0, 5));
    } else {
      console.log("⚠️ Bu marka için hiç sonuç bulunamadı");
      
      // Sonuç bulunamadığında ek debug
      console.log("🔍 Ek debug - filter olmadan arama:");
      const noFilterResult = await index.search(markName, {
        hitsPerPage: 10
      });
      console.log("📊 Filter olmadan sonuç:", noFilterResult.nbHits);
      
      return [];
    }

    const enriched = searchResult.hits
      .filter(hit => {
        const isValid = isValidBasedOnDate(hit.applicationDate, applicationDate);
        if (!isValid) {
          console.log(`🚫 Tarih filtresi: ${hit.markName} (${hit.applicationDate}) geçersiz`);
        }
        return isValid;
      })
      .map(hit => {
        const similarityScore = calculateSimilarityScore(hit, markName);
        const overlappingClasses = hasOverlappingNiceClasses(niceClasses, hit.niceClasses);
        
        console.log(`📊 Benzerlik hesaplaması: ${hit.markName} -> ${(similarityScore * 100).toFixed(1)}%`);
        
        return {
          ...hit,
          similarityScore,
          sameClass: overlappingClasses,
          monitoredNiceClasses: niceClasses
        };
      })
      .sort((a, b) => b.similarityScore - a.similarityScore);

    console.log(`✅ ${enriched.length} filtrelenmiş sonuç döndürülüyor`);
    return enriched;

  } catch (error) {
    console.error("❌ runTrademarkSearch hatası:", error);
    console.error("❌ Error stack:", error.stack);
    throw error;
  }
}

// Basit test fonksiyonu - sadece temel arama
export async function simpleTest() {
  console.log("🧪 Basit test başlatılıyor...");
  
  try {
    // 1. Sadece index'e erişim testi
    console.log("1️⃣ Index erişim testi...");
    const testResult = await index.search("", { hitsPerPage: 1 });
    console.log("✅ Index erişilebilir:", testResult.nbHits, "toplam kayıt");
    
    // 2. Basit kelime arama
    console.log("2️⃣ 'setcard' kelime araması...");
    const wordResult = await index.search("setcard", { hitsPerPage: 10 });
    console.log("✅ 'setcard' arama sonucu:", wordResult.nbHits, "kayıt");
    
    if (wordResult.nbHits > 0) {
      console.log("📄 Bulunan kayıtlar:");
      wordResult.hits.forEach((hit, i) => {
        console.log(`   ${i+1}. ${hit.markName} - BulletinId: "${hit.bulletinId}"`);
      });
    }
    
    // 3. BulletinId'leri kontrol et
    console.log("3️⃣ BulletinId analizi...");
    const allResults = await index.search("", { hitsPerPage: 20 });
    const uniqueBulletinIds = [...new Set(allResults.hits.map(h => h.bulletinId))];
    console.log("📊 Benzersiz bulletinId'ler:", uniqueBulletinIds);
    
    return { wordResult, uniqueBulletinIds };
    
  } catch (error) {
    console.error("❌ Basit test hatası:", error);
    return null;
  }
}

// Yardımcı test fonksiyonu - Manuel test için
export async function manualDebugTest(bulletinId = "ABa9mcv07R3bltQgs6N8", query = "setcard") {
  console.log("🧪 Manuel debug test başlatılıyor...");
  console.log("🎯 Test parametreleri:", { bulletinId, query });
  
  try {
    // 1. Index'teki bulletinId'leri listele
    await debugBulletinIds();
    
    // 2. Genel arama yap
    await debugGeneralSearch(query);
    
    // 3. Filter formatlarını test et
    await debugFilters(bulletinId, query);
    
    // 4. Tam arama testi
    const mockMonitoredMark = {
      markName: query,
      applicationDate: "2024-01-01",
      niceClasses: ["02", "08", "17"]
    };
    
    const result = await runTrademarkSearch(mockMonitoredMark, bulletinId);
    console.log("🎯 Final test result:", result.length, "matches");
    
  } catch (error) {
    console.error("❌ Manuel test hatası:", error);
  }
}

// Global olarak erişilebilir hale getir (debugging için)
if (typeof window !== 'undefined') {
  window.debugTrademarkSearch = {
    debugBulletinIds,
    debugFilters,
    debugGeneralSearch,
    manualDebugTest,
    runTrademarkSearch,
    simpleTest  // Basit test eklendi
  };
}