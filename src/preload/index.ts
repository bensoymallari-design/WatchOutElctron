import { contextBridge, ipcRenderer, webUtils } from "electron";
import { copyPixelBytes } from "../shared/ndiFrame";
import type {
  ClockPayload,
  ImportedMedia,
  NdiConnectResult,
  NdiFramePayload,
  NdiScan,
  NdiStatus,
  OpenOutputOptions,
  OutputScreen,
  RebuildMediaRequest,
  RecentShow,
} from "../shared/ipc";

const api = {
  platform: process.platform,
  listDisplays: () => ipcRenderer.invoke("displays:list") as Promise<OutputScreen[]>,
  openOutput: (opts: OpenOutputOptions) => ipcRenderer.invoke("outputs:open", opts) as Promise<void>,
  closeOutput: (displayId: string) => ipcRenderer.invoke("outputs:close", displayId) as Promise<void>,
  closeAllOutputs: () => ipcRenderer.invoke("outputs:closeAll") as Promise<void>,
  liveOutputs: () => ipcRenderer.invoke("outputs:live") as Promise<string[]>,
  outputSnapshot: () => ipcRenderer.invoke("outputs:snapshot") as Promise<{ show: unknown; clock: ClockPayload | null }>,
  pushShow: (show: unknown) => ipcRenderer.send("outputs:show", show),
  pushClock: (clock: ClockPayload) => ipcRenderer.send("outputs:clock", clock),
  onOutputsChanged: (cb: (ids: string[]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, ids: string[]) => cb(ids);
    ipcRenderer.on("outputs:changed", listener);
    return () => ipcRenderer.removeListener("outputs:changed", listener);
  },
  onShow: (cb: (show: unknown) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, show: unknown) => cb(show);
    ipcRenderer.on("output:show", listener);
    return () => ipcRenderer.removeListener("output:show", listener);
  },
  onClock: (cb: (clock: ClockPayload) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, clock: ClockPayload) => cb(clock);
    ipcRenderer.on("output:clock", listener);
    return () => ipcRenderer.removeListener("output:clock", listener);
  },
  openShow: () => ipcRenderer.invoke("show:open") as Promise<{ path: string; json: string } | null>,
  readShow: (path: string) => ipcRenderer.invoke("show:read", path) as Promise<{ path: string; json: string }>,
  saveShow: (json: string, name: string, existingPath?: string) =>
    ipcRenderer.invoke("show:save", json, name, existingPath) as Promise<string | null>,
  saveShowAs: (json: string, name: string) => ipcRenderer.invoke("show:saveAs", json, name) as Promise<string | null>,
  autosave: (json: string, name: string) => ipcRenderer.invoke("show:autosave", json, name) as Promise<string>,
  recents: () => ipcRenderer.invoke("show:recents") as Promise<RecentShow[]>,
  pickMedia: () => ipcRenderer.invoke("media:pick") as Promise<ImportedMedia[]>,
  importPaths: (paths: string[]) => ipcRenderer.invoke("media:importPaths", paths) as Promise<ImportedMedia[]>,
  rebuildMedia: (assets: RebuildMediaRequest[]) =>
    ipcRenderer.invoke("media:rebuild", assets) as Promise<ImportedMedia[]>,
  prepareMedia: (mode: "native" | "laptop") =>
    ipcRenderer.invoke("media:prepare", mode) as Promise<{ dest: string; skipped: boolean }[]>,
  ffmpegReady: () => ipcRenderer.invoke("media:ffmpeg") as Promise<boolean>,
  discoverNdi: () => ipcRenderer.invoke("ndi:discover") as Promise<NdiScan>,
  connectNdi: (assetId: string, sourceName: string) =>
    ipcRenderer.invoke("ndi:connect", assetId, sourceName) as Promise<NdiConnectResult>,
  disconnectNdi: (assetId?: string) => ipcRenderer.invoke("ndi:disconnect", assetId) as Promise<void>,
  ndiStatus: () => ipcRenderer.invoke("ndi:status") as Promise<NdiStatus>,
  onNdiFrame: (cb: (payload: NdiFramePayload) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: Record<string, unknown>) => {
      cb({
        assetId: String(payload.assetId || ""),
        width: Number(payload.width) || 0,
        height: Number(payload.height) || 0,
        sourceName: String(payload.sourceName || ""),
        jpeg: typeof payload.jpegBase64 === "string" ? payload.jpegBase64 : undefined,
        rgba: copyPixelBytes(payload.rgba) ?? undefined,
      });
    };
    ipcRenderer.on("ndi:frame", listener);
    return () => ipcRenderer.removeListener("ndi:frame", listener);
  },
  gpuInfo: () => ipcRenderer.invoke("app:gpu") as Promise<string>,
  openExternal: (url: string) => ipcRenderer.invoke("app:openExternal", url) as Promise<void>,
  pathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return "";
    }
  },
  onMenu: (cb: (action: string) => void) => {
    const events = ["menu:new", "menu:open", "menu:save", "menu:saveAs", "menu:output"] as const;
    const listeners = events.map((name) => {
      const fn = () => cb(name.slice("menu:".length));
      ipcRenderer.on(name, fn);
      return () => ipcRenderer.removeListener(name, fn);
    });
    return () => listeners.forEach((off) => off());
  },
  onLog: (cb: (entry: { message: string; level: "info" | "warn" | "error" }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, entry: { message: string; level: "info" | "warn" | "error" }) => cb(entry);
    ipcRenderer.on("log", listener);
    return () => ipcRenderer.removeListener("log", listener);
  },
  onMediaUpdated: (cb: (media: ImportedMedia) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, media: ImportedMedia) => cb(media);
    ipcRenderer.on("media:updated", listener);
    return () => ipcRenderer.removeListener("media:updated", listener);
  },
};

contextBridge.exposeInMainWorld("watchout", api);

export type WatchoutAPI = typeof api;
