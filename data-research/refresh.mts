/** Manual refresh of known official sources. Never runs inside the application. */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('expanded-manifest.json', root), 'utf8'));
const force = process.argv.includes('--force');
const allowed = new Set(['www.cerave.com','www.cetaphil.com','www.vanicream.com','theordinary.com','www.eucerinus.com','www.laroche-posay.us']);
const now = Date.now(); let fetched = 0; let skipped = 0; let failed = 0;
for (const row of manifest) {
  const host = new URL(row.url).hostname;
  if (!allowed.has(host) || !row.rawFile) { skipped++; continue; }
  const age = now - Date.parse(row.lastAttemptAt ?? row.fetchedAt ?? '2000-01-01');
  const cooldown = [403,429].includes(row.lastAttemptStatus ?? row.status) ? 24 * 3600000 : 0;
  if (age < cooldown || !force && age < 7 * 24 * 3600000) { skipped++; continue; }
  row.lastAttemptAt = new Date().toISOString();
  try {
    const headers: Record<string,string> = { Accept: 'text/html', 'User-Agent': 'SkinAI-product-research/0.1' };
    if (row.etag) headers['If-None-Match'] = row.etag;
    if (row.lastModified) headers['If-Modified-Since'] = row.lastModified;
    const response = await fetch(row.url, { headers, signal: AbortSignal.timeout(25000) });
    row.lastAttemptStatus = response.status;
    if (response.status === 304) { row.revalidatedAt = row.lastAttemptAt; fetched++; continue; }
    if (!response.ok) { failed++; continue; }
    if (!allowed.has(new URL(response.url).hostname)) { row.lastAttemptStatus = 'unexpected_redirect_host'; failed++; continue; }
    const html = await response.text();
    const sha = createHash('sha256').update(html).digest('hex');
    if (sha !== row.sha256) {
      const folder = new URL(`snapshots/${row.id}/`, root); await mkdir(folder, { recursive: true });
      try { await copyFile(new URL(row.rawFile, root), new URL(`${row.sha256}.html`, folder)); } catch { /* missing old cache is tracked by the validator */ }
      row.previousSha256 = row.sha256; row.changedAt = row.lastAttemptAt;
      await writeFile(new URL(row.rawFile, root), html);
    }
    Object.assign(row, { sha256: sha, status: response.status, finalUrl: response.url, fetchedAt: row.lastAttemptAt, etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') });
    fetched++;
  } catch (e) { row.lastAttemptStatus = 'network_error'; failed++; }
  await new Promise(resolve => setTimeout(resolve, 300));
}
await writeFile(new URL('expanded-manifest.json', root), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ fetched, skippedFreshOrRestricted: skipped, failed, policy: '403/429 are not bypassed; recent blocked sources have a 24-hour cooldown.' }));
