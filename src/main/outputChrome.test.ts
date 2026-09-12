import assert from "node:assert/strict";
import test from "node:test";
import { OUTPUT_WINDOW_CHROME } from "./outputChrome";

test("output windows have no Windows 11 rounded frame or resize border", () => {
  assert.equal(OUTPUT_WINDOW_CHROME.frame, false);
  assert.equal(OUTPUT_WINDOW_CHROME.roundedCorners, false);
  assert.equal(OUTPUT_WINDOW_CHROME.thickFrame, false);
  assert.equal(OUTPUT_WINDOW_CHROME.hasShadow, false);
  assert.equal(OUTPUT_WINDOW_CHROME.backgroundColor, "#000000");
});
