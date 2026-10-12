# Laboratório de agentes externos — Giro Madeira

## Escopo e status (12/10/2026)

**Implementado nesta proposta:** um laboratório somente leitura com verificações locais e
dois papéis de IA (auditor e revisor), acionados manualmente no GitHub Actions. O relatório
é anexado como artefato. O fluxo de pull request executa apenas verificações offline,
sem necessidade de segredos.

**Não implementado:** instalação ou execução de Ruflo, OpenHands, LangGraph ou n8n;
nenhum desses serviços fica magicamente conectado à conversa do ChatGPT. São candidatos
a uma etapa separada, após avaliação de licenças, custos, segurança e compatibilidade.

## Objetivo

Usar GitHub como fonte do código e contratos, ChatGPT como interface de orientação e
agentes executados em infraestrutura própria/CI para testes e auditoria. Não substituir
os mecanismos de publicação já existentes no Supabase e nas filas por um orquestrador
externo sem validação.

### Peças avaliadas e papéis potenciais

| Projeto | Código oficial | Papel possível | Condição para adotar |
|---|---|---|---|
| Ruflo | https://github.com/ruvnet/ruflo | Coordenação de agentes via CLI/MCP | Testar localmente em sandbox isolado, sem tokens de produção |
| OpenHands SDK | https://github.com/OpenHands/software-agent-sdk | Agentes de programação e testes | Ambiente efêmero + PR com revisão |
| LangGraph | https://github.com/langchain-ai/langgraph | Checkpoint/retomada de tarefas | Estado separado por plataforma, nenhuma duplicação de publicação |
| n8n | https://github.com/n8n-io/n8n | Orquestração de gatilhos externos | Restrição de acesso, credenciais seguras e regras anti-duplicação |

Preferir poucos componentes com responsabilidades claras a instalar quatro plataformas
sobrepostas. A integração com ferramentas MCP depende do **cliente que executa** o servidor;
ter o código desses projetos no GitHub não adiciona automaticamente ferramentas a este chat.

## Laboratório entregue

Arquivos:
- `scripts/ai_agents/audit.py`: verifica documentação, contratos e sintaxe sem executar
  publicadores; pode solicitar duas análises por IA exclusivamente para o relatório.
- `tests/test_ai_agents_audit.py`: testes offline, sem dependências externas.
- `.github/workflows/ai-agent-audit.yml`: PR = teste offline; botão manual = teste e
  auditoria, com opção explícita de IA.

### Rodar sem API nem custo de tokens

```sh
python -m unittest discover -s tests -p 'test_ai_agents_*.py' -v
python scripts/ai_agents/audit.py --report artifacts/ai-agent-report.md
```

### Rodar agentes de IA

1. Adicionar **OPENAI_API_KEY** em GitHub → Settings → Secrets and variables →
   Actions → Repository secrets. Nunca colocar uma chave no código.
2. Opcional: configurar a variável `OPENAI_AGENT_AUDIT_MODEL` para um modelo
   disponível na sua conta API (padrão do script: `gpt-5.5`).
3. Somente depois de revisar o PR e aprovar o merge para `main`, abra a aba
   Actions, escolha `Giro Madeira - laboratorio de agentes (sem publicar)`,
   execute `Run workflow` e marque `use_ai=true`. O GitHub disponibiliza
   `workflow_dispatch` após o workflow existir na branch padrão.
4. Abrir o artefato `giro-ai-agent-readonly-report`; dois papéis produzem um parecer
   e plano. A API pode gerar cobrança **separada da assinatura ChatGPT**.

O modo IA envia à API somente o resumo de checagens produzido sobre arquivos públicos
do repositório. Não envia chaves, arquivos .env, notícias, imagens nem dados de usuários.

## Guardrails obrigatórios

- Contrato principal: `AGENTS.md`; identidade:
  `GIRO_EDITORIAL_FOTO_MANCHETE_RIO_V1` e Rio Madeira sempre presente.
- Radar, fila, status, autorização e agendamento independentes para `shorts`,
  `tiktok`, `feed`, `stories` e `reels`.
- Arte aprovada não equivale a publicação; confirmação exige ID válido do provedor.
- Não mudar `publication_enabled`, `integrity_hold` ou agendamentos sem validação
  por canal. Nunca liberar Instagram/Meta a partir de uma aprovação do TikTok.
- Nenhum agente deste laboratório pode acessar tokens, publicar, alterar banco,
  dar merge, reiniciar filas nem criar commits. Somente leitura e relatório.
- Diagnóstico estático **não prova** publicação real, saúde do Supabase ou ausência
  de bloqueio das redes sociais.

## Próximas integrações condicionadas

1. **OpenHands:** rodar em workspace descartável, abrir PRs propostos, executar
   testes e exigir revisão antes de qualquer merge.
2. **LangGraph:** experimentar checkpoints somente sobre tarefas de auditoria.
   Não mover estado do radar nem reiniciar etapas de publicação ao falhar.
3. **Ruflo:** testar CLI/MCP em ambiente isolado, após inventário e avaliação das
   permissões e dependências. NÃO usar instaladores remotos direto em produção.
4. **n8n:** considerar apenas como ponte de notificações/observabilidade, não como
   segundo publicador concorrente do Supabase.

Critério de aceite: relatórios consistentes, testes passando, nenhum segredo exposto,
nenhuma alteração em `main` sem revisão e nenhum envio social durante o experimento.
