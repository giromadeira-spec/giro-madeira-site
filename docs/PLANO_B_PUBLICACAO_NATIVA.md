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

## Diretriz confirmada pelo usuário — sem custos adicionais (11/10/2026)
- Proibido habilitar serviços pagos de geração de imagens ou texto por API sem uma nova autorização explícita do usuário. Não pressupor que a assinatura ChatGPT Plus inclua créditos da API.
- A Edge Function de geração `gerar-arte-noticia-vault` **v50** removeu completamente chamadas para a API OpenAI (`/v1/images/generations` e `/v1/chat/completions`). A reescrita factual usa rotina local determinística; artes são geradas com templates próprios e fotografias com licença CC validada, mais créditos da imagem.
- Sem foto apropriada ou licença verificável, a notícia fica em rascunho `aguardando_arte_tematica`; nunca publicar uma capa errada ou inventar um registro fotográfico. Ilustrações próprias devem ser identificadas.
- Diagnóstico autenticado sem custos adicionais de API: HTTP 200, `extra_paid_ai_costs_forbidden=true`, `image_api_enabled=false`, `can_generate_images_automatically=false`, `can_compose_free_licensed_photo_templates=true`.
- **Limite importante**: esta diretriz bloqueia custos adicionais de IA, não garante isenção de mensalidades/cotas/custos de armazenamento e serviços existentes (Supabase, Netlify, Drive, terceiros); monitorar planos e consumo antes de ampliar carga.
- O semáforo de Instagram Graph API continua com hold preventivo. A postagem sem clique do operador continua dependente da recuperação/verificação de permissão de publicação da Meta. Nunca afirmar automação ponta a ponta antes de validação real.

## Reconciliação automática com Instagram — 11/10/2026

- Nova migração **`giro_integracao_meta_leitura_conciliacao_nativa_30min_v1`** cria `giro_meta_native_reconcile_state` com RLS e executa `giro_reconcile_native_readonly()` no cron **`giro-meta-nativo-conferir-30min`** a cada meia hora.
- O cron lê APENAS `GET https://graph.instagram.com/v26.0/me/media?fields=id,caption,media_type,media_product_type,timestamp,permalink&limit=15` usando token guardado no Vault. Não chama `POST /media` nem `POST /media_publish`, não cria agendamento Meta, não remove o hold, não usa Metricool.
- Um post nativo recém-publicado é conciliado na fila **somente** se combinar integralmente a legenda normalizada, formato (`FEED` ou `REELS`), permalink válido, ID numérico, data dos últimos 72 horas, pacote em `pronto_para_agendar`/`agendado_nativo`, ID ainda não utilizado e correspondência única. Os Stories não são inferidos pela ausência de legenda; confirmação manual ainda necessária.
- Ao reconhecer correspondência, chama `giro_plano_b_confirmar_publicacao` e preenche o ID REAL da Meta e horário oficial na tabela principal; evita reenviar a pauta. A regra protege de falsos positivos por título parecido. Como exige legenda exata, edições manuais na legenda podem impedir a conciliação — nesses casos confirmar pelo permalink.
- Diagnóstico de conta por GET da Meta: **`@giro_madeira`**, `account_type=MEDIA_CREATOR`; consulta de quota **HTTP 200** com `quota_usage=0` de 100 por 24h. Isso NÃO indica que o bloqueio HTTP 403 de integridade na escrita foi removido.
- Teste do novo cron: requisição GET **HTTP 200**, função `success=true,no_instagram_publish=true,confirmed_new=0`; pacote Reel 920 permaneceu `publicado_nativo`, Feed 921 permaneceu `pronto_para_agendar`. Cron e RLS verificados.
- Não há **postagem automática nativa pelo Business Suite** sem intervenção do usuário, pois o conector Meta para publicação nativa não está disponível. A liberação e confirmação das permissões da API oficial precisam da Meta e do proprietário da conta. Na UI do Instagram, verificar `Configurações e atividade → Status da conta → Recursos que você não pode usar`, solicitar revisão se a opção existir. O usuário não deve desabilitar barreiras antispam internas como forma de contornar a Meta.
- Política financeira: sem novos provedores pagos, APIs de IA paga desabilitadas; uso de infraestrutura existente sujeito às quotas e ao plano contratado.

## Preparação do Feed 921 para publicação automática oficial — 11/10/2026

- A arte foi importada com sucesso do Drive ao Supabase Storage, por `importar-arte-drive-vault`: bucket `news-images`. Convertida para JPEG oficial 1080x1080 por `preparar-jpeg-giro` (HTTP 200). A publicação id921 está `status=aprovada`, `visual_approved=true` e `feed_image_url` válido no bucket.
- Janela interna prevista: `scheduled_at=2026-10-11T11:00:00Z` (**07:00 Porto Velho**). É agendamento no banco para **o worker de API**, e **NÃO** agendamento do Meta Business Suite. A fila nativa `giro_plano_b_fila` continua `pronto_para_agendar` até confirmação real do agendamento no Meta.
- Migração `giro_feed_921_programacao_interna_com_expiracao_v1` cria `editorial_expires_at`; para a previsão de domingo é `2026-10-12T03:30:00Z` (domingo 23h30 Porto Velho). Impede publicações tardias se a restrição da Meta acabar dias depois.
- Edge Function `processar-publicacoes-vault` **v32**: bloqueia mídia fora de 06h–23h30 local, descarta Feed aprovado vencido ou com mais de 36h desde a criação, preservando histórico; cancela pacote Plano B manual correspondente quando a API oficial comprovar publicação do Feed. *Não faz chamadas para publicar enquanto `integrity_hold=true`.*
- Testes: `dry_run=true` HTTP 200 mostrou o id921 `aprovada` e `instagram_hold=true`. Execução protegida HTTP 200 à 00h40 local retornou `no_publish=true, stage=fora_janela_editorial`, sem tentativa na Meta.
- Dependência real: `integrity_hold=true` em `giro_meta_rate_state`, último erro de escrita HTTP 403 da Meta, razão integridade/antispam (2207051). **Nunca remover o hold apenas porque GET /me ou quota retornou HTTP 200 ou a postagem nativa por navegador funcionou.** Requer revisão/regularização na Meta e verificação oficial da capacidade de escrita para habilitar a publicação automática. O usuário não precisa contratar nenhum provedor adicional.
- O Plano B permanece sem uma API suportada de agendamento nativo no navegador; precisa de agendamento manual ou de uma ferramenta de navegador autenticada autorizada pelo usuário. Nenhuma implementação de automação por cliques na UI foi realizada.

## Procedimento executável em navegador autenticado — Plano B (sem novas integrações pagas)

**Pré-condição:** o usuário deve abrir um navegador autenticado no Meta Business Suite por um executor autorizado (por exemplo, ChatGPT Work) e aprovar os passos de acesso à conta. O backend Supabase NÃO controla nem agendará o Business Suite pela UI por si só. Agendar pela interface nativa não comprova liberação do endpoint Graph `media_publish`.

1. Ler a fila `public.giro_plano_b_fila` apenas com formato relevante e status `pronto_para_agendar`, conferir em `giro_madeira_publicacoes` se `visual_approved=true`, fonte/data e prazo editorial ainda válidos. Excluir `agendado_nativo`, `publicado_nativo`, `cancelado` e `instagram_permalink` já preenchido.
2. Acessar pela interface oficial **https://business.facebook.com/**, escolher o Instagram Giro Madeira e inspecionar primeiro o Planejador/Conteúdo para evitar uma duplicação de notícia/manchete. Se a Meta bloquear a ação ou solicitar verificação, parar e relatar: não insistir, não contornar políticas.
3. Usar somente a arte final aprovada, não foto bruta do veículo de origem. Para o Feed #921: mídia https://drive.google.com/file/d/1FX7RKoXk-pGRSpt1wufUgy3RbPACTdg9/view ; legenda https://drive.google.com/file/d/1ErCb_iPyqNRCDt8y0CzXwnE64jpgQfqq/view . **A data 11/10/2026 e o limite de 23h30 Porto Velho são obrigatórios; NÃO agendar após o vencimento, nem se notícia tiver sido superada.** Agendamento interno no Supabase **não equivale** a agendamento na Meta.
4. Na interface do Business Suite, criar e agendar um post Instagram nativo na janela 06h–23h30 America/Porto_Velho e respeitar intervalos. Somente declarar **agendado_nativo** após confirmar que o post efetivamente aparece no Planejador. Guardar confirmação e hora. Se houver confirmação de publicação, preferir ID/permalink retornados pela Meta para `publicado_nativo`, nunca marcar apenas porque a tarefa foi enviada.
5. `giro-meta-nativo-conferir-30min` confere as publicações por GET e concilia correspondências inequívocas da fila automaticamente. **Stories sem legenda equivalente podem exigir verificação manual.**
6. Não tentar publicar via Graph enquanto `giro_meta_rate_state.integrity_hold=true` (403, subcódigo 2207051). Não criar sessões ocultas/scrapers para evadir a restrição. Programar novos lotes no Business Suite via navegador só quando tecnicamente suportado e permitido.

### Escopo e limitações

- Radar, preparo de pacotes, fila e conciliação de Feed/Reels são automatizados no servidor, sem Metricool.
- O **agendamento no Business Suite não foi conectado a qualquer ferramenta deste chat**. Para executar esse passo, é preciso um navegador autenticado (como o Work) aberto com permissão do usuário. Uma execução no Work pode agendar um lote, mas **não significa automação contínua 24h**.
- Automação contínua de publicação no Instagram depende do restabelecimento legítimo da API oficial ou de alternativa oficial explicitamente autorizada pela Meta.
