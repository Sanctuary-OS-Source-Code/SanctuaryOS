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