"""Offline, brand-specific extraction. Never calls the app or YouCam."""
from pathlib import Path
import csv, hashlib, html, json, re, sys
sys.path.insert(0, str(Path(__file__).parent / '.vendor'))
from bs4 import BeautifulSoup

ROOT = Path(__file__).parent
OUT = ROOT / 'output'
OUT.mkdir(exist_ok=True)
try:
    previous_records = json.loads((OUT/'products.json').read_text(encoding='utf-8'))['records']
except (FileNotFoundError, ValueError, KeyError):
    previous_records = []
manifest = json.loads((ROOT / 'expanded-manifest.json').read_text(encoding='utf-8'))
VERSION = '0.1.0'

def text(node):
    return re.sub(r'\s+', ' ', node.get_text(' ', strip=True)).strip() if node else ''

def first(soup, selectors):
    for selector in selectors:
        node = soup.select_one(selector)
        if node:
            return node, selector
    return None, None

def ld_products(soup):
    def walk(value):
        if isinstance(value, dict):
            types = value.get('@type', [])
            if types == 'Product' or isinstance(types, list) and 'Product' in types:
                yield value
            for item in value.values():
                yield from walk(item)
        elif isinstance(value, list):
            for item in value:
                yield from walk(item)
    products = []
    for tag in soup.select('script[type="application/ld+json"]'):
        try:
            products += list(walk(json.loads(tag.get_text(), strict=False)))
        except (ValueError, TypeError):
            pass
    return products

def split_ingredients(raw):
    raw = re.sub(r'(?i)^(all |active |inactive )?ingredients\s*:?\s*', '', raw).strip()
    # Do not turn the INCI name 1,2-Hexanediol into two ingredients.
    protected = re.sub(r'(?<=\d),(?=\d[-,])', '§', raw)
    items, buf, depth = [], [], 0
    for c in protected:
        if c == '(':
            depth += 1
        if c == ')':
            depth = max(0, depth - 1)
        if c in ',;' and depth == 0:
            item = ''.join(buf).strip(' .\t\n')
            if item:
                items.append(item.replace('§', ','))
            buf = []
        else:
            buf.append(c)
    last = ''.join(buf).strip(' .\t\n')
    if last:
        items.append(last.replace('§', ','))
    return items

def section(kind, raw, selector):
    return {'kind': kind, 'raw_text': raw, 'ingredients': split_ingredients(raw), 'source_selector': selector}

def labelled_lists(block, selector, assume_all=False):
    copy = BeautifulSoup(str(block), 'html.parser')
    for link in copy.find_all('a'):
        if re.search(r'ingredient information', text(link), re.I):
            link.decompose()
    raw = text(copy)
    raw = re.split(r'(?i)please be aware|for refilled products|please refer', raw)[0].strip()
    # Purpose columns on US drug-facts labels are not extra ingredients.
    raw = re.sub(r'\.{2,}\s*Sunscreen\b', ', ', raw, flags=re.I)
    markers = []
    for m in re.finditer(r'(?i)\b(?:(ALL|ACTIVE|INACTIVE)\s+)?INGREDIENTS\s*:?\s*', raw):
        if re.search(r'(?i)featured\s*$', raw[max(0,m.start()-15):m.start()]):
            continue
        markers.append(m)
    result = []
    for i, m in enumerate(markers):
        value = raw[m.end():markers[i+1].start() if i+1<len(markers) else len(raw)].strip()
        if not value or value.count(',') < 1 and not re.search(r'\d\s*%', value):
            continue
        kind = (m.group(1) or ('INACTIVE' if any((x.group(1) or '').upper()=='ACTIVE' for x in markers) else 'ALL')).lower()
        result.append(section(kind, value, selector))
    if not result and assume_all and raw.count(',') >= 4:
        result.append(section('all', raw, selector))
    return result

def extract_lists(soup, brand):
    sections = []
    if brand == 'CeraVe':
        for div in soup.select('.keyIngredients-details__content'):
            sections += labelled_lists(div, '.keyIngredients-details__content', assume_all=True)
    elif brand == 'Cetaphil':
        block = soup.select_one('#productIngredients')
        if block:
            sections += labelled_lists(block, '#productIngredients exact ingredient heading')
    elif brand == 'Vanicream':
        block = soup.select_one('#panel-ingredients')
        if block:
            sections += labelled_lists(block, '#panel-ingredients', assume_all=True)
    elif brand == 'The Ordinary':
        p = soup.select_one('[data-original-ingredients]')
        if p:
            sections.append(section('all', p['data-original-ingredients'], '[data-original-ingredients]'))
    elif brand == 'Eucerin':
        stream = ''
        for script in soup.find_all('script'):
            value = script.get_text()
            if value.startswith('self.__next_f.push('):
                try:
                    arr = json.loads(value[len('self.__next_f.push('):-1])
                    stream += ''.join(part for part in arr[1:] if isinstance(part, str))
                except ValueError:
                    pass
        decoder = json.JSONDecoder()
        seen = set()
        for match in re.finditer(r'"(Ingredients|ActiveIngredients)"\s*:', stream):
            try:
                value, _ = decoder.raw_decode(stream, match.end())
                items = value.get('targetItems', value.get('jsonValue', {}).get('value', []))
                names = [(item.get('IngredientTitle', {}).get('value') or (str(item['key']) + ' ' + str(item.get('value','')) if 'key' in item else '')) for item in items if isinstance(item, dict)]
                names = [name for name in names if name]
                if not names:
                    continue
                kind = 'active' if match.group(1) == 'ActiveIngredients' else 'all'
                signature = (kind, tuple(names))
                if signature in seen:
                    continue
                seen.add(signature)
                sections.append({'kind': kind, 'raw_text': ', '.join(names), 'ingredients': names, 'source_selector': 'embedded RSC data: ' + match.group(1) + ' / IngredientTitle.value'})
            except (ValueError, AttributeError):
                pass
    unique = []
    for s in sections:
        if not any(s['kind'] == old['kind'] and s['raw_text'] == old['raw_text'] for old in unique):
            unique.append(s)
    return unique

ADAPTERS = {
    'CeraVe': (['h1.pdp-heading'], ['.productDescription-content__description', '.product-details__description'], ['#how-to-use', '.productHowTo']),
    'Cetaphil': (['h1.product-name'], ['#longDescription', '.product-long-description', '.product-short-description'], ['#howToUse', '#productUsage', '.product-usage']),
    'Vanicream': (['h1'], ['.productDescription', '.productIntro', '.productInfo__description'], ['#panel-directions', '#panel-directions-for-use']),
    'The Ordinary': (['h1.product-name'], ['.product-info-description', '.product-description'], ['#directions-overview-flyout']),
    'Eucerin': (['.product-stage__description h1', 'h1'], ['.product-stage__description'], ['#how-to-use', '.pdp-how-to-use-section']),
}

records, failures = [], []
for row in manifest:
    if row.get('discovery'):
        continue
    if row.get('status') != 200 or not row.get('rawFile'):
        failures.append({'id': row.get('id'), 'brand': row['brand'], 'source_url': row['url'], 'reason': 'http_' + str(row.get('status', 'fetch_error'))})
        continue
    soup = BeautifulSoup((ROOT / row['rawFile']).read_text(encoding='utf-8'), 'html.parser')
    products = ld_products(soup)
    if row['brand'] not in ADAPTERS:
        continue
    name_selectors, description_selectors, usage_selectors = ADAPTERS[row['brand']]
    name_node, name_selector = first(soup, name_selectors)
    name = products[0].get('name') if products else text(name_node)
    if not name or not soup.select_one('h1'):
        failures.append({'id': row['id'], 'brand': row['brand'], 'source_url': row['url'], 'reason': 'not_a_product_document'})
        continue
    name = html.unescape(name)
    if row['brand'] == 'Eucerin':
        name = re.sub(r'\s*\|.*$', '', html.unescape(row.get('title') or name))
    description_node, desc_selector = first(soup, description_selectors)
    description = text(description_node)
    skin_label=None
    skin_label_selector=None
    if row['brand']=='CeraVe':
        header=soup.select_one('h1.pdp-heading')
        header=header.parent.parent.parent if header else None
        match=re.search(r'Made For:\s*(.+?)\s*Helps With:',text(header))
        if match:skin_label=match.group(1);skin_label_selector='h1.pdp-heading product header / Made For'
    elif row['brand']=='Cetaphil':
        for p in soup.find_all('p'):
            if re.match(r'(?i)^Skin type:',text(p)):
                skin_label=re.sub(r'(?i)^Skin type:\s*','',text(p));skin_label_selector='product description / Skin type';break
    elif row['brand']=='The Ordinary':
        p=soup.select_one('p.suitedTo')
        if p:skin_label=re.sub(r'(?i)^Suited for\s*','',text(p));skin_label_selector='p.suitedTo'
    elif row['brand']=='Vanicream':
        p=soup.select_one('.productInfo__content')
        description=text(p)+' '+text(soup.select_one('.commonIrritants__content'))
        desc_selector='.productInfo__content + .commonIrritants__content'
        match=re.search(r'(?i)ideal (?:for |moisturizing formula for )(dry skin)',description)
        if match:skin_label=match.group(1);skin_label_selector='.productInfo__content / Ideal for'
    elif row['brand']=='Eucerin':
        p=soup.select_one('.product-stage__description')
        if p:
            match=re.search(r'(?i)Skin concerns\s*(.+?)\s*Benefits',text(p))
            if match:skin_label=match.group(1);skin_label_selector='.product-stage__description / Skin concerns'
    if not description and products:
        description = text(BeautifulSoup(products[0].get('description', ''), 'html.parser'))
        desc_selector = 'JSON-LD Product.description'
    usage_node, usage_selector = first(soup, usage_selectors)
    if row['brand']=='Vanicream':
        for button in soup.select('button[aria-controls]'):
            if re.fullmatch(r'(?i)directions|directions for use',text(button)):
                usage_node=soup.find(id=button.get('aria-controls'))
                usage_selector='#'+button.get('aria-controls')
                break
    usage_text=text(usage_node)
    water_evidence=None
    for label_text, selector in [(description,desc_selector)]+[(text(BeautifulSoup(p.get('description',''),'html.parser')),'JSON-LD Product.description') for p in products[:1]]:
        match=re.search(r'(?i)\bwater[\s-]*resistant(?: for)?(?: up to)?\s*\(?\s*(40|80)\s*min(?:utes)?',label_text)
        if match:water_evidence={'minutes':int(match.group(1)),'wording':match.group(0),'source_selector':selector};break
    schedule=[]
    schedule_evidence=None
    for pattern, times in [(r'PM Only',['pm']),(r'AM Only',['am']),(r'Time of Day:\s*Anytime',['am','pm']),(r'morning and (?:at )?(?:night|evening)',['am','pm']),(r'at night',['pm'])]:
        match=re.search(pattern,usage_text,re.I)
        if match:
            schedule=times
            schedule_evidence=match.group(0)
            break
    signature = (name + ' ' + row['url']).lower()
    category = 'other'
    for cat, pattern in [('patch', r'patch'), ('wipes', r'wipe|cloth'), ('exfoliant', r'scrub|exfoliat'), ('sunscreen', r'sunscreen|\bspf\b|spf[- ]?\d'), ('serum', r'serum'), ('cleanser', r'cleanser|cleansing|face.wash|zinc.bar|z.bar'), ('moisturizer', r'moistur|cream|creme|lotion|ointment|gel.cream|antiwrinkle')]:
        if re.search(pattern, signature):
            category = cat
            break
    ingredients = extract_lists(soup, row['brand'])
    full_sections = [s for s in ingredients if s['kind'] in ('all', 'inactive') and len(s['ingredients']) >= 5]
    issues = []
    if row.get('lastAttemptStatus') and row['lastAttemptStatus'] not in (200,304):
        issues.append('source_revalidation_failed')
    if not full_sections:
        issues.append('full_ingredient_list_not_extracted')
    if any(len({s['raw_text'] for s in ingredients if s['kind']==kind})>1 for kind in ('all','inactive','active')):
        issues.append('multiple_formula_lists_require_variant_review')
    if category == 'sunscreen' and not any(s['kind'] == 'active' for s in ingredients):
        issues.append('us_sunscreen_active_section_not_separately_extracted')
    if any(re.search(r'(?i)please|instructions|learn more|reviews|\.{3}|…', s['raw_text']) for s in ingredients):
        issues.append('ingredient_section_contains_non_list_or_truncation')
    joined = ' '.join(s['raw_text'] for s in ingredients)
    normalized = [re.sub(r'\s+', ' ', x).casefold() for s in ingredients for x in s['ingredients']]
    matches = {}
    families = {'niacinamide': r'\bniacinamide\b|\bnicotinamide\b', 'hyaluronic_acid_family': r'hyaluron', 'fragrance_terms': r'\bfragrance\b|\bparfum\b|\bperfume\b|heliotropin', 'denatured_or_ethanol': r'alcohol denat|\bethanol\b|\bsd alcohol', 'fatty_alcohols': r'cetyl alcohol|cetearyl alcohol|stearyl alcohol|behenyl alcohol', 'retinoids': r'retinol|retinal|adapalene|tretinoin', 'salicylic_acid': r'^salicylic acid\b', 'ceramides': r'ceramide', 'glycerin': r'\bglycerin\b|\bglycerol\b'}
    for key, pattern in families.items():
        matches[key] = [item for item in normalized if re.search(pattern, item)]
    claims = []
    for tag, pattern in [('fragrance_free', r'fragrance[ -]free'), ('oil_free', r'oil[ -]free'), ('non_comedogenic', r'non[ -]?comedogenic'), ('broad_spectrum', r'broad[ -]spectrum'), ('sensitive_skin', r'sensitive skin'), ('dry_skin', r'(?:normal to |very |extra[ -])?dry skin'), ('oily_skin', r'(?:normal to |combination to )?oily skin'), ('all_skin_types', r'all skin types'), ('lightweight',r'lightweight|ultra.light|weightless'), ('cream_texture',r'cream'), ('gel_texture',r'\bgel\b')]:
        match = re.search(pattern, description, re.I)
        if match:
            claims.append({'tag': tag, 'wording': match.group(0), 'source_selector': desc_selector, 'attribution': 'manufacturer_label_claim_not_independent_efficacy'})
    if row['brand']=='Vanicream':
        for svg in soup.select('.commonIrritants svg[aria-label]'):
            wording=svg.get('aria-label','')
            tag={'fragrance free':'fragrance_free',"won't clog pores":'non_comedogenic'}.get(wording.casefold())
            if tag:claims.append({'tag':tag,'wording':wording,'source_selector':'.commonIrritants svg[aria-label]','attribution':'manufacturer_label_claim_not_independent_efficacy'})
    if row['brand']=='CeraVe':
        for item in soup.select('.benefits-v2-list-item__description'):
            match=re.search(r'(?i)fragrance[ -]free',text(item))
            if match:claims.append({'tag':'fragrance_free','wording':match.group(0),'source_selector':'.benefits-v2-list-item__description','attribution':'manufacturer_label_claim_not_independent_efficacy'})
    skin_types=[]
    if skin_label:
        if re.search(r'(?i)all skin types|wide range of skin types',skin_label):skin_types=['dry','normal','combination','oily']
        else:skin_types=[t for t in ['dry','normal','combination','oily'] if re.search(r'(?i)\b'+t+r'\b',skin_label)]
    spf = re.search(r'(?i)\bSPF\s*[- ]?\s*(\d{2})(\+)?', name + ' ' + description)
    if category == 'sunscreen' and not spf:
        issues.append('spf_not_extracted')
    is_face = bool(re.search(r'\bface\b|\bfacial\b', name + ' ' + description + ' ' + usage_text, re.I) or '/face-care/' in row['url'])
    if not is_face:
        issues.append('facial_use_not_confirmed_from_selected_product_section')
    if category not in ('cleanser', 'moisturizer', 'sunscreen'):
        issues.append('outside_basic_routine_category')
    if spf and int(spf.group(1)) < 30:
        issues.append('spf_below_30_baseline')
    active_text = ' '.join(s['raw_text'] for s in ingredients if s['kind']=='active')
    if matches['retinoids'] or category == 'exfoliant' or re.search(r'medicated|zinc pyrithione', name + ' ' + joined, re.I) or re.search(r'salicylic acid|benzoyl peroxide|hydrocortisone|pramoxine',active_text,re.I) or re.search(r'exfoliat',description,re.I):
        issues.append('active_treatment_or_exfoliant_requires_separate_review')
    if re.search(r'\beye\b|after.sun',name,re.I):
        issues.append('eye_or_after_sun_product_not_general_face_baseline')
    fingerprint = hashlib.sha256('|'.join(normalized).encode()).hexdigest() if normalized else None
    record = {
        'id': row['id'], 'brand': row['brand'], 'name': name, 'name_source': 'JSON-LD Product.name' if products else name_selector,
        'category': category, 'market': 'US manufacturer reference', 'source_url': row['url'], 'resolved_url': row.get('finalUrl'),
        'fetched_at': row.get('fetchedAt'), 'source_sha256': row.get('sha256'), 'raw_source_file': row['rawFile'], 'parser_version': VERSION,
        'ingredient_sections': ingredients, 'ingredient_count': len(normalized), 'formula_fingerprint': fingerprint,
        'manufacturer_claims': claims, 'spf': int(spf.group(1)) if spf else None,
        'intended_skin_types': skin_types,
        'intended_skin_type_evidence': {'wording':skin_label,'source_selector':skin_label_selector} if skin_label else None,
        'water_resistance_evidence':water_evidence,
        'use_schedule': schedule or None,
        'use_schedule_evidence': {'wording':schedule_evidence,'source_selector':usage_selector} if schedule_evidence else None,
        'usage_source_selector': usage_selector,
        'facial_use_confirmed': is_face,
        'ingredient_family_presence': matches,
        'list_extraction_status': 'complete_section_extracted' if full_sections and not any('ingredient' in x or 'formula' in x or 'active_section' in x for x in issues) else 'needs_review',
        'quality_issues': issues, 'review_status': 'machine_extracted_not_human_approved',
        'recommendation_ready': False,
        'clinical_effectiveness_validated': False,
        'notes': ['Ingredient presence is factual matching, not an allergy or suitability guarantee.', 'No concentration is inferred from ingredient order.', 'Negative presence is not certified absence; compare the current local package.'],
    }
    records.append(record)

seen = set()
unique = []
for row in records:
    key = (row['brand'], re.sub(r'\W+', '', row['name']).casefold(), row['formula_fingerprint'])
    if key in seen:
        continue
    seen.add(key)
    unique.append(row)
records = sorted(unique, key=lambda r: (r['brand'], r['name']))
dataset = {'schema_version': VERSION, 'purpose': 'Data research only. Not connected to the running app.', 'records': records}
(OUT / 'products.json').write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding='utf-8')
(OUT / 'baseline_candidates.json').write_text(json.dumps({'schema_version':VERSION,'status':'candidates_only_not_approved_recommendations','records':[r for r in records if not r['quality_issues']]},ensure_ascii=False,indent=2),encoding='utf-8')
old_by_id = {r['id']:r for r in previous_records}
changes=[]
for record in records:
    old=old_by_id.get(record['id'])
    if not old:
        changes.append({'id':record['id'],'change':'new_record','approval_invalidated':True})
    elif old.get('formula_fingerprint')!=record['formula_fingerprint']:
        changes.append({'id':record['id'],'change':'formula_changed','old_fingerprint':old.get('formula_fingerprint'),'new_fingerprint':record['formula_fingerprint'],'approval_invalidated':True})
    elif old.get('spf')!=record['spf'] or old.get('use_schedule')!=record.get('use_schedule'):
        changes.append({'id':record['id'],'change':'label_field_changed','approval_invalidated':True})
(OUT/'changes.json').write_text(json.dumps(changes,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT / 'rejected_sources.json').write_text(json.dumps(failures, ensure_ascii=False, indent=2), encoding='utf-8')
with (OUT / 'products.csv').open('w', encoding='utf-8-sig', newline='') as f:
    fields = ['id', 'brand', 'name', 'category', 'market', 'source_url', 'fetched_at', 'ingredient_count', 'list_extraction_status', 'quality_issues', 'spf', 'recommendation_ready', 'ingredient_list']
    writer = csv.DictWriter(f, fields)
    writer.writeheader()
    for row in records:
        writer.writerow({**{k: row.get(k) for k in fields if k not in ('quality_issues', 'ingredient_list')}, 'quality_issues': ' | '.join(row['quality_issues']), 'ingredient_list': ' || '.join(s['kind'] + ': ' + s['raw_text'] for s in row['ingredient_sections'])})
summary = {
    'product_records': len(records), 'brands': {brand: sum(r['brand'] == brand for r in records) for brand in sorted({r['brand'] for r in records})},
    'categories': {category: sum(r['category'] == category for r in records) for category in sorted({r['category'] for r in records})},
    'complete_ingredient_sections': sum(r['list_extraction_status'] == 'complete_section_extracted' for r in records),
    'basic_routine_records': sum(r['category'] in ('cleanser','moisturizer','sunscreen') for r in records),
    'records_with_no_machine_quality_issues': sum(not r['quality_issues'] for r in records),
    'rejected_sources': len(failures), 'human_approved': 0, 'recommendation_ready': 0,
}
(OUT / 'quality-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
