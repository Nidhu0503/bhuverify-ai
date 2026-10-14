import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LearningCenter } from "../src/components/learning-center";
import { LEARNING_CONTENT, LEARNING_TRANSCRIPT } from "../src/lib/learning-content";

describe("beginner learning content", () => {
  it("keeps the visible bilingual transcript identical to the narrated media", () => {
    const transcript = JSON.parse(readFileSync(new URL("../public/tutorial/bhuverify-walkthrough.transcript.json", import.meta.url), "utf8")) as {
      scenes: { id: string; title: { en: string; hi: string }; narration: { en: string; hi: string } }[];
    };
    expect(LEARNING_TRANSCRIPT).toEqual(transcript.scenes.map(({ id, title, narration }) => ({ id, title, narration })));
  });

  it("provides the same six practical steps in both help languages", () => {
    expect(LEARNING_CONTENT.en.steps.map(({ id }) => id)).toEqual(["create", "upload", "review", "compare", "official", "reading"]);
    expect(LEARNING_CONTENT.hi.steps.map(({ id }) => id)).toEqual(LEARNING_CONTENT.en.steps.map(({ id }) => id));
    for (const language of ["en", "hi"] as const) {
      const copy = LEARNING_CONTENT[language];
      expect(copy.steps[1].text).toMatch(/PDF.*PNG.*JPG.*TXT/);
      expect(copy.steps[1].text).toContain("10 MB");
      expect(copy.steps[1].tip).toContain("Google Gemini");
      expect(copy.steps[2].text).toContain("Review fields");
      expect(copy.steps[5].text).toContain("Reading settings");
      expect(copy.glossary.length).toBeGreaterThanOrEqual(5);
      expect(copy.faqs.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("renders an opt-in accessible player, captions and a complete visible transcript", () => {
    const html = renderToStaticMarkup(createElement(LearningCenter, { onStartSample: () => {} }));
    expect(html).toContain("How to use BhuVerify");
    expect(html).toContain('preload="none"');
    expect(html).toContain('controls=""');
    expect(html).toContain('playsInline=""');
    expect(html).toContain('poster="/tutorial/bhuverify-walkthrough-poster.png"');
    expect(html).toContain('src="/tutorial/bhuverify-walkthrough.mp4"');
    expect(html).toContain('srcLang="en"');
    expect(html).toContain('srcLang="hi"');
    expect(html).not.toMatch(/autoplay/i);
    expect(html).toContain("Workspace buttons remain in English");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('lang="hi"');
    expect(html).toContain('id="learn-transcript"');
    for (const scene of LEARNING_TRANSCRIPT) expect(html).toContain(scene.narration.en);
    expect(html).toContain("Not a title certificate");
  });

  it("disables the sample action while the parent is busy", () => {
    const html = renderToStaticMarkup(createElement(LearningCenter, { onStartSample: () => {}, busy: true }));
    expect(html).toContain('class="learn-primary-button" disabled=""');
    expect(html).toContain("Opening sample…");
  });
});
