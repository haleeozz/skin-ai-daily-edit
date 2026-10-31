import { timingSafeEqual } from 'node:crypto';
import { mutateState } from '@/lib/state-store';
import { safeError } from '@/lib/server';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '';
  const actual = request.headers.get('authorization') || '';
  if (!expected || actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return new Response('Unauthorized', { status: 401 });
  try { await mutateState(() => undefined); return Response.json({ cleaned: true }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return safeError(e); }
}
