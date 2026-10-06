const GIRO_SUPABASE_URL='https://dsihvbdhocbqscaypraw.supabase.co';
const GIRO_SUPABASE_KEY='sb_publishable_kPstEJdIxLedMPWhph3SyA_mhLmx9EK';

window.GIRO_CMS={
  url:GIRO_SUPABASE_URL,key:GIRO_SUPABASE_KEY,
  async loadPublishedNews(){
    try{
      const endpoint=`${GIRO_SUPABASE_URL}/rest/v1/news?status=eq.published&select=slug,scope,category,kicker,title,summary,body,image_url,image_credit,source_name,source_url,published_at,featured_rank,is_breaking,is_service,expires_at,meta&order=published_at.desc&limit=200`;
      const response=await fetch(endpoint,{headers:{apikey:GIRO_SUPABASE_KEY},cache:'no-store'});
      if(!response.ok)throw new Error(`CMS ${response.status}`);
      const rawRows=await response.json();
      const now=Date.now();
      const rows=rawRows.filter(row=>{const published=row.published_at?new Date(row.published_at).getTime():0;const expires=row.expires_at?new Date(row.expires_at).getTime():null;return published<=now&&(!expires||expires>now)});
      const fmtDate=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'long',year:'numeric',timeZone:'America/Porto_Velho'});
      const fmtTime=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Porto_Velho'});
      return rows.map(row=>{const when=new Date(row.published_at);return{id:row.slug,scope:row.scope||null,category:row.category,kicker:row.kicker||row.category,title:row.title,summary:row.summary,body:Array.isArray(row.body)?row.body:[],date:fmtDate.format(when),time:fmtTime.format(when),publishedAt:row.published_at,image:row.image_url||'assets/logo-oficial.webp',imageCredit:row.image_credit||'Giro Madeira',sourceName:row.source_name||'Fonte identificada na matéria',sourceUrl:row.source_url||'#',featuredRank:row.featured_rank,isBreaking:!!row.is_breaking,isService:!!row.is_service,expiresAt:row.expires_at,meta:row.meta||{}}});
    }catch(error){console.warn('Giro Madeira CMS indisponível; usando arquivo local.',error);return[]}
  },
  async mergedNews(){
    const cms=await this.loadPublishedNews();
    if(cms.length)return cms;
    const legacy=Array.isArray(window.GIRO_NEWS)?window.GIRO_NEWS:[];
    return legacy;
  }
};