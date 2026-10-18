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
