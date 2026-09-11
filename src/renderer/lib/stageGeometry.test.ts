import assert from "node:assert/strict";
import test from "node:test";
import { displayForCue, fitTransform, hitDisplay, snapRect, snapValue } from "./stageGeometry";

const display = { id: "d1", name: "Display 1", x: 0, y: 0, z: 0, width: 1920, height: 1080, rotation: 0, outputType: "GPU" as const, channel: 1, nodeId: "local", enabled: true, blend: false, blendWidth: 128, virtual: false };

test("fit cover maps 1920x1080 media onto a 1920x1080 display at 1:1", () => {
  const fit = fitTransform({ width: 1920, height: 1080 }, display, "cover");
  assert.deepEqual(fit.position, { x: 0, y: 0, z: 0 });
  assert.deepEqual(fit.scale, { x: 100, y: 100 });
});

test("fit cover stretches other aspect ratios to the display pixels", () => {
  const fit = fitTransform({ width: 1280, height: 720 }, display, "cover");
  assert.equal(fit.position.x, 0);
  assert.equal(fit.position.y, 0);
  assert.equal(fit.scale.x, 150);
  assert.equal(fit.scale.y, 150);
});

test("fit contain letterboxes so no media pixels are cropped", () => {
  const fit = fitTransform({ width: 1920, height: 1920 }, display, "contain");
  assert.equal(fit.scale.x, 56.25);
  assert.equal(fit.scale.y, 56.25);
  assert.equal(fit.position.x, 420);
  assert.equal(fit.position.y, 0);
});

test("snap media left edge to a display edge", () => {
  const snapped = snapRect({ x: 8, y: 3, w: 1920, h: 1080 }, [0, 1920], [0, 1080], 12);
  assert.equal(snapped.x, 0);
  assert.equal(snapped.y, 0);
});

test("snapValue picks the nearest guide within threshold", () => {
  assert.equal(snapValue(5, [0, 1920], 8), 0);
  assert.equal(snapValue(40, [0, 1920], 8), 40);
});

test("hitDisplay prefers the topmost display", () => {
  const d2 = { ...display, id: "d2", x: 100, y: 100, name: "Display 2" };
  const hit = hitDisplay([display, d2], { x: 150, y: 150 });
  assert.equal(hit?.id, "d2");
});

test("displayForCue uses the display under the cue origin", () => {
  const right = { ...display, id: "right", x: 1920 };
  assert.equal(displayForCue([display, right], { position: { x: 1920, y: 0, z: 0 } }).id, "right");
});
