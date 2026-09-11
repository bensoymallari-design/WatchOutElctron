import type { Display } from "@/types/show";
import type { OutputScreen } from "@/lib/displayOutput";
import { emptyDisplay } from "./showFactory";

/** HDMI / extra monitors first so 4 controllers map off the laptop. */
export function outputPool(screens: OutputScreen[], includePrimary = false) {
  const extras = screens.filter((s) => !s.isPrimary);
  if (!includePrimary && extras.length) return extras;
  return screens;
}

export function screenForDisplay(display: Pick<Display, "screenId" | "channel">, screens: OutputScreen[]) {
  if (display.screenId) {
    const pinned = screens.find((s) => s.id === display.screenId);
    if (pinned) return pinned;
  }
  const pool = outputPool(screens);
  const idx = Math.max(0, (display.channel || 1) - 1);
  return pool[Math.min(idx, pool.length - 1)] ?? screens[0];
}

export function layoutDisplaysOnScreens<T extends Display>(displays: T[], screens: OutputScreen[], includePrimary = false) {
  const pool = outputPool(screens, includePrimary);
  if (!pool.length) return displays;
  let x = 0;
  const mapped = pool.map((screen, i) => {
    const prev = displays[i] ?? emptyDisplay({ name: screen.label || `Display ${i + 1}`, channel: i + 1 });
    const width = screen.physicalWidth || screen.width;
    const height = screen.physicalHeight || screen.height;
    const next: T = {
      ...prev,
      name: prev?.name || screen.label || `Display ${i + 1}`,
      x,
      y: prev?.y ?? 0,
      z: prev?.z ?? 0,
      width,
      height,
      rotation: prev?.rotation ?? 0,
      outputType: prev?.outputType ?? "GPU",
      channel: i + 1,
      nodeId: prev?.nodeId ?? "local-runner",
      enabled: prev?.enabled ?? true,
      blend: prev?.blend ?? false,
      blendWidth: prev?.blendWidth ?? 128,
      virtual: false,
      screenId: screen.id,
    } as T;
    x += width;
    return next;
  });
  return [...mapped, ...displays.slice(pool.length)];
}
