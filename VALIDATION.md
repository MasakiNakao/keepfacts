# Validation

KeepFacts is deterministic: the same source and rewrite produce the same
result. This document explains what the public test corpus covers, how to
reproduce it, and where human review is still required.

KeepFacts is an exact-fact preservation checker for AI-transformed text, not a
truth-verification service. It compares a source and rewrite without consulting
external evidence. Recognition is currently optimized for common Chinese and
English formats.

## Reproduce the current snapshot

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run check:all
npm audit --audit-level=high
```

The data-driven corpus lives in
[`tests/validation-cases.json`](tests/validation-cases.json). Each case contains
a source, a rewrite, and the expected number of preserved, review, and added
facts. The test runner fails when any result changes unexpectedly.

## v0.5.0 release gates

- 42 public validation cases, including five new named cases for suffix
  currencies, day-first English dates, malformed grouped money boundaries, and
  parenthesized measurements; the manually annotated evaluation corpus is
  unchanged
- 104/104 Node unit, release-workflow, evaluation, performance, review, report,
  session, and social-metadata tests pass
- 76 Chromium browser, keyboard, and accessibility checks pass across desktop
  and 390 px mobile projects; two cross-project runs are intentionally skipped
  because one contract is mobile-only and one is desktop-landscape-only
- The dependency audit must report no high- or critical-severity advisory
- Interface checks cover the example-first path, the human-review-first result
  hierarchy, highlighted bilateral evidence, decision filters, local review
  search, stable queue numbering, 20-item human pagination, collapsed keyboard-
  accessible machine details, explicit decision semantics, compact mobile and
  short-landscape sticky controls, and draft/completed report controls
- Lifecycle checks cover the unexported-work state, native refresh/close guard,
  session checkpoint state, destructive-action confirmations, stale-result
  export lockout with an in-place recheck action, visible record-migration
  feedback, atomic oversized-input rejection, worker failure/timeout recovery,
  and classified but non-destructive session-import failures
- Chinese and English examples
- Positive matches, changed facts, missing facts, added facts, duplicates, and
  false-positive boundaries
- Targeted v0.5.0 regressions cover suffix currency identity, malformed grouped
  numeric boundaries, day-first dates, parenthesized measurement signs, CR and
  Unicode must-preserve separators, adversarial long input, pre-matrix Worker
  limits, stable review navigation, and trusted release identity
- CI runs the same unit, desktop, 390 px mobile, and accessibility checks on
  pushes to `main`, version-tag pushes, and pull requests targeting `main`
- GitHub Pages builds after successful version-tag CI from the default-branch
  workflow context, or from an explicit manual request on `main`; release
  verification ties package metadata, documentation, tag, CI SHA, checkout SHA,
  injected full build SHA, and `origin/main` ancestry together
- Automatic and must-preserve result cards are limited to 50 per page; the
  human-review queue is limited to 20 per page. Focus moves to the selected page
  without changing global item numbers.
- Dense 100-, 300-, and 1,000-fact comparisons each have a five-second
  regression budget; 1,000 must-preserve entries have a one-second budget.
- A comparison with 400 must-preserve entries and 100,000-character source and
  rewrite texts has a five-second regression budget. Editor, Worker, and
  schema-v1 session limits share one tested boundary contract.
- A 100,000-digit exact number must remain within a five-second budget, and an
  over-limit percentage corpus must stop before dense matching is allocated.

The corpus covers dates, times, money, percentages, measurements, numeric
ranges, versions, URLs, emails, quoted text, standalone numbers, duplicate
facts, reordered facts, arbitrary-precision decimals, signed values, full-width
numeric forms, and false-positive text boundaries.

Passing this corpus is a regression guarantee for these named cases. The
separate manually annotated evaluation described in [EVALUATION.md](EVALUATION.md)
reports extraction and association metrics; neither suite should be interpreted
as proof that KeepFacts understands every document.

The product's extracted-fact retention percentage is calculated only from
source facts recognized by the supported rules. It measures preserved matches
within that extracted set; it is not extraction coverage, truth accuracy, or a
full-document semantic score.

The v0.5.0 gates retain the v0.4 review, session, launch, responsive, privacy,
and accessibility contracts while adding targeted regressions for the named
formats, long-input bounds, interactive queue, and deployment identity. Human
records remain separate from deterministic machine counts and retention. The
validation file expanded by five cases; the manually annotated evaluation
corpus did not, so the gates must not be interpreted as evidence of broad real-
world fact coverage or full-document accuracy.

## Matching guarantees

KeepFacts safely normalizes a deliberately limited set of equivalent forms:

- common Chinese and English date formats, including unambiguous day-first
  English forms such as `15 September 2026`;
- prefix and suffix currency formatting such as `¥30,000`, `3万元`, `USD 100`,
  and `100 USD`;
- signed and arbitrary-precision decimal values without IEEE-754 rounding;
- mass (`kg`, `g`, `mg`), length (`km`, `m`, `cm`, `mm`), and fixed-duration
  units (`day`, `hour`, `minute`, `second`), with parentheses treated as
  grouping unless the sign is explicit inside them;
- URL scheme and host casing while preserving case-sensitive paths;
- repeated facts using context-aware, one-to-one matching, including reordered
  duplicates and values that swap between subjects.

Impossible calendar dates and times are shown for review. Changed facts are
paired only when their nearby wording is sufficiently similar and the best
candidate is not ambiguous. Full-width digits and common full-width separators
are normalized before recognition while result offsets still point to the
original text.

## Known limitations

- KeepFacts compares extractable facts; it does not verify whether a statement
  is true or whether the full meaning is preserved.
- Recognition is currently optimized for common Chinese and English formats.
- `¥` is treated as CNY unless the text explicitly says JPY or 日元.
- URL paths, query strings, and fragments are compared conservatively.
- Months and years are not converted into fixed durations.
- Candidate matching uses nearby text and relative position, not document-level
  semantic structure.
- Phone numbers, localized decimal separators, written Chinese numerals, and
  many domain-specific identifiers are not yet first-class fact types.

Use KeepFacts as an additional review aid. Legal, medical, financial, and other
high-stakes documents still require qualified human review.

## Adding evidence

Every recognizer change should add:

1. a case that should be preserved;
2. a changed or missing case that should be reviewed;
3. a likely false-positive boundary.

Bug reports should use fictional or public text and must not contain private or
confidential information.
