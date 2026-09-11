import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);

export function staticBinary(pkg: "ffmpeg-static" | "ffprobe-static") {
  try {
    const mod = require(pkg) as string | { path?: string };
    const path = typeof mod === "string" ? mod : mod.path;
    if (path && existsSync(path)) return path;
  } catch {
    /* package not installed */
  }
  return undefined;
}

export function ffmpegCandidatePaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  staticPath = staticBinary("ffmpeg-static"),
) {
  const exe = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return unique([
    env.FFMPEG_PATH,
    staticPath,
    exe,
    ...windowsBins(platform, env, exe),
    ...unixBins(platform, exe),
  ]);
}

export function ffprobeCandidatePaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  staticPath = staticBinary("ffprobe-static"),
) {
  const exe = platform === "win32" ? "ffprobe.exe" : "ffprobe";
  return unique([
    env.FFPROBE_PATH,
    staticPath,
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
  if (platform === "win32") return [];
  return [`/usr/bin/${exe}`, `/usr/local/bin/${exe}`, `/opt/homebrew/bin/${exe}`];
}

function unique(paths: (string | undefined)[]) {
  return [...new Set(paths.filter((p): p is string => !!p))];
}
