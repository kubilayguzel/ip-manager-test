// js/trademark-similarity/scorer.js

import { cleanMarkName } from './preprocess.js';
import { visualMismatchPenalty } from './visual-match.js';

/**
 * İki marka arasında benzerlik skorunu hesaplar
 * @param {Object} hit - Algolia'dan gelen marka kaydı
 * @param {string} searchMarkName - İzlenen marka adı
 * @returns {number} 0 ile 1 arasında benzerlik skoru
 */
export function calculateSimilarityScore(hit, searchMarkName) {
  console.log("📊 Similarity score hesaplanıyor:", hit.markName, "vs", searchMarkName);

  // Jenerik ibare temizliği (çok kelimeli isimlerde devreye girer)
  const enableGenericRemoval = (searchMarkName.trim().split(/\s+/).length > 1);
  const hitMarkName = cleanMarkName(hit.markName || '', enableGenericRemoval).toLowerCase().trim();
  const searchName = cleanMarkName(searchMarkName || '', enableGenericRemoval).toLowerCase().trim();

  if (!hitMarkName || !searchName) {
    console.log("❌ Boş marka adı, skor: 0");
    return 0;
  }

  // Tam eşleşme
  if (hitMarkName === searchName) {
    console.log("✅ Tam eşleşme, skor: 1.0");
    return 1.0;
  }

  // İçerme kontrolü
  if (hitMarkName.includes(searchName) || searchName.includes(hitMarkName)) {
    console.log("🔄 Kısmi eşleşme, skor: 0.8");
    return 0.8;
  }

  // Levenshtein distance bazlı benzerlik
  const distance = levenshteinDistance(hitMarkName, searchName);
  const maxLength = Math.max(hitMarkName.length, searchName.length);
  let similarity = 1 - (distance / maxLength);

  // Görsel benzerlik cezası (0.25)
  const visualPenalty = visualMismatchPenalty(hitMarkName, searchName);
  similarity -= (visualPenalty * 0.05); // 0.25 ceza => %5 etki

  // Tek harf farkı bonusu (aynı uzunluk, distance=1 ise)
  if (distance === 1 && hitMarkName.length === searchName.length) {
    similarity = Math.max(similarity, 0.75);
  }

  const finalScore = similarity > 0.3 ? similarity : 0.1; // Minimum 0.1
  console.log(`🔢 Final similarity: ${finalScore.toFixed(2)}`);
  return finalScore;
}

/**
 * Levenshtein distance hesaplar
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // Değiştirme
          matrix[i][j - 1] + 1,     // Ekleme
          matrix[i - 1][j] + 1      // Silme
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}
