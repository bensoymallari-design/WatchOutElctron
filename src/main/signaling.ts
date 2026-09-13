import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { lanIPv4 } from "../renderer/lib/ndiDiscover";

const PORT = 4735;

interface Room {
  offer: unknown;
  answer: unknown;
  phoneIce: unknown[];
  producerIce: unknown[];
  updatedAt: number;
}

const rooms = new Map<string, Room>();

function empty(): Room {
  return { offer: null, answer: null, phoneIce: [], producerIce: [], updatedAt: Date.now() };
}

function getRoom(id: string) {
  return rooms.get(id) ?? empty();
}

function postRoom(id: string, body: { role?: string; type?: string; payload?: unknown }) {
  if (body.type === "hangup") {
    rooms.delete(id);
    return empty();
  }
  const room = rooms.get(id) ?? empty();
  if (body.type === "offer") {
    room.offer = body.payload;
    room.answer = null;
    room.phoneIce = [];
    room.producerIce = [];
  }
  if (body.type === "answer") room.answer = body.payload;
  if (body.type === "ice") {
    (body.role === "phone" ? room.phoneIce : room.producerIce).push(body.payload);
  }
  room.updatedAt = Date.now();
  rooms.set(id, room);
  return room;
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(data));
}

const camPage = (room: string) => `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>WatchJhon phone camera</title>
<style>
body{margin:0;background:#111;color:#eee;font:14px sans-serif;padding:16px}
button{background:#f5a623;border:0;padding:10px 16px;margin:6px 6px 0 0;cursor:pointer}
video{width:100%;max-width:480px;background:#000;margin-top:12px}
</style></head><body>
<h1>WatchJhon · phone camera</h1>
<p id="s">Tap Start to send this camera to Producer.</p>
<button id="start">Start</button>
<button id="flip">Flip camera</button>
<video id="v" autoplay playsinline muted></video>
<script>
const room = ${JSON.stringify(room)};
const ICE = [{urls:"stun:stun.l.google.com:19302"}];
let facing = "environment";
document.getElementById("flip").onclick = () => { facing = facing === "environment" ? "user" : "environment"; };
document.getElementById("start").onclick = async () => {
  const s = document.getElementById("s");
  s.textContent = "Starting camera…";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing } }, audio: false });
    document.getElementById("v").srcObject = stream;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      fetch("/api/ndi/room/"+room, { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ role:"phone", type:"ice", payload: ev.candidate.toJSON() }) });
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await fetch("/api/ndi/room/"+room, { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ role:"phone", type:"offer", payload: pc.localDescription }) });
    s.textContent = "Waiting for Producer…";
    const poll = async () => {
      const roomState = await (await fetch("/api/ndi/room/"+room)).json();
      if (roomState.answer && pc.signalingState !== "stable") {
        await pc.setRemoteDescription(roomState.answer);
        s.textContent = "Live on Stage";
      }
      for (const c of roomState.producerIce || []) { try { await pc.addIceCandidate(c); } catch {} }
      if (pc.connectionState !== "closed") setTimeout(poll, 400);
    };
    poll();
  } catch (e) { s.textContent = e.message || "Camera failed"; }
};
</script></body></html>`;

export function startSignalServer() {
  const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      });
      res.end();
      return;
    }
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    const roomMatch = url.pathname.match(/^\/api\/ndi\/room\/([^/]+)$/);
    if (roomMatch) {
      const id = decodeURIComponent(roomMatch[1]);
      if (req.method === "GET") return json(res, getRoom(id));
      if (req.method === "POST") {
        const body = JSON.parse((await readBody(req)) || "{}");
        return json(res, postRoom(id, body));
      }
    }
    const camMatch = url.pathname.match(/^\/cam\/([^/]+)$/);
    if (camMatch && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(camPage(decodeURIComponent(camMatch[1])));
      return;
    }
    if (url.pathname === "/api/ndi/lan") {
      return json(res, { lan: lanIPv4(), port: PORT });
    }
    res.writeHead(404);
    res.end("not found");
  });
  server.on("error", () => undefined);
  server.listen(PORT, "0.0.0.0");
  return PORT;
}

export const SIGNAL_PORT = PORT;
