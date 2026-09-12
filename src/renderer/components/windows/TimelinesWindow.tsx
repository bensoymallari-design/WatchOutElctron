
import { useState } from "react";
import { useApp, useActiveTimeline } from "@/store/appStore";
import { formatMs } from "@/lib/time";
import { Pause, Play, Square, Plus, Trash2 } from "lucide-react";
import { PopupMenu } from "@/components/ContextMenu";

export function TimelinesWindow() {
  const show = useApp((s) => s.show);
  const activeId = useApp((s) => s.activeTimelineId);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  if (!show) return null;
  return (
    <div
      className="flex h-full flex-col bg-[#1a1a1a]"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="flex items-center justify-between border-b border-black px-2 py-1 text-[11px] text-stone-400">
        <span>{show.timelines.length} timelines</span>
        <span className="flex gap-2">
          {show.timelines.length > 1 && (
            <button
              className="inline-flex items-center gap-1 text-red-300 hover:text-red-100"
              onClick={() => {
                const id = useApp.getState().activeTimelineId;
                if (id) useApp.getState().deleteTimeline(id);
              }}
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
          <button className="inline-flex items-center gap-1 hover:text-[#f5a623]" onClick={() => useApp.getState().addTimeline()}>
            <Plus size={12} /> Add
          </button>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {show.timelines.map((t) => {
          const active = t.id === activeId;
          return (
            <button
              key={t.id}
              className={`flex w-full items-center gap-2 border-b border-[#222] px-2 py-1.5 text-left ${
                active ? "bg-[#3b2a12] text-[#f5a623]" : "hover:bg-white/5"
              }`}
              onClick={() => {
                useApp.getState().setActiveTimeline(t.id);
                useApp.getState().select({ kind: "timeline", ids: [t.id] });
              }}
              onDoubleClick={() => useApp.getState().focusWindow("timeline")}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                useApp.getState().setActiveTimeline(t.id);
                useApp.getState().select({ kind: "timeline", ids: [t.id] });
                setMenu({ x: e.clientX, y: e.clientY });
              }}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  t.playback === "play" ? "bg-emerald-400" : t.playback === "pause" ? "bg-amber-300" : "bg-stone-600"
                }`}
              />
              <span className="flex-1 truncate">{t.name}</span>
              <span className="font-mono text-[10px] text-stone-500">{formatMs(t.playhead)}</span>
              <span className="flex gap-0.5">
                <Mini icon={<Play size={10} />} onClick={() => useApp.getState().setPlayback(t.id, "play")} />
                <Mini icon={<Pause size={10} />} onClick={() => useApp.getState().setPlayback(t.id, "pause")} />
                <Mini icon={<Square size={10} />} onClick={() => useApp.getState().setPlayback(t.id, "stop")} />
                <Mini
                  icon={<Trash2 size={10} />}
                  onClick={() => useApp.getState().deleteTimeline(t.id)}
                />
              </span>
            </button>
          );
        })}
      </div>
      {menu && (
        <PopupMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Add Timeline",
              onClick: () => useApp.getState().addTimeline(),
            },
            {
              label: "Open Timeline",
              onClick: () => useApp.getState().focusWindow("timeline"),
            },
            {
              label: "Rename in Properties",
              onClick: () => useApp.getState().focusWindow("properties"),
            },
            { sep: true },
            {
              label: "Delete Timeline",
              danger: true,
              shortcut: "Del",
              onClick: () => {
                const id = useApp.getState().activeTimelineId;
                if (id) useApp.getState().deleteTimeline(id);
              },
            },
          ]}
        />
      )}
    </div>
  );
}

function Mini({ icon, onClick }: { icon: React.ReactNode; onClick: () => void }) {
  return (
    <span
      className="grid h-5 w-5 place-items-center rounded hover:bg-white/10"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {icon}
    </span>
  );
}

export function useTL() {
  return useActiveTimeline();
}
