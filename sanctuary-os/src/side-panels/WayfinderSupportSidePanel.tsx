import React, { useState, useEffect } from "react";
import { supabase, supabaseAuth } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { CustomDropdown, ModSearchDropdown, SidePanel, SidePanelHeroCard, getExtensionRegex, PanelHeaderGroup, PanelHeaderButton, VAULT_CHIP_CLASS } from "../shared";
import { useStore } from "../store";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";

export default function WayfinderSupportSidePanel({
 isOpen, onClose, preselectedType }: { isOpen: boolean; onClose: () => void; preselectedType?: string }) {
  const activeGameSchema = useStore(state => state.activeGameSchema);
  const { t } = useLexicon();
  const modList = useStore((state) => state.modList);
  const activeSet = useStore(state => state.playSets[state.activePlaySetIndex]);
  const [type, setType] = useState(preselectedType || "BUG_MOD");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetModId, setTargetModId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [logs, setLogs] = useState("");
  const [customFieldsData, setCustomFieldsData] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<any[]>([]);
  const [telemetrySources, setTelemetrySources] = useState<any[]>([]);
  const [, setLoadingCats] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [policyViolations, setPolicyViolations] = useState<string[]>([]);
  const [optedOutSources, setOptedOutSources] = useState<string[]>([]);
  const session = useStore((state) => state.session);
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState("");

  const vaultExtremeMods = React.useMemo(() => {
    if (!isOpen) return [];
    return modList.filter((ml: any) => ml.compliance_tier >= 3 && ml.compliance_tier <= 5).map((ml: any) => ({ name: ml.displayName || ml.name, tier: ml.compliance_tier }));
  }, [modList, isOpen]);

  const isRestrictedOrUnknownTicketMod = (ml: any) =>
    !ml?.isVirtual &&
    ((Number(ml?.compliance_tier || 0) >= 1 && Number(ml?.compliance_tier || 0) <= 4) ||
      !ml?.isSynced ||
      !ml?.dbId ||
      String(ml?.status || "").toLowerCase() === "unverified");

  const activeAdultMods = React.useMemo(() => {
    if (!activeSet?.mods || !isOpen) return [];
    
    const restrictedModsInVault = modList.filter(isRestrictedOrUnknownTicketMod);
    if (restrictedModsInVault.length === 0) return [];
    
    const activeModsSet = new Set<string>(
      activeSet.mods.map((rm: any) => (typeof rm === "string" ? rm : String(rm?.name || rm?.path || "")))
    );
    const extRegex = getExtensionRegex(activeGameSchema);
    
    const activeBaseNames = new Set<string>();
    for (const rawMod of activeSet.mods) {
       const modName = typeof rawMod === "string" ? rawMod : String(rawMod?.name || rawMod?.path || "");
       const base = modName.split(/[\\/]/).pop()?.replace(extRegex, '');
       if (base) activeBaseNames.add(base);
    }
    
    const matchedAdultMods: any[] = [];
    
    for (const am of restrictedModsInVault) {
        if (activeModsSet.has(am.name) || (am.displayName && activeModsSet.has(am.displayName))) {
             matchedAdultMods.push({ name: am.displayName || am.name, tier: am.compliance_tier || 0 });
             continue;
        }
        
        const mBase = am.name?.split(/[\\/]/).pop()?.replace(extRegex, '');
        if (mBase && activeBaseNames.has(mBase)) {
             matchedAdultMods.push({ name: am.displayName || am.name, tier: am.compliance_tier || 0 });
        }
    }
    
    // remove duplicates by name
    const uniqueMods = matchedAdultMods.filter((mod, index, self) => index === self.findIndex((m) => m.name === mod.name));
    return uniqueMods;
  }, [activeSet?.mods, modList, activeGameSchema, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
      const fetchData = async () => {
        setLoadingCats(true);
        const [{ data: cats }, { data: sources }] = await Promise.all([
          supabaseAuth.from('keeper_support_categories').select('*').eq('is_active', true).order('category_name', { ascending: true }),
          supabase.from('sanctuary_telemetry_sources').select('*').eq('is_active', true)
        ]);
        if (session?.user?.id) {
           const { data: profile } = await supabase.from('profiles').select('is_comm_banned, comm_blacklist_reason').eq('id', session.user.id).single();
           if (profile?.is_comm_banned) {
              setIsBanned(true);
              setBanReason(profile.comm_blacklist_reason || "You have been banned from submitting support tickets.");
           }
        }
        if (cats && cats.length > 0) {
          setCategories(cats);
          if (!preselectedType) setType(cats[0].category_code);
          setCustomFieldsData({});
        }
        if (sources) {
          setTelemetrySources(sources);
        }
        setLoadingCats(false);
      };
      fetchData();
  }, [isOpen, preselectedType]);

  const activeCategory = categories.find(c => c.category_code === type);

  const submitTicket = async () => {
    if (String(activeCategory?.show_title_box) !== "false" && !title) return setError(t("support_error_fields", "Please fill out all required fields."));
    if (String(activeCategory?.show_description_box) !== "false" && !description) return setError(t("support_error_fields", "Please fill out all required fields."));

    if (activeCategory?.custom_fields) {
      for (const field of activeCategory.custom_fields) {
        if (field.required) {
          const val = customFieldsData[field.id];
          if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
            return setError(t("support_error_fields", "Please fill out all required fields."));
          }
        }
      }
    }
    setIsSubmitting(true);
    setError("");
    setPolicyViolations([]);

    try {
      const storeState = useStore.getState();
      const activeSet = storeState.playSets[storeState.activePlaySetIndex];

      let hasViolations = false;
      let violations: string[] = [];
      if (activeCategory?.requires_target_mod && targetModId) {
          const m = storeState.modList.find((ml: any) => ml.id === targetModId || ml.dbId === targetModId || ml.hash === targetModId);
          if (m && isRestrictedOrUnknownTicketMod(m)) {
              hasViolations = true;
              violations.push(m.displayName || m.name);
          }
      }
      if (activeCategory?.requires_target_mod && activeSet && activeSet.mods) {
          activeSet.mods.forEach((rawMod: any) => {
              const modName = typeof rawMod === "string" ? rawMod : String(rawMod?.name || rawMod?.path || "");
              const exactMatch = storeState.modList.find((ml: any) => ml.name === modName || ml.displayName === modName);
              if (exactMatch && isRestrictedOrUnknownTicketMod(exactMatch)) {
                  hasViolations = true;
                  violations.push(exactMatch.displayName || exactMatch.name);
                  return;
              }
              
              const fallbackMatch = storeState.modList.find((ml: any) => {
                 const mBase = ml.name?.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
                 const targetBase = modName.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
                 return mBase && targetBase && mBase === targetBase;
              });
              if (fallbackMatch && isRestrictedOrUnknownTicketMod(fallbackMatch)) {
                  hasViolations = true;
                  violations.push(fallbackMatch.displayName || fallbackMatch.name);
              }
          });
      }

      if (hasViolations && activeCategory?.requires_target_mod) {
          const uniqueViolations = [...new Set(violations)];
          invoke("write_os_log", { message: "Support ticket blocked due to restricted/unverified artifacts: " + uniqueViolations.join(", "), level: "WARNING" }).catch(console.error);
          throw new Error(
            (t(
              "support_err_restricted_active",
              "Artifact Bug tickets cannot be submitted while Tier 1–4 or unverified {mods} are active in your {Blueprint}: {0}"
            ) || "Artifact Bug tickets cannot be submitted while Tier 1–4 or unverified artifacts are active: {0}").replace(
              "{0}",
              uniqueViolations.slice(0, 4).join(", ")
            )
          );
      }

      let finalLogs = logs;

      if (activeCategory?.telemetry_config?.sources) {
        const modsPath = useStore.getState().modsPath;
        const sourceIds = activeCategory.telemetry_config.sources;
        const activeSources = telemetrySources.filter(s => sourceIds.includes(s.id) && !optedOutSources.includes(s.id));
        
        for (const source of activeSources) {
          try {
            if (source.type === 'OS') {
                const sysInfo = await invoke<string>("get_system_info");
                const storeState = useStore.getState();
                const activeSet = storeState.playSets[storeState.activePlaySetIndex];

                const netUpdates = storeState.networkUpdates;
                const totalUpdates = (netUpdates?.broken?.length || 0) + (netUpdates?.obsolete?.length || 0) + (netUpdates?.updated?.length || 0);
                
                const diagnostics = `\nDisplay Resolution: ${window.innerWidth}x${window.innerHeight}\nUser Agent: ${navigator.userAgent}\nMods Path: ${storeState.modsPath}\nActive Blueprint: ${activeSet?.name || "None"}\nActive Mods: ${activeSet?.mods?.length || 0}\nPending Network Updates: ${totalUpdates}\nCaptured At: ${new Date().toLocaleString()}\nDiagnostic Bundle Version: 1.0.0\n`;
                finalLogs += `\n--- TELEMETRY: ${source.label} (OS) ---\n` + sysInfo + diagnostics + "\n";

                if (activeSet) {
                    const bpPayload = JSON.stringify({ sanctuary_profile: true, ...activeSet }, null, 2);
                    finalLogs += `\n--- TELEMETRY: Attached Blueprint ---\n${bpPayload}\n`;
                }

                const systemLogHistory = storeState.statusLog.map(entry => {
                    return `[${new Date(entry.timestamp).toISOString()}] [${entry.type.toUpperCase()}] ${entry.message}`;
                }).join('\n');
                finalLogs += `\n--- TELEMETRY: System Log History ---\n${systemLogHistory || "No system logs available."}\n`;
            } else {
                const docDirMatch = modsPath.match(/(.*)[\\/]+mods[\\/]*$/i);
                const docDir = docDirMatch ? docDirMatch[1] : modsPath;
                let searchPath = source.search_path.replace('%MODS_DIR%', modsPath).replace('%DOC_DIR%', docDir);
                let fullPath = searchPath;
                if (!fullPath.endsWith('\\') && !fullPath.endsWith('/')) fullPath += '/';
                fullPath += source.file_pattern;

                const text = await readTextFile(fullPath);
                if (text) {
                   if (activeCategory?.requires_target_mod) {
                       const store = useStore.getState();
                       const restrictedModsInDB = store.modList.filter(isRestrictedOrUnknownTicketMod);
                       const extRegex = getExtensionRegex(store.activeGameSchema);
                       const dirtyTraces: string[] = [];
                       const lowerText = text.toLowerCase();
                       for (const am of restrictedModsInDB) {
                           const baseName = am.name.split(/[\\/]/).pop()?.replace(extRegex, '').toLowerCase();
                           if (baseName && baseName.length >= 4 && lowerText.includes(baseName)) {
                               dirtyTraces.push(am.displayName || am.name);
                           }
                       }
                       if (dirtyTraces.length > 0) {
                           const uniqueTraces = [...new Set(dirtyTraces)];
                           const traceStr = `${uniqueTraces.slice(0, 3).join(', ')}${uniqueTraces.length > 3 ? '...' : ''}`;
                           const errStr = (t("support_err_dirty_logs", "Dirty game logs detected. Found traces of explicit {mods}: {0}. Please clear your logs or relaunch the game without these {mods} before submitting.") || `Dirty log detected in ${source.label}. Found traces of explicit artifacts: {0}. Please clear your logs or relaunch the game without these mods before submitting.`).replace("{0}", traceStr);
                           throw new Error(errStr);
                       }
                   }
                   finalLogs += `\n--- TELEMETRY: ${source.label} ---\n` + text.substring(0, 10000) + "\n";
                }
            }
          } catch (e: any) {
            if (e?.message && activeCategory?.requires_target_mod && String(e.message).includes("Dirty")) {
              throw e;
            }
          }
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error(t("auto_guest_mode_active_45", "Guest Mode Active"));
      }

      const { data: profile } = await supabase.from('profiles').select('is_comm_banned, comm_blacklist_reason').eq('id', user.id).single();
      if (profile?.is_comm_banned) {
        throw new Error(`Communications Ban: ${profile.comm_blacklist_reason || "You have been banned from submitting support tickets."}`);
      }

      if (activeSet && (activeCategory?.attach_blueprints) && !finalLogs.includes('--- TELEMETRY: Attached Blueprint ---')) {
          const bpPayload = JSON.stringify({ sanctuary_profile: true, ...activeSet }, null, 2);
          finalLogs += `\n--- TELEMETRY: Attached Blueprint ---\n${bpPayload}\n`;
      }

      const { error } = await supabaseAuth.from('keeper_tickets').insert([{
        author_id: user.id,
        ticket_type: type,
        title: title || (activeCategory?.category_name || "Support Ticket"),
        description: description || "No description provided.",
        status: "open",
        metadata: {
          target_mod_id: activeCategory?.requires_target_mod ? (targetModId || null) : null,
          target_user_id: activeCategory?.requires_target_user ? (targetUserId || null) : null,
          logs: finalLogs || null,
          custom_fields: customFieldsData,
          ...(hasViolations && activeCategory?.requires_target_mod ? { restricted_violations: [...new Set(violations)] } : {})
        }
      }]);

      if (error) throw error;
      
      useStore.getState().pushStatus(t("ss_support_success", "Ticket sent successfully"), "success");
      onClose();
    } catch (e: any) {
      setError(e.message);
      useStore.getState().pushStatus(e.message, "error");
      invoke("write_os_log", { message: "Support ticket submission failed: " + e.message, level: "ERROR" }).catch(console.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const attachLog = async () => {
    try {
      const path = await open({ multiple: false, filters: [{ name: 'Log', extensions: ['txt', 'log'] }] });
      if (path && typeof path === 'string') {
        const text = await readTextFile(path);
        
        if (activeCategory?.requires_target_mod) {
            const store = useStore.getState();
            const restrictedModsInDB = store.modList.filter(isRestrictedOrUnknownTicketMod);
            const extRegex = getExtensionRegex(store.activeGameSchema);
            const dirtyTraces: string[] = [];
            const lowerText = text.toLowerCase();
            for (const am of restrictedModsInDB) {
                const baseName = am.name.split(/[\\/]/).pop()?.replace(extRegex, '').toLowerCase();
                if (baseName && baseName.length >= 4 && lowerText.includes(baseName)) {
                    dirtyTraces.push(am.displayName || am.name);
                }
            }
            if (dirtyTraces.length > 0) {
                const uniqueTraces = [...new Set(dirtyTraces)];
                const traceStr = `${uniqueTraces.slice(0, 3).join(', ')}${uniqueTraces.length > 3 ? '...' : ''}`;
                const errStr = (t("support_err_dirty_logs", "Dirty game logs detected. Found traces of explicit {mods}: {0}. Please clear your logs or relaunch the game without these {mods} before submitting.") || `Dirty log detected. Found traces of explicit artifacts: {0}. Please clear your logs or relaunch the game without these mods before attaching.`).replace("{0}", traceStr);
                throw new Error(errStr);
            }
        }

        setLogs(prev => prev + "\n--- Log Attachment ---\n" + text.substring(0, 10000));
      }
    } catch (err: any) {
      console.error(err);
      useStore.getState().pushStatus(t("support_err_read_log", "Failed to read log"), "error");
    }
  };

  if (!session || isBanned) {
    return (
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("wf_keeper_support_title", "Keeper Escalation Support")}
        subtitle={t("wf_keeper_support_subtitle", "Direct escalation channel to Sanctuary Foundry Keepers")}
        icon={t("icon_admin_panel_settings", "admin_panel_settings")}
        iconColorClass="text-[var(--danger)]"
        widthClass="w-[90vw] md:w-[680px]"
        backdropZ="z-[50000]"
        panelZ="z-[50001]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_lock", "lock")}
            overline={t("wf_keeper_support_title", "Keeper Escalation Support")}
            title={t("access_denied", "Access Denied")}
            description={isBanned ? `Communications Ban: ${banReason}` : t("auto_guest_mode_active_45", "Please sign in to submit support tickets.")}
            variant="danger"
          />
        </div>
      </SidePanel>
    );
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("wf_keeper_support_title", "Keeper Escalation Support")}
      subtitle={t("wf_keeper_support_subtitle", "Direct escalation channel to Sanctuary Foundry Keepers")}
      icon={t("icon_admin_panel_settings", "admin_panel_settings")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      backdropZ="z-[50000]"
      panelZ="z-[50001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_send", "send")}
            tooltip={
              vaultExtremeMods.length > 0
                ? (t("support_err_vault_lock", "Total {Vault} Lock: Severe {Mods} Detected"))
                : activeCategory?.requires_target_mod && activeAdultMods.length > 0
                ? t("support_adult_mods_title", "{Blueprint} Lock: Explicit {Mods} Detected")
                : (isSubmitting ? t("scanning", "Submitting...") : t("support_submit", "Submit Ticket"))
            }
            variant={
              vaultExtremeMods.length > 0 || (activeCategory?.requires_target_mod && activeAdultMods.length > 0)
                ? "error"
                : "accent"
            }
            disabled={isSubmitting || vaultExtremeMods.length > 0 || !!(activeCategory?.requires_target_mod && activeAdultMods.length > 0)}
            onClick={submitTicket}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_admin_panel_settings", "admin_panel_settings")}
          overline={t("wf_keeper_support_title", "Wayfinder → Keeper Escalation")}
          title={activeCategory?.category_name || t("wf_keeper_support_title", "Keeper Support Dossier")}
          description={activeCategory?.description || t("wf_keeper_support_subtitle", "Submit a direct escalation ticket to Sanctuary Foundry Keepers.")}
          badge={type}
          variant="accent"
        />
        {error && (
            <div className="bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-2xl flex flex-col overflow-hidden relative shadow-md group mt-2">
                <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-rose-500/5 to-transparent pointer-events-none" />
                <div className="flex items-start gap-4 p-5 relative z-10">
                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--danger)]">
                        <span className="material-symbols-outlined !text-[20px]">{t("icon_warning", "warning")}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 pt-0.5 w-full pr-8">
                        <span className="text-sm font-black text-rose-400 tracking-wide">{t("support_err_failed", "Submission Failed")}</span>
                        <span className="text-xs font-bold text-rose-200/80 leading-relaxed pr-4">{error}</span>
                    </div>
                    <button 
                      onClick={() => { setError(""); setPolicyViolations([]); }} 
                      className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:text-rose-400 hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-all shrink-0"
                    >
                      <span className="material-symbols-outlined !text-[18px]">{t("icon_close", "close")}</span>
                    </button>
                </div>
                {policyViolations.length > 0 && (
                    <div className="bg-black/30 p-4 border-t border-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex flex-col gap-3 max-h-32 overflow-y-auto custom-scrollbar relative z-10">
                        <span className="text-[9px] font-black tracking-widest text-[color-mix(in_srgb,var(--danger)_80%,transparent)] capitalize">{t("auto_restricted_artifacts_detected_34", "Restricted {mods}")}</span>
                        <div className="flex flex-wrap gap-2">
                            {policyViolations.map((mod, i) => (
                                <span
                                  key={i}
                                  className={VAULT_CHIP_CLASS}
                                >
                                    <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">{t("icon_extension", "extension")}</span>
                                    <span className="truncate">{mod.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').replace(/[-_]/g, ' ') || mod.replace(/[-_]/g, ' ')}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}

        {vaultExtremeMods.length > 0 && (
            <div className="bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-2xl flex flex-col overflow-hidden relative shadow-[0_0_30px_rgba(var(--danger-rgb),0.15)] group mt-2">
                <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[color-mix(in_srgb,var(--danger)_5%,transparent)] to-transparent pointer-events-none" />
                <div className="flex items-start gap-4 p-5 relative z-10">
                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--danger)]">
                        <span className="material-symbols-outlined !text-[20px]">{t("icon_block", "block")}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 pt-0.5 w-full pr-8">
                        <span className="text-sm font-black text-[var(--danger)] tracking-wide">{t("support_vault_lock_title", "{Vault} Lock Engaged") || "Vault Lock Engaged"}</span>
                        <span className="text-xs font-bold text-[color-mix(in_srgb,var(--danger)_80%,transparent)] leading-relaxed pr-4">
                            {t("support_vault_lock_desc", "Your vault contains severe {mods} (Tier 3-5). Support submissions are completely disabled until these {mods} are removed from Your {Vault}.") || `Your vault contains ${vaultExtremeMods.length} severe artifact(s) (Tier 3-5). Support submissions are completely disabled until these artifacts are purged from the system.`}
                        </span>
                    </div>
                </div>
                <div className="bg-black/30 p-4 border-t border-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex flex-col gap-3 max-h-32 overflow-y-auto custom-scrollbar relative z-10">
                    <div className="flex flex-wrap gap-2">
                        {vaultExtremeMods.map((mod: any, i: number) => (
                            <span
                              key={i}
                              className={VAULT_CHIP_CLASS}
                            >
                                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">{t("icon_extension", "extension")}</span>
                                <span>T{mod.tier} • {mod.name}</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {vaultExtremeMods.length === 0 && activeCategory?.requires_target_mod && activeAdultMods.length > 0 && (
            <div className="bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] rounded-2xl flex flex-col overflow-hidden relative shadow-[0_0_30px_rgba(var(--warning-rgb),0.15)] group mt-2">
                <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[color-mix(in_srgb,var(--warning)_5%,transparent)] to-transparent pointer-events-none" />
                <div className="flex items-start gap-4 p-5 relative z-10">
                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--warning)]">
                        <span className="material-symbols-outlined !text-[20px]">{t("icon_warning", "warning")}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 pt-0.5 w-full pr-8">
                        <span className="text-sm font-black text-[var(--warning)] tracking-wide">{t("support_adult_mods_title", "{Blueprint} Lock: Explicit {Mods} Detected")}</span>
                        <span className="text-xs font-bold text-[color-mix(in_srgb,var(--warning)_80%,transparent)] leading-relaxed pr-4">
                            {t("support_adult_mods_desc", "Your active {blueprint} contains adult/NSFW {mod}(s). If your ticket is related to one of these {mods}, please bypass Sanctuary OS and contact the original {Mason} directly. Otherwise, remove the {mods} and retest. You may submit a ticket once your logs are clean.") || `Your active blueprint contains ${activeAdultMods.length} adult/NSFW mod(s). If your ticket is related to one of these, please ensure you tag it appropriately or contact the author directly.`}
                        </span>
                    </div>
                </div>
                <div className="bg-black/30 p-4 border-t border-[color-mix(in_srgb,var(--warning)_20%,transparent)] flex flex-col gap-3 max-h-32 overflow-y-auto custom-scrollbar relative z-10">
                    <div className="flex flex-wrap gap-2">
                        {activeAdultMods.map((mod: any, i: number) => (
                            <span
                              key={i}
                              className={VAULT_CHIP_CLASS}
                            >
                                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--warning)]">{t("icon_extension", "extension")}</span>
                                <span>T{mod.tier} • {mod.name}</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        )}

          <div className="flex flex-col gap-2 relative z-[70]">
            <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("support_category", "Ticket Category")}</label>
            <CustomDropdown disableTint={true}  
              value={type}
              options={categories.map(c => ({ id: c.category_code, label: c.category_name }))}
              onChange={(v: string[]) => setType(v[0])}
            />
          </div>

          {String(activeCategory?.show_title_box) !== "false" && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("ql_support", "Support Queue")}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                placeholder={t("support_placeholder_title", "Enter a concise title...")}
              />
            </div>
          )}

          {activeCategory?.requires_target_mod && (
            <div className="flex flex-col gap-2 relative z-[60]">
              <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("target_artifact", "Target {Mod}")}</label>
              <ModSearchDropdown
                modList={modList.filter(
                  (m: any) =>
                    !m.isVirtual &&
                    Boolean(m.isSynced && m.dbId) &&
                    Number(m.compliance_tier || 0) === 0 &&
                    String(m.status || "").toLowerCase() !== "unverified"
                )}
                placeholder={t("support_placeholder_mod_uuid", "{Mod} UUID...")}
                selectedItem={modList.find((m: any) => m.id === targetModId || m.dbId === targetModId || m.hash === targetModId) || (targetModId ? { displayName: targetModId } : null)}
                onSelect={(m: any) => setTargetModId(m.dbId || m.id || m.hash)}
                onClear={() => setTargetModId("")}
              />
            </div>
          )}

          {activeCategory?.requires_target_user && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("support_target_user_label", "Target User ID")}</label>
              <input
                type="text"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                placeholder={t("support_placeholder_user_uuid", "User UUID...")}
              />
            </div>
          )}

          {String(activeCategory?.show_description_box) !== "false" && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex justify-start">
                <span>{t("support_desc", "Ticket Description")}</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all h-32 resize-none custom-scrollbar"
                placeholder={t("support_placeholder_desc", "Describe your issue in detail...")}
              />
            </div>
          )}

          {activeCategory?.custom_fields?.map((field: any) => (
            <div key={field.id} className="flex flex-col gap-2 relative z-[50]">
              <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center gap-2">
                {field.label}
                {field.required && <span className="text-[var(--danger)]">*</span>}
              </label>
              
              {field.type === "TEXT INPUT" && (
                <input
                  type="text"
                  value={customFieldsData[field.id] || ""}
                  onChange={(e) => setCustomFieldsData(prev => ({ ...prev, [field.id]: e.target.value }))}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                />
              )}
              
              {field.type === "TEXTAREA" && (
                <textarea
                  value={customFieldsData[field.id] || ""}
                  onChange={(e) => setCustomFieldsData(prev => ({ ...prev, [field.id]: e.target.value }))}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all h-24 resize-none custom-scrollbar"
                />
              )}
              
              {field.type === "DROPDOWN" && (
                <CustomDropdown disableTint={true}  
                  value={customFieldsData[field.id] || (field.allow_multi_select ? [] : "")}
                  options={(field.options || []).map((o: string) => ({ id: o, label: o }))}
                  onChange={(v: string[]) => setCustomFieldsData(prev => ({ ...prev, [field.id]: field.allow_multi_select ? v : v[0] }))}
                  allowMultiSelect={field.allow_multi_select}
                />
              )}
              
              {field.type === "CHECKBOX" && (!field.options || field.options.length === 0) && (
                <button
                  type="button"
                  onClick={() => setCustomFieldsData(prev => ({ ...prev, [field.id]: prev[field.id] === "true" ? "false" : "true" }))}
                  className={`sa-glass-toggle ${customFieldsData[field.id] === "true" ? "is-on" : ""}`}
                >
                  <div className="sa-glass-toggle-thumb" />
                </button>
              )}

              {field.type === "CHECKBOX" && field.options && field.options.length > 0 && (
                <div className="flex flex-col gap-2">
                  {field.options.map((opt: string) => {
                    const isMulti = field.allow_multi_select;
                    const currentValue = customFieldsData[field.id];
                    const isChecked = isMulti 
                      ? (Array.isArray(currentValue) ? currentValue : ([] as string[])).includes(opt)
                      : currentValue === opt;

                    return (
           <label key={opt} className={`flex items-center gap-4 cursor-pointer group rounded-2xl px-5 py-4 transition-all border backdrop-blur-xl shadow-xl relative ${isChecked ? 'glass-panel border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(var(--accent-rgb),0.1)]' : 'glass-surface border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                         <div className={`w-6 h-6 rounded-[0.4rem] flex items-center justify-center border transition-all shrink-0 backdrop-blur-md shadow-inner relative z-10 ${isChecked ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border-[var(--accent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)]' : 'bg-black/20 border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] group-hover:bg-black/30'}`}>
                           {isChecked && <span className="material-symbols-outlined !text-[16px] text-white font-black drop-shadow-md">{t("icon_check", "check")}</span>}
                         </div>
                         <span className={`text-sm font-bold transition-colors ${isChecked ? 'text-[var(--text)]' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>{opt}</span>
                         <input
                           type="checkbox"
                           className="hidden"
                           checked={isChecked}
                           onChange={() => {
                             setCustomFieldsData(prev => {
                                if (isMulti) {
                                  const arr = (Array.isArray(prev[field.id]) ? prev[field.id] : []) as string[];
                                  if (arr.includes(opt)) {
                                    return { ...prev, [field.id]: arr.filter((x: string) => x !== opt) };
                                  } else {
                                    return { ...prev, [field.id]: [...arr, opt] };
                                  }
                                } else {
                                  return { ...prev, [field.id]: isChecked ? "" : opt };
                                }
                             });
                           }}
                         />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {activeCategory?.telemetry_config?.sources && activeCategory.telemetry_config.sources.length > 0 && (
             <div className="flex flex-col gap-2 relative z-[50]">
               <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("support_telemetry_opt", "Automatic Diagnostics")}</label>
               <div className="flex flex-col gap-2">
                 {activeCategory.telemetry_config.sources.map((sourceId: string) => {
                   const source = telemetrySources.find(s => s.id === sourceId);
                   if (!source) return null;
                   const isOptedOut = optedOutSources.includes(sourceId);
                   return (
           <label key={sourceId} className={`flex items-center gap-4 cursor-pointer group rounded-2xl px-5 py-4 transition-all border backdrop-blur-xl shadow-xl relative ${!isOptedOut ? 'glass-panel border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(var(--accent-rgb),0.1)]' : 'glass-surface border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                         <div className={`w-6 h-6 rounded-[0.4rem] flex items-center justify-center border transition-all shrink-0 backdrop-blur-md shadow-inner relative z-10 ${!isOptedOut ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border-[var(--accent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)]' : 'bg-black/20 border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] group-hover:bg-black/30'}`}>
                           {!isOptedOut && <span className="material-symbols-outlined !text-[16px] text-white font-black drop-shadow-md">{t("icon_check", "check")}</span>}
                         </div>
                         <div className="flex flex-col">
                           <span className={`text-sm font-bold transition-colors ${!isOptedOut ? 'text-[var(--text)]' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>{source.label}</span>
                           <span className="text-[10px] font-bold opacity-50">{source.description || source.file_pattern}</span>
                         </div>
                         <input
                           type="checkbox"
                           className="hidden"
                           checked={!isOptedOut}
                           onChange={(e) => {
                             if (e.target.checked) {
                               setOptedOutSources(prev => prev.filter(id => id !== sourceId));
                             } else {
                               setOptedOutSources(prev => [...prev, sourceId]);
                             }
                           }}
                         />
                      </label>
                   )
                 })}
               </div>
             </div>
          )}

          {String(activeCategory?.show_logs_box) !== "false" && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex justify-start items-center">
                <span>{t("support_logs", "Attach Additional Logs")}</span>
                <button onClick={attachLog} className="text-[var(--accent)] hover:opacity-80 transition-opacity flex items-center gap-1">
                  <span>+ {t("support_attach_log", "Attach Log")}</span>
                </button>
              </label>
              <textarea
                value={logs}
                onChange={(e) => setLogs(e.target.value)}
                className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-[10px] font-mono focus:outline-none focus:theme-border-accent transition-all h-24 resize-none custom-scrollbar whitespace-pre-wrap"
                placeholder={t("support_placeholder_logs", "No logs attached.")}
              />
            </div>
          )}
      </div>
    </SidePanel>
  );
}



