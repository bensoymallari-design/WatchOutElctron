import { BrowserWindow, screen } from "electron";
import type { ClockPayload, OpenOutputOptions, OutputScreen } from "../shared/ipc";

const outputs = new Map<string, BrowserWindow>();
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
    isPrimary: d.id === primary.id,
    scaleFactor: d.scaleFactor,
  }));
}

export function preferredScreen(screens: OutputScreen[], channel = 1) {
  const extras = screens.filter((s) => !s.isPrimary);
  const pool = extras.length ? extras : screens;
  return pool[Math.max(0, Math.min(pool.length - 1, channel - 1))] ?? screens[0];
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
    fullscreen: false,
    simpleFullscreen: false,
    frame: false,
    transparent: false,
    autoHideMenuBar: true,
    backgroundColor: "#000000",
    title: `WATCHOUT · ${opts.displayName}`,
    show: false,
    skipTaskbar: true,
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
  win.webContents.setBackgroundThrottling(false);
  win.webContents.setFrameRate(60);
  const url = `${html}?displayId=${encodeURIComponent(opts.displayId)}`;
  if (html.startsWith("http")) await win.loadURL(url);
  else await win.loadFile(html, { query: { displayId: opts.displayId } });
  win.once("ready-to-show", () => {
    win.setBounds({ x: target.left, y: target.top, width: target.width, height: target.height });
    win.show();
    win.setAlwaysOnTop(true, "screen-saver");
    win.moveTop();
  });
  win.on("closed", () => {
    outputs.delete(opts.displayId);
    onChange?.();
  });
  outputs.set(opts.displayId, win);
  onChange?.();
  if (lastShow) win.webContents.send("output:show", lastShow);
  if (lastClock) win.webContents.send("output:clock", lastClock);
}

export function closeOutput(displayId: string) {
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
