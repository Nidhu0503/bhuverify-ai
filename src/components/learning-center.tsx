"use client";

import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  FileSearch,
  FolderPlus,
  Languages,
  Leaf,
  Loader2,
  PlayCircle,
  ScanText,
  Settings2,
  ShieldAlert,
  UploadCloud,
} from "lucide-react";
import {
  LEARNING_CONTENT,
  LEARNING_TRANSCRIPT,
  type HelpLanguage,
} from "@/lib/learning-content";

const stepIcons = [FolderPlus, UploadCloud, ScanText, FileSearch, ArrowUpRight, Settings2];

export function LearningCenter({
  onStartSample,
  busy = false,
}: {
  onStartSample: () => void;
  busy?: boolean;
}) {
  const [language, setLanguage] = useState<HelpLanguage>("en");
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const copy = LEARNING_CONTENT[language];
  const retentionNote = language === "hi"
    ? "इस प्रोटोटाइप में लॉगिन या Firebase नहीं है। केवल काल्पनिक दस्तावेज़ इस्तेमाल करें। केस इसी ब्राउज़र प्रोफ़ाइल में सहेजे जाते हैं और सामान्य रीफ़्रेश के बाद रहते हैं; दूसरे उपकरणों पर अपने-आप नहीं आते। नियमित बैकअप लें। ब्राउज़र का डेटा साफ़ करने से केस मिट सकते हैं। अनुमति देने पर दस्तावेज़ या मौजूदा केस की जानकारी सर्वर के ज़रिए Google Gemini को भेजी जाती है; Google की लागू शर्तें लागू होती हैं। ऐप मूल फ़ाइल नहीं रखता।"
    : "This prototype has no sign-in or Firebase. Use fictional documents only. Cases persist in this browser profile across ordinary refreshes; they do not sync to other devices. Export a backup regularly: clearing browser data can remove cases, and anyone using this profile can access them. With consent, document files or current-case evidence pass through the app server to Google Gemini under Google’s applicable terms. The app does not retain originals.";

  return (
    <div className="learning-center" lang={language}>
      <header className="learn-heading">
        <div>
          <p className="learn-eyebrow">{copy.eyebrow}</p>
          <h1>{copy.heading}</h1>
          <p className="learn-introduction">{copy.introduction}</p>
        </div>
        <div className="learn-language">
          <span id="help-language-label" className="learn-label">
            <Languages aria-hidden="true" /> {copy.languageLabel}
          </span>
          <div className="learn-language-options" role="group" aria-labelledby="help-language-label" aria-describedby="help-language-note">
            <button
              type="button"
              lang="en"
              aria-pressed={language === "en"}
              onClick={() => setLanguage("en")}
            >
              English {language === "en" && <Check aria-hidden="true" />}
            </button>
            <button
              type="button"
              lang="hi"
              aria-pressed={language === "hi"}
              onClick={() => setLanguage("hi")}
            >
              हिन्दी {language === "hi" && <Check aria-hidden="true" />}
            </button>
          </div>
          <p id="help-language-note">{copy.languageNote}</p>
        </div>
      </header>

      <aside className="learn-caution" aria-label={language === "hi" ? "ब्राउज़र स्टोरेज और AI की जानकारी" : "Browser storage and AI processing"}><ShieldAlert aria-hidden="true" /><div><h2>{language === "hi" ? "ब्राउज़र स्टोरेज और AI की जानकारी" : "Browser storage and AI processing"}</h2><p>{retentionNote}</p></div></aside>

      <div className="learn-start-grid">
        <section className="learn-video-card" aria-labelledby="learn-video-title">
          <div className="learn-card-heading">
            <span className="learn-icon"><PlayCircle aria-hidden="true" /></span>
            <div>
              <h2 id="learn-video-title">{copy.videoHeading}</h2>
              <p>{copy.videoNote}</p>
            </div>
          </div>
          <video
            className="learn-video"
            controls
            playsInline
            preload="none"
            poster="/tutorial/bhuverify-walkthrough-poster.png"
            aria-labelledby="learn-video-title"
            aria-describedby="learn-video-description"
            onError={() => setVideoUnavailable(true)}
            onCanPlay={() => setVideoUnavailable(false)}
          >
            <source
              src="/tutorial/bhuverify-walkthrough.mp4"
              type="video/mp4"
              onError={() => setVideoUnavailable(true)}
            />
            <track
              kind="captions"
              src="/tutorial/bhuverify-walkthrough.en.vtt"
              srcLang="en"
              label="English"
              default
            />
            <track
              kind="captions"
              src="/tutorial/bhuverify-walkthrough.hi.vtt"
              srcLang="hi"
              label="हिन्दी"
            />
            <p>{copy.videoFallback}</p>
          </video>
          <div className="learn-video-caption">
            <p id="learn-video-description">{copy.videoDescription}</p>
            {videoUnavailable && <p role="status" className="learn-video-error">{copy.videoFallback}</p>}
            <div className="learn-video-links">
              <a href="#learn-transcript"><BookOpen aria-hidden="true" />{copy.transcriptLink}</a>
              <a href="/tutorial/bhuverify-walkthrough.mp4" target="_blank" rel="noopener noreferrer">
                {copy.downloadVideo}<ArrowUpRight aria-hidden="true" />
                <span className="sr-only"> ({copy.newTab})</span>
              </a>
            </div>
          </div>
        </section>

        <aside className="learn-sample-card" aria-labelledby="learn-sample-title">
          <div className="learn-sample-symbol" aria-hidden="true"><Leaf /></div>
          <p className="learn-eyebrow">{copy.sampleEyebrow}</p>
          <h2 id="learn-sample-title">{copy.sampleHeading}</h2>
          <p className="learn-sample-description">{copy.sampleDescription}</p>
          <button type="button" className="learn-primary-button" onClick={onStartSample} disabled={busy}>
            {busy ? <Loader2 aria-hidden="true" /> : <FolderPlus aria-hidden="true" />}
            {busy ? copy.sampleBusy : copy.sampleButton}
            {!busy && <ArrowRight aria-hidden="true" />}
          </button>
          <p className="learn-sample-note"><ShieldAlert aria-hidden="true" />{copy.sampleNote}</p>
        </aside>
      </div>

      <aside className="learn-caution" aria-labelledby="learn-caution-title">
        <ShieldAlert aria-hidden="true" />
        <div>
          <h2 id="learn-caution-title">{copy.cautionHeading}</h2>
          <p>{copy.caution}</p>
        </div>
      </aside>

      <section className="learn-steps-section" aria-labelledby="learn-steps-title">
        <div className="learn-section-heading">
          <h2 id="learn-steps-title">{copy.stepsHeading}</h2>
          <p>{copy.stepsIntroduction}</p>
        </div>
        <ol className="learn-steps" role="list">
          {copy.steps.map((step, index) => {
            const Icon = stepIcons[index];
            return (
              <li className="learn-step" key={step.id}>
                <span className="learn-step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3><Icon aria-hidden="true" />{step.title}</h3>
                  <p>{step.text}</p>
                  <p className="learn-step-tip">{step.tip}</p>
                  {step.id === "official" && (
                    <a className="learn-official-link" href="https://biharbhumi.bihar.gov.in/Biharbhumi/default/" target="_blank" rel="noopener noreferrer">
                      {copy.officialLink}<ArrowUpRight aria-hidden="true" />
                      <span className="sr-only"> ({copy.newTab})</span>
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="learn-reference-grid">
        <section className="learn-reference-card" aria-labelledby="learn-glossary-title">
          <div className="learn-section-heading">
            <h2 id="learn-glossary-title">{copy.glossaryHeading}</h2>
            <p>{copy.glossaryIntroduction}</p>
          </div>
          <dl className="learn-glossary">
            {copy.glossary.map(({ term, definition }) => (
              <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>
            ))}
          </dl>
        </section>
        <section className="learn-reference-card" aria-labelledby="learn-faq-title">
          <div className="learn-section-heading">
            <h2 id="learn-faq-title">{copy.faqHeading}</h2>
            <p>{copy.faqIntroduction}</p>
          </div>
          <div className="learn-faqs">
            {copy.faqs.map(({ question, answer }, index) => (
              <details key={index}>
                <summary>{question}<ChevronDown aria-hidden="true" /></summary>
                <p>{index === 4 ? retentionNote : answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>

      <section id="learn-transcript" className="learn-transcript" aria-labelledby="learn-transcript-title" tabIndex={-1}>
        <div className="learn-card-heading">
          <span className="learn-icon"><BookOpen aria-hidden="true" /></span>
          <div>
            <h2 id="learn-transcript-title">{copy.transcriptHeading}</h2>
            <p>{copy.transcriptIntroduction}</p>
          </div>
        </div>
        <ol className="learn-transcript-scenes">
          {LEARNING_TRANSCRIPT.map((scene) => (
            <li key={scene.id}>
              <h3>{scene.title[language]}</h3>
              <p>{scene.narration[language]}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
