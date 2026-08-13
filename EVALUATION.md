# KeepFacts evaluation

KeepFacts v0.2 introduces a separate, deterministic evaluation layer for
automatic fact extraction and association. It complements the named regression
cases in `tests/validation-cases.json`; it does not replace them.

## Run the evaluation

Requirements: Node.js 22.13 or newer.

```bash
node --experimental-strip-types scripts/evaluate.ts
node --experimental-strip-types scripts/evaluate.ts --format json
node --experimental-strip-types scripts/evaluate.ts --case en-ops-001
node --experimental-strip-types --test tests/evaluate.test.ts
```

In the default mode, the process exits with code `0` when the public regression
gate passes and `1` when one of its thresholds fails. `--case` is a diagnostic
mode: it does not apply global thresholds and exits `1` when that case has any
prediction mismatch. Invalid corpus data, command-line input, or runtime state
exits `2` in either mode.

## Starter corpus

`tests/evaluation/real-v1.json` is a **starter corpus**, not evidence of general
accuracy. Its realistic examples are fictional composites released as CC0. It
currently covers Chinese, English, and mixed-language documents; changed,
missing, added, and invalid facts; repeated values attached to different
subjects; reordered prose; full-width text; and documents with no extractable
facts.

The current perfect score only means that the checked-in implementation agrees
with this small, public, human-authored corpus. The examples are visible to
developers, the sample is not representative of every document, and several
categories have small denominators. Do not advertise these results as a
population accuracy percentage. The `split=gate` cases are a visible **public
regression gate**, not an independent or unseen evaluation. Future evidence should add
licensed real-world material, independent annotation, larger per-category
samples, and separately governed external validation.

## Annotation schema

Each document pair contains:

- a stable case ID, language, domain, provenance, split, and descriptive tags;
- source and revision text;
- human-authored mentions on both sides;
- one relation for every source mention.

A mention has a stable local ID (`s01` or `r01`), fact kind, UTF-16 `start` and
`end` offsets, exact `raw` text, expected canonical value, validity, scope, and
a `semanticKey`. JavaScript must satisfy
`text.slice(start, end) === raw`. Runtime IDs such as `date-5-15` are never used
as ground truth because offsets can change when surrounding prose changes.

`semanticKey` distinguishes identical values attached to different subjects,
for example `north.users` and `south.users`. It must be unique on each side of a
case. If the same key exists on both sides, those two mentions must be related.
It helps annotators express fact identity but is not given to the matching
engine.

Every source mention has exactly one relation:

- `preserved`: one revision mention with the same valid canonical value;
- `changed`: one revision mention for the same semantic fact with a different
  valid canonical value;
- `missing`: no revision mention and a valid source mention;
- `invalid`: at least one side has an invalid recognized value. When no revision
  mention exists, the source mention itself must be invalid.

Relations are one-to-one. Revision mentions not claimed by a relation are the
ground-truth added facts. The validator rejects stale spans, duplicate IDs,
overlapping mentions, dangling relations, repeated revision targets, mismatched
semantic keys, and outcomes inconsistent with canonical values.

`scope` is reserved for separating the current documented contract (`core`)
from future exploratory material (`challenge`). The starter corpus uses core
mentions; future tooling must report excluded challenge coverage rather than
silently dropping difficult examples.

## Metrics

All extraction matches are strict `kind + UTF-16 span` matches. A boundary or
kind error is therefore one false positive and one false negative.

- **Source extraction P/R/F1**: annotated source mentions versus extracted
  source facts.
- **Revision extraction P/R/F1**: the same measurement on the revision.
- **Review alert P/R/F1**: `changed`, `missing`, and `invalid` source mentions
  are positives; preserved mentions are negatives.
- **Added P/R/F1**: unclaimed revision mentions versus facts reported as added.
- **Association P/R/F1**: correct one-to-one `sourceId -> revisionId` edges,
  independent of the value outcome.
- **Association + outcome P/R/F1**: the association and its
  `preserved/changed/missing/invalid` label must both be correct.
- **Normalization accuracy**: canonical value and validity agree for every
  correctly extracted mention.

The same source extraction, revision extraction, and normalization measurements
are reported by fact kind, together with source, revision, and normalization
support counts. This keeps a high-volume kind from hiding a regression in a
smaller supported kind.

The default CLI prints two explicitly named views: **All cases
(informational)** and **Public regression gate (`split=gate`)**. Only the second
view is compared with thresholds. The CLI also prints raw TP, FP, and FN counts,
derived precision/recall/F1, per-kind support, threshold failures, and localized
failure excerpts. `--format json` emits separate `all` and `gated` objects plus
`thresholdsAppliedTo`, so CI consumers cannot confuse the two views.

## Current public regression gate

The corpus file owns explicit thresholds so any threshold change is reviewable:

- source and revision extraction precision/recall: 90%;
- review precision: 85%, review recall: 90%;
- added precision/recall: 80%;
- association precision/recall: 85%;
- association + outcome precision/recall: 80%;
- normalization accuracy: 95%.
- for every fact kind supported by the gate on the source or revision side,
  explicit source/revision extraction recall floors of 90% and a normalization
  floor of 95%.

The schema requires those kind-level floors to be written in the corpus for
every kind with gate support; there are no implicit fallback values. Thresholds
are compared using unrounded values. These public gates prevent regression
against the starter evidence; they are not independent measurements or product
guarantees.

## Adding evidence

Annotate ground truth independently of `extractFacts()`. It is acceptable to
use the extractor to inspect a proposed example, but its output must not be
copied blindly into the corpus. For a recognizer change, add preserved,
changed-or-missing, added where relevant, and likely false-positive examples.
Prefer fictional composites or explicitly licensed public material. Never
commit private, customer, medical, financial, or confidential text.
