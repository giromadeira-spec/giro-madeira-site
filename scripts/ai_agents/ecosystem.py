"""Ruflo static analysis/memory + OpenHands deterministic guard. No LLM calls."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import subprocess
import sqlite3
import shutil

ROOT=Path(__file__).resolve().parents[2]

def recovery_plan(item:dict)->str:
    """Plan only: executing a provider retry requires live reconciliation first."""
    if item.get('delivery_status') in ('claimed','queued','uncertain','review_required'):
        return 'reconcile_existing_delivery_no_resend'
    if item.get('delivery_status')=='sent' or item.get('provider_post_id'):
        return 'already_delivered_no_action'
    if not item.get('editorial_eligible') or not item.get('article_date_verified'):
        return 'editorial_hold_no_publish'
    if item.get('retry_count',0)>=2:
        return 'retry_limit_hold'
    if item.get('status')=='falha' and item.get('technical_cause_fixed'):
        return 'resume_same_item'
    if item.get('render_ready') and not item.get('converted_ready'):
        return 'resume_conversion_same_item'
    return 'await_verified_pipeline'

def command_risk(command:str)->str:
    os.environ['LITELLM_LOCAL_MODEL_COST_MAP']='True'
    os.environ['OPENHANDS_SUPPRESS_BANNER']='1'
    from openhands.sdk.event import ActionEvent
    from openhands.sdk.tool import Action
    from openhands.sdk.security import PatternSecurityAnalyzer
    class AuditCommand(Action):
        command:str
    event=ActionEvent(action=AuditCommand(command=command),thought=[],tool_name='terminal',
        tool_call_id='offline-guard',llm_response_id='offline-no-model',
        tool_call={'id':'offline-guard','name':'terminal','arguments':json.dumps({'command':command}),'origin':'completion'})
    risk=PatternSecurityAnalyzer().security_risk(event)
    return str(risk.value)

def inspect_tools(root:Path)->list[dict[str,str]]:
    checks=[]
    def add(name,status,detail):checks.append({'name':name,'status':status,'detail':detail})
    os.environ['LITELLM_LOCAL_MODEL_COST_MAP']='True'
    os.environ['OPENHANDS_SUPPRESS_BANNER']='1'
    try:
        from openhands.sdk import AgentContext
        from openhands.sdk.context import Skill
        contract=(root/'AGENTS.md').read_text()
        context=AgentContext(skills=[Skill(name='giro-editorial-contract',content=contract,trigger=None)],
            load_user_skills=False,load_public_skills=False,load_project_skills=False,load_memory=False)
        if context.skills[0].content!=contract:raise ValueError('context mismatch')
        if command_risk('python -m unittest discover -s tests')!='LOW':raise ValueError('read-only check blocked')
        # This is pattern evaluation, never an executed command.
        if command_risk('rm -rf /tmp/synthetic-guard-probe')!='HIGH':raise ValueError('guard failed')
        add('OpenHands local guard','PASS','Contrato original carregado e comando destrutivo bloqueado por padrões; sem LLM.')
    except Exception:
        add('OpenHands local guard','FAIL','Falha de importação/validação local; nenhuma execução de agente autorizada.')
        return checks
    ruflo=root/'scripts/ai_agents/toolchain/node_modules/.bin/ruflo'
    if not ruflo.is_file():
        add('Ruflo CLI','FAIL','Dependências ausentes; instalar com npm ci no toolchain.')
        return checks
    # Do not pass provider credentials, dispatch keys, tracing or social tokens to the toolchain.
    env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','TMPDIR','TEMP','SYSTEMROOT')}
    env.update({'LANGSMITH_TRACING':'false','LANGCHAIN_TRACING_V2':'false','LITELLM_LOCAL_MODEL_COST_MAP':'True'})
    def run(args:list[str]):
        cmd=[str(ruflo),*args]
        if command_risk(' '.join(cmd))!='LOW':raise ValueError('command guard blocked')
        result=subprocess.run(cmd,cwd=root,env=env,text=True,capture_output=True,timeout=90,check=True)
        return result.stdout
    try:
        version=run(['--version'])
        if '3.56.7' not in version:raise ValueError('version mismatch')
        report=json.loads(run(['analyze','code','--path',str(root/'supabase/functions/giro-tiktok-editorial-queue'),'--format','json']))
        add('Ruflo static analysis','PASS',f"Ruflo 3.56.7 analisou {report['files']} arquivos do TikTok, sem provedor de IA.")
    except Exception:
        add('Ruflo static analysis','FAIL','Análise local não concluída; sem alterações na produção.')
    try:
        policy=json.dumps(json.loads((root/'scripts/ai_agents/ecosystem-policy.json').read_text()),sort_keys=True,separators=(',',':'))
        folder=root/'artifacts';folder.mkdir(exist_ok=True)
        native=subprocess.run([shutil.which('node') or 'node','-e',"const DB=require('better-sqlite3');new DB(':memory:').close()"],
            cwd=ruflo.parent.parent,env=env,capture_output=True,timeout=15).returncode==0
        if native:
            database=folder/'giro-ruflo-memory.db'
            run(['memory','store','--key','editorial-policy','--namespace','giro-tiktok','--value',policy,
                 '--no-embedding','--require-native','--provenance','user_claim','--path',str(database)])
            recovered=run(['memory','retrieve','--key','editorial-policy','--namespace','giro-tiktok','--value-only','--path',str(database)])
            if policy not in recovered:raise ValueError('memory roundtrip failed')
            add('Ruflo policy memory','PASS','Política gravada e recuperada do SQLite nativo local, sem LLM.')
        else:
            raise RuntimeError('native driver unavailable')
    except Exception:
        # Ruflo sql.js fallback can fail its WAL checkpoint; never report that write as durable.
        try:
            database=root/'artifacts/giro-policy-memory.sqlite'
            with sqlite3.connect(database) as db:
                db.execute('CREATE TABLE IF NOT EXISTS policy (id TEXT PRIMARY KEY, body TEXT NOT NULL)')
                db.execute('INSERT INTO policy VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',('tiktok',policy))
            with sqlite3.connect(database) as db:
                recovered=db.execute('SELECT body FROM policy WHERE id=?',('tiktok',)).fetchone()[0]
            if recovered!=policy:raise ValueError('fallback memory mismatch')
            add('Ruflo policy memory','WARN','Driver nativo não validado; fallback SQLite Python gravado e recuperado com sucesso.')
        except Exception:
            add('Ruflo policy memory','FAIL','Memória local não validada; política canônica permanece no repositório.')
    return checks

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=ROOT)
    args=parser.parse_args()
    checks=inspect_tools(args.root.resolve())
    print(json.dumps(checks,ensure_ascii=False,indent=2))
    raise SystemExit(any(c['status']=='FAIL' for c in checks))
