
import { useApp } from "@/store/appStore";
import { useRef } from "react";

export function WelcomeScreen() {
  const newShow = useApp((s) => s.newShow);
  const openDemo = useApp((s) => s.openDemo);
  const openLocal = useApp((s) => s.openLocal);
  const openFile = useApp((s) => s.openFile);
  const recents = useApp((s) => s.recents);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0d0d0d]">
      <div className="relative flex w-[58%] flex-col justify-center px-16">
        <div className="absolute inset-0 opacity-40" style={{
          background:
            "radial-gradient(ellipse at 20% 20%, rgba(245,166,35,0.18), transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(168,85,247,0.12), transparent 45%)",
        }} />
        <div className="relative">
          <div className="mb-3 text-[11px] tracking-[0.45em] text-[#f5a623]">DATATON-STYLE SHOW CONTROL</div>
          <h1 className="text-[64px] font-black leading-none tracking-[0.18em] text-[#f5a623]">WATCHOUT</h1>
          <div className="mt-2 text-lg tracking-[0.35em] text-stone-300">PRODUCER  7.8.3</div>
          <p className="mt-6 max-w-xl text-[13px] leading-relaxed text-stone-400">
            Native desktop Producer: Stage, Timeline, Assets, and Runner outputs on real monitors.
            Devices → Assign screens maps each Display to one of your controllers. Devices → Audio → Test beep
            checks the laptop speakers before you press Space.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <WelcomeBtn label="New Show" hint="Local Director + Asset Manager" onClick={newShow} primary />
            <WelcomeBtn label="Open Show" hint="Load a .watch.json file" onClick={() => void useApp.getState().openNative()} />
            <WelcomeBtn label="CONNECT" hint="Open last saved show" onClick={openLocal} />
            <WelcomeBtn label="Demo Show" hint="3-wide LED wall with cues" onClick={openDemo} />
            <WelcomeBtn
              label="Learn More"
              hint="WATCHOUT 7 documentation"
              onClick={() => void window.watchout?.openExternal("https://docs.dataton.com/watchout-7-new/watchout/getting-started/welcome-to-watchout-7.html")}
            />
          </div>
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
      </div>
      <div className="flex w-[42%] flex-col border-l border-[#2a2a2a] bg-[#161616] px-10 py-12">
        <div className="text-[11px] uppercase tracking-[0.28em] text-stone-500">Recent Shows</div>
        <div className="mt-5 flex-1 space-y-2 overflow-auto">
          {recents.length === 0 ? (
            <div className="rounded border border-dashed border-[#333] p-6 text-stone-500">
              No recent shows yet. Create a new show or open the LED wall demo.
            </div>
          ) : (
            recents.map((r) => (
              <button
                key={r.id + r.savedAt}
                onClick={() => {
                  if (r.path) void useApp.getState().openRecentPath(r.path);
                  else openLocal();
                }}
                className="flex w-full items-center justify-between rounded border border-[#2e2e2e] bg-[#1c1c1c] px-4 py-3 text-left hover:border-[#f5a623]/50"
              >
                <div>
                  <div className="text-stone-200">{r.name}</div>
                  <div className="text-[11px] text-stone-500">{new Date(r.savedAt).toLocaleString()}</div>
                </div>
                <span className="text-[11px] text-[#f5a623]">OPEN</span>
              </button>
            ))
          )}
        </div>
        <div className="mt-6 text-[11px] text-stone-600">
          WATCHOUT Producer is a desktop app. Shows save as .watch.json. Media is copied into the local Asset Manager with codec proxies when needed.
        </div>
      </div>
    </div>
  );
}

function WelcomeBtn({
  label,
  hint,
  onClick,
  primary,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`min-w-[160px] rounded border px-4 py-3 text-left ${
        primary
          ? "border-[#f5a623] bg-[#f5a623] text-black"
          : "border-[#3a3a3a] bg-[#1f1f1f] text-stone-200 hover:border-[#f5a623]"
      }`}
    >
      <div className="text-[13px] font-semibold tracking-wide">{label}</div>
      <div className={`text-[11px] ${primary ? "text-black/70" : "text-stone-500"}`}>{hint}</div>
    </button>
  );
}
