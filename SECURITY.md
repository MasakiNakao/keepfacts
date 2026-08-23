# Security Policy

## Supported versions and maintenance status

KeepFacts is feature-complete for its current documented browser workflow and
is in stable maintenance as a pre-1.0 (`0.x`) project. This status does not make
KeepFacts a v1 product or promise permanent API, file-format, or recognition
compatibility.

Security and maintenance fixes target only the latest tagged release on a
best-effort basis. Older tags do not receive a separate support branch. The
project provides no LTS branch and no response-time or remediation SLA. Future
patch releases are limited to security, bug, compatibility, accessibility,
documentation, and release-infrastructure fixes.

## Local processing and exported files

KeepFacts compares text with deterministic rules in the browser. It does not
automatically save or upload source text, rewrites, must-preserve content, or
human review records, and it does not intentionally send them to a server.
Working state remains in page memory unless the user explicitly exports a file.
The browser close/refresh warning is a best-effort loss-prevention prompt, not
automatic saving or a backup. A displayed checkpoint means only that the page
matched the most recently imported or exported session at that moment; later
changes must be exported again.

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
sensitive input. Schema v1 identifies the session data format; it is not a
KeepFacts v1 product or compatibility declaration.

## Reporting a vulnerability

GitHub private vulnerability reporting is not currently enabled for this
repository. Do not put vulnerability details, proof-of-concept code, secrets,
private text, session files, or reports in a public issue.
The public bug-report template's data-safety confirmation does not make an issue
private and must not be used for sensitive reproduction text.

Use the public
[security contact request](https://github.com/MasakiNakao/keepfacts/issues/new?template=security_contact.yml)
only to ask the maintainer to establish a private reporting channel. That issue
is public and is not a vulnerability report; include no technical details or
sensitive content. The project does not claim that a private channel exists
until the maintainer provides one directly.

## Product boundary

KeepFacts does not verify whether claims are true, and its rules do not
recognize every factual statement. Stable maintenance does not expand this
pre-1.0 method boundary. Do not rely on it as the sole review mechanism for
legal, medical, financial, safety-critical, or other high-stakes documents.
