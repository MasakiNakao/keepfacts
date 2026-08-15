# Contributing to KeepFacts

Thank you for helping KeepFacts catch factual drift more reliably.

## Maintenance scope

KeepFacts is feature-complete for its current documented browser workflow and
is maintained as a pre-1.0 (`0.x`) project. Only the latest tagged release is
supported on a best-effort basis; there is no LTS branch or response-time SLA.
The session schema v1 is a data-format version, not a KeepFacts v1 product or
compatibility promise.

Patch contributions should stay within security, bug, compatibility,
accessibility, documentation, and release-infrastructure fixes. Proposals for
new product capabilities or fact recognizers need a separately scoped release,
tests, and evaluation evidence rather than being folded into a maintenance
patch.

## Before opening a pull request

1. Keep the change focused on one fact type or one interface problem.
2. Add a minimal test that fails before the change and passes afterward.
3. Add at least one false-positive case for new recognizers.
4. Update the annotated evaluation corpus when the change affects extraction,
   normalization, alerting, or fact association.
5. Run `npm run check` locally.

## Development

```bash
npm ci
npm run dev
```

The matching engine lives in `src/lib/facts.ts`. It is deterministic by design:
new rules should remain explainable and must not send user text to a server.

Please use fictional or public text in issues and tests. Do not submit personal,
confidential, medical, financial, or customer information.

Do not post vulnerability details or sensitive content in a public issue. See
[SECURITY.md](SECURITY.md) for the currently available contact-request process.

Evaluation annotations use JavaScript UTF-16 offsets and must satisfy
`text.slice(start, end) === raw`. Mention IDs and source-to-rewrite relations
are human-maintained ground truth; do not generate them from the current
detector and treat that output as an answer key. See `EVALUATION.md`.
