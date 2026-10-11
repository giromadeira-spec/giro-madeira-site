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
- A criação deste pacote foi feita para um Reel específico. Não há rotina que envie automaticamente *cada nova* mídia para a pasta Drive; futura automação de exportação terá que ser desenvolvida/validada separadamente.
- O sistema ainda precisa de confirmação de sessão/permissões dentro do Meta Business Suite para validar se está disponível para a conta.
- Não usar Metricool neste fluxo, por escolha editorial do usuário.
