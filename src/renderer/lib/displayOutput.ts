import type { OutputScreen } from "../../shared/ipc";

export type { OutputScreen };

const listeners = new Set<() => void>();
let live = new Set<string>();

function emit() {
  listeners.forEach((fn) => fn());
}

function api() {
  return window.watchout;
}

export function subscribeOutputs(fn: () => void) {
  listeners.add(fn);
  let gen = 0;
  const off = api()?.onOutputsChanged((ids) => {
    gen += 1;
    live = new Set(ids);
    emit();
  });
  const started = gen;
  void api()
    ?.liveOutputs()
    .then((ids) => {
      if (gen !== started) return;
      live = new Set(ids);
      emit();
    });
  return () => {
    listeners.delete(fn);
    off?.();
  };
}

export function hasLiveOutputs() {
  return live.size > 0;
}

export function isOutputLive(displayId: string) {
  return live.has(displayId);
}

export function closeDisplayOutput(displayId: string) {
  void api()?.closeOutput(displayId);
}

export async function listScreens(): Promise<OutputScreen[]> {
  if (!api()) {
    return [
      {
        id: "current",
        label: "This PC screen",
        left: window.screenX,
        top: window.screenY,
        width: window.screen.width,
        height: window.screen.height,
        physicalWidth: window.screen.width,
        physicalHeight: window.screen.height,
        isPrimary: true,
        scaleFactor: window.devicePixelRatio || 1,
      },
    ];
  }
  return api().listDisplays();
}

export function preferredOutputScreen(screens: OutputScreen[], channel = 1) {
  const extras = screens.filter((s) => !s.isPrimary);
  const pool = extras.length ? extras : screens;
  return pool[Math.max(0, Math.min(pool.length - 1, channel - 1))] ?? screens[0];
}

export async function openDisplayOutput(
  displayId: string,
  screen?: OutputScreen,
  opts?: { name?: string; channel?: number; fullscreen?: boolean },
) {
  if (!api()) throw new Error("Desktop output is only available in the WATCHOUT desktop app");
  await api().openOutput({
    displayId,
    displayName: opts?.name ?? "Display",
    screenId: screen?.id,
    channel: opts?.channel,
    fullscreen: opts?.fullscreen !== false,
  });
}

export function forEachOutput(_fn: (displayId: string) => void) {
  /* Output windows render themselves so the Producer stage loop stays light. */
}
