# Changelog

All notable changes to KeepFacts will be documented here.

## [0.3.1] - 2026-08-14

### Added

- Add a reproducible 1200 × 630 launch card for link previews, together with
  Open Graph, X/Twitter card, canonical URL, and favicon metadata.
- Add visible links to the source repository, privacy guidance, and issue
  feedback, with an explicit warning not to submit sensitive, private, or
  confidential document text.
- Add `npm run render:share-card` so contributors can reproduce the committed
  social image from its checked-in renderer.

### Changed

- Make the ready-to-run example the first launch action and preview its three
  concrete findings—a changed date, changed user count, and missing URL—before
  asking visitors to paste private text.
- Keep launch and mobile interactive controls at least 44 CSS pixels high,
  including the example-first path and public project links.
- Refresh the English and Simplified Chinese launch walkthroughs around the
  shortest path from the example to a private comparison and explicit feedback.
- Keep the v0.3.0 fact-recognition engine and public evaluation corpus
  unchanged. v0.3.1 is launch polish and does not claim broader recognition or
  improved accuracy.

## [0.3.0] - 2026-08-13

### Added

- Bring automatic fact warnings, must-preserve anomalies, and facts introduced
  only in the rewrite into one ordered human-review queue.
- Add optional review notes and expected-fix instructions, limited to 500
  UTF-16 code units per field.
- Add a bilingual, checkbox-based fix list containing confirmed issues only;
  it can be copied on its own and is also included in the full Markdown report.
- Add explicit export and import of local, unencrypted `.keepfacts.json` session
  files containing the editor text, last checked input, and human records. The
  strict schema and limits are documented in
  [`docs/session-format-v1.md`](docs/session-format-v1.md).

### Changed

- Migrate human records conservatively when a comparison is rerun: decisions
  survive only an exact stable-key match in unchanged anchor text or a unique
  identity match, and only while the evidence is unchanged. Changed evidence
  returns the item to pending but may retain its note and expected fix;
  ambiguous or unmatched records are never attached to a new finding silently.
- Keep human decisions, notes, expected fixes, review outcomes, and fix-list
  contents separate from deterministic machine counts and extracted-fact
  retention.
- Make session import validate the complete file locally, recompute any saved
  comparison input with the current engine, and restore only review records
  whose exact keys are still present.
- Keep the v0.2.1 fact-recognition engine and public evaluation corpus unchanged;
  v0.3.0 adds review and continuity tooling, not broader recognition or evidence
  of improved accuracy.

### Privacy

- KeepFacts still does not automatically save or upload source text, rewrites,
  must-preserve content, or human records. Reports and sessions are created only
  when the user explicitly exports them.
- Exported Markdown reports and `.keepfacts.json` sessions are unencrypted
  plaintext and may contain sensitive text and human annotations. Browser
  download folders, cloud-synced folders, backups, and similar software may
  copy or synchronize those files outside KeepFacts.

## [0.2.1] - 2026-08-13

### Changed

- Choose the initial interface and matching example from `?lang=zh|en` or the
  browser language, without changing user text when the language is switched.
- Distinguish example mode from the user's own text and add direct actions for
  starting a private comparison or viewing the example results.
- Show a single derived human-review outcome—draft, needs changes, or
  review complete with no confirmed issues—in both the interface and exported
  report.
- Confirm before an action discards completed human decisions and keep the
  current inputs, results, and decisions when the user cancels.
- Keep a concise local-processing notice visible on mobile and stop reusing an
  unknown local preview server during browser tests.
- Position KeepFacts as a local exact-fact preservation checker for AI
  rewrites, summaries, and translations, rather than a service that verifies
  whether claims are true.
- Define the displayed retention percentage as extracted-fact retention: its
  denominator contains only source facts recognized by the supported rules and
  does not represent full-document accuracy or extraction coverage.
- Surface that recognition is currently optimized for common Chinese and
  English formats, while retaining the v0.2 human-review and Markdown-report
  workflow.
- Align the English and Simplified Chinese documentation with these product
  boundaries and the public regression-gate methodology.

## [0.2.0] - 2026-08-13

### Added

- Add an in-page human review workflow for automatic warnings, must-preserve
  issues, and facts introduced only in the rewrite.
- Add `confirmed issue`, `acceptable rewrite`, and `ignored` decisions without
  changing deterministic machine counts or retention metrics.
- Include human review progress and per-finding decisions in bilingual,
  traceable Markdown reports.
- Add a realistic, manually annotated evaluation corpus with extraction,
  alert, added-fact, association, outcome, and normalization metrics.
- Paginate automatic and must-preserve result cards in groups of 50 for large
  documents, with keyboard focus moved to each new page.

### Changed

- Cache context features once per fact before global assignment, substantially
  reducing comparison time for fact-dense documents.
- Debounce must-preserve input feedback so full source scans no longer run on
  every render.
- Use one native radio group per finding so a complete decision set occupies a
  single keyboard tab stop and always includes an explicit pending state.
- Make report-version browser assertions follow package metadata automatically.

### Privacy

- Keep human review decisions in page memory only; KeepFacts does not persist
  source text, rewrite text, fact context, or review decisions in Web Storage.

## [0.1.7] - 2026-08-12

### Fixed

- Run release deployment from `main` to satisfy the repository's existing
  GitHub Pages environment policy.
- Require the matching version tag to point to the exact deployed commit,
  preserving tag-bound releases without changing repository settings.

## [0.1.6] - 2026-08-12

### Fixed

- Add a tag-bound manual recovery path for GitHub Pages when GitHub suppresses
  workflow events after multiple historical tags are pushed together.
- Resolve the deployed commit from the checked-out release tag so the interface
  and Markdown reports retain the correct build SHA during recovery runs.

## [0.1.5] - 2026-08-12

### Added

- Add source and rewrite values plus nearby context to every Markdown report
  item, together with the app version and build commit.
- Add browser regression tests for desktop and 390 px mobile layouts,
  accessibility, keyboard use, report export, localization, and stale results.

### Changed

- Run requested comparisons in a module Web Worker with cancellable, stale-safe
  result delivery and visible busy feedback.
- Explain formatting-equivalent preserved facts side by side in the interface.
- Clarify that result filters apply only to automatic facts and use native
  pressed-button semantics.
- Improve focus management, live result announcements, text contrast, reduced
  motion behavior, and localized page titles.
- Place optional must-preserve input before the comparison action.

### Fixed

- Omit empty must-preserve sections from reports.
- Preserve the actual source and rewrite spelling of normalized must-preserve
  matches in result context and exported reports.

## [0.1.4] - 2026-08-12

### Changed

- Run the full fact comparison only when requested instead of on every input
  keystroke, keeping large drafts responsive.
- Use precision-safe decimal normalization for numbers, money, measurements,
  and ranges.
- Improve repeated-fact association across reordered prose and list formats.

### Fixed

- Preserve numeric sign semantics and compound currency identifiers.
- Validate impossible time values and route dotted calendar dates through date
  validation instead of treating them as versions.
- Avoid interpreting contractions and possessives as quoted facts.
- Handle common full-width numeric forms without splitting them into misleading
  partial facts.

## [0.1.3] - 2026-08-12

### Changed

- Automatic fact retention and must-preserve checks are now reported separately.
- Matching repeated facts now uses context-aware one-to-one pairing.
- Centralized the displayed version on package metadata and added automated
  release-consistency checks.
- Refreshed responsive result controls for desktop and mobile layouts.

### Fixed

- Reject must-preserve entries that do not occur in the source text.
- Use the user's local date for Markdown reports and download filenames.
- Keep repeated copy and download feedback visible for the full duration.
- Mark results as outdated after input edits until the user checks again.
- Update Vite to 8.2.1 to resolve known development-server advisories.

### Security

- Audit production dependencies in CI and deploy tagged builds only after the
  complete validation suite passes.
- Pin GitHub Actions to immutable commits and enable weekly dependency updates.

## [0.1.2] - 2026-08-12

### Added

- Optional must-preserve names, terms, and key phrases, entered one per line.
- Copyable and downloadable Markdown reports for completed comparisons.
- Product screenshot, project badges, and a 30-second walkthrough in both READMEs.
- Tests for custom required content and deterministic report generation.

### Changed

- Result totals and retention now include user-defined must-preserve content.
- Refreshed responsive result controls for desktop and mobile layouts.

## [0.1.1] - 2026-08-11

### Added

- Public, data-driven validation corpus with 24 named cases.
- Reproducible validation guide with guarantees and known limitations.
- Safe mass, length, duration, and numeric-range unit conversions.
- Calendar validation for impossible numeric and English dates.

### Fixed

- Preserve case-sensitive URL paths while normalizing URL scheme and host.
- Avoid forcing unrelated facts into a misleading possible match.
- Recognize standalone `g` and `m` measurement units.
- Recognize facts followed by sentence-ending periods.
- Update the document language when switching between Chinese and English.

## [0.1.0] - 2026-08-08

### Added

- Local-only comparison of source and rewritten text.
- Detection for dates, times, money, percentages, quantities, versions, ranges,
  URLs, email addresses, quotes, and standalone numbers.
- Preserved, review, and newly-added fact states.
- Chinese and English interface and examples.
- Unit tests, continuous integration, and GitHub Pages deployment workflow.
