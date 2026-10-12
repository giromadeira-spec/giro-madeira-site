# MakeReels como produtor externo de vídeos — proposta

Data: 12/10/2026. Estado: desenho de integração; conector NÃO implementado nem ativado.

O responsável quer usar o MakeReels para produzir vídeos de notícias do Giro Madeira e reutilizar o MP4 original nas redes. Esta proposta mantém radar, fila, aprovação, agenda, tentativas e confirmação de publicação independentes por canal. A reutilização de uma mídia não depende de postagem anterior no TikTok ou YouTube.

## Evidências e pendências

| Item | Estado |
| --- | --- |
| TikTok giro_madeira no MakeReels | Interface observada em 12/10/2026: conectado. Isso não comprova geração, publicação ou acesso a uma API. |
| Download de vídeo | Um MP4 exportado pelo operador foi recebido e inspecionado anteriormente. Não comprova endpoint de download automático. |
| Geração por RSS | Anunciada na página oficial de planos; entrada de notícias, não comprovação de entrega do arquivo ao Giro. |
| API pública de criação/exportação | Documentação não localizada; a página oficial tem uma pergunta sobre API sem resposta no conteúdo acessível. Não concluir que uma API inexiste. |
| Webhook de vídeo pronto | Não confirmado. |
| Plano, créditos, custos e remoção da marca do fornecedor por API | Não confirmados. |
| Conector implementado | Não. Este documento não cria endpoints, credenciais, banco, cron ou publicações. |
| Teste completo | Ainda não executado. |

Referência oficial consultada: https://makereels.ai/en/pricing.
Não tratar chamadas internas do site ou cookies do navegador como contrato público de integração.
A dificuldade de controle do navegador desta conversa não é evidência de inexistência de API.

## Encaixe verificado no repositório

Referências: `AGENTS.md`, `docs/RADARES_INDEPENDENTES.md`.

- Shorts e TikTok utilizam pontes distintas:
  `supabase/functions/giro-shorts-github-bridge/index.ts` e
  `supabase/functions/giro-tiktok-github-bridge/index.ts`.
- Ambas exigem OIDC GitHub e controlam reserva, upload no bucket `news-videos` e conclusão de renderização. A conclusão existente marca aprovação editorial/visual após QA do renderizador próprio. NÃO enviar um vídeo externo por esse caminho fingindo que foi renderizado/aprovado pelo GitHub.
- Fila Shorts: `giro_social_video_queue.platform=youtube_shorts`.
- Fila TikTok: `giro_social_video_queue.platform=tiktok`; conservar preparação própria de 30 fps.
- Reels usa `giro_publicacoes_reels` e seu preparador independente
  `supabase/functions/giro-instagram-preparar-independente/index.ts`.
- Feed e Stories têm filas e tipos de mídia próprios. Receber um MP4 não gera nem aprova suas artes automaticamente.
- Reutilizar o original requer um caminho explícito de importação/revisão; não copiar ID remoto, aprovação, agendamento ou resultado de envio entre linhas.

O estado de produção precisa ser relido antes de qualquer futura implantação. Este desenho não muda gates nem restrições Meta e não troca o produtor já ativo.

## Contrato a solicitar ao MakeReels

Antes de programar chamadas, obter documentação oficial ou confirmação técnica por escrito de:

1. API para criar vídeo a partir de roteiro/notícia, português brasileiro, logo oficial, fotos fornecidas e parâmetros visuais.
2. Autenticação por credencial própria de integração, escopo, limites e plano necessário. Não pedir senha, OTP ou cookies.
3. Identificador estável do trabalho, consulta de status, erros, prazo de geração e idempotência: uma repetição não deve cobrar/gerar outro vídeo involuntariamente.
4. Webhook de conclusão, se disponível, com assinatura verificável, identificador de evento e política de repetição. Se não houver webhook, verificar consulta oficial de status.
5. Exportação do MP4 original, validade do link, renovação e download sem exigir postagem numa rede.
6. Política de marca-d'água, direitos das mídias/trilhas, custos e possibilidade de desativar publicação direta para usar somente geração/exportação.

Se a API não existir, pedir um mecanismo oficial de exportação automática. RSS sozinho não resolve a transferência de saída. Não contratar plano para supor que API/webhook estão incluídos.

## Fluxo proposto, condicionado ao contrato oficial

1. Um radar independente encontra e valida a pauta: fonte, data, local, relevância e duplicidade.
2. O adaptador cria um trabalho MakeReels com roteiro factual e mídias pertinentes; grava identificador antes de consultar resultado.
3. Webhook autenticado ou consulta oficial recebe a conclusão e obtém o MP4 original.
4. O worker importa o vídeo para armazenamento controlado e guarda origem, identificador do fornecedor, hash, fonte da notícia, licenças e parâmetros usados. Links temporários não podem ser a única cópia.
5. Validação técnica confere decodificação, MP4 H.264/AAC, áudio, 1080x1920, duração e adequação ao canal; TikTok mantém sua conversão/checagem de 30 fps.
6. Revisão editorial confere notícia, narração, legenda, imagens, logo, Rio Madeira, fonte e margens. Dimensão/codec não comprovam aprovação editorial.
7. Cada destino elegível associa a mídia à sua própria linha, com aprovação e agendamento próprios. Não criar linha duplicada para pauta já presente; não substituir mídia publicada.
8. O publicador já existente respeita o gate e os limites do seu canal; confirmação depende de ID remoto e reconciliação.

O fornecedor produzirá mídia, não será autoridade para liberar canais ou declarar revisão visual aprovada.
Um vídeo não depende de publicação anterior no TikTok para ser usado em Shorts ou Reels.
Se publicação direta do MakeReels e publicador do Giro estiverem simultaneamente ativos para a mesma pauta/canal, há risco de duplicação; definir um único responsável pelo envio antes de ativar.

## Identidade e revisão

Usar a composição oficial descrita em `AGENTS.md` e documentos visuais atuais:
fotografia pertinente/licenciada, logo original circular único, categoria amarela,
manchete branco/amarelo, Rio Madeira visível, apoio factual e fonte, sem símbolo de play.
O cadastro de marca no MakeReels não comprova que a saída respeita a composição.

Não permitir cenas dos EUA como registro de eleições brasileiras ou imagens genéricas
apresentadas como se fossem da ocorrência. Identificar material ilustrativo.
A arte de teste enviada anteriormente precisou de cobertura da marca do fornecedor e
continha imagens inadequadas; não é referência aprovada para publicação automática.

## Persistência e recuperação

- Reserva e idempotência por trabalho de geração; deduplicação de entregas por evento/versão.
- Deduplicação de publicação por canal e pauta. O mesmo hash em canais distintos não equivale a duplicata de publicação.
- Falha de geração/download mantém pauta, roteiro e identificador. Retomar do último passo confirmado.
- Não regenerar o vídeo por erro de upload/publicação nem pagar duas vezes por estado remoto ambíguo.
- Falha de um destino não reinicia ou libera os outros.
- Link não confiável, mídia inválida ou revisão reprovada ficam em quarentena.
- Segredos ficam no servidor e nunca no frontend/repositório; webhook sem autenticação não aprova mídia.

## Primeiro teste quando o contrato estiver disponível

Executar com uma pauta oficial e sem publicação:
- Criar um trabalho e recuperar o MP4 por mecanismo documentado.
- Verificar um evento repetido/consulta repetida sem gerar novo trabalho ou mídia duplicada.
- Validar saída técnica e inspecionar visual/narração.
- Simular falha de download e retomada mantendo identificador.
- Associar à fila de teste de um canal com revisão pendente, sem autoaprovação herdada.
- Confirmar que filas/horários/gates dos outros canais não mudaram.
- Só depois planejar teste de postagem no canal autorizado com reconciliação de ID remoto.

## Próximo passo bloqueante

Obter documentação ou resposta técnica do MakeReels sobre criação, status e exportação.
Com essa resposta, implementar o adaptador de acordo com o contrato real e preparar o teste acima.
Até lá, este documento é preparação; não afirmar que a integração ou a automação estão prontas.
