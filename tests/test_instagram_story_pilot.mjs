import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const file=readFileSync(new URL('../supabase/functions/giro-instagram-publicar-independente/index.ts',import.meta.url),'utf8');
const code=stripTypeScriptTypes(file.replace(/^import .*;\n/gm,''));
const root='https://test.local';
let handler,at='2026-10-18T22:15:00Z',enabled=true,allowed=true,approved=true,photo=true,publishCalls=0,meta;
const record=()=>({
 id:151,status:'aprovada',visual_approved:approved,media_pipeline_version:5,
 media_status:photo?'stories_foto_verificada':'aguardando_revisao_visual',
 fonte_url:'https://www.gov.br/noticia',
 legenda:'Foto do acontecimento: evento licenciado\nFonte: oficial\nMatéria original: https://www.gov.br/noticia',
 created_at:'2026-10-18T20:00:00Z',editorial_expires_at:'2026-10-19T03:00:00Z',
 story_image_url:root+'/storage/v1/object/public/news-images/auto/jpeg/stories/story/151.jpg',
 publicar_story:true,instagram_story_media_id:null
});
let row=record();
class Clock extends Date {
 constructor(...a){super(...(a.length?a:[at]))}
 static now(){return Date.parse(at)}
}
function from(table){
 let update=null,uncertain=false;
 const q={select(){return q},eq(){return q},or(v){if(v.includes('status.eq.publicando'))uncertain=true;return q},
 not(){return q},is(){return q},gte(){return q},gt(){return q},order(){return q},limit(){return q},
 update(v){update=v;return q},single:async()=>get(),maybeSingle:async()=>get(),
 then(fn){return Promise.resolve(get()).then(fn)}};
 function get(){
  if(table==='giro_channel_settings')return {data:{publication_enabled:true},error:null};
  if(table==='giro_meta_rate_state')return {data:meta,error:null};
  if(table==='giro_madeira_publicacoes')return {data:[],error:null};
  assert.equal(table,'giro_publicacoes_stories');
  if(update){if(row.status==='aprovada'||update.status==='publicada'){
      Object.assign(row,update);return {data:{id:row.id},error:null};
     }return {data:null,error:null};
  }
  return {data:uncertain?null:row.status==='aprovada'?row:null,error:null};
 }
 return q;
}
vm.runInNewContext(code,{URL,Response,JSON,Intl,Date:Clock,AbortSignal,console,
 createClient:()=>({from,rpc:async(name)=>({data:name==='validar_giro_dispatch_key'?true:{allowed},error:null})}),
 Deno:{env:{get:(name)=>name==='SUPABASE_URL'?root:'test'},serve(fn){handler=fn}},
 fetch:async(_,o)=>{publishCalls++;assert.equal(JSON.parse(o.body).media_type,'STORIES');
   assert.equal(JSON.parse(o.body).image_url,row.story_image_url);
   return Response.json({success:true,instagram_media_id:'story-id-123'});}
});
async function invoke(){
 const res=await handler(new Request(root,{method:'POST',headers:{'x-giro-db-key':'test'},body:JSON.stringify({channel:'stories'})}));
 return {status:res.status,body:await res.json()};
}
const init=()=>{publishCalls=0;approved=true;photo=true;allowed=true;enabled=true;at='2026-10-18T22:15:00Z';row=record();
 meta={integrity_hold:false,rollout_stage:'feed_only',traffic_light_target:'amarelo',
 traffic_light_reel_test_enabled:true,traffic_light_story_test_enabled:true};};
init();assert.equal((await invoke()).body.provider_id,'story-id-123');assert.equal(publishCalls,1);
assert.equal(row.instagram_story_media_id,'story-id-123');await invoke();assert.equal(publishCalls,1);
init();meta.traffic_light_story_test_enabled=false;
assert.ok((await invoke()).body.blocked_reasons.includes('rollout_channel_not_allowed'));assert.equal(publishCalls,0);
init();allowed=false;assert.ok((await invoke()).body.blocked_reasons.includes('meta_semaphore_denied'));assert.equal(publishCalls,0);
init();at='2026-10-18T17:00:00Z';
assert.ok((await invoke()).body.blocked_reasons.includes('outside_stories_window'));assert.equal(publishCalls,0);
init();approved=false;row.visual_approved=false;
assert.equal((await invoke()).body.reason,'no_fresh_verified_media_eligible');assert.equal(publishCalls,0);
init();row.media_status='aguardando_revisao_visual';
assert.equal((await invoke()).body.reason,'media_provenance_or_human_review_missing');assert.equal(publishCalls,0);
init();row.story_image_url=root+'/storage/v1/object/public/news-images/auto/jpeg/stories/feed/151.jpg';
assert.equal((await invoke()).body.reason,'vertical_story_specific_media_required');assert.equal(publishCalls,0);
console.log('PASS: one-Story pilot respects yellow eligibility, separate visual approval, night window, and provider ID; mocks only.');
