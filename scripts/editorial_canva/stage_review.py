#!/usr/bin/env python3
"""Create an idempotent SQL staging import. Never writes publication queues.

Default produces SQL for privileged review. --execute uses psql with the
operator's existing PG environment, without receiving or printing credentials.
"""
import argparse
import json
import subprocess
from pathlib import Path
from review_packet import inspect_media, validate

def literal(value):
    if not isinstance(value,str) or '\x00' in value:raise ValueError('invalid_sql_text')
    # E-literal also escapes backslashes; behavior is independent of session
    # standard_conforming_strings and cannot terminate through payload quotes.
    return "E'"+value.replace('\\','\\\\').replace("'","''")+"'"

def build_statement(record,metadata,artifact_ref,reference_demo=False):
    issues=validate(record)
    if issues and not (reference_demo and record.get('reference_only') is True):raise ValueError('editorial_hold:'+','.join(issues))
    if record.get('channel') not in {'feed','stories','reels','tiktok','shorts'}:raise ValueError('invalid_channel')
    if not record.get('event_id'):raise ValueError('missing_event_id')
    if not isinstance(artifact_ref,str) or not artifact_ref or len(artifact_ref)>2000:raise ValueError('artifact_ref_required')
    evidence={'manifest':record,'issues':issues,'human_review_required':True,'mode':'reference_demo' if reference_demo else 'review_candidate'}
    values=[literal(record['channel']),literal(record['event_id']),literal(metadata['sha256']),literal(artifact_ref),
            'true' if record.get('reference_only') is True else 'false','false',literal('awaiting_review'),literal(json.dumps(metadata,ensure_ascii=False))+'::jsonb',literal(json.dumps(evidence,ensure_ascii=False))+'::jsonb']
    return ("insert into giro_editorial_review.assets (channel,event_id,media_sha256,artifact_ref,reference_only,publish_allowed,review_state,media_metadata,evidence) values ("+','.join(values)+") on conflict (channel,event_id,media_sha256) do nothing returning id,channel,reference_only,publish_allowed,review_state;\n")

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('manifest');p.add_argument('--media',required=True);p.add_argument('--artifact-ref',required=True);p.add_argument('--out',required=True);p.add_argument('--reference-demo',action='store_true');p.add_argument('--execute',action='store_true')
    a=p.parse_args();record=json.loads(Path(a.manifest).read_text());metadata=inspect_media(a.media,record['channel'])
    sql=build_statement(record,metadata,a.artifact_ref,a.reference_demo);Path(a.out).write_text(sql)
    if a.execute:subprocess.run(['psql','-X','-v','ON_ERROR_STOP=1','--file',str(Path(a.out).resolve())],check=True,timeout=40)
    print(json.dumps({'sql_file':a.out,'executed':a.execute,'publish_allowed':False,'channel':record['channel'],'sha256':metadata['sha256']}))
