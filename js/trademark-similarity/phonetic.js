// js/trademark-similarity/phonetic.js
export function isPhoneticallySimilar(a, b) {
  if (!a || !b) return false;

  // Basit normalize
  a = a.toLowerCase().replace(/[^a-zA-ZğüşöçıİĞÜŞÖÇ]/g, '');
  b = b.toLowerCase().replace(/[^a-zA-ZğüşöçıİĞÜŞÖÇ]/g, '');

  // Basit eşitleme: ilk 3 harf + uzunluk
  return (
    a.slice(0, 3) === b.slice(0, 3) ||
    (a.length === b.length && a[0] === b[0])
  );
}
