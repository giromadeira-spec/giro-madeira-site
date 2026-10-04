const RADAR_HTML = `
<section id="giro-live-radar" aria-label="Radar de notícias ao vivo">
  <style>
    #giro-live-radar{background:#071d3a;border-bottom:4px solid #f4c21d;color:#fff;font-family:Arial,sans-serif}
    #giro-live-radar .glr-wrap{max-width:1040px;margin:0 auto;padding:14px 16px 16px}
    #giro-live-radar .glr-head{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}
    #giro-live-radar .glr-live{display:inline-flex;align-items:center;gap:7px;background:#d71920;border-radius:4px;padding:5px 9px;font-size:12px;font-weight:800;letter-spacing:.04em}
    #giro-live-radar .glr-dot{width:7px;height:7px;border-radius:50%;background:#fff;animation:glrPulse 1.4s infinite}
    #giro-live-radar .glr-title{font-size:18px;font-weight:900}
    #giro-live-radar .glr-status{margin-left:auto;font-size:11px;opacity:.75}
    #giro-live-radar .glr-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
    #giro-live-radar .glr-item{display:block;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:10px 11px;color:#fff;text-decoration:none;min-height:88px;transition:transform .15s ease,background .15s ease}
    #giro-live-radar .glr-item:hover{background:rgba(255,255,255,.14);transform:translateY(-1px)}
    #giro-live-radar .glr-source{display:block;color:#f4c21d;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
    #giro-live-radar .glr-text{font-size:13px;line-height:1.28;font-weight:750}
    #giro-live-radar .glr-time{display:block;font-size:10px;opacity:.68;margin-top:6px}
    #giro-live-radar .glr-empty{font-size:12px;opacity:.75;padding:8px 0}
    @keyframes glrPulse{0%,100%{opacity:1}50%{opacity:.25}}
    @media(max-width:850px){#giro-live-radar .glr-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:520px){#giro-live-radar .glr-list{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:3px}#giro-live-radar .glr-item{min-width:245px;scroll-snap-align:start}#giro-live-radar .glr-status{margin-left:0;width:100%}}
  </style>
  <div class="glr-wrap">
    <div class="glr-head">
      <span class="glr-live"><span class="glr-dot"></span> AO VIVO</span>
      <span class="glr-title">Radar Giro Madeira</span>
      <span class="glr-status" id="glr-status">Atualizando notícias...</span>
    </div>
    <div class="glr-list" id="glr-list"><span class="glr-empty">Buscando as últimas notícias...</span></div>
  </div>
  <script>
  (()=>{
    const list=document.getElementById('glr-list');
    const status=document.getElementById('glr-status');
    const formatTime=(value)=>{const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Porto_Velho'});};
    const render=(data)=>{
      list.replaceChildren();
      const items=(data&&Array.isArray(data.items)?data.items:[]).slice(0,8);
      if(!items.length){const empty=document.createElement('span');empty.className='glr-empty';empty.textContent='Radar temporariamente sem novas manchetes.';list.appendChild(empty);return;}
      for(const item of items){
        const a=document.createElement('a');a.className='glr-item';a.href=item.link;a.target='_blank';a.rel='noopener noreferrer';
        const source=document.createElement('span');source.className='glr-source';source.textContent=item.source||'Fonte';
        const title=document.createElement('span');title.className='glr-text';title.textContent=item.title||'';
        const time=document.createElement('span');time.className='glr-time';const t=formatTime(item.pubDate);time.textContent=t?('Publicado às '+t):'Atualização recente';
        a.append(source,title,time);list.appendChild(a);
      }
      const now=new Date();status.textContent='Radar atualizado às '+now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Porto_Velho'})+' • nova checagem em 1 min';
    };
    const load=async()=>{try{const res=await fetch('/api/live-radar',{cache:'no-store'});if(!res.ok)throw new Error('radar');render(await res.json());}catch{status.textContent='Radar tentando reconectar...';}};
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

export const config = {
  path: ["/", "/index.html"],
  onError: "bypass",
};
