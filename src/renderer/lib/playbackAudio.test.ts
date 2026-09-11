import assert from "node:assert/strict";
import test from "node:test";
import { collectAudibleMedia } from "./playbackAudio";
import { emptyAsset, emptyCue, emptyShow } from "./showFactory";

test("video and audio cues on the playhead are audible; stills are not", () => {
  const show = emptyShow();
  const video = emptyAsset({ id: "v1", name: "Clip", kind: "video", url: "file:///clip.webm", duration: 8000 });
  const sting = emptyAsset({
    id: "a1",
    name: "Sting",
    kind: "audio",
    url: "file:///hit.wav",
    width: 0,
    height: 0,
    duration: 2000,
  });
  const still = emptyAsset({ id: "i1", name: "Card", kind: "image", url: "file:///card.png" });
  show.assets = [video, sting, still];
  const layerId = show.timelines[0].layers[0].id;
  show.timelines[0].playback = "play";
  show.timelines[0].playhead = 500;
  show.timelines[0].cues = [
    emptyCue({ id: "c-video", layerId, start: 0, duration: 8000, assetId: video.id, volume: 80 }),
    emptyCue({ id: "c-audio", layerId: show.timelines[0].layers[1].id, start: 0, duration: 2000, assetId: sting.id }),
    emptyCue({ id: "c-still", layerId: show.timelines[0].layers[2].id, start: 0, duration: 5000, assetId: still.id }),
  ];

  const clips = collectAudibleMedia(show);
  assert.deepEqual(
    clips.map((c) => c.cueId).sort(),
    ["c-audio", "c-video"],
  );
  assert.equal(clips.find((c) => c.cueId === "c-video")?.volume, 0.8);
  assert.equal(clips[0]?.playing, true);
});

test("paused timeline still lists clips so audio can freeze in sync", () => {
  const show = emptyShow();
  const video = emptyAsset({ id: "v1", name: "Clip", kind: "video", url: "file:///clip.webm" });
  show.assets = [video];
  const layerId = show.timelines[0].layers[0].id;
  show.timelines[0].playback = "pause";
  show.timelines[0].playhead = 1000;
  show.timelines[0].cues = [emptyCue({ id: "c-video", layerId, start: 0, duration: 8000, assetId: video.id })];
  const clips = collectAudibleMedia(show);
  assert.equal(clips.length, 1);
  assert.equal(clips[0].playing, false);
});

test("cues off the playhead are silent", () => {
  const show = emptyShow();
  const video = emptyAsset({ id: "v1", name: "Clip", kind: "video", url: "file:///clip.webm" });
  show.assets = [video];
  const layerId = show.timelines[0].layers[0].id;
  show.timelines[0].playback = "play";
  show.timelines[0].playhead = 9000;
  show.timelines[0].cues = [emptyCue({ id: "c-video", layerId, start: 0, duration: 8000, assetId: video.id })];
  assert.equal(collectAudibleMedia(show).length, 0);
});
