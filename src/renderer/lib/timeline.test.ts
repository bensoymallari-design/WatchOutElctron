import assert from "node:assert/strict";
import test from "node:test";
import type { Cue, Easing } from "../types/show";
import {
  cueHasConflict,
  cueEnd,
  cuesOverlap,
  fadeMultiplier,
  findCrossfadePair,
  isAllowedOverlap,
  overlapMs,
  removeTimelines,
  snapTime,
  purgeAssets,
} from "./timeline";

function cue(partial: Partial<Cue> & Pick<Cue, "id" | "start" | "duration" | "layerId">): Cue {
  return {
    type: "media",
    name: partial.name ?? partial.id,
    enabled: true,
    color: "#3b82c4",
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 100, y: 100 },
    rotation: { x: 0, y: 0, z: 0 },
    opacity: 100,
    volume: 100,
    blur: 0.5,
    brightness: 0,
    contrast: 0,
    saturation: 100,
    hue: 0,
    crop: { top: 0, bottom: 0, left: 0, right: 0 },
    anchor: { x: 0.5, y: 0.5 },
    freeRunning: false,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 500,
    fadeOutDuration: 500,
    fadeCurve: "linear" as Easing,
    tweens: [],
    ...partial,
  };
}

test("same-layer overlap is a conflict until fade-out + fade-in", () => {
  const a = cue({ id: "a", layerId: "l1", start: 0, duration: 4000 });
  const b = cue({ id: "b", layerId: "l1", start: 3000, duration: 4000 });
  assert.equal(cuesOverlap(a, b), true);
  assert.equal(overlapMs(a, b), 1000);
  assert.equal(isAllowedOverlap(a, b), false);
  assert.equal(cueHasConflict(a, [b]), true);

  const fadedA = { ...a, fadeOut: true };
  const fadedB = { ...b, fadeIn: true };
  assert.equal(isAllowedOverlap(fadedA, fadedB), true);
  assert.equal(cueHasConflict(fadedA, [fadedB]), false);
});

test("different layers may overlap without conflict", () => {
  const a = cue({ id: "a", layerId: "l1", start: 0, duration: 4000 });
  const b = cue({ id: "b", layerId: "l2", start: 0, duration: 4000 });
  assert.equal(isAllowedOverlap(a, b), true);
  assert.equal(cueHasConflict(a, [b]), false);
});

test("fade multiplier ramps in and out", () => {
  const a = cue({
    id: "a",
    layerId: "l1",
    start: 0,
    duration: 2000,
    fadeIn: true,
    fadeOut: true,
    fadeInDuration: 500,
    fadeOutDuration: 500,
  });
  assert.equal(fadeMultiplier(a, 0), 0);
  assert.ok(Math.abs(fadeMultiplier(a, 250) - 0.5) < 0.001);
  assert.equal(fadeMultiplier(a, 1000), 1);
  assert.ok(Math.abs(fadeMultiplier(a, 1750) - 0.5) < 0.001);
  assert.equal(fadeMultiplier(a, 2000), 0);
});

test("cross-fade uses overlap length as the dissolve", () => {
  const a = cue({ id: "a", layerId: "l1", start: 0, duration: 4000, fadeOut: true, fadeOutDuration: 2000 });
  const b = cue({ id: "b", layerId: "l1", start: 3000, duration: 4000, fadeIn: true, fadeInDuration: 2000 });
  assert.equal(fadeMultiplier(a, 3500, [b]), 0.5);
  assert.equal(fadeMultiplier(b, 500, [a]), 0.5);
});

test("snap and pair helpers", () => {
  assert.equal(snapTime(98, [0, 100, 200], 10), 100);
  assert.equal(cueEnd(cue({ id: "a", layerId: "l", start: 10, duration: 20 })), 30);
  const a = cue({ id: "a", layerId: "l1", start: 0, duration: 1000 });
  const b = cue({ id: "b", layerId: "l1", start: 2000, duration: 1000 });
  const pair = findCrossfadePair([a, b], ["a"]);
  assert.deepEqual(pair?.map((c) => c.id), ["a", "b"]);
});

test("deleting timelines always leaves at least one", () => {
  const tls = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(removeTimelines(tls, ["b"]).map((t) => t.id), ["a", "c"]);
  assert.deepEqual(removeTimelines(tls, ["a", "b", "c"]).map((t) => t.id), ["a", "b", "c"]);
  assert.deepEqual(removeTimelines([{ id: "only" }], ["only"]).map((t) => t.id), ["only"]);
});

test("purging an NDI or video asset also removes its timeline cues", () => {
  const show = {
    assets: [{ id: "ndi" }, { id: "clip" }],
    timelines: [
      {
        cues: [{ assetId: "ndi" }, { assetId: "clip" }, { assetId: undefined }],
      },
    ],
  };
  const next = purgeAssets(show, ["ndi"]);
  assert.deepEqual(
    next.assets.map((a) => a.id),
    ["clip"],
  );
  assert.deepEqual(
    next.timelines[0].cues.map((c) => c.assetId),
    ["clip", undefined],
  );
});
