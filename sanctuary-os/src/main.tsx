import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { showToast } from "./Toast";
window.alert = (msg) => showToast(msg, "info");
window.confirm = (msg) => {
  window.dispatchEvent(new CustomEvent('sanctuary-toast', { detail: { message: msg + " (Auto-Confirmed)", type: "warning" } }));
  return true;
};
import { LexiconProvider } from "./LexiconContext"; 
import { ThemeProvider } from "./ThemeContext"; // <-- 1. Import
import AuthWrapper from "./AuthWrapper"; // <-- Import the Wrapper


ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LexiconProvider> 
      <ThemeProvider> {/* <-- 2. Wrap */}
                <AuthWrapper> 

      <App />
              </AuthWrapper>

      </ThemeProvider>
    </LexiconProvider>
  </React.StrictMode>
);