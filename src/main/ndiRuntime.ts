import { createRequire } from "node:module";
import { dirname } from "node:path";
import { NDI_RUNTIME_URL, resolveNdiLibrary } from "./ndiLibrary";
import { copyBgraRows, downscaleBgra, isBgraFourCC } from "./ndiPixels";
import { collapseSources, type NdiAdvert } from "../renderer/lib/ndiNames";

const require = createRequire(import.meta.url);

type Koffi = typeof import("koffi");
type KoffiType = ReturnType<Koffi["struct"]>;

interface NdiApi {
  find_create: (desc: unknown) => unknown;
  find_wait: (find: unknown, ms: number) => number;
  find_sources: (find: unknown, count: unknown) => unknown;
    recv_create: (desc: unknown) => unknown;
    recv_connect: (recv: unknown, src: unknown) => void;
    recv_destroy: (recv: unknown) => void;
    recv_capture: (recv: unknown, video: unknown, audio: unknown, meta: unknown, ms: number) => number;
    recv_free_video: (recv: unknown, video: unknown) => void;
    Source: KoffiType;
    RecvCreate: KoffiType;
    VideoFrame: KoffiType;
  videoSize: number;
  koffi: Koffi;
}

export interface NdiRawFrame {
  assetId: string;
  sourceName: string;
  width: number;
  height: number;
  bgra: Buffer;
}

type FrameHandler = (frame: NdiRawFrame) => void;

let api: NdiApi | null | undefined;
let findInst: unknown = null;
let recvInst: unknown = null;
let videoBuf: Buffer | null = null;
let connectedAssetId: string | null = null;
let connectedName: string | null = null;
let pumping = false;
let lastEncode = 0;
let onFrame: FrameHandler | null = null;

export function setNdiFrameHandler(fn: FrameHandler | null) {
  onFrame = fn;
}

export function ndiRuntimePath() {
  return resolveNdiLibrary();
}

export function ndiRuntimeReady() {
  return !!loadApi();
}

function pinDllDirectory(koffi: Koffi, dll: string) {
  if (process.platform !== "win32") return;
  const dir = dirname(dll);
  process.env.PATH = `${dir};${process.env.PATH || ""}`;
  try {
    const kernel = koffi.load("kernel32.dll");
    const setDir = kernel.func("int __stdcall SetDllDirectoryW(const char16_t *lpPathName)");
    setDir(dir);
  } catch {
    /* still try koffi.load */
  }
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
    pinDllDirectory(koffi, dll);
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
    const RecvCreate = koffi.struct("NDIlib_recv_create_v3_t", {
      p_ndi_name: "str",
      p_url_address: "str",
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
    const find_create = lib.func("void *NDIlib_find_create_v2(void *p_create_settings)");
    const find_wait = lib.func("int NDIlib_find_wait_for_sources(void *p_instance, uint32_t timeout_in_ms)");
    const find_sources = lib.func("void *NDIlib_find_get_current_sources(void *p_instance, _Out_ uint32_t *p_no_sources)");
    const recv_create = lib.func("void *NDIlib_recv_create_v3(NDIlib_recv_create_v3_t *p_create_settings)");
    const recv_connect = lib.func("void NDIlib_recv_connect(void *p_instance, NDIlib_source_t *p_src)");
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
      find_wait,
      find_sources,
      recv_create,
      recv_connect,
      recv_destroy,
      recv_capture,
      recv_free_video,
      Source,
      RecvCreate,
      VideoFrame,
      videoSize: koffi.sizeof(VideoFrame),
      koffi,
    };
    findInst = find_create(null);
    videoBuf = Buffer.alloc(api.videoSize);
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
    if (waitMs > 0) loaded.find_wait(findInst, waitMs);
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

function emitFrame(video: { xres: number; yres: number; FourCC?: number; p_data: unknown; line_stride_in_bytes: number }) {
  const loaded = api;
  if (!loaded || !onFrame || !connectedAssetId || !connectedName) return;
  if (!isBgraFourCC(Number(video.FourCC || 0))) return;
  if (!video.p_data || video.xres < 2 || video.yres < 2) return;
  const stride = video.line_stride_in_bytes || video.xres * 4;
  const total = stride * video.yres;
  if (total <= 0 || total > 48_000_000) return;
  const viewed = Buffer.from(loaded.koffi.view(video.p_data, total));
  const packed = copyBgraRows(viewed, video.xres, video.yres, stride);
  const scaled = downscaleBgra(packed, video.xres, video.yres, 960);
  onFrame({
    assetId: connectedAssetId,
    sourceName: connectedName,
    width: scaled.width,
    height: scaled.height,
    bgra: scaled.bgra,
  });
}

function pump() {
  if (!pumping || !api || !recvInst || !videoBuf) return;
  try {
    videoBuf.fill(0);
    const kind = api.recv_capture(recvInst, videoBuf, null, null, 40);
    if (kind === 1) {
      try {
        const now = Date.now();
        if (now - lastEncode >= 80) {
          lastEncode = now;
          emitFrame(api.koffi.decode(videoBuf, api.VideoFrame) as Parameters<typeof emitFrame>[0]);
        }
      } finally {
        try {
          api.recv_free_video(recvInst, videoBuf);
        } catch {
          /* ignore */
        }
      }
    } else if (kind === 4) {
      pumping = false;
      return;
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
      api.recv_connect(recvInst, null);
    } catch {
      /* ignore */
    }
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
  const sources = listSdkNdiSources(250);
  const match = pickSource(sources, sourceName);
  const name = match?.name || sourceName;
  const url = match?.ip || null;
  let recv = loaded.recv_create({
    p_ndi_name: name,
    p_url_address: url,
    color_format: 0,
    bandwidth: 0,
    allow_video_fields: false,
    p_ndi_recv_name: "WatchJhon",
  });
  if (!recv) recv = loaded.recv_create(null);
  if (!recv) {
    return { ok: false as const, error: `Could not connect to ${sourceName}` };
  }
  try {
    loaded.recv_connect(recv, { p_ndi_name: name, p_url_address: url });
  } catch {
    /* create already had the source */
  }
  recvInst = recv;
  connectedAssetId = assetId;
  connectedName = name;
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
