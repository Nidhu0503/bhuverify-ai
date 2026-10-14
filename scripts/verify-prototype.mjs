import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

// Reproducible LOCAL-ONLY workflow verification. Every Gemini response below is
// a test fixture, never a live provider call. Never use a personal Chrome profile.
const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:3102');
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Only a local prototype server may be tested.');
assert(!base.username && !base.password, 'Do not supply credentials in BASE_URL.');
const artifacts = path.resolve(process.env.PROTOTYPE_ARTIFACTS || '.qa/prototype-browser');
await mkdir(artifacts, { recursive: true });
const profileRoot = await mkdtemp(path.join(tmpdir(), 'bhuverify-prototype-qa-'));
const profiles = { shared: path.join(profileRoot, 'shared'), isolated: path.join(profileRoot, 'isolated'), blocked: path.join(profileRoot, 'blocked'), manual: path.join(profileRoot, 'manual') };
const contexts = new Set();
const errors = [], external = [], aiRequests = [];
const completed = [];
let mobileLayout;
let aiEnabled = true, extractionFailure = false;
const config = () => ({ persistence: 'browser', originalRetention: 'none', aiEnabled, model: 'mock-gemini-test-only', authRequired: false, firebase: null });
const field = (value, quote) => ({ value, quote, page: 1, confidence: 'high' });
const extract = { fields: { buyer: field('Asha Fictional', 'Buyer: Asha Fictional'), khata: field('42', 'Khata: 42'), khesra: field('124/2', 'Khesra: 124/2') }, notes: ['MOCKED TEST RESPONSE: no live AI provider was called.'] };
const browserExecutable = process.env.PLAYWRIGHT_EXECUTABLE_PATH || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
assert(existsSync(browserExecutable), 'Install Playwright Chromium or supply PLAYWRIGHT_EXECUTABLE_PATH.');

async function launch(profile, extra = {}) {
  const context = await chromium.launchPersistentContext(profile, { executablePath: browserExecutable, headless: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true, serviceWorkers: 'block', ...extra });
  contexts.add(context);
  context.setDefaultTimeout(15000);
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (['blob:', 'data:'].includes(url.protocol)) return route.continue();
    if (url.origin !== base.origin) { external.push(url.origin); return route.abort(); }
    if (url.pathname === '/api/config') return route.fulfill({ json: config() });
    if (url.pathname === '/api/ai/extract') {
      aiRequests.push({ type: 'extract', contentType: request.headers()['content-type'], body: request.postData() || '' });
      return route.fulfill(extractionFailure ? { status: 503, json: { error: 'Mock Gemini is temporarily unavailable. Review the document manually.' } } : { json: extract });
    }
    if (url.pathname === '/api/ai/assistant') {
      const payload = request.postDataJSON(); aiRequests.push({ type: 'assistant', payload });
      const document = payload.case.documents.find(document => document.fields.buyer);
      assert(document, 'Question fixture requires reviewed buyer evidence.');
      const source = { id: 1, documentId: document.id, documentName: document.name, field: 'buyer', ...document.fields.buyer };
      return route.fulfill({ json: { answer: 'The supplied deed names Asha Fictional as buyer [1]. This is supplied evidence, not an official title verification.', sources: [source], mode: 'gemini' } });
    }
    if (url.pathname.startsWith('/api/')) { errors.push(`Unexpected server data request: ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
  return context;
}
async function home(page) {
  await page.goto(base.href);
  await expect(page.getByRole('heading', { name: 'Your property workspace', exact: true })).toBeVisible({ timeout: 30000 });
}
async function back(page) {
  await page.getByRole('button', { name: 'All property cases', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your property workspace', exact: true })).toBeVisible();
}
async function create(page, title) {
  await page.getByRole('button', { name: 'New property case', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Start a property case', exact: true });
  await dialog.getByLabel('Case name', { exact: true }).fill(title);
  await dialog.getByLabel('District', { exact: true }).selectOption('Patna');
  await dialog.getByRole('button', { name: 'Create case', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
async function state(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const opened = indexedDB.open('bhuverify-ai-prototype-v1', 1);
    opened.onerror = () => reject(new Error('Test storage read failed.'));
    opened.onsuccess = () => {
      const db = opened.result, transaction = db.transaction('workspace', 'readonly');
      const request = transaction.objectStore('workspace').get('current');
      request.onsuccess = () => resolve(request.result || { cases: [] });
      transaction.oncomplete = () => db.close();
    };
  }));
}
async function caseCount(page, count) { await expect.poll(async () => (await state(page)).cases.length).toBe(count); }
async function saveDownload(page, click, filename) {
  const next = page.waitForEvent('download'); await click(); const download = await next;
  const location = path.join(artifacts, filename); await download.saveAs(location);
  return { path: location, data: JSON.parse(await readFile(location, 'utf8')) };
}
async function upload(page, name, text, mode = 'ai') {
  await page.getByRole('button', { name: 'Add document', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a property document', exact: true });
  await dialog.getByLabel('Document file', { exact: true }).setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  const submit = dialog.getByRole('button', { name: mode === 'ai' ? 'Upload and extract' : 'Add document for manual review', exact: true });
  await expect(submit).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await submit.click();
  await expect(dialog).not.toBeVisible({ timeout: 30000 });
}
async function screenshot(page, name) { await page.screenshot({ path: path.join(artifacts, name), fullPage: true, animations: 'disabled' }); }
function done(message) { completed.push(message); process.stdout.write(`PASS ${message}\n`); }

try {
  const response = await fetch(new URL('/api/config', base));
  assert(response.ok, 'Start the prototype server before running npm run test:browser.');
  assert.equal((await response.json()).persistence, 'browser', 'This script is only for the browser-persistence branch.');
  let context = await launch(profiles.shared), page = await context.newPage();
  await home(page);
  await expect(page.getByText('Saved on this browser · No login.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Explore a sample case', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bihta · plot-number discrepancy', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run document checks', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Evidence & findings', exact: true })).toBeVisible();
  const report = await saveDownload(page, () => page.getByRole('button', { name: 'JSON report', exact: true }).click(), 'fictional-sample-report.json');
  assert.equal(report.data.governmentVerification, 'not_performed');
  await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls++; }; });
  await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__printCalls), 1);
  await back(page); await create(page, 'SEPARATE-CASE-DO-NOT-SEND'); await back(page);
  await create(page, 'Fictional AI review fixture');
  await upload(page, 'fictional-deed.txt', 'FICTIONAL DEMO ONLY\nBuyer: Asha Fictional\nKhata: 42\nKhesra: 124/2');
  await expect(page.locator('.extraction-label')).toContainText('Gemini-extracted');
  assert.equal(aiRequests.filter(item => item.type === 'extract').length, 1);
  const qaConsent = page.getByRole('checkbox', { name: /^I consent to sending this case/ });
  await expect(qaConsent).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'What needs my attention?', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Review fields', exact: true }).click();
  let evidence = page.getByRole('dialog', { name: 'Review the document fields', exact: true });
  await expect(evidence.getByLabel('Buyer', { exact: true })).toHaveValue('Asha Fictional');
  await evidence.getByRole('checkbox').check();
  await evidence.getByRole('button', { name: 'Save reviewed fields', exact: true }).click();
  await expect(evidence).not.toBeVisible();
  await page.getByRole('button', { name: 'Run document checks', exact: true }).first().click();
  await qaConsent.check();
  await page.getByRole('button', { name: 'What needs my attention?', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toContainText('The supplied deed names Asha Fictional');
  const questionRequest = aiRequests.find(item => item.type === 'assistant').payload;
  assert.equal(questionRequest.consent, true);
  assert.equal(questionRequest.case.title, 'Fictional AI review fixture');
  assert(!JSON.stringify(questionRequest).includes('SEPARATE-CASE-DO-NOT-SEND'));
  assert(!JSON.stringify(questionRequest).includes('Bihta · plot-number discrepancy'));
  assert(!('apiKey' in questionRequest));
  await page.getByRole('button', { name: /^Citation 1: Buyer/ }).first().click();
  const citation = page.getByRole('dialog', { name: 'Citation 1', exact: true });
  await expect(citation.locator('blockquote')).toHaveText('Buyer: Asha Fictional');
  await citation.getByRole('button', { name: 'Close citation', exact: true }).click();
  await screenshot(page, 'desktop-current-case.png');
  await back(page);
  await page.locator('.case-card').filter({ hasText: 'SEPARATE-CASE-DO-NOT-SEND' }).click();
  await expect(page.getByRole('checkbox', { name: /^I consent to sending this case/ })).not.toBeChecked();
  await back(page);
  done('Sample checks and report; fictional upload, reviewed fields, genuine AI-path fixture, case-only payload and per-case consent');

  await page.reload(); await expect(page.locator('.case-card')).toHaveCount(3); await caseCount(page, 3);
  await context.close(); contexts.delete(context);
  context = await launch(profiles.shared); page = await context.newPage(); await home(page);
  await expect(page.locator('.case-card')).toHaveCount(3); await caseCount(page, 3);
  const isolated = await launch(profiles.isolated), isolatedPage = await isolated.newPage(); await home(isolatedPage);
  await expect(isolatedPage.locator('.case-card')).toHaveCount(0); await caseCount(isolatedPage, 0);
  await isolated.close(); contexts.delete(isolated);
  done('Cases survive refresh and browser-process restart; another browser profile sees no cases');

  const second = await context.newPage(); await home(second); await create(second, 'Cross-tab fictional case');
  await page.bringToFront(); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.case-card')).toHaveCount(4);
  await page.locator('.case-card').filter({ hasText: 'Fictional AI review fixture' }).click();
  await page.getByRole('tab', { name: /^Documents/ }).click(); await page.getByRole('button', { name: 'Review fields', exact: true }).click();
  evidence = page.getByRole('dialog', { name: 'Review the document fields', exact: true });
  await evidence.getByLabel('Buyer', { exact: true }).fill('Unsaved local edit');
  await back(second); await create(second, 'Another cross-tab case');
  await page.bringToFront(); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(evidence.getByLabel('Buyer', { exact: true })).toHaveValue('Unsaved local edit');
  await evidence.getByRole('button', { name: 'Close', exact: true }).click(); await back(page);
  await expect(page.locator('.case-card')).toHaveCount(5); await second.close();
  done('Cross-tab focus refresh updates the list without replacing unsaved review fields');

  const before = (await state(page)).cases.map(item => item.id);
  const backup = await saveDownload(page, () => page.getByRole('button', { name: 'Export backup', exact: true }).click(), 'fictional-workspace-backup.json');
  assert.equal(backup.data.cases.length, 5); assert(!JSON.stringify(backup.data).includes('storageKey'));
  await page.getByRole('button', { name: 'Clear saved cases', exact: true }).click();
  await page.getByRole('dialog', { name: 'Clear all saved cases?', exact: true }).getByRole('button', { name: 'Delete all saved cases', exact: true }).click();
  await caseCount(page, 0); await expect(page.locator('.case-card')).toHaveCount(0);
  await page.getByLabel('Workspace backup file', { exact: true }).setInputFiles(backup.path);
  await page.getByRole('dialog', { name: 'Import a workspace backup?', exact: true }).getByRole('button', { name: 'Import as new cases', exact: true }).click();
  await caseCount(page, 5); await expect(page.locator('.case-card')).toHaveCount(5);
  assert((await state(page)).cases.every(item => !before.includes(item.id)), 'Imported cases get new IDs.');
  await page.getByLabel('Workspace backup file', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"invalid":true}') });
  const importDialog = page.getByRole('dialog', { name: 'Import a workspace backup?', exact: true });
  await importDialog.getByRole('button', { name: 'Import as new cases', exact: true }).click();
  await expect(importDialog.getByRole('alert')).toBeVisible(); await caseCount(page, 5);
  await importDialog.getByRole('button', { name: 'Cancel import', exact: true }).click();
  await page.locator('.case-card').filter({ hasText: 'SEPARATE-CASE-DO-NOT-SEND' }).click();
  await page.getByRole('button', { name: 'Delete this case', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete case', exact: true }).click();
  await caseCount(page, 4);
  await screenshot(page, 'desktop-saved-workspace.png');
  await page.setViewportSize({ width: 390, height: 844 });
  // Reinitialize the compositor after switching a running desktop context to
  // mobile. Capture viewport and scrolled evidence as well as the full page.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your property workspace', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(artifacts, 'mobile-top-viewport.png'), animations: 'disabled' });
  await screenshot(page, 'mobile-saved-workspace.png');
  mobileLayout = await page.evaluate(() => ({ topbars: document.querySelectorAll('.topbar').length, banners: document.querySelectorAll('.browser-demo-banner').length, headings: [...document.querySelectorAll('h1')].map(item => item.textContent), cards: document.querySelectorAll('.case-card').length, viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight }));
  assert.equal(mobileLayout.topbars, 1); assert.equal(mobileLayout.banners, 1); assert.equal(mobileLayout.headings.length, 1);
  await page.locator('.case-section').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifacts, 'mobile-cases-viewport.png'), animations: 'disabled' });
  const bounds = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert(bounds.scroll <= bounds.width + 1, `Mobile overflow: ${JSON.stringify(bounds)}`);
  done('Full backup export/import with new IDs, malformed-import atomicity, clear confirmation, case deletion and mobile layout');

  aiEnabled = false;
  const manual = await launch(profiles.manual), manualPage = await manual.newPage(); await home(manualPage);
  await create(manualPage, 'Manual consent protection');
  const beforeRequests = aiRequests.length;
  // The rendered disclosure is manual, but the server config flips before upload.
  // This must never silently authorize sending this file to Google.
  aiEnabled = true;
  await upload(manualPage, 'manual-fiction.txt', 'FICTIONAL FILE MUST STAY LOCAL', 'manual');
  assert.equal(aiRequests.length, beforeRequests, 'A runtime configuration flip must not upgrade manual consent to AI consent.');
  await expect(manualPage.getByText('Awaiting manual entry', { exact: false })).toBeVisible();
  await home(manualPage); await manualPage.locator('.case-card').click();
  extractionFailure = true;
  await upload(manualPage, 'failed-fiction.txt', 'FICTIONAL EXTRACTION FAILURE FIXTURE');
  await expect(manualPage.getByRole('alert').first()).toContainText('Mock Gemini is temporarily unavailable');
  assert.equal((await state(manualPage)).cases[0].documents.at(-1).extraction, 'failed');
  await expect(manualPage.getByRole('button', { name: 'Review fields', exact: true })).toHaveCount(2);
  await manualPage.getByRole('button', { name: 'Review fields', exact: true }).last().click();
  const manualEvidence = manualPage.getByRole('dialog', { name: 'Review the document fields', exact: true });
  await manualEvidence.getByRole('combobox', { name: 'Choose a field to add', exact: true }).selectOption('buyer');
  await manualEvidence.getByRole('button', { name: 'Add', exact: true }).click();
  await manualEvidence.getByLabel('Buyer', { exact: true }).fill('Manual Fictional Buyer');
  await manualEvidence.getByRole('textbox', { name: 'Source quote', exact: true }).fill('Fictional source says Manual Fictional Buyer.');
  await manualEvidence.getByRole('checkbox').check();
  await manualEvidence.getByRole('button', { name: 'Save reviewed fields', exact: true }).click();
  await expect(manualEvidence).not.toBeVisible();
  assert.equal((await state(manualPage)).cases[0].documents.at(-1).fields.buyer.value, 'Manual Fictional Buyer');
  extractionFailure = false;
  done('Manual-mode consent cannot escalate after config changes; unavailable AI preserves a manual-review document');

  const blocked = await launch(profiles.blocked), blockedPage = await blocked.newPage();
  await blockedPage.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, value: { open() { throw new DOMException('Synthetic blocked storage', 'SecurityError'); } } }));
  await blockedPage.goto(base.href);
  await expect(blockedPage.getByRole('heading', { name: 'Your workspace could not be opened', exact: true })).toBeVisible();
  await expect(blockedPage.getByRole('button', { name: 'Retry loading workspace', exact: true })).toBeVisible();
  await expect(blockedPage.getByRole('status').filter({ hasText: 'Opening your workspace' })).toHaveCount(0);
  await screenshot(blockedPage, 'storage-blocked-retry.png');
  done('Blocked IndexedDB stops loading, preserves data, and provides a retry action');
  assert.deepEqual(errors, [], 'No browser page errors or unexpected server case requests.');
  assert.deepEqual(external, [], 'No external network requests, including Firebase or Google AI.');
  await writeFile(path.join(artifacts, 'summary.json'), JSON.stringify({ passed: true, completed, mobileLayout, mockedAiRequests: aiRequests.length, liveAiRequests: 0, externalRequests: external, browserErrors: errors }, null, 2));
  process.stdout.write(`Artifacts: ${artifacts}\nNo live Gemini calls were made.\n`);
} catch (error) {
  for (const context of contexts) {
    const pages = context.pages();
    if (pages.length) await screenshot(pages.at(-1), 'failure-last-page.png').catch(() => {});
  }
  throw error;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await rm(profileRoot, { recursive: true, force: true });
}
