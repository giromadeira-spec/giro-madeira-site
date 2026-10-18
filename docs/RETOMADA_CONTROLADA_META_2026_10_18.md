# GIRO MADEIRA — retomada gradual de Feed e Reels (18/10/2026)

## Atualização — meta vigente de 1 por formato (18/10/2026)

O usuário definiu a meta operacional **1 Feed, 1 Reel e 1 Story por dia**. Substitui quaisquer propostas antigas de aumentar Feed/Reels para 2 ou mais. Stories foi habilitado em `giro_channel_settings.publication_enabled` e `traffic_light_story_test_enabled=true`, com semáforo AMARELO, `rollout_stage=feed_only` e limites de 1/dia para cada tipo. O cron de Story permanece independente; publicador atualizado exige JPEG vertical do fluxo Stories, própria revisão/ligação à notícia, e janela de 18h–20h59 em Porto Velho. O preparador libera foto oficial somente após registro individual de direitos e correspondência com o evento; ilustração simbólica continua pendente de revisão humana.

A guarda SQL exige quota Meta recente (<80%, ≤24h), 72h sem novo erro, Feed confirmado nos últimos 48h e Reel confirmado nos últimos 72h antes de permitir Stories. A última quota verificada foi em 15/10; em 18/10 ~15h56 PV, `giro_instagram_semaforo_gate('STORIES')` retornou `allowed=false` por falta de telemetria. Nenhum dos três formatos tinha pauta nova aprovada para envio. **Habilitado não equivale a publicado.**


## Decisão operacional

O usuário autorizou começar uma evolução gradual de ritmo, **não** publicar imagens sem revisão, ignorar a API Meta ou elevar de imediato a dezenas de posts por dia.

**Produção verificada em 18/10 às 15h37 de Porto Velho:** `integrity_hold=false`, `rollout_stage=feed_only`, semáforo amarelo, capacidade central de **1 Feed/dia** e **1 Reel/dia**, Reel **somente 12h00–12h44**, Stories desligados. Último Feed confirmado: 15/10 às 06h PV; último Reel confirmado: 14/10 às 12h01 PV. Nenhum evento Meta novo nas últimas 72h. Último erro HTTP 403 / código 4 / subcódigo 2207051 é histórico reconciliado, mas o último registro de quota Meta é de 15/10: **não presumir recuperação**. As filas independentes têm 7 Feeds e 8 Reels em revisão visual, sem material elegível para publicação neste momento.

## Etapas permitidas

1. **Recuperação atual:** manter AMARELO, teto 1 Feed/dia e 1 Reel/dia (somente janela do meio-dia), Stories desativados. Produzir mídias próprias e liberar apenas depois de revisão humana, verificar fonte/data/licença, expiração, legenda e vídeo/áudio final. Obter ID Meta e evento persistido antes de contar sucesso. Sem posts artificiais ou antigos para completar metas.
2. **Fase piloto, somente após prontidão demonstrada:** propor teto interno de **2 Feeds/dia, 1 Reel/dia**, com ampla distância entre posts, respeitando cotas reais da Meta. Manter Stories desligados e desfazer/escalar para revisão ao primeiro 403/429 sem confirmação ou reclamação de integridade. Requer três datas locais distintas com Feed confirmado nas últimas 72h, duas datas com Reel, últimos envios recentes, nenhum novo erro Meta em 72h, telemetria de quota em no máximo 24h, uso < 80% e pelo menos uma mídia *atual e aprovada* em cada fila. A prontidão pode ser consultada por `select public.giro_meta_rollout_readiness_readonly();`.
3. **Depois de novo período comprovado de estabilidade real**, reavaliar 2 Reels/dia ou 3 Feeds/dia, nunca ativar `full` e Stories em conjunto inadvertidamente. Não há meta pública confirmada de frequência do @newsrondonia.

## Travas técnicas preservadas

- `giro_instagram_semaforo_gate('IMAGE'/'REELS')` continua sendo a única decisão efetiva sobre disponibilidade e cota; a RPC de prontidão é **somente leitura** e **não altera o gate**.
- `public.giro_meta_rollout_readiness_readonly()` é executável pelo serviço interno apenas; sem grants a `anon` ou `authenticated`; retorna motivos concretos de bloqueio.
- `giro-instagram-publicar-independente` mantém independência por formato, rejeição de `visual_approved=false`, reconciliação de resultados incertos e bloqueio de pautas expiradas. Sem mídia aprovada, **não publica**.
- Cron verde, renderização e mensagens HTTP 200 não comprovam postagem; é necessário `instagram_media_id` / `instagram_reel_media_id` real.
- A aprovação para **aumentar a cadência quando seguro** não significa aprovação visual automática de nenhuma arte ou postagem de teste.

## Situação imediata

O levantamento atual retornou `eligible_for_review_to_raise_feed_cap_to_two=false`: sem posts confirmados no período mínimo, quota não atualizada e nenhuma mídia aprovada pendente. **Nenhuma cota foi aumentada, nenhum novo post foi disparado e nenhum bloqueio foi removido**. Próximo avanço dependerá de verificar publicações realmente concluídas e mídia revisada.
