import { useEffect, useRef } from "react";
import { cameraForDisplay, drawStage } from "@/lib/renderStage";
import { collectStageCues } from "@/lib/stageCues";
import type { Show } from "@/types/show";
import type { ClockPayload } from "../shared/ipc";

function displayIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("displayId") ?? "";
}

export function OutputView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showRef = useRef<Show | null>(null);
  const clockRef = useRef<ClockPayload | null>(null);
  const displayId = displayIdFromUrl();

  useEffect(() => {
    const api = window.watchout;
    const applyShow = (raw: unknown) => {
      if (raw && typeof raw === "object") showRef.current = raw as Show;
    };
    const unShow = api?.onShow(applyShow);
    const unClock = api?.onClock((clock) => {
      clockRef.current = clock;
    });
    void api?.outputSnapshot().then((snap) => {
      applyShow(snap.show);
      if (snap.clock) clockRef.current = snap.clock;
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void api?.closeOutput(displayId);
      if (e.key === "f" || e.key === "F" || e.key === "F11") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unShow?.();
      unClock?.();
      window.removeEventListener("keydown", onKey);
    };
  }, [displayId]);

  useEffect(() => {
    let raf = 0;
    const paint = () => {
      const canvas = canvasRef.current;
      const show = showRef.current;
      if (canvas && show) {
        const clock = clockRef.current;
        if (clock) {
          const byId = new Map(clock.timelines.map((t) => [t.id, t]));
          for (const t of show.timelines) {
            const c = byId.get(t.id);
            if (c) {
              t.playhead = c.playhead;
              t.playback = c.playback;
              t.rate = c.rate;
            }
          }
        }
        const display = show.displays.find((d) => d.id === displayId) ?? show.displays[0];
        if (display) {
          const cues = collectStageCues(show);
          drawStage({
            canvas,
            displays: show.displays,
            cues,
            assets: show.assets,
            camera: cameraForDisplay(display, canvas.clientWidth, canvas.clientHeight),
            selectedIds: [],
            timeMs: performance.now(),
            showGrid: false,
            clipDisplay: display,
            pixelPerfect: true,
            playing: show.timelines.some((t) => t.playback === "play"),
          });
        }
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [displayId]);

  return <canvas ref={canvasRef} />;
}
