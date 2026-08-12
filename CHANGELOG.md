# Changelog

All notable changes to KeepFacts will be documented here.

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
