import importlib.util
import sys
import unittest
from pathlib import Path
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]/'scripts/editorial_canva'
sys.path.insert(0,str(ROOT))
import compose
import stage_review

class CompositionStagingTests(unittest.TestCase):
 def test_title_never_silently_truncates(self):
  d=ImageDraw.Draw(Image.new('RGB',(1080,1080)))
  with self.assertRaises(ValueError):compose.fitted_lines(d,'A'*500,842,82,3)
 def test_caption_never_silently_truncates(self):
  d=ImageDraw.Draw(Image.new('RGB',(1080,1080)))
  with self.assertRaises(ValueError):compose.wrapped(d,'palavra '*300,(0,0),800,24,2)
 def test_default_staging_rejects_reference(self):
  with self.assertRaises(ValueError):stage_review.build_statement({'channel':'feed','reference_only':True},{'sha256':'a'*64},'test')
 def test_explicit_demo_remains_unpublishable(self):
  sql=stage_review.build_statement({'channel':'feed','reference_only':True,'event_id':'unit-test'},{'sha256':'a'*64},'test',True)
  self.assertIn('giro_editorial_review.assets',sql);self.assertIn('on conflict',sql)
  self.assertNotIn('giro_publicacoes_',sql);self.assertNotIn('update ',sql.lower())
  self.assertIn('awaiting_review',sql)
 def test_sql_quotes_and_backslashes(self):
  self.assertEqual("E'a''b\\\\c'",stage_review.literal("a'b\\c"))
 def test_zero_byte_rejected(self):
  with self.assertRaises(ValueError):stage_review.literal('a\x00b')

if __name__=='__main__':unittest.main()
