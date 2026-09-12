import { spawn } from "node:child_process";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { app, dialog, type BrowserWindow } from "electron";
import { collapseImportPaths, mediaKind, needsHqRebuild, needsPlaybackProxy, preparedSidecarCandidates, PROXY_VERSION, proxyFfmpegArgs, proxyNote, scaledProxySize, siblingWebmPath, type PrepareMode, type ProxyKind } from "../shared/codecs";
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
  size: { width: number; height: number; maxWidth?: number },
  keepAudio: boolean,
  onProgress?: (msg: string) => void,
  durationMs = 0,
  verb = "Transcoding",
) {
  let lastEmit = 0;
  const onChunk = (chunk: string) => {
    const time = chunk.match(/time=(\d+:\d+:\d+\.\d+)/);
    if (!time) return;
    const now = Date.now();
    if (now - lastEmit < 2500) return;
    lastEmit = now;
    const speed = chunk.match(/speed=\s*([0-9.]+)x/);
    const played = ffmpegClockSeconds(time[1]);
    const total = durationMs / 1000;
    const pct = total > 0 ? ` ${Math.min(99, Math.round((played / total) * 100))}%` : "";
    const rate = speed ? ` ${speed[1]}×` : "";
    onProgress?.(`${verb} ${basename(src)}${pct}  ${time[1]}${rate}`);
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

function ffmpegClockSeconds(clock: string) {
  const parts = clock.split(":").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
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
  onLog?.(`Building HQ VP9+Opus ${label} for ${basename(destFile)} — keeps file pixels, may take a few minutes. Wait for Proxy ready, then press Space`);
  await transcodeProxy(destFile, proxy, kind, { width: info.width, height: info.height }, info.hasAudio, (msg) => onLog?.(msg), info.duration);
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

async function extractPoster(id: string, src: string) {
  if (!(await ffmpegAvailable())) return undefined;
  const root = await mediaRoot();
  const poster = join(root, "proxies", `${id}.poster.jpg`);
  const result = await run(ffmpegBin, ["-y", "-ss", "0.15", "-i", src, "-frames:v", "1", "-q:v", "3", poster]);
  if (result.code !== 0 || !existsSync(poster)) return undefined;
  return mediaUrl(poster);
}

async function findPreparedWebm(src: string, dest: string) {
  for (const candidate of preparedSidecarCandidates(src, dest)) {
    if (!existsSync(candidate)) continue;
    const info = await probeFile(candidate);
    if (!needsPlaybackProxy(info.codec, candidate)) return { path: candidate, info };
  }
  return null;
}

export async function importMediaFiles(
  paths: string[],
  onLog?: (message: string, level?: "info" | "warn" | "error") => void,
  onUpdated?: (media: ImportedMedia) => void,
): Promise<ImportedMedia[]> {
  const root = await mediaRoot();
  const out: ImportedMedia[] = [];
  const proxyJobs: { media: ImportedMedia; dest: string; kind: "video" | "audio"; info: Probe }[] = [];
  const canFfmpeg = await ffmpegAvailable();
  if (!canFfmpeg) {
    onLog?.(
      "ffmpeg/ffprobe not found — H.264 MP4 will import but stay black until a WebM proxy exists. Reinstall this Producer (it bundles ffmpeg) or install ffmpeg on PATH. Or File → Prepare videos first.",
      "warn",
    );
  } else {
    onLog?.(`Using ffmpeg at ${ffmpegBin}`);
  }

  for (const src of collapseImportPaths(paths)) {
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
    let playPath = dest;
    let playInfo = info;
    let prepared = false;
    let proxyPath: string | undefined;
    if (kind !== "image" && needsPlaybackProxy(info.codec, dest)) {
      const ready = await findPreparedWebm(src, dest);
      if (ready) {
        playPath = ready.path;
        playInfo = ready.info;
        prepared = true;
        proxyPath = ready.path;
        onLog?.(
          `Using prepared WebM next to ${basename(src)} (${ready.info.width}×${ready.info.height}) — import will play immediately`,
        );
      }
    }
    const url = mediaUrl(playPath);
    let optimized = prepared || !needsPlaybackProxy(info.codec, dest);
    let proxyVersion: number | undefined;
    const canProxy =
      kind !== "image" &&
      needsPlaybackProxy(info.codec, dest) &&
      !prepared &&
      canFfmpeg &&
      shouldBuildFullProxy(bytes, info.width, info.height);
    if (kind !== "image" && (prepared || !needsPlaybackProxy(info.codec, dest))) {
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
    const posterUrl = kind === "video" ? await extractPoster(id, dest) : undefined;
    const media: ImportedMedia = {
      id,
      name: basename(src).replace(/\.[^.]+$/, ""),
      kind,
      width: playInfo.width || info.width,
      height: playInfo.height || info.height,
      duration: info.duration,
      fps: info.fps,
      url,
      codec: prepared ? playInfo.codec : info.codec,
      color: colorFor(kind),
      optimized,
      notes: prepared
        ? `${basename(src)} · ${sizeNote} · prepared WebM ${playInfo.width}×${playInfo.height} · plays now`
        : canProxy
          ? `${basename(src)} · ${sizeNote} · still showing first frame — building VP9+Opus WebM so Electron can play H.264`
          : `${basename(src)} · ${sizeNote} · ${proxyNote(info.codec, false, info.width, info.height)}${silent ? " · no audio track" : ""}`,
      originalPath: dest,
      proxyPath,
      proxyVersion,
      bytes,
      linked,
      posterUrl,
    };
    if (canProxy) {
      onLog?.(`Imported ${basename(src)} — picture should appear now. HQ WebM is building in the background (${formatBytes(bytes)}).`);
      proxyJobs.push({ media, dest, kind, info });
    }
    out.push(media);
  }

  if (proxyJobs.length) {
    void finishProxyJobs(proxyJobs, onLog, onUpdated);
  }
  return out;
}

async function finishProxyJobs(
  jobs: { media: ImportedMedia; dest: string; kind: "video" | "audio"; info: Probe }[],
  onLog?: (message: string, level?: "info" | "warn" | "error") => void,
  onUpdated?: (media: ImportedMedia) => void,
) {
  for (const job of jobs) {
    try {
      const proxyPath = await buildProxy(job.media.id, job.dest, job.kind, job.info, onLog);
      const silent = job.kind === "video" && !job.info.hasAudio;
      onUpdated?.({
        ...job.media,
        url: mediaUrl(proxyPath),
        optimized: true,
        proxyPath,
        proxyVersion: PROXY_VERSION,
        notes: `${basename(job.dest)} · ${largeMediaNote(job.media.bytes ?? 0, !!job.media.linked)} · ${proxyNote(job.info.codec, true, job.info.width, job.info.height)}${silent ? " · no audio track" : ""}`,
      });
    } catch (error) {
      onLog?.(error instanceof Error ? error.message : "Proxy transcode failed", "error");
      onLog?.(`Click Rebuild HQ after ffmpeg works. Until then the Stage shows the first-frame still for ${job.media.name}.`, "warn");
    }
  }
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

export async function pickPrepareMediaFiles(win: BrowserWindow | null) {
  const result = await dialog.showOpenDialog(win ?? (undefined as unknown as BrowserWindow), {
    title: "Prepare videos for Producer (writes a .webm next to each file)",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Video", extensions: ["mp4", "mov", "mkv", "avi", "mxf", "m4v", "mts", "mpg", "mpeg"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (result.canceled) return [] as string[];
  return result.filePaths;
}

export async function preparePlaybackFiles(
  paths: string[],
  mode: PrepareMode,
  onLog?: (message: string, level?: "info" | "warn" | "error") => void,
): Promise<{ dest: string; skipped: boolean }[]> {
  const canFfmpeg = await ffmpegAvailable();
  if (!canFfmpeg) {
    onLog?.(
      "Cannot prepare videos — ffmpeg not found. Reinstall this Producer (it bundles ffmpeg) or install ffmpeg on PATH.",
      "error",
    );
    return [];
  }
  const maxWidth = mode === "laptop" ? 1920 : undefined;
  const out: { dest: string; skipped: boolean }[] = [];
  onLog?.(
    mode === "laptop"
      ? `Preparing ${paths.length} file(s) as 1080p VP9+Opus WebM (smoother on a laptop). Leave this running.`
      : `Preparing ${paths.length} file(s) as full-size VP9+Opus WebM. Leave this running — large 4K files can take a while.`,
  );
  for (const src of paths) {
    const kind = mediaKind(src);
    if (kind !== "video" && kind !== "audio") {
      onLog?.(`Skipping ${basename(src)} — not a video/audio file`, "warn");
      continue;
    }
    const dest = siblingWebmPath(src);
    if (dest === src) {
      const already = await probeFile(src);
      if (!needsPlaybackProxy(already.codec, src)) {
        onLog?.(`${basename(src)} is already a Chromium WebM — import it as-is`);
        out.push({ dest, skipped: true });
        continue;
      }
    }
    const info = await probeFile(src);
    if (existsSync(dest) && dest !== src) {
      const built = await probeFile(dest);
      const srcStat = await stat(src);
      const destStat = await stat(dest);
      if (!needsPlaybackProxy(built.codec, dest) && destStat.mtimeMs >= srcStat.mtimeMs) {
        onLog?.(`Already prepared: ${basename(dest)} (${built.width}×${built.height})`);
        out.push({ dest, skipped: true });
        continue;
      }
    }
    const size = { ...scaledProxySize(info.width, info.height, maxWidth), maxWidth };
    try {
      onLog?.(`Preparing ${basename(src)} → ${basename(dest)} (${size.width || "?"}×${size.height || "?"})`);
      await transcodeProxy(src, dest, kind, size, info.hasAudio, (msg) => onLog?.(msg), info.duration, "Preparing");
      const built = await probeFile(dest);
      if (info.hasAudio && !built.hasAudio) {
        throw new Error(`Prepared ${basename(dest)} lost the soundtrack`);
      }
      onLog?.(`Ready to import: ${dest} (${built.width}×${built.height}${built.hasAudio ? " + audio" : ""})`);
      out.push({ dest, skipped: false });
    } catch (error) {
      onLog?.(error instanceof Error ? error.message : `Prepare failed for ${basename(src)}`, "error");
    }
  }
  if (out.length) {
    onLog?.(`Prepare finished. Import the .webm, or import the original MP4 — Producer will use the WebM sitting next to it.`);
  }
  return out;
}
