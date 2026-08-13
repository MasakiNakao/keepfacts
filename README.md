# KeepFacts

[简体中文](README.zh-CN.md) · [Live demo](https://masakinakao.github.io/keepfacts/)

[![Live demo](https://img.shields.io/badge/live-demo-0f5d46)](https://masakinakao.github.io/keepfacts/)
[![CI](https://github.com/MasakiNakao/keepfacts/actions/workflows/ci.yml/badge.svg)](https://github.com/MasakiNakao/keepfacts/actions/workflows/ci.yml)
[![Latest tag](https://img.shields.io/github/v/tag/MasakiNakao/keepfacts?sort=semver)](https://github.com/MasakiNakao/keepfacts/tags)
[![License](https://img.shields.io/github/license/MasakiNakao/keepfacts)](LICENSE)

**Change the wording, not the facts.**

KeepFacts is a small, privacy-first **exact-fact preservation checker** for AI
rewrites, summaries, and translations. Compare a trusted source with the new
draft, then review dates, money, percentages, quantities, versions, links,
emails, and other extractable items side by side.

KeepFacts does not look up claims or decide whether they are true. It checks
whether exact items it can recognize were preserved, changed, omitted, or added
between two texts. Recognition is currently optimized for common Chinese and
English formats.

All analysis runs locally in the browser. No text is uploaded, no account is required, and no AI API key is needed.

[![KeepFacts v0.2.1 interface showing exact-fact comparison and human review decisions](docs/keepfacts-demo.jpg)](https://masakinakao.github.io/keepfacts/)

## Try it in 30 seconds

1. Open the [live demo](https://masakinakao.github.io/keepfacts/).
2. Paste the original text on the left and the rewrite on the right.
3. Optionally add one must-preserve name or phrase per line.
4. Select **Compare both texts** to create a fixed result. Mark findings as **Confirmed issue**, **Acceptable rewrite**, or **Ignored**, then copy or download the Markdown report. Recheck after editing either text.

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

## v0.2.1 scope

v0.2.1 keeps the v0.2 workflow—must-preserve terms, per-finding human
decisions, review progress, pagination, and Markdown report export—while making
the product boundary explicit. Use it to check whether recognized exact facts
survive an AI transformation. A 100% extracted-fact retention result does not
mean that every claim is true, every fact was recognized, or the full meaning
was preserved.

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
- Per-finding human decisions and pending-review progress across automatic, must-preserve, and newly added findings
- Traceable Markdown reports with source/rewrite context, app version, and build commit
- Fifty-item pagination for large automatic and must-preserve result sets
- Native radio-group decisions and focus-managed pagination, covered by
  responsive keyboard and browser accessibility checks

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
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

Create a production build:

```bash
npm run build
```

Run Chromium browser and accessibility checks after installing the Playwright browser:

```bash
npx playwright install chromium
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

Human decisions are a separate review layer: they never rewrite automatic counts or retention. They remain in page memory only and are included when you copy or download the report; KeepFacts does not persist source text, rewrite text, context, or review decisions in Web Storage.

## Roadmap

- A reusable core package and CLI
- More locales, currencies, and unit aliases
- Browser extension and editor integrations
- Contributor-authored recognizer plugins

## Contributing

Bug reports and small, well-scoped recognizer improvements are welcome. When adding a rule, include tests for both a correct match and a likely false positive. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Privacy and limitations

KeepFacts performs deterministic checks in your browser and contains no
tracking code. It compares supported exact facts between two texts; it does not
verify claims against external evidence. It is an additional review aid, not a
substitute for human review in legal, medical, financial, or other high-stakes
work. See [SECURITY.md](SECURITY.md).

## License

MIT
