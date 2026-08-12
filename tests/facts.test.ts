import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  compareFacts,
  countRequiredNotInSource,
  extractFacts,
} from "../src/lib/facts.ts";
import { buildMarkdownReport } from "../src/lib/report.ts";

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

test("keeps arbitrary precision for numbers, money, and measurements", () => {
  for (const [source, revision] of [
    ["Reference 9007199254740992.", "Reference 9007199254740993."],
    [
      "Balance $9,007,199,254,740,992.",
      "Balance $9,007,199,254,740,993.",
    ],
    ["Dose 0.0000000000004 g.", "Dose 0 g."],
  ]) {
    const comparison = compareFacts(source, revision);
    assert.equal(comparison.preservedCount, 0, source);
    assert.equal(comparison.reviewCount, 1, source);
  }

  assert.equal(
    extractFacts("0.001 kg and 1 g")[0]?.normalized,
    extractFacts("0.001 kg and 1 g")[1]?.normalized,
  );
  assert.equal(extractFacts("人民币0.000000001亿")[0]?.normalized, "CNY:0.1");
});

test("recognizes prefixed Chinese currency names and anchors money suffixes", () => {
  for (const [raw, normalized] of [
    ["人民币0.000000001亿", "CNY:0.1"],
    ["美元0.01万", "USD:100"],
    ["欧元2", "EUR:2"],
    ["英镑2", "GBP:2"],
    ["日元2", "JPY:2"],
    ["港元2", "HKD:2"],
    ["加元2", "CAD:2"],
    ["澳元2", "AUD:2"],
    ["RMB100", "CNY:100"],
    ["RMB100m", "CNY:100000000"],
  ] as const) {
    const fact = extractFacts(raw)[0];
    assert.equal(fact?.kind, "money", raw);
    assert.equal(fact?.normalized, normalized, raw);
  }
});

test("preserves signs and compound currency identity", () => {
  assert.deepEqual(
    extractFacts("Delta +5, ＋6, and ﹢7.")
      .filter((fact) => fact.kind === "number")
      .map(({ raw, normalized }) => ({ raw, normalized })),
    [
      { raw: "+5", normalized: "5" },
      { raw: "＋6", normalized: "6" },
      { raw: "﹢7", normalized: "7" },
    ],
  );

  for (const [source, revision] of [
    ["Delta -5.", "Delta +5."],
    ["Delta -5.", "Delta ＋5."],
    ["Delta -5.", "Delta ﹢5."],
    ["Margin -5%.", "Margin 5%."],
    ["Balance -$100.", "Balance $100."],
    ["Balance $-100.", "Balance $100."],
    ["Price CAD $100.", "Price USD $100."],
    ["Loss ($100).", "Loss $100."],
  ]) {
    const comparison = compareFacts(source, revision);
    assert.equal(comparison.preservedCount, 0, source);
    assert.equal(comparison.reviewCount, 1, source);
    assert.equal(comparison.addedCount, 0, source);
  }
});

test("treats dotted calendar years as dates before bare versions", () => {
  const equivalent = compareFacts(
    "Deadline 2026.09.15.",
    "Deadline 2026/09/15.",
  );
  const invalid = compareFacts(
    "Deadline 2026.02.30.",
    "Deadline 2026.02.30.",
  );

  assert.equal(equivalent.preservedCount, 1);
  assert.equal(equivalent.sourceFacts[0]?.kind, "date");
  assert.equal(invalid.sourceFacts[0]?.kind, "date");
  assert.equal(invalid.sourceFacts[0]?.reviewReason, "invalid");
});

test("flags recognizable invalid times", () => {
  for (const value of ["25:99", "25点99分", "13:00 pm"]) {
    const comparison = compareFacts(`Starts ${value}.`, `Starts ${value}.`);
    assert.equal(comparison.sourceFacts[0]?.kind, "time", value);
    assert.equal(comparison.sourceFacts[0]?.reviewReason, "invalid", value);
  }
});

test("extracts full-width numeric facts without changing source offsets", () => {
  const source = "预算￥３０，０００，日期２０２６．０９．１５，人数１００人。";
  const facts = extractFacts(source);

  assert.deepEqual(
    facts.map(({ kind, raw, normalized }) => ({ kind, raw, normalized })),
    [
      { kind: "money", raw: "￥３０，０００", normalized: "CNY:30000" },
      { kind: "date", raw: "２０２６．０９．１５", normalized: "2026-09-15" },
      { kind: "measurement", raw: "１００人", normalized: "100:person" },
    ],
  );
  for (const fact of facts) {
    assert.equal(source.slice(fact.start, fact.end), fact.raw);
  }
});

test("does not treat contractions and possessives as quoted facts", () => {
  const facts = extractFacts("Don't change Bob's 10 users.");
  assert.equal(facts.some((fact) => fact.kind === "quote"), false);
});

test("matches reordered duplicates across natural separators", () => {
  for (const separator of [" and ", " 和 ", "、", " • ", " — ", "\t"]) {
    const comparison = compareFacts(
      `Alpha 100${separator}Beta 100`,
      `Beta 100${separator}Alpha 80`,
    );
    const values = comparison.sourceFacts.filter((fact) => fact.raw === "100");
    assert.equal(values[0]?.possibleMatch?.raw, "80", separator);
    assert.equal(values[1]?.matched?.raw, "100", separator);
    assert.equal(comparison.addedCount, 0, separator);
  }
});

test("keeps comparison target ids one-to-one and totals internally consistent", () => {
  const comparison = compareFacts(
    "Alpha 10. Beta 20. Gamma 30.",
    "Beta 30. Gamma 10. Alpha 20. Delta 40.",
  );
  const targetIds = comparison.sourceFacts
    .map((fact) => fact.matched?.id ?? fact.possibleMatch?.id)
    .filter((id): id is string => Boolean(id));

  assert.equal(new Set(targetIds).size, targetIds.length);
  assert.equal(
    comparison.preservedCount + comparison.reviewCount,
    comparison.sourceFacts.length,
  );
  assert.equal(comparison.addedCount, comparison.addedFacts.length);
  assert.equal(
    targetIds.length + comparison.addedFacts.length,
    extractFacts("Beta 30. Gamma 10. Alpha 20. Delta 40.").length,
  );
});

test("counts invalid required entries without extracting automatic facts", () => {
  assert.equal(
    countRequiredNotInSource(
      "Acme launches Project Atlas with 100 users.",
      "Acme\nProject Atlas\nVIP\nVIP",
    ),
    1,
  );
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

test("matches repeated facts to the correct context", () => {
  const filler = "Filler sentence without numeric values. ".repeat(5);
  const comparison = compareFacts(
    `Alpha group has 100 users. ${filler}Beta group has 100 users.`,
    `Alpha group has 80 users. ${filler}Beta group has 100 users.`,
  );
  const [alpha, beta] = comparison.sourceFacts;

  assert.equal(alpha?.status, "review");
  assert.equal(alpha?.possibleMatch?.raw, "80");
  assert.match(alpha?.possibleMatch?.context ?? "", /Alpha group/);
  assert.equal(beta?.status, "preserved");
  assert.match(beta?.matched?.context ?? "", /Beta group/);
});

test("reserves exact repeated matches before suggesting changes", () => {
  const comparison = compareFacts(
    "Alpha is 100. Beta remains 100.",
    "Alpha was removed. Beta remains 100.",
  );
  const [alpha, beta] = comparison.sourceFacts;

  assert.equal(alpha?.status, "review");
  assert.equal(alpha?.possibleMatch, undefined);
  assert.equal(beta?.status, "preserved");
  assert.ok(beta?.matched?.id);
});

test("uses context before value when two facts swap", () => {
  const comparison = compareFacts(
    "Alpha has 100 users. Beta has 200 users.",
    "Alpha has 200 users. Beta has 100 users.",
  );

  assert.deepEqual(
    comparison.sourceFacts.map((fact) => ({
      raw: fact.raw,
      status: fact.status,
      possible: fact.possibleMatch?.raw,
    })),
    [
      { raw: "100", status: "review", possible: "200" },
      { raw: "200", status: "review", possible: "100" },
    ],
  );
  assert.equal(comparison.addedCount, 0);
});

test("uses mutual context when facts compete for one revision", () => {
  const comparison = compareFacts(
    "Alpha has 100 users. Beta has 200 users.",
    "Alpha has 200 users.",
  );
  const [alpha, beta] = comparison.sourceFacts;

  assert.equal(alpha?.status, "review");
  assert.equal(alpha?.possibleMatch?.raw, "200");
  assert.match(alpha?.possibleMatch?.context ?? "", /Alpha/);
  assert.equal(beta?.status, "review");
  assert.equal(beta?.possibleMatch, undefined);
  assert.equal(comparison.addedCount, 0);
});

test("preserves distinct values after their subjects reorder", () => {
  const comparison = compareFacts(
    "Alpha has 100 users. Beta has 200 users.",
    "Beta has 200 users. Alpha has 100 users.",
  );
  const [alpha, beta] = comparison.sourceFacts;

  assert.equal(alpha?.status, "preserved");
  assert.equal(alpha?.matched?.start, 30);
  assert.equal(beta?.status, "preserved");
  assert.equal(beta?.matched?.start, 9);
});

test("keeps numeric labels when pairing reordered duplicate values", () => {
  const comparison = compareFacts(
    "Q1 revenue is 100. Q2 revenue is 100.",
    "Q2 revenue is 100. Q1 revenue is 80.",
  );
  const values = comparison.sourceFacts.filter((fact) => fact.raw === "100");

  assert.equal(values[0]?.status, "review");
  assert.equal(values[0]?.possibleMatch?.raw, "80");
  assert.equal(values[1]?.status, "preserved");
  assert.equal(values[1]?.matched?.start, 14);
});

test("uses list separators as context boundaries", () => {
  for (const separator of [" / ", " | ", ", "]) {
    const comparison = compareFacts(
      `Alpha 100${separator}Beta 100`,
      `Beta 100${separator}Alpha 80`,
    );
    const [alpha, beta] = comparison.sourceFacts;

    assert.equal(alpha?.status, "review", separator);
    assert.equal(alpha?.possibleMatch?.raw, "80", separator);
    assert.equal(beta?.status, "preserved", separator);
    assert.equal(beta?.matched?.raw, "100", separator);
    assert.equal(comparison.addedCount, 0, separator);
  }
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

test("checks user-defined must-preserve content line by line", () => {
  const comparison = compareFacts(
    "Acme launches Project Atlas.",
    "ACME launches a renamed project.",
    "Acme\nProject Atlas",
  );

  const requiredFacts = comparison.requiredFacts;
  assert.equal(requiredFacts.length, 2);
  assert.equal(requiredFacts[0]?.status, "preserved");
  assert.equal(requiredFacts[1]?.status, "review");
  assert.equal(requiredFacts[1]?.reviewReason, "missing");
});

test("deduplicates required content and avoids partial English-word matches", () => {
  const comparison = compareFacts(
    "Keep AI and Acme unchanged.",
    "The text said Acmeology instead.",
    "AI\nAI\nAcme",
  );
  const requiredFacts = comparison.requiredFacts;

  assert.equal(requiredFacts.length, 2);
  assert.equal(requiredFacts[0]?.status, "review");
  assert.equal(requiredFacts[1]?.status, "review");
});

test("uses Unicode word boundaries without blocking embedded Chinese phrases", () => {
  assert.equal(countRequiredNotInSource("Only cafetería is available.", "café"), 1);
  assert.equal(countRequiredNotInSource("Only cafés are available.", "café"), 1);
  assert.equal(countRequiredNotInSource("请务必保留这段原文。", "必保留"), 0);

  const comparison = compareFacts(
    "请务必保留这段原文。",
    "新稿仍必保留这段原文。",
    "必保留",
  );
  assert.equal(comparison.requiredPreservedCount, 1);
});

test("keeps must-preserve checks separate from automatic fact totals", () => {
  const comparison = compareFacts(
    "The budget is $100.",
    "The budget remains $100.",
    "$100",
  );

  assert.equal(comparison.sourceFacts.length, 1);
  assert.equal(comparison.preservedCount, 1);
  assert.equal(comparison.requiredCount, 1);
  assert.equal(comparison.requiredPreservedCount, 1);
  assert.equal(comparison.requiredCheckableCount, 1);
});

test("rejects must-preserve content that is absent from the source", () => {
  const rewriteOnly = compareFacts(
    "The standard plan is available.",
    "The VIP plan is available.",
    "VIP",
  );
  const absentEverywhere = compareFacts(
    "The standard plan is available.",
    "The basic plan is available.",
    "VIP",
  );

  assert.equal(rewriteOnly.requiredPreservedCount, 0);
  assert.equal(rewriteOnly.requiredNotInSourceCount, 1);
  assert.equal(rewriteOnly.requiredCheckableCount, 0);
  assert.equal(rewriteOnly.requiredFacts[0]?.reviewReason, "not-in-source");
  assert.ok(rewriteOnly.requiredFacts[0]?.matched);
  assert.equal(absentEverywhere.requiredFacts[0]?.reviewReason, "not-in-source");
  assert.equal(absentEverywhere.requiredFacts[0]?.matched, undefined);

  const report = buildMarkdownReport(rewriteOnly, "en");
  assert.match(
    report,
    /appearing only in the rewrite is not preservation/,
  );
});

test("counts a source-only required item as missing from the rewrite", () => {
  const comparison = compareFacts(
    "Project Atlas launches today.",
    "The project launches today.",
    "Project Atlas",
  );

  assert.equal(comparison.requiredCheckableCount, 1);
  assert.equal(comparison.requiredMissingCount, 1);
  assert.equal(comparison.requiredPreservedCount, 0);
});

test("maps normalized required content back to original values and contexts", () => {
  for (const [source, revision, requiredValue, sourceRaw, revisionRaw] of [
    [
      "  Brand   Ａlpha ships today.",
      "Brand Alpha ships tomorrow.",
      "Brand Alpha",
      "Brand   Ａlpha",
      "Brand Alpha",
    ],
    ["cafe\u0301 ships today.", "café ships tomorrow.", "café", "cafe\u0301", "café"],
    ["가 ships today.", "가 ships tomorrow.", "가", "가", "가"],
  ]) {
    const comparison = compareFacts(source, revision, requiredValue);
    const required = comparison.requiredFacts[0];

    assert.equal(required?.status, "preserved", requiredValue);
    assert.equal(required?.sourceMatch?.raw, sourceRaw, requiredValue);
    assert.equal(required?.matched?.raw, revisionRaw, requiredValue);
    assert.ok(
      required?.sourceMatch?.context.includes(sourceRaw.replace(/\s+/gu, " ")),
      requiredValue,
    );
    assert.ok(required?.matched?.context.includes(revisionRaw), requiredValue);
  }
});

test("builds a deterministic bilingual Markdown report", () => {
  const comparison = compareFacts(
    "预算为¥30,000，日期为2026-09-15。",
    "预算为3万元，日期为2026-09-18。",
    "预算",
  );
  const report = buildMarkdownReport(
    comparison,
    "zh",
    {
      generatedAt: new Date("2026-08-11T00:00:00.000Z"),
      appVersion: "0.1.5",
      commitSha: "0123456789abcdef0123456789abcdef01234567",
    },
  );

  assert.match(report, /# KeepFacts 核对报告/);
  assert.match(report, /\*\*生成时间:\*\* 2026-08-11/);
  assert.match(report, /\*\*KeepFacts 版本:\*\* v0\.1\.5/);
  assert.match(report, /0123456789abcdef0123456789abcdef01234567/);
  assert.match(report, /## 自动事实摘要/);
  assert.match(report, /## 必须保留摘要/);
  assert.match(report, /\| 已保留 \| 1 \|/);
  assert.match(report, /\| 需确认 \| 1 \|/);
  assert.match(report, /\| 必保项目 \| 1 \|/);
  assert.match(report, /\| 必保保留率 \| 100% \|/);
  assert.match(report, /2026-09-15/);
  assert.match(report, /2026-09-18/);
  assert.match(report, /\*\*原文值:\*\* `¥30,000`/);
  assert.match(report, /\*\*改写值:\*\* `3万元`/);
  assert.match(report, /\*\*原文语境:\*\*/);
  assert.match(report, /\*\*改写语境:\*\*/);
});

test("preserves backticks in Markdown report values", () => {
  const comparison = compareFacts("Use `v1`.", "Use `v2`.", "`v1`");
  const report = buildMarkdownReport(
    comparison,
    "en",
    new Date("2026-08-11T00:00:00.000Z"),
  );

  assert.match(report, /`` `v1` ``/);
});

test("formats report dates in local time", () => {
  const generatedAt = new Date(2026, 7, 12, 0, 30);
  const comparison = compareFacts("10 users", "10 users");
  const report = buildMarkdownReport(comparison, "en", generatedAt);

  assert.match(report, /\*\*Generated:\*\* 2026-08-12/);
});

test("omits empty required report sections and records both sides of every fact", () => {
  const comparison = compareFacts(
    "Alpha has 100 users. Beta has 200 users.",
    "Alpha has 80 users. Beta is omitted. Gamma has 300 users.",
  );
  const report = buildMarkdownReport(comparison, "en", {
    generatedAt: new Date(2026, 7, 12, 12, 0),
    appVersion: "0.1.5",
    commitSha: "test-sha",
  });

  assert.doesNotMatch(report, /Must-preserve summary/);
  assert.doesNotMatch(report, /Must-preserve checks/);
  assert.match(report, /## Automatic facts: needs review/);
  assert.match(report, /## Automatic facts: new in rewrite/);
  assert.match(report, /\*\*Source value:\*\*/);
  assert.match(report, /\*\*Rewrite value:\*\*/);
  assert.match(report, /\*\*Source context:\*\*/);
  assert.match(report, /\*\*Rewrite context:\*\*/);
  assert.match(report, /\*\*Rewrite value:\*\* Not found/);
  assert.match(report, /\*\*Source value:\*\* Not found/);
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
