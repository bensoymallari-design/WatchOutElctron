
import { useEffect, useState } from "react";
import { useApp } from "@/store/appStore";
import { uid } from "@/lib/ids";
import { startPhoneReceiver, subscribePhone, getPhoneRoom } from "@/lib/phoneReceiver";
import { friendlyNdiName, type NdiAdvert } from "@/lib/ndiNames";

interface DiscoverResponse {
  sources: NdiAdvert[];
  lan: { address: string; name: string }[];
  ok: boolean;
  error?: string;
}

export function NdiConnectDialog() {
  const [url, setUrl] = useState("");
  const [room] = useState(() => getPhoneRoom() ?? (uid("cam").replace(/[^a-z0-9]/gi, "").slice(0, 14) || "camroom"));
  const [scan, setScan] = useState<DiscoverResponse | null>(null);
  const [scanning, setScanning] = useState(true);
  const [status, setStatus] = useState("Waiting for a phone to join…");
  const [live, setLive] = useState(false);

  const localUrl = `http://127.0.0.1:4735/cam/${room}`;
  const lanUrls = lanJoinUrls(room, scan?.lan ?? []);
  const phoneUrl = lanUrls[0] || localUrl;
  const needsHttps = phoneUrlNeedsHttps(phoneUrl);
  const httpsPhoneUrl = phoneUrl.replace(/^http:\/\//i, "https://");
  const found = scan?.sources ?? [];

  useEffect(() => {
    let cancelled = false;
    void (window.watchout?.discoverNdi() ?? Promise.reject(new Error("Desktop API missing")))
      .then((data: DiscoverResponse) => {
        if (!cancelled) setScan(data);
      })
      .catch(() => {
        if (!cancelled) setScan({ sources: [], lan: [], ok: false, error: "Scan failed" });
      })
      .finally(() => {
        if (!cancelled) setScanning(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const assetId = useApp.getState().ensureNdiAsset();
    if (!assetId) return;
    startPhoneReceiver(room, assetId);
    return subscribePhone((message, isLive) => {
      setStatus(message);
      setLive(isLive);
    });
  }, [room]);

  return (
    <div className="p-4">
      <div className="mb-2 text-sm font-semibold text-[#f5a623]">NDI / live input</div>
      <p className="mb-3 text-[12px] leading-relaxed text-stone-400">
        Chrome and Safari can list NDI names on the LAN, but they cannot decode native NewTek NDI — including NDI HX Camera.
        Same Wi‑Fi is not enough. To put that phone on Stage, leave the NDI app and open the QR in the phone browser.
      </p>

      {found.length > 0 && (
        <div className="mb-3 rounded border border-amber-700/70 bg-[#1a1408] p-2 text-[12px] leading-relaxed">
          <div className="font-semibold text-[#f5a623]">
            Found {found.map((s) => friendlyNdiName(s.name)).join(", ")}
            {found.length === 1 && found[0].ip ? ` at ${found[0].ip}` : ""}
          </div>
          <p className="mt-1 text-stone-300">
            That is an NDI advertisement, not a playable video in this browser. Close NDI HX Camera on the phone, then
            scan the QR below in Chrome or Safari and tap Start. The feed lands on the NDI Program asset.
          </p>
        </div>
      )}

      <div className="mb-3 rounded border border-[#333] bg-[#141414] p-2 text-[12px]">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-stone-500">LAN NDI advertisements</div>
        {scanning && <div className="text-stone-500">Scanning mDNS (_ndi._tcp)…</div>}
        {!scanning && found.length === 0 && (
          <div className="text-stone-500">
            No NDI names seen from this computer. Guest Wi‑Fi often blocks multicast (AP isolation). Use Phone camera
            below anyway — that path does not need NDI discovery.
          </div>
        )}
        {found.map((s) => (
          <FoundSource key={`${s.name}-${s.ip ?? s.host}-${s.port}`} source={s} />
        ))}
      </div>

      <div className="mb-3 grid grid-cols-[120px_1fr] gap-3 rounded border border-[#333] bg-[#141414] p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="QR to phone camera"
          className="h-[120px] w-[120px] bg-white p-1"
          src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(phoneUrl)}`}
        />
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Phone camera (works)</div>
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
              <span className="break-all font-mono text-[#f5a623]">{httpsPhoneUrl}</span> on the phone — not the NDI HX
              app.
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
          {!needsHttps && (
            <p className="mt-1 text-[10px] leading-relaxed text-stone-500">
              Open the phone link in the phone&apos;s browser — not the NDI HX Camera app. &quot;Open here&quot; uses this
              PC (localhost is allowed).
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          className="rounded bg-[#14532d] px-2 py-1 text-emerald-100"
          onClick={() => {
            const id = useApp.getState().ensureNdiAsset();
            if (id) void useApp.getState().connectLiveSource(id, "camera");
            useApp.getState().setDialog(null);
          }}
        >
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
      <L label="HTTP stream URL">
        <input value={url} placeholder="https://…/stream.m3u8 or .mp4" onChange={(e) => setUrl(e.target.value)} />
      </L>
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

function FoundSource({ source }: { source: NdiAdvert }) {
  const [httpUrl, setHttpUrl] = useState("");
  const label = friendlyNdiName(source.name);
  const where = source.ip || source.host || "mDNS";

  useEffect(() => {
    if (!source.ip) return;
    let cancelled = false;
    void fetch(`/api/ndi/probe?ip=${encodeURIComponent(source.ip)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { ok?: boolean; url?: string }) => {
        if (!cancelled && data.ok && data.url) setHttpUrl(data.url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [source.ip]);

  return (
    <div className="border-t border-[#2a2a2a] py-1">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-emerald-300" title={source.name}>
          {label}
        </span>
        <span className="shrink-0 text-stone-500">{where}</span>
      </div>
      {label !== source.name && <div className="truncate text-[10px] text-stone-600">{source.name}</div>}
      {httpUrl ? (
        <button
          className="mt-1 rounded bg-[#14532d] px-2 py-0.5 text-[11px] text-emerald-100"
          onClick={() => {
            const id = useApp.getState().ensureNdiAsset();
            if (id) void useApp.getState().connectLiveSource(id, "url", httpUrl);
            useApp.getState().setDialog(null);
          }}
        >
          Connect HTTP {httpUrl}
        </button>
      ) : (
        <div className="text-[10px] text-stone-500">NDI only — use the phone QR, not this advertisement.</div>
      )}
    </div>
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

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-2 block">
      <div className="mb-1 text-stone-500">{label}</div>
      {children}
    </label>
  );
}
