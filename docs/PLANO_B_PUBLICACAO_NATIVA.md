# Giro Madeira — Plano B de publicação nativa

Implementado em 11/10/2026. A publicação via Instagram Graph API permanece em **hold preventivo**, devido ao último erro 403 (Meta 2207051). Nenhum limite da Meta foi removido.

## Objetivo
Produzir e organizar conteúdo profissional automaticamente sempre que possível; se o envio pela API permanecer bloqueado, transferir a **etapa final** para a interface oficial do Instagram/Meta Business Suite, somente com conta autorizada e regras da Meta respeitadas. Não é uma técnica de contorno de restrições.

## Pacote de teste pronto
- Pasta no Drive: https://drive.google.com/drive/folders/1LyH1fFiwUQ_xttjGMF28W60hSGCDqm80
- Reel MP4 1080×1920, 8 s, H.264/AAC: https://drive.google.com/file/d/1bLQ2GNsHXg8mInZgW4CM748eD7uz66XT/view
- Capa aprovada PNG: https://drive.google.com/file/d/1ViwwW79ugb0aNFuvtR-6lstjUbBGcVg6/view
- Legenda pronta e aviso de imagem ilustrativa: https://drive.google.com/file/d/1bal0Bm41UXTuEopW1JVPYHuEfVOok3FS/view
- Procedimento de publicação: https://drive.google.com/file/d/1Hm1h898QTHe9hhZeOd_upZVy39u7ahy_/view
- Notícia original: https://www.gov.br/pf/pt-br/assuntos/noticias/2026/10/operacao-integrada-apreende-trator-caminhao-e-madeira-retirados-de-terra-indigena-em-nova-mamore-ro
- Publicação original no banco: id 920, permanece **pendente**, sem instagram_media_id, sem confirmação de publicação automática, e sem substituição do visual aprovado nos campos de arte do pipeline principal.

## Controle Plano B
Tabela `public.giro_plano_b_fila` (RLS ligada, somente service_role): chave única (publicacao_id,formato), arte, vídeo e legenda em URLs do Drive, status controlado:
`pronto_para_agendar` → `agendado_nativo` → `publicado_nativo` ou `cancelado`.
O teste 920, REELS, já foi inserido em `pronto_para_agendar`.

A RPC restrita `giro_plano_b_confirmar_publicacao(publicacao_id,formato,permalink,confirmado_por)` só registra `publicado_nativo` quando há permalink oficial do Instagram, não inventa media_id e tira o item de circulação do pipeline original para evitar duplicatas.

## Operação segura
1. Radar identifica notícia; verificar data, origem, duplicidade, apuração.
2. Arte do padrão visual aprovado e material autoral com direitos de uso. Se a imagem for produzida digitalmente, **marcar IMAGEM ILUSTRATIVA**; não fingir registro fotográfico.
3. Organizar pacote final em pasta do Drive / Plano B - Publicacao Nativa.
4. No Instagram ou Meta Business Suite nativo, revisar conexão, criar UM Reel, anexar vídeo e capa, colar legenda e publicar/agendar SOMENTE se a plataforma autorizar.
5. Registre permalink/horário no controle Plano B e marque como publicado via RPC; não repita o conteúdo pela API ou pelas filas.
6. Sem janela de publicação garantida: o horário editorial 06h–23h30 e espaçamentos definidos no semáforo seguem como política; agendamento no app é manual.

## Limitações a não mascarar
- A conexão da API Meta para consultas respondeu HTTP 200 anteriormente, o que não prova autorização de publicação. `integrity_hold=true` continua.
- **O agendamento nativo não é automatizado neste estágio**: exige acesso/ação da conta no app ou navegador Meta Business Suite. Não se pode confirmar uma postagem antes de permalink real.
- **A automação v2 foi instalada**, mas os pacotes futuros são preparados no **Supabase Storage**, e não copiados automaticamente para o Google Drive. O Google Drive permanece apenas com o pacote nº 920, já carregado manualmente pelo conector. A conta de serviço do Supabase tem papel de leitura na pasta do Drive, portanto a escrita automática no Drive não está habilitada.
- O sistema ainda precisa de confirmação de sessão/permissões dentro do Meta Business Suite para validar se está disponível para a conta.
- Não usar Metricool neste fluxo, por escolha editorial do usuário.

## Automação v2 — pacotes no Supabase Storage (11/10/2026)
- Edge Function autenticada por `x-giro-db-key`: `giro-plano-b-empacotar` v1, ACTIVE. Ela apenas prepara arquivos e fila; **não executa requisições ao Instagram**.
- Cron `giro-plano-b-empacotar-30min`: `*/30 * * * *` (UTC); executa preparação a cada 30 minutos, independente do horário das postagens.
- Cada notícia recente com mídia produzida, legenda, fonte, `media_pipeline_version>=5`, sem `instagram_media_id` e em estado pendente/aprovada pode gerar entradas separadas para FEED, STORIES e REELS, conforme formatos previstos e recursos presentes.
- Conteúdo gerado automaticamente: `news-images/plano-b/auto/<id>/<formato>/legenda.txt` e `manifesto.json`. Mídias originais permanecem em buckets Supabase, com URLs registradas na tabela `giro_plano_b_fila`.
- Regras de estados: `aguardando_revisao_visual` quando visual_approved=false; `aguardando_video` quando Reel não possui vídeo; `pronto_para_agendar` **somente** com mídia disponível e visual_approved=true. Nenhuma aprovação visual automática é simulada.
- Incluir expressamente `IMAGEM ILUSTRATIVA` em legendas quando ausente; não representar ilustração digital como fotografia real da operação.
- Registros do Drive feitos manualmente (`origem_pacote=drive_manual`) não são sobrescritos pela automação. Id e formato são únicos, evitando múltiplos pacotes iguais.
- Teste de conexão `dry_run=true` e teste de execução: ambos retornaram HTTP 200, `success=true`, `no_instagram_publish=true`, `processed=0`. Isto é esperado, pois naquele momento nenhuma nova mídia aprovada estava disponível; validação do caminho de geração positiva ficará pendente de uma próxima notícia com arte.
- **Atualização 11/10:** o Reel 920 foi confirmado pela leitura da API como publicado pelo Business Suite, com permalink https://www.instagram.com/reel/DeVuy9TESWB/ e registro na fila `publicado_nativo`. O sucesso da via nativa não liberta automaticamente o bloqueio da API de publicação; semáforo Meta permanece vermelho.
- Confirmação de publicação nativa exige permalink oficial via `giro_plano_b_confirmar_publicacao` e evita reenvios pela API. O operador deve efetuar o clique no Instagram/Meta Business Suite — não há navegação autenticada do Instagram disponível nesta sessão.

## Atualização 11/10/2026 — preparação editorial automatizada e segura

Implantado e conferido:
- Cron existente `giro-madeira-auto-publicar-5min` atualizado para `5 10-23,0-3 * * *` (UTC), preparando *rascunhos* aproximadamente de hora em hora entre 06h05 e 23h05 (hora de Porto Velho), em vez de quatro vezes ao dia. O nome legado do cron não representa a frequência atual.
- Edge Function `auto-publicar-radar` **v22** mantém `BATCH_SIZE=1`, checa janela 06h–23h30, máximo 8 rascunhos originados do radar em 24 horas móveis e mínimo 90 minutos desde o último; não desliga bloqueio nem aprova imagens.
- Teste `dry_run=true` (somente leitura) respondeu HTTP 200: 00h04 em Porto Velho, `permitted_to_prepare=false` por janela editorial. Nenhuma publicação enviada.
- Edge Function `gerar-arte-noticia-vault` **v49**: quando não encontra foto temática com licença verificada, **preserva a notícia, resumo e legenda** no banco com `media_status=aguardando_arte_tematica` e `visual_approved=false`. Bloqueia reprocessamento de itens já aprovados manualmente ou publicados. Não retorna imagem ilustrativa genérica como capa final.
- Edge Function `giro-plano-b-empacotar` **v2**: inclui rascunhos sem arte para revisão na fila, sem marcar `pronto_para_agendar` até haver mídia e aprovação. Continua preservando pacotes manuais do Drive, e nunca envia à Meta.
- Teste 921: tentativa de reprocessar imagem aprovada devolveu **HTTP 409** `approved_visual_protected_no_regeneration`, corretamente. Worker de pacotes retornou HTTP 200 em `dry_run` e ignorou pacote manual existente. Proteção de duplicatas continua ativa.
- A pauta 921 (Feed: previsão de chuvas) está em `pronto_para_agendar` no Plano B, não publicada; Reel 920 publicado e confirmado.
- Diagnóstico autenticado, sem cobrança, comprovou `OPENAI_API_KEY` presente no ambiente, mas `OPENAI_API_HAS_CREDITS=false` no gerador e `can_generate_images_automatically=false`. **Não afirmar que imagens de IA são geradas automaticamente.** Para habilitar geração por API, verificar faturamento/créditos, aprovar orçamento e implementar integração de imagem em roteiro validado, com limites de despesa; **não habilitar automaticamente**.
- Publicação automática Instagram Graph API continua com `integrity_hold=true`, erro anterior 403 subcódigo 2207051 e `rollout_stage=feed_only`. Testes nativos pelo Business Suite não comprovam desbloqueio da API. **Não forçar `media_publish` para testar**, nem liberar fila sem revisão específica.
- O botão final no Meta Business Suite continua sendo operado por uma pessoa (ou Work autenticado). Nenhuma rotina presente agenda nativamente por si só. Sem permissões/bloqueio resolvidos, não há publicação automática ponta a ponta.

### Correção complementar de estado da mídia

A migração `giro_media_status_corrigir_plano_b_e_reel_nativo_v1` atualiza o trigger `giro_atualizar_media_status()` para evitar que um Reel nativo confirmado seja rotulado como `aguardando_feed`. Mantém `reel_publicado` para publicações sem Feed e preserva estados explícitos de revisão/pauta sem arte. Testes de leitura confirmaram o Reel 920 com `media_status=reel_publicado` e o Feed 921 `media_status=plano_b_revisado_para_publicacao_nativa`. Não libera a Meta nem converte rascunho em publicação.
