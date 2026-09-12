const listeners = new Set<() => void>();

export type LiveKind = "camera" | "screen" | "url" | "phone";

interface LiveEntry {
  video: HTMLVideoElement;
  stream?: MediaStream;
  kind: LiveKind;
}

const lives = new Map<string, LiveEntry>();

export function subscribeLive(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit() {
  listeners.forEach((fn) => fn());
}

export function getLiveVideo(assetId: string) {
  return lives.get(assetId)?.video ?? null;
}

export function getLiveKind(assetId: string): LiveKind | null {
  return lives.get(assetId)?.kind ?? null;
}

export function isLiveConnected(assetId: string) {
  const video = lives.get(assetId)?.video;
  return !!video && video.readyState >= 2;
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
  lives.set(assetId, { video, stream, kind });
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
  lives.set(assetId, { video, kind: "url" });
  emit();
  return video;
}

export function disconnectLive(assetId: string) {
  const entry = lives.get(assetId);
  if (!entry) return;
  entry.stream?.getTracks().forEach((track) => track.stop());
  entry.video.pause();
  entry.video.srcObject = null;
  entry.video.removeAttribute("src");
  lives.delete(assetId);
  emit();
}
