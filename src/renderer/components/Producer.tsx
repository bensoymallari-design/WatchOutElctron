
import { Dialogs } from "@/components/Dialogs";
import { FloatingWindow } from "@/components/FloatingWindow";
import { Keyboard } from "@/components/Keyboard";
import { MenuBar } from "@/components/MenuBar";
import { PlaybackClock } from "@/components/PlaybackClock";
import { AssetsWindow } from "@/components/windows/AssetsWindow";
import { PropertiesWindow } from "@/components/windows/PropertiesWindow";
import { StageWindow } from "@/components/windows/StageWindow";
import {
  CueSetsWindow,
  CuesWindow,
  DevicesWindow,
  LogWindow,
  NodesWindow,
  VariablesWindow,
} from "@/components/windows/StudioWindows";
import { TimelineWindow } from "@/components/windows/TimelineWindow";
import { TimelinesWindow } from "@/components/windows/TimelinesWindow";
import { useApp } from "@/store/appStore";
import { unlockPlaybackAudio } from "@/lib/playbackAudio";
import { useEffect } from "react";

export function Producer() {
  const setMenu = useApp((s) => s.setMenu);

  useEffect(() => {
    const blockPageZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    const blockGesture = (e: Event) => e.preventDefault();
    window.addEventListener("wheel", blockPageZoom, { passive: false });
    window.addEventListener("gesturestart", blockGesture);
    window.addEventListener("gesturechange", blockGesture);
    return () => {
      window.removeEventListener("wheel", blockPageZoom);
      window.removeEventListener("gesturestart", blockGesture);
      window.removeEventListener("gesturechange", blockGesture);
    };
  }, []);

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-[#0e0e0e]"
      onPointerDown={() => unlockPlaybackAudio()}
    >
      <MenuBar />
      <div
        id="wo-workspace"
        className="relative min-h-0 flex-1"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            setMenu(null);
            useApp.getState().clearSelection();
          }
        }}
      >
        <FloatingWindow id="stage">
          <StageWindow />
        </FloatingWindow>
        <FloatingWindow id="properties">
          <PropertiesWindow />
        </FloatingWindow>
        <FloatingWindow id="assets">
          <AssetsWindow />
        </FloatingWindow>
        <FloatingWindow id="timelines">
          <TimelinesWindow />
        </FloatingWindow>
        <FloatingWindow id="timeline">
          <TimelineWindow />
        </FloatingWindow>
        <FloatingWindow id="devices">
          <DevicesWindow />
        </FloatingWindow>
        <FloatingWindow id="nodes">
          <NodesWindow />
        </FloatingWindow>
        <FloatingWindow id="variables">
          <VariablesWindow />
        </FloatingWindow>
        <FloatingWindow id="cues">
          <CuesWindow />
        </FloatingWindow>
        <FloatingWindow id="cueSets">
          <CueSetsWindow />
        </FloatingWindow>
        <FloatingWindow id="log">
          <LogWindow />
        </FloatingWindow>
        <Dialogs />
      </div>
      <PlaybackClock />
      <Keyboard />
    </div>
  );
}
