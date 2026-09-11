const SINK_KEY = "watchout.audioSink";

export interface SpeakerOption {
  id: string;
  label: string;
}

export function savedSinkId() {
  try {
    return localStorage.getItem(SINK_KEY) || "";
  } catch {
    return "";
  }
}

export function saveSinkId(id: string) {
  try {
    if (id) localStorage.setItem(SINK_KEY, id);
    else localStorage.removeItem(SINK_KEY);
  } catch {
    /* ignore */
  }
}

export async function listSpeakers(): Promise<SpeakerOption[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audiooutput")
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Speaker ${i + 1}` }));
  } catch {
    return [];
  }
}

export function applySavedSink(el: HTMLMediaElement) {
  const id = savedSinkId();
  const setSink = (el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
  if (!id || typeof setSink !== "function") return;
  if (el.getAttribute("data-sink-id") === id) return;
  el.setAttribute("data-sink-id", id);
  void setSink.call(el, id).catch(() => undefined);
}

export async function playTestTone() {
  const ctx = new AudioContext();
  await ctx.resume();
  const sink = savedSinkId();
  const setSink = (ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
  if (sink && typeof setSink === "function") {
    try {
      await setSink.call(ctx, sink);
    } catch {
      /* default device */
    }
  }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
  await new Promise((resolve) => {
    osc.onended = () => resolve(undefined);
  });
  await ctx.close().catch(() => undefined);
}
