import { createRequire } from "node:module";
import { nativeImage, webContents } from "electron";
import { NDI_RUNTIME_URL, resolveNdiLibrary } from "./ndiLibrary";
import { collapseSources, type NdiAdvert } from "../renderer/lib/ndiNames";

const require = createRequire(import.meta.url);

type Koffi = typeof import("koffi");
type KoffiType = ReturnType<Koffi["struct"]>;

interface NdiApi {
  find_create: (desc: unknown) => unknown;
  find_destroy: (find: unknown) => void;
  find_wait: (find: unknown, ms: number) => number;
  find_sources: (find: unknown, count: unknown) => unknown;
  recv_create: (desc: unknown) => unknown;
  recv_destroy: (recv: unknown) => void;
  recv_capture: (recv: unknown, video: unknown, audio: unknown, meta: unknown, ms: number) => number;
  recv_free_video: (recv: unknown, video: unknown) => void;
  Source: KoffiType;
  VideoFrame: KoffiType;
  koffi: Koffi;
}

interface VideoBits {
  xres: number;
  yres: number;
  p_data: unknown;
  line_stride_in_bytes: number;
}

let api: NdiApi | null | undefined;
let findInst: unknown = null;
let recvInst: unknown = null;
let connectedAssetId: string | null = null;
let connectedName: string | null = null;
let pumping = false;
let encodeBusy = false;

export function ndiRuntimePath() {
  return resolveNdiLibrary();
}

export function ndiRuntimeReady() {
  return !!loadApi();
}

function loadApi(): NdiApi | null {
  if (api !== undefined) return api;
  const dll = resolveNdiLibrary();
  if (!dll) {
    api = null;
    return null;
  }
  try {
    const koffi = require("koffi") as Koffi;
    const lib = koffi.load(dll);
    const Source = koffi.struct("NDIlib_source_t", {
      p_ndi_name: "str",
      p_url_address: "str",
    });
    koffi.struct("NDIlib_find_create_t", {
      show_local_sources: "bool",
      p_groups: "str",
      p_extra_ips: "str",
    });
    koffi.struct("NDIlib_recv_create_v3_t", {
      source_to_connect_to: Source,
      color_format: "int",
      bandwidth: "int",
      allow_video_fields: "bool",
      p_ndi_recv_name: "str",
    });
    const VideoFrame = koffi.struct("NDIlib_video_frame_v2_t", {
      xres: "int",
      yres: "int",
      FourCC: "int",
      frame_rate_N: "int",
      frame_rate_D: "int",
      picture_aspect_ratio: "float",
      frame_format_type: "int",
      timecode: "int64",
      p_data: "void *",
      line_stride_in_bytes: "int",
      p_metadata: "void *",
      timestamp: "int64",
    });
    const initialize = lib.func("int NDIlib_initialize()");
    const find_create = lib.func("void *NDIlib_find_create_v2(NDIlib_find_create_t *p_create_settings)");
    const find_destroy = lib.func("void NDIlib_find_destroy(void *p_instance)");
    const find_wait = lib.func("int NDIlib_find_wait_for_sources(void *p_instance, uint32_t timeout_in_ms)");
    const find_sources = lib.func("void *NDIlib_find_get_current_sources(void *p_instance, _Out_ uint32_t *p_no_sources)");
    const recv_create = lib.func("void *NDIlib_recv_create_v3(NDIlib_recv_create_v3_t *p_create_settings)");
    const recv_destroy = lib.func("void NDIlib_recv_destroy(void *p_instance)");
    const recv_capture = lib.func(
      "int NDIlib_recv_capture_v2(void *p_instance, NDIlib_video_frame_v2_t *p_video_data, void *p_audio_data, void *p_metadata, uint32_t timeout_in_ms)",
    );
    const recv_free_video = lib.func("void NDIlib_recv_free_video_v2(void *p_instance, NDIlib_video_frame_v2_t *p_video_data)");
    if (!initialize()) {
      api = null;
      return null;
    }
    api = {
      find_create,
      find_destroy,
      find_wait,
      find_sources,
      recv_create,
      recv_destroy,
      recv_capture,
      recv_free_video,
      Source,
      VideoFrame,
      koffi,
    };
    findInst = find_create({ show_local_sources: true, p_groups: null, p_extra_ips: null });
    return api;
  } catch {
    api = null;
    return null;
  }
}

export function listSdkNdiSources(waitMs = 200): NdiAdvert[] {
  const loaded = loadApi();
  if (!loaded || !findInst) return [];
  try {
    loaded.find_wait(findInst, waitMs);
    const count = [0];
    const ptr = loaded.find_sources(findInst, count);
    const n = Number(count[0] ?? 0);
    if (!ptr || n <= 0) return [];
    const decoded = loaded.koffi.decode(ptr, loaded.Source, n) as { p_ndi_name?: string; p_url_address?: string }[];
    const rows = Array.isArray(decoded) ? decoded : [decoded];
    const out: NdiAdvert[] = [];
    for (const src of rows) {
      const name = String(src?.p_ndi_name || "").trim();
      if (!name) continue;
      out.push({ name, host: "", port: 0, ip: src.p_url_address || undefined });
    }
    return collapseSources(out);
  } catch {
    return [];
  }
}

function broadcastFrame(payload: { assetId: string; jpeg: Buffer; width: number; height: number; sourceName: string }) {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed()) continue;
    wc.send("ndi:frame", payload);
  }
}

function encodeFrame(video: VideoBits) {
  const loaded = api;
  if (!loaded || !video.p_data || video.xres < 2 || video.yres < 2) return;
  const stride = video.line_stride_in_bytes || video.xres * 4;
  const total = stride * video.yres;
  if (total <= 0 || total > 32_000_000) return;
  const viewed = Buffer.from(loaded.koffi.view(video.p_data, total));
  const packed = Buffer.alloc(video.xres * video.yres * 4);
  if (stride === video.xres * 4) viewed.copy(packed);
  else {
    const row = video.xres * 4;
    for (let y = 0; y < video.yres; y++) viewed.copy(packed, y * row, y * stride, y * stride + row);
  }
  const img = nativeImage.createFromBitmap(packed, { width: video.xres, height: video.yres });
  const maxW = 1280;
  const jpeg = (img.getSize().width > maxW ? img.resize({ width: maxW }) : img).toJPEG(70);
  if (!connectedAssetId || !connectedName) return;
  broadcastFrame({
    assetId: connectedAssetId,
    jpeg,
    width: video.xres,
    height: video.yres,
    sourceName: connectedName,
  });
}

function pump() {
  if (!pumping || !api || !recvInst) return;
  try {
    const videoPtr = api.koffi.alloc(api.VideoFrame, 1);
    const kind = api.recv_capture(recvInst, videoPtr, null, null, 0);
    if (kind === 1 && !encodeBusy) {
      encodeBusy = true;
      try {
        const video = api.koffi.decode(videoPtr, api.VideoFrame) as VideoBits;
        encodeFrame(video);
      } finally {
        encodeBusy = false;
        try {
          api.recv_free_video(recvInst, videoPtr);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* keep pumping */
  }
  if (pumping) setTimeout(pump, 8);
}

export function connectedNdi() {
  return connectedName;
}

export function disconnectNdiRecv(assetId?: string) {
  if (assetId && connectedAssetId && assetId !== connectedAssetId) return;
  pumping = false;
  connectedAssetId = null;
  connectedName = null;
  if (api && recvInst) {
    try {
      api.recv_destroy(recvInst);
    } catch {
      /* ignore */
    }
  }
  recvInst = null;
}

const MISSING_RUNTIME =
  "Chromium cannot decode NDI. Install the free NDI Runtime (Resolume/OBS already include it). You do not need NDI Webcam Input. " +
  NDI_RUNTIME_URL;

export function connectNdiRecv(assetId: string, sourceName: string) {
  const loaded = loadApi();
  if (!loaded) {
    return { ok: false as const, error: MISSING_RUNTIME };
  }
  disconnectNdiRecv();
  let sources = listSdkNdiSources(400);
  let match = pickSource(sources, sourceName);
  if (!match) {
    sources = listSdkNdiSources(1600);
    match = pickSource(sources, sourceName);
  }
  const desc = {
    source_to_connect_to: {
      p_ndi_name: match?.name || sourceName,
      p_url_address: match?.ip || null,
    },
    color_format: 0,
    bandwidth: 100,
    allow_video_fields: false,
    p_ndi_recv_name: "WatchJhon",
  };
  const recv = loaded.recv_create(desc);
  if (!recv) {
    return { ok: false as const, error: `Could not connect to ${sourceName}` };
  }
  recvInst = recv;
  connectedAssetId = assetId;
  connectedName = match?.name || sourceName;
  pumping = true;
  setTimeout(pump, 0);
  return { ok: true as const, name: connectedName, runtime: true };
}

function pickSource(sources: NdiAdvert[], sourceName: string) {
  return (
    sources.find((s) => s.name === sourceName) ??
    sources.find((s) => s.name.includes(sourceName) || sourceName.includes(s.name))
  );
}

export function ndiStatus() {
  return {
    runtime: !!loadApi(),
    runtimePath: resolveNdiLibrary(),
    connected: connectedName,
  };
}
