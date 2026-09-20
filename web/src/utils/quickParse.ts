// Turns free-text notes (the way lawyers already jot entries in a notes app,
// often Gujarati/Hindi + English mixed — "Gujlish") into draft transactions.
// It is a best-effort parser, not a source of truth: every result is meant
// to be shown in an editable preview before anything is saved, per the
// project's rule that money entries are never silently guessed.

export type QuickEntryType = "IN" | "OUT";

export interface QuickEntry {
  id: string;
  raw: string;
  amountPaise: number;
  type: QuickEntryType;
  note: string;
  uncertainType: boolean;
  balanceOnly: boolean;
  include: boolean;
}

const IN_KEYWORDS = [
  "received",
  "receive",
  "jama",
  "credit",
  "aavya",
  "aavyu",
  "aavi",
  "malya",
  "mali",
  "milya",
];

const OUT_KEYWORDS = [
  "paid",
  "pay",
  "apeli",
  "apyu",
  "apyo",
  "aapi didha",
  "aapi didhu",
  "aapyu",
  "aapyo",
  "gyu",
  "gayu",
  "kharch",
  "expense",
  "spent",
  "didha",
  "chuk",
  "chukvya",
];

const BALANCE_KEYWORDS = ["baki", "balance", "levana", "aavvana"];

// matches an optional leading minus, a run of digits (with optional comma
// grouping / decimal), optionally followed by "rs" or the rupee sign
const AMOUNT_RE = /(-?)\s*(\d[\d,]*(?:\.\d+)?)\s*(?:rs\.?|₹)?/gi;

function containsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function classify(note: string, forcedNegative: boolean): { type: QuickEntryType; uncertain: boolean } {
  if (forcedNegative) return { type: "OUT", uncertain: false };
  if (containsKeyword(note, OUT_KEYWORDS)) return { type: "OUT", uncertain: false };
  if (containsKeyword(note, IN_KEYWORDS)) return { type: "IN", uncertain: false };
  return { type: "IN", uncertain: true };
}

function cleanNote(chunk: string, amountMatch: string): string {
  return chunk
    .replace(amountMatch, "")
    .replace(/\brs\.?\b/gi, "")
    .replace(/₹/g, "")
    .replace(/^[\s,.\-–—:]+/, "")
    .replace(/[\s,.\-–—:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitIntoChunks(segment: string): string[] {
  const matches = [...segment.matchAll(AMOUNT_RE)].filter((m) => m[2]);
  if (matches.length <= 1) return [segment];
  const chunks: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? segment.length : segment.length;
    chunks.push(segment.slice(start, end));
  }
  return chunks;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `qe_${Date.now()}_${counter}`;
}

export function parseQuickEntries(text: string): QuickEntry[] {
  const entries: QuickEntry[] = [];

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const segments = line.split(",").map((s) => s.trim()).filter(Boolean);

    for (const segment of segments) {
      const chunks = splitIntoChunks(segment);

      for (const chunk of chunks) {
        AMOUNT_RE.lastIndex = 0;
        const match = AMOUNT_RE.exec(chunk);
        if (!match || !match[2]) continue;

        const negative = match[1] === "-";
        const amount = Number(match[2].replace(/,/g, ""));
        if (!amount || Number.isNaN(amount)) continue;

        const note = cleanNote(chunk, match[0]);
        const { type, uncertain } = classify(note, negative);

        const isBalanceMention = containsKeyword(note, BALANCE_KEYWORDS);
        const hasActionKeyword = containsKeyword(note, IN_KEYWORDS) || containsKeyword(note, OUT_KEYWORDS);
        const treatAsBalanceOnly = isBalanceMention && !hasActionKeyword && !negative;

        entries.push({
          id: nextId(),
          raw: chunk.trim(),
          amountPaise: Math.round(amount * 100),
          type,
          note: note || (treatAsBalanceOnly ? "balance" : ""),
          uncertainType: uncertain && !treatAsBalanceOnly,
          balanceOnly: treatAsBalanceOnly,
          include: !treatAsBalanceOnly,
        });
      }
    }
  }

  return entries;
}
