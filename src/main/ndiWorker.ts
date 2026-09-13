import { clonePixels } from "./ndiPixels";
import {
  connectNdiRecv,
  disconnectNdiRecv,
  listSdkNdiSources,
  ndiRuntimePath,
  ndiStatus,
  setNdiFrameHandler,
  setNdiLogHandler,
} from "./ndiRuntime";

type Port = {
  on(event: "message", cb: (e: { data: unknown }) => void): void;
  postMessage(msg: unknown): void;
};

const port = (process as NodeJS.Process & { parentPort?: Port }).parentPort;

function send(msg: unknown) {
  port?.postMessage(msg);
}

setNdiLogHandler((message, level) => send({ op: "log", message, level: level ?? "info" }));

setNdiFrameHandler((frame) => {
  send({
    op: "frame",
    assetId: frame.assetId,
    sourceName: frame.sourceName,
    width: frame.width,
    height: frame.height,
    bgra: clonePixels(frame.bgra),
  });
});

port?.on("message", (event) => {
  const msg = event.data as { id?: number; op?: string; waitMs?: number; assetId?: string; sourceName?: string };
  const id = msg?.id;
  try {
    if (msg.op === "status") {
      send({ id, op: "status", ...ndiStatus() });
      return;
    }
    if (msg.op === "list") {
      send({ id, op: "list", sources: listSdkNdiSources(msg.waitMs ?? 200) });
      return;
    }
    if (msg.op === "connect") {
      send({ id, op: "connected", ...connectNdiRecv(String(msg.assetId), String(msg.sourceName)) });
      return;
    }
    if (msg.op === "disconnect") {
      disconnectNdiRecv(msg.assetId);
      send({ id, op: "disconnected" });
    }
  } catch (error) {
    send({ id, op: "error", error: error instanceof Error ? error.message : "NDI worker failed" });
  }
});

send({
  op: "ready",
  runtime: false,
  runtimePath: ndiRuntimePath(),
  connected: null,
});
