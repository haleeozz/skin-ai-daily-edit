import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile, exampleAnalysis, normalizeAnalysis, profileSchema } from '../src/lib/domain';
import { recommend } from '../src/lib/recommend';
import { catalog } from '../src/lib/catalog';

test('prescription and unknown skin type withhold named options', () => {
  for (const profile of [{ ...defaultProfile, skinType: 'dry' as const, treatment: true }, defaultProfile]) {
    const routine = recommend(exampleAnalysis, profile);
    assert.ok(routine.steps.every(s => !s.product && !s.alternative && s.fallback));
  }
});

test('known restrictions screen full lists while unknown terms fail closed', () => {
  const profile = { ...defaultProfile, skinType: 'dry' as const, sensitivity: 'no' as const };
  const routine = recommend(exampleAnalysis, { ...profile, avoid: 'niacinamide; fragrance' });
  assert.ok(routine.steps.some(s => s.product));
  assert.deepEqual(routine.restrictions.unresolved, []);
  for (const s of routine.steps) for (const p of [s.product,s.alternative].filter(Boolean)) {
    assert.equal(p!.ingredientFamilies.niacinamide.length,0);
    assert.equal(p!.ingredientFamilies.fragrance_terms.length,0);
  }
  const unknown = recommend(exampleAnalysis, { ...profile, avoid: 'my unknown ingredient' });
  assert.ok(unknown.steps.every(s => !s.product && s.fallback));
});

test('answers change label-matched options; changing scores does not invent product efficacy', () => {
  const dry = recommend(exampleAnalysis, { ...defaultProfile, skinType: 'dry', sensitivity: 'no' });
  const oily = recommend(exampleAnalysis, { ...defaultProfile, skinType: 'oily', sensitivity: 'no' });
  assert.notEqual(dry.steps[1].product?.id, oily.steps[1].product?.id);
  const differentPhoto = recommend({ ...exampleAnalysis, findings: exampleAnalysis.findings.map(f => ({...f,rawScore:100-f.rawScore})) }, { ...defaultProfile, skinType:'dry', sensitivity:'no' });
  assert.deepEqual(dry.steps.map(s => s.product?.id),differentPhoto.steps.map(s => s.product?.id));
});

test('scenario matrix never relaxes labels, sensitivity, prescription or ingredient constraints', () => {
  let scenarios=0;
  for (const skinType of ['unknown','dry','normal','combination','oily'] as const)
  for (const sensitivity of ['unknown','no','yes'] as const)
  for (const treatment of [false,true])
  for (const avoid of ['', 'niacinamide', 'fragrance', 'sodium hyaluronate', 'mystery-allergen', 'alcohol', 'cetyl alcohol', '1,2-Hexanediol']) {
    const routine = recommend(exampleAnalysis,{...defaultProfile,skinType,sensitivity,treatment,avoid});scenarios++;
    for (const step of routine.steps) for (const p of [step.product,step.alternative].filter(Boolean)) {
      assert.ok(!treatment && skinType!=='unknown' && !routine.restrictions.unresolved.length);
      assert.ok(p!.skinTypes.includes(skinType));
      if(sensitivity!=='no') {assert.ok(p!.sensitive);assert.equal(p!.ingredientFamilies.fragrance_terms.length,0);assert.ok(p!.labelClaims.includes('fragrance_free'));}
      if(avoid==='niacinamide') assert.equal(p!.ingredientFamilies.niacinamide.length,0);
      if(avoid==='fragrance') assert.equal(p!.ingredientFamilies.fragrance_terms.length,0);
      if(avoid==='sodium hyaluronate') assert.ok(!p!.ingredients.some(i=>i.toLowerCase()==='sodium hyaluronate'));
      if(avoid==='cetyl alcohol') assert.ok(!p!.ingredients.some(i=>i.toLowerCase()==='cetyl alcohol'));
      if(step.category==='sunscreen') {assert.ok(p!.spf!>=30);assert.ok(p!.labelClaims.includes('broad_spectrum'));assert.ok([40,80].includes(p!.waterResistance!));}
      assert.equal(p!.clinicalValidation,false);
    }
  }
  assert.equal(scenarios,240);
});

test('selected goals lead priorities and recommendations are deterministic', () => {
  const profile = { ...defaultProfile, goals: ['pore', 'texture'] as ('pore' | 'texture')[] };
  const one = recommend(exampleAnalysis, profile); const two = recommend(exampleAnalysis, profile);
  assert.deepEqual(one, two); assert.equal(one.priorities[0].key, 'pore');
  assert.deepEqual(one.steps.map(s => s.category), ['cleanser', 'moisturizer', 'sunscreen']);
});
test('normalizer uses raw score direction and never substitutes UI score', () => {
  const result = normalizeAnalysis({ data: { results: { output: [{ type: 'moisture', raw_score: 18, ui_score: 70 }, { type: 'pore', ui_score: 95 }, { type: 'acne', raw_score: NaN }, { type: 'redness', raw_score: 101 }] } } });
  assert.deepEqual(result, [{ key: 'moisture', rawScore: 18, uiScore: 70 }]);
});
test('normalizer handles structured whole-region output', () => {
  assert.deepEqual(normalizeAnalysis({ data: { results: { hd_pore: { whole: { raw_score: 62, ui_score: 75 } } } } }), [{ key: 'pore', rawScore: 62, uiScore: 75 }]);
});
test('missing measurements stay missing and are disclosed', () => {
  const findings = normalizeAnalysis({ data: { results: { output: [{ type: 'texture', raw_score: 82 }] } } });
  assert.equal(findings.length, 1);
  const routine = recommend({ ...exampleAnalysis, findings }, defaultProfile);
  assert.ok(routine.notes.some(n => n.includes('unavailable')));
});
test('only bounded valid profiles are accepted', () => {
  assert.ok(profileSchema.safeParse(defaultProfile).success);
  assert.equal(profileSchema.safeParse({ ...defaultProfile, goals: [] }).success, false);
  assert.equal(profileSchema.safeParse({ ...defaultProfile, goals: ['acne', 'pore', 'redness'] }).success, false);
  assert.equal(profileSchema.safeParse({ ...defaultProfile, avoid: 'x'.repeat(201) }).success, false);
});
test('release catalogue has exact provenance and excludes known stale or PM-only records', () => {
  assert.equal(catalog.length,30);assert.equal(new Set(catalog.map(p=>p.id)).size,catalog.length);
  assert.equal(new Set(catalog.map(p=>p.brand)).size,5);
  for(const id of ['cv-pm','cetaphil-fd62f8fd5b','vanicream-30ece3f2e4','cetaphil-aed9d31734'])assert.ok(!catalog.some(p=>p.id===id));
  for(const p of catalog) {assert.match(p.source,/^https:\/\//);assert.match(p.sourceHash,/^[a-f0-9]{64}$/);assert.ok(p.ingredients.length && p.skinTypeEvidence.wording && p.checked);}
});
