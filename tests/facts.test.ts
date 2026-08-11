import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { compareFacts, extractFacts } from "../src/lib/facts.ts";

interface ValidationCase {
  id: string;
  category: string;
  source: string;
  revision: string;
  expected: {
    preserved: number;
    review: number;
    added: number;
  };
}

const validationCases = JSON.parse(
  readFileSync(new URL("./validation-cases.json", import.meta.url), "utf8"),
) as ValidationCase[];

test("extracts common hard facts without overlapping nested numbers", () => {
  const facts = extractFacts(
    "2026年9月15日发布 v1.2.0，预算 ¥30,000，100名用户，转化率12.5%，联系 hello@example.com。",
  );

  assert.deepEqual(
    facts.map((fact) => fact.kind),
    [
      "date",
      "version",
      "money",
      "measurement",
      "percentage",
      "email",
    ],
  );
});

test("normalizes equivalent dates, money, and units across formats", () => {
  const comparison = compareFacts(
    "日期是2026-09-15，预算为¥30,000，共100人。",
    "日期是2026年9月15日，预算为3万元，共100 people。",
  );

  assert.equal(comparison.reviewCount, 0);
  assert.equal(comparison.preservedCount, 3);
});

test("flags changed and missing source facts", () => {
  const comparison = compareFacts(
    "将在2026年9月15日邀请100名用户，详情见 https://example.com/launch。",
    "将在2026年9月18日邀请80名用户。",
  );

  assert.equal(comparison.reviewCount, 3);
  assert.equal(comparison.addedCount, 0);
  assert.equal(
    comparison.sourceFacts.find((fact) => fact.kind === "date")?.possibleMatch
      ?.raw,
    "2026年9月18日",
  );
  assert.equal(
    comparison.sourceFacts.find((fact) => fact.kind === "url")?.possibleMatch,
    undefined,
  );
});

test("uses multiset matching for repeated facts", () => {
  const comparison = compareFacts("两组各10人和10人。", "目前只有一组10人。");

  assert.equal(comparison.preservedCount, 1);
  assert.equal(comparison.reviewCount, 1);
});

test("reports facts introduced only in the rewrite", () => {
  const comparison = compareFacts(
    "共有10人参加。",
    "共有10人参加，活动日期为2026年9月15日。",
  );

  assert.equal(comparison.preservedCount, 1);
  assert.equal(comparison.addedCount, 1);
  assert.equal(comparison.addedFacts[0]?.kind, "date");
});

test("preserves URL host casing but not case-sensitive path changes", () => {
  const hostOnly = compareFacts(
    "See https://EXAMPLE.com.",
    "See https://example.com/.",
  );
  const pathChange = compareFacts(
    "See https://example.com/File.",
    "See https://example.com/file.",
  );

  assert.equal(hostOnly.preservedCount, 1);
  assert.equal(pathChange.preservedCount, 0);
  assert.equal(pathChange.reviewCount, 1);
});

test("normalizes safe mass, length, duration, and range conversions", () => {
  const comparison = compareFacts(
    "重1 kg，长1 km，持续1 hour，范围1-2 kg。",
    "重1000 g，长1000 m，持续60 minutes，范围1000-2000 g。",
  );

  assert.equal(comparison.preservedCount, 4);
  assert.equal(comparison.reviewCount, 0);
});

test("does not force unrelated single numbers into a possible match", () => {
  const comparison = compareFacts(
    "Invoice total is 10.",
    "Employee count is 20.",
  );

  assert.equal(comparison.reviewCount, 1);
  assert.equal(comparison.addedCount, 1);
  assert.equal(comparison.sourceFacts[0]?.reviewReason, "missing");
});

test("flags impossible calendar dates for review", () => {
  const comparison = compareFacts(
    "Deadline: 2026-02-30.",
    "Deadline: 2026-02-30.",
  );

  assert.equal(comparison.preservedCount, 0);
  assert.equal(comparison.reviewCount, 1);
  assert.equal(comparison.sourceFacts[0]?.reviewReason, "invalid");
});

test("passes the public validation corpus", () => {
  for (const validationCase of validationCases) {
    const comparison = compareFacts(
      validationCase.source,
      validationCase.revision,
    );
    const actual = {
      preserved: comparison.preservedCount,
      review: comparison.reviewCount,
      added: comparison.addedCount,
    };

    assert.deepEqual(actual, validationCase.expected, validationCase.id);
  }
});
