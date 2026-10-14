# BhuVerify — browser-saved AI prototype

A separate, no-login Bihar land-document prototype with server-side Gemini
extraction and case-grounded Q&A. This separate working copy starts from the
Google AI Studio export downloaded on 14 October 2026. Neither the working
`bhuverify-prototype.ai.studio` manual app nor the original Firebase app is replaced.

**AI-version status:** not published. The export does not contain a Gemini API
key. Previous real-provider testing encountered errors; live AI extraction and
case Q&A must be verified again on this version before claiming they work.
The exported source retains browser persistence and exact-origin guards.
Its missing Dockerfile and matching dependency lockfile have been restored from
the previous repository without changing dependency versions.
See [earlier verification details](docs/verification.md) for historical results.

**Local verification (14 October 2026):** 207 offline tests, the TypeScript check,
the production build, nine production HTTP checks, and the isolated-browser
workflow passed. Browser and SDK tests use simulated provider responses; no live
Gemini requests were made. Unreadable server responses now report their HTTP
status instead of being mislabeled as connection failures.

Upload fictional documents → review extracted fields and quotes → compare papers
→ ask about the current case → export a report or workspace backup.
This app does not certify ownership, prove fraud, fetch government land records,
or replace an official search or professional advice.

## Run locally

Use Node.js 22 or newer:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Synthetic cases, manual review, comparison checks,
reports and browser backups work without a key.

For actual Gemini requests, copy the blank `.env.example` to an untracked
`.env.local`, set your server-only `GEMINI_API_KEY`, and restart. The default
model is `gemini-3.8-flash`; `GEMINI_MODEL` can select a compatible model
available to your account. A configured key is not proof of model access.
Set `BHUVERIFY_AI_ENABLED=false` to disable quota-consuming requests.
Never put a Gemini key in a `NEXT_PUBLIC_` variable or browser code.

## What is saved

Cases, reviewed fields and source quotes are saved in IndexedDB for this browser
profile and exact site origin. They can survive refreshes and return visits.
They do not sync between devices, profiles or different app URLs.
The browser can clear/evict data; private browsing is temporary. Export a
workspace JSON backup before switching sites or clearing browsing data.

There is no account or cloud backup. Others using the same browser profile can
open its saved cases. Original file bytes are not retained. With explicit consent,
AI extraction sends the uploaded file to Google; questions send only the selected
case's fields/quotes and your question. Google processing is subject to the terms
for your configured Gemini account. Use fictional data.

## Included

- Browser case CRUD, manual review, synthetic examples and deterministic checks.
- Gemini extraction with source quotes and current-case Q&A with citations.
- PDF, PNG, JPEG and UTF-8 text uploads, up to 10 MB each.
- Versioned workspace backup/import and per-case report export/print.
- Bihar service links, beginner guide, themes and accessibility controls.
- Stateless AI routes with exact-origin checks, bounded inputs, timeouts,
  safe errors and shared per-process request/concurrency limits.

No Firebase Authentication, Firestore, Storage, service-account key, ADC or
server case filesystem is used. Browser storage is not an authenticated vault.

## Verify

```sh
npm test
npm run typecheck
npm run build
PORT=3102 APP_ORIGIN=http://127.0.0.1:3102 BHUVERIFY_AI_ENABLED=false npm start
```

In another terminal:

```sh
BASE_URL=http://127.0.0.1:3102 npm run test:browser
BASE_URL=http://127.0.0.1:3102 npm run test:api
```

Browser verification uses isolated profiles and mocked AI, not live quota.
Real-provider tests require separate permission and fictional data.
Passing a build is not proof of a working published deployment.

## Deploy a new app

Follow [deployment](docs/deployment.md). Import this repository's `main` branch as a **new** app;
do not republish the working manual app or the original Firebase project. Keep the key server-side, set
the new exact `APP_ORIGIN`, and verify the published runtime config.
Do not assume the repository Dockerfile or environment file is automatically
used by AI Studio's managed publishing path.

Public visitors share the operator's Gemini quota/cost. In-process limits reset
on restart and multiply across instances; they are not a billing cap.

## Submission honesty

The supplied challenge rules mention Firebase and Firestore as required
technology. This branch omits both; disclosing the limitation does **not**
establish eligibility. Obtain organizer confirmation before submitting it.

- [Architecture](docs/architecture.md)
- [Security and limitations](docs/security.md)
- [Submission note and demo checklist](docs/hackathon.md)
- [Accessibility](docs/accessibility.md)
- [State adapters](docs/state-adapters.md)
