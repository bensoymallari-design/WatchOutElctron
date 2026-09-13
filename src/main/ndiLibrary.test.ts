import assert from "node:assert/strict";
import test from "node:test";
import { ndiLibraryCandidates, resolveNdiLibrary } from "./ndiLibrary";

test("Windows NDI Runtime and Resolume folders are searched for the SDK dll", () => {
  const paths = ndiLibraryCandidates("win32", {
    ProgramFiles: "C:\\Program Files",
    NDI_RUNTIME_DIR: "D:\\NDI",
  });
  assert.ok(paths.some((p) => p.includes("NDI 6 Runtime") && p.endsWith("Processing.NDI.Lib.x64.dll")));
  assert.ok(paths.some((p) => p.includes("Resolume Arena")));
  assert.ok(paths.some((p) => p.includes("obs-studio")));
  assert.equal(paths[0], "D:\\NDI\\Processing.NDI.Lib.x64.dll");
});

test("resolveNdiLibrary returns the first path that exists", () => {
  const found = resolveNdiLibrary("win32", { ProgramFiles: "C:\\Program Files" }, (p) =>
    String(p).includes("Resolume Arena 7"),
  );
  assert.ok(found?.includes("Resolume Arena 7"));
  assert.equal(resolveNdiLibrary("win32", { ProgramFiles: "C:\\Program Files" }, () => false), null);
});
