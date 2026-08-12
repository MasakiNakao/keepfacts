export type FactKind =
  | "required"
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
  reviewReason?: "changed" | "missing" | "invalid" | "not-in-source";
  matched?: Fact;
  possibleMatch?: Fact;
}

export interface FactComparison {
  sourceFacts: ComparedFact[];
  requiredFacts: ComparedFact[];
  addedFacts: Fact[];
  preservedCount: number;
  reviewCount: number;
  addedCount: number;
  requiredCount: number;
  requiredPreservedCount: number;
  requiredMissingCount: number;
  requiredNotInSourceCount: number;
  requiredCheckableCount: number;
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
      /(?:US\$|C\$|A\$|HK\$|USD|EUR|GBP|CNY|RMB|JPY|CAD|AUD|HKD|[$€£¥￥])\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?!,\d)(?:\s*(?:k|m|bn|万|亿))?|(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?!,\d)\s*(?:万|亿)?\s*(?:元|人民币|美元|欧元|英镑|日元|港元|加元|澳元)/giu,
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
      /(?<![\d.,])-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?!,\d)\s*(?:kilograms?|grams?|milligrams?|kilometers?|meters?|centimeters?|millimeters?|people|persons?|seconds?|minutes?|hours?|days?|weeks?|months?|years?|kg|mg|km|cm|mm|mb|gb|tb|kb|ms|g|m|人|名|个|次|天|周|月|年|小时|分钟|秒|公里|米|厘米|毫米|公斤|千克|克|毫克|份|页|条|家|台|套|亩)(?![A-Z\d])/giu,
    normalize: normalizeMeasurement,
  },
  {
    kind: "quote",
    pattern: /“[^”\n]{1,120}”|‘[^’\n]{1,120}’|"[^"\n]{1,120}"|'[^'\n]{1,120}'/gu,
    normalize: normalizeQuote,
  },
  {
    kind: "number",
    pattern:
      /(?<![\d.,])-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?!\d)(?!\.\d)(?!,\d)/gu,
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

function textFingerprint(value: string) {
  return toAscii(value)
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function contextFingerprint(fact: Fact) {
  const normalizedContext = toAscii(fact.context).toLowerCase();
  const normalizedRaw = toAscii(fact.raw).toLowerCase();
  return textFingerprint(normalizedContext.replace(normalizedRaw, ""));
}

function bigrams(value: string) {
  if (value.length < 2) return new Set(value ? [value] : []);
  const result = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    result.add(value.slice(index, index + 2));
  }
  return result;
}

function fingerprintSimilarity(left: string, right: string) {
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (!leftPairs.size || !rightPairs.size) return 0;
  let overlapCount = 0;
  for (const pair of leftPairs) {
    if (rightPairs.has(pair)) overlapCount += 1;
  }
  return (2 * overlapCount) / (leftPairs.size + rightPairs.size);
}

function nearbyContext(text: string, fact: Fact) {
  const leftWindow = text.slice(Math.max(0, fact.start - 64), fact.start);
  const rightWindow = text.slice(fact.end, Math.min(text.length, fact.end + 64));
  let leftBoundary = -1;
  for (let index = leftWindow.length - 1; index >= 0; index -= 1) {
    if (/[。！？.!?；;，,\/|\n]/u.test(leftWindow[index])) {
      leftBoundary = index;
      break;
    }
  }
  let rightBoundary = rightWindow.length;
  for (let index = 0; index < rightWindow.length; index += 1) {
    if (/[。！？.!?；;，,\/|\n]/u.test(rightWindow[index])) {
      rightBoundary = index;
      break;
    }
  }

  return {
    before: textFingerprint(leftWindow.slice(leftBoundary + 1)),
    after: textFingerprint(rightWindow.slice(0, rightBoundary)),
  };
}

function contextSimilarity(
  left: Fact,
  right: Fact,
  leftText?: string,
  rightText?: string,
) {
  const leftPairs = bigrams(contextFingerprint(left));
  const rightPairs = bigrams(contextFingerprint(right));
  let broadScore = 0;
  let overlapCount = 0;
  for (const pair of leftPairs) {
    if (rightPairs.has(pair)) overlapCount += 1;
  }
  if (leftPairs.size && rightPairs.size) {
    broadScore = (2 * overlapCount) / (leftPairs.size + rightPairs.size);
  }

  if (leftText === undefined || rightText === undefined) return broadScore;

  const leftNearby = nearbyContext(leftText, left);
  const rightNearby = nearbyContext(rightText, right);
  const nearbyScore = fingerprintSimilarity(
    `${leftNearby.before}${leftNearby.after}`,
    `${rightNearby.before}${rightNearby.after}`,
  );

  return nearbyScore * 0.85 + broadScore * 0.15;
}

function relativePosition(fact: Fact, textLength: number) {
  if (textLength <= 0) return 0;
  return (fact.start + fact.end) / 2 / textLength;
}

function maximizeAssignment(scores: number[][]) {
  const rowCount = scores.length;
  const columnCount = scores[0]?.length ?? 0;
  const rowPotential = Array(rowCount + 1).fill(0) as number[];
  const columnPotential = Array(columnCount + 1).fill(0) as number[];
  const matchedRow = Array(columnCount + 1).fill(0) as number[];
  const previousColumn = Array(columnCount + 1).fill(0) as number[];

  for (let row = 1; row <= rowCount; row += 1) {
    matchedRow[0] = row;
    let currentColumn = 0;
    const minimumCost = Array(columnCount + 1).fill(
      Number.POSITIVE_INFINITY,
    ) as number[];
    const used = Array(columnCount + 1).fill(false) as boolean[];

    do {
      used[currentColumn] = true;
      const currentRow = matchedRow[currentColumn];
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;

      for (let column = 1; column <= columnCount; column += 1) {
        if (used[column]) continue;
        const cost =
          -scores[currentRow - 1][column - 1] -
          rowPotential[currentRow] -
          columnPotential[column];

        if (cost < minimumCost[column]) {
          minimumCost[column] = cost;
          previousColumn[column] = currentColumn;
        }
        if (minimumCost[column] < delta) {
          delta = minimumCost[column];
          nextColumn = column;
        }
      }

      for (let column = 0; column <= columnCount; column += 1) {
        if (used[column]) {
          rowPotential[matchedRow[column]] += delta;
          columnPotential[column] -= delta;
        } else {
          minimumCost[column] -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (matchedRow[currentColumn] !== 0);

    do {
      const nextColumn = previousColumn[currentColumn];
      matchedRow[currentColumn] = matchedRow[nextColumn];
      currentColumn = nextColumn;
    } while (currentColumn !== 0);
  }

  const assignment = Array(rowCount).fill(-1) as number[];
  for (let column = 1; column <= columnCount; column += 1) {
    if (matchedRow[column] > 0) {
      assignment[matchedRow[column] - 1] = column - 1;
    }
  }
  return assignment;
}

function confidentBestIndex(scores: number[]) {
  const ranked = scores
    .map((score, index) => ({ index, score }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const best = ranked[0];
  const runnerUp = ranked[1];

  return best &&
    best.score >= 0.25 &&
    (!runnerUp || best.score - runnerUp.score >= 0.08)
    ? best.index
    : -1;
}

function pairFacts(
  sourceFacts: Fact[],
  revisionFacts: Fact[],
  sourceText: string,
  revisionText: string,
) {
  const pairs = new Map<string, Fact>();
  const kinds = new Set(sourceFacts.map((fact) => fact.kind));

  for (const kind of kinds) {
    const sources = sourceFacts.filter((fact) => fact.kind === kind);
    const revisions = revisionFacts.filter((fact) => fact.kind === kind);
    if (!revisions.length) continue;

    const contextScores = sources.map((sourceFact) =>
      revisions.map((revisionFact) =>
        contextSimilarity(sourceFact, revisionFact, sourceText, revisionText),
      ),
    );

    const confidentRevisionIndexes = contextScores.map(confidentBestIndex);
    const confidentSourceIndexes = revisions.map((_, revisionIndex) =>
      confidentBestIndex(
        contextScores.map((row) => row[revisionIndex] ?? 0),
      ),
    );
    const pairLimit = Math.min(sources.length, revisions.length);
    const base = pairLimit + 1;
    const highBonus = base ** 3;
    const exactBonus = base ** 2;
    const forbidden = -(highBonus * base + exactBonus);
    const scores = sources.map((sourceFact, sourceIndex) => [
      ...revisions.map((revisionFact, revisionIndex) => {
        const contextConfident =
          confidentRevisionIndexes[sourceIndex] === revisionIndex &&
          confidentSourceIndexes[revisionIndex] === sourceIndex;
        const exact = sourceFact.normalized === revisionFact.normalized;
        if (!contextConfident && !exact) return forbidden;

        const positionScore =
          1 -
          Math.min(
            1,
            Math.abs(
              relativePosition(sourceFact, sourceText.length) -
                relativePosition(revisionFact, revisionText.length),
            ),
          );
        const stableTieBreak =
          positionScore * 0.001 +
          (revisions.length - revisionIndex) * 0.0000001;

        return (
          (contextConfident ? highBonus : 0) +
          (exact ? exactBonus : 0) +
          contextScores[sourceIndex][revisionIndex] * base +
          stableTieBreak
        );
      }),
      ...sources.map(() => 0),
    ]);

    for (const [sourceIndex, columnIndex] of maximizeAssignment(scores).entries()) {
      if (columnIndex < revisions.length && scores[sourceIndex][columnIndex] > 0) {
        pairs.set(sources[sourceIndex].id, revisions[columnIndex]);
      }
    }
  }

  return pairs;
}

function normalizeRequired(value: string) {
  return toAscii(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function findRequired(revision: string, required: string) {
  let start = revision.indexOf(required);
  while (start !== -1) {
    const before = revision[start - 1] ?? "";
    const after = revision[start + required.length] ?? "";
    const requiresLeftBoundary = /^[a-z0-9]/i.test(required);
    const requiresRightBoundary = /[a-z0-9]$/i.test(required);
    const leftMatches =
      !requiresLeftBoundary || !/[a-z0-9]/i.test(before);
    const rightMatches =
      !requiresRightBoundary || !/[a-z0-9]/i.test(after);

    if (leftMatches && rightMatches) return start;
    start = revision.indexOf(required, start + 1);
  }

  return -1;
}

function compareRequiredFacts(
  required: string,
  source: string,
  revision: string,
): ComparedFact[] {
  const sourceContextText = source.replace(/\s+/g, " ").trim();
  const revisionContextText = revision.replace(/\s+/g, " ").trim();
  const normalizedSource = normalizeRequired(sourceContextText);
  const normalizedRevision = normalizeRequired(revisionContextText);
  const seen = new Set<string>();

  return required
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((raw) => {
      const normalized = normalizeRequired(raw);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .map((raw, index) => {
      const normalized = normalizeRequired(raw);
      const sourceStart = findRequired(normalizedSource, normalized);
      const revisionStart = findRequired(normalizedRevision, normalized);
      const presentInSource = sourceStart !== -1;
      const preserved = revisionStart !== -1;
      const base: Fact = {
        id: `required-${index}-${normalized}`,
        kind: "required",
        raw,
        normalized,
        valid: true,
        start: presentInSource ? sourceStart : 0,
        end: presentInSource ? sourceStart + normalized.length : raw.length,
        context: presentInSource
          ? makeContext(
              sourceContextText,
              sourceStart,
              sourceStart + normalized.length,
            )
          : raw,
      };

      if (!presentInSource) {
        return {
          ...base,
          status: "review",
          reviewReason: "not-in-source",
          matched: preserved
            ? {
                ...base,
                id: `required-revision-${index}-${normalized}`,
                start: revisionStart,
                end: revisionStart + normalized.length,
                context: makeContext(
                  revisionContextText,
                  revisionStart,
                  revisionStart + normalized.length,
                ),
              }
            : undefined,
        };
      }

      if (!preserved) {
        return {
          ...base,
          status: "review",
          reviewReason: "missing",
        };
      }

      return {
        ...base,
        status: "preserved",
        matched: {
          ...base,
          id: `required-match-${index}-${normalized}`,
          start: revisionStart,
          end: revisionStart + normalized.length,
          context: makeContext(
            revisionContextText,
            revisionStart,
            revisionStart + normalized.length,
          ),
        },
      };
    });
}

export function compareFacts(
  source: string,
  revision: string,
  required = "",
): FactComparison {
  const sourceFacts = extractFacts(source);
  const revisionFacts = extractFacts(revision);
  const matchedRevisionIds = new Set<string>();
  const pairs = pairFacts(sourceFacts, revisionFacts, source, revision);

  const compared: ComparedFact[] = sourceFacts.map((fact) => {
    const match = pairs.get(fact.id);

    if (
      match &&
      fact.normalized === match.normalized &&
      fact.valid &&
      match.valid
    ) {
      matchedRevisionIds.add(match.id);
      return { ...fact, status: "preserved", matched: match };
    }

    if (match) {
      matchedRevisionIds.add(match.id);
      return {
        ...fact,
        status: "review",
        reviewReason: fact.valid && match.valid ? "changed" : "invalid",
        possibleMatch: match,
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
  const requiredFacts = compareRequiredFacts(required, source, revision);
  const preservedCount = compared.filter(
    (fact) => fact.status === "preserved",
  ).length;
  const reviewCount = compared.length - preservedCount;
  const requiredPreservedCount = requiredFacts.filter(
    (fact) => fact.status === "preserved",
  ).length;
  const requiredMissingCount = requiredFacts.filter(
    (fact) => fact.reviewReason === "missing",
  ).length;
  const requiredNotInSourceCount = requiredFacts.filter(
    (fact) => fact.reviewReason === "not-in-source",
  ).length;
  const requiredCheckableCount =
    requiredFacts.length - requiredNotInSourceCount;

  return {
    sourceFacts: compared,
    requiredFacts,
    addedFacts,
    preservedCount,
    reviewCount,
    addedCount: addedFacts.length,
    requiredCount: requiredFacts.length,
    requiredPreservedCount,
    requiredMissingCount,
    requiredNotInSourceCount,
    requiredCheckableCount,
  };
}
