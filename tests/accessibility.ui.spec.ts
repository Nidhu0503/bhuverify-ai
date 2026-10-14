import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { LEARNING_TRANSCRIPT } from '../src/lib/learning-content';
import { READING_PREFERENCES_KEY } from '../src/lib/accessibility';

// Playwright supplies a fresh browser context for every test. Only the two axe
// workflows create data: fictional cases in that isolated context's IndexedDB.
// No server-side case API, live AI, or government service is invoked.
test.beforeEach(async ({ page, baseURL }) => {
  const origin = new URL(baseURL || 'http://127.0.0.1:3102');
  expect(['127.0.0.1', 'localhost', '[::1]']).toContain(origin.hostname);
  const response = await page.request.get('/api/config');
  expect(response.ok(), 'Start the existing local BhuVerify server before running browser tests.').toBeTruthy();
  const config = await response.json();
  expect(config.persistence, 'Use the no-login browser-persistence branch only.').toBe('browser');
  expect(config.aiEnabled, 'The browser suite must not send anything to live AI.').toBe(false);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/ai/')) return route.abort();
    return url.origin === origin.origin || ['data:', 'blob:'].includes(url.protocol)
      ? route.continue()
      : route.abort();
  });
});

async function home(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your property workspace', exact: true })).toBeVisible();
}

async function readingSettings(page: Page) {
  await page.getByRole('button', { name: 'Reading settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Reading settings', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function guide(page: Page) {
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How to use BhuVerify', exact: true })).toBeVisible();
}

async function noHorizontalOverflow(page: Page) {
  const bounds = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    overflowing: Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter(element => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 12)
      .map(element => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })),
  }));
  expect(bounds.document, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.viewport + 1);
  expect(bounds.body, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.viewport + 1);
}

async function accessibilityScan(page: Page, testInfo: TestInfo, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('nextjs-portal')
    .analyze();
  await testInfo.attach(`${name}-axe`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  const violations = results.violations.filter(result => result.impact === 'critical' || result.impact === 'serious' || result.id === 'color-contrast');
  expect.soft(violations.map(result => ({
    id: result.id,
    impact: result.impact,
    description: result.description,
    nodes: result.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
  })), `${name}: no serious/critical accessibility or contrast failures`).toEqual([]);
}

test('reading dialog traps focus, closes with Escape, and restores its opener', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await home(page);
  const dialog = await readingSettings(page);
  const close = dialog.getByRole('button', { name: 'Close reading settings', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  const reverseTabTarget = await page.evaluate(() => ({ tag: document.activeElement?.tagName, className: document.activeElement?.className }));
  await expect(dialog.getByRole('button', { name: 'Done', exact: true }), JSON.stringify(reverseTabTarget)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await accessibilityScan(page, testInfo, 'reading-dialog');
  await page.screenshot({ path: testInfo.outputPath('reading-dialog.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Reading settings', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test('reading settings persist across reload, validate their shape, and reset only their own key', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await home(page);
  await page.evaluate(() => localStorage.setItem('bhuverify-test-unrelated', 'synthetic sentinel'));
  const dialog = await readingSettings(page);
  await dialog.getByRole('radio', { name: 'Extra large', exact: true }).check();
  await dialog.getByRole('switch', { name: 'High contrast', exact: true }).click();
  await dialog.getByRole('switch', { name: 'Reduced motion', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'extra-large');
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), READING_PREFERENCES_KEY);
  expect(saved).toEqual({ version: 1, textSize: 'extra-large', highContrast: true, reducedMotion: true });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'extra-large');
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  const reopened = await readingSettings(page);
  await expect(reopened.getByRole('radio', { name: 'Extra large', exact: true })).toBeChecked();
  await expect(reopened.getByRole('switch', { name: 'High contrast', exact: true })).toBeChecked();
  await reopened.getByRole('button', { name: 'Reset settings', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'standard');
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'false');
  expect(await page.evaluate(key => localStorage.getItem(key), READING_PREFERENCES_KEY)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('bhuverify-test-unrelated'))).toBe('synthetic sentinel');
});

test('corrupted stored preferences fall back without hydration errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(key => localStorage.setItem(key, '{malformed'), READING_PREFERENCES_KEY);
  await home(page);
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'standard');
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'false');
  const dialog = await readingSettings(page);
  await expect(dialog.getByRole('radio', { name: 'Standard', exact: true })).toBeChecked();
  await dialog.getByRole('radio', { name: 'Large', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  expect(errors).toEqual([]);
});

test('blocked storage still permits reading changes and clearly reports session-only settings', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('Synthetic blocked storage', 'SecurityError'); },
  }));
  await home(page);
  const dialog = await readingSettings(page);
  await dialog.getByRole('radio', { name: 'Large', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  await expect(dialog.getByRole('status')).toContainText('Settings applied for this visit');
  await dialog.getByRole('button', { name: 'Reset settings', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'standard');
  await expect(dialog.getByRole('status')).toContainText('Settings reset for this visit');
  expect(errors).toEqual([]);
});

test('OS reduced motion takes precedence over saved false and responds to system changes', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({
    version: 1, textSize: 'standard', highContrast: false, reducedMotion: false,
  })), READING_PREFERENCES_KEY);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await home(page);
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  const dialog = await readingSettings(page);
  const toggle = dialog.getByRole('switch', { name: 'Reduced motion', exact: true });
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeDisabled();
  await expect(dialog).toContainText('your device requests less motion');
  await dialog.getByRole('button', { name: 'Reset settings', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'false');
});

test('mobile navigation keeps closed links unfocusable and traps focus until Escape', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await home(page);
  const sidebar = page.locator('#workspace-navigation');
  const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
  await expect(sidebar).toHaveJSProperty('inert', true);
  await opener.focus();
  await sidebar.locator('button').first().evaluate((element: HTMLButtonElement) => element.focus());
  await expect(opener).toBeFocused();
  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press('Tab');
    expect(await sidebar.evaluate(element => element.contains(document.activeElement))).toBe(false);
  }
  await opener.click();
  const menu = page.getByRole('dialog', { name: 'Workspace navigation', exact: true });
  await expect(menu).toBeVisible();
  await expect(page.locator('.main-shell')).toHaveJSProperty('inert', true);
  await expect(menu.getByRole('button', { name: 'Close navigation menu', exact: true })).toBeFocused();
  await page.locator('.reading-settings-trigger').evaluate((element: HTMLButtonElement) => element.focus());
  expect(await menu.evaluate(element => element.contains(document.activeElement))).toBe(true);
  for (let index = 0; index < 14; index += 1) {
    await page.keyboard.press(index % 2 ? 'Tab' : 'Shift+Tab');
    expect(await menu.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('mobile-navigation.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(sidebar).toHaveJSProperty('inert', true);
  await expect(page.locator('.main-shell')).toHaveJSProperty('inert', false);
  await expect(opener).toBeFocused();
});

test('guide has English and Hindi help, caption tracks, no autoplay, and the complete transcript', async ({ page }, testInfo) => {
  await home(page);
  await guide(page);
  const video = page.locator('.learn-video');
  await expect(video).toHaveJSProperty('controls', true);
  await expect(video).toHaveJSProperty('autoplay', false);
  await expect(video).toHaveJSProperty('paused', true);
  await expect(video).toHaveAttribute('preload', 'none');
  await expect(video.locator('track[kind="captions"][srclang="en"]')).toHaveAttribute('src', /\.en\.vtt$/);
  await expect(video.locator('track[kind="captions"][srclang="hi"]')).toHaveAttribute('src', /\.hi\.vtt$/);
  await expect(page.locator('#learn-transcript li')).toHaveCount(LEARNING_TRANSCRIPT.length);
  for (const scene of LEARNING_TRANSCRIPT) await expect(page.locator('#learn-transcript')).toContainText(scene.narration.en);
  await page.getByRole('button', { name: 'हिन्दी', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'BhuVerify कैसे इस्तेमाल करें', exact: true })).toBeVisible();
  await expect(page.locator('.learning-center')).toHaveAttribute('lang', 'hi');
  await expect(page.getByRole('button', { name: 'हिन्दी', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const scene of LEARNING_TRANSCRIPT) await expect(page.locator('#learn-transcript')).toContainText(scene.narration.hi);
  await page.screenshot({ path: testInfo.outputPath('guide-hindi.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('.learning-center')).toHaveAttribute('lang', 'en');
  await page.getByRole('link', { name: 'Read the transcript', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Full video transcript', exact: true })).toBeInViewport();
});

test('guide offers its transcript when the media URL returns HTTP 404', async ({ page }) => {
  await page.route('**/tutorial/bhuverify-walkthrough.mp4', route => route.fulfill({
    status: 404, contentType: 'text/plain', body: 'Synthetic unavailable-media fixture',
  }));
  await home(page);
  await guide(page);
  await page.locator('.learn-video').evaluate((video: HTMLVideoElement) => { video.load(); void video.play().catch(() => {}); });
  await expect(page.locator('.learn-video-error')).toHaveAttribute('role', 'status');
  await expect(page.locator('.learn-video-error')).toContainText('The full text transcript below covers the same walkthrough');
  await expect(page.locator('#learn-transcript li')).toHaveCount(LEARNING_TRANSCRIPT.length);
});

for (const scenario of [
  { name: '320px reflow (1280px equivalent at 400% zoom)', width: 320, fontSize: '100%' },
  { name: '1280px at 200% text size', width: 1280, fontSize: '200%' },
]) {
  test(`home, guide and reading controls avoid horizontal overflow: ${scenario.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 1000 });
    await home(page);
    await page.locator('html').evaluate((element, fontSize) => element.style.setProperty('font-size', fontSize, 'important'), scenario.fontSize);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('home-reflow.png'), fullPage: true, animations: 'disabled' });
    const dialog = await readingSettings(page);
    await noHorizontalOverflow(page);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('reading-reflow.png'), animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await guide(page);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('guide-reflow.png'), fullPage: true, animations: 'disabled' });
  });
}

for (const highContrast of [false, true]) {
  test(`axe checks home, guide and a synthetic sample case: ${highContrast ? 'high contrast' : 'standard contrast'}`, async ({ page }, testInfo) => {
    let createdId: string | null = null;
    try {
      await home(page);
      if (highContrast) {
        const dialog = await readingSettings(page);
        await dialog.getByRole('switch', { name: 'High contrast', exact: true }).click();
        await dialog.getByRole('button', { name: 'Done', exact: true }).click();
      }
      await accessibilityScan(page, testInfo, 'home');
      await page.screenshot({ path: testInfo.outputPath('home-desktop.png'), animations: 'disabled' });
      await guide(page);
      await accessibilityScan(page, testInfo, 'guide');
      await page.screenshot({ path: testInfo.outputPath('guide-desktop.png'), animations: 'disabled' });
      await page.getByRole('button', { name: 'Try a sample case', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Bihta · plot-number discrepancy', exact: true })).toBeVisible();
      createdId = 'browser-only-fixture';
      await expect(page.getByRole('button', { name: 'Run document checks', exact: true }).first()).toBeVisible();
      await accessibilityScan(page, testInfo, 'sample-case');
      await page.screenshot({ path: testInfo.outputPath('synthetic-sample-case.png'), fullPage: true, animations: 'disabled' });
    } finally {
      if (createdId) {
        await page.getByRole('button', { name: 'Delete this case', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Delete case', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Your property workspace', exact: true })).toBeVisible();
      }
    }
  });
}
