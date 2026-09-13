import assert from "node:assert/strict";
import test from "node:test";
import {
  asNodeBuffer,
  clonePixels,
  copyBgraRows,
  downscaleBgra,
  FOURCC_BGRA,
  FOURCC_UYVY,
  fourccLabel,
  isBgraFourCC,
  NDI_OUTPUT_MAX_WIDTH,
  NDI_PREVIEW_MAX_WIDTH,
  swapRedBlue,
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
  assert.deepEqual([...asNodeBuffer(Buffer.from([5, 6]).toString("base64"))], [5, 6]);
});

test("clonePixels is a standalone Uint8Array Stage can paint", () => {
  const src = Buffer.from([10, 20, 30, 255]);
  const copy = clonePixels(src);
  assert.ok(copy instanceof Uint8Array);
  assert.equal(copy.buffer.byteLength, 4);
  src[0] = 99;
  assert.equal(copy[0], 10);
});

test("swapRedBlue turns BGRA into canvas RGBA", () => {
  const bgra = Buffer.from([9, 8, 7, 255]);
  const rgba = swapRedBlue(bgra);
  assert.deepEqual([...rgba], [7, 8, 9, 255]);
});

test("downscaleBgra shrinks 1920-wide frames for the Producer", () => {
  const src = Buffer.alloc(1920 * 1080 * 4, 80);
  const out = downscaleBgra(src, 1920, 1080, 960);
  assert.equal(out.width, 960);
  assert.equal(out.height, 540);
  assert.equal(out.bgra.length, 960 * 540 * 4);
});

test("Producer NDI preview is 960-wide so Stage stays light", () => {
  const src = Buffer.alloc(1920 * 1080 * 4, 80);
  const out = downscaleBgra(src, 1920, 1080, NDI_PREVIEW_MAX_WIDTH);
  assert.equal(out.width, 960);
  assert.equal(out.height, 540);
  assert.equal(NDI_PREVIEW_MAX_WIDTH, 960);
});

test("1080p and 4K NDI stay native for Output; only wider-than-wall senders shrink", () => {
  const hd = Buffer.alloc(1920 * 1080 * 4, 80);
  const hdOut = downscaleBgra(hd, 1920, 1080, NDI_OUTPUT_MAX_WIDTH);
  assert.equal(hdOut.width, 1920);
  assert.equal(hdOut.height, 1080);
  assert.equal(hdOut.bgra, hd);

  const fourK = Buffer.alloc(3840 * 2160 * 4, 80);
  const fourKOut = downscaleBgra(fourK, 3840, 2160, NDI_OUTPUT_MAX_WIDTH);
  assert.equal(fourKOut.width, 3840);
  assert.equal(fourKOut.height, 2160);

  const wall = Buffer.alloc(5760 * 1080 * 4, 80);
  const wallOut = downscaleBgra(wall, 5760, 1080, NDI_OUTPUT_MAX_WIDTH);
  assert.equal(wallOut.width, 5760);
  assert.equal(wallOut.height, 1080);
});
