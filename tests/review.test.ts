import assert from "node:assert/strict";
import test from "node:test";

import { compareFacts } from "../src/lib/facts.ts";
import { buildMarkdownReport } from "../src/lib/report.ts";
import {
  getReviewItems,
  getReviewOutcome,
  reviewDecisionKey,
  summarizeReviews,
  type ReviewDecisions,
} from "../src/lib/review.ts";

function reviewFixture() {
  return compareFacts(
    "Alpha has 100 users. Keep the Northstar name.",
    "Alpha has 80 users. Keep the project name. Launch on 2026-09-15.",
    "Northstar",
  );
}

test("collects reviewable items from automatic, required, and added scopes", () => {
  const comparison = reviewFixture();
  const items = getReviewItems(comparison);

  assert.deepEqual(
    items.map(({ scope }) => scope),
    ["source", "required", "added"],
  );
  assert.equal(new Set(items.map(({ key }) => key)).size, items.length);
  assert.ok(items.every(({ key, scope, fact }) => key === reviewDecisionKey(scope, fact)));
});

test("summarizes pending, confirmed, accepted, and ignored decisions", () => {
  const comparison = reviewFixture();
  const items = getReviewItems(comparison);
  const decisions: ReviewDecisions = {
    [items[0].key]: "confirmed",
    [items[1].key]: "accepted",
    [items[2].key]: "ignored",
    "source:orphan": "confirmed",
  };

  assert.deepEqual(summarizeReviews(comparison, decisions), {
    total: 3,
    pending: 0,
    confirmed: 1,
    accepted: 1,
    ignored: 1,
  });

  delete decisions[items[1].key];
  assert.deepEqual(summarizeReviews(comparison, decisions), {
    total: 3,
    pending: 1,
    confirmed: 1,
    accepted: 0,
    ignored: 1,
  });
});

test("derives final review outcomes from pending and confirmed decisions", () => {
  assert.equal(
    getReviewOutcome({
      total: 0,
      pending: 0,
      confirmed: 0,
      accepted: 0,
      ignored: 0,
    }),
    "no-review",
  );
  assert.equal(
    getReviewOutcome({
      total: 3,
      pending: 1,
      confirmed: 2,
      accepted: 0,
      ignored: 0,
    }),
    "draft",
  );
  assert.equal(
    getReviewOutcome({
      total: 3,
      pending: 0,
      confirmed: 1,
      accepted: 1,
      ignored: 1,
    }),
    "needs-changes",
  );
  assert.equal(
    getReviewOutcome({
      total: 3,
      pending: 0,
      confirmed: 0,
      accepted: 2,
      ignored: 1,
    }),
    "acceptable",
  );
});

test("exports human decisions without changing automatic metrics", () => {
  const comparison = reviewFixture();
  const items = getReviewItems(comparison);
  const decisions: ReviewDecisions = {
    [items[0].key]: "confirmed",
    [items[1].key]: "accepted",
  };
  const report = buildMarkdownReport(comparison, "en", {
    generatedAt: new Date(2026, 7, 13, 9, 30),
    appVersion: "0.2.1",
    commitSha: "test-sha",
    reviewDecisions: decisions,
  });

  assert.match(report, /## Human review summary/);
  assert.match(report, /\| Report status \| Draft \(pending items remain\) \|/);
  assert.match(report, /\| Extracted-fact retention \|/);
  assert.match(report, /Retention includes extracted exact facts only/);
  assert.match(report, /\| Reviewable items \| 3 \|/);
  assert.match(report, /\| Pending \| 1 \|/);
  assert.match(report, /\| Confirmed issue \| 1 \|/);
  assert.match(report, /\| Acceptable rewrite \| 1 \|/);
  assert.match(report, /\*\*Human decision:\*\* `Confirmed issue`/);
  assert.match(report, /\*\*Human decision:\*\* `Acceptable rewrite`/);
  assert.match(report, /\*\*Human decision:\*\* `Pending`/);
  assert.match(report, /\| Needs review \| 1 \|/);
  assert.match(report, /\| New in rewrite \| 1 \|/);

  const needsChanges = buildMarkdownReport(comparison, "en", {
    reviewDecisions: {
      [items[0].key]: "confirmed",
      [items[1].key]: "accepted",
      [items[2].key]: "ignored",
    },
  });
  assert.match(needsChanges, /\| Report status \| Needs changes \|/);

  const acceptable = buildMarkdownReport(comparison, "en", {
    reviewDecisions: {
      [items[0].key]: "accepted",
      [items[1].key]: "accepted",
      [items[2].key]: "ignored",
    },
  });
  assert.match(
    acceptable,
    /\| Report status \| Review complete · no confirmed issues \|/,
  );
});
