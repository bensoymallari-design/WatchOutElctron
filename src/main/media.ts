import { spawn } from "node:child_process";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { app, dialog, type BrowserWindow } from "electron";
import { mediaKind, needsHqRebuild, needsPlaybackProxy, PROXY_VERSION, proxyFfmpegArgs, proxyNote, type ProxyKind } from "../shared/codecs";
import { formatBytes, largeMediaNote, shouldBuildFullProxy, shouldCopyOnImport } from "../shared/mediaPolicy";
import type { ImportedMedia, RebuildMediaRequest } from "../shared/ipc";
import { ffmpegCandidatePaths, ffprobeCandidatePaths } from "./ffmpegBins";

function run(cmd: string, args: string[], onStderr?: (line: string) => void) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (buf) => {
      stdout += String(buf);
    });
    child.stderr.on("data", (buf) => {
      const text = String(buf);
      stderr += text;
      onStderr?.(text);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}

let ffmpegBin = "ffmpeg";
let ffprobeBin = "ffprobe";
let toolsReady: Promise<boolean> | null = null;

async function firstWorking(candidates: string[]) {
  for (const bin of candidates) {
    try {
      const result = await run(bin, ["-version"]);
      if (result.code === 0) return bin;
    } catch {
      /* try next */
    }
  }
  return null;
}

export function ffmpegAvailable() {
  toolsReady ??= (async () => {
    const ffmpeg = await firstWorking(ffmpegCandidatePaths());
    const ffprobe = await firstWorking(ffprobeCandidatePaths());
    if (!ffmpeg || !ffprobe) return false;
    ffmpegBin = ffmpeg;
    ffprobeBin = ffprobe;
    return true;
  })();
  return toolsReady;
}

interface Probe {
  width: number;
  height: number;
  duration: number;
  fps: number;
  codec: string;
  hasAudio: boolean;
}

async function probeFile(filePath: string): Promise<Probe> {
  const fallback: Probe = {
    width: 0,
    height: 0,
    duration: 10000,
    fps: 60,
    codec: extname(filePath).slice(1).toUpperCase() || "BIN",
    hasAudio: false,
  };
  if (!(await ffmpegAvailable())) return fallback;
  const result = await run(ffprobeBin, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  if (result.code !== 0) return fallback;
  try {
    const json = JSON.parse(result.stdout) as {
      format?: { duration?: string };
      streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string; duration?: string }[];
    };
    const video = json.streams?.find((s) => s.codec_type === "video");
    const audio = json.streams?.find((s) => s.codec_type === "audio");
    const stream = video ?? audio;
    const durSec = Number(json.format?.duration ?? stream?.duration ?? 10);
    let fps = 60;
    const rate = video?.avg_frame_rate;
    if (rate && rate.includes("/")) {
      const [n, d] = rate.split("/").map(Number);
      if (n && d) fps = n / d;
    }
    return {
      width: video?.width || 0,
      height: video?.height || 0,
      duration: Math.max(250, Math.round(durSec * 1000)),
      fps: Number.isFinite(fps) && fps > 1 ? fps : 60,
      codec: [video?.codec_name, audio?.codec_name].filter(Boolean).join(" + ") || fallback.codec,
      hasAudio: !!audio,
    };
  } catch {
    return fallback;
  }
}

async function transcodeProxy(
  src: string,
  dest: string,
  kind: "video" | "audio",
  size: { width: number; height: number },
  keepAudio: boolean,
  onProgress?: (msg: string) => void,
) {
  const onChunk = (chunk: string) => {
    const time = chunk.match(/time=(\d+:\d+:\d+\.\d+)/);
    if (time) onProgress?.(`Transcoding ${basename(src)}  ${time[1]}`);
  };
  const tryKind = async (proxyKind: ProxyKind) => run(ffmpegBin, proxyFfmpegArgs(proxyKind, src, dest, size), onChunk);
  let result = await tryKind(kind);
  if (result.code !== 0 && kind === "video") {
    onProgress?.(`VP9 failed for ${basename(src)}, trying VP8 with audio`);
    result = await tryKind("video-vp8");
  }
  if (result.code !== 0 && kind === "video" && keepAudio) {
    onProgress?.(`Opus failed for ${basename(src)}, trying Vorbis soundtrack`);
    result = await tryKind("video-vorbis");
  }
  if (result.code !== 0 && kind === "video" && !keepAudio) {
    onProgress?.(`${basename(src)} has no audio track — picture only`);
    result = await tryKind("video-silent");
  }
  if (result.code !== 0) throw new Error(result.stderr.slice(-400) || "ffmpeg proxy failed");
}

function colorFor(kind: ImportedMedia["kind"]) {
  if (kind === "video") return "#38bdf8";
  if (kind === "audio") return "#a78bfa";
  return "#f59e0b";
}

export async function mediaRoot() {
  const dir = join(app.getPath("userData"), "media");
  await mkdir(dir, { recursive: true });
  await mkdir(join(dir, "proxies"), { recursive: true });
  return dir;
}

export function mediaUrl(filePath: string) {
  return pathToFileURL(filePath).href;
}

function proxyDest(root: string, id: string) {
  return join(root, "proxies", `${id}.v${PROXY_VERSION}.webm`);
}

async function buildProxy(
  id: string,
  destFile: string,
  kind: "video" | "audio",
  info: Probe,
  onLog?: (message: string, level?: "info" | "warn" | "error") => void,
) {
  const root = await mediaRoot();
  const proxy = proxyDest(root, id);
  const label = `${info.width || "?"}×${info.height || "?"} ${info.codec}`;
  onLog?.(`Building HQ VP9+Opus ${label} for ${basename(destFile)} — keeps file pixels, may take a few minutes`);
  await transcodeProxy(destFile, proxy, kind, { width: info.width, height: info.height }, info.hasAudio, (msg) => onLog?.(msg));
  if (info.hasAudio) {
    const built = await probeFile(proxy);
    if (!built.hasAudio) {
      throw new Error(`Proxy for ${basename(destFile)} lost the soundtrack. Install a full ffmpeg build (with libopus) and click Rebuild HQ.`);
    }
  }
  onLog?.(`Proxy ready: ${basename(destFile)} (${info.width}×${info.height}${info.hasAudio ? " + audio" : " · no audio track"})`);
  return proxy;
}

let assetSeq = 0;

export async function importMediaFiles(
  paths: string[],
  onLog?: (message: string, level?: "info" | "warn" | "error") => void,
): Promise<ImportedMedia[]> {
  const root = await mediaRoot();
  const out: ImportedMedia[] = [];
  const canFfmpeg = await ffmpegAvailable();
  if (!canFfmpeg) onLog?.("ffmpeg/ffprobe not found — importing originals. Install ffmpeg (or npm i ffmpeg-static ffprobe-static) so H.264/AAC get a WebM soundtrack Electron can play.", "warn");

  for (const src of paths) {
    const id = `asset_${Date.now().toString(36)}${(assetSeq++).toString(36)}`;
    const ext = extname(src) || ".bin";
    const bytes = (await stat(src)).size;
    const linked = !shouldCopyOnImport(bytes);
    let dest = src;
    if (linked) {
      onLog?.(`Linking ${basename(src)} (${formatBytes(bytes)}) — playing from the original disk file, not copying into the app library`, "warn");
    } else {
      dest = join(root, `${id}${ext}`);
      onLog?.(`Copying ${basename(src)} (${formatBytes(bytes)}) into the media library`);
      await copyFile(src, dest);
    }
    const kind = mediaKind(src);
    const info = await probeFile(dest);
    let url = mediaUrl(dest);
    let optimized = !needsPlaybackProxy(info.codec, dest);
    let proxyPath: string | undefined;
    let proxyVersion: number | undefined;
    const canProxy = kind !== "image" && needsPlaybackProxy(info.codec, dest) && canFfmpeg && shouldBuildFullProxy(bytes, info.width, info.height);
    if (canProxy) {
      try {
        proxyPath = await buildProxy(id, dest, kind, info, onLog);
        url = mediaUrl(proxyPath);
        optimized = true;
        proxyVersion = PROXY_VERSION;
      } catch (error) {
        optimized = false;
        onLog?.(error instanceof Error ? error.message : "Proxy transcode failed", "error");
      }
    } else if (kind !== "image" && !needsPlaybackProxy(info.codec, dest)) {
      proxyVersion = PROXY_VERSION;
    } else if (kind !== "image" && !shouldBuildFullProxy(bytes, info.width, info.height)) {
      optimized = true;
      onLog?.(
        `${basename(src)} is ${formatBytes(bytes)} — skipping a full VP9 copy. Outputs stream the original file. Keep it on a fast NVMe.`,
        "warn",
      );
    }
    const silent = kind === "video" && !info.hasAudio;
    const sizeNote = largeMediaNote(bytes, linked);
    out.push({
      id,
      name: basename(src).replace(/\.[^.]+$/, ""),
      kind,
      width: info.width,
      height: info.height,
      duration: info.duration,
      fps: info.fps,
      url,
      codec: info.codec,
      color: colorFor(kind),
      optimized,
      notes: `${basename(src)} · ${sizeNote} · ${proxyNote(info.codec, !!proxyPath, info.width, info.height)}${silent ? " · no audio track" : ""}`,
      originalPath: dest,
      proxyPath,
      proxyVersion,
      bytes,
      linked,
    });
  }
  return out;
}

export async function rebuildMediaAssets(
  assets: RebuildMediaRequest[],
  onLog?: (message: string, level?: "info" | "warn" | "error") => void,
): Promise<ImportedMedia[]> {
  const canFfmpeg = await ffmpegAvailable();
  if (!canFfmpeg) {
    onLog?.(
      "Cannot rebuild HQ files — ffmpeg/ffprobe not found. Install ffmpeg and add it to PATH, or run npm i ffmpeg-static ffprobe-static, then Rebuild HQ.",
      "error",
    );
    return [];
  }
  const out: ImportedMedia[] = [];
  for (const asset of assets) {
    if (asset.kind !== "video" && asset.kind !== "audio") continue;
    if (!asset.originalPath || !existsSync(asset.originalPath)) continue;
    if (
      !needsHqRebuild({
        kind: asset.kind,
        codec: asset.codec,
        originalPath: asset.originalPath,
        proxyPath: asset.proxyPath,
        proxyVersion: asset.proxyVersion,
        bytes: asset.bytes,
        width: asset.width,
        height: asset.height,
      })
    ) {
      continue;
    }
    const info = await probeFile(asset.originalPath);
    const bytes = asset.bytes ?? (existsSync(asset.originalPath) ? (await stat(asset.originalPath)).size : 0);
    if (!shouldBuildFullProxy(bytes, info.width, info.height)) {
      onLog?.(
        `Skipping HQ rebuild for ${asset.name} (${formatBytes(bytes)}) — event masters stream from disk instead of a second 100 GB proxy.`,
        "warn",
      );
      continue;
    }
    const kind = asset.kind;
    let url = mediaUrl(asset.originalPath);
    let proxyPath: string | undefined;
    let optimized = !needsPlaybackProxy(info.codec, asset.originalPath);
    let proxyVersion = PROXY_VERSION;
    if (needsPlaybackProxy(info.codec, asset.originalPath)) {
      try {
        proxyPath = await buildProxy(asset.id, asset.originalPath, kind, info, onLog);
        url = mediaUrl(proxyPath);
        optimized = true;
      } catch (error) {
        onLog?.(error instanceof Error ? error.message : "Proxy rebuild failed", "error");
        continue;
      }
    }
    const silent = kind === "video" && !info.hasAudio;
    out.push({
      id: asset.id,
      name: asset.name,
      kind,
      width: info.width || asset.width || 0,
      height: info.height || asset.height || 0,
      duration: info.duration,
      fps: info.fps,
      url,
      codec: info.codec,
      color: colorFor(kind),
      optimized,
      notes: `${basename(asset.originalPath)} · ${proxyNote(info.codec, !!proxyPath, info.width, info.height)}${silent ? " · no audio track" : ""}`,
      originalPath: asset.originalPath,
      proxyPath,
      proxyVersion,
      bytes,
      linked: asset.linked,
    });
  }
  return out;
}

export async function pickMediaFiles(win: BrowserWindow | null) {
  const result = await dialog.showOpenDialog(win ?? (undefined as unknown as BrowserWindow), {
    title: "Import media",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Media", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "mp4", "mov", "mkv", "avi", "webm", "mxf", "wav", "mp3", "aac", "flac", "ogg"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (result.canceled) return [] as string[];
  return result.filePaths;
}
