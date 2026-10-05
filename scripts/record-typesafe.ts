// Records TypeSafe's answers for the golden turns, so the comparison in tests/golden runs
// in CI without a key, without network and without cost. Run by hand when the questions
// or the golden set change:  bun scripts/record-typesafe.ts
import { writeFileSync } from "node:fs";
import { systemOne } from "../src/judge/client.ts";
import { readTypeSafeKey } from "../src/judge/key.ts";
import { distillQuestions, distillState } from "../src/judge/questions.ts";
import { defaultDataDir } from "../src/util/paths.ts";
import turns from "../tests/golden/turns.json" with { type: "json" };
import { distillInput } from "../tests/helpers/judge-input.ts";

const key = readTypeSafeKey(process.env, defaultDataDir());
if (key === null) {
  console.error("no TYPESAFE_API_KEY in the environment or in the data directory's env file");
  process.exit(1);
}

const out = new URL("../tests/golden/typesafe-answers.json", import.meta.url);
const recorded: Record<string, { answers: unknown; inputTokens: number }> = {};
let tokens = 0;
for (const turn of turns) {
  const input = distillInput(turn.prompt, turn.final, {
    filesChanged: turn.filesChanged,
    hadErrors: turn.hadErrors,
  });
  const response = await systemOne(
    { state: distillState(input), questions: distillQuestions(input) },
    { apiKey: key, timeoutMs: 10_000 },
  );
  recorded[turn.id] = { answers: response.answers, inputTokens: response.usage.input_tokens };
  tokens += response.usage.input_tokens;
  process.stdout.write(`${turn.id}: ${response.usage.input_tokens} tokens\n`);
}
writeFileSync(
  out,
  `${JSON.stringify({ model: "jev-latest", recordedAt: new Date().toISOString(), turns: recorded }, null, 2)}\n`,
);
console.log(
  `recorded ${turns.length} turns, ${tokens} input tokens (≈ $${((tokens * 0.042) / 1e6).toFixed(4)})`,
);
