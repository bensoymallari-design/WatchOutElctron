export interface OutputScreen {
  id: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  physicalWidth: number;
  physicalHeight: number;
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
  proxyVersion?: number;
  bytes?: number;
  linked?: boolean;
  posterUrl?: string;
}

export interface RebuildMediaRequest {
  id: string;
  name: string;
  kind: "video" | "audio" | "image";
  originalPath: string;
  proxyPath?: string;
  proxyVersion?: number;
  codec?: string;
  width?: number;
  height?: number;
  bytes?: number;
  linked?: boolean;
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
  runtime?: boolean;
  runtimePath?: string | null;
  loadError?: string;
}

export interface NdiStatus {
  runtime: boolean;
  runtimePath: string | null;
  connected: string | null;
  loadError?: string;
}

export interface NdiConnectResult {
  ok: boolean;
  error?: string;
  name?: string;
  runtime?: boolean;
}

export interface NdiFramePayload {
  assetId: string;
  jpeg?: Uint8Array | string;
  rgba?: Uint8Array;
  width: number;
  height: number;
  sourceName: string;
}

export interface OpenOutputOptions {
  displayId: string;
  displayName: string;
  screenId?: string;
  channel?: number;
  fullscreen?: boolean;
}
