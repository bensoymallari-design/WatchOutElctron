
import { useEffect, useRef } from "react";
import { useApp } from "@/store/appStore";
import { drawStage, screenToStage } from "@/lib/renderStage";
import { collectStageCues, cueRects } from "@/lib/stageCues";
import {
  cueRect,
  displayGuides,
  displayMoveGuides,
  hitCue,
  hitDisplay,
  snapRect,
  snapThreshold,
} from "@/lib/stageGeometry";
import { Minus, Plus, Focus, Grid3x3, Maximize2 } from "lucide-react";

export function StageWindow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverDisplayRef = useRef<string | null>(null);
  const snapGuidesRef = useRef<{ x: number[]; y: number[] } | undefined>(undefined);
  const show = useApp((s) => s.show);
  const camera = useApp((s) => s.camera);
  const draggingAssetId = useApp((s) => s.draggingAssetId);
  const snap = useApp((s) => s.snap);

  useEffect(() => {
    let raf = 0;
    let lastPaint = 0;
    const paint = (now: number) => {
      const canvas = canvasRef.current;
      const state = useApp.getState();
      const current = state.show;
      const playing = current?.timelines.some((t) => t.playback === "play");
      const minDt = playing ? 33 : 16;
      if (canvas && current && now - lastPaint >= minDt) {
        lastPaint = now;
        const cues = collectStageCues(current);
        drawStage({
          canvas,
          displays: current.displays,
          cues,
          assets: current.assets,
          camera: state.camera,
          selectedIds: state.selection.ids,
          timeMs: now,
          showGrid: true,
          highlightDisplayId: hoverDisplayRef.current,
          snapGuides: snapGuidesRef.current,
          playing: !!playing,
        });
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const state = useApp.getState();
      const cam = state.camera;
      const pinchZoom = e.ctrlKey || e.metaKey;
      if (pinchZoom) {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const next = Math.max(0.02, Math.min(8, cam.zoom * factor));
        const pt = screenToStage(canvas, cam, e.clientX, e.clientY);
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        state.setCamera({
          zoom: next,
          x: pt.x - (sx - canvas.clientWidth / 2) / next,
          y: pt.y - (sy - canvas.clientHeight / 2) / next,
        });
        return;
      }
      state.setCamera({
        x: cam.x + e.deltaX / cam.zoom,
        y: cam.y + e.deltaY / cam.zoom,
      });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [show]);

  if (!show) return null;

  return (
    <div className="relative flex h-full flex-col bg-[#101010]">
      <div className="flex h-7 items-center gap-1 border-b border-black bg-[#1a1a1a] px-2 text-[11px] text-stone-400">
        <Tool icon={<Plus size={12} />} onClick={() => useApp.getState().setCamera({ zoom: Math.min(8, camera.zoom * 1.2) })} />
        <Tool icon={<Minus size={12} />} onClick={() => useApp.getState().setCamera({ zoom: Math.max(0.02, camera.zoom / 1.2) })} />
        <Tool icon={<Focus size={12} />} onClick={() => useApp.getState().frameDisplays()} />
        <Tool icon={<Grid3x3 size={12} />} onClick={() => useApp.getState().setDialog("displayGrid")} />
        <button
          className="rounded px-1.5 py-0.5 hover:bg-white/10"
          onClick={() => useApp.getState().fitSelectedToDisplay("cover")}
        >
          Fit display
        </button>
        <button
          className="rounded px-1.5 py-0.5 hover:bg-white/10"
          onClick={() => void useApp.getState().outputSelectedDisplay()}
        >
          <span className="inline-flex items-center gap-1">
            <Maximize2 size={11} /> Output
          </span>
        </button>
        <span className="ml-2">Stage px  ·  zoom {(camera.zoom * 100).toFixed(0)}%</span>
        <span className="ml-auto text-stone-500">Drag a display to snap edges · drop asset on a display · Edit→Snap</span>
        <span>
          {show.displays.length} displays  ·  {show.displays.reduce((n, d) => n + d.width, 0)}×
          {Math.max(...show.displays.map((d) => d.height), 0)}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const state = useApp.getState();
          const cam = state.camera;
          const pt = screenToStage(canvas, cam, e.clientX, e.clientY);
          const current = state.show;
          if (!current) return;

          const pan = () => {
            const origin = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
            const move = (ev: PointerEvent) => {
              const dx = (ev.clientX - origin.x) / cam.zoom;
              const dy = (ev.clientY - origin.y) / cam.zoom;
              useApp.getState().setCamera({ x: origin.cx - dx, y: origin.cy - dy });
            };
            const up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          };

          if (e.button === 1) {
            e.preventDefault();
            pan();
            return;
          }
          if (e.button !== 0) return;

          const cues = collectStageCues(current);
          const media = e.altKey ? undefined : hitCue(cues, current.assets, pt);
          if (media) {
            state.select({ kind: "cue", ids: [media.cue.id] });
            state.focusWindow("properties");
            const asset = current.assets.find((a) => a.id === media.cue.assetId);
            const startRect = cueRect(media, asset);
            const origin = { x: e.clientX, y: e.clientY, px: media.cue.position.x, py: media.cue.position.y };
            let dragged = false;
            const move = (ev: PointerEvent) => {
              const dx = (ev.clientX - origin.x) / cam.zoom;
              const dy = (ev.clientY - origin.y) / cam.zoom;
              if (!dragged && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 4) return;
              dragged = true;
              let x = origin.px + (ev.shiftKey && Math.abs(dx) < Math.abs(dy) ? 0 : dx);
              let y = origin.py + (ev.shiftKey && Math.abs(dy) < Math.abs(dx) ? 0 : dy);
              const moving = { x, y, w: startRect.w, h: startRect.h };
              if (state.snap) {
                const dg = displayGuides(current.displays);
                const others = cueRects(
                  cues.filter((c) => c.cue.id !== media.cue.id),
                  current.assets,
                );
                const snapped = snapRect(
                  moving,
                  [...dg.x, ...others.flatMap((r) => [r.x, r.x + r.w])],
                  [...dg.y, ...others.flatMap((r) => [r.y, r.y + r.h])],
                  snapThreshold(cam.zoom),
                );
                x = snapped.x;
                y = snapped.y;
                snapGuidesRef.current = {
                  x: [snapped.x, snapped.x + snapped.w],
                  y: [snapped.y, snapped.y + snapped.h],
                };
              }
              state.updateCue(media.cue.id, { position: { ...media.cue.position, x: Math.round(x), y: Math.round(y) } });
            };
            const up = () => {
              snapGuidesRef.current = undefined;
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
            return;
          }
          const hitD = hitDisplay(current.displays, pt);
          if (hitD) {
            state.select({ kind: "display", ids: [hitD.id] });
            state.focusWindow("properties");
            const origin = { x: e.clientX, y: e.clientY, px: hitD.x, py: hitD.y };
            let dragged = false;
            const move = (ev: PointerEvent) => {
              const live = useApp.getState();
              const show = live.show;
              if (!show) return;
              const dx = (ev.clientX - origin.x) / cam.zoom;
              const dy = (ev.clientY - origin.y) / cam.zoom;
              if (!dragged && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 4) return;
              dragged = true;
              let x = origin.px + (ev.shiftKey && Math.abs(dx) < Math.abs(dy) ? 0 : dx);
              let y = origin.py + (ev.shiftKey && Math.abs(dy) < Math.abs(dx) ? 0 : dy);
              if (live.snap) {
                const guides = displayMoveGuides(show.displays, hitD.id);
                const snapped = snapRect(
                  { x, y, w: hitD.width, h: hitD.height },
                  guides.x,
                  guides.y,
                  snapThreshold(cam.zoom),
                );
                x = snapped.x;
                y = snapped.y;
                snapGuidesRef.current = {
                  x: [snapped.x, snapped.x + hitD.width],
                  y: [snapped.y, snapped.y + hitD.height],
                };
              }
              live.updateDisplay(hitD.id, { x: Math.round(x), y: Math.round(y) }, false);
            };
            const up = () => {
              snapGuidesRef.current = undefined;
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
            return;
          }
          state.clearSelection();
          pan();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          const canvas = canvasRef.current;
          const current = useApp.getState().show;
          if (!canvas || !current) return;
          const pt = screenToStage(canvas, useApp.getState().camera, e.clientX, e.clientY);
          hoverDisplayRef.current = hitDisplay(current.displays, pt)?.id ?? null;
        }}
        onDragLeave={() => {
          hoverDisplayRef.current = null;
        }}
        onDrop={(e) => {
          e.preventDefault();
          const canvas = canvasRef.current;
          const current = useApp.getState().show;
          if (!canvas || !current) return;
          const cam = useApp.getState().camera;
          const pt = screenToStage(canvas, cam, e.clientX, e.clientY);
          const assetId = e.dataTransfer.getData("text/asset") || draggingAssetId;
          hoverDisplayRef.current = null;
          if (!assetId) return;
          const display = hitDisplay(current.displays, pt);
          if (display) {
            useApp.getState().addCueFromAsset(assetId, undefined, undefined, { displayId: display.id });
            return;
          }
          const asset = current.assets.find((a) => a.id === assetId);
          const w = asset?.width ?? 1920;
          const h = asset?.height ?? 1080;
          let x = pt.x;
          let y = pt.y;
          if (snap) {
            const snapped = snapRect({ x, y, w, h }, displayGuides(current.displays).x, displayGuides(current.displays).y, snapThreshold(cam.zoom));
            x = snapped.x;
            y = snapped.y;
          }
          useApp.getState().addCueFromAsset(assetId, undefined, undefined, { x: Math.round(x), y: Math.round(y) });
        }}
      />
    </div>
  );
}

function Tool({ icon, onClick }: { icon: React.ReactNode; onClick: () => void }) {
  return (
    <button className="grid h-5 w-5 place-items-center rounded hover:bg-white/10" onClick={onClick}>
      {icon}
    </button>
  );
}
