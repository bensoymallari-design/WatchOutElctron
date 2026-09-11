import { useEffect } from "react";
import { Producer } from "@/components/Producer";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { useApp } from "@/store/appStore";

export function App() {
  const view = useApp((s) => s.view);
  const boot = useApp((s) => s.boot);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    const api = window.watchout;
    if (!api) return;
    const offMenu = api.onMenu((action) => {
      const a = useApp.getState();
      if (action === "new") a.newShow();
      if (action === "open") void a.openNative();
      if (action === "save") void a.save();
      if (action === "saveAs") void a.saveDownload();
      if (action === "output") void a.outputSelectedDisplay();
    });
    const offLog = api.onLog((entry) => aLog(entry.message, entry.level));
    return () => {
      offMenu();
      offLog();
    };
  }, []);

  return view === "welcome" ? <WelcomeScreen /> : <Producer />;
}

function aLog(message: string, level: "info" | "warn" | "error") {
  useApp.getState().log(message, level);
}
