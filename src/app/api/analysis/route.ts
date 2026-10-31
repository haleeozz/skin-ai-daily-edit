import sharp from 'sharp';
import { AppError, liveEnabled, readLimited, safeError, sameOrigin, session, reserveAnalysis, updateSession } from '@/lib/server';
import { createAnalysis } from '@/lib/youcam';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  let s: Awaited<ReturnType<typeof session>> | undefined;
  let submissionId: string | undefined;
  try {
    sameOrigin(request); s = await session();
    if (!liveEnabled()) throw new AppError('Live analysis is not enabled yet. You can explore the clearly labelled example.', 503);
    const type = request.headers.get('content-type')?.split(';')[0];
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type || '')) throw new AppError('Use a JPEG, PNG or WebP image.');
    const bytes = await readLimited(request, 5 * 1024 * 1024);
    let normalized: Buffer;
    try {
      const input = sharp(bytes, { limitInputPixels: 25_000_000, animated: false });
      const meta = await input.metadata();
      if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 480 || (meta.pages ?? 1) > 1) throw new Error('dimensions');
      normalized = await input.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
      const resized = await sharp(normalized).metadata();
      if (Math.min(resized.width!, resized.height!) < 480) throw new Error('aspect ratio');
    } catch { throw new AppError('Use a single photo with both sides at least 480 pixels and a clear, front-facing face.'); }
    submissionId = await reserveAnalysis(s.id);
    const taskId = await createAnalysis(normalized);
    await updateSession(s.id, value => { if (value.submissionId !== submissionId) throw new AppError('The submission changed. Refresh to check its state.', 409); value.taskId = taskId; value.pollAt = 0; value.busy = false; });
    return Response.json({ status: 'running' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (s && submissionId) {
      try { await updateSession(s.id, value => { if (value.submissionId === submissionId) { value.busy = false; value.taskError = 'The submission could not be confirmed. No automatic retry was made.'; } }); } catch { /* keep the reserved allowance if provider submission is uncertain */ }
    }
    return safeError(e);
  }
}
