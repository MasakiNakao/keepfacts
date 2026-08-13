# Security Policy

## Local processing and exported files

KeepFacts compares text with deterministic rules in the browser. It does not
automatically save or upload source text, rewrites, must-preserve content, or
human review records, and it does not intentionally send them to a server.
Working state remains in page memory unless the user explicitly exports a file.

User-initiated exports are not encrypted:

- a Markdown report may include findings, source and rewrite values, nearby
  context, human decisions, notes, and expected fixes;
- a `.keepfacts.json` session includes the full source, rewrite, must-preserve
  content, and current editor state plus, when present, the last checked input
  and human review records.

Anyone who can read an exported file can read that content. Browser download
folders, cloud-synced folders, backup tools, device indexing, endpoint-security
software, and similar services may copy or synchronize exported files outside
KeepFacts. Review the destination before exporting, limit sharing, and delete
files according to your own data-handling requirements.

Session imports are parsed and validated locally against an exact versioned
JSON schema and explicit size limits. Invalid, unsupported, or oversized files
are rejected. The accepted v1 fields and limits are documented in
[`docs/session-format-v1.md`](docs/session-format-v1.md). Schema validation does
not make the plaintext safe to disclose; treat session files as untrusted and
sensitive input.

## Reporting a vulnerability

Please use GitHub private vulnerability reporting when it is available rather
than posting sensitive details, private text, session files, or reports in a
public issue.

## Product boundary

KeepFacts does not verify whether claims are true, and its rules do not
recognize every factual statement. The project is experimental. Do not rely on
it as the sole review mechanism for legal, medical, financial, safety-critical,
or other high-stakes documents.
