# Auditoria gratuita — Giro Madeira

## Configuração oficial em 12/10/2026

O responsável exige **zero gasto adicional** e não deseja configurar API paga.
As instruções anteriores de cadastrar OPENAI_API_KEY e ativar análise diária de
IA foram canceladas. A rotina continua como auditoria determinística, sem LLM. A correção operacional do TikTok é feita pela fiscalização autorizada do ChatGPT, com conectores GitHub/Supabase e controles de idempotência.

Implementado: LangGraph 1.2.14 coordena verificações locais, Ruflo 3.56.7 executa análise estática e OpenHands SDK 1.54.0 aplica um guard de padrões sem LLM. Checkpoints SQLite 3.1.1.
GitHub Actions executa em mudanças de scripts/workflows/contratos na main, pull
requests, botão manual e diariamente às 11h17 UTC (07h17 Porto Velho / 08h17 São
Paulo), sujeito a atrasos do GitHub. Não depende de manter esta conversa aberta.

## Política sem API paga

- Workflow não possui OPENAI_API_KEY, secrets, --use-ai ou gatilhos de análise paga.
- A função consult_agent recusa chamadas, mesmo com uma chave no ambiente.
- O parâmetro legado --use-ai falha sem consultar provedores e preserva relatório.
- GIRO_AGENT_AI_ENABLED, OPENAI_AGENT_AUDIT_MODEL e marcadores [test-ai] não ativam IA.
- Não é necessário criar chave, cadastrar cartão ou comprar créditos para esta rotina.
- O relatório é apresentado no resumo do Actions. Não há upload de artefatos nem
  cache persistente neste workflow; checkpoints ficam no runner efêmero ou no uso local.
- Usa ubuntu-latest, executor padrão em repositório público. A documentação do GitHub
  informa que execução de Actions com executor padrão em repositório público é gratuita:
  https://docs.github.com/en/billing/concepts/product-billing/github-actions
- Não altera configuração, contratação ou custos de serviços externos já existentes.

## O que a auditoria faz

Confere presença dos contratos, regras documentadas de arte, nomes dos cinco
radares, sintaxe do renderizador e YAML dos workflows, além de executar testes.
Produz evidências locais; não interpreta problemas usando um modelo de linguagem,
não corrige código sozinha e não confirma o estado real das publicações ou do banco.
A análise e correção assistida pelo ChatGPT podem continuar nesta conversa.

## Componentes avaliados

| Projeto | Resultado | Uso atual |
|---|---|---|
| LangGraph 1.2.14 / SQLite 3.1.1 | Grafo real e retomada testados offline | Auditoria local sem LLM |
| OpenHands SDK 1.54.0 | Contrato e PatternSecurityAnalyzer testados | Guard local integrado, sem inferência |
| Ruflo CLI 3.56.7 | Análise estática executada e versão fixada | Integrado ao workflow; nenhum swarm/daemon/provedor LLM ativo |

Software de orquestração aberto não oferece, por si só, modelos gratuitos.
Nenhum desses componentes está usando API paga nesta auditoria.

## Arquivos e execução

- scripts/ai_agents/audit.py: checklist estático; chamada de API bloqueada.
- scripts/ai_agents/orchestrate.py: grafo LangGraph offline e checkpoints locais.
- scripts/ai_agents/requirements.txt: dependências fixadas e testadas.
- tests/test_ai_agents_*.py: testes sem rede, incluindo bloqueio de API com chave presente.
- .github/workflows/ai-agent-audit.yml: CI/agenda/botão manual sem secrets nem API.
- docs/archive/publicar-noticias-04-10.yml.disabled: publicador legado inválido preservado
  fora da pasta de execução, sem reinserir notícias antigas nem modificar news.js.

```sh
python -m pip install -r scripts/ai_agents/requirements-ecosystem.txt
python -m unittest discover -s tests -p 'test_ai_agents_*.py' -v
npm ci --ignore-scripts --no-audit --no-fund --prefix scripts/ai_agents/toolchain
node --experimental-strip-types tests/test_tiktok_editorial.mjs
python scripts/ai_agents/orchestrate.py --ecosystem --task-id auditoria-local
```

No GitHub: Actions → Giro Madeira - auditoria gratuita (sem API) → Run workflow → main.
Não há opção use_ai. Leia o resumo da execução; aprovação dos testes não equivale a
validação das redes sociais.

Retomada local: mesmo task-id, checkpoint, código e modo. No Actions cada run é
independente e não restaura SQLite anterior. A serialização aceita tipos básicos,
sem pickle nem módulos externos. Testes de orquestração usam funções falsas e
não consultam provedores.

## Publicações e isolamento

Preservar AGENTS.md e o padrão GIRO_EDITORIAL_FOTO_MANCHETE_RIO_V1, logo original
e Rio Madeira. Radar, fila, autorização, status e horários de Shorts, TikTok, Feed,
Stories e Reels permanecem independentes. Esta rotina não acessa Supabase, tokens
sociais, publicadores, banco, filas ou comandos de edição executados por LLM.
Não muda publication_enabled, integrity_hold ou aprovação de canais.

Permissão Actions: contents: read. Checkout sem credenciais persistentes, tracing
externo desativado. Nenhuma publicação é feita pela auditoria. Restaurar integração
paga exigiria nova instrução explícita do responsável; não reverter este bloqueio
por causa de uma variável antiga ou de uma sugestão de agente.



## TikTok — política e recuperação

Só notícias atuais e de grande impacto, por ordem Brasil, mundo e Rondônia. A pontuação do radar e uma palavra “urgente” não bastam. A data da própria reportagem é obrigatória (até 24h); opinião, promessa, rotina policial, previsão comum e entretenimento não preenchem vaga. Horários Porto Velho: 06h30, 10h, 13h30, 17h, 20h30; até 5/dia, mínimo 90min, janela de 45min. Uma janela sem pauta aprovada pode ficar vazia.

Sucesso exige vídeo aprovado 1080x1920/30fps, Buffer sent e link TikTok oficial. Queued não é sucesso. A fiscalização horária autorizada pode corrigir falhas técnicas testáveis e retomar a mesma linha até duas vezes, mantendo fonte/roteiro/mídia. Entrega incerta exige reconciliação; mídia rejeitada, fonte sem fatos/data/licença e regras editoriais não podem ser contornadas. HTTP 429/5xx/timeout da fonte recebe backoff de 15min na mesma pauta; depois do limite, fica retida para diagnóstico.

## Memória e limites reais

Ruflo é executado para análise estática. O fallback sql.js da CLI 3.56.7 apresentou falha no WAL checkpoint neste ambiente; a integração exige driver nativo validado para gravar por essa CLI. Quando indisponível, usa SQLite Python local com gravação/leitura verificadas. A política canônica é `scripts/ai_agents/ecosystem-policy.json`. Dados da memória não contêm tokens, segredos ou conteúdo de contas conectadas. Como antes, estado local do runner é efêmero; políticas e configurações persistem no GitHub.

OpenHands usa somente AgentContext e PatternSecurityAnalyzer locais. Não há modelo escrevendo código autonomamente nem 60 IAs gratuitas ligadas ao chat. Ruflo MCP está preparado para cliente local; esta sessão não ganha ferramentas MCP automaticamente ao editar um arquivo. A fiscalização do ChatGPT é o agente operacional já conectado ao GitHub/Supabase.
