const SUPABASE_URL='https://dsihvbdhocbqscaypraw.supabase.co';
const SUPABASE_KEY='sb_publishable_kPstEJdIxLedMPWhph3SyA_mhLmx9EK';
exports.handler=async function(event){
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/news?status=eq.published&select=slug,updated_at,published_at&order=published_at.desc&limit=200`,{headers:{apikey:SUPABASE_KEY}});
    const rows=r.ok?await r.json():[];
    const proto=event.headers['x-forwarded-proto']||'https',host=event.headers.host||'';
    const base=`${proto}://${host}`;
    const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const fixed=['/','/futebol.html','/buscar.html'].map(p=>`<url><loc>${esc(base+p)}</loc></url>`).join('');
    const articles=rows.map(n=>`<url><loc>${esc(base+'/materia.html?id='+encodeURIComponent(n.slug))}</loc><lastmod>${esc((n.updated_at||n.published_at||'').slice(0,10))}</lastmod></url>`).join('');
    return{statusCode:200,headers:{'content-type':'application/xml; charset=utf-8','cache-control':'public, max-age=900, s-maxage=900'},body:`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${fixed}${articles}</urlset>`};
  }catch(e){return{statusCode:500,headers:{'content-type':'text/plain; charset=utf-8'},body:'Sitemap indisponível'}}
};