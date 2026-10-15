import assert from 'node:assert/strict';
import {eligible,geographicScope,comparePriority} from '../supabase/functions/giro-tiktok-editorial-queue/editorial-policy.ts';
const now=Date.now();
const fresh={score:36,source_published_at:new Date(now).toISOString(),fonte_url:'https://example.com/noticia'};
const brazil={...fresh,titulo:'Banco Central reduz Selic após decisão nacional',fonte_nome:'News Rondônia'};
const world={...fresh,titulo:'Terremoto deixa 50 mortos no Nepal',fonte_url:'https://cnn.com.br/internacional/terremoto'};
const ro={...fresh,score:99,titulo:'Rondônia decreta calamidade por enchente'};
assert.equal(geographicScope(brazil),'brasil');
assert.equal(geographicScope({...fresh,titulo:'Naufrágio deixa 139 mortos na África Oriental',fonte_nome:'News Rondônia'}),'mundo');
assert.deepEqual([ro,world,brazil].sort(comparePriority),[brazil,world,ro]);
for(const story of [brazil,world])assert.ok(eligible(story));
assert.equal(eligible(ro),false, 'Rondônia-local content must never reach TikTok');
for(const titulo of ['Cabo é preso após agredir companheira em Porto Velho','Feriado tem sol entre nuvens em Rondônia','Prefeitura prepara festa com shows e Carreta Furacão','Lula diz que pode reduzir impostos nacionais','TSE derruba suspensão do canal Exército do Lula'])
 assert.equal(eligible({...fresh,score:100,urgente:true,titulo,fonte_nome:'News Rondônia'}),false,titulo);
assert.equal(geographicScope({...fresh,titulo:'PF prende suspeitos em Porto Velho, Rondônia',fonte_nome:'Polícia Federal',fonte_url:'https://www.gov.br/pf/operacao'}),'rondonia');
assert.equal(eligible({...fresh,titulo:'PF investiga crimes em Porto Velho com seis presos',fonte_nome:'Polícia Federal',urgente:true,score:100}),false);
assert.equal(geographicScope({...fresh,titulo:'Acidente de trânsito deixa 8 feridos em São Paulo',fonte_nome:'Portal local'}),null,'Other-state local news is not nationally relevant');
assert.equal(geographicScope({...fresh,titulo:'PRF registra 68 mortes nas rodovias federais durante o feriado nacional',fonte_nome:'News Rondônia'}),'brasil');
assert.equal(geographicScope({...fresh,titulo:'Ataques russos deixam mais de 600 mil sem energia na Ucrânia',fonte_url:'https://cnnbrasil.com.br/internacional/ataques-russos'}),'mundo');
assert.equal(eligible({...world,source_published_at:null}),false);
assert.equal(eligible({...world,source_published_at:new Date(now-25*3600000).toISOString()}),false);
assert.equal(eligible({...world,source_published_at:new Date(now+3600000).toISOString()}),false);
console.log('TikTok editorial policy: priority, importance, recency and false-positive checks passed.');

const {articleIsFresh}=await import('../supabase/functions/giro-tiktok-preparar-storyboard/article-date.ts');
assert.equal(articleIsFresh(new Date(now-25*3600000).toISOString(),'https://site.com/2026/10/12/story',now),false);
assert.equal(articleIsFresh('', 'https://site.com/undated-news',now),false);
assert.equal(articleIsFresh(new Date(now).toISOString(),'https://site.com/undated-news',now),true);
console.log('Article-level dates prevent old or undated reports from being treated as current.');

const {sourceRecovery}=await import('../supabase/functions/giro-tiktok-preparar-storyboard/recovery-policy.ts');
assert.equal(sourceRecovery('source_http_429',0),'retry');
assert.equal(sourceRecovery('source_http_503',1),'retry');
assert.equal(sourceRecovery('source_http_429',2),'hold');
assert.equal(sourceRecovery('article_date_unverified_or_outdated',0),null);
assert.equal(sourceRecovery('source_http_401',0),null);
console.log('Transient source failures resume the same item with bounded retries; invalid facts remain blocked.');
