"""Offline editorial image tests: no OIDC, social API, media upload or paid services."""
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image

script=Path(__file__).resolve().parents[1]/"scripts"/"giro_shorts_auto.py"
spec=importlib.util.spec_from_file_location("giro_shorts_image_qa",script)
giro=importlib.util.module_from_spec(spec)
spec.loader.exec_module(giro)

HEADLINE="Operação Aurora prende suspeitos em Porto Velho"
ARTICLE="https://portal.exemplo.org/noticias/operacao-aurora"

class FakeResponse:
    def __init__(self, *, html_page=None, payload=None, url=ARTICLE):
        self.text=html_page or ""
        self.content=self.text.encode("utf-8")
        self.headers={"Content-Type":"text/html"}
        self.url=url
        self.payload=payload
    def raise_for_status(self):
        pass
    def json(self):
        return self.payload

def commons_payload(filename,license_name,license_url,artist):
    return {"query":{"pages":[{"imageinfo":[{
      "width":1600,"height":1000,
      "thumburl":"https://upload.wikimedia.org/wikipedia/commons/a/ab/"+filename,
      "extmetadata":{
         "LicenseShortName":{"value":license_name},
         "LicenseUrl":{"value":license_url},
         "Artist":{"value":artist},
      }
    }]}]}}

class EventPhotoTests(unittest.TestCase):
    def test_parser_discovers_lazy_gallery_with_associated_caption(self):
        parser=giro.EventPageImages()
        parser.feed("""
          <figure class="gallery">
            <picture>
              <source data-srcset="https://upload.wikimedia.org/wikipedia/commons/a/ab/Aurora.webp 1024w">
              <img src="data:image/gif;base64,AAAA"
                   data-lazy-src="https://upload.wikimedia.org/wikipedia/commons/a/ab/Aurora.jpg"
                   alt="Foto registrada">
            </picture>
            <figcaption><strong>Operação Aurora</strong> prende suspeitos em Porto Velho</figcaption>
          </figure>""")
        candidates=dict(parser.images)
        img="https://upload.wikimedia.org/wikipedia/commons/a/ab/Aurora.jpg"
        self.assertIn(img,candidates)
        self.assertTrue(giro.event_caption_matches(HEADLINE,candidates[img]))
        self.assertTrue(any(url.endswith("Aurora.webp") for url,_ in parser.images))

    def test_skips_unlicensed_gallery_item_and_selects_licensed_photo(self):
        html_page="""
        <meta property="og:title" content="Operação Aurora prende suspeitos em Porto Velho">
        <meta property="og:image" content="https://portal.exemplo.org/og-logo.jpg">
        <figure>
          <img data-src="https://upload.wikimedia.org/wikipedia/commons/a/ab/First.jpg">
          <figcaption>Operação Aurora prende suspeitos em Porto Velho</figcaption>
        </figure>
        <figure>
          <img srcset="https://upload.wikimedia.org/wikipedia/commons/a/ab/Second.jpg 1600w">
          <figcaption>Operação Aurora prende suspeitos em Porto Velho</figcaption>
        </figure>"""
        visited=[]
        def fake_get(url,*,params=None,**kwargs):
            if url==ARTICLE:
                return FakeResponse(html_page=html_page)
            self.assertEqual(url,"https://commons.wikimedia.org/w/api.php")
            filename=params["titles"].removeprefix("File:")
            visited.append(filename)
            if filename=="First.jpg":
                return FakeResponse(payload=commons_payload(filename,"CC BY-SA 4.0",
                    "https://creativecommons.org/licenses/by-sa/4.0/","Autor"))
            return FakeResponse(payload=commons_payload(filename,"CC BY 4.0",
                "https://creativecommons.org/licenses/by/4.0/","Autora Exemplo"))
        with patch.object(giro.requests,"get",side_effect=fake_get), \
             patch.object(giro,"fetch_picture",return_value=Image.new("RGB",(1200,900))):
            photo,credit,filename=giro.licensed_event_photo(ARTICLE,HEADLINE)
        self.assertEqual(visited,["First.jpg","Second.jpg"])
        self.assertEqual(filename,"Second.jpg")
        self.assertTrue(credit.startswith("wikimedia_event_"))
        self.assertIn("Autora Exemplo",credit)
        self.assertEqual(photo.size,(1200,900))

    def test_credited_commons_file_link_inside_figure_is_checked(self):
        page="""<meta property="og:title" content="Operação Aurora prende suspeitos em Porto Velho">
        <figure><img src="https://portal.exemplo.org/media/foto.jpg">
        <figcaption>Operação Aurora prende suspeitos em Porto Velho.
        <a href="https://commons.wikimedia.org/wiki/File:Aurora_evento.jpg">Crédito no Commons</a>
        </figcaption></figure>"""
        filenames=[]
        def fake_get(url,*,params=None,**kwargs):
            if url==ARTICLE:
                return FakeResponse(html_page=page)
            self.assertEqual(url,"https://commons.wikimedia.org/w/api.php")
            filenames.append(params["titles"])
            return FakeResponse(payload=commons_payload("Aurora_evento.jpg","CC0 1.0",
                "https://creativecommons.org/publicdomain/zero/1.0/",""))
        with patch.object(giro.requests,"get",side_effect=fake_get), \
             patch.object(giro,"fetch_picture",return_value=Image.new("RGB",(1200,900))):
            photo,credit,filename=giro.licensed_event_photo(ARTICLE,HEADLINE)
        self.assertEqual(filenames,["File:Aurora evento.jpg"])
        self.assertEqual(filename,"Aurora evento.jpg")
        self.assertIn("CC0",credit)
        self.assertEqual(photo.size,(1200,900))

    def test_registry_fallback_requires_private_signed_url_and_exact_story(self):
        from urllib.parse import quote
        registered={"id":17,"article_url":ARTICLE,"headline":HEADLINE,
            "image_credit":"registered_event_17 — Fotógrafa autorizada — uso redes",
            "image_url":"https://dsihvbdhocbqscaypraw.supabase.co/storage/v1/object/sign/giro-imagens-autorizadas/approved/news-17.jpg?token=signed-test"}
        with patch.object(giro,"fetch_picture",return_value=Image.new("RGB",(1080,900))) as get:
            im,credit,title=giro.approved_registry_photo(registered,ARTICLE,HEADLINE)
        self.assertEqual(im.size,(1080,900))
        self.assertTrue(credit.startswith("registered_event_17"))
        self.assertIn("#17",title)
        self.assertEqual(get.call_count,1)
        with patch.object(giro,"fetch_picture") as get:
            wrong=dict(registered,image_url="https://www.pinterest.com/pin/123?token=x")
            with self.assertRaisesRegex(RuntimeError,"Only signed private newsroom images"):
                giro.approved_registry_photo(wrong,ARTICLE,HEADLINE)
            wrong=dict(registered,headline="Outra notícia diferente")
            with self.assertRaisesRegex(RuntimeError,"does not match exact source article"):
                giro.approved_registry_photo(wrong,ARTICLE,HEADLINE)
            wrong=dict(registered,image_credit="registered_event_25 — Fake")
            with self.assertRaisesRegex(RuntimeError,"attribution"):
                giro.approved_registry_photo(wrong,ARTICLE,HEADLINE)
        get.assert_not_called()

    def test_does_not_trust_publisher_image_without_individual_license(self):
        page="""<meta property="og:title" content="Operação Aurora prende suspeitos em Porto Velho">
        <figure><img src="https://portal.exemplo.org/police.jpg">
        <figcaption>Operação Aurora prende suspeitos em Porto Velho</figcaption></figure>"""
        with patch.object(giro.requests,"get",return_value=FakeResponse(html_page=page)) as requests_get:
            with self.assertRaisesRegex(RuntimeError,"No source-linked Commons photograph"):
                giro.licensed_event_photo(ARTICLE,HEADLINE)
        self.assertEqual(requests_get.call_count,1)

    def test_rejects_unrelated_event_and_illustrative_photo(self):
        page="""<meta property="og:title" content="Operação Aurora prende suspeitos em Porto Velho">
        <figure><img src="https://upload.wikimedia.org/wikipedia/commons/a/ab/Random.jpg">
        <figcaption>Policiais em operação de 2010 em outro país</figcaption></figure>
        <figure><img src="https://upload.wikimedia.org/wikipedia/commons/a/ab/Archive.jpg">
        <figcaption>Imagem ilustrativa: Operação Aurora prende suspeitos em Porto Velho</figcaption></figure>"""
        with patch.object(giro.requests,"get",return_value=FakeResponse(html_page=page)) as requests_get:
            with self.assertRaisesRegex(RuntimeError,"No source-linked Commons photograph"):
                giro.licensed_event_photo(ARTICLE,HEADLINE)
        self.assertEqual(requests_get.call_count,1)

if __name__=="__main__":
    unittest.main()
