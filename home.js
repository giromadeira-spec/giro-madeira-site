(async function(){
  const news = window.GIRO_CMS ? await window.GIRO_CMS.mergedNews() : (window.GIRO_NEWS || []);
  window.GIRO_NEWS = news;
  if(!news.length) return;
  const byId = id => news.find(n=>n.id===id);
  const link = n => `materia.html?id=${encodeURIComponent(n.id)}`;
  const featured = news[0];
  const preferredSide = [byId('gasolina-749-porto-velho'),byId('50-bicicletas-pvh')].filter(Boolean).filter(n=>n.id!==featured.id);
  const side = [...news.filter(n=>n.id!==featured.id && !preferredSide.some(x=>x.id===n.id)).slice(0,2),...preferredSide].slice(0,2);
  const used = new Set([featured.id,...side.map(n=>n.id)]);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  function heroMain(n){return `<a class="hero-main" href="${link(n)}"><img class="hero-image" src="${esc(n.image)}" alt="${esc(n.title)}"><div class="hero-copy"><div class="eyebrow">${esc(n.kicker)} • ${esc(n.category)}</div><h1>${esc(n.title)}</h1><p class="summary">${esc(n.summary)}</p><div class="meta">${esc(n.date)} • ${esc(n.time)}</div></div></a>`}
  function sideCard(n){return `<a class="side-card" href="${link(n)}"><img src="${esc(n.image)}" alt="${esc(n.title)}"><div class="side-copy"><div class="eyebrow">${esc(n.category)}</div><h2>${esc(n.title)}</h2><div class="meta">${esc(n.time)}</div></div></a>`}
  function card(n){return `<a class="card" href="${link(n)}"><img src="${esc(n.image)}" alt="${esc(n.title)}" loading="lazy"><div class="card-copy"><div class="eyebrow">${esc(n.kicker)} • ${esc(n.category)}</div><h3>${esc(n.title)}</h3><p>${esc(n.summary)}</p><div class="meta">${esc(n.date)} • ${esc(n.time)}</div></div></a>`}
  document.getElementById('hero').innerHTML=`${heroMain(featured)}<div class="hero-side">${side.map(sideCard).join('')}</div>`;
  document.getElementById('news-grid').innerHTML=news.filter(n=>!used.has(n.id)).map(card).join('');
})();
