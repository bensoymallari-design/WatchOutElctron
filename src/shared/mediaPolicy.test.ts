import assert from "node:assert/strict";
import test from "node:test";
import {
  COPY_LIMIT_BYTES,
  formatBytes,
  shouldBuildFullProxy,
  shouldCopyOnImport,
  videoPreload,
} from "./mediaPolicy";

test("100 GB masters are linked, not copied into the app library", () => {
  const hundredGb = 100 * 1024 * 1024 * 1024;
  assert.equal(shouldCopyOnImport(hundredGb), false);
  assert.equal(shouldCopyOnImport(500 * 1024 * 1024), true);
  assert.equal(shouldCopyOnImport(COPY_LIMIT_BYTES), false);
});

test("huge 4K files skip a full-res VP9 proxy", () => {
  assert.equal(shouldBuildFullProxy(100 * 1024 * 1024 * 1024, 3840, 2160), false);
  assert.equal(shouldBuildFullProxy(200 * 1024 * 1024, 1920, 1080), true);
});

test("large files use metadata preload so Chromium does not buffer 100 GB", () => {
  assert.equal(videoPreload(100 * 1024 * 1024 * 1024), "metadata");
  assert.equal(videoPreload(20 * 1024 * 1024), "auto");
});

test("formats byte counts for the log", () => {
  assert.equal(formatBytes(100 * 1024 * 1024 * 1024), "100.00 GB");
});
