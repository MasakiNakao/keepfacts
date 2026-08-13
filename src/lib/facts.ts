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
  sourceMatch?: Fact;
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

interface ExactDecimal {
  coefficient: bigint;
  scale: number;
}

function normalizeNumericChars(value: string) {
  return toAscii(value)
    .replace(/[−﹣－]/gu, "-")
    .replace(/[＋﹢]/gu, "+")
    .replace(/，/gu, ",");
}

function compactExact(value: string) {
  return normalizeNumericChars(value)
    .toLowerCase()
    .replace(/\s+/gu, "")
    .trim();
}

function canonicalDecimal(
  coefficient: bigint,
  scale: number,
): ExactDecimal {
  if (!Number.isSafeInteger(scale) || scale < 0) {
    throw new RangeError("invalid decimal scale");
  }
  if (coefficient === 0n) return { coefficient: 0n, scale: 0 };
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  return { coefficient, scale };
}

function parseDecimal(value: string): ExactDecimal | null {
  const cleaned = normalizeNumericChars(value).trim();
  const match = cleaned.match(
    /^([+-]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/u,
  );
  if (!match) return null;

  const fraction = match[3] ?? "";
  const digits = `${match[2].replace(/,/gu, "")}${fraction}`;
  const sign = match[1] === "-" ? -1n : 1n;
  return canonicalDecimal(sign * BigInt(digits), fraction.length);
}

function multiplyDecimal(left: ExactDecimal, right: ExactDecimal) {
  return canonicalDecimal(
    left.coefficient * right.coefficient,
    left.scale + right.scale,
  );
}

function decimalKey(value: ExactDecimal) {
  const canonical = canonicalDecimal(value.coefficient, value.scale);
  if (canonical.coefficient === 0n) return "0";

  const negative = canonical.coefficient < 0n;
  let digits = (negative
    ? -canonical.coefficient
    : canonical.coefficient
  ).toString();
  if (canonical.scale > 0) {
    digits = digits.padStart(canonical.scale + 1, "0");
    const point = digits.length - canonical.scale;
    digits = `${digits.slice(0, point)}.${digits.slice(point)}`;
  }
  return `${negative ? "-" : ""}${digits}`;
}

function decimal(coefficient: bigint, scale = 0) {
  return canonicalDecimal(coefficient, scale);
}

const MONEY_FACTORS: Record<string, ExactDecimal> = {
  k: decimal(1_000n),
  m: decimal(1_000_000n),
  bn: decimal(1_000_000_000n),
  万: decimal(10_000n),
  亿: decimal(100_000_000n),
};

function signedDecimalFromToken(value: string) {
  let cleaned = compactExact(value);
  const accounting = cleaned.startsWith("(") && cleaned.endsWith(")");
  if (accounting) cleaned = cleaned.slice(1, -1);
  const match = cleaned.match(
    /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/u,
  );
  if (!match) return null;
  const signs = [...cleaned.matchAll(/[+-]/gu)].map((item) => item[0]);
  if (signs.length > 1 || (accounting && signs.length)) return null;
  return parseDecimal(`${accounting || signs[0] === "-" ? "-" : ""}${match[0]}`);
}

function normalizeNumber(value: string) {
  const parsed = parseDecimal(compactExact(value));
  return parsed ? decimalKey(parsed) : compact(value);
}

function normalizeMoney(value: string) {
  const cleaned = compactExact(value);
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

  const amount = signedDecimalFromToken(cleaned);
  if (!amount) return `${currency}:invalid:${cleaned}`;

  const amountMatch = cleaned.match(
    /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/u,
  );
  const amountEnd = (amountMatch?.index ?? 0) + (amountMatch?.[0].length ?? 0);
  const suffix = amountMatch
    ? cleaned.slice(amountEnd).match(/^(bn|[km]|万|亿)/u)?.[1]
    : undefined;
  const factor = suffix ? MONEY_FACTORS[suffix] : undefined;
  return `${currency}:${decimalKey(factor ? multiplyDecimal(amount, factor) : amount)}`;
}

function normalizePercentage(value: string) {
  const cleaned = compactExact(value)
    .replace("百分之", "")
    .replace(/percent|％|%/g, "");
  const amount = signedDecimalFromToken(cleaned);
  return amount ? decimalKey(amount) : cleaned;
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
    let hour = BigInt(clock[1]);
    if (clock[3] === "pm" && hour < 12n) hour += 12n;
    if (clock[3] === "am" && hour === 12n) hour = 0n;
    return `${hour.toString().padStart(2, "0")}:${clock[2]}`;
  }

  const chinese = cleaned.match(/(上午|下午|晚上|凌晨)?(\d{1,2})点(?:(\d{1,2})分?)?/);
  if (chinese) {
    let hour = BigInt(chinese[2]);
    if ((chinese[1] === "下午" || chinese[1] === "晚上") && hour < 12n) {
      hour += 12n;
    }
    if (chinese[1] === "凌晨" && hour === 12n) hour = 0n;
    return `${hour.toString().padStart(2, "0")}:${String(chinese[3] ?? "0").padStart(2, "0")}`;
  }

  return compact(value);
}

function validateTime(value: string) {
  const cleaned = toAscii(value).toLowerCase().replace(/\s+/g, "");
  const clock = cleaned.match(/^(\d{1,2}):(\d{2})(am|pm)?$/u);
  if (clock) {
    const hour = BigInt(clock[1]);
    const minute = BigInt(clock[2]);
    return clock[3]
      ? hour >= 1n && hour <= 12n && minute <= 59n
      : hour <= 23n && minute <= 59n;
  }

  const chinese = cleaned.match(
    /^(上午|下午|晚上|凌晨)?(\d{1,2})点(?:(\d{1,2})分?)?$/u,
  );
  if (!chinese) return false;
  const hour = BigInt(chinese[2]);
  const minute = BigInt(chinese[3] ?? "0");
  return chinese[1]
    ? hour >= 1n && hour <= 12n && minute <= 59n
    : hour <= 23n && minute <= 59n;
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
  let cleaned = compactExact(value);
  const accounting = cleaned.startsWith("(") && cleaned.endsWith(")");
  if (accounting) cleaned = cleaned.slice(1, -1);
  const match = cleaned.match(
    /^([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)([^\d.,+\-]+)$/u,
  );
  if (!match) return cleaned;
  const amount = parseDecimal(`${accounting ? "-" : ""}${match[1]}`);
  if (!amount) return cleaned;
  const unit = UNIT_ALIASES[match[2]] ?? match[2];
  return normalizeUnitValue(amount, unit);
}

function normalizeRange(value: string) {
  const cleaned = compactExact(value);
  const match = cleaned.match(
    /^([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?:-|–|—|~|至|到)([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(.*)$/u,
  );
  if (!match) return cleaned;
  const leftAmount = parseDecimal(match[1]);
  const rightAmount = parseDecimal(match[2]);
  if (!leftAmount || !rightAmount) return cleaned;
  const unit = UNIT_ALIASES[match[3]] ?? match[3];
  const left = normalizeUnitValue(leftAmount, unit);
  const right = normalizeUnitValue(rightAmount, unit);
  const [leftFamily, leftValue] = splitUnitValue(left);
  const [rightFamily, rightValue] = splitUnitValue(right);

  if (leftFamily === rightFamily) {
    return `${leftValue}..${rightValue}:${leftFamily}`;
  }

  return `${decimalKey(leftAmount)}..${decimalKey(rightAmount)}:${unit}`;
}

const UNIT_CONVERSIONS: Record<
  string,
  { family: string; factor: ExactDecimal }
> = {
  kg: { family: "mass-g", factor: decimal(1_000n) },
  g: { family: "mass-g", factor: decimal(1n) },
  mg: { family: "mass-g", factor: decimal(1n, 3) },
  km: { family: "length-m", factor: decimal(1_000n) },
  m: { family: "length-m", factor: decimal(1n) },
  cm: { family: "length-m", factor: decimal(1n, 2) },
  mm: { family: "length-m", factor: decimal(1n, 3) },
  day: { family: "duration-s", factor: decimal(86_400n) },
  hour: { family: "duration-s", factor: decimal(3_600n) },
  minute: { family: "duration-s", factor: decimal(60n) },
  second: { family: "duration-s", factor: decimal(1n) },
};

function normalizeUnitValue(value: ExactDecimal, unit: string) {
  const conversion = UNIT_CONVERSIONS[unit];
  if (!conversion) return `${decimalKey(value)}:${unit}`;
  return `${conversion.family}:${decimalKey(multiplyDecimal(value, conversion.factor))}`;
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

interface ScanView {
  text: string;
  starts: number[];
  ends: number[];
}

function isAsciiDigit(value: string | undefined) {
  return value !== undefined && /^\d$/u.test(toAscii(value));
}

function isFullWidthGroupingComma(text: string, index: number) {
  if (text[index] !== "，" || !isAsciiDigit(text[index - 1])) return false;
  if (
    !isAsciiDigit(text[index + 1]) ||
    !isAsciiDigit(text[index + 2]) ||
    !isAsciiDigit(text[index + 3]) ||
    isAsciiDigit(text[index + 4])
  ) {
    return false;
  }

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const character = text[cursor];
    if (isAsciiDigit(character) || character === "，") continue;
    if (character === ",") return false;
    break;
  }
  return true;
}

function makeScanView(text: string): ScanView {
  let normalizedText = "";
  const starts: number[] = [];
  const ends: number[] = [];

  for (let index = 0; index < text.length; ) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    const end = index + character.length;
    let normalized = normalizeNumericChars(character);
    if (character === "，" && !isFullWidthGroupingComma(text, index)) {
      normalized = "，";
    }

    normalizedText += normalized;
    for (let offset = 0; offset < normalized.length; offset += 1) {
      starts.push(index);
      ends.push(end);
    }
    index = end;
  }

  return { text: normalizedText, starts, ends };
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
    pattern: /\bv\d+(?:\.\d+){1,3}(?:[-+][0-9A-Z.-]+)?\b/giu,
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
    kind: "version",
    pattern: /\b\d+\.\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Z.-]+)?\b/giu,
    normalize: (value) => compact(value),
  },
  {
    kind: "time",
    pattern:
      /\b\d{1,2}:\d{2}(?:\s?(?:am|pm))?\b|(?:上午|下午|晚上|凌晨)?\d{1,2}点(?:\d{1,2}分?)?/giu,
    normalize: normalizeTime,
    validate: validateTime,
  },
  {
    kind: "money",
    pattern:
      /(?:\((?:(?:US\$|C\$|A\$|HK\$|(?:USD|CAD|AUD|HKD)\s*\$?|EUR|GBP|CNY|RMB|JPY|人民币|美元|欧元|英镑|日元|港元|加元|澳元|[$€£¥￥])\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:[.．]\d+)?(?:\s*(?:k|m|bn|万|亿))?|(?:\d{1,3}(?:,\d{3})+|\d+)(?:[.．]\d+)?\s*(?:万|亿)?\s*(?:元|人民币|美元|欧元|英镑|日元|港元|加元|澳元))\)|[+＋﹢\-−﹣－]?(?:US\$|C\$|A\$|HK\$|(?:USD|CAD|AUD|HKD)\s*\$?|EUR|GBP|CNY|RMB|JPY|人民币|美元|欧元|英镑|日元|港元|加元|澳元|[$€£¥￥])\s*[+＋﹢\-−﹣－]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:[.．]\d+)?(?!,\d)(?:\s*(?:k|m|bn|万|亿))?|[+＋﹢\-−﹣－]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:[.．]\d+)?(?!,\d)\s*(?:万|亿)?\s*(?:元|人民币|美元|欧元|英镑|日元|港元|加元|澳元))/giu,
    normalize: normalizeMoney,
  },
  {
    kind: "percentage",
    pattern:
      /(?:\((?:\d{1,3}(?:,\d{3})+|\d+)(?:[.．]\d+)?\s*(?:%|％|percent\b)\)|百分之\s*[+＋﹢\-−﹣－]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:[.．]\d+)?|[+＋﹢\-−﹣－]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:[.．]\d+)?\s*(?:%|％|percent\b))/giu,
    normalize: normalizePercentage,
  },
  {
    kind: "range",
    pattern:
      /(?<![\d.,])[+＋﹢\-−﹣－]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:[.．]\d+)?\s*(?:-|–|—|~|至|到)\s*[+＋﹢\-−﹣－]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:[.．]\d+)?\s*(?:kg|g|mg|km|cm|mm|mb|gb|tb|kb|ms|人|名|个|次|天|周|月|年|小时|分钟|秒|公里|米|厘米|毫米|公斤|千克|克|毫克|份|页|条|家|台|套|亩)?(?!\d)(?![.．]\d)/giu,
    normalize: normalizeRange,
  },
  {
    kind: "measurement",
    pattern:
      /(?<![\d.,])(?:\([+＋﹢\-−﹣－]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:[.．]\d+)?\s*(?:kilograms?|grams?|milligrams?|kilometers?|meters?|centimeters?|millimeters?|people|persons?|seconds?|minutes?|hours?|days?|weeks?|months?|years?|kg|mg|km|cm|mm|mb|gb|tb|kb|ms|g|m|人|名|个|次|天|周|月|年|小时|分钟|秒|公里|米|厘米|毫米|公斤|千克|克|毫克|份|页|条|家|台|套|亩)\)|[+＋﹢\-−﹣－]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:[.．]\d+)?(?!,\d)\s*(?:kilograms?|grams?|milligrams?|kilometers?|meters?|centimeters?|millimeters?|people|persons?|seconds?|minutes?|hours?|days?|weeks?|months?|years?|kg|mg|km|cm|mm|mb|gb|tb|kb|ms|g|m|人|名|个|次|天|周|月|年|小时|分钟|秒|公里|米|厘米|毫米|公斤|千克|克|毫克|份|页|条|家|台|套|亩))(?![A-Z\d])/giu,
    normalize: normalizeMeasurement,
  },
  {
    kind: "quote",
    pattern:
      /“[^”\n]{1,120}”|‘[^’\n]{1,120}’|"[^"\n]{1,120}"|(?<![\p{L}\p{N}])'[^'\n]{1,120}'(?![\p{L}\p{N}])/gu,
    normalize: normalizeQuote,
  },
  {
    kind: "number",
    pattern:
      /(?<![\d.,])[+＋﹢\-−﹣－]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?!\d)(?!\.\d)(?!,\d)/gu,
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
  const scan = makeScanView(text);

  for (const definition of PATTERNS) {
    definition.pattern.lastIndex = 0;
    for (const match of scan.text.matchAll(definition.pattern)) {
      const scanStart = match.index ?? 0;
      const scanEnd = scanStart + match[0].length;
      const start = scan.starts[scanStart] ?? 0;
      const end = scan.ends[scanEnd - 1] ?? start;
      const raw = text.slice(start, end);
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

function nearbyTokenWeights(text: string, fact: Fact) {
  const radius = 48;
  const windowStart = Math.max(0, fact.start - radius);
  const windowEnd = Math.min(text.length, fact.end + radius);
  const window = toAscii(text.slice(windowStart, windowEnd)).toLowerCase();
  const factStart = fact.start - windowStart;
  const factEnd = fact.end - windowStart;
  const stopwords = new Set([
    "a",
    "an",
    "and",
    "are",
    "at",
    "by",
    "for",
    "from",
    "group",
    "groups",
    "has",
    "have",
    "in",
    "is",
    "of",
    "on",
    "or",
    "people",
    "person",
    "team",
    "teams",
    "the",
    "to",
    "user",
    "users",
    "was",
    "were",
    "与",
    "为",
    "人",
    "及",
    "名",
    "和",
    "是",
    "有",
    "的",
    "组",
  ]);
  const tokens: Array<{
    key: string;
    distance: number;
  }> = [];

  for (const match of window.matchAll(/[\p{L}\p{N}]+/gu)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (start < factEnd && end > factStart) continue;
    if (/^\d+$/u.test(match[0])) continue;
    if (stopwords.has(match[0])) continue;

    const side = end <= factStart ? "left" : start >= factEnd ? "right" : "";
    if (!side) continue;
    const distance =
      side === "left" ? factStart - end : start - factEnd;
    tokens.push({ key: `${side}:${match[0]}`, distance });
  }

  const weights = new Map<string, number>();
  for (const side of ["left", "right"]) {
    for (const token of tokens
      .filter(({ key }) => key.startsWith(`${side}:`))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 3)) {
      const weight = 1 / (1 + token.distance / 8);
      weights.set(token.key, Math.max(weights.get(token.key) ?? 0, weight));
    }
  }
  return weights;
}

function localSegmentFingerprint(text: string, fact: Fact) {
  const boundary = /[。！？.!?；;，,\/|、•·—–\t\n]|\band\b|和/giu;
  const before = text.slice(0, fact.start);
  const after = text.slice(fact.end);
  let start = 0;
  for (const match of before.matchAll(boundary)) {
    start = (match.index ?? 0) + match[0].length;
  }
  boundary.lastIndex = 0;
  const nextBoundary = boundary.exec(after);
  const end = nextBoundary
    ? fact.end + (nextBoundary.index ?? 0)
    : text.length;
  return textFingerprint(
    `${text.slice(start, fact.start)} ${text.slice(fact.end, end)}`,
  );
}

function weightedDice(
  left: Map<string, number>,
  right: Map<string, number>,
) {
  let leftWeight = 0;
  let rightWeight = 0;
  let overlapWeight = 0;
  for (const value of left.values()) leftWeight += value;
  for (const value of right.values()) rightWeight += value;
  if (!leftWeight || !rightWeight) return 0;
  for (const [token, value] of left) {
    overlapWeight += Math.min(value, right.get(token) ?? 0);
  }
  return (2 * overlapWeight) / (leftWeight + rightWeight);
}

interface ContextFeatures {
  broadPairs: Set<string>;
  localPairs: Set<string>;
  nearbyWeights: Map<string, number>;
}

function contextFeatures(text: string, fact: Fact): ContextFeatures {
  return {
    broadPairs: bigrams(contextFingerprint(fact)),
    localPairs: bigrams(localSegmentFingerprint(text, fact)),
    nearbyWeights: nearbyTokenWeights(text, fact),
  };
}

function diceSets(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const value of left) if (right.has(value)) overlap += 1;
  return (2 * overlap) / (left.size + right.size);
}

function contextSimilarity(
  left: ContextFeatures,
  right: ContextFeatures,
) {
  const leftPairs = left.broadPairs;
  const rightPairs = right.broadPairs;
  let broadScore = 0;
  let overlapCount = 0;
  for (const pair of leftPairs) {
    if (rightPairs.has(pair)) overlapCount += 1;
  }
  if (leftPairs.size && rightPairs.size) {
    broadScore = (2 * overlapCount) / (leftPairs.size + rightPairs.size);
  }

  const nearbyScore = weightedDice(left.nearbyWeights, right.nearbyWeights);
  const localScore = diceSets(left.localPairs, right.localPairs);

  return Math.max(localScore, nearbyScore * 0.9, broadScore * 0.75);
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

    const sourceFeatures = sources.map((fact) =>
      contextFeatures(sourceText, fact),
    );
    const revisionFeatures = revisions.map((fact) =>
      contextFeatures(revisionText, fact),
    );

    const contextScores = sourceFeatures.map((sourceFeature) =>
      revisionFeatures.map((revisionFeature) =>
        contextSimilarity(sourceFeature, revisionFeature),
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
  const requiredStart = required.match(/^./u)?.[0] ?? "";
  const requiredEnd = required.match(/.$/u)?.[0] ?? "";
  const requiresBoundary = (character: string) =>
    /[\p{L}\p{N}\p{M}]/u.test(character) &&
    !/\p{Script=Han}/u.test(character);
  const isWordCharacter = (character: string) =>
    /[\p{L}\p{N}\p{M}]/u.test(character);
  const requiresLeftBoundary = requiresBoundary(requiredStart);
  const requiresRightBoundary = requiresBoundary(requiredEnd);

  let start = revision.indexOf(required);
  while (start !== -1) {
    const before = revision.slice(0, start).match(/.$/u)?.[0] ?? "";
    const after = revision.slice(start + required.length).match(/^./u)?.[0] ?? "";
    const leftMatches =
      !requiresLeftBoundary || !isWordCharacter(before);
    const rightMatches =
      !requiresRightBoundary || !isWordCharacter(after);

    if (leftMatches && rightMatches) return start;
    start = revision.indexOf(required, start + 1);
  }

  return -1;
}

function findRequiredInText(text: string, normalized: string) {
  const normalizedText = normalizeRequired(text);
  const normalizedStart = findRequired(normalizedText, normalized);
  if (normalizedStart === -1) return undefined;

  let collapsed = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let pendingSpaceStart: number | undefined;
  const graphemes = new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(text);
  for (const { segment, index } of graphemes) {
    const end = index + segment.length;
    if (/^\s+$/u.test(segment)) {
      if (collapsed && !collapsed.endsWith(" ")) pendingSpaceStart ??= index;
      continue;
    }
    if (pendingSpaceStart !== undefined) {
      collapsed += " ";
      starts.push(pendingSpaceStart);
      ends.push(index);
      pendingSpaceStart = undefined;
    }
    const normalizedSegment = normalizeRequired(segment);
    collapsed += normalizedSegment;
    for (let offset = 0; offset < normalizedSegment.length; offset += 1) {
      starts.push(index);
      ends.push(end);
    }
  }
  const rawStart = starts[normalizedStart] ?? 0;
  const rawEnd = ends[normalizedStart + normalized.length - 1] ?? rawStart;
  return { start: rawStart, end: rawEnd };
}

function requiredLines(required: string) {
  const seen = new Set<string>();
  return required
    .split(/\r?\n/u)
    .map((raw) => ({ raw: raw.trim(), normalized: normalizeRequired(raw) }))
    .filter(({ raw }) => Boolean(raw))
    .filter(({ normalized }) => {
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

export function countRequiredNotInSource(source: string, required: string) {
  const normalizedSource = normalizeRequired(
    source.replace(/\s+/g, " ").trim(),
  );
  return requiredLines(required).filter(
    ({ normalized }) => findRequired(normalizedSource, normalized) === -1,
  ).length;
}

function compareRequiredFacts(
  required: string,
  source: string,
  revision: string,
): ComparedFact[] {
  return requiredLines(required).map(({ raw, normalized }, index) => {
      const sourceOccurrence = findRequiredInText(source, normalized);
      const revisionOccurrence = findRequiredInText(revision, normalized);
      const presentInSource = sourceOccurrence !== undefined;
      const preserved = revisionOccurrence !== undefined;
      const sourceStart = sourceOccurrence?.start ?? 0;
      const sourceEnd = sourceOccurrence?.end ?? raw.length;
      const revisionStart = revisionOccurrence?.start ?? 0;
      const revisionEnd = revisionOccurrence?.end ?? raw.length;
      const base: Fact = {
        id: `required-${index}-${normalized}`,
        kind: "required",
        raw,
        normalized,
        valid: true,
        start: presentInSource ? sourceStart : 0,
        end: sourceEnd,
        context: presentInSource
          ? makeContext(source, sourceStart, sourceEnd)
          : raw,
      };
      const sourceMatch = presentInSource
        ? { ...base, raw: source.slice(sourceStart, sourceEnd) }
        : undefined;

      if (!presentInSource) {
        return {
          ...base,
          status: "review",
          reviewReason: "not-in-source",
          matched: preserved
            ? {
                ...base,
                id: `required-revision-${index}-${normalized}`,
                raw: revision.slice(revisionStart, revisionEnd),
                start: revisionStart,
                end: revisionEnd,
                context: makeContext(revision, revisionStart, revisionEnd),
              }
            : undefined,
        };
      }

      if (!preserved) {
        return {
          ...base,
          status: "review",
          reviewReason: "missing",
          sourceMatch,
        };
      }

      return {
        ...base,
        status: "preserved",
        sourceMatch,
        matched: {
          ...base,
          id: `required-match-${index}-${normalized}`,
          raw: revision.slice(revisionStart, revisionEnd),
          start: revisionStart,
          end: revisionEnd,
          context: makeContext(revision, revisionStart, revisionEnd),
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
