# Changelog

All notable changes to KeepFacts will be documented here.

## [0.5.0] - 2026-08-24

### Added

- Add decision filters and local search across review facts, bilateral context,
  notes, and expected fixes. Matching evidence is highlighted in both the
  primary human-review queue and the collapsed machine record.
- Add visible editor limits and atomic insertion guards. Input that would
  exceed an editor limit is rejected with a recovery message instead of being
  silently truncated by the browser.
- Add explicit, safe session-import messages for a wrong filename extension,
  files above the byte limit, unsupported schemas, processing-limit failures,
  and damaged or structurally invalid content.
- Add public validation cases for suffix currencies, day-first English dates,
  malformed grouped currency boundaries, and parenthesized measurements,
  increasing the named validation set from 37 to 42 cases.

### Changed

- Keep human-review item numbers stable when moving to the next pending item;
  navigation changes focus and the active filter without rotating the queue.
- Paginate the human-review queue at 20 items while retaining 50-item pages for
  automatic and must-preserve machine details. Derived item maps, order, search,
  and summaries are memoized, and the full review queue is no longer rendered
  on one page.
- Reduce the mobile sticky review surface to progress, review state, and the
  current primary action. Fix-list and report exports remain immediately below
  it as non-sticky secondary actions.
- Show comparison and conservative review-migration outcomes visibly as well
  as through the live region. When edited input makes a deep result stale, the
  sticky workspace offers an in-place recheck action.
- Give pending, confirmed, acceptable, and excluded decisions distinct visual
  semantics while preserving native radio groups, forced-colors support,
  reduced motion, keyboard focus, and the existing paper / ink / green visual
  identity.
- Preserve a valid focus target when a filtered decision removes the current
  card, and expose `aria-controls` only while the controlled review queue exists.

### Fact engine and performance

- Preserve currency identity for suffix forms such as `100 USD`, `100 C$`, and
  `100 HK$`, and reject malformed grouped money or percentage fragments instead
  of extracting a misleading suffix.
- Recognize unambiguous day-first English dates such as `15 September 2026`.
- Treat parentheses around measurements as grouping, while continuing to
  recognize an explicit sign inside the parentheses.
- Split must-preserve input on CR, LF, CRLF, U+2028, and U+2029 consistently in
  editor limits, comparison, and schema-v1 review-key restoration.
- Bound email, percentage, overlap, and local-context scans for adversarial long
  input. The comparison Worker now performs one limited extraction per side and
  fails before allocating the dense matching matrix when the fact limit is
  exceeded.
- Reject ASCII currency codes embedded inside identifiers while preserving
  common Chinese-adjacent currency notation; validate email domain labels and
  retain NFKC-equivalent full-width addresses.

### Release safety

- Trigger automatic Pages builds only after successful tag CI, using the
  default-branch `workflow_run` context required by the existing
  `github-pages` environment. The build checks out the verified tag commit and
  requires the package tag, tag commit, CI SHA, checkout SHA, injected build
  SHA, and `origin/main` ancestry to agree.
- Keep repository code in a read-only build job; grant Pages and OIDC write
  permissions only to the separate deployment job. Manual fallback deployment
  remains restricted to `main` and an existing matching release tag.
- Add tests for trusted release identity, fail-closed ancestry checks, and the
  workflow permission/event contract.

### Scope and evidence

- v0.5.0 expands format support only for the named cases above; it does not add
  a new fact category or claim full-document understanding.
- The 42-case public validation file, 104 Node tests, 76 passing browser checks
  plus two intentional cross-project skips, and performance regressions cover
  named behavior. The manually annotated
  evaluation corpus remains unchanged, so passing it is not evidence of
  broader real-world extraction coverage.
- Session schema remains version 1. This product release does not make
  KeepFacts a v1 product or promise permanent compatibility.
- Maintenance policy now reserves patch releases for fixes, accessibility,
  documentation, compatibility, and release infrastructure; future feature or
  recognizer expansion requires a separately evidenced minor release.

## [0.4.0] - 2026-08-24

### Changed

- Make the human-review queue the primary result surface. Every review item now
  shows its source and rewrite evidence inline, while the complete automatic
  fact and must-preserve record remains available in one collapsed, keyboard-
  accessible disclosure.
- Clarify the human decisions as `confirmed issue`, `acceptable change`, and
  `out of this review`, with an explicit warning that excluding an item from
  this review is not a claim that it is correct.
- Distinguish draft and completed Markdown reports in both button labels and
  filenames. Filenames now include the review state and a UTC timestamp, so
  separate exports no longer overwrite one another as easily.
- Show whether the current in-memory work is unexported or matches the most
  recent imported/exported session. While user-created work has unexported
  changes, KeepFacts asks the browser to show its native close/refresh warning;
  it still does not autosave or upload that work.
- Refine the existing paper, ink, green, and yellow interface with clearer
  action hierarchy, higher-contrast placeholders and focus states, SVG status
  marks, a visible no-facts result, two-column mobile filters, and a compact
  non-sticky review toolbar in short landscape viewports.
- Add a bilingual, expandable recognition-scope disclosure beside the editor so
  supported fact types and known omissions are visible before a user interprets
  the result.

### Fixed

- Match mixed-script must-preserve terms such as `VIP`, `Project Atlas`, `v2`,
  and `AI` when they touch Chinese text, while retaining English word-boundary
  protection.
- Treat hyphens in compact money and percentage ranges such as `$100-$200` and
  `10%-20%` as range separators without breaking real negative values.
- Reset a migrated human decision when the same-looking value moves to a
  different nearby subject. Existing notes and expected fixes remain available
  for review instead of silently assigning the old decision to new evidence.
- Accept schema-v1 review keys generated from valid must-preserve items whose
  Unicode NFKC normalization expands their length, while preserving the legacy
  limit for ordinary keys and all existing file-size and input limits.
- Label an invalid date or time introduced only by the rewrite as invalid in
  both the interface and Markdown report instead of describing it as a generic
  addition.

### Release and reporting

- Deploy GitHub Pages from version tags (or an explicit manual tag) instead of
  every push to `main`, and verify that the current version is present in the
  package lock, changelog, both README status headings, validation heading, tag,
  and injected build commit.
- Require the reported KeepFacts version and an explicit public-data safety
  confirmation in the bug-report template before accepting reproduction text.

### Scope

- v0.4.0 fixes the named matching, migration, session, and invalid-value cases
  above, but does not add a new fact type or expand the public validation or
  manually annotated evaluation corpora. Passing those unchanged corpora is a
  regression guarantee for their named cases, not evidence of broader fact
  coverage or full-document accuracy.
- Session schema remains version 1. This product release does not make
  KeepFacts a v1 product or promise permanent compatibility.

## [0.3.3] - 2026-08-23

### Accessibility

- Add a keyboard-visible skip link that moves directly from the page start to
  the comparison workspace in both supported languages.
- Keep review notes and expected-fix fields out of the pending state, then
  reveal them after a human decision so the review order is clearer without
  removing either field.

### Changed

- Recompose the example-first launch area into an asymmetric editorial layout
  with one high-contrast three-row fact ledger, then quiet the working area
  into two symmetric proof sheets and grouped result records. Mobile presents
  the same evidence as three readable rows instead of a compressed dashboard,
  using the existing paper, ink, green, and yellow visual system.
- Tighten the launch spacing and editor height so the comparison workspace is
  visible sooner on desktop and mobile while preserving 44 CSS-pixel mobile
  targets.
- Remove duplicate section labels and the disabled example action, clarify the
  pending-review hint, and make typography, focus treatment, and result details
  more consistent.
- Replace the cramped mobile retention ring with a readable inline metric,
  tighten heading focus treatment, and include the branded home link in the
  44 CSS-pixel mobile target contract.
- Protect unsaved user-entered text as well as human-review records before
  clearing the workspace or replacing it with the example, and keep the
  English comparison workspace discoverable in the 390 px first view.

### Scope

- Keep the v0.3.2 fact-recognition engine, input/session limits, public
  validation corpus, and evaluation corpus unchanged. This patch improves the
  documented interface and accessibility; it does not claim broader fact
  coverage or improved recognition accuracy.

## [0.3.2] - 2026-08-15

### Maintenance

- Mark the current documented browser workflow as feature-complete and move the
  pre-1.0 project into stable maintenance. Only the latest tagged release is
  supported on a best-effort basis; there is no LTS branch or response-time
  SLA.
- Limit subsequent patch releases to security, bug, compatibility,
  accessibility, documentation, and release-infrastructure fixes. A session
  file's schema v1 is a data-format version, not a KeepFacts v1 product or
  compatibility promise.
- Update pinned patch dependencies within the existing React, React type, Vite
  React plugin, and Node 22 type lines; intentionally defer TypeScript and Node
  type major upgrades.
- Make the Open Graph and X/Twitter title and share-card path evergreen so
  future maintenance patches do not publish stale patch-version artwork. Keep
  the v0.3.1 image available for already cached links.

### Security

- Document the currently available public security-contact-request fallback
  without claiming that GitHub private vulnerability reporting is enabled.
  Public issues must not contain vulnerability details, proof-of-concept code,
  secrets, or private document text.

### Fixed

- Use one shared input-limit contract for the editor, comparison Worker, and
  schema-v1 session import/export so a comparison that KeepFacts accepts can be
  exported and restored under the same structural limits. Oversized work is
  rejected before starting the Worker without replacing the last result or
  human-review records.
- Cache the normalized source and rewrite search views once per comparison
  instead of rebuilding them for every must-preserve item. This keeps valid
  long schema-v1 sessions below the guarded import timeout while preserving the
  existing matching result.
- Add a 30-second comparison/import failure guard with retry-safe cleanup,
  distinguish first-run failures from failures that preserve an earlier
  result, and correct the no-facts, empty-filter, and repeated screen-reader
  feedback states.
- Use one timestamp per report or session export, retain a byte-stable v0.3.0
  schema-v1 compatibility fixture, and verify that release tags and injected
  build commit SHAs resolve to the checked-out commit.

### Scope

- Keep the v0.3.1 fact-recognition rules and both public fact corpora unchanged.
  The performance and lifecycle fixes do not change expected recognition
  results, and v0.3.2 does not claim broader recognition or improved accuracy.

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
