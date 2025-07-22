// phonetic.js - Tarayıcı uyumlu basit fonetik benzerlik kontrolü

/**
 * İki kelimenin basit fonetik benzerliğini kontrol eder.
 * "mesa" ≈ "nesa" gibi örnekleri yakalamak için harf yapısı ve pozisyon kıyaslaması yapar.
 */
export function isPhoneticallySimilar(a, b) {
    if (!a || !b) return false;

    a = normalizeString(a);
    b = normalizeString(b);

    if (a === b) return true;

    // Eğer uzunluk farkı büyükse muhtemelen farklı
    if (Math.abs(a.length - b.length) > 2) return false;

    // İlk harf benzerliği (m ~ n gibi görsel benzer)
    const visualPairs = {
        'm': ['n', 'h'],
        'n': ['m', 'r'],
        'c': ['ç', 's'],
        'i': ['l', 'j'],
        'o': ['a', '0'],
        'e': ['a'],
        'u': ['ü', 'v']
    };

    const firstA = a[0];
    const firstB = b[0];

    const visuallySimilar =
        (visualPairs[firstA] && visualPairs[firstA].includes(firstB)) ||
        (visualPairs[firstB] && visualPairs[firstB].includes(firstA));

    // Baş harf aynıysa veya görsel olarak çok benzerse
    if (firstA === firstB || visuallySimilar) {
        // İlk 3 harfin benzerliği (ör: mesa vs nesa → esa eşleşiyor)
        return a.slice(1, 4) === b.slice(1, 4);
    }

    return false;
}

/**
 * Noktalama ve büyük harfleri temizler
 */
function normalizeString(str) {
    return str
        .toLowerCase()
        .replace(/[^a-zA-ZğüşöçıİĞÜŞÖÇ]/g, '')
        .normalize('NFD') // aksan vb. kaldır
        .replace(/[\u0300-\u036f]/g, '');
}
