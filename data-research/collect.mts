import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('./', import.meta.url);
await mkdir(new URL('raw/', root), { recursive: true });
const jobs = JSON.parse(await readFile(new URL('source-config.json', root), 'utf8')).seeds;
const results: any[] = [];
let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    try {
      const response = await fetch(job.url, { headers: { 'User-Agent': 'SkinAI-product-research/0.1', Accept: 'text/html' }, signal: AbortSignal.timeout(25000) });
      const html = await response.text();
      const filename = `${job.id}.html`;
      await writeFile(new URL(`raw/${filename}`, root), html);
      const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => { try { return new URL(m[1].replaceAll('&amp;', '&'), response.url).href; } catch { return ''; } });
      const entry = { ...job, finalUrl: response.url, status: response.status, fetchedAt: new Date().toISOString(), sha256: createHash('sha256').update(html).digest('hex'), rawFile: `raw/${filename}`, title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim(), links: [...new Set(links.filter(x => /^https:\/\/(www\.)?(cerave\.com|laroche-posay\.us|cetaphil\.com|vanicream\.com|theordinary\.com)\//i.test(x)))] };
      results.push(entry); console.log(job.id, response.status, html.length, entry.title?.slice(0, 90));
    } catch (error) { results.push({ ...job, error: (error as Error).message }); console.log(job.id, 'FETCH_FAILED'); }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
await writeFile(new URL('fetch-manifest.json', root), JSON.stringify(results, null, 2));
for (const entry of results.filter(r => r.discovery)) { console.log('\nDISCOVERY', entry.brand, entry.status); console.log((entry.links ?? []).filter((x: string) => /\/product\/|\.html|\/products\/|face-moisturizer|face-wash|sunscreen/.test(x)).slice(-65).join('\n')); }
