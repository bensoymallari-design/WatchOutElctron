import assert from "node:assert/strict";
import test from "node:test";
import {
  captureKindFromLabel,
  isCaptureCardLabel,
  isLaptopCameraLabel,
  mergeCaptureDevices,
  nextFreeDisplayId,
  sortCaptureInputs,
} from "./captureCards";

test("Cam Link / Magewell / USB Video count as capture cards; laptop webcam does not", () => {
  assert.equal(isCaptureCardLabel("Cam Link 4K"), true);
  assert.equal(isCaptureCardLabel("Magewell USB Capture HDMI 4K Plus"), true);
  assert.equal(isCaptureCardLabel("USB Video"), true);
  assert.equal(isCaptureCardLabel("AVerMedia Live Gamer 4K"), true);
  assert.equal(isCaptureCardLabel("Integrated Webcam"), false);
  assert.equal(isLaptopCameraLabel("Integrated Webcam"), true);
  assert.equal(captureKindFromLabel("Cam Link 4K"), "HDMI");
  assert.equal(captureKindFromLabel("Blackmagic DeckLink Mini Recorder"), "SDI");
  assert.equal(captureKindFromLabel("HD Webcam"), "USB");
});

test("capture cards sort ahead of the laptop camera", () => {
  const ranked = sortCaptureInputs([
    { deviceId: "cam", label: "Integrated Webcam" },
    { deviceId: "link", label: "Cam Link 4K" },
    { deviceId: "usb", label: "USB Video" },
  ]);
  assert.deepEqual(
    ranked.map((c) => c.deviceId),
    ["link", "usb", "cam"],
  );
});

test("merge assigns each card to a free display and keeps a previous pin", () => {
  const displays = [{ id: "left" }, { id: "center" }, { id: "right" }];
  const first = mergeCaptureDevices(
    [],
    [
      { deviceId: "a", label: "Cam Link 4K" },
      { deviceId: "b", label: "USB Video" },
      { deviceId: "c", label: "Magewell USB Capture" },
    ],
    displays,
  );
  assert.deepEqual(
    first.map((d) => d.deviceId),
    ["a", "c", "b"],
  );
  assert.deepEqual(
    first.map((d) => d.displayId),
    ["left", "center", "right"],
  );
  const originalB = first.find((d) => d.deviceId === "b")?.displayId;
  const moved = first.map((d) => (d.deviceId === "a" ? { ...d, displayId: "center" } : d));
  const again = mergeCaptureDevices(
    moved,
    [
      { deviceId: "a", label: "Cam Link 4K" },
      { deviceId: "b", label: "USB Video" },
    ],
    displays,
  );
  assert.equal(again.find((d) => d.deviceId === "a")?.displayId, "center");
  assert.equal(again.find((d) => d.deviceId === "b")?.displayId, originalB);
});

test("fourth card reuses the first display when only three controllers exist", () => {
  const displays = [{ id: "d1" }, { id: "d2" }, { id: "d3" }];
  assert.equal(nextFreeDisplayId(displays, ["d1", "d2", "d3"]), "d1");
  const merged = mergeCaptureDevices(
    [],
    [
      { deviceId: "1", label: "Card 1 HDMI" },
      { deviceId: "2", label: "Card 2 HDMI" },
      { deviceId: "3", label: "Card 3 HDMI" },
      { deviceId: "4", label: "Card 4 HDMI" },
    ],
    displays,
  );
  assert.equal(merged[3].displayId, "d1");
});
