import { shouldBuildFullProxy } from "./mediaPolicy";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "tif", "tiff"]);
const AUDIO_EXT = new Set(["wav", "flac", "ogg", "opus", "mp3", "m4a", "aac", "aif", "aiff"]);
const VIDEO_EXT = new Set(["mp4", "mov", "mkv", "avi", "webm", "ogv", "m4v", "mxf", "wmv", "mpg", "mpeg", "ts", "mts"]);

const CHROMIUM_VIDEO = /(vp8|vp9|av1|av01|theora)/i;
const CHROMIUM_AUDIO = /(opus|vorbis|flac|pcm|mp3|mpeg audio)/i;
const HARD_VIDEO = /(prores|hap|dnx|hevc|h\.?265|h\.?264|avc|mpeg-?2|mpeg-?4|apcn|apch|apco|dnxhd|cfhd|cineform)/i;

/** Bump when proxy encode settings change so old silent/soft WebMs are rebuilt. */
export const PROXY_VERSION = 3;

export function extOf(filePath: string) {
  const base = filePath.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function mediaKind(filePath: string, mime = ""): "image" | "video" | "audio" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const ext = extOf(filePath);
  if (IMAGE_EXT.has(ext)) return "image";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (VIDEO_EXT.has(ext)) return "video";
  return "video";
}

export function needsPlaybackProxy(codec: string, filePath: string, mime = "") {
  const kind = mediaKind(filePath, mime);
  if (kind === "image") return false;
  const ext = extOf(filePath);
  const blob = `${codec} ${mime} ${ext}`;
  if (kind === "audio") {
    if (CHROMIUM_AUDIO.test(blob) || ext === "wav" || ext === "ogg" || ext === "opus" || ext === "flac") return false;
    return /aac|alac|ac-?3|ec-?3|wma/i.test(blob);
  }
  if (CHROMIUM_VIDEO.test(blob) && (ext === "webm" || ext === "ogv" || /webm/i.test(mime))) return false;
  if (ext === "webm" && !HARD_VIDEO.test(blob)) return false;
  return true;
}

export function proxyNote(codec: string, usedProxy: boolean, width = 0, height = 0) {
  const size = width > 0 && height > 0 ? `${width}×${height}` : "";
  if (!usedProxy) return `Native Chromium decode · ${codec}${size ? ` · ${size}` : ""}`;
  return `Playback proxy (VP9+Opus/WebM ${size || "native"}) · source ${codec}`;
}

export function proxyCpuUsed(width: number, height: number) {
  const px = Math.max(1, width) * Math.max(1, height);
  if (px >= 3800 * 2100) return 6;
  if (px >= 1900 * 1000) return 5;
  return 4;
}

export type ProxyKind = "video" | "audio" | "video-vp8" | "video-vorbis" | "video-silent";

export function needsHqRebuild(asset: {
  kind: string;
  codec?: string;
  originalPath?: string;
  proxyPath?: string;
  proxyVersion?: number;
  bytes?: number;
  linked?: boolean;
  width?: number;
  height?: number;
}) {
  if (asset.kind !== "video" && asset.kind !== "audio") return false;
  if (!asset.originalPath) return false;
  if ((asset.bytes ?? 0) > 0 && !shouldBuildFullProxy(asset.bytes ?? 0, asset.width ?? 0, asset.height ?? 0)) return false;
  if (asset.proxyVersion !== PROXY_VERSION) return true;
  if (asset.proxyPath) return false;
  return needsPlaybackProxy(asset.codec || "", asset.originalPath);
}

export interface ProxySize {
  width: number;
  height: number;
  maxWidth?: number;
}

export type PrepareMode = "native" | "laptop";

/** Same-folder VP9 file users can bake overnight and import without waiting. */
export function siblingWebmPath(filePath: string) {
  const ext = extOf(filePath);
  if (ext === "webm") return filePath;
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const dot = filePath.lastIndexOf(".");
  if (dot > slash) return `${filePath.slice(0, dot)}.webm`;
  return `${filePath}.webm`;
}

export function preparedSidecarCandidates(src: string, dest = src) {
  return [...new Set([siblingWebmPath(src), siblingWebmPath(dest)])];
}

/** Drop a .webm from the picker when the matching MP4/MOV is also selected. */
export function collapseImportPaths(paths: string[]) {
  return paths.filter((p) => {
    if (extOf(p) !== "webm") return true;
    return !paths.some((other) => other !== p && siblingWebmPath(other) === p);
  });
}

export function scaledProxySize(width: number, height: number, maxWidth?: number): ProxySize {
  let w = Math.max(0, width);
  let h = Math.max(0, height);
  if (maxWidth && w > maxWidth) {
    h = Math.round((h * maxWidth) / w) || 2;
    w = maxWidth;
  }
  return {
    width: w > 0 ? Math.max(2, Math.floor(w / 2) * 2) : 0,
    height: h > 0 ? Math.max(2, Math.floor(h / 2) * 2) : 0,
  };
}

export function proxyScaleFilter(size?: ProxySize) {
  const fitted = scaledProxySize(size?.width ?? 0, size?.height ?? 0, size?.maxWidth);
  if (fitted.width > 0 && fitted.height > 0) return `scale=${fitted.width}:${fitted.height}`;
  return "scale=trunc(iw/2)*2:trunc(ih/2)*2";
}

function quoteFfmpegArg(value: string) {
  if (!/[ \t"]/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

/** Command to bake a Chromium-safe WebM next to the master, outside Producer. */
export function proxyFfmpegCli(src: string, dest = siblingWebmPath(src), size?: ProxySize) {
  return ["ffmpeg", ...proxyFfmpegArgs("video", src, dest, size)].map(quoteFfmpegArg).join(" ");
}

/** Chromium-safe WebM proxy. Keeps native pixel size and the first audio track as Opus. */
export function proxyFfmpegArgs(kind: ProxyKind, src: string, dest: string, size?: ProxySize): string[] {
  if (kind === "audio") {
    return ["-y", "-i", src, "-vn", "-c:a", "libopus", "-b:a", "192k", "-ar", "48000", dest];
  }
  const cpuSize = scaledProxySize(size?.width || 1920, size?.height || 1080, size?.maxWidth);
  const cpu = String(proxyCpuUsed(cpuSize.width || 1920, cpuSize.height || 1080));
  const maps = kind === "video-silent" ? ["-map", "0:v:0", "-an"] : ["-map", "0:v:0", "-map", "0:a:0?"];
  const audio =
    kind === "video-silent"
      ? []
      : kind === "video-vorbis"
        ? ["-c:a", "libvorbis", "-q:a", "5", "-ac", "2"]
        : ["-c:a", "libopus", "-b:a", "192k", "-ac", "2", "-ar", "48000"];
  const video =
    kind === "video-vp8"
      ? ["-c:v", "libvpx", "-crf", "10", "-b:v", "0", "-deadline", "good", "-cpu-used", cpu, "-auto-alt-ref", "0"]
      : ["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-row-mt", "1", "-tile-columns", "2", "-threads", "0", "-deadline", "good", "-cpu-used", cpu, "-g", "120"];
  return [
    "-y",
    "-i",
    src,
    ...maps,
    ...video,
    "-pix_fmt",
    "yuv420p",
    "-vf",
    proxyScaleFilter(size),
    ...audio,
    dest,
  ];
}
