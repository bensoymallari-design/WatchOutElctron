import type { EvaluatedCue } from "@/lib/tweens";
import type { Asset, Display } from "@/types/show";
import { getLiveVideo } from "@/lib/liveSources";
import { drawProcedural } from "@/lib/procedural";

const imageCache = new Map<string, HTMLImageElement>();
const videoCache = new Map<string, HTMLVideoElement>();
const procCache = new Map<string, HTMLCanvasElement>();

export function getImage(url: string) {
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = url;
    imageCache.set(url, img);
  }
  return img;
}

export function getVideo(
  id: string,
  url: string,
  localTimeMs?: number,
  playing = true,
  freeRunning = false,
) {
  let v = videoCache.get(id);
  if (!v) {
    v = document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    v.src = url;
    videoCache.set(id, v);
  } else if (v.getAttribute("src") !== url && !v.srcObject) {
    v.src = url;
  }
  if (!freeRunning && localTimeMs != null && v.duration && Number.isFinite(v.duration)) {
    const target = (localTimeMs / 1000) % Math.max(v.duration, 0.001);
    const drift = Math.abs(v.currentTime - target);
    if ((!playing && drift > 0.04) || drift > 0.45) v.currentTime = target;
  }
  if (!playing && !freeRunning) {
    if (!v.paused) v.pause();
  } else if (v.paused) {
    void v.play().catch(() => undefined);
  }
  return v;
}

function procCanvas(kind: string, timeMs: number) {
  const key = kind;
  let c = procCache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = 1920;
    c.height = 1080;
    procCache.set(key, c);
  }
  const ctx = c.getContext("2d");
  if (ctx) drawProcedural(ctx, kind, c.width, c.height, timeMs);
  return c;
}

function sourceFor(
  asset: Asset | undefined,
  cueId: string,
  timeMs: number,
  localTimeMs: number,
  playing: boolean,
  freeRunning: boolean,
): CanvasImageSource | null {
  if (!asset) return null;
  const live = getLiveVideo(asset.id);
  if (live && live.readyState >= 2) return live;
  if (asset.kind === "ndi" || asset.kind === "capture") {
    return procCanvas("ndi", timeMs);
  }
  if (asset.url.startsWith("procedural:")) {
    return procCanvas(asset.url.slice("procedural:".length), timeMs);
  }
  if (asset.kind === "video" && asset.url) {
    const v = getVideo(asset.id || cueId, asset.url, localTimeMs, playing, freeRunning);
    if (v.readyState >= 2) return v;
    return null;
  }
  if (asset.url) {
    const img = getImage(asset.url);
    if (img.complete && img.naturalWidth > 0) return img;
  }
  return null;
}

export interface StageCamera {
  x: number;
  y: number;
  zoom: number;
}

export function cameraForDisplay(
  display: Display,
  cssW: number,
  cssH: number,
): StageCamera {
  const zoom = Math.min(cssW / Math.max(1, display.width), cssH / Math.max(1, display.height));
  return {
    x: display.x + display.width / 2,
    y: display.y + display.height / 2,
    zoom,
  };
}

export function drawStage(options: {
  canvas: HTMLCanvasElement;
  displays: Display[];
  cues: EvaluatedCue[];
  assets: Asset[];
  camera: StageCamera;
  selectedIds: string[];
  timeMs: number;
  showGrid: boolean;
  highlightDisplayId?: string | null;
  clipDisplay?: Display | null;
  snapGuides?: { x: number[]; y: number[] };
  pixelPerfect?: boolean;
  playing?: boolean;
}) {
  const {
    canvas,
    displays,
    cues,
    assets,
    camera,
    selectedIds,
    timeMs,
    showGrid,
    highlightDisplayId,
    clipDisplay,
    snapGuides,
    pixelPerfect,
    playing = true,
  } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = pixelPerfect ? 1 : window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = clipDisplay ? "#000000" : "#121212";
  ctx.fillRect(0, 0, cssW, cssH);

  ctx.save();
  ctx.translate(cssW / 2, cssH / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  if (clipDisplay) {
    ctx.beginPath();
    ctx.rect(clipDisplay.x, clipDisplay.y, clipDisplay.width, clipDisplay.height);
    ctx.clip();
    ctx.imageSmoothingEnabled = !(pixelPerfect && Math.abs(camera.zoom - 1) < 0.001);
  }

  if (showGrid) {
    const span = 20000;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1 / camera.zoom;
    const step = 200;
    for (let x = -span; x <= span; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, -span);
      ctx.lineTo(x, span);
      ctx.stroke();
    }
    for (let y = -span; y <= span; y += step) {
      ctx.beginPath();
      ctx.moveTo(-span, y);
      ctx.lineTo(span, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(245,158,11,0.55)";
    ctx.beginPath();
    ctx.moveTo(-span, 0);
    ctx.lineTo(span, 0);
    ctx.moveTo(0, -span);
    ctx.lineTo(0, span);
    ctx.stroke();
  }

  const assetById = new Map(assets.map((a) => [a.id, a]));

  for (const ev of cues) {
    const cue = ev.cue;
    if (cue.type !== "media") continue;
    const asset = cue.assetId ? assetById.get(cue.assetId) : undefined;
    const src = sourceFor(asset, cue.id, timeMs, ev.localTime, playing, cue.freeRunning);
    const aw = asset?.width || 1920;
    const ah = asset?.height || 1080;
    const w = aw * (ev.scaleX / 100);
    const h = ah * (ev.scaleY / 100);
    ctx.save();
    const previewAlpha = Math.max(0, Math.min(1, ev.opacity / 100));
    ctx.globalAlpha = selectedIds.includes(cue.id) ? Math.max(0.28, previewAlpha) : previewAlpha;
    ctx.translate(ev.x + w * cue.anchor.x, ev.y + h * cue.anchor.y);
    ctx.rotate((ev.rotZ * Math.PI) / 180);
    ctx.translate(-w * cue.anchor.x, -h * cue.anchor.y);

    const cropL = (ev.crop.left / 100) * w;
    const cropT = (ev.crop.top / 100) * h;
    const cropR = (ev.crop.right / 100) * w;
    const cropB = (ev.crop.bottom / 100) * h;
    ctx.beginPath();
    ctx.rect(cropL, cropT, w - cropL - cropR, h - cropT - cropB);
    ctx.clip();

    if (ev.wipe < 100) {
      ctx.beginPath();
      ctx.rect(0, 0, w * (ev.wipe / 100), h);
      ctx.clip();
    }

    const filter = [
      ev.blur > 0.6 ? `blur(${ev.blur}px)` : "",
      ev.brightness !== 0 ? `brightness(${1 + ev.brightness / 100})` : "",
      ev.contrast !== 0 ? `contrast(${1 + ev.contrast / 100})` : "",
      ev.saturation !== 100 ? `saturate(${ev.saturation / 100})` : "",
      ev.hue !== 0 ? `hue-rotate(${ev.hue}deg)` : "",
    ]
      .filter(Boolean)
      .join(" ");
    ctx.filter = filter || "none";

    if (src) {
      ctx.drawImage(src, 0, 0, w, h);
    } else if (!clipDisplay) {
      ctx.fillStyle = cue.color;
      ctx.globalAlpha *= 0.45;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, Math.min(1, ev.opacity / 100));
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.max(18, w / 18)}px ui-sans-serif`;
      ctx.fillText(cue.name, 24, Math.min(h, 64));
    }
    ctx.filter = "none";

    if (selectedIds.includes(cue.id)) {
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2 / camera.zoom;
      ctx.strokeRect(0, 0, w, h);
    }
    ctx.restore();
  }

  if (snapGuides) {
    ctx.save();
    ctx.strokeStyle = "rgba(245,158,11,0.65)";
    ctx.lineWidth = 1 / camera.zoom;
    ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
    for (const x of snapGuides.x) {
      ctx.beginPath();
      ctx.moveTo(x, camera.y - 20000);
      ctx.lineTo(x, camera.y + 20000);
      ctx.stroke();
    }
    for (const y of snapGuides.y) {
      ctx.beginPath();
      ctx.moveTo(camera.x - 20000, y);
      ctx.lineTo(camera.x + 20000, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (!clipDisplay) {
    for (const d of displays) {
      if (!d.enabled) continue;
      ctx.save();
      ctx.translate(d.x + d.width / 2, d.y + d.height / 2);
      ctx.rotate((d.rotation * Math.PI) / 180);
      ctx.translate(-d.width / 2, -d.height / 2);
      if (highlightDisplayId === d.id) {
        ctx.fillStyle = "rgba(245,158,11,0.16)";
        ctx.fillRect(0, 0, d.width, d.height);
      }
      ctx.strokeStyle = selectedIds.includes(d.id) || highlightDisplayId === d.id ? "#f59e0b" : d.virtual ? "#38bdf8" : "#e7e5e4";
      ctx.lineWidth = (selectedIds.includes(d.id) ? 3 : 1.5) / camera.zoom;
      ctx.strokeRect(0, 0, d.width, d.height);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      const labelH = 28 / camera.zoom;
      ctx.fillRect(0, 0, d.width, Math.min(d.height, 32 / camera.zoom + 8));
      ctx.fillStyle = "#fafafa";
      ctx.font = `${16 / camera.zoom}px ui-sans-serif, system-ui`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(
        `${d.name}  ${d.width}×${d.height}  ${d.outputType}:${d.channel}`,
        8 / camera.zoom,
        6 / camera.zoom,
      );
      if (d.blend) {
        ctx.fillStyle = "rgba(245,158,11,0.12)";
        ctx.fillRect(0, 0, d.blendWidth, d.height);
        ctx.fillRect(d.width - d.blendWidth, 0, d.blendWidth, d.height);
      }
      void labelH;
      ctx.restore();
    }
  }

  ctx.restore();
}

export function screenToStage(
  canvas: HTMLCanvasElement,
  camera: StageCamera,
  clientX: number,
  clientY: number,
) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return {
    x: (x - canvas.clientWidth / 2) / camera.zoom + camera.x,
    y: (y - canvas.clientHeight / 2) / camera.zoom + camera.y,
  };
}
