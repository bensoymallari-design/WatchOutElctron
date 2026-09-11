import dgram from "node:dgram";
import os from "node:os";
import { collapseSources, tidyNdiName, type NdiAdvert } from "./ndiNames";

export type { NdiAdvert };
export { collapseSources, tidyNdiName } from "./ndiNames";

export function lanIPv4() {
  const out: { address: string; name: string }[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) out.push({ address: addr.address, name });
    }
  }
  return out;
}

const MDNS_ADDR = "224.0.0.251";
const MDNS_PORT = 5353;

function encodeName(name: string) {
  const parts = name.replace(/\.$/, "").split(".").filter(Boolean);
  const chunks = parts.map((label) => {
    const body = Buffer.from(label);
    return Buffer.concat([Buffer.from([body.length]), body]);
  });
  return Buffer.concat([...chunks, Buffer.from([0])]);
}

function ptrQuery(name: string) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(1, 4);
  const qname = encodeName(name);
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(12, 0);
  tail.writeUInt16BE(1, 2);
  return Buffer.concat([header, qname, tail]);
}

function readName(buf: Buffer, start: number): { name: string; offset: number } {
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

function parseRecords(buf: Buffer) {
  if (buf.length < 12) return [] as { type: number; name: string; data: Buffer }[];
  let offset = 12;
  const qd = buf.readUInt16BE(4);
  const an = buf.readUInt16BE(6);
  const ns = buf.readUInt16BE(8);
  const ar = buf.readUInt16BE(10);
  const skip = (count: number, withRdata: boolean) => {
    for (let i = 0; i < count && offset < buf.length; i++) {
      const n = readName(buf, offset);
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
      const n = readName(buf, offset);
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

function instanceName(fqdn: string) {
  return tidyNdiName(fqdn);
}

function ingest(byName: Map<string, NdiAdvert>, buf: Buffer) {
  for (const rec of parseRecords(buf)) {
    if (rec.type === 12) {
      const ptr = readName(rec.data, 0).name;
      const instance = instanceName(ptr || rec.name);
      if (!instance || instance.toLowerCase().includes("_ndi._tcp")) continue;
      if (!byName.has(instance)) byName.set(instance, { name: instance, host: "", port: 0 });
    }
    if (rec.type === 33 && rec.data.length >= 6) {
      const instance = instanceName(rec.name);
      const port = rec.data.readUInt16BE(4);
      const host = readName(rec.data, 6).name.replace(/\.local$/i, "");
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
      const instance = instanceName(rec.name);
      if (instance && !byName.has(instance)) byName.set(instance, { name: instance, host: "", port: 0 });
    }
  }
}

export async function discoverNdiSources(timeoutMs = 2200): Promise<NdiAdvert[]> {
  const byName = new Map<string, NdiAdvert>();
  const query = ptrQuery("_ndi._tcp.local");

  await new Promise<void>((resolve) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const finish = () => {
      clearTimeout(timer);
      socket.removeAllListeners();
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    socket.on("error", finish);
    socket.on("message", (msg) => {
      try {
        ingest(byName, msg);
      } catch {
        /* ignore malformed packets */
      }
    });
    socket.bind(0, () => {
      try {
        socket.setMulticastTTL(255);
        socket.addMembership(MDNS_ADDR);
      } catch {
        /* multicast join is best-effort */
      }
      socket.send(query, MDNS_PORT, MDNS_ADDR, () => undefined);
    });
  });

  return collapseSources([...byName.values()]);
}
