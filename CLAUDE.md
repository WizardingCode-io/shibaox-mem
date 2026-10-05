# shibaox-mem

Memória persistente entre sessões para agentes de código, da marca **shibaox** (WizardingCode). Um binário, sem daemon, sem LLM generativo, local por omissão.

Convenções da marca: produtos, plugins e skills chamam-se `shibaox-<coisa>`; variáveis `SHIBAOX_<COISA>_*`; dados em `~/.shibaox/<coisa>` (respeitar `SHIBAOX_HOME`). Ver `docs/adr/0004-marca-e-nome.md`.

Convenções da marca: produtos, plugins e skills chamam-se `shibaox-<coisa>`; variáveis `SHIBAOX_<COISA>_*`; dados em `~/.shibaox/<coisa>` (respeitar `SHIBAOX_HOME`).

## Regra inegociável

**Este projeto é escrito de raiz. Não é um fork do claude-mem.** Nunca copiar código, esquema, prompts, textos ou nomes do claude-mem, nem abrir o código-fonte dele para implementar funcionalidades. Ver `CLEAN-ROOM.md`.

## Onde está o quê

- Desenho e decisões: `docs/design/2026-10-05-shibaox-mem-design.md`
- Decisões medidas e desvios ao desenho: `docs/adr/` (ler o mais recente antes de mexer no esquema ou na recuperação)

## Comandos

- `bun run check` — typecheck, lint e testes
- `bun run build` — compila os cinco binários para `dist/`
- `bun run format` — formata e corrige lint
- `bun run plugins` — reescreve o que cada agente instala (manifestos, hooks, `shibaox-mem.sh`, pacote OpenCode) a partir de `scripts/plugins.ts`; correr depois de mudar a versão ou os eventos
- `shibaox-mem install [claude-code|codex|cursor|gemini|opencode]` instala para um agente; sem agente, para todos os que encontrar. No Claude Code importa as memórias do claude-mem e retira-o (com confirmação); `shibaox-mem import claude-mem` só importa. A base de dados do claude-mem é só lida, nunca alterada.
- Adaptadores em `src/adapters/<agente>/`; instaladores em `src/install/`. O desenho por agente e o que foi ou não confirmado em sessões reais está no ADR 0006.
- A instalação é nativa em cada agente (plugin, extensão, pacote npm): ADR 0009. Os ficheiros em `.claude-plugin/`, `hooks/`, `plugin/` e `plugins/` são gerados; não editar à mão.
- `shibaox-mem rejudge [--limit n] [--concurrency n]` pede ao TypeSafe tipo e importância das memórias importadas; o que não vale guardar fica `archived` (nunca apagado). Retomável; precisa de chave.
- `shibaox-mem ui [--port n] [--no-open]` abre o viewer (loopback, token na URL, desliga-se inativo). `shibaox-mem compact [--dry-run]` poda registos antigos; nunca apaga memórias.

O `bun` usado pelos scripts é o fixado em `devDependencies`, não o global.

## Convenções

- TDD: o teste é escrito e visto a falhar antes do código.
- Os hooks nunca saem com código 2 (nos agentes, 2 bloqueia a ação). Falham em aberto: código 0 e stdout vazio.
- Nada de SDKs pesados no caminho dos hooks; usar `await import()` por comando.
- Juízos semânticos passam pela interface `Judge` (TypeSafe opt-in, heurísticas como recurso). Regras exatas e cálculos ficam em código.
- Imports com extensão `.ts` explícita.
- Assets do viewer em `src/ui/assets/` viajam no binário (`with { type: "file" | "text" }`); nada sai para a rede a partir do viewer.
