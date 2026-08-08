# Contributing to KeepFacts

Thank you for helping KeepFacts catch factual drift more reliably.

## Before opening a pull request

1. Keep the change focused on one fact type or one interface problem.
2. Add a minimal test that fails before the change and passes afterward.
3. Add at least one false-positive case for new recognizers.
4. Run `npm run check` locally.

## Development

```bash
npm install
npm run dev
```

The matching engine lives in `src/lib/facts.ts`. It is deterministic by design:
new rules should remain explainable and must not send user text to a server.

Please use fictional or public text in issues and tests. Do not submit personal,
confidential, medical, financial, or customer information.
