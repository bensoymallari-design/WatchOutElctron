# WatchJhon (desktop)

Native **Electron** multi-display Producer: Stage, Timeline, Assets, Devices, Nodes, Variables, and **real fullscreen Runner outputs** on OS monitors.

Browser clones lag, miss codecs, and cannot bind HDMI fullscreen the way a display computer does. This app does those jobs in the main process.

## Why desktop

| Problem in the browser | Desktop app |
| --- | --- |
| Popup output + `requestFullscreen` | Frameless `BrowserWindow` placed on the target monitor, `setFullScreen(true)` |
| Chromium missing HAP / ProRes / H.264 | ffmpeg probes media and builds a VP9+Opus/WebM proxy at the **file’s real pixels** (4K stays 4K) |
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

## Windows installer (.exe)

From Git Bash or PowerShell, in this repo:

```bash
# 1. Allow Electron to download its binary (required on npm 11+/12)
npm install-scripts approve electron
npm install-scripts approve esbuild
npm install-scripts approve electron-winstaller
npm install

# 2. Build the NSIS setup.exe
npm run dist:win
```

The installer is:

`release/WatchJhon-Setup-7.8.21.exe`

Double-click it. It adds **WatchJhon** to the Start Menu and desktop. That `.exe` is what you copy to other PCs. The splash screen must say **PRODUCER 7.8.21**. The header also shows **7.8.21**. Do not stash `package.json` before the build — that keeps the old splash version.

If `electron` is missing after install (the `install scripts not yet covered by allowScripts` warning), run the three `approve` commands, then `npm install` again, then `npm run dist:win`.

```bash
git checkout main
git pull origin main
npm install
npm run dist:win
```

## Other platforms

```bash
npm run dist        # installer for the OS you are on
npm run dist:mac    # .dmg
npm run dist:linux  # AppImage
```

Installers land in `release/`. Windows builds an NSIS setup; they are unsigned, so SmartScreen may warn once.

## Workflow

1. New Show or Demo Show (3-wide LED wall).
2. **Assets → Import** — images, video, audio. A 320 MB H.264 MP4 shows a first-frame still immediately and goes on the Timeline; Chromium then plays the VP9+Opus WebM once ffmpeg finishes (bundled in the installer). Amber dot = still building. To skip that wait: **File → Prepare videos for Producer** (or Assets → Prepare videos) overnight. That writes `clip.webm` next to `clip.mp4`. Import either file; playback starts immediately. Use **1080p** on a laptop, **full size** on the show PC. You can also run the same ffmpeg recipe yourself (Help → Prepare videos). **Delete** / trash removes an asset or NDI (and its cues). Extra timelines: Timelines panel **Delete**.
3. Drag assets onto **Stage** (drop on one Display to fill only that screen) or **Timeline**. **Import** and double-click snap the clip across **all controllers** (the wall). Select the cue → **Fit wall** / **Snap to all displays** if you need to re-fit. Drag the clip to move X/Y; drag the amber squares on its sides to stretch it onto a Display (edges snap). Arrow keys nudge 1 px, Shift+arrows 10 px. Audio-only files go on the timeline; they play even with no picture. Files over ~2 GB are **linked** (not copied). Files around 100 GB stream from the original NVMe path — do not Rebuild HQ those masters.
4. Win+P → **Extend**. Stage → grid icon: **4 columns × 1 row** (or 2×2) for four controllers. Drag Displays flush. **Devices → Find screens → Assign screens**. Then **Output all**. Press **Space** — one video, one clock, four slices. The same **Monitor** list is on the Display in Properties. On a **laptop** (Victus etc.) use **Output** (one screen) and a **1080p** WebM; **Output all** at full size is for the show PC. Transcode makes the file *playable* in Chromium — it is not Resolume DXV. Each Output window still decodes the whole VP9 clip; Producer now freezes the Stage/Assets preview while outputs are up so the laptop is not decoding it twice.
5. **Several HDMI capture cards:** plug them all in. **Devices → Capture cards → Find cards** (or Assets → Find capture). Each row is one card. Pick which **Display** it fills, then **Connect**. Four cards can feed four controllers. Changing the Display dropdown moves that live cue onto that screen.
6. **OBS / Resolume NDI:** OBS Studio does **not** include the NDI Runtime DLL by itself. Open **Assets → NDI**. If the box is **green (Runtime found)**, do not download Runtime again. If it is amber, install only the free [NDI Runtime](https://ndi.video/tools/ndi-runtime/) (not NDI Tools) and restart WatchJhon. Then OBS **Tools → NDI → Output Settings → Main Output**. Connect. Do not NDI a **Display Capture of WatchJhon**. The asset dot is amber until a picture paints, then green.
7. **Devices → Audio**: pick **Speakers (Realtek)** (not HDMI/TV) → **Test beep**. Click the Stage, press **Space**. Cue **Volume** in Properties is 0–100. Two clips overlapping? Select the first on the Timeline (playhead stays put) → **Mute audio** — picture still plays, soundtrack off. Timelines **Loop** by default for long-run events; the show autosaves every minute while open.
8. Space play/pause, Esc stop. Click a Timeline clip to edit Properties without jumping back to its start. Drag the ruler to scrub. File → Save writes `.watch.json`.

If the beep works but the video is silent, click **Assets → Rebuild HQ** (needs ffmpeg / ffmpeg-static). Old VP8 `-an` proxies had no soundtrack. 1080p files on a 4K TV will still be upscaled — use a 4K file for a 4K wall.

## Architecture

- **Producer** — authoring UI (Stage, Timeline, Properties, Assets, …)
- **Director clock** — playhead in the Producer, pushed to outputs every frame (background throttling disabled)
- **Runner outputs** — one native window per display, pixel-perfect clip of the stage
- **Asset Manager** — copies media into userData, optional ffmpeg proxy
- **LAN helper** — `http://127.0.0.1:4735` for phone-camera WebRTC. NDI discovery listens on mDNS `5353`. The NDI Runtime DLL runs in a **separate helper process** (not Chromium) so OBS/Resolume receive cannot take down Producer. Frames are downscaled and painted into Stage and Output. [NDI Runtime](https://ndi.video/tools/ndi-runtime/) is enough if Resolume is not installed.

Keyboard and window layout: Alt+0 reset, Alt+1 programming, Alt+2 live.
