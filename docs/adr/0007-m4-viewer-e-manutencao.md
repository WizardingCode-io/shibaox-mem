# ADR 0007 — M4: viewer e manutenção

Data: 2026-10-05 · Estado: aceite.

## O que existe

- **`shibaox-mem ui`**: uma página local sobre a base de dados, com o design system da marca (tokens, Bricolage Grotesque e Geist embutidos no binário, mascote nos estados vazios). Projetos com contagens; memórias por recência ou pela mesma pesquisa que o agente usa (`explicitMatch`, partilhada com o `memory_search`); cada memória em pleno, com ficheiros e o prompt de onde veio; arquivar e repor. Nada mais se altera a partir daqui. Ligações profundas `#m<id>`.
- **`shibaox-mem compact [--dry-run]`**: turnos terminados com mais de 90 dias de que nenhuma memória nasceu, sessões que ficaram vazias, registos de latência além dos últimos 5 000; depois `VACUUM`. Memórias nunca são apagadas aqui.
- **`status`** mostra arquivadas; **`rejudge`** (ADR 0005) e o eco por MCP (ADR 0002, #4) também entraram neste marco.

## Decisões

- **Servidor só em loopback, token na URL, `Host` verificado, desliga-se ao fim de 30 min sem pedidos.** Um site aberto noutro separador não chega à API (sem token; `Host` errado dá 403); outro utilizador da máquina não adivinha o token.
- **Nada vem da rede.** As fontes viajam no binário (`with { type: "file" }`, ≈ 100 KB) e são servidas em `/assets/`; os `@font-face` e as classes utilitárias do `tokens.css` da marca são descartados ao gerar a página — só as variáveis entram, porque as classes (`.title`, `.body`) colidiam com as da página.
- **JavaScript simples, sem framework.** A página é uma string em `src/ui/page.ts`; a API são funções puras em `src/ui/api.ts`, testadas por HTTP com `port: 0`.
- **Os componentes são os do design system.** A página embute o `components.css` da marca (`.sx-btn`, `.sx-field__box`, `.sx-select`, `.sx-badge`, `.sx-nav`, `.sx-seg`, `.sx-tabs`, `.sx-kbd`, `.sx-toast`) e só acrescenta a disposição. A primeira versão tinha CSS próprio e saiu torta: o anel de foco desenhado no `input` em vez da caixa, um `select` nativo sem estilo. O anel de foco da marca aparece só para foco por teclado (`:focus-visible`); o rato muda apenas a cor da borda.
- **Motion curta e discreta:** 120–180 ms, `cubic-bezier(.2,.8,.2,1)`, só em hover, seleção, painel de detalhe e toasts; desligada com `prefers-reduced-motion`.
- **O viewer só arquiva e repõe.** Editar texto, apagar ou mudar tipo ficam de fora: as memórias são o que os juízes produziram, e uma correção manual é uma `memory_save` nova que substitui a antiga.
- **Tema segue o sistema** (`prefers-color-scheme`); os dois temas do design system funcionam.

## Medições

| O quê | Resultado |
|---|---|
| Página com 28 534 memórias ativas num projeto (the-burrow-hub) | lista paginada a 50, resposta imediata; contagem total por `count(*)` |
| Binário darwin-arm64 com o viewer | 63,3 MB (antes 63,1 MB) |
| `compact --dry-run` na base real logo após o rejulgamento | 0 turnos, 0 sessões, 0 registos — ainda não há nada com 90 dias; 206 MB |

## O que o viewer faz (desde a versão seguinte à 0.2.1)

Filtro de projetos na barra lateral; pesquisa com `/` ou ⌘K; filtros por tipo (segmented), estado e importância mínima; separador **Turns** com os turnos recentes do projeto e o seu estado (`done`, `skipped`, `failed`, `pending`) e erro; navegação por teclado (↑/↓ ou j/k, Esc); arquivar, repor e **copiar como nota** (no formato das `<shibaox-mem-notes>`); tema claro/escuro a seguir o sistema, com interruptor lembrado no browser e `?theme=` para o fixar; ligações `#m<id>` e `#turns`.

## Por fazer

- Obsolescência por branch (#16 do ADR 0002): a marca já se limpa ao voltar ao branch; falta rotular "só existe no branch X" em vez de esconder.
- Viewer: ligar cada turno à memória que gerou; editar o título de uma memória (hoje é só arquivar/repor, por decisão).
