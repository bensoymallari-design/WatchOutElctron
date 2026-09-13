import { existsSync } from "node:fs";
import { join } from "node:path";
import { utilityProcess, webContents, type UtilityProcess } from "electron";
import { NDI_RUNTIME_URL, resolveNdiLibrary } from "./ndiLibrary";
import { asNodeBuffer, swapRedBlue } from "./ndiPixels";
import type { NdiAdvert } from "../renderer/lib/ndiNames";

interface Pending {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

let child: UtilityProcess | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let runtime = false;
let runtimePath: string | null = resolveNdiLibrary();
let connected: string | null = null;
let starting: Promise<void> | null = null;

function workerFile() {
  const js = join(__dirname, "ndiWorker.js");
  const mjs = join(__dirname, "ndiWorker.mjs");
  if (existsSync(mjs)) return mjs;
  if (existsSync(js)) return js;
  return null;
}

function broadcastRgba(payload: { assetId: string; rgba: Buffer; width: number; height: number; sourceName: string }) {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed()) continue;
    wc.send("ndi:frame", payload);
  }
}

let loggedEmpty = false;

function onWorkerMessage(msg: Record<string, unknown>) {
  if (msg.op === "ready" || msg.op === "status") {
    runtime = !!msg.runtime;
    runtimePath = (msg.runtimePath as string | null) ?? runtimePath;
    if ("connected" in msg) connected = (msg.connected as string | null) ?? connected;
  }
  if (msg.op === "log") {
    const message = String(msg.message || "");
    const level = (msg.level as "info" | "warn" | "error") || "info";
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed()) continue;
      wc.send("log", { message, level });
    }
    return;
  }
  if (msg.op === "frame") {
    const width = Number(msg.width);
    const height = Number(msg.height);
    const bgra = asNodeBuffer(msg.bgra);
    if (!bgra.length || width < 2 || height < 2 || bgra.length < width * height * 4) {
      if (!loggedEmpty) {
        loggedEmpty = true;
        for (const wc of webContents.getAllWebContents()) {
          if (wc.isDestroyed()) continue;
          wc.send("log", {
            message: `NDI frame arrived empty (${bgra.length} bytes, ${width}×${height}). Helper IPC did not clone pixels.`,
            level: "warn",
          });
        }
      }
      return;
    }
    broadcastRgba({
      assetId: String(msg.assetId),
      rgba: swapRedBlue(bgra),
      width,
      height,
      sourceName: String(msg.sourceName || ""),
    });
    return;
  }
  const id = Number(msg.id);
  if (!id || !pending.has(id)) return;
  const job = pending.get(id);
  pending.delete(id);
  if (msg.op === "error") job?.reject(new Error(String(msg.error || "NDI worker failed")));
  else job?.resolve(msg);
}

function workerGone(message: string) {
  child = null;
  connected = null;
  for (const job of pending.values()) job.reject(new Error(message));
  pending.clear();
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed()) continue;
    wc.send("log", { message, level: "warn" });
  }
}

function ensureWorker() {
  if (child?.pid) return Promise.resolve();
  if (starting) return starting;
  starting = new Promise((resolve, reject) => {
    const file = workerFile();
    if (!file) {
      starting = null;
      reject(new Error("NDI helper script missing"));
      return;
    }
    try {
      child = utilityProcess.fork(file, [], { serviceName: "WatchJhon NDI", stdio: "pipe" });
    } catch (error) {
      starting = null;
      reject(error instanceof Error ? error : new Error("NDI helper failed to start"));
      return;
    }
    const finish = () => {
      if (!starting) return;
      starting = null;
      resolve();
    };
    child.on("message", (msg) => {
      const data = msg as Record<string, unknown>;
      onWorkerMessage(data);
      if (data.op === "ready") finish();
    });
    child.stderr?.on("data", (buf: Buffer) => {
      const message = String(buf).trim();
      if (!message) return;
      for (const wc of webContents.getAllWebContents()) {
        if (wc.isDestroyed()) continue;
        wc.send("log", { message: `NDI helper: ${message}`, level: "warn" });
      }
    });
    child.on("exit", () => {
      workerGone("NDI helper stopped. WatchJhon stayed open — open NDI and Connect again.");
    });
    setTimeout(finish, 800);
  });
  return starting;
}

function call(op: string, extra: Record<string, unknown> = {}, timeoutMs = 8000) {
  return ensureWorker().then(
    () =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        if (!child) {
          reject(new Error("NDI helper failed to start"));
          return;
        }
        const id = nextId++;
        pending.set(id, { resolve, reject });
        child.postMessage({ id, op, ...extra });
        setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(new Error("NDI helper timed out"));
        }, timeoutMs);
      }),
  );
}

export function startNdiHelper() {
  void ensureWorker().catch(() => undefined);
}

export async function listSdkNdiSources(waitMs = 200) {
  try {
    const msg = await call("list", { waitMs }, 4000);
    return (msg.sources as NdiAdvert[]) ?? [];
  } catch {
    return [] as NdiAdvert[];
  }
}

export async function connectNdiRecv(assetId: string, sourceName: string) {
  try {
    const msg = await call("connect", { assetId, sourceName }, 10000);
    if (msg.ok === false) {
      return { ok: false as const, error: String(msg.error || "Could not connect") };
    }
    connected = String(msg.name || sourceName);
    loggedEmpty = false;
    return { ok: true as const, name: connected, runtime: true };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "NDI helper failed. Chromium cannot share a process with the NDI DLL.",
    };
  }
}

export function disconnectNdiRecv(assetId?: string) {
  if (!child) return;
  void call("disconnect", { assetId }).catch(() => undefined);
  connected = null;
}

export function ndiStatus() {
  return {
    runtime: runtime || !!resolveNdiLibrary(),
    runtimePath: runtimePath ?? resolveNdiLibrary(),
    connected,
  };
}

export function stopNdiHelper() {
  disconnectNdiRecv();
  try {
    child?.kill();
  } catch {
    /* ignore */
  }
  child = null;
}

export { NDI_RUNTIME_URL };
