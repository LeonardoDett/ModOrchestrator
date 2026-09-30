import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import { App } from "./app/App";
import { createOfflineBackend } from "./bridge/offline-backend";
import { createWailsBackend, isWailsRuntime } from "./bridge/wails-backend";

const backend = isWailsRuntime() ? createWailsBackend() : createOfflineBackend();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App backend={backend} />
  </StrictMode>,
);
