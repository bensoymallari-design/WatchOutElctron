import { BrowserWindow, screen } from "electron";
import type { ClockPayload, OpenOutputOptions, OutputScreen } from "../shared/ipc";
import { OUTPUT_WINDOW_CHROME } from "./outputChrome";

const outputs = new Map<string, BrowserWindow>();
const lastOpts = new Map<string, OpenOutputOptions>();
const relaunching = new Set<string>();
let lastShow: unknown = null;
let lastClock: ClockPayload | null = null;
let preload = "";
let html = "";
let onChange: (() => void) | null = null;

export function initOutputs(opts: { preload: string; html: string; onChange?: () => void }) {
  preload = opts.preload;
  html = opts.html;
  onChange = opts.onChange ?? null;
}

export function listScreens(): OutputScreen[] {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d, i) => ({
    id: String(d.id),
    label: d.label || (d.id === primary.id ? "Primary" : `Monitor ${i + 1}`),
    left: d.bounds.x,
    top: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
    physicalWidth: Math.round(d.size.width * d.scaleFactor),
    physicalHeight: Math.round(d.size.height * d.scaleFactor),
    isPrimary: d.id === primary.id,
    scaleFactor: d.scaleFactor,
  }));
}

export function preferredScreen(screens: OutputScreen[], channel = 1) {
  const extras = screens.filter((s) => !s.isPrimary);
  const pool = extras.length ? extras : screens;
  return pool[Math.max(0, Math.min(pool.length - 1, channel - 1))] ?? screens[0];
}

function outputShouldPlayAudio(target: OutputScreen, screens: OutputScreen[]) {
  const hasTv = screens.some((s) => !s.isPrimary);
  if (hasTv) return !target.isPrimary;
  return true;
}

export function liveOutputIds() {
  for (const [id, win] of outputs) {
    if (win.isDestroyed()) outputs.delete(id);
  }
  return [...outputs.keys()];
}

export function setShowSnapshot(show: unknown) {
  lastShow = show;
  for (const win of outputs.values()) {
    if (!win.isDestroyed()) win.webContents.send("output:show", show);
  }
}

export function setClock(clock: ClockPayload) {
  lastClock = clock;
  for (const win of outputs.values()) {
    if (!win.isDestroyed()) win.webContents.send("output:clock", clock);
  }
}

export function snapshot() {
  return { show: lastShow, clock: lastClock };
}

export async function openOutput(opts: OpenOutputOptions) {
  const existing = outputs.get(opts.displayId);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    existing.moveTop();
    return;
  }
  const screens = listScreens();
  const target =
    (opts.screenId ? screens.find((s) => s.id === opts.screenId) : undefined) ??
    preferredScreen(screens, opts.channel ?? 1) ??
    screens[0];
  const win = new BrowserWindow({
    x: target.left,
    y: target.top,
    width: target.width,
    height: target.height,
    ...OUTPUT_WINDOW_CHROME,
    title: `WATCHOUT · ${opts.displayName}`,
    show: false,
    webPreferences: {
      preload,
      sandbox: false,
      contextIsolation: true,
      backgroundThrottling: false,
      nodeIntegration: false,
      webSecurity: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  win.setMenuBarVisibility(false);
  win.setHasShadow(false);
  win.webContents.setBackgroundThrottling(false);
  win.webContents.setFrameRate(60);
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.webContents.setAudioMuted(false);
  const playAudio = outputShouldPlayAudio(target, screens);
  const query: Record<string, string> = { displayId: opts.displayId };
  if (playAudio) query.audio = "1";
  const url = `${html}?displayId=${encodeURIComponent(opts.displayId)}${playAudio ? "&audio=1" : ""}`;
  if (html.startsWith("http")) await win.loadURL(url);
  else await win.loadFile(html, { query });
  win.once("ready-to-show", () => {
    win.setBounds({ x: target.left, y: target.top, width: target.width, height: target.height });
    win.show();
    win.setAlwaysOnTop(true, "screen-saver");
    win.moveTop();
  });
  win.on("closed", () => {
    if (outputs.get(opts.displayId) === win) outputs.delete(opts.displayId);
    onChange?.();
  });
  outputs.set(opts.displayId, win);
  lastOpts.set(opts.displayId, opts);
  win.webContents.on("render-process-gone", (_e, details) => {
    if (details.reason === "clean-exit") return;
    void relaunchOutput(opts.displayId);
  });
  onChange?.();
  if (lastShow) win.webContents.send("output:show", lastShow);
  if (lastClock) win.webContents.send("output:clock", lastClock);
}

async function relaunchOutput(displayId: string) {
  if (relaunching.has(displayId)) return;
  const opts = lastOpts.get(displayId);
  if (!opts) return;
  relaunching.add(displayId);
  try {
    const old = outputs.get(displayId);
    if (old && !old.isDestroyed()) old.destroy();
    outputs.delete(displayId);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await openOutput(opts);
  } finally {
    relaunching.delete(displayId);
  }
}

export function closeOutput(displayId: string) {
  lastOpts.delete(displayId);
  const win = outputs.get(displayId);
  if (win && !win.isDestroyed()) win.close();
  outputs.delete(displayId);
  onChange?.();
}

export function closeAllOutputs() {
  for (const id of [...outputs.keys()]) closeOutput(id);
}

export function isLive(displayId: string) {
  const win = outputs.get(displayId);
  return !!win && !win.isDestroyed();
}
