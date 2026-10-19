// Shared evidence rules; queues, approval and delivery remain channel-owned.
export const PHOTO_FIELDS='id,article_url,headline,approval_status,photo_matches_event,rights_verified,social_use_allowed,adaptation_allowed,commercial_use_allowed,license_kind,license_version,evidence_url,evidence_description,reviewed_at,reviewer,copyright_owner,credit_line,photographer,original_image_url,storage_path,valid_until';
export function registryReady(a:any,now=Date.now()):boolean {
 const path=String(a?.storage_path||'');
 return !!a&&a.approval_status==='approved'&&a.photo_matches_event===true&&a.rights_verified===true&&
  a.social_use_allowed===true&&a.adaptation_allowed===true&&a.commercial_use_allowed===true&&
  ['cc0','cc_by','permission_written','owned'].includes(String(a.license_kind||''))&&
  !!a.evidence_url&&String(a.evidence_description||'').length>=12&&!!a.reviewed_at&&!!a.reviewer&&
  !!a.copyright_owner&&!!a.credit_line&&/^approved\/[a-zA-Z0-9_./-]+\.(?:jpg|jpeg|png|webp)$/.test(path)&&
  !path.split('/').some(s=>!s||s==='.'||s==='..')&&
  (!a.valid_until||Date.parse(String(a.valid_until))>now);
}
export const registryCredit=(a:any)=>('registered_event_'+String(a.id)+' — '+String(a.credit_line||'')).slice(0,445);
export async function approvedRegistryPhoto(db:any,url:string,article:string,headline:string){
 const result=await db.from('giro_imagens_autorizadas').select(PHOTO_FIELDS)
  .eq('article_url',article).eq('headline',headline).eq('approval_status','approved')
  .order('reviewed_at',{ascending:false}).limit(5);
 if(result.error)throw Error('photo_registry_lookup_failed');
 for(const row of result.data||[]){
  if(!registryReady(row))continue;
  const signed=await db.storage.from('giro-imagens-autorizadas').createSignedUrl(row.storage_path,1800);
  if(signed.error||!signed.data?.signedUrl)continue;
  const image=new URL(signed.data.signedUrl,url);
  if(image.origin!==new URL(url).origin||!image.pathname.startsWith('/storage/v1/object/sign/giro-imagens-autorizadas/approved/'))continue;
  return {record:row,id:row.id,article_url:article,headline,image_url:image.toString(),image_credit:registryCredit(row)};
 }
 return null;
}
export async function discoverPhotoCandidate(db:any,article:string,headline:string,image:string,description=''){
 try{
  const page=new URL(article),photo=new URL(image);
  if(page.protocol!=='https:'||photo.protocol!=='https:'||headline.trim().length<15)return false;
  const result=await db.from('giro_imagens_autorizadas').upsert({
   source_platform:page.hostname.endsWith('.gov.br')?'orgao_oficial':'site',
   discovery_url:article,original_image_url:image,article_url:article,headline,
   event_description:description.slice(0,1000)||null,
   notes:'Candidata encontrada na reportagem; correspondência visual e permissão individual ainda não aprovadas.'
  },{onConflict:'article_url,headline,original_image_url',ignoreDuplicates:true});
  if(result.error)throw Error('photo_candidate_save_failed');
  return true;
 }catch{return false;}
}
export async function registeredCreditVerified(db:any,credit:string,article:string,headline:string){
 const match=String(credit).match(/^registered_event_([0-9]+) — /);
 if(!match)return false;
 const id=Number(match[1]);if(!Number.isSafeInteger(id)||id<1)return false;
 const found=await db.from('giro_imagens_autorizadas').select(PHOTO_FIELDS)
  .eq('id',id).eq('article_url',article).eq('headline',headline).maybeSingle();
 return !found.error&&registryReady(found.data)&&registryCredit(found.data)===credit;
}

/** Search approved source catalogues for closely matching photo candidates.
 * Search never grants image rights or visual approval; those remain file-level.
 */
export function sourceHeadlineMatches(headline:string,candidate:string):boolean{
 const words=(s:string)=>new Set((s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]{4,}/g)||[])
  .filter(w=>!['para','sobre','apos','pela','pelo','entre','noticia','noticias','foto','fotos','brasil'].includes(w)));
 const a=words(headline),b=words(candidate);
 const matches=[...a].filter(w=>b.has(w)).length;
 const numbers=headline.match(/\b\d+\b/g)||[];
 return a.size>=3&&matches>=3&&matches/a.size>=0.45&&numbers.every(n=>new RegExp('\\b'+n+'\\b').test(candidate));
}
export async function searchRegisteredPhotoSources(db:any,article:string,headline:string,parse:any,request:typeof fetch=fetch){
 const result={searched:0,candidates:0,errors:[] as string[]};
 const configured=await db.from('giro_pesquisa_fontes_imagens').select('note,active').eq('platform','orgao_oficial').maybeSingle();
 if(configured.error||!configured.data?.active)return result;
 let catalog:any;try{catalog=JSON.parse(configured.data.note)}catch{return result;}
 const definitions=[
  {home:'https://agenciabrasil.ebc.com.br/fotos',host:'agenciabrasil.ebc.com.br',index:'https://agenciabrasil.ebc.com.br/ultimas',path:/\/(?:[^/]+\/noticia\/|foto\/|fotos\/)/},
  {home:'https://www.camara.leg.br/banco-imagens/',host:'www.camara.leg.br',index:'https://www.camara.leg.br/busca-portal?contextoBusca=BuscaNoticia&termo='+encodeURIComponent(headline),path:/\/noticias\/\d/},
  {home:'https://www12.senado.leg.br/fotos',host:'www12.senado.leg.br',index:'https://www12.senado.leg.br/noticias/busca?SearchableText='+encodeURIComponent(headline),path:/\/noticias\/materias\/\d{4}/},
  {home:'https://rondonia.ro.gov.br/portal/',host:'rondonia.ro.gov.br',index:'https://rondonia.ro.gov.br/portal/?s='+encodeURIComponent(headline.split(/\s+/).slice(0,5).join(' '))+'&e=portal',path:/^\/(?!portal|wp-|tag|category)[a-z0-9-]{15,}\/?$/},
  {home:'https://www.portovelho.ro.gov.br/galerias',host:'www.portovelho.ro.gov.br',index:'https://www.portovelho.ro.gov.br/busca?busca='+encodeURIComponent(headline.split(/\s+/).slice(0,5).join(' ')),path:/\/artigo\/\d+/},
  {home:'https://www.al.ro.leg.br/',host:'www.al.ro.leg.br',index:'https://www.al.ro.leg.br/noticias/?q='+encodeURIComponent(headline.split(/\s+/).slice(0,5).join(' ')),path:/\/noticias\/[^/?]{10,}/}
 ];

 // Public HTML discovery adapters. These inspect public source pages, not whole archives.
 const extraHomes=["https://www.fotospublicas.com/","https://www.cnj.jus.br/agencia-cnj/banco-de-imagens/","https://www.al.sp.gov.br/alesp/banco-imagens/","https://www.cbm.ro.gov.br/","https://www.tre-ro.jus.br/","https://fieam.org.br/","https://www.defesacivil.sp.gov.br/sec_defesa_civil","https://agenciadenoticias.ibge.gov.br/agencia-banco-de-midia","https://www.embrapa.br/","https://www.gov.br/prf/pt-br/imagens","https://www.gov.br/pf/pt-br/assuntos/noticias","https://www.noaa.gov/","https://www.usgs.gov/","https://www.agenciaminas.mg.gov.br/","https://www.agenciapara.com.br/","https://www.agenciaamazonas.am.gov.br/","https://agencia.ac.gov.br/","https://www.aen.pr.gov.br/aen","https://bancodeimagens.iphan.gov.br/"];
 for(const home of extraHomes){
  const u=new URL(home);
  definitions.push({home,host:u.hostname,index:home,path:/^\/(?!.*(?:login|signin|account|privacidade|contato|termos|search|busca))[^?#]{15,}$/i});
 }
 const available=definitions.filter(d=>catalog.sources?.some((s:any)=>s.home===d.home));
 // Rotate bounded batches hourly; always prioritize the original publisher.
 const hour=Math.floor(Date.now()/3600000);
 const offset=available.length?(hour*8)%available.length:0;
 const rotated=[...available.slice(offset),...available.slice(0,offset)];
 let originalHost='';try{originalHost=new URL(article).hostname}catch{}
 rotated.sort((a,b)=>Number(b.host===originalHost)-Number(a.host===originalHost));
 const selected=rotated.slice(0,8);
 Object.assign(result,{eligible_sources:available.length,deferred_sources:Math.max(0,available.length-selected.length),
  batch_hour:hour,provider_results:[] as any[]});
 async function page(url:string,host:string){
  const r=await request(url,{signal:AbortSignal.timeout(6500),redirect:'error',headers:{'User-Agent':'GiroMadeiraBot/3.2 (editorial photo discovery)'}});
  if(!r.ok)throw Error('http_'+r.status);
  if(r.url&&new URL(r.url).hostname!==host)throw Error('unexpected_host');
  if(!String(r.headers.get('content-type')).includes('text/html'))throw Error('unexpected_content_type');
  const html=await r.text();if(html.length>2000000)throw Error('page_too_large');
  return parse(html);
 }
 await Promise.all(selected.map(async def=>{
  const source=catalog.sources?.find((s:any)=>s.home===def.home);if(!source)return;
  result.searched++;
  let found=0;
  try{
   const $=await page(def.index,def.host),links=new Map<string,string>();
   // The original report itself is the strongest discovery lead when hosted by this provider.
   try{const original=new URL(article);if(original.hostname===def.host&&def.path.test(original.pathname))links.set(article,headline);}catch{}
   $('a[href]').each((_:any,el:any)=>{
    const a=$(el),label=String(a.attr('title')||a.text()||'').replace(/\s+/g,' ').trim();
    if(!sourceHeadlineMatches(headline,label))return;
    try{const u=new URL(a.attr('href'),def.index);
     if(u.protocol==='https:'&&u.hostname===def.host&&def.path.test(u.pathname)){u.hash='';links.set(u.toString(),label);}
    }catch{}
   });
   // One best candidate per provider keeps the scheduled request bounded.
   for(const [url,label] of [...links].slice(0,1)){
    const doc=await page(url,def.host);
    const title=String(doc('meta[property="og:title"]').attr('content')||doc('h1').first().text()||label);
    if(!sourceHeadlineMatches(headline,title))continue;
    const raw=doc('meta[property="og:image"]').attr('content');
    if(!raw)continue;
    const image=new URL(raw,url);
    if(image.protocol!=='https:'||/logo|placeholder|favicon|sem-foto/i.test(image.pathname))continue;
    const credit=String(doc('figcaption').text()||doc('.foto-legenda').text()||doc('meta[property="og:image:alt"]').attr('content')||'').replace(/\s+/g,' ').slice(0,1200);
    const saved=await db.from('giro_imagens_autorizadas').upsert({
     source_platform:'orgao_oficial',discovery_url:url,original_image_url:image.toString(),
     article_url:article,headline,event_description:credit||title,
     notes:JSON.stringify({discovery:'registered_source_search_v1',source:source.name,source_article:url,terms:source.terms,required_credit:source.credit,conditions:source.conditions,
      review_required:'Confirmar mesma pessoa/ocorrência, data, crédito, licença individual e autorização de adaptação. Busca textual não comprova pertinência nem aprova publicação.'})
    },{onConflict:'article_url,headline,original_image_url',ignoreDuplicates:true});
    if(saved.error)throw Error('candidate_save_failed');
    result.candidates++;found++;
   }
   (result as any).provider_results.push({source:source.name,status:found?'candidate_found':'no_match',candidates:found});
  }catch(e){const error=e instanceof Error?e.message:'search_failed';result.errors.push(def.host+':'+error);
   (result as any).provider_results.push({source:source.name,status:'unavailable',error});}
 }));
 return result;
}
