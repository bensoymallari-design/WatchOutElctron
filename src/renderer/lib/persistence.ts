import type { Show } from "@/types/show";

const SHOW_KEY = "watchin.show";
const RECENTS_KEY = "watchin.recents";
const LAYOUTS_KEY = "watchin.layouts";

export interface RecentShow {
  id: string;
  name: string;
  savedAt: string;
  path?: string;
}

export function saveShowLocal(show: Show) {
  const payload = JSON.stringify(show);
  localStorage.setItem(SHOW_KEY, payload);
  const recents: RecentShow[] = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
  const next = [{ id: show.id, name: show.name, savedAt: new Date().toISOString() }, ...recents.filter((r) => r.id !== show.id)].slice(0, 8);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

export function loadShowLocal(): Show | null {
  try {
    const raw = localStorage.getItem(SHOW_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Show;
  } catch {
    return null;
  }
}

export function loadRecents(): RecentShow[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function downloadShow(show: Show) {
  const blob = new Blob([JSON.stringify(show, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${show.name.replace(/\s+/g, "_")}.watch.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function saveLayouts(presets: Record<string, unknown>) {
  localStorage.setItem(LAYOUTS_KEY, JSON.stringify(presets));
}

export function loadLayouts<T>(fallback: T): T {
  try {
    const raw = localStorage.getItem(LAYOUTS_KEY);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
