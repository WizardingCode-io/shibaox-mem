# ADR 0004 — Marca e nome: shibaox-mem

Data: 2026-10-05 · Estado: aceite.

## Contexto

Decisão estratégica da WizardingCode: em vez de mais uma aplicação com agentes, construir **para todos os agentes** (Claude Code, Codex, Cursor, Gemini CLI, OpenCode…): plugins, skills e workflows, com autoridade e monetização por serviços associados. Esses produtos vivem na organização GitHub `WizardingCode-io` sob a marca **shibaox**, cujo brand book e design system já existem. O "agentic OS" com o mesmo nome (`WizardingCode-io/shibaox`, npm `shibaox`) vai ser descontinuado e apagado.

Este produto chamou-se **ai-mem** durante M0 e M1, como nome provisório. Nada foi publicado e ninguém tinha dados em `~/.ai-mem`, por isso a mudança foi mecânica.

## Decisões

| Tema | Decisão |
|---|---|
| Nome | `shibaox-mem`: binário, servidor MCP, pacote npm, repositório `WizardingCode-io/shibaox-mem` |
| Dados | `~/.shibaox/mem` — a pasta da marca, respeitando `SHIBAOX_HOME`; `SHIBAOX_MEM_DATA_DIR` move só este produto |
| Variáveis | `SHIBAOX_MEM_*` |
| Ficheiros | `shibaox-mem.db`, `logs/shibaox-mem.log`, binários `shibaox-mem-<os>-<arch>` |
| Invólucro das notas | `<shibaox-mem-notes>` |
| Ferramentas MCP | `memory_search`, `memory_get`, `memory_save` — o nome do servidor já é a marca (`mcp__shibaox-mem__memory_save`) |
| Licença e titular | Apache-2.0, open-core; NOTICE em nome da WizardingCode |

## Convenção para os próximos produtos da marca

- Nome: `shibaox-<coisa>` (produto, plugin, skill, pacote).
- Variáveis de ambiente: `SHIBAOX_<COISA>_*`.
- Dados: `~/.shibaox/<coisa>`, nunca dentro da pasta de um plugin de um agente (é apagada na desinstalação).
- Distribuição: marketplace da marca `WizardingCode-io/shibaox-plugins` para o Claude Code; npm e instaladores próprios para os binários.
- Núcleo aberto, serviços pagos à volta.
