import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url);
let manifest: any[];
try { manifest = JSON.parse(await readFile(new URL('expanded-manifest.json', root), 'utf8')); }
catch { manifest = JSON.parse(await readFile(new URL('fetch-manifest.json', root), 'utf8')); }
const known = new Set(manifest.map((r: any) => r.url));
const results: any[] = [...manifest];
const jobs: any[] = [];
const clean = (url: string) => { const u = new URL(url); u.hash = ''; u.search = ''; return u.href; };
const queue = (brand: string, url: string, discovery = false) => {
  url = clean(url); if (known.has(url)) return; known.add(url);
  jobs.push({ id: `${brand.toLowerCase().replace(/[^a-z]/g, '')}-${createHash('sha256').update(url).digest('hex').slice(0, 10)}`, brand, url, discovery });
};
for (const row of manifest.filter((r: any) => r.discovery)) {
  for (const link of row.links ?? []) {
    if (row.brand === 'Vanicream' && /\/product\/[^/]+$/.test(clean(link))) queue(row.brand, link);
    if (row.brand === 'Cetaphil' && /\/us\/products\/.+\/\d+\.html$/.test(clean(link))) queue(row.brand, link);
    if (row.brand === 'The Ordinary' && /\/en-us\/[^/]+-\d{6}\.html$/.test(clean(link)) && /cleanser|moisturiz|sun-care|uv-filter/i.test(link)) queue(row.brand, link);
  }
}
queue('Cetaphil', 'https://www.cetaphil.com/us/products/product-categories/facial-moisturizers', true);
queue('Cetaphil', 'https://www.cetaphil.com/us/products/product-categories/sunscreens', true);
queue('The Ordinary', 'https://theordinary.com/en-us/category/skincare/cleansers-exfoliators', true);
queue('Eucerin', 'https://www.eucerinus.com/products/face-care', true);
queue('Eucerin', 'https://www.eucerinus.com/products/sun-protection', true);
const shopifyBrands = [ ['Beauty of Joseon', 'https://beautyofjoseon.com'], ['Geek & Gorgeous', 'https://geekandgorgeous.com'] ];
for (const [brand, base] of shopifyBrands) {
  try {
    if (manifest.some((row: any) => row.url === `${base}/products.json` && row.status === 429)) continue;
    const response = await fetch(`${base}/products.json?limit=250`, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) { console.log(brand, 'catalogue unavailable', response.status); results.push({ brand, url: `${base}/products.json`, status: response.status, discovery: true, fetchedAt: new Date().toISOString(), retryPolicy: 'Do not bypass access restrictions. Review or retry on another day.' }); continue; }
    const json = await response.json();
    await mkdir(new URL('raw/', root), { recursive: true });
    await writeFile(new URL(`raw/${brand.replace(/[^a-z]/gi, '').toLowerCase()}-products.json`, root), JSON.stringify(json, null, 2));
    for (const p of json.products ?? []) if (/cleanser|cleansing|moistur|cream|relief sun|aqua.fresh|sunscreen|hydration station|happier barrier/i.test(`${p.title} ${p.product_type}`) && !/set|bundle|kit|duo|miniature|trial|sample|gift|eye|retinal|retinol/i.test(p.title)) queue(brand, `${base}/products/${p.handle}`);
    console.log(brand, 'structured catalogue', json.products?.length ?? 0);
  } catch { console.log(brand, 'structured catalogue fetch failed'); }
}
let cursor = 0;
async function worker() {
  while (cursor < jobs.length && cursor < 110) {
    const job = jobs[cursor++];
    try {
      const response = await fetch(job.url, { headers: { 'User-Agent': 'SkinAI-product-research/0.1', Accept: 'text/html' }, signal: AbortSignal.timeout(25000) });
      const html = await response.text();
      await writeFile(new URL(`raw/${job.id}.html`, root), html);
      const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => { try { return clean(new URL(m[1].replaceAll('&amp;', '&'), response.url).href); } catch { return ''; } });
      const entry = { ...job, finalUrl: response.url, status: response.status, fetchedAt: new Date().toISOString(), sha256: createHash('sha256').update(html).digest('hex'), rawFile: `raw/${job.id}.html`, title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim(), links: [...new Set(links)] };
      results.push(entry);
      if (response.ok && job.discovery) for (const link of entry.links) {
        if (job.brand === 'Cetaphil' && /^https:\/\/www.cetaphil.com\/us\/products\/.+\/\d+\.html$/.test(link)) queue(job.brand, link);
        if (job.brand === 'The Ordinary' && /^https:\/\/theordinary.com\/en-us\/[^/]+-\d{6}\.html$/.test(link) && /cleanser|moisturiz|sun-care|uv-filter/i.test(link)) queue(job.brand, link);
        if (job.brand === 'Eucerin' && /^https:\/\/www.eucerinus.com\/products\/[^/]+\/[^/]+$/.test(link) && !/body|baby|hand|foot|itch|eczema|advanced-repair|original|intensive|roughness/i.test(link)) queue(job.brand, link);
      }
      console.log(job.brand, response.status, entry.title?.slice(0, 75));
    } catch (error) { results.push({ ...job, error: (error as Error).message }); console.log(job.brand, 'FETCH_FAILED'); }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
await writeFile(new URL('expanded-manifest.json', root), JSON.stringify(results, null, 2));
console.log('Sources recorded:', results.length, 'successful product pages:', results.filter(r => !r.discovery && r.status === 200).length);
