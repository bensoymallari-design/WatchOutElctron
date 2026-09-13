import assert from "node:assert/strict";
import test from "node:test";
import { isPaintReady } from "./liveReady";

test("video-like sources need HAVE_CURRENT_DATA", () => {
  assert.equal(isPaintReady(null), false);
  assert.equal(isPaintReady({ readyState: 0, width: 1920, height: 1080 }), false);
  assert.equal(isPaintReady({ readyState: 2, width: 1920, height: 1080 }), true);
});

test("NDI canvas is ready once it has pixels", () => {
  assert.equal(isPaintReady({ width: 0, height: 0 }), false);
  assert.equal(isPaintReady({ width: 1280, height: 720 }), true);
});
