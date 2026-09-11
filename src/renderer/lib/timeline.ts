import type { Cue, Easing } from "../types/show";
import { ease } from "./easing";

export function cueEnd(cue: Cue) {
  return cue.start + Math.max(0, cue.duration);
}

export function cuesOverlap(a: Cue, b: Cue) {
  return a.start < cueEnd(b) && b.start < cueEnd(a);
}

export function overlapMs(a: Cue, b: Cue) {
  return Math.max(0, Math.min(cueEnd(a), cueEnd(b)) - Math.max(a.start, b.start));
}

export function isMedia(cue: Cue) {
  return cue.type === "media";
}

export function isAllowedOverlap(a: Cue, b: Cue) {
  if (a.layerId !== b.layerId) return true;
  if (!isMedia(a) || !isMedia(b)) return true;
  if (!cuesOverlap(a, b)) return true;
  const earlier = a.start <= b.start ? a : b;
  const later = earlier === a ? b : a;
  return !!(earlier.fadeOut && later.fadeIn);
}

export function cueHasConflict(cue: Cue, others: Cue[]) {
  if (!isMedia(cue) || !cue.enabled) return false;
  return others.some((other) => other.id !== cue.id && other.enabled && !isAllowedOverlap(cue, other));
}

export function conflictRanges(cue: Cue, others: Cue[]) {
  if (!cueHasConflict(cue, others)) return [];
  return others
    .filter((other) => other.id !== cue.id && other.enabled && !isAllowedOverlap(cue, other))
    .map((other) => ({
      start: Math.max(cue.start, other.start),
      end: Math.min(cueEnd(cue), cueEnd(other)),
    }))
    .filter((range) => range.end > range.start);
}

export function fadeDurations(cue: Cue, others: Cue[] = []) {
  let fadeIn = cue.fadeIn ? Math.max(0, cue.fadeInDuration) : 0;
  let fadeOut = cue.fadeOut ? Math.max(0, cue.fadeOutDuration) : 0;
  for (const other of others) {
    if (other.id === cue.id || !other.enabled || !isMedia(other) || other.layerId !== cue.layerId) continue;
    if (!cuesOverlap(cue, other) || !isAllowedOverlap(cue, other)) continue;
    const ov = overlapMs(cue, other);
    if (ov <= 0) continue;
    if (cue.start <= other.start) fadeOut = ov;
    else fadeIn = ov;
  }
  return { fadeIn, fadeOut };
}

export function fadeMultiplier(cue: Cue, localTime: number, others: Cue[] = []) {
  let m = 1;
  const curve: Easing = cue.fadeCurve || "linear";
  const { fadeIn, fadeOut } = fadeDurations(cue, others);
  if (fadeIn > 0) {
    m *= ease(curve, Math.min(1, Math.max(0, localTime / fadeIn)));
  }
  if (fadeOut > 0) {
    const remain = cue.duration - localTime;
    m *= ease(curve, Math.min(1, Math.max(0, remain / fadeOut)));
  }
  return m;
}

export function snapTime(value: number, anchors: number[], threshold: number) {
  let best = value;
  let bestDist = threshold;
  for (const anchor of anchors) {
    const dist = Math.abs(value - anchor);
    if (dist < bestDist) {
      bestDist = dist;
      best = anchor;
    }
  }
  return Math.max(0, best);
}

export function timelineAnchors(cues: Cue[], excludeIds: string[], playhead: number) {
  const skip = new Set(excludeIds);
  const anchors = [0, playhead];
  for (const cue of cues) {
    if (skip.has(cue.id)) continue;
    anchors.push(cue.start, cueEnd(cue));
  }
  return anchors;
}

export function findCrossfadePair(cues: Cue[], selectedIds: string[]): [Cue, Cue] | null {
  const media = cues.filter((c) => isMedia(c) && c.enabled);
  const selected = media.filter((c) => selectedIds.includes(c.id)).sort((a, b) => a.start - b.start);
  if (selected.length >= 2) return [selected[0], selected[1]];
  if (selected.length === 1) {
    const a = selected[0];
    const same = media.filter((c) => c.layerId === a.layerId && c.id !== a.id);
    const next = same.filter((c) => c.start >= a.start).sort((x, y) => x.start - y.start)[0];
    const prev = same.filter((c) => c.start < a.start).sort((x, y) => y.start - x.start)[0];
    const other = next ?? prev;
    if (!other) return null;
    return a.start <= other.start ? [a, other] : [other, a];
  }
  return null;
}

/** Always keep at least one timeline. */
export function removeTimelines<T extends { id: string }>(timelines: T[], ids: Iterable<string>): T[] {
  const drop = new Set(ids);
  const next = timelines.filter((t) => !drop.has(t.id));
  return next.length > 0 ? next : timelines;
}
