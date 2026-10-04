const API='/.netlify/functions/football';
const liveEl=document.getElementById('live-games');
const gamesEl=document.getElementById('today-games');
const newsEl=document.getElementById('football-news');
const checkEl=document.getElementById('football-last-check');
const LIVE_REFRESH=60000;
const IDLE_REFRESH=300000;
let refreshTimer=null,lastFetchAt=0,isLoading=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function clock(iso){try{return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Porto_Velho',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(iso))}catch{return '—'}}
function logo(src,name,kind='team'){const initial=esc((name||'⚽').trim().charAt(0).toUpperCase()||'⚽');if(!src)return `<span class="crest crest-${kind} crest-fallback" title="${esc(name||'Futebol')}"><span class="ball-fallback">⚽</span></span>`;return `<span class="crest crest-${kind}" title="${esc(name||'Escudo')}"><img src="${esc(src)}" alt="Escudo ${esc(name||'')}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><b>${initial}</b></span>`}
function leagueHead(g){return `<div class="league-head">${logo(g.competitionLogo,g.competition||'Futebol','league')}<div><div class="competition">${esc(g.competition||'Futebol')}</div></div></div>`}
function teamLine(team){return `<div class="team-line">${logo(team?.logo,team?.name||'Time')}<span>${esc(team?.name||'Time')}</span><strong>${esc(team?.score??'')}</strong></div>`}
function gameCard(g){if(!g.home||!g.away)return `<article class="game-card legacy-game">${leagueHead(g)}<div class="game-label">${esc(g.label)}</div><div class="game-status">${esc(g.status||'AO VIVO')}</div></article>`;return `<article class="game-card detailed-game">${leagueHead(g)}<div class="match-panel"><div class="teams-block">${teamLine(g.home)}${teamLine(g.away)}</div><div class="live-state"><i></i><strong>${esc(g.status||'AO VIVO')}</strong></div></div></article>`}
function gameRow(g){if(!g.home||!g.away)return `<article class="game-row ${g.live?'is-live':''}"><div>${leagueHead(g)}<div class="game-label">${esc(g.label)}</div></div><div class="game-status">${esc(g.status||'Detalhes')}</div></article>`;return `<article class="game-row detailed-row ${g.live?'is-live':''}"><div class="row-main">${leagueHead(g)}<div class="row-teams">${teamLine(g.home)}${teamLine(g.away)}</div></div><div class="game-status">${esc(g.status||'Detalhes')}</div></article>`}
function newsCard(n,i){return `<article class="football-news-card"><div class="source">FUTEBOL • DESTAQUE ${i+1}</div><h3>${esc(n.title)}</h3><span>Giro Madeira</span></article>`}
function schedule(ms){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>loadFootball(),ms)}
async function loadFootball(){
  if(isLoading)return;
  if(document.hidden){schedule(60000);return}
  isLoading=true;document.body.classList.add('football-refresh');
  try{
    const r=await fetch(API,{cache:'default'});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Falha na consulta');
    lastFetchAt=Date.now();checkEl.textContent=clock(d.checkedAt);
    liveEl.innerHTML=d.live?.length?d.live.map(gameCard).join(''):'<div class="empty-live">Nenhuma partida identificada ao vivo neste instante. A página atualiza em intervalos maiores enquanto não há jogo ao vivo.</div>';
    gamesEl.innerHTML=d.matches?.length?d.matches.map(gameRow).join(''):'<div class="empty-live">Nenhum jogo disponível agora.</div>';
    newsEl.innerHTML=d.news?.length?d.news.map(newsCard).join(''):'<div class="empty-live">Nenhuma manchete disponível agora.</div>';
    schedule(d.live?.length?LIVE_REFRESH:IDLE_REFRESH);
  }catch(e){
    const msg='<div class="error-box">Não foi possível atualizar os placares neste momento. Tentaremos novamente sem recarregar a página.</div>';
    liveEl.innerHTML=msg;gamesEl.innerHTML=msg;newsEl.innerHTML=msg;checkEl.textContent='fonte indisponível';schedule(IDLE_REFRESH);
  }finally{isLoading=false;document.body.classList.remove('football-refresh')}
}
loadFootball();
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastFetchAt>45000){clearTimeout(refreshTimer);loadFootball()}});