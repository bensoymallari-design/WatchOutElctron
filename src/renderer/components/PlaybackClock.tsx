import { useEffect, useRef } from "react";
import { useApp } from "@/store/appStore";

export function PlaybackClock() {
  const setFpsNow = useApp((s) => s.setFpsNow);
  const frames = useRef(0);
  const stamp = useRef(0);
  const last = useRef(0);
  const lastGen = useRef(-1);
  const lastShowId = useRef<string>("");

  useEffect(() => {
    const step = (now: number) => {
      if (last.current === 0) last.current = now;
      const dt = Math.min(50, now - last.current);
      last.current = now;
      const state = useApp.getState();
      const playing = state.show?.timelines.some((t) => t.playback === "play");
      if (playing) state.tickPlayback(dt);
      frames.current += 1;
      if (stamp.current === 0) stamp.current = now;
      if (now - stamp.current > 500) {
        setFpsNow((frames.current * 1000) / (now - stamp.current));
        frames.current = 0;
        stamp.current = now;
      }
      const latest = useApp.getState();
      const show = latest.show;
      if (show && window.watchout) {
        if (latest.contentGen !== lastGen.current || show.id !== lastShowId.current) {
          lastGen.current = latest.contentGen;
          lastShowId.current = show.id;
          window.watchout.pushShow(show);
        }
        window.watchout.pushClock({
          fps: show.prefs.fps,
          timelines: show.timelines.map((t) => ({
            id: t.id,
            playhead: t.playhead,
            playback: t.playback,
            rate: t.rate,
          })),
        });
      }
    };
    let raf = 0;
    const loop = (now: number) => {
      step(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [setFpsNow]);

  return null;
}
