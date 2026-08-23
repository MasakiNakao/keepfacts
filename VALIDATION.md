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

## v0.3.3 maintenance release gates

- 37 public validation cases; the fact cases are unchanged from v0.3.1
- 82/82 Node unit, evaluation, performance, review, report, session, and
  social-metadata tests pass
- 55 Chromium browser, keyboard, and accessibility checks pass across desktop
  and 390 px mobile projects; one desktop run intentionally skips the
  mobile-only first-exposure control check
- The dependency audit must report no high- or critical-severity advisory
- Launch checks cover the example-first hero action, all three visible example
  differences, canonical/Open Graph/X card and favicon metadata, visible
  source/privacy/feedback links, a single-line mobile retention label, and a
  minimum 44 CSS-pixel height for mobile interactive controls including the
  branded home link. Destructive-action checks protect unsaved user text and
  review records, and the 390 px English first view keeps the comparison
  workspace discoverable
- Chinese and English examples
- Positive matches, changed facts, missing facts, added facts, duplicates, and
  false-positive boundaries
- CI runs the same unit, desktop, 390 px mobile, and accessibility checks on
  every push and pull request
- Automatic and must-preserve result cards are limited to 50 per page, with
  focus moved to the newly selected page.
- Dense 100-, 300-, and 1,000-fact comparisons each have a five-second
  regression budget; 1,000 must-preserve entries have a one-second budget.
- A comparison with 400 must-preserve entries and 100,000-character source and
  rewrite texts has a five-second regression budget. Editor, Worker, and
  schema-v1 session limits share one tested boundary contract.

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

The v0.3 review gates cover one three-scope human-review queue, notes and
expected fixes, confirmed-only fix-list output, conservative recheck migration,
and strict plaintext session import/export. v0.3.1 added launch presentation,
metadata, public-link, and mobile-target gates. v0.3.2 is a feature-complete,
pre-1.0 maintenance release that updates dependencies, governance, security
contact guidance, evergreen social metadata, input/session boundary handling,
long must-preserve performance, and retry-safe error feedback. Human records remain
separate from machine counts and retention. v0.3.3 adds a keyboard skip path,
reduces first-view and pending-review density, and removes duplicate or
unavailable interface actions without changing recognition behavior. This
release does not add
recognizers or expand the public validation or evaluation corpora, so its
maintenance gates must not be interpreted as evidence of broader fact coverage
or improved accuracy.

## Matching guarantees

KeepFacts safely normalizes a deliberately limited set of equivalent forms:

- common Chinese and English date formats;
- currency formatting such as `¥30,000` and `3万元`;
- signed and arbitrary-precision decimal values without IEEE-754 rounding;
- mass (`kg`, `g`, `mg`), length (`km`, `m`, `cm`, `mm`), and fixed-duration
  units (`day`, `hour`, `minute`, `second`);
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
