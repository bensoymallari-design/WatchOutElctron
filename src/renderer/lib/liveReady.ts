/** Video uses readyState; NDI frames land on a canvas that has no readyState. */
export function isPaintReady(source: { readyState?: number; width?: number; height?: number } | null | undefined) {
  if (!source) return false;
  if (typeof source.readyState === "number") return source.readyState >= 2;
  return (source.width ?? 0) > 2 && (source.height ?? 0) > 2;
}
