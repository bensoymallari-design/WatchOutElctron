export const FOURCC_UYVY = 0x59565955;
export const FOURCC_BGRA = 0x41524742;
export const FOURCC_BGRX = 0x58524742;
export const FOURCC_RGBA = 0x41424752;
export const FOURCC_RGBX = 0x58424752;

export function fourccLabel(fourcc: number) {
  if (!fourcc) return "BGRA";
  const a = fourcc & 0xff;
  const b = (fourcc >> 8) & 0xff;
  const c = (fourcc >> 16) & 0xff;
  const d = (fourcc >> 24) & 0xff;
  const s = String.fromCharCode(a, b, c, d);
  return /[A-Z0-9]{4}/i.test(s) ? s : `0x${(fourcc >>> 0).toString(16)}`;
}

export function isBgraFourCC(fourcc: number) {
  return fourcc === FOURCC_BGRA || fourcc === FOURCC_BGRX || fourcc === 0;
}

function clamp(n: number) {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

function yuvToBgra(y: number, u: number, v: number, out: Buffer, di: number) {
  const c = y - 16;
  const d = u - 128;
  const e = v - 128;
  out[di] = clamp((298 * c + 516 * d + 128) >> 8);
  out[di + 1] = clamp((298 * c - 100 * d - 208 * e + 128) >> 8);
  out[di + 2] = clamp((298 * c + 409 * e + 128) >> 8);
  out[di + 3] = 255;
}

export function uyvyToBgra(src: Buffer, width: number, height: number, stride: number) {
  const row = Math.max(stride, width * 2);
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const rs = y * row;
    for (let x = 0; x < width; x += 2) {
      const i = rs + x * 2;
      if (i + 3 >= src.length) break;
      const u = src[i];
      const y0 = src[i + 1];
      const v = src[i + 2];
      const y1 = src[i + 3];
      const di = (y * width + x) * 4;
      yuvToBgra(y0, u, v, out, di);
      if (x + 1 < width) yuvToBgra(y1, u, v, out, di + 4);
    }
  }
  return out;
}

export function copyBgraRows(src: Buffer, width: number, height: number, stride: number) {
  const row = width * 4;
  const packed = Buffer.alloc(row * height);
  const srcStride = stride > 0 ? stride : row;
  if (srcStride === row && src.length >= packed.length) {
    src.copy(packed, 0, 0, packed.length);
    return packed;
  }
  for (let y = 0; y < height; y++) {
    const start = y * srcStride;
    const end = Math.min(src.length, start + row);
    if (end <= start) break;
    src.copy(packed, y * row, start, end);
  }
  return packed;
}

export function rgbaToBgra(src: Buffer, width: number, height: number, stride: number) {
  const packed = copyBgraRows(src, width, height, stride);
  for (let i = 0; i < packed.length; i += 4) {
    const r = packed[i];
    packed[i] = packed[i + 2];
    packed[i + 2] = r;
  }
  return packed;
}

export function videoToBgra(
  src: Buffer,
  width: number,
  height: number,
  stride: number,
  fourcc: number,
) {
  const cc = fourcc >>> 0;
  const srcStride = stride > 0 ? stride : 0;
  if (cc === FOURCC_UYVY || (srcStride > 0 && srcStride < width * 3 && srcStride >= width * 2)) {
    return uyvyToBgra(src, width, height, srcStride || width * 2);
  }
  if (cc === FOURCC_RGBA || cc === FOURCC_RGBX) {
    return rgbaToBgra(src, width, height, srcStride || width * 4);
  }
  return copyBgraRows(src, width, height, srcStride || width * 4);
}

/** Keep Resolume/DistroAV rasters up to a 4-wide 1080p wall. Wider senders shrink. */
export const NDI_OUTPUT_MAX_WIDTH = 7680;

export function downscaleBgra(src: Buffer, width: number, height: number, maxW: number) {
  const scale = width > maxW ? maxW / width : 1;
  const w = Math.max(2, Math.round(width * scale) & ~1);
  const h = Math.max(2, Math.round(height * scale) & ~1);
  if (w === width && h === height) return { bgra: src, width, height };
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / w));
      src.copy(out, (y * w + x) * 4, (sy * width + sx) * 4, (sy * width + sx) * 4 + 4);
    }
  }
  return { bgra: out, width: w, height: h };
}

export function swapRedBlue(src: Buffer) {
  const out = Buffer.from(src);
  for (let i = 0; i < out.length; i += 4) {
    const b = out[i];
    out[i] = out[i + 2];
    out[i + 2] = b;
  }
  return out;
}

/** Fresh Uint8Array (not a Node Buffer pool view) so helper IPC clones as binary. */
export function clonePixels(src: Buffer) {
  const out = new Uint8Array(src.length);
  out.set(src);
  return out;
}

export function asNodeBuffer(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof ArrayBuffer) return Buffer.from(raw);
  if (ArrayBuffer.isView(raw)) {
    const v = raw as Uint8Array;
    return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  }
  if (typeof raw === "string" && raw) {
    try {
      return Buffer.from(raw, "base64");
    } catch {
      return Buffer.alloc(0);
    }
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return Buffer.from((raw as { data: number[] }).data);
  }
  return Buffer.alloc(0);
}
