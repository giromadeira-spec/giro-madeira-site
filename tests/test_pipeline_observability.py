import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod

class PipelineObservability(unittest.TestCase):
    def test_render_pending_is_never_reported_as_published(self):
        giro=module('renderer','scripts/giro_shorts_auto.py')
        with tempfile.TemporaryDirectory() as tmp, patch.object(giro,'ROOT',Path(tmp)), patch.dict(os.environ,{'GITHUB_STEP_SUMMARY':str(Path(tmp)/'summary.md')}):
            giro.report_render_outcome({'state':'awaiting_editorial_visual_review','queue_id':321,'ready_to_publish':False})
            result=json.loads((Path(tmp)/'artifacts/render-shorts.json').read_text())
            self.assertFalse(result['publication_attempted']);self.assertFalse(result['ready_to_publish'])
            self.assertIn('awaiting_editorial_visual_review',(Path(tmp)/'summary.md').read_text())
    def test_missing_event_photo_waits_without_generic_art_or_upload(self):
        giro=module('renderer_pending','scripts/giro_shorts_auto.py')
        calls=[]
        def bridge(token,action,**kwargs):
            calls.append(action)
            return {'processed':True,'queue_id':1,'title':'Polícia realiza operação em Porto Velho','source_url':'https://news.test/article','scenes':['Fato confirmado na reportagem.']*3} if action=='claim' else {'success':True}
        with patch.dict(os.environ,{'GITHUB_EVENT_NAME':'schedule'}), patch.object(giro,'github_token',return_value='offline'), patch.object(giro,'bridge',side_effect=bridge), patch.object(giro,'licensed_event_photo',side_effect=RuntimeError('unlicensed')), patch.object(giro,'render_topic_illustration') as graphic, patch.object(giro.requests,'put') as upload, patch.object(giro,'report_render_outcome') as report:
            giro.main()
            self.assertEqual(calls,['claim','photo_pending'])
            graphic.assert_not_called();upload.assert_not_called()
            self.assertEqual(report.call_args.args[0]['state'],'awaiting_licensed_event_photo')

    def test_monitor_uses_only_status_action_and_fails_on_missing_delivery(self):
        monitor=module('monitor','scripts/giro_pipeline_monitor.py')
        snapshot={'success':True,'read_only':True,'publication_attempted':False,'channels':[],
                  'alerts':[{'channel':'tiktok','reason':'scheduled_publication_unconfirmed'}]}
        with tempfile.TemporaryDirectory() as tmp, patch.object(monitor,'Path',side_effect=lambda p: Path(tmp)/p), patch.dict(os.environ,{'ACTIONS_ID_TOKEN_REQUEST_URL':'https://oidc.test?x=1','ACTIONS_ID_TOKEN_REQUEST_TOKEN':'test-token'}), patch.object(monitor.requests,'get') as get, patch.object(monitor.requests,'post') as post:
            get.return_value.json.return_value={'value':'test-oidc'}
            post.return_value.json.return_value=snapshot
            with self.assertRaises(SystemExit): monitor.main()
            self.assertEqual(post.call_args.kwargs['json'],{'action':'monitor'})
            self.assertEqual(post.call_count,1)

if __name__=='__main__':unittest.main()
