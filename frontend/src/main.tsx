import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import { App } from "./app/App";
import { createOfflineBackend } from "./bridge/offline-backend";
import { createWailsBackend, isWailsRuntime } from "./bridge/wails-backend";
import { RecoveryApp } from "./features/recovery/RecoveryApp";

const backend = isWailsRuntime() ? createWailsBackend() : createOfflineBackend();
const root = createRoot(document.getElementById("root")!);

// When the database could not be used the shell never opens: the window
// shows only the recovery screen (core/14 §5).
void backend
  .startupRecovery()
  .catch(() => null)
  .then((recovery) =>
    root.render(
      <StrictMode>{recovery?.active ? <RecoveryApp backend={backend} recovery={recovery} /> : <App backend={backend} />}</StrictMode>,
    ),
  );
