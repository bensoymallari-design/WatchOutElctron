export function isHdmiAudioLabel(label: string) {
  return /hdmi|displayport|display port|\btv\b|\bmonitor\b|nvidia.*audio|amd hdmi|intel.*display|digital audio/i.test(label);
}

export async function chooseAudioOutputId(preferHdmi: boolean) {
  if (!preferHdmi || !navigator.mediaDevices?.enumerateDevices) return undefined;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hdmi = devices.find((d) => d.kind === "audiooutput" && isHdmiAudioLabel(d.label));
    return hdmi?.deviceId;
  } catch {
    return undefined;
  }
}

export function applyAudioSink(el: HTMLMediaElement, preferHdmi: boolean) {
  const setSink = (el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
  if (typeof setSink !== "function") return;
  const key = preferHdmi ? "hdmi" : "default";
  if (el.getAttribute("data-sink") === key) return;
  el.setAttribute("data-sink", key);
  void chooseAudioOutputId(preferHdmi).then((id) => {
    if (id) void setSink.call(el, id).catch(() => undefined);
  });
}
