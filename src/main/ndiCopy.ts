/** Copy NDI frame bytes without koffi.view(). Electron forbids external ArrayBuffers. */

export type MemcpyFn = (dest: Buffer, src: unknown, n: number) => unknown;

type KoffiLoad = {
  load: (name: string) => { func: (sig: string) => unknown };
  view: (ptr: unknown, len: number) => ArrayBuffer;
  decode: (ptr: unknown, type: string, len?: number) => unknown;
};

export const NDI_VIDEO_P_DATA_OFFSET = 40;
export const NDI_VIDEO_STRIDE_OFFSET = 48;
export const NDI_VIDEO_FRAME_SIZE = 72;

export const NDI_FRAME_NONE = 0;
export const NDI_FRAME_VIDEO = 1;
export const NDI_FRAME_AUDIO = 2;
export const NDI_FRAME_META = 3;
export const NDI_FRAME_ERROR = 4;
export const NDI_FRAME_STATUS = 100;

export function memcpyDlls(platform: NodeJS.Platform = process.platform) {
  if (platform === "win32") return ["ucrtbase.dll", "msvcrt.dll"];
  if (platform === "darwin") return ["libc.dylib"];
  return ["libc.so.6"];
}

export function bindMemcpy(koffi: Pick<KoffiLoad, "load">, platform: NodeJS.Platform = process.platform): MemcpyFn | null {
  for (const dll of memcpyDlls(platform)) {
    try {
      const lib = koffi.load(dll);
      return lib.func("void *memcpy(void *dest, const void *src, size_t n)") as MemcpyFn;
    } catch {
      /* try the next CRT */
    }
  }
  return null;
}

export function asNativePtr(ptr: unknown): unknown {
  if (ptr == null || ptr === 0 || ptr === 0n) return null;
  if (typeof ptr === "bigint" || typeof ptr === "number") return ptr;
  if (typeof ptr === "string" && ptr) {
    try {
      return BigInt(ptr);
    } catch {
      return null;
    }
  }
  if (typeof ptr === "object" && ptr && "address" in ptr) return asNativePtr((ptr as { address: unknown }).address);
  return ptr;
}

export function readNdiVideoHeader(buf: Buffer) {
  if (buf.length < NDI_VIDEO_STRIDE_OFFSET + 4) return null;
  const p_data = buf.readBigUInt64LE(NDI_VIDEO_P_DATA_OFFSET);
  return {
    xres: buf.readInt32LE(0),
    yres: buf.readInt32LE(4),
    FourCC: buf.readUInt32LE(8),
    p_data: p_data === 0n ? null : p_data,
    line_stride_in_bytes: buf.readInt32LE(NDI_VIDEO_STRIDE_OFFSET),
  };
}

export function copyNdiPointer(koffi: Pick<KoffiLoad, "view" | "decode">, memcpy: MemcpyFn | null, ptr: unknown, total: number) {
  const src = asNativePtr(ptr);
  if (!src || total <= 0 || total > 48_000_000) return Buffer.alloc(0);
  const dest = Buffer.allocUnsafe(total);
  if (memcpy) {
    memcpy(dest, src, total);
    return dest;
  }
  try {
    const viewed = Buffer.from(koffi.view(src, total));
    viewed.copy(dest, 0, 0, total);
    return dest;
  } catch {
    const chunk = 1024;
    let offset = 0;
    const base = typeof src === "bigint" ? src : BigInt(typeof src === "number" ? src : 0);
    if (!base) return Buffer.alloc(0);
    while (offset < total) {
      const n = Math.min(chunk, total - offset);
      const slice = koffi.decode(base + BigInt(offset), "uint8_t", n);
      const bytes = Array.isArray(slice) ? Buffer.from(slice) : Buffer.from(slice as Uint8Array);
      bytes.copy(dest, offset);
      offset += n;
    }
    return dest;
  }
}

export function ndiFrameKindName(kind: number) {
  if (kind === NDI_FRAME_NONE) return "none";
  if (kind === NDI_FRAME_VIDEO) return "video";
  if (kind === NDI_FRAME_AUDIO) return "audio";
  if (kind === NDI_FRAME_META) return "metadata";
  if (kind === NDI_FRAME_ERROR) return "error";
  if (kind === NDI_FRAME_STATUS) return "status";
  return String(kind);
}
