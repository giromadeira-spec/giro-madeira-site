# Laboratório de agentes — Giro Madeira

## Status em 12/10/2026

Implementado: auditoria somente leitura com **LangGraph 1.2.14**, checkpoints
**langgraph-checkpoint-sqlite 3.1.1**, verificações locais e dois papéis opcionais de
IA (auditor e revisor). Roda no GitHub Actions em alterações de scripts/workflows/
contratos na main, em pull requests e diariamente às **11h17 UTC** (07h17 Porto
Velho / 08h17 São Paulo), sujeito a atrasos do GitHub. Não depende desta conversa.
Relatório e SQLite são anexados por 14 dias; o relatório aparece no resumo do run.

Chamadas reais de IA dependem do secret **OPENAI_API_KEY**. Por padrão, CI e agenda
executam só o grafo offline, sem chamadas à API. A agenda passa a usar IA somente
quando a variável **GIRO_AGENT_AI_ENABLED=true** for configurada. PRs nunca recebem
a chave; IA só executa na main confiável por botão manual ou agenda autorizada.

Não implementado: agentes que corrigem código, abrem PRs, dão merge ou publicam
notícias. Ruflo e OpenHands são avaliados separadamente; n8n não foi instalado.

## Avaliação e decisão

| Projeto oficial | Papel | Decisão |
|---|---|---|
| https://github.com/langchain-ai/langgraph | Orquestração e checkpoints | Integrado ao laboratório; retomada testada sem escrita em produção |
| https://github.com/OpenHands/software-agent-sdk | Programação e testes em workspace efêmero | Candidato a gerar propostas de correção; precisa workspace sem credenciais sociais e revisão antes do merge |
| https://github.com/ruvnet/ruflo | Coordenação de agentes CLI/MCP | Candidato; depende de cliente executor/provedor configurado, não se conecta ao chat apenas por existir no GitHub |

LangGraph atende primeiro à necessidade de controlar etapas e retomar tarefas.
OpenHands e Ruflo acrescentam execução de ferramentas e permissões que não são
necessárias para uma auditoria. A quantidade de papéis de um framework não prova
que dezenas de modelos estejam conectados ou executando neste projeto.

Testes de compatibilidade realizados em ambientes isolados, sem tokens de produção:

| Componente | Versão | Resultado comprovado | Limite |
|---|---|---|---|
| LangGraph / SQLite | 1.2.14 / 3.1.1 | Grafo real, retomada do revisor sem repetir auditor, tarefa concluída sem novas chamadas; testes passaram | API simulada; não comprova acesso da conta OpenAI |
| OpenHands SDK | 1.54.0 | Instalação, importação e criação de `Agent` com `tools=[]`; rede bloqueada no smoke test | Não executou conversa, shell, edição nem modelo real |
| Ruflo CLI | 3.56.7 | Instalação npm com scripts de instalação desativados; `ruflo --version` retornou `ruflo v3.56.7`, exit 0 | Não iniciou daemon, MCP, swarm ou provedor |

Ruflo foi instalado fora do repositório, em workspace descartável. O npm exec
encontrou problemas locais de certificado/cache; instalação com prefixo e cache
isolados funcionou usando autoridades certificadoras do sistema, sem desativar TLS.
OpenHands e Ruflo não foram adicionados às dependências do workflow de auditoria.

Fontes oficiais consultadas:
- https://docs.langchain.com/oss/python/langgraph/checkpointers
- https://docs.openhands.dev/sdk/getting-started
- https://github.com/ruvnet/ruflo
- https://developers.openai.com/api/docs/guides/text
- https://developers.openai.com/api/docs/models/gpt-5.5

## Arquivos e testes

- `scripts/ai_agents/audit.py`: evidência estática, sintaxe Python e YAML, API sem ferramentas.
- `scripts/ai_agents/orchestrate.py`: grafo LangGraph com auditor, revisor e conclusão.
- `scripts/ai_agents/requirements.txt`: dependências diretas/transitivas fixadas e testadas.
- `tests/test_ai_agents_*.py`: testes offline, API simulada e retomada real do grafo.
- `.github/workflows/ai-agent-audit.yml`: CI/agenda offline e IA opt-in na main.
- `docs/archive/publicar-noticias-04-10.yml.disabled`: conteúdo legado preservado.
  Tinha YAML inválido na linha 22 e gerava erro a cada commit. Foi arquivado fora
  da pasta de workflows, sem reativar a inserção de notícias antigas nem alterar
  `news.js`. Os demais workflows de publicação permanecem intactos.

```sh
python -m pip install -r scripts/ai_agents/requirements.txt
python -m unittest discover -s tests -p 'test_ai_agents_*.py' -v
python scripts/ai_agents/orchestrate.py --task-id auditoria-local
```

Fluxo: evidência estática → auditor → revisor → conclusão/relatório. Sem `--use-ai`,
as etapas registram que a análise IA não foi solicitada, sem consultar provedores.

## Ativação da IA

1. Criar uma chave na conta API OpenAI e adicionar **OPENAI_API_KEY** em GitHub →
   Settings → Secrets and variables → Actions → Repository secrets. Nunca enviar
   a chave por chat nem inseri-la no código.
2. Opcional: variável **OPENAI_AGENT_AUDIT_MODEL** com modelo acessível à conta
   API. Padrão preservado: `gpt-5.5`. Acesso real exige teste com a conta do usuário.
3. Após merge e testes, abrir Actions → `Giro Madeira - laboratorio de agentes
   (sem publicar)` → Run workflow na **main**, marcar `use_ai=true`.
4. Validar os dois pareceres no artefato `giro-ai-agent-readonly-report`.
5. Para IA diária, adicionar em Actions → Variables **GIRO_AGENT_AI_ENABLED=true**.
   Para parar só as chamadas pagas, remover a variável ou mudar para `false`.
   A auditoria offline continua. São até duas chamadas por run, sem retentativa
   automática, cada uma com até 1.800 tokens de saída. Isso não é um teto de gasto
   em reais: configurar limites de gasto na conta OpenAI. A API tem cobrança
   separada da assinatura ChatGPT.

O modo IA envia somente o checklist sobre arquivos públicos e o parecer anterior,
sem chaves, arquivos .env, notícias, imagens ou dados de usuários. Responses API
usa `store=false`; não são disponibilizadas ferramentas executáveis ao modelo.
Respostas incompletas/sem texto falham. Corpos HTTP e detalhes de exceção não são
persistidos. Falha da API preserva o relatório estático e etapas concluídas.

## Checkpoints e retomada

Retomada local: reutilizar o mesmo `--task-id` e `--checkpoint`, com o MESMO código,
modo IA e modelo. Falha do revisor preserva o auditor; tarefa concluída não chama
novamente a API. Alterar código/modo/modelo bloqueia retomada: usar novo task-id.
O estado contém apenas checklist público, assinatura dos arquivos, pareceres e
conclusão. Serialização restrita a tipos básicos, sem pickle nem módulos externos.

No Actions cada run novo inicia auditoria independente. O SQLite anexado **não é
restaurado automaticamente** em runs seguintes. Para retomar, baixar seu SQLite
e usar localmente o mesmo commit e task-id (`RUN_ID-ai`), com a chave apenas no
ambiente protegido. Exemplo, após baixar o arquivo do run:

```sh
python scripts/ai_agents/orchestrate.py --use-ai \
  --task-id RUN_ID-ai --checkpoint /caminho/checkpoint.sqlite \
  --report artifacts/ai-agent-report.md
```

## Limites operacionais

- Contrato: `AGENTS.md`, padrão `GIRO_EDITORIAL_FOTO_MANCHETE_RIO_V1`, Rio Madeira.
- Radares, filas, autorização, status e horários independentes de Shorts, TikTok,
  Feed, Stories e Reels. Compartilhar arte não compartilha estado de consumo.
- Não alterar `publication_enabled`, `integrity_hold`, aprovação ou agendamento.
- Arte aprovada não confirma publicação; é necessário ID válido do provedor.
- Agentes não acessam Supabase, tokens sociais, publicadores, banco, filas,
  comandos de shell, commits, PRs ou merge. Permissão Actions: `contents: read`.
- Tracing externo desativado; checkout sem credenciais persistentes.
- Diagnóstico estático não comprova publicação real, estado das filas, saúde do
  Supabase ou ausência de bloqueios das redes sociais.

Reversão: desativar `GIRO_AGENT_AI_ENABLED` interrompe IA; remover apenas o cron
interrompe agenda; reverter o commit remove esta integração. Não reativar o arquivo
legado de 04/10 sem revisão, pois ele insere notícias antigas e faz git push.
