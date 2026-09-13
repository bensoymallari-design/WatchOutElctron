import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";

export const NDI_RUNTIME_URL = "https://ndi.link/NDIRedistV6";

function joinFor(platform: NodeJS.Platform, ...parts: string[]) {
  return (platform === "win32" ? win32 : posix).join(...parts);
}

export function parseRegEnvValue(output: string, valueName: string) {
  const needle = valueName.toUpperCase();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.toUpperCase().includes(needle)) continue;
    const m = trimmed.match(/REG_(?:EXPAND_)?SZ\s+(.+)$/i);
    if (m) return m[1].trim().replace(/^"|"$/g, "");
  }
  return null;
}

/** DistroAV's NDI installer writes REG_EXPAND_SZ like `%ProgramFiles%\NDI\NDI 6 Runtime\v6`. */
export function expandWinEnv(value: string, env: NodeJS.ProcessEnv = process.env) {
  return value.replace(/%([^%]+)%/g, (_, name: string) => {
    const hit = env[name] ?? env[name.toUpperCase()] ?? env[name.toLowerCase()];
    return hit || `%${name}%`;
  });
}

export function readWindowsNdiDirs(
  query: (key: string, value: string) => string | null = queryRegistryValue,
  env: NodeJS.ProcessEnv = process.env,
) {
  const keys: [string, string][] = [
    ["HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment", "NDI_RUNTIME_DIR_V6"],
    ["HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment", "NDI_RUNTIME_DIR"],
    ["HKCU\\Environment", "NDI_RUNTIME_DIR_V6"],
    ["HKCU\\Environment", "NDI_RUNTIME_DIR"],
  ];
  const out: string[] = [];
  for (const [key, value] of keys) {
    const dir = query(key, value);
    if (dir) out.push(expandWinEnv(dir, env));
  }
  return out;
}

function queryRegistryValue(key: string, value: string) {
  if (process.platform !== "win32") return null;
  try {
    const text = execFileSync("reg.exe", ["query", key, "/v", value], {
      encoding: "utf8",
      timeout: 4000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return parseRegEnvValue(text, value);
  } catch {
    return null;
  }
}

function winDirs(env: NodeJS.ProcessEnv, joinPath: (...parts: string[]) => string, extraDirs: string[]) {
  const pf = env.ProgramFiles || "C:\\Program Files";
  const pf86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = env.LOCALAPPDATA || "";
  const roaming = env.APPDATA || "";
  const data = env.ProgramData || "C:\\ProgramData";
  const pathDirs = String(env.PATH || env.Path || "")
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
  const ndi6 = [
    ...extraDirs.map((d) => expandWinEnv(d, env)),
    env.NDI_RUNTIME_DIR_V6,
    env.NDI_RUNTIME_DIR,
    joinPath(pf, "NDI", "NDI 6 Tools", "Runtime"),
    joinPath(pf, "NDI", "NDI 6 Runtime", "v6"),
    joinPath(pf, "NDI", "NDI Runtime", "v6"),
    joinPath(pf, "NDI", "NDI 6 SDK", "Bin", "x64"),
    joinPath(pf, "NDI", "NDI 6 Tools", "Runtime", "v6"),
    joinPath(pf, "NewTek", "NDI 6 Runtime", "v6"),
    joinPath(pf, "obs-studio", "obs-plugins", "64bit"),
    joinPath(data, "obs-studio", "plugin_config", "DistroAV"),
    joinPath(data, "obs-studio", "plugins", "distroav"),
    roaming && joinPath(roaming, "obs-studio", "plugin_config", "DistroAV"),
    local && joinPath(local, "NDI", "NDI 6 Runtime", "v6"),
    joinPath(pf86, "NDI", "NDI 6 Runtime", "v6"),
    joinPath(pf86, "NDI", "NDI 6 Tools", "Runtime"),
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

export function ndiLibraryCandidates(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  extraDirs: string[] = [],
) {
  const joinPath = (...parts: string[]) => joinFor(platform, ...parts);
  if (platform === "win32") {
    const names = ["Processing.NDI.Lib.x64.dll", "Processing.NDI.Lib.dll"];
    return winDirs(env, joinPath, extraDirs).flatMap((dir) => names.map((name) => joinPath(dir, name)));
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
  extraDirs?: string[],
) {
  const haveEnv = !!(env.NDI_RUNTIME_DIR_V6 || env.NDI_RUNTIME_DIR);
  const extras = extraDirs ?? (platform === "win32" && !haveEnv ? readWindowsNdiDirs(undefined, env) : []);
  return ndiLibraryCandidates(platform, env, extras).find((p) => exists(p)) ?? null;
}

/** reg.exe prints this to stderr when NDI_RUNTIME_DIR_V6 is unset; it is not a Runtime failure. */
export function isBenignHelperStderr(message: string) {
  return /unable to find the specified registry key/i.test(message);
}

/** Put DistroAV's Runtime folder on PATH / NDI_RUNTIME_DIR_V6 so the helper inherits it. */
export function pinNdiRuntimeOnEnv(
  env: NodeJS.ProcessEnv,
  dll: string | null,
  platform: NodeJS.Platform = process.platform,
) {
  if (!dll) return env;
  const dir = (platform === "win32" ? win32 : posix).dirname(dll);
  env.NDI_RUNTIME_DIR_V6 = env.NDI_RUNTIME_DIR_V6 || dir;
  const sep = platform === "win32" ? ";" : ":";
  const path = env.PATH || env.Path || "";
  if (!path.toLowerCase().includes(dir.toLowerCase())) {
    env.PATH = `${dir}${sep}${path}`;
  }
  return env;
}

/**
 * Electron utilityProcess.fork({ env }) rejects Windows cmd.exe keys like `=C:`.
 * Prefer not passing env at all; if you must, strip those keys first.
 */
export function sanitizeUtilityProcessEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key || key.startsWith("=") || value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}
