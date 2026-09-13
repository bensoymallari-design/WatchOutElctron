import assert from "node:assert/strict";
import test from "node:test";
import {
  asNodeBuffer,
  copyBgraRows,
  downscaleBgra,
  FOURCC_BGRA,
  FOURCC_UYVY,
  fourccLabel,
  isBgraFourCC,
  uyvyToBgra,
  videoToBgra,
} from "./ndiPixels";

test("BGRA FourCC matches NDI BGRA/BGRX", () => {
  assert.equal(isBgraFourCC(FOURCC_BGRA), true);
  assert.equal(isBgraFourCC(0x58524742), true);
  assert.equal(isBgraFourCC(FOURCC_UYVY), false);
  assert.equal(fourccLabel(FOURCC_UYVY), "UYVY");
});

test("copyBgraRows does not read past a UYVY-sized buffer", () => {
  const width = 8;
  const height = 2;
  const uyvyStride = width * 2;
  const src = Buffer.alloc(uyvyStride * height, 7);
  const packed = copyBgraRows(src, width, height, uyvyStride);
  assert.equal(packed.length, width * height * 4);
});

test("UYVY converts to BGRA pixels WatchJhon can paint", () => {
  const width = 2;
  const height = 1;
  const src = Buffer.from([128, 235, 128, 16]);
  const bgra = uyvyToBgra(src, width, height, 4);
  assert.equal(bgra.length, 8);
  assert.ok(bgra[2] > 200);
  assert.ok(bgra[4] < 40);
});

test("videoToBgra treats OBS fastest UYVY as picture", () => {
  const src = Buffer.from([128, 235, 128, 16, 128, 235, 128, 16]);
  const bgra = videoToBgra(src, 2, 2, 4, FOURCC_UYVY);
  assert.equal(bgra.length, 16);
});

test("asNodeBuffer accepts Uint8Array from the NDI helper", () => {
  const raw = Uint8Array.from([1, 2, 3, 4]);
  assert.deepEqual([...asNodeBuffer(raw)], [1, 2, 3, 4]);
  assert.deepEqual([...asNodeBuffer({ data: [9, 8] })], [9, 8]);
});

test("downscaleBgra shrinks 1920-wide frames for the Producer", () => {
  const src = Buffer.alloc(1920 * 1080 * 4, 80);
  const out = downscaleBgra(src, 1920, 1080, 960);
  assert.equal(out.width, 960);
  assert.equal(out.height, 540);
  assert.equal(out.bgra.length, 960 * 540 * 4);
});
