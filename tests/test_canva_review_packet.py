import copy
import importlib.util
import unittest
from datetime import datetime,timezone
from pathlib import Path

spec=importlib.util.spec_from_file_location('review_packet',Path(__file__).resolve().parents[1]/'scripts/editorial_canva/review_packet.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
NOW=datetime(2026,10,16,16,tzinfo=timezone.utc)

def complete():
 return {'channel':'shorts','reference_only':False,'scope':'brasil','event_id':'test-event',
 'headline':'TÍTULO SINTÉTICO PARA TESTE UNITÁRIO','scheduled_at':'2026-10-17T12:00:00Z',
 'source':{'url':'https://example.org/news/test','published_at':'2026-10-16T12:00:00Z','fact_checker':'unit-test','evidence_ref':'fixture'},
 'photo':{'article_url':'https://example.org/news/test','event_id':'test-event','caption':'same fixture event','kind':'original_event_photo',
 'correspondence_evidence_ref':'fixture','url':'https://upload.wikimedia.org/test.jpg','license':'CC0',
 'license_url':'https://creativecommons.org/publicdomain/zero/1.0/','author':'fixture','rights_evidence_url':'https://commons.wikimedia.org/wiki/File:Test'}}

class ReviewTests(unittest.TestCase):
 def check(self,change,error):
  d=complete();change(d);self.assertIn(error,m.validate(d,NOW))
 def test_complete_is_still_never_publishable(self):
  d=complete();self.assertEqual([],m.validate(d,NOW));p=m.packet(d,{'sha256':'abc'},NOW)
  self.assertFalse(p['publish_allowed']);self.assertFalse(p['proposed_queue']['visual_approved']);self.assertTrue(p['requires_human_editorial_and_visual_review'])
 def test_different_occurrence(self): self.check(lambda d:d['photo'].update(event_id='other'),'event_mismatch')
 def test_different_article(self): self.check(lambda d:d['photo'].update(article_url='https://example.org/other'),'photo_not_linked_to_same_article')
 def test_unlicensed_portal(self): self.check(lambda d:d['photo'].update(url='https://news.example/photo.jpg'),'photo_host_not_current_allowlist')
 def test_missing_rights(self): self.check(lambda d:d['photo'].pop('license_url'),'rights_evidence_incomplete')
 def test_illustration(self): self.check(lambda d:d['photo'].update(kind='illustration'),'photo_is_not_event_record')
 def test_old_news(self): self.check(lambda d:d['source'].update(published_at='2026-10-14T12:00:00Z'),'source_not_current')
 def test_local_tiktok(self): self.check(lambda d:d.update(channel='tiktok',scope='rondonia'),'video_scope_must_be_brazil_or_world')
 def test_stories_disabled(self): self.check(lambda d:d.update(channel='stories',meta_hold=False),'stories_publication_disabled_pending_validation')
 def test_wrong_timezone_slot(self): self.check(lambda d:d.update(scheduled_at='2026-10-17T11:00:00Z'),'invalid_porto_velho_slot')
 def test_reference_cannot_be_news(self): self.check(lambda d:d.update(reference_only=True),'reference_or_template_not_news')
 def test_meta_unknown_holds(self): self.check(lambda d:d.update(channel='feed'),'meta_hold_or_unknown')
 def test_channels_have_independent_keys(self):
  a=complete();b=copy.deepcopy(a);b['channel']='tiktok'
  self.assertNotEqual(m.packet(a,{'sha256':'same'},NOW)['idempotency_key'],m.packet(b,{'sha256':'same'},NOW)['idempotency_key'])

if __name__=='__main__': unittest.main()
