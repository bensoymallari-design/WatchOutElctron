import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { app, dialog, type BrowserWindow } from "electron";
import type { RecentShow } from "../shared/ipc";

const RECENTS = "recents.json";

function recentsPath() {
  return join(app.getPath("userData"), RECENTS);
}

export async function loadRecents(): Promise<RecentShow[]> {
  try {
    return JSON.parse(await readFile(recentsPath(), "utf8")) as RecentShow[];
  } catch {
    return [];
  }
}

async function saveRecents(list: RecentShow[]) {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(recentsPath(), JSON.stringify(list, null, 2), "utf8");
}

export async function rememberShow(path: string, name: string, id: string) {
  const next = [
    { id, name, path, savedAt: new Date().toISOString() },
    ...(await loadRecents()).filter((r) => r.path !== path),
  ].slice(0, 10);
  await saveRecents(next);
  return next;
}

export async function openShowDialog(win: BrowserWindow | null) {
  const result = await dialog.showOpenDialog(win ?? (undefined as unknown as BrowserWindow), {
    title: "Open WatchJhon show",
    properties: ["openFile"],
    filters: [
      { name: "WatchJhon Show", extensions: ["watch.json", "json"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return readShowFile(result.filePaths[0]);
}

export async function readShowFile(filePath: string) {
  const json = await readFile(filePath, "utf8");
  return { path: filePath, json };
}

export async function saveShowDialog(win: BrowserWindow | null, json: string, defaultName: string, existingPath?: string) {
  if (existingPath) {
    await writeFile(existingPath, json, "utf8");
    return existingPath;
  }
  const result = await dialog.showSaveDialog(win ?? (undefined as unknown as BrowserWindow), {
    title: "Save WatchJhon show",
    defaultPath: `${defaultName.replace(/\s+/g, "_")}.watch.json`,
    filters: [{ name: "WatchJhon Show", extensions: ["watch.json", "json"] }],
  });
  if (result.canceled || !result.filePath) return null;
  const dest = result.filePath.endsWith(".json") ? result.filePath : `${result.filePath}.watch.json`;
  await writeFile(dest, json, "utf8");
  return dest;
}

export async function autosave(json: string, name: string) {
  const dir = join(app.getPath("userData"), "autosave");
  await mkdir(dir, { recursive: true });
  const dest = join(dir, "last.watch.json");
  await writeFile(dest, json, "utf8");
  await copyFile(dest, join(dir, `${name.replace(/\s+/g, "_")}.watch.json`)).catch(() => undefined);
  return dest;
}

export function showBasename(filePath: string) {
  return basename(filePath);
}
