import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

import {
  compareFacts,
  extractFacts,
  type ComparedFact,
  type Fact,
  type FactKind,
} from "../src/lib/facts.ts";

const AUTOMATIC_FACT_KINDS = new Set<FactKind>([
  "money",
  "percentage",
  "date",
  "time",
  "version",
  "email",
  "url",
  "measurement",
  "range",
  "quote",
  "number",
]);

const OUTCOMES = new Set(["preserved", "changed", "missing", "invalid"]);
const METRIC_NAMES = [
  "sourceExtraction",
  "revisionExtraction",
  "review",
  "added",
  "association",
  "outcome",
] as const;

type MetricName = (typeof METRIC_NAMES)[number];
type Side = "source" | "revision";
type Outcome = "preserved" | "changed" | "missing" | "invalid";
type AutomaticFactKind = Exclude<FactKind, "required">;

export interface EvaluationMention {
  id: string;
  kind: AutomaticFactKind;
  start: number;
  end: number;
  raw: string;
  canonical: string;
  valid: boolean;
  scope: "core" | "challenge";
  semanticKey: string;
}

export interface EvaluationRelation {
  sourceId: string;
  revisionId: string | null;
  outcome: Outcome;
}

export interface EvaluationCase {
  id: string;
  split: "dev" | "gate";
  language: string;
  domain: string;
  provenance: {
    type: "fictional-composite" | "public";
    license: string;
  };
  tags: string[];
  source: string;
  revision: string;
  mentions: {
    source: EvaluationMention[];
    revision: EvaluationMention[];
  };
  relations: EvaluationRelation[];
}

type ScoreThreshold = Partial<
  Record<"precision" | "recall" | "f1", number>
>;

export interface EvaluationCorpus {
  schemaVersion: 1;
  id: string;
  description: string;
  thresholds: Record<MetricName, ScoreThreshold> & {
    normalization: { accuracy: number };
    byKind: Partial<
      Record<
        AutomaticFactKind,
        {
          sourceExtraction?: { recall: number };
          revisionExtraction?: { recall: number };
          normalization: { accuracy: number };
        }
      >
    >;
  };
  cases: EvaluationCase[];
}

export interface Score {
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface Accuracy {
  correct: number;
  total: number;
  accuracy: number | null;
}

export interface EvaluationFailure {
  caseId: string;
  split: "dev" | "gate";
  metric:
    | MetricName
    | "normalization";
  expected: string;
  actual: string;
  sourceExcerpt: string;
  revisionExcerpt: string;
}

export interface GateFailure {
  metric: MetricName | "normalization";
  measure: "precision" | "recall" | "f1" | "accuracy";
  threshold: number;
  actual: number | null;
  level: "aggregate" | "kind";
  kind?: AutomaticFactKind;
}

export interface KindMetrics {
  support: {
    source: number;
    revision: number;
    normalization: number;
  };
  sourceExtraction: Score;
  revisionExtraction: Score;
  normalization: Accuracy;
}

export interface EvaluationSlice {
  caseCount: number;
  sourceMentions: number;
  revisionMentions: number;
  relations: number;
  addedMentions: number;
  metrics: Record<MetricName, Score> & { normalization: Accuracy };
  byKind: Partial<Record<AutomaticFactKind, KindMetrics>>;
}

export interface EvaluationResult {
  schemaVersion: 1;
  mode: "public-regression-gate" | "case-diagnostic";
  corpus: {
    id: string;
    totalCaseCount: number;
    gateCaseCount: number;
    selectedCaseId?: string;
  };
  all: EvaluationSlice;
  gated: EvaluationSlice | null;
  thresholdsAppliedTo: "split=gate" | "none";
  passed: boolean;
  gateFailures: GateFailure[];
  failures: EvaluationFailure[];
}

export class CorpusValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid evaluation corpus:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "CorpusValidationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  path: string,
  issues: string[],
): value is string {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(`${path} must be a non-empty string`);
    return false;
  }
  return true;
}

function validateThreshold(
  value: unknown,
  path: string,
  allowed: readonly string[],
  issues: string[],
) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return;
  }
  const keys = Object.keys(value);
  if (!keys.length) issues.push(`${path} must contain at least one threshold`);
  for (const key of keys) {
    if (!allowed.includes(key)) {
      issues.push(`${path}.${key} is not a supported threshold`);
      continue;
    }
    const threshold = value[key];
    if (
      typeof threshold !== "number" ||
      !Number.isFinite(threshold) ||
      threshold < 0 ||
      threshold > 1
    ) {
      issues.push(`${path}.${key} must be a number between 0 and 1`);
    }
  }
}

function validateMention(
  value: unknown,
  side: Side,
  text: string,
  path: string,
  issues: string[],
): value is EvaluationMention {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return false;
  }
  requiredString(value.id, `${path}.id`, issues);
  if (
    typeof value.kind !== "string" ||
    !AUTOMATIC_FACT_KINDS.has(value.kind as FactKind)
  ) {
    issues.push(`${path}.kind must be an automatic fact kind`);
  }
  const validOffsets =
    Number.isInteger(value.start) &&
    Number.isInteger(value.end) &&
    (value.start as number) >= 0 &&
    (value.end as number) > (value.start as number) &&
    (value.end as number) <= text.length;
  if (!validOffsets) {
    issues.push(`${path}.start/end must be a non-empty UTF-16 range inside ${side}`);
  }
  requiredString(value.raw, `${path}.raw`, issues);
  requiredString(value.canonical, `${path}.canonical`, issues);
  requiredString(value.semanticKey, `${path}.semanticKey`, issues);
  if (typeof value.valid !== "boolean") {
    issues.push(`${path}.valid must be boolean`);
  }
  if (value.scope !== "core" && value.scope !== "challenge") {
    issues.push(`${path}.scope must be core or challenge`);
  }
  if (
    validOffsets &&
    typeof value.raw === "string" &&
    text.slice(value.start as number, value.end as number) !== value.raw
  ) {
    issues.push(`${path}.raw must equal ${side}.slice(start, end)`);
  }
  return true;
}

function validateCase(value: unknown, index: number, issues: string[]) {
  const path = `cases[${index}]`;
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requiredString(value.id, `${path}.id`, issues);
  if (value.split !== "dev" && value.split !== "gate") {
    issues.push(`${path}.split must be dev or gate`);
  }
  requiredString(value.language, `${path}.language`, issues);
  requiredString(value.domain, `${path}.domain`, issues);
  requiredString(value.source, `${path}.source`, issues);
  requiredString(value.revision, `${path}.revision`, issues);

  if (!isRecord(value.provenance)) {
    issues.push(`${path}.provenance must be an object`);
  } else {
    if (
      value.provenance.type !== "fictional-composite" &&
      value.provenance.type !== "public"
    ) {
      issues.push(`${path}.provenance.type is unsupported`);
    }
    requiredString(value.provenance.license, `${path}.provenance.license`, issues);
  }

  if (
    !Array.isArray(value.tags) ||
    value.tags.some((tag) => typeof tag !== "string" || !tag.trim())
  ) {
    issues.push(`${path}.tags must be an array of non-empty strings`);
  } else if (new Set(value.tags).size !== value.tags.length) {
    issues.push(`${path}.tags must not contain duplicates`);
  }

  if (!isRecord(value.mentions)) {
    issues.push(`${path}.mentions must be an object`);
    return;
  }
  const sourceText = typeof value.source === "string" ? value.source : "";
  const revisionText = typeof value.revision === "string" ? value.revision : "";
  const mentionMaps: Record<Side, Map<string, EvaluationMention>> = {
    source: new Map(),
    revision: new Map(),
  };
  const semanticMaps: Record<Side, Map<string, EvaluationMention>> = {
    source: new Map(),
    revision: new Map(),
  };

  for (const side of ["source", "revision"] as const) {
    const mentions = value.mentions[side];
    if (!Array.isArray(mentions)) {
      issues.push(`${path}.mentions.${side} must be an array`);
      continue;
    }
    const text = side === "source" ? sourceText : revisionText;
    for (const [mentionIndex, mention] of mentions.entries()) {
      const mentionPath = `${path}.mentions.${side}[${mentionIndex}]`;
      if (!validateMention(mention, side, text, mentionPath, issues)) continue;
      if (mentionMaps[side].has(mention.id)) {
        issues.push(`${mentionPath}.id duplicates ${mention.id}`);
      } else {
        mentionMaps[side].set(mention.id, mention);
      }
      if (semanticMaps[side].has(mention.semanticKey)) {
        issues.push(
          `${mentionPath}.semanticKey duplicates ${mention.semanticKey} on ${side}`,
        );
      } else {
        semanticMaps[side].set(mention.semanticKey, mention);
      }
    }
    const sorted = [...mentionMaps[side].values()].sort(
      (left, right) => left.start - right.start || left.end - right.end,
    );
    for (let mentionIndex = 1; mentionIndex < sorted.length; mentionIndex += 1) {
      if (sorted[mentionIndex].start < sorted[mentionIndex - 1].end) {
        issues.push(
          `${path}.mentions.${side} contains overlapping mentions ${sorted[mentionIndex - 1].id} and ${sorted[mentionIndex].id}`,
        );
      }
    }
  }

  if (!Array.isArray(value.relations)) {
    issues.push(`${path}.relations must be an array`);
    return;
  }
  const sourceRelations = new Map<string, number>();
  const relationBySource = new Map<string, Record<string, unknown>>();
  const claimedRevisions = new Map<string, string>();
  for (const [relationIndex, relation] of value.relations.entries()) {
    const relationPath = `${path}.relations[${relationIndex}]`;
    if (!isRecord(relation)) {
      issues.push(`${relationPath} must be an object`);
      continue;
    }
    if (!requiredString(relation.sourceId, `${relationPath}.sourceId`, issues)) {
      continue;
    }
    const sourceMention = mentionMaps.source.get(relation.sourceId);
    if (!sourceMention) {
      issues.push(`${relationPath}.sourceId does not reference a source mention`);
    }
    sourceRelations.set(
      relation.sourceId,
      (sourceRelations.get(relation.sourceId) ?? 0) + 1,
    );
    relationBySource.set(relation.sourceId, relation);
    if (!OUTCOMES.has(String(relation.outcome))) {
      issues.push(`${relationPath}.outcome is unsupported`);
    }
    if (relation.revisionId !== null && typeof relation.revisionId !== "string") {
      issues.push(`${relationPath}.revisionId must be a string or null`);
      continue;
    }
    const revisionMention =
      typeof relation.revisionId === "string"
        ? mentionMaps.revision.get(relation.revisionId)
        : undefined;
    if (typeof relation.revisionId === "string" && !revisionMention) {
      issues.push(`${relationPath}.revisionId does not reference a revision mention`);
    }
    if (typeof relation.revisionId === "string") {
      const owner = claimedRevisions.get(relation.revisionId);
      if (owner) {
        issues.push(
          `${relationPath}.revisionId is already related to source mention ${owner}`,
        );
      } else {
        claimedRevisions.set(relation.revisionId, relation.sourceId);
      }
    }
    if (relation.outcome === "missing" && relation.revisionId !== null) {
      issues.push(`${relationPath}.missing relations must use revisionId null`);
    }
    if (
      relation.outcome === "missing" &&
      sourceMention &&
      sourceMention.valid !== true
    ) {
      issues.push(`${relationPath}.missing requires a valid source mention`);
    }
    if (
      relation.outcome === "invalid" &&
      relation.revisionId === null &&
      sourceMention &&
      sourceMention.valid !== false
    ) {
      issues.push(
        `${relationPath}.invalid with revisionId null requires an invalid source mention`,
      );
    }
    if (
      (relation.outcome === "preserved" || relation.outcome === "changed") &&
      relation.revisionId === null
    ) {
      issues.push(`${relationPath}.${relation.outcome} relations require revisionId`);
    }
    if (sourceMention && revisionMention) {
      if (sourceMention.semanticKey !== revisionMention.semanticKey) {
        issues.push(`${relationPath} must connect the same semanticKey`);
      }
      if (
        relation.outcome === "preserved" &&
        (sourceMention.canonical !== revisionMention.canonical ||
          !sourceMention.valid ||
          !revisionMention.valid)
      ) {
        issues.push(`${relationPath}.preserved requires equal valid canonical values`);
      }
      if (
        relation.outcome === "changed" &&
        (sourceMention.canonical === revisionMention.canonical ||
          !sourceMention.valid ||
          !revisionMention.valid)
      ) {
        issues.push(`${relationPath}.changed requires different valid canonical values`);
      }
      if (
        relation.outcome === "invalid" &&
        sourceMention.valid &&
        revisionMention.valid
      ) {
        issues.push(`${relationPath}.invalid requires at least one invalid mention`);
      }
    }
  }
  for (const sourceId of mentionMaps.source.keys()) {
    if ((sourceRelations.get(sourceId) ?? 0) !== 1) {
      issues.push(`${path}.relations must contain exactly one relation for ${sourceId}`);
    }
  }
  for (const sourceMention of mentionMaps.source.values()) {
    const revisionMention = semanticMaps.revision.get(sourceMention.semanticKey);
    if (!revisionMention) continue;
    const relation = relationBySource.get(sourceMention.id);
    if (relation?.revisionId !== revisionMention.id) {
      issues.push(
        `${path}.relations must connect shared semanticKey ${sourceMention.semanticKey} (${sourceMention.id} -> ${revisionMention.id})`,
      );
    }
  }
}

export function validateCorpus(value: unknown): asserts value is EvaluationCorpus {
  const issues: string[] = [];
  if (!isRecord(value)) throw new CorpusValidationError(["root must be an object"]);
  if (value.schemaVersion !== 1) issues.push("schemaVersion must be 1");
  requiredString(value.id, "id", issues);
  requiredString(value.description, "description", issues);

  if (!isRecord(value.thresholds)) {
    issues.push("thresholds must be an object");
  } else {
    for (const metric of METRIC_NAMES) {
      validateThreshold(
        value.thresholds[metric],
        `thresholds.${metric}`,
        ["precision", "recall", "f1"],
        issues,
      );
    }
    validateThreshold(
      value.thresholds.normalization,
      "thresholds.normalization",
      ["accuracy"],
      issues,
    );
    if (!isRecord(value.thresholds.byKind)) {
      issues.push("thresholds.byKind must be an object");
    } else {
      for (const [kind, kindThreshold] of Object.entries(
        value.thresholds.byKind,
      )) {
        if (!AUTOMATIC_FACT_KINDS.has(kind as FactKind)) {
          issues.push(`thresholds.byKind.${kind} is not an automatic fact kind`);
          continue;
        }
        if (!isRecord(kindThreshold)) {
          issues.push(`thresholds.byKind.${kind} must be an object`);
          continue;
        }
        if (kindThreshold.sourceExtraction !== undefined) {
          validateThreshold(
            kindThreshold.sourceExtraction,
            `thresholds.byKind.${kind}.sourceExtraction`,
            ["recall"],
            issues,
          );
        }
        if (kindThreshold.revisionExtraction !== undefined) {
          validateThreshold(
            kindThreshold.revisionExtraction,
            `thresholds.byKind.${kind}.revisionExtraction`,
            ["recall"],
            issues,
          );
        }
        validateThreshold(
          kindThreshold.normalization,
          `thresholds.byKind.${kind}.normalization`,
          ["accuracy"],
          issues,
        );
      }
    }
  }

  if (!Array.isArray(value.cases) || !value.cases.length) {
    issues.push("cases must be a non-empty array");
  } else {
    const caseIds = new Set<string>();
    for (const [index, evaluationCase] of value.cases.entries()) {
      validateCase(evaluationCase, index, issues);
      if (isRecord(evaluationCase) && typeof evaluationCase.id === "string") {
        if (caseIds.has(evaluationCase.id)) {
          issues.push(`cases[${index}].id duplicates ${evaluationCase.id}`);
        }
        caseIds.add(evaluationCase.id);
      }
    }

    if (isRecord(value.thresholds) && isRecord(value.thresholds.byKind)) {
      const gateSupport = new Map<
        string,
        { source: number; revision: number }
      >();
      for (const evaluationCase of value.cases) {
        if (!isRecord(evaluationCase) || evaluationCase.split !== "gate") continue;
        if (!isRecord(evaluationCase.mentions)) continue;
        for (const side of ["source", "revision"] as const) {
          const mentions = evaluationCase.mentions[side];
          if (!Array.isArray(mentions)) continue;
          for (const mention of mentions) {
            if (!isRecord(mention) || typeof mention.kind !== "string") continue;
            const support = gateSupport.get(mention.kind) ?? {
              source: 0,
              revision: 0,
            };
            support[side] += 1;
            gateSupport.set(mention.kind, support);
          }
        }
      }
      for (const [kind, support] of gateSupport) {
        const kindThreshold = value.thresholds.byKind[kind];
        if (!isRecord(kindThreshold)) {
          issues.push(
            `thresholds.byKind.${kind} is required because split=gate has support`,
          );
          continue;
        }
        if (
          support.source > 0 &&
          (!isRecord(kindThreshold.sourceExtraction) ||
            typeof kindThreshold.sourceExtraction.recall !== "number")
        ) {
          issues.push(
            `thresholds.byKind.${kind}.sourceExtraction.recall is required because split=gate source support is ${support.source}`,
          );
        }
        if (
          support.revision > 0 &&
          (!isRecord(kindThreshold.revisionExtraction) ||
            typeof kindThreshold.revisionExtraction.recall !== "number")
        ) {
          issues.push(
            `thresholds.byKind.${kind}.revisionExtraction.recall is required because split=gate revision support is ${support.revision}`,
          );
        }
        if (
          !isRecord(kindThreshold.normalization) ||
          typeof kindThreshold.normalization.accuracy !== "number"
        ) {
          issues.push(
            `thresholds.byKind.${kind}.normalization.accuracy is required because split=gate has support`,
          );
        }
      }
    }
  }
  if (issues.length) throw new CorpusValidationError(issues);
}

function factKey(fact: Pick<Fact, "kind" | "start" | "end">) {
  return `${fact.kind}:${fact.start}:${fact.end}`;
}

function mentionKey(mention: EvaluationMention) {
  return `${mention.kind}:${mention.start}:${mention.end}`;
}

function ratio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : null;
}

function scoreSets(expected: Set<string>, actual: Set<string>): Score {
  let tp = 0;
  for (const item of actual) if (expected.has(item)) tp += 1;
  const fp = actual.size - tp;
  const fn = expected.size - tp;
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? precision === 0 && recall === 0
        ? 0
        : null
      : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

function excerpt(text: string, start = 0, end = 0) {
  const radius = 36;
  const excerptStart = Math.max(0, start - radius);
  const excerptEnd = Math.min(text.length, Math.max(end, start) + radius);
  return `${excerptStart ? "…" : ""}${text.slice(excerptStart, excerptEnd)}${excerptEnd < text.length ? "…" : ""}`;
}

function predictionDescription(fact: Fact | ComparedFact | undefined) {
  if (!fact) return "not found";
  const compared = fact as ComparedFact;
  const target = compared.matched ?? compared.possibleMatch;
  const status = compared.status
    ? `${compared.status}${compared.reviewReason ? `:${compared.reviewReason}` : ""}`
    : "extracted";
  return `${status} ${fact.kind} ${JSON.stringify(fact.raw)}${target ? ` -> ${JSON.stringify(target.raw)}` : ""}`;
}

function addSetFailures(
  failures: EvaluationFailure[],
  evaluationCase: EvaluationCase,
  metric: MetricName,
  expected: Set<string>,
  actual: Set<string>,
) {
  for (const item of [...expected].sort()) {
    if (!actual.has(item)) {
      failures.push({
        caseId: evaluationCase.id,
        split: evaluationCase.split,
        metric,
        expected: item,
        actual: "not predicted",
        sourceExcerpt: excerpt(evaluationCase.source),
        revisionExcerpt: excerpt(evaluationCase.revision),
      });
    }
  }
  for (const item of [...actual].sort()) {
    if (!expected.has(item)) {
      failures.push({
        caseId: evaluationCase.id,
        split: evaluationCase.split,
        metric,
        expected: "not predicted",
        actual: item,
        sourceExcerpt: excerpt(evaluationCase.source),
        revisionExcerpt: excerpt(evaluationCase.revision),
      });
    }
  }
}

function accumulate(
  target: Record<MetricName, { expected: Set<string>; actual: Set<string> }>,
  metric: MetricName,
  expected: Iterable<string>,
  actual: Iterable<string>,
) {
  for (const item of expected) target[metric].expected.add(item);
  for (const item of actual) target[metric].actual.add(item);
}

function evaluateCases(cases: EvaluationCase[]) {
  const sets = Object.fromEntries(
    METRIC_NAMES.map((metric) => [
      metric,
      { expected: new Set<string>(), actual: new Set<string>() },
    ]),
  ) as Record<MetricName, { expected: Set<string>; actual: Set<string> }>;
  const kindSets = new Map<
    AutomaticFactKind,
    {
      sourceExpected: Set<string>;
      sourceActual: Set<string>;
      revisionExpected: Set<string>;
      revisionActual: Set<string>;
      normalizationCorrect: number;
      normalizationTotal: number;
    }
  >();
  const kindBucket = (kind: AutomaticFactKind) => {
    let bucket = kindSets.get(kind);
    if (!bucket) {
      bucket = {
        sourceExpected: new Set(),
        sourceActual: new Set(),
        revisionExpected: new Set(),
        revisionActual: new Set(),
        normalizationCorrect: 0,
        normalizationTotal: 0,
      };
      kindSets.set(kind, bucket);
    }
    return bucket;
  };
  const failures: EvaluationFailure[] = [];
  let normalizationCorrect = 0;
  let normalizationTotal = 0;
  let sourceMentions = 0;
  let revisionMentions = 0;
  let relationCount = 0;
  let addedMentions = 0;

  for (const evaluationCase of cases) {
    const prefix = `${evaluationCase.id}:`;
    const comparison = compareFacts(
      evaluationCase.source,
      evaluationCase.revision,
    );
    const sourcePredictions = comparison.sourceFacts;
    const revisionPredictions = extractFacts(evaluationCase.revision);
    const sourceByKey = new Map(
      evaluationCase.mentions.source.map((mention) => [mentionKey(mention), mention]),
    );
    const revisionByKey = new Map(
      evaluationCase.mentions.revision.map((mention) => [mentionKey(mention), mention]),
    );
    const sourcePredictionByMention = new Map<string, ComparedFact>();
    const revisionPredictionByMention = new Map<string, Fact>();
    for (const fact of sourcePredictions) {
      const mention = sourceByKey.get(factKey(fact));
      if (mention) sourcePredictionByMention.set(mention.id, fact);
    }
    for (const fact of revisionPredictions) {
      const mention = revisionByKey.get(factKey(fact));
      if (mention) revisionPredictionByMention.set(mention.id, fact);
    }

    const expectedSourceExtraction = new Set(
      evaluationCase.mentions.source.map((mention) => `${prefix}${mentionKey(mention)}`),
    );
    const actualSourceExtraction = new Set(
      sourcePredictions.map((fact) => `${prefix}${factKey(fact)}`),
    );
    const expectedRevisionExtraction = new Set(
      evaluationCase.mentions.revision.map((mention) => `${prefix}${mentionKey(mention)}`),
    );
    const actualRevisionExtraction = new Set(
      revisionPredictions.map((fact) => `${prefix}${factKey(fact)}`),
    );
    accumulate(
      sets,
      "sourceExtraction",
      expectedSourceExtraction,
      actualSourceExtraction,
    );
    accumulate(
      sets,
      "revisionExtraction",
      expectedRevisionExtraction,
      actualRevisionExtraction,
    );
    for (const mention of evaluationCase.mentions.source) {
      kindBucket(mention.kind).sourceExpected.add(
        `${prefix}${mentionKey(mention)}`,
      );
    }
    for (const fact of sourcePredictions) {
      kindBucket(fact.kind as AutomaticFactKind).sourceActual.add(
        `${prefix}${factKey(fact)}`,
      );
    }
    for (const mention of evaluationCase.mentions.revision) {
      kindBucket(mention.kind).revisionExpected.add(
        `${prefix}${mentionKey(mention)}`,
      );
    }
    for (const fact of revisionPredictions) {
      kindBucket(fact.kind as AutomaticFactKind).revisionActual.add(
        `${prefix}${factKey(fact)}`,
      );
    }
    addSetFailures(
      failures,
      evaluationCase,
      "sourceExtraction",
      expectedSourceExtraction,
      actualSourceExtraction,
    );
    addSetFailures(
      failures,
      evaluationCase,
      "revisionExtraction",
      expectedRevisionExtraction,
      actualRevisionExtraction,
    );

    for (const side of ["source", "revision"] as const) {
      const predictions =
        side === "source" ? sourcePredictionByMention : revisionPredictionByMention;
      for (const mention of evaluationCase.mentions[side]) {
        const prediction = predictions.get(mention.id);
        if (!prediction) continue;
        normalizationTotal += 1;
        const bucket = kindBucket(mention.kind);
        bucket.normalizationTotal += 1;
        if (
          prediction.normalized === mention.canonical &&
          prediction.valid === mention.valid
        ) {
          normalizationCorrect += 1;
          bucket.normalizationCorrect += 1;
        } else {
          failures.push({
            caseId: evaluationCase.id,
            split: evaluationCase.split,
            metric: "normalization",
            expected: `${mention.canonical}; valid=${mention.valid}`,
            actual: `${prediction.normalized}; valid=${prediction.valid}`,
            sourceExcerpt: excerpt(evaluationCase.source),
            revisionExcerpt: excerpt(evaluationCase.revision),
          });
        }
      }
    }

    const relatedRevisionIds = new Set(
      evaluationCase.relations
        .map((relation) => relation.revisionId)
        .filter((id): id is string => id !== null),
    );
    const expectedReview = new Set(
      evaluationCase.relations
        .filter((relation) => relation.outcome !== "preserved")
        .map((relation) => `${prefix}${relation.sourceId}`),
    );
    const actualReview = new Set<string>();
    for (const prediction of sourcePredictions) {
      if (prediction.status !== "review") continue;
      const mention = sourceByKey.get(factKey(prediction));
      actualReview.add(
        mention
          ? `${prefix}${mention.id}`
          : `${prefix}actual:${factKey(prediction)}`,
      );
    }
    accumulate(sets, "review", expectedReview, actualReview);
    addSetFailures(
      failures,
      evaluationCase,
      "review",
      expectedReview,
      actualReview,
    );

    const expectedAdded = new Set(
      evaluationCase.mentions.revision
        .filter((mention) => !relatedRevisionIds.has(mention.id))
        .map((mention) => `${prefix}${mention.id}`),
    );
    const actualAdded = new Set(
      comparison.addedFacts.map((fact) => {
        const mention = revisionByKey.get(factKey(fact));
        return mention
          ? `${prefix}${mention.id}`
          : `${prefix}actual:${factKey(fact)}`;
      }),
    );
    accumulate(sets, "added", expectedAdded, actualAdded);
    addSetFailures(
      failures,
      evaluationCase,
      "added",
      expectedAdded,
      actualAdded,
    );

    const expectedAssociations = new Set(
      evaluationCase.relations
        .filter(
          (relation): relation is EvaluationRelation & { revisionId: string } =>
            relation.revisionId !== null,
        )
        .map(
          (relation) =>
            `${prefix}${relation.sourceId}->${relation.revisionId}`,
        ),
    );
    const actualAssociations = new Set<string>();
    const expectedOutcomes = new Set(
      evaluationCase.relations.map(
        (relation) =>
          `${prefix}${relation.sourceId}->${relation.revisionId ?? "null"}:${relation.outcome}`,
      ),
    );
    const actualOutcomes = new Set<string>();
    for (const prediction of sourcePredictions) {
      const sourceMention = sourceByKey.get(factKey(prediction));
      const sourceId = sourceMention?.id ?? `actual:${factKey(prediction)}`;
      const target = prediction.matched ?? prediction.possibleMatch;
      const revisionMention = target
        ? revisionByKey.get(factKey(target))
        : undefined;
      const revisionId = target
        ? revisionMention?.id ?? `actual:${factKey(target)}`
        : "null";
      if (target) actualAssociations.add(`${prefix}${sourceId}->${revisionId}`);
      const outcome =
        prediction.status === "preserved"
          ? "preserved"
          : prediction.reviewReason ?? "review";
      actualOutcomes.add(`${prefix}${sourceId}->${revisionId}:${outcome}`);
    }
    accumulate(sets, "association", expectedAssociations, actualAssociations);
    accumulate(sets, "outcome", expectedOutcomes, actualOutcomes);
    addSetFailures(
      failures,
      evaluationCase,
      "association",
      expectedAssociations,
      actualAssociations,
    );
    addSetFailures(
      failures,
      evaluationCase,
      "outcome",
      expectedOutcomes,
      actualOutcomes,
    );

    sourceMentions += evaluationCase.mentions.source.length;
    revisionMentions += evaluationCase.mentions.revision.length;
    relationCount += evaluationCase.relations.length;
    addedMentions += expectedAdded.size;

    // Include a local, human-readable mismatch for every annotated source fact.
    for (const relation of evaluationCase.relations) {
      const prediction = sourcePredictionByMention.get(relation.sourceId);
      if (!prediction) continue;
      const predictedTarget = prediction.matched ?? prediction.possibleMatch;
      const predictedTargetMention = predictedTarget
        ? revisionByKey.get(factKey(predictedTarget))
        : undefined;
      const predictedOutcome =
        prediction.status === "preserved"
          ? "preserved"
          : prediction.reviewReason ?? "review";
      if (
        predictedOutcome !== relation.outcome ||
        (predictedTargetMention?.id ?? null) !== relation.revisionId
      ) {
        const sourceMention = evaluationCase.mentions.source.find(
          (mention) => mention.id === relation.sourceId,
        );
        failures.push({
          caseId: evaluationCase.id,
          split: evaluationCase.split,
          metric: "outcome",
          expected: `${relation.outcome} -> ${relation.revisionId ?? "null"} (${sourceMention?.semanticKey ?? relation.sourceId})`,
          actual: predictionDescription(prediction),
          sourceExcerpt: excerpt(
            evaluationCase.source,
            sourceMention?.start,
            sourceMention?.end,
          ),
          revisionExcerpt: excerpt(
            evaluationCase.revision,
            predictedTargetMention?.start,
            predictedTargetMention?.end,
          ),
        });
      }
    }
  }

  const scoredMetrics = Object.fromEntries(
    METRIC_NAMES.map((metric) => [
      metric,
      scoreSets(sets[metric].expected, sets[metric].actual),
    ]),
  ) as Record<MetricName, Score>;
  const normalization: Accuracy = {
    correct: normalizationCorrect,
    total: normalizationTotal,
    accuracy: ratio(normalizationCorrect, normalizationTotal),
  };
  const byKind = Object.fromEntries(
    [...kindSets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, bucket]) => [
        kind,
        {
          support: {
            source: bucket.sourceExpected.size,
            revision: bucket.revisionExpected.size,
            normalization: bucket.normalizationTotal,
          },
          sourceExtraction: scoreSets(
            bucket.sourceExpected,
            bucket.sourceActual,
          ),
          revisionExtraction: scoreSets(
            bucket.revisionExpected,
            bucket.revisionActual,
          ),
          normalization: {
            correct: bucket.normalizationCorrect,
            total: bucket.normalizationTotal,
            accuracy: ratio(
              bucket.normalizationCorrect,
              bucket.normalizationTotal,
            ),
          },
        },
      ]),
  ) as Partial<Record<AutomaticFactKind, KindMetrics>>;
  return {
    slice: {
      caseCount: cases.length,
      sourceMentions,
      revisionMentions,
      relations: relationCount,
      addedMentions,
      metrics: { ...scoredMetrics, normalization },
      byKind,
    } satisfies EvaluationSlice,
    failures: failures.sort(
      (left, right) =>
        left.caseId.localeCompare(right.caseId) ||
        left.metric.localeCompare(right.metric) ||
        left.expected.localeCompare(right.expected) ||
        left.actual.localeCompare(right.actual),
    ),
  };
}

function gateFailuresFor(
  corpus: EvaluationCorpus,
  gated: EvaluationSlice,
) {
  const gateFailures: GateFailure[] = [];
  for (const metric of METRIC_NAMES) {
    for (const [measure, threshold] of Object.entries(corpus.thresholds[metric])) {
      const actual = gated.metrics[metric][measure as keyof Score] as
        | number
        | null;
      if (actual === null || actual + Number.EPSILON < threshold) {
        gateFailures.push({
          metric,
          measure: measure as "precision" | "recall" | "f1",
          threshold,
          actual,
          level: "aggregate",
        });
      }
    }
  }
  if (
    gated.metrics.normalization.accuracy === null ||
    gated.metrics.normalization.accuracy + Number.EPSILON <
      corpus.thresholds.normalization.accuracy
  ) {
    gateFailures.push({
      metric: "normalization",
      measure: "accuracy",
      threshold: corpus.thresholds.normalization.accuracy,
      actual: gated.metrics.normalization.accuracy,
      level: "aggregate",
    });
  }
  for (const [kind, thresholds] of Object.entries(
    corpus.thresholds.byKind,
  ) as Array<
    [AutomaticFactKind, NonNullable<EvaluationCorpus["thresholds"]["byKind"][AutomaticFactKind]>]
  >) {
    const metrics = gated.byKind[kind];
    if (!metrics) continue;
    for (const side of ["sourceExtraction", "revisionExtraction"] as const) {
      const threshold = thresholds[side]?.recall;
      if (threshold === undefined) continue;
      const actual = metrics[side].recall;
      if (actual === null || actual + Number.EPSILON < threshold) {
        gateFailures.push({
          metric: side,
          measure: "recall",
          threshold,
          actual,
          level: "kind",
          kind,
        });
      }
    }
    const actual = metrics.normalization.accuracy;
    const threshold = thresholds.normalization.accuracy;
    if (actual === null || actual + Number.EPSILON < threshold) {
      gateFailures.push({
        metric: "normalization",
        measure: "accuracy",
        threshold,
        actual,
        level: "kind",
        kind,
      });
    }
  }
  return gateFailures;
}

export function evaluateCorpus(
  corpus: EvaluationCorpus,
  options: { caseId?: string } = {},
): EvaluationResult {
  validateCorpus(corpus);
  const gateCases = corpus.cases.filter(
    (evaluationCase) => evaluationCase.split === "gate",
  );
  if (options.caseId) {
    const selected = corpus.cases.filter(
      (evaluationCase) => evaluationCase.id === options.caseId,
    );
    if (!selected.length) {
      throw new CorpusValidationError([`case ${options.caseId} does not exist`]);
    }
    const diagnostic = evaluateCases(selected);
    return {
      schemaVersion: 1,
      mode: "case-diagnostic",
      corpus: {
        id: corpus.id,
        totalCaseCount: corpus.cases.length,
        gateCaseCount: gateCases.length,
        selectedCaseId: options.caseId,
      },
      all: diagnostic.slice,
      gated: null,
      thresholdsAppliedTo: "none",
      passed: diagnostic.failures.length === 0,
      gateFailures: [],
      failures: diagnostic.failures,
    };
  }

  const all = evaluateCases(corpus.cases);
  const gated = evaluateCases(gateCases);
  const gateFailures = gateFailuresFor(corpus, gated.slice);

  return {
    schemaVersion: 1,
    mode: "public-regression-gate",
    corpus: {
      id: corpus.id,
      totalCaseCount: corpus.cases.length,
      gateCaseCount: gateCases.length,
    },
    all: all.slice,
    gated: gated.slice,
    thresholdsAppliedTo: "split=gate",
    passed: gateFailures.length === 0,
    gateFailures,
    failures: all.failures,
  };
}

export function loadCorpus(
  corpusPath = fileURLToPath(
    new URL("../tests/evaluation/real-v1.json", import.meta.url),
  ),
) {
  const parsed: unknown = JSON.parse(readFileSync(corpusPath, "utf8"));
  validateCorpus(parsed);
  return parsed;
}

function percentage(value: number | null) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

export function formatTextResult(result: EvaluationResult) {
  const labels: Record<MetricName, string> = {
    sourceExtraction: "Source extraction",
    revisionExtraction: "Revision extraction",
    review: "Review alerts",
    added: "Added facts",
    association: "Association edges",
    outcome: "Association + outcome",
  };
  const lines = [`KeepFacts evaluation - ${result.corpus.id}`, ""];
  const appendSlice = (
    title: string,
    slice: EvaluationSlice,
    thresholdNote: string,
  ) => {
    lines.push(
      title,
      thresholdNote,
      `${slice.caseCount} cases | ${slice.sourceMentions} source mentions | ${slice.revisionMentions} revision mentions | ${slice.addedMentions} added mentions`,
      "",
      "Metric                    TP   FP   FN      P       R      F1",
    );
    for (const metric of METRIC_NAMES) {
      const score = slice.metrics[metric];
      lines.push(
        `${labels[metric].padEnd(25)} ${String(score.tp).padStart(3)}  ${String(score.fp).padStart(3)}  ${String(score.fn).padStart(3)}  ${percentage(score.precision).padStart(6)}  ${percentage(score.recall).padStart(6)}  ${percentage(score.f1).padStart(6)}`,
      );
    }
    lines.push(
      `${"Normalization".padEnd(25)} ${String(slice.metrics.normalization.correct).padStart(3)} / ${String(slice.metrics.normalization.total).padEnd(3)}  ${percentage(slice.metrics.normalization.accuracy)}`,
      "",
      "Per-kind support and recall",
      "Kind           Src N   Src P   Src R   Rev N   Rev P   Rev R   Norm N   Norm",
    );
    for (const [kind, metrics] of Object.entries(slice.byKind).sort(
      ([left], [right]) => left.localeCompare(right),
    ) as Array<[string, KindMetrics]>) {
      lines.push(
        `${kind.padEnd(14)} ${String(metrics.support.source).padStart(5)}  ${percentage(metrics.sourceExtraction.precision).padStart(6)}  ${percentage(metrics.sourceExtraction.recall).padStart(6)}  ${String(metrics.support.revision).padStart(5)}  ${percentage(metrics.revisionExtraction.precision).padStart(6)}  ${percentage(metrics.revisionExtraction.recall).padStart(6)}  ${String(metrics.support.normalization).padStart(6)}  ${percentage(metrics.normalization.accuracy).padStart(6)}`,
      );
    }
    lines.push("");
  };

  if (result.mode === "case-diagnostic") {
    appendSlice(
      `Case diagnostic: ${result.corpus.selectedCaseId}`,
      result.all,
      "Global thresholds: not applied; any prediction mismatch fails this diagnostic.",
    );
    lines.push(`Diagnostic: ${result.passed ? "PASS" : "FAIL"}`);
  } else {
    appendSlice(
      "All cases (informational)",
      result.all,
      "Thresholds: not applied to this all-case view.",
    );
    if (result.gated) {
      appendSlice(
        "Public regression gate (split=gate)",
        result.gated,
        "Thresholds: applied only to this split=gate view.",
      );
    }
    if (result.gateFailures.length) {
      lines.push("Public regression gate failures:");
      for (const failure of result.gateFailures) {
        const kind = failure.kind ? `.${failure.kind}` : "";
        lines.push(
          `- ${failure.level}${kind}.${failure.metric}.${failure.measure}: ${percentage(failure.actual)} < ${percentage(failure.threshold)}`,
        );
      }
    } else {
      lines.push("Public regression gate: PASS");
    }
  }
  if (result.failures.length) {
    const detailLabel =
      result.mode === "case-diagnostic"
        ? "Case mismatch details"
        : "All-case mismatch details (informational; gate status uses split=gate only)";
    lines.push("", `${detailLabel} (${result.failures.length}):`);
    for (const failure of result.failures.slice(0, 30)) {
      lines.push(
        `- [${failure.split}:${failure.caseId}] ${failure.metric}`,
        `  expected: ${failure.expected}`,
        `  actual:   ${failure.actual}`,
        `  source:   ${failure.sourceExcerpt}`,
        `  revision: ${failure.revisionExcerpt}`,
      );
    }
    if (result.failures.length > 30) {
      lines.push(`- ... ${result.failures.length - 30} more; use --format json for all details`);
    }
  } else {
    lines.push("", "Prediction mismatch details: none");
  }
  return `${lines.join("\n")}\n`;
}

interface CliOptions {
  format: "text" | "json";
  corpusPath?: string;
  caseId?: string;
  help: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { format: "text", help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--format") {
      const format = args[++index];
      if (format !== "text" && format !== "json") {
        throw new Error("--format must be text or json");
      }
      options.format = format;
    } else if (argument === "--corpus") {
      const corpusPath = args[++index];
      if (!corpusPath) throw new Error("--corpus requires a path");
      options.corpusPath = resolve(corpusPath);
    } else if (argument === "--case") {
      const caseId = args[++index];
      if (!caseId) throw new Error("--case requires an id");
      options.caseId = caseId;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

const HELP = `Usage: node --experimental-strip-types scripts/evaluate.ts [options]

Options:
  --format text|json  Output format (default: text)
  --corpus PATH       Evaluation corpus JSON path
  --case ID           Evaluate one named case
  --help               Show this help
`;

export function runCli(args: string[]) {
  try {
    const options = parseArgs(args);
    if (options.help) {
      process.stdout.write(HELP);
      return 0;
    }
    const corpus = loadCorpus(options.corpusPath);
    const result = evaluateCorpus(corpus, { caseId: options.caseId });
    process.stdout.write(
      options.format === "json"
        ? `${JSON.stringify(result, null, 2)}\n`
        : formatTextResult(result),
    );
    return result.passed ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 2;
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (entryUrl === import.meta.url) {
  process.exitCode = runCli(process.argv.slice(2));
}
