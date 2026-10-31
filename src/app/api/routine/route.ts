import { defaultProfile, exampleAnalysis, profileSchema } from '@/lib/domain';
import { recommend } from '@/lib/recommend';
import { AppError, readLimited, safeError, sameOrigin, session } from '@/lib/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    let input; try { input = JSON.parse((await readLimited(request, 4096)).toString('utf8')); } catch (e) { if (e instanceof AppError) throw e; throw new AppError('The form could not be read.'); }
    const profile = profileSchema.safeParse(input.profile ?? defaultProfile);
    if (!profile.success) throw new AppError('Check the form: select one or two goals and complete each answer.');
    const analysis = input.example === true ? exampleAnalysis : (await session()).analysis;
    if (!analysis) throw new AppError('Complete an analysis first, or choose the example.');
    return Response.json({ routine: recommend(analysis, profile.data) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return safeError(e); }
}
