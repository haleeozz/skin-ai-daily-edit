import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const resumeOnly = process.argv.includes('--resume-only');
if (!resumeOnly && !process.argv.includes('--approved-one-analysis')) throw new Error('Requires explicit owner approval for one analysis.');
const env = await readFile('.env.local', 'utf8');
const key = env.match(/^YOUCAM_API_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '');
if (!key) throw new Error('Missing local credential.');
async function balance() {
  const r = await fetch('https://yce-api-01.makeupar.com/s2s/v1.0/client/credit', { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`Balance check HTTP ${r.status}`);
  const json = await r.json();
  return (json.results ?? []).reduce((sum, item) => sum + Number(item.amount_dec ?? item.amount ?? 0), 0);
}
const before = await balance();
console.log(`Balance before: ${before}`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('qa', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...(resumeOnly ? { storageState: 'qa/live-session.json' } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Find my routine' }).click();
  await page.getByRole('button', { name: 'Continue to photo' }).click();
  await page.setInputFiles('#photo-input', 'public/demo-person-analysis.jpg');
  await page.getByRole('checkbox', { name: /I’m 18 or older/ }).check();
  await page.getByRole('checkbox', { name: /I agree to send this photo/ }).check();
  await expect(page.getByRole('button', { name: 'Understand my skin' })).toBeEnabled();
  await context.storageState({ path: 'qa/live-session.json' });
  // Submit once through the isolated browser context's HTTP client. This avoids
  // response-body eviction by the page inspector and retains the same session.
  const submission = resumeOnly ? null : await context.request.post('http://127.0.0.1:3000/api/analysis', {
    headers: { Origin: 'http://127.0.0.1:3000', 'Content-Type': 'image/jpeg' },
    data: await readFile('public/demo-person-analysis.jpg'),
    timeout: 65000,
  });
  if (submission) { const data = await submission.json(); console.log(`Single submission HTTP ${submission.status()}: ${data.status ?? data.error}`); if (!submission.ok()) throw new Error(data.error); }
  else console.log('Resuming existing task; no analysis POST will be sent to the server.');
  let completed;
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    const response = await context.request.get('http://127.0.0.1:3000/api/analysis/status');
    const result = await response.json();
    console.log(`Status ${attempt + 1}: ${response.status()} / ${result.status ?? result.error}`);
    if (result.status === 'success') { completed = result.analysis; break; }
    if (!response.ok()) throw new Error(result.error);
  }
  if (!completed) throw new Error('No completion within test window; do not resubmit automatically.');
  // Render the retrieved live result through the existing UI, without another POST.
  await page.route('**/api/analysis', route => { if (route.request().method() !== 'POST') return route.continue(); return route.fulfill({ json: { status: 'running' } }); });
  await page.getByRole('button', { name: 'Understand my skin' }).click();
  await expect(page.getByRole('heading', { name: 'Your daily edit.' })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.example-banner')).toHaveCount(0);
  expect(completed.source).toBe('youcam');
  expect(completed.findings.length).toBe(6);
  await page.screenshot({ path: 'qa/live-results.png', fullPage: true });
  await writeFile('qa/live-result.json', JSON.stringify({ source: completed.source, createdAt: completed.createdAt, findings: completed.findings.map(({ maskUrl, ...finding }) => ({ ...finding, hasMask: !!maskUrl })) }, null, 2));
  for (const finding of completed.findings) {
    if (!finding.maskUrl) continue;
    const response = await context.request.get(new URL(finding.maskUrl, 'http://127.0.0.1:3000').href);
    console.log(`Mask ${finding.key}: HTTP ${response.status()}`);
    if (!response.ok()) console.log('Mask error:', (await response.json()).error);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toMatch(/^image\//);
  }
  await page.screenshot({ path: 'qa/live-results.png', fullPage: true });
  await writeFile('qa/live-result.json', JSON.stringify({ source: completed.source, createdAt: completed.createdAt, findings: completed.findings.map(({ maskUrl, ...finding }) => ({ ...finding, hasMask: !!maskUrl })) }, null, 2));
  expect(errors).toEqual([]);
  console.log('PASS single live analysis, real results, six observations, routine and available mask retrieval');
} finally {
  await browser.close();
  try { const after = await balance(); console.log(`Balance after: ${after}; used: ${before - after}`); } catch { console.log('Final balance check unavailable.'); }
}
