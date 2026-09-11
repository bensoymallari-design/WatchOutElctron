import { attachRemoteStream } from "@/lib/liveSources";
import { useApp } from "@/store/appStore";

const SIGNAL = "http://127.0.0.1:4735";
const ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

type StatusFn = (message: string, live: boolean) => void;

interface Receiver {
  room: string;
  pc: RTCPeerConnection;
  timer: number;
  listeners: Set<StatusFn>;
  stop: () => void;
}

let active: Receiver | null = null;

export function getPhoneRoom() {
  return active?.room ?? null;
}

export function subscribePhone(fn: StatusFn) {
  if (!active) return () => undefined;
  active.listeners.add(fn);
  return () => {
    active?.listeners.delete(fn);
  };
}

function emit(message: string, live: boolean) {
  active?.listeners.forEach((fn) => fn(message, live));
}

export function startPhoneReceiver(room: string, assetId: string) {
  if (active?.room === room) return active.room;
  active?.stop();

  const pc = new RTCPeerConnection({ iceServers: ICE });
  const seen = new Set<string>();
  const listeners = new Set<StatusFn>();

  pc.ontrack = (ev) => {
    const stream = ev.streams[0] ?? new MediaStream(ev.track ? [ev.track] : []);
    attachRemoteStream(assetId, stream);
    const store = useApp.getState();
    store.updateAsset(assetId, {
      notes: "Live phone camera over WebRTC (NDI stand-in)",
      codec: "NDI · Phone",
    });
    const used = store.show?.timelines.some((t) => t.cues.some((c) => c.assetId === assetId));
    if (!used) store.addCueFromAsset(assetId);
    store.log("Phone camera connected as NDI input");
    emit("Live — phone camera is on Stage.", true);
  };
  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    void fetch(`${SIGNAL}/api/ndi/room/${room}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "producer", type: "ice", payload: ev.candidate.toJSON() }),
    });
  };

  const poll = async () => {
    try {
      const res = await fetch(`${SIGNAL}/api/ndi/room/${room}`, { cache: "no-store" });
      const data = await res.json();
      if (data.offer && !pc.remoteDescription) {
        await pc.setRemoteDescription(data.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await fetch(`${SIGNAL}/api/ndi/room/${room}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: "producer", type: "answer", payload: pc.localDescription }),
        });
        emit("Phone found — connecting…", false);
      }
      for (const c of data.phoneIce ?? []) {
        const key = `${c.candidate}:${c.sdpMLineIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          await pc.addIceCandidate(c);
        } catch {
          /* offer may land on the next poll */
        }
      }
    } catch {
      /* keep polling */
    }
    if (active) active.timer = window.setTimeout(() => void poll(), 450);
  };

  const stop = () => {
    window.clearTimeout(active?.timer);
    pc.close();
    void fetch(`${SIGNAL}/api/ndi/room/${room}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "producer", type: "hangup" }),
    });
    if (active?.pc === pc) active = null;
  };

  active = { room, pc, timer: 0, listeners, stop };
  active.timer = window.setTimeout(() => void poll(), 200);
  emit("Waiting for a phone to join…", false);
  return room;
}

export function stopPhoneReceiver() {
  active?.stop();
}
