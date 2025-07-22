const visualMap = {
  "m": ["n", "h"], "n": ["m", "r"],
  "i": ["l", "j"], "o": ["a", "0"],
  "c": ["ç", "s"], "e": ["a"],
  "u": ["ü", "v"]
};

export function visualMismatchPenalty(a, b) {
  if (!a || !b || a.length !== b.length) return 5;

  let penalty = 0;

  for (let i = 0; i < a.length; i++) {
    const ca = a[i].toLowerCase();
    const cb = b[i].toLowerCase();

    if (ca !== cb) {
      if (visualMap[ca]?.includes(cb)) {
        penalty += 0.5;
      } else {
        penalty += 1.5;
      }
    }
  }

  return penalty;
}
