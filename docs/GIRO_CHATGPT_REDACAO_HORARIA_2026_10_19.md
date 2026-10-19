# Giro Madeira — Redação ChatGPT horária (19/10/2026)

## Objetivo
Uma verificação editorial por hora, **07:00–22:00 America/Porto_Velho**, sem poluir
filas com múltiplas descobertas. O ChatGPT deve selecionar no máximo uma matéria
inédita por ciclo. Uma única pauta origina Feed, Reel e Story. Story não tem pauta própria.

## O que está instalado em produção
- Supabase \`dsihvbdhocbqscaypraw\`:
  - \`giro_channel_settings\`: radar_enabled=false e preparation_enabled=false
    somente para feed/reels/stories. publication_enabled continua true.
  - Nove pg_cron de radar, preparo e auto-review Instagram desativados.
  - Quatro artes simbólicas antigas que aguardavam envio tiveram a
    aprovação automática revertida, sem apagar publicações confirmadas.
  - \`giro_chatgpt_pacotes\`: um pacote editorial e IDs vinculados aos três canais,
    RLS ativado, nenhuma política pública.
  - \`giro_chatgpt_registrar_pacote\`: transação com direitos, QA,
    horário local, não duplicidade, caminhos e metadados de Storage.
  - \`giro_chatgpt_pacote_guard\`: enquanto a Meta continuar em semáforo
    amarelo com apenas um post por canal ao dia, impede backlog
    (um pacote/dia e nenhum pacote anterior aguardando entrega).
  - Edge Function \`giro-chatgpt-importar-drive\`, autenticação
    \`x-giro-db-key\` validada no banco; nunca revelar a chave.
- Tarefa existente do ChatGPT reaproveitada: **Giro Madeira — Redação 1h**,
  das 7h às 22h (TZID America/Porto_Velho). Não usa API OpenAI paga.
- GitHub: \`supabase/functions/giro-chatgpt-importar-drive/index.ts\`.
- Shorts e TikTok não foram alterados.

## Arquivos finais por pauta
Na pasta de Google Drive de ID \`1ul9OaWc3M3UNNPKnS6adPKeUC2SX6i5M\`,
adotar **somente após produção/inspeção real** (exemplo ciclo 2026-10-19 17:00):
- \`giro-202610191700-feed.jpg\`: JPEG 1080×1080.
- \`giro-202610191700-reel-story.jpg\`: JPEG 1080×1920, base visual do Reel.
- \`giro-202610191700-story.jpg\`: JPEG 1080×1920, Story da mesma notícia.
- \`giro-202610191700-reel.mp4\`: vídeo final MP4 vertical com som licenciado.

A Edge exige os quatro arquivos finais **dentro dessa pasta** e valida
MIME, tamanho, dimensões JPEG e assinatura MP4. Sem os quatro, não há
entrada em \`giro_chatgpt_pacotes\` nem aprovação/publicação.
Ela importa para:
- \`news-images/auto/jpeg/feed/feed/...\`
- \`news-images/auto/jpeg/reels/story/...\`
- \`news-images/auto/jpeg/stories/story/...\`
- \`news-videos/auto/reels/reels/...\`

Depois chama RPC \`giro_chatgpt_registrar_pacote\` com título, fonte,
resumo, legenda, tipo de imagem, crédito, comprovação de direitos e
**prova real de QA visual**. A RPC grava uma linha em cada uma das
três tabelas independentes com IDs ligados no pacote. Não há
publicação direta nessa função; os publicadores existentes respeitam
seus gates e retornam ID Meta apenas em caso de sucesso.

## Metas versus limites técnicos
A tarefa executa até 16 ciclos de pesquisa diários; isso **não é**
compromisso de 16 posts/dia. O publicador de produção ainda usa janelas
Feed 12:00, Reel 13:30 e Story 15:30 (Porto Velho), no máximo um post por
formato ao dia e intervalo conservador entre publicações devido ao
semáforo amarelo Meta. Não desativar essas proteções para forçar volume.

## Verificações executadas
- Estado de 9 crons e 3 configurações relido após atualização.
- Autorização RPC: anon/authenticated sem EXECUTE; service_role com EXECUTE.
- Teste negativo da RPC: arquivos externos/ausentes rejeitados.
- Teste transacional reversível usando mídia histórica: função aceitou
  formato completo e desfez todos os inserts propositalmente.
- Chamada autenticada real à Edge: \`invalid_hourly_slot\` HTTP 422.
- Chamada autenticada válida de teste: acessou a pasta do Drive e
  retornou \`drive_final_asset_missing\` HTTP 422 (sem publicar).
- Nenhum novo Instagram media ID foi confirmado por este rollout.

## Pendências para afirmar "100% automático"
Ainda não está demonstrado que a execução **agendada** tem capacidade
de gerar, inspecionar e enviar os quatro arquivos (incluindo MP4 final)
com acesso a \`file_uri\` e Google Drive upload. É necessário observar
um ciclo real ponta a ponta e conferir URLs do Storage, IDs de pacote,
gates da Meta e IDs efetivos do Instagram. Se faltar capacidade no
ambiente agendado, não aprovar/publicar nem inventar mídia; manter
o sistema sem fila acumulada e tratar essa integração separadamente.
