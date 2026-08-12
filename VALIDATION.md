# Validation

KeepFacts is deterministic: the same source and rewrite produce the same
result. This document explains what the public test corpus covers, how to
reproduce it, and where human review is still required.

## Reproduce the current snapshot

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm test
```

The data-driven corpus lives in
[`tests/validation-cases.json`](tests/validation-cases.json). Each case contains
a source, a rewrite, and the expected number of preserved, review, and added
facts. The test runner fails when any result changes unexpectedly.

## v0.1.2 snapshot

- 30 public validation cases
- 25 automated tests
- Chinese and English examples
- Positive matches, changed facts, missing facts, added facts, duplicates, and
  false-positive boundaries
- CI runs the same tests on every push and pull request

The corpus covers dates, times, money, percentages, measurements, numeric
ranges, versions, URLs, emails, quoted text, standalone numbers, duplicate
facts, and reordered exact facts.

Passing this corpus is a regression guarantee for these named cases. It is not
an accuracy percentage and should not be interpreted as proof that KeepFacts
understands every document.

## Matching guarantees

KeepFacts safely normalizes a deliberately limited set of equivalent forms:

- common Chinese and English date formats;
- currency formatting such as `¥30,000` and `3万元`;
- mass (`kg`, `g`, `mg`), length (`km`, `m`, `cm`, `mm`), and fixed-duration
  units (`day`, `hour`, `minute`, `second`);
- URL scheme and host casing while preserving case-sensitive paths;
- repeated facts using context-aware, one-to-one matching, including reordered
  duplicates and values that swap between subjects.

Impossible calendar dates are shown for review. Changed facts are paired only
when their nearby wording is sufficiently similar and the best candidate is
not ambiguous.

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
