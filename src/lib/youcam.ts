import { AppError } from './server';
import { concernKeys } from './domain';
const base = 'https://yce-api-01.makeupar.com';

export async function youcam(path: string, init?: RequestInit) {
  if (!process.env.YOUCAM_API_KEY) throw new AppError('Live analysis has not been configured.', 503);
  let response: Response;
  try { response = await fetch(base + path, { ...init, headers: { Authorization: `Bearer ${process.env.YOUCAM_API_KEY}`, 'Content-Type': 'application/json', ...init?.headers }, cache: 'no-store', signal: AbortSignal.timeout(30_000) }); }
  catch { throw new AppError('The analysis service could not be reached. No automatic resubmission was made.', 502); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new AppError('The analysis service credentials need attention.', 503);
    if (response.status === 429) throw new AppError('The analysis service is busy. Wait a moment before trying again.', 429);
    if (response.status === 402) throw new AppError('The demo analysis allowance has been reached.', 503);
    throw new AppError('The analysis service could not process this request. Please check your photo and try again.', 502);
  }
  const json = await response.json();
  if (json.status && json.status !== 200) throw new AppError('The analysis service returned an unsuccessful result.', 502);
  return json;
}

export async function createAnalysis(image: Buffer) {
  const metadata = await youcam('/s2s/v2.0/file', { method: 'POST', body: JSON.stringify({ files: [{ content_type: 'image/jpeg', file_name: 'skin-photo.jpg', file_size: image.length }] }) });
  const file = metadata.data?.files?.[0];
  const upload = file?.requests?.[0];
  if (!upload?.url || !file?.file_id) throw new AppError('Could not prepare your photo upload.', 502);
  const url = new URL(upload.url);
  if (url.protocol !== 'https:' || !(url.hostname.endsWith('.amazonaws.com') || url.hostname.endsWith('.makeupar.com') || url.hostname.endsWith('.perfectcorp.com'))) throw new AppError('Unexpected upload destination.', 502);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(upload.headers ?? {})) if (!['authorization', 'cookie', 'host'].includes(k.toLowerCase())) headers[k] = String(v);
  const uploaded = await fetch(url, { method: 'PUT', headers, body: new Uint8Array(image), redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!uploaded.ok) throw new AppError('Your photo could not be uploaded. Please try again.', 502);
  const result = await youcam('/s2s/v2.1/task/skin-analysis', { method: 'POST', body: JSON.stringify({ src_file_id: file.file_id, dst_actions: concernKeys, format: 'json', miniserver_args: { enable_mask_overlay: true } }) });
  const id = result.data?.task_id;
  if (typeof id !== 'string' || !id.length) throw new AppError('The analysis service did not return a task identifier.', 502);
  return id;
}

export function providerMessage(payload: any) {
  const text = [payload?.data?.error, payload?.data?.error_message, payload?.error].filter(Boolean).join(' ');
  if (/lighting|dark/i.test(text)) return 'The lighting is too dark. Try even daylight and take a new photo.';
  if (/face.*small|out.of.bound|face.*detect|no.face/i.test(text)) return 'Keep one face fully visible, looking forward, and fill more of the frame.';
  if (/credit|unit|balance/i.test(text)) return 'The demo analysis allowance has been reached.';
  return 'This photo could not be analyzed. Try a clear, well-lit, front-facing photo.';
}
