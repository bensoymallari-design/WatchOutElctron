import { useEffect, useRef } from "react";
import { syncOutputFrame } from "@/lib/outputCompositor";
import type { Show } from "@/types/show";
import type { ClockPayload } from "../shared/ipc";

function displayIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("displayId") ?? "";
}

function playAudioFromUrl() {
  return new URLSearchParams(window.location.search).get("audio") === "1";
}

export function OutputView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const showRef = useRef<Show | null>(null);
  const clockRef = useRef<ClockPayload | null>(null);
  const displayId = displayIdFromUrl();
  const playAudio = playAudioFromUrl();

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
      const host = hostRef.current;
      const show = showRef.current;
      if (host && show) {
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
        syncOutputFrame(host, show, displayId, playAudio);
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [displayId, playAudio]);

  return <div ref={hostRef} style={{ position: "fixed", inset: 0, background: "#000" }} />;
}
