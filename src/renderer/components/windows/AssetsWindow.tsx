
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/store/appStore";
import { formatPlayTime } from "@/lib/time";
import { getLiveKind, getLiveVideo, subscribeLive } from "@/lib/liveSources";
import { hasLiveOutputs, subscribeOutputs } from "@/lib/displayOutput";
import { drawProcedural } from "@/lib/procedural";
import { FolderPlus, Image as ImageIcon, Film, Music, Radio, Box, Trash2 } from "lucide-react";
import type { Asset } from "@/types/show";
import { PopupMenu } from "@/components/ContextMenu";

export function AssetsWindow() {
  const show = useApp((s) => s.show);
  const selection = useApp((s) => s.selection);
  const liveTick = useApp((s) => s.liveTick);
  const logs = useApp((s) => s.logs);
  const fileRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  if (!show) return null;
  const selected = selection.kind === "asset" ? selection.ids : [];
  const preview = show.assets.find((a) => a.id === selected[0]);
  void liveTick;
  const busy = logs.find((l) =>
    /preparing|transcoding|building hq|copying |hq webm is building|ffmpeg\/ffprobe not found/i.test(l.message),
  );
  const selectedAsset = preview;

  return (
    <div className="flex h-full flex-col bg-[#171717]">
      <div className="flex flex-wrap items-center gap-1 border-b border-black px-2 py-1 text-[11px]">
        <button className="rounded bg-[#f5a623] px-2 py-0.5 text-black" onClick={() => void useApp.getState().importDesktopAssets()}>
          Import
        </button>
        <button
          className="rounded bg-[#333] px-2 py-0.5 text-stone-200"
          onClick={() => void useApp.getState().rebuildStaleMedia()}
        >
          Rebuild HQ
        </button>
        <button className="rounded bg-[#333] px-2 py-0.5 text-stone-200" onClick={() => useApp.getState().setDialog("prepareMedia")}>
          Prepare videos
        </button>
        <button
          className="rounded bg-[#5b1d1d] px-2 py-0.5 text-red-100 disabled:opacity-40"
          disabled={!selectedAsset}
          onClick={() => selectedAsset && useApp.getState().deleteAsset(selectedAsset.id)}
        >
          {selectedAsset && (selectedAsset.kind === "ndi" || selectedAsset.kind === "capture") ? "Delete live" : "Delete"}
        </button>
        <button
          className="rounded bg-[#14532d] px-2 py-0.5 text-emerald-100"
          onClick={() => {
            useApp.getState().ensureNdiAsset();
            useApp.getState().setDialog("ndiSource");
          }}
        >
          Find NDI
        </button>
        <button
          className="rounded bg-[#14532d] px-2 py-0.5 text-emerald-100"
          onClick={() => {
            const id = useApp.getState().ensureNdiAsset();
            if (id) void useApp.getState().connectLiveSource(id, "camera");
          }}
        >
          PC Camera
        </button>
        <button
          className="rounded bg-[#14532d] px-2 py-0.5 text-emerald-100"
          onClick={() => {
            const id = useApp.getState().ensureNdiAsset();
            if (id) void useApp.getState().connectLiveSource(id, "screen");
          }}
        >
          NDI Screen
        </button>
        <button
          className="rounded bg-[#14532d] px-2 py-0.5 text-emerald-100"
          onClick={() => {
            useApp.getState().ensureNdiAsset();
            useApp.getState().setDialog("ndiSource");
          }}
        >
          NDI Camera Pro
        </button>
        <button
          className="rounded bg-[#14532d] px-2 py-0.5 text-emerald-100"
          onClick={() => {
            useApp.getState().focusWindow("devices");
            void useApp.getState().refreshCaptureCards();
          }}
        >
          Find capture
        </button>
        <span className="ml-auto text-stone-600">Asset Manager · {show.assetManager}</span>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (files.length) void useApp.getState().importAssets(files);
            e.target.value = "";
          }}
        />
      </div>
      {busy && (
        <div className="border-b border-amber-900/60 bg-[#1a1408] px-2 py-1 text-[10px] leading-relaxed text-amber-100">
          {busy.message}
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_140px]">
        <div className="overflow-auto">
          {show.assets.map((a) => (
            <div
              key={a.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/asset", a.id);
                useApp.getState().setDraggingAsset(a.id);
              }}
              onDragEnd={() => useApp.getState().setDraggingAsset(null)}
              onClick={() => useApp.getState().select({ kind: "asset", ids: [a.id] })}
              onDoubleClick={() => useApp.getState().addCueFromAsset(a.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                useApp.getState().select({ kind: "asset", ids: [a.id] });
                setMenu({ x: e.clientX, y: e.clientY, id: a.id });
              }}
              className={`flex cursor-grab items-center gap-2 border-b border-[#222] px-2 py-1.5 ${
                selected.includes(a.id) ? "bg-[#3b2a12]" : "hover:bg-white/5"
              }`}
            >
              <KindIcon kind={a.kind} />
              <div className="min-w-0 flex-1">
                <div className="truncate">{a.name}</div>
                <div className="text-[10px] text-stone-500">
                  {a.kind} · {a.codec} · {a.width ? `${a.width}×${a.height}` : ""} · {formatPlayTime(a.duration)}
                  {!a.optimized && a.kind === "video" ? " · building HQ" : ""}
                </div>
              </div>
              <span className={`h-2 w-2 rounded-full ${getLiveKind(a.id) ? "bg-emerald-400" : a.optimized ? "bg-emerald-700" : "bg-amber-400"}`} />
              <button
                className="grid h-5 w-5 place-items-center rounded text-stone-500 hover:bg-[#5b1d1d] hover:text-red-100"
                title={a.kind === "ndi" || a.kind === "capture" ? "Delete live" : "Delete asset"}
                onClick={(e) => {
                  e.stopPropagation();
                  useApp.getState().deleteAsset(a.id);
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          {show.assets.length === 0 && (
            <div className="p-6 text-center text-stone-500">
              Import media or connect an NDI camera / screen source, then drag onto the Timeline or Stage.
            </div>
          )}
        </div>
        <div className="border-l border-black p-2">
          <AssetPreview asset={preview} />
          {preview && <div className="text-[10px] leading-relaxed text-stone-400">{preview.notes || preview.name}</div>}
        </div>
      </div>
      {menu && (
        <PopupMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Add to Timeline",
              onClick: () => useApp.getState().addCueFromAsset(menu.id),
            },
            { sep: true },
            {
              label:
                show.assets.find((a) => a.id === menu.id)?.kind === "ndi" ||
                show.assets.find((a) => a.id === menu.id)?.kind === "capture"
                  ? "Delete live"
                  : "Delete asset",
              danger: true,
              shortcut: "Del",
              onClick: () => useApp.getState().deleteAsset(menu.id),
            },
          ]}
        />
      )}
    </div>
  );
}

function AssetPreview({ asset }: { asset?: Asset }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setTick] = useState(0);
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => subscribeLive(() => setTick((n) => n + 1)), []);
  useEffect(() => subscribeOutputs(() => setLiveTick((n) => n + 1)), []);
  const outputsLive = liveTick >= 0 && hasLiveOutputs();

  useEffect(() => {
    if (!asset || (asset.kind !== "ndi" && asset.kind !== "capture" && !asset.url.startsWith("procedural:"))) return;
    let raf = 0;
    const paint = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        raf = requestAnimationFrame(paint);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const live = getLiveVideo(asset.id);
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (live && live.readyState >= 2) ctx.drawImage(live, 0, 0, canvas.width, canvas.height);
      else if (asset.kind === "ndi" || asset.kind === "capture" || asset.url.startsWith("procedural:")) {
        const kind = asset.url.startsWith("procedural:") ? asset.url.slice("procedural:".length) : "ndi";
        drawProcedural(ctx, kind, canvas.width, canvas.height, performance.now());
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [asset]);

  if (!asset) {
    return (
      <div className="checker mb-2 grid aspect-video place-items-center overflow-hidden rounded border border-[#333]">
        <span className="text-[10px] text-stone-500">preview</span>
      </div>
    );
  }

  if (asset.kind === "ndi" || asset.kind === "capture" || asset.url.startsWith("procedural:")) {
    return (
      <div className="mb-2 overflow-hidden rounded border border-[#333]">
        <canvas ref={canvasRef} width={240} height={135} className="block w-full" />
      </div>
    );
  }

  if (asset.kind === "video" && asset.url) {
    return (
      <div className="checker mb-2 grid aspect-video place-items-center overflow-hidden rounded border border-[#333]">
        {outputsLive && asset.posterUrl ? (
          <img src={asset.posterUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <video
            src={asset.url}
            poster={asset.posterUrl}
            muted
            playsInline
            autoPlay={!outputsLive}
            loop
            preload={outputsLive ? "metadata" : "auto"}
            className="h-full w-full object-contain"
          />
        )}
      </div>
    );
  }

  if (asset.kind === "audio" && asset.url) {
    return (
      <div className="mb-2 rounded border border-[#333] bg-black/40 p-2">
        <audio src={asset.url} controls className="w-full" />
      </div>
    );
  }

  if (asset.url && !asset.url.startsWith("procedural:")) {
    return (
      <div className="checker mb-2 grid aspect-video place-items-center overflow-hidden rounded border border-[#333]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.url} alt="" className="h-full w-full object-contain" />
      </div>
    );
  }

  return (
    <div className="checker mb-2 grid aspect-video place-items-center overflow-hidden rounded border border-[#333]">
      <span className="text-[10px] text-stone-500">{asset.kind}</span>
    </div>
  );
}

function KindIcon({ kind }: { kind: Asset["kind"] }) {
  const cls = "shrink-0 text-[#f5a623]";
  if (kind === "video") return <Film size={14} className={cls} />;
  if (kind === "audio") return <Music size={14} className={cls} />;
  if (kind === "ndi" || kind === "capture") return <Radio size={14} className={cls} />;
  if (kind === "composition") return <Box size={14} className={cls} />;
  if (kind === "procedural") return <FolderPlus size={14} className={cls} />;
  return <ImageIcon size={14} className={cls} />;
}
