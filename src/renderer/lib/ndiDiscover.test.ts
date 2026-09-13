import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeDnsName,
  ingestLegacyNdi,
  ingestMdns,
  mdnsPtrQuery,
  parseAvahiBrowse,
  parseDnsSdBrowse,
  parseMdnsRecords,
  readDnsName,
} from "./ndiDiscover";

function rr(name: string, type: number, rdata: Buffer) {
  const n = encodeDnsName(name);
  const head = Buffer.alloc(10);
  head.writeUInt16BE(type, 0);
  head.writeUInt16BE(1, 2);
  head.writeUInt32BE(120, 4);
  head.writeUInt16BE(rdata.length, 8);
  return Buffer.concat([n, head, rdata]);
}

function obsMdnsAnswer() {
  const ptrData = encodeDnsName("STUDIO (OBS)._ndi._tcp.local");
  const port = Buffer.alloc(2);
  port.writeUInt16BE(5961, 0);
  const srvRdata = Buffer.concat([Buffer.from([0, 0, 0, 0]), port, encodeDnsName("STUDIO.local")]);
  const answers = Buffer.concat([
    rr("_ndi._tcp.local", 12, ptrData),
    rr("STUDIO (OBS)._ndi._tcp.local", 33, srvRdata),
    rr("STUDIO.local", 1, Buffer.from([10, 0, 0, 8])),
  ]);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(3, 6);
  return Buffer.concat([header, answers]);
}

test("mDNS PTR query asks for NDI services and can request a unicast reply", () => {
  const q = mdnsPtrQuery(["_ndi._tcp.local", "_ndi._udp.local"], true);
  assert.equal(q.readUInt16BE(4), 2);
  assert.ok(q.includes(Buffer.from("ndi")));
  const end = q.length;
  assert.equal(q.readUInt16BE(end - 2), 0x8001);
  const normal = mdnsPtrQuery(["_ndi._tcp.local"], false);
  assert.equal(normal.readUInt16BE(normal.length - 2), 1);
});

test("DNS name codec round-trips labels with spaces and parentheses", () => {
  const raw = encodeDnsName("STUDIO (OBS)._ndi._tcp.local");
  assert.equal(readDnsName(raw, 0).name, "STUDIO (OBS)._ndi._tcp.local");
});

test("mDNS ingest finds an OBS Studio NDI source like Resolume would", () => {
  const packet = obsMdnsAnswer();
  const recs = parseMdnsRecords(packet);
  assert.equal(recs.length, 3);
  const byName = new Map();
  ingestMdns(byName, packet);
  const obs = [...byName.values()].find((s) => /obs/i.test(s.name));
  assert.ok(obs, "OBS source missing from mDNS ingest");
  assert.equal(obs.name, "STUDIO (OBS)");
  assert.equal(obs.port, 5961);
  assert.equal(obs.host, "STUDIO");
  assert.equal(obs.ip, "10.0.0.8");
});

test("Bonjour dns-sd browse lines expose OBS and NDI Camera Pro", () => {
  const text = `
Browsing for _ndi._tcp.local
Timestamp     A/R Flags if Domain Service Type Instance Name
12:53:01.000  Add     3  4 local. _ndi._tcp.   STUDIO (OBS)
12:53:01.010  Add     3  4 local. _ndi._tcp.   PIXEL (NDI Camera Pro)
12:53:02.000  Rmv     3  4 local. _ndi._tcp.   OLD (Gone)
`;
  const found = parseDnsSdBrowse(text);
  assert.deepEqual(
    found.map((s) => s.name).sort(),
    ["PIXEL (NDI Camera Pro)", "STUDIO (OBS)"],
  );
});

test("avahi browse lines expose OBS", () => {
  const found = parseAvahiBrowse("+;eth0;IPv4;STUDIO (OBS);_ndi._tcp;local\n");
  assert.equal(found[0]?.name, "STUDIO (OBS)");
});

test("legacy NDI payloads that mention NDI still yield a source name", () => {
  const byName = new Map();
  ingestLegacyNdi(byName, Buffer.from("junk STUDIO (OBS)._ndi._tcp.local more"));
  assert.equal(byName.get("STUDIO (OBS)")?.name, "STUDIO (OBS)");
});
