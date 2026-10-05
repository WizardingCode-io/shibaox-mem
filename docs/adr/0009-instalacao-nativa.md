# ADR 0009 — Instalar de dentro de cada agente

Data: 2026-10-05 · Estado: aceite.

## Porquê

O shibaox-mem vive dentro dos agentes; não é uma aplicação. Até à 0.1.1 só o Claude Code o instalava como plugin; nos outros era preciso descarregar um binário e correr `shibaox-mem install <agente>`. Os quatro têm mecanismo próprio de plugins ou extensões, e é por aí que as pessoas esperam instalar. A assinatura Apple e o `install.ps1` saem das pendências: só serviam a quem descarrega ficheiros à mão.

## O que existe

| Agente | Comando | Onde está | Como chega ao binário |
|---|---|---|---|
| Claude Code | `claude plugin install shibaox-mem@shibaox-plugins` | raiz do repositório (`.claude-plugin/`, `hooks/`, `plugin/`) | `shibaox-mem.sh` |
| Codex | `codex plugin add shibaox-mem@shibaox-plugins` | `plugins/codex/` (`.codex-plugin/plugin.json`, `hooks/hooks.json`, `.mcp.json`) | `shibaox-mem.sh` |
| Gemini CLI | `gemini extensions install <repositório>` | `plugins/gemini/`, empacotado na release | vai dentro do arquivo (`bin/`) |
| OpenCode | `opencode plugin shibaox-mem-opencode --global` | `plugins/opencode/` (pacote npm próprio) | `binary.js` |
| Cursor | marketplace do Cursor / importar o repositório | `plugins/cursor/` (`.cursor-plugin/plugin.json`, `hooks/hooks.json`, `mcp.json`) | `shibaox-mem.sh` |

Tudo o que os agentes leem é gerado por `scripts/plugins.ts` a partir de uma só definição (nome, versão, eventos de cada agente tirados das especificações em `src/install/`), e fica commitado porque os agentes o vão buscar ao git. Um teste falha se algum ficheiro divergir do que o script escreveria.

## Decisões

- **Um binário para todos os agentes, em `~/.shibaox/mem/bin`.** Uma cópia de 63 MB em vez de uma por agente, e um caminho estável para `shibaox-mem ui`, `status` e `doctor`. O script só o vai buscar no arranque de sessão, à release da versão do plugin, com o checksum verificado; **nunca desce de versão**, para que plugins de versões diferentes em dois agentes não andem a trocar o binário um ao outro. Uma pré-release cede à versão final.
- **Gemini leva o binário dentro.** As extensões do Gemini instalam um arquivo por plataforma a partir da release (`{platform}.{arch}.shibaox-mem.tar.gz`); com o binário lá dentro, não há nada a descarregar na primeira sessão. `scripts/package-gemini.sh` produz os cinco no workflow de release.
- **OpenCode é um pacote à parte, `shibaox-mem-opencode`.** Um pacote npm só tem a API de ferramentas do OpenCode se a declarar como dependência (medido: `import("@opencode-ai/plugin")` falha sem ela). Pô-la no `shibaox-mem` pesaria em quem só usa `npx shibaox-mem`. Tentou-se registar o servidor MCP pelo hook `config` do plugin: o hook corre, mas o servidor não arrancou.
- **Um só a falar.** Instalado duas vezes no mesmo agente (direto e por plugin), a execução do plugin cede: passa `--via-plugin`, e o binário sai em silêncio se o ficheiro da instalação direta desse agente tiver os nossos hooks. No OpenCode, o pacote npm cede se o ficheiro de plugin direto existir.
- **Codex 0.153 lê `.codex-plugin/plugin.json`.** Só com `plugin.json` na raiz, sintetiza um manifesto sem versão. `${PLUGIN_ROOT}` e `${PLUGIN_DATA}` são expandidos nos hooks e existem como variáveis de ambiente (e os aliases `CLAUDE_PLUGIN_*` também).

## Provado nesta máquina, em HOMEs isolados

| Agente | Instalação pelo comando nativo | Eventos vistos em `hook_runs` |
|---|---|---|
| Claude Code (`--plugin-dir`) | sim | `session-start`, `prompt`, `session-end` |
| Codex (marketplace local → `plugins/codex`) | sim, versão 0.1.1 em `plugins/cache/` | `session-start`, `prompt`, `session-end`; turno gravado como `codex` |
| Gemini (arquivo empacotado) | sim, 4 hooks registados, servidor MCP ligado | `session-start`, `session-end` |
| OpenCode (tarball do pacote) | sim | `session-start`, `prompt` |
| Cursor | não há Cursor para correr | — |

## Por confirmar

- Servidor MCP do plugin Codex: declarado como a documentação descreve, mas não arrancou numa sessão sem login válido.
- Fim de turno: Codex (`Stop`), Gemini (`AfterAgent`), OpenCode (`session.idle` com resposta) — os três precisam de um modelo a responder, que esta máquina não tem para eles.
- Cursor: tudo. O plugin segue a documentação; a listagem no marketplace é uma submissão do dono da conta.
- Windows: os plugins de Claude Code, Codex e Cursor usam `sh`; o do Gemini e o do OpenCode não.
