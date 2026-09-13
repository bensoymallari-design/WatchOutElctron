import { createRequire } from "node:module";
import { dirname } from "node:path";
import { NDI_RUNTIME_URL, resolveNdiLibrary } from "./ndiLibrary";
import { downscaleBgra, fourccLabel, videoToBgra } from "./ndiPixels";
import { collapseSources, isNoiseNdiName, type NdiAdvert } from "../renderer/lib/ndiNames";

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
type LogHandler = (message: string, level?: "info" | "warn" | "error") => void;

let api: NdiApi | null | undefined;
let findInst: unknown = null;
let recvInst: unknown = null;
let videoBuf: Buffer | null = null;
let connectedAssetId: string | null = null;
let connectedName: string | null = null;
let pumping = false;
let lastEncode = 0;
let onFrame: FrameHandler | null = null;
let onLog: LogHandler | null = null;
let loggedFirst = false;
let connectedAt = 0;
let triedNullRecv = false;
let lastLoadError = "";

export function setNdiFrameHandler(fn: FrameHandler | null) {
  onFrame = fn;
}

export function setNdiLogHandler(fn: LogHandler | null) {
  onLog = fn;
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
  process.env.NDI_RUNTIME_DIR_V6 = process.env.NDI_RUNTIME_DIR_V6 || dir;
  try {
    const kernel = koffi.load("kernel32.dll");
    const setDir = kernel.func("int __stdcall SetDllDirectoryW(str16)");
    setDir(dir);
    const loadEx = kernel.func("void *__stdcall LoadLibraryExW(str16, void *, uint32)");
    loadEx(dll, null, 0x00000008);
  } catch {
    /* still try koffi.load */
  }
}

function tryFunc(lib: { func: (sig: string) => unknown }, sig: string) {
  try {
    return lib.func(sig);
  } catch {
    return null;
  }
}

function loadApi(): NdiApi | null {
  if (api !== undefined) return api;
  const dll = resolveNdiLibrary();
  if (!dll) {
    api = null;
    lastLoadError =
      "WatchJhon cannot find Processing.NDI.Lib.x64.dll. DistroAV already loaded NDI 6.3 — click DistroAV Get NDI Library, then fully quit and reopen WatchJhon so it sees NDI_RUNTIME_DIR_V6.";
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
    // DistroAV binds NDIlib_v6_load(), not necessarily NDIlib_initialize as a named export.
    const v6_load = tryFunc(lib, "void *NDIlib_v6_load()") as (() => unknown) | null;
    const v5_load = tryFunc(lib, "void *NDIlib_v5_load()") as (() => unknown) | null;
    if (v6_load) {
      try {
        v6_load();
      } catch {
        /* named exports below still work on official Runtime DLLs */
      }
    } else if (v5_load) {
      try {
        v5_load();
      } catch {
        /* ignore */
      }
    }
    const initialize = tryFunc(lib, "int NDIlib_initialize()") as (() => number) | null;
    const find_create = lib.func("void *NDIlib_find_create_v2(void *p_create_settings)");
    const find_wait = lib.func("int NDIlib_find_wait_for_sources(void *p_instance, uint32_t timeout_in_ms)");
    const find_sources = lib.func("void *NDIlib_find_get_current_sources(void *p_instance, _Out_ uint32_t *p_no_sources)");
    const recv_create = lib.func("void *NDIlib_recv_create_v3(NDIlib_recv_create_v3_t *p_create_settings)");
    const recv_connect = lib.func("void NDIlib_recv_connect(void *p_instance, NDIlib_source_t *p_src)");
    const recv_destroy = lib.func("void NDIlib_recv_destroy(void *p_instance)");
    const recv_capture = (tryFunc(
      lib,
      "int NDIlib_recv_capture_v3(void *p_instance, NDIlib_video_frame_v2_t *p_video_data, void *p_audio_data, void *p_metadata, uint32_t timeout_in_ms)",
    ) ??
      lib.func(
        "int NDIlib_recv_capture_v2(void *p_instance, NDIlib_video_frame_v2_t *p_video_data, void *p_audio_data, void *p_metadata, uint32_t timeout_in_ms)",
      )) as NdiApi["recv_capture"];
    const recv_free_video = lib.func("void NDIlib_recv_free_video_v2(void *p_instance, NDIlib_video_frame_v2_t *p_video_data)");
    if (initialize && !initialize()) {
      lastLoadError = `NDI DLL is at ${dll} but NDIlib_initialize failed. Companion DLLs in that folder may be missing.`;
      api = null;
      return null;
    }
    if (!initialize && !v6_load && !v5_load) {
      lastLoadError = `NDI DLL is at ${dll} but it has no NDIlib_initialize / NDIlib_v6_load export. DistroAV uses NDIlib_v6_load — this is a different NDI DLL (Resolume NDI 5?).`;
      api = null;
      return null;
    }
    const loadedApi: NdiApi = {
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
    api = loadedApi;
    findInst = find_create({ show_local_sources: true, p_groups: null, p_extra_ips: null }) || find_create(null);
    videoBuf = Buffer.alloc(Math.max(256, loadedApi.videoSize + 64));
    onLog?.(`NDI Runtime loaded · ${dll}`, "info");
    return loadedApi;
  } catch (error) {
    api = null;
    lastLoadError = `NDI DLL is at ${dll} but koffi could not load it: ${error instanceof Error ? error.message : String(error)}`;
    onLog?.(lastLoadError, "error");
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
  const xres = Number(video.xres) || (videoBuf ? videoBuf.readInt32LE(0) : 0);
  const yres = Number(video.yres) || (videoBuf ? videoBuf.readInt32LE(4) : 0);
  if (!video.p_data || xres < 2 || yres < 2) {
    if (!loggedFirst) {
      loggedFirst = true;
      onLog?.(
        `NDI video header was empty (${xres}×${yres}). The Runtime connected but this frame had no pixels.`,
        "warn",
      );
    }
    return;
  }
  const stride = video.line_stride_in_bytes || 0;
  const fourcc = Number(video.FourCC || 0) >>> 0;
  const rowBytes = stride > 0 ? stride : xres * 4;
  const total = rowBytes * yres;
  if (total <= 0 || total > 48_000_000) return;
  const viewed = Buffer.from(loaded.koffi.view(video.p_data, total));
  const packed = videoToBgra(viewed, xres, yres, rowBytes, fourcc);
  const scaled = downscaleBgra(packed, xres, yres, 960);
  if (!loggedFirst) {
    loggedFirst = true;
    onLog?.(`NDI picture ${xres}×${yres} ${fourccLabel(fourcc)} — painting Stage`, "info");
  }
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
    } else {
      const now = Date.now();
      if (!loggedFirst && now - lastEncode >= 3000) {
        lastEncode = now;
        const hint =
          kind === 4
            ? "NDI dropped the connection. Is OBS Tools → NDI → Output Settings → Main Output still on?"
            : `NDI waiting for video from ${connectedName} (capture ${kind}). OBS: Tools → NDI → Output Settings → enable Main Output. You do not need NDI Tools.`;
        onLog?.(hint, "warn");
      }
      if (!loggedFirst && !triedNullRecv && connectedAt && now - connectedAt > 4000 && api && connectedName) {
        triedNullRecv = true;
        onLog?.("NDI still no video — retrying with default receiver settings", "warn");
        try {
          api.recv_destroy(recvInst);
        } catch {
          /* ignore */
        }
        const retry = api.recv_create(null);
        if (retry) {
          try {
            api.recv_connect(retry, { p_ndi_name: connectedName, p_url_address: "" });
          } catch {
            /* ignore */
          }
          recvInst = retry;
        }
      }
    }
  } catch (error) {
    const now = Date.now();
    if (now - lastEncode >= 3000) {
      lastEncode = now;
      onLog?.(`NDI capture error: ${error instanceof Error ? error.message : String(error)}`, "warn");
    }
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
  "WatchJhon cannot load DistroAV's NDI 6.3 DLL. DistroAV already has it — you do not need NDI Tools. Fully quit WatchJhon and reopen it after DistroAV Get NDI Library. " +
  NDI_RUNTIME_URL;

export function connectNdiRecv(assetId: string, sourceName: string) {
  if (isNoiseNdiName(sourceName)) {
    return {
      ok: false as const,
      error:
        "That KeepAliveServer row is DistroAV keepalive, not QUBITNDI. Scan again and Connect to HPVS-BPXL-12 (QUBITNDI).",
    };
  }
  const loaded = loadApi();
  if (!loaded) {
    return { ok: false as const, error: lastLoadError || MISSING_RUNTIME };
  }
  disconnectNdiRecv();
  const sources = listSdkNdiSources(250);
  const match = pickSource(sources, sourceName);
  const name = match?.name || sourceName;
  const url = match?.ip || "";
  const src = { p_ndi_name: name, p_url_address: url };
  // BGRA + highest bandwidth. OBS default is UYVY; the Runtime converts when we ask for BGRA.
  const COLOR_BGRX_BGRA = 1;
  const BANDWIDTH_HIGHEST = 100;
  let recv =
    loaded.recv_create({
      source_to_connect_to: src,
      color_format: COLOR_BGRX_BGRA,
      bandwidth: BANDWIDTH_HIGHEST,
      allow_video_fields: true,
      p_ndi_recv_name: "WatchJhon",
    }) || loaded.recv_create(null);
  if (!recv) {
    return { ok: false as const, error: `Could not connect to ${sourceName}` };
  }
  try {
    loaded.recv_connect(recv, src);
  } catch {
    /* already connected via create settings */
  }
  recvInst = recv;
  connectedAssetId = assetId;
  connectedName = name;
  loggedFirst = false;
  lastEncode = 0;
  connectedAt = Date.now();
  triedNullRecv = false;
  pumping = true;
  setTimeout(pump, 0);
  onLog?.(
    `NDI helper connected to ${name}. DistroAV Main Output can stay on — switch the OBS scene to a camera or Color Source, not Display Capture of WatchJhon.`,
    "info",
  );
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
    loadError: lastLoadError || undefined,
  };
}
