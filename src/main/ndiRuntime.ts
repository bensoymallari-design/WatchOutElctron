import { createRequire } from "node:module";
import { dirname } from "node:path";
import { NDI_RUNTIME_URL, resolveNdiLibrary } from "./ndiLibrary";
import { NDI_OUTPUT_MAX_WIDTH, downscaleBgra, fourccLabel, videoToBgra } from "./ndiPixels";
import {
  NDI_FRAME_ERROR,
  NDI_FRAME_VIDEO,
  asNativePtr,
  bindMemcpy,
  copyNdiPointer,
  ndiFrameKindName,
  readNdiVideoHeader,
  type MemcpyFn,
} from "./ndiCopy";
import { collapseSources, isNoiseNdiName, looksLikeNdiAddress, type NdiAdvert } from "../renderer/lib/ndiNames";

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
    recv_capture_raw: ((recv: unknown, video: unknown, audio: unknown, meta: unknown, ms: number) => number) | null;
    recv_free_video: (recv: unknown, video: unknown) => void;
    recv_no_connections: ((recv: unknown) => number) | null;
    Source: KoffiType;
    RecvCreate: KoffiType;
    VideoFrame: KoffiType;
  videoSize: number;
  koffi: Koffi;
  memcpy: MemcpyFn | null;
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
let lastHeaderLog = 0;
let connectedAt = 0;
let recvMode: "bgra" | "default" | "fastest" = "bgra";
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
      p_groups: "char *",
      p_extra_ips: "char *",
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
    const find_create = (tryFunc(lib, "void *NDIlib_find_create_v2(NDIlib_find_create_t *p_create_settings)") ??
      lib.func("void *NDIlib_find_create_v2(void *p_create_settings)")) as NdiApi["find_create"];
    const find_wait = lib.func("int NDIlib_find_wait_for_sources(void *p_instance, uint32_t timeout_in_ms)");
    const find_sources = lib.func("void *NDIlib_find_get_current_sources(void *p_instance, _Out_ uint32_t *p_no_sources)");
    const recv_create = lib.func("void *NDIlib_recv_create_v3(NDIlib_recv_create_v3_t *p_create_settings)");
    const recv_connect = lib.func("void NDIlib_recv_connect(void *p_instance, NDIlib_source_t *p_src)");
    const recv_destroy = lib.func("void NDIlib_recv_destroy(void *p_instance)");
    // _Out_ copies the filled video_frame back to a JS object. Electron cannot koffi.view() p_data.
    const recv_capture = (tryFunc(
      lib,
      "int NDIlib_recv_capture_v2(void *p_instance, _Out_ NDIlib_video_frame_v2_t *p_video_data, void *p_audio_data, void *p_metadata, uint32_t timeout_in_ms)",
    ) ??
      lib.func(
        "int NDIlib_recv_capture_v3(void *p_instance, _Out_ NDIlib_video_frame_v2_t *p_video_data, void *p_audio_data, void *p_metadata, uint32_t timeout_in_ms)",
      )) as NdiApi["recv_capture"];
    const recv_capture_raw = (tryFunc(
      lib,
      "int NDIlib_recv_capture_v2(void *p_instance, void *p_video_data, void *p_audio_data, void *p_metadata, uint32_t timeout_in_ms)",
    ) ??
      tryFunc(
        lib,
        "int NDIlib_recv_capture_v3(void *p_instance, void *p_video_data, void *p_audio_data, void *p_metadata, uint32_t timeout_in_ms)",
      )) as NdiApi["recv_capture_raw"];
    const recv_free_video = lib.func("void NDIlib_recv_free_video_v2(void *p_instance, NDIlib_video_frame_v2_t *p_video_data)");
    const recv_no_connections = tryFunc(lib, "int NDIlib_recv_get_no_connections(void *p_instance)") as NdiApi["recv_no_connections"];
    const memcpy = bindMemcpy(koffi);
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
      recv_capture_raw,
      recv_free_video,
      recv_no_connections,
      Source,
      RecvCreate,
      VideoFrame,
      videoSize: koffi.sizeof(VideoFrame),
      koffi,
      memcpy,
    };
    api = loadedApi;
    try {
      findInst = find_create({ show_local_sources: true, p_groups: null, p_extra_ips: null });
    } catch {
      findInst = null;
    }
    if (!findInst) {
      try {
        findInst = find_create(null);
      } catch {
        findInst = null;
      }
    }
    videoBuf = Buffer.alloc(Math.max(256, loadedApi.videoSize + 64));
    onLog?.(
      `NDI Runtime loaded · ${dll}${memcpy ? " · memcpy pixel copy" : " · koffi.view may fail inside Electron"}`,
      "info",
    );
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

function openRecv(src: { p_ndi_name: string; p_url_address: string }, mode: "bgra" | "default" | "fastest") {
  const loaded = api;
  if (!loaded) return null;
  // SDK: BGRX_BGRA = 0, UYVY_BGRA = 1, fastest = 100. Nested source_to_connect_to packing is
  // unreliable in koffi, so create with an empty source (or null) then recv_connect by name.
  const COLOR_BGRX_BGRA = 0;
  const COLOR_FASTEST = 100;
  const BANDWIDTH_HIGHEST = 100;
  let recv: unknown = null;
  if (mode !== "default") {
    try {
      recv = loaded.recv_create({
        source_to_connect_to: { p_ndi_name: "", p_url_address: "" },
        color_format: mode === "fastest" ? COLOR_FASTEST : COLOR_BGRX_BGRA,
        bandwidth: BANDWIDTH_HIGHEST,
        allow_video_fields: true,
        p_ndi_recv_name: "WatchJhon",
      });
    } catch {
      recv = null;
    }
  }
  if (!recv) {
    try {
      recv = loaded.recv_create(null);
    } catch {
      recv = null;
    }
  }
  if (!recv) return null;
  try {
    loaded.recv_connect(recv, src);
  } catch {
    /* ignore */
  }
  return recv;
}

function emitFrame(video: { xres?: unknown; yres?: unknown; FourCC?: unknown; p_data?: unknown; line_stride_in_bytes?: unknown }) {
  const loaded = api;
  if (!loaded || !onFrame || !connectedAssetId || !connectedName) return;
  const header = videoBuf ? readNdiVideoHeader(videoBuf) : null;
  const xres = Number(video.xres) || header?.xres || 0;
  const yres = Number(video.yres) || header?.yres || 0;
  const ptr = asNativePtr(video.p_data) ?? header?.p_data;
  if (!ptr || xres < 2 || yres < 2) {
    if (Date.now() - lastHeaderLog > 3000) {
      lastHeaderLog = Date.now();
      onLog?.(`NDI video header was empty (${xres}×${yres}). The Runtime connected but this frame had no pixels.`, "warn");
    }
    return;
  }
  const stride = Number(video.line_stride_in_bytes) || header?.line_stride_in_bytes || 0;
  const fourcc = Number(video.FourCC || header?.FourCC || 0) >>> 0;
  const rowBytes = stride > 0 ? stride : xres * 4;
  const total = rowBytes * yres;
  if (total <= 0 || total > 48_000_000) return;
  let viewed: Buffer;
  try {
    viewed = copyNdiPointer(loaded.koffi, loaded.memcpy, ptr, total);
  } catch (error) {
    onLog?.(`NDI pixel pointer could not be read: ${error instanceof Error ? error.message : String(error)}`, "warn");
    return;
  }
  if (viewed.length < Math.min(total, 16)) {
    onLog?.("NDI pixel copy was empty. Electron blocks koffi.view — memcpy should have copied this frame.", "warn");
    return;
  }
  const packed = videoToBgra(viewed, xres, yres, rowBytes, fourcc);
  const scaled = downscaleBgra(packed, xres, yres, NDI_OUTPUT_MAX_WIDTH);
  if (!loggedFirst) {
    loggedFirst = true;
    onLog?.(
      `NDI picture ${xres}×${yres} ${fourccLabel(fourcc)} — Output ${scaled.width}×${scaled.height} (sender resolution)`,
      "info",
    );
  }
  onFrame({
    assetId: connectedAssetId,
    sourceName: connectedName,
    width: scaled.width,
    height: scaled.height,
    bgra: scaled.bgra,
  });
}

function captureVideo() {
  const loaded = api;
  if (!loaded || !recvInst) return { kind: 0, video: null as Record<string, unknown> | null, freeRef: null as unknown };
  const out: Record<string, unknown> = {};
  try {
    const kind = loaded.recv_capture(recvInst, out, null, null, 80);
    return { kind, video: out, freeRef: out };
  } catch {
    if (!videoBuf) return { kind: 0, video: null, freeRef: null };
    videoBuf.fill(0);
    const raw = loaded.recv_capture_raw ?? loaded.recv_capture;
    const kind = raw(recvInst, videoBuf, null, null, 80);
    if (kind !== NDI_FRAME_VIDEO) return { kind, video: null, freeRef: videoBuf };
    let decoded: Record<string, unknown> = {};
    try {
      decoded = loaded.koffi.decode(videoBuf, loaded.VideoFrame) as Record<string, unknown>;
    } catch {
      decoded = {};
    }
    const header = readNdiVideoHeader(videoBuf);
    if (header) {
      if (!decoded.xres) decoded.xres = header.xres;
      if (!decoded.yres) decoded.yres = header.yres;
      if (!decoded.FourCC) decoded.FourCC = header.FourCC;
      if (!decoded.p_data) decoded.p_data = header.p_data;
      if (!decoded.line_stride_in_bytes) decoded.line_stride_in_bytes = header.line_stride_in_bytes;
    }
    return { kind, video: decoded, freeRef: videoBuf };
  }
}

function recreateRecv(mode: "bgra" | "default" | "fastest") {
  if (!api || !connectedName) return;
  onLog?.(`NDI still no video — retrying receiver (${mode})`, "warn");
  try {
    api.recv_destroy(recvInst);
  } catch {
    /* ignore */
  }
  recvInst = null;
  const retry = openRecv({ p_ndi_name: connectedName, p_url_address: "" }, mode);
  if (retry) recvInst = retry;
}

function pump() {
  if (!pumping || !api || !recvInst) return;
  try {
    const { kind, video, freeRef } = captureVideo();
    if (kind === NDI_FRAME_VIDEO && video) {
      try {
        const now = Date.now();
        if (now - lastEncode >= 80) {
          lastEncode = now;
          emitFrame(video);
        }
      } finally {
        try {
          api.recv_free_video(recvInst, freeRef ?? video);
        } catch {
          /* ignore */
        }
      }
    } else {
      const now = Date.now();
      if (!loggedFirst && now - lastEncode >= 3000) {
        lastEncode = now;
        let peers = -1;
        try {
          peers = api.recv_no_connections?.(recvInst) ?? -1;
        } catch {
          peers = -1;
        }
        const hint =
          kind === NDI_FRAME_ERROR
            ? "NDI dropped the connection. Is OBS Tools → DistroAV NDI Settings → Main Output still on?"
            : `NDI waiting for video from ${connectedName} (capture ${ndiFrameKindName(kind)}${peers >= 0 ? `, ${peers} sender` : ""}). OBS Program must be a camera or Color Source — Display Capture of WatchJhon is a loop and Stage stays on NDI PROGRAM rings.`;
        onLog?.(hint, "warn");
      }
      if (!loggedFirst && connectedAt && api && connectedName) {
        if (recvMode === "bgra" && now - connectedAt > 2500) {
          recvMode = "default";
          recreateRecv("default");
        } else if (recvMode === "default" && now - connectedAt > 5000) {
          recvMode = "fastest";
          recreateRecv("fastest");
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
  const url = looksLikeNdiAddress(match?.ip || "") ? String(match?.ip) : "";
  const src = { p_ndi_name: name, p_url_address: url };
  recvMode = "bgra";
  const recv = openRecv(src, "bgra");
  if (!recv) {
    return { ok: false as const, error: `Could not connect to ${sourceName}` };
  }
  recvInst = recv;
  connectedAssetId = assetId;
  connectedName = name;
  loggedFirst = false;
  lastEncode = 0;
  lastHeaderLog = 0;
  connectedAt = Date.now();
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
