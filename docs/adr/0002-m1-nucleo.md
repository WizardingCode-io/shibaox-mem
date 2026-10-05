# ADR 0002 — M1: núcleo e Claude Code em modo local

Data: 2026-10-05 · Estado: aceite em macOS arm64. Linux e Windows continuam por validar (o CI nunca correu).

## O que existe

Um binário com os comandos `hook`, `distill`, `mcp`, `install`, `uninstall`, `doctor` e `status`. Captura turnos pelos quatro hooks do Claude Code, destila-os em memórias sem nenhum modelo generativo (juiz heurístico), injeta um resumo no arranque da sessão e as notas relevantes em cada prompt, e expõe `memory_search`, `memory_get` e `memory_save` por MCP.

## Medições

Binário compilado, macOS 26 arm64, Bun 1.4.2.

| O quê | Resultado |
|---|---|
| Suite | 641 testes, incluindo os que compilam e executam o binário |
| Hook de prompt com 5 000 memórias | p95 ≈ 25 ms (orçamento: 80 ms) |
| Hook de arranque de sessão com 5 000 memórias | p95 ≈ 20 ms (orçamento: 150 ms) |
| Hook de fim de turno | p95 ≈ 16 ms (orçamento: 60 ms) |
| Prompt hostil de 320 KB (hex) | abaixo de 1,5 s de ponta a ponta; antes da correção, mais de 20 s |
| Sessões reais no Claude Code 2.1.289 | hooks ≤ 17 ms, 0 erros, 0 processos residentes, 0 chamadas de modelo feitas pelo ai-mem |
| Recuperação, conjunto dourado | recall 19/24, precisão 19/21, injeções falsas 0/23 |
| Filtro do juiz heurístico, conjunto dourado | precisão 16/16, recall 16/16 |

**Os conjuntos dourados foram escritos à mão pelo autor das regras.** São uma base de regressão. Não medem como o sistema se comporta em projetos reais: a revisão independente encontrou 14 prompts banais que o juiz guardava como convenções apesar dos 16/16, e foi isso que levou à regra atual de "instrução permanente".

As cinco falhas de recall são paráfrases sem palavras em comum com a memória. A pesquisa lexical não as encontra; é o caso de uso para o juiz TypeSafe (M2) ou para vetores.

## Decisões que se afastam do plano

**Captura**
- O turno é identificado por (`session_id`, `prompt_id`). Abre no prompt; o `SessionEnd` fecha o que ficou aberto; um turno aberto há mais de 12 h é dado como abandonado no arranque da sessão seguinte.
- Um turno pode terminar mais de uma vez (outro hook de `Stop` manda o agente continuar). Fica o último final, e redestilar um turno atualiza a sua única memória.
- Uma memória por turno.

**Destilação**
- O corpo da memória são os factos selecionados mais uma linha `Context:` com o pedido, quando o título vem da resposta do assistente.
- Uma frase do prompt só conta como regra se não for pergunta, pedido ou limitada ao momento, e se a pista não for uma mera observação.
- O que o agente repete das notas que lhe foram mostradas é removido antes de julgar o turno (correspondência textual exata).
- Um turno em que o agente chamou `memory_save` com sucesso não é destilado.
- A consolidação verifica "substitui" antes de "duplicado".

**Recuperação**
- Sem reranking e sem prazo interno (`Deadline`): o juiz é local e síncrono. Ambos ficam para M2.
- Stemming leve (plurais em PT e EN, `-ed`/`-ing` em EN), guardado na coluna `terms` e acrescentado à consulta. Subiu o recall de 14/24 para 19/24.
- A evidência para injetar é ponderada: palavra genérica de programação 0,5; palavra normal 1; palavra rara 1,5; são precisos 3, ou um identificador específico, ou um ficheiro tocado na sessão mais uma palavra não genérica. "Raro" é relativo ao tamanho do projeto, nunca abaixo de uma memória.
- O resumo de arranque mostra só títulos. Uma nota nomeada no resumo continua a poder ser mostrada por inteiro, uma vez, quando um prompt a torna relevante.
- As junções com o índice de texto integral usam `CROSS JOIN`: o planeador do SQLite invertia-as (90 ms por palavra com 5 000 memórias).
- A obsolescência só deteta ficheiros desaparecidos.

**Instalação**
- Hooks em forma exec (`command` + `args`) com caminho absoluto; o servidor MCP é registado com `claude mcp add`.
- O recibo e o backup são por ficheiro de definições e só valem enquanto o ficheiro estiver como o deixámos. Caso contrário o `uninstall` remove as nossas entradas e mantém o resto.

**Esquema**
- A migração `0001` foi editada depois de escrita (índice único de `injections` passou a incluir `event`). Nenhuma versão foi publicada, por isso não há bases de dados a migrar. **A partir da primeira publicação, uma alteração é sempre uma migração nova.**

## Por fazer antes de avançar

1. **Antes de criar a migração `0002`:** o backup anterior à migração corre fora de qualquer lock e o nome do ficheiro só tem milissegundos. Vários processos a migrar ao mesmo tempo falham alguns hooks. Dar ao backup um nome único e serializá-lo.
2. **Obsolescência e branches:** uma nota ancorada num ficheiro que só existe noutro branch fica marcada como desatualizada até se voltar a esse branch.
3. **Hosts antigos:** sem argumentos, o binário imprime a ajuda mesmo com um payload no stdin. Num Claude Code que ignore `args`, isso seria injetado como contexto. A forma exec foi verificada na versão 2.1.289; não se sabe a partir de que versão existe.
4. **Eco por MCP:** o que o agente lê com `memory_get` e repete não é filtrado, porque o servidor MCP não conhece a sessão.
5. **Teste do `distill` morto a meio:** simula o estado por SQL em vez de matar um processo.
6. **Windows:** suposições POSIX conhecidas — permissões 0600/0700 sem efeito; `rename` sobre um `.exe` ou um `settings.json` em uso; `claude.cmd` não resolvido sem shell; fins de linha CRLF convertidos; comparação de caminhos sensível a maiúsculas; `pgrep` e caminhos de URL nos testes.
7. **Remoção de segredos:** é por regras e é falível. Uma revisão adversarial encontrou 22 formas em 29 que passavam; as mais comuns foram fechadas, outras existirão.
