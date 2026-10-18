import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {storyboardIsCurrent} from '../supabase/functions/_shared/article-recency.ts';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const shorts=read('../supabase/functions/giro-shorts-github-bridge/index.ts');
const tiktok=read('../supabase/functions/giro-tiktok-github-bridge/index.ts');
const planner=read('../supabase/functions/giro-tiktok-editorial-queue/index.ts');
const shortFlow=read('../.github/workflows/giro-shorts-producao.yml');
const tikFlow=read('../.github/workflows/giro-tiktok-producao.yml');
const slot=Date.parse('2026-10-18T21:00:00Z');
for(const [lane,src,flow] of [['shorts',shorts,shortFlow],['tiktok',tiktok,tikFlow]]){
 assert.ok(src.includes('Date.now()+8*3600000'),lane+' can claim within eight hours');
 assert.ok(!src.includes('Date.now()+2*3600000'),lane+' not limited to two hours');
 assert.ok(src.includes('if(!storyboardIsCurrent(item))continue'),lane+' requires verified future-slot article date');
 assert.ok(flow.includes("cron: '15 15 * * *'"),lane+' has 11:15 Porto Velho early pass');
 assert.ok(flow.includes("cron: '15,35 20 * * *'"),lane+' retains 16:15 and 16:35 Porto Velho backups');
 assert.ok(src.includes('last_prepared_at:new Date().toISOString()'),lane+' registers real MP4 preparation');
 assert.ok(src.includes('if(!updated)return response'),lane+' only updates after successful completion');
 assert.ok(src.includes('.is("provider_post_id",null)'),lane+' does not reclaim delivered media');
}
assert.ok(shorts.includes('visual_review_status:"pending",editor_approved:false'),
 'Shorts illustration remains in review');
assert.ok(tiktok.includes('visual_review_status:isIllustration?"pending":"approved"') &&
 tiktok.includes('editor_approved:!isIllustration'), 'TikTok illustration cannot self-approve');
assert.ok(planner.includes('.eq("shorts_render_version",0).is("video_url",null).is("provider_post_id",null)'));
assert.ok(planner.includes('giro_buffer_tiktok_jobs'));
assert.ok(planner.includes('if(bufferErr)throw bufferErr'));
assert.ok(planner.includes('if(reserved.has(String(f.id)))continue'));
assert.ok(planner.includes('released_preupload_failures:releasedPreUpload'));
assert.equal(storyboardIsCurrent({
 storyboard_status:'preparado',scheduled_for:new Date(slot).toISOString(),
 storyboard_source_published_at:'2026-10-18T14:31:15Z'},Date.parse('2026-10-18T20:15:00Z')),true);
assert.equal(storyboardIsCurrent({
 storyboard_status:'preparado',scheduled_for:new Date(slot).toISOString(),
 storyboard_source_published_at:'2026-10-17T14:00:00Z'},Date.parse('2026-10-18T20:15:00Z')),false);
console.log('PASS: early MP4 production, future-slot freshness, manual illustration review and safe replacement; zero publications.');

 
// Execute TikTok's claim handler; substring checks cannot detect a commented-out query.
const {stripTypeScriptTypes}=await import('node:module');
const vm=await import('node:vm');
const activeCron=[...tikFlow.matchAll(/^\s+- cron: '([^']+)'\s*$/gm)].map(m=>m[1]);
for(const cron of ['15 15 * * *','30 17 * * *','15 19 * * *','15,35 20 * * *']){
 assert.ok(activeCron.includes(cron),'TikTok preparation cron must be active, not text inside a comment: '+cron);
}
assert.ok(!tikFlow.split('\n').some(line=>line.trimStart().startsWith('#')&&line.includes('\\n')),
 'TikTok workflow comments must not absorb escaped newlines or cron entries');
let handler;const filters=[];
const at=Date.parse('2026-10-18T19:00:00Z');
class FixedClock extends Date {constructor(...args){super(...(args.length?args:[at]));}static now(){return at;}}
function from(table){
 const api={select(){return api;},eq(k,v){filters.push([table,'eq',k,v]);return api;},
  in(){return api;},is(){return api;},gte(){return api;},
  lte(k,v){filters.push([table,'lte',k,v]);return api;},order(){return api;},
  limit(){return Promise.resolve({data:[],error:null});},
  single(){return Promise.resolve({data:table==='giro_tiktok_editorial_settings'
   ?{shorts_render_enabled:true,daily_goal:2}:{preparation_enabled:true},error:null});},
  update(){throw Error('Offline claim with no candidates cannot mutate');}};
 return api;
}
vm.runInNewContext(stripTypeScriptTypes(tiktok.replace(/^import .*;\n/gm,'')),{
 URL,Response,JSON,Intl,Date:FixedClock,TextEncoder,crypto,console,
 createRemoteJWKSet:()=>null,jwtVerify:async()=>({payload:{repository:'giromadeira-spec/giro-madeira-site',
 repository_id:'1403695629',ref:'refs/heads/main',event_name:'schedule',
 workflow_ref:'giromadeira-spec/giro-madeira-site/.github/workflows/giro-tiktok-producao.yml@refs/heads/main'}}),
 createClient:()=>({from}),Deno:{env:{get:()=> 'https://offline.invalid'},serve(fn){handler=fn;}},
 fetch:()=>{throw Error('Offline regression must not use the network');}
});
const claim=await handler(new Request('https://offline.invalid',{method:'POST',
 headers:{Authorization:'Bearer offline-test'},body:JSON.stringify({action:'claim'})}));
assert.equal(claim.status,200);
assert.equal((await claim.json()).reason,'no_verified_storyboard_due');
assert.ok(filters.some(([table,op,k,v])=>table==='giro_social_video_queue'&&op==='lte'&&
 k==='scheduled_for'&&v===new Date(at+8*3600000).toISOString()),
 'TikTok claim must execute its eight-hour scheduled_for upper bound');
assert.ok(filters.some(([table,op,k,v])=>table==='giro_social_video_queue'&&op==='eq'&&k==='platform'&&v==='tiktok'));
console.log('PASS: active TikTok preparation schedules and runtime eight-hour claim bound; no network or mutations.');
