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

export function snapValue(value: number, guides: number[], threshold: number) {
  let best = value;
  let dist = threshold;
  for (const g of guides) {
    const d = Math.abs(value - g);
    if (d <= dist) {
      dist = d;
      best = g;
    }
  }
  return best;
}

export function snapRect(rect: StageRect, guidesX: number[], guidesY: number[], threshold: number): StageRect {
  const left = snapValue(rect.x, guidesX, threshold);
  const right = snapValue(rect.x + rect.w, guidesX, threshold);
  const top = snapValue(rect.y, guidesY, threshold);
  const bottom = snapValue(rect.y + rect.h, guidesY, threshold);
  const dLeft = Math.abs(left - rect.x);
  const dRight = Math.abs(right - (rect.x + rect.w));
  const dTop = Math.abs(top - rect.y);
  const dBottom = Math.abs(bottom - (rect.y + rect.h));
  const x = dLeft <= dRight ? left : right - rect.w;
  const y = dTop <= dBottom ? top : bottom - rect.h;
  return { ...rect, x: Math.round(x), y: Math.round(y) };
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
