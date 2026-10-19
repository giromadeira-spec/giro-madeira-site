import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';import vm from 'node:vm';
const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/giro-instagram-publicar-independente/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
let handler,at='2026-10-18T17:40:00Z',uncertain=null,rollout='feed_only';
class Clock extends Date{constructor(...args){super(...(args.length?args:[at]))}static now(){return Date.parse(at)}}
function from(table){let filters=[];const api={select(){return api},eq(){return api},or(s){filters.push(s);return api},limit(){return api},gte(){return api},gt(){return api},is(){return api},order(){return api},maybeSingle(){return Promise.resolve(result())},single(){return Promise.resolve(result())}};function result(){if(table==='giro_channel_settings')return {data:{publication_enabled:true},error:null};if(table==='giro_meta_rate_state')return {data:{integrity_hold:false,rollout_stage:rollout,traffic_light_target:'amarelo',traffic_light_reel_test_enabled:true},error:null};assert.equal(table,'giro_publicacoes_reels');return {data:filters.includes('status.eq.publicando,erro.eq.reconcile_provider_before_resend')?uncertain:null,error:null}}return api}
vm.runInNewContext(source,{URL,Response,JSON,Intl,Date:Clock,AbortSignal,console,
 createClient:()=>({from,rpc:async(name)=>({data:name==='validar_giro_dispatch_key'?true:{allowed:true},error:null})}),
 Deno:{env:{get:()=> 'https://test.local'},serve(fn){handler=fn}},fetch:()=>{throw Error('Recovery tests must never publish')}});
async function run(){const r=await handler(new Request('https://test.local',{method:'POST',headers:{'x-giro-db-key':'test-key'},body:JSON.stringify({channel:'reels'})}));assert.equal(r.status,200);return r.json()}
assert.equal((await run()).reason,'no_fresh_verified_media_eligible');
uncertain={id:99};assert.equal((await run()).reason,'reconciliation_required');
uncertain=null;at='2026-10-18T16:45:00Z';assert.ok((await run()).blocked_reasons.includes('outside_editorial_publication_window'));
rollout='full';at='2026-10-18T18:15:00Z';assert.equal((await run()).reason,'no_fresh_verified_media_eligible');
console.log('PASS: Reels bounded recovery, full rollout, and uncertain-result hold; no publication');
