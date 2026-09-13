import assert from "node:assert/strict";
import test from "node:test";
import { collapseSources, friendlyNdiName, isNoiseNdiName, looksLikeNdiAddress, mergeNdiLists, tidyNdiName } from "./ndiNames";

test("tidy NDI names drop duplicate parenthetical fragments", () => {
  assert.equal(tidyNdiName("LOCALHOST (Qubit Jhon NDI)(ubit Jhon NDI)"), "LOCALHOST (Qubit Jhon NDI)");
  assert.equal(tidyNdiName("LOCALHOST (Qubit Jhon NDI)ubit Jhon NDI)"), "LOCALHOST (Qubit Jhon NDI)");
  assert.equal(tidyNdiName("LOCALHOST (Qubit Jhon NDI)._ndi._tcp.local"), "LOCALHOST (Qubit Jhon NDI)");
  assert.equal(friendlyNdiName("LOCALHOST (Qubit Jhon NDI)ubit Jhon NDI)"), "Qubit Jhon NDI");
});

test("screenshot duplicates collapse to one clean name", () => {
  const out = collapseSources([
    { name: "LOCALHOST (Qubit Jhon NDI)ubit Jhon NDI)", host: "", port: 0, ip: "192.168.8.110" },
    { name: "LOCALHOST (Qubit Jhon NDI)", host: "LOCALHOST", port: 5961, ip: "192.168.8.110" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "LOCALHOST (Qubit Jhon NDI)");
  assert.equal(out[0].ip, "192.168.8.110");
  assert.equal(out[0].port, 5961);
  assert.equal(friendlyNdiName(out[0].name), "Qubit Jhon NDI");
});

test("keeps distinct NDI programs on the same IP", () => {
  const out = collapseSources([
    { name: "STUDIO (Display 1)", host: "STUDIO", port: 5961, ip: "10.0.0.5" },
    { name: "STUDIO (OBS)", host: "STUDIO", port: 5962, ip: "10.0.0.5" },
  ]);
  assert.equal(out.length, 2);
});

test("does not merge same-looking names on different IPs", () => {
  const out = collapseSources([
    { name: "PHONE (NDI HX Camera)", host: "PHONE", port: 5961, ip: "192.168.8.110" },
    { name: "PHONE (NDI HX Camera)", host: "PHONE", port: 5961, ip: "192.168.8.111" },
  ]);
  assert.equal(out.length, 2);
});

test("mDNS and NDI Runtime lists collapse to one picker row", () => {
  const out = mergeNdiLists(
    [{ name: "STUDIO (OBS)", host: "studio", port: 5961, ip: "10.0.0.5" }],
    [{ name: "STUDIO (OBS)", host: "", port: 0, ip: "10.0.0.5:5961" }],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "STUDIO (OBS)");
  assert.equal(out[0].ip, "10.0.0.5:5961");
});

test("DistroAV KeepAliveServer rows are noise and never listed", () => {
  assert.equal(isNoiseNdiName("KeepAliveServer (191)"), true);
  assert.equal(isNoiseNdiName("KeepAliveServer (202)"), true);
  assert.equal(isNoiseNdiName("191"), true);
  assert.equal(isNoiseNdiName("HPVS-BPXL-12 (QUBITNDI)"), false);
  const out = collapseSources([
    { name: "KeepAliveServer (191)", host: "", port: 0 },
    { name: "KeepAliveServer (192)", host: "", port: 0 },
    { name: "HPVS-BPXL-12 (QUBITNDI)", host: "HPVS-BPXL-12", port: 5961 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "HPVS-BPXL-12 (QUBITNDI)");
  assert.equal(friendlyNdiName(out[0].name), "QUBITNDI");
});

test("NDI connect only uses find_sources URLs that look like host:port", () => {
  assert.equal(looksLikeNdiAddress("192.168.8.12:5961"), true);
  assert.equal(looksLikeNdiAddress("HPVS-BPXL-12:5961"), true);
  assert.equal(looksLikeNdiAddress("10.0.0.5"), true);
  assert.equal(looksLikeNdiAddress(""), false);
  assert.equal(looksLikeNdiAddress("HPVS-BPXL-12 (QUBITNDI)"), false);
  assert.equal(looksLikeNdiAddress("not a url \u0000 garbage"), false);
});
