# Plano: shibaox-mem — memória persistente para agentes de código

> `shibaox-mem` é um nome provisório (o do diretório). Mudar de nome antes do lançamento é barato.

## Contexto

O claude-mem (v13.x, Apache-2.0) mantém o núcleo local gratuito, mas montou um funil para o "CMEM Pro" ($30/mês após trial): banner em cada sessão, botão no viewer, Pro pré-selecionado e login obrigatório no instalador interativo, telemetria PostHog ligada por omissão. O Pro vende a solução de um problema criado pelo próprio desenho: um LLM "observer" resume cada tool call **dentro da subscrição do utilizador**.

Medições feitas nesta máquina durante a análise:

| Dor | Evidência |
|---|---|
| Gasta o plano | ~47 700 chamadas ao modelo em 30 dias (~139 por sessão), ≈19% das chamadas e ≈29% do output do próprio utilizador; 77,8% das gravações não produziram nenhuma observação |
| Pesado e instável | Node + Bun + uv/Python + tree-sitter; 15 processos vivos (~2,4 GB RAM); ~9,2 GB em disco; ~130 mil linhas de ERROR; 95% das sessões marcadas `failed`; ~67 issues de processos órfãos |
| Memória pouco útil | Injeta as 50 observações mais recentes por ordem cronológica; pesquisa sem fusão nem reranking; corte rígido aos 90 dias; sem deduplicação semântica, obsolescência ou branch; contador de relevância nunca usado |
| Upsell e privacidade | Promoções injetadas no contexto da sessão; telemetria opt-out; sem remoção automática de segredos |

**Objetivo:** um concorrente direto, open-core, claramente melhor nestas quatro dores. Posicionamento: *memória que não gasta o teu plano, sem processos em background, sem publicidade e sem dados a sair da máquina.*

## Regra de implementação limpa (inegociável)

**O shibaox-mem é escrito de raiz. Não é um fork.** O claude-mem serve apenas de referência de funcionalidades e de catálogo de erros a evitar.

- Proibido copiar código, esquema de base de dados, prompts, textos ou nomes do claude-mem.
- Esquema, taxonomia de memórias, formato de injeção e nomes de ferramentas são nossos.
- Não há código existente a reutilizar: o diretório do projeto está vazio e o código do claude-mem está fora de limites.
- Única interação com artefactos do claude-mem: o importador (M4) lê, só em leitura, a base de dados **do próprio utilizador** para migrar as suas memórias. É interoperabilidade de dados, não reutilização de código.
- A regra fica escrita em `CLEAN-ROOM.md` no repositório e é verificada em revisão de código.

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Origem do código | De raiz, sem fork |
| Modelo de negócio | Open-core: núcleo local gratuito e aberto (Apache-2.0 por omissão — confirmar antes do primeiro commit); tier pago posterior (juízos geridos sem chave, sync entre máquinas, memória de equipa) |
| Stack | TypeScript, binário único via `bun build --compile`, SQLite com `bun:sqlite` |
| Motor de memória | Extrativo, **sem LLM generativo**; juízos semânticos via TypeSafe |
| Fallback do TypeSafe | Obrigatório: sem chave, com erro ou com atraso, o sistema usa regras heurísticas locais e nunca bloqueia o agente |
| Privacidade | Local por omissão; TypeSafe é opt-in (`TYPESAFE_API_KEY`); sem telemetria; sem texto promocional |
| Agentes com suporte completo na v1 | Claude Code, Codex CLI, Cursor, Gemini CLI, OpenCode |
| Ecossistema Google | Gemini CLI completo; Antigravity CLI só por MCP na v1 |

## Arquitetura

Um binário, vários comandos, **nenhum processo residente**:

| Comando | Vida do processo | Função |
|---|---|---|
| `shibaox-mem hook <agente> <evento>` | Milissegundos | Normaliza o payload do agente, grava, devolve contexto a injetar |
| `shibaox-mem distill` | Curto, destacado | Drena a fila de turnos e transforma-os em memórias |
| `shibaox-mem mcp` | Enquanto o agente o mantiver | Servidor MCP stdio: `memory_search`, `memory_get`, `memory_save` |
| `shibaox-mem install` / `uninstall` | Pontual | Regista e remove hooks e MCP em cada agente, com recibo e backup |
| `shibaox-mem doctor` / `status` | Pontual | Diagnóstico, últimas falhas, latência dos hooks, custo real dos juízos |
| `shibaox-mem search` / `forget` / `export` | Pontual | Gestão manual das memórias |
| `shibaox-mem ui` (M4) | Sob pedido, desliga-se quando inativo | Viewer local |
| `shibaox-mem import claude-mem` (M4) | Pontual | Migra as memórias existentes do utilizador |

### Fluxo por turno

1. **Início de sessão** → injeta um resumo curto: "onde ficámos" + memórias duráveis de topo (~1 200 tokens, abaixo do teto do agente). Não reinjeta em `resume`.
2. **Submissão de prompt** → abre um turno em estado `open` com o texto do prompt; fecha turnos `open` órfãos da mesma sessão como interrompidos; devolve no máximo 5 memórias relevantes, só acima de um limiar por evidência. Orçamento de tempo rígido; em caso de dúvida ou falha, não injeta nada.
3. **Fim de turno** → fecha o turno como `pending` com a mensagem final do assistente (vem no payload do hook) e lança `distill` destacado. **Não há hook por tool call.**
4. **Fim de sessão** → serve só de gatilho de drenagem.

Abrir o turno no prompt, e não no fim, é o que impede a perda dos turnos interrompidos ou com erro de API — precisamente aqueles em que o utilizador corrige o agente.

### Fila durável

- A tabela `turns` é a fila: `open → pending → processing → done | skipped | failed`. Nada vive só em memória.
- Um único processo drena de cada vez (lease global numa linha de `meta`); cada turno é reclamado com `lease_until` e `attempts` (máximo 3).
- A inserção das memórias e a mudança de estado acontecem na mesma transação; `UNIQUE(source_turn_id, source_ordinal)` torna a repetição idempotente.
- O sistema não depende do processo destacado sobreviver: qualquer invocação posterior drena o que estiver pendente.
- O transcript do agente é lido só no `distill`, nunca no hook, e apenas para ficheiros, comandos e erros. Um turno sem esses detalhes continua válido.

### Destilação extrativa ("selecionar em vez de gerar")

O código segmenta em frases candidatas **o prompt do utilizador e a mensagem final do assistente** (as correções e preferências mais duráveis estão no prompt). O corpo de cada memória junta as frases selecionadas a um cabeçalho determinístico (ficheiros, branch, excerto do prompt), para que nenhuma frase fique sem referente.

| Juízo | Primitiva TypeSafe | Fallback heurístico (regras PT e EN) |
|---|---|---|
| Vale a pena guardar? | Noul | Houve edições, padrão erro→correção, marcadores de correção no prompt, pistas de decisão |
| Tipo (decisão, correção, armadilha, convenção, alteração, descoberta, nenhum) | Choice | Cascata de regras |
| Importância | Score de 5 níveis | Pontuação por regras |
| Que frases são factos duráveis e compreensíveis sozinhas? | Noul por frase | Frase declarativa com identificador, caminho ou número, sem ofertas nem futuro |
| Que frase serve de título? | Choice entre candidatas | Frase durável mais pontuada com ≤ 120 caracteres |
| Duplicada / relacionada / substitui? | Score + Noul de contradição, por vizinho BM25 | Semelhança de tokens + ficheiros em comum; na dúvida, inserir |

- Os juízos de destilação vão num único pedido por turno; a consolidação num pedido por memória nova.
- A consolidação nunca gera texto: as saídas são `inserir`, `duplicado` (reforça a evidência) ou `substituir` (a antiga fica `superseded`, com ligação).
- `memory_save` via MCP é a via de alta qualidade: o próprio agente escreve a memória quando o utilizador pede, sem chamada extra a modelos.
- Regras exatas, limiares, cálculos e pesquisas ficam em código. Os limiares calibram-se no conjunto dourado.

### Juízes e fallback

- Interface única `Judge` com `HeuristicJudge` (omissão e recurso) e `TypeSafeJudge` (opt-in), compostos por `withFallback`.
- Chamada HTTP direta ao endpoint documentado, em vez do SDK, para ter prazo total rígido e um único ponto de remoção de segredos.
- Destilação e consolidação: 3 s por tentativa, 2 repetições só em 429/529/rede, prazo total 8 s.
- Disjuntor **persistido em `meta`** (os processos vivem milissegundos): 3 falhas seguidas abrem-no; 401 abre-o até a chave mudar.
- Cada memória regista que juiz a produziu, para poder ser reavaliada mais tarde.
- **Reranking remoto por prompt fica desligado por omissão**, mesmo com chave: um processo frio paga DNS e TLS em cada chamada. O spike 0.9 mede e decide.
- O TypeSafe tem o inglês como língua principal; a avaliação inclui obrigatoriamente turnos em português.

### Recuperação

- **Consulta:** termos salientes do prompt (identificadores, caminhos, palavras raras) em OR com pesos por coluna — nunca o prompt cru nem frase exata. Uma coluna `terms` expande camelCase, snake_case e segmentos de caminho no momento da escrita.
- **Canais fundidos por RRF:** BM25, sobreposição com os ficheiros tocados na sessão, branch e recência (decaimento sem corte rígido), importância, uso anterior.
- **Limiar por evidência:** pelo menos dois termos raros distintos ou um identificador exato.
- **Sem repetição:** deduplicação por (sessão, época de contexto); a época avança em `compact` e `clear`.
- **Obsolescência:** âncoras de caminho, commit e branch. "Ficheiro desapareceu" é sinal forte; "ficheiro mudou" é penalização fraca. Valida-se no `distill`; o hook só lê a flag.
- **Sem vetores na v1:** elimina Chroma, Python e ONNX. A métrica recall@5 no conjunto dourado decide se voltam mais tarde.

### Privacidade e segurança

- Tipo `Redacted` como único texto aceite pelo armazenamento e pelo cliente de rede; remoção de segredos por regras, mais blocos `<private>`.
- Binário compilado sem carregamento automático de `.env` nem `bunfig.toml`: um hook corre na pasta do projeto do utilizador e não pode absorver os segredos dele.
- Memórias injetadas como notas datadas com proveniência, não como instruções, e com âmbito estrito por projeto — defesa contra injeção de prompt persistente.
- Sem telemetria; métricas de latência só locais (`hook_runs`). Sem texto promocional.
- `uninstall` remove exatamente o que o recibo de instalação lista; nada se reativa sozinho.
- Ficheiros de dados com permissões 0600/0700; logs sem payloads.

### Identidade de projeto

Chave canónica: remoto `origin` normalizado e sem credenciais; senão o git common dir (partilhado entre worktrees); senão o caminho real. Tabela de aliases para o projeto manter identidade se ganhar remoto ou mudar de pasta. O hook lê `.git/HEAD` e `.git/config` como ficheiros, sem lançar `git`.

## Suporte por agente

Resultado da leitura da documentação atual. **Cada adaptador começa por um hook de registo que grava o payload real**, porque a leitura foi feita através de resumos automáticos e os nomes exatos dos campos têm de ser confirmados.

| Agente | Captura do turno | Injeção no arranque | Injeção por prompt | Instalação |
|---|---|---|---|---|
| Claude Code | `UserPromptSubmit.prompt` + `Stop.last_assistant_message` | Sim (teto 10 000 caracteres) | Sim | M1: `~/.claude/settings.json` com caminho absoluto; M5: plugin de marketplace |
| Codex CLI | `UserPromptSubmit.prompt` + `Stop.last_assistant_message` | Sim (~2 500 tokens) | Sim | Plugin ou `~/.codex/hooks.json`; o utilizador tem de aprovar os hooks em `/hooks` |
| Cursor | `beforeSubmitPrompt.prompt` + `afterAgentResponse.text` | Sim | **Não suportado pelo Cursor** — fica por MCP | `~/.cursor/hooks.json` + `mcp.json` |
| Gemini CLI | `AfterAgent` (prompt + resposta) | Sim | Sim (`BeforeAgent`) | Extensão |
| OpenCode v1 | `chat.message` + `session.idle` → API de mensagens | Sim | A confirmar no spike | Shim TS em `plugins/`, com ferramentas nativas |
| Antigravity CLI | — | — | — | Só MCP |

- O adaptador declara uma matriz de capacidades; o núcleo degrada em vez de simular (no Cursor: resumo de sessão + MCP).
- O OpenCode v2 tem uma API de plugins incompatível; ganha shim próprio quando estabilizar.
- Os transcripts do Codex e do Cursor são declarados instáveis ou desativáveis: usam-se só por melhor esforço.

## Marcos

| Marco | Entrega | Critério de saída |
|---|---|---|
| **M0 — Fundações** | Repositório, licença, `CLEAN-ROOM.md`, CI que compila os cinco binários, spikes de plataforma | Riscos de plataforma medidos e registados num ADR |
| **M1 — Núcleo + Claude Code (modo local)** | Armazenamento, remoção de segredos, adaptador Claude Code, juiz heurístico, destilação, recuperação, injeção, MCP, `install`, `doctor`/`status` | Uso diário real no Claude Code, sem chave nenhuma |
| **M2 — Juízos TypeSafe + fallback** | `TypeSafeJudge`, disjuntor, consolidação por juízo, conjunto dourado alargado | Precisão e recall medidos, heurístico vs. TypeSafe, em PT e EN |
| **M3 — Multi-agente** | Adaptadores Codex CLI, Cursor, Gemini CLI, OpenCode; `install` com deteção automática | Memória captada num agente aparece nos outros |
| **M4 — Viewer, importador, manutenção** | `ui`, `import claude-mem`, retenção, compactação | Migração a partir de uma instalação real do claude-mem |
| **M5 — Lançamento** | Documentação, instaladores (script, npm, Homebrew), plugin de marketplace, página de comparação com números medidos | Instalação limpa em macOS, Linux e Windows |

Cada marco tem o seu ciclo próprio de especificação → plano → implementação. **Este plano detalha M0 e M1**; a aprovação cobre apenas esses dois.

## M0 — Fundações

Objetivo: eliminar os riscos de plataforma antes de escrever código de produto. Os spikes são comandos ocultos (`shibaox-mem __spike …`) que correm a partir do binário compilado.

| # | Passo | Critério de saída |
|---|---|---|
| 0.1 | `git init`; TypeScript estrito, Biome, `bun test`, versão do Bun fixada, licença, `CLEAN-ROOM.md`, documento de desenho em `docs/`, `main.ts` com `--version` | Typecheck, lint e teste de fumo passam |
| 0.2 | `scripts/build.ts`: cinco alvos (darwin arm64/x64, linux x64/arm64, windows x64), minificado, sem carregamento automático de `.env`/`bunfig` (confirmar os nomes das flags na documentação do Bun) | Cinco artefactos; tamanho reportado e abaixo de 120 MB |
| 0.3 | CI: cross-compilação; binários darwin assinados num runner macOS; matriz nativa que executa cada binário | Os cinco respondem a `--version` no runner nativo |
| 0.4 | Spike FTS5: tabela com `remove_diacritics 2`, triggers, `bm25()`, `snippet()` | Passa nos cinco alvos |
| 0.5 | Spike de arranque: 50 execuções de `noop` e `open-db`, p50/p95 | p95 morno ≤ 60 ms em macOS/Linux e ≤ 150 ms em Windows; senão, plano de contingência |
| 0.6 | Spike WAL: 8 processos com 200 transações `IMMEDIATE` cada, mais leitores | Zero `SQLITE_BUSY`; `integrity_check` ok |
| 0.7 | Spike de processo destacado: o pai sai, o filho escreve um marcador 2 s depois | Marcador presente nos três sistemas operativos |
| 0.8 | Spike MCP: servidor stdio com o SDK oficial dentro do binário compilado | `initialize`, `tools/list`, `tools/call` funcionam; plano B é JSON-RPC manual |
| 0.9 | Spike TypeSafe: processo frio, 3 perguntas, latência com TLS (só com chave) | Número registado; decide o reranking por prompt |
| 0.10 | Hook de registo no Claude Code: grava os payloads reais dos quatro eventos, incluindo um turno interrompido | Fixtures sanitizadas em `tests/fixtures/claude-code/` |
| 0.11 | ADR com os números e as decisões | Escrito e revisto |

## M1 — Núcleo e Claude Code em modo heurístico

Cada passo é feito em TDD: o teste da coluna da direita é escrito primeiro.

| # | Passo | Teste |
|---|---|---|
| 1.1 | `core/redact` | Corpus de 40+ segredos e 30 negativos; `redact` é idempotente |
| 1.2 | `store/db` e migração 0001 | BD nova fica na versão 1; 4 processos a migrar em simultâneo; recusa de versão mais recente; permissões 0600 |
| 1.3 | `core/git` e `core/project` | Dois worktrees dão o mesmo projeto; credenciais do remoto removidas; alias novo ligado |
| 1.4 | `adapters/claude-code/payloads` | Fixtures dos 4 eventos; remover campos ao acaso nunca lança |
| 1.5 | `adapters/claude-code/transcript` (cauda por offset) | Última linha truncada, tipos desconhecidos, ficheiro ausente dá detalhe vazio |
| 1.6 | `hook prompt` — captura | Dois prompts sem fim de turno: o primeiro fica `pending` e `interrupted` |
| 1.7 | `hook turn-end` | Turno fechado como `pending`; `distill` lançado com stdio ignorado; exit 0, stdout vazio; subagentes ignorados |
| 1.8 | `distill/segment` | Blocos de código removidos, listas, abreviaturas PT/EN, URLs, teto de candidatos |
| 1.9 | `judge/heuristic` | Tabela por regra; precisão do filtro no conjunto dourado inicial |
| 1.10 | `distill/queue` e `pipeline` | Crash depois da inserção não duplica; lease expirado é retomado; dois drenadores processam cada turno uma vez; turno venenoso fica `failed` após 3 tentativas |
| 1.11 | `distill/consolidate` | Duplicado reforça evidência; substituição cria a ligação; não relacionado insere |
| 1.12 | `retrieve/*` | Consulta (identificadores, stopwords PT, prompts curtos); orçamento de tokens nunca excedido; deduplicação por época |
| 1.13 | `hook session-start` | Injeta em `startup`/`clear`/`compact`, não em `resume`; BD vazia dá saída vazia; abaixo de 10 000 caracteres |
| 1.14 | `hook prompt` — injeção | Máximo 5 acima do limiar; sem repetição na época; com a BD bloqueada devolve vazio dentro do orçamento e exit 0 |
| 1.15 | `mcp/server` | Cliente em memória e um teste por subprocesso; `memory_save` passa por remoção de segredos e consolidação |
| 1.16 | `install`/`uninstall` para Claude Code | HOME temporário: idempotente, chaves alheias preservadas, desinstalação repõe o original; JSON inválido não é tocado |
| 1.17 | `doctor`/`status` | Snapshots com BD semeada; código de saída ≠ 0 quando uma verificação falha |
| 1.18 | Harness E2E, orçamentos de desempenho e conjunto dourado no CI | Ver "Verificação" |
| 1.19 | Uso real no Claude Code | Lista de verificação abaixo |

## Verificação

**Automática (CI):**
- `bun test` — unitários (funções puras com tabelas de casos) e integração (SQLite em diretório temporário, relógio injetável).
- Harness E2E: executa o **binário compilado** e envia a sequência `session-start → prompt → turn-end → session-end` por stdin contra um diretório de dados temporário. Cenários: sessão normal, turno interrompido, compactação, duas sessões concorrentes, `distill` morto a meio, BD bloqueada.
- Orçamentos como testes, com 5 000 memórias: `hook prompt` p95 ≤ 80 ms (≤ 200 ms em Windows), `session-start` ≤ 150 ms, `turn-end` ≤ 60 ms; falha se regredir mais de 25%.
- Conjunto dourado: turnos rotulados em PT e EN e pares prompt→memórias relevantes. Métricas: precisão e recall do filtro, recall@5, e taxa de injeção em prompts sem memória relevante (alvo perto de zero).

**Manual, no fim de M1 (num projeto de teste, com o claude-mem desativado para não haver duas memórias a injetar):**
1. `shibaox-mem install claude-code` e `shibaox-mem doctor` sem falhas.
2. Uma sessão real com três ou quatro turnos, um deles interrompido.
3. `shibaox-mem status` mostra os turnos destilados e as memórias criadas.
4. Nova sessão: o resumo aparece no arranque; um prompt relacionado recebe memórias relevantes; um prompt não relacionado não recebe nada.
5. Com a sessão parada, `pgrep -fl shibaox-mem` não devolve processos residentes.
6. Nenhuma chamada de modelo foi feita pelo shibaox-mem.
7. `shibaox-mem uninstall claude-code` repõe `~/.claude/settings.json` byte a byte.

## Riscos, por gravidade

| # | Risco | Como é reduzido cedo |
|---|---|---|
| 1 | Memórias extrativas pouco úteis (mensagens finais pobres, frases sem referente) | Candidatos do prompt, cabeçalho determinístico, `memory_save`, conjunto dourado desde 1.9, uso real no fim de M1 |
| 2 | Latência dos hooks no Windows (binário de dezenas de MB, antivírus) | Spike 0.5 antes de qualquer código de produto; SDK de MCP fora do caminho dos hooks |
| 3 | Turnos perdidos e deriva do formato do transcript | Turno aberto no prompt; transcript só por melhor esforço; fixtures versionadas |
| 4 | Processo destacado morto pelo agente no Windows | Spike 0.7; a fila é drenada por qualquer invocação posterior |
| 5 | Fuga de segredos | Tipo `Redacted`, corpus de testes, binário sem `.env`; a remoção por regras é falível e isso fica documentado |
| 6 | Recall só com BM25 | Vários canais com RRF; recall@5 medido no CI |
| 7 | Dependência do TypeSafe (versão 0.x, qualidade em português) | Interface `Judge`, fallback obrigatório, comparação no conjunto dourado |
| 8 | Paridade entre agentes | Matriz de capacidades; hook de registo antes de cada adaptador |
| 9 | Variação do SQLite do sistema no macOS | SQL conservador; sonda no `doctor` |

## Depois da aprovação

1. `git init` em `/Users/andreagroferreira/AIProjects/shibaox-mem` e primeiro commit com licença, `CLEAN-ROOM.md` e o documento de desenho (`docs/design/2026-10-05-shibaox-mem-design.md`, derivado deste plano).
2. M0 pela ordem da tabela. Os números dos spikes podem obrigar a rever decisões; se algum falhar o critério, paro e trago-te a alternativa antes de avançar.
3. M1 em TDD, com commits pequenos por passo.

---

## Anexo A — Estrutura do repositório

```
src/cli/main.ts               despacho de argv; import dinâmico por comando
src/cli/commands/             hook, distill, mcp, install, uninstall, doctor, status, search, forget
src/core/                     types, budget (Deadline), redact, git, project
src/store/                    db (abrir, pragmas, migrar, withWrite), sessions, turns, memories, injections, meta
src/store/migrations/         0001_init.sql (embutidas no binário)
src/adapters/types.ts         AgentAdapter + matriz de capacidades
src/adapters/claude-code/     payloads, transcript, install, adapter
src/distill/                  segment, pipeline, consolidate, queue
src/judge/                    types, heuristic, typesafe, client, breaker, fallback
src/retrieve/                 query, rank, budget, render, staleness
src/mcp/server.ts
src/util/                     spawn, log, tokens, paths
tests/                        unit, integration, e2e, perf, golden, fixtures/
scripts/                      build.ts, release.ts
.github/workflows/            ci.yml, release.yml
```

Regras de SQLite: `busy_timeout` definido primeiro em cada ligação (≈100 ms no hook de prompt, 2 s no `distill`); todas as escritas em `BEGIN IMMEDIATE`; nenhuma transação aberta durante uma chamada de rede; migrações só para a frente, com `PRAGMA user_version` e backup por `VACUUM INTO` antes de migrar dados.

## Anexo B — Esquema inicial (0001_init.sql)

```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;

CREATE TABLE projects (
  id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE project_aliases (
  alias TEXT PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE) WITHOUT ROWID;

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY, agent TEXT NOT NULL, agent_session_id TEXT NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id), cwd TEXT NOT NULL, branch TEXT,
  context_epoch INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, ended_at INTEGER,
  UNIQUE (agent, agent_session_id));

CREATE TABLE turns (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  seq INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open','pending','processing','done','skipped','failed')),
  completeness TEXT NOT NULL DEFAULT 'full' CHECK (completeness IN ('full','payload-only','interrupted')),
  branch TEXT, commit_sha TEXT,
  prompt TEXT NOT NULL, final_text TEXT,
  files_read TEXT NOT NULL DEFAULT '[]', files_changed TEXT NOT NULL DEFAULT '[]',
  commands TEXT NOT NULL DEFAULT '[]', errors TEXT NOT NULL DEFAULT '[]',
  transcript_path TEXT, transcript_start INTEGER, transcript_end INTEGER,
  started_at INTEGER NOT NULL, ended_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0, lease_owner TEXT, lease_until INTEGER, last_error TEXT,
  UNIQUE (session_id, seq));
CREATE INDEX turns_queue ON turns(state, id) WHERE state IN ('open','pending','processing');
CREATE INDEX turns_project_time ON turns(project_id, started_at DESC);

CREATE TABLE memories (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('decision','fix','gotcha','convention','change','discovery')),
  title TEXT NOT NULL, body TEXT NOT NULL, terms TEXT NOT NULL DEFAULT '',
  importance INTEGER NOT NULL CHECK (importance BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','archived')),
  superseded_by INTEGER REFERENCES memories(id),
  scope TEXT NOT NULL DEFAULT 'project' CHECK (scope IN ('project','branch')),
  branch TEXT, commit_sha TEXT, stale INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL CHECK (origin IN ('distilled','manual','imported')),
  judge TEXT NOT NULL, judge_version TEXT NOT NULL,
  source_turn_id INTEGER REFERENCES turns(id) ON DELETE SET NULL,
  source_ordinal INTEGER NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0, last_used_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (source_turn_id, source_ordinal));
CREATE INDEX memories_rank ON memories(project_id, status, importance DESC, updated_at DESC);

CREATE TABLE memory_files (
  memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('changed','read')),
  PRIMARY KEY (memory_id, path)) WITHOUT ROWID;
CREATE INDEX memory_files_path ON memory_files(path, memory_id);

CREATE TABLE memory_sources (
  memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  turn_id INTEGER NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK (relation IN ('origin','duplicate','supersedes')),
  PRIMARY KEY (memory_id, turn_id)) WITHOUT ROWID;

CREATE VIRTUAL TABLE memories_fts USING fts5(
  title, body, terms, content='memories', content_rowid='id',
  tokenize = "unicode61 remove_diacritics 2");
CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, title, body, terms) VALUES (new.id, new.title, new.body, new.terms); END;
CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, body, terms) VALUES ('delete', old.id, old.title, old.body, old.terms); END;
CREATE TRIGGER memories_au AFTER UPDATE OF title, body, terms ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, body, terms) VALUES ('delete', old.id, old.title, old.body, old.terms);
  INSERT INTO memories_fts(rowid, title, body, terms) VALUES (new.id, new.title, new.body, new.terms); END;

CREATE TABLE injections (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  context_epoch INTEGER NOT NULL,
  memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('session-start','prompt','mcp')),
  score REAL, tokens INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE UNIQUE INDEX injections_once ON injections(session_id, context_epoch, memory_id) WHERE event <> 'mcp';

CREATE TABLE hook_runs (
  id INTEGER PRIMARY KEY, at INTEGER NOT NULL, agent TEXT NOT NULL, event TEXT NOT NULL,
  ms INTEGER NOT NULL, outcome TEXT NOT NULL);
```

Sem `STRICT` de propósito: no macOS o Bun usa o SQLite do sistema, cuja versão varia. Tetos por campo: prompt 8 KB, texto final 16 KB. `hook_runs` é podada às últimas 2 000 linhas.

## Anexo C — Interface dos juízes

```ts
export type Source = "typesafe" | "heuristic";
export type MemoryKind = "decision" | "fix" | "gotcha" | "convention" | "change" | "discovery";
export type Redacted = string & { readonly __redacted: unique symbol };

export interface DistillInput {
  prompt: Redacted; finalText: Redacted;
  candidates: { idx: number; text: Redacted }[];
  filesChanged: string[]; commands: Redacted[]; hadErrors: boolean;
}
export interface DistillVerdict {
  worthSaving: number;                 // P(sim)
  kind: MemoryKind | "none"; kindConfidence: number;
  importance: 1 | 2 | 3 | 4 | 5;
  durable: number[];                   // P por candidato, alinhado por idx
  titleIdx: number | null; source: Source;
}
export interface ConsolidateInput {
  draft: { title: string; body: Redacted; kind: MemoryKind; files: string[] };
  neighbours: { id: number; title: string; body: Redacted; files: string[] }[];   // ≤ 8, vindos de BM25
}
export interface ConsolidateVerdict {
  perNeighbour: { id: number; relation: "different" | "related" | "same"; relationScore: number; contradicts: number }[];
  source: Source;
}
export interface Judge {
  readonly name: Source | "fallback";
  distill(i: DistillInput, d: Deadline): Promise<DistillVerdict>;
  consolidate(i: ConsolidateInput, d: Deadline): Promise<ConsolidateVerdict>;
  rerank(i: RerankInput, d: Deadline): Promise<RerankVerdict>;
}
export function withFallback(primary: Judge, fallback: Judge, breaker: Breaker, policy: FallbackPolicy): Judge;
```

Em M1 existe apenas o `HeuristicJudge`, já por trás desta interface. O texto exato das perguntas TypeSafe é definido em M2, depois de reler as páginas atuais das primitivas, de `confidence` e dos cookbooks de reranking e de alinhamento de entidades em docs.typesafe.ai.
