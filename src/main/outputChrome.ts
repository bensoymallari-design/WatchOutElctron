/** Borderless Runner window. Windows 11 otherwise paints a light DWM edge around frameless windows. */
export const OUTPUT_WINDOW_CHROME = {
  frame: false,
  transparent: false,
  fullscreen: false,
  simpleFullscreen: false,
  autoHideMenuBar: true,
  backgroundColor: "#000000",
  roundedCorners: false,
  thickFrame: false,
  hasShadow: false,
  skipTaskbar: true,
} as const;
