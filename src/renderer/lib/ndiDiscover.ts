import dgram from "node:dgram";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import { collapseSources, isNoiseNdiName, tidyNdiName, type NdiAdvert } from "./ndiNames";

export type { NdiAdvert };
export { collapseSources, tidyNdiName } from "./ndiNames";

const MDNS_ADDR = "224.0.0.251";
const MDNS_PORT = 5353;
const NDI_LEGACY_GROUP = "239.255.42.42";
const NDI_LEGACY_PORTS = [5960, 5959];
const NDI_SERVICES = ["_ndi._tcp.local", "_ndi._udp.local"];

export function lanIPv4() {
  const out: { address: string; name: string }[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) out.push({ address: addr.address, name });
    }
  }
  return out;
}

function discoveryIfaces() {
  const list = lanIPv4();
  if (!list.some((n) => n.address === "127.0.0.1")) list.push({ address: "127.0.0.1", name: "loopback" });
  return list;
}

export function encodeDnsName(name: string) {
  const parts = name.replace(/\.$/, "").split(".").filter(Boolean);
  const chunks = parts.map((label) => {
    const body = Buffer.from(label);
    return Buffer.concat([Buffer.from([body.length]), body]);
  });
  return Buffer.concat([...chunks, Buffer.from([0])]);
}

export function mdnsPtrQuery(services: string[], unicastResponse: boolean) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(services.length, 4);
  const qclass = unicastResponse ? 0x8001 : 0x0001;
  const questions = services.map((svc) => {
    const qname = encodeDnsName(svc);
    const tail = Buffer.alloc(4);
    tail.writeUInt16BE(12, 0);
    tail.writeUInt16BE(qclass, 2);
    return Buffer.concat([qname, tail]);
  });
  return Buffer.concat([header, ...questions]);
}

export function readDnsName(buf: Buffer, start: number): { name: string; offset: number } {
  const labels: string[] = [];
  let offset = start;
  let jumped = false;
  let end = start;
  let hops = 0;
  while (offset < buf.length && hops++ < 20) {
    const len = buf[offset];
    if (len === 0) {
      if (!jumped) end = offset + 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      const ptr = ((len & 0x3f) << 8) | buf[offset + 1];
      if (!jumped) end = offset + 2;
      offset = ptr;
      jumped = true;
      continue;
    }
    labels.push(buf.subarray(offset + 1, offset + 1 + len).toString("utf8"));
    offset += 1 + len;
    if (!jumped) end = offset;
  }
  return { name: labels.join("."), offset: end };
}

export function parseMdnsRecords(buf: Buffer) {
  if (buf.length < 12) return [] as { type: number; name: string; data: Buffer }[];
  let offset = 12;
  const qd = buf.readUInt16BE(4);
  const an = buf.readUInt16BE(6);
  const ns = buf.readUInt16BE(8);
  const ar = buf.readUInt16BE(10);
  const skip = (count: number, withRdata: boolean) => {
    for (let i = 0; i < count && offset < buf.length; i++) {
      const n = readDnsName(buf, offset);
      offset = n.offset + 4;
      if (withRdata) {
        if (offset + 6 > buf.length) return;
        const rdlen = buf.readUInt16BE(offset + 4);
        offset += 6 + rdlen;
      }
    }
  };
  skip(qd, false);
  const out: { type: number; name: string; data: Buffer }[] = [];
  const take = (count: number) => {
    for (let i = 0; i < count && offset + 10 <= buf.length; i++) {
      const n = readDnsName(buf, offset);
      offset = n.offset;
      if (offset + 10 > buf.length) return;
      const type = buf.readUInt16BE(offset);
      const rdlen = buf.readUInt16BE(offset + 8);
      offset += 10;
      const data = buf.subarray(offset, Math.min(buf.length, offset + rdlen));
      offset += rdlen;
      out.push({ type, name: n.name, data });
    }
  };
  take(an);
  skip(ns, true);
  take(ar);
  return out;
}

function isServiceMeta(name: string) {
  const n = name.toLowerCase().trim();
  if (!n) return true;
  if (n === "_ndi._tcp" || n === "_ndi._udp") return true;
  if (n.startsWith("_ndi.")) return true;
  if (isNoiseNdiName(name)) return true;
  return false;
}

export function ingestMdns(byName: Map<string, NdiAdvert>, buf: Buffer) {
  for (const rec of parseMdnsRecords(buf)) {
    if (rec.type === 12) {
      const ptr = readDnsName(rec.data, 0).name;
      const instance = tidyNdiName(ptr || rec.name);
      if (!instance || isServiceMeta(instance)) continue;
      if (!byName.has(instance)) byName.set(instance, { name: instance, host: "", port: 0 });
    }
    if (rec.type === 33 && rec.data.length >= 6) {
      const instance = tidyNdiName(rec.name);
      if (!instance || isServiceMeta(instance)) continue;
      const port = rec.data.readUInt16BE(4);
      const host = readDnsName(rec.data, 6).name.replace(/\.local$/i, "");
      const cur = byName.get(instance) ?? { name: instance, host: "", port: 0 };
      cur.port = port;
      cur.host = host || cur.host;
      byName.set(cur.name, cur);
    }
    if (rec.type === 1 && rec.data.length >= 4) {
      const host = rec.name.replace(/\.local$/i, "");
      const ip = `${rec.data[0]}.${rec.data[1]}.${rec.data[2]}.${rec.data[3]}`;
      for (const src of byName.values()) {
        if (!src.host || src.host === host || src.name === host) src.ip = ip;
      }
    }
    if (rec.type === 16) {
      const instance = tidyNdiName(rec.name);
      if (instance && !isServiceMeta(instance) && !byName.has(instance)) {
        byName.set(instance, { name: instance, host: "", port: 0 });
      }
    }
  }
}

export function ingestLegacyNdi(byName: Map<string, NdiAdvert>, buf: Buffer, fromIp?: string) {
  const text = buf.toString("utf8").replace(/\0/g, " ");
  if (!/ndi/i.test(text) && !/\(.*obs.*\)/i.test(text)) return;
  const found: string[] = [];
  const dotted = text.matchAll(/([\w.-]+(?: \([^)\n]{1,80}\))?)\._ndi\._t(?:cp|udp)/gi);
  for (const m of dotted) found.push(m[1]);
  try {
    const json = JSON.parse(text) as { name?: string; ndi_name?: string; source?: string };
    const n = json.name || json.ndi_name || json.source;
    if (n) found.push(String(n));
  } catch {
    /* not JSON */
  }
  for (const raw of found) {
    const name = tidyNdiName(raw);
    if (!name || isServiceMeta(name)) continue;
    const cur = byName.get(name) ?? { name, host: "", port: 0 };
    if (fromIp) cur.ip = cur.ip || fromIp;
    byName.set(name, cur);
  }
}

export function parseDnsSdBrowse(text: string): NdiAdvert[] {
  const out: NdiAdvert[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!/\bAdd\b/i.test(line) || !/_ndi\._tcp/i.test(line)) continue;
    const marker = "_ndi._tcp.";
    const idx = line.toLowerCase().indexOf(marker);
    if (idx < 0) continue;
    const name = tidyNdiName(line.slice(idx + marker.length).trim());
    if (name.length > 2 && !isServiceMeta(name)) out.push({ name, host: "", port: 0 });
  }
  return out;
}

export function parseAvahiBrowse(text: string): NdiAdvert[] {
  const out: NdiAdvert[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(";");
    if (parts.length < 5) continue;
    if (!/_ndi\._tcp/i.test(parts[4] ?? "")) continue;
    const name = tidyNdiName(parts[3] ?? "");
    if (name.length > 2 && !isServiceMeta(name)) out.push({ name, host: "", port: 0 });
  }
  return out;
}

function dnsSdBins() {
  const extra =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Bonjour\\dns-sd.exe",
          "C:\\Program Files (x86)\\Bonjour\\dns-sd.exe",
          "C:\\Windows\\System32\\dns-sd.exe",
        ]
      : process.platform === "darwin"
        ? ["/usr/bin/dns-sd"]
        : [];
  return extra.filter((p) => existsSync(p));
}

function mergeInto(byName: Map<string, NdiAdvert>, extras: NdiAdvert[]) {
  for (const src of extras) {
    const name = tidyNdiName(src.name);
    if (!name) continue;
    const cur = byName.get(name) ?? { name, host: "", port: 0 };
    byName.set(name, {
      ...cur,
      host: src.host || cur.host,
      port: src.port || cur.port,
      ip: src.ip || cur.ip,
    });
  }
}

function browseBonjour(timeoutMs: number): Promise<NdiAdvert[]> {
  const bins = dnsSdBins();
  const useAvahi = process.platform === "linux" && existsSync("/usr/bin/avahi-browse");
  if (!bins.length && !useAvahi) return Promise.resolve([]);
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const child = useAvahi
      ? spawn("/usr/bin/avahi-browse", ["-prt", "_ndi._tcp"], { windowsHide: true })
      : spawn(bins[0], ["-B", "_ndi._tcp"], { windowsHide: true });
    const finish = () => {
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      const text = Buffer.concat(chunks).toString("utf8");
      resolve(useAvahi ? parseAvahiBrowse(text) : parseDnsSdBrowse(text));
    };
    const timer = setTimeout(finish, timeoutMs);
    child.stdout?.on("data", (d: Buffer) => chunks.push(d));
    child.stderr?.on("data", (d: Buffer) => chunks.push(d));
    child.on("error", () => {
      clearTimeout(timer);
      resolve([]);
    });
    child.on("close", finish);
  });
}

function bindUdp(port: number): Promise<dgram.Socket | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const fail = () => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(null);
    };
    socket.once("error", fail);
    socket.bind({ port, exclusive: false }, () => {
      socket.removeListener("error", fail);
      resolve(socket);
    });
  });
}

function joinMulticast(socket: dgram.Socket, group: string) {
  try {
    socket.setMulticastLoopback(true);
  } catch {
    /* ignore */
  }
  try {
    socket.setMulticastTTL(255);
  } catch {
    /* ignore */
  }
  try {
    socket.addMembership(group);
  } catch {
    /* ignore */
  }
  for (const nic of discoveryIfaces()) {
    try {
      socket.addMembership(group, nic.address);
    } catch {
      /* ignore */
    }
  }
}

function sendMdnsQueries(socket: dgram.Socket) {
  const multicast = mdnsPtrQuery(NDI_SERVICES, false);
  const unicast = mdnsPtrQuery(NDI_SERVICES, true);
  const dests = [MDNS_ADDR, "127.0.0.1"];
  const send = (buf: Buffer, host: string) => {
    try {
      socket.send(buf, MDNS_PORT, host, () => undefined);
    } catch {
      /* ignore */
    }
  };
  for (const nic of discoveryIfaces()) {
    try {
      socket.setMulticastInterface(nic.address);
    } catch {
      /* ignore */
    }
    for (const host of dests) {
      send(multicast, host);
      send(unicast, host);
    }
  }
  for (const host of dests) {
    send(multicast, host);
    send(unicast, host);
  }
}

interface Finder {
  probe: (timeoutMs: number) => Promise<NdiAdvert[]>;
  snapshot: () => NdiAdvert[];
  stop: () => void;
}

function createFinder(): Finder {
  const byName = new Map<string, NdiAdvert>();
  const sockets: dgram.Socket[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let ready: Promise<void> | null = null;

  const onMdns = (msg: Buffer) => {
    try {
      ingestMdns(byName, msg);
    } catch {
      /* ignore malformed packets */
    }
  };
  const onLegacy = (msg: Buffer, rinfo: dgram.RemoteInfo) => {
    try {
      ingestMdns(byName, msg);
      ingestLegacyNdi(byName, msg, rinfo.address);
    } catch {
      /* ignore */
    }
  };

  const start = async () => {
    const mdns = (await bindUdp(MDNS_PORT)) ?? (await bindUdp(0));
    if (mdns) {
      joinMulticast(mdns, MDNS_ADDR);
      mdns.on("message", onMdns);
      mdns.on("error", () => undefined);
      sockets.push(mdns);
      sendMdnsQueries(mdns);
    }
    for (const port of NDI_LEGACY_PORTS) {
      const sock = (await bindUdp(port)) ?? (await bindUdp(0));
      if (!sock) continue;
      joinMulticast(sock, NDI_LEGACY_GROUP);
      sock.on("message", onLegacy);
      sock.on("error", () => undefined);
      sockets.push(sock);
    }
    timer = setInterval(() => {
      const mdnsSock = sockets[0];
      if (mdnsSock) sendMdnsQueries(mdnsSock);
    }, 2000);
  };

  const probe = async (timeoutMs: number) => {
    if (!ready) ready = start();
    await ready;
    const mdnsSock = sockets[0];
    if (mdnsSock) sendMdnsQueries(mdnsSock);
    const wait = Math.max(400, timeoutMs);
    const extras = await Promise.all([
      browseBonjour(Math.min(wait, 2500)),
      new Promise<void>((resolve) => setTimeout(resolve, wait)),
    ]);
    mergeInto(byName, extras[0]);
    return collapseSources([...byName.values()]);
  };

  return {
    probe,
    snapshot: () => collapseSources([...byName.values()]),
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
      for (const s of sockets) {
        try {
          s.close();
        } catch {
          /* ignore */
        }
      }
      sockets.length = 0;
      ready = null;
    },
  };
}

let finder: Finder | null = null;

export function startNdiFinder() {
  if (!finder) finder = createFinder();
  void finder.probe(200);
}

export function stopNdiFinder() {
  finder?.stop();
  finder = null;
}

export async function discoverNdiSources(timeoutMs = 4500): Promise<NdiAdvert[]> {
  if (!finder) finder = createFinder();
  return finder.probe(timeoutMs);
}
