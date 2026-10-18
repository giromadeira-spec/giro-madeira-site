import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {sourceRecovery} from '../supabase/functions/giro-shorts-preparar-storyboard/recovery-policy.ts';
for(const error of ['source_http_429','source_http_503','source_fetch_or_parse_failed']){
 assert.equal(sourceRecovery(error,0),'retry');assert.equal(sourceRecovery(error,1),'retry');assert.equal(sourceRecovery(error,2),'hold');
}
for(const error of ['insufficient_verified_facts','source_http_404',null])assert.equal(sourceRecovery(error,0),null);
const path='../supabase/functions/giro-shorts-github-bridge/index.ts';
const source=stripTypeScriptTypes(readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
let handler,calls=0;
let claims={repository:'giromadeira-spec/giro-madeira-site',repository_id:'1403695629',ref:'refs/heads/main',
 workflow_ref:'giromadeira-spec/giro-madeira-site/.github/workflows/giro-pipeline-monitor.yml@refs/heads/main',event_name:'schedule'};
vm.runInNewContext(source,{URL,Response,JSON,TextEncoder,crypto,Date,console,
 createRemoteJWKSet:()=>null,jwtVerify:async()=>({payload:claims}),
 createClient:()=>({rpc:async(name)=>{assert.equal(name,'giro_pipeline_status_readonly');calls++;return {data:{read_only:true,publication_attempted:false},error:null}},from:()=>{throw Error('monitor cannot access mutating queries')}}),
 Deno:{env:{get:()=> 'configured'},serve(fn){handler=fn}}});
async function request(action){return handler(new Request('https://test.local',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action})}));}
assert.equal((await request('claim')).status,403);assert.equal(calls,0);
assert.equal((await request('complete')).status,403);assert.equal(calls,0);
let response=await request('monitor');assert.equal(response.status,200);assert.equal((await response.json()).publication_attempted,false);assert.equal(calls,1);
claims.ref='refs/heads/other';assert.equal((await request('monitor')).status,403);assert.equal(calls,1);
console.log('PASS: monitor identity cannot claim/complete/publish; bounded Shorts source retries preserve factual holds');
