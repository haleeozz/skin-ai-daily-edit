import { z } from 'zod';

export const concernKeys = ['moisture', 'oiliness', 'redness', 'texture', 'pore', 'acne'] as const;
export type Concern = typeof concernKeys[number];
export const labels: Record<Concern, string> = { moisture: 'Hydration', oiliness: 'Oil balance', redness: 'Visible redness', texture: 'Texture', pore: 'Pore appearance', acne: 'Blemish appearance' };
export const profileSchema = z.object({
  skinType: z.enum(['unknown', 'dry', 'normal', 'combination', 'oily']),
  goals: z.array(z.enum(concernKeys)).min(1).max(2),
  sensitivity: z.enum(['unknown', 'no', 'yes']),
  avoid: z.string().trim().max(200),
  treatment: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;
export const defaultProfile: Profile = { skinType: 'unknown', goals: ['moisture'], sensitivity: 'unknown', avoid: '', treatment: false };
export type Finding = { key: Concern; rawScore: number; uiScore?: number; maskUrl?: string };
export type Analysis = { findings: Finding[]; source: 'example' | 'youcam'; createdAt: string };
export type Category = 'cleanser' | 'moisturizer' | 'sunscreen';
export type Product = { id: string; brand: string; name: string; category: Category; texture: 'light' | 'balanced' | 'rich'; skinTypes: Profile['skinType'][]; highlights: string[]; sensitive: boolean; source: string; checked: string; sourceHash: string; spf?: number; waterResistance?: number; skinTypeEvidence: { wording: string; source_selector: string }; ingredients: string[]; ingredientFamilies: Record<string, string[]>; labelClaims: string[]; market: string; clinicalValidation: false };
export type Evidence = { id: string; title: string; url: string };
export type RoutineStep = { category: Category; title: string; instruction: string; reason: string; product?: Product; alternative?: Product; fallback?: string; evidence: Evidence[]; eligibleCount: number };
export type Routine = { title: string; description: string; priorities: { key: Concern; reason: string }[]; steps: RoutineStep[]; notes: string[]; mode: 'gentle' | 'balanced' | 'lightweight'; catalogue: { version: string; productCount: number; sourceRecords: number }; restrictions: { recognized: string[]; unresolved: string[] } };

export function normalizeAnalysis(payload: unknown): Finding[] {
  const root = payload as Record<string, any>;
  const data = root?.data ?? root;
  const output = data?.results?.output ?? data?.output;
  const scores = data?.results?.score_info ?? data?.score_info ?? data?.results;
  const found: Finding[] = [];
  for (const key of concernKeys) {
    let item: any;
    if (Array.isArray(output)) item = output.find((x) => x?.type === key || x?.type === `hd_${key}`);
    if (!item && scores && typeof scores === 'object') item = scores[key] ?? scores[`hd_${key}`];
    if (item?.whole) item = item.whole;
    if (!item || typeof item.raw_score !== 'number' || !Number.isFinite(item.raw_score) || item.raw_score < 0 || item.raw_score > 100) continue;
    const rawMask = item.mask_urls?.[0];
    found.push({ key, rawScore: item.raw_score,
      ...(typeof item.ui_score === 'number' && Number.isFinite(item.ui_score) ? { uiScore: item.ui_score } : {}),
      ...(typeof rawMask === 'string' && rawMask.startsWith('https://') ? { maskUrl: rawMask } : {}),
    });
  }
  return found;
}

// These numbers are intentionally authored fixtures, not analysis of the portrait.
export const exampleAnalysis: Analysis = {
  source: 'example', createdAt: '2026-10-31T12:00:00.000Z',
  findings: [ { key: 'moisture', rawScore: 44, uiScore: 64 }, { key: 'oiliness', rawScore: 74, uiScore: 81 }, { key: 'redness', rawScore: 59, uiScore: 73 }, { key: 'texture', rawScore: 67, uiScore: 76 }, { key: 'pore', rawScore: 79, uiScore: 86 }, { key: 'acne', rawScore: 86, uiScore: 89 } ],
};
