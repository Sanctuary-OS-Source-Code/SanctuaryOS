import React from "react";
import ReactDOM from "react-dom/client";
import "material-symbols/outlined.css";
import "./index.css";
import "./theme-radius.css";
import App from "./App";
import { useStore } from "./store";

if (typeof window !== "undefined") {
  window.alert = (msg) => useStore.getState().pushStatus(msg, "info");
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


