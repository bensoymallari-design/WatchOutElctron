import assert from "node:assert/strict";
import test from "node:test";
import {
  cameraMatchesNdiSource,
  isNdiWebcamLabel,
  preferredCameraId,
  scoreCameraForNdi,
  sortCamerasForNdi,
} from "./ndiCameras";

test("detects NDI Webcam Input and NewTek virtual cameras", () => {
  assert.equal(isNdiWebcamLabel("NDI Webcam Video 1"), true);
  assert.equal(isNdiWebcamLabel("NewTek NDI Video"), true);
  assert.equal(isNdiWebcamLabel("NDI HX Camera"), true);
  assert.equal(isNdiWebcamLabel("Integrated Webcam"), false);
});

test("matches a webcam label to an NDI Camera Pro source name", () => {
  assert.equal(cameraMatchesNdiSource("NDI Webcam Video 1", "PIXEL (NDI Camera)"), false);
  assert.equal(cameraMatchesNdiSource("PIXEL NDI Camera", "PIXEL (NDI Camera)"), true);
});

test("prefers NDI Webcam over the laptop camera", () => {
  const cameras = [
    { deviceId: "laptop", label: "Integrated Webcam" },
    { deviceId: "ndi", label: "NDI Webcam Video 1" },
  ];
  const ranked = sortCamerasForNdi(cameras, ["ANDROID (NDI Camera Pro)"]);
  assert.equal(ranked[0].deviceId, "ndi");
  assert.ok(scoreCameraForNdi("NDI Webcam Video 1", ["ANDROID (NDI Camera Pro)"]) > 0);
  assert.equal(preferredCameraId(cameras, ["ANDROID (NDI Camera Pro)"]), "ndi");
});
