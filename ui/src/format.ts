import type { Kind, MemoryDetail } from "./api";

export const when = (ms: number | null | undefined): string =>
  ms ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";

/** A short date for dense rows: "Thu 1 Oct", with the year only when it is not this one. */
export const day = (ms: number): string => {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
};

export const ago = (ms: number): string => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return when(ms);
};


export const IMPORTANCE_LABEL = ["", "Trivial", "Minor", "Useful", "Important", "Critical"];

/** A pill's colours: the soft fill and the text, as the brand's status pills pair them. */
export interface Tone {
  bg: string;
  fg: string;
}
const tone = (bg: string, fg: string): Tone => ({ bg: `var(--${bg})`, fg: `var(--${fg})` });

/** Each kind of memory as a pill, like Sales OS's pipeline stages. */
export const KIND_TONE: Record<Kind, Tone> = {
  decision: tone("blue-soft", "blue-text"),
  fix: tone("ok-soft", "ok"),
  gotcha: tone("warn-soft", "warn"),
  convention: tone("violet-soft", "violet-text"),
  change: tone("paper-sunken", "ink-muted"),
  discovery: tone("magenta-soft", "magenta-text"),
};

/** A turn's state as a pill. */
export const TURN_TONE: Record<string, Tone> = {
  done: tone("ok-soft", "ok"),
  failed: tone("danger-soft", "danger"),
  open: tone("blue-soft", "blue-text"),
  processing: tone("violet-soft", "violet-text"),
  pending: tone("warn-soft", "warn"),
  skipped: tone("paper-sunken", "ink-muted"),
};

/** Importance reads like a priority flag: colour and word. */
export const IMPORTANCE_COLOR = ["", "var(--line-strong)", "var(--line-strong)", "var(--blue-text)", "var(--warn)", "var(--danger)"];

/** A memory as a line of the notes the agent is shown. */
export function asNote(m: MemoryDetail): string {
  const files = m.files.length ? ` · ${m.files.join(", ")}` : "";
  const body = m.body ? `\n  ${m.body.split("\n").join("\n  ")}` : "";
  return `- #${m.id} [${m.kind} · ${new Date(m.createdAt).toISOString().slice(0, 10)}${files}] ${m.title}${body}`;
}

export const shortPath = (path: string): string => {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return (parts.length > 2 ? "…/" : "/") + parts.slice(-2).join("/");
};
