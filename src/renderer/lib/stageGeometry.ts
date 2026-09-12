import type { Asset, Cue, Display } from "@/types/show";
import type { EvaluatedCue } from "@/lib/tweens";

export interface StageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function displayRect(d: Display): StageRect {
  return { x: d.x, y: d.y, w: d.width, h: d.height };
}

export function cueRect(ev: Pick<EvaluatedCue, "x" | "y" | "scaleX" | "scaleY">, asset?: Pick<Asset, "width" | "height"> | null): StageRect {
  const aw = asset?.width || 1920;
  const ah = asset?.height || 1080;
  return { x: ev.x, y: ev.y, w: aw * (ev.scaleX / 100), h: ah * (ev.scaleY / 100) };
}

export function pointInRect(pt: { x: number; y: number }, r: StageRect) {
  return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
}

export function hitDisplay(displays: Display[], pt: { x: number; y: number }) {
  return [...displays].reverse().find((d) => d.enabled && pointInRect(pt, displayRect(d)));
}

export function hitCue(
  cues: EvaluatedCue[],
  assets: Asset[],
  pt: { x: number; y: number },
) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  for (let i = cues.length - 1; i >= 0; i--) {
    const ev = cues[i];
    if (ev.cue.type !== "media") continue;
    const asset = ev.cue.assetId ? byId.get(ev.cue.assetId) : undefined;
    if (pointInRect(pt, cueRect(ev, asset))) return ev;
  }
  return undefined;
}

export function wallRect(displays: Display[]): StageRect | null {
  const live = displays.filter((d) => d.enabled);
  if (!live.length) return null;
  const x = Math.min(...live.map((d) => d.x));
  const y = Math.min(...live.map((d) => d.y));
  const right = Math.max(...live.map((d) => d.x + d.width));
  const bottom = Math.max(...live.map((d) => d.y + d.height));
  return { x, y, w: right - x, h: bottom - y };
}

export function wallAsBox(displays: Display[]) {
  const wall = wallRect(displays);
  if (!wall) return null;
  return { x: wall.x, y: wall.y, width: wall.w, height: wall.h };
}

export type FitMode = "cover" | "contain";

export function fitTransform(
  asset: Pick<Asset, "width" | "height">,
  display: Pick<Display, "x" | "y" | "width" | "height">,
  mode: FitMode = "cover",
) {
  const aw = Math.max(1, asset.width || 1920);
  const ah = Math.max(1, asset.height || 1080);
  if (mode === "contain") {
    const factor = Math.min(display.width / aw, display.height / ah);
    const w = aw * factor;
    const h = ah * factor;
    return {
      position: {
        x: Math.round(display.x + (display.width - w) / 2),
        y: Math.round(display.y + (display.height - h) / 2),
        z: 0,
      },
      scale: {
        x: roundHundredths((w / aw) * 100),
        y: roundHundredths((h / ah) * 100),
      },
    };
  }
  return {
    position: { x: Math.round(display.x), y: Math.round(display.y), z: 0 },
    scale: {
      x: roundHundredths((display.width / aw) * 100),
      y: roundHundredths((display.height / ah) * 100),
    },
  };
}

function roundHundredths(n: number) {
  return Math.round(n * 100) / 100;
}

export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export function handleHitPad(zoom: number) {
  return Math.max(14, 18 / Math.max(0.04, zoom));
}

export function resizeCursor(handle: ResizeHandle) {
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  return "nwse-resize";
}

export function hitResizeHandle(rect: StageRect, pt: { x: number; y: number }, zoom: number): ResizeHandle | undefined {
  const pad = handleHitPad(zoom);
  const { x, y, w, h } = rect;
  const nearL = Math.abs(pt.x - x) <= pad;
  const nearR = Math.abs(pt.x - (x + w)) <= pad;
  const nearT = Math.abs(pt.y - y) <= pad;
  const nearB = Math.abs(pt.y - (y + h)) <= pad;
  const inX = pt.x >= x - pad && pt.x <= x + w + pad;
  const inY = pt.y >= y - pad && pt.y <= y + h + pad;
  if (!inX || !inY) return undefined;
  if (nearT && nearL) return "nw";
  if (nearT && nearR) return "ne";
  if (nearB && nearL) return "sw";
  if (nearB && nearR) return "se";
  if (nearT) return "n";
  if (nearB) return "s";
  if (nearL) return "w";
  if (nearR) return "e";
  return undefined;
}

export function resizeRect(start: StageRect, handle: ResizeHandle, dx: number, dy: number, keepAspect = false): StageRect {
  let x = start.x;
  let y = start.y;
  let w = start.w;
  let h = start.h;
  if (handle.includes("e")) w = start.w + dx;
  if (handle.includes("s")) h = start.h + dy;
  if (handle.includes("w")) {
    x = start.x + dx;
    w = start.w - dx;
  }
  if (handle.includes("n")) {
    y = start.y + dy;
    h = start.h - dy;
  }
  if (keepAspect && start.h > 0) {
    const aspect = start.w / start.h;
    const corner = handle.length === 2;
    if (corner) {
      if (Math.abs(dx) * start.h >= Math.abs(dy) * start.w) h = w / aspect;
      else w = h * aspect;
      if (handle.includes("w")) x = start.x + start.w - w;
      if (handle.includes("n")) y = start.y + start.h - h;
    } else if (handle === "e" || handle === "w") {
      h = w / aspect;
      y = start.y + (start.h - h) / 2;
      if (handle === "w") x = start.x + start.w - w;
    } else {
      w = h * aspect;
      x = start.x + (start.w - w) / 2;
      if (handle === "n") y = start.y + start.h - h;
    }
  }
  const min = 32;
  if (w < min) {
    if (handle.includes("w")) x = start.x + start.w - min;
    w = min;
  }
  if (h < min) {
    if (handle.includes("n")) y = start.y + start.h - min;
    h = min;
  }
  return { x, y, w, h };
}

export function snapResizeRect(rect: StageRect, handle: ResizeHandle, guidesX: number[], guidesY: number[], threshold: number): StageRect {
  let { x, y, w, h } = rect;
  if (handle.includes("w")) {
    const next = snapValue(x, guidesX, threshold);
    w += x - next;
    x = next;
  }
  if (handle.includes("e")) w = snapValue(x + w, guidesX, threshold) - x;
  if (handle.includes("n")) {
    const next = snapValue(y, guidesY, threshold);
    h += y - next;
    y = next;
  }
  if (handle.includes("s")) h = snapValue(y + h, guidesY, threshold) - y;
  const min = 32;
  if (w < min) {
    if (handle.includes("w")) x -= min - w;
    w = min;
  }
  if (h < min) {
    if (handle.includes("n")) y -= min - h;
    h = min;
  }
  return { x, y, w, h };
}

export function rectToCueTransform(rect: StageRect, asset: Pick<Asset, "width" | "height">) {
  const aw = Math.max(1, asset.width || 1920);
  const ah = Math.max(1, asset.height || 1080);
  return {
    position: { x: Math.round(rect.x), y: Math.round(rect.y), z: 0 },
    scale: {
      x: roundHundredths((rect.w / aw) * 100),
      y: roundHundredths((rect.h / ah) * 100),
    },
  };
}

export function nearestGuide(value: number, guides: number[], threshold: number) {
  let best: number | undefined;
  let dist = threshold;
  for (const g of guides) {
    const d = Math.abs(value - g);
    if (d <= dist) {
      dist = d;
      best = g;
    }
  }
  return best === undefined ? undefined : { value: best, dist };
}

export function snapValue(value: number, guides: number[], threshold: number) {
  return nearestGuide(value, guides, threshold)?.value ?? value;
}

export function snapRect(rect: StageRect, guidesX: number[], guidesY: number[], threshold: number): StageRect {
  const x = snapAxis(rect.x, rect.w, guidesX, threshold);
  const y = snapAxis(rect.y, rect.h, guidesY, threshold);
  return { ...rect, x: Math.round(x), y: Math.round(y) };
}

function snapAxis(pos: number, size: number, guides: number[], threshold: number) {
  const start = nearestGuide(pos, guides, threshold);
  const end = nearestGuide(pos + size, guides, threshold);
  if (start && end) return start.dist <= end.dist ? start.value : end.value - size;
  if (start) return start.value;
  if (end) return end.value - size;
  return pos;
}

export function displayGuides(displays: Display[]) {
  const x: number[] = [];
  const y: number[] = [];
  for (const d of displays) {
    if (!d.enabled) continue;
    x.push(d.x, d.x + d.width);
    y.push(d.y, d.y + d.height);
  }
  return { x, y };
}

/** Edges, centers, and stage origin — used when dragging a display. */
export function displayMoveGuides(displays: Display[], skipId?: string) {
  const others = displays.filter((d) => d.enabled && d.id !== skipId);
  const x = [0];
  const y = [0];
  for (const d of others) {
    x.push(d.x, d.x + d.width, d.x + d.width / 2);
    y.push(d.y, d.y + d.height, d.y + d.height / 2);
  }
  return { x, y };
}

export function cueGuides(rects: StageRect[], skip?: StageRect) {
  const x: number[] = [];
  const y: number[] = [];
  for (const r of rects) {
    if (skip && r.x === skip.x && r.y === skip.y && r.w === skip.w && r.h === skip.h) continue;
    x.push(r.x, r.x + r.w);
    y.push(r.y, r.y + r.h);
  }
  return { x, y };
}

export function snapThreshold(zoom: number) {
  return Math.max(6, 10 / Math.max(0.05, zoom));
}

export function displayForCue(displays: Display[], cue: Pick<Cue, "position">) {
  return (
    displays.find(
      (d) =>
        d.enabled &&
        cue.position.x >= d.x &&
        cue.position.x < d.x + d.width &&
        cue.position.y >= d.y &&
        cue.position.y < d.y + d.height,
    ) ?? displays.find((d) => d.enabled) ?? displays[0]
  );
}
