# Instruções visuais obrigatórias — Giro Madeira

> Fonte canônica: [docs/GIRO_MADEIRA_PADRAO_VISUAL.md](docs/GIRO_MADEIRA_PADRAO_VISUAL.md) e [docs/REFERENCIA_CAPA_OFICIAL.md](docs/REFERENCIA_CAPA_OFICIAL.md).

Qualquer automação, agente de código, gerador de imagem ou renderizador do repositório deve usar o padrão `GIRO_EDITORIAL_FOTO_MANCHETE_RIO_V1` nas artes de **YouTube Shorts, TikTok, Instagram Reels, Stories e Feed**. O exemplo de gasolina fornecido pelo responsável em 10/10/2026 define **o layout**, nunca é notícia factual a replicar sem apuração.

### Composição aprovada
1. **Imagem principal fotográfica dominante**, adequada à pauta, preenchendo o quadro; gradiente azul-marinho/preto para legibilidade.
2. **Logo circular ORIGINAL** do Giro Madeira, grande, no canto superior esquerdo. Usar `assets/logo-oficial.webp`; NÃO redesenhar, NÃO duplicar a marca com um segundo texto GIRO/MADEIRA.
3. Tarja angular/amarela com **categoria** (ex.: ECONOMIA) e pequeno ícone editorial pertinente, seguida de filete amarelo.
4. **Manchete extremamente forte**, caixa alta, alinhada à esquerda, em blocos de branco e amarelo, com quebra por palavras completas. A cor amarela destaca a segunda linha ou o trecho relevante. Nunca cortar frases ou criar preços/estatísticas.
5. Uma **linha de apoio factual** discreta sob a manchete, com linha fina amarela.
6. **Rio Madeira sempre visível na faixa inferior** como assinatura regional; foto regional autorizada ou ilustração original assumidamente ilustrativa; crédito/fonte discretos e legíveis.
7. Grafismos vermelhos (como seta de alta) SOMENTE se confirmados pela pauta e visualmente pertinentes. **Nunca usar** botão de play/triângulo, marca d'água de vídeo, caixa preta genérica enorme, logotipo de outro portal, composição improvisada ou créditos poluídos.

### Formatos
- Feed: **1080x1080**.
- Stories, Reels, TikTok, Shorts: **1080x1920**, mantendo a mesma hierarquia visual e margens seguras; **não esticar** uma imagem quadrada para vertical. Reposicionar elementos.
- Não aplicar por engano horários ou integrações de uma plataforma a outras.

### Verificação de qualidade (bloqueante)
Conferir dimensão, logo original, foto licenciada/adequada, tarja de categoria, hierarquia branco/amarelo, Rio Madeira, manchete por inteiro, apoio e fonte verdadeiros, área segura da interface, ausência de play, e ausência de duplicidade. **Falhou 1 item => não publicar; encaminhar para revisão/refazer sem duplicar o item na fila.** Falha ou resultado remoto ambíguo nunca autoriza reenvio sem reconciliação.

### Implementação
- Shorts e TikTok usam o renderizador visual comum `scripts/giro_shorts_auto.py`, mas com radares, pautas, filas, mídias e publicações totalmente independentes; `--tiktok` utiliza a ponte e a fila próprias e `scripts/buffer/giro_tiktok_30fps.py` converte somente os vídeos do TikTok. Compartilhar o padrão visual aprovado NÃO significa reaproveitar o vídeo ou depender de postagem no YouTube.
- Antes de alterar o renderizador, executar `python scripts/giro_shorts_auto.py --self-test` em modo QA; esse teste **não publica**.
- A documentação orienta a geração mas **não substitui** a validação de saída do renderizador nem a confirmação do provedor.

## Isolamento dos canais — 11/10/2026

Fonte operacional: [docs/RADARES_INDEPENDENTES.md](docs/RADARES_INDEPENDENTES.md). Toda mudança de radar, intervalo, fila ou agendamento deve identificar explicitamente um dos canais `shorts`, `tiktok`, `feed`, `stories`, `reels`. Nunca propagar configuração de um canal aos demais. Usar a RPC `giro_configurar_radar_independente` para mudar frequência somente no canal solicitado. Compartilhar identidade visual e fontes não autoriza compartilhar estado de consumo, aprovação, tentativas ou publicação. TikTok não depende de sucesso, ID ou vídeo público no YouTube. Publicação exige autorização por canal e revisão final: Shorts foi liberado em 11/10/2026; TikTok teve gate próprio liberado no mesmo dia após correção preventiva das imagens, sem confirmar ainda uma nova publicação real. Feed, Stories e Reels continuam sob hold Meta. A ativação de um canal nunca libera os demais.


## Fotografia factual obrigatória — 15/10/2026 (substitui permissões anteriores de imagens temáticas)

A partir deste ajuste, **Shorts, TikTok, Feed, Stories e Reels** não podem usar fotografia genérica de bancos de imagens, Openverse, pesquisa temática do Commons nem arquivo antigo apenas porque a categoria combina com a manchete. Em particular, fotos de viaturas, estradas, políticos, guerras ou escolas **não** representam uma ocorrência específica.

A imagem principal deve ter uma cadeia de evidências auditável:

1. URL HTTPS da **reportagem original** da pauta aprovada (não um resultado de pesquisa similar).
2. Fotografia explicitamente ligada à **mesma reportagem**, com legenda/alt identificando os detalhes da ocorrência e sem marcador de foto ilustrativa, arquivo, banco de imagens, montagem ou IA.
3. Permissão individual de uso: nesta primeira implementação, exigir imagem servida pelo Wikimedia Commons, vinculada à matéria e verificada por arquivo como **CC0 ou CC BY** (incluindo crédito e fonte). Foto de portal de notícias, órgão público ou rede social não é automaticamente reutilizável.
4. Aprovação visual só para fotografia com essas evidências; demais pautas ficam pendentes para avaliação/licenciamento, sem escolher uma imagem de outra ocorrência ou publicar automaticamente. Não fazer promessas falsas sobre a disponibilidade de fotos.
5. A tarja de imagem principal aprovada diz **FOTO DO ACONTECIMENTO**; artes internas de teste não publicáveis dizem **ARTE EDITORIAL** ou **IMAGEM ILUSTRATIVA**. O Rio Madeira na faixa inferior é apenas assinatura visual regional, nunca prova da ocorrência.
6. A fonte da notícia e os direitos da foto são duas verificações independentes; registrar ambas, preservar a fila, não repetir publicação, não aumentar cadência nem consumir APIs pagas de IA.

Código principal: `scripts/giro_shorts_auto.py` (Shorts/TikTok, execução GitHub Actions) e `supabase/functions/gerar-arte-noticia-vault/index.ts` (Instagram). A aprovação Instagram está em `supabase/functions/giro-instagram-preparar-independente/index.ts` e só reconhece `original_event_photo`. O fluxo mantém filas independentes e não publica um arquivo já existente por pressuposição de conformidade.

## Segurança editorial da imagem — correção TikTok 11/10/2026

- Nunca escolher imagem por palavra genérica “notícia”, imprensa, printing press, Cherokee Phoenix ou por fallback de busca desconectado da manchete. Se a pauta não puder ser classificada com confiança, não renderizar nem publicar.
- Notícias de prisão, tráfico, violência doméstica, homicídio e policiamento: permitir somente fotografia licenciada com assunto explicitamente compatível e comprovável por título/metadados (por exemplo viatura/luzes policiais quando claramente identificada como ilustração), sem sugerir que é foto real da ocorrência. Mostrar “IMAGEM ILUSTRATIVA” na arte.
- A licença legal não comprova pertinência: são verificações diferentes. O teste offline deve rejeitar “Cherokee Phoenix printing press” nas três pautas policiais identificadas, além de validar 1080×1920, identidade visual, Rio Madeira e MP4.
- As mídias da fila TikTok #49 e #52 foram rejeitadas; preservá-las para auditoria e bloquear os arquivos de conversão associados. Nunca alterar o status para aprovado por decreto nem republicar os vídeos antigos.
- O canal TikTok independente `giro_social_video_queue.platform=tiktok` só poderá publicar itens novos que passem pela geração com a regra visual corrigida e tenham vídeo 30 fps, identificação da fonte, aprovações e limites de postagem. Shorts usa fila distinta.



## TikTok — seleção e recuperação autorizadas em 12/10/2026

- Prioridade Brasil, depois mundo, por último Rondônia. Somente notícias atuais de grande impacto; escore alto e marcador urgente não substituem relevância. Não preencher vaga com rotina policial, previsão comum, opinião, promessa ou entretenimento.
- Conferir data na própria reportagem (até 24 horas), fonte, fatos, duplicidade e mídia. Não usar apenas a data recente de coleta/homepage para representar notícia antiga como atual.
- Agenda vigente desde 13/10/2026: TikTok e Shorts às **08h e 22h de Porto Velho**; TikTok até 2 vídeos/dia, mínimo 90min, janela 45min, sem urgência fora dos horários. Não preencher sem pauta aprovada.
- Fiscalização do ChatGPT autorizada a corrigir falhas técnicas claras e testadas SOMENTE no TikTok. Preservar e retomar o mesmo registro/mídia até duas vezes; sem duplicar. Publicação incerta exige reconciliação do Buffer antes de qualquer reenvio. HTTP 429/5xx/timeout da fonte tem backoff de 15min e retry limitado; falta de fatos/data/licença continua bloqueada.
- Sucesso exige aprovação editorial/visual, vídeo vertical 1080x1920/30fps e Buffer sent com link público TikTok. A sincronização Buffer -> fila editorial vale apenas quando platform=tiktok; não modificar IDs ou filas do YouTube. Avisos únicos por ocorrência.
- Ruflo, OpenHands e LangGraph do laboratório atuam em análise/revisão locais sem LLM pago. Não afirmar 60 IAs gratuitas ou conexão automática a este chat. Instalar modelos/provedores pagos continua proibido.

## Contingência editorial autorizada em 17/10/2026

A autorização posterior do responsável mantém fotografia do acontecimento como primeira opção e permite, quando não houver foto segura, **arte original claramente identificada como ilustração**, sem simular registro real, com identidade oficial. A arte não recebe licença fotográfica nem a tarja de foto real. Deve ser pertinente à pauta, vinculada à URL/manchete, sem escudo genérico para assunto desconhecido, sem foto de terceiros e sem API paga. A ponte autoriza esse modo separadamente em Shorts e TikTok; a conclusão permanece sem aprovação editorial/visual. A autorização de preparar arte não é autorização de publicar. Instagram continua com seu contrato próprio e revisão por formato.

## Padrão aprovado em 18/10/2026 — substitui referências anteriores conflitantes

O responsável aprovou a segunda prévia fotográfica da matéria sobre Victor Simões. Aplicar em Feed, Stories, Reels, Shorts e TikTok, com filas independentes:
- Foto autêntica ligada à pessoa ou ao acontecimento domina 60–70% da composição. Retrato anterior recebe FOTO DE ARQUIVO; nunca identificar como foto do acidente.
- Logo ORIGINAL menor no canto superior esquerdo, aproximadamente 13–16% da largura, sem reconstrução ou duplicação.
- Manchete curta, preferencialmente 3 linhas completas, branca com trecho principal amarelo; apoio factual em uma linha.
- Tarja de categoria discreta e faixa baixa do Rio Madeira, sem competir com a fotografia.
- ChatGPT trabalha composição e tipografia. A fotografia e rostos devem ser preservados, sem reconstrução generativa na mídia final de produção.
- Fonte e crédito na legenda; preservar atribuições exigidas pela licença. Prévia não comprova permissão de republicação.
- NÃO aprovar automaticamente arte abstrata/simbólica genérica como substituta dessa composição. Sem fotografia pertinente e autorizada, buscar outra pauta com foto válida ou reter o item; não publicar fundo genérico.
- Aprovação depende de inspeção da saída final. Documentação e HTTP 200 não comprovam qualidade nem publicação.

## Fotografia ilustrativa licenciada — 20/10/2026

A autorização posterior do responsável permite preparação de artes com **fotos temáticas licenciadas** em Feed/Stories/Reels mesmo sem foto factual do evento, desde que a foto seja rotulada no próprio quadro como **IMAGEM ILUSTRATIVA — NÃO É FOTO DO FATO**, creditada na legenda e nunca tratada como prova de ocorrência. Consultar `docs/FONTES_IMAGENS_ILUSTRATIVAS_2026_10_20.md`. A verificação individual do arquivo (CC0 ou CC BY com autoria/crédito), a pertinência e a revisão por canal continuam obrigatórias; pautas sensíveis não aceitam troca por pessoas fotografadas em outro contexto. Fotos da matéria permanecem condicionadas ao cadastro de direito + pertinência `giro_imagens_autorizadas`.

Shorts e TikTok podem preparar **arte vetorial original específica e rotulada** quando faltar foto factual, apenas com o gate `allow_original_editorial_illustration` da ponte própria, seguindo a assinatura de proveniência `original_editorial_labeled_v2_`. A arte preparada segue para revisão, e não equivale a autorização de publicação. Não liberar publicação, não mascarar erros, nem alterar filas/cadências dos demais canais.
