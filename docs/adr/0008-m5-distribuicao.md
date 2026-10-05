# ADR 0008 — M5: distribuição

Data: 2026-10-05 · Estado: aceite.

## O que existe

| Canal | Como | Onde fica o binário |
|---|---|---|
| Release do GitHub | tag `v<versão>` → `.github/workflows/release.yml`: verifica que a tag é a versão do `package.json`, corre o `check`, compila os cinco binários, assina os de macOS ad hoc num runner macOS, publica com `checksums.txt` | — |
| `curl \| sh` | `scripts/install.sh`: binário da plataforma a partir da release (última, ou `SHIBAOX_MEM_VERSION`), SHA-256 verificado, depois `shibaox-mem install` para todos os agentes encontrados | `~/.shibaox/mem/bin` |
| Plugin Claude Code | este repositório é o plugin (`.claude-plugin/plugin.json`, `hooks/hooks.json`, `.mcp.json`); os hooks passam por `plugin/hook.sh`, que no primeiro `SessionStart` vai buscar o binário da versão do plugin | `${CLAUDE_PLUGIN_DATA}/bin` |
| Marketplace | `WizardingCode-io/shibaox-plugins`: `marketplace.json` com `source: github` a apontar para a tag deste repositório | — |
| npm | `npm/`: pacote `shibaox-mem` com um shim em Node que vai buscar o binário da sua versão na primeira execução; sem `postinstall` | `~/.shibaox/mem/bin` |

Os dados ficam sempre em `~/.shibaox/mem`, seja qual for o canal.

## Decisões

- **Uma versão, quatro sítios, um teste.** `package.json`, `.claude-plugin/plugin.json`, `npm/package.json` e a tag têm de coincidir; os testes comparam os três ficheiros e o workflow recusa uma tag diferente.
- **O plugin fixa a versão do binário.** `hook.sh` compara `--version` com o `plugin.json` e só descarrega no `SessionStart`; um hook de prompt ou de fim de turno nunca espera por uma transferência. Falha em aberto: sem rede, a sessão arranca sem memória e sem erro.
- **O plugin vive no repositório do produto, o marketplace à parte.** Cada produto da marca mantém o seu plugin junto do código; o marketplace só aponta para versões publicadas.
- **Sem `postinstall` no npm.** Scripts de instalação são desativados em muitas organizações e correm sem o utilizador ver; o shim descarrega quando é chamado, com o checksum da release.
- **Assinatura ad hoc, por agora.** Chega para o Apple Silicon executar binários obtidos por `curl`; um binário descarregado pelo browser fica em quarentena. Developer ID e notarização precisam da conta Apple da WizardingCode.
- **Instalação direta e plugin juntos: o plugin cede.** O Claude Code correria cada hook duas vezes. A execução do plugin é a que sabe que o é (`CLAUDE_PLUGIN_ROOT`), por isso é ela que sai em silêncio quando o `settings.json` já tem os hooks diretos. Entra na 0.1.1; na 0.1.0 quem tiver os dois vê as notas a dobrar.

## Verificado

- `scripts/install.sh`, `plugin/hook.sh` e o shim npm: testes contra um release de substituição (servidor local, binário falso, checksum certo e errado).
- Plugin numa sessão real do Claude Code (`--plugin-dir`): o `SessionStart` descarregou o binário para `plugins/data/<id>/bin`, os hooks seguintes correram por ele.
- `claude plugin validate` passa no plugin e no marketplace.

## Por fazer

- Homebrew tap (`WizardingCode-io/homebrew-shibaox`), fórmula a partir dos checksums da release.
- Developer ID + notarização macOS; assinatura Authenticode no Windows.
- `install.ps1` para Windows; o plugin depende de `sh`, que no Windows só existe com Git Bash.
- Página de comparação com números medidos; desenho dos serviços pagos (juízos geridos, sync, memória de equipa).
