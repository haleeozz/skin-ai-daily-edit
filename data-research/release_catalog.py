"""Build a traceable baseline catalogue; this is a technical source review, not clinical validation."""
import json,sys,re
from pathlib import Path
ROOT=Path(__file__).parent
sys.path.insert(0,str(ROOT/'.vendor'))
from bs4 import BeautifulSoup

records=json.loads((ROOT/'output/products.json').read_text(encoding='utf-8'))['records']
released=[];decisions=[]
for r in records:
    issues=list(r['quality_issues'])
    if r['category'] not in ['cleanser','moisturizer','sunscreen']:issues.append('outside_three_essential_categories')
    if r['use_schedule']==['pm']:issues.append('pm_only_not_in_shared_am_pm_catalogue')
    soup=BeautifulSoup((ROOT/r['raw_source_file']).read_text(encoding='utf-8'),'html.parser')
    main=soup.select_one('main')
    own_text=main.get_text(' ',strip=True) if main else ''
    if r['brand']=='Vanicream' and re.search(r'(?i)currently reformulating',own_text):issues.append('manufacturer_is_reformulating_do_not_use_old_formula')
    if not r['intended_skin_types']:issues.append('no_explicit_supported_skin_type_label')
    tags={c['tag'] for c in r['manufacturer_claims']}
    fragrance=r['ingredient_family_presence']['fragrance_terms']
    if 'fragrance_free' in tags and fragrance:issues.append('fragrance_free_claim_conflicts_with_ingredient_tokens')
    if r['category']=='sunscreen' and 'broad_spectrum' not in tags and 'broad spectrum' not in r['name'].lower():issues.append('broad_spectrum_label_not_captured')
    if r['category']=='sunscreen' and not r['water_resistance_evidence']:issues.append('water_resistance_duration_not_captured')
    issues=sorted(set(issues))
    decision={'id':r['id'],'source_sha256':r['source_sha256'],'decision':'withheld' if issues else 'released_for_limited_label_matching','reasons':issues,'review_kind':'technical_source_and_scope_checks','clinical_validation':False}
    decisions.append(decision)
    if issues:continue
    highlights=[]
    if 'fragrance_free' in tags:highlights.append('Labelled fragrance-free')
    if 'oil_free' in tags:highlights.append('Labelled oil-free')
    if 'non_comedogenic' in tags:highlights.append('Labelled non-comedogenic')
    if r['spf']:highlights=['Broad spectrum SPF '+str(r['spf']),str(r['water_resistance_evidence']['minutes'])+' min water resistance']+highlights
    rich=bool(re.search(r'(?i)\brich\b',r['name'])) or ('cream_texture' in tags and 'lightweight' not in tags)
    texture='light' if 'lightweight' in tags or 'gel_texture' in tags else 'rich' if rich else 'balanced'
    released.append({
        'id':r['id'],'brand':r['brand'],'name':r['name'],'category':r['category'],'texture':texture,
        'skinTypes':r['intended_skin_types'],'skinTypeEvidence':r['intended_skin_type_evidence'],
        'highlights':highlights[:3],'sensitive':'fragrance_free' in tags and not fragrance,
        'source':r['source_url'],'checked':r['fetched_at'][:10],'sourceHash':r['source_sha256'],
        'ingredients':[i for section in r['ingredient_sections'] for i in section['ingredients']],
        'ingredientFamilies':r['ingredient_family_presence'],'labelClaims':sorted(tags),
        'market':r['market'],'clinicalValidation':False,
        **({'spf':r['spf'],'waterResistance':r['water_resistance_evidence']['minutes']} if r['spf'] else {}),
    })
manifest={'version':'2026-10-31.2','sourceRecords':len(records),'releasedCount':len(released),'review':'Technical checks against cached official manufacturer labels; no independent efficacy, allergy-safety or clinical review.','decisions':decisions}
(ROOT/'output/release-review.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
target=ROOT.parent/'src/data';target.mkdir(exist_ok=True)
(target/'catalog-release.json').write_text(json.dumps({'version':manifest['version'],'sourceRecords':len(records),'products':released},indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({'released':len(released),'by_brand':{b:sum(x['brand']==b for x in released) for b in sorted({x['brand'] for x in released})},'withheld':len(records)-len(released)},indent=2))
