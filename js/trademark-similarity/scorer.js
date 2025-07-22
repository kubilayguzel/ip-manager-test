export function calculateSimilarityScore(hit, searchMarkName) {
  const hitMarkName = (hit.markName || '').toLowerCase().trim();
  const searchName = (searchMarkName || '').toLowerCase().trim();
  
  if (!hitMarkName || !searchName) return 0;
  
  // Tam eşleşme
  if (hitMarkName === searchName) return 1.0;
  
  // Birinin diğerini içermesi
  if (hitMarkName.includes(searchName) || searchName.includes(hitMarkName)) {
    return 0.8;
  }
  
  // Levenshtein distance bazlı benzerlik
  const distance = levenshteinDistance(hitMarkName, searchName);
  const maxLength = Math.max(hitMarkName.length, searchName.length);
  const similarity = 1 - (distance / maxLength);
  
  // Minimum threshold
  return similarity > 0.3 ? similarity : 0.1;
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