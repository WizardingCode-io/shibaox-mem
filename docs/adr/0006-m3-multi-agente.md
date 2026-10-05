# ADR 0006 — M3: um binário, cinco agentes

Data: 2026-10-05 · Estado: aceite.

## O que existe

O mesmo binário e a mesma base de dados servem Claude Code, Codex CLI, Cursor, Gemini CLI e OpenCode. Cada agente tem um adaptador (`src/adapters/<agente>/`) que traduz o payload do hospedeiro para o `HookInput` do núcleo e o contexto do núcleo para a saída que o hospedeiro lê; o núcleo não sabe qual é o agente. `shibaox-mem install <agente>` escreve o que cada hospedeiro precisa; `shibaox-mem install` sem agente instala para todos os que encontrar (comando no PATH ou pasta de configuração); `doctor` verifica os cinco, saltando os que não estão na máquina.

| Agente | Como captamos o turno | Injeção | Instalação | Confirmado |
|---|---|---|---|---|
| Claude Code | `UserPromptSubmit.prompt` + `Stop.last_assistant_message`; transcript JSONL | arranque e por prompt (`hookSpecificOutput.additionalContext`) | `~/.claude/settings.json`, hooks em forma exec | M1, em uso real |
| Codex CLI 0.153 | igual ao Claude Code, turno em `turn_id`; rollout JSONL (`item_completed`: `CommandExecution`, `FileChange`, `McpToolCall`) | igual ao Claude Code; teto 8 000 caracteres (spill a ~2 500 tokens) | `$CODEX_HOME/hooks.json`, `command` como string shell com o binário entre plicas; `codex mcp add`; o utilizador aprova em `/hooks` | `SessionStart`, `UserPromptSubmit`, `SessionEnd` capturados; `Stop` pela doc (login expirado) |
| Cursor | `beforeSubmitPrompt.prompt` + `afterAgentResponse.text`; sessão = `conversation_id`, cwd = `workspace_roots[0]` | só no arranque (`additional_context`); o hook de prompt responde `{"continue": true}` | `~/.cursor/hooks.json` (layout plano, `version: 1`) + `~/.cursor/mcp.json` | nada capturado: não há Cursor nesta máquina |
| Gemini CLI 0.26 | `BeforeAgent.prompt` + `AfterAgent.prompt_response`; sem id de turno | arranque e por prompt (`hookSpecificOutput`, `hookEventName: BeforeAgent`) | `~/.gemini/settings.json`, hooks com `name` (lista de confiança) e timeout em ms; `gemini mcp add -s user` | `SessionStart`, `SessionEnd` capturados; `BeforeAgent`/`AfterAgent` pela doc (sem login) |
| OpenCode 1.18 | plugin TS nosso: `chat.message` → prompt, `session.idle` + `client.session.messages` → fim de turno, `session.created` → arranque | `experimental.chat.system.transform` (brief + notas do turno, em cada pedido) | um ficheiro em `~/.config/opencode/plugins/`; ferramentas nativas que correm `shibaox-mem tool` — nada no `opencode.json` do utilizador | plugin carrega e `session-start`/`prompt` correram no OpenCode real; `turn-end` por confirmar (o fornecedor configurado estava sem saldo) |
| Antigravity | — | — | só MCP, por configuração do utilizador | — |

## Decisões

- **Payload do Claude Code como forma comum.** Codex fala-o nativamente; o plugin do OpenCode produz-o. Um parser (`adapters/common/hook-json.ts`) serve os três; Gemini e Cursor têm os seus.
- **Instalador genérico por especificação** (`install/hooks-file.ts`, `HostSpec`): eventos, forma da entrada, reconhecimento do que é nosso, registo MCP por comando ou por ficheiro, layout agrupado ou plano. Recibos, backups e restauro byte a byte são os mesmos para todos.
- **Nada do utilizador é editado no OpenCode.** O `opencode.json(c)` admite comentários e é dele; escrevemos só o nosso ficheiro de plugin, reconhecido por uma marca. As ferramentas são nativas do plugin e chamam `shibaox-mem tool <nome> --project <dir>`, que partilha código e esquemas com o servidor MCP.
- **Sem transcript onde não o vimos.** Gemini (ficheiro de chat), Cursor e OpenCode declaram `transcript: false`; o núcleo degrada (sem ficheiros lidos/alterados, sem comandos). O Codex lê o rollout em melhor esforço, como o Claude Code.
- **Veredictos só do hospedeiro, nunca inventados.** Quando um hospedeiro não dá id de turno (Gemini, Cursor), o turno é o aberto da sessão; o Cursor pode ter `generation_id` estável, mas sem captura não se confia nele.
- **Hooks de projeto não se usam.** Codex e Gemini pedem confiança por hook; a Gemini adiciona hooks de projeto à sua lista de confiança em modo não interativo com um aviso. Instalamos sempre ao nível do utilizador.

## Por fazer

- Capturar `Stop` do Codex, `BeforeAgent`/`AfterAgent` do Gemini e qualquer payload do Cursor em sessões reais; corrigir os fixtures se diferirem.
- Confirmar `session.idle` → `turn-end` no OpenCode com um fornecedor a funcionar; depois, passar no payload os ficheiros e comandos do turno (o plugin tem as mensagens), para que a recuperação e a obsolescência funcionem como no Claude Code.
- Ler o ficheiro de chat do Gemini quando houver um exemplar.
- O `system.transform` do OpenCode também recebe o pedido de geração de título; as notas vão lá sem necessidade (~2 000 tokens por turno).
