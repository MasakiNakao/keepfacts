# Changelog

All notable changes to KeepFacts will be documented here.

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
