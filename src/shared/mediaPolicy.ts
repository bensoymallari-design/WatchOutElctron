/** Copying a 100 GB master into userData would fill the system drive and stall import. */
export const COPY_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;
/** A full-res VP9 of a 100 GB 4K master can take longer than the event load-in. */
export const FULL_PROXY_LIMIT_BYTES = 8 * 1024 * 1024 * 1024;

export function shouldCopyOnImport(bytes: number) {
  return bytes > 0 && bytes < COPY_LIMIT_BYTES;
}

export function shouldBuildFullProxy(bytes: number, width = 0, height = 0) {
  if (bytes >= FULL_PROXY_LIMIT_BYTES) return false;
  const px = Math.max(0, width) * Math.max(0, height);
  if (px >= 3800 * 2100 && bytes >= 4 * 1024 * 1024 * 1024) return false;
  return true;
}

export function videoPreload(bytes?: number): "auto" | "metadata" {
  if (bytes != null && bytes >= COPY_LIMIT_BYTES) return "metadata";
  return "auto";
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i >= 3 ? 2 : i >= 2 ? 1 : 0;
  return `${n.toFixed(digits)} ${units[i]}`;
}

export function largeMediaNote(bytes: number, linked: boolean) {
  const size = formatBytes(bytes);
  if (linked) return `Linked ${size} on disk (not copied) · streams from the original file`;
  return size;
}
