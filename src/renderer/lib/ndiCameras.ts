import { friendlyNdiName } from "./ndiNames";

export interface VideoInput {
  deviceId: string;
  label: string;
}

const NDI_WEBCAM_RE =
  /ndi\s*webcam|newtek\s*ndi|ndi\s*video|ndi\s*hx|ndi\s*camera|ndi\s*virtual/i;

export function isNdiWebcamLabel(label: string) {
  return NDI_WEBCAM_RE.test(label);
}

function tokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

export function cameraMatchesNdiSource(label: string, sourceName: string) {
  const friendly = friendlyNdiName(sourceName).toLowerCase();
  const l = label.toLowerCase();
  if (friendly.length >= 4 && l.includes(friendly)) return true;
  const sourceTokens = tokens(friendly);
  if (!sourceTokens.length) return false;
  const labelTokens = new Set(tokens(label));
  const hits = sourceTokens.filter((t) => labelTokens.has(t)).length;
  return hits >= Math.min(2, sourceTokens.length);
}

export function scoreCameraForNdi(label: string, sourceNames: string[]) {
  let score = 0;
  if (isNdiWebcamLabel(label)) score += 100;
  for (const name of sourceNames) {
    if (cameraMatchesNdiSource(label, name)) score += 40;
  }
  return score;
}

export function sortCamerasForNdi(cameras: VideoInput[], sourceNames: string[]) {
  return [...cameras].sort((a, b) => {
    const diff = scoreCameraForNdi(b.label, sourceNames) - scoreCameraForNdi(a.label, sourceNames);
    if (diff) return diff;
    return a.label.localeCompare(b.label);
  });
}

export function preferredCameraId(cameras: VideoInput[], sourceNames: string[]) {
  const ranked = sortCamerasForNdi(cameras, sourceNames);
  const best = ranked[0];
  if (!best) return "";
  return scoreCameraForNdi(best.label, sourceNames) > 0 ? best.deviceId : ranked[0]?.deviceId ?? "";
}

export const NDI_TOOLS_URL = "https://ndi.video/tools/";
export const NDI_RUNTIME_URL = "https://ndi.video/tools/ndi-runtime/";
