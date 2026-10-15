import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import vm from "node:vm";
const source=readFileSync(new URL("../scripts/buffer/giro-buffer-tiktok-worker.ts",import.meta.url),"utf8");
const script=stripTypeScriptTypes(source.replace(/^import[^\n]+\n/,""),{mode:"strip"});
let handler,mutations=[],queries=[],sourcePlatform="tiktok",remotePosts=[],state="uncertain",remoteId=null;
const job={id:16,source_queue_id:207,created_at:"2026-10-15T02:00:02.359Z",
 caption:"Ataques russos deixam mais de 600 mil pessoas sem energia na Ucrânia. Fonte: https://cnnbrasil.com.br/internacional/noticia #GiroMadeira",last_error:"TimeoutError"};
function chain(table){
 let filters=[],update=null;
 const api={select(){return api},eq(k,v){filters.push([k,v]);return api},is(k,v){filters.push([k,v]);return api},
 neq(k,v){filters.push([k,v,"neq"]);return api},gte(){return api},lt(){return api},order(){return api},not(){return api},limit(){return api},
 update(value){update=value;return api},single(){return Promise.resolve(result(true))},maybeSingle(){return Promise.resolve(result(true))},
 then(resolve,reject){return Promise.resolve(result(false)).then(resolve,reject)}};
 function result(single){
  if(table==="giro_buffer_tiktok_settings")return {data:{organization_id:"org",channel_id:"channel",channel_name:"giro_madeira"},error:null};
  if(table==="giro_social_video_queue")return {data:sourcePlatform==="tiktok"?{id:207}:null,error:null};
  if(update){
   assert.equal(table,"giro_buffer_tiktok_jobs");
   assert.ok(filters.some(([k,v])=>k==="status"&&v==="uncertain"));
   assert.ok(filters.some(([k,v])=>k==="source_queue_id"&&v===207));
   mutations.push(update);state=update.status;remoteId=update.buffer_post_id;
   return {data:{id:16},error:null};
  }
  if(filters.some(([k,v])=>k==="status"&&v==="uncertain"))return {data:state==="uncertain"?[job]:[],error:null};
  return {data:[],error:null};
 }
 return api;
}
const context=vm.createContext({URL,Date,Response,JSON,AbortSignal,console,
 Deno:{env:{get:()=> "configured-test-value"},serve(fn){handler=fn}},
 createClient:()=>({from:chain,rpc:async()=>({data:true,error:null})}),
 fetch:async(url,init)=>{
  const body=JSON.parse(init.body);assert.match(body.query,/^query\{/);
  assert.doesNotMatch(body.query,/mutation|createPost|deletePost/);
  queries.push(body.query);
  return Response.json({data:{posts:{edges:remotePosts.map(node=>({node})),pageInfo:{hasNextPage:false}}}});
 }});
vm.runInContext(script,context);
const post={id:"existing-post",channelId:"channel",createdAt:"2026-10-15T02:00:04Z",text:job.caption,
 status:"sent",schedulingType:"automatic",externalLink:"https://tiktok.com/@giro_madeira/video/12345",
 sentAt:"2026-10-15T02:01:30Z",assets:[{mimeType:"video/mp4"}]};
context.job=job;context.post=post;
assert.equal(vm.runInContext("matchUncertainPost(job,[post],'channel').id",context),"existing-post");
for(const changed of [
 {channelId:"other"},{text:"different caption"},{createdAt:"2026-10-14T20:00:00Z"},{assets:[]},{id:null}
]){
 context.bad={...post,...changed};
 assert.equal(vm.runInContext("matchUncertainPost(job,[bad],'channel')",context),null);
}
assert.equal(vm.runInContext("matchUncertainPost(job,[post,{...post,id:'duplicate'}],'channel')",context),null);
assert.equal(vm.runInContext("recoveredPostState(post)",context),"sent");
for(const changed of [
 {externalLink:"https://tiktok.com/@other/video/12345"},{externalLink:"https://tiktok.com.evil/video/12345"},
 {sentAt:null},{schedulingType:"notification"},{status:"error"}
]){
 context.bad={...post,...changed};
 assert.equal(vm.runInContext("recoveredPostState(bad)",context),"review_required");
}
async function reconcile(posts,platform="tiktok"){
 mutations=[];queries=[];state="uncertain";remoteId=null;sourcePlatform=platform;remotePosts=posts;
 const response=await handler(new Request("https://local.test",{method:"POST",
  headers:{"x-giro-db-key":"offline-test-dispatch-key"},body:JSON.stringify({action:"reconcile"})}));
 assert.equal(response.status,200);return response.json();
}
let result=await reconcile([post]);
assert.equal(result.no_new_posts,true);assert.equal(result.reconciliation.changed,1);
assert.equal(mutations.length,1);assert.equal(state,"sent");assert.equal(remoteId,"existing-post");
assert.equal(mutations[0].sent_at,post.sentAt);
await reconcile([{...post,status:"scheduled",sentAt:null,externalLink:null}]);
assert.equal(state,"queued");assert.equal(mutations.length,1);
await reconcile([post,{...post,id:"ambiguous"}]);
assert.equal(state,"uncertain");assert.equal(mutations.length,0);
await reconcile([]);
assert.equal(state,"uncertain");assert.equal(mutations.length,0);
await reconcile([post],"youtube_shorts");
assert.equal(state,"uncertain");assert.equal(mutations.length,0);assert.equal(queries.length,0);
console.log("PASS: unique existing-post recovery, exact identity, link/sent_at gates, ambiguity, no retry/publication, legacy YouTube isolation");
