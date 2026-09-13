
import { useApp } from "@/store/appStore";
import { WINDOW_META } from "@/lib/layout";
import { EFFECT_TOGGLES, TWEEN_META } from "@/lib/tweens";
import { formatTimecode } from "@/lib/time";
import type { WindowId } from "@/types/show";
import { Activity, Bell, Database, Globe } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENUS = ["file", "edit", "stage", "timeline", "effect", "window", "help"] as const;

export function MenuBar() {
  const menu = useApp((s) => s.menu);
  const setMenu = useApp((s) => s.setMenu);
  const show = useApp((s) => s.show);
  const logs = useApp((s) => s.logs);
  const messagesOpen = useApp((s) => s.messagesOpen);
  const toggleMessages = useApp((s) => s.toggleMessages);
  const fps = useApp((s) => s.show?.prefs.fps ?? 60);
  const fpsNow = useApp((s) => s.fpsNow);
  const fileRef = useRef<HTMLInputElement>(null);
  const openFile = useApp((s) => s.openFile);

  useEffect(() => {
    if (!menu && !messagesOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-wo-menu]")) return;
      setMenu(null);
      if (messagesOpen && !t.closest("[data-wo-messages]")) useApp.getState().toggleMessages();
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [menu, messagesOpen, setMenu]);

  return (
    <div className="relative z-[1000] flex h-8 shrink-0 items-center overflow-visible border-b border-black bg-[#2a2a2a] px-1 text-[12px]" data-wo-menu>
      <div className="mr-3 px-2 text-[11px] font-black tracking-[0.28em] text-[#f5a623]">
        WatchJhon <span className="ml-1 font-semibold tracking-normal text-stone-200">7.8.21</span>
      </div>
      {MENUS.map((name) => (
        <MenuSlot
          key={name}
          name={name}
          open={menu === name}
          onToggle={() => setMenu(menu === name ? null : name)}
          onHover={() => {
            if (menu) setMenu(name);
          }}
        >
          {name === "file" && <FileMenu fileRef={fileRef} />}
          {name === "edit" && <EditMenu />}
          {name === "stage" && <StageMenu />}
          {name === "timeline" && <TimelineMenu />}
          {name === "effect" && <EffectMenu />}
          {name === "window" && <WindowMenu />}
          {name === "help" && <HelpMenu />}
        </MenuSlot>
      ))}
      <div className="ml-auto flex items-center gap-3 pr-2 text-[11px] text-stone-400">
        <span>{Math.round(fpsNow)} fps</span>
        <span className="text-stone-600">show {fps} fps</span>
        <span className="inline-flex items-center gap-1">
          <Globe size={12} /> {show?.director ?? "none"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Database size={12} /> {show?.assetManager ?? "none"}
        </span>
        <button className="inline-flex items-center gap-1 hover:text-[#f5a623]" onClick={() => useApp.getState().focusWindow("nodes")}>
          <Activity size={12} />
        </button>
        <button className="relative inline-flex items-center hover:text-[#f5a623]" onClick={toggleMessages}>
          <Bell size={12} />
          {logs[0] && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[#f5a623]" />}
        </button>
      </div>
      {messagesOpen && (
        <div data-wo-messages className="absolute right-2 top-8 z-[10000] w-96 max-h-72 overflow-auto border border-[#111] bg-[#1a1a1a] p-2 shadow-2xl">
          {logs.length === 0 ? (
            <div className="p-3 text-stone-500">No messages</div>
          ) : (
            logs.slice(0, 30).map((l) => (
              <div key={l.id} className="border-b border-[#2a2a2a] px-2 py-1.5">
                <span className={l.level === "error" ? "text-red-400" : l.level === "warn" ? "text-amber-300" : "text-stone-400"}>
                  {new Date(l.ts).toLocaleTimeString()}
                </span>{" "}
                {l.message}
              </div>
            ))
          )}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,.watch.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openFile(f);
        }}
      />
    </div>
  );
}

function MenuSlot({
  name,
  open,
  onToggle,
  onHover,
  children,
}: {
  name: string;
  open: boolean;
  onToggle: () => void;
  onHover: () => void;
  children: React.ReactNode;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative overflow-visible">
      <button
        ref={btn}
        className={`px-2.5 py-1 capitalize ${open ? "bg-[#f5a623] text-black" : "hover:bg-white/10"}`}
        onClick={onToggle}
        onMouseEnter={onHover}
      >
        {name}
      </button>
      {open && (
        <BarDropdown anchor={btn.current}>
          {children}
        </BarDropdown>
      )}
    </div>
  );
}

function BarDropdown({ anchor, children }: { anchor: HTMLButtonElement | null; children: React.ReactNode }) {
  const [pos, setPos] = useState({ left: 8, top: 32 });
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const width = 280;
      const left = Math.min(Math.max(4, r.left), window.innerWidth - width - 4);
      const top = r.bottom;
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      data-wo-menu
      className="fixed z-[10000] max-h-[min(72vh,calc(100vh-40px))] min-w-[260px] overflow-auto border border-[#111] bg-[#1f1f1f] py-1 shadow-2xl"
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

function Item({
  label,
  shortcut,
  onClick,
  checked,
  danger,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  checked?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={`flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#f5a623] hover:text-black ${danger ? "text-red-300" : ""}`}
      onClick={() => {
        onClick();
        useApp.getState().setMenu(null);
      }}
    >
      <span>
        {checked !== undefined && <span className="mr-2 inline-block w-3">{checked ? "✓" : ""}</span>}
        {label}
      </span>
      {shortcut && <span className="ml-6 text-[10px] opacity-60">{shortcut}</span>}
    </button>
  );
}

function Sep() {
  return <div className="my-1 border-t border-[#333]" />;
}

function FileMenu({ fileRef }: { fileRef: React.RefObject<HTMLInputElement | null> }) {
  const a = useApp.getState;
  return (
    <>
      <Item label="New" shortcut="Ctrl+N" onClick={() => a().newShow()} />
      <Item label="Open…" shortcut="Ctrl+O" onClick={() => void a().openNative()} />
      <Item label="Open last saved / Director" onClick={() => a().openLocal()} />
      <Item label="Open Demo Show" onClick={() => a().openDemo()} />
      <Sep />
      <Item label="Save" shortcut="Ctrl+S" onClick={() => a().save()} />
      <Item label="Save As / Export…" shortcut="Ctrl+Shift+S" onClick={() => a().saveDownload()} />
      <Item label="Show Properties" onClick={() => { a().clearSelection(); a().focusWindow("properties"); a().setMenu(null); }} />
      <Sep />
      <Item label="Prepare videos for Producer…" onClick={() => { a().setDialog("prepareMedia"); a().setMenu(null); }} />
      <Sep />
      <Item label="Quit to Start Page" onClick={() => a().quitToWelcome()} />
    </>
  );
}

function EditMenu() {
  const a = useApp.getState;
  const s = useApp();
  return (
    <>
      <Item label="Undo" shortcut="Ctrl+Z" onClick={() => a().undo()} />
      <Item label="Redo" shortcut="Ctrl+Y" onClick={() => a().redo()} />
      <Sep />
      <Item label="Duplicate" shortcut="Ctrl+D" onClick={() => a().duplicateSelected()} />
      <Item label="Delete" shortcut="Del" onClick={() => a().deleteSelected()} danger />
      <Sep />
      <Item label="Snap" shortcut="Ctrl+N" checked={s.snap} onClick={() => { a().setSnap(!s.snap); a().setMenu(null); }} />
      <Item
        label="Click empty timeline jumps playhead"
        shortcut="Ctrl+T"
        checked={s.clickJumpsToTime}
        onClick={() => { a().setClickJumps(!s.clickJumpsToTime); a().setMenu(null); }}
      />
      <Item
        label="Legacy Keyboard Mode"
        checked={s.legacyKeyboard}
        onClick={() => { a().setLegacy(!s.legacyKeyboard); a().setMenu(null); }}
      />
    </>
  );
}

function StageMenu() {
  const a = useApp.getState;
  return (
    <>
      <Item label="Add Display" onClick={() => { a().addDisplay(); a().setMenu(null); }} />
      <Item label="Add Virtual Display" onClick={() => { a().addDisplay({ virtual: true, outputType: "Virtual", name: "Virtual Display" }); a().setMenu(null); }} />
      <Item label="Create Display Grid…" onClick={() => a().setDialog("displayGrid")} />
      <Sep />
      <Item label="Frame All Displays" shortcut="Ctrl+Shift+D" onClick={() => { a().frameDisplays(); a().setMenu(null); }} />
      <Item label="Fit Selected to Wall" shortcut="Ctrl+Shift+W" onClick={() => { a().fitSelectedToWall("cover"); a().setMenu(null); }} />
      <Item label="Fit Selected to Display" shortcut="Ctrl+Shift+F" onClick={() => { a().fitSelectedToDisplay("cover"); a().setMenu(null); }} />
      <Item label="Fit Inside Display" onClick={() => { a().fitSelectedToDisplay("contain"); a().setMenu(null); }} />
      <Item label="Output Selected Display" onClick={() => { void a().outputSelectedDisplay(); a().setMenu(null); }} />
      <Item label="Output All Displays" onClick={() => { void a().outputAllDisplays(); a().setMenu(null); }} />
      <Item label="Scroll to Origin" shortcut="Ctrl+Shift+O" onClick={() => { a().setCamera({ x: 0, y: 0 }); a().setMenu(null); }} />
    </>
  );
}

function TimelineMenu() {
  const a = useApp.getState;
  return (
    <>
      <Item label="Add Timeline" onClick={() => { a().addTimeline(); a().setMenu(null); }} />
      <Item
        label="Delete Timeline"
        danger
        onClick={() => {
          const sel = a().selection;
          const id = sel.kind === "timeline" ? sel.ids[0] : a().activeTimelineId;
          if (id) a().deleteTimeline(id);
          a().setMenu(null);
        }}
      />
      <Sep />
      <Item label="Add Play Control Cue" shortcut="Ctrl+P" onClick={() => { a().addCueType("control"); a().setMenu(null); }} />
      <Item label="Add Marker Cue" onClick={() => { a().addCueType("marker"); a().setMenu(null); }} />
      <Item label="Add Output Cue" onClick={() => { a().addCueType("output"); a().setMenu(null); }} />
      <Item label="Add Variable Cue" onClick={() => { a().addCueType("variable"); a().setMenu(null); }} />
      <Item label="Add ArtNet Cue" onClick={() => { a().addCueType("artnet"); a().setMenu(null); }} />
      <Sep />
      <Item
        label="Fit Length to Media"
        onClick={() => {
          a().fitTimelineToMedia();
          a().setMenu(null);
        }}
      />
      <Sep />
      <Item label="Add Layer" shortcut="Ctrl+I" onClick={() => { a().addLayer(); a().setMenu(null); }} />
      <Item label="Insert Layer" onClick={() => { a().insertLayer(); a().setMenu(null); }} />
      <Item
        label="Delete Layer"
        onClick={() => {
          const sel = a().selection;
          if (sel.kind === "layer" && sel.ids[0]) a().deleteLayer(sel.ids[0]);
          a().setMenu(null);
        }}
      />
    </>
  );
}

function EffectMenu() {
  const a = useApp.getState;
  return (
    <>
      <Item label="Fade-in" shortcut="Shift+Alt+I" onClick={() => { a().toggleFade("in"); a().setMenu(null); }} />
      <Item label="Fade-out" shortcut="Shift+Alt+O" onClick={() => { a().toggleFade("out"); a().setMenu(null); }} />
      <Item label="Cross-fade" shortcut="Shift+Alt+X" onClick={() => { a().applyCrossfade(); a().setMenu(null); }} />
      <Sep />
      {EFFECT_TOGGLES.map((t) => (
        <Item
          key={t.type}
          label={TWEEN_META[t.type].label}
          shortcut={t.shortcut}
          onClick={() => {
            a().toggleTween(t.type);
            a().setMenu(null);
          }}
        />
      ))}
    </>
  );
}

function WindowMenu() {
  const a = useApp.getState;
  const windows = useApp((s) => s.windows);
  return (
    <>
      {(Object.keys(WINDOW_META) as WindowId[]).map((id) => {
        const open = windows.find((w) => w.id === id)?.open;
        return (
          <Item
            key={id}
            label={WINDOW_META[id].title}
            shortcut={WINDOW_META[id].shortcut}
            checked={open}
            onClick={() => a().focusWindow(id)}
          />
        );
      })}
      <Sep />
      <Item label="Reset Layout" shortcut="Alt+0" onClick={() => a().resetLayout()} />
      <Item label="Programming Layout" shortcut="Alt+1" onClick={() => a().loadProgrammingLayout()} />
      <Item label="Live Layout" shortcut="Alt+2" onClick={() => a().loadLiveLayout()} />
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <Item key={n} label={`Save Preset ${n}`} shortcut={`Ctrl+Alt+${n}`} onClick={() => a().savePreset(n)} />
      ))}
    </>
  );
}

function HelpMenu() {
  const a = useApp.getState;
  const show = useApp((s) => s.show);
  return (
    <>
      <Item
        label="Prepare videos for Producer…"
        onClick={() => {
          a().setDialog("prepareMedia");
        }}
      />
      <Item
        label="About WatchJhon"
        onClick={() => {
          a().log(`WatchJhon Producer  ·  ${show?.name ?? ""}  ·  ${formatTimecode(0)}`);
          a().setDialog("about");
        }}
      />
    </>
  );
}
