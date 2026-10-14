import assert from 'node:assert/strict';

// Real HTTP checks against a LOCAL server with AI disabled; never calls Google.
const origin = new URL(process.env.BASE_URL || 'http://127.0.0.1:3102').origin;
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname));
const response = await fetch(origin + '/api/config');
assert.equal(response.status, 200);
assert.equal(response.headers.get('set-cookie'), null);
assert.match(response.headers.get('cache-control'), /no-store/);
const config = await response.json();
assert.equal(config.persistence, 'browser');
assert.equal(config.authRequired, false);
assert.equal(config.firebase, null);
assert.equal(config.originalRetention, 'none');
assert.equal(config.aiEnabled, false, 'Stop: this smoke test requires BHUVERIFY_AI_ENABLED=false.');
assert(!Object.keys(config).some(key => /key|secret|token/i.test(key)));

let count = 1;
async function check(route, options, expected) {
  const result = await fetch(origin + route, options);
  assert.equal(result.status, expected, `${route} expected ${expected}, got ${result.status}`);
  assert.equal(result.headers.get('set-cookie'), null);
  count++;
  return result;
}
await check('/', {}, 200);
await check('/api/cases', {}, 404); // No server-side case collection.
await check('/api/ai/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, 403);
await check('/api/ai/assistant', { method: 'POST', headers: { Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json' }, body: '{}' }, 403);
await check('/api/ai/assistant', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: '{}' }, 415);
await check('/api/ai/assistant', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"consent":false}' }, 400);
await check('/api/ai/assistant', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'x'.repeat(1024 * 1024) }) }, 413);
const form = new FormData();
form.set('file', new Blob(['FICTIONAL TEST ONLY'], { type: 'text/plain' }), 'fictional.txt');
form.set('kind', 'sale_deed'); form.set('consent', 'true');
const disabled = await check('/api/ai/extract', { method: 'POST', headers: { Origin: origin }, body: form }, 503);
assert.match((await disabled.json()).error, /not enabled/);
console.log(`PASS ${count} production HTTP checks; no Firebase, cookies, or live Gemini calls.`);
