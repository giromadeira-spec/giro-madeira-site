# Giro Madeira — Semáforo Instagram e Cadência Editorial (v1)

Configuração implantada no Supabase do projeto `dsihvbdhocbqscaypraw` em 10/10/2026. Documentação sem segredos e sem tokens.

## Estado atual: VERMELHO (não publicar)
A proteção `giro_meta_rate_state.integrity_hold=true` permanece ativa devido ao erro Meta HTTP 403, subcódigo 2207051, na publicação de 10/10. A tela "Status da Conta" do Instagram mostrou funcionalidades liberadas e consultas GET da API retornaram HTTP 200 / cota 0/100, mas isso **não comprova** que `media_publish` está liberado. O bloqueio **não foi removido**. A intenção configurada para depois da revisão é AMARELO.

## Regras
- VERMELHO automático: `integrity_hold=true`, pausa `publication_pause_until` ainda válida, `blocked_until` futuro ou `usage_percent>=95`. Nenhuma publicação na Meta. O radar e a geração de artes podem funcionar.
- AMARELO: primeiro estágio, máximo 1 Feed/dia, Stories inativos, Reel permitido **somente** se `traffic_light_reel_test_enabled=true` e houver revisão/aprovação. Espaçamento geral 75–105 minutos, mesmo formato 180–240 minutos. **Não** ativar por conta própria enquanto a Meta mantiver restrição.
- VERDE: metas internas de até 3 Feeds + 2 Reels + 3 Stories/dia; **não** são garantias de ausência de bloqueio. Intervalo geral 40–65min; entre dois Feeds 120–210min, entre dois Reels 120–210min, entre dois Stories 60–120min.
- Horário editorial local: 06h00–23h30, timezone `America/Porto_Velho`. O cálculo usa variação determinística vinculada ao último envio confirmado, não horários fixos destinados a contornar limitações.
- Notícia urgente ganha prioridade de fila, **nunca** passa por cima de bloqueios/cotas/intervalos.
- Jamais publicar artes antigas (pipeline version < 5) ou sem `visual_approved=true`; não replicar conteúdos já publicados.

## Implementação
- `public.giro_instagram_semaforo_gate(media_type, at)`: RPC interna de **leitura**, devolve `allowed`, `semaforo`, `reason`, `retry_at`, `daily_cap`, sem chamar Meta.
- `public.giro_instagram_register_event(type, media_id)`: registra mídia confirmada na `public.giro_instagram_publication_events`, sem gravar duplicatas. RLS ativo, sem acesso `anon`/`authenticated`; apenas `service_role`.
- `publicar-instagram` Edge Function v29 chama o semáforo antes de obter/renovar token e também durante os pré-checks. Registra evento após sucesso confirmado ou reconciliação; nunca limpa a restrição.
- Worker `processar-publicacoes-vault` continua recusando envios sob `integrity_hold` e verificando aprovação visual; consulta a função central `publicar-instagram` para toda mídia.
- Cron `giro-madeira-extras-retry-5min` (nome histórico) atualizado para `*/15 11-23,0-2 * * *` (UTC); são **checagens**, não postagens. Nenhum disparo ocorre antes do gate; hora local é avaliada no RPC. `rollout_daily_feed_cap=3`, `rollout_min_feed_gap_minutes=120`. Em AMARELO o RPC aplica limite mais baixo (1 Feed/dia).
- O rollout de mídia antiga permanece em `feed_only`; quando o verde for autorizado e tecnicamente validado, alinhar `rollout_stage='full'` separadamente.

## Teste seguro já realizado
- RPC `giro_instagram_semaforo_gate('IMAGE'/'REELS'/'STORIES')`: `allowed=false` e `semaforo=vermelho`, devido a `integrity_hold`.
- `processar-publicacoes-vault` com `dry_run=true`: HTTP 200, `no_publish=true`, `instagram_hold=true`.
- Fila ativa de publicações: zero após a limpeza dos rascunhos antigos. Publicações confirmadas mantidas como histórico.
- O primeiro teste real de publicação requer validação da restrição Meta, uma arte nova aprovada e apenas um Reel controlado, com conferência do `instagram_reel_media_id`.

## Diagnóstico
Consulte `select public.giro_instagram_semaforo_gate('REELS');`, `select * from public.giro_meta_rate_state where id=1;` e `cron.job`. Não force `integrity_hold=false` só por haver GET HTTP 200; evite tentativas repetidas de POST /media_publish sem certeza de que a Meta liberou o recurso.

## Revisão de janela e espaçamento (v2 — 10/10/2026)
- Janela revisada no Supabase: início 06h00, encerramento 23h30, hora local de Porto Velho.
- Intervalo editorial **mínimo geral 40–65 minutos**, com variação determinística; entre dois Feeds ou Reels 120–210 minutos; entre dois Stories 60–120 minutos.
- Intervalos curtos de 15 minutos são usados apenas para consulta da fila, **nunca** como autorização automática para publicar; urgência não contorna bloqueios.
- Cron da fila: `*/15 10-23,0-3 * * *` em UTC, com horários efetivos limitados pelo semáforo.
- A proteção `integrity_hold=true` foi mantida e confirmada por teste; o sistema segue em VERMELHO até resolução e validação da Meta.
