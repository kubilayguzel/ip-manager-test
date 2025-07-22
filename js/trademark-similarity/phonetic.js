import { Metaphone } from "natural";

export function isPhoneticallySimilar(a, b) {
  return Metaphone.compare(a, b);
}
