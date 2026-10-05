# ai-mem

Memória persistente entre sessões para agentes de código. Um binário, sem daemon, sem LLM generativo, local por omissão.

## Regra inegociável

**Este projeto é escrito de raiz. Não é um fork do claude-mem.** Nunca copiar código, esquema, prompts, textos ou nomes do claude-mem, nem abrir o código-fonte dele para implementar funcionalidades. Ver `CLEAN-ROOM.md`.

## Onde está o quê

- Desenho e decisões: `docs/design/2026-10-05-ai-mem-design.md`
- Decisões medidas e desvios ao desenho: `docs/adr/` (ler o mais recente antes de mexer no esquema ou na recuperação)

## Comandos

- `bun run check` — typecheck, lint e testes
- `bun run build` — compila os cinco binários para `dist/`
- `bun run format` — formata e corrige lint
- `ai-mem install claude-code` importa as memórias do claude-mem e retira-o (com confirmação); `ai-mem import claude-mem` só importa. A base de dados do claude-mem é só lida, nunca alterada.

O `bun` usado pelos scripts é o fixado em `devDependencies`, não o global.

## Convenções

- TDD: o teste é escrito e visto a falhar antes do código.
- Os hooks nunca saem com código 2 (nos agentes, 2 bloqueia a ação). Falham em aberto: código 0 e stdout vazio.
- Nada de SDKs pesados no caminho dos hooks; usar `await import()` por comando.
- Juízos semânticos passam pela interface `Judge` (TypeSafe opt-in, heurísticas como recurso). Regras exatas e cálculos ficam em código.
- Imports com extensão `.ts` explícita.
