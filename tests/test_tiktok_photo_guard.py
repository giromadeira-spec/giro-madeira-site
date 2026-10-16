"""Offline regressions: no network, real credentials, upload or publication."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("renderer",ROOT/"scripts/giro_shorts_auto.py")
r=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

class TikTokPhotoGuard(unittest.TestCase):
    def pipeline(self,platform="tiktok",credit="wikimedia_event_test",missing=False):
        calls=[]
        claim={"processed":True,"queue_id":999,"title":"Terremoto deixa feridos na Rússia",
               "source_url":"https://example.test/report","scenes":[{}, {}, {}],
               "upload_url":"https://offline.invalid/upload","storage_path":"test.mp4"}
        def bridge(token,action,**kwargs):
            calls.append(action)
            return claim if action=="claim" else {"queue_id":999}
        def frame(photo,river,logo,item,scene,index,credit,path):
            Image.new("RGB",(1080,1920)).save(path)
        def render(frames,video,sound):
            video.write_bytes(b"OFFLINE TEST ONLY")
        photo=Mock(side_effect=RuntimeError("no verified photo")) if missing else Mock(
            return_value=(Image.new("RGB",(1080,1920)),credit,"verified event"))
        with tempfile.TemporaryDirectory() as tmp, patch.object(r,"PLATFORM",platform), \
             patch.object(r,"ROOT",Path(tmp)), \
             patch.object(r,"github_token",return_value="offline"), \
             patch.object(r,"bridge",side_effect=bridge), \
             patch.object(r,"licensed_event_photo",photo), \
             patch.object(r,"render_topic_illustration",return_value=Image.new("RGB",(1080,1920))) as art, \
             patch.object(r,"licensed_local_madeira_photo",side_effect=RuntimeError("offline")), \
             patch.object(r,"make_frame",side_effect=frame), \
             patch.object(r,"make_music"), patch.object(r,"render_frames",side_effect=render), \
             patch.object(r.requests,"put",return_value=Mock(status_code=201)) as upload, \
             patch.dict(os.environ,{"GITHUB_EVENT_NAME":"schedule"}):
            assets=Path(tmp)/"assets"
            assets.mkdir()
            Image.new("RGB",(100,100)).save(assets/"logo-oficial.webp")
            failed=False
            try:r.main()
            except RuntimeError:failed=True
            return failed,calls,art.call_count,upload.call_count

    def test_missing_photo_blocks_before_art_upload_complete(self):
        self.assertEqual(self.pipeline(missing=True),(True,["claim","fail"],0,0))

    def test_invalid_credit_cannot_be_approved(self):
        for credit in ("original_editorial_labeled_mundo","openverse_test","wikimedia_archive_test",""):
            with self.subTest(credit=credit):
                self.assertEqual(self.pipeline(credit=credit),(True,["claim","fail"],0,0))

    def test_verified_event_photo_keeps_normal_path(self):
        self.assertEqual(self.pipeline(),(False,["claim","complete"],0,1))

    def test_shared_renderer_respects_current_shorts_photo_policy(self):
        # Shorts now independently requires event photos too (3842e370).
        # This QA must not expect or restore its removed illustration fallback.
        self.assertEqual(self.pipeline(platform="shorts",missing=True),
                         (True,["claim","fail"],0,0))
        self.assertEqual(self.pipeline(platform="shorts"),
                         (False,["claim","complete"],0,1))
        self.assertEqual(self.pipeline(platform="shorts",credit="original_editorial_labeled_mundo"),
                         (True,["claim","fail"],0,0))

    def test_deployed_source_gates_reject_original_art(self):
        for path in ("scripts/buffer/giro-buffer-tiktok-worker.ts",
                     "supabase/functions/giro-tiktok-github-bridge/index.ts",
                     "supabase/functions/giro-tiktok-30fps-bridge/index.ts"):
            source=(ROOT/path).read_text()
            self.assertNotIn("original_editorial_labeled_",source,path)
            self.assertIn("wikimedia_event_",source,path)
        queue=(ROOT/"supabase/functions/giro-tiktok-editorial-queue/index.ts").read_text()
        self.assertNotIn("releaseError",queue)
        self.assertIn('until Buffer reconciliation',queue)

if __name__=="__main__":unittest.main()
