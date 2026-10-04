import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const SUPABASE_URL = 'https://dsihvbdhocbqscaypraw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kPstEJdIxLedMPWhph3SyA_mhLmx9EK';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const loginPanel = $('login-panel');
const editorPanel = $('editor-panel');
const loginStatus = $('login-status');
const formStatus = $('form-status');
let currentUser = null;

function slugify(text){
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,120);
}
function setStatus(el,msg,type=''){el.textContent=msg;el.className=`status ${type}`.trim()}
function paragraphs(){return $('body').value.split(/\n\s*\n/).map(v=>v.trim()).filter(Boolean)}
function isEditor(user){return user?.app_metadata?.role === 'editor'}

async function showSession(){
  const { data:{ user } } = await supabase.auth.getUser();
  currentUser = user || null;
  if(currentUser && isEditor(currentUser)){
    loginPanel.classList.add('hidden');editorPanel.classList.remove('hidden');loadRecent();
  }else{
    if(currentUser && !isEditor(currentUser)) setStatus(loginStatus,'Este usuário ainda não tem permissão de editor.','error');
    loginPanel.classList.remove('hidden');editorPanel.classList.add('hidden');
  }
}

$('login-form').addEventListener('submit',async e=>{
  e.preventDefault();setStatus(loginStatus,'Entrando...');
  const { data,error } = await supabase.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});
  if(error){setStatus(loginStatus,'Não foi possível entrar. Confira e-mail e senha.','error');return}
  if(!isEditor(data.user)){setStatus(loginStatus,'Acesso autenticado, mas sem permissão de editor.','error');await supabase.auth.signOut();return}
  setStatus(loginStatus,'');await showSession();
});

$('logout').addEventListener('click',async()=>{await supabase.auth.signOut();currentUser=null;await showSession()});

async function uploadImage(){
  const file=$('image-file').files[0];
  if(!file) return $('image-url').value.trim() || null;
  if(file.size > 6*1024*1024) throw new Error('A imagem deve ter no máximo 6 MB neste painel.');
  if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) throw new Error('Formato de imagem não permitido.');
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
  const path=`${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error }=await supabase.storage.from('news-images').upload(path,file,{contentType:file.type,cacheControl:'31536000',upsert:false});
  if(error) throw error;
  const { data }=supabase.storage.from('news-images').getPublicUrl(path);
  return data.publicUrl;
}

async function save(status){
  if(!currentUser || !isEditor(currentUser)) throw new Error('Sessão de editor inválida.');
  const title=$('title').value.trim(), summary=$('summary').value.trim(), sourceName=$('source-name').value.trim(), sourceUrl=$('source-url').value.trim();
  if(!title || !summary || !sourceName || !sourceUrl || !paragraphs().length) throw new Error('Preencha título, resumo, texto e fonte.');
  setStatus(formStatus,status==='published'?'Enviando imagem e publicando...':'Salvando rascunho...');
  const imageUrl=await uploadImage();
  const base=slugify(title)||`materia-${Date.now()}`;
  const slug=`${base}-${Date.now().toString().slice(-6)}`;
  const payload={slug,category:$('category').value,kicker:$('kicker').value.trim()||$('category').value,title,summary,body:paragraphs(),image_url:imageUrl,image_credit:$('image-credit').value.trim()||'Giro Madeira',source_name:sourceName,source_url:sourceUrl,status,published_at:status==='published'?new Date().toISOString():null,created_by:currentUser.id};
  const { error }=await supabase.from('news').insert(payload);
  if(error) throw error;
  setStatus(formStatus,status==='published'?'Matéria publicada. Ela já pode aparecer no Giro Madeira sem novo deploy.':'Rascunho salvo.','ok');
  $('news-form').reset();await loadRecent();
}

$('news-form').addEventListener('submit',async e=>{e.preventDefault();const b=$('publish');b.disabled=true;try{await save('published')}catch(err){setStatus(formStatus,err.message||'Erro ao publicar.','error')}finally{b.disabled=false}});
$('save-draft').addEventListener('click',async()=>{const b=$('save-draft');b.disabled=true;try{await save('draft')}catch(err){setStatus(formStatus,err.message||'Erro ao salvar.','error')}finally{b.disabled=false}});

async function loadRecent(){
  if(!currentUser) return;
  const { data,error }=await supabase.from('news').select('title,status,published_at,created_at').eq('created_by',currentUser.id).order('created_at',{ascending:false}).limit(20);
  const box=$('recent-list');
  if(error){box.textContent='Não foi possível carregar as matérias.';return}
  box.innerHTML=(data||[]).map(n=>`<div class="news-row"><div><strong>${escapeHtml(n.title)}</strong><span>${new Date(n.published_at||n.created_at).toLocaleString('pt-BR',{timeZone:'America/Porto_Velho'})}</span></div><span class="pill ${n.status}">${n.status==='published'?'PUBLICADA':'RASCUNHO'}</span></div>`).join('')||'<p>Nenhuma matéria cadastrada ainda.</p>';
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
$('refresh-list').addEventListener('click',loadRecent);
showSession();
