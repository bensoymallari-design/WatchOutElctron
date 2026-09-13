import { isPaintReady } from "./liveReady";
import { copyPixelBytes } from "../../shared/ndiFrame";

const listeners = new Set<() => void>();

export type LiveKind = "camera" | "screen" | "url" | "phone" | "ndi";

export interface NdiFramePayload {
  assetId: string;
  jpeg?: Uint8Array | ArrayBuffer | { type?: string; data?: number[] } | string;
  rgba?: Uint8Array | ArrayBuffer | { type?: string; data?: number[] } | string;
  width: number;
  height: number;
  sourceName: string;
}

interface LiveEntry {
  video?: HTMLVideoElement;
  canvas?: HTMLCanvasElement;
  stream?: MediaStream;
  kind: LiveKind;
  ready: boolean;
}

const lives = new Map<string, LiveEntry>();
let ndiSinkStarted = false;
let loggedPaint = false;
let loggedDrop = false;

export function subscribeLive(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit() {
  listeners.forEach((fn) => fn());
}

export function getLiveVideo(assetId: string): CanvasImageSource | null {
  const entry = lives.get(assetId);
  if (!entry) return null;
  if (entry.canvas && entry.ready) return entry.canvas;
  return entry.video ?? entry.canvas ?? null;
}

export function getLiveKind(assetId: string): LiveKind | null {
  return lives.get(assetId)?.kind ?? null;
}

export function isLiveConnected(assetId: string) {
  const entry = lives.get(assetId);
  if (!entry) return false;
  if (entry.kind === "ndi") return true;
  return isPaintReady(entry.video);
}

export function isLiveReady(assetId: string) {
  const entry = lives.get(assetId);
  if (!entry) return false;
  if (entry.canvas) return !!entry.ready;
  return isPaintReady(entry.video);
}

function makeVideo() {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.loop = true;
  return video;
}

function attachStream(assetId: string, stream: MediaStream, kind: LiveKind) {
  disconnectLive(assetId);
  const video = makeVideo();
  video.srcObject = stream;
  const play = () => void video.play().catch(() => undefined);
  video.onloadedmetadata = play;
  play();
  lives.set(assetId, { video, stream, kind, ready: true });
  emit();
  return video;
}

export async function listVideoInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return [] as { deviceId: string; label: string }[];
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    probe.getTracks().forEach((track) => track.stop());
  } catch {
    /* permission denied or no camera — labels may stay empty */
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "videoinput" && d.deviceId)
    .map((d) => ({ deviceId: d.deviceId, label: d.label.trim() || "Camera" }));
}

export async function connectCamera(assetId: string, deviceId?: string) {
  const video: MediaTrackConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };
  if (deviceId) video.deviceId = { exact: deviceId };
  const stream = await navigator.mediaDevices.getUserMedia({
    video,
    audio: false,
  });
  return attachStream(assetId, stream, "camera");
}

export async function connectScreen(assetId: string) {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { width: 1920, height: 1080 },
    audio: false,
  });
  stream.getVideoTracks()[0]?.addEventListener("ended", () => disconnectLive(assetId));
  return attachStream(assetId, stream, "screen");
}

export function attachRemoteStream(assetId: string, stream: MediaStream) {
  return attachStream(assetId, stream, "phone");
}

export async function connectUrl(assetId: string, url: string) {
  disconnectLive(assetId);
  const video = makeVideo();
  video.crossOrigin = "anonymous";
  video.src = url;
  await video.play();
  lives.set(assetId, { video, kind: "url", ready: true });
  emit();
  return video;
}

export function attachNdiCanvas(assetId: string) {
  const existing = lives.get(assetId);
  if (existing?.kind === "ndi" && existing.canvas) return existing.canvas;
  disconnectLive(assetId);
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  lives.set(assetId, { canvas, kind: "ndi", ready: false });
  emit();
  return canvas;
}

function pixelBytes(raw: NdiFramePayload["rgba"] | NdiFramePayload["jpeg"]) {
  return copyPixelBytes(raw);
}

export function applyNdiFrame(payload: NdiFramePayload) {
  if (!payload.assetId) return;
  let entry = lives.get(payload.assetId);
  if (!entry || entry.kind !== "ndi" || !entry.canvas) {
    attachNdiCanvas(payload.assetId);
    entry = lives.get(payload.assetId);
  }
  const canvas = entry?.canvas;
  if (!canvas) return;
  const w = Number(payload.width);
  const h = Number(payload.height);
  const rgba = pixelBytes(payload.rgba);
  if (rgba && w >= 2 && h >= 2 && rgba.length >= w * h * 4) {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const clamped = new Uint8ClampedArray(w * h * 4);
    clamped.set(rgba.subarray(0, clamped.length));
    ctx.putImageData(new ImageData(clamped, w, h), 0, 0);
    const current = lives.get(payload.assetId);
    if (current) current.ready = true;
    emit();
    if (!loggedPaint) {
      loggedPaint = true;
      window.__woLog?.(`NDI Stage painted ${w}×${h}`, "info");
    }
    return;
  }
  const bytes = pixelBytes(payload.jpeg);
  if (!bytes) {
    if (!loggedDrop) {
      loggedDrop = true;
      window.__woLog?.(
        "NDI frame reached Producer but pixels were empty. Rebuild 7.8.26. DistroAV Main Output is on — switch OBS to a camera, not Display Capture of WatchJhon.",
        "warn",
      );
    }
    return;
  }
  const blob = new Blob([bytes as BlobPart], { type: "image/jpeg" });
  void createImageBitmap(blob)
    .then((bmp) => {
      const current = lives.get(payload.assetId);
      if (!current?.canvas) {
        bmp.close();
        return;
      }
      if (current.canvas.width !== bmp.width || current.canvas.height !== bmp.height) {
        current.canvas.width = bmp.width;
        current.canvas.height = bmp.height;
      }
      const ctx = current.canvas.getContext("2d");
      ctx?.drawImage(bmp, 0, 0);
      bmp.close();
      current.ready = true;
      emit();
      if (!loggedPaint) {
        loggedPaint = true;
        window.__woLog?.(`NDI Stage painted ${bmp.width}×${bmp.height} (JPEG)`, "info");
      }
    })
    .catch(() => undefined);
}

export function startNdiFrameSink() {
  if (ndiSinkStarted) return;
  ndiSinkStarted = true;
  window.watchout?.onNdiFrame?.((payload) => applyNdiFrame(payload));
}

export function disconnectLive(assetId: string) {
  const entry = lives.get(assetId);
  if (!entry) return;
  entry.stream?.getTracks().forEach((track) => track.stop());
  if (entry.video) {
    entry.video.pause();
    entry.video.srcObject = null;
    entry.video.removeAttribute("src");
  }
  lives.delete(assetId);
  emit();
}
