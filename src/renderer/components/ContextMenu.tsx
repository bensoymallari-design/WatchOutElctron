
import { useEffect } from "react";

export interface MenuItem {
  label?: string;
  shortcut?: string;
  onClick?: () => void;
  danger?: boolean;
  sep?: boolean;
}

export function PopupMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed z-[10000] min-w-[200px] border border-[#111] bg-[#1f1f1f] py-1 text-[12px] shadow-2xl"
      style={{ left: Math.min(x, window.innerWidth - 220), top: Math.min(y, window.innerHeight - 12 - items.length * 28) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item.sep ? (
          <div key={`sep-${i}`} className="my-1 border-t border-[#333]" />
        ) : (
          <button
            key={`${item.label}-${i}`}
            className={`flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#f5a623] hover:text-black ${item.danger ? "text-red-300" : ""}`}
            onClick={() => {
              item.onClick?.();
              onClose();
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && <span className="ml-6 text-[10px] opacity-60">{item.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}
