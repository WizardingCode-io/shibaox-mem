# ADR 0003 — Importar do claude-mem e retirá-lo na instalação

Data: 2026-10-05 · Estado: aceite.

## Contexto

Quem troca o claude-mem pelo shibaox-mem tem lá meses de memórias e dois sistemas a injetar contexto na mesma sessão. O `install` passa a tratar da troca: importa primeiro, retira o claude-mem depois.

## O que foi decidido

- **Só leitura sobre a base de dados do utilizador.** `~/.claude-mem/claude-mem.db` é aberta em modo só de leitura e nunca é alterada nem apagada. Os 9,2 GB ficam onde estão; o relatório diz como os apagar. É interoperabilidade de dados, permitida pelo `CLEAN-ROOM.md`; o código do claude-mem continua fora de limites.
- **Projeto por nome de pasta.** O claude-mem não guarda caminhos, só o nome da pasta. Cada projeto importado fica com o alias `imported:<nome>`; a primeira pasta vista com esse nome, ainda sem projeto próprio, adota-o e ganha os aliases reais. Duas pastas com o mesmo nome: a primeira fica com as memórias.
- **Tudo é importado**, menos os tipos `sensitive` e `task-boundary` e os repetidos exatos. Uma observação só com título é uma afirmação e fica. Os 13 350 resumos de sessão não são importados: o "onde ficámos" vem dos nossos turnos.
- **Mapeamento de tipos:** bugfix→fix; feature/change/refactor→change; decision→decision (importância 3); discovery→discovery; gotcha e security_*→gotcha (3 e 4); pattern→convention; o resto→discovery. Importância 2 por omissão. A data original é mantida, por isso o decaimento por idade aplica-se.
- **Retirar o claude-mem** = `claude plugin disable` mais parar o worker, o Chroma e os servidores MCP, identificados pelos caminhos da instalação (cache do plugin, pasta de dados), nunca por palavras. Pede confirmação num terminal; `--yes` aceita, `--keep-claude-mem` recusa, `--no-import` salta a importação. Sem terminal e sem `--yes`, só importa e avisa. Fim de input sem resposta conta como não.
- **Idempotente:** uma marca em `meta` guarda o último id importado; correr outra vez importa só o que é novo. `shibaox-mem import claude-mem [--db]` existe à parte.

## Medições (base de dados real deste utilizador, 89 530 observações)

| O quê | Resultado |
|---|---|
| Importação | 89 449 memórias, 72 projetos, 3 sensíveis fora, em 31 s (10 min antes de trocar a verificação de duplicados por um conjunto de hashes) |
| Tamanho | 209 MB (o claude-mem ocupa 9,2 GB) |
| Hook de prompt, projeto com 36k memórias | ~60 ms internos, p95 62 ms (orçamento 80); prompt sem relação não injeta nada |
| `distill` com obsolescência sobre 36k memórias | 0,27 s |

## Limites conhecidos

- Correr a importação com o worker do claude-mem a escrever é seguro para a fonte, mas pode ler um estado a meio; correr outra vez apanha o resto.
- A qualidade das memórias importadas é a do claude-mem: 70% são `change`/`discovery`, muitas vezes ruidosas. A recuperação por evidência e o decaimento por idade são o que as mantém fora do caminho.
- Parar os servidores MCP do claude-mem afeta sessões do Claude Code que estejam abertas: perdem as ferramentas `mcp-search` dele até reiniciar. As sessões continuam a funcionar.

## Depois da importação real (2026-10-05)

Com as 89k memórias de 72 projetos na mesma base de dados, o hook de prompt no Claude Code real demorava **300–1 000 ms** (o `doctor` apanhou-o: p95 927 ms). Causa: o índice de texto integral abrangia todos os projetos; uma consulta num projeto de 273 memórias percorria primeiro 55–67 mil linhas dos outros. O teste de desempenho não o via porque semeava um só projeto.

Correção: a migração `0002` acrescenta o `project_id` como coluna do índice, e todas as consultas o levam dentro do `MATCH` (`inProject` em `src/util/words.ts`). Na base real: recuperação de 115–127 ms para 12–25 ms; hook de ponta a ponta 50–55 ms. O teste de desempenho passou a semear seis outros projetos (60k memórias) e a usar um prompt de parágrafo. A migração da base real (209 MB) demorou 3,7 s, com backup.

