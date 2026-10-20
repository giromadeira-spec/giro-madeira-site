import { approvedRegistryPhoto, discoverPhotoCandidate, searchRegisteredPhotoSources } from "../_shared/photo-registry.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { load } from "npm:cheerio@1.0.0";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";

const H={"content-type":"application/json"};
// 08/10/2026: OpenAI API retornou 429 insufficient_quota; usar resumo factual local e arte original vetorial sem chamadas pagas até a recarga.
const EXTRA_PAID_AI_COSTS_FORBIDDEN=true; // Regra oficial Giro Madeira: nenhum gasto adicional de IA.
const FONT_URL="https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf";
const DISPLAY_FONT_URL="https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf";
let wasmReady:Promise<void>|null=null;
let fontReady:Promise<Uint8Array>|null=null;
let displayFontReady:Promise<Uint8Array>|null=null;
function getDisplayFont(){if(!displayFontReady)displayFontReady=(async()=>{
  const r=await fetch(DISPLAY_FONT_URL);if(!r.ok)throw new Error("Fonte manchete indisponível "+r.status);
  return new Uint8Array(await r.arrayBuffer());
})();return displayFontReady;}
function ensureWasm(){ if(!wasmReady) wasmReady=initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm")); return wasmReady; }
function getFont(){ if(!fontReady) fontReady=(async()=>{const r=await fetch(FONT_URL);if(!r.ok) throw new Error("Falha ao carregar fonte: "+r.status);return new Uint8Array(await r.arrayBuffer())})();return fontReady; }

function esc(s:string){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function clean(s:any){return String(s??"").replace(/\s+/g," ").trim();}
function absUrl(raw:string,base:string){try{return new URL(raw,base).toString()}catch{return ""}}
function b64(bytes:Uint8Array){let out="";const step=0x8000;for(let i=0;i<bytes.length;i+=step) out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+step,bytes.length)));return btoa(out);}

function articleText($:any){
  const root=$;
  // Prefer source-native NewsArticle.articleBody when it is factual body text.
  // Social widgets and unrelated page recommendations are not article content.
  let structured="";
  root('script[type="application/ld+json"]').each((_:any,el:any)=>{
    try{
      const data=JSON.parse(root(el).html()||"null");
      const nodes:Array<any>=Array.isArray(data)?data:[data];
      for(let j=0;j<nodes.length;j++){
        const node=nodes[j];
        if(node?.["@graph"]&&Array.isArray(node["@graph"]))nodes.push(...node["@graph"]);
        const kinds=Array.isArray(node?.["@type"])?node["@type"]:[node?.["@type"]];
        if(!kinds.some((k:any)=>/^(?:NewsArticle|Article|ReportageNewsArticle)$/i.test(String(k))))continue;
        const body=clean(node.articleBody);
        if(body.length>=280&&body.length<=16000&&body.length>structured.length)structured=body;
      }
    }catch{/* malformed JSON-LD cannot be trusted */}
  });
  root("script,style,noscript,nav,header,footer,aside,form,iframe,.advertisement,.ads,.related,.recommended,.share-buttons,.social-media,.newsletter,.comments").remove();
  const sel=[
    "[itemprop=articleBody] p",".articleBody p",".story-body p",".content-text p",
    "article .entry-content p","article .post-content p","article .article-body p",
    ".post-content p",".entry-content p",".td-post-content p",".article-body p",
    ".texto-noticia p",".texto-da-noticia p",".conteudo-noticia p",".conteudo-da-noticia p",
    ".noticia-corpo p",".materia-corpo p",".article-content p",".news-content p",
    ".news-body p",".post-body p","#texto-noticia p","#corpo-noticia p",
    ".texto-materia p","#conteudo-materia p","#conteudo-noticia p",
    "article p","main p"
  ];
  let best:string[]=[];
  for(const selector of sel){
    const items=root(selector).toArray().map((e:any)=>clean(root(e).text()))
      .filter((t:string)=>t.length>=35&&t.length<=1800
        &&!/^(publicidade|compartilhe|leia tamb[eé]m|veja tamb[eé]m|siga nossas redes|receba not[ií]cias|todos os direitos|clique aqui|saiba mais|assine|newsletter)/i.test(t))
      .slice(0,16);
    if(items.join(" ").length>best.join(" ").length)best=items;
  }
  return (structured.length>best.join(" ").length?structured:best.join("\n")).slice(0,6500);
}
// Locate a possible event image INSIDE the original article, never by stock search.
// This is provenance discovery only: no copyright/visual approval follows from it.
function articleSourcePhoto($:any,articleUrl:string,title:string):string{
  const choices:Array<{url:string,score:number}>=[];
  const banned=/\/(?:logo|logotipo|brasao|favicon|avatar|banner|placeholder|default-image|sem-foto)(?:[-_.\/?]|$)/i;
  const rejectCaption=/imagem ilustrativa|foto ilustrativa|foto de arquivo|imagem de arquivo|stock photo|shutterstock|freepik|foto meramente/i;
  const add=(raw:any,caption:any,weight:number)=>{
    const normalized=clean(raw);if(!normalized||normalized.startsWith("data:"))return;
    const value=absUrl(normalized,articleUrl);
    let u:URL;try{u=new URL(value)}catch{return}
    if(u.protocol!=="https:"||banned.test(u.pathname)||!/\.(?:jpe?g|png|webp)(?:\/|$)/i.test(u.pathname))return;
    const description=clean(caption);
    if(rejectCaption.test(description))return;
    const topical=description&&eventWordsMatch(title,description);
    const score=weight+(topical?10:0)+(u.hostname==="upload.wikimedia.org"&&topical?3:0);
    if(!choices.some(x=>x.url===value))choices.push({url:value,score});
  };
  // A publisher's canonical article image outranks related-story thumbnails.
  // Logos/placeholders are still rejected; discovery never grants reuse rights.
  add($('meta[property="og:image"]').attr("content"),
      $('meta[property="og:image:alt"]').attr("content"),30);
  $('.related,.related-posts,.recommended,.post-navigation,.td-related-row').remove();
  // Captioned figures may supply an alternative when the canonical image is absent.
  $("article figure, main article figure, .entry-content figure, .article-content figure, .noticia-corpo figure").slice(0,20).each((_:any,el:any)=>{
    const figure=$(el),im=figure.find("img").first();
    add(im.attr("data-src")||im.attr("data-lazy-src")||im.attr("src"),
      figure.find("figcaption").first().text()||im.attr("alt"),6);
  });
  $("article img, .entry-content img, .article-content img, .noticia-corpo img").slice(0,25).each((_:any,el:any)=>{
    const im=$(el);
    add(im.attr("data-src")||im.attr("data-lazy-src")||im.attr("src"),im.attr("alt")||im.attr("title"),3);
  });
  add($('meta[property="og:image"]').attr("content"),
      $('meta[property="og:image:alt"]').attr("content"),1);
  add($('meta[name="twitter:image"]').attr("content"),
      $('meta[name="twitter:image:alt"]').attr("content"),1);
  choices.sort((a,b)=>b.score-a.score);
  return choices[0]?.url||"";
}

function editorialAllowed(title:string,source:string,sourceUrl:string){
 const t=clean(title).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const src=(source+" "+sourceUrl).toLowerCase();
 let path="";
 try{const u=new URL(sourceUrl);path=u.pathname.toLowerCase()}catch{return false;}
 // The publisher is permitted (including Forbes); only non-news landing pages are rejected.
 if(/\/(noticias-sobre|autores?|colunistas|tags?|pesquisa|busca|search|newsletter|assine|assinatura)(\/|$)/.test(path))return false;
 if(src.includes("forbes")&&!/\/20\d{2}\/\d{2}\/[^/]{10,}/.test(path))return false;
 if(/^(leia outras materias de|outras materias de|leia mais|saiba mais|aprenda mais|clique aqui|veja mais|conheca mais|assista ao|podcast:|in foco podcast:|todos os artigos de|conteudos relevantes)/.test(t))return false;
 if(/newsrondonia\.com\.br\/newstv|news rondonia.*(convida|recebe|podcast|ao vivo)/.test(src+" "+t))return false;
 if(/\b(convida para|convida voce|confira mais detalhes|acesse nosso site|assine nossa|acompanhe ao vivo|leia outras materias de)\b/.test(t))return false;
 return true;
}
function factualFallback(title:string,desc:string,article:string){
  // Extrai fatos da matéria original quando o resumo por IA está indisponível.
  // Evita invenções: se não houver informação específica suficiente, suspende a pauta.
  const lead=clean(title).replace(/[.!?]*$/,".") ;
  article=String(article||"").replace(/(?:Desenvolvimento da Ação|Resultados da Operação|Continuidade das Investigações)\s*(?=[A-ZÀ-Ý])/g,"");
  const parts=[...String(article||"").split(/(?<=[.!?])\s+|\n+/).map(clean),clean(desc)];
  const chosen:string[]=[];
  let used=lead.toLowerCase();
  for(const part of parts){
    const t=part.replace(/^Resumo gerado por ferramenta de IA treinada pela redação do News Rondônia\s*/i,"")
      .replace(/^Texto criado por inteligência artificial para o portal[^.]*\.?\s*/i,"")
      .replace(/^(publicidade|assine|compartilhe|leia mais|saiba mais).*/i,"").trim();
    // Não cortar frases de matérias ao atingir limite de caracteres:
    // cortes no meio da oração podem mudar radicalmente o sentido de uma notícia.
    if(!/[.!?][”"’)]?$/.test(t)||t.length<45||t.length>360||/^(mais informac|confira|leia tamb[eé]m|acesse|clique|o portal)/i.test(t))continue;
    if(/\b[A-Z]\.$/.test(t))continue;
    const key=t.toLowerCase().slice(0,65);
    if(used.includes(key)||chosen.some(x=>x.toLowerCase().includes(key)))continue;
    chosen.push(t); used+=" "+t.toLowerCase();
    if(chosen.join(" ").length>=520||chosen.length>=4)break;
  }
  if(chosen.join(" ").length<185)
    throw new Error("Matéria não tem detalhes suficientes para legenda longa; mantida fora da publicação.");
  const leadBlock=lead+" "+chosen[0];
  const details=chosen.slice(1).join(" ");
  const text=leadBlock+(details?"\n\n"+details:"");
  if(text.length<250)throw new Error("Informações insuficientes para conteúdo jornalístico completo.");
  if(text.length<=1150)return text;
  const complete=text.match(/[^.!?]+[.!?]+(?:[”"’)]|$)?/g)||[];
  let bounded="";
  for(const sentence of complete){if((bounded+sentence).length>1150)break;bounded+=sentence;}
  if(bounded.trim().length<250)throw new Error("Legenda não cabe sem cortar frase; revisão necessária.");
  return bounded.trim();
}

async function writeOriginalSummary(title:string,desc:string,article:string,_source:string){
  // Modo custo extra zero: síntese local determinística, sem chamadas pagas.
  // Dados insuficientes são rejeitados, jamais inventados.
  if(article.length<280&&desc.length<260)
    throw new Error("Fonte sem dados suficientes para legenda jornalística detalhada; pauta suspensa sem inventar fatos.");
  return factualFallback(title,desc,article);
}

function classify(t:string){
  const s=t.toLowerCase();
  if(/pol[ií]cia|pris[aã]o|preso|tr[aá]fico|drog|homic|feminic|pf\b|força tática|opera[cç][aã]o/.test(s)) return "POLÍCIA";
  if(/acidente|colis[aã]o|tr[aâ]nsito|capota|rodovia|br-?364|motocic/.test(s)) return "TRÂNSITO";
  if(/sa[uú]de|hospital|vacina|c[aâ]ncer|ubs|doen[cç]a/.test(s)) return "SAÚDE";
  if(/elei[cç][aã]o|govern|prefeit|c[aâ]mara|assembleia|senado|deputad|pol[ií]tica/.test(s)) return "POLÍTICA";
  if(/futebol|jogo|esporte|corrida|campeonato|messi|sele[cç][aã]o/.test(s)) return "ESPORTE";
  if(/emprego|vaga|sine|econom|pix|com[eé]rcio|empresa|pre[cç]o/.test(s)) return "ECONOMIA";
  if(/chuva|tempo|seca|rio madeira|enchente|alagamento|clima/.test(s)) return "CLIMA";
  return "GIRO AGORA";
}
function wrap(text:string,maxChars:number,maxLines:number){
  const words=clean(text).split(" ");const lines:string[]=[];let cur="";
  for(const w of words){
    const test=cur?cur+" "+w:w;
    if(test.length<=maxChars||!cur){cur=test;continue;}
    lines.push(cur);cur=w;
    if(lines.length===maxLines-1) break;
  }
  const used=lines.join(" ").split(" ").filter(Boolean).length;
  if(lines.length<maxLines && cur) lines.push(cur);
  const total=words.length;
  if(total>used+(cur?cur.split(" ").length:0) && lines.length) lines[lines.length-1]=lines[lines.length-1].replace(/[.,;:!?]*$/,"")+"…";
  return lines.slice(0,maxLines);
}
function textBlock(lines:string[],x:number,y:number,fs:number,lh:number,color:string){
  return `<text x="${x}" y="${y}" font-family="Inter" font-size="${fs}" font-weight="850" fill="${color}">${lines.map((l,i)=>`<tspan x="${x}" dy="${i===0?0:lh}">${esc(l)}</tspan>`).join("")}</text>`;
}
async function fetchPage(url:string){
  const original=new URL(url);
  if(original.protocol!=="https:")throw new Error("HTTPS obrigatório para fonte de notícia");
  const urls=[original.toString()];
  // These are the same news publisher, not an unrelated article or search result.
  if(["www.rondoniaovivo.com","rondoniaovivo.com"].includes(original.hostname)){
    const alternate=new URL(original.toString());
    alternate.hostname=original.hostname.startsWith("www.")?"rondoniaovivo.com":"www.rondoniaovivo.com";
    urls.unshift(alternate.toString());
  }
  let best="",bestScore=-1,lastError="source_page_unavailable";
  for(const candidate of [...new Set(urls)]){
    const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),12500);
    try{
      const r=await fetch(candidate,{signal:ctl.signal,headers:{
        "User-Agent":"Mozilla/5.0 (compatible; GiroMadeiraBot/3.1)",
        "Accept":"text/html,application/xhtml+xml","Accept-Language":"pt-BR,pt;q=0.9"
      }});
      if(!r.ok){lastError="HTTP "+r.status;continue;}
      const ct=String(r.headers.get("content-type")||"").toLowerCase();
      if(ct&&!ct.includes("text/html")){lastError="unexpected_content_type";continue;}
      const html=await r.text();
      if(html.length>3_000_000){lastError="html_too_large";continue;}
      const $=load(html);
      const score=articleText($).length;
      if(score>bestScore){best=html;bestScore=score;}
      if(score>=340)return html;
    }catch(e){lastError=e instanceof Error?e.name:"fetch_error"}
    finally{clearTimeout(to)}
  }
  if(best)return best;
  throw new Error("Fonte temporariamente inacessível: "+lastError);
}
async function imageDataUri(imageUrl:string){
  if(!imageUrl) return "";
  try{
    const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),15000);
    const r=await fetch(imageUrl,{signal:ctl.signal,headers:{"User-Agent":"Mozilla/5.0","Referer":new URL(imageUrl).origin+"/"}});
    clearTimeout(to);
    if(!r.ok) return "";
    const ct=(r.headers.get("content-type")||"image/jpeg").split(";")[0];
    if(!ct.startsWith("image/")) return "";
    const ab=await r.arrayBuffer(); if(ab.byteLength>4*1024*1024) return "";
    return `data:${ct};base64,${b64(new Uint8Array(ab))}`;
  }catch{return ""}
}
// Nenhum gerador de imagens pago é invocado no fluxo automático.
// Usar somente fotografia com licença verificada ou arte própria aprovada.
const OFFICIAL_WEBP_B64="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";
let brandLogoUri="data:image/webp;base64,"+OFFICIAL_WEBP_B64;
let brandLogoReady:Promise<void>|null=null;
function prepareBrandLogo(){
 if(!brandLogoReady)brandLogoReady=(async()=>{
   try{
     // Convert original owned WebP badge to PNG because resvg does not draw embedded WebP.
     const [{decode},{encode}]=await Promise.all([
       import("npm:@jsquash/webp@1.5.0"),
       import("npm:@jsquash/png@3.1.1")
     ]);
     const webp=Uint8Array.from(atob(OFFICIAL_WEBP_B64),x=>x.charCodeAt(0));
     const rgba=await decode(webp.buffer);
     const png=new Uint8Array(await encode(rgba));
     if(png.length>0&&png.length<2_000_000)brandLogoUri="data:image/png;base64,"+b64(png);
   }catch(e){console.error("OFFICIAL_BRAND_LOGO_PNG_CONVERSION_FAILED",String(e));}
 })();
 return brandLogoReady;
}

function brandHeader(x:number,y:number,scale=1){
  // The Shorts/TikTok reference has a SINGLE authentic circular logo.
  // Never add a synthetic second wordmark, logo panel or branding box.
  const w=Math.round(235*scale);
  return '<image href="'+brandLogoUri+'" x="'+x+'" y="'+y+
    '" width="'+w+'" height="'+w+'" preserveAspectRatio="xMidYMid meet"/>';
}
function shouldReel(title:string,category:string,urgent:boolean){
  // Reserve Reels for breaking news, public safety, notable events and visual stories.
  const s=(title+" "+category).toLowerCase();
  return urgent||/pol[ií]cia|pris[aã]o|preso|opera[cç][aã]o|acidente|colis[aã]o|capota|inc[eê]ndio|alerta|urgente|alagamento|enchente|tempestade|homic[ií]dio|feminic[ií]dio|desastre|explos[aã]o|manifest[aã]o|evento|festival|show|campeonato|rodada|placar|final de copa|greve|interdi[cç][aã]o/.test(s);
}
function accentLine(line:string){
  const parts=line.split(/(\b(?:AGORA|URGENTE|ALERTA)\b|R\$\s?\d[\d.,%]*|\b\d[\d.,%]*%?\b)/gi);
  return parts.map((p)=>/^(?:AGORA|URGENTE|ALERTA)$/i.test(p)||/^R\$|^\d/.test(p)?`<tspan fill="#f5aa00">${esc(p)}</tspan>`:`<tspan fill="#ffffff">${esc(p)}</tspan>`).join("");
}
function headlineBlock(lines:string[],x:number,y:number,fs:number,lh:number){
  return `<text x="${x}" y="${y}" font-family="Anton" font-size="${fs}" font-weight="900" fill="#ffffff" letter-spacing=".2">${lines.map((l,i)=>`<tspan x="${x}" dy="${i===0?0:lh}">${accentLine(l)}</tspan>`).join("")}</text>`;
}

function artworkTitle(raw:string){
  // Compress ONLY a verified, meaning-preserving idiom; retain all other facts.
  let t=clean(raw).replace(/\s*[;:]\s*(entenda|veja|saiba mais|confira|assista)(?:[.!])?$/i,"")
    .replace(/\s+\|\s+[^|]+$/,"").replace(/[\s;:.,]+$/,"").trim();
  t=t.replace(/fala em acabar com (?:a )?reelei[cç][aã]o e aumentar o pr[oó]prio mandato/i,
    "fala em fim da reeleição e mandato mais longo");
  return t.toLocaleUpperCase("pt-BR");
}
function wrapAll(text:string,maxChars:number){
  const words=clean(text).split(" ").filter(Boolean), lines:string[]=[];
  let current="";
  for(const word of words){
    const candidate=current?current+" "+word:word;
    if(current&&candidate.length>maxChars){lines.push(current);current=word;}
    else current=candidate;
  }
  if(current)lines.push(current);
  return lines;
}
function fitHeadline(raw:string,maxWidth:number,maxLines:number,maxFont:number,minFont:number,maxVerticalSpan:number,lineHeightScale:number){
  const title=artworkTitle(raw);
  if(!title)throw new Error("Manchete vazia: arte não gerada.");
  for(let size=maxFont;size>=minFont;size-=2){
    const chars=Math.max(12,Math.floor(maxWidth/(size*0.61)));
    const lines=wrapAll(title,chars);
    // Validate vertical fit before accepting a font size; never crop the headline.
    const lineHeight=Math.round(size*lineHeightScale);
    if(lines.length<=maxLines && lines.every(x=>x.length<=chars+3)
       && (lines.length-1)*lineHeight<=maxVerticalSpan)
      return {lines,size};
  }
  // Nunca publicar arte com manchete cortada ou reduzida a reticências.
  throw new Error("Manchete extensa demais para a arte; revisar título antes da publicação.");
}

type EditorialPhoto={dataUri:string,creator:string,license:string,source:string,registryId?:number};
function isTimberVisualStory(raw:string){
 const s=String(raw||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 return /madeireir|desmatamento|troncos|toras|madeira (?:retirad|apreendid|ilegal)|(?:apreensao|retirada|extracao) (?:de )?madeira|terra indigena.*madeira/.test(s);
}
function licensingTopic(title:string,cat:string):string[]{
  const s=(title+" "+cat).toLowerCase();
  if(isTimberVisualStory(s))
    return ["illegal logging Brazil timber truck", "Amazon Brazil timber logs", "Logging truck Amazon forest"];
  if(/inc[eê]ndio|bombeir|queimad|combate.*fogo/.test(s))
    return ["corpo de bombeiros brasil viatura", "brazil fire truck firefighters", "firefighters Brazil emergency truck"];
  if(/pol[ií]cia|pris[aã]o|pris[aã]o|homic|feminic|opera[cç][aã]o|tr[aá]fico|droga/.test(s))return ["police vehicle Brazil", "policia viatura Brasil"];
  if(/acidente|colis[aã]o|rodovia|tr[aâ]nsito|br-?364/.test(s))return ["Brazil federal highway","rodovia brasileira"];
  if(/chuva|rio madeira|enchente|seca|tempor|clima/.test(s))return ["Rio Madeira Porto Velho","storm sky Brazil"];
  if(/sa[uú]de|hospital|vacina|doen[cç]a/.test(s))return ["hospital Brazil","hospital public health"];
  if(/escola|ensino|educa[cç][aã]o|alun[oa]|salas? de aula|feriado escolar|professor/.test(s))
    return ["escola pública brasil sala de aula", "public school Brazil", "Brazil school classroom"];
  if(/servi[cç]o p[uú]blico|atendimento municipal|assist[eê]ncia social|prefeitura/.test(s))
    return ["Porto Velho Rondônia city", "Brazil public administration building"];
  if(/futebol|copa|sele[cç][aã]o|gol|esporte|campeonato/.test(s))return ["Brazil football stadium","football soccer stadium"];
  if(/pol[ií]tica|govern|congresso|c[aâ]mara|deputad|senado|elei[cç][aã]o/.test(s))return ["Congresso Nacional Brasilia","Brazil National Congress"];
  if(/m[uú]sica|festival|show|cultura|teatro/.test(s))return ["theater interior audience","concert stage"];
  if(/reciclagem|meio ambiente|sustent[aá]vel/.test(s))return ["recycling bins city","recycling collection"];
  if(/economia|pix|banco|dinheiro|empresa|pre[cç]o/.test(s))return ["Brazilian real banknotes","Brazil financial district"];
  return []; // Unknown subjects cannot use generic city photography as the news image.
}
function stripPhotoMarkup(v:any){return clean(String(v||"").replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&")).slice(0,90);}

function eventWords(text:string):Set<string>{
  const s=clean(text).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const stop=new Set(["sobre","apos","para","pelo","pela","pelos","pelas","entre","quando","noticia",
    "noticias","foto","imagem","reportagem","brasil","brasileiro","novo","nova","hoje",
    "ontem","foram","deixa","deixam","durante","mais","onde","esta","dois","tres","quatro","cinco"]);
  return new Set((s.match(/[a-z0-9]{4,}/g)||[]).filter(w=>!stop.has(w)));
}
function eventWordsMatch(headline:string,photoText:string):boolean{
  const words=eventWords(headline);
  const matched=[...words].filter(w=>eventWords(photoText).has(w));
  return matched.length>=2&&matched.length>=Math.min(3,words.size);
}
/**
 * Pauta+foto devem provir da MESMA reportagem. Imagem temática de busca geral,
 * OG ilustrativo, foto de arquivo e imagem de terceiros sem licença são vetados.
 * O vínculo editorial é verificado pela legenda; a licença, por arquivo Commons.
 */
async function linkedEventPhoto(articleHtml:string,originalImage:string,title:string):Promise<EditorialPhoto|null>{
  if(!articleHtml||!originalImage)return null;
  const $=load(articleHtml);
  if(!eventWordsMatch(title,clean($('meta[property="og:title"]').attr("content")||$('h1').first().text())))return null;
  let photoUrl:URL;try{photoUrl=new URL(originalImage)}catch{return null}
  if(photoUrl.protocol!=="https:"||photoUrl.hostname!=="upload.wikimedia.org")return null;
  let caption=clean($('meta[property="og:image:alt"]').attr("content")||
                    $('meta[name="twitter:image:alt"]').attr("content"));
  if(!caption){
    $('img').each((_:any,el:any)=>{
      if(caption)return;
      const raw=clean($(el).attr("src")||$(el).attr("data-src"));
      if(!raw)return;
      const same=raw===originalImage||
        decodeURIComponent(raw.split("/").pop()||"")===decodeURIComponent(photoUrl.pathname.split("/").pop()||"");
      if(same)caption=clean($(el).closest("figure").find("figcaption").first().text()||$(el).attr("alt"));
    });
  }
  if(!caption||/ilustrativ|meramente|foto de arquivo|imagem de arquivo|stock|shutterstock|freepik|representa[cç][aã]o|montagem|gen[eé]ric|arquivo pessoal/i.test(caption)
    ||!eventWordsMatch(title,caption))return null;
  const segments=photoUrl.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const filename=segments.includes("thumb")?segments.at(-2):segments.at(-1);
  if(!filename||! /\.(?:jpe?g|png|webp)$/i.test(filename))return null;
  try{
    const api=new URL("https://commons.wikimedia.org/w/api.php");
    Object.entries({action:"query",titles:"File:"+filename,prop:"imageinfo",
      iiprop:"url|size|extmetadata",iiurlwidth:"1400",format:"json",formatversion:"2"})
      .forEach(([key,value])=>api.searchParams.set(key,value));
    const response=await fetch(api,{signal:AbortSignal.timeout(6500)});
    if(!response.ok)return null;
    const data=await response.json();
    const info=data?.query?.pages?.[0]?.imageinfo?.[0];
    if(!info||Number(info.width)<1000||Number(info.height)<650)return null;
    const meta=info.extmetadata||{};
    const lic=stripPhotoMarkup(meta?.LicenseShortName?.value);
    const licUrl=String(meta?.LicenseUrl?.value||"");
    const cc0=/^CC0(?: |$)/i.test(lic)&&/creativecommons\.org\/publicdomain\/zero\//i.test(licUrl);
    const ccby=/^CC BY(?: |$)/i.test(lic)&&/creativecommons\.org\/licenses\/by\//i.test(licUrl);
    if(!cc0&&!ccby)return null;
    const creator=stripPhotoMarkup(meta?.Artist?.value);
    if(ccby&&creator.length<2)return null;
    const image=String(info.thumburl||info.url||"");
    const url=new URL(image);
    if(url.protocol!=="https:"||!["upload.wikimedia.org","thumb.wikimedia.org"].includes(url.hostname))return null;
    const dataUri=await imageDataUri(image);
    if(!dataUri)return null;
    return {dataUri,creator:creator||"Domínio público",license:lic,
      source:"https://commons.wikimedia.org/wiki/File:"+encodeURIComponent(filename.replace(/ /g,"_"))};
  }catch{return null}
}

async function licensedEditorialPhoto(title:string,category:string):Promise<EditorialPhoto|null>{
  // Article OG photographs are not automatically reusable. Search file-level Wikimedia licenses.
  for(const term of licensingTopic(title,category)){
    try{
      const api=new URL("https://commons.wikimedia.org/w/api.php");
      for(const [k,v] of Object.entries({
        action:"query",generator:"search",gsrsearch:term,gsrnamespace:"6",gsrlimit:"14",
        prop:"imageinfo",iiprop:"url|size|extmetadata",iiurlwidth:"1400",
        format:"json",formatversion:"2",origin:"*"
      }))api.searchParams.set(k,v);
      const index=await fetch(api.toString(),{signal:AbortSignal.timeout(6500),headers:{"User-Agent":"GiroMadeiraEditorial/1.0 (license verification; news graphic)"}});
      if(!index.ok)continue;
      const results=await index.json().catch(()=>({}));
      const pages=Array.isArray(results?.query?.pages)?results.query.pages:[];
      for(const page of pages){
        const info=page?.imageinfo?.[0],meta=info?.extmetadata||{};
        const lic=stripPhotoMarkup(meta?.LicenseShortName?.value);
        const licURL=stripPhotoMarkup(meta?.LicenseUrl?.value);
        const isCC0=/^CC0(?: |$)/i.test(lic)&&/creativecommons\.org\/publicdomain\/zero\//i.test(licURL);
        const isCCBY=/^CC BY(?: |$)/i.test(lic)&&/creativecommons\.org\/licenses\/by\//i.test(licURL);
        if(!isCC0&&!isCCBY)continue;
        if(!Number.isFinite(info?.width)||info.width<1100||info.height<650)continue;
        const fileTitle=String(page.title||"");
        if(/\.pdf$|\.svg$|\.png$|logo|insignia|flag|emblem|map|diagram|icon|coat.of.arms|chart|poster|banner/i.test(fileTitle))continue;
        // Never show a foreign police force/building as imagery of Rondônia.
        // Commons search is fuzzy: e.g. "police vehicle Brazil" can return Norway.
        const headlineArea=(title+" "+category).toLowerCase();
        const isTimberCase=isTimberVisualStory(headlineArea);
        const isFireCase=/inc[eê]ndio|bombeir|queimad|combate.*fogo/.test(headlineArea);
        if(isFireCase&&!/bombeir|firefighte|fire.engine|fire.truck|inc[eê]ndio|combate.*fogo/i.test(fileTitle))continue;
        if(isFireCase&&/historical|historic|vintage|desfile|parade|museum|museu|military.parade/i.test(fileTitle))continue;
        if(isTimberCase&&!/logging|timber|lumber|(?:^|[^a-z])logs(?:[^a-z]|$)|madeireir|desmat|troncos|toras|wood truck|caminh[aã]o.*madeira/.test(fileTitle.toLowerCase()))continue;
        if(isTimberCase&&/\.pdf\b|wood vault|carbon sequestration|bioenergy|biomass|rendering|chart|diagram|illustration|ai generated/.test(fileTitle.toLowerCase()))continue;
        if(isTimberCase&&/police vehicle|police car|viatura|patrol|dodge/.test(fileTitle.toLowerCase()))continue;
        const isLocalPolice=!isTimberCase&&/pol[ií]cia|pris[aã]o|tr[aá]fico|homic|feminic|opera[cç][aã]o|viatura/.test(headlineArea);
        // Avoid unrelated police forces: an image from Brasília/SP/RJ is not
        // illustrative of a Rondônia unit merely because it says "Brazil".
        const isRondoniaCase=isLocalPolice&&isRondoniaEditorial(title,category);
        if(isRondoniaCase&&!/rond[oô]nia|porto[ _.-]?velho|jaru|pmro|pol[ií]cia.civil.de.rond[oô]nia|pol[ií]cia.militar.de.rond[oô]nia|cacoal|ariquemes|vilhena|ji[ _.-]?paran[aá]/i.test(fileTitle))continue;
        if(!isRondoniaCase&&isLocalPolice&&!/brasil|brazil|brasileir|rond[oô]nia|porto.velho|jaru|cuiab[aá]|pol[ií]cia.(militar|civil|federal)|police.in.brazil|pmro|prf\b|viatura/i.test(fileTitle))continue;
        if(/norway|norge|norwegian|norsk|germany|france|italy|spain|sweden|england|new.york|united.states|united.kingdom/i.test(fileTitle))continue;
        // Exclude visibly obsolete foreign-state fleets from contemporary police news.
        // A file from another Brazilian state is not automatically an accurate
        // depiction of Rondônia. Use only local-context files when named.
        if(isLocalPolice&&/rio.de.janeiro|s[aã]o.paulo|paran[aá]|minas.gerais|rio.grande.do.sul|bahia|pernambuco|amazonas|acre|esp[ií]rito.santo|fortaleza|salvador/i.test(fileTitle))continue;
        if(isLocalPolice&&/(?:^|[^0-9])(?:19[0-9]{2}|200[0-9])(?:[^0-9]|$)/i.test(fileTitle))continue;
        const asset=String(info.thumburl||info.url||"");
        let url:URL;try{url=new URL(asset)}catch{continue}
        if(url.protocol!=="https:"||!["upload.wikimedia.org","thumb.wikimedia.org"].includes(url.hostname))continue;
        const creator=stripPhotoMarkup(meta?.Artist?.value)||"Autor não identificado";
        if(isCCBY&&creator==="Autor não identificado")continue;
        const assetRes=await fetch(url.toString(),{signal:AbortSignal.timeout(9500)});
        if(!assetRes.ok)continue;
        const mime=(assetRes.headers.get("content-type")||"").split(";")[0];
        if(mime!=="image/jpeg"&&mime!=="image/webp")continue;
        const bytes=new Uint8Array(await assetRes.arrayBuffer());
        if(bytes.length<20000||bytes.length>6_000_000)continue;
        return {
          dataUri:"data:"+mime+";base64,"+b64(bytes),
          creator,license:lic,
          source:String(info?.descriptionurl||"https://commons.wikimedia.org/wiki/"+encodeURIComponent(fileTitle.replace(/ /g,"_")))
        };
      }
    }catch{/* license not verifiable: leave photo absent */}
  }
  // Openverse is a secondary source; metadata, regionality, and license still must pass.
  return await licensedOpenversePhoto(title,category);
}


async function licensedOpenversePhoto(title:string,category:string):Promise<EditorialPhoto|null>{
  // Secondary source with file-level CC0/CC-BY metadata. Not a license for any news-site OG image.
  const t=(title+" "+category).toLowerCase();
  let terms=licensingTopic(title,category);
  const timberTopic=isTimberVisualStory(t);
  if(!timberTopic&&/pol[ií]cia|pris[aã]o|tr[aá]fico|homic|opera[cç][aã]o/.test(t))
    terms=["Brazilian police car","blue red emergency vehicle lights close up"];
  for(const term of terms){
    try{
      const api=new URL("https://api.openverse.org/v1/images/");
      api.searchParams.set("q",term);
      api.searchParams.set("license","cc0,by");
      api.searchParams.set("category","photograph");
      api.searchParams.set("page_size","15");
      const found=await fetch(api.toString(),{signal:AbortSignal.timeout(6800),headers:{"Accept":"application/json"}});
      if(!found.ok)continue;
      const response=await found.json().catch(()=>({}));
      for(const photo of Array.isArray(response?.results)?response.results:[]){
        const lic=String(photo?.license||"").toLowerCase();
        if(lic!=="cc0"&&lic!=="by"||photo?.mature===true)continue;
        const licUrl=String(photo?.license_url||"");
        const goodLic=lic==="cc0"?/creativecommons\.org\/publicdomain\/zero\//.test(licUrl):
          /creativecommons\.org\/licenses\/by\//.test(licUrl);
        if(!goodLic)continue;
        const creator=clean(photo?.creator).slice(0,90);
        if(lic==="by"&&!creator)continue;
        const imageTitle=clean(photo?.title).toLowerCase();
        const fireItem=/inc[eê]ndio|bombeir|queimad|combate.*fogo/.test(t);
        if(fireItem&&!/bombeir|firefighte|fire.engine|fire.truck|inc[eê]ndio|combate.*fogo/i.test(imageTitle))continue;
        if(fireItem&&/historical|historic|vintage|desfile|parade|museum|museu/i.test(imageTitle))continue;
        if(timberTopic&&!/logging|timber|lumber|(?:^|[^a-z])logs(?:[^a-z]|$)|madeireir|desmat|troncos|toras|wood truck|caminh[aã]o.*madeira/.test(imageTitle))continue;
        if(timberTopic&&/\.pdf\b|wood vault|carbon sequestration|bioenergy|biomass|rendering|chart|diagram|illustration|ai generated/.test(imageTitle))continue;
        if(timberTopic&&/police vehicle|police car|viatura|patrol|dodge/.test(imageTitle))continue;
        if(/norway|norwegian|norge|norsk|germany|france|sweden|united states|united kingdom|rio de janeiro.*1987/.test(imageTitle))continue;
        const policeItem=!timberTopic&&/pol[ií]cia|pris[aã]o|tr[aá]fico|homic|opera[cç][aã]o/.test(t);
        if(policeItem&&isRondoniaEditorial(title,category)&&!/rond[oô]nia|porto.velho|jaru|cacoal|ariquemes|pmro|madeira.mamor[eé]/i.test(imageTitle))continue;
        if(policeItem&&!/brasil|brazil|brasileir|pol[ií]cia|viatura|emergency|lights|luzes|sirene|siren|police/.test(imageTitle))continue;
        if(policeItem&&/police|pol[ií]cia|viatura/.test(imageTitle)&&!/(brazil|brasil|brasileir|lights|luzes|sirene|siren)/.test(imageTitle))continue;
        const img=String(photo?.url||"");
        let addr:URL;try{addr=new URL(img)}catch{continue}
        if(addr.protocol!=="https:")continue;
        // Skip private, unknown and redirector domains, avoiding arbitrary URL requests.
        if(!/^(?:live\.staticflickr\.com|farm\d+\.staticflickr\.com|upload\.wikimedia\.org|images\.pexels\.com|images\.unsplash\.com)$/.test(addr.hostname))continue;
        const result=await fetch(addr.toString(),{signal:AbortSignal.timeout(8500)});
        if(!result.ok)continue;
        const mime=String(result.headers.get("content-type")||"").split(";")[0];
        if(mime!=="image/jpeg"&&mime!=="image/webp")continue;
        const bytes=new Uint8Array(await result.arrayBuffer());
        if(bytes.length<18000||bytes.length>5_000_000)continue;
        const source=String(photo?.foreign_landing_url||"");
        if(!/^https:\/\//.test(source))continue;
        return {dataUri:"data:"+mime+";base64,"+b64(bytes),
          creator:creator||"Openverse",license:lic==="cc0"?"CC0":"CC BY "+clean(photo?.license_version||""),
          source};
      }
    }catch{/* discard unverifiable photos, use safe branded fallback */}
  }
  return null;
}


function isRondoniaEditorial(title:string,source:string){
 const s=(title+" "+source).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 return /porto velho|rondonia|rio madeira|nova mamore|\bro\b|jaru|cujubim|ariquemes|ji.parana|vilhena|cacoal|guajara|madeira.mamore|pmro|policia civil de rondonia|news rondonia|rondonia ao vivo/.test(s);
}
let rioPhotoQaState="not_called";
async function licensedRioMadeiraPhoto():Promise<EditorialPhoto|null>{
  // User's regional-brand requirement: show real Rio Madeira landmark if no
  // relevant licensed photo exists; NEVER pretend it depicts the police event.
  rioPhotoQaState="requested";
  try{
    const filename="File:Porto Velho, Rondônia, Brasil.jpg";
    const api=new URL("https://commons.wikimedia.org/w/api.php");
    for(const [k,v] of Object.entries({
      action:"query",titles:filename,prop:"imageinfo",
      iiprop:"url|size|extmetadata",iiurlwidth:"1500",format:"json",formatversion:"2"
    }))api.searchParams.set(k,v);
    const response=await fetch(api.toString(),{signal:AbortSignal.timeout(9000),
      headers:{"User-Agent":"GiroMadeiraEditorial/1.0 (copyright checks; source Commons)"}});
    if(!response.ok){rioPhotoQaState="commons_api_http_"+response.status;return null;}
    const body=await response.json();
    const page=(body?.query?.pages||[])[0],info=page?.imageinfo?.[0],meta=info?.extmetadata||{};
    const license=stripPhotoMarkup(meta?.LicenseShortName?.value);
    const licenseUrl=String(meta?.LicenseUrl?.value||"");
    rioPhotoQaState="metadata_"+license+"_"+String(licenseUrl).slice(0,85);
    if(!/^CC0(?:\s|$)/i.test(license)||!/creativecommons\.org\/publicdomain\/zero\//i.test(licenseUrl))return null;
    const fileUrl=String(info?.thumburl||info?.url||"");
    let target:URL;try{target=new URL(fileUrl)}catch{rioPhotoQaState="bad_image_url";return null}
    if(target.protocol!=="https:"||!["upload.wikimedia.org","thumb.wikimedia.org"].includes(target.hostname)){rioPhotoQaState="untrusted_image_host";return null;}
    const pic=await fetch(target.toString(),{signal:AbortSignal.timeout(9500)});
    if(!pic.ok||!String(pic.headers.get("content-type")||"").startsWith("image/jpeg")){rioPhotoQaState="image_http_"+pic.status+"_mime_"+String(pic.headers.get("content-type"));return null;}
    const content=new Uint8Array(await pic.arrayBuffer());
    if(content.byteLength<20000||content.byteLength>5_000_000){rioPhotoQaState="invalid_image_size_"+content.byteLength;return null;}
    rioPhotoQaState="success_png_bytes_"+content.byteLength;
    return {dataUri:"data:image/jpeg;base64,"+b64(content),
      creator:"Silva Júnior / MTur",license:"CC0",
      source:"https://commons.wikimedia.org/wiki/File:Porto_Velho,_Rond%C3%B4nia,_Brasil.jpg"};
  }catch(e){rioPhotoQaState="exception_"+String(e).slice(0,100);return null}
}

// Generic illustrated heroes intentionally disabled: photographic editorial layout only.
// Identidade oficial aprovada 10/10/2026; cenário Rio Madeira fixo no rodapé.
function rioFooterSvg(W:number,H:number,portrait:boolean){
  const y=portrait?1764:960, hh=H-y;
  const skyline=y+Math.round(hh*.45), river=y+Math.round(hh*.61);
  return '<g>' +
    '<defs><linearGradient id="rioFooterBg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#082239"/><stop offset=".52" stop-color="#d78e47"/><stop offset="1" stop-color="#07192b"/></linearGradient>'+
    '<linearGradient id="rioFooterRiver" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d4a15b"/><stop offset="1" stop-color="#123b58"/></linearGradient></defs>'+
    '<rect x="0" y="'+y+'" width="'+W+'" height="'+hh+'" fill="url(#rioFooterBg)"/>'+
    '<circle cx="'+Math.round(W*.76)+'" cy="'+(y+Math.round(hh*.28))+'" r="'+Math.round(hh*.32)+'" fill="#ffd082" opacity=".65"/>'+
    '<path d="M0 '+skyline+' Q180 '+(skyline-13)+' 340 '+skyline+' T740 '+(skyline-5)+' T1080 '+skyline+' L1080 '+river+' L0 '+river+'Z" fill="#0e293b" opacity=".85"/>'+
    '<path d="M0 '+river+' Q240 '+(river-10)+' 520 '+(river+10)+' T1080 '+skyline+' L1080 '+river+' L0 '+river+'Z" fill="#0e293b" opacity=".8"/>'+
    '<path d="M0 '+river+' Q240 '+(river-10)+' 520 '+(river+10)+' T1080 '+(river-3)+' L1080 '+H+' L0 '+H+'Z" fill="url(#rioFooterRiver)"/>'+
    '<path d="M20 '+(river+Math.round(hh*.13))+' Q260 '+(river+Math.round(hh*.02))+' 520 '+(river+Math.round(hh*.14))+' T1060 '+(river+Math.round(hh*.08))+'" fill="none" stroke="#fff2ce" stroke-opacity=".35" stroke-width="3"/>'+
    '<rect x="0" y="'+y+'" width="'+W+'" height="'+hh+'" fill="#04101b" opacity=".36"/>'+
    '<text x="'+Math.round(W*.50)+'" y="'+(y+25)+'" text-anchor="middle" font-family="Inter" font-size="18" font-weight="800" letter-spacing="4" fill="#ffe3a0" opacity=".85">RIO MADEIRA • PORTO VELHO</text>'+
    '</g>';
}
function headlineBlockOfficial(lines:string[],x:number,y:number,fs:number,lh:number){
  return '<text x="'+x+'" y="'+y+'" font-family="Anton" font-size="'+fs+'" font-weight="900" stroke="#020a12" stroke-opacity=".30" stroke-width="1.5" paint-order="stroke" letter-spacing=".2">' +
    lines.map((l,i)=>'<tspan x="'+x+'" dy="'+(i===0?0:lh)+'" fill="'+(i===lines.length-1?"#FFCC1C":"#FFFFFF")+'">'+esc(l)+'</tspan>').join('') + '</text>';
}
function originalGraphicHero(W:number,H:number,title:string,category:string){
  // Original SVG vector motifs, not a photo, reenactment or reconstruction of an event.
  const t=(title+" "+category).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const cx=540,cy=Math.round(H*.26);
  let motif="";
  if(/furacao|tempestade|chuva|vento|inundac|enchente|clima|alerta meteorolog/.test(t)){
    motif='<g fill="none" stroke="#ffcc1c" stroke-width="21" stroke-linecap="round">'+
      '<path d="M175 '+(cy-44)+' Q375 '+(cy-205)+' 585 '+(cy-72)+' Q745 '+(cy+42)+' 882 '+(cy-137)+'"/>'+
      '<path d="M178 '+(cy+67)+' Q425 '+(cy-45)+' 623 '+(cy+67)+' Q785 '+(cy+158)+' 908 '+(cy+32)+'"/>'+
      '</g><g stroke="#85b7d0" stroke-width="9"><path d="M265 '+(cy+154)+' L236 '+(cy+214)+' M490 '+(cy+140)+' L465 '+(cy+200)+' M728 '+(cy+147)+' L705 '+(cy+203)+'"/></g>';
  }else if(/acidente|transito|rodovia|trem|colisao|transporte/.test(t)){
    motif='<g fill="none" stroke="#ffcc1c" stroke-width="19">'+
      '<path d="M425 '+(cy-210)+' L225 '+(cy+225)+' M655 '+(cy-210)+' L855 '+(cy+225)+'"/>'+
      '<path d="M540 '+(cy-186)+' L540 '+(cy-106)+' M540 '+(cy-42)+' L540 '+(cy+39)+' M540 '+(cy+108)+' L540 '+(cy+196)+'"/></g>';
  }else if(/prisao|preso|policia|investigac|operacao|seguranca|crime|homicidio/.test(t)){
    // Distinct editorial lighting / lines, never a generic fake police badge or crime-scene photo.
    motif='<g><path d="M110 '+(cy-165)+' H970 V'+(cy-85)+' H110Z" fill="#ffcc1c"/>'+
      '<path d="M110 '+(cy+72)+' H970 V'+(cy+117)+' H110Z" fill="#80b6d2"/>'+
      '<path d="M155 '+(cy-45)+' H925 M155 '+(cy+20)+' H925" stroke="#ffffff" stroke-opacity=".45" stroke-width="4"/>'+
      '<path d="M198 '+(cy-225)+' L75 '+(cy+214)+' M882 '+(cy-225)+' L1004 '+(cy+214)+'" stroke="#ffcc1c" stroke-opacity=".4" stroke-width="16"/></g>';
  }else if(/saude|hospital|vacina|medic|dengue/.test(t)){
    motif='<rect x="457" y="'+(cy-233)+'" width="166" height="470" rx="22" fill="#ffcc1c"/>'+
      '<rect x="306" y="'+(cy-84)+'" width="468" height="170" rx="22" fill="#ffcc1c"/>';
  }else if(/economia|dinheiro|imposto|preco|inflacao|mercado|banco/.test(t)){
    motif='<g fill="#ffcc1c"><rect x="266" y="'+(cy+23)+'" width="116" height="192" rx="10"/>'+
      '<rect x="460" y="'+(cy-75)+'" width="116" height="290" rx="10"/>'+
      '<rect x="654" y="'+(cy-187)+'" width="116" height="402" rx="10"/></g>';
  }else{
    motif='<g fill="none" stroke="#ffcc1c" stroke-width="15">'+
      '<circle cx="'+cx+'" cy="'+cy+'" r="212"/><circle cx="'+cx+'" cy="'+cy+'" r="133"/>'+
      '<path d="M310 '+(cy+195)+' L770 '+(cy-195)+' M310 '+(cy-195)+' L770 '+(cy+195)+'"/></g>';
  }
  return '<defs><linearGradient id="giroOriginalHeroBg" x1="0" y1="0" x2="1" y2="1">'+
    '<stop stop-color="#071627"/><stop offset=".52" stop-color="#17344f"/><stop offset="1" stop-color="#051321"/></linearGradient></defs>'+
    '<rect width="'+W+'" height="'+H+'" fill="url(#giroOriginalHeroBg)"/>'+
    '<circle cx="540" cy="'+cy+'" r="345" fill="#174f69" opacity=".32"/>'+
    '<circle cx="540" cy="'+cy+'" r="300" fill="none" stroke="#b8d7e6" stroke-opacity=".18" stroke-width="6"/>'+
    '<g>'+motif+'</g>';
}
function makeSvg(kind:"feed"|"story",title:string,summary:string,source:string,category:string,bg:string,urgent=false,photoCredit="",isEventPhoto=false,previewLabel=""){
  // Photo remains the first choice. The only fallback is a visibly labeled
  // original abstract vector composition: never a synthetic event photograph.
  const portrait=kind==="story",W=1080,H=portrait?1920:1080;
  const originalArt=bg==="original_editorial_illustration";
  if(!originalArt&&!bg.startsWith("data:image/"))throw new Error("visual_contract_media_required");
  const pad=portrait?66:58;
  const categoryY=portrait?1100:580,titleY=portrait?1250:710,maxBaseline=portrait?1585:884;
  const layout=fitHeadline(title,W-2*pad,4,portrait?84:64,portrait?39:35,
    maxBaseline-titleY,portrait?1.12:1.12);
  const lineHeight=Math.round(layout.size*1.12);
  const last=titleY+(layout.lines.length-1)*lineHeight;
  if(last>maxBaseline)throw new Error("visual_contract_headline_outside_safe_area");
  const obituary=/empres[aá]rio.*morre|morre.*empres[aá]rio/i.test(title);
  const cat=obituary?"LUTO":clean(category||"GIRO AGORA").toUpperCase().slice(0,22);
  const tagW=Math.min(735,Math.max(220,cat.length*(portrait?23:19)+90));
  const footerY=portrait?1842:1038;
  const brand=brandHeader(portrait?56:51,portrait?55:42,portrait?.70:.66);
  const photo=originalArt?originalGraphicHero(W,H,title,category):'<image href="'+bg+'" x="0" y="0" width="'+W+'" height="'+H+'" preserveAspectRatio="xMidYMid slice"/>';
  const gradient='<defs><linearGradient id="newsShade" x1="0" y1="0" x2="0" y2="1">'+
    '<stop offset="0" stop-color="#04101c" stop-opacity=".10"/>'+
    '<stop offset=".20" stop-color="#04101c" stop-opacity=".08"/>'+
    '<stop offset=".39" stop-color="#04101c" stop-opacity=".17"/>'+
    '<stop offset=".57" stop-color="#020c18" stop-opacity=".28"/>'+
    '<stop offset=".83" stop-color="#020912" stop-opacity=".97"/>'+
    '<stop offset="1" stop-color="#020912" stop-opacity="1"/></linearGradient></defs>';
  const flag='<path d="M'+pad+' '+categoryY+' H'+(pad+tagW)+
    ' L'+(pad+tagW-24)+' '+(categoryY+66)+' H'+pad+'Z" fill="#ffcc1c"/>'+
    '<text x="'+(pad+23)+'" y="'+(categoryY+46)+'" font-family="Anton" font-size="'+(portrait?43:38)+
    '" fill="#071526">'+esc(cat)+'</text>'+
    '<path d="M'+(pad+tagW+9)+' '+(categoryY+62)+' H'+(W-pad)+
    '" stroke="#ffcc1c" stroke-width="5"/>';
  const credit=previewLabel||(isEventPhoto?"FOTO DA NOTÍCIA":"ILUSTRAÇÃO EDITORIAL — NÃO É FOTO");
  const labelY=portrait?1050:540;
  const illustrative='<rect x="'+pad+'" y="'+(labelY-28)+'" width="'+(isEventPhoto?360:510)+'" height="42" rx="4" fill="#041526" opacity=".91"/>'+
    '<text x="'+(pad+10)+'" y="'+(labelY+1)+'" font-family="Inter" font-weight="800" font-size="20" fill="#fff">'+credit+'</text>';
  const sourceName=clean(source||"Giro Madeira").slice(0,37);
  const urgentTag=urgent&&!obituary?
    '<rect x="799" y="57" width="231" height="58" rx="5" fill="#dc1729"/>'+
    '<text x="814" y="98" font-family="Anton" font-size="35" fill="#fff">URGENTE</text>':"";
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+
   '" viewBox="0 0 '+W+' '+H+'">'+gradient+photo+
    '<rect width="'+W+'" height="'+H+'" fill="url(#newsShade)"/>'+
    brand+urgentTag+illustrative+flag+
    headlineBlockOfficial(layout.lines,pad,titleY,layout.size,lineHeight)+
    rioFooterSvg(W,H,portrait)+
    '<path d="M'+pad+' '+(portrait?1761:961)+' H'+(W-pad)+'" stroke="#ffcc1c" stroke-width="6"/>'+
    '<text x="'+pad+'" y="'+footerY+'" font-family="Anton" font-size="'+(portrait?33:27)+
    '" fill="#fff">@GIRO_MADEIRA</text>'+
    '<text x="'+(W-pad)+'" y="'+footerY+'" text-anchor="end" font-family="Inter" font-weight="750" font-size="'+(portrait?23:19)+
    '" fill="#fff">FONTE: '+esc(sourceName)+'</text></svg>';
}

async function render(svg:string,_font:Uint8Array){
 // Convert typography to SVG paths with the actual fonts BEFORE the remote worker.
 // Host fallback fonts previously changed the approved headline into monospaced text.
 await ensureWasm();
 const [display,regular]=await Promise.all([getDisplayFont(),getFont()]);
 const typeset=new Resvg(svg,{font:{fontBuffers:[display,regular],defaultFontFamily:"Anton"}});
 const outlinedSvg=typeset.toString();
 typeset.free();
 const u=Deno.env.get("SUPABASE_URL")||"",k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const sb=createClient(u,k);
 const {data:key,error}=await sb.rpc("giro_reels_worker_key_get");
 if(error||!key)throw new Error("render_worker_key_missing");
 const r=await fetch("https://giro-reels-worker-production.up.railway.app/render-art",{
  method:"POST",headers:{"Content-Type":"application/json","x-giro-worker-key":String(key)},
  body:JSON.stringify({svg:outlinedSvg}),signal:AbortSignal.timeout(85000)
 });
 if(!r.ok)throw new Error("render_art_worker_http_"+r.status+":"+(await r.text()).slice(0,220));
 if(!(r.headers.get("content-type")||"").includes("image/png"))throw new Error("render_worker_wrong_content_type");
 const b=new Uint8Array(await r.arrayBuffer());
 if(b.length<10000||b.length>16000000)throw new Error("render_worker_invalid_png");
 return b;
}
async function maybeCopyVideo(sb:any,raw:string,id:number,channel='legacy'){
  if(!raw) return {source:"",publicUrl:""};
  try{
    const u=new URL(raw); const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(),20000);
    const r=await fetch(u.toString(),{signal:ctl.signal,headers:{"User-Agent":"Mozilla/5.0"}});
    clearTimeout(to);
    if(!r.ok) return {source:u.toString(),publicUrl:""};
    const ct=(r.headers.get("content-type")||"").split(";")[0];
    if(!ct.includes("video/mp4")) return {source:u.toString(),publicUrl:""};
    const ab=await r.arrayBuffer(); if(ab.byteLength>20*1024*1024) return {source:u.toString(),publicUrl:""};
    const path=`auto/${channel}/${id}-${Date.now()}.mp4`;
    const up=await sb.storage.from("news-videos").upload(path,new Uint8Array(ab),{contentType:"video/mp4",upsert:false});
    if(up.error) return {source:u.toString(),publicUrl:""};
    return {source:u.toString(),publicUrl:sb.storage.from("news-videos").getPublicUrl(path).data.publicUrl};
  }catch{return {source:raw,publicUrl:""}}
}

Deno.serve(async(req)=>{
  const url=Deno.env.get("SUPABASE_URL"),role=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!role) return new Response(JSON.stringify({success:false,error:"Configuração Supabase ausente"}),{status:500,headers:H});
  const sb=createClient(url,role);
  try{
    const provided=req.headers.get("x-giro-db-key")||"";
    const {data:valid,error:authError}=await sb.rpc("validar_giro_dispatch_key",{p_key:provided});
    if(authError) throw authError;
    if(valid!==true) return new Response(JSON.stringify({success:false,error:"Unauthorized"}),{status:401,headers:H});
    const body=await req.json().catch(()=>({}));
    // Diagnóstico administrativo read-only: nunca retorna tokens nem gera cobranças.
    if(body?.diagnostico_capacidades===true){
      return new Response(JSON.stringify({
        success:true,read_only:true,
        extra_paid_ai_costs_forbidden:EXTRA_PAID_AI_COSTS_FORBIDDEN,
        image_api_enabled:false,
        image_api_model:null,
        can_generate_images_automatically:false,
        can_compose_free_licensed_photo_templates:true,
        notes:"Sem API de IA paga. Usar imagens CC validadas e templates próprios. Sem arte adequada: manter rascunho para revisão."
      }),{headers:H});
    }

    // Authenticated ingest only: evidence is reviewed separately; never grants approval.
    if(body?.ingest_registry_photo===true){
      const registryId=Number(body.registry_id);
      const found=await sb.from("giro_imagens_autorizadas").select("*").eq("id",registryId).single();
      if(found.error)throw found.error;
      const p=found.data;
      if(!p.rights_verified||!p.social_use_allowed||!p.adaptation_allowed||!p.commercial_use_allowed||
         !p.evidence_url||!p.credit_line||!p.reviewed_at)
        return new Response(JSON.stringify({success:false,error:"reviewed_rights_required"}),{status:409,headers:H});
      const origin=new URL(p.original_image_url);
      if(origin.protocol!=="https:"||!["imagens.ebc.com.br","agenciabrasil.ebc.com.br"].includes(origin.hostname))
        return new Response(JSON.stringify({success:false,error:"ingest_source_not_allowed"}),{status:422,headers:H});
      const downloaded=await fetch(origin,{signal:AbortSignal.timeout(15000),redirect:"error"});
      const ct=String(downloaded.headers.get("content-type")||"").split(";")[0];
      if(!downloaded.ok||!["image/jpeg","image/png","image/webp"].includes(ct))throw Error("photo_download_failed");
      const bytes=new Uint8Array(await downloaded.arrayBuffer());
      if(bytes.length<10000||bytes.length>4*1024*1024)throw Error("photo_size_invalid");
      const ext=ct==="image/png"?"png":ct==="image/webp"?"webp":"jpg";
      const path="approved/registry-"+registryId+"."+ext;
      const uploaded=await sb.storage.from("giro-imagens-autorizadas").upload(path,bytes,{contentType:ct,upsert:true});
      if(uploaded.error)throw uploaded.error;
      const saved=await sb.from("giro_imagens_autorizadas").update({storage_path:path}).eq("id",registryId);
      if(saved.error)throw saved.error;
      return new Response(JSON.stringify({success:true,registry_id:registryId,storage_path:path,approval_not_changed:true,publication_not_attempted:true}),{headers:H});
    }

    const autoPipeline=body?.auto_pipeline===true;
    const channel=String(body?.channel||'legacy');
    if(!['legacy','feed','stories','reels'].includes(channel))return new Response(JSON.stringify({success:false,error:'invalid_channel'}),{status:400,headers:H});
    const publicationTable=channel==='legacy'?'giro_madeira_publicacoes':'giro_publicacoes_'+channel;
    const id=Number(body?.publication_id||body?.id);
    if(!id) return new Response(JSON.stringify({success:false,error:"publication_id obrigatório"}),{status:400,headers:H});
    const q=await sb.from(publicationTable).select("*").eq("id",id).maybeSingle();
    if(q.error) throw q.error; if(!q.data) return new Response(JSON.stringify({success:false,error:"Publicação não encontrada"}),{status:404,headers:H});
    const item:any=q.data;
    // Regenerating an already-published item would risk changing historical assets.
    if(body?.preview_art!==true&&(item.status==="publicada"||item.instagram_media_id||item.instagram_story_media_id||item.instagram_reel_media_id))
      return new Response(JSON.stringify({success:false,error:"already_published_no_regeneration"}),{status:409,headers:H});
    // Aprovação manual nunca pode ser sobrescrita pelo radar automático.
    if(body?.preview_art!==true&&item.visual_approved===true)
      return new Response(JSON.stringify({success:false,error:"approved_visual_protected_no_regeneration"}),{status:409,headers:H});
    if(body?.preview_art===true){
      const visualSmoke=body?.qa_layout_smoke===true&&body?.qa_embed===true;
      const title=visualSmoke
        ? (body.qa_layout_smoke_long===true
            ? "POLÍCIA CIVIL LOCALIZA E PRENDE EM CUIABÁ INVESTIGADO POR HOMICÍDIO E TENTATIVA DE HOMICÍDIO EM JARU"
            : "PRÉVIA TÉCNICA — NÃO PUBLICAR")
        :clean(item.titulo);
      const category=visualSmoke?"REGIÃO":clean(item.categoria)||classify(title);
      await prepareBrandLogo();const font=new Uint8Array();
      const isRegional=isRondoniaEditorial(title,clean(item.fonte_nome));
      // Em operacoes policiais locais, evitar fotos de outras policias/estados:
      // elas seriam confundidas com a ocorrencia. Usar a arte original do Rio Madeira.
      const sensitiveRegionalOperation=isRegional &&
        !isTimberVisualStory(title+" "+category) &&
        /opera[cç][aã]o|apreens[aã]o|pris[aã]o|investiga[cç][aã]o|homic/i.test(title+" "+category);
      // QA must obey the same bounded photo search as production; avoid timeout 546.
      const previewStarted=Date.now();
      const previewArticle=visualSmoke?"":await fetchPage(clean(item.fonte_url));
      const previewPage=load(previewArticle);
      const previewOriginal=absUrl(clean(previewPage('meta[property="og:image"]').attr("content")||previewPage('meta[name="twitter:image"]').attr("content")),clean(item.fonte_url));
      // A topical licensed image cannot be presented as a photo of the event.
      // A preview without exact provenance shows original, labeled artwork.
      const previewData=!visualSmoke&&previewOriginal?await imageDataUri(previewOriginal):"";
      const photo=visualSmoke?await licensedRioMadeiraPhoto():previewData?{
        dataUri:previewData,creator:"Prévia com foto da reportagem — uso não liberado",
        license:"não verificada",source:previewOriginal
      }:null;
            const attribution=photo?(photo.creator+" • "+photo.license):"";
      const feedSvg=makeSvg("feed",title,visualSmoke?"PRÉVIA DE LAYOUT • NÃO PUBLICAR":clean(item.resumo),visualSmoke?"FOTOGRAFIA CC0":clean(item.fonte_nome)||"Giro Madeira",category,photo?.dataUri||"original_editorial_illustration",visualSmoke?false:item.urgente===true,attribution,false,photo?"FOTO DA REPORTAGEM • PRÉVIA":"");
      const storySvg=makeSvg("story",title,visualSmoke?"PRÉVIA DE LAYOUT • NÃO PUBLICAR":clean(item.resumo),visualSmoke?"FOTOGRAFIA CC0":clean(item.fonte_nome)||"Giro Madeira",category,photo?.dataUri||"original_editorial_illustration",visualSmoke?false:item.urgente===true,attribution,false,photo?"FOTO DA REPORTAGEM • PRÉVIA":"");
      // QA requests generate only the asked image: avoid a second unused 1080x1920
      // render consuming memory and causing HTTP 503 with long headlines.
      const embed=body?.qa_embed===true;
      const onlyStory=body?.qa_format==="story";
      const feed=embed&&onlyStory?new Uint8Array():await render(feedSvg,font);
      const story=embed&&!onlyStory?new Uint8Array():await render(storySvg,font);
      // Authenticated read-only visual QA: no new rows, no uploads, no publishing.
      if(body?.qa_embed===true) return new Response(JSON.stringify({
        success:true,preview_art:true,qa_embed:true,publication_id:item.id,layout_smoke_test:visualSmoke,not_for_publication:true,
        visual_mode:photo?(!visualSmoke?"original_event_photo":"licensed_editorial_photo"):"original_illustration",
        illustrative_photo_credit:photo?{creator:photo.creator,license:photo.license,source:photo.source}:null,
        rio_photo_qa:rioPhotoQaState,
        qa_format:body?.qa_format==="story"?"story":"feed",
        image_png_base64:b64(body?.qa_format==="story"?story:feed)
      }),{status:200,headers:H});
      // Private QA path: publish preview files to Storage ONLY, never the Instagram API.
      // This does not alter the publication row or approve anything.
      const stamp=Date.now();
      const feedPath="previews/feed-"+id+"-"+stamp+".png";
      const storyPath="previews/story-"+id+"-"+stamp+".png";
      const [pf,ps]=await Promise.all([
        sb.storage.from("news-images").upload(feedPath,feed,{contentType:"image/png",upsert:false}),
        sb.storage.from("news-images").upload(storyPath,story,{contentType:"image/png",upsert:false})
      ]);
      if(pf.error||ps.error)throw new Error("Falha ao armazenar prévias de revisão.");
      const feedPreview=sb.storage.from("news-images").getPublicUrl(feedPath).data.publicUrl;
      const storyPreview=sb.storage.from("news-images").getPublicUrl(storyPath).data.publicUrl;
      return new Response(JSON.stringify({success:true,preview_art:true,publication_id:item.id,
        feed_bytes:feed.length,story_bytes:story.length,
        feed_size:"1080x1080",story_size:"1080x1920",
        feed_preview_url:feedPreview,story_preview_url:storyPreview,
        visual_mode:photo?(!visualSmoke?"original_event_photo":"licensed_editorial_photo"):"original_illustration",
        illustrative_photo_credit:photo?{creator:photo.creator,license:photo.license,source:photo.source}:null,
        source_label_visible:true,external_publisher_logo_used:false,
        owned_giro_brand:feedSvg.includes("@GIRO_MADEIRA")&&storySvg.includes("@GIRO_MADEIRA")}),
        {status:200,headers:H});
    }
    if(body?.preview_only===true){
      const title=clean(item.titulo),source=clean(item.fonte_nome)||"Giro Madeira",link=clean(item.fonte_url);
      if(!/^https:\/\//i.test(link)||!editorialAllowed(title,source,link))
        return new Response(JSON.stringify({success:false,error:"Fonte editorialmente bloqueada ou URL inválida."}),{status:422,headers:H});
      const html=await fetchPage(link),$=load(html);
      const desc=clean($('meta[property="og:description"]').attr("content")||$('meta[name="description"]').attr("content")||item.resumo);
      const article=articleText($);
      const draft=await writeOriginalSummary(title,desc,article,source);
      return new Response(JSON.stringify({success:true,preview_only:true,publication_id:item.id,
        titulo:title,source_name:source,source_url:link,article_characters:article.length,
        summary_characters:draft.length,summary_words:draft.trim().split(/\s+/).length,
        legenda:draft+"\n\nFonte: "+source+"\nMatéria original: "+link+"\n\n#GiroMadeira #PortoVelho #Rondônia",
        art_photo_source:"original_illustration_no_external_publisher_logo"}),{status:200,headers:H});
    }
    const generationStarted=Date.now();
    const generationBudgetMs=38000;
    const remainingGenerationMs=()=>Math.max(0,generationBudgetMs-(Date.now()-generationStarted));
    const withinBudget=()=>remainingGenerationMs()>9000;
    let pageTitle=clean(item.titulo),desc=clean(item.resumo),imageUrl="",videoRaw="",article="",sourceArticleHtml="";
    if(item.fonte_url){
      try{
        const html=await fetchPage(String(item.fonte_url)); sourceArticleHtml=html;const $=load(html);
        pageTitle=clean($('meta[property="og:title"]').attr("content")||$("h1").first().text()||pageTitle);
        desc=clean($('meta[property="og:description"]').attr("content")||$('meta[name="description"]').attr("content")||desc);
        article=articleText($);
         if(!desc&&article)desc=clean(article.slice(0,350));
        imageUrl=articleSourcePhoto($,String(item.fonte_url),clean(item.titulo||pageTitle));
        videoRaw=absUrl(clean($('meta[property="og:video:secure_url"]').attr("content")||$('meta[property="og:video"]').attr("content")||$("video source").first().attr("src")||""),String(item.fonte_url));
      }catch{}
    }
    const title=clean(item.titulo||pageTitle)||pageTitle;
    const category=clean(item.categoria)||classify(title);
    const source=clean(item.fonte_nome)||"Giro Madeira";
    const sourceLink=clean(item.fonte_url);
    if(!/^https:\/\//i.test(sourceLink)||!editorialAllowed(title,source,sourceLink))
      throw new Error("Matéria vaga/promocional, sem URL válida ou fonte Forbes: vetada editorialmente.");
    // SEO generic from portal author/tag pages is not factual reporting.
    if(/^(conteúdos relevantes,? artigos e notícias sobre|acesse a forbes|leia outras matérias de|encontre tudo sobre|veja todas as matérias de|mais conteúdos de)/i.test(desc))
      throw new Error("Descrição genérica do portal sem notícia contextualizada.");
    const originalText=await writeOriginalSummary(title,desc,article,source);
    // Reels nacionais/internacionais exigem repercussao regional documentada.
    // Um score editorial do radar nao representa medicao real de buscas.
    let reelInterestRo:any={elegivel:false,escopo:"sem_radar",buscas_locais_verificadas:false,
      repercussao_regional_verificada:false,motivo:"Sem vinculo com radar para conferir repercussao regional."};
    if(item.auto_origin_radar_id && (channel==='legacy'||channel==='reels')){
      const {data:check,error:checkError}=await sb.rpc(channel==='reels'?"giro_reels_interesse_independente":"giro_reel_interesse_regional",{
        p_radar_id:Number(item.auto_origin_radar_id)
      });
      if(checkError) throw new Error("Falha no filtro de interesse regional do Reel: "+checkError.message);
      reelInterestRo=check;
    }else if(isRondoniaEditorial(title,source)){
      reelInterestRo={elegivel:true,escopo:"local_regional",buscas_locais_verificadas:false,
        repercussao_regional_verificada:false,motivo:"Pauta regional manual, nao medida por buscas."};
    }
    const localEditorialReel=shouldReel(title,category,item.urgente===true);
    const reelRecommended=reelInterestRo?.elegivel===true &&
      (reelInterestRo?.escopo!=="local_regional" || localEditorialReel);
    // Use only images whose individual CC0/CC-BY license was verified, or owned illustration.
    // The news outlet OG image is retained for traceability, never copied into our artwork.
    const isRegional=isRondoniaEditorial(title,source);
    const sensitiveRegionalOperation=isRegional &&
      !isTimberVisualStory(title+" "+category) &&
      /opera[cç][aã]o|apreens[aã]o|pris[aã]o|investiga[cç][aã]o|homic/i.test(title+" "+category);
    const isCityIdentityStory=isRegional&&
      /(?:hist[oó]ria de porto velho|anivers[aá]rio de porto velho|rio madeira|locomotiva|cidade de porto velho|capital de rond[oô]nia)/i.test(title)&&
      !/(?:acidente|homic[ií]dio|pris[aã]o|inc[eê]ndio|v[ií]tima|suspeito|morte|opera[cç][aã]o|pol[ií]cia)/i.test(title);
    if(imageUrl)await discoverPhotoCandidate(sb,sourceLink,title,imageUrl,desc);
    const registered=await approvedRegistryPhoto(sb,url,sourceLink,title);
    const registeredData=registered?await imageDataUri(registered.image_url):"";
    const registeredPhoto:EditorialPhoto|null=registered&&registeredData?{
      dataUri:registeredData,creator:String(registered.record.credit_line),
      license:registered.record.license_kind==='cc0'?'CC0':registered.record.license_kind==='cc_by'?'CC BY '+String(registered.record.license_version||''):'Autorização individual verificada',
      source:String(registered.record.evidence_url),registryId:registered.id
    }:null;
    // Exact registered evidence is required for an actual event photograph.
    // Without it, prepare original art with an explicit illustration label for editorial review.
    // A separately licensed topical image may illustrate a story but never prove the event.
    // Sensitive subjects retain original symbolic art or wait for a verified event photo.
    const sensitiveIllustrativeSubject=/homic|feminic|estupr|sequest|v[ií]tima|ferid|morto|morte|assassin|pris[aã]o|suspeit|opera[cç][aã]o|pol[ií]cia|pol[ií]tica|presidente|deputad|senador|governador|vereador|elei[cç][aã]o/i.test(title+" "+category);
    const illustrativeStockPhoto=!registeredPhoto&&!sensitiveIllustrativeSubject&&withinBudget()&&licensingTopic(title,category).length>0
      ? await licensedEditorialPhoto(title,category)
      : null;
    // Only registeredPhoto is evidence of this actual event. The illustrative
    // photo remains visually labeled and must pass per-channel human review.
    const photo=registeredPhoto||illustrativeStockPhoto;
    // Photo-first, verified-rights only. When no event photo is licensed,
    // the independent daily channel may use an ORIGINAL TYPOGRAPHIC NEWS CARD.
    // This is not a photo, photomontage or reenactment; the art says so.
    // Captions and claims are subsequently checked against the source before
    // any publication. Never silently reproduce an article's OG image.
    const factualCard=channel!=='legacy'&&autoPipeline===true&&
      /^https:\/\//i.test(sourceLink)&&originalText.length>=190;
    if(!photo){
      const sourceSearch=withinBudget()
        ?await searchRegisteredPhotoSources(sb,sourceLink,title,load)
        :{searched:0,candidates:0,errors:["bounded_time_budget"]};
      if(!factualCard){
        await sb.from(publicationTable).update({
          media_status:"aguardando_verificacao_foto_e_licenca",visual_approved:false,
          source_image_url:imageUrl||null,erro:"photographic_layout_requires_verified_photo"
        }).eq("id",id).eq("status","pendente").eq("visual_approved",false);
        return new Response(JSON.stringify({success:true,id,needs_approved_art:true,
          visual_mode:"photo_pending",source_image_url:imageUrl||null,source_search:sourceSearch,
          reason:"photographic_layout_requires_verified_photo",publication_not_attempted:true}),{headers:H});
      }
    }

    const archivePhoto=/foto de arquivo/i.test(String(registered?.record?.event_description||""));
    const attribution=photo?photo.creator+" • "+photo.license:"";
    const bg=photo?photo.dataUri:"original_editorial_illustration";
    await prepareBrandLogo(); const font=new Uint8Array();
    const feed=await render(makeSvg("feed",title,desc,source,category,bg,item.urgente===true,attribution,!!registeredPhoto,archivePhoto?"FOTO DE ARQUIVO":illustrativeStockPhoto?"IMAGEM ILUSTRATIVA — NÃO É FOTO DO FATO":""),font);
    const story=await render(makeSvg("story",title,desc,source,category,bg,item.urgente===true,attribution,!!registeredPhoto,illustrativeStockPhoto?"IMAGEM ILUSTRATIVA — NÃO É FOTO DO FATO":""),font);
        const feedPath=`auto/feed/${channel}/${id}-${Date.now()}.png`,storyPath=`auto/story/${channel}/${id}-${Date.now()}.png`;
    const [uf,us]=await Promise.all([
      sb.storage.from("news-images").upload(feedPath,feed,{contentType:"image/png",upsert:false}),
      sb.storage.from("news-images").upload(storyPath,story,{contentType:"image/png",upsert:false})
    ]);
    if(uf.error) throw uf.error;if(us.error) throw us.error;
    const feedUrl=sb.storage.from("news-images").getPublicUrl(feedPath).data.publicUrl;
    const storyUrl=sb.storage.from("news-images").getPublicUrl(storyPath).data.publicUrl;
    // A publisher's embedded video is not automatically licensed for republication.
    // Keep its source URL only; original Reel media is made by the approved worker.
    const vid={source:videoRaw,publicUrl:""};
    const photoCredit=registeredPhoto
      ?("\n"+(archivePhoto?"Foto de arquivo: ":"Foto do acontecimento: "))+registeredPhoto.creator+" ("+registeredPhoto.license+") — "+registeredPhoto.source
      :illustrativeStockPhoto
      ?"\nImagem ilustrativa (NÃO retrata o acontecimento): "+illustrativeStockPhoto.creator+" ("+illustrativeStockPhoto.license+") — "+illustrativeStockPhoto.source
      :"\nILUSTRAÇÃO EDITORIAL ORIGINAL — representação gráfica simbólica, NÃO É FOTO DO ACONTECIMENTO.";
    const legenda=`${originalText}\n\nFonte: ${source}\nMatéria original: ${sourceLink}${photoCredit}\n\n#GiroMadeira #PortoVelho #Rondônia`;
    const upd:any={
      titulo:title,resumo:desc||item.resumo||null,categoria:category,legenda,
      image_url:feedUrl,feed_image_url:feedUrl,story_image_url:storyUrl,
      source_image_url:imageUrl||null,source_video_url:vid.source||null,
      publicar_story:channel==="reels"?false:true,publicar_reel:reelRecommended,reel_interesse_ro:reelInterestRo,video_url:item.video_url||null,
      status:"pendente",erro:null,story_erro:null,reel_erro:null,media_pipeline_version:channel==="feed"?6:5,media_status:"feed_pronto"
    };
    const up=await sb.from(publicationTable).update(upd).eq("id",id); if(up.error) throw up.error;
    return new Response(JSON.stringify({success:true,id,feed_image_url:feedUrl,story_image_url:storyUrl,reel_ready:Boolean(item.video_url),reel_recommended:reelRecommended,reel_interesse_ro:reelInterestRo,reel_generated:false,source_image_url:imageUrl||null,visual_mode:registeredPhoto?"registered_event_photo":illustrativeStockPhoto?"licensed_illustrative_photo":"original_factual_card",registered_image_id:registeredPhoto?.registryId||null,illustrative_photo_credit:illustrativeStockPhoto?{creator:illustrativeStockPhoto.creator,license:illustrativeStockPhoto.license,source:illustrativeStockPhoto.source}:null,awaiting_visual_approval:true,publication_not_attempted:true}),{headers:H});
  }catch(e){
    return new Response(JSON.stringify({success:false,error:e instanceof Error?e.message:String(e)}),{status:500,headers:H});
  }
});
