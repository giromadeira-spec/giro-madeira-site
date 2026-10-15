// TikTok-only policy. Importance is required before geographic priority applies.
export type Story = {titulo:string; fonte_nome?:string; fonte_url:string; score?:number; urgente?:boolean; source_published_at?:string|null};
export type Scope = 'brasil'|'mundo'|'rondonia';
const norm=(s:unknown)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const local=/\b(rondonia|porto velho|ji parana|ariquemes|vilhena|cacoal|guajara mirim)\b/;
// The Shorts/TikTok editorial scope is national/world only.
// An outlet name or a city in another Brazilian state does NOT by itself
// establish nationwide impact. Rondônia-local headlines stay outside this lane.
const roLocal=/\b(rondonia|porto velho|ji parana|ariquemes|vilhena|cacoal|guajara mirim|jaru|rolim de moura|pimenta bueno|candeias do jamari|machadinho do oeste|ouro preto do oeste|buritis|alto paraiso|presidente medici|espigao do oeste|em ro)\b/;
const nationwide=/\b(em todo o brasil|em todo o pais|no pais inteiro|em todo territorio nacional|nacional|nacionais|brasileiros|brasileiras|rodovias federais|brasil|governo federal|congresso nacional|senado federal|supremo tribunal federal|stf|tse|banco central|copom|selic|receita federal|presidente da republica|reforma tributaria|bolsa familia|pix|imposto de renda|policia federal|pf|prf)\b/;
const worldTopics=/\b(russia|ucrania|israel|ira|gaza|eua|estados unidos|china|mexico|nepal|paquistao|reino unido|africa|india|franca|alemanha|argentina|japao|sudao|libano|arabia saudita|coreia do sul|onu|uniao europeia|otan|guerra mundial)\b/;
export function geographicScope(s:Story):Scope|null {
 const t=norm(s.titulo),name=norm(s.fonte_nome),url=norm(s.fonte_url);
 const isRoMention=roLocal.test(t);
 const nationalReach=nationwide.test(t);
 // A local incident involving a federal agency is not automatically a
 // national headline when its principal subject is explicitly in Rondônia.
 if(isRoMention&&!/\b(em todo o brasil|em todo o pais|todo territorio nacional|rodovias federais)\b/.test(t))return 'rondonia';
 if(/\/(mundo|internacional|world|global)\//.test(url)||worldTopics.test(t)
   ||/internacional|reuters|bbc mundo|onu news|deutsche welle/.test(name))return 'mundo';
 if(nationalReach)return 'brasil';
 if(/\/ro\/rondonia\/|\.ro\.gov\.br/.test(url)||/rondonia|rondoniagora|portal jipa|o observador|na hora online/.test(name))return 'rondonia';
 // Only nationally-oriented desks can supply an otherwise unqualified
 // national topic; regional/city sections alone are not national proof.
 if(/g1 brasil|forbes brasil|agencia brasil|senado federal/.test(name)
   ||/g1\.globo\.com\/(politica|economia|brasil)\//.test(url))return 'brasil';
 return null;
}
export function importanceReason(s:Story):string|null {
 const t=norm(s.titulo);
 // Routine crime, weather, promotion, commentary and campaign quarrels are not breaking news.
 if(/carreta furacao/.test(t))return null;
 if(/\b(podcast|horoscopo|aniversario|curiosidade|fofoca|receita|sol entre nuvens|bolao|palpite)\b/.test(t)||/^(analise|opiniao):/.test(t))return null;
 if(/\b(diz|defende|promete|ironiza|pode|poderia|suposto|rumor)\b/.test(t))return null;
 if(/\b(guerra|invasao|bombardeio|ataque militar|ataques russos|ataques.*aeroportos|cessar[- ]fogo|crise humanitaria|estado de emergencia|calamidade|tsunami|terremoto|furacao|pandemia|emergencia sanitaria)\b/.test(t))return 'crise ou emergencia de grande impacto';
 if(/\b(selic|reforma tributaria|reforma da previdencia|impeachment|eleicoes presidenciais|resultado presidencial|renuncia.*presidente|presidente.*renuncia)\b/.test(t)&&/\b(aprova|aprovou|sanciona|sancionou|decide|decidiu|reduz|reduziu|eleva|elevou|vence|venceu|renuncia|resultado)\b/.test(t))return 'decisao nacional ou presidencial';
 if(/\b(milhoes|milhares|centenas|todo o pais|em todo o brasil|nacional|estadual|todo o estado)\b/.test(t)&&/\b(apagao|interrompe|suspende|afeta|evacuacao|enchente|epidemia|alerta|bloqueio|crise|colapso|escassez|greve|direitos|impostos)\b/.test(t))return 'impacto coletivo amplo';
 const casualties=t.match(/\b(\d+)\s+(?:pessoas\s+)?(?:mortos|mortas|feridos|feridas|vitimas)\b/);
 if(casualties&&Number(casualties[1])>=5)return 'ocorrencia grave com multiplas vitimas';
 if(/\b(cinco|seis|sete|oito|nove|dez|dezenas|centenas)\s+(mortos|mortas|feridos|feridas)\b/.test(t))return 'ocorrencia grave com multiplas vitimas';
 return null;
}
export function eligible(s:Story,now=Date.now()):boolean {
 const published=Date.parse(String(s.source_published_at||''));
 return Number.isFinite(published)&&published<=now+300000&&published>=now-24*3600000&&Number(s.score||0)>=25&&['brasil','mundo'].includes(String(geographicScope(s)))&&!!importanceReason(s);
}
export function comparePriority(a:Story,b:Story):number {
 const priority={brasil:0,mundo:1,rondonia:2};
 const delta=(priority[geographicScope(a)||'rondonia'])-(priority[geographicScope(b)||'rondonia']);
 return delta||Number(b.score||0)-Number(a.score||0)||Date.parse(String(b.source_published_at))-Date.parse(String(a.source_published_at));
}
