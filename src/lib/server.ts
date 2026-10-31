import { cookies } from 'next/headers';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { type Analysis } from './domain';
import { durableConfigured, mutateState, readState, type SessionData } from './state-store';

export class AppError extends Error { constructor(message: string, public status = 400) { super(message); } }
type Session = SessionData & { id: string };
const g = globalThis as typeof globalThis & { skinLocalSecret?: string };
function signingSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production') throw new AppError('The hosted demo is being configured.', 503);
  return g.skinLocalSecret ??= randomBytes(32).toString('hex');
}
function sign(id: string) { return createHmac('sha256', signingSecret()).update(id).digest('hex'); }
export async function session(create = false): Promise<Session> {
  const jar = await cookies();
  const token = jar.get('skin-session')?.value ?? '';
  const [id, sig] = token.split('.');
  if (id && /^[a-f0-9-]{36}$/.test(id) && sig && /^[a-f0-9]{64}$/.test(sig) && timingSafeEqual(Buffer.from(sign(id)), Buffer.from(sig))) {
    const value = (await readState()).sessions[id];
    if (value && value.expires > Date.now()) return { ...value, id };
  }
  if (!create) throw new AppError('Your session expired. Refresh the page to start again.', 401);
  const newId = randomUUID();
  const value: SessionData = { expires: Date.now() + 30 * 60_000, count: 0, busy: false };
  await mutateState(state => { if (Object.keys(state.sessions).length >= 500) throw new AppError('The demo is busy. Please try again later.', 503); state.sessions[newId] = value; });
  jar.set('skin-session', `${newId}.${sign(newId)}`, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 1800 });
  return { ...value, id: newId };
}
export async function updateSession<T>(id: string, update: (value: SessionData) => T) {
  return mutateState(state => { const value = state.sessions[id]; if (!value) throw new AppError('Your session expired. Refresh to start again.', 401); return update(value); });
}
export async function reserveAnalysis(id: string) {
  const submissionId = randomUUID();
  await mutateState(state => {
    const s = state.sessions[id];
    if (!s) throw new AppError('Your session expired. Refresh to start again.', 401);
    if (s.busy || s.taskId && !s.taskError && !s.analysis) throw new AppError('Your analysis is already running. Wait for its result.', 409);
    const cap = Number(process.env.MAX_LIVE_ANALYSES || 20);
    if (!Number.isSafeInteger(cap) || cap < 1 || cap > 100) throw new AppError('The demo allowance is being configured.', 503);
    if (s.count >= 3 || state.submitted >= cap) throw new AppError('The demo analysis allowance has been reached. The example remains available.', 429);
    s.busy = true; s.submissionId = submissionId; s.taskStarted = Date.now(); s.expires = Date.now() + 30 * 60_000;
    s.count++; state.submitted++;
    delete s.taskId; delete s.taskError; delete s.analysis;
  });
  return submissionId;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  let allowed = false;
  try {
    if (origin) {
      const url = new URL(origin);
      allowed = process.env.PUBLIC_APP_ORIGIN ? origin === process.env.PUBLIC_APP_ORIGIN : ['http:', 'https:'].includes(url.protocol) && url.host === request.headers.get('host') && url.origin === origin;
    }
  } catch { /* malformed and opaque origins are rejected */ }
  if (!allowed) throw new AppError('Please use this app directly to send a request.', 403);
}
export function liveEnabled() { return process.env.ENABLE_LIVE_ANALYSIS === 'true' && !!process.env.YOUCAM_API_KEY && (process.env.NODE_ENV !== 'production' || durableConfigured()); }
export function safeError(error: unknown) {
  const known = error instanceof AppError;
  return Response.json({ error: known ? error.message : 'The request could not be completed. Please try again.' }, { status: known ? error.status : 500, headers: { 'Cache-Control': 'no-store' } });
}
export async function readLimited(request: Request, max: number) {
  if (Number(request.headers.get('content-length') || 0) > max) throw new AppError('This file or request is too large.', 413);
  if (!request.body) throw new AppError('No content was received.');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new AppError('This file or request is too large.', 413); } chunks.push(value); }
  return Buffer.concat(chunks);
}
export function publicAnalysis(analysis: Analysis) {
  return { ...analysis, findings: analysis.findings.map(({ maskUrl, ...f }) => ({ ...f, ...(maskUrl ? { maskUrl: `/api/mask?concern=${f.key}` } : {}) })) };
}
