import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import {
  compareFacts,
  countRequiredNotInSource,
} from "../src/lib/facts.ts";

for (const factCount of [100, 300, 1_000]) {
  test(`compares ${factCount} dense facts within the regression budget`, () => {
    const text = Array.from(
      { length: factCount / 2 },
      (_, index) => `Team${index} has ${1000 + index} users.`,
    ).join(" ");
    const started = performance.now();
    const comparison = compareFacts(text, text);
    const elapsed = performance.now() - started;

    assert.equal(comparison.sourceFacts.length, factCount);
    assert.equal(comparison.preservedCount, factCount);
    assert.ok(
      elapsed < 5_000,
      `${factCount}-fact comparison took ${elapsed.toFixed(1)} ms; expected less than 5000 ms`,
    );
  });
}

test("checks 1000 must-preserve entries within the input-feedback budget", () => {
  const terms = Array.from({ length: 1_000 }, (_, index) =>
    `RequiredTerm${index}`
  );
  const started = performance.now();
  const missing = countRequiredNotInSource(terms.join(" "), terms.join("\n"));
  const elapsed = performance.now() - started;

  assert.equal(missing, 0);
  assert.ok(
    elapsed < 1_000,
    `must-preserve check took ${elapsed.toFixed(1)} ms; expected less than 1000 ms`,
  );
});

test("compares 400 must-preserve entries in 100k texts within budget", () => {
  const alphaSuffix = (value: number) => {
    let remaining = value;
    let suffix = "";
    do {
      suffix = String.fromCharCode(97 + (remaining % 26)) + suffix;
      remaining = Math.floor(remaining / 26) - 1;
    } while (remaining >= 0);
    return suffix;
  };
  const terms = Array.from(
    { length: 400 },
    (_, index) => `RequiredToken${alphaSuffix(index)}`,
  );
  const evidence = terms.join(" ");
  const targetLength = 100_000;
  const padded = `${evidence} ${"background ".repeat(
    Math.ceil((targetLength - evidence.length) / "background ".length),
  )}`.slice(0, targetLength);
  assert.equal(padded.length, targetLength);

  const started = performance.now();
  const comparison = compareFacts(padded, padded, terms.join("\n"));
  const elapsed = performance.now() - started;

  assert.equal(comparison.requiredCount, terms.length);
  assert.equal(comparison.requiredPreservedCount, terms.length);
  assert.equal(comparison.requiredMissingCount, 0);
  assert.ok(
    elapsed < 5_000,
    `400-entry must-preserve comparison took ${elapsed.toFixed(1)} ms; expected less than 5000 ms`,
  );
});
