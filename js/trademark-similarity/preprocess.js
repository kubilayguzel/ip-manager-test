export const GENERIC_WORDS = [
  "turizm", "tekstil", "gıda", "inşaat", "danışmanlık", "hizmet",
  "bilişim", "teknoloji", "sanayi", "ticaret", "sigorta",
  "yayıncılık", "grup", "şirketi", "ltd", "aş", "anonim", "mobilya", "otomotiv", 
  "kalite", "ürün", "ürünler", "pazarlama", "dekorasyon", "inovasyon",
  "endüstri", "enerji", "kimya", "makine", "makina", "giyim", "elektrik", "yapı",
  "proje", "dizayn", "tasarım", "lojistik", "ulaşım", "kargo", "taşımacılık",
  "yazılım", "market", "mağaza",  "mağazacılık", "otomotiv", "tarım", "sağlık"
];

export function cleanMarkName(name) {
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter(word => !GENERIC_WORDS.includes(word))
    .join(" ")
    .trim();
}
