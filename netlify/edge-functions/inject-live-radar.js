const RADAR_HTML = `
<section id="giro-live-radar" aria-label="Radar de notícias ao vivo">
  <style>
    #giro-live-radar{background:#071d3a;border-bottom:4px solid #f4c21d;color:#fff;font-family:Arial,sans-serif}
    #giro-live-radar .glr-wrap{max-width:1120px;margin:0 auto;padding:14px 16px 16px}
    #giro-live-radar .glr-head{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}
    #giro-live-radar .glr-live{display:inline-flex;align-items:center;gap:7px;background:#d71920;border-radius:4px;padding:5px 9px;font-size:12px;font-weight:800;letter-spacing:.04em}
    #giro-live-radar .glr-dot{width:7px;height:7px;border-radius:50%;background:#fff;animation:glrPulse 1.4s infinite}
    #giro-live-radar .glr-title{font-size:18px;font-weight:900}
    #giro-live-radar .glr-status{margin-left:auto;font-size:11px;opacity:.75}
    #giro-live-radar .glr-carousel{position:relative}
    #giro-live-radar .glr-list{display:flex;gap:10px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding:0 1px 5px;scrollbar-width:none}
    #giro-live-radar .glr-list::-webkit-scrollbar{display:none}
    #giro-live-radar .glr-item{font:inherit;text-align:left;padding:0;flex:0 0 270px;display:block;overflow:hidden;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:9px;color:#fff;scroll-snap-align:start;transition:transform .15s ease,background .15s ease;cursor:pointer}
    #giro-live-radar .glr-item:hover{background:rgba(255,255,255,.14);transform:translateY(-1px)}
    #giro-live-radar .glr-image-wrap{height:132px;background:#102d50;overflow:hidden;position:relative}
    #giro-live-radar .glr-image{width:100%;height:100%;display:block;object-fit:cover}
    #giro-live-radar .glr-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#071d3a,#154d78)}
    #giro-live-radar .glr-fallback img{width:72px;height:72px;object-fit:contain;border-radius:10px}
    #giro-live-radar .glr-content{padding:10px 11px 11px}
    #giro-live-radar .glr-text{display:block;font-size:13px;line-height:1.3;font-weight:800;min-height:50px}
    #giro-live-radar .glr-time{display:block;font-size:10px;opacity:.68;margin-top:7px}
    #giro-live-radar .glr-empty{font-size:12px;opacity:.75;padding:8px 0}
    #giro-live-radar .glr-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:3;width:34px;height:34px;border:0;border-radius:50%;background:#f4c21d;color:#071d3a;font-size:22px;font-weight:900;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}
    #giro-live-radar .glr-prev{left:-12px}#giro-live-radar .glr-next{right:-12px}
    #giro-live-radar .glr-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(1,12,28,.78);backdrop-filter:blur(4px)}
    #giro-live-radar .glr-modal.is-open{display:flex}
    #giro-live-radar .glr-modal-card{position:relative;width:min(680px,100%);max-height:88vh;overflow:auto;background:#fff;color:#071d3a;border-radius:14px;box-shadow:0 20px 70px rgba(0,0,0,.45)}
    #giro-live-radar .glr-modal-media{height:min(360px,42vh);background:#102d50;overflow:hidden}
    #giro-live-radar .glr-modal-media img{width:100%;height:100%;display:block;object-fit:cover}
    #giro-live-radar .glr-modal-body{padding:22px}
    #giro-live-radar .glr-modal-kicker{display:inline-block;background:#f4c21d;color:#071d3a;font-size:11px;font-weight:900;letter-spacing:.06em;padding:5px 8px;border-radius:4px;margin-bottom:10px}
    #giro-live-radar .glr-modal-title{font-size:27px;line-height:1.08;margin:0 0 12px;font-weight:900}
    #giro-live-radar .glr-modal-copy{font-size:15px;line-height:1.55;margin:0;color:#30445d}
    #giro-live-radar .glr-modal-meta{font-size:11px;color:#60738a;margin-top:14px}
    #giro-live-radar .glr-close{position:absolute;right:12px;top:12px;z-index:2;width:38px;height:38px;border:0;border-radius:50%;background:#071d3a;color:#fff;font-size:24px;line-height:1;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25)}
    @keyframes glrPulse{0%,100%{opacity:1}50%{opacity:.25}}
    @media(max-width:600px){#giro-live-radar .glr-item{flex-basis:235px}#giro-live-radar .glr-image-wrap{height:118px}#giro-live-radar .glr-status{margin-left:0;width:100%}#giro-live-radar .glr-arrow{display:none}#giro-live-radar .glr-modal-title{font-size:22px}#giro-live-radar .glr-modal-body{padding:18px}}
  </style>
  <div class="glr-wrap">
    <div class="glr-head">
      <span class="glr-live"><span class="glr-dot"></span> AO VIVO</span>
      <span class="glr-title">Radar Giro Madeira</span>
      <span class="glr-status" id="glr-status">Atualizando notícias...</span>
    </div>
    <div class="glr-carousel">
      <button class="glr-arrow glr-prev" id="glr-prev" aria-label="Notícias anteriores">‹</button>
      <div class="glr-list" id="glr-list"><span class="glr-empty">Buscando as últimas notícias...</span></div>
      <button class="glr-arrow glr-next" id="glr-next" aria-label="Próximas notícias">›</button>
    </div>
  </div>
  <div class="glr-modal" id="glr-modal" role="dialog" aria-modal="true" aria-labelledby="glr-modal-title">
    <div class="glr-modal-card">
      <button class="glr-close" id="glr-close" aria-label="Fechar">×</button>
      <div class="glr-modal-media" id="glr-modal-media"></div>
      <div class="glr-modal-body">
        <span class="glr-modal-kicker">RADAR GIRO MADEIRA</span>
        <h2 class="glr-modal-title" id="glr-modal-title"></h2>
        <p class="glr-modal-copy">O Giro Madeira está acompanhando esta informação. Assim que a apuração editorial estiver concluída, a cobertura completa entra no nosso próprio site.</p>
        <div class="glr-modal-meta" id="glr-modal-meta"></div>
      </div>
    </div>
  </div>
  <script>
  (()=>{
    const list=document.getElementById('glr-list');
    const status=document.getElementById('glr-status');
    const prev=document.getElementById('glr-prev');
    const next=document.getElementById('glr-next');
    const modal=document.getElementById('glr-modal');
    const modalTitle=document.getElementById('glr-modal-title');
    const modalMedia=document.getElementById('glr-modal-media');
    const modalMeta=document.getElementById('glr-modal-meta');
    const close=document.getElementById('glr-close');
    const formatTime=(value)=>{const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Porto_Velho'});};
    const openItem=(item)=>{
      modalTitle.textContent=item.title||'Atualização em andamento';
      const t=formatTime(item.pubDate);modalMeta.textContent=t?('Atualização identificada às '+t):'Atualização recente';
      modalMedia.replaceChildren();
      if(item.image){const img=document.createElement('img');img.src=item.image;img.alt='';img.referrerPolicy='no-referrer';img.onerror=()=>{modalMedia.innerHTML='<div class="glr-fallback"><img src="/assets/logo-oficial.webp" alt="Giro Madeira"></div>';};modalMedia.appendChild(img);}else{modalMedia.innerHTML='<div class="glr-fallback"><img src="/assets/logo-oficial.webp" alt="Giro Madeira"></div>';}
      modal.classList.add('is-open');document.body.style.overflow='hidden';close.focus();
    };
    const closeModal=()=>{modal.classList.remove('is-open');document.body.style.overflow='';};
    close.addEventListener('click',closeModal);modal.addEventListener('click',(e)=>{if(e.target===modal)closeModal();});document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&modal.classList.contains('is-open'))closeModal();});
    const render=(data)=>{
      list.replaceChildren();
      const items=(data&&Array.isArray(data.items)?data.items:[]).slice(0,12);
      if(!items.length){const empty=document.createElement('span');empty.className='glr-empty';empty.textContent='Radar temporariamente sem novas manchetes.';list.appendChild(empty);return;}
      for(const item of items){
        const card=document.createElement('button');card.type='button';card.className='glr-item';card.setAttribute('aria-label','Abrir notícia no Giro Madeira');card.addEventListener('click',()=>openItem(item));
        const media=document.createElement('div');media.className='glr-image-wrap';
        if(item.image){const img=document.createElement('img');img.className='glr-image';img.src=item.image;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>{media.innerHTML='<div class="glr-fallback"><img src="/assets/logo-oficial.webp" alt="Giro Madeira"></div>';};media.appendChild(img);}else{media.innerHTML='<div class="glr-fallback"><img src="/assets/logo-oficial.webp" alt="Giro Madeira"></div>';}
        const content=document.createElement('div');content.className='glr-content';
        const title=document.createElement('span');title.className='glr-text';title.textContent=item.title||'';
        const time=document.createElement('span');time.className='glr-time';const t=formatTime(item.pubDate);time.textContent=t?('Publicado às '+t):'Atualização recente';
        content.append(title,time);card.append(media,content);list.appendChild(card);
      }
      const now=new Date();status.textContent='Atualizado às '+now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Porto_Velho'})+' • checagem a cada 1 min';
    };
    const load=async()=>{try{const res=await fetch('/api/live-radar',{cache:'no-store'});if(!res.ok)throw new Error('radar');render(await res.json());}catch{status.textContent='Radar tentando reconectar...';}};
    const move=(direction)=>list.scrollBy({left:direction*Math.max(250,list.clientWidth*.72),behavior:'smooth'});
    prev.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
    let autoTimer=setInterval(()=>{if(list.scrollWidth>list.clientWidth){if(list.scrollLeft+list.clientWidth>=list.scrollWidth-20)list.scrollTo({left:0,behavior:'smooth'});else move(1);}},6500);
    list.addEventListener('pointerdown',()=>clearInterval(autoTimer),{once:true});
    load();setInterval(load,60000);
  })();
  <\/script>
</section>`;

export default async (request, context) => {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("text/html")) return response;
  const html = await response.text();
  if (html.includes('id="giro-live-radar"')) return new Response(html, response);
  const marker = '<main class="container">';
  if (!html.includes(marker)) return new Response(html, response);
  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=60");
  const transformed = html.replace(marker, `${RADAR_HTML}${marker}`);
  return new Response(transformed, { status: response.status, statusText: response.statusText, headers });
};

export const config = { path: ["/", "/index.html"], onError: "bypass" };
