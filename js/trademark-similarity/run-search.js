import algoliasearch from 'algoliasearch';
import { calculateSimilarityScore } from './scorer.js';
import { isValidBasedOnDate, hasOverlappingNiceClasses } from './filters.js';

const client = algoliasearch('YourAppId', 'YourSearchApiKey');
const index = client.initIndex('trademark_bulletin_records_live');

export async function runTrademarkSearch(monitoredMark, selectedBulletinNo) {
  const { markName, applicationDate, niceClasses } = monitoredMark;

  const { hits } = await index.search(markName, {
    filters: `bulletinNo:${selectedBulletinNo}`,
    getRankingInfo: true,
    hitsPerPage: 1000
  });

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
