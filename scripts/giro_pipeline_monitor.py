#!/usr/bin/env python3
"""Read-only delivery monitor: OIDC -> status snapshot; never claims or sends media."""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
import urllib.parse
import requests

ENDPOINT = 'https://dsihvbdhocbqscaypraw.supabase.co/functions/v1/giro-shorts-github-bridge'

def render_summary(snapshot):
    rows = ['## Giro Madeira — confirmações de produção', '',
            'Consulta somente de leitura. Renderização e HTTP 200 não confirmam publicação.', '',
            '| Canal | Publicação habilitada | Revisão | Prontos | Incertos | Confirmados em 24h |',
            '| --- | --- | ---: | ---: | ---: | ---: |']
    for lane in snapshot.get('channels', []):
        c = lane['counts']
        rows.append(f"| {lane['channel']} | {lane['publication_enabled']} | {c['awaiting_review']} | {c['ready']} | {c['uncertain']} | {c['confirmed_24h']} |")
    rows += ['', 'Pendências:']
    for alert in snapshot.get('alerts', []):
        rows.append(f"- {alert['channel']}: {alert['reason']}" + (f" — {alert['slot']}" if 'slot' in alert else ''))
    return '\n'.join(rows) + '\n'

def preview_video_preflight(snapshot):
    """Only checks the NEXT scheduled slot per independent lane. Never grants approval."""
    checked=datetime.fromisoformat(snapshot['checked_at'].replace('Z','+00:00'))
    rows=snapshot.get('items') or []
    lines=['## GIRO MADEIRA — Prévia antecipada Shorts / TikTok', '',
           'Somente leitura; MP4 pronto e revisão humana concluída são requisitos distintos.', '',
           '| Canal | Fila | Slot UTC | MP4 | Revisão | Validade |',
           '| --- | --- | --- | --- | --- | --- |']
    issues=[]
    for platform,label in (('youtube_shorts','YouTube Shorts'),('tiktok','TikTok')):
        candidates=sorted((r for r in rows if r.get('platform')==platform),
                          key=lambda x:x.get('scheduled_for') or '9999')
        slot=candidates[0] if candidates else None
        if not slot:
            lines.append(f'| {label} | ausente | — | não | não | — |')
            issues.append(f'{label}: nenhuma pauta válida na próxima janela')
            continue
        slot_id=slot.get('id')
        scheduled=slot.get('scheduled_for') or ''
        video=slot.get('video_url') or ''
        mp4=video.startswith('https://') and '.mp4' in video
        reviewed=slot.get('visual_review_status')=='approved' and slot.get('editor_approved') is True
        published=slot.get('status')=='enviado' and bool(slot.get('provider_post_id'))
        try:
            date=datetime.fromisoformat(str(slot.get('storyboard_source_published_at') or '').replace('Z','+00:00'))
            due=datetime.fromisoformat(str(scheduled).replace('Z','+00:00'))
            fresh=(date.tzinfo is not None and due.tzinfo is not None and
                   due.timestamp()-86400<=date.timestamp()<=checked.timestamp()+300)
        except (ValueError, TypeError):
            fresh=False
        lines.append(f"| {label} | {slot_id} | {scheduled} | {'sim' if mp4 else 'não'} | {'aprovada' if reviewed else 'pendente'} | {'sim' if fresh else 'não'} |")
        if video and mp4:
            lines.append(f"\n- {label} — [prévia MP4 da fila {slot_id}]({video}) (não é prova de postagem)")
        if not (mp4 and reviewed and fresh) and not published:
            reasons=[]
            if not mp4: reasons.append('MP4 não renderizado')
            if not reviewed: reasons.append('revisão editorial/visual pendente')
            if not fresh: reasons.append('data original inválida para o slot')
            issues.append(f"{label} fila {slot_id}: "+', '.join(reasons))
    lines.extend(['', 'Ações necessárias:']+[f'- {v}' for v in issues] if issues else ['', 'Todas as filas futuras selecionadas passaram na checagem prévia; conferir IDs públicos após o envio.'])
    return '\n'.join(lines)+'\n',issues

def main(preflight=False):
    url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL']
    sep = '&' if '?' in url else '?'
    auth = requests.get(url + sep + 'audience=' + urllib.parse.quote(ENDPOINT, safe=''),
                        headers={'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']}, timeout=20)
    auth.raise_for_status()
    response = requests.post(ENDPOINT, json={'action': 'preflight' if preflight else 'monitor'},
                             headers={'Authorization': 'Bearer ' + auth.json()['value']}, timeout=35)
    response.raise_for_status()
    snapshot = response.json()
    if snapshot.get('success') is not True or snapshot.get('read_only') is not True or snapshot.get('publication_attempted') is not False:
        raise RuntimeError('Invalid read-only monitor response')
    out = Path('artifacts'); out.mkdir(exist_ok=True)
    (out / ('video-preflight.json' if preflight else 'pipeline-status.json')).write_text(json.dumps(snapshot, ensure_ascii=False, indent=2))
    if preflight:
        if snapshot.get('kind')!='video_preflight': raise RuntimeError('Wrong OIDC preflight action')
        summary,issues=preview_video_preflight(snapshot)
        print(summary)
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as file: file.write(summary)
        if issues: raise SystemExit('Video not ready for editorial release: '+'; '.join(issues))
        return
    summary = render_summary(snapshot)
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as file:
            file.write(summary)
    critical = any(a['reason'] in ('scheduled_publication_unconfirmed', 'reconciliation_required') for a in snapshot.get('alerts', []))
    if critical:
        raise SystemExit('Publication missing or uncertain: see channel diagnostics in job summary')

if __name__ == '__main__':
    main('--preflight' in sys.argv[1:])
