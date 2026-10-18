"""Offline regression tests for licensed photos and clearly labeled symbolic artwork.
No credentials, actual news claims, publication, Buffer or social uploads.
"""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock,patch
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("renderer",ROOT/"scripts/giro_shorts_auto.py")
r=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

class TikTokPhotoGuard(unittest.TestCase):
    def pipeline(self,platform="tiktok",credit="wikimedia_event_test",missing=False):
        calls=[]
        complete_payload=[]
        claim={"processed":True,"queue_id":999,"title":"Terremoto deixa feridos na Rússia",
               "source_url":"https://example.test/report","scenes":["Cena 1","Cena 2","Cena 3"],
               "upload_url":"https://offline.invalid/upload","storage_path":"test.mp4"}
        def bridge(token,action,**kwargs):
            calls.append(action)
            if action=="complete":
                complete_payload.append(kwargs)
            return claim if action=="claim" else {"queue_id":999}
        def frame(photo,river,logo,item,scene,index,credit,path):
            Image.new("RGB",(1080,1920)).save(path)
        def render(frames,video,sound):
            video.write_bytes(b"OFFLINE TEST ONLY")
        photo=Mock(side_effect=RuntimeError("no verified photo")) if missing else Mock(
            return_value=(Image.new("RGB",(1080,1920)),credit,"verified event"))
        with tempfile.TemporaryDirectory() as tmp,patch.object(r,"PLATFORM",platform), \
             patch.object(r,"ROOT",Path(tmp)), \
             patch.object(r,"github_token",return_value="offline"), \
             patch.object(r,"bridge",side_effect=bridge), \
             patch.object(r,"licensed_event_photo",photo), \
             patch.object(r,"render_topic_illustration",return_value=Image.new("RGB",(1080,1920))) as art, \
             patch.object(r,"licensed_local_madeira_photo",side_effect=RuntimeError("offline")), \
             patch.object(r,"make_frame",side_effect=frame), \
             patch.object(r,"make_music"),patch.object(r,"render_frames",side_effect=render), \
             patch.object(r.requests,"put",return_value=Mock(status_code=201)) as upload, \
             patch.dict(os.environ,{"GITHUB_EVENT_NAME":"schedule"}):
            folder=Path(tmp)/"assets"
            folder.mkdir()
            Image.new("RGB",(100,100)).save(folder/"logo-oficial.webp")
            try:
                r.main()
                failed=False
            except RuntimeError:
                failed=True
        return failed,calls,art.call_count,upload.call_count,complete_payload

    def test_missing_photo_stays_pending_without_generic_art_or_upload(self):
        for channel in ("shorts","tiktok"):
            with self.subTest(channel=channel):
                failed,calls,art,upload,completes=self.pipeline(platform=channel,missing=True)
                self.assertFalse(failed)
                self.assertEqual(calls,["claim","photo_pending"])
                self.assertEqual(art,0)
                self.assertEqual(upload,0)
                self.assertEqual(completes,[])

    def test_invalid_fake_photo_credit_is_not_accepted(self):
        for credit in ("original_editorial_labeled_mundo","openverse_test","wikimedia_archive_test",""):
            with self.subTest(credit=credit):
                failed,calls,art,upload,completes=self.pipeline(credit=credit)
                self.assertTrue(failed)
                self.assertEqual(calls,["claim","fail"])
                self.assertEqual(art,0)
                self.assertEqual(upload,0)
                self.assertEqual(completes,[])

    def test_verified_photo_keeps_normal_path(self):
        for channel in ("shorts","tiktok"):
            failed,calls,art,upload,completes=self.pipeline(platform=channel)
            self.assertFalse(failed)
            self.assertEqual(calls,["claim","complete"])
            self.assertEqual(art,0)
            self.assertEqual(upload,1)
            self.assertEqual(completes[0]["visual_kind"],"event_photo")

    def test_illustration_credit_is_bound_to_exact_story(self):
        source="https://example.test/report"
        headline="Terremoto deixa feridos na Rússia"
        credit=r.original_illustration_credit(source,headline)
        self.assertTrue(r.is_acceptable_visual_credit(credit,source,headline))
        self.assertFalse(r.is_acceptable_visual_credit(credit,source,headline+" ontem"))
        self.assertFalse(r.is_acceptable_visual_credit(credit,source+"?version=2",headline))

    def test_tiktok_art_never_bypasses_human_review(self):
        bridge=(ROOT/"supabase/functions/giro-tiktok-github-bridge/index.ts").read_text()
        converter=(ROOT/"supabase/functions/giro-tiktok-30fps-bridge/index.ts").read_text()
        worker=(ROOT/"scripts/buffer/giro-buffer-tiktok-worker.ts").read_text()
        self.assertIn('editor_approved:!isIllustration',bridge)
        self.assertIn('visual_review_status:isIllustration?"pending":"approved"',bridge)
        self.assertIn('ready_to_publish:!isIllustration',bridge)
        self.assertIn('.eq("editor_approved",true)',converter)
        self.assertIn('.eq("visual_review_status","approved")',converter)
        self.assertIn('editorial_review_or_visual_origin_missing',worker)
        self.assertIn('visualDisclosure=illustrated',worker)
        self.assertIn('originalArtCredit(',worker)
        self.assertIn('until Buffer reconciliation',(ROOT/"supabase/functions/giro-tiktok-editorial-queue/index.ts").read_text())

    def test_shorts_art_also_needs_editor_approval(self):
        bridge=(ROOT/"supabase/functions/giro-shorts-github-bridge/index.ts").read_text()
        uploader=(ROOT/"supabase/functions/giro-youtube-upload-auto/index.ts").read_text()
        self.assertIn("illustration_not_bound_to_article",bridge)
        self.assertIn("editor_approved:false",bridge)
        self.assertIn("ready_to_publish:false",bridge)
        self.assertIn('.eq("editor_approved",true)',uploader)
        self.assertIn('.eq("visual_review_status","approved")',uploader)
        self.assertIn("ILUSTRAÇÃO EDITORIAL ORIGINAL",uploader)

if __name__=="__main__":
    unittest.main()
