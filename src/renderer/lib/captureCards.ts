import type { CaptureDevice, Display } from "@/types/show";
import { isNdiWebcamLabel } from "./ndiCameras";

export interface CaptureInput {
  deviceId: string;
  label: string;
}

const CAPTURE_CARD_RE =
  /elgato|cam\s*link|magewell|avermedia|blackmagic|decklink|intensity|osprey|epiphan|live\s*gamer|gc\d+|hdmi|sdi|dvi|capture|usb\s*video|usb\s*3|video\s*capture|4k?\s*cap/i;

const LAPTOP_CAM_RE = /integrated|built.?in|face\s*time|isight|laptop|internal\s*camera|hd\s*webcam/i;

export function isCaptureCardLabel(label: string) {
  if (isNdiWebcamLabel(label)) return false;
  return CAPTURE_CARD_RE.test(label);
}

export function isLaptopCameraLabel(label: string) {
  return LAPTOP_CAM_RE.test(label) && !isCaptureCardLabel(label);
}

export function captureKindFromLabel(label: string): CaptureDevice["kind"] {
  if (isNdiWebcamLabel(label)) return "NDI";
  if (/\bsdi\b|decklink|intensity/i.test(label)) return "SDI";
  if (isCaptureCardLabel(label)) return "HDMI";
  return "USB";
}

export function tidyCaptureName(label: string) {
  const trimmed = label.replace(/\s+/g, " ").trim();
  return trimmed || "Capture card";
}

export function captureScore(label: string) {
  if (isCaptureCardLabel(label)) return 100;
  if (isNdiWebcamLabel(label)) return 40;
  if (isLaptopCameraLabel(label)) return 0;
  return 30;
}

export function sortCaptureInputs(inputs: CaptureInput[]) {
  return [...inputs].sort((a, b) => {
    const diff = captureScore(b.label) - captureScore(a.label);
    if (diff) return diff;
    return a.label.localeCompare(b.label);
  });
}

export function nextFreeDisplayId(displays: Pick<Display, "id">[], taken: Iterable<string | undefined>) {
  const used = new Set([...taken].filter((id): id is string => !!id));
  return displays.find((d) => !used.has(d.id))?.id ?? displays[0]?.id;
}

export function mergeCaptureDevices(
  existing: CaptureDevice[],
  inputs: CaptureInput[],
  displays: Pick<Display, "id">[],
): CaptureDevice[] {
  const ndiRows = existing.filter((d) => d.kind === "NDI" && !d.deviceId);
  const byDevice = new Map(existing.filter((d) => d.deviceId).map((d) => [d.deviceId as string, d]));
  const sorted = sortCaptureInputs(inputs);
  const taken: (string | undefined)[] = [];
  const cards: CaptureDevice[] = sorted.map((input) => {
    const prev = byDevice.get(input.deviceId);
    const displayId = prev?.displayId && displays.some((d) => d.id === prev.displayId)
      ? prev.displayId
      : nextFreeDisplayId(displays, taken);
    taken.push(displayId);
    return {
      id: prev?.id ?? `cap:${input.deviceId}`,
      name: tidyCaptureName(input.label),
      nodeId: prev?.nodeId ?? "local-runner",
      kind: captureKindFromLabel(input.label),
      signal: input.label,
      deviceId: input.deviceId,
      displayId,
      assetId: prev?.assetId,
    };
  });
  return [...cards, ...ndiRows];
}
