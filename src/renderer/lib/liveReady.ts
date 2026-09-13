/** Video uses readyState; NDI frames land on a canvas that has no readyState. */
export function isPaintReady(source: { readyState?: number; width?: number; height?: number } | null | undefined) {
  if (!source) return false;
  if (typeof source.readyState === "number") return source.readyState >= 2;
  return (source.width ?? 0) > 2 && (source.height ?? 0) > 2;
}

/** Output canvas bitmap = live NDI/capture raster, not a fixed 1280×720. */
export function liveRasterSize(
  source: { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | null | undefined,
  fallbackW = 1920,
  fallbackH = 1080,
) {
  const w = Number(source?.videoWidth || source?.width) || 0;
  const h = Number(source?.videoHeight || source?.height) || 0;
  if (w >= 2 && h >= 2) return { width: w, height: h };
  return { width: fallbackW, height: fallbackH };
}
