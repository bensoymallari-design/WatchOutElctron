
import { useApp } from "@/store/appStore";
import { NdiConnectDialog } from "@/components/NdiConnectDialog";
import { proxyFfmpegCli } from "../../shared/codecs";
import { useState } from "react";

export function Dialogs() {
  const dialog = useApp((s) => s.dialog);
  if (!dialog) return null;
  return (
    <div
      className="absolute inset-0 z-[80] grid place-items-center bg-black/50"
      onClick={() => {
        if (useApp.getState().dialog === "ndiSource") return;
        useApp.getState().setDialog(null);
      }}
    >
      <div className={`rounded border border-[#444] bg-[#1c1c1c] shadow-2xl ${dialog === "ndiSource" || dialog === "prepareMedia" ? "w-[640px]" : "w-[420px]"}`} onClick={(e) => e.stopPropagation()}>
        {dialog === "displayGrid" && <GridDialog />}
        {dialog === "about" && <AboutDialog />}
        {dialog === "openShow" && <OpenDialog />}
        {dialog === "ndiSource" && <NdiConnectDialog />}
        {dialog === "prepareMedia" && <PrepareMediaDialog />}
      </div>
    </div>
  );
}

function GridDialog() {
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(1);
  const [w, setW] = useState(1920);
  const [h, setH] = useState(1080);
  const [gap, setGap] = useState(0);
  return (
    <div className="p-4">
      <div className="mb-3 text-sm font-semibold text-[#f5a623]">Create Display Grid</div>
      <p className="mb-2 text-[11px] leading-relaxed text-stone-400">
        Example: 4 columns × 1 row × 1920×1080 = one 7680×1080 wall. Import a clip, it snaps across all four. Output all, then Space — same playhead, each controller shows its slice.
      </p>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <L label="Columns"><input type="number" value={cols} onChange={(e) => setCols(+e.target.value)} /></L>
        <L label="Rows"><input type="number" value={rows} onChange={(e) => setRows(+e.target.value)} /></L>
        <L label="Tile width"><input type="number" value={w} onChange={(e) => setW(+e.target.value)} /></L>
        <L label="Tile height"><input type="number" value={h} onChange={(e) => setH(+e.target.value)} /></L>
        <L label="Gap px"><input type="number" value={gap} onChange={(e) => setGap(+e.target.value)} /></L>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="px-3 py-1" onClick={() => useApp.getState().setDialog(null)}>Cancel</button>
        <button
          className="rounded bg-[#f5a623] px-3 py-1 text-black"
          onClick={() => {
            useApp.getState().addDisplayGrid(cols, rows, w, h, gap);
            useApp.getState().setDialog(null);
            useApp.getState().frameDisplays();
          }}
        >
          Create
        </button>
      </div>
    </div>
  );
}

function AboutDialog() {
  return (
    <div className="p-5">
      <div className="text-2xl font-black tracking-[0.2em] text-[#f5a623]">WatchJhon</div>
      <div className="mt-1 text-stone-400">WatchJhon Producer 7.8.23 — desktop edition</div>
      <p className="mt-3 text-[12px] leading-relaxed text-stone-400">
        Multi-display show composer with Stage, Timeline, Assets, Devices, Nodes, Variables and Cue control.
        Runner outputs are native fullscreen windows bound to OS monitors. H.264 / HAP / ProRes need a VP9+Opus
        WebM. Use File → Prepare videos overnight, then import — or let ffmpeg build the proxy after Import.
        Output can still look a bit laggy on a laptop: Chromium VP9 is not Resolume DXV, and each Output window
        decodes the whole file. Use 1080p + Output (one screen) on a test laptop; full size + Output all on the show PC.
      </p>
      <div className="mt-4 text-right">
        <button className="rounded bg-[#f5a623] px-3 py-1 text-black" onClick={() => useApp.getState().setDialog(null)}>
          Close
        </button>
      </div>
    </div>
  );
}

function OpenDialog() {
  return (
    <div className="p-4">
      <div className="mb-3 font-semibold">Open show</div>
      <p className="text-[12px] text-stone-400">Use File → Open to load a .watch.json file, or CONNECT for the last local save.</p>
      <div className="mt-4 text-right">
        <button className="rounded bg-[#f5a623] px-3 py-1 text-black" onClick={() => useApp.getState().setDialog(null)}>
          OK
        </button>
      </div>
    </div>
  );
}

function PrepareMediaDialog() {
  const example = proxyFfmpegCli("clip.mp4");
  return (
    <div className="p-5">
      <div className="mb-2 text-sm font-semibold text-[#f5a623]">Prepare videos for Producer</div>
      <p className="text-[12px] leading-relaxed text-stone-300">
        Stock Electron cannot play H.264 MP4 / ProRes / HAP. Convert to VP9+Opus WebM <em>before</em> the show.
        Producer writes <span className="font-mono text-stone-100">clip.webm</span> next to{" "}
        <span className="font-mono text-stone-100">clip.mp4</span>. Then Import the MP4 (it uses the WebM) or import the
        WebM itself — playback starts immediately, no background transcode.
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-stone-400">
        Full size is for the show PC / LED wall. 1080p is smoother on this laptop. 4K VP9 still costs CPU if you play
        the full-size file here.
      </p>
      <div className="mt-3 rounded bg-black/40 p-2 font-mono text-[10px] leading-snug text-stone-400">{example}</div>
      <p className="mt-1 text-[11px] text-stone-500">Same recipe if you run ffmpeg yourself in Git Bash / PowerShell. HandBrake: WebM, VP9, Opus.</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className="px-3 py-1 text-stone-300" onClick={() => useApp.getState().setDialog(null)}>
          Close
        </button>
        <button
          className="rounded bg-[#333] px-3 py-1 text-stone-100"
          onClick={() => void useApp.getState().preparePlaybackMedia("laptop")}
        >
          Prepare 1080p (laptop)
        </button>
        <button
          className="rounded bg-[#f5a623] px-3 py-1 text-black"
          onClick={() => void useApp.getState().preparePlaybackMedia("native")}
        >
          Prepare full size
        </button>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-stone-500">{label}</div>
      {children}
    </label>
  );
}
