import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {storyboardIsCurrent} from '../supabase/functions/_shared/article-recency.ts';

const at='2026-10-18T21:01:00Z';
class Clock extends Date {constructor(...args){super(...(args.length?args:[at]))}static now(){return Date.parse(at)}}
let proof=null,handler,requests=0;
let youtubeSlotFloor=null;
const row={id:319,title:'Banco Central reduz juros em decisão para todo o Brasil',storyboard_status:'preparado',scheduled_for:'2026-10-18T21:00:00Z'};
function from(table){
 let fields='';
 const q={select(value){fields=value;return q},eq(){return q},in(){return q},neq(){return q},gt(){return q},gte(field,value){if(field==='scheduled_for')youtubeSlotFloor=value;return q},lte(){return q},is(){return q},or(){return q},order(){return q},limit(){return q},single:async()=>result(),then(resolve){return Promise.resolve(result()).then(resolve)}};
 function result(){
  if(table==='giro_channel_settings')return {data:{publication_enabled:true},error:null};
  if(table==='giro_shorts_settings')return {data:{public_auto_uploads_enabled:true,render_worker_reviewed:true,daily_goal:1,min_interval_minutes:1200},error:null};
  assert.equal(table,'giro_social_video_queue');
  return {data:fields.includes('caption')?[{...row,storyboard_source_published_at:proof}]:[],error:null};
 }
 return q;
}
const code=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/giro-youtube-upload-auto/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
vm.runInNewContext(code,{Date:Clock,URL,Response,Intl,TextEncoder,console,
 storyboardIsCurrent:q=>storyboardIsCurrent(q,Clock.now()),
 createClient:()=>({from,rpc:async()=>({data:true,error:null})}),
 Deno:{env:{get:()=> 'test'},serve(fn){handler=fn}},
 fetch(){requests++;throw Error('No external delivery allowed in recency tests')}});
async function invoke(action='run'){
 const r=await handler(new Request('https://test.local',{method:'POST',headers:{'x-giro-db-key':'test'},body:JSON.stringify({action})}));
 assert.equal(r.status,200);return r.json();
}
for(const missingOrStale of [null,'invalid','2026-10-17T12:00:00Z']){
 proof=missingOrStale;
 const r=await invoke();assert.equal(r.reason,'article_date_revalidation_required');assert.equal(r.processed,0);
}
proof='2026-10-18T06:00:00Z';
const valid=await invoke('preview');assert.equal(valid.will_upload,false);assert.equal(valid.queue_id,319);
assert.equal(requests,0);
const expectedFloor=new Date(Date.parse(at)-45*60000).toISOString();
assert.equal(youtubeSlotFloor,expectedFloor,'YouTube must only consider the current 45-minute slot');
assert.ok(Date.parse('2026-10-18T12:00:00Z')<Date.parse(youtubeSlotFloor),
 'An old 08h video cannot be reused by the new 17h uploader');
console.log('PASS: final YouTube gate blocks missing/stale dates before any upload; current article passes preview only.');
