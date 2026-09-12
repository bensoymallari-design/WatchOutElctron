import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/store/appStore";
import { uid } from "@/lib/ids";
import { startPhoneReceiver, subscribePhone, getPhoneRoom } from "@/lib/phoneReceiver";
import { friendlyNdiName, type NdiAdvert } from "@/lib/ndiNames";
import {
  isNdiWebcamLabel,
  NDI_TOOLS_URL,
  preferredCameraId,
  sortCamerasForNdi,
  type VideoInput,
} from "@/lib/ndiCameras";
import { listVideoInputs } from "@/lib/liveSources";

interface DiscoverResponse {
  sources: NdiAdvert[];
  lan: { address: string; name: string }[];
  ok: boolean;
  error?: string;
}

type Tab = "ndi" | "browser" | "other";

export function NdiConnectDialog() {
  const [tab, setTab] = useState<Tab>("ndi");
  const [url, setUrl] = useState("");
  const [room] = useState(() => getPhoneRoom() ?? (uid("cam").replace(/[^a-z0-9]/gi, "").slice(0, 14) || "camroom"));
  const [scan, setScan] = useState<DiscoverResponse | null>(null);
  const [scanning, setScanning] = useState(true);
  const [status, setStatus] = useState("Waiting for a phone browser to join…");
  const [live, setLive] = useState(false);
  const [cameras, setCameras] = useState<VideoInput[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [connecting, setConnecting] = useState(false);

  const localUrl = `http://127.0.0.1:4735/cam/${room}`;
  const lanUrls = lanJoinUrls(room, scan?.lan ?? []);
  const phoneUrl = lanUrls[0] || localUrl;
  const needsHttps = phoneUrlNeedsHttps(phoneUrl);
  const httpsPhoneUrl = phoneUrl.replace(/^http:\/\//i, "https://");
  const found = scan?.sources ?? [];
  const sourceNames = found.map((s) => s.name);
  const rankedCameras = useMemo(() => sortCamerasForNdi(cameras, sourceNames), [cameras, sourceNames]);
  const ndiWebcams = rankedCameras.filter((c) => isNdiWebcamLabel(c.label));

  const scanLan = (showBusy = true) => {
    if (showBusy) setScanning(true);
    void (window.watchout?.discoverNdi() ?? Promise.reject(new Error("Desktop API missing")))
      .then((data: DiscoverResponse) => setScan(data))
      .catch(() => setScan({ sources: [], lan: [], ok: false, error: "Scan failed" }))
      .finally(() => setScanning(false));
  };

  const refreshCameras = () => {
    void listVideoInputs()
      .then((list) => {
        setCameras(list);
        setCameraError(list.length ? "" : "Windows did not list a camera. Allow camera access, then Refresh cameras.");
      })
      .catch((error) => {
        setCameras([]);
        setCameraError(error instanceof Error ? error.message : "Could not list cameras");
      });
  };

  useEffect(() => {
    scanLan();
    refreshCameras();
    const devices = navigator.mediaDevices;
    const onChange = () => refreshCameras();
    devices?.addEventListener?.("devicechange", onChange);
    const timer = window.setInterval(() => scanLan(false), 4000);
    return () => {
      devices?.removeEventListener?.("devicechange", onChange);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!rankedCameras.length) return;
    setCameraId((current) => {
      if (current && rankedCameras.some((c) => c.deviceId === current)) return current;
      return preferredCameraId(rankedCameras, sourceNames) || rankedCameras[0].deviceId;
    });
  }, [rankedCameras, sourceNames]);

  useEffect(() => {
    useApp.getState().ensureNdiAsset();
  }, []);

  useEffect(() => {
    if (tab !== "browser") return;
    const assetId = useApp.getState().ensureNdiAsset();
    if (!assetId) return;
    startPhoneReceiver(room, assetId);
    return subscribePhone((message, isLive) => {
      setStatus(message);
      setLive(isLive);
    });
  }, [room, tab]);

  const bindCamera = async (deviceId: string) => {
    const id = useApp.getState().ensureNdiAsset();
    if (!id) return;
    setConnecting(true);
    setCameraError("");
    try {
      const ok = await useApp.getState().connectLiveSource(id, "camera", undefined, deviceId || undefined);
      if (ok) useApp.getState().setDialog(null);
      else setCameraError("Could not open that camera. Pick NDI Webcam Video, or allow camera access.");
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Could not open that camera");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="max-h-[86vh] overflow-auto p-4">
      <div className="mb-2 text-sm font-semibold text-[#f5a623]">NDI / live input</div>
      <div className="mb-3 flex flex-wrap gap-1 text-[11px]">
        <TabBtn active={tab === "ndi"} onClick={() => setTab("ndi")}>
          NDI Camera Pro
        </TabBtn>
        <TabBtn active={tab === "browser"} onClick={() => setTab("browser")}>
          Phone browser QR
        </TabBtn>
        <TabBtn active={tab === "other"} onClick={() => setTab("other")}>
          PC / URL
        </TabBtn>
      </div>

      {tab === "ndi" && (
        <NdiProTab
          scanning={scanning}
          found={found}
          cameras={rankedCameras}
          ndiWebcams={ndiWebcams}
          cameraId={cameraId}
          cameraError={cameraError}
          connecting={connecting}
          onCameraId={setCameraId}
          onRefreshNdi={scanLan}
          onRefreshCameras={refreshCameras}
          onConnect={() => void bindCamera(cameraId)}
        />
      )}

      {tab === "browser" && (
        <BrowserTab
          phoneUrl={phoneUrl}
          localUrl={localUrl}
          lanUrls={lanUrls}
          needsHttps={needsHttps}
          httpsPhoneUrl={httpsPhoneUrl}
          status={status}
          live={live}
        />
      )}

      {tab === "other" && (
        <OtherTab
          url={url}
          onUrl={setUrl}
          onPcCamera={() => void bindCamera("")}
        />
      )}
    </div>
  );
}

function NdiProTab({
  scanning,
  found,
  cameras,
  ndiWebcams,
  cameraId,
  cameraError,
  connecting,
  onCameraId,
  onRefreshNdi,
  onRefreshCameras,
  onConnect,
}: {
  scanning: boolean;
  found: NdiAdvert[];
  cameras: VideoInput[];
  ndiWebcams: VideoInput[];
  cameraId: string;
  cameraError: string;
  connecting: boolean;
  onCameraId: (id: string) => void;
  onRefreshNdi: () => void;
  onRefreshCameras: () => void;
  onConnect: () => void;
}) {
  return (
    <div className="space-y-3 text-[12px] leading-relaxed">
      <p className="rounded border border-amber-700/70 bg-[#1a1408] p-2 text-amber-100">
        Do <span className="font-semibold">not</span> scan the QR inside{" "}
        <span className="font-semibold">NDI Camera Pro</span>. That app is an NDI sender — it has no WatchOut join
        scanner. Keep NDI Camera Pro open and streaming on the phone.
      </p>

      <section className="rounded border border-[#333] bg-[#141414] p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">1. Phone NDI sources on this LAN</div>
          <button className="rounded bg-[#333] px-2 py-0.5 text-[11px]" onClick={onRefreshNdi}>
            {scanning ? "Scanning…" : "Scan again"}
          </button>
        </div>
        {scanning && found.length === 0 && <div className="text-stone-500">Looking for _ndi._tcp advertisements…</div>}
        {!scanning && found.length === 0 && (
          <div className="text-stone-400">
            No NDI name yet. Same Wi‑Fi (not Guest / AP isolation), NDI Camera Pro streaming, then Scan again.
          </div>
        )}
        {found.map((s) => (
          <div key={`${s.name}-${s.ip ?? s.host}-${s.port}`} className="border-t border-[#2a2a2a] py-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-emerald-300" title={s.name}>
                {friendlyNdiName(s.name)}
              </span>
              <span className="shrink-0 text-stone-500">{s.ip || s.host || "mDNS"}</span>
            </div>
            {friendlyNdiName(s.name) !== s.name && (
              <div className="truncate text-[10px] text-stone-600">{s.name}</div>
            )}
          </div>
        ))}
      </section>

      <section className="rounded border border-[#333] bg-[#141414] p-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-stone-500">
          2. NDI Webcam on this Windows PC (required)
        </div>
        <p className="mb-2 text-stone-400">
          Chromium cannot decode native NDI. Install free{" "}
          <button
            className="text-[#f5a623] underline"
            onClick={() => void window.watchout?.openExternal(NDI_TOOLS_URL)}
          >
            NDI Tools
          </button>
          , open <span className="text-stone-200">NDI Webcam Input</span>, and pick the phone source above. It then
          appears as a camera here.
        </p>
        <div className="mb-2 flex flex-wrap gap-1">
          <button className="rounded bg-[#333] px-2 py-0.5 text-[11px]" onClick={onRefreshCameras}>
            Refresh cameras
          </button>
          <button
            className="rounded bg-[#333] px-2 py-0.5 text-[11px]"
            onClick={() => void window.watchout?.openExternal(NDI_TOOLS_URL)}
          >
            Open NDI Tools download
          </button>
        </div>
        {ndiWebcams.length > 0 ? (
          <div className="mb-2 text-emerald-400">Found {ndiWebcams.map((c) => c.label).join(", ")}</div>
        ) : (
          <div className="mb-2 text-amber-200">
            No NDI Webcam device yet. After NDI Webcam Input is running and set to your phone, click Refresh cameras.
          </div>
        )}
        <select
          className="w-full rounded border border-[#444] bg-[#111] px-2 py-1 text-stone-200"
          value={cameraId}
          onChange={(e) => onCameraId(e.target.value)}
        >
          {!cameras.length && <option value="">No cameras listed</option>}
          {cameras.map((c) => (
            <option key={c.deviceId} value={c.deviceId}>
              {isNdiWebcamLabel(c.label) ? `NDI · ${c.label}` : c.label}
            </option>
          ))}
        </select>
        {cameraError && <p className="mt-1 text-[11px] text-red-400">{cameraError}</p>}
      </section>

      <div className="flex justify-end gap-2">
        <button className="px-3 py-1" onClick={() => useApp.getState().setDialog(null)}>
          Close
        </button>
        <button
          className="rounded bg-[#f5a623] px-3 py-1 text-black disabled:opacity-40"
          disabled={!cameraId || connecting}
          onClick={onConnect}
        >
          {connecting ? "Connecting…" : "Connect this camera"}
        </button>
      </div>
    </div>
  );
}

function BrowserTab({
  phoneUrl,
  localUrl,
  lanUrls,
  needsHttps,
  httpsPhoneUrl,
  status,
  live,
}: {
  phoneUrl: string;
  localUrl: string;
  lanUrls: string[];
  needsHttps: boolean;
  httpsPhoneUrl: string;
  status: string;
  live: boolean;
}) {
  return (
    <div>
      <p className="mb-3 text-[12px] leading-relaxed text-stone-400">
        This QR is only for <span className="text-stone-200">Chrome or Safari</span> on the phone — not NDI Camera Pro.
        Close or leave the NDI app, open the phone browser, then scan.
      </p>
      <div className="mb-3 grid grid-cols-[120px_1fr] gap-3 rounded border border-[#333] bg-[#141414] p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="QR to phone camera"
          className="h-[120px] w-[120px] bg-white p-1"
          src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(phoneUrl)}`}
        />
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Phone browser (not NDI Camera Pro)</div>
          <div className={`text-[11px] ${live ? "text-emerald-400" : "text-stone-300"}`}>{status}</div>
          <div className="mt-1 break-all font-mono text-[11px] text-[#f5a623]">{phoneUrl}</div>
          {lanUrls.slice(1).map((u) => (
            <div key={u} className="break-all font-mono text-[10px] text-stone-500">
              {u}
            </div>
          ))}
          {needsHttps && (
            <p className="mt-2 rounded border border-amber-800/80 bg-amber-950/40 p-1.5 text-[10px] leading-relaxed text-amber-100">
              Phone browsers block the camera on this http:// LAN address. On the Producer PC run{" "}
              <span className="font-mono">npm run dev:https</span>, then open{" "}
              <span className="break-all font-mono text-[#f5a623]">{httpsPhoneUrl}</span> in Chrome/Safari.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              className="rounded bg-[#14532d] px-2 py-0.5 text-emerald-100"
              onClick={() => void navigator.clipboard.writeText(needsHttps ? httpsPhoneUrl : phoneUrl)}
            >
              Copy phone link
            </button>
            <a className="rounded bg-[#333] px-2 py-0.5" href={localUrl} target="_blank" rel="noreferrer">
              Open here
            </a>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <button className="px-3 py-1" onClick={() => useApp.getState().setDialog(null)}>
          Close
        </button>
      </div>
    </div>
  );
}

function OtherTab({
  url,
  onUrl,
  onPcCamera,
}: {
  url: string;
  onUrl: (v: string) => void;
  onPcCamera: () => void;
}) {
  return (
    <div>
      <div className="flex gap-2">
        <button className="rounded bg-[#14532d] px-2 py-1 text-emerald-100" onClick={onPcCamera}>
          This PC camera
        </button>
        <button
          className="rounded bg-[#14532d] px-2 py-1 text-emerald-100"
          onClick={() => {
            const id = useApp.getState().ensureNdiAsset();
            if (id) void useApp.getState().connectLiveSource(id, "screen");
            useApp.getState().setDialog(null);
          }}
        >
          Screen
        </button>
      </div>
      <label className="mt-3 block">
        <div className="mb-1 text-stone-500">HTTP stream URL</div>
        <input
          className="w-full rounded border border-[#444] bg-[#111] px-2 py-1"
          value={url}
          placeholder="https://…/stream.m3u8 or .mp4"
          onChange={(e) => onUrl(e.target.value)}
        />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button className="px-3 py-1" onClick={() => useApp.getState().setDialog(null)}>
          Close
        </button>
        <button
          className="rounded bg-[#f5a623] px-3 py-1 text-black"
          onClick={() => {
            const id = useApp.getState().ensureNdiAsset();
            if (id) void useApp.getState().connectLiveSource(id, "url", url);
            useApp.getState().setDialog(null);
          }}
        >
          Connect URL
        </button>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`rounded px-2 py-1 ${active ? "bg-[#f5a623] text-black" : "bg-[#333] text-stone-300"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function phoneUrlNeedsHttps(phoneUrl: string) {
  try {
    const u = new URL(phoneUrl, typeof window === "undefined" ? "http://localhost" : window.location.origin);
    return u.protocol === "http:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}

function lanJoinUrls(room: string, lan: { address: string }[]) {
  const port = "4735";
  const urls = lan.map((n) => `http://${n.address}:${port}/cam/${room}`);
  urls.unshift(`http://127.0.0.1:${port}/cam/${room}`);
  return [...new Set(urls)];
}
