// Spoof tokens impersonate real ones with symbols made of look-alike
// letters (Cyrillic "ЕТН" passing for ETH). A symbol counts as a spoof only
// when it contains such letters AND turns into plain Latin once they are
// swapped back, so a token legitimately named in another script is not
// flagged. Returns the symbol it imitates, or null.

const CONFUSABLE: Record<string, string> = {
  // Cyrillic capitals
  А: "A",
  В: "B",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  Х: "X",
  У: "Y",
  Ѕ: "S",
  І: "I",
  Ј: "J",
  Ԁ: "D",
  Ү: "Y",
  Ԛ: "Q",
  Ԝ: "W",
  // Cyrillic small
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  у: "y",
  х: "x",
  ѕ: "s",
  і: "i",
  ј: "j",
  ԁ: "d",
  ӏ: "l",
  һ: "h",
  ԛ: "q",
  ԝ: "w",
  // Greek capitals
  Α: "A",
  Β: "B",
  Ε: "E",
  Ζ: "Z",
  Η: "H",
  Ι: "I",
  Κ: "K",
  Μ: "M",
  Ν: "N",
  Ο: "O",
  Ρ: "P",
  Τ: "T",
  Υ: "Y",
  Χ: "X",
  // Greek small
  ο: "o",
  ν: "v",
  ι: "i",
  κ: "k",
  ρ: "p",
  τ: "t",
  υ: "u",
  χ: "x",
};

export function spoofOf(symbol: string): string | null {
  const s = symbol.replace(/\.\.\.$/, "");
  let swapped = false;
  let out = "";
  for (const ch of s) {
    const latin = CONFUSABLE[ch];
    if (latin) {
      swapped = true;
      out += latin;
    } else {
      out += ch;
    }
  }
  if (!swapped || !/^[\x20-\x7E]+$/.test(out)) return null;
  return out;
}
