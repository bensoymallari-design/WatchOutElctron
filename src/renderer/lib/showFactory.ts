import type { Asset, Cue, Display, Layer, Show, ShowNode, Timeline } from "@/types/show";
import { uid } from "@/lib/ids";
import { makeTween } from "@/lib/tweens";

export function defaultCueColor(type: Cue["type"]) {
  switch (type) {
    case "media":
      return "#3b82c4";
    case "control":
      return "#c084fc";
    case "marker":
      return "#fbbf24";
    case "output":
      return "#34d399";
    case "variable":
      return "#fb7185";
    case "artnet":
      return "#f97316";
  }
}

export function emptyLayer(name: string, index: number): Layer {
  return {
    id: uid("layer"),
    name: name || `Layer ${index}`,
    enabled: true,
    locked: false,
    expanded: true,
  };
}

export function emptyTimeline(name = "Main Timeline"): Timeline {
  const layers = Array.from({ length: 10 }, (_, i) => emptyLayer(`Layer ${i + 1}`, i + 1));
  return {
    id: uid("tl"),
    name,
    duration: 120000,
    playback: "stop",
    playhead: 0,
    loop: true,
    enabled: true,
    rate: 1,
    layers,
    cues: [],
    playExpression: "",
    pauseExpression: "",
    stopExpression: "",
  };
}

export function emptyDisplay(partial?: Partial<Display>): Display {
  return {
    id: uid("disp"),
    name: "Display 1",
    x: 0,
    y: 0,
    z: 0,
    width: 1920,
    height: 1080,
    rotation: 0,
    outputType: "GPU",
    channel: 1,
    nodeId: "local-runner",
    enabled: true,
    blend: false,
    blendWidth: 128,
    virtual: false,
    screenId: undefined,
    ...partial,
  };
}

export function emptyAsset(partial: Partial<Asset> & Pick<Asset, "name" | "kind">): Asset {
  return {
    id: uid("asset"),
    folderId: null,
    width: 1920,
    height: 1080,
    duration: 10000,
    fps: 60,
    url: "",
    codec: "HAP",
    color: "#3b82c4",
    optimized: true,
    notes: "",
    ...partial,
  };
}

export function emptyCue(partial: Partial<Cue> & Pick<Cue, "layerId" | "start">): Cue {
  const type = partial.type ?? "media";
  return {
    id: uid("cue"),
    type,
    name: partial.name ?? "Cue",
    duration: partial.duration ?? 5000,
    enabled: true,
    color: partial.color ?? defaultCueColor(type),
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 100, y: 100 },
    rotation: { x: 0, y: 0, z: 0 },
    opacity: 100,
    volume: 100,
    blur: 0.5,
    brightness: 0,
    contrast: 0,
    saturation: 100,
    hue: 0,
    crop: { top: 0, bottom: 0, left: 0, right: 0 },
    anchor: { x: 0.5, y: 0.5 },
    freeRunning: false,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 500,
    fadeOutDuration: 500,
    fadeCurve: "linear",
    tweens: [],
    ...partial,
  };
}

export function localNode(partial?: Partial<ShowNode>): ShowNode {
  return {
    id: "local-producer",
    name: "localhost",
    address: "127.0.0.1",
    online: true,
    services: { producer: true, director: true, runner: true, assetManager: true },
    gpu: "Desktop GPU",
    cpu: 18,
    gpuLoad: 22,
    ram: 41,
    disk: 12,
    version: "7.8.5",
    ...partial,
  };
}

export function emptyShow(name = "Untitled Show"): Show {
  const now = new Date().toISOString();
  const timeline = emptyTimeline();
  return {
    id: uid("show"),
    name,
    createdAt: now,
    modifiedAt: now,
    director: "localhost",
    assetManager: "localhost",
    prefs: {
      fps: 60,
      eyePoint: { x: 0, y: 0, z: 0 },
      sdiGenlock: false,
      audioBuses: ["Master", "Bus 1", "Bus 2"],
      imageDuration: 5000,
      autoFade: false,
      fadeIn: 500,
      fadeOut: 500,
      fadeCurve: "linear",
      ndiExtraIps: "",
    },
    assets: [],
    displays: [
      emptyDisplay({ name: "Display 1", width: 1920, height: 1080, nodeId: "local-runner" }),
    ],
    timelines: [timeline],
    nodes: [
      localNode({ id: "local-producer", name: "Producer", services: { producer: true, director: true, runner: false, assetManager: true } }),
      localNode({
        id: "local-runner",
        name: "Runner-01",
        address: "127.0.0.1",
        services: { producer: false, director: false, runner: true, assetManager: false },
        gpu: "Display output 1–3",
        cpu: 12,
        gpuLoad: 8,
      }),
    ],
    audioDevices: [
      { id: uid("aud"), name: "WASAPI Default", nodeId: "local-runner", channels: 2, driver: "WASAPI" },
    ],
    captureDevices: [
      { id: uid("cap"), name: "NDI Source 1", nodeId: "local-runner", kind: "NDI", signal: "WATCHOUT-PREVIEW" },
    ],
    variables: [
      { id: uid("var"), name: "intensity", value: 1, min: 0, max: 1, protocol: "osc", address: "/watchin/intensity" },
      { id: uid("var"), name: "show_mode", value: 0, min: 0, max: 4, protocol: "none", address: "" },
    ],
    cueSets: [{ id: uid("set"), name: "Default", cueIds: [], enabled: true }],
  };
}

function svgData(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function makeDemoShow(): Show {
  const show = emptyShow("WATCHOUT Demo — LED Wall");
  show.displays = [
    emptyDisplay({ name: "LED Left", x: 0, y: 0, width: 1920, height: 1080, channel: 1, nodeId: "local-runner" }),
    emptyDisplay({ name: "LED Center", x: 1920, y: 0, width: 1920, height: 1080, channel: 2, nodeId: "local-runner" }),
    emptyDisplay({ name: "LED Right", x: 3840, y: 0, width: 1920, height: 1080, channel: 3, nodeId: "local-runner" }),
  ];

  const aurora = emptyAsset({
    name: "Aurora Wash",
    kind: "procedural",
    codec: "Procedural",
    duration: 30000,
    color: "#22d3ee",
    url: "procedural:aurora",
    notes: "Live generated aurora wash across the wall",
  });
  const bars = emptyAsset({
    name: "Color Bars HDR",
    kind: "image",
    codec: "PNG",
    duration: 8000,
    color: "#fbbf24",
    url: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
      <rect width="274" height="1080" fill="#c0c0c0"/>
      <rect x="274" width="274" height="1080" fill="#c0c000"/>
      <rect x="548" width="274" height="1080" fill="#00c0c0"/>
      <rect x="822" width="274" height="1080" fill="#00c000"/>
      <rect x="1096" width="274" height="1080" fill="#c000c0"/>
      <rect x="1370" width="274" height="1080" fill="#c00000"/>
      <rect x="1644" width="276" height="1080" fill="#0000c0"/>
      <text x="960" y="560" text-anchor="middle" fill="#fff" font-family="Arial" font-size="72">WATCHOUT 7</text>
    </svg>`),
  });
  const title = emptyAsset({
    name: "Show Title Card",
    kind: "image",
    codec: "PNG",
    duration: 6000,
    color: "#fb7185",
    url: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0b1220"/>
          <stop offset="1" stop-color="#1c1917"/>
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#g)"/>
      <rect x="80" y="80" width="1760" height="920" fill="none" stroke="#f59e0b" stroke-width="4"/>
      <text x="960" y="470" text-anchor="middle" fill="#f59e0b" font-family="Arial Black, Arial" font-size="92" letter-spacing="18">WATCHOUT</text>
      <text x="960" y="560" text-anchor="middle" fill="#e7e5e4" font-family="Arial" font-size="36" letter-spacing="8">MULTI-DISPLAY SHOW COMPOSER</text>
      <text x="960" y="680" text-anchor="middle" fill="#a8a29e" font-family="Arial" font-size="22">Producer  ·  Director  ·  Runner  ·  Asset Manager</text>
    </svg>`),
  });
  const grid = emptyAsset({
    name: "Pixel Grid",
    kind: "image",
    codec: "PNG",
    duration: 10000,
    color: "#64748b",
    url: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
      <rect width="1920" height="1080" fill="#09090b"/>
      <g stroke="#27272a" stroke-width="1">
        ${Array.from({ length: 32 }, (_, i) => `<line x1="${i * 60}" y1="0" x2="${i * 60}" y2="1080"/>`).join("")}
        ${Array.from({ length: 18 }, (_, i) => `<line x1="0" y1="${i * 60}" x2="1920" y2="${i * 60}"/>`).join("")}
      </g>
      <circle cx="960" cy="540" r="80" fill="none" stroke="#f59e0b" stroke-width="3"/>
    </svg>`),
  });
  const ndi = emptyAsset({
    name: "NDI Program",
    kind: "ndi",
    codec: "NDI HX3",
    duration: 60000,
    color: "#4ade80",
    url: "procedural:ndi",
    notes: "Connect Camera, Screen, or a stream URL in Assets to replace the generator",
  });
  const sting = emptyAsset({
    name: "Impact Sting",
    kind: "audio",
    codec: "WAV 48k",
    duration: 2500,
    width: 0,
    height: 0,
    color: "#38bdf8",
    url: "",
  });

  show.assets = [aurora, bars, title, grid, ndi, sting];

  const main = show.timelines[0];
  main.duration = 45000;
  main.name = "Main Timeline";
  const bg = emptyTimeline("Background Loop");
  bg.duration = 30000;
  bg.loop = true;
  const control = emptyTimeline("Show Control");
  control.duration = 45000;

  const [l1, l2, l3, l4] = main.layers;
  l1.name = "Titles";
  l2.name = "Full wall";
  l3.name = "Overlays";
  l4.name = "Live";

  main.cues = [
    emptyCue({
      name: "Title Card",
      layerId: l1.id,
      start: 500,
      duration: 7000,
      assetId: title.id,
      color: title.color,
      position: { x: 1920, y: 0, z: 0 },
      fadeIn: true,
      fadeOut: true,
      fadeInDuration: 800,
      fadeOutDuration: 1000,
      tweens: [
        makeTween("scaleX", [
          { time: 0, value: 92, easing: "cubicOut" },
          { time: 1800, value: 100, easing: "cubicOut" },
        ]),
        makeTween("scaleY", [
          { time: 0, value: 92, easing: "cubicOut" },
          { time: 1800, value: 100, easing: "cubicOut" },
        ]),
      ],
    }),
    emptyCue({
      name: "Color Bars",
      layerId: l1.id,
      start: 6500,
      duration: 8000,
      assetId: bars.id,
      color: bars.color,
      position: { x: 1920, y: 0, z: 0 },
      fadeIn: true,
      fadeOut: true,
      fadeInDuration: 1000,
      fadeOutDuration: 800,
    }),
    emptyCue({
      name: "Aurora Full Wall",
      layerId: l2.id,
      start: 12000,
      duration: 18000,
      assetId: aurora.id,
      color: aurora.color,
      scale: { x: 300, y: 100 },
      fadeIn: true,
      fadeOut: true,
      fadeInDuration: 800,
      fadeOutDuration: 800,
      tweens: [
        makeTween("positionX", [
          { time: 0, value: -400, easing: "sineInOut" },
          { time: 18000, value: 400, easing: "sineInOut" },
        ]),
      ],
    }),
    emptyCue({
      name: "NDI Live",
      layerId: l4.id,
      start: 0,
      duration: 45000,
      assetId: ndi.id,
      color: ndi.color,
      position: { x: 3840, y: 0, z: 0 },
      freeRunning: true,
    }),
    emptyCue({
      name: "End Grid",
      layerId: l1.id,
      start: 13700,
      duration: 9000,
      assetId: grid.id,
      color: grid.color,
      position: { x: 1920, y: 0, z: 0 },
      fadeIn: true,
      fadeOut: true,
      fadeInDuration: 800,
      fadeOutDuration: 800,
    }),
    emptyCue({
      name: "Overlap A",
      layerId: l3.id,
      start: 24000,
      duration: 5000,
      assetId: bars.id,
      color: bars.color,
      position: { x: 1920, y: 0, z: 0 },
    }),
    emptyCue({
      name: "Overlap B",
      layerId: l3.id,
      start: 27000,
      duration: 5000,
      assetId: grid.id,
      color: grid.color,
      position: { x: 1920, y: 0, z: 0 },
    }),
    emptyCue({
      type: "marker",
      name: "Top of Show",
      layerId: l4.id,
      start: 0,
      duration: 0,
      color: "#fbbf24",
    }),
    emptyCue({
      type: "marker",
      name: "Look B",
      layerId: l4.id,
      start: 12000,
      duration: 0,
      color: "#fbbf24",
    }),
    emptyCue({
      type: "control",
      name: "Play Background",
      layerId: l4.id,
      start: 12000,
      duration: 200,
      color: "#c084fc",
      control: { state: "play", target: "list", timelineIds: [bg.id], jumpMode: "time", jumpTime: 0 },
    }),
    emptyCue({
      type: "output",
      name: "HTTP GO",
      layerId: l4.id,
      start: 6500,
      duration: 100,
      color: "#34d399",
      output: { protocol: "http", address: "http://127.0.0.1:3012/go", message: '{"cue":"look-a"}' },
    }),
  ];

  bg.cues = [
    emptyCue({
      name: "Loop Wash",
      layerId: bg.layers[2].id,
      start: 0,
      duration: 30000,
      assetId: aurora.id,
      color: aurora.color,
      opacity: 35,
      scale: { x: 300, y: 100 },
    }),
  ];

  control.cues = [
    emptyCue({
      type: "control",
      name: "Start Main",
      layerId: control.layers[0].id,
      start: 0,
      duration: 100,
      color: "#c084fc",
      control: { state: "play", target: "list", timelineIds: [main.id], jumpMode: "time", jumpTime: 0 },
    }),
    emptyCue({
      type: "artnet",
      name: "House Lights Down",
      layerId: control.layers[1].id,
      start: 400,
      duration: 4000,
      color: "#f97316",
      artnet: { universe: 1, startChannel: 1, values: [0, 0, 0] },
      tweens: [makeTween("opacity", [{ time: 0, value: 100 }, { time: 4000, value: 0, easing: "sineInOut" }])],
    }),
  ];

  show.timelines = [main, bg, control];
  show.cueSets = [
    { id: uid("set"), name: "Default", cueIds: main.cues.map((c) => c.id), enabled: true },
    { id: uid("set"), name: "Openers only", cueIds: main.cues.filter((c) => c.start < 10000).map((c) => c.id), enabled: true },
  ];
  return show;
}
