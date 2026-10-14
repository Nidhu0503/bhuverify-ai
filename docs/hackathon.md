# PlotTwist submission preparation

Team: PlotTwist
Leader: Nidhu
Member: Sparsh Shekhar
Challenge option: confirm the exact form selection.

## Eligibility

The supplied rules mention Firebase, Firestore, Cloud Run and Gemini. The form
requires a prototype on GCP/Cloud Run. This branch uses browser IndexedDB and
Gemini but omits Firebase Auth and Firestore. Disclosure does not waive mandatory
requirements: obtain organizer confirmation before submitting this alternative.

## Honest integration note

Original managed deployment diagnostics reported auth/insufficient-permission
during server token-revocation checks. The reported missing permission was
firebaseauth.users.get; the managed environment did not provide IAM repair
authority. The original checks were preserved. This separate prototype instead
uses browser IndexedDB and server-side Gemini, without Firebase Auth/Firestore.
This is a deployment-permission limitation, not a claim that Firebase is broken.

## Description draft (verify deployment first)

BhuVerify by PlotTwist helps people compare Bihar land papers before taking
their next step. Users upload fictional documents, review extracted facts,
compare plot identifiers and parties, and ask questions grounded in the current
case with source quotes. Gemini performs extraction and explanations through a
server-side API key. Cases and reviewed evidence are saved in the same browser
using IndexedDB, with backup import/export and report export. The prototype is
intended for Google Cloud Run deployment through AI Studio. Firebase Auth and
Firestore are not integrated in this branch because the original managed
deployment encountered unresolved IAM permissions during token-revocation checks.
No live government-record verification, ownership certification or legal
determination is claimed.

Replace "intended for" only after checking the published workflow.

## Submission checklist

- Public working GCP/Cloud Run prototype throughout evaluation.
- Public GitHub source matching the app; no credentials.
- Prescribed pitch template as PDF, at most 5 MB.
- Video no longer than 3 minutes (the form is stricter than the earlier 3–4 note).
- Description at most 1024 characters, with accurate Google-service use.
- Confirm challenge selection and acceptance of the Firebase omission.

## Three-minute demonstration

0:00–0:20 Problem and fictional-data/non-certification boundary.
0:20–0:50 Create case, upload fictional file and show Gemini extraction.
0:50–1:20 Review fields, compare papers and inspect a discrepancy/quote.
1:20–1:55 Current-case question, citations and no-government-lookup boundary.
1:55–2:25 Refresh for persistence; export report and backup.
2:25–2:55 Architecture, limitations, Firebase omission and next steps.
Leave a few seconds' margin.
