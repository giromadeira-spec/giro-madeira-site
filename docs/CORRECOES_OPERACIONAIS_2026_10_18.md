# Correções operacionais — 18/10/2026

## Implantado

- Deduplicação do legado por canal e ID remoto correspondente. Uma postagem antiga no Feed não consome automaticamente a pauta de Stories ou Reels. Mantidos limites, trava por canal e deduplicação interna por notícia.
- Preparação Instagram exclui mídias prontas em revisão; não gasta mais tentativas regenerando uma arte que depende de revisão.
- Shorts preserva a mesma pauta após 429, 5xx ou falha transitória de leitura: até duas retentativas, separadas por 15 minutos. Falta de fatos e erros definitivos continuam bloqueados. Preservados filtros de biografias de autores existentes em produção.
- Renderizador registra estado real, ID da fila e `ready_to_publish`; renderizar não implica aprovar ou publicar. Diagnósticos e prévias retidos por 14 dias.
- Publicador Instagram informa motivos explícitos de bloqueio, sem remover semáforo, restrições Meta ou autorização por canal.
- Ponte Shorts restringe também a conclusão ao `platform=youtube_shorts`.
- Consulta `giro_pipeline_status_readonly()` informa revisões, filas prontas, resultados incertos e IDs públicos por canal. TikTok exige também Buffer `sent`, data e link público. Canal desabilitado não recebe alerta de horário perdido.
- Workflow operacional às 08h50 e 22h50 de Porto Velho verifica os slots depois da janela de 45 minutos. Identidade OIDC própria só permite a consulta `monitor`, sem claim, aprovação, geração ou publicação. Falta de confirmação faz o check falhar com diagnóstico. Notificações dependem das preferências de GitHub Actions do operador.
- YouTube aceita ação autenticada `reconcile`: consulta somente vídeos com ID conhecido, confirma canal e visibilidade, salva somente o resultado. Nunca abre upload ou altera o horário de entrega. Resultado sem ID continua exigindo verificação manual. Cron exclusivo a cada 30 minutos; não publica.

## Pendências editoriais reais

No diagnóstico inicial, Shorts 321 e TikTok 316 eram ilustrações simbólicas, com revisão pendente e sem ID remoto. O banco não possuía fotografias aprovadas em `giro_imagens_autorizadas`. A correção técnica não concede licença, não converte uma ilustração em fotografia factual e não substitui revisão da mídia.

Feed e Reels estavam habilitados, Meta sem integrity hold e retomada em `feed_only`; Stories permanecia desabilitado. Mantidos esses estados e os horários de publicação existentes. Reels tem recuperação às 12h00, 12h15 e 12h30 de Porto Velho, dentro da janela até 12h44, mantendo o limite central de uma publicação/dia. Resultado incerto bloqueia novas tentativas naquele canal até reconciliação. Não foi feita postagem de teste.

## Contingências

- Revisão pendente: consultar o resumo do monitor, inspecionar mídia/fonte/licença e aprovar o item específico apenas após revisão. Sem material aprovado, registrar o slot perdido.
- Fonte temporariamente indisponível: retentativas limitadas da mesma pauta; depois, aguardar decisão editorial ou outra pauta elegível, sem reenvio de publicação incerta.
- Resultado remoto incerto: reconciliar IDs existentes; se não existir ID, conferir a plataforma antes de qualquer reenvio.
- GitHub atrasado: preparo antecipado e diagnóstico após o slot; não criar postagem compensatória fora da agenda.
- Meta bloqueada: preservar mídia e motivo do gate; não tentar contornar limite.

## Verificação

Testes offline do renderizador (MP4 1080x1920 com áudio, sem upload); testes de fotos e licenças; regressões editoriais TikTok e reconciliação Buffer; testes do monitor OIDC e da reconciliação YouTube; snapshot real do banco; reserva de Stories desfeita por rollback; revisão de permissões da RPC e advisors. Novas funções preservam autenticação por chave interna/OIDC.
