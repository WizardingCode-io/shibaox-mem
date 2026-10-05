# ADR 0005 — M2: juízos TypeSafe com fallback heurístico

Data: 2026-10-05 · Estado: aceite.

## O que existe

Com uma chave TypeSafe, os juízos semânticos da destilação (vale guardar? que tipo? importância? que frases são duráveis? qual é o título?) e da consolidação (mesma coisa? substitui?) passam a ser respondidos pelo modelo System One `jev-latest`, num único pedido por turno e num por memória nova. Sem chave, ou quando a API falha, o juiz heurístico responde. Nada é gerado; o modelo só julga.

- **Chave:** `TYPESAFE_API_KEY` no ambiente, senão a mesma linha em `~/.shibaox/mem/env` (ficheiro só do utilizador). Nunca aparece em logs, memórias nem mensagens de erro (teste).
- **Cliente:** `fetch` direto ao endpoint, sem SDK; 3 s por tentativa; 2 repetições só em 429/529/5xx/rede/timeout; um 422 é erro nosso e não se repete.
- **Disjuntor persistido em `meta`** (os processos vivem milissegundos): 3 falhas seguidas abrem-no por 60 s, a duplicar até 15 min; uma chave rejeitada (401/403) abre-o até a chave mudar.
- **Fallback:** cada veredicto diz quem o deu; cada memória grava `judge` e `judge_version` do juiz que respondeu de facto.
- **Custo visível:** `status` mostra pedidos, tokens de entrada e uma estimativa em dólares; `doctor` diz se a chave está configurada, rejeitada ou se o serviço anda a falhar, sem lhe fazer pedidos.
- **Reranking por prompt:** continua desligado. 250 ms a frio em cada prompt gastaria três vezes o orçamento do hook.

## Medições

| O quê | Resultado |
|---|---|
| Latência a frio (processo novo, TLS incluído), pedido de destilação com 8 perguntas | p50 246 ms · p95 273 ms (12 pedidos) |
| Tokens por turno | ≈ 1 200–1 450 de entrada → ≈ $0,00006 por turno |
| Conjunto dourado de destilação (32 turnos, PT e EN) | heurístico e TypeSafe: precisão 100 %, recall 100 %, tipo 88 % |
| Gravação das respostas para o CI | 32 turnos, 39 105 tokens, ≈ $0,0016 |
| Ponta a ponta com o binário | 2 turnos destilados em 0,46 s; "Let me know if you want a regression test" fora, causa e correção dentro; turno "thanks!" saltado |

**O empate no conjunto dourado não diz que os juízes são iguais.** O conjunto foi escrito a par das regras heurísticas, por isso o heurístico não podia perder nele. Frase a frase, o TypeSafe é mais fino: dá 0,74 a "O custo é um binário maior, cerca de 60 MB" (o heurístico dá 0,40), 0,02 a "Would you like me to write a detailed plan first?" e 0,05 a "usamos Go ou TypeScript?". Onde discorda do autor: dá 0,62 a um relato de bug do utilizador ("The hook hangs on Windows when stdin is empty"), que o heurístico descarta; é defensável nos dois sentidos.

## Decisões

- Perguntas em inglês, estado com os textos tal como estão (PT ou EN). O TypeSafe declara o inglês como língua principal; os turnos em português do conjunto dourado foram julgados tão bem como os ingleses.
- `importance = round(score) + 1` sobre a escala de 5 níveis.
- A versão das perguntas é a versão do juiz (`typesafe` v1): mudar uma pergunta é mudar a versão, para que as memórias antigas possam ser rejulgadas.

## Rejulgar as memórias importadas

O importador só podia mapear o tipo do claude-mem no nosso e dar a mesma importância a todas as memórias de um tipo. `shibaox-mem rejudge` faz ao TypeSafe as três perguntas da destilação (vale guardar? que tipo? importância?) sobre cada memória importada, apresentada como um turno sem prompt e sem candidatos a avaliar — o texto da memória é a mensagem final. O que fica abaixo do limiar de guardar passa a `archived`: sai da recuperação, mas nada é apagado. Uma memória continua `judge = claude-mem` até haver veredicto do TypeSafe, por isso a corrida retoma onde parou e as falhas são tentadas na corrida seguinte; veredictos do fallback não se escrevem (o heurístico não foi afinado para isto) e cinco falhas seguidas param a corrida. Memórias já substituídas não são julgadas.

| O quê | Resultado |
|---|---|
| Amostra de 200 memórias reais, 8 pedidos em paralelo | 6,9 s · 898 tokens por memória · $0,0075 |
| Projeção para as 89 501 | ≈ 55 min · ≈ 80 M tokens · ≈ $3,40 (abaixo dos $5,40 estimados) |
| Arquivadas | 51/200 (25 %): relatórios de estado, "testes a passar", "histórico git revela…", ramos que existiam |
| Tipo corrigido | 21/200 (10 %): "Safety Protocol Established" decision→convention; "endpoint limitations" discovery→gotcha |
| Importância das mantidas | antes todas 2 ou 3; depois 3 (55), 4 (90), 5 (4) e nenhuma em 1–2 |

**A escala de importância sobe.** O importador dava 2 a quase tudo; o TypeSafe dá 4 à maior parte do que mantém. Não é um defeito a corrigir aqui: é a mesma escala com que as memórias novas são julgadas, e o brief ordena por importância e recência dentro do projeto, por isso o que conta é a ordem relativa. Fica a observação para quando houver turnos reais no conjunto dourado: se a escala estiver inflacionada, corrige-se nas perguntas, uma vez, para todos.

**Falsos arquivamentos existem.** "Production Database Deletion Incident — Payment Data Available for Recovery" foi arquivada: pelo título parece importante; pelo corpo é o estado de um incidente, transitório. Outros casos são discutíveis em ambos os sentidos. Arquivar é reversível (só muda `status`), e o viewer do M4 mostra e repõe arquivadas.

## Por fazer

- Conjunto dourado com turnos reais anonimizados, para medir generalização em vez de regressão.
- Reranking por prompt como opção, se um dia houver um caminho quente (por exemplo, um processo residente opcional).
