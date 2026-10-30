import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel,
  StatBox,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
  UniversalGroup,
  VAULT_CHIP_CLASS,
  EmptyState,
} from "../shared";
import { logArchitectAction } from "../lib/audit";

export function DefconSidePanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useLexicon();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const [confirmMode, setConfirmMode] = useState<
    "execute" | "standDown" | null
  >(null);

  const fetchStatus = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("global_network_status")
      .select("*")
      .single();
    if (data) setStatus(data);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setActionStatus("");
      setConfirmMode(null);
    }
  }, [isOpen]);

  const executeDefcon = async () => {
    setSubmitting(true);
    setActionStatus(
      t("defcon_executing_status", "Engaging DEFCON 1 Lockdown...")
    );

    const targetId = status?.id || 1;
    const { error } = await supabase.rpc("secure_upsert_cloud_file", {
      p_token: useStore.getState().session?.access_token || "",
      p_target: "global_network_status",
      p_payload: {
        id: targetId,
        defcon_level: 1,
        message: "EMERGENCY: SYSTEM LOCKDOWN",
        status_message: "Global DEFCON 1 override active. Patch imminent.",
        updated_at: new Date().toISOString(),
      },
    });

    if (error) {
      console.error("Defcon update error:", error);
      setActionStatus(error.message || t("status_error", "Failed to update"));
      setSubmitting(false);
      return;
    }

    useStore.getState().setDefconLevel(1);
    await logArchitectAction(
      "Triggered Global DEFCON 1 Override",
      "global_network_status",
      "GLOBAL NETWORK",
      "Game Patch Imminent Override",
      "Command Center Oversight",
      false,
      {
        defcon_level: { from: status?.defcon_level ?? 5, to: 1 },
        message: { from: status?.message || "System Normal", to: "GAME PATCH IMMINENT" },
      }
    );

    await fetchStatus();
    setActionStatus(t("defcon_executed_status", "DEFCON 1 Lockdown Engaged"));
    setSubmitting(false);
    setConfirmMode(null);
    setTimeout(onClose, 1800);
  };

  const standDown = async () => {
    setSubmitting(true);
    setActionStatus(
      t("defcon_lifting_status", "Standing Down to Normal Operations...")
    );

    const targetId = status?.id || 1;
    const { error } = await supabase.rpc("secure_upsert_cloud_file", {
      p_token: useStore.getState().session?.access_token || "",
      p_target: "global_network_status",
      p_payload: {
        id: targetId,
        defcon_level: 5,
        message: "System Normal",
        status_message: "Network Secure. All systems nominal.",
        updated_at: new Date().toISOString(),
      },
    });

    if (error) {
      console.error("Defcon update error:", error);
      setActionStatus(error.message || t("status_error", "Failed to update"));
      setSubmitting(false);
      return;
    }

    useStore.getState().setDefconLevel(5);
    await logArchitectAction(
      "Stood Down Global DEFCON Alert",
      "global_network_status",
      "GLOBAL NETWORK",
      "Game Patch Concluded",
      "Command Center Oversight",
      false,
      {
        defcon_level: { from: status?.defcon_level ?? 1, to: 5 },
        message: { from: status?.message || "GAME PATCH IMMINENT", to: "System Normal" },
      }
    );

    await fetchStatus();
    setActionStatus(
      t("defcon_stood_down_status", "Stood Down — Network Returned to Normal")
    );
    setSubmitting(false);
    setConfirmMode(null);
    setTimeout(onClose, 1800);
  };

  const isDefconActive = status?.defcon_level === 1;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("defcon_title", "Defcon Override")}
      subtitle={t("defcon_auth_req", "Oversight Authorization Required")}
      icon={
        isDefconActive
          ? t("icon_warning_amber", "warning")
          : t("icon_security", "security")
      }
      iconColorClass={
        isDefconActive
          ? "text-[var(--danger)] animate-pulse"
          : "text-[var(--accent)]"
      }
      widthClass="w-[90vw] md:w-[680px]"
      isResizable={true}
      defaultWidth={680}
      headerActions={
        !loading ? (
          <PanelHeaderGroup>
            {isDefconActive ? (
              <PanelHeaderButton
                icon={t("icon_lock_open", "lock_open")}
                tooltip={t("defcon_stand_down", "Stand Down (Return To Normal)")}
                variant="success"
                disabled={submitting}
                onClick={() => setConfirmMode("standDown")}
              />
            ) : (
              <PanelHeaderButton
                icon={t("icon_warning_amber", "warning")}
                tooltip={t("defcon_execute", "Engage DEFCON 1 Lockdown")}
                variant="danger"
                disabled={submitting}
                onClick={() => setConfirmMode("execute")}
              />
            )}
          </PanelHeaderGroup>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 mt-2 pb-6">
        {loading ? (
          <EmptyState
            icon={t("icon_sync", "sync")}
            title={t("defcon_accessing", "Accessing Network Status...")}
          />
        ) : (
          <>
            {/* 1. Global Network Status & Telemetry Card */}
            <SidePanelHeroCard
              icon={
                isDefconActive
                  ? t("icon_warning_amber", "warning")
                  : t("icon_verified_user", "verified_user")
              }
              overline={t("defcon_override_title", "Global Network Override")}
              title={
                isDefconActive
                  ? t("defcon_active", "Defcon 1 Active")
                  : t("defcon_normal", "Defcon 5 Normal")
              }
              description={
                isDefconActive
                  ? t("defcon_active_sub", "{Vault} lockdown engaged across all clients")
                  : t("defcon_normal_sub", "Network Secure — All Systems Nominal")
              }
              badge={
                isDefconActive
                  ? t("defcon_status_locked_badge", "Lockdown Active")
                  : t("defcon_status_nominal_badge", "Systems Nominal")
              }
              badgeIcon={
                isDefconActive
                  ? t("icon_lock", "lock")
                  : t("icon_check_circle", "check_circle")
              }
              variant={isDefconActive ? "danger" : "success"}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <StatBox
                  icon={t("icon_public", "public")}
                  iconColorClass={
                    isDefconActive
                      ? "text-[var(--danger)]"
                      : "text-[var(--success)]"
                  }
                  label={t("defcon_network_status_label", "Network Status")}
                  value={
                    isDefconActive
                      ? t("defcon_val_locked", "Locked (DEFCON 1)")
                      : t("defcon_val_secure", "Secure (DEFCON 5)")
                  }
                />
                <StatBox
                  icon={
                    isDefconActive
                      ? t("icon_lock", "lock")
                      : t("icon_verified_user", "verified_user")
                  }
                  iconColorClass={
                    isDefconActive
                      ? "text-[var(--danger)]"
                      : "text-[var(--success)]"
                  }
                  label={t("defcon_client_protocol_label", "Client Protocol")}
                  value={
                    isDefconActive
                      ? t("defcon_val_sealed", "Auto-Seal & Backup")
                      : t("defcon_val_online", "Standard Operations")
                  }
                />
              </div>
            </SidePanelHeroCard>

            {/* 2. Operational Impact & Protocol Directives Card */}
            <UniversalGroup
              title={t("defcon_warnings_title", "Operational Impact")}
              icon={t("icon_gavel", "gavel")}
              headerActions={
                <span className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                    {t("icon_public", "public")}
                  </span>
                  <span>{t("defcon_scope_global", "All Connected Clients")}</span>
                </span>
              }
            >
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "defcon_warning",
                  "Initiating a DEFCON Override will immediately flag the Global Network status as LOCKED. All connected Sanctuary OS clients will automatically seal their vaults and run emergency backups to protect their loadouts against a surprise game update."
                )}
              </p>

              <div className="rounded-xl p-3.5 border glass-surface border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--danger)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[16px]">
                    {t("icon_threat_intelligence", "warning")}
                  </span>
                </div>
                <p className="text-xs font-bold text-[var(--danger)] leading-relaxed m-0">
                  {t(
                    "defcon_warning_red",
                    "Do not use unless an official game patch is actively rolling out."
                  )}
                </p>
              </div>
            </UniversalGroup>

            {/* 3. Live Action Status Banner (if active) */}
            {actionStatus && (
              <div
                className={`rounded-xl p-3.5 border bg-transparent flex items-center justify-center gap-2 ${
                  isDefconActive
                    ? "border-[color-mix(in_srgb,var(--warning)_42%,transparent)] text-[var(--warning)]"
                    : "border-[color-mix(in_srgb,var(--success)_42%,transparent)] text-[var(--success)]"
                }`}
              >
                <span className="material-symbols-outlined !text-[16px] animate-pulse">
                  {t("icon_info", "info")}
                </span>
                <span className="text-xs font-bold tracking-wide">
                  {actionStatus}
                </span>
              </div>
            )}

            {/* 4. Override Execution / Stand Down Controls */}
            {isDefconActive ? (
              confirmMode === "standDown" ? (
                <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex flex-col gap-3">
                  <span className="text-xs font-bold text-[var(--text)] text-center">
                    {t(
                      "defcon_confirm_stand_down",
                      "Confirm returning the Global Network to normal operations (DEFCON 5)?"
                    )}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ActionButton
                      variant="glass"
                      icon={t("icon_close", "close")}
                      label={t("btn_abort", "Cancel")}
                      disabled={submitting}
                      onClick={() => setConfirmMode(null)}
                      className="w-full !py-3 justify-center"
                    />
                    <ActionButton
                      variant="accent"
                      icon={t("icon_lock_open", "lock_open")}
                      label={t("btn_proceed", "Proceed")}
                      disabled={submitting}
                      onClick={standDown}
                      className="w-full !py-3 justify-center"
                    />
                  </div>
                </div>
              ) : (
                <ActionButton
                  variant="accent"
                  icon={t("icon_lock_open", "lock_open")}
                  label={t(
                    "defcon_stand_down",
                    "Stand Down (Return To Normal)"
                  )}
                  disabled={submitting}
                  onClick={() => setConfirmMode("standDown")}
                  className="w-full !py-3.5 justify-center"
                />
              )
            ) : confirmMode === "execute" ? (
              <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--danger)_42%,transparent)] flex flex-col gap-3">
                <span className="text-xs font-bold text-[var(--danger)] text-center">
                  {t(
                    "defcon_confirm_execute",
                    "Confirm engaging Global DEFCON 1 Lockdown across all connected clients?"
                  )}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ActionButton
                    variant="glass"
                    icon={t("icon_close", "close")}
                    label={t("btn_abort", "Cancel")}
                    disabled={submitting}
                    onClick={() => setConfirmMode(null)}
                    className="w-full !py-3 justify-center"
                  />
                  <ActionButton
                    variant="danger"
                    icon={t("icon_warning_amber", "warning")}
                    label={t("btn_proceed", "Proceed")}
                    disabled={submitting}
                    onClick={executeDefcon}
                    className="w-full !py-3 justify-center"
                  />
                </div>
              </div>
            ) : (
              <ActionButton
                variant="danger"
                icon={t("icon_warning_amber", "warning")}
                label={t("defcon_execute", "Engage DEFCON 1 Lockdown")}
                disabled={submitting}
                onClick={() => setConfirmMode("execute")}
                className="w-full !py-3.5 justify-center"
              />
            )}
          </>
        )}
      </div>
    </SidePanel>
  );
}
