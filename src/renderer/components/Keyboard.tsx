
import { useEffect } from "react";
import { useApp } from "@/store/appStore";
import { unlockPlaybackAudio } from "@/lib/playbackAudio";

export function Keyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
      const a = useApp.getState();
      const mod = e.ctrlKey || e.metaKey;
      const tl = a.show?.timelines.find((x) => x.id === a.activeTimelineId) ?? a.show?.timelines[0];

      if (e.key === "Escape") {
        if (a.menu || a.dialog) {
          a.setMenu(null);
          a.setDialog(null);
          return;
        }
        if (tl) a.setPlayback(tl.id, "stop");
        return;
      }

      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) a.saveDownload();
        else a.save();
        return;
      }
      if (mod && e.key.toLowerCase() === "n" && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) return;
        a.setSnap(!a.snap);
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        a.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        a.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        a.duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void a.openNative();
        return;
      }
      if (mod && e.altKey && e.code === "KeyS") {
        e.preventDefault();
        a.focusWindow("stage");
        return;
      }
      if (mod && e.altKey && e.code === "KeyA") {
        e.preventDefault();
        a.focusWindow("assets");
        return;
      }
      if (mod && e.altKey && e.code === "KeyT") {
        e.preventDefault();
        a.focusWindow("timelines");
        return;
      }
      if (mod && e.altKey && e.code === "KeyD") {
        e.preventDefault();
        a.focusWindow("devices");
        return;
      }
      if (mod && e.altKey && e.code === "KeyV") {
        e.preventDefault();
        a.focusWindow("variables");
        return;
      }
      if (mod && e.altKey && e.code === "KeyC") {
        e.preventDefault();
        a.focusWindow("cues");
        return;
      }
      if (mod && e.altKey && e.code >= "Digit1" && e.code <= "Digit9") {
        e.preventDefault();
        a.savePreset(Number(e.code.slice(-1)));
        return;
      }
      if (e.altKey && !mod && e.code >= "Digit0" && e.code <= "Digit9") {
        e.preventDefault();
        const n = Number(e.code.slice(-1));
        if (n === 0) a.resetLayout();
        else if (n === 1) a.loadProgrammingLayout();
        else if (n === 2) a.loadLiveLayout();
        else a.loadPreset(n);
        return;
      }

      if (typing) return;

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (!tl) return;
        unlockPlaybackAudio();
        a.setPlayback(tl.id, tl.playback === "play" ? "pause" : "play");
        return;
      }
      if (e.altKey && e.shiftKey && e.code === "KeyI") {
        e.preventDefault();
        a.toggleFade("in");
        return;
      }
      if (e.altKey && e.shiftKey && e.code === "KeyO") {
        e.preventDefault();
        a.toggleFade("out");
        return;
      }
      if (e.altKey && e.shiftKey && e.code === "KeyX") {
        e.preventDefault();
        a.applyCrossfade();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        a.deleteSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "i") {
        e.preventDefault();
        a.addLayer();
      }
      if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        a.addCueType("control");
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        a.frameDisplays();
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        a.fitSelectedToWall("cover");
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        a.fitSelectedToDisplay("cover");
      }
      if (a.selection.kind === "cue" && a.selection.ids[0] && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const show = a.show;
        const cue = show?.timelines.flatMap((t) => t.cues).find((c) => c.id === a.selection.ids[0]);
        if (cue) {
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          a.updateCue(cue.id, { position: { ...cue.position, x: cue.position.x + dx, y: cue.position.y + dy } });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
