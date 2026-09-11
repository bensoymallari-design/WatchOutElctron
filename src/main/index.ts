import { app, BrowserWindow, ipcMain, powerSaveBlocker, shell, Menu } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { handleMediaProtocol, registerMediaScheme } from "./protocol";
import { importMediaFiles, pickMediaFiles, ffmpegAvailable } from "./media";
import {
  closeAllOutputs,
  closeOutput,
  initOutputs,
  listScreens,
  liveOutputIds,
  openOutput,
  setClock,
  setShowSnapshot,
  snapshot,
} from "./outputWindows";
import { autosave, loadRecents, openShowDialog, readShowFile, rememberShow, saveShowDialog } from "./shows";
import { startSignalServer } from "./signaling";
import { discoverNdiSources, lanIPv4 } from "../renderer/lib/ndiDiscover";
import type { ClockPayload, OpenOutputOptions } from "../shared/ipc";

registerMediaScheme();

let mainWindow: BrowserWindow | null = null;
let blocker: number | null = null;
const isDev = !app.isPackaged;

function preloadPath() {
  const mjs = join(__dirname, "../preload/index.mjs");
  const js = join(__dirname, "../preload/index.js");
  return existsSync(mjs) ? mjs : js;
}

function outputHtml() {
  if (isDev && process.env.ELECTRON_RENDERER_URL) return `${process.env.ELECTRON_RENDERER_URL}/output.html`;
  return join(__dirname, "../renderer/output.html");
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#0e0e0e",
    title: "WATCHOUT 7 — Producer",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      backgroundThrottling: false,
      nodeIntegration: false,
      webSecurity: false,
    },
  });
  mainWindow.webContents.setBackgroundThrottling(false);
  mainWindow.on("closed", () => {
    mainWindow = null;
    closeAllOutputs();
  });
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function installMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        { label: "New Show", accelerator: "CmdOrCtrl+Shift+N", click: () => mainWindow?.webContents.send("menu:new") },
        { label: "Open…", accelerator: "CmdOrCtrl+O", click: () => mainWindow?.webContents.send("menu:open") },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => mainWindow?.webContents.send("menu:save") },
        { label: "Save As…", accelerator: "CmdOrCtrl+Shift+S", click: () => mainWindow?.webContents.send("menu:saveAs") },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "Output",
      submenu: [
        { label: "Output Selected Display", click: () => mainWindow?.webContents.send("menu:output") },
        { label: "Close All Outputs", click: () => closeAllOutputs() },
      ],
    },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function bindIpc() {
  ipcMain.handle("displays:list", () => listScreens());
  ipcMain.handle("outputs:open", async (_e, opts: OpenOutputOptions) => {
    await openOutput(opts);
    mainWindow?.webContents.send("outputs:changed", liveOutputIds());
  });
  ipcMain.handle("outputs:close", (_e, displayId: string) => {
    closeOutput(displayId);
    mainWindow?.webContents.send("outputs:changed", liveOutputIds());
  });
  ipcMain.handle("outputs:closeAll", () => {
    closeAllOutputs();
    mainWindow?.webContents.send("outputs:changed", []);
  });
  ipcMain.handle("outputs:live", () => liveOutputIds());
  ipcMain.handle("outputs:snapshot", () => snapshot());
  ipcMain.on("outputs:show", (_e, show: unknown) => setShowSnapshot(show));
  ipcMain.on("outputs:clock", (_e, clock: ClockPayload) => setClock(clock));

  ipcMain.handle("show:open", async () => openShowDialog(mainWindow));
  ipcMain.handle("show:read", async (_e, path: string) => readShowFile(path));
  ipcMain.handle("show:save", async (_e, json: string, name: string, existingPath?: string) => {
    const path = await saveShowDialog(mainWindow, json, name, existingPath);
    if (!path) return null;
    const parsed = JSON.parse(json) as { id: string; name: string };
    await rememberShow(path, parsed.name || name, parsed.id);
    return path;
  });
  ipcMain.handle("show:saveAs", async (_e, json: string, name: string) => {
    const path = await saveShowDialog(mainWindow, json, name);
    if (!path) return null;
    const parsed = JSON.parse(json) as { id: string; name: string };
    await rememberShow(path, parsed.name || name, parsed.id);
    return path;
  });
  ipcMain.handle("show:autosave", async (_e, json: string, name: string) => autosave(json, name));
  ipcMain.handle("show:recents", () => loadRecents());

  ipcMain.handle("media:pick", async () => {
    const paths = await pickMediaFiles(mainWindow);
    return importMediaFiles(paths, (message, level) => {
      mainWindow?.webContents.send("log", { message, level: level ?? "info" });
    });
  });
  ipcMain.handle("media:importPaths", async (_e, paths: string[]) => {
    return importMediaFiles(paths, (message, level) => {
      mainWindow?.webContents.send("log", { message, level: level ?? "info" });
    });
  });
  ipcMain.handle("media:ffmpeg", () => ffmpegAvailable());

  ipcMain.handle("ndi:discover", async () => {
    try {
      const sources = await discoverNdiSources(2600);
      return { sources, lan: lanIPv4(), ok: true };
    } catch (error) {
      return {
        sources: [],
        lan: lanIPv4(),
        ok: false,
        error: error instanceof Error ? error.message : "NDI scan failed",
      };
    }
  });

  ipcMain.handle("app:gpu", async () => {
    try {
      const info = await app.getGPUInfo("basic");
      return JSON.stringify(info);
    } catch {
      return "GPU";
    }
  });
  ipcMain.handle("app:openExternal", (_e, url: string) => shell.openExternal(url));
}

app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-accelerated-video-decode");
app.commandLine.appendSwitch("enable-accelerated-mjpeg-decode");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

app.whenReady().then(() => {
  handleMediaProtocol();
  startSignalServer();
  if (process.platform === "win32") app.setAppUserModelId("com.watchout.producer");
  blocker = powerSaveBlocker.start("prevent-display-sleep");
  initOutputs({
    preload: preloadPath(),
    html: outputHtml(),
    onChange: () => mainWindow?.webContents.send("outputs:changed", liveOutputIds()),
  });
  bindIpc();
  installMenu();
  createMainWindow();
  app.on("browser-window-created", (_e, window) => {
    window.webContents.setBackgroundThrottling(false);
  });
});

app.on("window-all-closed", () => {
  if (blocker != null) powerSaveBlocker.stop(blocker);
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
