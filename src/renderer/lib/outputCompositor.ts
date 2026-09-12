import type { Asset, Show } from "@/types/show";
import { collectStageCues } from "@/lib/stageCues";
import { getLiveVideo } from "@/lib/liveSources";
import { drawProcedural } from "@/lib/procedural";
import { applyAudioSink } from "@/lib/audioSink";
import { videoPreload } from "../../shared/mediaPolicy";

interface LayerEls {
  wrap: HTMLDivElement;
  media: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;
}

const layers = new Map<string, LayerEls>();

function ensureRoot(host: HTMLElement) {
  let clip = host.querySelector("#wo-out-clip") as HTMLDivElement | null;
  if (!clip) {
    host.replaceChildren();
    host.style.cssText = "position:fixed;inset:0;background:#000;overflow:hidden;margin:0";
    clip = document.createElement("div");
    clip.id = "wo-out-clip";
    clip.style.cssText = "position:absolute;overflow:hidden;background:#000;will-change:transform";
    host.appendChild(clip);
  }
  return clip;
}

export function syncOutputFrame(host: HTMLElement, show: Show, displayId: string, playAudio = false) {
  const display = show.displays.find((d) => d.id === displayId) ?? show.displays[0];
  if (!display) return;
  const clip = ensureRoot(host);
  const vw = host.clientWidth || window.innerWidth;
  const vh = host.clientHeight || window.innerHeight;
  const scale = Math.min(vw / Math.max(1, display.width), vh / Math.max(1, display.height));
  const dw = display.width * scale;
  const dh = display.height * scale;
  clip.style.left = `${(vw - dw) / 2}px`;
  clip.style.top = `${(vh - dh) / 2}px`;
  clip.style.width = `${dw}px`;
  clip.style.height = `${dh}px`;

  const playing = show.timelines.some((t) => t.playback === "play");
  const cues = collectStageCues(show);
  const assets = new Map(show.assets.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const now = performance.now();

  for (const ev of cues) {
    const cue = ev.cue;
    if (cue.type !== "media") continue;
    const asset = cue.assetId ? assets.get(cue.assetId) : undefined;
    if (asset?.kind === "audio") {
      if (!playAudio) continue;
      seen.add(cue.id);
      let layer = layers.get(cue.id);
      if (!layer) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "position:absolute;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0.02;pointer-events:none";
        const media = makeMedia(asset, cue.id, true);
        wrap.appendChild(media);
        clip.appendChild(wrap);
        layer = { wrap, media };
        layers.set(cue.id, layer);
      }
      if (layer.media instanceof HTMLVideoElement) {
        if (asset.url && layer.media.getAttribute("data-src") !== asset.url) {
          layer.media.src = asset.url;
          layer.media.setAttribute("data-src", asset.url);
        }
        const vol = Math.max(0, Math.min(1, ev.volume / 100));
        layer.media.muted = vol <= 0.001;
        layer.media.volume = vol;
        applyAudioSink(layer.media, true);
        syncVideo(layer.media, ev.localTime, playing, cue.freeRunning);
      }
      continue;
    }

    const aw = asset?.width || 1920;
    const ah = asset?.height || 1080;
    const w = aw * (ev.scaleX / 100) * scale;
    const h = ah * (ev.scaleY / 100) * scale;
    const x = (ev.x - display.x) * scale;
    const y = (ev.y - display.y) * scale;
    if (x + w < -8 || y + h < -8 || x > dw + 8 || y > dh + 8) continue;
    if (ev.opacity < 0.4) continue;

    seen.add(cue.id);
    let layer = layers.get(cue.id);
    if (!layer) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "position:absolute;overflow:hidden;pointer-events:none;transform-origin:center center";
      const media = makeMedia(asset, cue.id, playAudio);
      wrap.appendChild(media);
      clip.appendChild(wrap);
      layer = { wrap, media };
      layers.set(cue.id, layer);
    }
    const { wrap, media } = layer;
    wrap.style.left = `${x}px`;
    wrap.style.top = `${y}px`;
    wrap.style.width = `${Math.max(1, w)}px`;
    wrap.style.height = `${Math.max(1, h)}px`;
    wrap.style.opacity = String(Math.max(0, Math.min(1, ev.opacity / 100)));
    wrap.style.zIndex = String(Math.round(ev.z + 1000));
    wrap.style.transform = ev.rotZ ? `rotate(${ev.rotZ}deg)` : "none";
    wrap.style.filter = cssFilter(ev);
    wrap.style.willChange = "transform, opacity";
    media.style.width = "100%";
    media.style.height = "100%";
    media.style.objectFit = "fill";
    media.style.display = "block";
    if (media instanceof HTMLVideoElement) {
      media.style.transform = "translateZ(0)";
    }

    if (media instanceof HTMLVideoElement) {
      const live = asset ? getLiveVideo(asset.id) : null;
      if (live) {
        if (media.srcObject !== live.srcObject) {
          media.srcObject = live.srcObject;
          void media.play().catch(() => undefined);
        }
      } else if (asset?.url && media.getAttribute("data-src") !== asset.url) {
        media.srcObject = null;
        media.src = asset.url;
        media.setAttribute("data-src", asset.url);
        void media.play().catch(() => undefined);
      }
      syncVideo(media, ev.localTime, playing, cue.freeRunning);
      const vol = Math.max(0, Math.min(1, ev.volume / 100));
      if (playAudio) {
        media.muted = vol <= 0.001;
        media.volume = vol;
        applyAudioSink(media, true);
      } else {
        media.muted = true;
      }
    } else if (media instanceof HTMLCanvasElement && asset) {
      const kind = asset.url.startsWith("procedural:") ? asset.url.slice("procedural:".length) : "ndi";
      const ctx = media.getContext("2d");
      if (ctx) {
        if (media.width !== 1280) {
          media.width = 1280;
          media.height = 720;
        }
        const live = getLiveVideo(asset.id);
        if (live && live.readyState >= 2) ctx.drawImage(live, 0, 0, media.width, media.height);
        else drawProcedural(ctx, kind, media.width, media.height, now);
      }
    } else if (media instanceof HTMLImageElement && asset?.url && media.src !== asset.url) {
      media.src = asset.url;
    }
  }

  for (const [id, layer] of layers) {
    if (seen.has(id)) continue;
    if (layer.media instanceof HTMLVideoElement) {
      layer.media.pause();
      layer.media.removeAttribute("src");
      layer.media.srcObject = null;
      layer.media.load();
    }
    layer.wrap.remove();
    layers.delete(id);
  }
}

function makeMedia(asset: Asset | undefined, cueId: string, playAudio: boolean) {
  if (asset?.kind === "video" || asset?.kind === "audio") {
    const v = document.createElement("video");
    v.muted = !playAudio;
    v.playsInline = true;
    v.loop = true;
    v.preload = videoPreload(asset.bytes);
    v.autoplay = true;
    v.disablePictureInPicture = true;
    v.setAttribute("data-cue", cueId);
    if (asset.posterUrl) v.poster = asset.posterUrl;
    if (asset.url) {
      v.src = asset.url;
      v.setAttribute("data-src", asset.url);
    }
    v.addEventListener("error", () => {
      v.style.background = "#000";
    });
    void v.play().catch(() => undefined);
    return v;
  }
  if (asset?.kind === "ndi" || asset?.kind === "capture" || asset?.url?.startsWith("procedural:")) {
    return document.createElement("canvas");
  }
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  if (asset?.url) img.src = asset.url;
  return img;
}

function syncVideo(v: HTMLVideoElement, localTimeMs: number, playing: boolean, freeRunning: boolean) {
  if (!freeRunning && v.duration && Number.isFinite(v.duration)) {
    const target = (localTimeMs / 1000) % Math.max(v.duration, 0.001);
    const drift = Math.abs(v.currentTime - target);
    if (drift > 0.4) v.currentTime = target;
  }
  if (!playing && !freeRunning) {
    if (!v.paused) v.pause();
  } else if (v.paused) {
    void v.play().catch(() => undefined);
  }
}

function cssFilter(ev: { blur: number; brightness: number; contrast: number; saturation: number; hue: number }) {
  const parts = [
    ev.blur > 0.8 ? `blur(${Math.min(ev.blur, 12)}px)` : "",
    ev.brightness !== 0 ? `brightness(${1 + ev.brightness / 100})` : "",
    ev.contrast !== 0 ? `contrast(${1 + ev.contrast / 100})` : "",
    ev.saturation !== 100 ? `saturate(${ev.saturation / 100})` : "",
    ev.hue !== 0 ? `hue-rotate(${ev.hue}deg)` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : "none";
}
