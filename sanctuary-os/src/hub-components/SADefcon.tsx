import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { SidePanel, StatBox, ActionButton } from "../shared";
import { logArchitectAction } from "../lib/audit";
import { ElevatedHubLayout } from "../components/layouts/ElevatedHubLayout";

export function DefconPanel() {
  const { t } = useLexicon();
  const [defconLevel, setDefconLevel] = useState<number>(5);
  const [confirmMode, setConfirmMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"overview">("overview");

  useEffect(() => {
    const fetchDefcon = async () => {
      const { data } = await supabase
        .from("global_network_status")
        .select("defcon_level")
        .eq("id", 1)
        .single();
      if (data) setDefconLevel(data.defcon_level);
    };
    fetchDefcon();
  }, []);

  const triggerDefcon = async () => {
    const newLevel = defconLevel === 1 ? 5 : 1;
    const msg =
      newLevel === 1
        ? t("defcon_patch_detected", "Patch Detected")
        : t("defcon_msg_normal", "System Normal");
    const statusMsg =
      newLevel === 1
        ? t(
            "defcon_active_sub",
            "Vault Lockdown Engaged Across All Clients"
          )
        : t("defcon_normal_sub", "Network Secure. All systems nominal.");

    setDefconLevel(newLevel);
    useStore.getState().setDefconLevel(newLevel);

    const { error } = await supabase
      .from("global_network_status")
      .update({
        defcon_level: newLevel,
        message: msg,
        status_message: statusMsg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) {
      console.warn("Supabase RLS blocked global defcon sync.", error.message);
    }
    setConfirmMode(false);
  };

  const isDefconActive = defconLevel === 1;

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview", "Overview"),
      icon: t("icon_dashboard", "dashboard"),
    },
  ];

  return (
    <ElevatedHubLayout
      headerTitle={t("defcon_title", "Defcon Override")}
      headerSubtitle={t(
        "defcon_override_desc",
        "Emergency global override to lock down all active nodes and enforce pre-patch safety protocols."
      )}
      headerIcon={
        isDefconActive
          ? t("icon_warning_amber", "warning")
          : t("icon_security", "security")
      }
      headerIconColorClass={
        isDefconActive
          ? "text-[var(--danger)] animate-pulse"
          : "text-[var(--accent)]"
      }
      hideSearch={activeTab === "overview"}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as any)}
    >
      {activeTab === "overview" && (
        <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto w-full pt-6 gap-4">
          <div
            className="glass-panel rounded-2xl p-6 border flex flex-col gap-5 w-full"
            style={{
              borderColor: isDefconActive
                ? "color-mix(in srgb, var(--danger) 42%, transparent)"
                : "color-mix(in srgb, var(--text) 10%, transparent)",
            }}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`w-12 h-12 rounded-xl border bg-transparent flex items-center justify-center shrink-0 ${
                    isDefconActive
                      ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]"
                      : "border-[color-mix(in_srgb,var(--success)_42%,transparent)] text-[var(--success)]"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined !text-[24px] ${
                      isDefconActive ? "animate-pulse" : ""
                    }`}
                  >
                    {isDefconActive
                      ? t("icon_warning_amber", "warning")
                      : t("icon_verified_user", "verified_user")}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span
                    className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                      isDefconActive
                        ? "text-[var(--danger)]"
                        : "text-[var(--success)]"
                    }`}
                  >
                    {t("defcon_override_title", "Global Network Override")}
                  </span>
                  <h3 className="text-lg md:text-xl font-black tracking-tight text-[var(--text)] m-0 leading-snug">
                    {isDefconActive
                      ? t("defcon_active", "Defcon 1 Active")
                      : t("defcon_normal", "Defcon 5 Normal")}
                  </h3>
                  <span className="text-xs font-medium text-[var(--subtext)]">
                    {isDefconActive
                      ? t(
                          "defcon_active_sub",
                          "Vault Lockdown Engaged Across All Clients"
                        )
                      : t(
                          "defcon_normal_sub",
                          "Network Secure — All Systems Nominal"
                        )}
                  </span>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border bg-transparent flex items-center gap-1.5 shrink-0 ${
                  isDefconActive
                    ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]"
                    : "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                }`}
              >
                <span className="material-symbols-outlined !text-[13px]">
                  {isDefconActive
                    ? t("icon_lock", "lock")
                    : t("icon_check_circle", "check_circle")}
                </span>
                {isDefconActive
                  ? t("defcon_status_locked_badge", "Lockdown Active")
                  : t("defcon_status_nominal_badge", "Systems Nominal")}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            {confirmMode ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <ActionButton
                  variant="glass"
                  icon={t("icon_close", "close")}
                  label={t("btn_abort", "Cancel")}
                  onClick={() => setConfirmMode(false)}
                  className="w-full !py-3 justify-center"
                />
                <ActionButton
                  variant={isDefconActive ? "accent" : "danger"}
                  icon={
                    isDefconActive
                      ? t("icon_lock_open", "lock_open")
                      : t("icon_warning_amber", "warning")
                  }
                  label={t("btn_proceed", "Proceed")}
                  onClick={triggerDefcon}
                  className="w-full !py-3 justify-center"
                />
              </div>
            ) : (
              <ActionButton
                variant={isDefconActive ? "accent" : "danger"}
                icon={
                  isDefconActive
                    ? t("icon_lock_open", "lock_open")
                    : t("icon_warning_amber", "warning")
                }
                label={
                  isDefconActive
                    ? t("defcon_stand_down", "Stand Down (Return To Normal)")
                    : t("btn_execute_defcon", "Engage DEFCON 1 Lockdown")
                }
                onClick={() => setConfirmMode(true)}
                className="w-full !py-3.5 justify-center"
              />
            )}
          </div>
        </div>
      )}
    </ElevatedHubLayout>
  );
}

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
      "Command Center Oversight"
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
      "Command Center Oversight"
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
    >
      <div className="flex flex-col gap-4 mt-2 pb-6">
        {loading ? (
          <div className="glass-panel rounded-2xl p-12 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col items-center justify-center gap-3">
            <span className="material-symbols-outlined animate-spin !text-[28px] text-[var(--accent)]">
              {t("icon_sync", "sync")}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--subtext)] animate-pulse">
              {t("defcon_accessing", "Accessing Network Status...")}
            </span>
          </div>
        ) : (
          <>
            {/* 1. Global Network Status & Telemetry Card */}
            <div
              className="glass-panel rounded-2xl p-6 border flex flex-col gap-5 relative overflow-hidden"
              style={{
                borderColor: isDefconActive
                  ? "color-mix(in srgb, var(--danger) 42%, transparent)"
                  : "color-mix(in srgb, var(--text) 10%, transparent)",
              }}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div
                    className={`w-12 h-12 rounded-xl border bg-transparent flex items-center justify-center shrink-0 ${
                      isDefconActive
                        ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]"
                        : "border-[color-mix(in_srgb,var(--success)_42%,transparent)] text-[var(--success)]"
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined !text-[24px] ${
                        isDefconActive ? "animate-pulse" : ""
                      }`}
                    >
                      {isDefconActive
                        ? t("icon_warning_amber", "warning")
                        : t("icon_verified_user", "verified_user")}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span
                      className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                        isDefconActive
                          ? "text-[var(--danger)]"
                          : "text-[var(--success)]"
                      }`}
                    >
                      {t("defcon_override_title", "Global Network Override")}
                    </span>
                    <h3 className="text-lg md:text-xl font-black tracking-tight text-[var(--text)] m-0 leading-snug">
                      {isDefconActive
                        ? t("defcon_active", "Defcon 1 Active")
                        : t("defcon_normal", "Defcon 5 Normal")}
                    </h3>
                    <span className="text-xs font-medium text-[var(--subtext)]">
                      {isDefconActive
                        ? t(
                            "defcon_active_sub",
                            "Vault Lockdown Engaged Across All Clients"
                          )
                        : t(
                            "defcon_normal_sub",
                            "Network Secure — All Systems Nominal"
                          )}
                    </span>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border bg-transparent flex items-center gap-1.5 shrink-0 ${
                    isDefconActive
                      ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]"
                      : "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[13px]">
                    {isDefconActive
                      ? t("icon_lock", "lock")
                      : t("icon_check_circle", "check_circle")}
                  </span>
                  {isDefconActive
                    ? t("defcon_status_locked_badge", "Lockdown Active")
                    : t("defcon_status_nominal_badge", "Systems Nominal")}
                </span>
              </div>

              {/* 2-Column Wide StatBox Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            </div>

            {/* 2. Operational Impact & Protocol Directives Card */}
            <div className="glass-panel rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                    {t("icon_gavel", "gavel")}
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                    {t("defcon_warnings_title", "Operational Impact")}
                  </span>
                </div>

                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border bg-transparent border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] flex items-center gap-1">
                  <span className="material-symbols-outlined !text-[12px]">
                    {t("icon_public", "public")}
                  </span>
                  {t("defcon_scope_global", "All Connected Clients")}
                </span>
              </div>

              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "defcon_warning",
                  "Initiating a DEFCON Override will immediately flag the Global Network status as LOCKED. All connected Sanctuary OS clients will automatically seal their vaults and run emergency backups to protect their loadouts against a surprise game update."
                )}
              </p>

              <div className="rounded-xl p-3.5 border bg-transparent border-[color-mix(in_srgb,var(--danger)_38%,transparent)] flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--danger)_42%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
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
            </div>

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
