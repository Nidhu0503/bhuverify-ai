# Local verification — 11 October 2026

Source snapshot: prototype/gemini-no-firebase at d7d9230. This independent
repository starts fresh on main. Release-only documentation and upload-exclusion
changes were added after the snapshot; application code is unchanged. Original
branch/app unchanged.

Completed against the no-login browser-storage implementation:

- 187 unit and mocked-route tests across 11 files.
- TypeScript and production Next.js build.
- 9 real HTTP checks against the local production server, repeated successfully
  against the standalone production bundle. AI was explicitly disabled.
- 6 end-to-end browser scenario groups: synthetic case/checks/report/print;
  mocked extraction, review and current-case Q&A/citations; persistence across
  browser-process restart and separate-profile isolation; cross-tab refresh;
  backup/import/clear/delete; manual consent under a configuration change;
  provider-failure manual recovery and blocked-storage retry.
- 27 accessibility/theme browser tests, including selected axe scans,
  keyboard/focus, narrow/zoomed reflow and saved reading preferences.
- Desktop and 390px mobile screenshots inspected. Mobile has one header,
  one persistence banner and no horizontal overflow.
- No unexpected external requests or browser errors in the mocked workflow run.

Commands and scripts are in README.md. Browser artifacts are private generated
files under .qa/prototype-browser and playwright-report, not source exports.
These checks do not certify WCAG conformance or model accuracy.

## Authorized live Gemini checks

After the user configured a server-only local key, four explicitly authorized
generation requests were made with fictional data and `gemini-3.8-flash`:

1. Extraction: upstream HTTP 504 timeout; no result claimed.
2. Extraction: HTTP 200, ten fields returned, identifier `0042` preserved, and
   every returned quote matched the fictional input text.
3. Current-case Q&A: upstream HTTP 503 service error; no answer returned.
4. One separately approved Q&A retry: upstream HTTP 503 after about eight seconds;
   no answer returned. This used a small manually transcribed fictional case,
   not another extraction request. No automatic provider retries were used.

Gemini 3 requests now omit deprecated sampling parameters and use low thinking,
following the [model-specific guide](https://ai.google.dev/gemini-api/docs/generate-content/latest-model).
The successful extraction used the earlier explicit default-temperature setting;
the final omission is covered by mocked tests and was used for the last Q&A retry.
These results do not establish that generation settings caused either error.

The configured key is ignored/untracked in Git, and scanning all 25 generated
browser assets found no copy of its value. It was not displayed in test output.
No real property records were used.

## Not yet verified

Live grounded Q&A remains unverified because both provider attempts returned 503.
One successful extraction is not a reliability or model-accuracy certification.
AI Studio import, publishing, runtime secrets/origin, public model access and
continued availability during evaluation have not been verified. No deployment,
push, billing change or IAM repair was performed as part of this implementation.
