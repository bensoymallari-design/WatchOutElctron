import assert from "node:assert/strict";
import test from "node:test";
import { copyBgraRows, downscaleBgra, FOURCC_BGRA, isBgraFourCC } from "./ndiPixels";

test("BGRA FourCC matches NDI BGRA/BGRX", () => {
  assert.equal(isBgraFourCC(FOURCC_BGRA), true);
  assert.equal(isBgraFourCC(0x58524742), true);
  assert.equal(isBgraFourCC(0x59565955), false);
});

test("copyBgraRows does not read past a UYVY-sized buffer", () => {
  const width = 8;
  const height = 2;
  const uyvyStride = width * 2;
  const src = Buffer.alloc(uyvyStride * height, 7);
  const packed = copyBgraRows(src, width, height, uyvyStride);
  assert.equal(packed.length, width * height * 4);
});

test("downscaleBgra shrinks 1920-wide frames for the Producer", () => {
  const src = Buffer.alloc(1920 * 1080 * 4, 80);
  const out = downscaleBgra(src, 1920, 1080, 960);
  assert.equal(out.width, 960);
  assert.equal(out.height, 540);
  assert.equal(out.bgra.length, 960 * 540 * 4);
});
