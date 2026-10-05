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
| Homebrew | tap `WizardingCode-io/homebrew-shibaox`; a fórmula instala o binário da release (cópia de origem em `packaging/homebrew/`) | prefixo do Homebrew |

Os dados ficam sempre em `~/.shibaox/mem`, seja qual for o canal.

## Decisões

- **Uma versão, quatro sítios, um teste.** `package.json`, `.claude-plugin/plugin.json`, `npm/package.json` e a tag têm de coincidir; os testes comparam os três ficheiros e o workflow recusa uma tag diferente.
- **O plugin fixa a versão do binário.** `hook.sh` compara `--version` com o `plugin.json` e só descarrega no `SessionStart`; um hook de prompt ou de fim de turno nunca espera por uma transferência. Falha em aberto: sem rede, a sessão arranca sem memória e sem erro.
- **O plugin vive no repositório do produto, o marketplace à parte.** Cada produto da marca mantém o seu plugin junto do código; o marketplace só aponta para versões publicadas.
- **Sem `postinstall` no npm.** Scripts de instalação são desativados em muitas organizações e correm sem o utilizador ver; o shim descarrega quando é chamado, com o checksum da release.
- **Assinatura ad hoc, por agora.** Chega para o Apple Silicon executar binários obtidos por `curl`; um binário descarregado pelo browser fica em quarentena. Developer ID e notarização precisam da conta Apple da WizardingCode.
- **Instalação direta e plugin juntos: o plugin cede.** O Claude Code correria cada hook duas vezes. A execução do plugin é a que sabe que o é (`CLAUDE_PLUGIN_ROOT`), por isso é ela que sai em silêncio quando o `settings.json` já tem os hooks diretos. Desde a 0.1.1.
- **O servidor MCP do plugin está no `plugin.json`, não num `.mcp.json` na raiz.** Com o plugin na raiz do repositório, esse ficheiro fazia do servidor também um servidor de projeto para quem abrisse o repositório no Claude Code, com um caminho que só um plugin expande. Desde a 0.1.1.

## Verificado

- `scripts/install.sh`, `plugin/hook.sh` e o shim npm: testes contra um release de substituição (servidor local, binário falso, checksum certo e errado).
- Com as releases reais 0.1.0 e 0.1.1: `curl | sh` num HOME vazio (binário assinado ad hoc a correr em Apple Silicon); plugin instalado do marketplace numa configuração isolada, a ir buscar o binário à release no primeiro `SessionStart`; `brew fetch` do tap com o checksum certo; shim npm a descarregar a sua versão.
- `claude plugin validate` passa no plugin e no marketplace.

## O que correu mal, para não repetir

- A primeira execução do workflow da 0.1.1 falhou no `check`: um teste que insere 1 200 linhas levou 7,7 s num runner partilhado, contra o limite de 5 s por omissão. Nada foi publicado; o job foi repetido e o teste tem agora um limite próprio.
- Testes com um servidor local falhavam em rajadas nesta máquina: `Bun.serve` sem `hostname` escuta em todas as interfaces, e a porta atribuída podia já ser de outro processo em `127.0.0.1` — o `curl` falava com esse. Os servidores de teste escutam agora em `127.0.0.1` pelo nome.

## Por fazer

- Publicar o pacote npm (`cd npm && npm publish --access public`, pelo dono da conta) e automatizar: fórmula, marketplace e npm atualizados pelo workflow de release.
- Developer ID + notarização macOS; assinatura Authenticode no Windows.
- `install.ps1` para Windows; o plugin depende de `sh`, que no Windows só existe com Git Bash.
- Página de comparação com números medidos; desenho dos serviços pagos (juízos geridos, sync, memória de equipa).
