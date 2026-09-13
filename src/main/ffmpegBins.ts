import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, sep } from "node:path";

const require = createRequire(import.meta.url);

/** electron-builder unpacks natives next to app.asar; require() still points inside the asar. */
export function asarUnpackedPath(binPath: string) {
  return binPath
    .replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`)
    .replace("/app.asar/", "/app.asar.unpacked/")
    .replace("\\app.asar\\", "\\app.asar.unpacked\\");
}

/**
 * Fork scripts that import hashed `chunks/` must run from the asar copy.
 * Unpacking only the entry file (ndiWorker.js) leaves chunks inside the asar and Node
 * throws ERR_MODULE_NOT_FOUND for `out/main/chunks/ndiPixels-*.js`.
 */
export function preferPackedPath(packed: string[], unpacked: string[], exists: (p: string) => boolean) {
  return packed.find((p) => exists(p)) ?? unpacked.find((p) => exists(p)) ?? null;
}

export function resolvePackagedBinary(binPath: string | undefined) {
  if (!binPath) return undefined;
  const unpacked = asarUnpackedPath(binPath);
  if (unpacked !== binPath && existsSync(unpacked)) return unpacked;
  if (existsSync(binPath)) return binPath;
  if (unpacked !== binPath) return unpacked;
  return binPath;
}

export function staticBinary(pkg: "ffmpeg-static" | "ffprobe-static") {
  try {
    const mod = require(pkg) as string | { path?: string };
    const path = typeof mod === "string" ? mod : mod.path;
    return resolvePackagedBinary(path);
  } catch {
    /* package not installed */
  }
  return undefined;
}

export function packagedResourceBins(
  pkg: "ffmpeg-static" | "ffprobe-static",
  platform: NodeJS.Platform = process.platform,
  resourcesPath?: string,
  arch: string = process.arch,
) {
  const root = resourcesPath || (typeof process !== "undefined" ? process.resourcesPath : "");
  if (!root) return [];
  const exe = platform === "win32" ? (pkg === "ffmpeg-static" ? "ffmpeg.exe" : "ffprobe.exe") : pkg === "ffmpeg-static" ? "ffmpeg" : "ffprobe";
  const unpacked = join(root, "app.asar.unpacked", "node_modules");
  if (pkg === "ffmpeg-static") return [join(unpacked, "ffmpeg-static", exe)];
  const os = platform === "win32" ? "win32" : platform === "darwin" ? "darwin" : "linux";
  return [join(unpacked, "ffprobe-static", "bin", os, arch, exe)];
}

export function ffmpegCandidatePaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  staticPath = staticBinary("ffmpeg-static"),
  resourcesPath?: string,
) {
  const exe = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return unique([
    env.FFMPEG_PATH,
    resolvePackagedBinary(staticPath),
    ...packagedResourceBins("ffmpeg-static", platform, resourcesPath),
    exe,
    ...windowsBins(platform, env, exe),
    ...unixBins(platform, exe),
  ]);
}

export function ffprobeCandidatePaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  staticPath = staticBinary("ffprobe-static"),
  resourcesPath?: string,
) {
  const exe = platform === "win32" ? "ffprobe.exe" : "ffprobe";
  return unique([
    env.FFPROBE_PATH,
    resolvePackagedBinary(staticPath),
    ...packagedResourceBins("ffprobe-static", platform, resourcesPath),
    exe,
    ...windowsBins(platform, env, exe),
    ...unixBins(platform, exe),
  ]);
}

function windowsBins(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, exe: string) {
  if (platform !== "win32") return [];
  const pf = env.ProgramFiles || "C:\\Program Files";
  const pf86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = env.LOCALAPPDATA || winJoin(homedir(), "AppData", "Local");
  return [
    winJoin("C:\\ffmpeg\\bin", exe),
    winJoin(pf, "ffmpeg", "bin", exe),
    winJoin(pf86, "ffmpeg", "bin", exe),
    winJoin(pf, "Gyan", "ffmpeg", "bin", exe),
    winJoin(local, "Microsoft", "WinGet", "Links", exe),
    winJoin("C:\\ProgramData\\chocolatey\\bin", exe),
  ];
}

function winJoin(...parts: string[]) {
  return parts.join("\\").replace(/\\+/g, "\\");
}

function unixBins(platform: NodeJS.Platform, exe: string) {
  if (platform !== "win32") return [];
  return [`/usr/bin/${exe}`, `/usr/local/bin/${exe}`, `/opt/homebrew/bin/${exe}`];
}

function unique(paths: (string | undefined)[]) {
  return [...new Set(paths.filter((p): p is string => !!p))];
}
