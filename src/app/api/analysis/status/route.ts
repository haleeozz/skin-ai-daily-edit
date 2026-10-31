import { normalizeAnalysis, type Analysis } from '@/lib/domain';
import { AppError, publicAnalysis, safeError, session, updateSession } from '@/lib/server';
import { providerMessage, youcam } from '@/lib/youcam';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const s = await session();
    if (s.analysis) return Response.json({ status: 'success', analysis: publicAnalysis(s.analysis) }, { headers: { 'Cache-Control': 'no-store' } });
    if (s.taskError) throw new AppError(s.taskError, 422);
    if (s.busy) {
      if (Date.now() - (s.taskStarted ?? 0) > 3 * 60_000) { await updateSession(s.id, value => { if (value.submissionId === s.submissionId && value.busy) { value.busy = false; value.taskError = 'Submission timed out before its task could be confirmed. No automatic retry was made.'; } }); throw new AppError('The submission could not be confirmed. No automatic retry was made.', 504); }
      return Response.json({ status: 'running' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (!s.taskId) throw new AppError('No analysis is running.', 404);
    if (Date.now() - (s.taskStarted ?? 0) > 15 * 60_000) { const error = 'The analysis timed out. Start again when the service is available.'; await updateSession(s.id, value => { if (value.taskId === s.taskId) value.taskError = error; }); throw new AppError(error, 504); }
    const claimed = await updateSession(s.id, value => { if (value.taskId !== s.taskId || value.analysis || Date.now() - (value.pollAt ?? 0) < 9000) return false; value.pollAt = Date.now(); return true; });
    if (!claimed) return Response.json({ status: 'running' }, { headers: { 'Cache-Control': 'no-store' } });
    const payload = await youcam(`/s2s/v2.1/task/skin-analysis/${encodeURIComponent(s.taskId)}`);
    const status = payload.data?.task_status;
    if (status === 'error') { const error = providerMessage(payload); await updateSession(s.id, value => { if (value.taskId === s.taskId) value.taskError = error; }); throw new AppError(error, 422); }
    if (status !== 'success') return Response.json({ status: 'running' }, { headers: { 'Cache-Control': 'no-store' } });
    const findings = normalizeAnalysis(payload);
    if (!findings.length) { const error = 'The service completed, but its result format was not recognized. No substitute scores were created.'; await updateSession(s.id, value => { if (value.taskId === s.taskId) value.taskError = error; }); throw new AppError(error, 422); }
    const analysis: Analysis = { findings, source: 'youcam', createdAt: new Date().toISOString() };
    await updateSession(s.id, value => { if (value.taskId !== s.taskId) throw new AppError('The session changed. Refresh to continue.', 409); value.analysis = analysis; });
    return Response.json({ status: 'success', analysis: publicAnalysis(analysis) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return safeError(e); }
}
