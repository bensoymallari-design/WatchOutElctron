import { useEffect, useState } from "react";
import { useApp } from "@/store/appStore";
import { friendlyNdiName, isNoiseNdiName, type NdiAdvert } from "@/lib/ndiNames";
import { NDI_RUNTIME_URL } from "@/lib/ndiCameras";

interface DiscoverResponse {
  sources: NdiAdvert[];
  lan: { address: string; name: string }[];
  ok: boolean;
  error?: string;
  runtime?: boolean;
  runtimePath?: string | null;
  loadError?: string;
}

export function NdiConnectDialog() {
  const [scan, setScan] = useState<DiscoverResponse | null>(null);
  const [scanning, setScanning] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const scanLan = (showBusy = true) => {
    if (showBusy) setScanning(true);
    void (window.watchout?.discoverNdi() ?? Promise.reject(new Error("Desktop API missing")))
      .then((data: DiscoverResponse) => setScan(data))
      .catch(() => setScan({ sources: [], lan: [], ok: false, error: "Scan failed", runtime: false }))
      .finally(() => setScanning(false));
  };

  useEffect(() => {
    useApp.getState().ensureNdiAsset();
    scanLan();
    const timer = window.setInterval(() => scanLan(false), 2000);
    return () => window.clearInterval(timer);
  }, []);

  const found = (scan?.sources ?? []).filter((s) => !isNoiseNdiName(s.name));
  const runtime = !!scan?.runtime;

  const connect = async (source: NdiAdvert) => {
    setConnecting(source.name);
    setError("");
    try {
      const ok = await useApp.getState().connectNdiSource(source.name);
      if (ok) useApp.getState().setDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect");
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div className="max-h-[86vh] overflow-auto p-4">
      <div className="mb-2 text-sm font-semibold text-[#f5a623]">NDI</div>
      <p className="mb-3 text-[12px] leading-relaxed text-stone-400">
        DistroAV 6.2 already has NDI 6.3 loaded inside OBS — you do{" "}
        <span className="text-stone-200">not</span> need NDI Tools. Connect{" "}
        <span className="text-stone-200">HPVS-BPXL-12 (QUBITNDI)</span>, not KeepAliveServer. Keep{" "}
        <span className="text-stone-200">DistroAV → Main Output</span> on and put a{" "}
        <span className="text-stone-200">camera or Color Source</span> on Program. Display Capture of
        WatchJhon is a loop. Stage is a 960 preview so Producer stays smooth; Output keeps the
        sender’s resolution.
      </p>

      <div
        className={`mb-3 rounded border p-2 text-[12px] leading-relaxed ${
          runtime
            ? "border-emerald-800/80 bg-[#0c1a12] text-emerald-200"
            : "border-amber-700/70 bg-[#1a1408] text-amber-100"
        }`}
      >
        {runtime ? (
          <>
            Runtime loaded{scan?.runtimePath ? ` · ${scan.runtimePath}` : ""}. Do{" "}
            <span className="text-stone-100">not</span> download NDI Runtime or NDI Tools again. Pick{" "}
            <span className="text-stone-100">QUBITNDI</span> below. KeepAliveServer rows are DistroAV
            keepalive, not video, and are hidden.
          </>
        ) : scan?.runtimePath ? (
          <>
            DistroAV’s NDI DLL is already at <span className="text-stone-100">{scan.runtimePath}</span>. You do{" "}
            <span className="text-stone-100">not</span> need NDI Tools or another Runtime download.
            {scan.loadError ? (
              <>
                {" "}
                <span className="text-amber-50">{scan.loadError}</span>
              </>
            ) : (
              <>
                {" "}
                WatchJhon’s helper has not loaded it yet. Splash must say{" "}
                <span className="text-stone-100">PRODUCER 7.8.29</span>. Fully quit WatchJhon and reopen this
                installer.
              </>
            )}
          </>
        ) : (
          <>
            WatchJhon cannot find DistroAV’s NDI 6.3 DLL.
            {scan?.loadError ? (
              <>
                {" "}
                <span className="text-amber-50">{scan.loadError}</span>
              </>
            ) : (
              <>
                {" "}
                Click DistroAV <span className="text-stone-100">Get NDI Library</span>, then fully quit
                WatchJhon so it can read <span className="text-stone-100">NDI_RUNTIME_DIR_V6</span>.
              </>
            )}{" "}
            Only if DistroAV itself cannot load NDI, install the free{" "}
            <button className="text-[#f5a623] underline" onClick={() => void window.watchout?.openExternal(NDI_RUNTIME_URL)}>
              NDI Runtime
            </button>
            .
          </>
        )}
      </div>

      <section className="rounded border border-[#333] bg-[#141414] p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Sources on this network</div>
          <button className="rounded bg-[#333] px-2 py-0.5 text-[11px]" onClick={() => scanLan()}>
            {scanning ? "Scanning…" : "Scan again"}
          </button>
        </div>
        {scanning && found.length === 0 && (
          <div className="text-stone-500">Listening for OBS, Resolume, cameras, and other NDI senders…</div>
        )}
        {!scanning && found.length === 0 && (
          <div className="text-stone-400">
            No video NDI source yet. DistroAV KeepAliveServer rows are hidden on purpose. In OBS keep{" "}
            <span className="text-stone-200">DistroAV → Main Output</span> on (
            <span className="text-stone-200">QUBITNDI</span>), put a camera or Color Source on Program,
            then Scan again. Allow WatchJhon through Windows Firewall on a Private network.
          </div>
        )}
        {found.map((s) => (
          <div key={`${s.name}-${s.ip ?? s.host}-${s.port}`} className="flex items-center justify-between gap-2 border-t border-[#2a2a2a] py-1.5">
            <div className="min-w-0">
              <div className="truncate text-emerald-300" title={s.name}>
                {friendlyNdiName(s.name)}
              </div>
              <div className="truncate text-[10px] text-stone-500">
                {s.name}
                {s.ip || s.host ? ` · ${s.ip || s.host}` : ""}
              </div>
            </div>
            <button
              className="shrink-0 rounded bg-[#f5a623] px-2 py-0.5 text-[11px] text-black disabled:opacity-40"
              disabled={!!connecting}
              onClick={() => void connect(s)}
            >
              {connecting === s.name ? "Connecting…" : "Connect"}
            </button>
          </div>
        ))}
      </section>

      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}

      <div className="mt-3 flex justify-end">
        <button className="px-3 py-1" onClick={() => useApp.getState().setDialog(null)}>
          Close
        </button>
      </div>
    </div>
  );
}
