# BhuVerify tutorial production

The delivered tutorial is a real, locally playable MP4, not an embedded third-party video or a placeholder. It is an illustrated walkthrough using fictional records, not a recording of government verification or live property data.

## Delivered assets

- `public/tutorial/bhuverify-walkthrough.mp4`: 1280 × 720 H.264, yuv420p, AAC English narration, fast-start metadata.
- `public/tutorial/bhuverify-walkthrough-poster.png`: first scene, shown before playback.
- `public/tutorial/bhuverify-walkthrough.en.vtt`: English narration captions.
- `public/tutorial/bhuverify-walkthrough.hi.vtt`: Hindi translations, not Hindi audio.
- `public/tutorial/bhuverify-walkthrough.transcript.json`: bilingual transcript, scene timings, and timed caption segments.
- `public/tutorial/scenes/*.png`: the eight rendered frames for visual review.

## Regenerate

Run `node scripts/generate-tutorial.mjs` from the repository with Node 22 or later. Requirements:

1. Existing `@playwright/test` project dependency; no new runtime packages are needed.
2. Installed Chrome (default `chrome` Playwright channel), or set `TUTORIAL_BROWSER_CHANNEL` or `TUTORIAL_BROWSER_EXECUTABLE` to an available Chromium browser.
3. `ffmpeg` and `ffprobe` on `PATH`, including libx264 support. Set `FFMPEG` and `FFPROBE` to executable paths if necessary.
4. macOS `say` with the English `Samantha` voice; set `TUTORIAL_VOICE` to another installed English voice if necessary. List voices with `say -v '?'`.

The generation tool checks prerequisites and reports failures; it does not download dependencies. Browser launch or local speech synthesis may need permission in a restricted execution environment. The generated files play on platforms other than macOS; only local narration regeneration requires macOS.

The script uses no remote API, credentials, environment file, live records, real uploads, or external fonts. Its browser blocks external requests. It overwrites only named tutorial outputs and deletes only the fresh temporary directory it creates. All source scenes and both languages live in the script. Update them together with UI labels when the workflow changes.

## Accessibility and safety

The eight scenes use large, high-contrast text and stationary illustrations, with no autoplay, flashing, or motion-dependent meaning. Native player controls, captions, and the visible bilingual transcript are supplied by the learning-center component. English audio narrates the meaningful actions, so the illustrations are not required to understand the workflow. Hindi captions translate the English voice track; they are not a separate Hindi voice track.

Every frame identifies the material as an illustrated guide with fictional records. The voice and graphics explain that document checks do not prove fraud, establish legal title, or perform official verification. External Bihar services are described as next steps, not as evidence of an integration or live-record check.

Each caption segment is timed from the actual synthesized utterance using `ffprobe`. The script adds short pauses, frame-aligns scenes, validates codecs and timeline length, checks layout overflow, and limits the video to 6 MiB. Browser-native caption settings remain user-controlled.

## Verification

After generation, inspect all eight `scenes` images and test video playback and both caption tracks in the app. The generator prints measured duration, byte size, dimensions, language tracks, and narration voice. Use `ffprobe -v error -show_streams -show_format public/tutorial/bhuverify-walkthrough.mp4` for independent stream validation. Narration quality is synthetic, so listen before publication; qualified human review of the Hindi translation is recommended for a public launch.

### Delivered build checks

The delivered build is 82.666667 seconds long and 1,323,676 bytes (about 1.26 MiB). It contains eight illustrated scenes and 18 caption cues in each language. Independent FFmpeg inspection confirmed 1280 × 720 H.264/yuv420p at 24 fps and a mono 48 kHz AAC audio stream. Audio analysis measured a mean level of −16.3 dB and peak of −2.0 dB.

All eight full-size scene images were visually inspected with no clipped text. A local, range-enabled HTTP fixture in installed Chrome verified actual playback, decoded audio, seeking to the document-check scene, and parsing/activation of all 18 cues in each native caption track. `public/tutorial/qa-en-captions.png` and `public/tutorial/qa-hi-captions.png` show that scene with actual browser-rendered captions. This fixture was muted during automated playback; audio measurements establish that the delivered voice track is present, not a substitute for a human pronunciation review.
