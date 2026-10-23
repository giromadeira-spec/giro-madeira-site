import { createClient } from "npm:@supabase/supabase-js@2";
import { load } from "npm:cheerio@1.0.0";

const JSON_HEADERS = { "Content-Type": "application/json" };

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function canonicalize(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) u.searchParams.delete(key);
    }
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return null;
  }
}

const MONTHS: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, março: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

function parseDateFromUrl(raw: string): Date | null {
  try {
    const u = new URL(raw);
    const m = u.pathname.match(/\/(20\d{2})[\/-](0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])(?:\/|$)/);
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  } catch {
    return null;
  }
}

function parseDateFromText(text: string): Date | null {
  const t = cleanText(text).toLowerCase();

  let m = t.match(/(\d{1,2})\s+de\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/i);
  if (m) {
    const monthName = m[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const month = MONTHS[monthName] ?? MONTHS[m[2]] ?? 0;
    return new Date(Date.UTC(Number(m[3]), month, Number(m[1]), Number(m[4] || 12), Number(m[5] || 0)));
  }

  // Wordpress de instituições brasileiras frequentemente publica datas como "agosto 4, 2026".
  const monthFirst=t.match(/\b(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if(monthFirst){
    const monthName=monthFirst[1].normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    const month=MONTHS[monthName]??MONTHS[monthFirst[1]];
    if(month!==undefined)return new Date(Date.UTC(Number(monthFirst[3]),month,Number(monthFirst[2]),12));
  }

  // Data ISO de atributos datetime de portais WordPress.
  const iso=t.match(/\b(20\d{2})-(\d{2})-(\d{2})(?:t(\d{2}):(\d{2}))?/i);
  if(iso) return new Date(Date.UTC(Number(iso[1]),Number(iso[2])-1,Number(iso[3]),Number(iso[4]||12),Number(iso[5]||0)));

  m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 12), Number(m[5] || 0)));
  }

  return null;
}

function extractTitle($: any, el: any): string {
  const a = $(el);
  const nested = cleanText(a.find("h1,h2,h3,h4,h5,h6").first().text());
  if (nested.length >= 28 && nested.length <= 190) return nested;

  const attrTitle = cleanText(a.attr("title") || "");
  if (attrTitle.length >= 28 && attrTitle.length <= 190) return attrTitle;

  const raw = cleanText(a.text());
  const altMatch = raw.match(/alt=["']([^"']{28,190})["']/i);
  if (altMatch) return cleanText(altMatch[1]);
  if (raw.startsWith("<")) return "";
  if (raw.length >= 28 && raw.length <= 190) return raw;

  const datePattern = /(\d{1,2}\s+de\s+(?:janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+\d{4}(?:\s+\d{1,2}:\d{2})?)/i;
  const match = raw.match(datePattern);
  if (match?.index !== undefined) {
    const after = cleanText(raw.slice(match.index + match[0].length));
    if (after.length >= 28) {
      const pieces = after.split(/(?<=[.!?])\s+/);
      const first = cleanText(pieces[0] || after);
      if (first.length >= 28 && first.length <= 190) return first;
      return after.slice(0, 190).trim();
    }
  }

  return raw.slice(0, 190).trim();
}

function likelyHeadline(text: string): boolean {
  if (text.length < 28 || text.length > 190) return false;
  if (/[<>]/.test(text)) return false;
  if (/^(in[ií]cio|home|not[ií]cias|ler mais|saiba mais|veja mais|menu|buscar|pesquisar|acessar|voltar|pr[oó]ximo|anterior|contato|servi[cç]os|transpar[eê]ncia)$/i.test(text)) return false;
  if (/(facebook|instagram|youtube|linkedin|whatsapp|acessibilidade|ouvidoria|mapa do site|pol[ií]tica de privacidade|portal do governo do estado)/i.test(text)) return false;
  if (/^(licen[cç]a (ambiental )?(de )?(opera[cç][aã]o|instala[cç][aã]o)|renova[cç][aã]o (da sua )?licen[cç]a|renova[cç][aã]o de outorga|pedido de licen[cç]a|comunicado legal|edital de convoca[cç][aã]o|aviso de licita[cç][aã]o|termo de outorga)/i.test(text)) return false;
  return true;
}

function normalizePublisherText(v: unknown): string {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isPublisherPromo(sourceName:string,title:string){
 const s=normalizeTextForEditorial(sourceName),t=normalizeTextForEditorial(title);
 // These are directory, cross-promotion and index titles, NOT journalistic headlines.
 if(/^(leia outras materias de|outras materias de|leia mais|saiba mais|aprenda mais|clique aqui|veja mais|veja todas as|conheca nossos autores|conteudos relevantes|assista ao|in foco podcast:|podcast:|mais noticias|todos os artigos de)/.test(t))return true;
 if(/(convida voce|convida para|clique aqui|acesse o site|conheca nosso|assine nossa|acompanhe ao vivo|veja outras materias de|leia outras materias de)/.test(t))return true;
 if(s.includes("news rondonia"))
  return /(news rondonia.*(convida|recebe|entrevista|apresenta|podcast|ao vivo)|podcast|entrevista no estudio|programa ao vivo)/.test(t)
   ||/^(convida|recebe|entrevista|apresenta)/.test(t);
 return false;
}
function normalizeTextForEditorial(v:unknown){
 return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
}
function isNonArticleUrl(raw:string){
 try{
  const u=new URL(raw);
  const path=u.pathname.toLowerCase();
  if(/\/(noticias-sobre|autores?|colunistas|tags?|pesquisa|busca|search|newsletter|assine|assinatura)(\/|$)/i.test(path))return true;
  if(u.hostname==="forbes.com.br"){
   // Forbes: only dated articles, never author's listing, home, hub or landing page.
   if(!/\/20\d{2}\/\d{2}\/[^/]{10,}/.test(path))return true;
  }
  return false;
 }catch{return true;}
}

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const role = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !role) {
    return new Response(JSON.stringify({ success: false, error: "Configuração interna ausente." }), { status: 500, headers: JSON_HEADERS });
  }

  const sb = createClient(url, role);
  const runStarted = new Date();
  const runStartedIso = runStarted.toISOString();

  try {
    const provided = req.headers.get("x-giro-db-key") || "";
    const { data: valid, error: authError } = await sb.rpc("validar_giro_dispatch_key", { p_key: provided });
    if (authError) throw authError;
    if (valid !== true) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: JSON_HEADERS });
    }

    const args=await req.json().catch(()=>({}));
    const channel=String(args.channel||'');
    const channels=['shorts','tiktok','feed','stories','reels'];
    if(!channels.includes(channel))return new Response(JSON.stringify({success:false,error:'invalid_channel'}),{status:400,headers:JSON_HEADERS});
    const {data:cfg,error:cfgError}=await sb.from('giro_channel_settings').select('*').eq('channel',channel).single();
    if(cfgError)throw cfgError;
    if(args.dry_run===true||!cfg.radar_enabled)return new Response(JSON.stringify({success:true,dry_run:args.dry_run===true,channel,radar_enabled:cfg.radar_enabled,no_publish:true}),{headers:JSON_HEADERS});
    const radarTable='giro_radar_'+channel;
    const { data: sources, error: sourcesError } = await sb
      .from("giro_madeira_fontes")
      .select("*")
      .eq("ativa", true)
      .order("prioridade", { ascending: false });

    if (sourcesError) throw sourcesError;

    // Shorts/TikTok = grande impacto nacional ou mundial. Só fontes aceitas pela revisão automática
    // (CNN Brasil e Agência Brasil), nunca regionais nem gov.br de rotina.
    const bigChannel = channel === 'shorts' || channel === 'tiktok';
    const bigDomains = ['www.cnnbrasil.com.br', 'agenciabrasil.ebc.com.br'];
    const bigImpactRegex = /(guerra|ataque|m[ií]ssil|bomba|terremoto|tsunami|furac[aã]o|tornado|explos[aã]o|massacre|atentado|golpe|presidente|trump|lula|stf|supremo|congresso|senado|c[aâ]mara dos deputados|elei[cç][aã]o|elei[cç][oõ]es|bolsa|d[oó]lar|selic|infla[cç][aã]o|pib|juros|reforma|tarifa|embargo|sanç[aã]o|otan|onu|china|r[uú]ssia|ucr[aâ]nia|israel|ir[aã]|gaza|vacina|pandemia|surto|apag[aã]o nacional|greve|r[eé]cord|hist[oó]ric|bilh[oõ]es|trilh[oõ]es|morre|morte de|renuncia|demiss[aã]o|operaç[aã]o da pf|corrup[cç][aã]o|nasa|espacial)/i;
    const routineRegex = /(incinera|apreende|apreens[aã]o|prende foragido|pris[aã]o de foragido|cumpre mandado|capacita|homenagem|campanha de|inaugura|visita)/i;
    const activeSources = bigChannel ? (sources || []).filter((x: any) => bigDomains.includes(String(x.dominio || ''))) : (sources || []);

    // Collection never excludes a story because another channel consumed it.
    const alreadyInFlow = new Set<string>();

    const all = new Map<string, any>();
    const sourceResults: any[] = [];

    const localRegex = /(porto velho|rond[oô]nia|\bRO\b|br-?364|guajar[aá]-mirim|ariquemes|ji-paran[aá]|vilhena|cacoal|jaru|machadinho|pimenta bueno|rolim de moura|itapu[aã] do oeste|candeias do jamari)/i;
    const portoVelhoRegex = /(porto velho|capital rondoniense|madeira-mamor[eé]|ponta do abun[aã])/i;
    const urgentRegex = /(urgente|alerta|acidente|morre|morte|pris[aã]o|preso|apreens[aã]o|interdi[cç][aã]o|bloqueio|temporal|chuva forte|enchente|alagamento|inc[eê]ndio|desaparecid|homic[ií]dio|feminic[ií]dio|opera[cç][aã]o|elei[cç][aã]o|resultado|apag[aã]o|sem energia|suspens[aã]o|suspende|cancelad)/i;
    const serviceRegex = /(vacina[cç][aã]o|concurso|inscri[cç][aã]o|prazo|feriado|tr[aâ]nsito|energia|[aá]gua|sa[uú]de|educa[cç][aã]o|benef[ií]cio|atendimento|previs[aã]o|defesa civil)/i;
    const lowValueRegex = /(transmiss[aã]o ao vivo|estagi[aá]rios|reuni[aã]o interna|capacita[cç][aã]o interna|homenagem|sess[aã]o solene)/i;
    const lightRegex = /(vila kids|parque de infl[aá]veis|pr[eé]-show|show infantil|sorteio.*crian|espet[aá]culo infantil)/i;

    for (const source of activeSources) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);

        let response: Response;
        try {
          response = await fetch(source.url_lista, {
            signal: controller.signal,
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; GiroMadeiraRadar/2.0)",
              "Accept": "text/html,application/xhtml+xml",
              "Accept-Language": "pt-BR,pt;q=0.9",
            },
          });
        } finally {
          clearTimeout(timer);
        }

        if (!response.ok) throw new Error("HTTP " + response.status);
        const html = await response.text();
        const $ = load(html);

        let anchors = $("h1 a[href], h2 a[href], h3 a[href], h4 a[href], h5 a[href], h6 a[href], article a[href], .noticia a[href], .noticias a[href], .news a[href], .card a[href], .post a[href]");
        if (anchors.length < 3) anchors = $("a[href]");

        const seenHere = new Set<string>();
        let accepted = 0;
        let staleSkipped = 0;
        let duplicateSkipped = 0;

        anchors.each((_, el) => {
          if (accepted >= 30) return;

          const title = extractTitle($, el);
          if (!likelyHeadline(title)) return;
          if (isPublisherPromo(String(source.nome || ""), title)) return;

          const href = $(el).attr("href") || "";
          const canonical = canonicalize(href, source.url_lista);
          if (!canonical || seenHere.has(canonical)) return;

          const u = new URL(canonical);
          if (u.hostname !== source.dominio) return;
          if (source.path_prefix && !u.pathname.startsWith(source.path_prefix)) return;
          if (/\.(pdf|jpg|jpeg|png|gif|webp|zip)$/i.test(u.pathname)) return;
          if (canonical === canonicalize(source.url_lista, source.url_lista)) return;
          if (isNonArticleUrl(canonical) || canonical.includes("newsrondonia.com.br/newstv/")) return;
          if (alreadyInFlow.has(canonical)) {
            duplicateSkipped++;
            return;
          }

          const contextNode = $(el).closest("article,li,.card,.noticia,.post,.item,.news-item,.row");
          const contextText = cleanText((contextNode.length ? contextNode.text() : $(el).parent().parent().text()) || $(el).text());
          let sourceDate:Date|null=null;
          if(String(source.dominio||"")==="www.cbm.ro.gov.br"){
            // Em páginas do CBMRO há notícias históricas que herdam a data de outros elementos.
            // Aceitar apenas data ligada ao cartão da notícia, nunca à página inteira.
            const card=$(el).closest("article.post,article.type-post,article,.post");
            if(!card.length)return;
            const localTime=card.find("time[datetime],time,.entry-date,.posted-on,.post-date").first();
            const dateText=cleanText(localTime.attr("datetime")||localTime.text()||"");
            if(!dateText)return;
            sourceDate=parseDateFromText(dateText);
            if(!sourceDate)return;
          }else{
            sourceDate=parseDateFromText(contextText)||parseDateFromText($(el).text())||parseDateFromUrl(canonical);
          }

          if (sourceDate) {
            const ageMs = runStarted.getTime() - sourceDate.getTime();
            const maxAgeMs = 24 * 60 * 60 * 1000;
            if (ageMs > maxAgeMs) {
              staleSkipped++;
              return;
            }
            if (ageMs < -24 * 60 * 60 * 1000) return;
          }

          const localMatch = localRegex.test(title);

          let score = Number(source.prioridade || 5) * 3;
          const reasons: string[] = [];

          if (source.tipo_fonte === "oficial") {
            score += 10;
            reasons.push("fonte oficial");
          }

          if (source.escopo === "porto_velho") {
            score += 15;
            reasons.push("fonte de Porto Velho");
          } else if (source.escopo === "rondonia") {
            score += 10;
            reasons.push("fonte de Rondônia");
          }

          if (portoVelhoRegex.test(title)) {
            score += 10;
            reasons.push("menção direta a Porto Velho");
          } else if (localMatch) {
            score += 8;
            reasons.push("relevância local/estadual");
          }

          const urgent = urgentRegex.test(title);
          if (urgent) {
            score += 15;
            reasons.push("termo de urgência/alto impacto");
          }

          if (serviceRegex.test(title)) {
            score += 8;
            reasons.push("serviço de interesse público");
          }

          if (lowValueRegex.test(title)) {
            score -= 15;
            reasons.push("pauta institucional de menor prioridade");
          }

          if (lightRegex.test(title)) {
            score -= 12;
            reasons.push("entretenimento leve");
          }

          if (sourceDate) {
            const ageHours = Math.max(0, (runStarted.getTime() - sourceDate.getTime()) / 3600000);
            if (ageHours <= 6) {
              score += 12;
              reasons.push("publicada nas últimas 6 horas");
            } else if (ageHours <= 24) {
              score += 8;
              reasons.push("publicada nas últimas 24 horas");
            } else {
              score += 4;
              reasons.push("publicada nas últimas 24 horas");
            }
          } else {
            score -= 12;
            reasons.push("data da fonte não identificada");
          }

          if (bigChannel) {
            // impacto amplo: sem bônus local/serviço; só vale o que é grande e não rotina policial/institucional
            const isBig = bigImpactRegex.test(title);
            score = Number(source.prioridade || 5) * 3 + (isBig ? 35 : 0) - (routineRegex.test(title) ? 30 : 0) - (localMatch ? 15 : 0);
            if (isBig) reasons.push("grande impacto nacional/mundial");
            if (!isBig) reasons.push("sem sinal de grande impacto");
            if (sourceDate) { const h = Math.max(0, (runStarted.getTime() - sourceDate.getTime()) / 3600000); score += h <= 6 ? 12 : 6; }
          }
          score = Math.max(0, Math.min(100, score));

          seenHere.add(canonical);
          accepted++;

          const candidate = {
            fonte_id: source.id,
            titulo: title,
            url: canonical,
            score,
            motivos: reasons,
            urgente: urgent,
            source_published_at: sourceDate ? sourceDate.toISOString() : null,
          };

          const previous = all.get(canonical);
          if (!previous || previous.score < score) all.set(canonical, candidate);
        });

        await sb
          .from("giro_madeira_fontes")
          .update({ last_checked_at: new Date().toISOString(), last_error: null })
          .eq("id", source.id);

        sourceResults.push({ fonte: source.nome, ok: true, candidatos: accepted, antigos_ignorados: staleSkipped, duplicados_ignorados: duplicateSkipped });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        await sb
          .from("giro_madeira_fontes")
          .update({ last_checked_at: new Date().toISOString(), last_error: message.slice(0, 500) })
          .eq("id", source.id);

        sourceResults.push({ fonte: source.nome, ok: false, erro: message });
      }
    }

    const items = [...all.values()];
    let affected = 0;

    if (items.length > 0) {
      const { data, error } = await sb.rpc("giro_registrar_radar_"+channel, { p_items: items });
      if (error) throw error;
      affected = Number(data || 0);
    }

    const { data: top } = await sb
      .from(radarTable)
      .select("id,titulo,url,score,urgente,source_published_at,first_seen_at,last_seen_at,status")
      .eq("status", "descoberta")
      .gte("last_seen_at", runStartedIso)
      .order("score", { ascending: false })
      .limit(10);

    await sb.from('giro_channel_settings').update({last_radar_at:new Date().toISOString()}).eq('channel',channel);
    return new Response(JSON.stringify({
      success: true,channel,
      started_at: runStartedIso,
      fontes: sourceResults,
      candidatos_processados: items.length,
      registros_afetados: affected,
      top: top || [],
      modo: "radar_v8_noticias_reel_obrigatorio_sem_autopromo",
    }), { status: 200, headers: JSON_HEADERS });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), { status: 500, headers: JSON_HEADERS });
  }
});
