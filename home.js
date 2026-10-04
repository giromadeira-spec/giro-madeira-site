const byId = id => window.GIRO_NEWS.find(n=>n.id===id);
const link = n => `materia.html?id=${encodeURIComponent(n.id)}`;

const featured = byId('litorina-madeira-mamore') || window.GIRO_NEWS[0];
const side = [byId('gasolina-749-porto-velho'),byId('50-bicicletas-pvh')].filter(Boolean);
const used = new Set([featured.id,...side.map(n=>n.id)]);

function heroMain(n){return `<a class="hero-main" href="${link(n)}"><img class="hero-image" src="${n.image}" alt="${n.title}"><div class="hero-copy"><div class="eyebrow">${n.kicker} • ${n.category}</div><h1>${n.title}</h1><p class="summary">${n.summary}</p><div class="meta">${n.date} • ${n.time}</div></div></a>`}
function sideCard(n){return `<a class="side-card" href="${link(n)}"><img src="${n.image}" alt="${n.title}"><div class="side-copy"><div class="eyebrow">${n.category}</div><h2>${n.title}</h2><div class="meta">${n.time}</div></div></a>`}
function card(n){return `<a class="card" href="${link(n)}"><img src="${n.image}" alt="${n.title}" loading="lazy"><div class="card-copy"><div class="eyebrow">${n.kicker} • ${n.category}</div><h3>${n.title}</h3><p>${n.summary}</p><div class="meta">${n.date} • ${n.time}</div></div></a>`}

document.getElementById('hero').innerHTML = `${heroMain(featured)}<div class="hero-side">${side.map(sideCard).join('')}</div>`;
document.getElementById('news-grid').innerHTML = window.GIRO_NEWS.filter(n=>!used.has(n.id)).map(card).join('');
