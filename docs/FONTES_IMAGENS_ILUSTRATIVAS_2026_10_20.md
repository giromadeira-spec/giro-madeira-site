# Giro Madeira — fotografias ilustrativas licenciadas (20/10/2026)

## Objetivo
Se não houver foto vinculada à ocorrência, evitar bloqueio de preparação de arte
usando mídia **ilustrativa identificada** ou desenho original, sem fingir que registra
o fato real e sem usar imagens protegidas do portal noticioso.

## Fontes e direitos
- Fotografia do acontecimento: somente o cadastro interno `giro_imagens_autorizadas`
  com vinculação à mesma matéria, direitos confirmados e revisão.
- Instagram Feed, Stories e Reels: procurar ilustração de tema neutro entre arquivos
  com licença **CC0** ou **CC BY** por Wikimedia Commons e Openverse.
  Os metadados devem comprovar licença, autor (quando CC BY), página de origem e
  permissões da própria licença. A pesquisa temática não é comprovação do evento.
- Pexels, Pixabay e Unsplash: aptos a avaliação editorial por licença individual,
  mas **não configurados como conectores automáticos** nesta revisão; não fingir
  integração com API nem coletar URLs sem rastreabilidade.
- Não usar fotos identificáveis de vítimas, suspeitos, agentes ou políticos para
  sugerir participação em eventos diferentes; casos sensíveis mantêm arte original
  ou aguardam foto autorizada.
- A legenda conserva autor, licença e URL da imagem ilustrativa; nunca omitir
  créditos obrigatórios das licenças CC BY.

## Fluxo e proteção
1. Buscar primeiro foto factual no registro de imagens autorizadas.
2. Se não houver, para pautas ilustráveis e dentro do orçamento de tempo,
   buscar Commons/Openverse com a licença por arquivo; marcar claramente
   **IMAGEM ILUSTRATIVA — NÃO É FOTO DO FATO**.
3. Se não houver foto ilustrativa verificável, usar arte editorial própria,
   declaradamente não fotográfica, com assunto classificável.
4. Shorts e TikTok passam a aceitar **arte original específica** quando houver
   autorização `allow_original_editorial_illustration` fornecida pela ponte do
   canal. Caso contrário, continuam em `photo_pending`.
5. Nenhuma mídia ilustrativa é aprovada automaticamente como foto da notícia.
   Preservar revisão por canal, expiração editorial, reconciliação de entrega
   e bloqueio de duplicidades.
6. Não reutilizar imagem de portal jornalístico por padrão, não operar API paga
   e não publicar durante os testes.

## Verificação
- Testes de regressão locais cobrem primeiro foto factual, etiqueta correta,
  fallback por canal, crédito e ausência de aprovação/publicação automática.
- Deploy Supabase e confirmação de publicações são etapas separadas; um commit
  ou execução de QA não prova publicação nas redes.
