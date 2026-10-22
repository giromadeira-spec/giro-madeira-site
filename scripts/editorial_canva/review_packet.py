#!/usr/bin/env python3
"""Offline Canva handoff validation. Never writes Supabase or calls a publisher.

Checks evidence completeness and actual media properties. It cannot establish
truth, legal permission or final editorial approval from a supplied JSON file.
"""
import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

CHANNELS = {'feed', 'stories', 'reels', 'tiktok', 'shorts'}
PV = ZoneInfo('America/Porto_Velho')

def https(url):
    try:
        p=urlsplit(url)
        return p.scheme=='https' and bool(p.hostname) and not p.username and not p.password
    except (TypeError, ValueError):
        return False

def instant(value):
    d=datetime.fromisoformat(value.replace('Z','+00:00'))
    if d.tzinfo is None: raise ValueError('timezone required')
    return d

def validate(record, now=None):
    """Fail closed on incomplete evidence; no record ever becomes approved."""
    now=now or datetime.now(timezone.utc)
    errors=[]
    channel=record.get('channel')
    if channel not in CHANNELS: errors.append('invalid_channel')
    if record.get('reference_only') is not False: errors.append('reference_or_template_not_news')
    if record.get('scope') not in {'brasil','mundo','rondonia','porto_velho'}: errors.append('scope_missing')
    if channel in {'tiktok','shorts'} and record.get('scope') not in {'brasil','mundo'}:
        errors.append('video_scope_must_be_brazil_or_world')
    source=record.get('source') or {}
    photo=record.get('photo') or {}
    if not https(source.get('url')): errors.append('source_https_required')
    if not source.get('fact_checker') or not source.get('evidence_ref'): errors.append('fact_check_evidence_missing')
    try:
        published=instant(source['published_at'])
        if not 0 <= (now-published).total_seconds() <= 86400: errors.append('source_not_current')
    except (KeyError,TypeError,ValueError): errors.append('source_date_invalid')
    if photo.get('article_url') != source.get('url'): errors.append('photo_not_linked_to_same_article')
    if not photo.get('event_id') or photo.get('event_id') != record.get('event_id'): errors.append('event_mismatch')
    if not photo.get('caption') or not photo.get('correspondence_evidence_ref'): errors.append('photo_correspondence_missing')
    if photo.get('kind') != 'original_event_photo': errors.append('photo_is_not_event_record')
    # Preserve the current repository's strict Commons policy. Other written
    # permissions require a reviewed policy change, never a silent fallback.
    if not https(photo.get('url')) or urlsplit(photo.get('url','')).hostname not in {'upload.wikimedia.org','thumb.wikimedia.org'}:
        errors.append('photo_host_not_current_allowlist')
    license_type=photo.get('license')
    license_url=photo.get('license_url','')
    allowed = ((license_type=='CC0' and re.fullmatch(r'https://creativecommons\.org/publicdomain/zero/1\.0/?',license_url)) or
               (license_type=='CC BY' and re.fullmatch(r'https://creativecommons\.org/licenses/by/(?:1\.0|2\.0|2\.5|3\.0|4\.0)/?',license_url)))
    if not allowed or not photo.get('author') or not https(photo.get('rights_evidence_url')): errors.append('rights_evidence_incomplete')
    if not record.get('headline') or '[' in record.get('headline','') or 'MANCHETE' in record.get('headline','').upper(): errors.append('headline_placeholder')
    if channel in {'tiktok','shorts'}:
        try:
            slot=instant(record['scheduled_at']).astimezone(PV)
            if slot.hour not in {8,22} or slot.minute or slot.second or slot.microsecond: errors.append('invalid_porto_velho_slot')
        except (KeyError,TypeError,ValueError): errors.append('schedule_invalid')
    if channel=='stories': errors.append('stories_publication_disabled_pending_validation')
    if record.get('meta_hold') is not False and channel in {'feed','reels','stories'}: errors.append('meta_hold_or_unknown')
    return errors

def inspect_media(filename, channel):
    p=Path(filename)
    if p.suffix.lower() in {'.png','.jpg','.jpeg'}:
        from PIL import Image
        with Image.open(p) as im:
            im.verify()
        with Image.open(p) as im:
            metadata={'width':im.width,'height':im.height,'format':im.format}
        if channel in {'tiktok','shorts','reels'}: raise ValueError('video_required')
    else:
        r=subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)],capture_output=True,text=True,check=True,timeout=30)
        data=json.loads(r.stdout)
        v=next(s for s in data['streams'] if s['codec_type']=='video')
        a=next((s for s in data['streams'] if s['codec_type']=='audio'),None)
        metadata={'width':v['width'],'height':v['height'],'codec':v['codec_name'],'fps':v['r_frame_rate'],'duration':float(data['format']['duration']),'audio':bool(a)}
        if v['codec_name']!='h264' or v.get('pix_fmt')!='yuv420p' or v['r_frame_rate']!='30/1' or not a: raise ValueError('video_encode_or_audio_invalid')
        if not 3 <= metadata['duration'] <= 60: raise ValueError('duration_outside_template_profile')
        if channel=='feed': raise ValueError('feed_image_required')
    expected=(1080,1080 if channel=='feed' else 1920)
    if (metadata['width'],metadata['height'])!=expected: raise ValueError('invalid_dimensions')
    metadata['sha256']=hashlib.sha256(p.read_bytes()).hexdigest()
    return metadata

def packet(record, metadata, now=None):
    errors=validate(record,now)
    return {'mode':'offline_review_only','publish_allowed':False,'database_write_attempted':False,
            'channel':record.get('channel'),'idempotency_key':f"{record.get('channel')}:{record.get('event_id')}:{metadata.get('sha256')}",
            'checks':{'evidence_complete':not errors,'issues':errors,'actual_media':metadata},
            'requires_human_editorial_and_visual_review':True,
            'proposed_queue':{'table':'giro_social_video_queue' if record.get('channel') in {'shorts','tiktok'} else f"giro_publicacoes_{record.get('channel')}",
                              'platform':{'shorts':'youtube_shorts','tiktok':'tiktok'}.get(record.get('channel')),
                              'status':'pendente','visual_approved':False,'editor_approved':False},
            'note':'Completeness is not factual verification or license validation. No automatic import or approval.'}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('manifest');p.add_argument('--media',required=True);p.add_argument('--out',required=True)
    args=p.parse_args()
    record=json.loads(Path(args.manifest).read_text())
    if record.get('channel') not in CHANNELS: raise SystemExit('invalid_channel')
    result=packet(record,inspect_media(args.media,record['channel']))
    Path(args.out).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'issues':result['checks']['issues'],'publish_allowed':False,'output':args.out},ensure_ascii=False))

if __name__=='__main__': main()
