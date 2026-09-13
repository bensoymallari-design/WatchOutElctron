import assert from "node:assert/strict";
import test from "node:test";
import { isPaintReady, liveRasterSize } from "./liveReady";

test("video-like sources need HAVE_CURRENT_DATA", () => {
  assert.equal(isPaintReady(null), false);
  assert.equal(isPaintReady({ readyState: 0, width: 1920, height: 1080 }), false);
  assert.equal(isPaintReady({ readyState: 2, width: 1920, height: 1080 }), true);
});

test("NDI canvas is ready once it has pixels", () => {
  assert.equal(isPaintReady({ width: 0, height: 0 }), false);
  assert.equal(isPaintReady({ width: 1280, height: 720 }), true);
});

test("Output NDI canvas uses the sender raster, not 1280×720", () => {
  assert.deepEqual(liveRasterSize({ width: 1920, height: 1080 }), { width: 1920, height: 1080 });
  assert.deepEqual(liveRasterSize({ width: 5760, height: 1080 }), { width: 5760, height: 1080 });
  assert.deepEqual(liveRasterSize({ videoWidth: 3840, videoHeight: 2160, width: 2, height: 2 }), {
    width: 3840,
    height: 2160,
  });
  assert.deepEqual(liveRasterSize(null), { width: 1920, height: 1080 });
});
