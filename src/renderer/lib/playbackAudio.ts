import type { Show } from "@/types/show";
import { collectStageCues } from "@/lib/stageCues";
import { applyAudioSink } from "@/lib/audioSink";
import { hasLiveOutputs } from "@/lib/displayOutput";

export interface AudibleClip {
  cueId: string;
  url: string;
  localTimeMs: number;
  volume: number;
  playing: boolean;
  freeRunning: boolean;
}

const players = new Map<string, HTMLVideoElement>();

function host() {
  let el = document.getElementById("wo-audio-mixer") as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = "wo-audio-mixer";
    el.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0.02;pointer-events:none;z-index:0";
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
    clips.push({
      cueId: ev.cue.id,
      url: asset.url,
      localTimeMs: ev.localTime,
      volume: Math.max(0, Math.min(1, ev.volume / 100)),
      playing,
      freeRunning: ev.cue.freeRunning,
    });
  }
  return clips;
}

export function syncPlaybackAudio(show: Show | null) {
  if (typeof document === "undefined") return;
  if (!show) {
    stopPlaybackAudio();
    return;
  }
  const outputHasSound = hasLiveOutputs();
  const seen = new Set<string>();
  for (const clip of collectAudibleMedia(show)) {
    seen.add(clip.cueId);
    const el = getPlayer(clip.cueId, clip.url);
    el.volume = clip.volume;
    el.muted = outputHasSound || clip.volume <= 0.001;
    applyAudioSink(el, false);
    syncClock(el, clip.localTimeMs, clip.playing, clip.freeRunning);
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
    el.playsInline = true;
    el.preload = "auto";
    el.loop = true;
    el.muted = false;
    el.autoplay = true;
    el.disablePictureInPicture = true;
    el.setAttribute("data-role", "playback-audio");
    el.style.cssText = "width:2px;height:2px;display:block";
    host().appendChild(el);
    const media = el;
    media.addEventListener("error", () => {
      const msg = media.error?.message || "media error";
      console.warn("WATCHOUT audio", id, msg);
    });
    players.set(id, el);
  }
  if (el.getAttribute("data-src") !== url) {
    el.src = url;
    el.setAttribute("data-src", url);
    void el.play().catch((err: unknown) => {
      console.warn("WATCHOUT audio play", err);
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
  if (!playing && !freeRunning) {
    if (!v.paused) v.pause();
  } else if (v.paused) {
    void v.play().catch(() => undefined);
  }
}

function release(el: HTMLVideoElement) {
  el.pause();
  el.removeAttribute("src");
  el.removeAttribute("data-src");
  el.load();
  el.remove();
}
