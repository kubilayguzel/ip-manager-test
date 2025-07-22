export const GENERIC_WORDS = [
  "turizm", "tekstil", "gıda", "inşaat", "danışmanlık", "hizmet",
  "bilişim", "teknoloji", "sanayi", "ticaret", "sigorta",
  "yayıncılık", "grup", "şirketi", "ltd", "aş", "anonim", "mobilya", "otomotiv"
];

export function cleanMarkName(name) {
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter(word => !GENERIC_WORDS.includes(word))
    .join(" ")
    .trim();
}
