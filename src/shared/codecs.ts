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

export type ProxyKind = "video" | "audio" | "video-vp8" | "video-silent";

export interface ProxySize {
  width: number;
  height: number;
}

/** Chromium-safe WebM proxy. Keeps native pixel size and the first audio track as Opus. */
export function proxyFfmpegArgs(kind: ProxyKind, src: string, dest: string, size?: ProxySize): string[] {
  if (kind === "audio") {
    return ["-y", "-i", src, "-vn", "-c:a", "libopus", "-b:a", "192k", "-ar", "48000", dest];
  }
  const cpu = String(proxyCpuUsed(size?.width ?? 1920, size?.height ?? 1080));
  const maps = kind === "video-silent" ? ["-map", "0:v:0", "-an"] : ["-map", "0:v:0", "-map", "0:a:0?"];
  const audio = kind === "video-silent" ? [] : ["-c:a", "libopus", "-b:a", "192k", "-ac", "2", "-ar", "48000"];
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
    "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    ...audio,
    dest,
  ];
}
