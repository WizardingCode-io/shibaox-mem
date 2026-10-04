# ADR 0001 — Resultados dos spikes de plataforma (M0)

Data: 2026-10-05 · Estado: aceite para macOS arm64; **pendente de CI** nas outras quatro plataformas.

## Contexto

O desenho assenta em cinco apostas de plataforma: um binário compilado com Bun arranca depressa o suficiente para correr em cada prompt; o FTS5 existe em todos os alvos; vários processos curtos podem escrever no mesmo ficheiro SQLite; um processo filho destacado sobrevive ao hook; e o SDK oficial de MCP funciona dentro do binário. Este ADR regista o que foi medido.

Todas as medições abaixo foram feitas com o **binário compilado** (`dist/ai-mem-darwin-arm64`, Bun 1.4.2, macOS 26 arm64) através de `ai-mem __spike all`.

## Resultados

| Spike | Critério | Resultado (darwin-arm64) |
|---|---|---|
| 0.2 Tamanho dos binários | < 120 MB | 62,6 MB (darwin-arm64), 69,3 (darwin-x64), 80,8 (linux-x64), 80,7 (linux-arm64), 85,3 (windows-x64) |
| 0.4 FTS5 | `remove_diacritics 2`, triggers, `bm25()`, `snippet()` | Passa. SQLite 3.51.0 (o do sistema) |
| 0.5 Arranque, 50 execuções | p95 ≤ 60 ms | `noop` p50 6,1 / p95 8,8 ms; abrir a BD p50 8,1 / p95 10,3 ms; primeira execução 6,3 ms |
| 0.6 WAL, 8 escritores × 200 transações + 2 leitores | Zero `SQLITE_BUSY`, integridade ok | 1 600 linhas, 0 erros, `integrity_check` ok, p99 por transação 5–9 ms |
| 0.7 Processo destacado | O filho escreve o marcador depois de o pai sair | Passa; o pai sai em ~8 ms |
| 0.8 MCP no binário | `initialize`, `tools/list`, `tools/call` por stdio | Passa; o servidor termina sozinho quando o stdin fecha |
| Isolamento de `.env` | O binário não carrega o `.env` da pasta de trabalho | Passa. Contraprova: um binário compilado **sem** as flags carrega-o |
| 0.9 Latência TypeSafe a frio | Medir | **Não executado**: sem `TYPESAFE_API_KEY` no ambiente |

## Decisões

1. **Bun 1.4.2 fixado como `devDependency`.** Os scripts usam o `bun` de `node_modules/.bin`; o Bun global do utilizador não é tocado. `.bun-version` dá a mesma versão ao CI e um teste garante que as duas coincidem.
2. **`--bytecode` ligado.** Baixa o arranque de p95 7,9 ms para 5,9 ms (`noop`) por +1,5 MB.
3. **Alvos x64 de Linux e Windows usam o runtime `-baseline`.** O runtime por omissão exige AVX2 e termina com "Illegal instruction" em CPUs antigos e algumas máquinas virtuais.
4. **Sem `--windows-hide-console`.** Tornaria o `.exe` uma aplicação gráfica, incapaz de escrever numa consola interativa.
5. **SDK de MCP: `@modelcontextprotocol/server` 2.x** (linha estável, só depende de `zod` e do núcleo). Carregado por `import()` apenas no comando `mcp`. O plano B de JSON-RPC manual não é necessário.
6. **`distill` é lançado como processo destacado** (`detached`, três stdio ignorados, `unref`). Em macOS funciona; o sistema continua a não depender disso, porque a fila é drenada por qualquer invocação posterior.
7. **Códigos de saída:** erros de uso saem com 64. Nunca 2, que nos agentes bloqueia a ação.

## Contrato real dos hooks do Claude Code 2.1.289

Capturado com um hook de registo (`ai-mem __spike log-payload`) em sessões `claude -p`. Fixtures sanitizadas em `tests/fixtures/claude-code/`.

| Evento | Campos observados |
|---|---|
| `SessionStart` | `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `source` (`startup` ou `resume`) |
| `UserPromptSubmit` | os anteriores + `prompt_id`, `permission_mode`, `prompt` |
| `Stop` | + `prompt_id`, `permission_mode`, `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons` |
| `SessionEnd` | + `prompt_id`, `reason` |

Consequências para o desenho:

- **A chave de um turno é (`session_id`, `prompt_id`).** O `prompt_id` é novo em cada prompt e é o mesmo no `UserPromptSubmit`, no `Stop` e nas linhas `user` do transcript.
- **Num turno interrompido (SIGINT) o `Stop` não dispara; o `SessionEnd` dispara.** Confirma a decisão de abrir o turno no prompt. O `SessionEnd` tem de fechar os turnos ainda abertos como interrompidos, não pode ser só gatilho de drenagem.
- **Retomar uma sessão mantém o `session_id`** e envia `SessionStart` com `source: "resume"`.
- **A forma exec dos hooks funciona** (`command` + `args`, sem shell). É a que o instalador vai escrever, com caminho absoluto.
- **Divergências face à leitura da documentação:** `Stop` não traz `tool_use_count`; `SessionStart` não traz `model`. Os ficheiros tocados vêm só do transcript.
- **Transcript:** as linhas `user` com o prompt têm `promptId` e `message.content` em texto; as chamadas de ferramentas são blocos `tool_use` (`name`, `input`) em linhas `assistant`; os resultados vêm em linhas `user` com `toolUseResult` (`filePath`, `type`, …). O formato é interno: lê-se com tolerância e só no `distill`.

## Por fazer

- **Correr o CI** (`.github/workflows/ci.yml`) para repetir todos os spikes em darwin-x64, linux-x64, linux-arm64 e windows-x64. Precisa de um repositório remoto. Os critérios de Windows (arranque p95 ≤ 150 ms, processo destacado dentro de um hook real) continuam por medir.
- **Spike 0.9** com uma chave TypeSafe. Até lá, o reranking remoto por prompt fica desligado por omissão.
