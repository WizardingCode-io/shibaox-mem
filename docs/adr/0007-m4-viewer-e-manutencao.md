# ADR 0007 — M4: viewer e manutenção

Data: 2026-10-05 · Estado: aceite.

## O que existe

- **`shibaox-mem ui`**: uma página local sobre a base de dados, com o design system da marca (tokens, Bricolage Grotesque e Geist embutidos no binário, mascote nos estados vazios). Projetos com contagens; memórias por recência ou pela mesma pesquisa que o agente usa (`explicitMatch`, partilhada com o `memory_search`); cada memória em pleno, com ficheiros e o prompt de onde veio; arquivar e repor. Nada mais se altera a partir daqui. Ligações profundas `#m<id>`.
- **`shibaox-mem compact [--dry-run]`**: turnos terminados com mais de 90 dias de que nenhuma memória nasceu, sessões que ficaram vazias, registos de latência além dos últimos 5 000; depois `VACUUM`. Memórias nunca são apagadas aqui.
- **`status`** mostra arquivadas; **`rejudge`** (ADR 0005) e o eco por MCP (ADR 0002, #4) também entraram neste marco.

## Decisões

- **Servidor só em loopback, token na URL, `Host` verificado, desliga-se ao fim de 30 min sem pedidos.** Um site aberto noutro separador não chega à API (sem token; `Host` errado dá 403); outro utilizador da máquina não adivinha o token.
- **Nada vem da rede.** As fontes viajam no binário (`with { type: "file" }`, ≈ 100 KB) e são servidas em `/assets/`; os `@font-face` e as classes utilitárias do `tokens.css` da marca são descartados ao gerar a página — só as variáveis entram, porque as classes (`.title`, `.body`) colidiam com as da página.
- **Vue 3 + Tailwind 4 + Nuxt UI, compilado num só ficheiro** (substitui a decisão anterior de "JavaScript simples, sem framework"). A app vive em `ui/` e o Vite (`vite-plugin-singlefile`) produz `src/ui/dist/index.html`, que o binário embute com `with { type: "text" }`; `ui/dist` não entra no git e `bun run test`/`build`/`check` constroem-no primeiro. A API continua a ser funções puras em `src/ui/api.ts`, testadas por HTTP com `port: 0`. As duas versões anteriores, em vanilla com o `components.css` da marca, saíram tortas (anel de foco no sítio errado, `select` nativo) e não davam para crescer: paleta de comandos, formulários de edição e *slideovers* precisam de componentes a sério. Os tokens da marca (`--bg`, `--surface`, `--ink`, `--shiba`, …) são definidos em `ui/src/app.css` e mapeados para as variáveis semânticas do Nuxt UI (`--ui-bg`, `--ui-text`, `--ui-primary`, …), de modo que os componentes saem na marca sem CSS próprio; a paleta `shiba` é a cor primária do Nuxt UI.
- **Nada vem da rede, também no Vue.** As fontes continuam no binário, servidas em `/assets/` sem token; os ícones Lucide usados pela app e pelo Nuxt UI são embutidos na compilação (`icon.clientBundle.scan` no plugin do Nuxt UI) para que nada seja pedido ao iconify em runtime. O build falha se um ícone pedido não existir na coleção instalada.
- **Tema pelo modo de cor do Nuxt UI** (`useDark` do VueUse: classe `dark` em `<html>`, lembrado no browser, segue o sistema por omissão); um script antes da pintura lê o mesmo registo para não haver *flash*; `?theme=light|dark` fixa-o. A primeira tentativa de gerir o tema à parte lutava com o plugin do Nuxt UI e o claro nunca ganhava.
- **O detalhe é uma coluna de 1280 px para cima e uma folha (*slideover*) abaixo.** A escolha é feita por `matchMedia` e não por CSS: esconder a folha com `xl:hidden` deixava o *scrim*, teletransportado para o `<body>`, a escurecer a página larga.
- **Motion curta e discreta:** a do Nuxt UI (120–200 ms), mais transições só em hover, seleção e barras do painel; desligada com `prefers-reduced-motion`.
- **Editar é permitido, com limites.** Título, corpo, tipo e importância de uma memória ativa ou arquivada podem ser corrigidos no viewer (`PATCH /api/memories/:id`); a memória passa a `judge = 'user'`, o texto é redigido como qualquer outro e o FTS acompanha. Uma memória substituída não se edita: a correção é uma `memory_save` nova. Apagar continua fora.
- **`vue-tsc` fica de fora** enquanto não funcionar com o TypeScript 7 (`./lib/tsc` deixou de ser exportado); o Vite compila sem verificar tipos, e os componentes são pequenos o bastante para o `check` do servidor e os testes HTTP apanharem o que importa.

## Medições

| O quê | Resultado |
|---|---|
| Página com 28 534 memórias ativas num projeto (the-burrow-hub) | lista paginada a 50, resposta imediata; contagem total por `count(*)` |
| Binário darwin-arm64 com o viewer | 63,3 MB (antes 63,1 MB) |
| `compact --dry-run` na base real logo após o rejulgamento | 0 turnos, 0 sessões, 0 registos — ainda não há nada com 90 dias; 206 MB |

## O que o viewer faz (desde a versão seguinte à 0.2.1)

Filtro de projetos na barra lateral; pesquisa com `/`; **paleta de comandos** com ⌘K (memórias de todos os projetos por FTS, projetos, ações); filtros por tipo, estado e importância mínima; **editar** título, corpo, tipo e importância; separador **Turns** com os turnos recentes, o seu estado (`done`, `skipped`, `failed`, `pending`) e erro, cada um aberto em pleno (prompt, resposta, ficheiros lidos e alterados, comandos, erros) e **ligado às memórias que gerou** — e cada memória ao turno de onde veio; separador **Overview** com o painel do projeto (ativas, arquivadas, obsoletas, por tipo, por importância, por juiz, oito semanas de memórias e turnos, latência dos hooks); navegação por teclado (↑/↓ ou j/k, Esc); arquivar, repor e **copiar como nota** (no formato das `<shibaox-mem-notes>`); tema claro/escuro a seguir o sistema, lembrado no browser, `?theme=` para o fixar; ligações `#m<id>`, `#turns` e `#overview`. Desenvolvimento com `bun run ui:dev` (Vite em 5180, a passar `/api` e `/assets` a um `shibaox-mem ui` a correr).

## Por fazer

- Obsolescência por branch (#16 do ADR 0002): a marca já se limpa ao voltar ao branch; falta rotular "só existe no branch X" em vez de esconder.
- Viewer: voltar a verificar tipos dos componentes quando o `vue-tsc` suportar o TypeScript 7.
