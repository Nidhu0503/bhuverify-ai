# Deploy as a separate AI Studio app

This is the independent prototype repository on `main`, derived from the reviewed
`prototype/gemini-no-firebase` snapshot, not the published Firebase service.
A successful local build is not a deployment. Live Q&A has not yet passed; see
[verification status](verification.md).

## Before publishing

- Preserve the original app. Use this independent prototype repository only.
- Create a new AI Studio app by importing this repository's `main` branch.
  Do not import or republish the original Firebase repository/app.
- Make source ZIPs from Git-tracked files (for example, git archive), not the
  entire working folder. Never include .env.local, .next, .qa, node_modules,
  credentials or private test artifacts in an import or public repository.
- Keep Firebase integration disabled for this new app.
- Set server-side Secrets/environment: GEMINI_API_KEY, GEMINI_MODEL (default
  gemini-3.8-flash), BHUVERIFY_AI_ENABLED=true, and APP_ORIGIN equal to the new
  app's exact HTTPS origin. Never use NEXT_PUBLIC_ for a Gemini key.
- For development preview, use npm run dev:studio and exact BHUVERIFY_PREVIEW_HOST.
  A preview hostname is not the production origin.
- No Firebase/ADC configuration is needed. BHUVERIFY_PERSISTENCE is not read.
- Check provider quotas and usage. Public visitors use the operator's key.
  Do not enable billing without approval.

Managed AI Studio publishing may use its own container pipeline. Verify actual
deployed settings rather than assuming this Dockerfile is used. See Google's
[build/deploy guide](https://ai.google.dev/gemini-api/docs/aistudio-build-mode).

## Production behavior

npm run build produces a standalone-compatible Next.js app. npm start runs root
server.js when present; otherwise next start on PORT (default 3000).
The Dockerfile builds a standalone Node container on port 8080, without a key.

AI POST requests require exact matching APP_ORIGIN. Missing/mismatched origins
fail closed. Do not remove this check or allow wildcard origins.

## Published smoke test

1. Open the new URL normally. No login should appear.
2. GET /api/config: persistence=browser, authRequired=false,
   originalRetention=none, firebase=null. aiEnabled only signals configuration.
3. Create a fictional case, consent to Google processing and upload a fictional
   TXT. Verify genuinely successful extraction, then review/correct a field.
4. Run checks and ask a current-case question. Inspect citations. Use a second
   case to verify answers do not use another case.
5. Refresh and close/reopen the browser: cases should return in the same profile.
   Another profile starts empty. Test backup import/export and report export.
6. Check mobile layout, failure messages and safe logs. Verify wrong/missing
   Origin and oversized inputs are rejected without provider calls.

Use fictional data only. A rendered homepage is not enough to validate AI.
Keep the original app unchanged.

## Abuse and quota limitations

Built-in shared per-process caps: 2 concurrent, 12/minute, 120/hour, 300/day.
BHUVERIFY_AI_LIMIT_* can lower these. Restarts reset counters and multiple
instances multiply allowances. Origin is not authentication; scripted clients
can forge it. Restrict provider quotas and platform scaling; wider use needs
distributed rate limits and abuse controls. Alerts are not hard spending caps.
