export type CueType =
  | "media"
  | "control"
  | "marker"
  | "output"
  | "variable"
  | "artnet";

export type AssetKind =
  | "image"
  | "video"
  | "audio"
  | "composition"
  | "ndi"
  | "capture"
  | "procedural";

export type PlaybackState = "play" | "pause" | "stop";

export type OutputType = "GPU" | "SDI" | "NDI" | "Virtual";

export type TweenType =
  | "opacity"
  | "positionX"
  | "positionY"
  | "positionZ"
  | "scaleX"
  | "scaleY"
  | "rotationX"
  | "rotationY"
  | "rotationZ"
  | "volume"
  | "blur"
  | "brightness"
  | "contrast"
  | "saturation"
  | "hue"
  | "cropTop"
  | "cropBottom"
  | "cropLeft"
  | "cropRight"
  | "wipeCompletion";

export type Easing =
  | "linear"
  | "quadIn"
  | "quadOut"
  | "quadInOut"
  | "cubicIn"
  | "cubicOut"
  | "cubicInOut"
  | "sineIn"
  | "sineOut"
  | "sineInOut"
  | "expoIn"
  | "expoOut"
  | "expoInOut"
  | "backOut"
  | "bounceOut"
  | "elasticOut";

export type ControlState = "play" | "pause" | "stop";
export type JumpMode = "none" | "time" | "cue";
export type ControlTarget = "this" | "all" | "list";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TweenPoint {
  id: string;
  time: number;
  value: number;
  easing: Easing;
}

export interface Tween {
  id: string;
  type: TweenType;
  enabled: boolean;
  visible: boolean;
  points: TweenPoint[];
  expression?: string;
}

export interface Cue {
  id: string;
  type: CueType;
  name: string;
  layerId: string;
  start: number;
  duration: number;
  assetId?: string;
  enabled: boolean;
  color: string;
  position: Vec3;
  scale: { x: number; y: number };
  rotation: Vec3;
  opacity: number;
  volume: number;
  blur: number;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  crop: { top: number; bottom: number; left: number; right: number };
  anchor: { x: number; y: number };
  freeRunning: boolean;
  fadeIn: boolean;
  fadeOut: boolean;
  fadeInDuration: number;
  fadeOutDuration: number;
  fadeCurve: Easing;
  tweens: Tween[];
  control?: {
    state: ControlState;
    target: ControlTarget;
    timelineIds: string[];
    jumpMode: JumpMode;
    jumpTime: number;
    jumpCueId?: string;
  };
  output?: {
    protocol: "tcp" | "udp" | "http";
    address: string;
    message: string;
  };
  variable?: {
    variableId: string;
    value: number;
  };
  artnet?: {
    universe: number;
    startChannel: number;
    values: number[];
  };
}

export interface Layer {
  id: string;
  name: string;
  enabled: boolean;
  locked: boolean;
  expanded: boolean;
}

export interface Timeline {
  id: string;
  name: string;
  duration: number;
  playback: PlaybackState;
  playhead: number;
  loop: boolean;
  enabled: boolean;
  rate: number;
  layers: Layer[];
  cues: Cue[];
  playExpression: string;
  pauseExpression: string;
  stopExpression: string;
}

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  folderId: string | null;
  width: number;
  height: number;
  duration: number;
  fps: number;
  url: string;
  codec: string;
  color: string;
  optimized: boolean;
  notes: string;
  originalPath?: string;
  proxyPath?: string;
  proxyVersion?: number;
  bytes?: number;
  linked?: boolean;
  posterUrl?: string;
}

export interface Display {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  rotation: number;
  outputType: OutputType;
  channel: number;
  nodeId: string;
  enabled: boolean;
  blend: boolean;
  blendWidth: number;
  virtual: boolean;
  screenId?: string;
}

export interface NodeService {
  producer: boolean;
  director: boolean;
  runner: boolean;
  assetManager: boolean;
}

export interface ShowNode {
  id: string;
  name: string;
  address: string;
  online: boolean;
  services: NodeService;
  gpu: string;
  cpu: number;
  gpuLoad: number;
  ram: number;
  disk: number;
  version: string;
}

export interface AudioDevice {
  id: string;
  name: string;
  nodeId: string;
  channels: number;
  driver: "WASAPI" | "ASIO" | "Dante";
}

export interface CaptureDevice {
  id: string;
  name: string;
  nodeId: string;
  kind: "NDI" | "USB" | "SDI" | "VNC";
  signal: string;
}

export interface ShowVariable {
  id: string;
  name: string;
  value: number;
  min: number;
  max: number;
  protocol: "none" | "osc" | "artnet" | "midi" | "http";
  address: string;
}

export interface CueSet {
  id: string;
  name: string;
  cueIds: string[];
  enabled: boolean;
}

export interface ShowPrefs {
  fps: number;
  eyePoint: Vec3;
  sdiGenlock: boolean;
  audioBuses: string[];
  imageDuration: number;
  autoFade: boolean;
  fadeIn: number;
  fadeOut: number;
  fadeCurve: Easing;
  ndiExtraIps: string;
}

export interface Show {
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  director: string;
  assetManager: string;
  prefs: ShowPrefs;
  assets: Asset[];
  displays: Display[];
  timelines: Timeline[];
  nodes: ShowNode[];
  audioDevices: AudioDevice[];
  captureDevices: CaptureDevice[];
  variables: ShowVariable[];
  cueSets: CueSet[];
}

export type SelectionKind =
  | "none"
  | "cue"
  | "layer"
  | "timeline"
  | "asset"
  | "display"
  | "node"
  | "variable"
  | "device"
  | "cueSet"
  | "tweenPoint";

export interface Selection {
  kind: SelectionKind;
  ids: string[];
}

export type WindowId =
  | "stage"
  | "properties"
  | "assets"
  | "timelines"
  | "timeline"
  | "devices"
  | "nodes"
  | "variables"
  | "cues"
  | "cueSets"
  | "log";

export interface WindowLayout {
  id: WindowId;
  x: number;
  y: number;
  w: number;
  h: number;
  open: boolean;
  z: number;
}

export type DialogKind =
  | null
  | "newShow"
  | "openShow"
  | "saveAs"
  | "showProperties"
  | "displayGrid"
  | "addDisplay"
  | "about"
  | "find"
  | "insertTime"
  | "connectDirector"
  | "ndiSource";
