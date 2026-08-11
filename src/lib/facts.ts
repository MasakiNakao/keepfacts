export type FactKind =
  | "money"
  | "percentage"
  | "date"
  | "time"
  | "version"
  | "email"
  | "url"
  | "measurement"
  | "range"
  | "quote"
  | "number";

export type FactStatus = "preserved" | "review";

export interface Fact {
  id: string;
  kind: FactKind;
  raw: string;
  normalized: string;
  valid: boolean;
  start: number;
  end: number;
  context: string;
}

export interface ComparedFact extends Fact {
  status: FactStatus;
  reviewReason?: "changed" | "missing" | "invalid";
  matched?: Fact;
  possibleMatch?: Fact;
}

export interface FactComparison {
  sourceFacts: ComparedFact[];
  addedFacts: Fact[];
  preservedCount: number;
  reviewCount: number;
  addedCount: number;
}

interface PatternDefinition {
  kind: FactKind;
  pattern: RegExp;
  normalize: (value: string) => string;
  validate?: (value: string) => boolean;
}

const FULL_WIDTH_DIGITS = "０１２３４５６７８９";
const ASCII_DIGITS = "0123456789";

function toAscii(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[０-９]/g, (digit) =>
      ASCII_DIGITS.charAt(FULL_WIDTH_DIGITS.indexOf(digit)),
    );
}

function compact(value: string) {
  return toAscii(value)
    .toLowerCase()
    .replace(/[，,]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeNumber(value: string) {
  const cleaned = compact(value).replace(/^\+/, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? String(number) : cleaned;
}

function normalizeMoney(value: string) {
  const cleaned = compact(value);
  const currency =
    /(?:us\$|usd|美元)/.test(cleaned)
      ? "USD"
      : /(?:c\$|cad|加元)/.test(cleaned)
        ? "CAD"
        : /(?:a\$|aud|澳元)/.test(cleaned)
          ? "AUD"
          : /(?:hk\$|hkd|港元)/.test(cleaned)
            ? "HKD"
            : /(?:€|eur|欧元)/.test(cleaned)
              ? "EUR"
              : /(?:£|gbp|英镑)/.test(cleaned)
                ? "GBP"
                : /(?:jpy|日元)/.test(cleaned)
                  ? "JPY"
                  : /(?:¥|￥|cny|rmb|人民币|元)/.test(cleaned)
                    ? "CNY"
                    : /\$/.test(cleaned)
                      ? "USD"
                      : "MONEY";

  const numberMatch = cleaned.match(/\d+(?:\.\d+)?/);
  if (!numberMatch) return `${currency}:${cleaned}`;

  let amount = Number(numberMatch[0]);
  if (/亿/.test(cleaned)) amount *= 100_000_000;
  else if (/万/.test(cleaned)) amount *= 10_000;
  else if (/bn\b/.test(cleaned)) amount *= 1_000_000_000;
  else if (/m\b/.test(cleaned)) amount *= 1_000_000;
  else if (/k\b/.test(cleaned)) amount *= 1_000;

  return `${currency}:${Number(amount.toFixed(8))}`;
}

function normalizePercentage(value: string) {
  const cleaned = compact(value)
    .replace("百分之", "")
    .replace(/percent|％|%/g, "");
  return normalizeNumber(cleaned);
}

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function normalizeDate(value: string) {
  const cleaned = toAscii(value).toLowerCase().trim();
  const numeric = cleaned.match(
    /((?:19|20)\d{2})\s*(?:年|[-/.])\s*(\d{1,2})(?:\s*(?:月|[-/.])\s*(\d{1,2}))?/,
  );
  if (numeric) {
    const [, year, month, day] = numeric;
    return day
      ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
      : `${year}-${month.padStart(2, "0")}`;
  }

  const english = cleaned.match(
    /([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+((?:19|20)\d{2})/,
  );
  if (english && MONTHS[english[1]]) {
    return `${english[3]}-${MONTHS[english[1]]}-${english[2].padStart(2, "0")}`;
  }

  return compact(value);
}

function validateDate(value: string) {
  const normalized = normalizeDate(value);
  const match = normalized.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] ? Number(match[3]) : undefined;
  if (month < 1 || month > 12) return false;
  if (day === undefined) return true;

  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function normalizeTime(value: string) {
  const cleaned = toAscii(value).toLowerCase().replace(/\s+/g, "");
  const clock = cleaned.match(/(\d{1,2}):(\d{2})(am|pm)?/);
  if (clock) {
    let hour = Number(clock[1]);
    if (clock[3] === "pm" && hour < 12) hour += 12;
    if (clock[3] === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${clock[2]}`;
  }

  const chinese = cleaned.match(/(上午|下午|晚上|凌晨)?(\d{1,2})点(?:(\d{1,2})分?)?/);
  if (chinese) {
    let hour = Number(chinese[2]);
    if ((chinese[1] === "下午" || chinese[1] === "晚上") && hour < 12) {
      hour += 12;
    }
    if (chinese[1] === "凌晨" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(chinese[3] ?? "0").padStart(2, "0")}`;
  }

  return compact(value);
}

const UNIT_ALIASES: Record<string, string> = {
  people: "person",
  person: "person",
  persons: "person",
  人: "person",
  名: "person",
  kilograms: "kg",
  kilogram: "kg",
  千克: "kg",
  公斤: "kg",
  grams: "g",
  gram: "g",
  克: "g",
  milligrams: "mg",
  milligram: "mg",
  毫克: "mg",
  kilometers: "km",
  kilometer: "km",
  公里: "km",
  meters: "m",
  meter: "m",
  米: "m",
  centimeters: "cm",
  centimeter: "cm",
  厘米: "cm",
  millimeters: "mm",
  millimeter: "mm",
  毫米: "mm",
  seconds: "second",
  second: "second",
  秒: "second",
  minutes: "minute",
  minute: "minute",
  分钟: "minute",
  hours: "hour",
  hour: "hour",
  小时: "hour",
  days: "day",
  day: "day",
  天: "day",
  weeks: "week",
  week: "week",
  周: "week",
  months: "month",
  month: "month",
  月: "month",
  years: "year",
  year: "year",
  年: "year",
};

function normalizeMeasurement(value: string) {
  const cleaned = compact(value);
  const match = cleaned.match(/(-?\d+(?:\.\d+)?)([^\d.-]+)$/u);
  if (!match) return cleaned;
  const unit = UNIT_ALIASES[match[2]] ?? match[2];
  return normalizeUnitValue(Number(match[1]), unit);
}

function normalizeRange(value: string) {
  const cleaned = compact(value);
  const match = cleaned.match(
    /(-?\d+(?:\.\d+)?)(?:-|–|—|~|至|到)(-?\d+(?:\.\d+)?)(.*)$/u,
  );
  if (!match) return cleaned;
  const unit = UNIT_ALIASES[match[3]] ?? match[3];
  const left = normalizeUnitValue(Number(match[1]), unit);
  const right = normalizeUnitValue(Number(match[2]), unit);
  const [leftFamily, leftValue] = splitUnitValue(left);
  const [rightFamily, rightValue] = splitUnitValue(right);

  if (leftFamily === rightFamily) {
    return `${leftValue}..${rightValue}:${leftFamily}`;
  }

  return `${normalizeNumber(match[1])}..${normalizeNumber(match[2])}:${unit}`;
}

const UNIT_CONVERSIONS: Record<
  string,
  { family: string; factor: number }
> = {
  kg: { family: "mass-g", factor: 1_000 },
  g: { family: "mass-g", factor: 1 },
  mg: { family: "mass-g", factor: 0.001 },
  km: { family: "length-m", factor: 1_000 },
  m: { family: "length-m", factor: 1 },
  cm: { family: "length-m", factor: 0.01 },
  mm: { family: "length-m", factor: 0.001 },
  day: { family: "duration-s", factor: 86_400 },
  hour: { family: "duration-s", factor: 3_600 },
  minute: { family: "duration-s", factor: 60 },
  second: { family: "duration-s", factor: 1 },
};

function stableNumber(value: number) {
  return String(Number(value.toFixed(12)));
}

function normalizeUnitValue(value: number, unit: string) {
  const conversion = UNIT_CONVERSIONS[unit];
  if (!conversion) return `${normalizeNumber(String(value))}:${unit}`;
  return `${conversion.family}:${stableNumber(value * conversion.factor)}`;
}

function splitUnitValue(value: string) {
  const separator = value.indexOf(":");
  if (separator === -1) return ["", value] as const;
  return [value.slice(0, separator), value.slice(separator + 1)] as const;
}

function normalizeQuote(value: string) {
  return toAscii(value)
    .replace(/^[“”‘’"']|[“”‘’"']$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeUrl(value: string) {
  const cleaned = toAscii(value)
    .trim()
    .replace(/[.,;:!?，。；：！？）)\]}]+$/u, "");

  try {
    const parsed = new URL(cleaned);
    const credentials = parsed.username
      ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ""}@`
      : "";
    const pathname =
      parsed.pathname === "/" && !parsed.search && !parsed.hash
        ? ""
        : parsed.pathname;
    return `${parsed.protocol.toLowerCase()}//${credentials}${parsed.host.toLowerCase()}${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return cleaned;
  }
}

const PATTERNS: PatternDefinition[] = [
  {
    kind: "url",
    pattern: /https?:\/\/[^\s<>"'，。；：！？、）)\]}]+/giu,
    normalize: normalizeUrl,
  },
  {
    kind: "email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
    normalize: (value) => compact(value),
  },
  {
    kind: "version",
    pattern:
      /\bv\d+(?:\.\d+){1,3}(?:[-+][0-9A-Z.-]+)?\b|\b\d+\.\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Z.-]+)?\b/giu,
    normalize: (value) => compact(value).replace(/^v/, ""),
  },
  {
    kind: "date",
    pattern:
      /(?:19|20)\d{2}\s*(?:年|[-/.])\s*\d{1,2}(?:\s*(?:月|[-/.])\s*\d{1,2}\s*日?)?|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:19|20)\d{2}\b/giu,
    normalize: normalizeDate,
    validate: validateDate,
  },
  {
    kind: "time",
    pattern:
      /\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s?(?:am|pm))?\b|(?:上午|下午|晚上|凌晨)?\d{1,2}点(?:\d{1,2}分?)?/giu,
    normalize: normalizeTime,
  },
  {
    kind: "money",
    pattern:
      /(?:US\$|C\$|A\$|HK\$|USD|EUR|GBP|CNY|RMB|JPY|CAD|AUD|HKD|[$€£¥￥])\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:k|m|bn|万|亿))?|\d[\d,]*(?:\.\d+)?\s*(?:万|亿)?\s*(?:元|人民币|美元|欧元|英镑|日元|港元|加元|澳元)/giu,
    normalize: normalizeMoney,
  },
  {
    kind: "percentage",
    pattern: /百分之\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:%|％|percent\b)/giu,
    normalize: normalizePercentage,
  },
  {
    kind: "range",
    pattern:
      /(?<![\d.])-?\d+(?:\.\d+)?\s*(?:-|–|—|~|至|到)\s*-?\d+(?:\.\d+)?\s*(?:kg|g|mg|km|cm|mm|mb|gb|tb|kb|ms|人|名|个|次|天|周|月|年|小时|分钟|秒|公里|米|厘米|毫米|公斤|千克|克|毫克|份|页|条|家|台|套|亩)?(?!\d)(?!\.\d)/giu,
    normalize: normalizeRange,
  },
  {
    kind: "measurement",
    pattern:
      /(?<![\d.])-?\d[\d,]*(?:\.\d+)?\s*(?:kilograms?|grams?|milligrams?|kilometers?|meters?|centimeters?|millimeters?|people|persons?|seconds?|minutes?|hours?|days?|weeks?|months?|years?|kg|mg|km|cm|mm|mb|gb|tb|kb|ms|g|m|人|名|个|次|天|周|月|年|小时|分钟|秒|公里|米|厘米|毫米|公斤|千克|克|毫克|份|页|条|家|台|套|亩)(?![A-Z\d])/giu,
    normalize: normalizeMeasurement,
  },
  {
    kind: "quote",
    pattern: /“[^”\n]{1,120}”|‘[^’\n]{1,120}’|"[^"\n]{1,120}"|'[^'\n]{1,120}'/gu,
    normalize: normalizeQuote,
  },
  {
    kind: "number",
    pattern: /(?<![\d.])-?\d[\d,]*(?:\.\d+)?(?!\d)(?!\.\d)/gu,
    normalize: normalizeNumber,
  },
];

function overlaps(start: number, end: number, facts: Fact[]) {
  return facts.some((fact) => start < fact.end && end > fact.start);
}

function makeContext(text: string, start: number, end: number) {
  const radius = 30;
  const before = text.slice(Math.max(0, start - radius), start);
  const value = text.slice(start, end);
  const after = text.slice(end, Math.min(text.length, end + radius));
  return `${start > radius ? "…" : ""}${before}${value}${after}${end + radius < text.length ? "…" : ""}`
    .replace(/\s+/g, " ")
    .trim();
}

export function extractFacts(text: string): Fact[] {
  const facts: Fact[] = [];

  for (const definition of PATTERNS) {
    definition.pattern.lastIndex = 0;
    for (const match of text.matchAll(definition.pattern)) {
      const raw = match[0];
      const start = match.index ?? 0;
      const end = start + raw.length;
      if (overlaps(start, end, facts)) continue;

      facts.push({
        id: `${definition.kind}-${start}-${end}`,
        kind: definition.kind,
        raw,
        normalized: definition.normalize(raw),
        valid: definition.validate?.(raw) ?? true,
        start,
        end,
        context: makeContext(text, start, end),
      });
    }
  }

  return facts.sort((a, b) => a.start - b.start || a.end - b.end);
}

function contextFingerprint(fact: Fact) {
  return toAscii(fact.context)
    .toLowerCase()
    .replace(toAscii(fact.raw).toLowerCase(), "")
    .replace(/[\p{P}\p{S}\p{N}\s]+/gu, "");
}

function bigrams(value: string) {
  if (value.length < 2) return new Set(value ? [value] : []);
  const result = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    result.add(value.slice(index, index + 2));
  }
  return result;
}

function contextSimilarity(left: Fact, right: Fact) {
  const leftPairs = bigrams(contextFingerprint(left));
  const rightPairs = bigrams(contextFingerprint(right));
  if (!leftPairs.size || !rightPairs.size) return 0;
  let overlapCount = 0;
  for (const pair of leftPairs) {
    if (rightPairs.has(pair)) overlapCount += 1;
  }
  return (2 * overlapCount) / (leftPairs.size + rightPairs.size);
}

export function compareFacts(source: string, revision: string): FactComparison {
  const sourceFacts = extractFacts(source);
  const revisionFacts = extractFacts(revision);
  const matchedRevisionIds = new Set<string>();

  const compared: ComparedFact[] = sourceFacts.map((fact) => {
    const exactMatch = revisionFacts.find(
      (candidate) =>
        !matchedRevisionIds.has(candidate.id) &&
        candidate.kind === fact.kind &&
        candidate.normalized === fact.normalized,
    );

    if (exactMatch && fact.valid && exactMatch.valid) {
      matchedRevisionIds.add(exactMatch.id);
      return { ...fact, status: "preserved", matched: exactMatch };
    }

    if (exactMatch) {
      matchedRevisionIds.add(exactMatch.id);
      return {
        ...fact,
        status: "review",
        reviewReason: "invalid",
        possibleMatch: exactMatch,
      };
    }

    const candidates = revisionFacts
      .filter(
        (candidate) =>
          !matchedRevisionIds.has(candidate.id) && candidate.kind === fact.kind,
      )
      .map((candidate) => ({
        candidate,
        score: contextSimilarity(fact, candidate),
      }))
      .sort((a, b) => b.score - a.score);

    const possible = candidates[0];
    const runnerUp = candidates[1];

    if (
      possible &&
      possible.score >= 0.25 &&
      (!runnerUp || possible.score - runnerUp.score >= 0.08)
    ) {
      matchedRevisionIds.add(possible.candidate.id);
      return {
        ...fact,
        status: "review",
        reviewReason: fact.valid ? "changed" : "invalid",
        possibleMatch: possible.candidate,
      };
    }

    return {
      ...fact,
      status: "review",
      reviewReason: fact.valid ? "missing" : "invalid",
    };
  });

  const addedFacts = revisionFacts.filter(
    (fact) => !matchedRevisionIds.has(fact.id),
  );
  const preservedCount = compared.filter(
    (fact) => fact.status === "preserved",
  ).length;
  const reviewCount = compared.length - preservedCount;

  return {
    sourceFacts: compared,
    addedFacts,
    preservedCount,
    reviewCount,
    addedCount: addedFacts.length,
  };
}
