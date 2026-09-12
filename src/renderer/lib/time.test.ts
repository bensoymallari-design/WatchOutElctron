import assert from "node:assert/strict";
import test from "node:test";
import { formatMs, formatPlayTime, parseTimecode } from "./time";

test("play time shows clock, seconds, and milliseconds", () => {
  assert.equal(formatMs(125040), "00:02:05.040");
  assert.equal(formatPlayTime(125040), "00:02:05.040  ·  125.040 s  ·  125040 ms");
  assert.equal(formatPlayTime(0), "00:00:00.000  ·  0.000 s  ·  0 ms");
  assert.equal(parseTimecode("00:02:05.040"), 125040);
  assert.equal(parseTimecode("125.04"), 125040);
});
