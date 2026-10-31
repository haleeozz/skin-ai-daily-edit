import { AppError, liveEnabled, safeError, sameOrigin, session, updateSession } from '@/lib/server';
export const runtime = 'nodejs';
export async function GET() {
  try { const enabled=liveEnabled(); if(enabled)await session(true); return Response.json({ liveEnabled: enabled }, { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return safeError(e); }
}
export async function DELETE(request: Request) {
  try { sameOrigin(request); const s = await session(); await updateSession(s.id, value => { if (value.busy || value.taskId && !value.analysis && !value.taskError) throw new AppError('Wait for your current analysis to finish before clearing.', 409); delete value.analysis; delete value.taskId; delete value.taskError; delete value.submissionId; delete value.pollAt; delete value.taskStarted; }); return Response.json({ cleared: true }, { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return safeError(e); }
}
