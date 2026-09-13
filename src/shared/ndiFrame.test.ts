import assert from "node:assert/strict";
import test from "node:test";
import { copyPixelBytes } from "./ndiFrame";

test("copyPixelBytes clones Uint8Array so contextBridge cannot empty it", () => {
  const src = Uint8Array.from([1, 2, 3, 4]);
  const copy = copyPixelBytes(src);
  assert.ok(copy);
  assert.deepEqual([...copy], [1, 2, 3, 4]);
  src[0] = 9;
  assert.equal(copy[0], 1);
});

test("copyPixelBytes accepts Node Buffer-shaped IPC objects", () => {
  const copy = copyPixelBytes({ type: "Buffer", data: [9, 8, 7, 255] });
  assert.deepEqual([...(copy ?? [])], [9, 8, 7, 255]);
});

test("copyPixelBytes decodes a base64 JPEG payload", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const copy = copyPixelBytes(jpeg.toString("base64"));
  assert.deepEqual([...(copy ?? [])], [0xff, 0xd8, 0xff, 0xd9]);
});
