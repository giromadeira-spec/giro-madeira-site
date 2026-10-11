# Giro Madeira — Reels nacionais/internacionais com relevância para RO

Atualização do fluxo (10/10/2026). Semaforo Meta fica intocado.

## Intenção editorial
- Reels continuam a cobrir prioritariamente Porto Velho e Rondônia.
- Notícias nacionais e internacionais/mundo entram em Reels SOMENTE quando houver relevância para público de RO/PVH demonstrável.
- Fonte de notícia não é medição de público. Não afirmar "a mais pesquisada em Rondônia" se o dado vier só de clipping de jornais.
- Evitar rumores e material de origem duvidosa: checar manchete, fonte e data e confirmação por outras fontes.
- Não usar vídeo de terceiros sem direito de republicação; compor vídeo original 1080×1920, logo Giro Madeira, Rio Madeira como elemento fixo, arte oficial e SEM triângulo de play.

## Fontes
- Mantidas as fontes existentes locais e nacionais.
- Adicionadas ao radar: Agência Brasil — Internacional (https://agenciabrasil.ebc.com.br/internacional) e CNN Brasil — Internacional (https://www.cnnbrasil.com.br/internacional/).

## Algoritmo e proveniência
RPC interna `public.giro_reel_interesse_regional(radar_id)`:
- Pauta local/regional: elegível à decisão audiovisual `shouldReel` (polícia, acidente, alerta, esporte, eventos etc.).
- Pauta nacional/internacional: elegível só se (1) existe dado recente e registrado (48h) de buscas/acessos em RO/PVH com índice relativo >=70, **OU** (2) há cobertura comprovada do mesmo tópico por ao menos dois veículos regionais independentes nas últimas 48h, **OU** (3) existe impacto territorial direto em RO/PVH.
- Cobertura em jornais regionais é somente proxy de repercussão, NÃO de buscas, visualizações ou audiência.
- `public.giro_ro_interesse_sinais` guarda eventuais dados medidos com fonte, URL, categoria, região/índice e data. **Não há fonte automática regional de buscas ou acessos conectada até esta etapa; portanto não se deve afirmar que esse sinal já está funcionando.**
- Resultado editorial é preservado em `public.giro_madeira_publicacoes.reel_interesse_ro` com razões e evidências. Não usar `radar.trend_score` como volume de busca regional.
- A Edge Function `gerar-arte-noticia-vault` v41 chama a RPC e define `publicar_reel` e o retorno `reel_recommended`; o gerador visual permanece no layout aprovado.
- A Edge Function `auto-publicar-radar` v21 usa notícias descobertas há no máximo 36h para não ressuscitar o backlog antigo; na janela editorial de 14h de Porto Velho, tenta preferir 1 pauta nacional/mundo com interesse regional documentado. Caso não exista, mantém o fluxo normal local.
- O radar continua operando a cada 30 min, o planejamento de publicação permanece 06h–23h30 com intervalos editoriais; agendamento da seleção não significa publicação instantânea.

## Limitações atuais
- A API oficial de Google Trends com regiões está em acesso Alfa por inscrição, e não está conectada ao Giro Madeira. A tabela permite registrar dados reais de Trends/analytics quando houver integração aprovada.
- Nem repercussão por imprensa regional nem `trend_score` do radar provam procura elevada no Google ou acessos reais em Porto Velho.
- O Instagram mantém `integrity_hold=true` no Supabase (semáforo VERMELHO); a publicação automática de Reels **não foi religada**, nenhuma postagem experimental foi enviada. Para retomar, validar restrição Meta, revisão visual e semáforo e executar teste unitário controlado.

## Validação inicial
- RPC: notícia nacional sem sinal regional retorna `elegivel=false`; pauta local retorna `elegivel=true` para avaliação audiovisual.
- Fontes internacionais ativas em `giro_madeira_fontes`, ainda sujeitas a comprovação de captura pelos próximos ciclos do radar.
- Tabela `giro_ro_interesse_sinais`: 0 sinais reais registrados no momento da validação.
- Edge Functions implantadas ativas: `gerar-arte-noticia-vault` v41 e `auto-publicar-radar` v21.
