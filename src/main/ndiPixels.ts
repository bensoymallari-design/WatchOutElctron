export const FOURCC_BGRA = 0x41524742;
export const FOURCC_BGRX = 0x58524742;

export function isBgraFourCC(fourcc: number) {
  return fourcc === FOURCC_BGRA || fourcc === FOURCC_BGRX || fourcc === 0;
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
