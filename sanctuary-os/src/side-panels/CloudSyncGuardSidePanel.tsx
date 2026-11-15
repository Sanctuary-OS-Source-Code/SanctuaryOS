import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useShallow } from "zustand/react/shallow";
import {
  SidePanel,
  SidePanelHeroCard,
  PanelHeaderGroup,
  PanelHeaderButton,
  UniversalGroup,
  ActionButton,
  EmptyState,
  VAULT_CHIP_CLASS,
} from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { SettingsToggle } from "../settings-tabs/shared";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { isDesktop } from "../utils/envUtils";
import {
  CloudSyncPathFinding,
  CloudSyncSystemReport,
  CloudHydrationPinResult,
  VaultRelocationResult,
  inspectWorkspaceCloudSync,
  CLOUD_SYNC_REPORT_CHANGED_EVENT,
  getCloudSyncConsents,
  isCloudSyncFindingConsented,
  grantCloudSyncConsent,
  revokeCloudSyncConsent,
  invalidateCloudSyncCache,
  obfuscateCloudPath,
  normalizeCloudPathKey,
  getCloudSessionCleanMods,
  setCloudSessionCleanMods,
} from "../utils/cloudSyncGuard";

export function CloudSyncGuardSidePanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useLexicon();
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const { cloudSyncGuardContext, closeCloudSyncGuard } = useModalStore(
    useShallow((s) => ({
      cloudSyncGuardContext: s.cloudSyncGuardContext,
      closeCloudSyncGuard: s.closeCloudSyncGuard,
    }))
  );

  const [report, setReport] = useState<CloudSyncSystemReport | null>(null);
  const [consents, setConsents] = useState(() => getCloudSyncConsents());
  const [isScanning, setIsScanning] = useState(false);

  // Explicit per-card UI states (consent-first, never automatic)
  const [relocateKey, setRelocateKey] = useState<string | null>(null);
  const [relocateDestInput, setRelocateDestInput] = useState("");
  const [relocateCopyFiles, setRelocateCopyFiles] = useState(true);
  const [isRelocating, setIsRelocating] = useState(false);

  const [confirmPinKey, setConfirmPinKey] = useState<string | null>(null);
  const [isPinningKey, setIsPinningKey] = useState<string | null>(null);

  const [confirmWipeKey, setConfirmWipeKey] = useState<string | null>(null);
  const [isWipingKey, setIsWipingKey] = useState<string | null>(null);

  const [confirmExcludeKey, setConfirmExcludeKey] = useState<string | null>(null);
  const [isExcludingKey, setIsExcludingKey] = useState<string | null>(null);
  const [copiedSavesKey, setCopiedSavesKey] = useState<string | null>(null);
  const [sessionCleanMods, setSessionCleanModsState] = useState<boolean>(() =>
    getCloudSessionCleanMods(activeWorkspaceId)
  );

  const [detectedLocalSuggestion, setDetectedLocalSuggestion] = useState<{
    roleKey: string;
    path: string;
  } | null>(null);

  const pathsOverride = cloudSyncGuardContext?.pathsOverride || undefined;

  const runInspection = useCallback(async () => {
    if (!isDesktop()) return;
    setIsScanning(true);
    try {
      const next = await inspectWorkspaceCloudSync(pathsOverride, true);
      setReport(next);
      setConsents(getCloudSyncConsents());
      if (pathsOverride) {
        void inspectWorkspaceCloudSync(undefined, true);
      }
    } finally {
      setIsScanning(false);
    }
  }, [pathsOverride]);

  useEffect(() => {
    if (!isOpen) return;
    setRelocateKey(null);
    setConfirmPinKey(null);
    setConfirmWipeKey(null);
    setConfirmExcludeKey(null);
    setCopiedSavesKey(null);
    setDetectedLocalSuggestion(null);
    setSessionCleanModsState(getCloudSessionCleanMods(activeWorkspaceId));
    void runInspection();
  }, [isOpen, activeWorkspaceId, runInspection]);

  useEffect(() => {
    if (!isOpen || !isDesktop()) return;

    const handleReportChanged = (event: Event) => {
      if (pathsOverride) return;
      const detail = (event as CustomEvent<CloudSyncSystemReport | null | undefined>).detail;
      if (detail) {
        setReport(detail);
        setConsents(getCloudSyncConsents());
      }
    };

    const handleFocus = () => {
      if (pathsOverride) {
        void runInspection();
      }
    };

    window.addEventListener(CLOUD_SYNC_REPORT_CHANGED_EVENT, handleReportChanged);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener(CLOUD_SYNC_REPORT_CHANGED_EVENT, handleReportChanged);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isOpen, pathsOverride, runInspection]);

  useEffect(() => {
    const syncConsent = () => {
      setConsents(getCloudSyncConsents());
      setSessionCleanModsState(getCloudSessionCleanMods(activeWorkspaceId));
    };
    window.addEventListener("sanctuary-cloud-sync-consent-changed", syncConsent);
    return () => {
      window.removeEventListener("sanctuary-cloud-sync-consent-changed", syncConsent);
    };
  }, [activeWorkspaceId]);

  const handleClose = () => {
    closeCloudSyncGuard();
    onClose();
  };

  const allFindings = report?.findings || [];
  const findings = allFindings.filter((f) => !f.is_excluded_from_sync);
  const excludedFindings = allFindings.filter((f) => Boolean(f.is_excluded_from_sync));
  const unconsentedFindings = findings.filter(
    (f) => !isCloudSyncFindingConsented(f, consents)
  );
  const consentedFindings = findings.filter((f) =>
    isCloudSyncFindingConsented(f, consents)
  );
  const totalActiveSymlinks = findings.reduce(
    (sum, f) => sum + (f.active_symlink_count || 0),
    0
  );
  const hasUnconsentedModsTarget = unconsentedFindings.some(
    (f) => f.role === "mods_target" || f.role === "install_route"
  );
  const isPendingGate = Boolean(cloudSyncGuardContext?.onConsentProceed);
  const providersLabel =
    Array.from(
      new Set(
        (unconsentedFindings.length > 0 ? unconsentedFindings : findings).map(
          (f) => f.provider
        )
      )
    )
      .filter(Boolean)
      .join(", ") || t("cloud_guard_generic_provider", "Cloud Sync");

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "master_vault":
        return t("cloud_guard_role_master_vault", "Master {Vault} Root");
      case "workspace_vault":
        return t("cloud_guard_role_workspace_vault", "Workspace {Vault}");
      case "mods_target":
        return t("cloud_guard_role_mods_target", "{Mods} Symlink Target");
      case "install_route":
        return t("cloud_guard_role_install_route", "Routed {Mod} Target");
      case "user_data":
        return t("cloud_guard_role_user_data", "Saves & User Data");
      case "game_root":
        return t("cloud_guard_role_game_root", "Game Installation");
      default:
        return role;
    }
  };

  const getHydrationChip = (finding: CloudSyncPathFinding, isConsented: boolean) => {
    if (finding.is_excluded_from_sync) {
      return {
        label: t("cloud_guard_badge_excluded", "Excluded From Sync"),
        icon: t("icon_shield", "shield"),
        colorClass: "text-[var(--success)]",
      };
    }
    if (finding.has_dehydrated_files) {
      return {
        label: t("cloud_guard_badge_dehydrated", "Cloud-Only Placeholders"),
        icon: t("icon_cloud_off", "cloud_off"),
        colorClass: "text-[var(--danger)]",
      };
    }
    if (finding.is_unpinned) {
      return {
        label: t("cloud_guard_badge_unpinned", "Unpinned (On-Demand)"),
        icon: t("icon_cloud_queue", "cloud_queue"),
        colorClass: "text-[var(--warning)]",
      };
    }
    if (finding.is_pinned_locally) {
      return {
        label: t("cloud_guard_badge_pinned_local", "Pinned Locally"),
        icon: t("icon_offline_pin", "offline_pin"),
        colorClass: "text-[var(--success)]",
      };
    }
    if (isConsented) {
      return {
        label: t("cloud_guard_badge_consented", "User Approved"),
        icon: t("icon_verified_user", "verified_user"),
        colorClass: "text-[var(--accent)]",
      };
    }
    return {
      label: t("cloud_guard_badge_needs_review", "Review Recommended"),
      icon: t("icon_warning_amber", "warning_amber"),
      colorClass: "text-[var(--danger)]",
    };
  };

  const getFindingExplanation = (finding: CloudSyncPathFinding) => {
    const provider = finding.provider || t("cloud_guard_generic_provider", "Cloud Sync");
    if (finding.is_excluded_from_sync) {
      return t(
        "cloud_guard_desc_excluded",
        "Excluded from {0} sync via a native ignore rule so {Mods} symlinks stay strictly local."
      ).replace("{0}", provider);
    }
    if (finding.role === "master_vault" || finding.role === "workspace_vault") {
      return t(
        "cloud_guard_desc_vault",
        "Your {Vault} sits inside {0}. Cloud placeholders or file locks can break symlinks and eat cloud quota unless relocated or pinned locally."
      ).replace("{0}", provider);
    }
    if (finding.symlink_risk) {
      if (finding.is_windows_kfm_redirect) {
        return t(
          "cloud_guard_desc_symlink_kfm",
          "Windows Known Folder Backup redirected this target into {0}, which can upload duplicate {mod} symlinks or lock files on launch."
        ).replace("{0}", provider);
      }
      if (finding.is_parent_folder_synced) {
        return t(
          "cloud_guard_desc_symlink_parent",
          "{0} is syncing a parent folder containing {Mods}. Keep {Mods} empty between play sessions or sync only your Save folder to keep symlinks out of the cloud."
        ).replace("{0}", provider);
      }
      return t(
        "cloud_guard_desc_symlink",
        "This symlink target sits inside {0}. Cloud sync clients can follow projected symlinks upstream or lock files mid-deployment."
      ).replace("{0}", provider);
    }
    if (finding.role === "user_data") {
      return t(
        "cloud_guard_desc_user_data",
        "Your game saves and user data sit inside {0}. Cloud placeholders or locks can interrupt {Backups} snapshots and {Lab} airgap swaps."
      ).replace("{0}", provider);
    }
    return t(
      "cloud_guard_desc_game_root",
      "This game folder sits inside {0}. Cloud dehydration or live sync locks can interfere with launches and verification."
    ).replace("{0}", provider);
  };

  const handleOpenRelocate = (finding: CloudSyncPathFinding) => {
    const cardKey = `${finding.role}::${normalizeCloudPathKey(finding.resolved_path)}`;
    if (relocateKey === cardKey) {
      setRelocateKey(null);
      return;
    }
    setRelocateKey(cardKey);
    setRelocateDestInput(
      finding.suggested_local_vault_path || report?.recommended_safe_vault_root || ""
    );
    setRelocateCopyFiles(true);
  };

  const handlePickRelocateFolder = async () => {
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        title: t("cloud_guard_relocate_picker_title", "Choose Safe Local {Vault} Folder") as string,
        defaultPath: relocateDestInput || report?.recommended_safe_vault_root || undefined,
      });
      if (picked && typeof picked === "string") {
        setRelocateDestInput(picked.trim());
      }
    } catch (err) {
      useStore.getState().pushStatus(String(err), "error");
    }
  };

  const handleConfirmRelocation = async (finding: CloudSyncPathFinding) => {
    const dest = relocateDestInput.trim();
    if (!dest) return;
    setIsRelocating(true);
    try {
      const sourcePath =
        finding.role === "master_vault"
          ? finding.configured_path
          : useStore.getState().vaultPath || finding.configured_path;
      const result = await invoke<VaultRelocationResult>("relocate_master_vault_with_consent", {
        sourceVaultPath: sourcePath,
        destinationVaultPath: dest,
        copyExistingFiles: relocateCopyFiles,
        wipeActiveSymlinksFirst: finding.active_symlink_count > 0,
      });
      useStore.getState().setVaultPath(result.new_active_vault_path || result.new_master_vault_path);
      invalidateCloudSyncCache();
      setRelocateKey(null);
      useStore.getState().pushStatus(
        t(
          "cloud_guard_relocate_success",
          "{Vault} relocated to safe local folder ({0} files copied). Original cloud copy preserved untouched."
        ).replace("{0}", String(result.copied_files_count)),
        "success"
      );
      window.dispatchEvent(new CustomEvent("sanctuary-coordinates-updated"));
      await runInspection();
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "error");
    } finally {
      setIsRelocating(false);
    }
  };

  const handlePinLocalHydration = async (finding: CloudSyncPathFinding, cardKey: string) => {
    if (confirmPinKey !== cardKey) {
      setConfirmPinKey(cardKey);
      return;
    }
    setConfirmPinKey(null);
    setIsPinningKey(cardKey);
    try {
      const res = await invoke<CloudHydrationPinResult>("pin_cloud_folder_local_hydration", {
        path: finding.resolved_path || finding.configured_path,
      });
      invalidateCloudSyncCache();
      useStore.getState().pushStatus(
        t(
          "cloud_guard_pin_success",
          "Pinned {0} local items (skipped {1} symlinks untouched)."
        )
          .replace("{0}", String(res.pinned_count))
          .replace("{1}", String(res.skipped_symlinks)),
        "success"
      );
      await runInspection();
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "error");
    } finally {
      setIsPinningKey(null);
    }
  };

  const handleWipeSymlinks = async (cardKey: string) => {
    if (confirmWipeKey !== cardKey) {
      setConfirmWipeKey(cardKey);
      return;
    }
    setConfirmWipeKey(null);
    setIsWipingKey(cardKey);
    try {
      const msg = await invoke<string>("wipe_symlinks");
      invalidateCloudSyncCache();
      useStore.getState().pushStatus(msg, "success");
      await runInspection();
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "error");
    } finally {
      setIsWipingKey(null);
    }
  };

  const handleOpenProviderSettings = async (finding: CloudSyncPathFinding) => {
    try {
      await invoke("open_cloud_sync_provider_settings", {
        provider: finding.provider,
        targetPath: finding.resolved_path || finding.configured_path,
        cloudRootPath: finding.cloud_root_path || null,
      });
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "warning");
    }
  };

  const handleExcludeFolderFromSync = async (finding: CloudSyncPathFinding, cardKey: string) => {
    if (confirmExcludeKey !== cardKey) {
      setConfirmExcludeKey(cardKey);
      return;
    }
    setConfirmExcludeKey(null);
    setIsExcludingKey(cardKey);
    try {
      await invoke("apply_cloud_sync_folder_exclusion", {
        targetPath: finding.resolved_path || finding.configured_path,
        provider: finding.provider,
        cloudRootPath: finding.cloud_root_path || null,
      });
      invalidateCloudSyncCache();
      useStore.getState().pushStatus(
        t("cloud_guard_exclude_success", "Excluded folder from {0} sync.").replace(
          "{0}",
          finding.provider
        ),
        "success"
      );
      await runInspection();
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "error");
    } finally {
      setIsExcludingKey(null);
    }
  };

  const handleCopySavesPath = async (savesPath: string, cardKey: string) => {
    try {
      await navigator.clipboard.writeText(savesPath);
      setCopiedSavesKey(cardKey);
      setTimeout(() => {
        setCopiedSavesKey((prev) => (prev === cardKey ? null : prev));
      }, 2200);
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "warning");
    }
  };

  const handleToggleSessionCleanMods = () => {
    const next = !sessionCleanMods;
    setCloudSessionCleanMods(next, activeWorkspaceId);
    setSessionCleanModsState(next);
  };

  const handleEnableSessionModeAndAllow = (finding: CloudSyncPathFinding) => {
    setCloudSessionCleanMods(true, activeWorkspaceId);
    setSessionCleanModsState(true);
    const targetRootKey = finding.cloud_root_path
      ? normalizeCloudPathKey(finding.cloud_root_path)
      : "";
    const targetProvider = String(finding.provider || "").trim().toLowerCase();
    const relatedFindings = targetRootKey
      ? findings.filter(
        (f) =>
          f.role !== "master_vault" &&
          f.role !== "workspace_vault" &&
          String(f.provider || "").trim().toLowerCase() === targetProvider &&
          normalizeCloudPathKey(f.cloud_root_path) === targetRootKey
      )
      : [finding];
    const toConsent = relatedFindings.some(
      (f) =>
        normalizeCloudPathKey(f.resolved_path) ===
        normalizeCloudPathKey(finding.resolved_path) &&
        f.role === finding.role
    )
      ? relatedFindings
      : [finding, ...relatedFindings];
    grantCloudSyncConsent(toConsent, activeWorkspaceId);
    cloudSyncGuardContext?.onConsentGranted?.();
    setConsents(getCloudSyncConsents());
  };

  const handleEnableSessionAndProceed = () => {
    setCloudSessionCleanMods(true, activeWorkspaceId);
    setSessionCleanModsState(true);
    handleAuthorizeAndDeploy();
  };

  const handleOpenFolder = async (targetPath: string) => {
    try {
      await invoke("open_folder", { path: targetPath });
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "warning");
    }
  };

  const handleReDetectLocalPath = async (finding: CloudSyncPathFinding, cardKey: string) => {
    try {
      const detected: any = await invoke("auto_detect_paths");
      const candidate =
        finding.role === "mods_target"
          ? detected?.mods_path
          : finding.role === "user_data"
            ? detected?.docs_path || detected?.user_data_path
            : "";
      const cleanCand = String(candidate || "").trim();
      if (!cleanCand || normalizeCloudPathKey(cleanCand) === normalizeCloudPathKey(finding.configured_path)) {
        useStore.getState().pushStatus(
          t(
            "cloud_guard_redetect_unchanged",
            "Detected path is still pointing to the same folder. Unlink folder backup in your cloud sync client first, or browse for a local folder in {Settings}."
          ),
          "warning"
        );
        return;
      }
      setDetectedLocalSuggestion({ roleKey: cardKey, path: cleanCand });
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "error");
    }
  };

  const handleApplyDetectedLocalPath = async (finding: CloudSyncPathFinding) => {
    if (!detectedLocalSuggestion) return;
    const nextPath = detectedLocalSuggestion.path;
    try {
      const gConf: any = await invoke("get_global_config");
      const wsList = Array.isArray(gConf?.workspaces) ? gConf.workspaces : [];
      const activeId = String(gConf?.active_workspace_id || activeWorkspaceId || "").toLowerCase();
      const updatedWorkspaces = wsList.map((w: any) => {
        const matches =
          String(w?.id || "").toLowerCase() === activeId ||
          String(w?.schema_id || "").toLowerCase() === activeId;
        if (!matches) return w;
        if (finding.role === "mods_target") {
          return { ...w, mods_path: nextPath };
        }
        return { ...w, docs_path: nextPath, user_data_path: nextPath };
      });
      await invoke("save_coordinates", {
        config: { ...gConf, workspaces: updatedWorkspaces },
      });
      if (finding.role === "mods_target") {
        useStore.getState().setModsPath(nextPath);
      } else {
        useStore.getState().setDocsPath(nextPath);
      }
      setDetectedLocalSuggestion(null);
      invalidateCloudSyncCache();
      window.dispatchEvent(new CustomEvent("sanctuary-coordinates-updated"));
      useStore.getState().pushStatus(
        t("settings_auto_detect_success", "Paths Auto-Detected Successfully!"),
        "success"
      );
      await runInspection();
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "error");
    }
  };

  const handleAuthorizeAndDeploy = () => {
    const toConsent = unconsentedFindings.length > 0 ? unconsentedFindings : findings;
    grantCloudSyncConsent(toConsent, activeWorkspaceId);
    cloudSyncGuardContext?.onConsentGranted?.();
    const callback = cloudSyncGuardContext?.onConsentProceed;
    closeCloudSyncGuard();
    onClose();
    if (callback) {
      callback();
    }
  };

  const handleGrantConsentForFinding = (finding: CloudSyncPathFinding) => {
    grantCloudSyncConsent(finding, activeWorkspaceId);
    cloudSyncGuardContext?.onConsentGranted?.();
    setConsents(getCloudSyncConsents());
  };

  const heroVariant: "success" | "danger" | "accent" =
    isPendingGate && unconsentedFindings.length === 0
      ? "success"
      : unconsentedFindings.length > 0
        ? "danger"
        : findings.length > 0
          ? "accent"
          : "success";

  const heroTitle = (() => {
    if (isPendingGate) {
      if (unconsentedFindings.length === 0) {
        return t("cloud_guard_ready_continue_title", "Folder Approved — Ready to Continue");
      }
      return cloudSyncGuardContext?.pendingActionLabel
        ? t("cloud_guard_paused_title", "Paused: {0}").replace(
          "{0}",
          cloudSyncGuardContext.pendingActionLabel
        )
        : t("cloud_guard_paused_generic_title", "Paused for Folder Consent");
    }
    if (unconsentedFindings.length === 1) {
      return t("cloud_guard_hero_conflict_one", "1 Cloud-Synced Folder Needs Review");
    }
    if (unconsentedFindings.length > 1) {
      return t("cloud_guard_hero_conflict_many", "{0} Cloud-Synced Folders Need Review").replace(
        "{0}",
        String(unconsentedFindings.length)
      );
    }
    if (findings.length > 0) {
      return t("cloud_guard_hero_consented", "Approved Cloud Folders ({0})").replace(
        "{0}",
        String(consentedFindings.length)
      );
    }
    if (excludedFindings.length > 0) {
      return t("cloud_guard_hero_excluded", "Protected & Excluded From Sync ({0})").replace(
        "{0}",
        String(excludedFindings.length)
      );
    }
    return t("cloud_guard_hero_clean", "All Workspace Paths Local & Clear");
  })();

  const heroDescription = (() => {
    if (isPendingGate) {
      if (unconsentedFindings.length === 0) {
        return t(
          "cloud_guard_ready_continue_desc",
          "Your cloud-sync preference is saved. You can safely continue your paused action now."
        );
      }
      return t(
        "cloud_guard_paused_desc",
        "{0} is syncing your target folder. Choose how Sanctuary OS should handle symlinks below—nothing changes without your permission."
      ).replace("{0}", providersLabel);
    }
    return t(
      "cloud_guard_hero_desc",
      "Sanctuary OS never moves folders or modifies cloud-sync settings automatically. Review any detected cloud directories below and choose how you want to handle them."
    );
  })();

  const heroBadge = (() => {
    if (isPendingGate) {
      if (unconsentedFindings.length === 0) {
        return t("status_stable", "Stable");
      }
      return providersLabel;
    }
    if (unconsentedFindings.length > 0) {
      return `${unconsentedFindings.length} ${t("warning", "Warning")}`;
    }
    if (findings.length > 0) {
      return `${consentedFindings.length} ${t("cloud_guard_badge_consented", "User Approved")}`;
    }
    if (excludedFindings.length > 0) {
      return `${excludedFindings.length} ${t("cloud_guard_badge_excluded", "Excluded From Sync")}`;
    }
    return t("status_stable", "Stable");
  })();

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={handleClose}
      title={t("cloud_guard_panel_title", "Cloud-Sync Folder Guard")}
      subtitle={t("cloud_guard_subtitle", "Local Path & Symlink Protection")}
      icon={
        unconsentedFindings.length > 0
          ? t("icon_cloud_off", "cloud_off")
          : t("icon_cloud_done", "cloud_done")
      }
      iconColorClass={
        unconsentedFindings.length > 0
          ? "text-[var(--danger)]"
          : findings.length > 0 || excludedFindings.length > 0
            ? "text-[var(--accent)]"
            : "text-[var(--success)]"
      }
      widthClass="w-full md:w-[680px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_refresh", "refresh")}
            tooltip={isScanning ? t("scanning", "Scanning...") : t("refresh", "Refresh")}
            disabled={isScanning}
            onClick={() => void runInspection()}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={
            isPendingGate
              ? unconsentedFindings.length === 0
                ? t("icon_check_circle", "check_circle")
                : t("icon_pause_circle", "pause_circle")
              : unconsentedFindings.length > 0
                ? t("icon_cloud_off", "cloud_off")
                : t("icon_cloud_done", "cloud_done")
          }
          overline={
            isPendingGate && unconsentedFindings.length > 0
              ? t("cloud_guard_pending_overline", "Action Paused • Explicit Consent Required")
              : t("cloud_guard_overline", "System Check • Explicit Consent Required")
          }
          title={heroTitle}
          description={heroDescription}
          badge={heroBadge}
          badgeIcon={
            isPendingGate && unconsentedFindings.length > 0
              ? t("icon_cloud_sync", "cloud_sync")
              : unconsentedFindings.length > 0
                ? t("icon_warning", "warning")
                : t("icon_verified_user", "verified_user")
          }
          variant={heroVariant}
        >
          {(totalActiveSymlinks > 0 || isPendingGate) && (
            <div className="flex flex-col gap-2.5 w-full pt-1">
              {totalActiveSymlinks > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="material-symbols-outlined !text-[15px] text-[var(--danger)] shrink-0">
                      {t("icon_link", "link")}
                    </span>
                    <span className="text-[11px] font-medium text-[var(--text-secondary)] leading-snug">
                      {t(
                        "cloud_guard_active_symlinks_notice",
                        "{0} {Mod} symlinks are currently deployed in this synced folder."
                      ).replace("{0}", String(totalActiveSymlinks))}
                    </span>
                  </div>
                  <ActionButton
                    type="button"
                    variant={confirmWipeKey === "__hero__" ? "danger" : "glass"}
                    disabled={isWipingKey === "__hero__"}
                    icon={t("icon_link_off", "link_off")}
                    label={
                      confirmWipeKey === "__hero__"
                        ? t("cloud_guard_wipe_confirm_btn", "Confirm Remove")
                        : t("cloud_guard_wipe_btn", "Remove Symlinks")
                    }
                    onClick={() => void handleWipeSymlinks("__hero__")}
                  />
                </div>
              )}

              {isPendingGate && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] w-full">
                  <ActionButton
                    type="button"
                    variant="glass"
                    icon={t("icon_close", "close")}
                    label={t("cancel", "Cancel")}
                    onClick={handleClose}
                  />
                  <div className="flex flex-wrap items-center gap-2 ml-auto">
                    {unconsentedFindings.length === 0 ? (
                      <ActionButton
                        type="button"
                        variant="success"
                        icon={t("icon_play_arrow", "play_arrow")}
                        label={t("continue_action", "Continue")}
                        onClick={handleAuthorizeAndDeploy}
                      />
                    ) : (
                      <>
                        <ActionButton
                          type="button"
                          variant="glass"
                          icon={t("icon_verified_user", "verified_user")}
                          label={t("cloud_guard_allow_continue_btn", "Allow & Continue")}
                          onClick={handleAuthorizeAndDeploy}
                        />
                        {hasUnconsentedModsTarget && (
                          <ActionButton
                            type="button"
                            variant="accent"
                            icon={t("icon_auto_delete", "auto_delete")}
                            label={t(
                              "cloud_guard_session_enable_proceed_btn",
                              "Use Session Mode & Continue"
                            )}
                            onClick={handleEnableSessionAndProceed}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </SidePanelHeroCard>

        {allFindings.length === 0 ? (
          <UniversalGroup
            title={t("cloud_guard_findings_group", "Detected Cloud-Sync Directories")}
            icon={t("icon_folder_managed", "folder_managed")}
          >
            <EmptyState
              icon={t("icon_check_circle", "check_circle")}
              title={t("cloud_guard_empty_title", "No Cloud-Sync Interference Detected")}
              subtitle={t(
                "cloud_guard_empty_desc",
                "None of your Master {Vault}, {Mods}, Save, or routed game directories sit inside OneDrive, iCloud Drive, Dropbox, Google Drive, or Windows Files On-Demand folders."
              )}
              minHeightClass="min-h-[180px]"
            />
          </UniversalGroup>
        ) : (
          <UniversalGroup
            title={t("cloud_guard_findings_group", "Detected Cloud-Sync Directories")}
            icon={t("icon_cloud_sync", "cloud_sync")}
            count={allFindings.length}
          >
            <div className="flex flex-col gap-3.5 w-full">
              {allFindings.map((finding) => {
                const cardKey = `${finding.role}::${normalizeCloudPathKey(finding.resolved_path)}`;
                const isExcluded = Boolean(finding.is_excluded_from_sync);
                const isConsented = isCloudSyncFindingConsented(finding, consents);
                const chip = getHydrationChip(finding, isConsented);
                const isRelocateOpen = relocateKey === cardKey;
                const isVaultRole =
                  finding.role === "master_vault" || finding.role === "workspace_vault";
                const isModsTargetRole =
                  finding.role === "mods_target" || finding.role === "install_route";
                const canReDetectTarget =
                  finding.role === "mods_target" || finding.role === "user_data";
                const showSavesOnlyHelper =
                  !isExcluded &&
                  !finding.supports_folder_exclusion &&
                  Boolean(finding.schema_saves_path) &&
                  (isModsTargetRole || finding.is_parent_folder_synced);
                const hasProviderSettingsBtn = !showSavesOnlyHelper;
                const hasPinBtn =
                  finding.can_pin_hydration && !finding.is_pinned_locally && !isExcluded;
                const hasRedetectBtn =
                  finding.is_windows_kfm_redirect && canReDetectTarget && !isExcluded;
                const utilityCount =
                  1 +
                  (hasProviderSettingsBtn ? 1 : 0) +
                  (isVaultRole ? 1 : 0) +
                  (hasPinBtn ? 1 : 0) +
                  (hasRedetectBtn ? 1 : 0);
                const consentCount = isExcluded
                  ? 0
                  : !isConsented && isModsTargetRole && !sessionCleanMods
                    ? 2
                    : 1;
                const totalFooterButtons = utilityCount + consentCount;
                const footerBtnClass =
                  totalFooterButtons === 1
                    ? "!px-3 !py-2.5 whitespace-nowrap"
                    : "w-full !px-3 !py-2.5 whitespace-nowrap";

                const utilityActions = [
                  <ActionButton
                    key="open-folder"
                    type="button"
                    variant="glass"
                    className={footerBtnClass}
                    icon={t("icon_folder_open", "folder_open")}
                    label={t("cloud_guard_open_folder", "Open Folder")}
                    onClick={() =>
                      void handleOpenFolder(finding.resolved_path || finding.configured_path)
                    }
                  />,
                  ...(hasProviderSettingsBtn
                    ? [
                      <ActionButton
                        key="open-provider"
                        type="button"
                        variant="glass"
                        className={footerBtnClass}
                        icon={t("icon_open_in_new", "open_in_new")}
                        label={t("cloud_guard_open_provider_settings", "Open {0}").replace(
                          "{0}",
                          finding.provider
                        )}
                        onClick={() => void handleOpenProviderSettings(finding)}
                      />,
                    ]
                    : []),
                  ...(isVaultRole
                    ? [
                      <ActionButton
                        key="relocate-vault"
                        type="button"
                        variant="accent"
                        className={footerBtnClass}
                        icon={t("icon_drive_file_move", "drive_file_move")}
                        label={t(
                          "cloud_guard_relocate_vault_btn",
                          "Relocate {Vault} to Safe Folder"
                        )}
                        onClick={() => handleOpenRelocate(finding)}
                      />,
                    ]
                    : []),
                  ...(hasPinBtn
                    ? [
                      <ActionButton
                        key="pin-local"
                        type="button"
                        variant={confirmPinKey === cardKey ? "warning" : "glass"}
                        className={footerBtnClass}
                        disabled={isPinningKey === cardKey}
                        icon={
                          confirmPinKey === cardKey
                            ? t("icon_warning", "warning")
                            : t("icon_offline_pin", "offline_pin")
                        }
                        label={
                          isPinningKey === cardKey
                            ? t("loading", "Loading")
                            : confirmPinKey === cardKey
                              ? t("cloud_guard_pin_confirm_btn", "Confirm Pin Local (Skips Symlinks)")
                              : t("cloud_guard_pin_btn", "Keep Files Local (Pin)")
                        }
                        onClick={() => void handlePinLocalHydration(finding, cardKey)}
                      />,
                    ]
                    : []),
                  ...(hasRedetectBtn
                    ? [
                      <ActionButton
                        key="redetect"
                        type="button"
                        variant="glass"
                        className={footerBtnClass}
                        icon={t("icon_troubleshoot", "troubleshoot")}
                        label={t("cloud_guard_redetect_btn", "Re-Detect Local Path")}
                        onClick={() => void handleReDetectLocalPath(finding, cardKey)}
                      />,
                    ]
                    : []),
                ];

                const consentActions = isExcluded
                  ? []
                  : !isConsented
                    ? isModsTargetRole && !sessionCleanMods
                      ? [
                        <ActionButton
                          key="consent-asis"
                          type="button"
                          variant="glass"
                          className={footerBtnClass}
                          icon={t("icon_verified_user", "verified_user")}
                          label={t("cloud_guard_consent_asis_btn", "Allow As-Is")}
                          onClick={() => handleGrantConsentForFinding(finding)}
                        />,
                        <ActionButton
                          key="session-allow"
                          type="button"
                          variant="accent"
                          className={footerBtnClass}
                          icon={t("icon_auto_delete", "auto_delete")}
                          label={t(
                            "cloud_guard_session_enable_allow_btn",
                            "Session Mode & Allow"
                          )}
                          onClick={() => handleEnableSessionModeAndAllow(finding)}
                        />,
                      ]
                      : [
                        <ActionButton
                          key="consent-allow"
                          type="button"
                          variant={isModsTargetRole && sessionCleanMods ? "accent" : "glass"}
                          className={footerBtnClass}
                          icon={t("icon_verified_user", "verified_user")}
                          label={t("cloud_guard_consent_btn", "Allow This Folder")}
                          onClick={() => handleGrantConsentForFinding(finding)}
                        />,
                      ]
                    : [
                      <ActionButton
                        key="revoke-consent"
                        type="button"
                        variant="glass"
                        className={footerBtnClass}
                        icon={t("icon_undo", "undo")}
                        label={t("cloud_guard_revoke_consent_btn", "Revoke Consent")}
                        onClick={() => {
                          revokeCloudSyncConsent(finding);
                          setConsents(getCloudSyncConsents());
                        }}
                      />,
                    ];

                const footerContent =
                  totalFooterButtons === 1 ? (
                    <div className="flex items-center justify-start w-full">
                      {utilityActions}
                      {consentActions}
                    </div>
                  ) : totalFooterButtons === 2 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                      {utilityActions}
                      {consentActions}
                    </div>
                  ) : totalFooterButtons === 3 &&
                    utilityCount === 1 &&
                    consentCount === 2 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,0.85fr)_minmax(0,1.15fr)] gap-2 w-full">
                      {utilityActions}
                      {consentActions}
                    </div>
                  ) : totalFooterButtons === 3 && !isVaultRole && !hasPinBtn ? (
                    <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_minmax(0,1fr)] gap-2 w-full">
                      {utilityActions}
                      {consentActions}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 w-full">
                      <div
                        className={`grid grid-cols-1 ${utilityCount > 1 ? "sm:grid-cols-2" : ""} gap-2 w-full`}
                      >
                        {utilityActions}
                      </div>
                      {consentActions.length > 0 && (
                        <div
                          className={`grid grid-cols-1 ${consentCount > 1 ? "sm:grid-cols-2" : ""} gap-2 w-full`}
                        >
                          {consentActions}
                        </div>
                      )}
                    </div>
                  );

                return (
                  <UniversalCard
                    key={cardKey}
                    headerStyle="inline"
                    statusColor={
                      isExcluded || isConsented
                        ? undefined
                        : finding.severity === "critical"
                          ? "danger"
                          : "warning"
                    }
                    icon={
                      isExcluded
                        ? t("icon_verified_user", "verified_user")
                        : finding.symlink_risk
                          ? t("icon_link_off", "link_off")
                          : t("icon_cloud", "cloud")
                    }
                    title={getRoleLabel(finding.role)}
                    subtitle={getFindingExplanation(finding)}
                    actions={
                      <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                        <span className={`${VAULT_CHIP_CLASS} !bg-transparent`}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                            {t("icon_cloud", "cloud")}
                          </span>
                          <span>{finding.provider}</span>
                        </span>
                        <span className={`${VAULT_CHIP_CLASS} !bg-transparent`}>
                          <span className={`material-symbols-outlined !text-[12px] ${chip.colorClass}`}>
                            {chip.icon}
                          </span>
                          <span className={chip.colorClass}>{chip.label}</span>
                        </span>
                      </div>
                    }
                    footer={footerContent}
                  >
                    <div className="flex flex-col gap-2.5 w-full">
                      {finding.is_parent_folder_synced && finding.cloud_root_path ? (
                        <div className="grid grid-cols-1 gap-1.5 px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[11px] leading-snug">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                              {t("cloud_guard_parent_root_label", "Synced Parent Folder")} ({finding.provider})
                            </span>
                            <span className="font-mono text-[var(--text)] break-all">
                              {obfuscateCloudPath(finding.cloud_root_path, "")}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 pt-1.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                              {t("cloud_guard_mods_target_label", "Target Folder")}
                            </span>
                            <span className="font-mono text-[var(--text)] break-all">
                              {obfuscateCloudPath(
                                finding.resolved_path || finding.configured_path,
                                t("path_not_set", "Not Set")
                              )}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] font-mono text-[11px] text-[var(--text)] break-all leading-snug">
                          {obfuscateCloudPath(
                            finding.resolved_path || finding.configured_path,
                            t("path_not_set", "Not Set")
                          )}
                        </div>
                      )}

                      {isModsTargetRole && !isExcluded && (
                        <div
                          role="switch"
                          aria-checked={sessionCleanMods}
                          tabIndex={0}
                          onClick={handleToggleSessionCleanMods}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleToggleSessionCleanMods();
                            }
                          }}
                          className="flex flex-col gap-1.5 p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] cursor-pointer select-none hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] transition-colors w-full"
                        >
                          <div className="flex items-center justify-between gap-3 w-full">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                                {t("icon_auto_delete", "auto_delete")}
                              </span>
                              <span className="text-xs font-bold text-[var(--text)] leading-snug">
                                {t(
                                  "cloud_guard_session_mode_title",
                                  "Auto-Clean {Mods} Symlinks When Game Closes"
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-auto">
                              {!sessionCleanMods && (
                                <span className={`${VAULT_CHIP_CLASS} !bg-transparent`}>
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                                    {t("icon_verified", "verified")}
                                  </span>
                                  <span className="text-[var(--success)]">
                                    {t("recommended", "Recommended")}
                                  </span>
                                </span>
                              )}
                              <SettingsToggle checked={sessionCleanMods} />
                            </div>
                          </div>
                          <span className="text-[11px] text-[var(--text-secondary)] leading-snug">
                            {t(
                              "cloud_guard_session_mode_desc",
                              "Deploys symlinks on launch and cleans them on exit so {0} never crawls {Mods} between sessions."
                            ).replace("{0}", finding.provider)}
                          </span>
                        </div>
                      )}

                      {!isExcluded && finding.supports_folder_exclusion && (
                        <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] w-full">
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                                {t("icon_shield", "shield")}
                              </span>
                              <span>
                                {t("cloud_guard_exclude_btn", "Exclude Folder From {0}").replace(
                                  "{0}",
                                  finding.provider
                                )}
                              </span>
                            </span>
                            <span className="text-[11px] text-[var(--text-secondary)] leading-snug">
                              {t(
                                "cloud_guard_exclude_desc",
                                "Adds a native ignore rule so {0} skips symlinks in this folder."
                              ).replace("{0}", finding.provider)}
                            </span>
                          </div>
                          <ActionButton
                            type="button"
                            variant={confirmExcludeKey === cardKey ? "warning" : "glass"}
                            disabled={isExcludingKey === cardKey}
                            icon={
                              confirmExcludeKey === cardKey
                                ? t("icon_warning", "warning")
                                : t("icon_shield", "shield")
                            }
                            label={
                              isExcludingKey === cardKey
                                ? t("loading", "Loading")
                                : confirmExcludeKey === cardKey
                                  ? t("cloud_guard_exclude_confirm_btn", "Confirm Exclude Folder")
                                  : t("cloud_guard_exclude_btn", "Exclude Folder From {0}").replace(
                                    "{0}",
                                    finding.provider
                                  )
                            }
                            onClick={() => void handleExcludeFolderFromSync(finding, cardKey)}
                          />
                        </div>
                      )}

                      {showSavesOnlyHelper && finding.schema_saves_path && (
                        <div className="flex flex-col gap-2.5 p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] w-full">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                                {t("icon_save", "save")}
                              </span>
                              <span>
                                {t(
                                  "cloud_guard_saves_only_title",
                                  "Sync Saves Only (Exclude {Mods})"
                                )}
                              </span>
                            </span>
                            <span className="text-[11px] text-[var(--text-secondary)] leading-snug">
                              {t(
                                "cloud_guard_saves_only_desc",
                                "Want cloud saves without syncing {Mods}? Unlink the parent folder in {0} settings and sync only this Save path:"
                              ).replace("{0}", finding.provider)}
                            </span>
                          </div>
                          <div className="w-full px-3 py-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] font-mono text-[11px] text-[var(--text)] break-all leading-snug">
                            {obfuscateCloudPath(finding.schema_saves_path, "")}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                            <ActionButton
                              type="button"
                              variant={copiedSavesKey === cardKey ? "success" : "glass"}
                              className="w-full !px-3.5 !py-2.5 whitespace-nowrap"
                              icon={
                                copiedSavesKey === cardKey
                                  ? t("icon_check", "check")
                                  : t("icon_content_copy", "content_copy")
                              }
                              label={
                                copiedSavesKey === cardKey
                                  ? t("copied", "Copied")
                                  : t("cloud_guard_copy_saves_btn", "Copy Save Folder Path")
                              }
                              onClick={() =>
                                void handleCopySavesPath(finding.schema_saves_path!, cardKey)
                              }
                            />
                            <ActionButton
                              type="button"
                              variant="glass"
                              className="w-full !px-3.5 !py-2.5 whitespace-nowrap"
                              icon={t("icon_open_in_new", "open_in_new")}
                              label={t(
                                "cloud_guard_open_provider_settings",
                                "Open {0}"
                              ).replace("{0}", finding.provider)}
                              onClick={() => void handleOpenProviderSettings(finding)}
                            />
                          </div>
                        </div>
                      )}

                      {isRelocateOpen && (
                        <div className="flex flex-col gap-3 p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] w-full">
                          <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                            {t(
                              "cloud_guard_relocate_panel_title",
                              "Move {Vault} Root Outside Cloud Sync"
                            )}
                          </span>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <input
                              type="text"
                              value={relocateDestInput}
                              onChange={(e) => setRelocateDestInput(e.target.value)}
                              placeholder={
                                report?.recommended_safe_vault_root ||
                                t("path_not_set", "Not Set")
                              }
                              className="flex-1 glass-surface rounded-xl px-3 py-2 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] outline-none focus:border-[color-mix(in_srgb,var(--text)_28%,transparent)]"
                            />
                            <ActionButton
                              type="button"
                              variant="glass"
                              icon={t("icon_folder_open", "folder_open")}
                              label={t("btn_browse", "Browse")}
                              onClick={handlePickRelocateFolder}
                            />
                          </div>
                          <div
                            role="switch"
                            aria-checked={relocateCopyFiles}
                            tabIndex={0}
                            onClick={() => setRelocateCopyFiles((prev) => !prev)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setRelocateCopyFiles((prev) => !prev);
                              }
                            }}
                            className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] cursor-pointer select-none"
                          >
                            <span className="text-[11px] font-semibold text-[var(--text)]">
                              {t(
                                "cloud_guard_relocate_copy_toggle",
                                "Copy existing {Vault} files to new local folder (keeps originals untouched)"
                              )}
                            </span>
                            <SettingsToggle checked={relocateCopyFiles} />
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <ActionButton
                              type="button"
                              variant="glass"
                              icon={t("icon_close", "close")}
                              label={t("cancel", "Cancel")}
                              onClick={() => setRelocateKey(null)}
                            />
                            <ActionButton
                              type="button"
                              variant="success"
                              disabled={isRelocating || !relocateDestInput.trim()}
                              icon={t("icon_drive_file_move", "drive_file_move")}
                              label={
                                isRelocating
                                  ? t("loading", "Loading")
                                  : t("cloud_guard_relocate_confirm_btn", "Confirm {Vault} Relocation")
                              }
                              onClick={() => void handleConfirmRelocation(finding)}
                            />
                          </div>
                        </div>
                      )}

                      {detectedLocalSuggestion?.roleKey === cardKey && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--success)_40%,transparent)]">
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-[11px] font-black text-[var(--success)]">
                              {t(
                                "cloud_guard_redetect_found_title",
                                "New Local Path Found — Ready to Switch"
                              )}
                            </span>
                            <span className="text-[11px] font-mono text-[var(--text)] break-all">
                              {obfuscateCloudPath(detectedLocalSuggestion.path, "")}
                            </span>
                          </div>
                          <ActionButton
                            type="button"
                            variant="success"
                            icon={t("icon_check", "check")}
                            label={t("cloud_guard_apply_detected_btn", "Apply Detected Local Path")}
                            onClick={() => void handleApplyDetectedLocalPath(finding)}
                          />
                        </div>
                      )}
                    </div>
                  </UniversalCard>
                );
              })}
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
