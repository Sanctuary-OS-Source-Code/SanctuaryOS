import { useState, useEffect, useCallback } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { ActionButton, handleOpenUrl } from "../shared";
import {
  verifyDevBuildClearance,
  DevBuildClearanceResult,
} from "../utils/supporterManager";
import { CommunitySupportSidePanel } from "../side-panels/CommunitySupportSidePanel";

export function DevBuildClearanceGate() {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const osRole = useStore((state) => state.osRole);
  const userRole = useStore((state) => state.userRole);

  const [clearance, setClearance] = useState<DevBuildClearanceResult | null>(
    null,
  );
  const [isChecking, setIsChecking] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  const runClearanceCheck = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await verifyDevBuildClearance();
      setClearance(res);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    runClearanceCheck();
  }, [runClearanceCheck, session?.user?.id, osRole, userRole]);

  useEffect(() => {
    if (!clearance || !clearance.isDevBinary || clearance.isAuthorized) {
      return;
    }

    const interval = setInterval(() => {
      verifyDevBuildClearance()
        .then((res) => setClearance(res))
        .catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, [clearance]);

  if (!clearance || !clearance.isDevBinary || clearance.isAuthorized) {
    return null;
  }

  const userEmail = session?.user?.email || "";
  const isUnauthenticated =
    clearance.reason === "unauthenticated" || !session?.user?.id;

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 top-[44px] z-[90] flex items-center justify-center p-6 backdrop-blur-2xl animate-in fade-in duration-300"
        style={{
          backgroundColor: "color-mix(in srgb, var(--bg) 78%, transparent)",
        }}
      >
        <div
          className="relative w-full max-w-2xl glass-panel portal-glass-fix rounded-3xl p-8 md:p-10 flex flex-col gap-6 border shadow-2xl"
          style={{
            borderColor: "color-mix(in srgb, var(--accent) 30%, transparent)",
            boxShadow:
              "0 35px 90px rgba(0, 0, 0, 0.55), 0 0 40px color-mix(in srgb, var(--accent) 12%, transparent)",
          }}
        >
          {/* Header Row */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 rounded-2xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[28px] text-[var(--accent)]">
                  {t("icon_bolt", "bolt")}
                </span>
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono font-black uppercase tracking-widest text-[var(--accent)]">
                    {t("dev_gate_badge", "DAILY DEV BUILD • SUPPORTER STREAM")}
                  </span>
                  {clearance.appVersion && (
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold glass-surface border border-[rgba(var(--text-rgb),0.12)] text-[var(--subtext)]">
                      {`v${clearance.appVersion}`}
                    </span>
                  )}
                </div>
                <h2 className="text-xl md:text-2xl font-black uppercase tracking-wider text-[var(--text)] leading-tight">
                  {t(
                    "dev_gate_title",
                    "Supporter Dev Build Clearance Required",
                  )}
                </h2>
              </div>
            </div>
          </div>

          <p className="text-xs md:text-sm text-[var(--subtext)] leading-relaxed">
            {t(
              "dev_gate_desc",
              "You are running a Daily Dev Build from the supporter preview channel. To unlock this build, sign in with an account that has active Global Daily Dev Build time ($5 = +30 days via any Partner Community or Keepers Core), or download the free Public Stable release.",
            )}
          </p>

          {/* Account Status Card */}
          <div className="w-full rounded-2xl p-4 glass-surface border border-[rgba(var(--text-rgb),0.12)] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl glass-panel flex items-center justify-center shrink-0 border border-[rgba(var(--text-rgb),0.12)]">
                <span className="material-symbols-outlined text-[20px] text-[var(--subtext)]">
                  {isUnauthenticated
                    ? t("icon_lock", "lock")
                    : t("icon_account_circle", "account_circle")}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70">
                  {t("dev_gate_status_label", "Account Status")}
                </span>
                <span className="text-xs font-bold text-[var(--text)] truncate">
                  {isChecking
                    ? t(
                        "dev_gate_checking",
                        "Verifying Cloud Supporter Clearance...",
                      )
                    : isUnauthenticated
                      ? t(
                          "dev_gate_status_unauthenticated",
                          "Not Signed In — Sign in to verify your Supporter timer",
                        )
                      : `${userEmail ? `${userEmail} • ` : ""}${t("dev_gate_status_expired", "No Active Dev Build Time Found on Account")}`}
                </span>
              </div>
            </div>

            <ActionButton
              icon={t("icon_sync", "sync")}
              label={t("dev_gate_btn_recheck", "Re-Check Clearance")}
              onClick={runClearanceCheck}
              disabled={isChecking}
              className="shrink-0"
            />
          </div>

          {/* Primary Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {isUnauthenticated ? (
              <ActionButton
                variant="accent"
                icon={t("icon_account_circle", "account_circle")}
                label={t("dev_gate_btn_signin", "Sign In to Verify Account")}
                onClick={() => {
                  localStorage.setItem("sanctuary_show_login", "true");
                  localStorage.removeItem("sanctuary_login_bypassed");
                  window.dispatchEvent(new CustomEvent("sanctuary-open-login"));
                }}
                className="w-full justify-center py-3.5"
              />
            ) : (
              <ActionButton
                variant="accent"
                icon={t("icon_volunteer_activism", "volunteer_activism")}
                label={t(
                  "dev_gate_btn_unlock",
                  "Unlock Daily Dev Builds ($5 = +30 Days)",
                )}
                onClick={() => setIsSupportOpen(true)}
                className="w-full justify-center py-3.5"
              />
            )}

            <ActionButton
              variant="default"
              icon={t("icon_download", "download")}
              label={`${t("dev_gate_btn_download_stable", "Download Free Stable Release")}${clearance.stableVersion ? ` (v${clearance.stableVersion})` : ""}`}
              onClick={() => {
                if (clearance.stableDownloadUrl) {
                  handleOpenUrl(clearance.stableDownloadUrl);
                }
              }}
              className="w-full justify-center py-3.5"
            />
          </div>

          {!isUnauthenticated && (
            <div className="flex items-center justify-end">
              <ActionButton
                variant="default"
                icon={t("icon_account_circle", "account_circle")}
                label={t("dev_gate_btn_signin", "Sign In to Verify Account")}
                onClick={() => {
                  localStorage.setItem("sanctuary_show_login", "true");
                  localStorage.removeItem("sanctuary_login_bypassed");
                  window.dispatchEvent(new CustomEvent("sanctuary-open-login"));
                }}
              />
            </div>
          )}
        </div>
      </div>

      <CommunitySupportSidePanel
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
        onSuccess={() => {
          setIsSupportOpen(false);
          runClearanceCheck();
        }}
      />
    </>
  );
}
