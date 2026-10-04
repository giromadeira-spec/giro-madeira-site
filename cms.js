const GIRO_SUPABASE_URL = 'https://dsihvbdhocbqscaypraw.supabase.co';
const GIRO_SUPABASE_KEY = 'sb_publishable_k8DktY5cJZ6YF45VxKH7NA_hOxuThv8';

window.GIRO_CMS = {
  url: GIRO_SUPABASE_URL,
  key: GIRO_SUPABASE_KEY,
  async loadPublishedNews() {
    try {
      const endpoint = `${GIRO_SUPABASE_URL}/rest/v1/news?status=eq.published&select=slug,category,kicker,title,summary,body,image_url,image_credit,source_name,source_url,published_at&order=published_at.desc&limit=200`;
      const response = await fetch(endpoint, {
        headers: { apikey: GIRO_SUPABASE_KEY },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`CMS ${response.status}`);
      const rows = await response.json();
      const fmtDate = new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'long', year:'numeric', timeZone:'America/Porto_Velho' });
      const fmtTime = new Intl.DateTimeFormat('pt-BR', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'America/Porto_Velho' });
      return rows.map(row => {
        const when = row.published_at ? new Date(row.published_at) : new Date();
        return {
          id: row.slug,
          category: row.category,
          kicker: row.kicker || row.category,
          title: row.title,
          summary: row.summary,
          body: Array.isArray(row.body) ? row.body : [],
          date: fmtDate.format(when),
          time: fmtTime.format(when),
          image: row.image_url || 'assets/logo-oficial.webp',
          imageCredit: row.image_credit || 'Giro Madeira',
          sourceName: row.source_name || 'Fonte identificada na matéria',
          sourceUrl: row.source_url || '#'
        };
      });
    } catch (error) {
      console.warn('Giro Madeira CMS indisponível; usando arquivo local.', error);
      return [];
    }
  },
  async mergedNews() {
    const cms = await this.loadPublishedNews();
    const legacy = Array.isArray(window.GIRO_NEWS) ? window.GIRO_NEWS : [];
    const seen = new Set();
    return [...cms, ...legacy].filter(item => item && item.id && !seen.has(item.id) && seen.add(item.id));
  }
};
