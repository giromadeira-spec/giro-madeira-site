import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {searchRegisteredPhotoSources,sourceHeadlineMatches,registryReady} from '../supabase/functions/_shared/photo-registry.ts';
// Set GIRO_TEST_DEPENDENCIES to a package.json beside an installed cheerio, if external.
const require=createRequire(process.env.GIRO_TEST_DEPENDENCIES||import.meta.url);
const {load}=require('cheerio');
const headline='Senado aprova projeto de proteção das crianças';
assert.equal(sourceHeadlineMatches(headline,'Senado aprova projeto de proteção das crianças'),true);
assert.equal(sourceHeadlineMatches(headline,'Empresário morre em queda de avião'),false);
assert.equal(sourceHeadlineMatches('Governo Lula envia comboio ministerial ao Amazonas para conter incêndios criminosos e expõe falhas na resposta estadual','Governo envia comboio ao Amazonas para conter incêndios'),true);
assert.equal(sourceHeadlineMatches('Acidente deixa 12 mortos na rodovia federal','Acidente deixa 2 mortos na rodovia federal'),false);
const sources=[
 {home:'https://agenciabrasil.ebc.com.br/fotos',name:'Agência Brasil'},
 {home:'https://www.camara.leg.br/banco-imagens/',name:'Câmara'},
 {home:'https://www12.senado.leg.br/fotos',name:'Senado'}
].map(s=>({...s,terms:s.home,credit:'Fotógrafo/fonte',conditions:'Conferir arquivo'}));
let rows=[],calls=0,active=true;
const db={from(table){return table==='giro_pesquisa_fontes_imagens'?{select(){return this},eq(){return this},async maybeSingle(){return {data:{active,note:JSON.stringify({sources})}}}}:{async upsert(row){rows.push(row);return {error:null}}}}};
const request=async url=>{
 calls++;
 const u=new URL(url);
 const path=u.hostname.includes('agenciabrasil')?'/politica/noticia/2026-10/protecao':u.hostname.includes('camara')?'/noticias/123456-protecao':'/noticias/materias/2026/10/19/protecao';
 const html=u.pathname===path?`<h1>${headline}</h1><meta property="og:image" content="https://example.org/foto.jpg"><figcaption>Foto de agência parceira — direitos reservados</figcaption>`:`<a href="${path}">${headline}</a><a href="https://evil.example/noticias/123">${headline}</a>`;
 return new Response(html,{headers:{'content-type':'text/html'}});
};
let result=await searchRegisteredPhotoSources(db,'https://portal.example/pauta',headline,load,request);
assert.equal(result.searched,3);assert.equal(result.candidates,3);assert.equal(calls,6);
assert.equal(rows.length,3);
for(const row of rows){assert.equal(registryReady(row),false);assert.equal(row.rights_verified,undefined);assert.equal(row.approval_status,undefined);assert.match(row.event_description,/direitos reservados/);}
active=false;calls=0;result=await searchRegisteredPhotoSources(db,'https://portal.example/pauta',headline,load,request);assert.equal(calls,0);
active=true;result=await searchRegisteredPhotoSources(db,'https://portal.example/pauta',headline,load,async()=>new Response('',{status:503}));assert.equal(result.errors.length,3);assert.equal(result.candidates,0);
console.log('PASS: three registered providers searched; unrelated/outside links rejected; reserved-rights candidates remain unapproved; inactive and unavailable providers handled.');
