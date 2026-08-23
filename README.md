# KeepFacts

[简体中文](README.zh-CN.md) · [Live demo](https://masakinakao.github.io/keepfacts/?lang=en) · [Source](https://github.com/MasakiNakao/keepfacts) · [Privacy](SECURITY.md) · [Feedback](https://github.com/MasakiNakao/keepfacts/issues)

[![Live demo](https://img.shields.io/badge/live-demo-0f5d46)](https://masakinakao.github.io/keepfacts/)
[![CI](https://github.com/MasakiNakao/keepfacts/actions/workflows/ci.yml/badge.svg)](https://github.com/MasakiNakao/keepfacts/actions/workflows/ci.yml)
[![Latest tag](https://img.shields.io/github/v/tag/MasakiNakao/keepfacts?sort=semver)](https://github.com/MasakiNakao/keepfacts/tags)
[![License](https://img.shields.io/github/license/MasakiNakao/keepfacts)](LICENSE)

**Change the wording, not the facts.**

[![KeepFacts — local exact-fact preflight for AI rewrites](public/keepfacts-share.jpg)](https://masakinakao.github.io/keepfacts/?lang=en)

KeepFacts is a small, privacy-first **exact-fact preservation checker** for AI
rewrites, summaries, and translations. Compare a trusted source with the new
draft, then review dates, money, percentages, quantities, versions, links,
emails, and other extractable items side by side.

KeepFacts does not look up claims or decide whether they are true. It checks
whether exact items it can recognize were preserved, changed, omitted, or added
between two texts. Recognition is currently optimized for common Chinese and
English formats.

All analysis runs locally in the browser. KeepFacts does not automatically save
or upload your text; no account or AI API key is needed. Files you explicitly
export are unencrypted plaintext, as described under
[Privacy and limitations](#privacy-and-limitations).

## Try it in 30 seconds

1. Open the [live demo](https://masakinakao.github.io/keepfacts/?lang=en) and
   select the first action, **See 3 errors in 30 seconds**.
2. See three concrete demo findings immediately: the release date changed, the
   user count changed from 100 to 80, and the source URL is missing.
3. Select **Check my text**, then paste the trusted source on the left and
   the AI rewrite, summary, or translation on the right.
4. Optionally add one must-preserve name or phrase per line, then select
   **Compare both texts**. Work through the
   unified review queue, optionally add a note or expected fix, then copy the
   confirmed-only fix list or download the full Markdown report.
5. Recheck after editing either text. To continue later, explicitly export and
   re-import a local `.keepfacts.json` session. For non-sensitive feedback, use
   the visible **Feedback** link and never include private document text.

## Why KeepFacts?

AI writing tools can produce fluent text while silently changing a date,
dropping a URL, or turning 100 users into 80. KeepFacts provides a deterministic
pre-publication comparison before you accept the rewrite. The source text is
the reference; KeepFacts is not a truth-verification service.

It is intentionally narrow:

- it finds exact, extractable facts;
- it explains every result;
- it flags uncertainty for human review;
- it does not claim to verify truth or the meaning of the full document;
- its retention percentage covers only facts extracted from the source, not
  every factual statement the document may contain.

## Project status and v0.4.0 maintenance scope

v0.4.0 is the recommended tagged baseline for the documented browser workflow.
It remains a pre-1.0 (`0.x`) release: this is not a KeepFacts v1 declaration or
a promise of permanent API, file-format, or recognition compatibility. Only
the latest tag is supported on a best-effort basis, with no LTS branch or
response-time SLA. See [Privacy and limitations](#privacy-and-limitations) and
the [security policy](SECURITY.md).

This release makes the review workflow safer and easier to finish. Human-review
items now show bilateral evidence directly in the queue; complete machine
details remain available in one collapsed disclosure. Decision labels explain
the difference between a confirmed issue, an intentional acceptable change,
and an item excluded from this delivery. Draft and completed reports have
distinct controls and timestamped filenames.

KeepFacts still keeps working state only in page memory. v0.4.0 makes that
constraint visible: user-created work is marked as unexported, receives a
best-effort native close/refresh warning request, and changes to a checkpoint
state after a session is imported or exported. A session remains strict,
versioned, unencrypted plaintext. Schema v1 identifies its data format; it does
not make the product v1. See [Session format v1](docs/session-format-v1.md).

The release also fixes specific correctness boundaries: mixed Chinese/Latin
must-preserve terms, compact hyphenated ranges, review decisions whose evidence
moves to another subject, NFKC-expanded generated session keys, and invalid
dates or times introduced only by the rewrite. These fixes do not add a new
fact type or expand either public corpus. They are regression evidence for the
named cases, not a general claim of broader recognition or improved accuracy.
A 100% extracted-fact retention result still does not mean that every claim is
true, every fact was recognized, or the full meaning was preserved.

Future maintenance focuses on security, correctness, compatibility,
accessibility, documentation, and release reliability. A new capability or
recognizer requires a separately scoped release and evidence appropriate to
its claim.

## Current checks

- Dates and times
- Money and percentages
- Quantities and common units
- Versions and numeric ranges
- URLs and email addresses
- Quoted text and standalone numbers
- Duplicate and reordered facts using context-aware, one-to-one matching
- Precision-safe signed numbers plus common Chinese, English, and full-width
  formatting equivalence
- User-defined names, terms, and phrases that must be preserved, reported
  separately from extracted-fact retention
- One human-review queue across automatic warnings, must-preserve anomalies,
  and newly added facts, with decisions, optional notes, optional expected
  fixes, inline bilateral evidence, and a next-pending action
- A confirmed-only Markdown fix list plus full traceable reports with bilateral
  context, human records, app version, build commit, review-state label, and a
  UTC export timestamp
- Conservative record migration after rechecking: unchanged, uniquely matched
  evidence can retain its decision; changed evidence returns to pending, and
  ambiguous or unmatched records are not silently reassigned
- Explicit local import/export of versioned, unencrypted `.keepfacts.json`
  sessions, with an unexported-work warning and checkpoint state; no automatic
  persistence or upload
- Fifty-item pagination for large automatic and must-preserve result sets
- Native radio-group decisions and focus-managed pagination, covered by
  responsive keyboard and browser accessibility checks

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Run the tests:

```bash
npm test
```

Run the manually annotated evaluation corpus:

```bash
npm run eval
```

Run release metadata, Node tests, evaluation, type checks, and the production
build together:

```bash
npm run check
```

Create a production build:

```bash
npm run build
```

Install the Playwright Chromium browser, regenerate the committed social card,
and run browser and accessibility checks:

```bash
npx playwright install chromium
npm run render:share-card
npm run test:e2e
```

## Validation

The repository includes both fast regression cases and a realistic, manually
annotated public evaluation corpus. Evaluation reports extraction, alert,
added-fact, association, outcome, and normalization metrics rather than only
aggregate counts. See [VALIDATION.md](VALIDATION.md) and
[EVALUATION.md](EVALUATION.md) for the current snapshot and methodology.

## How matching works

KeepFacts extracts facts in priority order so nested numbers are not counted twice. It then normalizes safe formatting differences—for example, `¥30,000` and `3万元`—using exact decimal strings rather than floating-point arithmetic. Context-aware, one-to-one matching keeps repeated or reordered values attached to the most likely subject. Unmatched facts are shown as missing, possibly changed, or newly introduced.

No model is used in this process. Requested comparisons run in a local Web
Worker so large checks do not block text editing. Context features are cached
once per fact before one-to-one assignment, and result cards are paginated for
large documents. Results remain reproducible, but deliberately limited to facts
the rules can identify. The extracted-fact retention percentage is preserved
matches divided by extracted source facts; it is not an extraction-recall or
full-document accuracy score.

Human decisions are a separate review layer: they never rewrite automatic
counts or extracted-fact retention. KeepFacts does not automatically persist
source text, rewrite text, context, or review records in Web Storage. While the
page is open, that working state remains in memory. Reports or session files you
explicitly export may contain the text, contexts, decisions, notes, and expected
fixes in plaintext.

## Maintenance priorities

- Security and correctness fixes
- Browser and dependency compatibility
- Accessibility, documentation, and release reliability
- Regression evidence for the current documented workflow

New capabilities are not part of the maintenance roadmap. Any future proposal
needs a separately scoped release and evidence appropriate to its claims.

## Contributing

Bug reports and focused maintenance fixes are welcome. A recognizer proposal
must be scoped outside a patch release and include tests for both a correct
match and a likely false positive. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Privacy and limitations

KeepFacts performs deterministic checks in your browser and contains no
tracking code. It compares supported exact facts between two texts; it does not
verify claims against external evidence. It is an additional review aid, not a
substitute for human review in legal, medical, financial, or other high-stakes
work.

KeepFacts does not automatically save or upload your text or review records.
However, an explicitly exported Markdown report or `.keepfacts.json` session is
an unencrypted plaintext file. A session includes the full source, rewrite,
must-preserve content, and human records; a report includes the findings and
their displayed context. Your browser download location, a cloud-synced folder,
backup software, or device indexing may copy or synchronize those files. Store,
share, and delete them accordingly. See [SECURITY.md](SECURITY.md) and the
[session format](docs/session-format-v1.md).

## License

MIT
