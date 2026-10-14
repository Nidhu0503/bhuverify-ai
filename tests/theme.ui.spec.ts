import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { READING_PREFERENCES_KEY } from '../src/lib/accessibility';

const THEME_KEY = 'bhuverify-color-theme';
type Theme = 'system' | 'light' | 'dark';

// Every test has a fresh browser context. The two comprehensive axe workflows
// create only fictional sample cases and delete their own IDs in finally.
// Never exercise live AI, a deployed account, or an external government site.
test.beforeEach(async ({ page, baseURL }) => {
  const origin = new URL(baseURL || 'http://127.0.0.1:3102');
  expect(['127.0.0.1', 'localhost', '[::1]']).toContain(origin.hostname);
  const response = await page.request.get('/api/config');
  expect(response.ok(), 'Start the existing local BhuVerify server before running browser tests.').toBeTruthy();
  const config = await response.json();
  expect(config.persistence, 'Use the no-login browser-persistence branch only.').toBe('browser');
  expect(config.aiEnabled, 'Theme tests must not invoke live AI.').toBe(false);
  await page.context().route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/ai/')) return route.abort();
    return url.origin === origin.origin || ['data:', 'blob:'].includes(url.protocol)
      ? route.continue()
      : route.abort();
  });
});

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /hydrat|did not match|server rendered/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

async function home(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your property workspace', exact: true })).toBeVisible();
}

function colorTheme(page: Page) {
  return page.getByRole('combobox', { name: 'Color theme', exact: true });
}

async function expectTheme(page: Page, preference: Theme, resolved: 'light' | 'dark') {
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', preference);
  await expect(page.locator('html')).toHaveAttribute('data-theme', resolved);
  await expect(colorTheme(page)).toHaveValue(preference);
  await expect(page.locator('html')).toHaveCSS('color-scheme', resolved);
}

async function readingSettings(page: Page) {
  await page.getByRole('button', { name: 'Reading settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Reading settings', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function setHighContrast(page: Page) {
  const dialog = await readingSettings(page);
  await dialog.getByRole('switch', { name: 'High contrast', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
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

async function noColorFilters(locator: Locator) {
  const filters = await locator.evaluateAll(elements => elements.flatMap(element => {
    const filtered: { tag: string; className: string; filter: string }[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      const filter = getComputedStyle(current).filter;
      if (filter !== 'none') filtered.push({ tag: current.tagName, className: current.className, filter });
    }
    return filtered;
  }));
  expect(filters, 'Media and original evidence must not be recolored using CSS filters on themselves or ancestors.').toEqual([]);
}

async function accessibilityScan(page: Page, testInfo: TestInfo, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('nextjs-portal')
    .analyze();
  await testInfo.attach(`${name}-axe`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  // Include every reported WCAG violation, not only serious/critical issues.
  expect.soft(results.violations.map(result => ({
    id: result.id,
    impact: result.impact,
    description: result.description,
    nodes: result.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
  })), `${name}: no WCAG accessibility or contrast violations`).toEqual([]);
}

for (const preference of ['light', 'dark'] as const) {
  test(`${preference} preference overrides the OS and persists without changing reading settings`, async ({ page }) => {
    const errors = captureErrors(page);
    const opposite = preference === 'dark' ? 'light' : 'dark';
    await page.emulateMedia({ colorScheme: opposite });
    await home(page);
    await expectTheme(page, 'system', opposite);
    const dialog = await readingSettings(page);
    await dialog.getByRole('radio', { name: 'Large', exact: true }).check();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    const reading = await page.evaluate(key => localStorage.getItem(key), READING_PREFERENCES_KEY);
    await page.evaluate(() => localStorage.setItem('bhuverify-theme-test-unrelated', 'synthetic sentinel'));
    await colorTheme(page).selectOption(preference);
    await expectTheme(page, preference, preference);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), THEME_KEY)).toEqual({ version: 1, preference });
    expect(await page.evaluate(key => localStorage.getItem(key), READING_PREFERENCES_KEY)).toBe(reading);
    await page.reload();
    await expectTheme(page, preference, preference);
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
    const reopened = await readingSettings(page);
    await reopened.getByRole('button', { name: 'Reset settings', exact: true }).click();
    await reopened.getByRole('button', { name: 'Done', exact: true }).click();
    await expectTheme(page, preference, preference);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), THEME_KEY)).toEqual({ version: 1, preference });
    expect(await page.evaluate(key => localStorage.getItem(key), READING_PREFERENCES_KEY)).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('bhuverify-theme-test-unrelated'))).toBe('synthetic sentinel');
    expect(errors).toEqual([]);
  });
}

test('fresh system mode follows OS changes while explicit light and dark stay fixed', async ({ page }) => {
  const errors = captureErrors(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await home(page);
  await expectTheme(page, 'system', 'dark');
  await expect(colorTheme(page).locator('option')).toHaveCount(3);
  await page.emulateMedia({ colorScheme: 'light' });
  await expectTheme(page, 'system', 'light');
  await colorTheme(page).selectOption('dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expectTheme(page, 'dark', 'dark');
  await colorTheme(page).selectOption('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectTheme(page, 'light', 'light');
  await colorTheme(page).selectOption('system');
  await expectTheme(page, 'system', 'dark');
  await page.reload();
  await expectTheme(page, 'system', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expectTheme(page, 'system', 'light');
  expect(errors).toEqual([]);
});

test('theme changes synchronize across tabs while system resolves each tab’s OS preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await home(page);
  const second = await page.context().newPage();
  try {
    await second.emulateMedia({ colorScheme: 'dark' });
    await home(second);
    await expectTheme(page, 'system', 'light');
    await expectTheme(second, 'system', 'dark');
    await colorTheme(page).selectOption('dark');
    await expectTheme(second, 'dark', 'dark');
    await colorTheme(second).selectOption('light');
    await expectTheme(page, 'light', 'light');
    await second.evaluate(key => localStorage.removeItem(key), THEME_KEY);
    await expectTheme(page, 'system', 'light');
    await colorTheme(second).selectOption('system');
    await expectTheme(page, 'system', 'light');
    await expectTheme(second, 'system', 'dark');
  } finally {
    await second.close();
  }
});

for (const stored of [null, JSON.stringify({ version: 1, preference: 'dark' })]) {
  test(`theme initializes before client hydration: ${stored ? 'saved dark over light OS' : 'fresh dark OS'}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: stored ? 'light' : 'dark' });
    if (stored) await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: THEME_KEY, value: stored });
    // The fixed inline head bootstrap must work even before React is available.
    await page.route('**/_next/static/chunks/**', route => route.abort());
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme-preference', stored ? 'dark' : 'system');
  });
}

for (const stored of ['{malformed', JSON.stringify({ version: 2, preference: 'dark' }), JSON.stringify({ version: 1, preference: 'sepia' })]) {
  test(`invalid theme storage safely falls back to system: ${stored}`, async ({ page }) => {
    const errors = captureErrors(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: THEME_KEY, value: stored });
    await home(page);
    await expectTheme(page, 'system', 'dark');
    await colorTheme(page).selectOption('light');
    await expectTheme(page, 'light', 'light');
    expect(errors).toEqual([]);
  });
}

test('blocked storage permits session theme changes without hydration errors', async ({ page }) => {
  const errors = captureErrors(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('Synthetic blocked storage', 'SecurityError'); },
  }));
  await home(page);
  await expectTheme(page, 'system', 'light');
  await colorTheme(page).selectOption('dark');
  await expectTheme(page, 'dark', 'dark');
  await expect(page.getByRole('status').filter({ hasText: 'Theme applied for this visit' })).toBeVisible();
  await colorTheme(page).selectOption('light');
  await expectTheme(page, 'light', 'light');
  await page.reload();
  await expectTheme(page, 'system', 'light');
  expect(errors).toEqual([]);
});

test('the native color theme select is keyboard operable', async ({ page }) => {
  await home(page);
  const select = colorTheme(page);
  await expect(select).toHaveJSProperty('tagName', 'SELECT');
  await select.focus();
  await expect(select).toBeFocused();
  // Native select type-ahead and Tab work without opening a platform-owned
  // popup that headless browser automation cannot consistently drive.
  await page.keyboard.press('d');
  await page.keyboard.press('Tab');
  await expectTheme(page, 'dark', 'dark');
  await expect(select).not.toBeFocused();
});

for (const scenario of [
  { name: '320px reflow', width: 320, fontSize: '100%' },
  { name: '200% text size', width: 1280, fontSize: '200%' },
]) {
  test(`dark high contrast keeps home, reading dialog and Hindi guide within viewport: ${scenario.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 1000 });
    await home(page);
    await colorTheme(page).selectOption('dark');
    await expectTheme(page, 'dark', 'dark');
    await setHighContrast(page);
    await page.locator('html').evaluate((element, fontSize) => element.style.setProperty('font-size', fontSize, 'important'), scenario.fontSize);
    await expect(colorTheme(page)).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('dark-home-reflow.png'), fullPage: true, animations: 'disabled' });
    const dialog = await readingSettings(page);
    await noHorizontalOverflow(page);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('dark-reading-reflow.png'), animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await guide(page);
    await page.getByRole('button', { name: 'हिन्दी', exact: true }).click();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('dark-hindi-reflow.png'), fullPage: true, animations: 'disabled' });
  });
}

for (const highContrast of [false, true]) {
  test(`all WCAG axe checks across dark workspace, guide, dialogs and synthetic case: ${highContrast ? 'high contrast' : 'standard contrast'}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    let createdId: string | null = null;
    try {
      await home(page);
      await colorTheme(page).selectOption('dark');
      await expectTheme(page, 'dark', 'dark');
      if (highContrast) await setHighContrast(page);
      await accessibilityScan(page, testInfo, 'dark-home');
      await page.screenshot({ path: testInfo.outputPath('dark-home-desktop.png'), animations: 'disabled' });
      const reading = await readingSettings(page);
      await accessibilityScan(page, testInfo, 'dark-reading-dialog');
      await reading.getByRole('button', { name: 'Done', exact: true }).click();
      await page.getByRole('button', { name: 'New property case', exact: true }).click();
      const create = page.getByRole('dialog', { name: 'Start a property case', exact: true });
      await expect(create).toBeVisible();
      await accessibilityScan(page, testInfo, 'dark-new-case-form');
      await create.getByRole('button', { name: 'Cancel', exact: true }).click();
      const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
      await navigation.getByRole('button', { name: 'Bihar services', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Your Bihar service directory', exact: true })).toBeVisible();
      await accessibilityScan(page, testInfo, 'dark-services');
      await navigation.getByRole('button', { name: 'About this demo', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'About this demo', exact: true })).toBeVisible();
      await accessibilityScan(page, testInfo, 'dark-connections');
      await guide(page);
      await accessibilityScan(page, testInfo, 'dark-guide-english');
      await page.screenshot({ path: testInfo.outputPath('dark-guide-desktop.png'), animations: 'disabled' });
      const video = page.locator('.learn-video');
      const poster = await video.getAttribute('poster');
      const source = await video.locator('source').getAttribute('src');
      await expect(video).toHaveJSProperty('controls', true);
      await expect(video).toHaveJSProperty('autoplay', false);
      await expect(video).toHaveJSProperty('paused', true);
      await noColorFilters(video);
      await colorTheme(page).selectOption('light');
      await expect(page.locator('html')).toHaveAttribute('data-high-contrast', String(highContrast));
      await expect(video).toHaveAttribute('poster', poster!);
      await expect(video.locator('source')).toHaveAttribute('src', source!);
      await noColorFilters(video);
      await colorTheme(page).selectOption('dark');
      await expectTheme(page, 'dark', 'dark');
      await expect(page.locator('html')).toHaveAttribute('data-high-contrast', String(highContrast));
      await page.getByRole('button', { name: 'हिन्दी', exact: true }).click();
      await expect(page.locator('.learning-center')).toHaveAttribute('lang', 'hi');
      await accessibilityScan(page, testInfo, 'dark-guide-hindi');
      await page.screenshot({ path: testInfo.outputPath('dark-guide-hindi-viewport.png'), animations: 'disabled' });
      await page.screenshot({ path: testInfo.outputPath('dark-guide-hindi.png'), fullPage: true, animations: 'disabled' });
      await page.getByRole('button', { name: 'English', exact: true }).click();
      await page.getByRole('button', { name: 'Try a sample case', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Bihta · plot-number discrepancy', exact: true })).toBeVisible();
      createdId = 'browser-only-fixture';
      await expect(page.getByRole('button', { name: 'Run document checks', exact: true }).first()).toBeVisible();
      await accessibilityScan(page, testInfo, 'dark-sample-before-checks');
      await page.getByRole('button', { name: 'Run document checks', exact: true }).first().click();
      await expect(page.getByRole('heading', { name: 'Evidence & findings', exact: true })).toBeVisible();
      await accessibilityScan(page, testInfo, 'dark-sample-review');
      await page.screenshot({ path: testInfo.outputPath('dark-synthetic-review.png'), fullPage: true, animations: 'disabled' });
      await page.getByRole('tab', { name: /^Documents/ }).click();
      await accessibilityScan(page, testInfo, 'dark-sample-documents');
      await page.getByRole('button', { name: 'Review fields', exact: true }).first().click();
      const evidence = page.getByRole('dialog', { name: 'Review the document fields', exact: true });
      await expect(evidence).toBeVisible();
      await expect(evidence.getByLabel('Buyer', { exact: true })).toHaveValue('Asha Demo');
      await expect(evidence.getByRole('textbox', { name: 'Source quote', exact: true }).first()).toHaveValue(/SYNTHETIC DEMO/);
      await noColorFilters(evidence.locator('.source-edit'));
      await accessibilityScan(page, testInfo, 'dark-evidence-fields-and-quotes');
      await page.screenshot({ path: testInfo.outputPath('dark-evidence-dialog.png'), animations: 'disabled' });
      await evidence.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('tab', { name: 'Record timeline', exact: true }).click();
      await accessibilityScan(page, testInfo, 'dark-sample-timeline');
      await page.getByRole('tab', { name: 'Next steps', exact: true }).click();
      await accessibilityScan(page, testInfo, 'dark-sample-next-steps');
    } finally {
      if (createdId) {
        await page.getByRole('button', { name: 'Delete this case', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Delete case', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Your property workspace', exact: true })).toBeVisible();
      }
    }
  });
}
