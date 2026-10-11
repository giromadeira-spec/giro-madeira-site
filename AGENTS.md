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
- O gerador automático de Shorts está em `scripts/giro_shorts_auto.py`; a cópia para TikTok em `scripts/buffer/giro_tiktok_30fps.py`. TikTok deve reutilizar o material **visual aprovado** dos Shorts, e não aplicar outro template.
- Antes de alterar o renderizador, executar `python scripts/giro_shorts_auto.py --self-test` em modo QA; esse teste **não publica**.
- A documentação orienta a geração mas **não substitui** a validação de saída do renderizador nem a confirmação do provedor.

## Isolamento dos canais — 11/10/2026

Fonte operacional: [docs/RADARES_INDEPENDENTES.md](docs/RADARES_INDEPENDENTES.md). Toda mudança de radar, intervalo, fila ou agendamento deve identificar explicitamente um dos canais `shorts`, `tiktok`, `feed`, `stories`, `reels`. Nunca propagar configuração de um canal aos demais. Usar a RPC `giro_configurar_radar_independente` para mudar frequência somente no canal solicitado. Compartilhar identidade visual e fontes não autoriza compartilhar estado de consumo, aprovação, tentativas ou publicação. TikTok não depende de sucesso, ID ou vídeo público no YouTube. Publicação exige autorização por canal e revisão final: Shorts foi liberado em 11/10/2026; TikTok somente após a correção e verificação de qualidade. Feed, Stories e Reels continuam sob hold Meta. A ativação de um canal nunca libera os demais.


## Segurança editorial da imagem — correção TikTok 11/10/2026

- Nunca escolher imagem por palavra genérica “notícia”, imprensa, printing press, Cherokee Phoenix ou por fallback de busca desconectado da manchete. Se a pauta não puder ser classificada com confiança, não renderizar nem publicar.
- Notícias de prisão, tráfico, violência doméstica, homicídio e policiamento: permitir somente fotografia licenciada com assunto explicitamente compatível e comprovável por título/metadados (por exemplo viatura/luzes policiais quando claramente identificada como ilustração), sem sugerir que é foto real da ocorrência. Mostrar “IMAGEM ILUSTRATIVA” na arte.
- A licença legal não comprova pertinência: são verificações diferentes. O teste offline deve rejeitar “Cherokee Phoenix printing press” nas três pautas policiais identificadas, além de validar 1080×1920, identidade visual, Rio Madeira e MP4.
- As mídias da fila TikTok #49 e #52 foram rejeitadas; preservá-las para auditoria e bloquear os arquivos de conversão associados. Nunca alterar o status para aprovado por decreto nem republicar os vídeos antigos.
- O canal TikTok independente `giro_social_video_queue.platform=tiktok` só poderá publicar itens novos que passem pela geração com a regra visual corrigida e tenham vídeo 30 fps, identificação da fonte, aprovações e limites de postagem. Shorts usa fila distinta.
