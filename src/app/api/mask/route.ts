import { AppError, safeError, session } from '@/lib/server';
import sharp from 'sharp';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const s = await session(); const key = new URL(request.url).searchParams.get('concern');
    const url = s.analysis?.findings.find(f => f.key === key)?.maskUrl;
    if (!url) throw new AppError('No visual map is available for this observation.', 404);
    const u = new URL(url);
    if (u.protocol !== 'https:' || !['.amazonaws.com', '.cloudfront.net', '.makeupar.com', '.perfectcorp.com'].some(h => u.hostname.endsWith(h))) throw new AppError('Unsupported image destination.', 502);
    const response = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    // Some provider objects are delivered as application/octet-stream. Validate
    // decoded image bytes instead of rejecting a valid map by its MIME label.
    if (!response.ok || !response.body) throw new AppError('The visual map is unavailable. Your scores are still available.', 502);
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 10 * 1024 * 1024) { await reader.cancel(); throw new AppError('The visual map is too large.', 502); } chunks.push(value); }
    let png: Buffer;
    try { png = await sharp(Buffer.concat(chunks), { limitInputPixels: 25_000_000, animated: false }).png().toBuffer(); }
    catch { throw new AppError('The visual map was not a supported image. Your scores are still available.', 502); }
    return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } });
  } catch (e) { return safeError(e); }
}
