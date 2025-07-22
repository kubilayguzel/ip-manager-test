import { cleanMarkName } from './preprocess.js';
import { isPhoneticallySimilar } from './phonetic.js';
import { visualMismatchPenalty } from './visual-match.js';

export function calculateSimilarityScore(hit, query) {
  const info = hit._rankingInfo;
  let score = 0;

  score += (2 - info.typo) * 10;
  score += info.words * 15;
  score += Math.max(0, 20 - info.proximityDistance);
  score += Math.max(0, 10 - info.attribute);
  score += info.exact * 20;

  const cleanQuery = cleanMarkName(query);
  const cleanHit = cleanMarkName(hit.markName);

  if (isPhoneticallySimilar(cleanQuery, cleanHit)) {
    score += 10;
  }

  score -= visualMismatchPenalty(cleanQuery, cleanHit);

  return score;
}
