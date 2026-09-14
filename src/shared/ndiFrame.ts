let pixelScratch: Uint8Array | null = null;

function copyIntoScratch(src: Uint8Array) {
  if (!pixelScratch || pixelScratch.byteLength !== src.byteLength) {
    pixelScratch = new Uint8Array(src.byteLength);
  }
  pixelScratch.set(src);
  return pixelScratch;
}

/** Copy NDI pixels into a page-world Uint8Array. Node Buffer / TypedArray die in contextBridge. */
export function copyPixelBytes(raw: unknown): Uint8Array | null {
  if (!raw) return null;
  if (raw instanceof Uint8Array) return copyIntoScratch(raw);
  if (raw instanceof ArrayBuffer) return copyIntoScratch(new Uint8Array(raw));
  if (ArrayBuffer.isView(raw)) {
    const v = raw as ArrayBufferView;
    return copyIntoScratch(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
  }
  if (typeof raw === "string") {
    if (!raw) return null;
    if (typeof Buffer !== "undefined") {
      try {
        return Uint8Array.from(Buffer.from(raw, "base64"));
      } catch {
        return null;
      }
    }
    try {
      const bin = atob(raw);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return Uint8Array.from((raw as { data: number[] }).data);
  }
  return null;
}
