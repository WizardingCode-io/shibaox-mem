import type { Kind, MemoryDetail } from "./api";

export const when = (ms: number | null | undefined): string =>
  ms ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";

export const ago = (ms: number): string => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return when(ms);
};

/** Badge colours per kind, in Nuxt UI's palette names mapped to the brand's status colours. */
export const KIND_COLOR: Record<Kind, "info" | "success" | "warning" | "primary" | "neutral"> = {
  decision: "info",
  fix: "success",
  gotcha: "warning",
  convention: "primary",
  change: "neutral",
  discovery: "neutral",
};


export const IMPORTANCE_LABEL = ["", "Trivial", "Minor", "Useful", "Important", "Critical"];

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
