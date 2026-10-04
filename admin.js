import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const SUPABASE_URL = 'https://dsihvbdhocbqscaypraw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kPstEJdIxLedMPWhph3SyA_mhLmx9EK';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const loginPanel = $('login-panel'), editorPanel = $('editor-panel');
const loginStatus = $('login-status'), formStatus = $('form-status');
let currentUser = null, currentRole = null, recentRows = [], editing = null;

function slugify(text){return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,120)}
function setStatus(el,msg,type=''){el.textContent=msg;el.className=`status ${type}`.trim()}
function paragraphs(){return $('body').value.split(/\n\s*\n/).map(v=>v.trim()).filter(Boolean)}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function isoFromLocal(v){return v?new Date(v).toISOString():null}
function localFromIso(v){if(!v)return '';const d=new Date(v);const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}

async function editorRole(user){
  if(!user) return null;
  const {data,error}=await supabase.from('editor_profiles').select('role').eq('user_id',user.id).maybeSingle();
  if(error) return null;
  return data?.role||null;
}
function canEdit(){return currentRole==='editor'||currentRole==='admin'}

async function showSession(){
  const {data:{user}}=await supabase.auth.getUser();
  currentUser=user||null; currentRole=await editorRole(currentUser);
  if(currentUser&&canEdit()){
    loginPanel.classList.add('hidden'); editorPanel.classList.remove('hidden'); setStatus(loginStatus,''); await loadRecent();
  }else{
    if(currentUser&&!canEdit()) setStatus(loginStatus,'Usuário autenticado, mas não autorizado para a redação.','error');
    loginPanel.classList.remove('hidden'); editorPanel.classList.add('hidden');
  }
}

$('login-form').addEventListener('submit',async e=>{
  e.preventDefault(); setStatus(loginStatus,'Entrando...');
  const {error}=await supabase.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});
  if(error){setStatus(loginStatus,'Não foi possível entrar. Confira e-mail e senha.','error');return}
  await showSession();
  if(!canEdit()){await supabase.auth.signOut();currentUser=null;currentRole=null}
});
$('logout').addEventListener('click',async()=>{await supabase.auth.signOut();currentUser=null;currentRole=null;resetForm();await showSession()});

async function uploadImage(){
  const file=$('image-file').files[0];
  if(!file) return $('image-url').value.trim() || editing?.image_url || null;
  if(file.size>6*1024*1024) throw new Error('A imagem deve ter no máximo 6 MB.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Use JPG, PNG ou WEBP.');
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
  const path=`${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const {error}=await supabase.storage.from('news-images').upload(path,file,{contentType:file.type,cacheControl:'31536000',upsert:false});
  if(error) throw error;
  return supabase.storage.from('news-images').getPublicUrl(path).data.publicUrl;
}

async function save(status){
  if(!currentUser||!canEdit()) throw new Error('Sessão de editor inválida.');
  const title=$('title').value.trim(), summary=$('summary').value.trim(), sourceName=$('source-name').value.trim(), sourceUrl=$('source-url').value.trim();
  if(!title||!summary||!sourceName||!sourceUrl||!paragraphs().length) throw new Error('Preencha título, resumo, texto e fonte.');
  setStatus(formStatus,status==='published'?'Preparando publicação...':'Salvando rascunho...');
  const imageUrl=await uploadImage();
  const chosen=$('publish-at').value;
  const publishedAt=status==='published'?(chosen?isoFromLocal(chosen):new Date().toISOString()):null;
  const expiresAt=isoFromLocal($('expires-at').value);
  const featured=$('featured-rank').value?Number($('featured-rank').value):null;
  const payload={
    category:$('category').value,kicker:$('kicker').value.trim()||$('category').value,title,summary,body:paragraphs(),
    image_url:imageUrl,image_credit:$('image-credit').value.trim()||'Giro Madeira',source_name:sourceName,source_url:sourceUrl,
    status,published_at:publishedAt,featured_rank:featured,is_breaking:$('is-breaking').checked,is_service:$('is-service').checked,
    expires_at:expiresAt
  };
  let error;
  if(editing){
    ({error}=await supabase.from('news').update(payload).eq('id',editing.id).eq('created_by',currentUser.id));
  }else{
    payload.slug=`${slugify(title)||'materia'}-${Date.now().toString().slice(-6)}`;
    payload.created_by=currentUser.id;
    ({error}=await supabase.from('news').insert(payload));
  }
  if(error) throw error;
  const future=publishedAt&&new Date(publishedAt)>new Date();
  setStatus(formStatus,status==='draft'?'Rascunho salvo.':future?'Matéria agendada. Ela entrará automaticamente no horário definido, sem deploy.':'Matéria publicada. Ela já pode aparecer no Giro Madeira sem novo deploy.','ok');
  resetForm(); await loadRecent();
}

$('news-form').addEventListener('submit',async e=>{e.preventDefault();const b=$('publish');b.disabled=true;try{await save('published')}catch(err){setStatus(formStatus,err.message||'Erro ao publicar.','error')}finally{b.disabled=false}});
$('save-draft').addEventListener('click',async()=>{const b=$('save-draft');b.disabled=true;try{await save('draft')}catch(err){setStatus(formStatus,err.message||'Erro ao salvar.','error')}finally{b.disabled=false}});
$('cancel-edit').addEventListener('click',()=>{resetForm();setStatus(formStatus,'Edição cancelada.')});

function resetForm(){
  editing=null;$('news-form').reset();$('edit-id').value='';$('form-heading').textContent='Nova matéria';$('cancel-edit').classList.add('hidden');$('publish').textContent='PUBLICAR / AGENDAR';
}
function beginEdit(id){
  const n=recentRows.find(x=>x.id===id); if(!n)return;
  editing=n;$('edit-id').value=n.id;$('title').value=n.title||'';$('category').value=n.category||'PORTO VELHO';$('kicker').value=n.kicker||'';$('summary').value=n.summary||'';$('body').value=(n.body||[]).join('\n\n');$('source-name').value=n.source_name||'';$('source-url').value=n.source_url||'';$('image-url').value=n.image_url||'';$('image-credit').value=n.image_credit||'';$('featured-rank').value=n.featured_rank??'';$('is-breaking').checked=!!n.is_breaking;$('is-service').checked=!!n.is_service;$('publish-at').value=localFromIso(n.published_at);$('expires-at').value=localFromIso(n.expires_at);
  $('form-heading').textContent='Editar matéria';$('cancel-edit').classList.remove('hidden');$('publish').textContent='SALVAR E PUBLICAR';window.scrollTo({top:0,behavior:'smooth'});
}

async function loadRecent(){
  if(!currentUser)return;
  const fields='id,slug,title,category,kicker,summary,body,image_url,image_credit,source_name,source_url,status,published_at,created_at,featured_rank,is_breaking,is_service,expires_at';
  const {data,error}=await supabase.from('news').select(fields).eq('created_by',currentUser.id).order('created_at',{ascending:false}).limit(50);
  const box=$('recent-list'); if(error){box.textContent='Não foi possível carregar as matérias.';return}
  recentRows=data||[];
  box.innerHTML=recentRows.map(n=>{
    const when=n.published_at||n.created_at, future=n.published_at&&new Date(n.published_at)>new Date();
    const label=n.status==='draft'?'RASCUNHO':future?'AGENDADA':'PUBLICADA';
    return `<div class="news-row"><div class="news-row-main"><strong>${esc(n.title)}</strong><span>${new Date(when).toLocaleString('pt-BR',{timeZone:'America/Porto_Velho'})}</span><div class="row-flags">${n.featured_rank?`<b>DESTAQUE ${n.featured_rank}</b>`:''}${n.is_breaking?'<b>URGENTE</b>':''}${n.is_service?'<b>SERVIÇO</b>':''}</div></div><div class="row-actions"><span class="pill ${n.status}">${label}</span><button class="ghost edit-btn" type="button" data-id="${n.id}">Editar</button>${n.status==='published'&&!future?`<a class="open-link" href="materia.html?id=${encodeURIComponent(n.slug)}" target="_blank">Abrir</a>`:''}</div></div>`;
  }).join('')||'<p>Nenhuma matéria cadastrada ainda.</p>';
  box.querySelectorAll('.edit-btn').forEach(b=>b.addEventListener('click',()=>beginEdit(b.dataset.id)));
}
$('refresh-list').addEventListener('click',loadRecent);
showSession();
