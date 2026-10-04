import { type Redacted, redact } from "../../src/core/redact.ts";
import { candidates } from "../../src/distill/segment.ts";
import type { DistillInput } from "../../src/judge/types.ts";

const r = (text: string): Redacted => redact(text, { env: {} });

/** Builds what the distillation pipeline would hand a judge for this turn. */
export function distillInput(
  prompt: string,
  finalText: string,
  extra: { filesChanged?: string[]; commands?: string[]; hadErrors?: boolean } = {},
): DistillInput {
  return {
    prompt: r(prompt),
    finalText: r(finalText),
    candidates: candidates(prompt, finalText).map((candidate) => ({
      ...candidate,
      text: r(candidate.text),
    })),
    filesChanged: extra.filesChanged ?? [],
    commands: (extra.commands ?? []).map(r),
    hadErrors: extra.hadErrors ?? false,
  };
}
