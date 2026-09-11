import type { WatchoutAPI } from "../preload/index";

/// <reference types="vite/client" />

declare global {
  interface Window {
    watchout: WatchoutAPI;
    __woLog?: (message: string, level?: "info" | "warn" | "error") => void;
  }
}

export {};
