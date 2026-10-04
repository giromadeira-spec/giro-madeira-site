(async function(){
  const news=window.GIRO_CMS?await window.GIRO_CMS.mergedNews():(window.GIRO_NEWS||[]);window.GIRO_NEWS=news;if(!news.length)return;
  const link=n=>`materia.html?id=${encodeURIComponent(n.id)}`,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const ranked=r=>news.find(n=>Number(n.featuredRank)===r);
  const featured=ranked(1)||news[0];
  const sidePreferred=[ranked(2),ranked(3)].filter(Boolean).filter(n=>n.id!==featured.id);
  const side=[...sidePreferred,...news.filter(n=>n.id!==featured.id&&!sidePreferred.some(x=>x.id===n.id))].slice(0,2);
  const used=new Set([featured.id,...side.map(n=>n.id)]);
  function heroMain(n){return `<a class="hero-main" href="${link(n)}"><img class="hero-image" src="${esc(n.image)}" alt="${esc(n.title)}" onerror="this.src='assets/logo-oficial.webp'"><div class="hero-copy"><div class="eyebrow">${esc(n.kicker)} • ${esc(n.category)}</div><h1>${esc(n.title)}</h1><p class="summary">${esc(n.summary)}</p><div class="meta">${esc(n.date)} • ${esc(n.time)}</div></div></a>`}
  function sideCard(n){return `<a class="side-card" href="${link(n)}"><img src="${esc(n.image)}" alt="${esc(n.title)}" onerror="this.src='assets/logo-oficial.webp'"><div class="side-copy"><div class="eyebrow">${esc(n.category)}</div><h2>${esc(n.title)}</h2><div class="meta">${esc(n.time)}</div></div></a>`}
  function card(n){return `<a class="card" href="${link(n)}"><img src="${esc(n.image)}" alt="${esc(n.title)}" loading="lazy" onerror="this.src='assets/logo-oficial.webp'"><div class="card-copy"><div class="eyebrow">${esc(n.kicker)} • ${esc(n.category)}</div><h3>${esc(n.title)}</h3><p>${esc(n.summary)}</p><div class="meta">${esc(n.date)} • ${esc(n.time)}</div></div></a>`}
  document.getElementById('hero').innerHTML=`${heroMain(featured)}<div class="hero-side">${side.map(sideCard).join('')}</div>`;

  const serviceCats=new Set(['SERVIÇO','EMPREGOS','CONCURSOS','SAÚDE','EDUCAÇÃO','TRÂNSITO']);
  const service=news.filter(n=>n.isService||serviceCats.has(n.category)).filter(n=>!used.has(n.id)).slice(0,4);
  if(service.length){document.getElementById('service-block').classList.remove('hidden');document.getElementById('service-grid').innerHTML=service.map(card).join('');service.forEach(n=>used.add(n.id))}
  document.getElementById('news-grid').innerHTML=news.filter(n=>!used.has(n.id)).map(card).join('');

  const breaking=news.find(n=>n.isBreaking);
  if(breaking){document.getElementById('breaking-link').href=link(breaking);document.getElementById('breaking-text').textContent=breaking.title}
  const election=document.getElementById('elections-nav');if(election&&Date.now()>new Date('2026-10-26T23:59:59-03:00').getTime())election.style.display='none';
})();