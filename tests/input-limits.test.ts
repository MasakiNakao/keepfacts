import assert from "node:assert/strict";
import test from "node:test";

import {
  getKeepFactsInputLimitViolation,
  KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH,
  KEEPFACTS_MAX_REQUIRED_ITEMS,
  KEEPFACTS_MAX_REQUIRED_LENGTH,
  KEEPFACTS_MAX_TEXT_LENGTH,
  splitKeepFactsRequiredLines,
  type KeepFactsInput,
} from "../src/lib/input-limits.ts";

function input(change: Partial<KeepFactsInput> = {}): KeepFactsInput {
  return {
    source: "Source has 100 users.",
    revision: "Source has 100 users.",
    required: "",
    ...change,
  };
}

test("accepts and rejects source and revision at exact UTF-16 boundaries", () => {
  for (const field of ["source", "revision"] as const) {
    assert.equal(
      getKeepFactsInputLimitViolation(
        input({ [field]: "x".repeat(KEEPFACTS_MAX_TEXT_LENGTH) }),
      ),
      undefined,
    );
    assert.deepEqual(
      getKeepFactsInputLimitViolation(
        input({ [field]: "x".repeat(KEEPFACTS_MAX_TEXT_LENGTH + 1) }),
      ),
      {
        code: "input-limit-exceeded",
        field,
        reason: "text-length",
        actual: KEEPFACTS_MAX_TEXT_LENGTH + 1,
        maximum: KEEPFACTS_MAX_TEXT_LENGTH,
      },
    );
  }

  const unicodeBoundary = "😀".repeat(KEEPFACTS_MAX_TEXT_LENGTH / 2);
  assert.equal(unicodeBoundary.length, KEEPFACTS_MAX_TEXT_LENGTH);
  assert.equal(
    getKeepFactsInputLimitViolation(input({ source: unicodeBoundary })),
    undefined,
  );
  assert.equal(
    getKeepFactsInputLimitViolation(
      input({ source: `${unicodeBoundary}x` }),
    )?.actual,
    KEEPFACTS_MAX_TEXT_LENGTH + 1,
  );
});

test("enforces required total length before its structured item limits", () => {
  const atLimit = [
    "x".repeat(KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH),
    ...Array.from(
      { length: 199 },
      () => "x".repeat(KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH - 1),
    ),
  ].join("\n");
  assert.equal(atLimit.length, KEEPFACTS_MAX_REQUIRED_LENGTH);
  assert.equal(
    getKeepFactsInputLimitViolation(input({ required: atLimit })),
    undefined,
  );

  const overLimit = `${atLimit}x`;
  assert.deepEqual(
    getKeepFactsInputLimitViolation(input({ required: overLimit })),
    {
      code: "input-limit-exceeded",
      field: "required",
      reason: "required-length",
      actual: KEEPFACTS_MAX_REQUIRED_LENGTH + 1,
      maximum: KEEPFACTS_MAX_REQUIRED_LENGTH,
    },
  );
});

test("enforces required item count and per-item UTF-16 length exactly", () => {
  const atItemCount = Array.from(
    { length: KEEPFACTS_MAX_REQUIRED_ITEMS },
    () => "x",
  ).join("\n");
  assert.equal(
    getKeepFactsInputLimitViolation(input({ required: atItemCount })),
    undefined,
  );
  assert.deepEqual(
    getKeepFactsInputLimitViolation(
      input({ required: `${atItemCount}\nx` }),
    ),
    {
      code: "input-limit-exceeded",
      field: "required",
      reason: "required-items",
      actual: KEEPFACTS_MAX_REQUIRED_ITEMS + 1,
      maximum: KEEPFACTS_MAX_REQUIRED_ITEMS,
    },
  );

  const unicodeItem = "😀".repeat(KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH / 2);
  assert.equal(unicodeItem.length, KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH);
  assert.equal(
    getKeepFactsInputLimitViolation(input({ required: `  ${unicodeItem}  ` })),
    undefined,
  );
  assert.deepEqual(
    getKeepFactsInputLimitViolation(
      input({ required: `first\n${unicodeItem}x` }),
    ),
    {
      code: "input-limit-exceeded",
      field: "required",
      reason: "required-item-length",
      actual: KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH + 1,
      maximum: KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH,
      itemIndex: 1,
    },
  );
});

test("treats imported CR and Unicode separators as required-item line breaks", () => {
  assert.deepEqual(
    splitKeepFactsRequiredLines("alpha\r\nbeta\rgamma\u2028delta\u2029epsilon"),
    ["alpha", "beta", "gamma", "delta", "epsilon"],
  );

  const oversized = "x".repeat(KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH + 1);
  assert.deepEqual(
    getKeepFactsInputLimitViolation(
      input({ required: `first\r${oversized}` }),
    ),
    {
      code: "input-limit-exceeded",
      field: "required",
      reason: "required-item-length",
      actual: KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH + 1,
      maximum: KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH,
      itemIndex: 1,
    },
  );
});
