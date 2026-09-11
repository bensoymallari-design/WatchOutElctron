import assert from "node:assert/strict";
import test from "node:test";
import { mediaKind, needsPlaybackProxy } from "./codecs";

test("classifies common media extensions", () => {
  assert.equal(mediaKind("wall.png"), "image");
  assert.equal(mediaKind("sting.wav"), "audio");
  assert.equal(mediaKind("show.mov"), "video");
  assert.equal(mediaKind("loop.webm"), "video");
});

test("webm vp9 plays natively", () => {
  assert.equal(needsPlaybackProxy("vp9", "loop.webm", "video/webm"), false);
});

test("prores / hap / h264 get a webm proxy because stock Electron lacks those codecs", () => {
  assert.equal(needsPlaybackProxy("prores", "clip.mov"), true);
  assert.equal(needsPlaybackProxy("hap", "clip.mov"), true);
  assert.equal(needsPlaybackProxy("h264", "clip.mp4", "video/mp4"), true);
  assert.equal(needsPlaybackProxy("hevc", "clip.mp4"), true);
});

test("wav does not need a proxy", () => {
  assert.equal(needsPlaybackProxy("pcm_s16le", "hit.wav"), false);
});
