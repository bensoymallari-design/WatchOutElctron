import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";

export const NDI_RUNTIME_URL = "https://ndi.video/tools/ndi-runtime/";

function joinFor(platform: NodeJS.Platform, ...parts: string[]) {
  return (platform === "win32" ? win32 : posix).join(...parts);
}

function winDirs(env: NodeJS.ProcessEnv, joinPath: (...parts: string[]) => string) {
  const pf = env.ProgramFiles || "C:\\Program Files";
  const pf86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = env.LOCALAPPDATA || "";
  const pathDirs = String(env.PATH || env.Path || "")
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
  // DistroAV 6.2+ loads NDI 6.3 from NDI_RUNTIME_DIR_V6 = "...\NDI 6 Tools\Runtime"
  // (no v6 subfolder). Prefer that over Resolume's older NDI 5 DLL.
  const ndi6 = [
    env.NDI_RUNTIME_DIR_V6,
    env.NDI_RUNTIME_DIR,
    joinPath(pf, "NDI", "NDI 6 Tools", "Runtime"),
    joinPath(pf, "NDI", "NDI 6 Runtime", "v6"),
    joinPath(pf, "NDI", "NDI Runtime", "v6"),
    joinPath(pf, "NDI", "NDI 6 SDK", "Bin", "x64"),
    joinPath(pf, "NDI", "NDI 6 Tools", "Runtime", "v6"),
    joinPath(pf, "NewTek", "NDI 6 Runtime", "v6"),
    joinPath(pf, "obs-studio", "obs-plugins", "64bit"),
    local && joinPath(local, "NDI", "NDI 6 Runtime", "v6"),
    joinPath(pf86, "NDI", "NDI 6 Runtime", "v6"),
  ];
  const older = [
    joinPath(pf, "NDI", "NDI 5 Runtime", "v5"),
    joinPath(pf, "NDI", "NDI 5 SDK", "Bin", "x64"),
    joinPath(pf86, "NDI", "NDI 5 Runtime", "v5"),
    joinPath(pf, "Resolume Arena 7"),
    joinPath(pf, "Resolume Arena"),
    joinPath(pf, "Resolume Avenue 7"),
    joinPath(pf, "Resolume Avenue"),
  ];
  return [...ndi6, ...older, ...pathDirs].filter((d): d is string => !!d);
}

export function ndiLibraryCandidates(platform = process.platform, env: NodeJS.ProcessEnv = process.env) {
  const joinPath = (...parts: string[]) => joinFor(platform, ...parts);
  if (platform === "win32") {
    const names = ["Processing.NDI.Lib.x64.dll", "Processing.NDI.Lib.dll"];
    return winDirs(env, joinPath).flatMap((dir) => names.map((name) => joinPath(dir, name)));
  }
  if (platform === "darwin") {
    return [
      env.NDI_RUNTIME_DIR && joinPath(env.NDI_RUNTIME_DIR, "libndi.dylib"),
      "/usr/local/lib/libndi.dylib",
      "/Library/NDI/libndi.dylib",
    ].filter((p): p is string => !!p);
  }
  return [
    env.NDI_RUNTIME_DIR && joinPath(env.NDI_RUNTIME_DIR, "libndi.so"),
    "/usr/local/lib/libndi.so",
    "/usr/lib/libndi.so",
    "/usr/lib/x86_64-linux-gnu/libndi.so",
  ].filter((p): p is string => !!p);
}

export function resolveNdiLibrary(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  exists = existsSync,
) {
  return ndiLibraryCandidates(platform, env).find((p) => exists(p)) ?? null;
}
