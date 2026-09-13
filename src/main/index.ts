import { app, BrowserWindow, ipcMain, powerSaveBlocker, session, shell, Menu } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { handleMediaProtocol, registerMediaScheme } from "./protocol";
import { importMediaFiles, pickMediaFiles, pickPrepareMediaFiles, preparePlaybackFiles, ffmpegAvailable, rebuildMediaAssets } from "./media";
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
import { discoverNdiSources, lanIPv4, startNdiFinder, stopNdiFinder } from "../renderer/lib/ndiDiscover";
import { mergeNdiLists } from "../renderer/lib/ndiNames";
import { connectNdiRecv, disconnectNdiRecv, listSdkNdiSources, ndiStatus } from "./ndiRuntime";
import type { ClockPayload, ImportedMedia, OpenOutputOptions } from "../shared/ipc";

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
    title: "WatchJhon — Producer",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      backgroundThrottling: false,
      nodeIntegration: false,
      webSecurity: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  mainWindow.webContents.setBackgroundThrottling(false);
  mainWindow.webContents.setAudioMuted(false);
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
  const mediaLog = (message: string, level?: "info" | "warn" | "error") => {
    mainWindow?.webContents.send("log", { message, level: level ?? "info" });
  };
  const mediaUpdated = (media: ImportedMedia) => {
    mainWindow?.webContents.send("media:updated", media);
  };
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
    return importMediaFiles(paths, mediaLog, mediaUpdated);
  });
  ipcMain.handle("media:importPaths", async (_e, paths: string[]) => {
    return importMediaFiles(paths, mediaLog, mediaUpdated);
  });
  ipcMain.handle("media:ffmpeg", () => ffmpegAvailable());
  ipcMain.handle("media:prepare", async (_e, mode: "native" | "laptop") => {
    const paths = await pickPrepareMediaFiles(mainWindow);
    return preparePlaybackFiles(paths, mode === "laptop" ? "laptop" : "native", mediaLog);
  });
  ipcMain.handle("media:rebuild", async (_e, assets: Parameters<typeof rebuildMediaAssets>[0]) => {
    return rebuildMediaAssets(assets, (message, level) => {
      mainWindow?.webContents.send("log", { message, level: level ?? "info" });
    });
  });

  ipcMain.handle("ndi:discover", async () => {
    const status = ndiStatus();
    try {
      const mdns = await discoverNdiSources(4500);
      const sdk = listSdkNdiSources(status.runtime ? 400 : 0);
      return {
        sources: mergeNdiLists(mdns, sdk),
        lan: lanIPv4(),
        ok: true,
        runtime: status.runtime,
        runtimePath: status.runtimePath,
      };
    } catch (error) {
      return {
        sources: listSdkNdiSources(status.runtime ? 400 : 0),
        lan: lanIPv4(),
        ok: false,
        error: error instanceof Error ? error.message : "NDI scan failed",
        runtime: status.runtime,
        runtimePath: status.runtimePath,
      };
    }
  });
  ipcMain.handle("ndi:connect", (_e, assetId: string, sourceName: string) => connectNdiRecv(assetId, sourceName));
  ipcMain.handle("ndi:disconnect", (_e, assetId?: string) => {
    disconnectNdiRecv(assetId);
  });
  ipcMain.handle("ndi:status", () => ndiStatus());

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
app.commandLine.appendSwitch("disable-gpu-process-crash-limit");
app.commandLine.appendSwitch("force-gpu-mem-available-mb", "4096");

app.whenReady().then(() => {
  handleMediaProtocol();
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media" || permission === "mediaKeySystem" || permission === "display-capture");
  });
  session.defaultSession.setPermissionCheckHandler(() => true);
  startSignalServer();
  startNdiFinder();
  if (process.platform === "win32") app.setAppUserModelId("com.watchjhon.producer");
  blocker = powerSaveBlocker.start("prevent-display-sleep");
  powerSaveBlocker.start("prevent-app-suspension");
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

app.on("before-quit", () => {
  disconnectNdiRecv();
  stopNdiFinder();
});

app.on("window-all-closed", () => {
  if (blocker != null) powerSaveBlocker.stop(blocker);
  disconnectNdiRecv();
  stopNdiFinder();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
