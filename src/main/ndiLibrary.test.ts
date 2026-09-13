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
  assert.ok(paths.some((p) => p.includes("NDI Runtime") || p.includes("NewTek")));
  assert.equal(paths[0], "D:\\NDI\\Processing.NDI.Lib.x64.dll");
});

test("Windows PATH folders are searched for the Runtime dll", () => {
  const paths = ndiLibraryCandidates("win32", {
    ProgramFiles: "C:\\Program Files",
    PATH: "E:\\NDIRuntime",
  });
  assert.ok(paths.some((p) => p.replace(/\\/g, "/").endsWith("E:/NDIRuntime/Processing.NDI.Lib.x64.dll")));
});

test("DistroAV NDI 6 Tools Runtime is preferred over Resolume NDI 5", () => {
  const found = resolveNdiLibrary(
    "win32",
    {
      ProgramFiles: "C:\\Program Files",
      NDI_RUNTIME_DIR_V6: "C:\\Program Files\\NDI\\NDI 6 Tools\\Runtime",
    },
    (p) => String(p).includes("NDI 6 Tools") || String(p).includes("Resolume"),
  );
  assert.ok(found?.includes("NDI 6 Tools"));
  assert.ok(found && !found.includes("Resolume"));
});

test("DistroAV Tools Runtime folder is searched without a v6 subfolder", () => {
  const paths = ndiLibraryCandidates("win32", { ProgramFiles: "C:\\Program Files" });
  assert.ok(
    paths.some(
      (p) =>
        p.includes("NDI 6 Tools") &&
        p.endsWith("Runtime\\Processing.NDI.Lib.x64.dll") &&
        !p.includes("Runtime\\v6\\"),
    ),
  );
});

test("resolveNdiLibrary returns the first path that exists", () => {
  const found = resolveNdiLibrary("win32", { ProgramFiles: "C:\\Program Files" }, (p) =>
    String(p).includes("Resolume Arena 7"),
  );
  assert.ok(found?.includes("Resolume Arena 7"));
  assert.equal(resolveNdiLibrary("win32", { ProgramFiles: "C:\\Program Files" }, () => false), null);
});
