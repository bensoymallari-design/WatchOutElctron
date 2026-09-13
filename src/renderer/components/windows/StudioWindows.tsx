
import { useEffect, useState } from "react";
import { useApp } from "@/store/appStore";
import {
  closeDisplayOutput,
  isOutputLive,
  listScreens,
  openDisplayOutput,
  subscribeOutputs,
  type OutputScreen,
} from "@/lib/displayOutput";
import { listSpeakers, playTestTone, saveSinkId, savedSinkId, type SpeakerOption } from "@/lib/audioOut";
import { unlockPlaybackAudio } from "@/lib/playbackAudio";
import { isLiveConnected, subscribeLive } from "@/lib/liveSources";

export function DevicesWindow() {
  const show = useApp((s) => s.show);
  const [screens, setScreens] = useState<OutputScreen[]>([]);
  const [screenNote, setScreenNote] = useState("Native OS monitors. Output opens a fullscreen Runner window on that screen.");
  const [speakers, setSpeakers] = useState<SpeakerOption[]>([]);
  const [sinkId, setSinkId] = useState(savedSinkId());
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => subscribeOutputs(() => setLiveTick((n) => n + 1)), []);
  useEffect(() => subscribeLive(() => setLiveTick((n) => n + 1)), []);
  useEffect(() => {
    void listScreens().then((list) => {
      setScreens(list);
      const extras = list.filter((s) => !s.isPrimary);
      setScreenNote(
        extras.length
          ? `${extras.length} extra screen(s). Assign each Display to a controller, then Output all.`
          : "Only one OS screen detected. Extend HDMI (Win+P), then Find screens.",
      );
    });
    void listSpeakers().then(setSpeakers);
  }, []);
  void liveTick;

  if (!show) return null;

  return (
    <div className="h-full overflow-auto bg-[#171717] text-[12px]">
      <Section title="Displays">
        <div className="flex items-center justify-end gap-2 border-b border-[#222] px-3 py-1.5">
          <button
            className="rounded bg-[#14532d] px-2 py-0.5 text-[11px] text-emerald-100"
            onClick={() => {
              void (async () => {
                const list = await listScreens();
                setScreens(list);
                const extras = list.filter((s) => !s.isPrimary);
                setScreenNote(
                  extras.length
                    ? `${extras.length} extra screen(s). Assign each Display to a controller, then Output all.`
                    : "Only one OS screen detected. Extend HDMI (Win+P), then Find screens.",
                );
                await useApp.getState().mapScreensToDisplays(false);
              })();
            }}
          >
            Assign screens
          </button>
          <button
            className="rounded bg-[#f5a623] px-2 py-0.5 text-[11px] text-black"
            onClick={() => void useApp.getState().outputAllDisplays()}
          >
            Output all
          </button>
          <button className="rounded bg-[#333] px-2 py-0.5 text-[11px]" onClick={() => void window.watchout?.closeAllOutputs()}>
            Stop all
          </button>
        </div>
        {show.displays.map((d) => {
          const live = isOutputLive(d.id);
          return (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222] px-3 py-1.5">
              <button className="min-w-0 flex-1 text-left hover:text-[#f5a623]" onClick={() => useApp.getState().select({ kind: "display", ids: [d.id] })}>
                <span>{d.name}</span>
                <span className="ml-2 text-stone-500">
                  {d.width}×{d.height}
                </span>
                {live && <span className="ml-2 text-emerald-400">LIVE</span>}
              </button>
              <select
                className="max-w-[180px] rounded bg-[#111] px-1 py-0.5 text-[11px]"
                value={d.screenId ?? ""}
                onChange={(e) => useApp.getState().updateDisplay(d.id, { screenId: e.target.value || undefined })}
              >
                <option value="">Auto (channel {d.channel})</option>
                {screens.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                    {s.isPrimary ? " · laptop" : ""} {s.physicalWidth || s.width}×{s.physicalHeight || s.height}
                  </option>
                ))}
              </select>
              {live ? (
                <button className="rounded bg-[#333] px-2 py-0.5 text-[11px]" onClick={() => closeDisplayOutput(d.id)}>
                  Stop
                </button>
              ) : (
                <button
                  className="rounded bg-[#f5a623] px-2 py-0.5 text-[11px] text-black"
                  onClick={() => {
                    useApp.getState().select({ kind: "display", ids: [d.id] });
                    void useApp.getState().outputSelectedDisplay();
                  }}
                >
                  Output
                </button>
              )}
            </div>
          );
        })}
      </Section>
      <Section title="Monitors">
        <div className="flex items-center justify-between border-b border-[#222] px-3 py-1.5">
          <span className="text-stone-400">{screens.length ? `${screens.length} screen(s)` : "Not scanned"}</span>
          <button
            className="rounded bg-[#14532d] px-2 py-0.5 text-[11px] text-emerald-100"
            onClick={() => {
              void listScreens().then((list) => {
                setScreens(list);
                const extras = list.filter((s) => !s.isPrimary);
                setScreenNote(
                  extras.length
                    ? "Extra monitor found. Output opens fullscreen on that display."
                    : "Only one OS screen detected. Extend HDMI, then Find screens again.",
                );
              });
            }}
          >
            Find screens
          </button>
        </div>
        {screens.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 border-b border-[#222] px-3 py-1.5">
            <span className="truncate">
              {s.label}
              {s.isPrimary ? " · primary" : ""}
              <span className="ml-2 text-stone-500">
                {s.width}×{s.height}
                {s.scaleFactor > 1.01
                  ? ` · ${s.physicalWidth}×${s.physicalHeight} px @ ${s.scaleFactor}×`
                  : s.physicalWidth && s.physicalWidth !== s.width
                    ? ` · ${s.physicalWidth}×${s.physicalHeight} px`
                    : ""}
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              <button
                className="rounded bg-[#14532d] px-2 py-0.5 text-[11px] text-emerald-100"
                onClick={() => {
                  const selected = useApp.getState().selection;
                  const display =
                    (selected.kind === "display" ? show.displays.find((d) => d.id === selected.ids[0]) : undefined) ??
                    show.displays[0];
                  if (display) useApp.getState().select({ kind: "display", ids: [display.id] });
                  void useApp.getState().applyMonitorSize(s.id);
                }}
              >
                Use size
              </button>
              <button
                className="shrink-0 rounded bg-[#333] px-2 py-0.5 text-[11px]"
                onClick={() => {
                  const selected = useApp.getState().selection;
                  const display =
                    (selected.kind === "display" ? show.displays.find((d) => d.id === selected.ids[0]) : undefined) ??
                    show.displays[0];
                  if (!display) return;
                  useApp.getState().updateDisplay(display.id, { screenId: s.id });
                  void openDisplayOutput(display.id, s, { name: display.name, channel: display.channel, fullscreen: true }).then(
                    () => {
                      useApp.getState().log(`Output ${display.name} → ${s.label}`);
                    },
                  );
                }}
              >
                Output here
              </button>
            </span>
          </div>
        ))}
        <p className="px-3 py-2 text-[10px] leading-relaxed text-stone-500">{screenNote}</p>
        <p className="px-3 pb-2 text-[10px] leading-relaxed text-stone-500">
          You have several controllers / TVs: click <b>Assign screens</b>, then on each Display row pick which monitor it uses. Select a Display first, then Output here to send that one to that screen.
        </p>
      </Section>
      <Section title="Audio">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#222] px-3 py-1.5">
          <select
            className="min-w-0 flex-1 rounded bg-[#111] px-1 py-0.5 text-[11px]"
            value={sinkId}
            onChange={(e) => {
              setSinkId(e.target.value);
              saveSinkId(e.target.value);
              unlockPlaybackAudio();
              useApp.getState().log(e.target.value ? "Speaker set — click Test beep, then Space" : "Using Windows default speaker");
            }}
          >
            <option value="">Windows default speaker</option>
            {speakers.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.label}
              </option>
            ))}
          </select>
          <button
            className="rounded bg-[#f5a623] px-2 py-0.5 text-[11px] text-black"
            onClick={() => {
              unlockPlaybackAudio();
              void playTestTone()
                .then(() => useApp.getState().log("Test beep sent to the selected speaker"))
                .catch(() => useApp.getState().log("Test beep failed — check Windows volume and default playback device", "warn"));
            }}
          >
            Test beep
          </button>
        </div>
        {show.audioDevices.map((d) => (
          <div key={d.id} className="flex justify-between border-b border-[#222] px-3 py-1.5">
            <span>{d.name}</span>
            <span className="text-stone-500">
              {d.driver} · {d.channels} ch
            </span>
          </div>
        ))}
        <p className="px-3 py-2 text-[10px] leading-relaxed text-stone-500">
          If Test beep is silent, pick Speakers (Realtek) instead of HDMI/TV, and unmute Windows. If the beep works but the video is silent, Assets → Rebuild HQ (needs ffmpeg so Electron gets Opus audio).
        </p>
      </Section>
      <Section title="Capture cards">
        <div className="flex items-center justify-between gap-2 border-b border-[#222] px-3 py-1.5">
          <span className="text-stone-400">
            {show.captureDevices.filter((d) => d.deviceId).length
              ? `${show.captureDevices.filter((d) => d.deviceId).length} input(s)`
              : "HDMI / USB capture"}
          </span>
          <button
            className="rounded bg-[#14532d] px-2 py-0.5 text-[11px] text-emerald-100"
            onClick={() => void useApp.getState().refreshCaptureCards()}
          >
            Find cards
          </button>
        </div>
        {show.captureDevices.map((d) => {
          const live = !!(d.assetId && isLiveConnected(d.assetId));
          return (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222] px-3 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate">{d.name}</div>
                <div className="truncate text-[10px] text-stone-500">
                  {d.kind}
                  {d.signal && d.signal !== d.name ? ` · ${d.signal}` : ""}
                  {live ? " · LIVE" : ""}
                </div>
              </div>
              {d.deviceId ? (
                <>
                  <select
                    className="max-w-[160px] rounded bg-[#111] px-1 py-0.5 text-[11px]"
                    value={d.displayId ?? ""}
                    onChange={(e) => useApp.getState().assignCaptureDisplay(d.id, e.target.value || undefined)}
                  >
                    <option value="">Pick display</option>
                    {show.displays
                      .filter((disp) => disp.enabled)
                      .map((disp) => (
                        <option key={disp.id} value={disp.id}>
                          {disp.name}
                        </option>
                      ))}
                  </select>
                  {live ? (
                    <button
                      className="rounded bg-[#333] px-2 py-0.5 text-[11px]"
                      onClick={() => useApp.getState().disconnectCaptureCard(d.id)}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      className="rounded bg-[#f5a623] px-2 py-0.5 text-[11px] text-black"
                      onClick={() => void useApp.getState().connectCaptureCard(d.id)}
                    >
                      Connect
                    </button>
                  )}
                </>
              ) : (
                <button
                  className="rounded bg-[#14532d] px-2 py-0.5 text-[11px] text-emerald-100"
                  onClick={() => {
                    if (d.kind === "NDI") useApp.getState().setDialog("ndiSource");
                    else void useApp.getState().connectCaptureCard(d.id);
                  }}
                >
                  {d.kind === "NDI" ? "NDI Camera Pro" : "Connect"}
                </button>
              )}
            </div>
          );
        })}
        <p className="px-3 py-2 text-[10px] leading-relaxed text-stone-500">
          Plug every HDMI capture card in (Cam Link, Magewell, AVerMedia…). <b>Find cards</b>, then on each row pick the
          Display it should fill and <b>Connect</b>. Four cards can go to four controllers. NDI Camera Pro stays on the
          NDI row.
        </p>
      </Section>
    </div>
  );
}

export function NodesWindow() {
  const show = useApp((s) => s.show);
  if (!show) return null;
  return (
    <div className="h-full overflow-auto bg-[#171717] p-2">
      {show.nodes.map((n) => (
        <div key={n.id} className="mb-2 rounded border border-[#333] bg-[#1c1c1c] p-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{n.name}</div>
            <span className={`text-[11px] ${n.online ? "text-emerald-400" : "text-red-400"}`}>
              {n.online ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-stone-500">
            {n.address} · {n.gpu} · v{n.version}
          </div>
          <div className="mt-2 flex gap-2 text-[10px]">
            {n.services.producer && <Tag>Producer</Tag>}
            {n.services.director && <Tag>Director</Tag>}
            {n.services.runner && <Tag>Runner</Tag>}
            {n.services.assetManager && <Tag>Asset Manager</Tag>}
          </div>
          <Meters cpu={n.cpu} gpu={n.gpuLoad} ram={n.ram} disk={n.disk} />
        </div>
      ))}
    </div>
  );
}

export function VariablesWindow() {
  const show = useApp((s) => s.show);
  if (!show) return null;
  return (
    <div className="flex h-full flex-col bg-[#171717]">
      <div className="flex justify-end border-b border-black p-1">
        <button className="rounded bg-[#f5a623] px-2 py-0.5 text-black" onClick={() => useApp.getState().addVariable()}>
          Add variable
        </button>
      </div>
      <div className="overflow-auto">
        {show.variables.map((v) => (
          <div key={v.id} className="grid grid-cols-[1fr_80px_1fr] items-center gap-2 border-b border-[#222] px-3 py-2">
            <input value={v.name} onChange={(e) => useApp.getState().updateVariable(v.id, { name: e.target.value })} />
            <input
              type="number"
              value={v.value}
              onChange={(e) => useApp.getState().updateVariable(v.id, { value: Number(e.target.value) })}
            />
            <div className="text-[11px] text-stone-500">
              {v.protocol} {v.address}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CuesWindow() {
  const show = useApp((s) => s.show);
  if (!show) return null;
  const rows = show.timelines.flatMap((t) => t.cues.map((c) => ({ t, c })));
  return (
    <div className="h-full overflow-auto bg-[#171717] text-[12px]">
      <div className="grid grid-cols-[1.2fr_1fr_90px_90px_80px] border-b border-black bg-[#222] px-2 py-1 text-[10px] uppercase tracking-wide text-stone-500">
        <span>Name</span><span>Timeline</span><span>Start</span><span>Dur</span><span>Type</span>
      </div>
      {rows.map(({ t, c }) => (
        <button
          key={c.id}
          className="grid w-full grid-cols-[1.2fr_1fr_90px_90px_80px] border-b border-[#222] px-2 py-1 text-left hover:bg-white/5"
          onClick={() => {
            useApp.getState().setActiveTimeline(t.id);
            useApp.getState().select({ kind: "cue", ids: [c.id] });
            useApp.getState().focusWindow("properties");
          }}
        >
          <span className="truncate">{c.name}</span>
          <span className="truncate text-stone-500">{t.name}</span>
          <span className="font-mono text-stone-400">{Math.round(c.start)}</span>
          <span className="font-mono text-stone-400">{Math.round(c.duration)}</span>
          <span style={{ color: c.color }}>{c.type}</span>
        </button>
      ))}
    </div>
  );
}

export function CueSetsWindow() {
  const show = useApp((s) => s.show);
  if (!show) return null;
  return (
    <div className="h-full overflow-auto bg-[#171717] p-2">
      {show.cueSets.map((s) => (
        <div key={s.id} className="mb-2 rounded border border-[#333] p-3">
          <div className="font-semibold">{s.name}</div>
          <div className="text-[11px] text-stone-500">{s.cueIds.length} cues · {s.enabled ? "enabled" : "disabled"}</div>
        </div>
      ))}
    </div>
  );
}

export function LogWindow() {
  const logs = useApp((s) => s.logs);
  return (
    <div className="h-full overflow-auto bg-black font-mono text-[11px]">
      {logs.map((l) => (
        <div key={l.id} className="border-b border-[#1a1a1a] px-2 py-1">
          <span className="text-stone-600">{new Date(l.ts).toLocaleTimeString()}</span>{" "}
          <span className={l.level === "error" ? "text-red-400" : l.level === "warn" ? "text-amber-300" : "text-emerald-300"}>
            {l.level.toUpperCase()}
          </span>{" "}
          {l.message}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="bg-[#222] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-stone-500">{title}</div>
      {children}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-[#f5a623]/20 px-1.5 py-0.5 text-[#f5a623]">{children}</span>;
}

function Meters({ cpu, gpu, ram, disk }: { cpu: number; gpu: number; ram: number; disk: number }) {
  return (
    <div className="mt-2 grid grid-cols-4 gap-2 text-[10px] text-stone-400">
      <Bar label="CPU" v={cpu} />
      <Bar label="GPU" v={gpu} />
      <Bar label="RAM" v={ram} />
      <Bar label="DISK" v={disk} />
    </div>
  );
}

function Bar({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between">
        <span>{label}</span>
        <span>{Math.round(v)}%</span>
      </div>
      <div className="h-1 bg-[#333]">
        <div className="h-1 bg-[#f5a623]" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      </div>
    </div>
  );
}