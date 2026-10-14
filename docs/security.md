# Security and privacy — no-login prototype

This branch is a fictional-data demonstration, not an authenticated private vault.

## Data boundary

IndexedDB stores case details, extracted/manual fields and quotes in this browser
profile for this origin. Others using the same profile can read them. No sync or
cloud backup is provided. Browser eviction, clearing data, private-mode closure or
a changed app URL can make cases unavailable. Export backups; backups contain case
content. Storage errors must be visible, not silently switch to transient storage.

Original file bytes are not retained by this application. With explicit consent,
Gemini extraction sends the file to Google, and Q&A sends only the selected case's
fields/quotes plus the question. Google processing follows the configured
account's terms; do not promise provider zero-retention. Imports/exports are local.

## Server boundary

The Gemini key stays in server environment variables. Public metadata/responses
must not expose it. No Firebase, ADC, auth cookies or server case storage exists.
AI routes validate origin, body size, file signatures, strict snapshot keys and
evidence bounds. Comparison findings are recomputed instead of trusting client
analysis. Structured extraction and cited source IDs are validated.
Documents are untrusted data, not instructions. No browsing tools are enabled.

Provider timeout: 90 seconds. Errors are sanitized; diagnostics must not include
keys, contents, questions, emails, tokens or raw provider messages. Failed AI must
not be labelled as successful extraction; manual review remains available.

## Abuse and availability

Exact-origin checks and shared per-process caps reduce accidental exposure, but
do not stop non-browser callers spoofing Origin, distribute quotas across
instances or impose a spending cap. Public visitors use the operator's quota.
Use provider restrictions and appropriate platform abuse controls before wide
sharing. Cloning/building this branch does not authorize billing or IAM changes.

## Accuracy and original app

Neither fields, quotes, matching papers nor citations certify authenticity or
legal ownership. No live registry lookups occur. Review every field and complete
official verification. Use fictional data.

The original Firebase app's revocation/ownership checks remain unchanged on its
separate branch. This independent no-login architecture does not weaken them.
