import assert from "node:assert/strict";
import test from "node:test";
import { ffmpegCandidatePaths, ffprobeCandidatePaths } from "./ffmpegBins";

test("Windows lookup prefers env, then a bundled binary, then common install folders", () => {
  const paths = ffmpegCandidatePaths("win32", { FFMPEG_PATH: "D:\\tools\\ffmpeg.exe", ProgramFiles: "C:\\Program Files" }, "C:\\app\\ffmpeg.exe");
  assert.equal(paths[0], "D:\\tools\\ffmpeg.exe");
  assert.equal(paths[1], "C:\\app\\ffmpeg.exe");
  assert.ok(paths.includes("ffmpeg.exe"));
  assert.ok(paths.includes("C:\\ffmpeg\\bin\\ffmpeg.exe"));
  assert.ok(paths.includes("C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe"));
});

test("ffprobe uses FFPROBE_PATH on Windows", () => {
  const paths = ffprobeCandidatePaths("win32", { FFPROBE_PATH: "D:\\tools\\ffprobe.exe" }, undefined);
  assert.equal(paths[0], "D:\\tools\\ffprobe.exe");
  assert.ok(paths.includes("ffprobe.exe"));
});
