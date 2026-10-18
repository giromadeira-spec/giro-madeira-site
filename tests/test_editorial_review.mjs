import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';import vm from 'node:vm';
import {registryReady,registryCredit,discoverPhotoCandidate,approvedRegistryPhoto} from '../supabase/functions/_shared/photo-registry.ts';
const record={id:8,article_url:'https://news.test/event',headline:'Polícia apreende drogas durante operação em Porto Velho',approval_status:'approved',photo_matches_event:true,rights_verified:true,social_use_allowed:true,adaptation_allowed:true,commercial_use_allowed:true,license_kind:'cc_by',evidence_url:'https://rights.test/license',evidence_description:'Explicit per-image license and event provenance',reviewed_at:'2026-10-18T12:00:00Z',reviewer:'editor',copyright_owner:'owner',credit_line:'Photographer / owner',storage_path:'approved/event-8.jpg'};
assert.ok(registryReady(record));
for(const change of [{rights_verified:false},{approval_status:'pending'},{storage_path:'approved/../other.jpg'},{valid_until:'2020-01-01'},{photo_matches_event:false}])assert.equal(registryReady({...record,...change}),false);
let inserted,opts;
await discoverPhotoCandidate({from:()=>({upsert:async(row,options)=>{inserted=row;opts=options;return {error:null}}})},record.article_url,record.headline,'https://photo.test/real.jpg');
assert.ok(opts.ignoreDuplicates);assert.ok(!('approval_status' in inserted));assert.ok(!('rights_verified' in inserted));
let filters=[];const query={select(){return query},eq(k,v){filters.push([k,v]);return query},order(){return query},limit:async()=>({data:[record],error:null})};
let approved=await approvedRegistryPhoto({from:()=>query,storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://supa.test/storage/v1/object/sign/giro-imagens-autorizadas/approved/event-8.jpg?token=test'},error:null})})}},'https://supa.test',record.article_url,record.headline);
assert.equal(approved.id,8);assert.equal(approved.image_credit,registryCredit(record));assert.ok(filters.some(([k,v])=>k==='article_url'&&v===record.article_url));assert.ok(filters.some(([k,v])=>k==='headline'&&v===record.headline));
function extract(path,tail){const s=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').split(tail)[0];return stripTypeScriptTypes(s)}
for(const channel of ['giro-shorts-preparar-storyboard','giro-tiktok-preparar-storyboard']){
 const context={console,Date,URL};vm.createContext(context);vm.runInContext(extract('../supabase/functions/'+channel+'/index.ts','Deno.serve'),context);
 context.title='Israel restringe a busca por desaparecidos na Faixa de Gaza';context.summary='';context.caption='Entre elas estavam sua mãe idosa, dois irmãos e uma irmã.\nEle afirma que quase todos os familiares continuam desaparecidos.\nEsse número ainda pode aumentar significativamente.';
 const scenes=vm.runInContext('meaningfulSegments(title,summary,caption,"source")',context);
 assert.equal(scenes,null,'Detached references cannot fill a news video');
}
const source=readFileSync(new URL('../supabase/functions/gerar-arte-noticia-vault/index.ts',import.meta.url),'utf8');
const fallback=source.slice(source.indexOf('function factualFallback'),source.indexOf('async function writeOriginalSummary'));
const ctx={clean:v=>String(v||'').replace(/\s+/g,' ').trim()};vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(fallback),ctx);
ctx.title='Polícia Civil cumpre mandados em operação';ctx.desc='Trecho interrompido expedido pel';ctx.article='A Polícia Civil cumpriu mandados de busca e apreensão em endereços investigados durante a operação realizada na cidade. As equipes localizaram substâncias entorpecentes e materiais usados para acondicionar drogas nos imóveis vistoriados. Os objetos apreendidos foram encaminhados à unidade policial responsável pela investigação dos fatos.';
const result=vm.runInContext('factualFallback(title,desc,article)',ctx);assert.ok(!result.includes('expedido pel'));assert.match(result,/[.!?]$/);assert.ok(result.length>=250);
console.log('PASS: registry evidence, exact story matching, pending-only discovery, contextual scenes and complete captions');
