# Giro Madeira — radares independentes

Implantado em 11/10/2026. Esta configuração substitui a coleta/preparação compartilhada descrita em documentos anteriores. Os estados históricos permanecem preservados.

## Separação obrigatória

Cada formato tem coleta, consumo, cadência, fila, erros, revisão e confirmação próprios. Alterar Instagram Feed nunca altera Shorts, Reels, Stories ou TikTok. Formatos do Instagram compartilham somente o limite/bloqueio da conta Meta, não o estado editorial.

| Canal | Radar | Preparação | Fila |
| --- | --- | --- | --- |
| Shorts | `giro_radar_shorts` — 15 min | Planejador/Storyboard próprios | `giro_social_video_queue.platform=youtube_shorts` |
| TikTok | `giro_radar_tiktok` — 15 min, defasado 3 min | Planejador/Storyboard/render próprios e cópia 30fps | `giro_social_video_queue.platform=tiktok` |
| Feed | `giro_radar_feed` — 1 hora | Preparador independente | `giro_publicacoes_feed` |
| Stories | `giro_radar_stories` — 1 hora, defasado 20 min | Preparador independente | `giro_publicacoes_stories` |
| Reels | `giro_radar_reels` — 1 hora, defasado 10 min | Preparador independente e vídeo do próprio rascunho | `giro_publicacoes_reels` |

Instagram coleta/prepara na janela 06h–23h30 de `America/Porto_Velho`, com mínimo de 90 minutos entre novos rascunhos por formato e máximo de oito em 24 horas. Consulta da fila não equivale a publicação.

Shorts mantém planejamento para 08h/20h de Porto Velho. O workflow também renderiza antes, às 07h/19h, e conserva as recuperações. TikTok planeja 06h30/10h/13h30/17h/20h30 de Porto Velho e renderiza a própria fila: não exige vídeo já enviado, ID público ou sucesso do YouTube.

## Identidade visual comum

Contrato único: `GIRO_EDITORIAL_FOTO_MANCHETE_RIO_V1`, conforme `AGENTS.md`, `GIRO_MADEIRA_PADRAO_VISUAL.md` e `REFERENCIA_CAPA_OFICIAL.md`. Logo original, fotografia pertinente/licenciada, categoria amarela, manchete branco/amarelo, Rio Madeira e ausência de play.

Shorts e TikTok usam o mesmo renderizador Python com audiências OIDC e filas separadas. Feed/Stories usam o compositor comum existente com parâmetro explícito `channel`; Reels anima a mídia da sua própria linha. Dimensão/encode não equivalem a aprovação editorial. Revisão da mídia final continua necessária.

As fontes e o código de renderização podem ser compartilhados. Estado de descoberta, consumo de pauta, aprovação, tentativas, horário e ID do provedor nunca podem ser compartilhados entre canais.

## Configurar somente um canal

`giro_channel_settings` tem cinco linhas. Para mudar frequência, usar a RPC restrita:

```sql
select public.giro_configurar_radar_independente('feed','0 */2 * * *',null);
```

Ela muda somente `giro-radar-feed` e sua configuração. `null` preserva a frequência de preparação. Não editar o cron de outro canal nem a tabela singleton dos Shorts para mudar Instagram/TikTok.

Diagnóstico de leitura:

```sql
select public.giro_radares_status_independentes();
```

Os endpoints exigem a chave interna validada por RPC ou OIDC GitHub com repositório, ID, workflow, branch e audiência verificados. Nenhum segredo é versionado. Tabelas novas têm RLS e acesso exclusivo da service role.

## Estado de publicação e autorização

Radares e preparação estão ativos. Na implantação inicial, `publication_enabled=false` em todos os novos canais, aguardando aprovação separada. Em 11/10/2026, o operador aprovou a publicação automática SOMENTE de `shorts`, e foi aplicado `giro_channel_settings.publication_enabled=true` para `channel='shorts'` no Supabase de produção. TikTok, Feed, Stories e Reels permanecem `false`. Shorts tem gate no uploader; TikTok tem gate na reserva de envio; Instagram tem gate no dispatcher e no publicador.

Não habilitar publicação silenciosamente. Instagram ainda possui `integrity_hold=true` e `rollout_stage=feed_only`; aprovação do usuário não remove uma restrição da Meta. Feed/Reels/Stories passam também pelo semáforo central da conta.

O caminho de envio independente do Instagram não foi testado com publicação real. Erro ambíguo mantém a linha em revisão, sem reenvio automático. As filas novas não aparecem no Plano B legado, que continua atendendo somente os pacotes históricos; consultar as tabelas próprias acima.

## Transição e deduplicação

- Radares foram inicializados com os registros existentes, preservando IDs necessários à fila atual dos Shorts, e passaram a coletar separadamente.
- Publicações históricas continuam na tabela original. Os preparadores não recriam URLs já presentes no fluxo legado; as filas novas recebem apenas pautas novas elegíveis.
- URLs/IDs de origem são únicos dentro de cada fila; similaridade de manchetes é conferida dentro de cada formato.
- Reservas de preparação usam trava por canal e atualização condicional. Aprovação existente e mídia publicada não são regeneradas.
- Crons compartilhados de radar/preparação e os antigos crons de planejamento/storyboard dos Shorts foram desativados, preservando suas definições para recuperação.
- `auto-publicar-radar` tornou-se um adaptador compatível exclusivamente para o Feed independente.

## Validação realizada

- Migrações aplicadas; cinco radares com RLS; RPCs novas sem permissão de execução para anon/authenticated.
- Teste transacional de reserva criou uma linha por formato Instagram e desfez tudo com rollback.
- Testes transacionais de alteração/desativação do Feed confirmaram que Shorts, TikTok e Reels não mudam.
- 16 chamadas autenticadas de diagnóstico retornaram HTTP 200, sem publicar, incluindo os cinco radares, preparadores, storyboards e gates.
- Coleta efetiva executada nos cinco radares: HTTP 200 em todos, com atualização independente das respectivas tabelas.
- Parser TypeScript verificou os arquivos; os deployments confirmaram compilação. A resolução completa de dependências pelo Deno local foi impedida pela rede do executor.
- Python compilado; `--self-test` produziu MP4 H.264 1080x1920 com `media_upload_attempted=false`.
- Nenhum teste de postagem, remoção de hold Meta ou contratação de API paga foi executado.

## Observações da verificação final

- GitHub Actions: os checks `Giro Madeira - Shorts (sem API paga)` (QA sem envio) e `validar fallback editorial (sem publicacao)` passaram no commit da separação.
- O workflow legado `publicar-noticias-04-10.yml`, já presente e sem alteração neste trabalho, continua falhando na validação. Não integra os novos radares e não foi executado para publicar notícias.
- A primeira coleta registrou falha parcial da fonte O Observador em Shorts/TikTok; as demais fontes e os cinco radares concluíram. Essa falha é registrada por canal e não bloqueia o Instagram.
- O primeiro rascunho novo de Reels ficou `aguardando_arte_tematica`, sem aprovação ou envio: falta uma imagem temática aprovada para essa pauta.

## Liberação de produção de Shorts — 11/10/2026

- Autorização explícita do operador nesta conversa para habilitar postagem automática no YouTube Shorts, sem alterar os demais canais.
- Banco confirmado: `giro_channel_settings.channel='shorts'`, `radar_enabled=true`, `preparation_enabled=true`, `publication_enabled=true`; todos os demais canais permanecem com publicação desabilitada.
- Supabase `giro_shorts_settings`: `public_auto_uploads_enabled=true`, `render_worker_reviewed=true`, `shorts_render_enabled=true`, `daily_goal=2`, `min_interval_minutes=720` e versão visual 6. Não baixar limites ou ignorar revisão visual apenas para forçar postagem.
- Teste autenticado `giro-youtube-verify-channel` retornou HTTP 200 e `account_matches_target=true` para o canal `@giromadeira`, `UCvzAtpCtcIef5Tfw31RcknQ`, com `uploads_performed=0`.
- O teste `giro-youtube-upload-auto` com `action=preview` retornou HTTP 200, `processed=0`, `reason=no_eligible_v5_shorts`: o vídeo de 20h ainda não estava renderizado/aprovado. Não equivale a publicação real validada.
- A produção dos Shorts permanece no GitHub Actions (07h/19h locais, com checagem no horário dos slots de 08h/20h); o uploader público é agendado a cada 15 minutos. Slots são metas sujeitas a processamento, verificação, qualidade e intervalo mínimo — não horários garantidos.
- Na fila em 11/10/2026 há pauta de 20h aguardando renderização. Só considerar a postagem concluída se houver `provider_post_id`, `status='enviado'` e `provider_privacy_status='public'`. Não aprovar artificialmente, nem ignorar erros ou reenvios incertos.

## Correção editorial TikTok — 11/10/2026

- Causa verificada na fila: TikTok #49 e #52 tinham crédito de imagem `openverse_Cherokee Phoenix printing press`, alheio às manchetes de crimes. Os dois itens já estavam `visual_review_status='rejected'`, `editor_approved=false`. Suas conversões em `giro_tiktok_media_prepared` foram marcadas `failed`, sem excluir os MP4 originais, para impedir reutilização.
- Corrigido `scripts/giro_shorts_auto.py`: assunto desconhecido não gera foto de prensa; licenças/fontes não substituem verificação temática; foto incompatível impede renderização; etiqueta “IMAGEM ILUSTRATIVA”; regressão de três títulos policiais restaurada no QA (linha que havia `\\n` literal).
- O agendador TikTok permanece separado do YouTube Shorts; formatos de 1080x1920, identificação visual oficial e Rio Madeira preservados. Nunca aprovar/reaproveitar diretamente o vídeo #49/#52 rejeitado. Quando for conveniente reprocessar essas notícias, produzir nova mídia somente sob revisão e sem criar segundo item publicado.
- Publicação via Buffer/worker depende do gate `giro_channel_settings.publication_enabled`, do formato TikTok aprovado e da conversão `giro_tiktok_media_prepared.status='ready'`. Prazos/slots locais 06h30, 10h, 13h30, 17h, 20h30; máximo 5/dia e 90 minutos mínimos.

## Liberação controlada TikTok — 11/10/2026

- A pedido do operador, `giro_channel_settings[channel='tiktok'].publication_enabled=true`, `giro_tiktok_editorial_settings.public_auto_uploads_enabled=true`; Buffer mantém `enabled=true`, `dry_run=false`. Independência confirmada por leitura: Shorts continua `true`, Feed/Stories/Reels `false`.
- `giro-buffer-tiktok-worker`, consultado autenticadamente com `action='status'`, retornou HTTP 200, `api_key_configured=true`, `buffer_channel_selected=true`, `enabled=true`, `dry_run=false`, `test_draft_completed=true`, limite 5/dia e 90 min.
- Vídeos #49 e #52 com foto de prensa inadequada seguem explicitamente rejeitados na fila, e suas conversões foram invalidada(s) (`giro_tiktok_media_prepared.status='failed'`). Material original preservado; **não reaprovar** esses vídeos antigos.
- Nenhuma publicação independente posterior à liberação foi validada. A fila nova #50 para 20h30 de Porto Velho ainda não tinha MP4 renderizado/aprovação visual na checagem. O horário é previsto, não garantido. Confirmar primeiro envio somente com ID/link remoto e resultado reconciliado no Buffer/TikTok.
- O GitHub passou a incluir validação temática e regressões em `scripts/giro_shorts_auto.py`; ainda é necessário confirmar uma execução real pós-correção e o resultado do primeiro post. Falha em qualidade => bloquear, não substituir imagem por foto desconexa. 

## Recuperação segura do Instagram — 11/10/2026

Diagnóstico diretamente no Supabase de produção: `giro_meta_rate_state.integrity_hold=true` e erro anterior da Meta HTTP 403 / subcódigo `2207051`, registrado em 10/10/2026. O semáforo operacional `giro_instagram_semaforo_gate` retornou `allowed=false` para os três formatos. `giro_channel_settings.publication_enabled=false` em Feed, Stories e Reels. **Não reabilitar nem remover o hold sem verificar o estado da conta na Meta e validar retomada gradual.**

Correções feitas:
- `gerar-arte-noticia-vault` v54/v55: extração mais abrangente de conteúdo factual (incluindo JSON-LD de artigo), tentativa de endereços canônicos no mesmo portal, e segunda fonte para fotografia com licença/assunto verificados. Conteúdo pago ou fotografia de terceiros sem licença não é autorizado.
- Teste `preview_only`: matéria da Polícia Civil de Rondônia retornou 200 com 1774 caracteres de texto jornalístico; notícia do Rondônia ao Vivo apresentou HTTP 403 também na URL canônica (fonte impede leitura pelo servidor). Não burlar bloqueio com proxies nem inventar legenda. 
- Teste `preview_art` sem publicar: imagem temática da pauta policial não foi validada; não aprovar arte genérica ou ilustrativa como foto da ocorrência. Pauta preservada.
- Linhas novas de Feed/Stories/Reels com falha de leitura foram classificadas `aguardando_fonte_acessivel` e mantidas `visual_approved=false`. Preparador ainda pode reagendar tentativa segundo o limite de duas tentativas, sem liberar publicação.
- Três dry runs autenticados dos publicadores independentes retornaram HTTP 200 com `no_publish=true`, `integrity_hold=true` e `publication_enabled=false`.

Próximos passos: responsável verificar `Instagram → Perfil → ☰ → Status da conta` no aplicativo e informar se há restrição/contestar quando disponibilizado. Confirmar acesso e saúde da conta antes de liberar inicialmente somente Feed com limite de três posts/dia, intervalo mínimo de 120 minutos, arte temática aprovada; Stories e Reels depois, por canal. Registrar o ID de mídia e verificar publicação de verdade, sem duplicações. Fontes HTTP 403 exigem meio autorizado de acesso ou fontes oficiais alternativas.

## Retomada cautelosa do Instagram Feed — 11/10/2026, 19h12 Porto Velho

O operador confirmou que o Status da conta no app foi verificado e estava normal em 10/10. Não solicitar novamente esse print sem motivo novo. Verificação técnica autenticada:
- `monitor-instagram-referencia` v8 leu 12 mídias da própria conta com HTTP 200, incluindo Reel `17914921551466546`, publicado em 11/10 03:49 UTC, depois do antigo 403 de 10/10 02:50 UTC. Sem escrita na Meta.
- `monitor-instagram-referencia` v9 adicionou diagnóstico de quota `action=quota`, protegido por `x-giro-db-key` e validação do segredo em RPC: GET Meta HTTP 200, quota 0/100 no intervalo de 86400 segundos. Nova versão registrada em `supabase/functions/monitor-instagram-referencia/index.ts`. GET de cota NÃO prova que uma próxima chamada `media_publish` vai ser aceita.
- Liberação transacional condicionada às evidências acima: `giro_meta_rate_state.integrity_hold=false`, sem remover `last_meta_error`/histórico; semáforo amarelo; `rollout_stage='feed_only'`; limite máximo *operacional* de 1 Feed/dia, espaçamento do semáforo amarelo de 180–240 min no mesmo formato; `traffic_light_reel_test_enabled=false`.
- Canal `feed.publication_enabled=true`; `stories` e `reels` permanecem `false`; Shorts/TikTok não foram alterados.
- O cron legado `giro-madeira-extras-retry-5min`, jobid 4, foi desativado (`active=false`) porque dispara `processar-publicacoes-vault` sobre o banco legado e poderia soltar uma publicação antiga ao remover o hold. A linha antiga 921, título 'Domingo terá risco de temporal em Rondônia; previsão de trovoadas', foi preservada, mas retirada da aprovação e do agendamento (`status=pendente`, `visual_approved=false`, `scheduled_at=null`). NÃO reativar cron4 sem analisar fila e validações.
- Dry runs reais dos três publicadores independentes, resultados HTTP 200: Feed `publication_enabled=true`, `gate.allowed=true`, `daily_cap=1`, `no_publish=true`; Stories e Reels `publication_enabled=false`, `gate.allowed=false`, `no_publish=true`.
- A fila independente do Feed ainda não possui mídia final `visual_approved=true` (0 de 3 na conferência). **A configuração e a cota estão boas, mas nenhuma postagem real da nova fila foi confirmada.** Não forçar publicação sem arte temática verificada e sem legenda factual. O protetor de integridade da Meta deve reentrar automaticamente se o subcódigo 2207051 reaparecer.

## Primeiro Feed independente confirmado — 11/10/2026, 20h02 Porto Velho

**Publicação real concluída e relida da própria conta Instagram**:
- Pauta oficial Polícia Civil RO sobre prisão em Cuiabá relacionada a fatos em Jaru, fila Feed independente ID `2`.
- Conteúdo original factual a partir de `www.pc.ro.gov.br`, foto externa inadequada não reaproveitada, arte editorial *ilustrativa e identificada* com identidade Giro Madeira, Rio Madeira, logotipo e manchete; preview QA inspecionado.
- Edge `gerar-arte-noticia-vault` v57 gerou PNG de Feed (1080×1080) e Stories (1080×1920). `preparar-jpeg-giro` converteu ambas para JPEG verificando dimensões. A produção permanente agora tem ponte de conversão em `giro-instagram-preparar-independente`.
- Após QA específico, apenas Feed #2 recebeu `status=aprovada`, `visual_approved=true` e foi enviado pelo publicador independente; retorno HTTP 200 e `instagram_media_id=18019995593728822`. Leitura autenticada da conta confirmou a mídia e link `https://www.instagram.com/p/DeX5kY8Dn1m/`, timestamp `2026-10-12T00:02:13Z`.
- A chamada `media_publish` retornou HTTP 403/subcódigo `2207051` **apesar da mídia efetivamente publicada**: o publisher já conciliava erros ambíguos verificando a mesma legenda, tipo, data e único ID na conta. A trava de integridade ficou indevidamente acionada. Corrigido `publicar-instagram` v30 para liberar *apenas a trava causada por esse mesmo evento* quando o readback exato confirmar sucesso; rejeições reais permanecem bloqueadas. A trava do evento #2 foi reconciliada por SQL com prova de post e erro na mesma janela.
- `giro-instagram-preparar-independente` v3: futura autoaprovação é estritamente limitada ao **Feed**, `visual_mode=original_illustration`, material próprio, HTTPS de domínio *.gov.br, legenda factual de ≥400 caracteres com fonte e URL, validade editorial, duas mídias JPEG verificadas no Storage oficial e nenhuma mídia publicada preexistente. Fotos externas, fontes HTTP 403, Story/Reel continuam requerendo revisão/bloqueados.
- Checagens finais `dry_run`: preparador Feed HTTP 200; publicador Feed HTTP 200 com `daily_cap=1`, `used_today=1`, `allowed=false` pelo limite diário, próxima janela não antes das 06:00 de Porto Velho. `integrity_hold=false`, `rollout_stage=feed_only`, `traffic_light_target=amarelo`. Stories/Reels não foram liberados; Shorts/TikTok não modificados.
- Publicação confirmada **não** significa disponibilidade ilimitada da API da Meta, nem valida todo futuro conteúdo automaticamente. Se erro de integridade reaparecer sem post confirmado, preservar a fila e reativar a trava.
