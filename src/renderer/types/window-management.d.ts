interface ScreenDetailed extends Screen {
  left: number;
  top: number;
  availLeft: number;
  availTop: number;
  isPrimary: boolean;
  isInternal: boolean;
  label: string;
}

interface ScreenDetails {
  screens: ScreenDetailed[];
  currentScreen: ScreenDetailed;
}

interface Window {
  getScreenDetails?: () => Promise<ScreenDetails>;
}
