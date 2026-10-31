import { catalog, catalogueInfo } from './catalog';
import { type Analysis, type Concern, type Profile, type Routine, type Category, type Product, type Evidence } from './domain';

const evidence: Record<string, Evidence> = {
  basic: { id: 'aad-basic', title: 'AAD: A basic skincare routine', url: 'https://www.aad.org/public/everyday-care/skin-care-basics/care/skin-care-budget' },
  dry: { id: 'aad-moisturizer', title: 'AAD: Choosing a moisturizer', url: 'https://www.aad.org/public/everyday-care/skin-care-basics/dry/pick-moisturizer' },
  oily: { id: 'aad-oily', title: 'AAD: Caring for oily skin', url: 'https://www.aad.org/public/everyday-care/skin-care-basics/dry/oily-skin' },
  testing: { id: 'aad-testing', title: 'AAD: Trying a new product', url: 'https://www.aad.org/public/everyday-care/skin-care-secrets/prevent-skin-problems/test-skin-care-products' },
  sun: { id: 'aad-sun', title: 'AAD: Sunscreen FAQs', url: 'https://www.aad.org/media/stats-sunscreen' },
};
const families: Record<string, string> = {
  fragrance: 'fragrance_terms', perfume: 'fragrance_terms', parfum: 'fragrance_terms', koku: 'fragrance_terms', parfüm: 'fragrance_terms',
  niacinamide: 'niacinamide', niasinamid: 'niacinamide',
  'hyaluronic acid': 'hyaluronic_acid_family', 'hyaluronic asit': 'hyaluronic_acid_family', 'hyaluronik asit': 'hyaluronic_acid_family',
  'salicylic acid': 'salicylic_acid', 'salisilik asit': 'salicylic_acid', retinoids: 'retinoids', retinol: 'retinoids',
  'alcohol denat': 'denatured_or_ethanol', ethanol: 'denatured_or_ethanol', 'denatured alcohol': 'denatured_or_ethanol',
  'fatty alcohols': 'fatty_alcohols', ceramides: 'ceramides', ceramide: 'ceramides', glycerin: 'glycerin', glycerol: 'glycerin', gliserin: 'glycerin',
};
const normalize = (s: string) => s.toLocaleLowerCase('en-US').replace(/\s*\([^)]*\)/g, '').replace(/\b\d+(?:\.\d+)?\s*%/g, '').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
type Restriction = { input: string; family?: string; exact?: string };
export function parseRestrictions(text: string): { recognized: Restriction[]; unresolved: string[] } {
  const known = new Set(catalog.flatMap(p => p.ingredients.map(normalize)));
  const recognized: Restriction[] = []; const unresolved: string[] = [];
  const terms = text.split(/[;\n]+/).flatMap(part => known.has(normalize(part)) ? [part] : part.split(','));
  for (const input of [...new Set(terms.map(t => t.trim()).filter(Boolean))]) {
    const term = normalize(input);
    const family = families[term];
    if (family) recognized.push({ input, family });
    else if (known.has(term)) recognized.push({ input, exact: term });
    else unresolved.push(input);
  }
  return { recognized, unresolved };
}
function containsRestriction(product: Product, restriction: Restriction) {
  return restriction.family ? !!product.ingredientFamilies[restriction.family]?.length : product.ingredients.some(i => normalize(i) === restriction.exact);
}

export function recommend(analysis: Analysis, profile: Profile): Routine {
  const ordered = [...analysis.findings].sort((a, b) => a.rawScore - b.rawScore);
  const priorityKeys = [...new Set([...profile.goals, ...ordered.map(f => f.key)])].slice(0, 3) as Concern[];
  const cautious = profile.sensitivity !== 'no' || profile.treatment;
  const oily = profile.skinType === 'oily' || profile.skinType === 'combination';
  const mode = cautious ? 'gentle' : oily ? 'lightweight' : 'balanced';
  const restrictions = parseRestrictions(profile.avoid);
  // No photo-to-skin-type conversion, score cutoffs, disease inference or invented efficacy weights.
  const withheld = profile.treatment || restrictions.unresolved.length > 0 || profile.skinType === 'unknown';
  const steps = (['cleanser', 'moisturizer', 'sunscreen'] as Category[]).map(category => {
    const eligible = withheld ? [] : catalog.filter(p => p.category === category
      && p.skinTypes.includes(profile.skinType)
      && (!cautious || p.sensitive)
      && restrictions.recognized.every(r => !containsRestriction(p, r))
      && (category !== 'sunscreen' || (p.spf ?? 0) >= 30 && p.labelClaims.includes('broad_spectrum') && [40,80].includes(p.waterResistance ?? 0)));
    // Preference tiers, not a clinical suitability score or full-market ranking.
    const tiers = (p: Product) => {
      const oilLabels = Number(p.labelClaims.includes('oil_free')) + Number(p.labelClaims.includes('non_comedogenic'));
      return [category === 'moisturizer' && profile.skinType === 'dry' ? Number(p.texture === 'rich') : 0,
        oily ? oilLabels : 0, category === 'moisturizer' && oily ? Number(p.texture === 'light') : 0];
    };
    const ranked = [...eligible].sort((a,b) => { const x=tiers(a),y=tiers(b); for(let i=0;i<x.length;i++)if(x[i]!==y[i])return y[i]-x[i];return a.id.localeCompare(b.id); });
    const reasons: Record<Category, string> = {
      cleanser: 'A basic cleansing step, without an exfoliating or acne-treatment wash. Named options must carry a manufacturer skin-type label matching your answer.',
      moisturizer: profile.skinType === 'dry' ? 'You report dry skin. We first match the manufacturer’s skin-type label, then prefer a richer texture where the source describes one.' : oily ? 'You report oily or combination skin. We match that label and prefer oil-free or non-comedogenic claims, then lighter moisturizer textures. These claims do not guarantee tolerance.' : 'A basic moisturizing step. The photo does not establish that you need a particular ingredient or active concentration.',
      sunscreen: 'Sun protection is a daytime baseline, independent of your facial scores. Named options require captured broad-spectrum, SPF 30+ and 40- or 80-minute water-resistance labels. Confirm the exact package and follow its reapplication directions.',
    };
    let fallback: string | undefined;
    if (!ranked.length) fallback = profile.treatment ? 'Your medication is unknown, so we cannot check compatibility. Keep your prescribed plan and ask your clinician which basic products to use.'
      : restrictions.unresolved.length ? `We could not reliably resolve: ${restrictions.unresolved.join(', ')}. Named options are withheld rather than guessing an ingredient match.`
      : profile.skinType === 'unknown' ? 'Your skin type is not known. We will not infer it from this photo. Update your answer when you know, or choose a basic product with professional guidance.'
      : 'No product in this limited catalogue passes every label and ingredient filter. We leave the category open rather than relaxing your constraints.';
    return { category, title: { cleanser: 'Cleanse', moisturizer: 'Moisturize', sunscreen: 'Protect' }[category],
      instruction: { cleanser: 'Follow the label and rinse gently. Avoid scrubbing; adjust morning cleansing to comfort.', moisturizer: 'Follow the product label. Introduce changes gradually and stop if irritation occurs.', sunscreen: 'Last morning step. Follow the label for amount and reapplication; SPF values do not add together. Use shade and protective clothing too.' }[category],
      reason: reasons[category] + (cautious ? ' Sensitivity is reported or unknown, so we also require an explicit fragrance-free label with no captured fragrance tokens.' : ''),
      product: ranked[0], alternative: ranked[1], ...(fallback ? { fallback } : {}), eligibleCount: ranked.length,
      evidence: [evidence.basic, ...(category === 'moisturizer' && profile.skinType === 'dry' ? [evidence.dry] : []), ...(oily ? [evidence.oily] : []), ...(cautious ? [evidence.testing] : []), ...(category === 'sunscreen' ? [evidence.sun] : [])],
    };
  });
  return { mode, title: mode === 'gentle' ? 'A gentler place to start.' : mode === 'lightweight' ? 'Light layers. Clear purpose.' : 'Your essentials, considered.',
    description: 'Basic options filtered against your answers and manufacturer labels. Photo observations explain the context; they do not diagnose skin type or select treatments.',
    catalogue: catalogueInfo, restrictions: { recognized: restrictions.recognized.map(r => r.input), unresolved: restrictions.unresolved },
    priorities: priorityKeys.map(key => ({ key, reason: profile.goals.includes(key) ? 'One of your selected goals.' : 'A relatively lower observation within this photo, not a disease threshold or a reason to add a treatment.' })),
    steps,
    notes: [
      ...(profile.treatment ? ['Your prescribed treatment takes priority. Named products are withheld because the medication and its compatibility requirements are unknown.'] : []),
      ...(profile.skinType === 'unknown' ? ['Select a known skin-type answer to see label-matched product options. Photo scores are never used to fill in this answer.'] : []),
      ...(restrictions.recognized.length ? [`Ingredient screening applied to: ${restrictions.recognized.map(r => r.input).join(', ')}. This checks the captured US list only; it does not certify allergy safety or the formula sold in your country.`] : []),
      ...(analysis.findings.length < 6 ? ['Some measurements were unavailable. Missing results have not been filled in or guessed.'] : []),
      `${catalogueInfo.productCount} limited-release product records from ${catalogueInfo.sourceRecords} extracted US manufacturer records. These are technical source checks, not independent clinical validation. No paid placements or shopping links.`,
      'Options are tied to an exact source and capture date. Confirm the current local package and personal tolerance. Equivalent candidates are ordered by a stable ID, not evidence that one brand works better.',
      'A photo cannot diagnose acne, rosacea, allergy or a damaged skin barrier. Persistent or painful symptoms need a clinician.',
      'A basic routine may not address every goal. No treatment is added solely because a blemish, pore or redness score is lower.',
    ],
  };
}
