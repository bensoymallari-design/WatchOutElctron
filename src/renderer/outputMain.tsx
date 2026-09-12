import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OutputView } from "./output";
import "./output.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OutputView />
  </StrictMode>,
);
