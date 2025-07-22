
import { calculateSimilarityScore } from './scorer.js';
import { isValidBasedOnDate, hasOverlappingNiceClasses } from './filters.js';

const algoliasearch = window.algoliasearch;
const client = algoliasearch('THCIEJJTZ9', 'b6c38850bfc00adcf0ecdd9a14638c27');
const index = client.initIndex('trademark_bulletin_records_live');

export async function runTrademarkSearch(monitoredMark, selectedBulletinNo) {
  const { markName, applicationDate, niceClasses } = monitoredMark;

  const { hits } = await index.search(markName, {
    filters: `bulletinNo:${selectedBulletinNo}`,
    getRankingInfo: true,
    hitsPerPage: 1000
  });
    console.log("🧾 Algolia sonuçları:", results); // performMonitoringTrademarkSearch içinde
    console.log("🔍 Normalize edilmiş sonuçlar:", normalizedResults); // normalizeAndFilterResults sonrası
  const enriched = hits
    .filter(hit => isValidBasedOnDate(hit.applicationDate, applicationDate))
    .map(hit => {
      const similarityScore = calculateSimilarityScore(hit, markName);
      const sameClass = hasOverlappingNiceClasses(hit.niceClasses || [], niceClasses);
      return { ...hit, similarityScore, sameClass, monitoredNiceClasses: niceClasses };
    })
    .sort((a, b) => b.similarityScore - a.similarityScore);

  return enriched;
}
