import type { Cue, Tween, TweenType } from "@/types/show";
import { ease } from "@/lib/easing";
import { uid } from "@/lib/ids";
import { fadeMultiplier } from "@/lib/timeline";

export function evalTween(tween: Tween, localTime: number) {
  if (!tween.enabled || tween.points.length === 0) return undefined;
  const pts = [...tween.points].sort((a, b) => a.time - b.time);
  if (localTime <= pts[0].time) return pts[0].value;
  const last = pts[pts.length - 1];
  if (localTime >= last.time) return last.value;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (localTime <= b.time) {
      const span = Math.max(1, b.time - a.time);
      const t = ease(b.easing, (localTime - a.time) / span);
      return a.value + (b.value - a.value) * t;
    }
  }
  return last.value;
}

export interface EvaluatedCue {
  cue: Cue;
  localTime: number;
  opacity: number;
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  volume: number;
  blur: number;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  crop: Cue["crop"];
  wipe: number;
}

function tweenMap(cue: Cue) {
  const map = new Map<TweenType, Tween>();
  for (const t of cue.tweens) map.set(t.type, t);
  return map;
}

function pick(map: Map<TweenType, Tween>, type: TweenType, local: number, fallback: number) {
  const tw = map.get(type);
  if (!tw) return fallback;
  const v = evalTween(tw, local);
  return v === undefined ? fallback : v;
}

export function evaluateCue(cue: Cue, playhead: number, others: Cue[] = []): EvaluatedCue | null {
  if (!cue.enabled) return null;
  if (playhead < cue.start || playhead >= cue.start + cue.duration) return null;
  const local = playhead - cue.start;
  const map = tweenMap(cue);
  const opacity = pick(map, "opacity", local, cue.opacity) * fadeMultiplier(cue, local, others);
  return {
    cue,
    localTime: local,
    opacity,
    x: pick(map, "positionX", local, cue.position.x),
    y: pick(map, "positionY", local, cue.position.y),
    z: pick(map, "positionZ", local, cue.position.z),
    scaleX: pick(map, "scaleX", local, cue.scale.x),
    scaleY: pick(map, "scaleY", local, cue.scale.y),
    rotX: pick(map, "rotationX", local, cue.rotation.x),
    rotY: pick(map, "rotationY", local, cue.rotation.y),
    rotZ: pick(map, "rotationZ", local, cue.rotation.z),
    volume: cue.muted ? 0 : pick(map, "volume", local, cue.volume),
    blur: pick(map, "blur", local, cue.blur),
    brightness: pick(map, "brightness", local, cue.brightness),
    contrast: pick(map, "contrast", local, cue.contrast),
    saturation: pick(map, "saturation", local, cue.saturation),
    hue: pick(map, "hue", local, cue.hue),
    crop: {
      top: pick(map, "cropTop", local, cue.crop.top),
      bottom: pick(map, "cropBottom", local, cue.crop.bottom),
      left: pick(map, "cropLeft", local, cue.crop.left),
      right: pick(map, "cropRight", local, cue.crop.right),
    },
    wipe: pick(map, "wipeCompletion", local, 100),
  };
}

export function makeTween(
  type: TweenType,
  points: { time: number; value: number; easing?: Tween["points"][0]["easing"] }[],
): Tween {
  return {
    id: uid("tw"),
    type,
    enabled: true,
    visible: true,
    points: points.map((p) => ({
      id: uid("tp"),
      time: p.time,
      value: p.value,
      easing: p.easing ?? "linear",
    })),
  };
}

export function fadeTweens(duration: number, fadeIn: number, fadeOut: number): Tween[] {
  const tweens: Tween[] = [];
  if (fadeIn > 0) {
    tweens.push(makeTween("opacity", [
      { time: 0, value: 0, easing: "sineOut" },
      { time: fadeIn, value: 100, easing: "sineOut" },
    ]));
  }
  if (fadeOut > 0) {
    const start = Math.max(0, duration - fadeOut);
    const existing = tweens[0];
    if (existing) {
      existing.points.push(
        { id: uid("tp"), time: start, value: 100, easing: "sineIn" },
        { id: uid("tp"), time: duration, value: 0, easing: "sineIn" },
      );
    } else {
      tweens.push(makeTween("opacity", [
        { time: start, value: 100, easing: "sineIn" },
        { time: duration, value: 0, easing: "sineIn" },
      ]));
    }
  }
  return tweens;
}

export const TWEEN_META: Record<TweenType, { label: string; unit: string; min?: number; max?: number; group: string; color: string }> = {
  opacity: { label: "Opacity", unit: "%", min: 0, max: 100, group: "General", color: "#f0c14b" },
  volume: { label: "Volume", unit: "%", min: 0, max: 100, group: "General", color: "#7dd3fc" },
  blur: { label: "Gaussian Blur", unit: "", min: 0.5, max: 64, group: "General", color: "#c4b5fd" },
  positionX: { label: "Position X", unit: "px", group: "Transform", color: "#fb7185" },
  positionY: { label: "Position Y", unit: "px", group: "Transform", color: "#34d399" },
  positionZ: { label: "Position Z", unit: "px", group: "Transform", color: "#60a5fa" },
  scaleX: { label: "Scale X", unit: "%", min: 0, group: "Transform", color: "#f97316" },
  scaleY: { label: "Scale Y", unit: "%", min: 0, group: "Transform", color: "#eab308" },
  rotationX: { label: "Rotation X", unit: "°", group: "Transform", color: "#a78bfa" },
  rotationY: { label: "Rotation Y", unit: "°", group: "Transform", color: "#22d3ee" },
  rotationZ: { label: "Rotation Z", unit: "°", group: "Transform", color: "#f472b6" },
  brightness: { label: "Brightness", unit: "%", min: -100, max: 100, group: "Color", color: "#fde047" },
  contrast: { label: "Contrast", unit: "%", min: -100, max: 100, group: "Color", color: "#fdba74" },
  saturation: { label: "Saturation", unit: "%", min: 0, max: 200, group: "Color", color: "#4ade80" },
  hue: { label: "Hue", unit: "°", group: "Color", color: "#818cf8" },
  cropTop: { label: "Crop Top", unit: "%", min: 0, max: 100, group: "Crop", color: "#94a3b8" },
  cropBottom: { label: "Crop Bottom", unit: "%", min: 0, max: 100, group: "Crop", color: "#64748b" },
  cropLeft: { label: "Crop Left", unit: "%", min: 0, max: 100, group: "Crop", color: "#cbd5e1" },
  cropRight: { label: "Crop Right", unit: "%", min: 0, max: 100, group: "Crop", color: "#e2e8f0" },
  wipeCompletion: { label: "Linear Wipe", unit: "%", min: 0, max: 100, group: "Linear Wipe", color: "#38bdf8" },
};

export const EFFECT_TOGGLES: { type: TweenType; shortcut?: string }[] = [
  { type: "opacity", shortcut: "Alt+O" },
  { type: "positionX", shortcut: "Alt+P" },
  { type: "positionY" },
  { type: "scaleX", shortcut: "Alt+S" },
  { type: "scaleY" },
  { type: "rotationZ", shortcut: "Alt+Z" },
  { type: "rotationX", shortcut: "Alt+X" },
  { type: "rotationY", shortcut: "Alt+Y" },
  { type: "volume", shortcut: "Alt+V" },
  { type: "blur", shortcut: "Alt+B" },
  { type: "brightness" },
  { type: "contrast" },
  { type: "saturation" },
  { type: "hue" },
  { type: "cropTop", shortcut: "Alt+C" },
  { type: "wipeCompletion" },
];
