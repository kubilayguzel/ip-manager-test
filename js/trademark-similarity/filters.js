export function isValidBasedOnDate(resultDate, referenceDate) {
  return new Date(resultDate) <= new Date(referenceDate);
}

export function hasOverlappingNiceClasses(a, b) {
  return a.some(cls => b.includes(cls));
}
