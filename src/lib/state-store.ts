import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
import type { Analysis } from './domain';

export type SessionData = { expires: number; count: number; busy: boolean; submissionId?: string; taskId?: string; taskStarted?: number; pollAt?: number; analysis?: Analysis; taskError?: string };
export type StoredState = { schema: 1; submitted: number; sessions: Record<string, SessionData> };
export type Snapshot = { state: StoredState; version: string | null };
export interface StateBackend { read(): Promise<Snapshot>; write(value: StoredState, version: string | null): Promise<boolean> }
const emptyState = (): StoredState => ({ schema: 1, submitted: 0, sessions: {} });
const pathname = 'skin-ai/state-v1.json';
export function durableConfigured() { return !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN) && (process.env.SESSION_SECRET?.length ?? 0) >= 32; }

function storageKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('Persistent state requires a stable signing secret.');
  return createHash('sha256').update('skin-ai-private-state-v1:').update(secret).digest();
}
function seal(value: StoredState) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', storageKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), body: body.toString('base64') });
}
function unseal(text: string): StoredState {
  const value = JSON.parse(text);
  if (value.v !== 1) throw new Error('Unsupported state format.');
  const decipher = createDecipheriv('aes-256-gcm', storageKey(), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  const state = JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.body, 'base64')), decipher.final()]).toString('utf8'));
  if (state.schema !== 1 || !Number.isSafeInteger(state.submitted) || state.submitted < 0 || typeof state.sessions !== 'object' || !state.sessions) throw new Error('Invalid persistent state.');
  return state;
}
const blobBackend: StateBackend = {
  async read() {
    const result = await get(pathname, { access: 'private', useCache: false, abortSignal: AbortSignal.timeout(10_000) });
    if (!result) return { state: emptyState(), version: null };
    if (result.statusCode !== 200 || result.blob.size > 5_000_000) throw new Error('State unavailable.');
    if (!result.blob.etag) throw new Error('The private state response has no version.');
    return { state: unseal(await new Response(result.stream).text()), version: result.blob.etag };
  },
  async write(value, version) {
    try {
      await put(pathname, seal(value), { access: 'private', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60, ...(version ? { ifMatch: version, allowOverwrite: true } : { allowOverwrite: false }), abortSignal: AbortSignal.timeout(10_000) });
      return true;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError || error instanceof Error && /already exists/.test(error.message)) return false;
      throw error;
    }
  },
};
export function memoryBackend(): StateBackend {
  let value = emptyState(), revision = 0;
  return {
    async read() { return { state: structuredClone(value), version: String(revision) }; },
    async write(next, version) { if (version !== String(revision)) return false; value = structuredClone(next); revision++; return true; },
  };
}
const globals = globalThis as typeof globalThis & { skinBackend?: StateBackend };
function backend() {
  if (durableConfigured()) return blobBackend;
  if (process.env.NODE_ENV === 'production') throw new Error('Hosted state is not configured.');
  return globals.skinBackend ??= memoryBackend();
}
export async function readState() { return (await backend().read()).state; }
// Mutation callbacks must be synchronous and free of external side effects: CAS may retry them.
export async function mutateState<T>(mutate: (state: StoredState) => T, store: StateBackend = backend()): Promise<T> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { state, version } = await store.read();
    const before = JSON.stringify(state);
    for (const [id, s] of Object.entries(state.sessions)) if (s.expires <= Date.now()) delete state.sessions[id];
    const result = mutate(state);
    if (JSON.stringify(state) === before || await store.write(state, version)) return result;
    await new Promise(resolve => setTimeout(resolve, Math.min(100, 5 * 2 ** attempt)));
  }
  throw new Error('State is busy.');
}
