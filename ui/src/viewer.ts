// The viewer's state, shared by every component: one project, one list, one selection.
import { useDark } from "@vueuse/core";
import { computed, reactive } from "vue";
import { api, type Kind, type MemoryDetail, type MemoryItem, type Project, type TurnItem } from "./api";

export type Tab = "memories" | "turns" | "overview";
export type Status = "active" | "archived" | "superseded" | "all";

export const PAGE = 50;

const state = reactive({
  version: "",
  dataDir: "",
  projects: [] as Project[],
  projectId: null as number | null,
  tab: "memories" as Tab,
  q: "",
  kind: null as Kind | null,
  status: "active" as Status,
  minImportance: 1,
  items: [] as MemoryItem[],
  total: 0,
  turns: [] as TurnItem[],
  selected: null as number | null,
  detail: null as MemoryDetail | null,
  loading: false,
});

export const project = computed(() => state.projects.find((p) => p.id === state.projectId) ?? null);

export async function loadOverview(): Promise<void> {
  const overview = await api.overview();
  state.version = overview.version;
  state.dataDir = overview.dataDir;
  state.projects = overview.projects;
  if (state.projectId === null && overview.projects.length > 0) {
    await selectProject(overview.projects[0]!.id);
  }
}

export async function selectProject(id: number): Promise<void> {
  if (state.projectId !== id) {
    state.projectId = id;
    closeDetail();
  }
  await reload();
}

export async function reload(): Promise<void> {
  if (state.projectId === null) return;
  if (state.tab === "memories") await loadList();
  else if (state.tab === "turns") state.turns = await api.turns(state.projectId);
}

export async function loadList(offset = 0): Promise<void> {
  if (state.projectId === null) return;
  state.loading = true;
  try {
    const params: Record<string, string | number> = {
      project: state.projectId,
      status: state.status,
      minImportance: state.minImportance,
      limit: PAGE,
      offset,
    };
    if (state.q) params.q = state.q;
    if (state.kind) params.kind = state.kind;
    const page = await api.memories(params);
    state.items = offset ? state.items.concat(page.items) : page.items;
    state.total = page.total;
  } finally {
    state.loading = false;
  }
}

export async function select(id: number): Promise<void> {
  state.selected = id;
  state.detail = await api.memory(id);
  history.replaceState(null, "", `#m${id}`);
}

export function closeDetail(): void {
  state.selected = null;
  state.detail = null;
  history.replaceState(null, "", "#");
}

/** After a change to a memory: counts, list and detail again, without losing the place. */
export async function refreshAfterChange(id: number | null = state.selected): Promise<void> {
  const overview = await api.overview();
  state.projects = overview.projects;
  await reload();
  if (id !== null) await select(id);
}

export function move(delta: 1 | -1): void {
  if (state.items.length === 0) return;
  const i = state.items.findIndex((m) => m.id === state.selected);
  const next = state.items[Math.min(state.items.length - 1, Math.max(0, i + delta))];
  if (next) void select(next.id);
}

// The theme: Nuxt UI's own colour mode (a `dark` class on <html>, remembered by the
// browser, the system's by default), pinned by ?theme= when the page is opened that way.
const isDark = useDark();
const pinned = new URLSearchParams(location.search).get("theme");
if (pinned === "light" || pinned === "dark") isDark.value = pinned === "dark";
export const theme = computed<"light" | "dark">({
  get: () => (isDark.value ? "dark" : "light"),
  set: (t) => {
    isDark.value = t === "dark";
  },
});
export { state };
