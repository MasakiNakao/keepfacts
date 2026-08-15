import type { FactComparison } from "./facts.ts";
import {
  getKeepFactsInputLimitViolation,
  KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH,
  KEEPFACTS_MAX_REQUIRED_ITEMS,
  KEEPFACTS_MAX_REQUIRED_LENGTH,
  KEEPFACTS_MAX_TEXT_LENGTH,
  type KeepFactsInput,
  type KeepFactsInputLimitViolation,
} from "./input-limits.ts";
import {
  getReviewItems,
  type ReviewDecision,
  type ReviewRecord,
  type ReviewRecords,
} from "./review.ts";

export const KEEPFACTS_SESSION_FORMAT = "keepfacts.session" as const;
export const KEEPFACTS_SESSION_SCHEMA_VERSION = 1 as const;
export const KEEPFACTS_SESSION_MAX_BYTES = 5 * 1024 * 1024;
// Schema-v1 compatibility aliases. Keep these exports stable for consumers that
// adopted the original session-specific names.
export const KEEPFACTS_SESSION_MAX_TEXT_LENGTH = KEEPFACTS_MAX_TEXT_LENGTH;
export const KEEPFACTS_SESSION_MAX_REQUIRED_LENGTH =
  KEEPFACTS_MAX_REQUIRED_LENGTH;
export const KEEPFACTS_SESSION_MAX_REQUIRED_ITEMS = KEEPFACTS_MAX_REQUIRED_ITEMS;
export const KEEPFACTS_SESSION_MAX_REQUIRED_ITEM_LENGTH =
  KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH;
export const KEEPFACTS_SESSION_MAX_REVIEW_RECORDS = 3_000;
export const KEEPFACTS_SESSION_MAX_REVIEW_KEY_LENGTH = 1_024;
export const KEEPFACTS_SESSION_MAX_REVIEW_TEXT_LENGTH = 500;

const SEMANTIC_VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const COMMIT_SHA_PATTERN = /^(?:local|[0-9a-f]{7,40})$/iu;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const REVIEW_DECISIONS = new Set<ReviewDecision>([
  "confirmed",
  "accepted",
  "ignored",
]);

export type KeepFactsSessionLocale = "zh" | "en";

export type KeepFactsSessionInput = KeepFactsInput;

export interface KeepFactsSessionReviewRecord extends ReviewRecord {
  key: string;
}

export interface KeepFactsSessionV1 {
  format: typeof KEEPFACTS_SESSION_FORMAT;
  schemaVersion: typeof KEEPFACTS_SESSION_SCHEMA_VERSION;
  exportedAt: string;
  generator: {
    appVersion: string;
    commitSha: string;
  };
  privacy: {
    containsFullText: true;
    encrypted: false;
  };
  locale: KeepFactsSessionLocale;
  editor: KeepFactsSessionInput;
  result: null | {
    input: KeepFactsSessionInput;
    reviewRecords: KeepFactsSessionReviewRecord[];
  };
}

export type KeepFactsSessionErrorCode =
  | "too-large"
  | "invalid-json"
  | "invalid-type"
  | "unknown-field"
  | "missing-field"
  | "invalid-format"
  | "unsupported-schema"
  | "invalid-value"
  | "limit-exceeded"
  | "duplicate-review-key";

export class KeepFactsSessionError extends Error {
  readonly code: KeepFactsSessionErrorCode;
  readonly path: string;

  constructor(code: KeepFactsSessionErrorCode, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "KeepFactsSessionError";
    this.code = code;
    this.path = path;
  }
}

export interface ReconciledKeepFactsReviewRecords {
  reviewRecords: ReviewRecords;
  restoredCount: number;
  discardedCount: number;
}

type UnknownRecord = Record<string, unknown>;

function encodedByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function fail(
  code: KeepFactsSessionErrorCode,
  path: string,
  message: string,
): never {
  throw new KeepFactsSessionError(code, path, message);
}

function isPlainObject(value: unknown): value is UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireObject(value: unknown, path: string): UnknownRecord {
  if (!isPlainObject(value)) {
    fail("invalid-type", path, "expected an object");
  }
  return value;
}

function requireExactFields(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[],
  path: string,
) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail("unknown-field", `${path}.${key}`, "field is not allowed");
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail("missing-field", `${path}.${key}`, "field is required");
    }
  }
}

function requireString(value: unknown, path: string) {
  if (typeof value !== "string") {
    fail("invalid-type", path, "expected a string");
  }
  return value;
}

function requireLimitedString(
  value: unknown,
  path: string,
  maximumLength: number,
  allowEmpty = true,
) {
  const result = requireString(value, path);
  if (!allowEmpty && result.length === 0) {
    fail("invalid-value", path, "must not be empty");
  }
  if (result.length > maximumLength) {
    fail(
      "limit-exceeded",
      path,
      `must not exceed ${maximumLength} UTF-16 code units`,
    );
  }
  return result;
}

function normalizeReviewText(value: unknown, path: string) {
  const result = requireLimitedString(
    value,
    path,
    KEEPFACTS_SESSION_MAX_REVIEW_TEXT_LENGTH,
  );
  if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(result)) {
    fail(
      "invalid-value",
      path,
      "control characters other than LF and TAB are not allowed",
    );
  }
  const normalized = result.trim();
  return normalized || undefined;
}

function inputLimitMessage(violation: KeepFactsInputLimitViolation) {
  switch (violation.reason) {
    case "text-length":
    case "required-length":
      return `must not exceed ${violation.maximum} UTF-16 code units`;
    case "required-items":
      return `must not contain more than ${violation.maximum} non-empty items`;
    case "required-item-length":
      return `each item must not exceed ${violation.maximum} UTF-16 code units`;
  }
}

function validateInput(value: unknown, path: string): KeepFactsSessionInput {
  const input = requireObject(value, path);
  requireExactFields(input, ["source", "revision", "required"], [], path);
  const candidate = {
    source: requireString(input.source, `${path}.source`),
    revision: requireString(input.revision, `${path}.revision`),
    required: requireString(input.required, `${path}.required`),
  };
  const violation = getKeepFactsInputLimitViolation(candidate);
  if (violation) {
    fail(
      "limit-exceeded",
      `${path}.${violation.field}`,
      inputLimitMessage(violation),
    );
  }
  return candidate;
}

function validateReviewRecord(
  value: unknown,
  path: string,
): KeepFactsSessionReviewRecord {
  const record = requireObject(value, path);
  requireExactFields(
    record,
    ["key"],
    ["decision", "note", "expectedFix"],
    path,
  );
  const key = requireLimitedString(
    record.key,
    `${path}.key`,
    KEEPFACTS_SESSION_MAX_REVIEW_KEY_LENGTH,
    false,
  );
  let decision: ReviewDecision | undefined;
  if (Object.prototype.hasOwnProperty.call(record, "decision")) {
    const candidate = requireString(record.decision, `${path}.decision`);
    if (!REVIEW_DECISIONS.has(candidate as ReviewDecision)) {
      fail("invalid-value", `${path}.decision`, "unknown review decision");
    }
    decision = candidate as ReviewDecision;
  }
  const note = Object.prototype.hasOwnProperty.call(record, "note")
    ? normalizeReviewText(record.note, `${path}.note`)
    : undefined;
  const expectedFix = Object.prototype.hasOwnProperty.call(record, "expectedFix")
    ? normalizeReviewText(record.expectedFix, `${path}.expectedFix`)
    : undefined;

  return {
    key,
    ...(decision !== undefined ? { decision } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(expectedFix !== undefined ? { expectedFix } : {}),
  };
}

function validateReviewRecords(
  value: unknown,
  path: string,
): KeepFactsSessionReviewRecord[] {
  if (!Array.isArray(value)) {
    fail("invalid-type", path, "expected an array");
  }
  if (value.length > KEEPFACTS_SESSION_MAX_REVIEW_RECORDS) {
    fail(
      "limit-exceeded",
      path,
      `must not contain more than ${KEEPFACTS_SESSION_MAX_REVIEW_RECORDS} records`,
    );
  }

  const keys = new Set<string>();
  const records: KeepFactsSessionReviewRecord[] = [];
  value.forEach((item, index) => {
    const record = validateReviewRecord(item, `${path}[${index}]`);
    if (keys.has(record.key)) {
      fail(
        "duplicate-review-key",
        `${path}[${index}].key`,
        "review key must be unique",
      );
    }
    keys.add(record.key);
    if (
      record.decision !== undefined ||
      record.note !== undefined ||
      record.expectedFix !== undefined
    ) {
      records.push(record);
    }
  });
  return records.sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0
  );
}

function validateExportedAt(value: unknown, path: string) {
  const result = requireString(value, path);
  if (!UTC_ISO_PATTERN.test(result)) {
    fail("invalid-value", path, "expected an ISO 8601 UTC timestamp");
  }
  const parsed = new Date(result);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== result) {
    fail("invalid-value", path, "expected a valid ISO 8601 UTC timestamp");
  }
  return result;
}

function validateGenerator(value: unknown, path: string) {
  const generator = requireObject(value, path);
  requireExactFields(generator, ["appVersion", "commitSha"], [], path);
  const appVersion = requireLimitedString(
    generator.appVersion,
    `${path}.appVersion`,
    64,
    false,
  );
  if (!SEMANTIC_VERSION_PATTERN.test(appVersion)) {
    fail("invalid-value", `${path}.appVersion`, "expected a semantic version");
  }
  const commitSha = requireLimitedString(
    generator.commitSha,
    `${path}.commitSha`,
    40,
    false,
  );
  if (!COMMIT_SHA_PATTERN.test(commitSha)) {
    fail(
      "invalid-value",
      `${path}.commitSha`,
      'expected "local" or a 7-40 digit hexadecimal commit SHA',
    );
  }
  return { appVersion, commitSha };
}

function validatePrivacy(value: unknown, path: string) {
  const privacy = requireObject(value, path);
  requireExactFields(privacy, ["containsFullText", "encrypted"], [], path);
  if (privacy.containsFullText !== true) {
    fail("invalid-value", `${path}.containsFullText`, "must be true");
  }
  if (privacy.encrypted !== false) {
    fail("invalid-value", `${path}.encrypted`, "must be false");
  }
  return { containsFullText: true as const, encrypted: false as const };
}

function validateResult(
  value: unknown,
  path: string,
): KeepFactsSessionV1["result"] {
  if (value === null) return null;
  const result = requireObject(value, path);
  requireExactFields(result, ["input", "reviewRecords"], [], path);
  return {
    input: validateInput(result.input, `${path}.input`),
    reviewRecords: validateReviewRecords(
      result.reviewRecords,
      `${path}.reviewRecords`,
    ),
  };
}

export function validateKeepFactsSession(value: unknown): KeepFactsSessionV1 {
  const root = requireObject(value, "$");
  requireExactFields(
    root,
    [
      "format",
      "schemaVersion",
      "exportedAt",
      "generator",
      "privacy",
      "locale",
      "editor",
      "result",
    ],
    [],
    "$",
  );

  if (root.format !== KEEPFACTS_SESSION_FORMAT) {
    fail("invalid-format", "$.format", "not a KeepFacts session");
  }
  if (root.schemaVersion !== KEEPFACTS_SESSION_SCHEMA_VERSION) {
    fail(
      "unsupported-schema",
      "$.schemaVersion",
      `only schema version ${KEEPFACTS_SESSION_SCHEMA_VERSION} is supported`,
    );
  }
  if (root.locale !== "zh" && root.locale !== "en") {
    fail("invalid-value", "$.locale", 'expected "zh" or "en"');
  }

  return {
    format: KEEPFACTS_SESSION_FORMAT,
    schemaVersion: KEEPFACTS_SESSION_SCHEMA_VERSION,
    exportedAt: validateExportedAt(root.exportedAt, "$.exportedAt"),
    generator: validateGenerator(root.generator, "$.generator"),
    privacy: validatePrivacy(root.privacy, "$.privacy"),
    locale: root.locale,
    editor: validateInput(root.editor, "$.editor"),
    result: validateResult(root.result, "$.result"),
  };
}

export function parseKeepFactsSession(serialized: string): KeepFactsSessionV1 {
  if (typeof serialized !== "string") {
    fail("invalid-type", "$", "expected serialized JSON text");
  }
  if (encodedByteLength(serialized) > KEEPFACTS_SESSION_MAX_BYTES) {
    fail(
      "too-large",
      "$",
      `serialized session must not exceed ${KEEPFACTS_SESSION_MAX_BYTES} bytes`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized.replace(/^\uFEFF/u, ""));
  } catch {
    fail("invalid-json", "$", "invalid JSON");
  }
  return validateKeepFactsSession(parsed);
}

export function serializeKeepFactsSession(value: unknown): string {
  const session = validateKeepFactsSession(value);
  const serialized = `${JSON.stringify(session, null, 2)}\n`;
  if (encodedByteLength(serialized) > KEEPFACTS_SESSION_MAX_BYTES) {
    fail(
      "too-large",
      "$",
      `serialized session must not exceed ${KEEPFACTS_SESSION_MAX_BYTES} bytes`,
    );
  }
  return serialized;
}

export function reconcileKeepFactsReviewRecords(
  records: readonly KeepFactsSessionReviewRecord[],
  comparison: FactComparison,
): ReconciledKeepFactsReviewRecords {
  const allowedKeys = new Set(
    getReviewItems(comparison).map((item) => item.key),
  );
  const reviewRecords = Object.create(null) as ReviewRecords;
  let restoredCount = 0;
  let discardedCount = 0;

  for (const { key, decision, note, expectedFix } of records) {
    if (!allowedKeys.has(key)) {
      discardedCount += 1;
      continue;
    }
    reviewRecords[key] = {
      ...(decision !== undefined ? { decision } : {}),
      ...(note !== undefined ? { note } : {}),
      ...(expectedFix !== undefined ? { expectedFix } : {}),
    };
    restoredCount += 1;
  }

  return { reviewRecords, restoredCount, discardedCount };
}
