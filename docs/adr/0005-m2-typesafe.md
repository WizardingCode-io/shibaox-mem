# ADR 0005 — M2: TypeSafe judgements with heuristic fallback

Date: 2026-10-05 · Status: accepted.

## What exists

With a TypeSafe key, the semantic judgements of distillation (worth saving? which type? importance? which sentences are durable? what is the title?) and of consolidation (same thing? supersedes?) are answered by the System One model `jev-latest`, in a single request per turn and one per new memory. Without a key, or when the API fails, the heuristic judge answers. Nothing is generated; the model only judges.

- **Key:** `TYPESAFE_API_KEY` in the environment, otherwise the same line in `~/.shibaox/mem/env` (user-only file). It never appears in logs, memories or error messages (tested).
- **Client:** direct `fetch` to the endpoint, no SDK; 3 s per attempt; 2 retries only on 429/529/5xx/network/timeout; a 422 is our error and is not retried.
- **Circuit breaker persisted in `meta`** (processes live for milliseconds): 3 consecutive failures open it for 60 s, doubling up to 15 min; a rejected key (401/403) opens it until the key changes.
- **Fallback:** each verdict says who gave it; each memory records the `judge` and `judge_version` of the judge that actually answered.
- **Visible cost:** `status` shows requests, input tokens and an estimate in dollars; `doctor` says whether the key is configured, rejected or whether the service has been failing, without making requests to it.
- **Per-prompt reranking:** still off. 250 ms cold on every prompt would spend three times the hook's budget.

## Measurements

| What | Result |
|---|---|
| Cold latency (new process, TLS included), distillation request with 8 questions | p50 246 ms · p95 273 ms (12 requests) |
| Tokens per turn | ≈ 1,200–1,450 input → ≈ $0.00006 per turn |
| Distillation golden set (32 turns, PT and EN) | heuristic and TypeSafe: precision 100 %, recall 100 %, type 88 % |
| Recording the answers for the CI | 32 turns, 39,105 tokens, ≈ $0.0016 |
| End to end with the binary | 2 turns distilled in 0.46 s; "Let me know if you want a regression test" left out, cause and fix kept; "thanks!" turn skipped |

**The tie on the golden set does not say the judges are equal.** The set was written alongside the heuristic rules, so the heuristic could not lose on it. Sentence by sentence, TypeSafe is finer: it gives 0.74 to "O custo é um binário maior, cerca de 60 MB" (the heuristic gives 0.40), 0.02 to "Would you like me to write a detailed plan first?" and 0.05 to "usamos Go ou TypeScript?". Where it disagrees with the author: it gives 0.62 to a user's bug report ("The hook hangs on Windows when stdin is empty"), which the heuristic discards; it is defensible either way.

## Decisions

- Questions in English, state with the texts as they are (PT or EN). TypeSafe declares English as its primary language; the Portuguese turns in the golden set were judged as well as the English ones.
- `importance = round(score) + 1` over the 5-level scale.
- The version of the questions is the version of the judge (`typesafe` v1): changing a question is changing the version, so that old memories can be re-judged.

## Re-judging the imported memories

The importer could only map claude-mem's type onto ours and give the same importance to every memory of a type. `shibaox-mem rejudge` asks TypeSafe the three distillation questions (worth saving? which type? importance?) about each imported memory, presented as a turn with no prompt and no candidates to evaluate — the memory's text is the final message. Whatever falls below the saving threshold becomes `archived`: it leaves retrieval, but nothing is deleted. A memory stays `judge = claude-mem` until there is a TypeSafe verdict, so the run resumes where it stopped and failures are retried on the next run; fallback verdicts are not written (the heuristic was not tuned for this) and five consecutive failures stop the run. Memories already superseded are not judged.

| What | Result |
|---|---|
| Sample of 200 real memories, 8 requests in parallel | 6.9 s · 898 tokens per memory · $0.0075 |
| All 89,501, for real | ≈ 1 h 50 (the service slowed down midway: from 29/s to 8/s) · 80 M tokens · ≈ $3.40 (below the estimated $5.40) · 0 failures |
| Final result | 67,434 active · 22,067 archived (24.7 %) · types: gotcha 81 → 4,023, convention 2 → 2,136, decision 5,031 → 2,255 · importance: 3 (23,623), 4 (40,303), 5 (3,119), 1–2 (389) |
| Archived | 51/200 (25 %): status reports, "tests passing", "git history reveals…", branches that existed |
| Type corrected | 21/200 (10 %): "Safety Protocol Established" decision→convention; "endpoint limitations" discovery→gotcha |
| Importance of those kept | before, all 2 or 3; after, 3 (55), 4 (90), 5 (4) and none at 1–2 |

**The importance scale goes up.** The importer gave 2 to almost everything; TypeSafe gives 4 to most of what it keeps. It is not a defect to fix here: it is the same scale new memories are judged on, and the brief orders by importance and recency within the project, so what counts is the relative order. The observation stands for when there are real turns in the golden set: if the scale is inflated, it gets corrected in the questions, once, for all.

**False archivals exist.** "Production Database Deletion Incident — Payment Data Available for Recovery" was archived: by its title it looks important; by its body it is the state of an incident, transitory. Other cases are debatable either way. Archiving is reversible (only `status` changes), and the M4 viewer shows and restores archived ones.

## Left to do

- Golden set with anonymised real turns, to measure generalisation instead of regression.
- Per-prompt reranking as an option, if one day there is a hot path (for example, an optional resident process).
