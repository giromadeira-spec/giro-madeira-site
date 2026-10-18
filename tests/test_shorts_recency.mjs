import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {articleIsFresh,articleTimestamp} from '../supabase/functions/giro-shorts-preparar-storyboard/article-date.ts';
import {storyboardIsCurrent} from '../supabase/functions/_shared/article-recency.ts';
import {sourceRecovery} from '../supabase/functions/giro-shorts-preparar-storyboard/recovery-policy.ts';

const now=Date.parse('2026-10-18T16:00:00Z');
const scheduled='2026-10-19T02:00:00Z'; // 22h Porto Velho.
const facts=['O Banco Central reduziu os juros após a reunião desta semana.',
 'A decisão afeta os financiamentos de empresas em todo o Brasil.',
 'O comitê divulgou novas projeções para a economia brasileira.'];

async function prepare(published,{jsonLd=false,state='aguardando',proof=null,lane='shorts'}={}){
 const source=readFileSync(new URL('../supabase/functions/giro-'+lane+'-preparar-storyboard/index.ts',import.meta.url),'utf8');
 const code=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,''));
 let handler,patch;
 const filters=[];
 const row={id:900,source_kind:'radar',source_id:91,platform:lane==='shorts'?'youtube_shorts':'tiktok',status:'pronto_para_revisao',source_url:'https://news.test/economia',scheduled_for:scheduled,shorts_render_retry_count:0,storyboard_status:state,storyboard_source_published_at:proof};
 const radar={id:91,titulo:facts[0],url:row.source_url,score:80,source_published_at:new Date(now).toISOString()};
 const db={rpc:async()=>({data:true,error:null}),from(table){
   const q={select(){return q},eq(k,v){filters.push([k,v]);return q},is(k,v){filters.push([k,v]);return q},in(k,v){if(k==='storyboard_status')assert.ok(v.includes('preparado'),'Legacy prepared stories must be selected');return q},or(){return q},gte(){return q},order(){return q},
     single:async()=>({data:{preparation_enabled:true},error:null}),
     maybeSingle:async()=>({data:radar,error:null}),
     limit:async()=>({data:[row],error:null}),update(value){patch=value;return q},
     then(resolve){return Promise.resolve({error:null}).then(resolve)}};
   assert.ok(['giro_channel_settings','giro_social_video_queue','giro_radar_'+lane].includes(table));
   return q;
 }};
 function load(){
   return selector=>({
     attr:()=>selector==='meta[property="article:published_time"]'&&!jsonLd?published:'',
     remove(){},
     toArray:()=>selector==='script[type="application/ld+json"]'?(jsonLd?[{value:JSON.stringify({'@graph':[{'@type':'NewsArticle',datePublished:published}]})}]:[]):facts.map(value=>({value})),
     text:()=>selector?.value||''
   });
 }
 class Clock extends Date {static now(){return now}}
 const scope={Date:Clock,URL,Response,AbortSignal,console,articleTimestamp,articleIsFresh:(p,u,r)=>articleIsFresh(p,u,r,now),storyboardIsCurrent:q=>storyboardIsCurrent(q,now),sourceRecovery,createClient:()=>db,load,
   fetch:async()=>new Response('<article>verified fixture</article>',{headers:{'content-type':'text/html'}}),
   Deno:{env:{get:()=> 'test'},serve(fn){handler=fn}}};
 vm.createContext(scope);vm.runInContext(code,scope);
 const response=await handler(new Request('https://edge.test',{method:'POST',headers:{'x-giro-db-key':'test'},body:'{}'}));
 assert.equal(response.status,200);
 assert.ok((await response.json()).processed<=1);
 assert.ok(filters.some(([k,v])=>k==='platform'&&v===row.platform));
 assert.ok(filters.some(([k,v])=>k==='shorts_render_version'&&v===0));
 assert.ok(filters.some(([k,v])=>k==='provider_post_id'&&v===null));
 return patch;
}

// Fresh radar discovery cannot make a report fresh at tonight's publication slot.
for(const jsonLd of [false,true]){
 const old=await prepare('2026-10-17T20:00:00Z',{jsonLd});
 assert.equal(old.status,'expirado');
 assert.equal(old.storyboard_error,'article_date_unverified_or_outdated');
 const fresh=await prepare('2026-10-18T06:00:00Z',{jsonLd});
 assert.equal(fresh.storyboard_status,'preparado');
 assert.equal(fresh.scene_cards.length,3);
 assert.equal(fresh.storyboard_source_published_at,'2026-10-18T06:00:00.000Z');
}
assert.equal((await prepare('')).storyboard_error,'article_date_unverified_or_outdated');
assert.equal((await prepare('invalid-date')).storyboard_error,'article_date_unverified_or_outdated');
for(const lane of ['shorts','tiktok']){
 assert.equal((await prepare('2026-10-17T12:00:00Z',{state:'preparado',lane})).status,'expirado');
 assert.equal((await prepare('2026-10-18T06:00:00Z',{state:'preparado',lane})).storyboard_source_published_at,'2026-10-18T06:00:00.000Z');
 assert.equal(await prepare('must-not-refetch',{state:'preparado',lane,proof:'2026-10-18T06:00:00Z'}),undefined);
}
assert.equal(storyboardIsCurrent({storyboard_status:'preparado',scheduled_for:scheduled},now),false);
assert.equal(storyboardIsCurrent({storyboard_status:'preparado',scheduled_for:scheduled,storyboard_source_published_at:'2026-10-17T12:00:00Z'},now),false);
assert.equal(storyboardIsCurrent({storyboard_status:'preparado',scheduled_for:scheduled,storyboard_source_published_at:'2026-10-18T06:00:00Z'},Date.parse('2026-10-19T07:00:00Z')),false,'A delay cannot extend the 24-hour article lifetime');
console.log('PASS: Shorts verifies original article metadata/JSON-LD at its future slot; radar timestamps cannot override it. No upload or publication.');
