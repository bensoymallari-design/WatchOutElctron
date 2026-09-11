import type { WindowId, WindowLayout } from "@/types/show";

export const WINDOW_META: Record<WindowId, { title: string; shortcut?: string }> = {
  stage: { title: "Stage", shortcut: "Ctrl+Alt+S" },
  properties: { title: "Properties" },
  assets: { title: "Assets", shortcut: "Ctrl+Alt+A" },
  timelines: { title: "Timelines", shortcut: "Ctrl+Alt+T" },
  timeline: { title: "Timeline" },
  devices: { title: "Devices", shortcut: "Ctrl+Alt+D" },
  nodes: { title: "Nodes" },
  variables: { title: "Variables", shortcut: "Ctrl+Alt+V" },
  cues: { title: "Cues", shortcut: "Ctrl+Alt+C" },
  cueSets: { title: "Cue Sets" },
  log: { title: "Log" },
};

export function defaultLayout(): WindowLayout[] {
  return [
    { id: "stage", x: 0.4, y: 0.4, w: 41.6, h: 51.2, open: true, z: 1 },
    { id: "properties", x: 42.4, y: 0.4, w: 21.6, h: 51.2, open: true, z: 2 },
    { id: "assets", x: 64.4, y: 0.4, w: 35.2, h: 31.4, open: true, z: 3 },
    { id: "timelines", x: 64.4, y: 32.2, w: 35.2, h: 19.4, open: true, z: 4 },
    { id: "timeline", x: 0.4, y: 52.0, w: 63.6, h: 47.5, open: true, z: 5 },
    { id: "devices", x: 64.4, y: 52.0, w: 35.2, h: 47.5, open: true, z: 6 },
    { id: "nodes", x: 18, y: 12, w: 48, h: 52, open: false, z: 20 },
    { id: "variables", x: 22, y: 16, w: 36, h: 46, open: false, z: 21 },
    { id: "cues", x: 16, y: 18, w: 62, h: 48, open: false, z: 22 },
    { id: "cueSets", x: 28, y: 20, w: 32, h: 40, open: false, z: 23 },
    { id: "log", x: 20, y: 50, w: 50, h: 32, open: false, z: 24 },
  ];
}

export function programmingLayout(): WindowLayout[] {
  return defaultLayout().map((w) => {
    if (w.id === "devices") return { ...w, open: false };
    if (w.id === "timeline") return { ...w, x: 0.4, y: 52, w: 99.2, h: 47.5 };
    if (w.id === "assets") return { ...w, x: 64.4, y: 0.4, w: 35.2, h: 51.2 };
    if (w.id === "timelines") return { ...w, open: false };
    return w;
  });
}

export function liveLayout(): WindowLayout[] {
  const base = defaultLayout().map((w) => ({ ...w, open: false, z: 1 }));
  return base.map((w) => {
    if (w.id === "stage") return { ...w, open: true, x: 0.4, y: 0.4, w: 58, h: 72, z: 2 };
    if (w.id === "timelines") return { ...w, open: true, x: 59, y: 0.4, w: 40.6, h: 36, z: 3 };
    if (w.id === "nodes") return { ...w, open: true, x: 59, y: 37, w: 40.6, h: 35.4, z: 4 };
    if (w.id === "timeline") return { ...w, open: true, x: 0.4, y: 73, w: 99.2, h: 26.4, z: 5 };
    return w;
  });
}
