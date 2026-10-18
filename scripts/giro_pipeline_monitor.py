#!/usr/bin/env python3
"""Read-only delivery monitor: OIDC -> status snapshot; never claims or sends media."""
import json
import os
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

def main():
    url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL']
    sep = '&' if '?' in url else '?'
    auth = requests.get(url + sep + 'audience=' + urllib.parse.quote(ENDPOINT, safe=''),
                        headers={'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']}, timeout=20)
    auth.raise_for_status()
    response = requests.post(ENDPOINT, json={'action': 'monitor'},
                             headers={'Authorization': 'Bearer ' + auth.json()['value']}, timeout=35)
    response.raise_for_status()
    snapshot = response.json()
    if snapshot.get('success') is not True or snapshot.get('read_only') is not True or snapshot.get('publication_attempted') is not False:
        raise RuntimeError('Invalid read-only monitor response')
    out = Path('artifacts'); out.mkdir(exist_ok=True)
    (out / 'pipeline-status.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2))
    summary = render_summary(snapshot)
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as file:
            file.write(summary)
    critical = any(a['reason'] in ('scheduled_publication_unconfirmed', 'reconciliation_required') for a in snapshot.get('alerts', []))
    if critical:
        raise SystemExit('Publication missing or uncertain: see channel diagnostics in job summary')

if __name__ == '__main__':
    main()
