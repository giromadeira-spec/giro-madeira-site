// TikTok-only policy. Importance is required before geographic priority applies.
export type Story = {titulo:string; fonte_nome?:string; fonte_url:string; score?:number; urgente?:boolean; source_published_at?:string|null};
export type Scope = 'brasil'|'mundo'|'rondonia';
const norm=(s:unknown)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const local=/\b(rondonia|porto velho|ji parana|ariquemes|vilhena|cacoal|guajara mirim)\b/;
export function geographicScope(s:Story):Scope|null {
 const t=norm(s.titulo),name=norm(s.fonte_nome),url=norm(s.fonte_url);
 if(/\/(mundo|internacional|world|global)\//.test(url)||/internacional|reuters|bbc mundo|onu news|deutsche welle/.test(name))return 'mundo';
 if(/\b(tse|stf|supremo|congresso nacional|senado federal|governo federal|banco central|selic|lula|bolsonaro|brasil|brasileiros|nacional)\b/.test(t)&&!local.test(t))return 'brasil';
 if(/\b(russia|ucrania|israel|ira|gaza|eua|estados unidos|china|mexico|nepal|paquistao|reino unido|africa|india|franca|alemanha|argentina|japao|sudao|libano|arabia saudita)\b/.test(t)&&!local.test(t))return 'mundo';
 if(local.test(t)||/\/ro\/rondonia\/|\.ro\.gov\.br/.test(url))return 'rondonia';
 if(/\b(rj|sp|rio de janeiro|sao paulo|minas gerais|bahia|pernambuco|brasilia)\b/.test(t))return 'brasil';
 if(/g1 brasil|forbes brasil|agencia brasil|policia federal|senado federal|^prf$/.test(name)||/g1\.globo\.com\/(politica|economia|brasil)/.test(url)||url.includes('gov.br/pf/'))return 'brasil';
 if(/rondonia|rondoniagora|portal jipa|o observador|na hora online/.test(name))return 'rondonia';
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
 return Number.isFinite(published)&&published<=now+300000&&published>=now-24*3600000&&Number(s.score||0)>=25&&!!geographicScope(s)&&!!importanceReason(s);
}
export function comparePriority(a:Story,b:Story):number {
 const priority={brasil:0,mundo:1,rondonia:2};
 const delta=(priority[geographicScope(a)||'rondonia'])-(priority[geographicScope(b)||'rondonia']);
 return delta||Number(b.score||0)-Number(a.score||0)||Date.parse(String(b.source_published_at))-Date.parse(String(a.source_published_at));
}
