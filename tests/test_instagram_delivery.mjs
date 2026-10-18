import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const base='https://test.local';
const idFields={feed:'instagram_media_id',stories:'instagram_story_media_id',reels:'instagram_reel_media_id'};
const at='2026-10-18T16:20:00Z';
class Clock extends Date {constructor(...args){super(...(args.length?args:[at]))}static now(){return Date.parse(at)}}
let handler,rows,legacy,requests,writes,mode,saveFails,loseReservation,allowed;
function reset(){
 rows=Object.fromEntries(Object.keys(idFields).map(channel=>[channel,{id:7,status:'aprovada',visual_approved:true,
  media_pipeline_version:6,media_status:channel==='feed'?'feed_foto_verificada':'foto_verificada',
  fonte_url:'https://source.test/event',legenda:'Foto do acontecimento: Fotógrafo / fonte autorizada\nFonte: fonte\nMatéria original: https://source.test/event',
  created_at:'2026-10-18T12:00:00Z',editorial_expires_at:'2026-10-19T12:00:00Z',
  feed_image_url:base+'/storage/v1/object/public/news-images/feed.jpg',story_image_url:base+'/storage/v1/object/public/news-images/story.jpg',
  video_url:base+'/storage/v1/object/public/news-videos/reel.mp4',publicar_reel:channel==='reels',publicar_story:channel==='stories'}]));
 legacy={};requests=[];writes=[];mode='success';saveFails=false;loseReservation=false;allowed=true;
}
function from(table){
 const channel=table.replace('giro_publicacoes_','');
 let patch=null,where=[],uncertain=false,remoteField;
 const q={select(){return q},eq(k,v){where.push([k,v]);return q},is(){return q},gte(){return q},gt(){return q},order(){return q},limit(){return q},
  or(value){if(value.includes('status.eq.publicando'))uncertain=true;return q},not(field){remoteField=field;return q},update(value){patch=value;return q},
  single:async()=>result(),maybeSingle:async()=>result(),then(resolve){return Promise.resolve(result()).then(resolve)}};
 function result(){
  if(table==='giro_channel_settings')return {data:{publication_enabled:true},error:null};
  if(table==='giro_meta_rate_state')return {data:{integrity_hold:false,rollout_stage:'full'},error:null};
  if(table==='giro_madeira_publicacoes')return {data:legacy[remoteField]?[{id:5}]:[],error:null};
  assert.ok(channel in rows,table);const row=rows[channel];
  if(patch){
   if(where.some(([k,v])=>row[k]!==v))return {data:null,error:null};
   if(loseReservation&&patch.status==='publicando')return {data:null,error:null};
   if(saveFails&&patch.status==='publicada')return {data:null,error:{message:'simulated database unavailable'}};
   Object.assign(row,patch);writes.push({channel,patch});return {data:{id:row.id},error:null};
  }
  if(uncertain)return {data:row.status==='publicando'||row.erro==='reconcile_provider_before_resend'?{id:row.id}:null,error:null};
  return {data:row.status==='aprovada'?row:null,error:null};
 }
 return q;
}
const code=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/giro-instagram-publicar-independente/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
vm.runInNewContext(code,{URL,Response,JSON,Intl,Date:Clock,AbortSignal,console,
 createClient:()=>({from,rpc:async name=>({data:name==='validar_giro_dispatch_key'?true:{allowed},error:null})}),
 Deno:{env:{get:()=>base},serve(fn){handler=fn}},
 fetch:async(url,options)=>{
  assert.equal(url,base+'/functions/v1/publicar-instagram');requests.push(JSON.parse(options.body));
  if(mode==='timeout')throw Error('simulated provider timeout');
  return Response.json(mode==='missing_id'?{success:true}:{success:true,instagram_media_id:'confirmed-provider-id'});
 }});
async function send(channel='feed'){
 const r=await handler(new Request(base,{method:'POST',headers:{'x-giro-db-key':'test'},body:JSON.stringify({channel})}));
 return {status:r.status,body:await r.json()};
}
for(const channel of Object.keys(idFields)){
 reset();const r=await send(channel);assert.equal(r.status,200);assert.equal(r.body.provider_id,'confirmed-provider-id');
 assert.equal(rows[channel][idFields[channel]],'confirmed-provider-id');assert.equal(rows[channel].status,'publicada');
 assert.ok(writes.every(w=>w.channel===channel));assert.equal(requests.length,1);
 assert.equal(requests[0].media_type,{feed:'IMAGE',stories:'STORIES',reels:'REELS'}[channel]);
 if(channel==='reels')assert.equal(requests[0].share_to_feed,false);
 await send(channel);assert.equal(requests.length,1,'Confirmed delivery must never send twice');
}
for(const failure of ['timeout','missing_id']){
 reset();mode=failure;assert.equal((await send()).status,502);
 assert.equal(rows.feed.erro,'reconcile_provider_before_resend');assert.equal(rows.feed.status,'erro');
 assert.equal((await send()).body.reason,'reconciliation_required');assert.equal(requests.length,1);
}
reset();saveFails=true;assert.equal((await send()).body.error,'confirmed_provider_id_not_saved');
assert.equal(rows.feed.status,'publicando');assert.equal((await send()).body.reason,'reconciliation_required');assert.equal(requests.length,1);
reset();legacy.instagram_media_id='old-feed';assert.equal((await send('feed')).body.reason,'already_published');assert.equal(requests.length,0);
assert.equal((await send('reels')).body.provider_id,'confirmed-provider-id','A legacy Feed cannot consume the independent Reels story');
reset();loseReservation=true;assert.equal((await send()).body.reason,'already_reserved');assert.equal(requests.length,0);
reset();allowed=false;assert.ok((await send()).body.blocked_reasons.includes('meta_semaphore_denied'));assert.equal(requests.length,0);
console.log('PASS: simulated Instagram delivery verifies provider IDs, channel isolation, duplicates, reservation races and uncertain-result holds. No external requests.');
