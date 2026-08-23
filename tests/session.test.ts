import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { compareFacts } from "../src/lib/facts.ts";
import {
  KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH,
  KEEPFACTS_MAX_REQUIRED_ITEMS,
  KEEPFACTS_MAX_REQUIRED_LENGTH,
  KEEPFACTS_MAX_TEXT_LENGTH,
} from "../src/lib/input-limits.ts";
import { getReviewItems } from "../src/lib/review.ts";
import {
  KEEPFACTS_SESSION_FORMAT,
  KEEPFACTS_SESSION_MAX_BYTES,
  KEEPFACTS_SESSION_MAX_REQUIRED_ITEM_LENGTH,
  KEEPFACTS_SESSION_MAX_REQUIRED_ITEMS,
  KEEPFACTS_SESSION_MAX_REQUIRED_LENGTH,
  KEEPFACTS_SESSION_MAX_REVIEW_KEY_LENGTH,
  KEEPFACTS_SESSION_MAX_REVIEW_RECORDS,
  KEEPFACTS_SESSION_MAX_REVIEW_TEXT_LENGTH,
  KEEPFACTS_SESSION_MAX_TEXT_LENGTH,
  KEEPFACTS_SESSION_SCHEMA_VERSION,
  KeepFactsSessionError,
  parseKeepFactsSession,
  reconcileKeepFactsReviewRecords,
  serializeKeepFactsSession,
  validateKeepFactsSession,
  type KeepFactsSessionErrorCode,
  type KeepFactsSessionV1,
} from "../src/lib/session.ts";

function validSession(): KeepFactsSessionV1 {
  return {
    format: KEEPFACTS_SESSION_FORMAT,
    schemaVersion: KEEPFACTS_SESSION_SCHEMA_VERSION,
    exportedAt: "2026-08-13T09:30:00.000Z",
    generator: {
      appVersion: "0.3.0",
      commitSha: "e4a1dbf5720cdfcf4338625eb8440340de94c51b",
    },
    privacy: {
      containsFullText: true,
      encrypted: false,
    },
    locale: "zh",
    editor: {
      source: "Alpha has 100 users. Draft 42.",
      revision: "Alpha has 80 users. Draft 42.",
      required: "Alpha",
    },
    result: {
      input: {
        source: "Alpha has 100 users.",
        revision: "Alpha has 80 users.",
        required: "Alpha",
      },
      reviewRecords: [
        {
          key: "source:number-10-13",
          decision: "confirmed",
          note: "Customer count changed",
          expectedFix: "Restore 100",
        },
      ],
    },
  };
}

function changedSession(change: (session: Record<string, any>) => void) {
  const session = structuredClone(validSession()) as Record<string, any>;
  change(session);
  return session;
}

function expectSessionError(
  operation: () => unknown,
  code: KeepFactsSessionErrorCode,
  path?: string,
) {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof KeepFactsSessionError);
    assert.equal(error.code, code);
    if (path !== undefined) assert.equal(error.path, path);
    return true;
  });
}

test("keeps schema-v1 limit aliases tied to the shared input contract", () => {
  assert.equal(KEEPFACTS_SESSION_MAX_TEXT_LENGTH, KEEPFACTS_MAX_TEXT_LENGTH);
  assert.equal(
    KEEPFACTS_SESSION_MAX_REQUIRED_LENGTH,
    KEEPFACTS_MAX_REQUIRED_LENGTH,
  );
  assert.equal(
    KEEPFACTS_SESSION_MAX_REQUIRED_ITEMS,
    KEEPFACTS_MAX_REQUIRED_ITEMS,
  );
  assert.equal(
    KEEPFACTS_SESSION_MAX_REQUIRED_ITEM_LENGTH,
    KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH,
  );
  assert.equal(
    KEEPFACTS_SESSION_MAX_REVIEW_KEY_LENGTH,
    `required:required-${KEEPFACTS_MAX_REQUIRED_ITEMS - 1}-`.length +
      KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH * 18,
  );
});

test("loads and reconciles the historical v0.3.0 schema-v1 fixture", () => {
  const fixture = readFileSync(
    new URL("./fixtures/session-v1-v030.keepfacts.json", import.meta.url),
    "utf8",
  );
  const session = parseKeepFactsSession(fixture);
  assert.equal(session.schemaVersion, 1);
  assert.equal(session.generator.appVersion, "0.3.0");
  assert.equal(
    session.generator.commitSha,
    "a50782562b35975168bbb4d25027181ed2c6294d",
  );
  assert.notDeepEqual(session.editor, session.result?.input);
  assert.equal(serializeKeepFactsSession(session), fixture);

  assert.ok(session.result);
  const comparison = compareFacts(
    session.result.input.source,
    session.result.input.revision,
    session.result.input.required,
  );
  const reconciled = reconcileKeepFactsReviewRecords(
    session.result.reviewRecords,
    comparison,
  );
  assert.equal(reconciled.restoredCount, 3);
  assert.equal(reconciled.discardedCount, 1);
  assert.equal(Object.getPrototypeOf(reconciled.reviewRecords), null);
  assert.deepEqual(reconciled.reviewRecords, Object.assign(Object.create(null), {
    "added:date-30-40": {
      note: "Investigate launch date\n\tVerify source.",
    },
    "required:required-0-northstar": { decision: "accepted" },
    "source:number-10-13": {
      decision: "confirmed",
      note: "Customer count changed",
      expectedFix: "Restore 100",
    },
  }));
});

test("serializes schema v1 deterministically and parses a UTF-8 BOM", () => {
  const session = validSession();
  session.result!.reviewRecords = [
    {
      key: "source:number-20-22",
      decision: "ignored",
      note: "   ",
    },
    {
      key: "added:date-30-40",
      note: "  explain\nwith context  ",
      expectedFix: "  Remove it  ",
    },
    {
      key: "required:0-alpha",
      expectedFix: "\t",
    },
  ];

  const first = serializeKeepFactsSession(session);
  const second = serializeKeepFactsSession(session);
  assert.equal(first, second);
  assert.ok(first.endsWith("\n"));
  assert.equal(first.endsWith("\n\n"), false);
  assert.equal(first.includes('"comparison"'), false);

  const parsed = parseKeepFactsSession(`\uFEFF${first}`);
  assert.deepEqual(
    parsed.result?.reviewRecords.map(({ key }) => key),
    ["added:date-30-40", "source:number-20-22"],
  );
  assert.deepEqual(parsed.result?.reviewRecords[0], {
    key: "added:date-30-40",
    note: "explain\nwith context",
    expectedFix: "Remove it",
  });
  assert.deepEqual(parsed.result?.reviewRecords[1], {
    key: "source:number-20-22",
    decision: "ignored",
  });
  assert.equal(serializeKeepFactsSession(parsed), first);
});

test("supports a draft-only session and preserves stale checked input", () => {
  const draft = validSession();
  draft.locale = "en";
  draft.result = null;
  assert.deepEqual(parseKeepFactsSession(serializeKeepFactsSession(draft)), draft);

  const stale = validSession();
  const parsed = parseKeepFactsSession(serializeKeepFactsSession(stale));
  assert.notDeepEqual(parsed.editor, parsed.result?.input);
  assert.equal(parsed.editor.source.endsWith("Draft 42."), true);
});

test("round-trips an NFKC-expanded required review key", () => {
  const required = "ﬃ".repeat(400);
  const input = { source: required, revision: "", required };
  const comparison = compareFacts(input.source, input.revision, input.required);
  const item = getReviewItems(comparison).find(
    (candidate) => candidate.scope === "required",
  );
  assert.ok(item);
  assert.equal(required.length, 400);
  assert.equal(item.key.length, 1_220);
  assert.ok(item.key.length > 1_024);
  assert.ok(item.key.length <= KEEPFACTS_SESSION_MAX_REVIEW_KEY_LENGTH);

  const session = validSession();
  session.editor = input;
  session.result = {
    input,
    reviewRecords: [{ key: item.key, decision: "confirmed" }],
  };

  const parsed = parseKeepFactsSession(serializeKeepFactsSession(session));
  assert.equal(parsed.result?.reviewRecords[0].key, item.key);
  assert.ok(parsed.result);
  const reconciled = reconcileKeepFactsReviewRecords(
    parsed.result.reviewRecords,
    comparison,
  );
  assert.equal(reconciled.restoredCount, 1);
  assert.deepEqual(reconciled.reviewRecords[item.key], {
    decision: "confirmed",
  });
});

test("rejects review keys beyond the normalization-derived boundary", () => {
  const ordinarySession = validSession();
  ordinarySession.result!.reviewRecords[0].key = "k".repeat(1_025);
  expectSessionError(
    () => validateKeepFactsSession(ordinarySession),
    "limit-exceeded",
    "$.result.reviewRecords[0].key",
  );

  const session = validSession();
  session.result!.input.required = "\uFDFA".repeat(
    KEEPFACTS_SESSION_MAX_REQUIRED_ITEM_LENGTH,
  );
  session.result!.reviewRecords[0].key = "k".repeat(
    KEEPFACTS_SESSION_MAX_REVIEW_KEY_LENGTH + 1,
  );
  expectSessionError(
    () => validateKeepFactsSession(session),
    "limit-exceeded",
    "$.result.reviewRecords[0].key",
  );

  const unrelated = validSession();
  unrelated.result!.input.required = "\uFDFA".repeat(
    KEEPFACTS_SESSION_MAX_REQUIRED_ITEM_LENGTH,
  );
  unrelated.result!.reviewRecords[0].key = "k".repeat(2_000);
  expectSessionError(
    () => validateKeepFactsSession(unrelated),
    "limit-exceeded",
    "$.result.reviewRecords[0].key",
  );
});

test("rejects missing and additional fields at every schema level", () => {
  const extraCases: Array<[string, (session: Record<string, any>) => void]> = [
    ["$.extra", (session) => { session.extra = true; }],
    ["$.generator.extra", (session) => { session.generator.extra = true; }],
    ["$.privacy.extra", (session) => { session.privacy.extra = true; }],
    ["$.editor.extra", (session) => { session.editor.extra = true; }],
    ["$.result.extra", (session) => { session.result.extra = true; }],
    [
      "$.result.input.extra",
      (session) => { session.result.input.extra = true; },
    ],
    [
      "$.result.reviewRecords[0].extra",
      (session) => { session.result.reviewRecords[0].extra = true; },
    ],
  ];
  for (const [path, change] of extraCases) {
    expectSessionError(
      () => validateKeepFactsSession(changedSession(change)),
      "unknown-field",
      path,
    );
  }

  expectSessionError(
    () => validateKeepFactsSession(changedSession((session) => {
      delete session.editor.source;
    })),
    "missing-field",
    "$.editor.source",
  );
  expectSessionError(
    () => validateKeepFactsSession(changedSession((session) => {
      delete session.result.reviewRecords;
    })),
    "missing-field",
    "$.result.reviewRecords",
  );
  expectSessionError(
    () => validateKeepFactsSession([]),
    "invalid-type",
    "$",
  );
});

test("validates identity, schema, locale, generator, privacy, and UTC time", () => {
  const cases: Array<
    [KeepFactsSessionErrorCode, string, (session: Record<string, any>) => void]
  > = [
    ["invalid-format", "$.format", (session) => { session.format = "other"; }],
    [
      "unsupported-schema",
      "$.schemaVersion",
      (session) => { session.schemaVersion = 2; },
    ],
    ["invalid-value", "$.locale", (session) => { session.locale = "ja"; }],
    [
      "invalid-value",
      "$.generator.appVersion",
      (session) => { session.generator.appVersion = "v0.3.0"; },
    ],
    [
      "invalid-value",
      "$.generator.commitSha",
      (session) => { session.generator.commitSha = "not-a-sha"; },
    ],
    [
      "invalid-value",
      "$.privacy.containsFullText",
      (session) => { session.privacy.containsFullText = false; },
    ],
    [
      "invalid-value",
      "$.privacy.encrypted",
      (session) => { session.privacy.encrypted = true; },
    ],
    [
      "invalid-value",
      "$.exportedAt",
      (session) => { session.exportedAt = "2026-08-13T09:30:00+08:00"; },
    ],
    [
      "invalid-value",
      "$.exportedAt",
      (session) => { session.exportedAt = "2026-02-30T09:30:00.000Z"; },
    ],
    [
      "invalid-value",
      "$.result.reviewRecords[0].decision",
      (session) => { session.result.reviewRecords[0].decision = "pending"; },
    ],
  ];

  for (const [code, path, change] of cases) {
    expectSessionError(
      () => validateKeepFactsSession(changedSession(change)),
      code,
      path,
    );
  }

  const localBuild = validSession();
  localBuild.generator.commitSha = "local";
  assert.equal(validateKeepFactsSession(localBuild).generator.commitSha, "local");
});

test("rejects incorrect scalar and container types", () => {
  const cases: Array<[string, (session: Record<string, any>) => void]> = [
    ["$.exportedAt", (session) => { session.exportedAt = 123; }],
    ["$.generator", (session) => { session.generator = null; }],
    ["$.privacy", (session) => { session.privacy = []; }],
    ["$.editor", (session) => { session.editor = "text"; }],
    ["$.editor.source", (session) => { session.editor.source = 123; }],
    ["$.result", (session) => { session.result = []; }],
    [
      "$.result.reviewRecords",
      (session) => { session.result.reviewRecords = {}; },
    ],
    [
      "$.result.reviewRecords[0]",
      (session) => { session.result.reviewRecords[0] = "record"; },
    ],
    [
      "$.result.reviewRecords[0].decision",
      (session) => { session.result.reviewRecords[0].decision = null; },
    ],
    [
      "$.result.reviewRecords[0].note",
      (session) => { session.result.reviewRecords[0].note = 42; },
    ],
    [
      "$.result.reviewRecords[0].expectedFix",
      (session) => { session.result.reviewRecords[0].expectedFix = false; },
    ],
  ];
  for (const [path, change] of cases) {
    expectSessionError(
      () => validateKeepFactsSession(changedSession(change)),
      "invalid-type",
      path,
    );
  }

  expectSessionError(
    () => validateKeepFactsSession(changedSession((session) => {
      session.result.reviewRecords[0].key = "";
    })),
    "invalid-value",
    "$.result.reviewRecords[0].key",
  );
});

test("enforces editor, required-item, review-record, and byte limits", () => {
  const atTextLimit = validSession();
  atTextLimit.editor.source = "x".repeat(KEEPFACTS_SESSION_MAX_TEXT_LENGTH);
  atTextLimit.editor.revision = "y".repeat(KEEPFACTS_SESSION_MAX_TEXT_LENGTH);
  assert.equal(
    validateKeepFactsSession(atTextLimit).editor.source.length,
    KEEPFACTS_SESSION_MAX_TEXT_LENGTH,
  );

  const atEveryStructuredLimit = validSession();
  atEveryStructuredLimit.editor.required = [
    "x".repeat(KEEPFACTS_SESSION_MAX_REQUIRED_ITEM_LENGTH),
    ...Array.from(
      { length: KEEPFACTS_SESSION_MAX_REQUIRED_ITEMS - 1 },
      (_, index) => `item-${index}`,
    ),
  ].join("\n");
  atEveryStructuredLimit.result!.input.required = "ﬃ".repeat(
    KEEPFACTS_SESSION_MAX_REQUIRED_ITEM_LENGTH,
  );
  const maxRequiredReview = getReviewItems(
    compareFacts(
      atEveryStructuredLimit.result!.input.source,
      atEveryStructuredLimit.result!.input.revision,
      atEveryStructuredLimit.result!.input.required,
    ),
  ).find((item) => item.scope === "required");
  assert.ok(maxRequiredReview);
  assert.ok(maxRequiredReview.key.length > 1_024);
  assert.ok(
    maxRequiredReview.key.length <= KEEPFACTS_SESSION_MAX_REVIEW_KEY_LENGTH,
  );
  atEveryStructuredLimit.result!.reviewRecords = Array.from(
    { length: KEEPFACTS_SESSION_MAX_REVIEW_RECORDS },
    (_, index) => ({
      key:
        index === 0
          ? maxRequiredReview.key
          : `source:number-${index}-${index + 1}`,
      decision: "ignored" as const,
      ...(index === 0
        ? {
            note: "n".repeat(KEEPFACTS_SESSION_MAX_REVIEW_TEXT_LENGTH),
            expectedFix: "f".repeat(
              KEEPFACTS_SESSION_MAX_REVIEW_TEXT_LENGTH,
            ),
          }
        : {}),
    }),
  );
  const exact = validateKeepFactsSession(atEveryStructuredLimit);
  assert.equal(
    exact.editor.required.split("\n").length,
    KEEPFACTS_SESSION_MAX_REQUIRED_ITEMS,
  );
  assert.equal(
    exact.result?.reviewRecords.length,
    KEEPFACTS_SESSION_MAX_REVIEW_RECORDS,
  );

  const limitCases: Array<[string, (session: Record<string, any>) => void]> = [
    [
      "$.editor.source",
      (session) => {
        session.editor.source = "x".repeat(KEEPFACTS_SESSION_MAX_TEXT_LENGTH + 1);
      },
    ],
    [
      "$.result.input.revision",
      (session) => {
        session.result.input.revision = "x".repeat(
          KEEPFACTS_SESSION_MAX_TEXT_LENGTH + 1,
        );
      },
    ],
    [
      "$.editor.required",
      (session) => {
        session.editor.required = "x".repeat(
          KEEPFACTS_SESSION_MAX_REQUIRED_LENGTH + 1,
        );
      },
    ],
    [
      "$.editor.required",
      (session) => {
        session.editor.required = Array.from(
          { length: KEEPFACTS_SESSION_MAX_REQUIRED_ITEMS + 1 },
          (_, index) => `item-${index}`,
        ).join("\n");
      },
    ],
    [
      "$.editor.required",
      (session) => {
        session.editor.required = "x".repeat(
          KEEPFACTS_SESSION_MAX_REQUIRED_ITEM_LENGTH + 1,
        );
      },
    ],
    [
      "$.result.reviewRecords",
      (session) => {
        session.result.reviewRecords = Array.from(
          { length: KEEPFACTS_SESSION_MAX_REVIEW_RECORDS + 1 },
          (_, index) => ({
            key: `source:number-${index}-${index + 1}`,
            decision: "ignored",
          }),
        );
      },
    ],
    [
      "$.result.reviewRecords[0].key",
      (session) => {
        session.result.reviewRecords[0].key = "k".repeat(
          KEEPFACTS_SESSION_MAX_REVIEW_KEY_LENGTH + 1,
        );
      },
    ],
    [
      "$.result.reviewRecords[0].note",
      (session) => {
        session.result.reviewRecords[0].note = "x".repeat(
          KEEPFACTS_SESSION_MAX_REVIEW_TEXT_LENGTH + 1,
        );
      },
    ],
    [
      "$.result.reviewRecords[0].expectedFix",
      (session) => {
        session.result.reviewRecords[0].expectedFix = "x".repeat(
          KEEPFACTS_SESSION_MAX_REVIEW_TEXT_LENGTH + 1,
        );
      },
    ],
  ];
  for (const [path, change] of limitCases) {
    expectSessionError(
      () => validateKeepFactsSession(changedSession(change)),
      "limit-exceeded",
      path,
    );
  }

  const unicodeLimit = validSession();
  unicodeLimit.result!.reviewRecords[0].note = "😀".repeat(250);
  assert.doesNotThrow(() => validateKeepFactsSession(unicodeLimit));
  unicodeLimit.result!.reviewRecords[0].note = "😀".repeat(251);
  expectSessionError(
    () => validateKeepFactsSession(unicodeLimit),
    "limit-exceeded",
    "$.result.reviewRecords[0].note",
  );

  expectSessionError(
    () => parseKeepFactsSession("x".repeat(KEEPFACTS_SESSION_MAX_BYTES + 1)),
    "too-large",
    "$",
  );
  expectSessionError(
    () => parseKeepFactsSession(" ".repeat(KEEPFACTS_SESSION_MAX_BYTES)),
    "invalid-json",
    "$",
  );
});

test("trims review text while allowing LF and TAB and rejecting controls", () => {
  const session = validSession();
  session.result!.reviewRecords[0].note = " \tfirst\nsecond\t ";
  session.result!.reviewRecords[0].expectedFix = "  fix  ";
  const record = validateKeepFactsSession(session).result!.reviewRecords[0];
  assert.equal(record.note, "first\nsecond");
  assert.equal(record.expectedFix, "fix");

  for (const control of ["\0", "\u0001", "\r", "\u007f", "\u0085"]) {
    expectSessionError(
      () => validateKeepFactsSession(changedSession((candidate) => {
        candidate.result.reviewRecords[0].note = `before${control}after`;
      })),
      "invalid-value",
      "$.result.reviewRecords[0].note",
    );
  }
});

test("rejects malformed JSON, duplicate review keys, and prototype fields", () => {
  expectSessionError(
    () => parseKeepFactsSession("{not json"),
    "invalid-json",
    "$",
  );

  expectSessionError(
    () => validateKeepFactsSession(changedSession((session) => {
      session.result.reviewRecords.push({
        ...session.result.reviewRecords[0],
      });
    })),
    "duplicate-review-key",
    "$.result.reviewRecords[1].key",
  );

  const serialized = serializeKeepFactsSession(validSession());
  const polluted = serialized.replace(
    /^\{/u,
    '{"__proto__":{"polluted":true},',
  );
  expectSessionError(
    () => parseKeepFactsSession(polluted),
    "unknown-field",
    "$.__proto__",
  );
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);

  expectSessionError(
    () => validateKeepFactsSession(changedSession((session) => {
      session.result.comparison = { forged: true };
    })),
    "unknown-field",
    "$.result.comparison",
  );
});

test("reconciles only exact current review keys into a null-prototype map", () => {
  const comparison = compareFacts(
    "Alpha has 100 users. Keep Northstar.",
    "Alpha has 80 users. Launch on 2026-09-15.",
    "Northstar",
  );
  const items = getReviewItems(comparison);
  assert.equal(items.length, 3);
  const records = [
    {
      key: items[0].key,
      decision: "confirmed" as const,
      note: "Number changed",
      expectedFix: "Restore 100",
    },
    { key: items[1].key, decision: "accepted" as const },
    { key: items[2].key, note: "Investigate this date" },
    { key: "source:orphan", decision: "ignored" as const },
    { key: "__proto__", note: "pollute" },
  ];

  const reconciled = reconcileKeepFactsReviewRecords(records, comparison);
  assert.equal(reconciled.restoredCount, 3);
  assert.equal(reconciled.discardedCount, 2);
  assert.equal(Object.getPrototypeOf(reconciled.reviewRecords), null);
  assert.deepEqual(reconciled.reviewRecords[items[0].key], {
    decision: "confirmed",
    note: "Number changed",
    expectedFix: "Restore 100",
  });
  assert.deepEqual(reconciled.reviewRecords[items[1].key], {
    decision: "accepted",
  });
  assert.deepEqual(reconciled.reviewRecords[items[2].key], {
    note: "Investigate this date",
  });
  assert.equal(reconciled.reviewRecords["source:orphan"], undefined);
  assert.equal(reconciled.reviewRecords.__proto__, undefined);
  assert.equal(({} as { pollute?: string }).pollute, undefined);
});
