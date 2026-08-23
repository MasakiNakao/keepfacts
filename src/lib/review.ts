import type { ComparedFact, Fact, FactComparison } from "./facts";

export type ReviewDecision = "confirmed" | "accepted" | "ignored";
export type ReviewScope = "source" | "required" | "added";

export interface ReviewRecord {
  decision?: ReviewDecision;
  note?: string;
  expectedFix?: string;
}

export type ReviewRecords = Partial<Record<string, ReviewRecord>>;

// v0.2 compatibility: callers that only store a decision can keep using the
// original shape while the v0.3 review model is adopted incrementally.
export type ReviewDecisions = Partial<Record<string, ReviewDecision>>;
export type ReviewRecordInput = ReviewRecords | ReviewDecisions;

export interface ReviewInput {
  source: string;
  revision: string;
  required: string;
}

export interface ReviewSnapshot {
  input: ReviewInput;
  comparison: FactComparison;
}

export interface ReviewFingerprint {
  identity: string;
  evidence: string;
}

export interface ReviewItem {
  key: string;
  scope: ReviewScope;
  fact: Fact | ComparedFact;
}

export interface ReviewSummary {
  total: number;
  pending: number;
  confirmed: number;
  accepted: number;
  ignored: number;
}

export type ReviewOutcome =
  | "no-review"
  | "draft"
  | "needs-changes"
  | "acceptable";

export interface ReviewMigrationResult {
  records: ReviewRecords;
  retainedDecisions: number;
  resetDecisions: number;
  retainedAnnotations: number;
  droppedRecords: number;
  ambiguousRecords: number;
}

export interface FixListItem extends ReviewItem {
  record: ReviewRecord;
}

export const REVIEW_TEXT_LIMIT = 500;
export const REVIEW_FINGERPRINT_VERSION = "keepfacts-review-fingerprint-v2";

const REVIEW_DECISIONS = new Set<ReviewDecision>([
  "confirmed",
  "accepted",
  "ignored",
]);

function isReviewDecision(value: unknown): value is ReviewDecision {
  return typeof value === "string" && REVIEW_DECISIONS.has(value as ReviewDecision);
}

function recordFromInput(value: ReviewRecord | ReviewDecision | undefined) {
  return typeof value === "string" ? { decision: value } : value;
}

function valueAt(records: ReviewRecordInput, key: string) {
  return (records as Partial<Record<string, ReviewRecord | ReviewDecision>>)[key];
}

export function normalizeReviewText(value?: string) {
  if (value === undefined) return undefined;
  const trimmed = value
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu, "")
    .trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, REVIEW_TEXT_LIMIT);
}

export function normalizeReviewRecord(
  record?: ReviewRecord,
): ReviewRecord | undefined {
  if (!record) return undefined;
  const normalized: ReviewRecord = {};
  if (isReviewDecision(record.decision)) normalized.decision = record.decision;
  const note = normalizeReviewText(record.note);
  const expectedFix = normalizeReviewText(record.expectedFix);
  if (note) normalized.note = note;
  if (expectedFix) normalized.expectedFix = expectedFix;
  return Object.keys(normalized).length ? normalized : undefined;
}

export function updateReviewRecord(
  records: ReviewRecords,
  key: string,
  patch: Partial<ReviewRecord>,
) {
  const next = { ...records };
  const merged: ReviewRecord = {
    ...recordFromInput(records[key]),
    ...patch,
  };
  const interactive: ReviewRecord = {};
  if (isReviewDecision(merged.decision)) interactive.decision = merged.decision;
  if (merged.note !== undefined) {
    const note = merged.note
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu, "")
      .slice(0, REVIEW_TEXT_LIMIT);
    if (note) interactive.note = note;
  }
  if (merged.expectedFix !== undefined) {
    const expectedFix = merged.expectedFix
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu, "")
      .slice(0, REVIEW_TEXT_LIMIT);
    if (expectedFix) interactive.expectedFix = expectedFix;
  }
  if (Object.keys(interactive).length) next[key] = interactive;
  else delete next[key];
  return next;
}

export function reviewDecisionKey(scope: ReviewScope, fact: Fact) {
  return `${scope}:${fact.id}`;
}

export function getReviewItems(comparison: FactComparison): ReviewItem[] {
  return [
    ...comparison.sourceFacts
      .filter((fact) => fact.status === "review")
      .map((fact) => ({
        key: reviewDecisionKey("source", fact),
        scope: "source" as const,
        fact,
      })),
    ...comparison.requiredFacts
      .filter((fact) => fact.status === "review")
      .map((fact) => ({
        key: reviewDecisionKey("required", fact),
        scope: "required" as const,
        fact,
      })),
    ...comparison.addedFacts.map((fact) => ({
      key: reviewDecisionKey("added", fact),
      scope: "added" as const,
      fact,
    })),
  ];
}

export function getReviewOrder(comparison: FactComparison) {
  return getReviewItems(comparison).map(({ key }) => key);
}

export function orderReviewQueue(
  queueOrder: string[],
  records: ReviewRecordInput,
  targetKey?: string,
) {
  const targetIndex = targetKey ? queueOrder.indexOf(targetKey) : -1;
  const rotated =
    targetIndex > 0
      ? [...queueOrder.slice(targetIndex), ...queueOrder.slice(0, targetIndex)]
      : [...queueOrder];
  const pending: string[] = [];
  const reviewed: string[] = [];
  for (const key of rotated) {
    (decisionAt(records, key) ? reviewed : pending).push(key);
  }
  return [...pending, ...reviewed];
}

export function reconcileReviewRecords(
  comparison: FactComparison,
  records: ReviewRecordInput,
) {
  const reconciled: ReviewRecords = {};
  for (const item of getReviewItems(comparison)) {
    const record = normalizeReviewRecord(recordFromInput(valueAt(records, item.key)));
    if (record) reconciled[item.key] = record;
  }
  return reconciled;
}

function decisionAt(records: ReviewRecordInput, key: string) {
  return normalizeReviewRecord(recordFromInput(valueAt(records, key)))?.decision;
}

export function getNextPendingReviewKey(
  comparison: FactComparison,
  records: ReviewRecordInput,
  currentKey?: string,
) {
  const items = getReviewItems(comparison);
  if (!items.length) return undefined;
  const currentIndex = currentKey
    ? items.findIndex(({ key }) => key === currentKey)
    : -1;
  const start = currentIndex < 0 ? -1 : currentIndex;

  for (let offset = 1; offset <= items.length; offset += 1) {
    const item = items[(start + offset) % items.length];
    if (!decisionAt(records, item.key)) return item.key;
  }
  return undefined;
}

function canonicalText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function encodeFingerprint(type: "identity" | "evidence", fields: string[]) {
  return [REVIEW_FINGERPRINT_VERSION, type, ...fields]
    .map((field) => `${field.length}:${field}`)
    .join("|");
}

const CONTEXT_STOPWORDS = new Set([
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
]);

function contextTokens(value: string) {
  return Array.from(canonicalText(value).matchAll(/[\p{L}\p{N}\p{M}]+/gu))
    .map(([token]) => token)
    .filter((token) => !/^\d+$/u.test(token))
    .filter((token) => !CONTEXT_STOPWORDS.has(token));
}

function localContext(text: string, fact: Fact) {
  const radius = 96;
  const boundary = /[。！？.!?；;\n\r\t|/、，,]/gu;
  const beforeWindow = text.slice(Math.max(0, fact.start - radius), fact.start);
  const afterWindow = text.slice(fact.end, Math.min(text.length, fact.end + radius));
  let beforeStart = 0;
  for (const match of beforeWindow.matchAll(boundary)) {
    beforeStart = (match.index ?? 0) + match[0].length;
  }
  boundary.lastIndex = 0;
  const afterBoundary = boundary.exec(afterWindow);
  return {
    before: beforeWindow.slice(beforeStart),
    after: afterBoundary
      ? afterWindow.slice(0, afterBoundary.index)
      : afterWindow,
  };
}

function localAnchor(text: string, fact: Fact) {
  const context = localContext(text, fact);
  const before = contextTokens(context.before);
  const after = contextTokens(context.after);
  return encodeFingerprint("identity", [
    "anchor",
    before.at(-1) ?? "",
    after[0] ?? "",
  ]);
}

function localEvidence(text: string, fact: Fact) {
  const context = localContext(text, fact);
  return encodeFingerprint("evidence", [
    "context",
    canonicalText(context.before),
    canonicalText(context.after),
  ]);
}

function identityFingerprint(item: ReviewItem, input: ReviewInput) {
  const fact = item.fact;
  const anchor =
    item.scope === "required"
      ? "required"
      : localAnchor(item.scope === "source" ? input.source : input.revision, fact);
  return encodeFingerprint("identity", [
    item.scope,
    fact.kind,
    fact.normalized,
    fact.valid ? "valid" : "invalid",
    anchor,
  ]);
}

function factEvidence(fact: Fact | undefined, text: string) {
  if (!fact) return ["absent"];
  return [
    "present",
    fact.kind,
    fact.raw,
    fact.normalized,
    fact.valid ? "valid" : "invalid",
    localAnchor(text, fact),
    localEvidence(text, fact),
  ];
}

export function fingerprintReviewItem(
  item: ReviewItem,
  input: ReviewInput,
): ReviewFingerprint {
  const compared = item.fact as ComparedFact;
  const sourceFact =
    item.scope === "added"
      ? undefined
      : compared.sourceMatch ??
        (compared.reviewReason === "not-in-source" ? undefined : item.fact);
  const revisionFact =
    item.scope === "added"
      ? item.fact
      : compared.matched ?? compared.possibleMatch;
  const identity = identityFingerprint(item, input);
  const evidence = encodeFingerprint("evidence", [
    identity,
    compared.reviewReason ?? (item.scope === "added" ? "added" : "review"),
    item.fact.raw,
    ...factEvidence(sourceFact, input.source),
    ...factEvidence(revisionFact, input.revision),
  ]);
  return { identity, evidence };
}

function groupItemsByIdentity(
  items: ReviewItem[],
  input: ReviewInput,
  fingerprints: Map<string, ReviewFingerprint>,
) {
  const groups = new Map<string, ReviewItem[]>();
  for (const item of items) {
    const fingerprint = fingerprintReviewItem(item, input);
    fingerprints.set(item.key, fingerprint);
    const group = groups.get(fingerprint.identity);
    if (group) group.push(item);
    else groups.set(fingerprint.identity, [item]);
  }
  return groups;
}

function normalizedInputRecords(records: ReviewRecordInput) {
  const normalized: ReviewRecords = {};
  for (const [key, value] of Object.entries(
    records as Partial<Record<string, ReviewRecord | ReviewDecision>>,
  )) {
    const record = normalizeReviewRecord(recordFromInput(value));
    if (record) normalized[key] = record;
  }
  return normalized;
}

export function migrateReviewRecords(
  previous: ReviewSnapshot,
  next: ReviewSnapshot,
  records: ReviewRecordInput,
): ReviewMigrationResult {
  const previousItems = getReviewItems(previous.comparison);
  const nextItems = getReviewItems(next.comparison);
  const previousByKey = new Map(previousItems.map((item) => [item.key, item]));
  const nextByKey = new Map(nextItems.map((item) => [item.key, item]));
  const previousFingerprints = new Map<string, ReviewFingerprint>();
  const nextFingerprints = new Map<string, ReviewFingerprint>();
  const previousGroups = groupItemsByIdentity(
    previousItems,
    previous.input,
    previousFingerprints,
  );
  const nextGroups = groupItemsByIdentity(
    nextItems,
    next.input,
    nextFingerprints,
  );
  const previousRecords = normalizedInputRecords(records);
  const anchorTextUnchanged: Record<ReviewScope, boolean> = {
    source: previous.input.source === next.input.source,
    required: previous.input.required === next.input.required,
    added: previous.input.revision === next.input.revision,
  };
  const migrated: ReviewRecords = {};
  const usedPreviousKeys = new Set<string>();
  let retainedDecisions = 0;
  let resetDecisions = 0;
  let retainedAnnotations = 0;

  for (const nextItem of nextItems) {
    const nextFingerprint = nextFingerprints.get(nextItem.key);
    if (!nextFingerprint) continue;
    let previousItem: ReviewItem | undefined;
    const sameKeyItem = anchorTextUnchanged[nextItem.scope]
      ? previousByKey.get(nextItem.key)
      : undefined;
    if (
      sameKeyItem &&
      previousFingerprints.get(sameKeyItem.key)?.identity ===
        nextFingerprint.identity
    ) {
      previousItem = sameKeyItem;
    } else {
      const previousGroup = previousGroups.get(nextFingerprint.identity) ?? [];
      const nextGroup = nextGroups.get(nextFingerprint.identity) ?? [];
      if (previousGroup.length === 1 && nextGroup.length === 1) {
        previousItem = previousGroup[0];
      }
    }

    if (!previousItem || usedPreviousKeys.has(previousItem.key)) continue;
    const previousRecord = previousRecords[previousItem.key];
    if (!previousRecord) continue;
    usedPreviousKeys.add(previousItem.key);
    const evidenceUnchanged =
      previousFingerprints.get(previousItem.key)?.evidence ===
      nextFingerprint.evidence;
    const nextRecord = normalizeReviewRecord({
      ...(evidenceUnchanged && previousRecord.decision
        ? { decision: previousRecord.decision }
        : {}),
      note: previousRecord.note,
      expectedFix: previousRecord.expectedFix,
    });
    if (previousRecord.decision) {
      if (evidenceUnchanged) retainedDecisions += 1;
      else resetDecisions += 1;
    }
    if (previousRecord.note || previousRecord.expectedFix) {
      retainedAnnotations += 1;
    }
    if (nextRecord) migrated[nextItem.key] = nextRecord;
  }

  let ambiguousRecords = 0;
  for (const key of Object.keys(previousRecords)) {
    if (usedPreviousKeys.has(key)) continue;
    const item = previousByKey.get(key);
    const fingerprint = item ? previousFingerprints.get(item.key) : undefined;
    if (!item || !fingerprint) continue;
    const directMatch =
      anchorTextUnchanged[item.scope] &&
      nextByKey.get(item.key) !== undefined &&
      nextFingerprints.get(item.key)?.identity === fingerprint.identity;
    const previousGroup = previousGroups.get(fingerprint.identity) ?? [];
    const nextGroup = nextGroups.get(fingerprint.identity) ?? [];
    if (
      !directMatch &&
      nextGroup.length > 0 &&
      (previousGroup.length !== 1 || nextGroup.length !== 1)
    ) {
      ambiguousRecords += 1;
    }
  }

  return {
    records: migrated,
    retainedDecisions,
    resetDecisions,
    retainedAnnotations,
    droppedRecords: Object.keys(previousRecords).length - usedPreviousKeys.size,
    ambiguousRecords,
  };
}

export function summarizeReviews(
  comparison: FactComparison,
  records: ReviewRecordInput,
): ReviewSummary {
  const items = getReviewItems(comparison);
  const summary: ReviewSummary = {
    total: items.length,
    pending: 0,
    confirmed: 0,
    accepted: 0,
    ignored: 0,
  };

  for (const item of items) {
    const decision = decisionAt(records, item.key);
    if (decision) summary[decision] += 1;
    else summary.pending += 1;
  }

  return summary;
}

export function getReviewOutcome(summary: ReviewSummary): ReviewOutcome {
  if (summary.total === 0) return "no-review";
  if (summary.pending > 0) return "draft";
  return summary.confirmed > 0 ? "needs-changes" : "acceptable";
}

export function getFixList(
  comparison: FactComparison,
  records: ReviewRecordInput,
) {
  const fixes: FixListItem[] = [];
  for (const item of getReviewItems(comparison)) {
    const record = normalizeReviewRecord(recordFromInput(valueAt(records, item.key)));
    if (record?.decision === "confirmed") fixes.push({ ...item, record });
  }
  return fixes;
}
