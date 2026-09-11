
import { useApp } from "@/store/appStore";
import { WINDOW_META } from "@/lib/layout";
import { useEffect, useRef } from "react";
import type { WindowId } from "@/types/show";

export function FloatingWindow({
  id,
  children,
}: {
  id: WindowId;
  children: React.ReactNode;
}) {
  const win = useApp((s) => s.windows.find((w) => w.id === id));
  const focused = useApp((s) => s.focusedWindow === id);
  const focusWindow = useApp((s) => s.focusWindow);
  const moveWindow = useApp((s) => s.moveWindow);
  const resizeWindow = useApp((s) => s.resizeWindow);
  const toggleWindow = useApp((s) => s.toggleWindow);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const resize = useRef<{ dir: string; startX: number; startY: number; w: number; h: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const host = document.getElementById("wo-workspace");
      if (!host || !win) return;
      const rect = host.getBoundingClientRect();
      if (drag.current) {
        const x = ((e.clientX - rect.left) / rect.width) * 100 - drag.current.dx;
        const y = ((e.clientY - rect.top) / rect.height) * 100 - drag.current.dy;
        moveWindow(id, x, y);
      }
      if (resize.current) {
        const dx = ((e.clientX - resize.current.startX) / rect.width) * 100;
        const dy = ((e.clientY - resize.current.startY) / rect.height) * 100;
        let { w, h, x, y } = resize.current;
        const dir = resize.current.dir;
        if (dir.includes("e")) w += dx;
        if (dir.includes("s")) h += dy;
        if (dir.includes("w")) {
          w -= dx;
          x += dx;
        }
        if (dir.includes("n")) {
          h -= dy;
          y += dy;
        }
        resizeWindow(id, w, h, x, y);
      }
    };
    const onUp = () => {
      drag.current = null;
      resize.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [id, moveWindow, resizeWindow, win]);

  if (!win?.open) return null;
  const meta = WINDOW_META[id];

  return (
    <section
      className={`wo-window absolute flex flex-col overflow-hidden rounded-sm ${focused ? "focused" : ""}`}
      style={{
        left: `${win.x}%`,
        top: `${win.y}%`,
        width: `${win.w}%`,
        height: `${win.h}%`,
        zIndex: win.z,
      }}
      onPointerDown={() => focusWindow(id)}
    >
      <header
        className="wo-title flex h-7 shrink-0 cursor-grab items-center justify-between px-2 active:cursor-grabbing"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          drag.current = { dx: e.nativeEvent.offsetX / ((e.currentTarget.parentElement?.clientWidth || 1) / 100), dy: 0 };
          const host = document.getElementById("wo-workspace");
          if (!host) return;
          const rect = host.getBoundingClientRect();
          drag.current = {
            dx: ((e.clientX - rect.left) / rect.width) * 100 - win.x,
            dy: ((e.clientY - rect.top) / rect.height) * 100 - win.y,
          };
        }}
        onDoubleClick={() => focusWindow(id)}
      >
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide">
          <span className="inline-block h-2 w-2 rounded-full bg-[#f5a623]" />
          {meta.title}
        </div>
        <button
          className="grid h-5 w-5 place-items-center rounded hover:bg-black/30"
          onClick={() => toggleWindow(id, false)}
          aria-label={`Close ${meta.title}`}
        >
          ×
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const).map((dir) => (
        <div
          key={dir}
          onPointerDown={(e) => {
            e.stopPropagation();
            resize.current = { dir, startX: e.clientX, startY: e.clientY, w: win.w, h: win.h, x: win.x, y: win.y };
          }}
          className="absolute"
          style={{
            cursor: `${dir}-resize`,
            top: dir.includes("n") ? 0 : dir.includes("s") ? "auto" : 8,
            bottom: dir.includes("s") ? 0 : "auto",
            left: dir.includes("w") ? 0 : dir.includes("e") ? "auto" : 8,
            right: dir.includes("e") ? 0 : "auto",
            width: dir === "n" || dir === "s" ? "auto" : 8,
            height: dir === "e" || dir === "w" ? "auto" : 8,
            insetInline: dir === "n" || dir === "s" ? 8 : undefined,
            insetBlock: dir === "e" || dir === "w" ? 8 : undefined,
          }}
        />
      ))}
    </section>
  );
}
