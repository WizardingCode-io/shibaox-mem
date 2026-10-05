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
- **O viewer só arquiva e repõe.** Editar texto, apagar ou mudar tipo ficam de fora: as memórias são o que os juízes produziram, e uma correção manual é uma `memory_save` nova que substitui a antiga.
- **Tema segue o sistema** (`prefers-color-scheme`); os dois temas do design system funcionam.

## Medições

| O quê | Resultado |
|---|---|
| Página com 28 534 memórias ativas num projeto (the-burrow-hub) | lista paginada a 50, resposta imediata; contagem total por `count(*)` |
| Binário darwin-arm64 com o viewer | 63,3 MB (antes 63,1 MB) |
| `compact --dry-run` na base real logo após o rejulgamento | 0 turnos, 0 sessões, 0 registos — ainda não há nada com 90 dias; 206 MB |

## Por fazer

- Obsolescência por branch (#16 do ADR 0002): a marca já se limpa ao voltar ao branch; falta rotular "só existe no branch X" em vez de esconder.
- Viewer: turnos recentes por projeto (a API `/api/turns` existe; a página ainda não os mostra); atalhos de teclado na lista.
- A escala de importância (ADR 0005) poderá merecer um filtro no viewer quando houver turnos reais no conjunto dourado.
