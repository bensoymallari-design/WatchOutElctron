const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "tif", "tiff"]);
const AUDIO_EXT = new Set(["wav", "flac", "ogg", "opus", "mp3", "m4a", "aac", "aif", "aiff"]);
const VIDEO_EXT = new Set(["mp4", "mov", "mkv", "avi", "webm", "ogv", "m4v", "mxf", "wmv", "mpg", "mpeg", "ts", "mts"]);

const CHROMIUM_VIDEO = /(vp8|vp9|av1|av01|theora)/i;
const CHROMIUM_AUDIO = /(opus|vorbis|flac|pcm|mp3|mpeg audio)/i;
const HARD_VIDEO = /(prores|hap|dnx|hevc|h\.?265|h\.?264|avc|mpeg-?2|mpeg-?4|apcn|apch|apco|dnxhd|cfhd|cineform)/i;

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

export function proxyNote(codec: string, usedProxy: boolean) {
  if (!usedProxy) return `Native Chromium decode · ${codec}`;
  return `Playback proxy (VP8/WebM) · source ${codec}`;
}
