import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';import vm from 'node:vm';
const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/giro-youtube-upload-auto/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
let handler,updates=[],requests=[],privacy='public',rows=[{id:123,provider_post_id:'abcdefghijk'}];
function from(table){let patch=null,filters=[];const api={select(){return api},eq(k,v){filters.push([k,v]);return api},not(){return api},or(){return api},order(){return api},limit(){return api},update(p){patch=p;return api},maybeSingle(){return Promise.resolve(result())},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};
function result(){if(table==='giro_youtube_oauth_connection')return {data:{granted_scopes:'youtube.upload youtube.readonly',refresh_token_nonce:'YQ==',refresh_token_ciphertext:'YQ=='},error:null};assert.equal(table,'giro_social_video_queue');assert.ok(filters.some(([k,v])=>k==='platform'&&v==='youtube_shorts'));if(patch){updates.push(patch);assert.ok(filters.some(([k,v])=>k==='provider_post_id'&&v==='abcdefghijk'));return {data:null,error:null}}return {data:rows,error:null}}
return api}
vm.runInNewContext(source,{URL,URLSearchParams,JSON,Response,Date,TextEncoder,TextDecoder,Uint8Array,atob,AbortSignal,console,
crypto:{subtle:{digest:async()=>new Uint8Array(32),importKey:async()=>({}),decrypt:async()=>new TextEncoder().encode('fake-refresh-token')}},
createClient:()=>({from,rpc:async()=>({data:true,error:null})}),Deno:{env:{get:()=> 'test-value'},serve(fn){handler=fn}},
fetch:async(url,opts)=>{requests.push({url,opts});assert.ok(!url.includes('/upload/'));if(url.includes('oauth2'))return Response.json({access_token:'fake-access'});assert.ok(!opts.method||opts.method==='GET');if(url.includes('/channels?'))return Response.json({items:[{id:'UCvzAtpCtcIef5Tfw31RcknQ'}]});return Response.json({items:[{id:'abcdefghijk',snippet:{channelId:'UCvzAtpCtcIef5Tfw31RcknQ'},status:{privacyStatus:privacy}}]})}});
async function run(body={action:'reconcile'}){return handler(new Request('https://test.local',{method:'POST',headers:{'x-giro-db-key':'test-dispatch'},body:JSON.stringify(body)}))}
let r=await run();assert.equal(r.status,200);assert.equal((await r.json()).confirmed_public,1);assert.equal(updates.length,1);assert.equal(updates[0].provider_privacy_status,'public');assert.ok(!('updated_at' in updates[0]));assert.ok(!('status' in updates[0]));
privacy='unknown';updates=[];await run();assert.equal(updates.length,0);
requests=[];rows=[];await run();assert.equal(requests.length,0);
console.log('PASS: reconcile existing YouTube IDs only; no upload, no cadence timestamp change, unknown remains unconfirmed');
