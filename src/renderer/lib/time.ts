export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function formatTimecode(ms: number, fps = 60) {
  const sign = ms < 0 ? "-" : "";
  const abs = Math.max(0, Math.abs(ms));
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  const frames = Math.floor(((abs % 1000) / 1000) * fps);
  const pad = (v: number, n = 2) => String(v).padStart(n, "0");
  return `${sign}${pad(h)}:${pad(m)}:${pad(s)}.${pad(frames)}`;
}

export function formatMs(ms: number) {
  const abs = Math.max(0, ms);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  const milli = Math.floor(abs % 1000);
  const pad = (v: number, n = 2) => String(v).padStart(n, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(milli, 3)}`;
}

export function parseTimecode(value: string) {
  const parts = value.trim().split(":");
  if (parts.length === 1) return Number(parts[0]) * 1000 || 0;
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  const rest = parts[2] ?? "0";
  const [s, frac = "0"] = rest.split(".");
  const sec = Number(s) || 0;
  const ms = Number(frac.padEnd(3, "0").slice(0, 3)) || 0;
  return ((h * 60 + m) * 60 + sec) * 1000 + ms;
}
