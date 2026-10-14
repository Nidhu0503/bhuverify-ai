# Architecture — browser-saved AI branch

The browser owns the case collection in IndexedDB. Each origin/browser profile
has its own workspace. No case collection is sent to a server database.

1. GET /api/config returns public capability metadata, never credentials.
2. Synthetic/manual case changes commit locally in IndexedDB.
3. With explicit consent, POST /api/ai/extract accepts a file and kind. The server
   validates size/type, calls Gemini with structured output, validates the fields
   and quotes, and returns results. Original bytes are not retained by the app.
4. The browser saves metadata, fields, source quotes and manual corrections.
5. A question sends only the selected case to POST /api/ai/assistant.
6. The server validates strict bounds/keys, recomputes comparison findings,
   constructs the evidence catalog, calls Gemini and validates source IDs.
7. Reports and versioned workspace backups download from the browser.

The Gemini key remains server-side. There are no browsing tools or live
government-record APIs. Files and browser snapshots are untrusted inputs;
citations do not establish that papers are authentic.

There are no Firebase imports, accounts, auth cookies, Firestore operations or
server case-file writes. The original implementation remains on its parent branch.
Cloud Run temporary disk is not used for durability. A server restart does not
erase browser cases; cleared storage or a different URL can make them unavailable.
