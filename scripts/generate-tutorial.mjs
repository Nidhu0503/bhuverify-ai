#!/usr/bin/env node
/**
 * Render the illustrated, fictional-only BhuVerify tutorial locally.
 * Requirements: Node 22+, @playwright/test, Chrome/Chromium, ffmpeg/ffprobe,
 * and macOS `say`. No network, real documents, credentials, or app server.
 * Run: node scripts/generate-tutorial.mjs
 * Optional: TUTORIAL_VOICE, FFMPEG, FFPROBE, TUTORIAL_BROWSER_CHANNEL,
 * TUTORIAL_BROWSER_EXECUTABLE. See docs/tutorial-production.md.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, copyFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'public', 'tutorial');
const basename = 'bhuverify-walkthrough';
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const ffprobe = process.env.FFPROBE || 'ffprobe';
const voice = process.env.TUTORIAL_VOICE || 'Samantha';
const fps = 24;

const scenes = [
  {
    id: 'welcome',
    title: { en: 'A clearer first check', hi: 'पहली जाँच, अधिक स्पष्टता से' },
    summary: 'Understand your documents. Know what to check next.',
    note: 'A reading aid — not a legal verdict.',
    segments: [
      { en: 'Welcome to BhuVerify, a reading aid for property documents.', hi: 'BhuVerify में आपका स्वागत है। यह संपत्ति के दस्तावेज़ समझने में मदद करता है।' },
      { en: 'These illustrations use fictional records. No official verification is performed.', hi: 'इन चित्रों में काल्पनिक रिकॉर्ड हैं। कोई आधिकारिक सत्यापन नहीं किया जाता।' },
    ],
  },
  {
    id: 'start',
    title: { en: 'Start with a case', hi: 'एक केस से शुरू करें' },
    summary: 'Try the sample first, or start a property case.',
    note: 'The sample uses fictional information.',
    segments: [
      { en: 'Choose Explore a sample case to learn safely.', hi: 'सुरक्षित अभ्यास के लिए Explore a sample case चुनें।' },
      { en: 'Or choose New property case to begin with your own document.', hi: 'या अपने दस्तावेज़ से शुरू करने के लिए New property case चुनें।' },
    ],
  },
  {
    id: 'document',
    title: { en: 'Add a document', hi: 'दस्तावेज़ जोड़ें' },
    summary: 'Check permission and privacy before you upload.',
    note: 'PDF · PNG · JPG · TXT — up to 10 MB',
    segments: [
      { en: 'Choose Add document. Supported formats are PDF, PNG, JPG, and TXT, up to ten megabytes.', hi: 'Add document चुनें। PDF, PNG, JPG और TXT फ़ाइलें समर्थित हैं; अधिकतम आकार 10 MB है।' },
      { en: 'Upload only with permission. Redact sensitive details, and read the consent notice first.', hi: 'अनुमति होने पर ही अपलोड करें। संवेदनशील जानकारी छिपाएँ और पहले सहमति सूचना पढ़ें।' },
    ],
  },
  {
    id: 'review',
    title: { en: 'Review the fields', hi: 'निकाली गई जानकारी जाँचें' },
    summary: 'Read the source. Correct what the app extracted.',
    note: 'Extraction can make mistakes.',
    segments: [
      { en: 'In Review fields, compare each extracted value with the source document.', hi: 'Review fields में हर निकाले गए मान का मूल दस्तावेज़ से मिलान करें।' },
      { en: 'Fix mistakes, check the quoted evidence, and save your corrections.', hi: 'गलतियाँ सुधारें, उद्धृत प्रमाण जाँचें और अपने सुधार सहेजें।' },
    ],
  },
  {
    id: 'checks',
    title: { en: 'Read each result', hi: 'हर परिणाम समझें' },
    summary: 'Document checks point to questions worth reviewing.',
    note: 'Not proof of fraud. Not title verification.',
    segments: [
      { en: 'Choose Run document checks, then read each explanation.', hi: 'Run document checks चुनें, फिर हर परिणाम की व्याख्या पढ़ें।' },
      { en: 'Needs attention means review is needed.', hi: 'Needs attention का अर्थ है समीक्षा ज़रूरी है।' },
      { en: 'Not established means evidence is missing or official checks are unavailable.', hi: 'Not established का अर्थ है प्रमाण उपलब्ध नहीं है या आधिकारिक जाँच उपलब्ध नहीं है।' },
      { en: 'Neither proves fraud or verifies legal title.', hi: 'इनमें से कोई भी धोखाधड़ी का प्रमाण या कानूनी स्वामित्व का सत्यापन नहीं है।' },
    ],
  },
  {
    id: 'services',
    title: { en: 'Take official next steps', hi: 'आधिकारिक अगला कदम उठाएँ' },
    summary: 'Use official Bihar services for further enquiries.',
    note: 'External links — not a live-record check.',
    segments: [
      { en: 'Open Bihar services for official next steps outside BhuVerify.', hi: 'BhuVerify के बाहर आधिकारिक अगले कदम के लिए Bihar services खोलें।' },
      { en: 'These links open external services. BhuVerify has not checked their live records.', hi: 'ये लिंक बाहरी सेवाएँ खोलते हैं। BhuVerify ने उनके लाइव रिकॉर्ड नहीं जाँचे हैं।' },
    ],
  },
  {
    id: 'reading',
    title: { en: 'Make reading easier', hi: 'पढ़ना आसान बनाएँ' },
    summary: 'Choose the reading experience that works for you.',
    note: 'Pause or replay this guide at any time.',
    segments: [
      { en: 'Open Reading settings to adjust text size, high contrast, and reduced motion.', hi: 'अक्षरों का आकार, उच्च कंट्रास्ट और कम गति चुनने के लिए Reading settings खोलें।' },
      { en: 'English and Hindi captions, and a written transcript, help you follow this video.', hi: 'अंग्रेज़ी और हिंदी कैप्शन तथा लिखित प्रतिलिपि इस वीडियो को समझने में मदद करते हैं।' },
    ],
  },
  {
    id: 'help',
    title: { en: 'Keep the guide close', hi: 'मार्गदर्शिका साथ रखें' },
    summary: 'Learn at your own pace. Verify before deciding.',
    note: 'No official verification is performed.',
    segments: [
      { en: 'Return to How it works whenever you need guidance.', hi: 'जब भी मदद चाहिए, How it works पर वापस आएँ।' },
      { en: 'Keep original documents, verify through official sources, and seek qualified advice before a property decision.', hi: 'मूल दस्तावेज़ सुरक्षित रखें, आधिकारिक स्रोतों से सत्यापन करें और संपत्ति का निर्णय लेने से पहले योग्य विशेषज्ञ की सलाह लें।' },
    ],
  },
];

const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const icon = (name, size = 30) => {
  const paths = {
    file: '<path d="M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="M4 12h16 M14 6l6 6-6 6"/>',
    external: '<path d="M14 3h7v7 M21 3 10 14 M10 5H4v16h16v-6"/>',
    book: '<path d="M12 5c-4-3-8-2-10-1v16c3-2 6-2 10 0 4-2 7-2 10 0V4c-2-1-6-2-10 1z M12 5v15"/>',
    shield: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.file}</svg>`;
};
const pill = (text, type = '') => `<span class="pill ${type}">${text}</span>`;
const row = (label, value) => `<div class="field"><span>${label}</span><strong>${value}</strong></div>`;
const visuals = [
  `<div class="visual intro"><div class="big-icon">${icon('shield', 80)}</div><h2>BhuVerify</h2><p>Read. Review. Know your next step.</p><div class="flow"><span>${icon('file')}<b>Document</b></span>${icon('arrow')}<span>${icon('check')}<b>Review</b></span>${icon('arrow')}<span>${icon('external')}<b>Next steps</b></span></div><div class="example">Illustrated guide · fictional records</div></div>`,
  `<div class="visual"><div class="card-label">YOUR STARTING POINT</div><div class="action primary">${icon('book')}<div>Explore a sample case<small>Practice with a fictional example</small></div>${icon('arrow')}</div><div class="action">${icon('file')}<div>New property case<small>Start with your own document</small></div>${icon('arrow')}</div><div class="soft-note">No real property data is used in this guide.</div></div>`,
  `<div class="visual"><div class="card-label">ADD DOCUMENT</div><div class="upload">${icon('file', 48)}<strong>Fictional-example.pdf</strong><span>PDF · PNG · JPG · TXT</span><b>Maximum 10 MB</b></div><div class="checkline">${icon('check')}<span>I have permission to upload.</span></div><div class="checkline">${icon('check')}<span>Sensitive details are redacted.</span></div></div>`,
  `<div class="visual"><div class="card-label">REVIEW FIELDS · FICTIONAL EXAMPLE</div>${row('Plot number', '42')}${row('Area', '100 sq m')}<div class="quote"><span>SOURCE QUOTE</span><strong>“Plot 42 · area 100 sq m”</strong></div><div class="checkline">${icon('check')}<span>Compare. Correct. Save.</span></div></div>`,
  `<div class="visual"><div class="card-label">RUN DOCUMENT CHECKS</div><div class="result">${pill('Needs attention', 'attention')}<p>Read the explanation.<br>Review the source document.</p></div><div class="result">${pill('Not established', 'unknown')}<p>Evidence is missing, or<br>official checks are unavailable.</p></div></div>`,
  `<div class="visual"><div class="card-label">BIHAR SERVICES</div><div class="service">${icon('external', 46)}<h2>Official next steps</h2><p>Continue on an external<br>government service.</p></div><div class="soft-note strong">No live government record<br>has been checked here.</div></div>`,
  `<div class="visual"><div class="card-label">READING SETTINGS</div><div class="setting"><strong>Text size</strong><span class="textsizes">A <b>A</b> <em>A</em></span></div><div class="setting"><strong>High contrast</strong><span class="switch"></span></div><div class="setting"><strong>Reduced motion</strong><span class="switch"></span></div><div class="soft-note">Video: English + Hindi captions<br>Written transcript available</div></div>`,
  `<div class="visual"><div class="card-label">HOW IT WORKS</div><div class="closing-icon">${icon('book', 58)}</div><h2>Go at your own pace.</h2><div class="checkline">${icon('check')}<span>Keep original documents.</span></div><div class="checkline">${icon('check')}<span>Use official sources.</span></div><div class="checkline">${icon('check')}<span>Seek qualified advice.</span></div></div>`,
];

function html(scene, index) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>BhuVerify illustrated guide</title><style>
  *{box-sizing:border-box}body{margin:0;width:1280px;height:720px;overflow:hidden;background:#f6f5f0;color:#123d34;font-family:Arial,Helvetica,sans-serif}header{height:94px;padding:29px 48px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #d6dfd9}header b{font-size:28px;letter-spacing:-1px}header .tag{font-size:18px;color:#385b51;letter-spacing:.2px}main{padding:45px 48px 25px;display:grid;grid-template-columns:480px 658px;gap:46px;height:526px}.eyebrow{font-size:17px;font-weight:700;letter-spacing:2px;margin:4px 0 23px}.intro-copy h1{font-size:54px;line-height:1.09;letter-spacing:-2px;margin:0 0 24px;max-width:470px}.intro-copy p{font-size:27px;line-height:1.4;max-width:458px;margin:0}.note{border-left:4px solid #1d6b55;padding:12px 0 12px 17px;margin-top:31px;font-size:20px;line-height:1.35;color:#345b4d;max-width:453px}.visual{height:438px;background:#fff;border:1px solid #d7e2dc;border-radius:24px;padding:30px;box-shadow:0 12px 30px #163e340a;width:100%;overflow:hidden}.card-label{font-size:17px;letter-spacing:1.5px;font-weight:700;margin-bottom:25px;color:#365e50}.visual h2{font-size:36px;line-height:1.2;letter-spacing:-1px;margin:16px 0}.visual p{font-size:24px;line-height:1.4;color:#3e5f54;margin:10px 0}.intro{text-align:center}.big-icon{width:98px;height:98px;display:grid;place-items:center;background:#e8f3eb;border-radius:27px;margin:0 auto}.intro h2{font-size:42px;margin:15px 0 6px}.intro p{font-size:23px;margin:0 0 20px}.flow{display:flex;justify-content:center;align-items:center;gap:22px}.flow span{display:flex;align-items:center;flex-direction:column;gap:8px}.flow b{font-size:17px}.example{margin:24px auto 0;font-size:17px;color:#45665a}.action{display:flex;align-items:center;gap:17px;border:1px solid #b8cfc2;border-radius:15px;padding:21px 20px;font-size:26px;font-weight:700;margin-bottom:20px}.action div{flex:1}.action small{display:block;font-size:18px;font-weight:400;margin-top:9px}.primary{background:#175b46;color:white;border-color:#175b46}.soft-note{padding:17px 20px;background:#edf3ee;border-radius:12px;font-size:20px;line-height:1.45;color:#36594b}.strong{font-weight:700;text-align:center}.upload{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;border:2px dashed #91b5a0;background:#f4f8f4;border-radius:16px;height:230px;margin-bottom:16px}.upload strong{font-size:26px}.upload span{font-size:20px}.upload b{font-size:18px}.checkline{display:flex;gap:12px;align-items:center;margin-top:13px;font-size:23px;line-height:1.35}.checkline svg{flex-shrink:0;color:#236b4e}.field{display:flex;justify-content:space-between;align-items:center;background:#f6f8f5;padding:18px 20px;border:1px solid #dce5df;border-radius:10px;margin-bottom:14px;font-size:24px}.field strong{font-size:27px;color:#174b38}.quote{background:#edf3ee;border-left:4px solid #37805b;padding:17px 18px;margin-top:20px}.quote span{display:block;font-size:14px;letter-spacing:1.5px;margin-bottom:10px}.quote strong{font-size:23px;font-weight:400}.result{padding:10px 0 16px}.result+.result{border-top:1px solid #dce5df;padding-top:21px}.pill{display:inline-block;border-radius:8px;padding:7px 12px;font-size:21px;font-weight:700}.attention{background:#ffefd2;color:#704511}.unknown{background:#e8edf2;color:#314965}.result p{font-size:23px;margin:10px 0 0}.service{text-align:center;margin:7px 0 23px}.service h2{margin:10px 0}.service p{margin:0}.setting{display:flex;justify-content:space-between;align-items:center;height:77px;border-bottom:1px solid #dce5df;font-size:24px}.setting:nth-of-type(4){margin-bottom:21px}.textsizes{display:flex;align-items:baseline;gap:14px}.textsizes b{font-size:31px}.textsizes em{font-size:39px;font-style:normal}.switch{width:54px;height:29px;background:#195b45;border-radius:20px;position:relative}.switch:after{content:'';position:absolute;width:21px;height:21px;background:white;right:4px;top:4px;border-radius:50%}.closing-icon{margin:8px 0 5px}.visual .closing-icon+h2{margin-bottom:25px}footer{position:absolute;bottom:0;left:0;right:0;height:84px;background:#153f34;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:22px 48px}.step{font-size:18px}.dots{display:flex;gap:8px}.dots i{width:27px;height:5px;background:#738e81;border-radius:4px}.dots i.active{background:#d9e9a2}.captions{font-size:17px;color:#edf2e6}
  .setting{height:68px}
  </style><body><header><b>BhuVerify<span style="color:#58816c"> / </span>How to use</b><span class="tag">Illustrated guide · fictional records</span></header><main><div class="intro-copy"><div class="eyebrow">${String(index + 1).padStart(2, '0')} / A SIMPLE WALKTHROUGH</div><h1>${escape(scene.title.en)}</h1><p>${escape(scene.summary)}</p><div class="note">${escape(scene.note)}</div></div>${visuals[index]}</main><footer><span class="step">${index + 1} of ${scenes.length} · ${escape(scene.title.en)}</span><div class="dots">${scenes.map((_, i) => `<i class="${i === index ? 'active' : ''}"></i>`).join('')}</div><span class="captions">English audio · English / Hindi captions</span></footer></body></html>`;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed. ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}
function duration(file) {
  const value = Number(run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid audio/video duration: ${file}`);
  return value;
}
function timestamp(seconds) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
function wrap(text, limit = 55) {
  const words = text.split(' ');
  const lines = [''];
  for (const word of words) {
    if (lines.at(-1).length + word.length + 1 > limit && lines.at(-1)) lines.push(word);
    else lines[lines.length - 1] += `${lines.at(-1) ? ' ' : ''}${word}`;
  }
  return lines.join('\n');
}
function vtt(language, transcript) {
  const cues = transcript.scenes.flatMap((scene) => scene.segments);
  return `WEBVTT\n\n${cues.map((cue, i) => `${i + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${wrap(cue[language], language === 'hi' ? 65 : 55)}\n`).join('\n')}`;
}

let scratch;
let browser;
try {
  run(ffmpeg, ['-version']);
  run(ffprobe, ['-version']);
  if (process.platform !== 'darwin') throw new Error('Narration generation needs macOS `say`. The delivered MP4 plays on other platforms.');
  const voices = run('say', ['-v', '?']);
  if (!voices.split('\n').some((line) => line.startsWith(`${voice} `))) throw new Error(`Speech voice "${voice}" is unavailable. Set TUTORIAL_VOICE to an installed English voice from say -v '?'.`);
  const { chromium } = await import('@playwright/test');
  const launch = { headless: true };
  if (process.env.TUTORIAL_BROWSER_EXECUTABLE) launch.executablePath = process.env.TUTORIAL_BROWSER_EXECUTABLE;
  else launch.channel = process.env.TUTORIAL_BROWSER_CHANNEL || 'chrome';
  browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  // All artwork is local HTML/SVG. Abort any accidental external request.
  await page.route('**/*', (route) => route.abort());
  scratch = await mkdtemp(path.join(tmpdir(), 'bhuverify-tutorial-'));
  await mkdir(destination, { recursive: true });
  const transcript = { version: 1, illustrated: true, duration: 0, scenes: [] };
  let total = 0;
  const clips = [];
  const audioClips = [];
  for (const [index, scene] of scenes.entries()) {
    const prefix = path.join(scratch, String(index).padStart(2, '0'));
    const frame = `${prefix}.png`;
    await page.setContent(html(scene, index), { waitUntil: 'load' });
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.visual, .intro-copy, main, header, footer')].filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map((el) => el.className || el.tagName));
    if (overflow.length) throw new Error(`Layout overflow in scene ${index + 1}: ${overflow.join(', ')}`);
    await page.screenshot({ path: frame });
    const segments = [];
    const audioFiles = [];
    let sceneDuration = 0;
    for (const [segmentIndex, segment] of scene.segments.entries()) {
      const spoken = `${prefix}-${segmentIndex}.aiff`;
      const padded = `${prefix}-${segmentIndex}.wav`;
      run('say', ['-v', voice, '-r', '170', '-o', spoken, segment.en]);
      const measured = duration(spoken);
      // Frame-align each utterance and leave a short pause for reading.
      const paddedDuration = Math.ceil((measured + 0.32) * fps) / fps;
      run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', spoken, '-af', `apad=whole_dur=${paddedDuration}`, '-t', String(paddedDuration), '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', padded]);
      segments.push({ ...segment, start: total + sceneDuration, end: total + sceneDuration + measured });
      audioFiles.push(padded);
      sceneDuration += paddedDuration;
    }
    const mergedAudio = `${prefix}.wav`;
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...audioFiles.flatMap((file) => ['-i', file]), '-filter_complex', `${audioFiles.map((_, i) => `[${i}:a]`).join('')}concat=n=${audioFiles.length}:v=0:a=1[a]`, '-map', '[a]', '-c:a', 'pcm_s16le', mergedAudio]);
    audioClips.push(mergedAudio);
    const clip = `${prefix}.mp4`;
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', String(fps), '-i', frame, '-t', sceneDuration.toFixed(6), '-c:v', 'libx264', '-tune', 'stillimage', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-r', String(fps), '-an', '-movflags', '+faststart', clip]);
    clips.push(clip);
    transcript.scenes.push({ id: scene.id, title: scene.title, narration: { en: scene.segments.map((segment) => segment.en).join(' '), hi: scene.segments.map((segment) => segment.hi).join(' ') }, start: total, end: total + sceneDuration, segments });
    total += sceneDuration;
    // Retain the eight modest PNGs for transparent visual QA and regeneration review.
    await mkdir(path.join(destination, 'scenes'), { recursive: true });
    await copyFile(frame, path.join(destination, 'scenes', `${String(index + 1).padStart(2, '0')}-${scene.id}.png`));
    if (index === 0) await copyFile(frame, path.join(destination, `${basename}-poster.png`));
    console.log(`Rendered ${index + 1}/${scenes.length}: ${scene.title.en} (${sceneDuration.toFixed(2)}s)`);
  }
  await browser.close();
  browser = undefined;
  const concat = path.join(scratch, 'clips.txt');
  const audioConcat = path.join(scratch, 'audio.txt');
  await writeFile(concat, clips.map((clip) => `file '${clip.replaceAll("'", "'\\''")}'`).join('\n'));
  await writeFile(audioConcat, audioClips.map((clip) => `file '${clip.replaceAll("'", "'\\''")}'`).join('\n'));
  const movie = path.join(destination, `${basename}.mp4`);
  // Encode one continuous lossless audio timeline, avoiding per-scene AAC padding.
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concat, '-f', 'concat', '-safe', '0', '-i', audioConcat, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '80k', '-ar', '48000', '-t', total.toFixed(6), '-movflags', '+faststart', '-metadata', 'title=BhuVerify — illustrated guide', '-metadata', 'comment=Fictional examples. No official verification is performed.', movie]);
  transcript.duration = total;
  await writeFile(path.join(destination, `${basename}.transcript.json`), `${JSON.stringify(transcript, null, 2)}\n`);
  for (const language of ['en', 'hi']) await writeFile(path.join(destination, `${basename}.${language}.vtt`), vtt(language, transcript));
  const metadata = JSON.parse(run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', movie]));
  const video = metadata.streams.find((stream) => stream.codec_type === 'video');
  const audio = metadata.streams.find((stream) => stream.codec_type === 'audio');
  if (video?.codec_name !== 'h264' || video?.pix_fmt !== 'yuv420p' || audio?.codec_name !== 'aac') throw new Error('Unexpected output codecs.');
  if (Math.abs(duration(movie) - total) > 0.15) throw new Error('Final media and caption timeline differ by more than 150 ms.');
  const bytes = (await stat(movie)).size;
  if (bytes > 6 * 1024 * 1024) throw new Error(`Video exceeds the 6 MiB target (${bytes} bytes).`);
  console.log(JSON.stringify({ video: path.relative(root, movie), seconds: duration(movie), bytes, width: video.width, height: video.height, captions: ['en', 'hi'], voice, scenes: scenes.length }, null, 2));
} catch (error) {
  console.error(`Tutorial generation failed: ${error.message}\nSee docs/tutorial-production.md for prerequisites and safe regeneration.`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  // Remove only the exact fresh directory this process created, never a supplied path.
  if (scratch) await rm(scratch, { recursive: true, force: true });
}
