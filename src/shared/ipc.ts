export interface OutputScreen {
  id: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  isPrimary: boolean;
  scaleFactor: number;
}

export interface ImportedMedia {
  id: string;
  name: string;
  kind: "image" | "video" | "audio";
  width: number;
  height: number;
  duration: number;
  fps: number;
  url: string;
  codec: string;
  color: string;
  optimized: boolean;
  notes: string;
  originalPath: string;
  proxyPath?: string;
}

export interface RecentShow {
  id: string;
  name: string;
  path: string;
  savedAt: string;
}

export interface ClockPayload {
  fps: number;
  timelines: { id: string; playhead: number; playback: "play" | "pause" | "stop"; rate: number }[];
}

export interface NdiAdvert {
  name: string;
  host: string;
  port: number;
  ip?: string;
}

export interface NdiScan {
  sources: NdiAdvert[];
  lan: { address: string; name: string }[];
  ok: boolean;
  error?: string;
}

export interface OpenOutputOptions {
  displayId: string;
  displayName: string;
  screenId?: string;
  channel?: number;
  fullscreen?: boolean;
}
