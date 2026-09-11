# WATCHOUT Producer (desktop)

Native **Electron** recreation of Dataton WATCHOUT 7 Producer. This is the desktop replacement for the Next.js browser build: Stage, Timeline, Assets, Devices, Nodes, Variables, and **real fullscreen Runner outputs** on OS monitors.

Browser WATCHOUT clones lag, miss codecs, and cannot bind HDMI fullscreen the way a display computer does. This app does those jobs in the main process.

## Why desktop

| Problem in the browser | Desktop app |
| --- | --- |
| Popup output + `requestFullscreen` | Frameless `BrowserWindow` placed on the target monitor, `setFullScreen(true)` |
| Chromium missing HAP / ProRes / H.264 | ffmpeg probes media and builds a VP9/WebM playback proxy |
| Stage loop also painted popup canvases | Producer and outputs render in separate windows |
| Blob URLs vanish on reload | Media is copied into the app library (`watchout://` protocol) |
| File picker / save as download | Native Open / Save `.watch.json` |

## Run

```bash
npm install
npm run dev
```

Optional but recommended for codecs:

```bash
# macOS
brew install ffmpeg

# Debian / Ubuntu
sudo apt install ffmpeg

# Windows
choco install ffmpeg
```

Without ffmpeg, stills and WebM still play. MOV/MP4/HAP/ProRes import copies the file and logs that a proxy could not be built.

## Package

```bash
npm run dist
```

Produces platform installers under `release/` (NSIS / DMG / AppImage).

## Workflow

1. New Show or Demo Show (3-wide LED wall).
2. **Assets → Import** — images, video, audio. Unsupported codecs get a VP9 proxy.
3. Drag assets onto **Stage** (snaps 1:1 to a display) or **Timeline**.
4. **Devices → Find screens**, then **Output** / **Output all**. Each WATCHOUT display becomes a fullscreen window on that monitor. Esc closes it.
5. Space play/pause, Esc stop. File → Save writes `.watch.json`.

## Architecture

- **Producer** — authoring UI (Stage, Timeline, Properties, Assets, …)
- **Director clock** — playhead in the Producer, pushed to outputs every frame (background throttling disabled)
- **Runner outputs** — one native window per display, pixel-perfect clip of the stage
- **Asset Manager** — copies media into userData, optional ffmpeg proxy
- **LAN helper** — `http://127.0.0.1:4735` for phone-camera WebRTC and mDNS NDI name scan (native NDI decode still needs an NDI SDK; use PC Camera / Screen / URL)

Keyboard and window layout match WATCHOUT 7 (Alt+0 reset, Alt+1 programming, Alt+2 live).
