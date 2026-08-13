import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CorpusValidationError,
  evaluateCorpus,
  loadCorpus,
  validateCorpus,
  type EvaluationCorpus,
} from "../scripts/evaluate.ts";

function cloneCorpus() {
  return structuredClone(loadCorpus());
}

function hasIssue(fragment: string) {
  return (error: unknown) =>
    error instanceof CorpusValidationError &&
    error.issues.some((issue) => issue.includes(fragment));
}

function runCli(args: string[]) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/evaluate.ts", ...args],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
}

function withTemporaryCorpus(
  corpus: EvaluationCorpus,
  callback: (path: string) => void,
) {
  const directory = mkdtempSync(join(tmpdir(), "keepfacts-eval-"));
  const path = join(directory, "corpus.json");
  try {
    writeFileSync(path, JSON.stringify(corpus), "utf8");
    callback(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("validates the starter corpus, spans, and explicit gate kind floors", () => {
  const corpus = loadCorpus();

  assert.equal(corpus.schemaVersion, 1);
  assert.ok(corpus.cases.length >= 12);
  assert.ok(corpus.cases.some(({ language }) => language === "zh-CN"));
  assert.ok(corpus.cases.some(({ language }) => language === "en"));
  assert.ok(corpus.cases.some(({ language }) => language.includes("+")));
  assert.ok(corpus.cases.some(({ tags }) => tags.includes("hard-negative")));
  assert.ok(corpus.cases.some(({ tags }) => tags.includes("duplicate-values")));

  const gateKinds = new Set(
    corpus.cases
      .filter(({ split }) => split === "gate")
      .flatMap(({ mentions }) => [...mentions.source, ...mentions.revision])
      .map(({ kind }) => kind),
  );
  for (const kind of gateKinds) {
    const threshold = corpus.thresholds.byKind[kind];
    assert.equal(typeof threshold?.sourceExtraction?.recall, "number", kind);
    assert.equal(typeof threshold?.revisionExtraction?.recall, "number", kind);
    assert.equal(typeof threshold?.normalization.accuracy, "number", kind);
  }

  for (const evaluationCase of corpus.cases) {
    for (const side of ["source", "revision"] as const) {
      for (const mention of evaluationCase.mentions[side]) {
        assert.equal(
          evaluationCase[side].slice(mention.start, mention.end),
          mention.raw,
          `${evaluationCase.id}:${side}:${mention.id}`,
        );
      }
    }
  }
});

test("rejects stale spans, duplicate targets, dangling relations, and missing kind floors", () => {
  const staleSpan = cloneCorpus();
  staleSpan.cases[0].mentions.source[0].start += 1;
  assert.throws(() => validateCorpus(staleSpan), hasIssue("raw must equal"));

  const duplicateTarget = cloneCorpus();
  duplicateTarget.cases[0].relations[1].revisionId =
    duplicateTarget.cases[0].relations[0].revisionId;
  assert.throws(
    () => validateCorpus(duplicateTarget),
    hasIssue("already related"),
  );

  const dangling = cloneCorpus();
  dangling.cases[0].relations[0].revisionId = "unknown";
  assert.throws(
    () => validateCorpus(dangling),
    hasIssue("does not reference"),
  );

  const missingFloor = cloneCorpus();
  delete missingFloor.thresholds.byKind.date?.sourceExtraction;
  assert.throws(
    () => validateCorpus(missingFloor),
    hasIssue("date.sourceExtraction.recall is required"),
  );
});

test("enforces semantic identity and missing/invalid relation invariants", () => {
  const duplicateSemanticKey = cloneCorpus();
  duplicateSemanticKey.cases[0].mentions.source[1].semanticKey =
    duplicateSemanticKey.cases[0].mentions.source[0].semanticKey;
  assert.throws(
    () => validateCorpus(duplicateSemanticKey),
    hasIssue("semanticKey duplicates"),
  );

  const sharedButUnrelated = cloneCorpus();
  sharedButUnrelated.cases[0].relations[0].revisionId = null;
  sharedButUnrelated.cases[0].relations[0].outcome = "missing";
  assert.throws(
    () => validateCorpus(sharedButUnrelated),
    hasIssue("must connect shared semanticKey"),
  );

  const invalidWithoutInvalidSource = cloneCorpus();
  const missingCase = invalidWithoutInvalidSource.cases.find(
    ({ id }) => id === "zh-missing-001",
  );
  assert.ok(missingCase);
  missingCase.relations[0].outcome = "invalid";
  assert.throws(
    () => validateCorpus(invalidWithoutInvalidSource),
    hasIssue("invalid with revisionId null requires an invalid source"),
  );

  const missingInvalidSource = cloneCorpus();
  const invalidMissingCase = missingInvalidSource.cases.find(
    ({ id }) => id === "zh-missing-001",
  );
  assert.ok(invalidMissingCase);
  invalidMissingCase.mentions.source[0].valid = false;
  assert.throws(
    () => validateCorpus(missingInvalidSource),
    hasIssue("missing requires a valid source"),
  );
});

test("reports all and gated aggregates plus per-kind support and P/R", () => {
  const result = evaluateCorpus(loadCorpus());

  assert.equal(result.mode, "public-regression-gate");
  assert.equal(result.thresholdsAppliedTo, "split=gate");
  assert.equal(result.passed, true);
  assert.equal(result.gateFailures.length, 0);
  assert.equal(result.corpus.totalCaseCount, 14);
  assert.equal(result.corpus.gateCaseCount, 6);
  assert.equal(result.all.caseCount, 14);
  assert.equal(result.gated?.caseCount, 6);
  assert.ok(result.all.sourceMentions >= 40);
  assert.ok(result.all.addedMentions >= 4);
  for (const slice of [result.all, result.gated]) {
    assert.ok(slice);
    for (const metric of [
      "sourceExtraction",
      "revisionExtraction",
      "review",
      "added",
      "association",
      "outcome",
    ] as const) {
      assert.equal(slice.metrics[metric].precision, 1, metric);
      assert.equal(slice.metrics[metric].recall, 1, metric);
    }
    assert.equal(slice.metrics.normalization.accuracy, 1);
    assert.ok((slice.byKind.date?.support.source ?? 0) > 0);
    assert.equal(slice.byKind.date?.sourceExtraction.precision, 1);
    assert.equal(slice.byKind.date?.sourceExtraction.recall, 1);
    assert.equal(slice.byKind.date?.revisionExtraction.precision, 1);
    assert.equal(slice.byKind.date?.revisionExtraction.recall, 1);
  }
});

test("shows dev mismatches without failing the public regression gate", () => {
  const corpus = cloneCorpus();
  const devCase = corpus.cases.find(({ id }) => id === "zh-procurement-001");
  assert.ok(devCase);
  devCase.mentions.source[2].canonical = "duration-s:wrong";
  devCase.mentions.revision[2].canonical = "duration-s:wrong";

  const result = evaluateCorpus(corpus);

  assert.equal(result.passed, true);
  assert.ok((result.all.metrics.normalization.accuracy ?? 1) < 1);
  assert.equal(result.gated?.metrics.normalization.accuracy, 1);
  assert.ok(
    result.failures.some(
      ({ caseId, metric }) =>
        caseId === "zh-procurement-001" && metric === "normalization",
    ),
  );
});

test("applies explicit per-kind floors only to the gate subset", () => {
  const corpus = cloneCorpus();
  const gateCase = corpus.cases.find(({ id }) => id === "zh-product-001");
  assert.ok(gateCase);
  gateCase.mentions.source[1].canonical = "version:wrong";
  gateCase.mentions.revision[1].canonical = "version:wrong";

  const result = evaluateCorpus(corpus);

  assert.equal(result.passed, false);
  assert.ok(
    result.gateFailures.some(
      ({ level, kind, metric }) =>
        level === "kind" && kind === "version" && metric === "normalization",
    ),
  );
});

test("--case is threshold-free diagnostic mode with correct exit semantics", () => {
  const correct = runCli(["--case", "en-ops-001", "--format", "json"]);
  assert.equal(correct.status, 0, correct.stderr);
  const correctResult = JSON.parse(correct.stdout) as {
    mode: string;
    thresholdsAppliedTo: string;
    gated: unknown;
    passed: boolean;
  };
  assert.equal(correctResult.mode, "case-diagnostic");
  assert.equal(correctResult.thresholdsAppliedTo, "none");
  assert.equal(correctResult.gated, null);
  assert.equal(correctResult.passed, true);

  const failingCorpus = cloneCorpus();
  const diagnosticCase = failingCorpus.cases.find(
    ({ id }) => id === "en-ops-001",
  );
  assert.ok(diagnosticCase);
  diagnosticCase.mentions.source[2].canonical = "time:wrong";
  diagnosticCase.mentions.revision[2].canonical = "time:wrong";
  withTemporaryCorpus(failingCorpus, (path) => {
    const mismatch = runCli([
      "--corpus",
      path,
      "--case",
      "en-ops-001",
      "--format",
      "json",
    ]);
    assert.equal(mismatch.status, 1, mismatch.stderr);
    const result = JSON.parse(mismatch.stdout) as {
      passed: boolean;
      gateFailures: unknown[];
      failures: unknown[];
    };
    assert.equal(result.passed, false);
    assert.deepEqual(result.gateFailures, []);
    assert.ok(result.failures.length > 0);
  });
});

test("default JSON names all versus gated data and invalid CLI exits 2", () => {
  const cli = runCli(["--format", "json"]);
  assert.equal(cli.status, 0, cli.stderr);
  const output = JSON.parse(cli.stdout) as {
    passed: boolean;
    mode: string;
    thresholdsAppliedTo: string;
    all: object;
    gated: object;
  };
  assert.equal(output.passed, true);
  assert.equal(output.mode, "public-regression-gate");
  assert.equal(output.thresholdsAppliedTo, "split=gate");
  assert.ok(output.all);
  assert.ok(output.gated);

  const invalid = runCli(["--format", "yaml"]);
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /--format must be text or json/);
});
