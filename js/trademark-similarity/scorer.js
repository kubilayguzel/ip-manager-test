// js/trademark-similarity/scorer.js

export function calculateSimilarityScore(hit, searchMarkName) {
  console.log("📊 Similarity score hesaplanıyor:", hit.markName, "vs", searchMarkName);
  
  const hitMarkName = (hit.markName || '').toLowerCase().trim();
  const searchName = (searchMarkName || '').toLowerCase().trim();
  
  if (!hitMarkName || !searchName) {
    console.log("❌ Boş marka adı, skor: 0");
    return 0;
  }
  
  // Tam eşleşme
  if (hitMarkName === searchName) {
    console.log("✅ Tam eşleşme, skor: 1.0");
    return 1.0;
  }
  
  // Birinin diğerini içermesi
  if (hitMarkName.includes(searchName) || searchName.includes(hitMarkName)) {
    console.log("🔄 Kısmi eşleşme, skor: 0.8");
    return 0.8;
  }
  
  // Levenshtein distance bazlı benzerlik
  const distance = levenshteinDistance(hitMarkName, searchName);
  const maxLength = Math.max(hitMarkName.length, searchName.length);
  const similarity = 1 - (distance / maxLength);
  
  const finalScore = similarity > 0.3 ? similarity : 0.1;
  console.log(`🔢 Levenshtein similarity: ${similarity.toFixed(2)}, final: ${finalScore.toFixed(2)}`);
  
  return finalScore;
}

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
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}