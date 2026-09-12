
import { useApp, useActiveTimeline } from "@/store/appStore";
import { formatMs, formatPlayTime, parseTimecode } from "@/lib/time";
import { TWEEN_META } from "@/lib/tweens";
import { cueHasConflict } from "@/lib/timeline";
import { EASING_OPTIONS } from "@/lib/easing";
import type { Cue, Display, Easing } from "@/types/show";
import { listScreens, type OutputScreen } from "@/lib/displayOutput";
import { useEffect, useState } from "react";

export function PropertiesWindow() {
  const show = useApp((s) => s.show);
  const selection = useApp((s) => s.selection);
  const tl = useActiveTimeline();
  if (!show) return null;

  if (selection.kind === "cue" && selection.ids[0] && tl) {
    const cue = show.timelines.flatMap((t) => t.cues).find((c) => c.id === selection.ids[0]);
    if (cue) return <CueProps cue={cue} />;
  }
  if (selection.kind === "display" && selection.ids[0]) {
    const d = show.displays.find((x) => x.id === selection.ids[0]);
    if (d) return <DisplayProps display={d} />;
  }
  if (selection.kind === "asset" && selection.ids[0]) {
    const a = show.assets.find((x) => x.id === selection.ids[0]);
    if (a) {
      return (
        <Panel title="Asset">
          <Field label="Name" value={a.name} onChange={(v) => useApp.getState().updateAsset(a.id, { name: v })} />
          <Read label="Kind" value={a.kind} />
          <Read label="Codec" value={a.codec} />
          <Read label="Size" value={`${a.width}×${a.height}`} />
          <Read label="Duration" value={formatPlayTime(a.duration)} />
          <Read label="Notes" value={a.notes || "—"} />
          <div className="mt-2">
            <button
              className="rounded bg-[#5b1d1d] px-2 py-1 text-[11px] text-red-100"
              onClick={() => useApp.getState().deleteAsset(a.id)}
            >
              {a.kind === "ndi" || a.kind === "capture" ? "Delete NDI" : "Delete asset"}
            </button>
          </div>
        </Panel>
      );
    }
  }
  if (selection.kind === "layer" && selection.ids[0] && tl) {
    const layer = tl.layers.find((l) => l.id === selection.ids[0]);
    if (layer) {
      return (
        <Panel title="Layer">
          <Field label="Name" value={layer.name} onChange={(v) => useApp.getState().updateLayer(layer.id, { name: v })} />
          <Check label="Enabled" checked={layer.enabled} onChange={(v) => useApp.getState().updateLayer(layer.id, { enabled: v })} />
          <Check label="Locked" checked={layer.locked} onChange={(v) => useApp.getState().updateLayer(layer.id, { locked: v })} />
          <Read label="Order" value={`Layer ${tl.layers.findIndex((l) => l.id === layer.id) + 1} of ${tl.layers.length} · 1 is in front`} />
        </Panel>
      );
    }
  }
  if (selection.kind === "timeline" && tl) {
    return (
      <Panel title="Timeline">
        <Field label="Name" value={tl.name} onChange={(v) => useApp.getState().updateTimeline(tl.id, { name: v })} />
        <Num label="Duration ms" value={tl.duration} onChange={(v) => useApp.getState().updateTimeline(tl.id, { duration: v })} />
        <Num label="Rate" value={tl.rate} step={0.1} onChange={(v) => useApp.getState().updateTimeline(tl.id, { rate: v })} />
        <Check label="Loop" checked={tl.loop} onChange={(v) => useApp.getState().updateTimeline(tl.id, { loop: v })} />
        <Check label="Enabled" checked={tl.enabled} onChange={(v) => useApp.getState().updateTimeline(tl.id, { enabled: v })} />
        <div className="mt-2">
          <button
            className="rounded bg-[#5b1d1d] px-2 py-1 text-[11px] text-red-100"
            onClick={() => useApp.getState().deleteTimeline(tl.id)}
          >
            Delete timeline
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Show Preferences">
      <Field label="Show name" value={show.name} onChange={(v) => useApp.getState().setShowName(v)} />
      <Num label="Frame rate" value={show.prefs.fps} onChange={(v) => useApp.getState().updateShowPrefs({ fps: v })} />
      <Num label="Image duration ms" value={show.prefs.imageDuration} onChange={(v) => useApp.getState().updateShowPrefs({ imageDuration: v })} />
      <Check label="Auto fade" checked={show.prefs.autoFade} onChange={(v) => useApp.getState().updateShowPrefs({ autoFade: v })} />
      <Num label="Fade in ms" value={show.prefs.fadeIn} onChange={(v) => useApp.getState().updateShowPrefs({ fadeIn: v })} />
      <Num label="Fade out ms" value={show.prefs.fadeOut} onChange={(v) => useApp.getState().updateShowPrefs({ fadeOut: v })} />
      <Read label="Director" value={show.director} />
      <Read label="Asset Manager" value={show.assetManager} />
      <Read label="Cues" value={String(show.timelines.reduce((n, t) => n + t.cues.length, 0))} />
      <Read label="Displays" value={String(show.displays.length)} />
      <Read label="Assets" value={String(show.assets.length)} />
      <Read label="Created" value={new Date(show.createdAt).toLocaleString()} />
    </Panel>
  );
}

function CueProps({ cue }: { cue: Cue }) {
  const u = (partial: Partial<Cue>) => useApp.getState().updateCue(cue.id, partial);
  const tl = useActiveTimeline();
  const show = useApp((s) => s.show);
  const asset = cue.assetId ? show?.assets.find((a) => a.id === cue.assetId) : undefined;
  const timedFile = !!asset && (asset.kind === "video" || asset.kind === "audio");
  const mediaMs = timedFile && asset && asset.duration > 0 ? Math.round(asset.duration) : 0;
  const conflict = tl ? cueHasConflict(cue, tl.cues) : false;
  const cueDiffers = mediaMs > 0 && Math.round(cue.duration) !== mediaMs;

  const applyMediaLength = () => {
    if (!mediaMs) return;
    u({ duration: mediaMs });
    if (tl && cue.start + mediaMs > tl.duration) {
      useApp.getState().updateTimeline(tl.id, { duration: Math.ceil((cue.start + mediaMs + 1000) / 1000) * 1000 });
    }
    useApp.getState().log(`Cue length set to original playing time ${formatPlayTime(mediaMs)}`);
  };

  return (
    <Panel title={`${cue.type} cue`}>
      <Field label="Name" value={cue.name} onChange={(v) => u({ name: v })} />
      <Read label="ID" value={cue.id} />
      {asset && (
        <>
          <Read label="Media file" value={asset.name} />
          {timedFile ? (
            mediaMs ? (
              <PlayTimeBlock ms={mediaMs} />
            ) : (
              <Read label="Original playing time" value="Unknown — wait for import / Rebuild HQ" />
            )
          ) : asset.kind === "image" ? (
            <Read label="Still duration" value={formatPlayTime(asset.duration)} />
          ) : (
            <Read label="Live source" value="No file length — set cue duration for how long it stays on the timeline" />
          )}
        </>
      )}
      <Num label="Start ms" value={Math.round(cue.start)} onChange={(v) => u({ start: v })} />
      <ClockField label="Cue duration" ms={cue.duration} onCommit={(v) => u({ duration: v })} />
      <div className="pl-[100px] text-[10px] leading-snug text-stone-500">Type 00:02:05.040 or 125.04 seconds, then click away</div>
      <Num label="Cue ms" value={Math.round(cue.duration)} onChange={(v) => u({ duration: Math.max(40, v) })} />
      {cueDiffers && (
        <div className="pl-[100px] text-[10px] leading-snug text-amber-200/80">Cue is {formatMs(cue.duration)}; file is {formatMs(mediaMs)}</div>
      )}
      {mediaMs > 0 && (
        <div className="py-1">
          <button className="rounded bg-[#14532d] px-2 py-0.5 text-[11px] text-emerald-100" onClick={applyMediaLength}>
            Use original playing time
          </button>
        </div>
      )}
      <Check label="Enabled" checked={cue.enabled} onChange={(v) => u({ enabled: v })} />
      <Check label="Free running" checked={cue.freeRunning} onChange={(v) => u({ freeRunning: v })} />
      {conflict && (
        <div className="my-1 rounded border border-amber-700/60 bg-amber-950/40 px-2 py-1 text-[11px] text-amber-200">
          Same-layer overlap conflict. Move the cues apart, or apply fade-out on the first and fade-in on the next.
        </div>
      )}
      <div className="mt-2 text-[10px] uppercase tracking-wider text-stone-500">Fade in / out</div>
      <Check label="Fade-in" checked={cue.fadeIn} onChange={(v) => u({ fadeIn: v })} />
      <Num label="Fade-in ms" value={cue.fadeInDuration} onChange={(v) => u({ fadeInDuration: v })} />
      <Check label="Fade-out" checked={cue.fadeOut} onChange={(v) => u({ fadeOut: v })} />
      <Num label="Fade-out ms" value={cue.fadeOutDuration} onChange={(v) => u({ fadeOutDuration: v })} />
      <label className="grid grid-cols-[92px_1fr] items-center gap-2 py-0.5">
        <span className="text-stone-500">Fade curve</span>
        <select value={cue.fadeCurve} onChange={(e) => u({ fadeCurve: e.target.value as Easing })}>
          {EASING_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <Num label="Position X" value={cue.position.x} onChange={(v) => u({ position: { ...cue.position, x: v } })} />
      <Num label="Position Y" value={cue.position.y} onChange={(v) => u({ position: { ...cue.position, y: v } })} />
      <Num label="Scale X %" value={cue.scale.x} onChange={(v) => u({ scale: { ...cue.scale, x: v } })} />
      <Num label="Scale Y %" value={cue.scale.y} onChange={(v) => u({ scale: { ...cue.scale, y: v } })} />
      <div className="text-[10px] leading-snug text-stone-500">
        Drag the clip on Stage to move X/Y. Drag the amber squares on its sides to stretch it onto a Display — edges snap. Hold Shift to keep aspect. Arrows nudge 1 px, Shift+arrows 10 px.
      </div>
      <div className="flex flex-wrap gap-1 py-1">
        <button className="rounded bg-[#f5a623] px-2 py-0.5 text-[11px] text-black" onClick={() => useApp.getState().fitSelectedToWall("cover")}>
          Snap to all displays
        </button>
        <button className="rounded bg-[#14532d] px-2 py-0.5 text-[11px] text-emerald-100" onClick={() => useApp.getState().fitSelectedToDisplay("cover")}>
          Fit to one display
        </button>
        <button className="rounded bg-[#333] px-2 py-0.5 text-[11px]" onClick={() => useApp.getState().fitSelectedToDisplay("contain")}>
          Fit inside one
        </button>
      </div>
      <div className="text-[10px] leading-snug text-stone-500">
        Snap to all displays stretches this clip across every controller. Output all — same playhead, each screen shows its slice.
      </div>
      <Num label="Rotation Z" value={cue.rotation.z} onChange={(v) => u({ rotation: { ...cue.rotation, z: v } })} />
      <Num label="Opacity" value={cue.opacity} onChange={(v) => u({ opacity: v })} />
      <Num label="Volume" value={cue.volume} onChange={(v) => u({ volume: v })} />
      <div className="text-[10px] text-stone-500">0–100 · plays on this PC’s speakers when you press Space</div>
      {cue.control && (
        <>
          <Read label="Control" value={`${cue.control.state} → ${cue.control.target}`} />
        </>
      )}
      {cue.output && <Read label="Output" value={`${cue.output.protocol} ${cue.output.address}`} />}
      <div className="mt-2 text-[10px] uppercase tracking-wider text-stone-500">Tweens</div>
      {cue.tweens.length === 0 && <div className="text-stone-600">None — add from Effect menu</div>}
      {cue.tweens.map((tw) => (
        <div key={tw.id} className="mt-1 rounded border border-[#333] p-1">
          <div className="flex items-center justify-between">
            <span style={{ color: TWEEN_META[tw.type].color }}>{TWEEN_META[tw.type].label}</span>
            <span className="text-stone-500">{tw.points.length} pts</span>
          </div>
        </div>
      ))}
    </Panel>
  );
}

function DisplayProps({ display }: { display: Display }) {
  const u = (partial: Partial<Display>) => useApp.getState().updateDisplay(display.id, partial);
  return (
    <Panel title="Display">
      <Field label="Name" value={display.name} onChange={(v) => u({ name: v })} />
      <Num label="X" value={display.x} onChange={(v) => u({ x: v })} />
      <Num label="Y" value={display.y} onChange={(v) => u({ y: v })} />
      <Num label="Width" value={display.width} onChange={(v) => u({ width: v })} />
      <Num label="Height" value={display.height} onChange={(v) => u({ height: v })} />
      <Num label="Rotation" value={display.rotation} onChange={(v) => u({ rotation: v })} />
      <label className="grid grid-cols-[92px_1fr] items-center gap-2 py-0.5">
        <span className="text-stone-500">Output</span>
        <select value={display.outputType} onChange={(e) => u({ outputType: e.target.value as Display["outputType"] })}>
          <option>GPU</option>
          <option>SDI</option>
          <option>NDI</option>
          <option>Virtual</option>
        </select>
      </label>
      <Num label="Channel" value={display.channel} onChange={(v) => u({ channel: v })} />
      <MonitorField display={display} />
      <Check label="Enabled" checked={display.enabled} onChange={(v) => u({ enabled: v })} />
      <Check label="Soft-edge blend" checked={display.blend} onChange={(v) => u({ blend: v })} />
      <Num label="Blend width" value={display.blendWidth} onChange={(v) => u({ blendWidth: v })} />
      <div className="mt-2 flex flex-wrap gap-1">
        <button className="rounded bg-[#f5a623] px-2 py-1 text-[11px] text-black" onClick={() => void useApp.getState().outputSelectedDisplay()}>
          Output / Fullscreen
        </button>
        <button className="rounded bg-[#14532d] px-2 py-1 text-[11px] text-emerald-100" onClick={() => void useApp.getState().applyMonitorSize()}>
          Match TV pixels
        </button>
        <button className="rounded bg-[#14532d] px-2 py-1 text-[11px] text-emerald-100" onClick={() => useApp.getState().fitSelectedToWall("cover")}>
          Snap cue to all displays
        </button>
        <button className="rounded bg-[#14532d] px-2 py-1 text-[11px] text-emerald-100" onClick={() => useApp.getState().fitSelectedToDisplay("cover")}>
          Snap cue to this display
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-stone-500">
        Set Width×Height to the TV’s real pixels (Match TV pixels). Pick a controller/monitor here or in Devices. HDMI must be Extend in Win+P. Sound: Devices → pick Speakers, Test beep, then play.
      </p>
    </Panel>
  );
}

function MonitorField({ display }: { display: Display }) {
  const [screens, setScreens] = useState<OutputScreen[]>([]);
  useEffect(() => {
    void listScreens().then(setScreens);
  }, []);
  return (
    <label className="grid grid-cols-[92px_1fr] items-center gap-2 py-0.5">
      <span className="text-stone-500">Monitor</span>
      <select
        value={display.screenId ?? ""}
        onChange={(e) => useApp.getState().updateDisplay(display.id, { screenId: e.target.value || undefined })}
      >
        <option value="">Auto (channel {display.channel})</option>
        {screens.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
            {s.isPrimary ? " · laptop" : ""} {s.physicalWidth || s.width}×{s.physicalHeight || s.height}
          </option>
        ))}
      </select>
    </label>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="h-full overflow-auto bg-[#181818] p-2">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f5a623]">{title}</div>
      <div className="space-y-0.5 text-[12px]">{children}</div>
    </div>
  );
}

function PlayTimeBlock({ ms }: { ms: number }) {
  return (
    <div className="my-1 rounded border border-[#2a2a2a] bg-[#121212] px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-[#f5a623]">Original playing time</div>
      <div className="font-mono text-[15px] text-stone-100">{formatMs(ms)}</div>
      <div className="text-[11px] text-stone-400">{(ms / 1000).toFixed(3)} seconds · {ms} ms</div>
      <div className="mt-0.5 text-[10px] text-stone-500">Length of the imported file. Copy this into Cue duration, or press the button below.</div>
    </div>
  );
}

function ClockField({ label, ms, onCommit }: { label: string; ms: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(formatMs(ms));
  useEffect(() => {
    setText(formatMs(ms));
  }, [ms]);
  const commit = () => {
    const parsed = parseTimecode(text);
    if (Number.isFinite(parsed) && parsed >= 40) onCommit(Math.round(parsed));
    else setText(formatMs(ms));
  };
  return (
    <label className="grid grid-cols-[92px_1fr] items-center gap-2 py-0.5">
      <span className="text-stone-500">{label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid grid-cols-[92px_1fr] items-center gap-2 py-0.5">
      <span className="text-stone-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Num({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="grid grid-cols-[92px_1fr] items-center gap-2 py-0.5">
      <span className="text-stone-500">{label}</span>
      <input type="number" step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 py-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Read({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-2 py-0.5">
      <span className="text-stone-500">{label}</span>
      <span className="truncate text-stone-300">{value}</span>
    </div>
  );
}
