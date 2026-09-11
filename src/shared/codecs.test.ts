import assert from "node:assert/strict";
import test from "node:test";
import { mediaKind, needsHqRebuild, needsPlaybackProxy, proxyCpuUsed, proxyFfmpegArgs } from "./codecs";

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

test("video proxy keeps native pixels, VP9+Opus, and the first audio track", () => {
  const args = proxyFfmpegArgs("video", "in.mov", "out.webm", { width: 3840, height: 2160 });
  assert.equal(args.includes("-an"), false);
  assert.ok(args.includes("0:a:0?"));
  assert.ok(args.includes("libopus"));
  assert.ok(args.includes("libvpx-vp9"));
  assert.ok(args.includes("-crf"));
  assert.equal(args.includes("realtime"), false);
  assert.ok(args.includes("scale=trunc(iw/2)*2:trunc(ih/2)*2"));
});

test("4K proxies use a faster cpu-used than HD, never the old realtime 8", () => {
  assert.equal(proxyCpuUsed(3840, 2160), 6);
  assert.equal(proxyCpuUsed(1920, 1080), 5);
  assert.equal(proxyCpuUsed(1280, 720), 4);
});

test("audio-only proxy strips picture and encodes Opus", () => {
  const args = proxyFfmpegArgs("audio", "in.m4a", "out.webm");
  assert.ok(args.includes("-vn"));
  assert.ok(args.includes("libopus"));
});

test("vorbis fallback still maps an audio track", () => {
  const args = proxyFfmpegArgs("video-vorbis", "in.mp4", "out.webm");
  assert.equal(args.includes("-an"), false);
  assert.ok(args.includes("libvorbis"));
});

test("stale or missing HQ proxies need a rebuild; native wav does not", () => {
  assert.equal(
    needsHqRebuild({ kind: "video", codec: "h264", originalPath: "clip.mp4", proxyVersion: 2 }),
    true,
  );
  assert.equal(
    needsHqRebuild({ kind: "video", codec: "h264", originalPath: "clip.mp4", proxyVersion: 3 }),
    true,
  );
  assert.equal(
    needsHqRebuild({
      kind: "video",
      codec: "h264",
      originalPath: "clip.mp4",
      proxyPath: "clip.v3.webm",
      proxyVersion: 3,
    }),
    false,
  );
  assert.equal(needsHqRebuild({ kind: "audio", codec: "pcm_s16le", originalPath: "hit.wav", proxyVersion: 3 }), false);
  assert.equal(needsHqRebuild({ kind: "image", originalPath: "card.png" }), false);
});
