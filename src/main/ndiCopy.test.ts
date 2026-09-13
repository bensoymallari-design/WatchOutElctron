import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import {
  NDI_VIDEO_FRAME_SIZE,
  NDI_VIDEO_P_DATA_OFFSET,
  NDI_VIDEO_STRIDE_OFFSET,
  bindMemcpy,
  copyNdiPointer,
  memcpyDlls,
  ndiFrameKindName,
  readNdiVideoHeader,
} from "./ndiCopy";

const require = createRequire(import.meta.url);

test("Windows copies NDI pixels from ucrtbase, Linux from libc", () => {
  assert.deepEqual(memcpyDlls("win32"), ["ucrtbase.dll", "msvcrt.dll"]);
  assert.deepEqual(memcpyDlls("linux"), ["libc.so.6"]);
});

test("NDI video_frame_v2 layout matches the Runtime struct", () => {
  const koffi = require("koffi") as typeof import("koffi");
  const VideoFrame = koffi.struct("NDIlib_video_frame_v2_t", {
    xres: "int",
    yres: "int",
    FourCC: "int",
    frame_rate_N: "int",
    frame_rate_D: "int",
    picture_aspect_ratio: "float",
    frame_format_type: "int",
    timecode: "int64",
    p_data: "void *",
    line_stride_in_bytes: "int",
    p_metadata: "void *",
    timestamp: "int64",
  });
  assert.equal(koffi.sizeof(VideoFrame), NDI_VIDEO_FRAME_SIZE);
  assert.equal(koffi.offsetof(VideoFrame, "p_data"), NDI_VIDEO_P_DATA_OFFSET);
  assert.equal(koffi.offsetof(VideoFrame, "line_stride_in_bytes"), NDI_VIDEO_STRIDE_OFFSET);
});

test("readNdiVideoHeader pulls size and pixel pointer from a capture buffer", () => {
  const buf = Buffer.alloc(NDI_VIDEO_FRAME_SIZE);
  buf.writeInt32LE(1920, 0);
  buf.writeInt32LE(1080, 4);
  buf.writeUInt32LE(0x41524742, 8);
  buf.writeBigUInt64LE(0x12345678n, NDI_VIDEO_P_DATA_OFFSET);
  buf.writeInt32LE(1920 * 4, NDI_VIDEO_STRIDE_OFFSET);
  const header = readNdiVideoHeader(buf);
  assert.equal(header?.xres, 1920);
  assert.equal(header?.yres, 1080);
  assert.equal(header?.FourCC, 0x41524742);
  assert.equal(header?.p_data, 0x12345678n);
  assert.equal(header?.line_stride_in_bytes, 7680);
});

test("memcpy copies NDI pixels without koffi.view (Electron forbids external buffers)", () => {
  const koffi = require("koffi") as typeof import("koffi");
  const memcpy = bindMemcpy(koffi);
  assert.ok(memcpy, "libc/ucrt memcpy should load in CI");
  const native = koffi.alloc("uint8_t", 8);
  koffi.encode(native, "uint8_t", [9, 8, 7, 255, 1, 2, 3, 4], 8);
  const dest = copyNdiPointer(koffi, memcpy, native, 8);
  assert.deepEqual([...dest], [9, 8, 7, 255, 1, 2, 3, 4]);
});

test("ndiFrameKindName names DistroAV capture results", () => {
  assert.equal(ndiFrameKindName(0), "none");
  assert.equal(ndiFrameKindName(1), "video");
  assert.equal(ndiFrameKindName(4), "error");
  assert.equal(ndiFrameKindName(100), "status");
});
