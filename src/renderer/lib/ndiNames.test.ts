import assert from "node:assert/strict";
import test from "node:test";
import { collapseSources, friendlyNdiName, tidyNdiName } from "./ndiNames";

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
