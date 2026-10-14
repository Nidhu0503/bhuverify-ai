# Reading accessibility and beginner help

For this no-login branch's current test results, see [verification.md](verification.md).
The dated validation notes below describe the original implementation's history.

BhuVerify provides reading controls and a bilingual learning centre. These are
accessibility improvements, not a claim of WCAG conformance or a substitute for
testing with the people who will use the app.

## Light and dark themes

Use the **Color theme** selector in the top bar to choose **Light**, **Dark**, or
**System**. System is the default and follows changes to your device's appearance.
An explicit Light or Dark choice stays selected until you change it. The choice
is saved locally under `bhuverify-color-theme` as a version and theme preference;
it contains no case data and is separate from reading settings. Tabs on the same
site update when this preference changes in another tab. If storage is blocked,
the change still works for this visit and a visible status explains the limit.

High contrast works in both light and dark themes. Changing theme does not reset
text size or reduced motion, and **Reset settings** in the reading dialog does
not reset the theme. The theme is applied before the page's initial paint through
a fixed script alongside the reading-preference bootstrap. The CSP guidance
below applies to both scripts. Print styles stay light; document content, video
frames and posters are never recoloured with an inversion filter.

## Reading controls

Open **Reading settings** in the top bar. Changes apply immediately:

- **Standard**, **Large**, and **Extra large** set the root text size to 100%,
  125%, and 150%. Browser zoom remains available independently; the app does not
  impose a zoom limit.
- **High contrast** strengthens text, borders, and backgrounds without changing
  document data or the meaning of findings.
- **Reduced motion** limits CSS animations, transitions, and smooth scrolling.
  The operating system's reduced-motion preference takes precedence, including
  after reset. This setting does not disable a video that the user chooses to play.
- **Reset settings** restores the app defaults and removes only the reading
  preferences key, not cases or other browser storage.

The native dialog supports keyboard navigation, Escape to close, and focus
restoration to its opener. Other improvements include visible focus indicators,
a skip-to-content link, responsive layouts, and larger interactive targets.
Success notifications are inline and dismissible rather than covering content
or disappearing after a short timer.

Only the version, text-size choice, high-contrast flag, and reduced-motion flag
are saved under `bhuverify-reading-preferences` in this browser's `localStorage`.
The controls do not read or store document text, case identifiers, or account
details, and do not send these preferences to a server. Preferences are local to
the browser and site, not synchronized across devices. If storage is blocked,
changes still apply for the current visit and the dialog explains that they
could not be saved. Malformed saved values fall back to the defaults.

## Beginner help and video

Open **Help** or **How it works** to reach **How to use BhuVerify**. The learning
centre contains six practical steps, a glossary, FAQs, and a sample-case action.
Its English/Hindi selector changes only the help text and visible transcript.
Workspace controls remain in English; this is not a full-app translation.

The self-hosted walkthrough is approximately 83 seconds long, with English
narration, English and Hindi caption tracks, and a complete visible text
transcript in either help language. Hindi captions are translations, not Hindi
audio. Captions are selected independently using the browser's native player;
English is the default track. The video uses native controls, inline playback,
`preload="none"`, a poster, and no autoplay. If media loading fails, a status
message points to the transcript; the written guide remains usable.

The video uses fictional records and narrated illustrations. It does not show a
government connection, live record retrieval, title certification, or fraud
determination. Tutorial delivery adds no third-party video embed and does not
read or narrate private documents. See [tutorial production](tutorial-production.md)
for assets, regeneration, caption timing, and media-specific verification.

## Implementation and deployment notes

Reading preferences and validation live in
[`src/lib/accessibility.ts`](../src/lib/accessibility.ts); the dialog is in
[`src/components/accessibility-controls.tsx`](../src/components/accessibility-controls.tsx).
The fixed inline bootstrap in [`src/app/layout.tsx`](../src/app/layout.tsx)
applies validated preferences before the initial paint to reduce a flash of
default-sized content. It contains no user-authored script or document data.

If a nonce-based strict Content Security Policy is introduced, supply this
bootstrap with the per-response CSP nonce and authorize that nonce in
`script-src`, alongside the framework's scripts. The current inline bootstrap
has no nonce. Do not assume it will run under a future strict CSP, or weaken the
policy with `unsafe-inline` just to restore it. Recheck initial preferences,
hydration, and blocked-storage fallback after changing the policy.

## Verification and remaining manual work

Run `npm test`, `npm run typecheck`, and the browser suite described in the
[README](../README.md#verify). Relevant tests are:

- `tests/accessibility.test.ts`: stored-value validation, non-sensitive field
  allowlisting, storage failure, reset, and pre-paint initialization parity.
- `tests/learning-content.test.ts`: bilingual step coverage, exact transcript
  parity with the video source, native player attributes, and busy sample state.
- `tests/accessibility.ui.spec.ts`: keyboard/focus behavior, mobile navigation,
  preference persistence, storage failure, system motion changes, English/Hindi
  help, captions, unavailable media, reflow, and axe scans of selected views.
- `tests/theme.test.ts`: theme parsing, storage isolation/failure, system resolution
  and before-paint initialization parity.
- `tests/theme.ui.spec.ts`: light/dark/system persistence, live device and cross-tab
  changes, blocked storage, keyboard selection, initial theme before hydration,
  reflow, media preservation, and dark/high-contrast scans across app views.

The browser suite uses a separate local server with live AI disabled and
fictional fixtures. Its 320 CSS-pixel viewport and 200% root-font scenarios are
automated reflow checks, not a substitute for real browser-zoom testing. Its axe
checks target selected WCAG 2.0/2.1 A/AA rules and flag serious/critical findings
and contrast failures; the theme suite additionally fails on every reported
violation under those tags. Passing them cannot certify WCAG conformance.
Automated checks must be combined with manual assessment and inclusive user
testing, as explained in [Playwright's accessibility-testing guidance](https://playwright.dev/docs/accessibility-testing).

On 8 October 2026, 49 unit tests, 20 local API smoke checks, and 16 Chrome browser
tests passed, along with TypeScript and an isolated production build. The browser
suite included seven axe scans across the reading dialog and selected standard/
high-contrast views. Inconclusive axe results involving gradients, overlapping
dialog backgrounds, and the closed dialog reference still require manual
assessment. Production-layout screenshots and the final mobile Hindi layout
were also visually reviewed. These checks used fictional data and no live AI.

The subsequent theme update on the same date passed 56 unit tests and 31 browser
tests (the existing 16 plus 15 theme tests), TypeScript, and an isolated production
build. Its 26 additional dark/high-contrast axe scans reported no violations.
Production browser checks confirmed both palettes, dark high contrast, mobile
reflow, no runtime errors, and a light print palette. Manual checks below remain
necessary; a dark theme is not itself an accessibility certification.

Before a public launch, use the [W3C WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/)
to plan a full assessment, including:

- Real browser zoom at 200% and 400%, text spacing, narrow screens, and task
  completion with people with low vision.
- VoiceOver and TalkBack checks for navigation, forms, dialogs, errors, language
  changes, transcript reading order, and native video/caption controls.
- Keyboard-only completion of case creation, upload consent, field review,
  document checks, and opening help without losing focus or context.
- Qualified human review of the Hindi text and captions, plus listening to the
  synthetic English narration for pronunciation, pacing, and completeness.
- Review of external official sites and uploaded documents as separate
  accessibility dependencies; the app's controls do not make those accessible.

Keep manual findings and the exact tested browser/assistive-technology versions
with release evidence. No completed VoiceOver, TalkBack, Hindi-language expert,
or low-vision participant assessment is claimed here.
