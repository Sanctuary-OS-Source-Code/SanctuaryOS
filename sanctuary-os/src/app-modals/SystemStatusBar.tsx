import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";

export function SystemStatusBar({
  isNotificationSidebarOpen,
  setIsNotificationSidebarOpen,
  isLogExpanded,
  setIsLogExpanded,
  status,
  isScanning,
  isErrorStatus,
  isSuccessStatus,
}: any) {
  const { t } = useLexicon();
  const scanProgress = useStore((state: any) => state.scanProgress);
  const { isSideBrowserOpen } = useModalStore();

  const isStandby =
    typeof status === "string" &&
    (status.toUpperCase().includes("STANDING BY") ||
      status.toUpperCase().includes("STANDBY"));
  const showToast = Boolean(
    (!isStandby && status) || isErrorStatus || isSuccessStatus || isScanning
  );

  const [isHubLockdownActive, setIsHubLockdownActive] = useState(false);
  const [dismissedStatusKey, setDismissedStatusKey] = useState<string>("");

  const currentStatusKey = isScanning
    ? `__scanning__:${scanProgress?.current || 0}/${scanProgress?.total || 0}`
    : String(status || "");

  useEffect(() => {
    const checkPanels = () => {
      const lockdownPanels = document.querySelectorAll(
        '.sa-side-panel-wrapper.sa-panel-open[data-passthrough="true"]'
      );
      setIsHubLockdownActive(lockdownPanels.length > 0);
    };
    checkPanels();
    const portalRoot = document.getElementById("sa-portals") || document.body;
    const observer = new MutationObserver(checkPanels);
    observer.observe(portalRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-passthrough"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isHubLockdownActive && isNotificationSidebarOpen) {
      setIsNotificationSidebarOpen?.(false);
    }
  }, [
    isHubLockdownActive,
    isNotificationSidebarOpen,
    setIsNotificationSidebarOpen,
  ]);

  const cleanStatusText = () => {
    if (isScanning && scanProgress) {
      return scanProgress.message || t("scanning", "Scanning...");
    }
    if (typeof status !== "string") return status;
    const match = status.match(/^([a-z_0-9]+)\s+(.*)$/);
    const knownIcons = [
      "check_circle",
      "warning",
      "error",
      "info",
      "sync",
      "flight_takeoff",
      "radar",
      "terminal",
      "bug_report",
      "extension",
      "block",
      "update",
      "done",
      "download",
      "delete",
      "close",
      "add",
      "verified",
      "new_releases",
      "local_fire_department",
      "health_and_safety",
      "folder_open",
      "inventory_2",
      "account_tree",
      "priority_high",
      "notifications_active",
    ];
    if (match && (knownIcons.includes(match[1]) || match[1].includes("_"))) {
      return match[2];
    }
    return status;
  };

  const resolveStatusIcon = () => {
    if (isScanning) return t("icon_radar", "radar") || "radar";
    if (isErrorStatus) return t("icon_error", "error") || "error";
    if (isSuccessStatus)
      return t("icon_check_circle", "check_circle") || "check_circle";
    if (typeof status === "string") {
      const match = status.match(/^([a-z_0-9]+)\s+(.*)$/);
      if (match && match[1].includes("_")) return match[1];
    }
    return t("icon_terminal", "terminal") || "terminal";
  };

  const scanPct =
    isScanning && scanProgress && scanProgress.total > 0
      ? Math.round((scanProgress.current / scanProgress.total) * 100)
      : null;

  const isVisible =
    !isSideBrowserOpen &&
    !isHubLockdownActive &&
    showToast &&
    dismissedStatusKey !== currentStatusKey;

  const semanticColorClass = isErrorStatus
    ? "text-[var(--danger)]"
    : isSuccessStatus
      ? "text-[var(--success)]"
      : "text-[var(--accent)]";

  const semanticBorderStyle = isErrorStatus
    ? "color-mix(in srgb, var(--danger) 38%, var(--border, rgba(255,255,255,0.14)))"
    : isSuccessStatus
      ? "color-mix(in srgb, var(--success) 38%, var(--border, rgba(255,255,255,0.14)))"
      : undefined;

  const overlineLabel = isScanning
    ? `${t("btn_radar", "Conflict Scan") || "Radar"}${scanPct !== null ? ` • ${scanPct}%` : ""}`
    : isErrorStatus
      ? t("status_critical", "System Alert")
      : isSuccessStatus
        ? t("sys_log_history", "System Telemetry")
        : t("sys_log_history", "System Telemetry");

  const portalRoot =
    (typeof document !== "undefined" && document.getElementById("sa-portals")) ||
    (typeof document !== "undefined" ? document.body : null);

  if (!portalRoot) return null;

  return createPortal(
    <div
      data-sa-dock="true"
      className={`fixed bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] inset-x-4 md:inset-x-auto md:bottom-5 md:right-6 z-[200000] flex justify-end pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isVisible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-8 pointer-events-none"
      }`}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          setIsLogExpanded(!isLogExpanded);
        }}
        style={
          semanticBorderStyle ? { borderColor: semanticBorderStyle } : undefined
        }
        className={`glass-pill sa-floating-glass-pill rounded-2xl border border-[var(--border)] shadow-2xl px-3.5 py-2.5 flex items-center gap-3 w-full md:w-auto md:min-w-[300px] md:max-w-[440px] cursor-pointer transition-all duration-300 hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] group/toast relative overflow-hidden ${
          isVisible ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        {/* Left Semantic Sculpted Icon Box (matches ViewHeader / SidePanel header pill) */}
        <div
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${semanticColorClass}`}
        >
          <span
            className={`material-symbols-outlined !text-[18px] sm:!text-[20px] ${
              isScanning ? "animate-spin" : ""
            }`}
          >
            {resolveStatusIcon()}
          </span>
        </div>

        {/* Two-Line Status Column */}
        <div className="flex flex-col justify-center min-w-0 flex-1 gap-0.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span
              className={`text-[9px] font-black uppercase tracking-[0.16em] truncate ${semanticColorClass}`}
            >
              {overlineLabel}
            </span>
          </div>
          <span className="text-xs font-extrabold tracking-tight text-[var(--text)] truncate leading-snug">
            {cleanStatusText()}
          </span>
          {scanPct !== null && (
            <div className="w-full h-1 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] overflow-hidden mt-1">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${Math.max(4, Math.min(100, scanPct))}%` }}
              />
            </div>
          )}
        </div>

        {/* Dismiss Button */}
        {!isScanning && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDismissedStatusKey(currentStatusKey);
            }}
            className="w-7 h-7 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center shrink-0 transition-all cursor-pointer opacity-75 group-hover/toast:opacity-100"
            aria-label={t("close", "Close")}
          >
            <span className="material-symbols-outlined !text-[14px]">
              {t("icon_close", "close")}
            </span>
          </button>
        )}
      </div>
    </div>,
    portalRoot
  );
}
