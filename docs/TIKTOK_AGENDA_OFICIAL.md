# Giro Madeira — agenda oficial do TikTok

Configuração aplicada em 11/10/2026 diretamente no projeto Supabase `Giro Madeira`.

## Horários-base (America/Porto_Velho)

| Slot | Horário | Janela de elegibilidade |
| --- | --- | --- |
| 1 | 06:30 | 06:30–07:14 |
| 2 | 10:00 | 10:00–10:44 |
| 3 | 13:30 | 13:30–14:14 |
| 4 | 17:00 | 17:00–17:44 |
| 5 | 20:30 | 20:30–21:14 |

- Até **5 publicações/dia** (não há garantia de preencher todos os slots sem notícia/vídeo aprovado).
- Pelo menos **90 minutos** entre tentativas registradas; sem disparos em lote para compensar horários perdidos.
- A rotina `giro-buffer-tiktok-15min` permanece ativa e consulta a cada 15 minutos.
- O filtro de horário pertence apenas ao TikTok; **não ajustar as janelas de YouTube/Instagram**.
- Nenhuma publicação extra fora de janela sem `giro_social_video_queue.tiktok_urgent=true`. Essa marcação é uma exceção editorial explícita, **não** é ativada por palavras na manchete; não dispensa os filtros de qualidade, aprovação, 30 fps, disponibilidade do vídeo, não duplicação e intervalo mínimo. Urgência não aumenta o teto diário de cinco.
- Se faltar vídeo apto durante uma janela, pular aquele horário. Não preencher com vídeo reprovado ou antigo.

## Implementação e parâmetros

- Supabase, tabela `public.giro_buffer_tiktok_settings`, linha `id='giro_madeira'`:
  - `posting_slots_local = {06:30,10:00,13:30,17:00,20:30}`
  - `posting_window_minutes = 45`
  - `daily_limit = 5`
  - `min_interval_minutes = 90`
- Função SQL: `public.giro_buffer_claim_tiktok_video()`, com relógio local em `America/Porto_Velho`.
- A função mantém as verificações já existentes de identidade do canal Buffer `giro_madeira`, fonte Shorts aprovada e versão transcodificada a 30 fps.
- O worker remoto continua sendo `giro-buffer-tiktok-worker`; a rotina faz `run` a cada quinze minutos.
- O envio aceito pelo Buffer não é prova de vídeo já publicado. Confirmar postagem por estado remoto `sent` e URL do TikTok. Em caso de resposta ambígua, não repetir sem reconciliação.
- As peças visuais seguem `AGENTS.md` e `docs/GIRO_MADEIRA_PADRAO_VISUAL.md`.

## Validação de 11/10/2026

Depois da alteração, conferidos no banco: `enabled=true`, `dry_run=false`, cinco horários locais, janela de 45 minutos, intervalo de 90 minutos e cron ativo em `*/15 * * * *`. O histórico de três posts `sent` foi preservado. A primeira publicação futura ainda depende de mídia elegível e confirmação no TikTok.
