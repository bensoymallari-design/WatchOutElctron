import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { app, dialog, type BrowserWindow } from "electron";
import { mediaKind, needsPlaybackProxy, proxyNote } from "../shared/codecs";
import type { ImportedMedia } from "../shared/ipc";

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

export function ffmpegAvailable() {
  toolsReady ??= (async () => {
    try {
      const a = await run(ffprobeBin, ["-version"]);
      const b = await run(ffmpegBin, ["-version"]);
      return a.code === 0 && b.code === 0;
    } catch {
      return false;
    }
  })();
  return toolsReady;
}

interface Probe {
  width: number;
  height: number;
  duration: number;
  fps: number;
  codec: string;
}

async function probeFile(filePath: string): Promise<Probe> {
  const fallback: Probe = { width: 1920, height: 1080, duration: 10000, fps: 60, codec: extname(filePath).slice(1).toUpperCase() || "BIN" };
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
      width: video?.width || (audio ? 0 : 1920),
      height: video?.height || (audio ? 0 : 1080),
      duration: Math.max(250, Math.round(durSec * 1000)),
      fps: Number.isFinite(fps) && fps > 1 ? fps : 60,
      codec: [video?.codec_name, audio?.codec_name].filter(Boolean).join(" + ") || fallback.codec,
    };
  } catch {
    return fallback;
  }
}

async function transcodeProxy(src: string, dest: string, kind: "video" | "audio", onProgress?: (msg: string) => void) {
  const args =
    kind === "audio"
      ? ["-y", "-i", src, "-vn", "-c:a", "libopus", "-b:a", "192k", dest]
      : [
          "-y",
          "-i",
          src,
          "-an",
          "-c:v",
          "libvpx",
          "-b:v",
          "8M",
          "-pix_fmt",
          "yuv420p",
          "-deadline",
          "realtime",
          "-cpu-used",
          "8",
          "-auto-alt-ref",
          "0",
          dest,
        ];
  const result = await run(ffmpegBin, args, (chunk) => {
    const time = chunk.match(/time=(\d+:\d+:\d+\.\d+)/);
    if (time) onProgress?.(`Transcoding ${basename(src)}  ${time[1]}`);
  });
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

let assetSeq = 0;

export async function importMediaFiles(
  paths: string[],
  onLog?: (message: string, level?: "info" | "warn" | "error") => void,
): Promise<ImportedMedia[]> {
  const root = await mediaRoot();
  const out: ImportedMedia[] = [];
  const canFfmpeg = await ffmpegAvailable();
  if (!canFfmpeg) onLog?.("ffmpeg/ffprobe not found — importing originals. Install ffmpeg for HAP/ProRes/H.264 proxies.", "warn");

  for (const src of paths) {
    const id = `asset_${Date.now().toString(36)}${(assetSeq++).toString(36)}`;
    const ext = extname(src) || ".bin";
    const dest = join(root, `${id}${ext}`);
    await copyFile(src, dest);
    const kind = mediaKind(src);
    const info = await probeFile(dest);
    let url = mediaUrl(dest);
    let optimized = !needsPlaybackProxy(info.codec, dest);
    let proxyPath: string | undefined;
    if (kind !== "image" && needsPlaybackProxy(info.codec, dest) && canFfmpeg) {
      const proxy = join(root, "proxies", `${id}.webm`);
      onLog?.(`Building VP9 playback proxy for ${basename(src)} (${info.codec})`);
      try {
        await transcodeProxy(dest, proxy, kind, (msg) => onLog?.(msg));
        url = mediaUrl(proxy);
        proxyPath = proxy;
        optimized = true;
        onLog?.(`Proxy ready: ${basename(src)}`);
      } catch (error) {
        optimized = false;
        onLog?.(error instanceof Error ? error.message : "Proxy transcode failed", "error");
      }
    }
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
      notes: `${basename(src)} · ${proxyNote(info.codec, !!proxyPath)}`,
      originalPath: dest,
      proxyPath,
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
