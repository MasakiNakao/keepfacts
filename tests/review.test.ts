import assert from "node:assert/strict";
import test from "node:test";

import {
  compareFacts,
  type ComparedFact,
  type FactComparison,
} from "../src/lib/facts.ts";
import {
  buildFixListMarkdown,
  buildMarkdownReport,
} from "../src/lib/report.ts";
import {
  getFixList,
  getNextPendingReviewKey,
  getReviewOrder,
  getReviewItems,
  getReviewOutcome,
  migrateReviewRecords,
  normalizeReviewRecord,
  normalizeReviewText,
  orderReviewQueue,
  reconcileReviewRecords,
  reviewDecisionKey,
  summarizeReviews,
  updateReviewRecord,
  type ReviewDecisions,
  type ReviewRecords,
  type ReviewSnapshot,
} from "../src/lib/review.ts";

function reviewFixture() {
  return compareFacts(
    "Alpha has 100 users. Keep the Northstar name.",
    "Alpha has 80 users. Keep the project name. Launch on 2026-09-15.",
    "Northstar",
  );
}

function snapshot(
  source: string,
  revision: string,
  required = "",
): ReviewSnapshot {
  return {
    input: { source, revision, required },
    comparison: compareFacts(source, revision, required),
  };
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
  const records: ReviewRecords = {
    [items[0].key]: { decision: "confirmed", note: "Restore the user count" },
    [items[1].key]: { decision: "accepted" },
    [items[2].key]: { decision: "ignored" },
    "source:orphan": { decision: "confirmed" },
  };

  assert.deepEqual(summarizeReviews(comparison, records), {
    total: 3,
    pending: 0,
    confirmed: 1,
    accepted: 1,
    ignored: 1,
  });

  delete records[items[1].key];
  assert.deepEqual(summarizeReviews(comparison, records), {
    total: 3,
    pending: 1,
    confirmed: 1,
    accepted: 0,
    ignored: 1,
  });
});

test("normalizes bounded annotations and removes empty records without mutation", () => {
  assert.equal(
    normalizeReviewText(" \u0000note\tline\nnext\u0085 "),
    "note\tline\nnext",
  );
  assert.equal(normalizeReviewText("😀".repeat(300))?.length, 500);
  assert.equal(normalizeReviewText(" \u0000\u007f "), undefined);
  assert.deepEqual(
    normalizeReviewRecord({
      decision: "confirmed",
      note: `  ${"n".repeat(510)}  `,
      expectedFix: "  restore 100  ",
    }),
    {
      decision: "confirmed",
      note: "n".repeat(500),
      expectedFix: "restore 100",
    },
  );

  const original: ReviewRecords = {
    item: { decision: "confirmed", note: "keep" },
  };
  const changed = updateReviewRecord(original, "item", {
    decision: undefined,
    note: " ",
  });
  assert.deepEqual(changed, { item: { note: " " } });
  assert.equal(normalizeReviewRecord(changed.item), undefined);
  assert.deepEqual(original, {
    item: { decision: "confirmed", note: "keep" },
  });

  let typed: ReviewRecords = {};
  for (const character of "hello world\nnext line") {
    typed = updateReviewRecord(typed, "item", {
      note: `${typed.item?.note ?? ""}${character}`,
    });
  }
  assert.equal(typed.item?.note, "hello world\nnext line");
  assert.equal(normalizeReviewRecord(typed.item)?.note, "hello world\nnext line");
});

test("migrates all three scopes across harmless prefix offsets", () => {
  const previous = snapshot(
    "Alpha has 100 users. Keep Northstar.",
    "Alpha has 80 users. Launch on 2026-09-15.",
    "Northstar",
  );
  const next = snapshot(
    "Intro only. Alpha has 100 users. Keep Northstar.",
    "Intro only. Alpha has 80 users. Launch on 2026-09-15.",
    "Northstar",
  );
  const previousItems = getReviewItems(previous.comparison);
  assert.deepEqual(previousItems.map(({ scope }) => scope), [
    "source",
    "required",
    "added",
  ]);
  const records: ReviewRecords = Object.fromEntries(
    previousItems.map((item, index) => [
      item.key,
      {
        decision: (["confirmed", "accepted", "ignored"] as const)[index],
        note: `${item.scope} note`,
        expectedFix: `${item.scope} fix`,
      },
    ]),
  );

  const migrated = migrateReviewRecords(previous, next, records);
  const nextItems = getReviewItems(next.comparison);
  assert.equal(migrated.retainedDecisions, 3);
  assert.equal(migrated.resetDecisions, 0);
  assert.equal(migrated.retainedAnnotations, 3);
  assert.equal(migrated.droppedRecords, 0);
  assert.deepEqual(
    nextItems.map((item) => migrated.records[item.key]?.decision),
    ["confirmed", "accepted", "ignored"],
  );
});

test("keeps annotations but resets a decision when finding evidence changes", () => {
  const previous = snapshot("Alpha has 100 users.", "Alpha has 80 users.");
  const next = snapshot("Alpha has 100 users.", "Alpha has 90 users.");
  const previousItem = getReviewItems(previous.comparison)[0];
  const nextItem = getReviewItems(next.comparison)[0];
  const migrated = migrateReviewRecords(previous, next, {
    [previousItem.key]: {
      decision: "confirmed",
      note: "Customer count changed",
      expectedFix: "Restore 100",
    },
  });

  assert.deepEqual(migrated.records[nextItem.key], {
    note: "Customer count changed",
    expectedFix: "Restore 100",
  });
  assert.equal(migrated.retainedDecisions, 0);
  assert.equal(migrated.resetDecisions, 1);
  assert.equal(migrated.retainedAnnotations, 1);
});

test("drops ambiguous duplicate identities instead of crossing decisions", () => {
  const previous = snapshot(
    "Alpha has 100 users. Alpha has 100 users.",
    "No numeric facts remain.",
  );
  const next = snapshot(
    "Preface. Alpha has 100 users. Alpha has 100 users.",
    "No numeric facts remain.",
  );
  const previousItems = getReviewItems(previous.comparison);
  assert.equal(previousItems.length, 2);
  const migrated = migrateReviewRecords(previous, next, {
    [previousItems[0].key]: {
      decision: "confirmed",
      note: "Do not attach this to the other occurrence",
    },
  });

  assert.deepEqual(migrated.records, {});
  assert.equal(migrated.droppedRecords, 1);
  assert.equal(migrated.ambiguousRecords, 1);
});

test("migrates uniquely named must-preserve records when their lines reorder", () => {
  const previous = snapshot(
    "Keep Alpha and Beta.",
    "Keep neither name.",
    "Alpha\nBeta",
  );
  const next = snapshot(
    "Keep Alpha and Beta.",
    "Keep neither name.",
    "Beta\nAlpha",
  );
  const records: ReviewRecords = {};
  for (const item of getReviewItems(previous.comparison)) {
    records[item.key] = {
      decision: item.fact.normalized === "alpha" ? "confirmed" : "accepted",
      note: item.fact.raw,
    };
  }

  const migrated = migrateReviewRecords(previous, next, records);
  const byValue = new Map(
    getReviewItems(next.comparison).map((item) => [
      item.fact.normalized,
      migrated.records[item.key],
    ]),
  );
  assert.equal(byValue.get("alpha")?.decision, "confirmed");
  assert.equal(byValue.get("beta")?.decision, "accepted");
  assert.equal(migrated.retainedDecisions, 2);
  assert.equal(migrated.droppedRecords, 0);
});

test("reconciles orphan records and orders pending review with stable wraparound", () => {
  const comparison = reviewFixture();
  const order = getReviewOrder(comparison);
  const records: ReviewRecords = {
    [order[0]]: { decision: "confirmed" },
    [order[1]]: { note: "Still pending" },
    [order[2]]: { decision: "ignored" },
    "source:orphan": { decision: "confirmed" },
    empty: {},
  };

  assert.deepEqual(Object.keys(reconcileReviewRecords(comparison, records)), order);
  assert.equal(getNextPendingReviewKey(comparison, records), order[1]);
  assert.equal(getNextPendingReviewKey(comparison, records, order[1]), order[1]);
  assert.deepEqual(orderReviewQueue(order, records), [
    order[1],
    order[0],
    order[2],
  ]);
  assert.deepEqual(orderReviewQueue(order, records, order[2]), [
    order[1],
    order[2],
    order[0],
  ]);
  assert.deepEqual(
    orderReviewQueue(order, records, "not-in-queue"),
    [order[1], order[0], order[2]],
  );

  const completed: ReviewRecords = Object.fromEntries(
    order.map((key) => [key, { decision: "accepted" }]),
  );
  assert.equal(getNextPendingReviewKey(comparison, completed), undefined);
});

test("builds a confirmed-only fix list in source, required, added order", () => {
  const comparison = reviewFixture();
  const items = getReviewItems(comparison);
  const fixes = getFixList(comparison, {
    [items[0].key]: {
      decision: "confirmed",
      note: "Wrong user count",
      expectedFix: "Restore 100",
    },
    [items[1].key]: { decision: "accepted" },
    [items[2].key]: { decision: "confirmed", note: "Remove the new date" },
    "source:orphan": { decision: "confirmed" },
  });

  assert.deepEqual(fixes.map(({ scope }) => scope), ["source", "added"]);
  assert.deepEqual(fixes.map(({ record }) => record.expectedFix), [
    "Restore 100",
    undefined,
  ]);
});

function syntheticSnapshot(prefix: string, count: number): ReviewSnapshot {
  const sourceParts = [prefix];
  const sourceFacts: ComparedFact[] = [];
  let offset = prefix.length;
  for (let index = 0; index < count; index += 1) {
    const lead = `Item${index} has `;
    const raw = String(100_000 + index);
    const tail = " users. ";
    sourceParts.push(lead, raw, tail);
    const start = offset + lead.length;
    const end = start + raw.length;
    sourceFacts.push({
      id: `number-${start}-${end}`,
      kind: "number",
      raw,
      normalized: raw,
      valid: true,
      start,
      end,
      context: `${lead}${raw}${tail}`.trim(),
      status: "review",
      reviewReason: "missing",
    });
    offset = end + tail.length;
  }
  const comparison: FactComparison = {
    sourceFacts,
    requiredFacts: [],
    addedFacts: [],
    preservedCount: 0,
    reviewCount: count,
    addedCount: 0,
    requiredCount: 0,
    requiredPreservedCount: 0,
    requiredMissingCount: 0,
    requiredNotInSourceCount: 0,
    requiredCheckableCount: 0,
  };
  return {
    input: { source: sourceParts.join(""), revision: "", required: "" },
    comparison,
  };
}

test("migrates a 1000-item queue through indexed one-to-one groups", () => {
  const previous = syntheticSnapshot("", 1_000);
  const next = syntheticSnapshot("Preface. ", 1_000);
  const records: ReviewRecords = Object.fromEntries(
    getReviewItems(previous.comparison).map((item) => [
      item.key,
      { decision: "confirmed" },
    ]),
  );

  const migrated = migrateReviewRecords(previous, next, records);
  assert.equal(Object.keys(migrated.records).length, 1_000);
  assert.equal(migrated.retainedDecisions, 1_000);
  assert.equal(migrated.droppedRecords, 0);
  assert.equal(migrated.ambiguousRecords, 0);
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

test("exports safe confirmed-only fix lists and embeds the same section", () => {
  const comparison = reviewFixture();
  const items = getReviewItems(comparison);
  const records: ReviewRecords = {
    [items[0].key]: {
      decision: "confirmed",
      note: "Line *one*\n`two` <tag>",
      expectedFix: "Restore 100\n- verify",
    },
    [items[1].key]: {
      decision: "confirmed",
      note: "Must preserve the name",
    },
    [items[2].key]: {
      decision: "confirmed",
      expectedFix: "Remove the new date",
    },
  };

  const fixList = buildFixListMarkdown(comparison, "en", records);
  assert.equal((fixList.match(/^- \[ \]/gmu) ?? []).length, 3);
  const sourceIndex = fixList.indexOf("Automatic fact · Number");
  const requiredIndex = fixList.indexOf("Must-preserve · Required");
  const addedIndex = fixList.indexOf("New in rewrite · Date");
  assert.ok(sourceIndex >= 0);
  assert.ok(sourceIndex < requiredIndex);
  assert.ok(requiredIndex < addedIndex);
  assert.match(fixList, /Possibly changed to `80`/);
  assert.match(fixList, /\*\*Expected fix:\*\* Restore 100<br>\\- verify/);
  assert.match(fixList, /\*\*Note:\*\* Line \\\*one\\\*<br>\\`two\\` &lt;tag&gt;/);
  assert.match(fixList, /\*\*Expected fix:\*\* Not specified/);
  assert.match(fixList, /\*\*Source value:\*\* `100`/);
  assert.match(fixList, /\*\*Rewrite value:\*\* `80`/);
  assert.match(fixList, /\*\*Source context:\*\*/);
  assert.match(fixList, /\*\*Rewrite context:\*\*/);
  assert.doesNotMatch(fixList, /keepfacts-review-fingerprint/);

  const report = buildMarkdownReport(comparison, "en", {
    reviewRecords: records,
  });
  assert.ok(report.includes(fixList.trim()));
  assert.match(
    report,
    /not persisted automatically; reports or session files you explicitly export may contain decisions, notes, and expected fixes/,
  );
  assert.ok((report.match(/\*\*Note:\*\*/gu) ?? []).length >= 6);
  assert.ok((report.match(/\*\*Expected fix:\*\*/gu) ?? []).length >= 6);
});

test("keeps legacy decisions compatible and omits an empty fix-list section", () => {
  const comparison = reviewFixture();
  const items = getReviewItems(comparison);
  const legacy: ReviewDecisions = {
    [items[0].key]: "accepted",
    [items[1].key]: "ignored",
    [items[2].key]: "accepted",
  };
  const report = buildMarkdownReport(comparison, "en", {
    reviewDecisions: legacy,
  });

  assert.match(report, /\*\*Human decision:\*\* `Acceptable rewrite`/);
  assert.match(report, /\*\*Note:\*\* None/);
  assert.match(report, /\*\*Expected fix:\*\* Not specified/);
  assert.doesNotMatch(report, /^## Fix list$/mu);
});
