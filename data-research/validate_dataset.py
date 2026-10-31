from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,re,sys,unittest

ROOT=Path(__file__).parent
data=json.loads((ROOT/'output/products.json').read_text(encoding='utf-8'))
rows=data['records']
by_id={r['id']:r for r in rows}
guidance=json.loads((ROOT/'guidance.json').read_text(encoding='utf-8'))

class DataChecks(unittest.TestCase):
    def test_source_integrity(self):
        for row in rows:
            raw=(ROOT/row['raw_source_file']).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(),row['source_sha256'],row['id'])
    def test_only_official_sources_and_explicit_market(self):
        for row in rows:
            self.assertRegex(row['source_url'],r'^https://(www\.)?(cerave\.com|cetaphil\.com|vanicream\.com|theordinary\.com|eucerinus\.com)/')
            self.assertEqual(row['market'],'US manufacturer reference')
            self.assertTrue(row['fetched_at'])
    def test_no_identity_duplicates(self):
        self.assertEqual(len(by_id),len(rows))
        keys=[(r['brand'],r['name'].casefold(),r['formula_fingerprint']) for r in rows]
        self.assertEqual(len(keys),len(set(keys)))
    def test_no_false_approval_or_clinical_claim(self):
        for row in rows:
            self.assertFalse(row['recommendation_ready'])
            self.assertFalse(row['clinical_effectiveness_validated'])
    def test_ingredient_sections_do_not_include_disclaimers_or_reviews(self):
        for row in rows:
            for section in row['ingredient_sections']:
                self.assertTrue(section['source_selector'])
                self.assertNotRegex(section['raw_text'],r'(?i)please be aware|customer review|rated \d|how to use|FEATURED INGREDIENTS|INACTIVE INGREDIENTS')
                for ingredient in section['ingredients']:
                    self.assertLess(len(ingredient.split()),18,(row['id'],ingredient))
    def test_us_sunscreen_drug_facts_stay_separate(self):
        for row in rows:
            if row['category']=='sunscreen' and row['list_extraction_status']=='complete_section_extracted':
                self.assertTrue(any(s['kind']=='active' for s in row['ingredient_sections']),row['id'])
                self.assertTrue(any(s['kind'] in ('all','inactive') and len(s['ingredients'])>=5 for s in row['ingredient_sections']),row['id'])
    def test_known_active_percentages_are_preserved(self):
        active=next(s for s in by_id['cv-invisible50']['ingredient_sections'] if s['kind']=='active')['raw_text']
        self.assertIn('2.66%',active)
        self.assertIn('15.35%',active)
    def test_masking_fragrance_is_not_lost(self):
        row=by_id['cetaphil-128b509c7d']
        self.assertIn('masking fragrance',row['ingredient_family_presence']['fragrance_terms'])
    def test_fatty_alcohol_does_not_become_ethanol(self):
        row=by_id['cv-cream']
        self.assertTrue(row['ingredient_family_presence']['fatty_alcohols'])
        self.assertFalse(row['ingredient_family_presence']['denatured_or_ethanol'])
    def test_comma_inside_inci_name_is_preserved(self):
        ingredients=[x.lower() for s in by_id['vanicream-5de2749297']['ingredient_sections'] for x in s['ingredients']]
        self.assertIn('1,2-hexanediol',ingredients)
        self.assertNotIn('1',ingredients)
    def test_night_label_is_not_morning(self):
        self.assertEqual(by_id['cv-pm']['use_schedule'],['pm'])
        self.assertEqual(by_id['cv-pm']['use_schedule_evidence']['wording'],'PM Only')
    def test_spf15_and_medicated_products_are_flagged(self):
        self.assertIn('spf_below_30_baseline',by_id['cetaphil-7b51ef7a57']['quality_issues'])
        self.assertIn('active_treatment_or_exfoliant_requires_separate_review',by_id['vanicream-d0c10baa24']['quality_issues'])
        self.assertIn('active_treatment_or_exfoliant_requires_separate_review',by_id['cetaphil-dfbcbd8bca']['quality_issues'])
    def test_machine_candidates_do_not_hide_issues(self):
        candidate=json.loads((ROOT/'output/baseline_candidates.json').read_text(encoding='utf-8'))['records']
        for row in candidate:
            self.assertEqual(row['quality_issues'],[])
            self.assertTrue(row['facial_use_confirmed'])
            self.assertIn(row['category'],['cleanser','moisturizer','sunscreen'])
    def test_guidance_has_primary_sources_and_explicit_limits(self):
        ids={s['id'] for s in guidance['sources']}
        for rule in guidance['selection_principles']:
            self.assertTrue(set(rule['source_ids'])<=ids)
            self.assertTrue(rule['scope'])

result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(DataChecks))
report={'checked_at':datetime.now(timezone.utc).isoformat(),'tests_run':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'passed':result.wasSuccessful(),'meaning':'Extraction and provenance checks, not clinical suitability validation.'}
(ROOT/'output/validation-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
sys.exit(0 if result.wasSuccessful() else 1)
