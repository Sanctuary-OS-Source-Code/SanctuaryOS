import React from "react";
import ReactDOM from "react-dom/client";
import "material-symbols/outlined.css";
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LexiconProvider> 
      <ThemeProvider> 
                <AuthWrapper> 

      <App />
              </AuthWrapper>

      </ThemeProvider>
    </LexiconProvider>
  </React.StrictMode>
);
