import type { Show } from "@/types/show";
import { collectStageCues } from "@/lib/stageCues";
import { applySavedSink } from "@/lib/audioOut";

export interface AudibleClip {
  cueId: string;
  url: string;
  localTimeMs: number;
  volume: number;
  playing: boolean;
  freeRunning: boolean;
}

const players = new Map<string, HTMLVideoElement>();
const silentUrls = new Set<string>();
let audioCtx: AudioContext | null = null;
let loggedPlayError = false;

function host() {
  let el = document.getElementById("wo-audio-mixer") as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = "wo-audio-mixer";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;left:8px;bottom:8px;width:48px;height:28px;overflow:hidden;opacity:0.04;pointer-events:none;z-index:1";
    document.body.appendChild(el);
  }
  return el;
}

export function collectAudibleMedia(show: Show): AudibleClip[] {
  const assets = new Map(show.assets.map((a) => [a.id, a]));
  const playing = show.timelines.some((t) => t.enabled && t.playback === "play");
  const clips: AudibleClip[] = [];
  for (const ev of collectStageCues(show)) {
    if (ev.cue.type !== "media") continue;
    const asset = ev.cue.assetId ? assets.get(ev.cue.assetId) : undefined;
    if (!asset?.url) continue;
    if (asset.kind !== "video" && asset.kind !== "audio") continue;
    const volume = Math.max(0, Math.min(1, ev.volume / 100));
    if (volume <= 0.001) continue;
    clips.push({
      cueId: ev.cue.id,
      url: asset.url,
      localTimeMs: ev.localTime,
      volume,
      playing,
      freeRunning: ev.cue.freeRunning,
    });
  }
  return clips;
}

export function unlockPlaybackAudio() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    /* ignore */
  }
  for (const el of players.values()) {
    el.muted = false;
    applySavedSink(el);
    void el.play().catch(() => undefined);
  }
}

export function syncPlaybackAudio(show: Show | null) {
  if (typeof document === "undefined") return;
  if (!show) {
    stopPlaybackAudio();
    return;
  }
  const seen = new Set<string>();
  for (const clip of collectAudibleMedia(show)) {
    seen.add(clip.cueId);
    const el = getPlayer(clip.cueId, clip.url);
    el.volume = clip.volume;
    el.muted = clip.volume <= 0.001;
    applySavedSink(el);
    syncClock(el, clip.localTimeMs, clip.playing, clip.freeRunning);
    warnIfSilent(el, clip.url, clip.playing);
  }
  for (const [id, el] of players) {
    if (seen.has(id)) continue;
    release(el);
    players.delete(id);
  }
}

export function stopPlaybackAudio() {
  for (const el of players.values()) release(el);
  players.clear();
}

function getPlayer(id: string, url: string) {
  let el = players.get(id);
  if (!el) {
    el = document.createElement("video");
    el.preload = "metadata";
    el.loop = true;
    el.autoplay = true;
    el.muted = false;
    el.playsInline = true;
    el.controls = false;
    el.setAttribute("data-role", "playback-audio");
    el.style.cssText = "width:48px;height:28px;display:block";
    host().appendChild(el);
    applySavedSink(el);
    const media = el;
    media.addEventListener("error", () => {
      note(`Audio failed to load (${media.error?.message || "media error"}). Import again or click Rebuild HQ.`, "error");
    });
    players.set(id, el);
  }
  if (el.getAttribute("data-src") !== url) {
    el.src = url;
    el.setAttribute("data-src", url);
    el.muted = false;
    void el.play().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (!loggedPlayError) {
        loggedPlayError = true;
        note(`Laptop audio blocked (${msg}). Click the Stage, then press Space.`, "warn");
      }
    });
  }
  return el;
}

function syncClock(v: HTMLVideoElement, localTimeMs: number, playing: boolean, freeRunning: boolean) {
  if (!freeRunning && v.duration && Number.isFinite(v.duration)) {
    const target = (localTimeMs / 1000) % Math.max(v.duration, 0.001);
    const drift = Math.abs(v.currentTime - target);
    if ((!playing && drift > 0.04) || drift > 0.45) v.currentTime = target;
  }
  v.muted = v.volume <= 0.001;
  if (!playing && !freeRunning) {
    if (!v.paused) v.pause();
  } else if (v.paused) {
    v.muted = false;
    void v.play().catch(() => undefined);
  }
}

function warnIfSilent(el: HTMLVideoElement, url: string, playing: boolean) {
  if (!playing || silentUrls.has(url) || el.currentTime < 0.8) return;
  const decoded = (el as HTMLVideoElement & { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount;
  if (decoded === 0) {
    silentUrls.add(url);
    note("This clip has no soundtrack in the playback file. Assets → Rebuild HQ, then play again.", "warn");
  }
}

function note(message: string, level: "info" | "warn" | "error") {
  window.__woLog?.(message, level);
}

function release(el: HTMLVideoElement) {
  el.pause();
  el.removeAttribute("src");
  el.removeAttribute("data-src");
  el.load();
  el.remove();
}
