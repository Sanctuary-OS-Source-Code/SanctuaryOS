import React from "react";
import ReactDOM from "react-dom/client";
import "material-symbols/outlined.css";
import "./index.css";
import "./theme-radius.css";
import App from "./App";
import { useStore } from "./store";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktop } from "./utils/envUtils";

if (typeof window !== "undefined") {
  window.alert = (msg) => useStore.getState().pushStatus(msg, "info");

  (window as any).__sanctuaryRevealBootWindow = () => {
    if ((window as any).__sanctuaryBootRevealed) return;
    (window as any).__sanctuaryBootRevealed = true;
    if (isDesktop()) {
      invoke("reveal_main_window").catch(() => {});
      try {
        const win = getCurrentWindow();
        win.show().catch(() => {});
        win.setFocus().catch(() => {});
      } catch {}
    }
  };
}
window.confirm = (msg) => {
  useStore.getState().pushStatus(msg + " (Auto-Confirmed)", "warning");
  return true;
};
import { LexiconProvider } from "./LexiconContext"; 
import { ThemeProvider } from "./ThemeContext";
import AuthWrapper from "./AuthWrapper";
import { initPwaManager } from "./utils/pwaManager";
import { LabInGameOverlay } from "./components/LabVerificationGate";

const isLabOverlay =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("lab_overlay") === "1";

if (!isLabOverlay) {
  initPwaManager();
} else if (typeof document !== "undefined") {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

if (typeof document !== "undefined" && !document.getElementById("sa-portals")) {
  const portalsDiv = document.createElement("div");
  portalsDiv.id = "sa-portals";
  document.body.appendChild(portalsDiv);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LexiconProvider>
      <ThemeProvider>
        {isLabOverlay ? (
          <LabInGameOverlay />
        ) : (
          <AuthWrapper>
            <App />
          </AuthWrapper>
        )}
      </ThemeProvider>
    </LexiconProvider>
  </React.StrictMode>
);

if (typeof window !== "undefined") {
  window.setTimeout(() => {
    (window as any).__sanctuaryRevealBootWindow?.();
  }, 380);
}
