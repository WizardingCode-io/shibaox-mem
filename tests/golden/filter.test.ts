import { describe, expect, test } from "bun:test";
import { SAVE_THRESHOLD } from "../../src/distill/policy.ts";
import { heuristicJudge } from "../../src/judge/heuristic.ts";
import { distillInput } from "../helpers/judge-input.ts";
import turns from "./turns.json" with { type: "json" };

// This set was written by hand, alongside the rules it measures. It is a regression
// baseline for the heuristic judge, not evidence of how well it generalises.

const verdicts = await Promise.all(
  turns.map(async (turn) => ({
    turn,
    verdict: await heuristicJudge.distill(
      distillInput(turn.prompt, turn.final, {
        filesChanged: turn.filesChanged,
        hadErrors: turn.hadErrors,
      }),
    ),
  })),
);
const saved = verdicts.filter(({ verdict }) => verdict.worthSaving >= SAVE_THRESHOLD);
const worth = verdicts.filter(({ turn }) => turn.worth);
const truePositives = saved.filter(({ turn }) => turn.worth);

describe("golden set: what the heuristic judge keeps", () => {
  test("covers both languages and both outcomes", () => {
    expect(turns.length).toBeGreaterThanOrEqual(30);
    expect(turns.filter((turn) => turn.id.startsWith("pt-")).length).toBeGreaterThanOrEqual(10);
    expect(worth.length).toBeGreaterThanOrEqual(12);
    expect(turns.length - worth.length).toBeGreaterThanOrEqual(12);
  });

  test("precision: what it keeps is worth keeping", () => {
    const wrong = saved.filter(({ turn }) => !turn.worth).map(({ turn }) => turn.id);
    expect(wrong).toEqual([]);
  });

  test("recall: it keeps most of what is worth keeping", () => {
    const missed = worth
      .filter(({ verdict }) => verdict.worthSaving < SAVE_THRESHOLD)
      .map(({ turn }) => turn.id);
    expect(truePositives.length / worth.length).toBeGreaterThanOrEqual(0.9);
    expect(missed.length).toBeLessThanOrEqual(1);
  });

  test("kind: most kept turns are filed under the right kind", () => {
    const right = truePositives.filter(({ turn, verdict }) => verdict.kind === turn.kind);
    expect(right.length / truePositives.length).toBeGreaterThanOrEqual(0.8);
  });

  test("a kept turn always has a title and at least one durable sentence", () => {
    for (const { turn, verdict } of truePositives) {
      expect([turn.id, verdict.titleIdx !== null]).toEqual([turn.id, true]);
      expect([turn.id, verdict.durable.some((p) => p >= 0.5)]).toEqual([turn.id, true]);
    }
  });
});
