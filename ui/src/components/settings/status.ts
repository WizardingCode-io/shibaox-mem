import type { Check } from "../../api";

/** A check's state as a status pill: a word, and a dot whose shape carries it too. */
export const CHECK_STATUS: Record<Check["status"], { label: string; bg: string; fg: string; shape: string }> = {
  ok: { label: "OK", bg: "var(--ok-soft)", fg: "var(--ok)", shape: "" },
  warn: { label: "Warning", bg: "var(--warn-soft)", fg: "var(--warn)", shape: "square" },
  fail: { label: "Failing", bg: "var(--danger-soft)", fg: "var(--danger)", shape: "diamond" },
  skip: { label: "Skipped", bg: "var(--paper-sunken)", fg: "var(--ink-muted)", shape: "" },
};
