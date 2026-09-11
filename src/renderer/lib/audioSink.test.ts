import assert from "node:assert/strict";
import test from "node:test";
import { isHdmiAudioLabel } from "./audioSink";

test("HDMI-like playback devices are detected from Windows labels", () => {
  assert.equal(isHdmiAudioLabel("LG TV (NVIDIA High Definition Audio)"), true);
  assert.equal(isHdmiAudioLabel("AMD HDMI Output"), true);
  assert.equal(isHdmiAudioLabel("Speakers (Realtek Audio)"), false);
  assert.equal(isHdmiAudioLabel("Headphones"), false);
});
