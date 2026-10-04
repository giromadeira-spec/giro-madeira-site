const cargos = {
  'governador': {title:'Governador', scope:'RONDÔNIA'},
  'senador': {title:'Senador', scope:'RONDÔNIA'},
  'deputado-federal': {title:'Deputado Federal', scope:'RONDÔNIA'},
  'deputado-estadual': {title:'Deputado Estadual', scope:'RONDÔNIA'},
  'presidente': {title:'Presidente', scope:'BRASIL'}
};

let cargoAtual = 'governador';
let timer = null;
const cache = new Map();

const $ = id => document.getElementById(id);
const fmtInt = value => Number(value || 0).toLocaleString('pt-BR');
const num = value => Number(String(value ?? 0).replace(',','.')) || 0;
const fmtPct = value => `${num(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;

function candidatosDoArquivo(data){
  const out = [];
  for(const cargo of (data.carg || [])){
    for(const agr of (cargo.agr || [])){
      for(const par of (agr.par || [])){
        for(const cand of (par.cand || [])){
          out.push({
            numero: cand.n,
            nome: cand.nmu || cand.nm || 'Candidato',
            partido: par.sg || '',
            votos: Number(cand.vap || 0),
            pct: num(cand.pvap),
            eleito: cand.e === 's',
            situacao: cand.st || ''
          });
        }
      }
    }
  }
  return out.sort((a,b)=>b.votos-a.votos || b.pct-a.pct);
}

function progresso(data){
  return num(data?.s?.pst);
}

function setProgressoRO(data){
  if(!data) return;
  const pct = progresso(data);
  $('overall-pct').textContent = fmtPct(pct);
  $('overall-bar').style.width = `${Math.min(100,pct)}%`;
  const st = Number(data?.s?.st || 0), ts = Number(data?.s?.ts || 0);
  $('overall-meta').textContent = `${fmtInt(st)} de ${fmtInt(ts)} seções totalizadas • atualização TSE ${data.dg || ''} ${data.hg ? 'às '+data.hg : ''}`;
}

function setStats(data){
  $('stats').hidden = false;
  $('stat-sections').textContent = `${fmtInt(data?.s?.st)} / ${fmtInt(data?.s?.ts)}`;
  $('stat-turnout').textContent = fmtInt(data?.e?.c);
  $('stat-abstention').textContent = fmtInt(data?.e?.a);
  $('stat-valid').textContent = fmtInt(data?.v?.vv);
  $('stat-blank').textContent = fmtInt(data?.v?.vb);
  $('stat-null').textContent = fmtInt(data?.v?.tvn);
}

function render(data){
  const cfg = cargos[cargoAtual];
  $('cargo-title').textContent = cfg.title;
  $('scope-label').textContent = cfg.scope;
  $('tse-time').textContent = `TSE: ${data.dg || '—'} ${data.hg ? 'às '+data.hg : ''}`;

  if(cargoAtual !== 'presidente') setProgressoRO(data);
  setStats(data);

  if(data.dv === 'n'){
    $('notice').className = 'notice';
    $('notice').textContent = 'A divulgação desta votação ainda não foi liberada pelo TSE.';
    $('candidates').innerHTML = '';
    return;
  }

  const lista = candidatosDoArquivo(data);
  if(!lista.length){
    $('notice').className = 'notice';
    $('notice').textContent = 'O arquivo oficial já está disponível, mas ainda não há votos computados para exibir.';
    $('candidates').innerHTML = '';
    return;
  }

  $('notice').className = 'notice ok';
  const limite = cargoAtual.startsWith('deputado-') ? 20 : 12;
  $('candidates').innerHTML = lista.slice(0,limite).map((c,i)=>`
    <div class="candidate">
      <div class="candidate-top">
        <div class="rank">${i+1}</div>
        <div>
          <div class="candidate-name">${escapeHtml(c.nome)}${c.eleito?'<span class="elected">ELEITO</span>':''}</div>
          <div class="candidate-meta">${escapeHtml(String(c.numero || ''))}${c.partido?' • '+escapeHtml(c.partido):''}${c.situacao?' • '+escapeHtml(c.situacao):''}</div>
        </div>
        <div class="candidate-score"><strong>${fmtPct(c.pct)}</strong><span>${fmtInt(c.votos)} votos</span></div>
      </div>
      <div class="candidate-bar"><span style="width:${Math.min(100,c.pct)}%"></span></div>
    </div>`).join('');
}

function escapeHtml(v){
  return String(v).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

async function carregar(cargo=cargoAtual, silencioso=false){
  cargoAtual = cargo;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.cargo===cargo));
  const cfg = cargos[cargo];
  $('cargo-title').textContent = cfg.title;
  $('scope-label').textContent = cfg.scope;
  if(!silencioso){
    $('notice').className = 'notice';
    $('notice').textContent = 'Buscando dados oficiais do TSE...';
  }
  try{
    const res = await fetch(`/.netlify/functions/tse?cargo=${encodeURIComponent(cargo)}&t=${Date.now()}`,{cache:'no-store'});
    const payload = await res.json();
    $('last-check').textContent = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    if(!res.ok || !payload.ok){
      throw new Error(payload.message || 'Dados ainda indisponíveis');
    }
    cache.set(cargo,payload.data);
    render(payload.data);
    if(cargo !== 'governador' && cache.has('governador')) setProgressoRO(cache.get('governador'));
  }catch(err){
    $('notice').className = 'notice error';
    $('notice').textContent = `${err.message}. A totalização oficial começa após o encerramento da votação; o painel continuará tentando automaticamente.`;
    if(cache.has(cargo)) render(cache.get(cargo));
  }
}

async function atualizarTudo(){
  await carregar(cargoAtual,true);
  if(cargoAtual !== 'governador'){
    try{
      const res = await fetch(`/.netlify/functions/tse?cargo=governador&t=${Date.now()}`,{cache:'no-store'});
      const payload = await res.json();
      if(res.ok && payload.ok){cache.set('governador',payload.data);setProgressoRO(payload.data);}
    }catch(_){ }
  }
}

document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>carregar(btn.dataset.cargo)));
carregar('governador');
timer = setInterval(atualizarTudo,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden) atualizarTudo();});
