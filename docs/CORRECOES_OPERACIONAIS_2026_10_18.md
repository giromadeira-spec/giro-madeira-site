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

## Revisão de conteúdo e imagens — segundo lote de 18/10

- Inspeção visual encontrou escudos genéricos em Shorts 321 e Feed 52. Shorts 321 foi marcado como revisão rejeitada; Feed 52 continua sem aprovação. Nenhuma mídia foi publicada por esta revisão.
- Cadastro de fotos antes disponível só para Shorts passou a ser consultado por Instagram e por toda a cadeia TikTok, incluindo conversão 30fps e último gate do Buffer. Artigo, título, crédito, validade e permissões individuais são revalidados. Revogação/ausência de direito impede uso.
- Descoberta de foto gera somente candidata pendente; não transforma origem pública em licença. Duas candidatas oficiais (tapa-buracos de Porto Velho e Operação Contrafluxo II) foram cadastradas sem aprovação de direitos.
- Produção deixa de criar escudos genéricos quando falta fotografia factual licenciada. A mesma pauta fica aguardando foto; aprovação individual no cadastro retoma o preparo sem conceder aprovação editorial nem reenviar mídia publicada.
- Legendas priorizam frases completas do corpo da reportagem; descrições SEO cortadas, iniciais pessoais isoladas e cabeçalhos colados ao texto não devem preencher a notícia.
- Roteiros rejeitam referências soltas como “Entre elas”, “Ele afirma” e “Esse número”. TikTok verifica o limite de 24 horas no horário futuro da publicação. Item 317 expirado após revisão da data da reportagem.
- Autorização de uso das fotografias é uma pendência de conteúdo: não foi inferida a partir de site oficial, crédito ou publicação em rede social. Sem licença individual comprovada, a foto não será aprovada.

## Retomada das configurações — 18/10

- Checks de auditoria e revisão de mídia do commit 7121be8 concluídos com sucesso. Consulta ao cron sem falhas de execução nas duas horas anteriores à retomada; isso não comprova entrega social.
- Shorts passa a verificar a data na reportagem original (metadados/JSON-LD), com limite de 24 horas no horário previsto da postagem. A coleta recente do radar não torna uma matéria antiga atual. Teste do handler cobre data válida, antiga, ausente e inválida, inclusive publicação futura, sem upload.
- Mantidos os horários e os estados de habilitação de cada canal. As duas fotografias cadastradas ainda estão pendentes de direitos; não há item pronto nem confirmação pública nas últimas 24 horas no snapshot da retomada. Nenhuma publicação foi acionada durante a manutenção.

## Validação final solicitada em 18/10

- Data verificada da reportagem persistida em `storyboard_source_published_at`. Roteiros preparados antes dessa prova entram novamente no preparo, apenas enquanto não renderizados e sem ID remoto. Registro e arquivos anteriores são preservados.
- Shorts e TikTok verificam a data tanto para o horário previsto quanto para o momento efetivo. Atraso não estende as 24 horas; data futura não é aceita como publicação já ocorrida.
- Pontes de renderização recusam prova ausente/vencida. YouTube e último gate Buffer repetem a validação antes do envio. A reconciliação de envios passados não depende da atualidade da notícia e continua disponível.
- Testes do handler verificam legado preparado vencido, legado atual retomado, item já verificado sem refazer, metadados/JSON-LD e isolamento por plataforma. Teste do publicador recusa datas ausentes e vencidas antes de qualquer requisição de upload; notícia atual passa apenas pela prévia.
- Instagram mantém a retomada controlada: Feed/Reels com capacidade central de uma publicação ao dia, Stories desabilitado. Esse limite é da conta e não compartilha consumo editorial entre canais. Não se elevou a cadência nem se liberou um canal durante a manutenção.
- Teste real de entrega segue condicionado a pauta atual elegível, fotografia do acontecimento com direitos comprovados, revisão da mídia e aprovação expressa de publicação. Não há garantia de ausência de futuras indisponibilidades de fontes, GitHub ou plataformas.

### Evidência após implantação

- Commit 281971d: seis funções ativas atualizadas; checagem Deno, foto guard, reconciliação TikTok e auditoria GitHub concluídas com sucesso.
- Rechecagem autenticada de Shorts (sem uploader) processou o mesmo item 319. Leitura posterior confirmou `status=expirado`, `storyboard_status=invalido` e erro `article_date_unverified_or_outdated`, sem ID remoto e sem aprovação. TikTok não tinha roteiro não renderizado pendente e processou zero.
- Consulta de configuração do Buffer retornou chave presente, canal `giro_madeira`, dois vídeos por dia e intervalo de 90 minutos. Isso não comprova validade atual das credenciais remotas nem postagem real.
- Ensaio do publicador Instagram com provedor simulado: confirmou persistência do ID; envio por formato/canal; Reels sem compartilhar no Feed; duplicidade por canal; perda da reserva; timeout; resposta sem ID; falha ao salvar ID confirmado. Resultados incertos bloqueiam reenvio. Nenhuma requisição externa nesse ensaio.
- Pesquisa de mídia não encontrou pauta atualmente elegível com toda a cadeia de direitos e correspondência da fotografia comprovada. Material de terceiros e arquivo não foi aprovado; algumas páginas/candidatas retornaram indisponibilidade. Não foi produzida uma aprovação de publicação para material sem prova.

### Plano B autorizado e seleção de pauta

- Recuperada a autorização do responsável em 17/10, posterior à regra de 15/10: foto real autorizada primeiro; sem foto segura, arte original assumidamente ilustrativa, sem simular registro real. Esse modo foi reativado separadamente nas pontes Shorts/TikTok, somente para temas reconhecidos; escudo genérico para assunto desconhecido segue bloqueado. Conclusão de ilustração continua pendente de aprovação editorial e visual.
- Testes cobrem modo desabilitado, tema desconhecido, arte identificada por pauta, prioridade da fotografia, MP4 e ausência de aprovação automática. Sem API paga.
- Detectado e corrigido falso nacional por rótulo de feed: uma reportagem de editoria regional G1/MG não se torna nacional só porque o coletor se chama G1 Brasil. As políticas de Shorts e TikTok mantêm avaliações independentes. Shorts também reconhece ocorrências com cinco ou mais vítimas como alto impacto e evita escolher matéria já vencida no slot futuro.
