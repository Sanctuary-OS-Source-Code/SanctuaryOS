import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../envUtils";
import { supabaseAuth } from "../../supabase";
import { isLocalhostBrowser, markPasskeySessionVerified, notifyMfaStateChanged } from "./core";

export function getViteDevToken(): string {
  return typeof __SANCTUARY_DEV_TOKEN__ !== "undefined" ? __SANCTUARY_DEV_TOKEN__ : "";
}

export function getViteDevHeaders(includeJson = false): Record<string, string> {
  const headers: Record<string, string> = {
    "x-sanctuary-dev-token": getViteDevToken(),
  };
  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}




export async function syncDevSessionToVite(session: any): Promise<void> {
  if (!import.meta.env.DEV || !session?.access_token || !session?.refresh_token) return;
  if (!isDesktop() && !isLocalhostBrowser()) return;
  try {
    await fetch("/__dev-session", {
      method: "POST",
      headers: getViteDevHeaders(true),
      body: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user_id: session.user?.id,
      }),
    });
  } catch {}
}

export async function clearDevSessionOnVite(): Promise<void> {
  if (!import.meta.env.DEV) return;
  if (!isDesktop() && !isLocalhostBrowser()) return;
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("sanctuary_dev_signed_out", "true");
    }
    await fetch("/__dev-session", {
      method: "DELETE",
      headers: getViteDevHeaders(false),
    });
  } catch {}
}

export async function restoreDevSessionFromVite(): Promise<any | null> {
  if (!import.meta.env.DEV || !isLocalhostBrowser()) return null;
  try {
    const res = await fetch("/__dev-session", {
      headers: getViteDevHeaders(false),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const devSession = json?.session;
    if (!devSession?.access_token || !devSession?.refresh_token) return null;
    const { data, error } = await supabaseAuth.auth.setSession({
      access_token: devSession.access_token,
      refresh_token: devSession.refresh_token,
    });
    if (error || !data?.session) return null;
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("sanctuary_dev_signed_out");
    }
    markPasskeySessionVerified(data.session.user?.id);
    notifyMfaStateChanged();
    return data.session;
  } catch {
    return null;
  }
}

export async function requestDevDesktopWebAuthn(
  kind: "register" | "authenticate",
  options: any
): Promise<{ handled: boolean; credential: any | null; error: Error | null }> {
  if (!import.meta.env.DEV || !isLocalhostBrowser()) {
    return { handled: false, credential: null, error: null };
  }
  try {
    const res = await fetch("/__dev-webauthn/request", {
      method: "POST",
      headers: getViteDevHeaders(true),
      body: JSON.stringify({ kind, options }),
    });
    if (res.status === 404) {
      return { handled: false, credential: null, error: null };
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      return {
        handled: true,
        credential: null,
        error: new Error(json?.error || "Desktop WebAuthn bridge failed."),
      };
    }
    if (json?.credential) {
      return { handled: true, credential: json.credential, error: null };
    }
    return { handled: false, credential: null, error: null };
  } catch {
    return { handled: false, credential: null, error: null };
  }
}


let devBridgeInitialized = false;

export function initDevPasskeyBridge(): void {
  if (devBridgeInitialized || !import.meta.env.DEV || !isDesktop() || typeof window === "undefined") {
    return;
  }
  devBridgeInitialized = true;
  try {
    const devToken = encodeURIComponent(getViteDevToken());
    const es = new EventSource(`/__dev-webauthn/stream?token=${devToken}`);
    es.onmessage = async (event) => {
      try {
        const { requestId, kind, options } = JSON.parse(event.data || "{}");
        if (!requestId) return;
        try {
          const cmd =
            kind === "register" ? "native_webauthn_register" : "native_webauthn_authenticate";
          const credential = await invoke(cmd, { options });
          await fetch("/__dev-webauthn/response", {
            method: "POST",
            headers: getViteDevHeaders(true),
            body: JSON.stringify({ requestId, credential }),
          });
        } catch (err: any) {
          await fetch("/__dev-webauthn/response", {
            method: "POST",
            headers: getViteDevHeaders(true),
            body: JSON.stringify({
              requestId,
              error: err?.message || String(err),
            }),
          });
        }
      } catch {}
    };
  } catch {}
}
