import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { CustomDropdown, ModSearchDropdown, ActionButton, PanelHeaderGroup, PanelHeaderButton, SidePanelPillToggle, getExtensionRegex, LoadingScreen, SidePanel } from "./shared";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import ArtifactResolutionSidePanel from "./side-panels/ArtifactResolutionSidePanel";
import { UniversalInput, UniversalToggle, SidePanelHeroCard, StatBox } from "./components/universal/UniversalLayout";
import { getSupporterState, findLocalMasonSupporterPass, LocalMasonSupporter } from "./utils/supporterManager";
import { scrubLogUserData } from "./utils/logScrubber";

export default function SupportHub() {
  const activeGameSchema = useStore(state => state.activeGameSchema);
  const { t } = useLexicon();
  const modList = useStore((state) => state.modList);
  const activeSet = useStore(state => state.playSets[state.activePlaySetIndex]);
  const isScanning = useModalStore((state: any) => state.isScanning || state.isSilentScanning);

  const isOpen = useModalStore((state: any) => state.isSupportPanelOpen);
  const onClose = () => useModalStore.getState().setIsSupportPanelOpen(false);

  const [activeTab, setActiveTab] = useState("BUG_MOD");
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [maxReachedIndex, setMaxReachedIndex] = useState(0);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [draftData, setDraftData] = useState<any>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetModId, setTargetModId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [logs, setLogs] = useState("");
  const [, setFiles] = useState<File[]>([]);
  const [customFieldsData, setCustomFieldsData] = useState<Record<string, any>>({});

  const [categories, setCategories] = useState<any[]>([]);
  const [telemetrySources, setTelemetrySources] = useState<any[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [, setCurrentStep] = useState<number>(1);
  const [policyViolations, setPolicyViolations] = useState<string[]>([]);
  const [optedOutSources, setOptedOutSources] = useState<string[]>([]);

  const session = useStore((state) => state.session);
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [resolutionType, setResolutionType] = useState<'vault' | 'blueprint' | null>(null);
  const [localSupporters, setLocalSupporters] = useState<LocalMasonSupporter[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    getSupporterState().then(state => {
      setLocalSupporters(state.supporters || []);
    }).catch(() => {});
  }, [isOpen]);

  const matchedSupporterPass = React.useMemo(() => {
    if (!targetModId || localSupporters.length === 0) return null;
    const targetMod = modList.find((m: any) => m.id === targetModId || m.hash === targetModId);
    if (!targetMod) return null;
    return findLocalMasonSupporterPass(
      localSupporters,
      targetMod.mason_id,
      targetMod.author || targetMod.master_author
    );
  }, [targetModId, localSupporters, modList]);

  // Update maxReachedIndex when activeCardIndex changes
  useEffect(() => {
    setMaxReachedIndex(prev => Math.max(prev, activeCardIndex));
  }, [activeCardIndex]);

  // Load Draft Logic
  useEffect(() => {
    if (!isOpen) return;
    const draft = localStorage.getItem('support_draft');
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.activeCardIndex > 0 || parsed.title || parsed.description || parsed.targetModId || parsed.targetUserId || Object.keys(parsed.customFieldsData).length > 0) {
          setDraftData(parsed);
          setShowDraftPrompt(true);
        }
      } catch(e) {}
    }
  }, [isOpen]);

  // Save Draft Logic
  useEffect(() => {
    if (!isOpen || showDraftPrompt) return;
    const data = {
      activeTab,
      activeCardIndex,
      maxReachedIndex,
      title,
      description,
      targetModId,
      targetUserId,
      logs,
      customFieldsData,
      optedOutSources
    };
    localStorage.setItem('support_draft', JSON.stringify(data));
  }, [isOpen, showDraftPrompt, activeTab, activeCardIndex, maxReachedIndex, title, description, targetModId, targetUserId, logs, customFieldsData, optedOutSources]);

  const loadDraft = () => {
    if (draftData) {
      setActiveTab(draftData.activeTab || "BUG_MOD");
      setActiveCardIndex(draftData.activeCardIndex || 0);
      setMaxReachedIndex(draftData.maxReachedIndex || 0);
      setTitle(draftData.title || "");
      setDescription(draftData.description || "");
      setTargetModId(draftData.targetModId || "");
      setTargetUserId(draftData.targetUserId || "");
      setLogs(scrubLogUserData(draftData.logs || ""));
      setCustomFieldsData(draftData.customFieldsData || {});
      setOptedOutSources(draftData.optedOutSources || []);
    }
    setShowDraftPrompt(false);
  };

  const clearDraft = () => {
    localStorage.removeItem('support_draft');
    setDraftData(null);
    setShowDraftPrompt(false);
    setActiveCardIndex(0);
    setMaxReachedIndex(0);
    setTitle("");
    setDescription("");
    setTargetModId("");
    setTargetUserId("");
    setLogs("");
    setCustomFieldsData({});
  };

  // Auto-focus Logic
  useEffect(() => {
    if (!isOpen || showDraftPrompt) return;
    const timeout = setTimeout(() => {
      const activeCard = document.getElementById(`support-card-${activeCardIndex}`);
      if (activeCard) {
        const input = activeCard.querySelector('input:not([type="checkbox"]):not([type="radio"]), textarea') as HTMLElement;
        if (input) input.focus();
      }
    }, 100);
    return () => clearTimeout(timeout);
  }, [activeCardIndex, isOpen, showDraftPrompt]);

  const attachLog = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Logs', extensions: ['log', 'txt', 'json', 'md', 'xml'] }]
      });
      if (selected && !Array.isArray(selected)) {
        const text = await readTextFile(selected);
        const scrubbedText = scrubLogUserData(text);
        setLogs(prev => prev ? prev + '\n\n' + scrubbedText : scrubbedText);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const vaultExtremeMods = React.useMemo(() => {
    const extreme = modList.filter((ml: any) => ml.compliance_tier >= 3 && ml.compliance_tier <= 5).map((ml: any) => ({ ...ml, name: ml.displayName || ml.name, origName: ml.name, tier: ml.compliance_tier }));
    const grouped = extreme.reduce((acc: any[], curr: any) => {
      const existing = acc.find(m => m.name === curr.name);
      if (existing) {
        existing.count = (existing.count || 1) + 1;
        if (!existing.paths) existing.paths = [existing.path];
        if (curr.path) existing.paths.push(curr.path);
      } else {
        acc.push({ ...curr, count: 1, paths: curr.path ? [curr.path] : [] });
      }
      return acc;
    }, []);
    return grouped;
  }, [modList]);

  const activeAdultMods = React.useMemo(() => {
    if (!activeSet?.mods) return [];
    const adultModsInDB = modList.filter((ml: any) => ml.compliance_tier === 1 || ml.compliance_tier === 2);
    if (adultModsInDB.length === 0) return [];

    const activeModsSet = new Set<string>();
    const activeBaseNames = new Set<string>();
    const extRegex = getExtensionRegex(activeGameSchema);

    for (const rawMod of activeSet.mods) {
      const modName = typeof rawMod === 'string' ? rawMod : String(rawMod?.name || rawMod?.path || '');
      activeModsSet.add(modName);
      const base = modName.split(/[\\/]/).pop()?.replace(extRegex, '');
      if (base) activeBaseNames.add(base);
    }

    const matchedAdultMods: any[] = [];
    for (const am of adultModsInDB) {
      if (activeModsSet.has(am.name) || (am.displayName && activeModsSet.has(am.displayName))) {
        matchedAdultMods.push({ ...am, origName: am.name, name: am.displayName || am.name, tier: am.compliance_tier });
        continue;
      }
      const mBase = am.name?.split(/[\\/]/).pop()?.replace(extRegex, '');
      if (mBase && activeBaseNames.has(mBase)) {
        matchedAdultMods.push({ ...am, origName: am.name, name: am.displayName || am.name, tier: am.compliance_tier });
      }
    }
    return matchedAdultMods.filter((mod, index, self) => index === self.findIndex((m) => m.name === mod.name));
  }, [activeSet?.mods, modList, activeGameSchema]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchData = async () => {
      setLoadingCats(true);
      const [{ data: cats }, { data: sources }] = await Promise.all([
        supabase.from('sanctuary_support_categories').select('*').eq('is_active', true).order('category_name', { ascending: true }),
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
        if (!activeTab || !cats.find(c => c.category_code === activeTab)) {
          setActiveTab(cats[0].category_code);
        }
        setCustomFieldsData({});
      }
      if (sources) {
        setTelemetrySources(sources);
      }
      setLoadingCats(false);
    };
    fetchData();
  }, [isOpen]);

  const activeCategory = categories.find(c => c.category_code === activeTab) || categories[0];

  // When changing tabs, reset forms
  useEffect(() => {
    setTitle("");
    setDescription("");
    setTargetModId("");
    setTargetUserId("");
    setLogs("");
    setCustomFieldsData({});
    setError("");
    setPolicyViolations([]);
    setActiveCardIndex(0);
    setMaxReachedIndex(0);
  }, [activeTab]);

  const cards = React.useMemo(() => {
    if (!activeCategory) return [];

    const params: any[] = [];
    params.push({ id: 'classification', type: 'CLASSIFICATION', label: t("comp_type", "Classification") || "Classification", required: true });

    if (activeCategory.requires_target_mod) {
      params.push({ id: 'target_mod', type: 'TARGET_MOD', label: t("target_artifact", "Target {Mod}") || "Target Artifact", required: true });
    }
    if (activeCategory.requires_target_user) {
      params.push({ id: 'target_user', type: 'TARGET_USER', label: t("support_target_user_label", "Target User ID") || "Target User", required: true });
    }

    if (activeCategory.custom_fields?.length > 0) {
      activeCategory.custom_fields.forEach((f: any) => {
        params.push({ id: f.id, type: 'CUSTOM', label: f.label, required: f.required, field: f });
      });
    }

    if (String(activeCategory.show_description_box) !== "false") {
      params.push({ id: 'description', type: 'DESCRIPTION', label: t("support_desc", "Ticket Description") || "Description", required: true });
    }

    if (activeCategory.telemetry_config?.sources?.length > 0 || String(activeCategory.show_logs_box) !== "false") {
      params.push({ id: 'telemetry', type: 'TELEMETRY', label: t("dossier_attached_logs", "Attached Logs") || "Diagnostic Telemetry", required: false });
    }

    params.push({ id: 'review', type: 'REVIEW', label: t("support_ready_to_submit", "Ready to Submit"), required: false });

    return params;
  }, [activeCategory, t]);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(1);
      setCustomFieldsData({});
      setTitle("");
      setDescription("");
      setFiles([]);
      setError("");
      setActiveCardIndex(0);
    }
  }, [isOpen]);

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
        const m = storeState.modList.find(ml => ml.id === targetModId);
        if (m && m.compliance_tier >= 1 && m.compliance_tier <= 4) {
          hasViolations = true;
          violations.push(m.displayName || m.name);
        }
      }
      if (activeCategory?.requires_target_mod && activeSet && activeSet.mods) {
        activeSet.mods.forEach((modName: string) => {
          const exactMatch = storeState.modList.find((ml: any) => ml.name === modName || ml.displayName === modName);
          if (exactMatch && exactMatch.compliance_tier >= 1 && exactMatch.compliance_tier <= 4) {
            hasViolations = true;
            violations.push(exactMatch.displayName || exactMatch.name);
            return;
          }

          const fallbackMatch = storeState.modList.find((ml: any) => {
            const mBase = ml.name?.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
            const targetBase = modName.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
            return mBase && targetBase && mBase === targetBase;
          });
          if (fallbackMatch && fallbackMatch.compliance_tier >= 1 && fallbackMatch.compliance_tier <= 4) {
            hasViolations = true;
            violations.push(fallbackMatch.displayName || fallbackMatch.name);
          }
        });
      }

      if (hasViolations && activeCategory?.requires_target_mod) {
        invoke("write_os_log", { message: "Support ticket submitted with policy violations: " + violations.join(", "), level: "WARNING" }).catch(console.error);
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

              const diagnostics = `\nDisplay Resolution: ${window.innerWidth}x${window.innerHeight}\nUser Agent: ${navigator.userAgent}\nMods Path: ${scrubLogUserData(storeState.modsPath)}\nActive Blueprint: ${activeSet?.name || "None"}\nActive Mods: ${activeSet?.mods?.length || 0}\nPending Network Updates: ${totalUpdates}\nCaptured At: ${new Date().toLocaleString()}\nDiagnostic Bundle Version: 1.0.0\n`;
              finalLogs += `\n--- TELEMETRY: ${source.label} (OS) ---\n` + scrubLogUserData(sysInfo) + diagnostics + "\n";

              if (activeSet) {
                const bpPayload = JSON.stringify({ sanctuary_profile: true, ...activeSet }, null, 2);
                finalLogs += `\n--- TELEMETRY: Attached Blueprint ---\n${bpPayload}\n`;
              }

              const systemLogHistory = storeState.statusLog.map(entry => {
                return `[${new Date(entry.timestamp).toISOString()}] [${entry.type.toUpperCase()}] ${scrubLogUserData(entry.message)}`;
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
                  const adultModsInDB = store.modList.filter((ml: any) => ml.compliance_tier >= 1 && ml.compliance_tier <= 4);
                  const extRegex = getExtensionRegex(store.activeGameSchema);
                  const dirtyTraces: string[] = [];
                  const lowerText = text.toLowerCase();
                  for (const am of adultModsInDB) {
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
                const scrubbedTelemetry = scrubLogUserData(text.substring(0, 20000));
                finalLogs += `\n--- TELEMETRY: ${source.label} ---\n` + scrubbedTelemetry + "\n";
              }
            }
          } catch (e) {
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

      if (activeSet && activeTab.toLowerCase().includes('bug') && !finalLogs.includes('--- TELEMETRY: Attached Blueprint ---')) {
        const bpPayload = JSON.stringify({ sanctuary_profile: true, ...activeSet }, null, 2);
        finalLogs += `\n--- TELEMETRY: Attached Blueprint ---\n${bpPayload}\n`;
      }

      const scrubbedFinalLogs = finalLogs ? scrubLogUserData(finalLogs) : null;

      const { error } = await supabase.from('sanctuary_tickets').insert([{
        author_id: user.id,
        ticket_type: activeTab,
        title: title || (activeCategory?.category_name || "Support Ticket"),
        description: scrubLogUserData(description || "No description provided."),
        status: "open",
        metadata: {
          target_mod_id: activeCategory?.requires_target_mod ? (targetModId || null) : null,
          target_user_id: activeCategory?.requires_target_user ? (targetUserId || null) : null,
          logs: scrubbedFinalLogs,
          custom_fields: customFieldsData,
          ...(matchedSupporterPass ? {
            expedited_support: true,
            supporter_tier: matchedSupporterPass.tier_name,
            supporter_pass_hash: matchedSupporterPass.cryptographic_pass
          } : {}),
          ...(hasViolations && activeCategory?.requires_target_mod ? { restricted_violations: [...new Set(violations)] } : {})
        }
      }]);

      if (error) throw error;

      window.dispatchEvent(new CustomEvent("sanctuary-tickets-updated"));
      useStore.getState().pushStatus(t("ss_support_success", "Ticket sent successfully"), "success");

      // Reset form after submit
      setTitle("");
      setDescription("");
      setTargetModId("");
      setLogs("");
      onClose();

    } catch (e: any) {
      setError(e.message);
      useStore.getState().pushStatus(e.message, "error");
      invoke("write_os_log", { message: "Support ticket submission failed: " + e.message, level: "ERROR" }).catch(console.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  if (!session || isBanned) {
    return (
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("support_title", "Support Tickets")}
        subtitle={t("sidebar_support", "Support & Feedback")}
        icon={t("icon_support_agent", "support_agent")}
        iconColorClass="text-[var(--danger)]"
        widthClass="w-[90vw] md:w-[760px]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_lock", "lock")}
            overline={t("support_title", "Support Tickets")}
            title={t("access_denied", "Access Denied")}
            description={isBanned ? `Communications Ban: ${banReason}` : t("auto_guest_mode_active_45", "Please sign in to submit support tickets.")}
            variant="danger"
          />
        </div>
      </SidePanel>
    );
  }

  if (loadingCats) {
    return (
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("support_title", "Support Tickets")}
        subtitle={t("sidebar_support", "Support & Feedback")}
        icon={t("icon_support_agent", "support_agent")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[760px]"
      >
        <div className="flex-1 w-full h-full min-h-[500px]">
          <LoadingScreen title={t("support_loading_cats", "Connecting to Support Network")} subtitle={t("loading", "Establishing secure channel...")} icon="wifi_tethering" />
        </div>
      </SidePanel>
    );
  }

  const isFormDisabled = vaultExtremeMods.length > 0 || (activeCategory?.requires_target_mod && activeAdultMods.length > 0);
  const currentCard = cards[activeCardIndex];
  const isCurrentCardInvalid = Boolean(
    currentCard && (
      (currentCard.type === 'TARGET_MOD' && activeCategory?.requires_target_mod && !targetModId) ||
      (currentCard.type === 'TARGET_USER' && activeCategory?.requires_target_user && !targetUserId) ||
      (currentCard.type === 'CUSTOM' && currentCard.field?.required && (!customFieldsData[currentCard.id] || (Array.isArray(customFieldsData[currentCard.id]) && customFieldsData[currentCard.id].length === 0))) ||
      (currentCard.type === 'DESCRIPTION' && currentCard.required && !description.trim()) ||
      (currentCard.type === 'DESCRIPTION' && String(activeCategory?.show_title_box) !== "false" && !title.trim())
    )
  );

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("support_title", "Submit A Ticket")}
        subtitle={t("sidebar_support", "Support & Feedback")}
        icon={t("icon_support_agent", "support_agent")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[800px]"
        headerActions={
          !showDraftPrompt && currentCard ? (
            <PanelHeaderGroup>
              {currentCard.type === 'REVIEW' ? (
                <PanelHeaderButton
                  icon={isSubmitting || isScanning ? t("icon_sync", "sync") : t("icon_send", "send")}
                  tooltip={isSubmitting || isScanning ? t("scanning", "Scanning...") : t("support_submit", "Submit Ticket")}
                  variant="accent"
                  disabled={isSubmitting || isScanning || isFormDisabled}
                  onClick={submitTicket}
                />
              ) : (
                <PanelHeaderButton
                  icon={t("icon_done", "done")}
                  tooltip={t("confirm", "Confirm")}
                  variant="accent"
                  disabled={isCurrentCardInvalid || (isFormDisabled && currentCard.type !== 'CLASSIFICATION')}
                  onClick={() => setActiveCardIndex(Math.min(cards.length - 1, activeCardIndex + 1))}
                />
              )}
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        {showDraftPrompt ? (
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_restore_page", "restore_page")}
              overline={t("support_title", "Support Dossier")}
              title={t("draft_detected", "Draft Detected")}
              description={t("draft_detected_desc", "An unfinished support dossier was found in your local memory. Would you like to resume where you left off?")}
              variant="accent"
            >
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <ActionButton label={t("continue_draft", "Continue Draft")} icon="play_arrow" onClick={loadDraft} variant="accent" className="flex-1" />
                <ActionButton label={t("discard_draft", "Discard & Start Over")} icon="delete" onClick={clearDraft} variant="glass" className="flex-1" />
              </div>
            </SidePanelHeroCard>
          </div>
        ) : (
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-12">
          <SidePanelHeroCard
            icon={t("icon_support_agent", "support_agent")}
            overline={t("sidebar_support", "Support & Feedback")}
            title={activeCategory?.category_name || t("support_title", "Submit A Ticket")}
            description={activeCategory?.description || t("support_subtitle", "Complete each stage below to transmit a diagnostic support dossier.")}
            badge={`${activeCardIndex + 1} / ${cards.length}`}
            variant={isFormDisabled ? "danger" : "accent"}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatBox
                label={t("support_category", "Category")}
                value={activeCategory?.category_name || activeTab}
                icon={t("icon_category", "category")}
              />
              <StatBox
                label={t("status", "Step Progress")}
                value={`${activeCardIndex + 1} / ${cards.length}`}
                icon={t("icon_checklist", "checklist")}
              />
            </div>
          </SidePanelHeroCard>

          <div className="flex flex-col w-full gap-4">

            {error && (
              <div className="glass-panel border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-2xl flex flex-col relative shadow-md group">
                <div className="flex items-start gap-4 p-5 relative z-10">
                  <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--danger)]">
                    <span className="material-symbols-outlined !text-[20px]">{t("icon_warning", "warning")}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 pt-0.5 w-full pr-8">
                    <span className="text-sm font-black text-[var(--danger)] tracking-wide">{t("support_err_failed", "Submission Failed")}</span>
                    <span className="text-xs font-bold text-[color-mix(in_srgb,var(--danger)_80%,transparent)] leading-relaxed pr-4">{error}</span>
                  </div>
                  <button
                    onClick={() => { setError(""); setPolicyViolations([]); }}
                    className="absolute top-4 right-4 w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_42%,transparent)] text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_65%,transparent)] flex items-center justify-center transition-all shrink-0 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[15px]">{t("icon_close", "close")}</span>
                  </button>
                </div>
                {policyViolations.length > 0 && (
                  <div className="glass-surface p-4 border-t border-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex flex-col gap-3 max-h-32 overflow-y-auto custom-scrollbar relative z-10">
                    <span className="text-[9px] font-black tracking-widest text-[color-mix(in_srgb,var(--danger)_80%,transparent)] capitalize">{t("auto_restricted_artifacts_detected_34", "Restricted {mods}")}</span>
                    <div className="flex flex-wrap gap-2">
                      {policyViolations.map((mod, i) => (
                        <div key={i} className="flex items-center gap-2 text-[var(--danger)] text-[10px] font-mono bg-transparent py-1.5 px-3 rounded-md border border-[color-mix(in_srgb,var(--danger)_38%,transparent)]">
                          <span className="material-symbols-outlined !text-[12px] opacity-70">{t("auto_extension", "extension")}</span>
                          <span className="truncate">{mod.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').replace(/[-_]/g, ' ') || mod.replace(/[-_]/g, ' ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {vaultExtremeMods.length > 0 && (
              <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl flex flex-col relative shadow-md group shrink-0 mb-6">
                <div className="flex items-start gap-4 p-5 relative z-10">
                  <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--danger)]">
                    <span className="material-symbols-outlined !text-[20px]">{t("icon_block", "block")}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 pt-0.5 w-full pr-8">
                    <span className="text-sm font-black text-[var(--danger)] tracking-wide">{t("support_vault_lock_title", "{Vault} Lock Engaged")}</span>
                    <span className="text-xs font-bold text-[color-mix(in_srgb,var(--danger)_80%,transparent)] leading-relaxed pr-4">
                      {t("support_vault_lock_desc", "Your vault contains severe {mods} (Tier 3-5). Support submissions are completely disabled until these {mods} are removed from Your {Vault}.")}
                    </span>
                    <button onClick={() => setResolutionType('vault')} className="mt-3 self-start px-4 py-2 rounded-xl glass-surface text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_42%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_65%,transparent)] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer">
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_delete", "delete")}</span> {t("resolve_issues", "Resolve")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeCategory?.requires_target_mod && activeAdultMods.length > 0 && (
              <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl flex flex-col relative shadow-md group shrink-0 mb-6">
                <div className="flex items-start gap-4 p-5 relative z-10">
                  <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--warning)]">
                    <span className="material-symbols-outlined !text-[20px]">{t("icon_warning", "warning")}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 pt-0.5 w-full pr-8">
                    <span className="text-sm font-black text-[var(--warning)] tracking-wide">{t("support_adult_mods_title", "{Blueprint} Lock: Explicit {Mods} Detected")}</span>
                    <span className="text-xs font-bold text-[color-mix(in_srgb,var(--warning)_80%,transparent)] leading-relaxed pr-4">
                      {t("support_adult_mods_desc", "Your active {blueprint} contains adult/NSFW {mod}(s). If your ticket is related to one of these {mods}, please bypass Sanctuary OS and contact the original {Mason} directly. Otherwise, remove the {mods} and retest. You may submit a ticket once your logs are clean.")}
                    </span>
                    <button onClick={() => setResolutionType('blueprint')} className="mt-3 self-start px-4 py-2 rounded-xl glass-surface text-[var(--warning)] border border-[color-mix(in_srgb,var(--warning)_42%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_65%,transparent)] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer">
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_engineering", "engineering")}</span> {t("resolve_issues", "Resolve Anomalies")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className={`flex flex-col w-full transition-all duration-500`}>

              {/* Chat-Like Vertical Feed */}
              <div className="w-full pb-32 flex flex-col gap-4 mt-2">
                {cards.map((card, idx) => {
                  if (idx > maxReachedIndex) return null;

                  const isActive = idx === activeCardIndex;

                  if (!isActive) {
                    // Render Compact Summary Bubble for past steps
                    return (
                      <div key={idx} onClick={() => setActiveCardIndex(idx)} className="glass-panel border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] rounded-2xl px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] transition-all shrink-0 w-full group shadow-md mt-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent)] opacity-80">{t("completed_step", "Step Completed") || "Completed Step"}</span>
                          <span className="text-sm font-black text-[var(--text)] tracking-widest">{card.label}</span>
                        </div>
                        <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)] opacity-0 group-hover:opacity-100 transition-opacity glass-surface p-2 rounded-lg">{t("icon_edit", "edit")}</span>
                      </div>
                    );
                  }


                  const isBlockDisabled = isFormDisabled && card.type !== 'CLASSIFICATION';

                  const handleAdvance = (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter') {
                      if (e.shiftKey) return; // Allow Shift+Enter for textareas
                      e.preventDefault();

                      const isInvalid = (card.type === 'TARGET_MOD' && activeCategory?.requires_target_mod && !targetModId) ||
                        (card.type === 'TARGET_USER' && activeCategory?.requires_target_user && !targetUserId) ||
                        (card.type === 'CUSTOM' && card.field?.required && (!customFieldsData[card.id] || (Array.isArray(customFieldsData[card.id]) && customFieldsData[card.id].length === 0))) ||
                        (card.type === 'DESCRIPTION' && card.required && !description.trim()) ||
                        (card.type === 'DESCRIPTION' && String(activeCategory?.show_title_box) !== "false" && !title.trim());

                      if (!isInvalid) {
                        setActiveCardIndex(Math.min(cards.length - 1, idx + 1));
                      }
                    }
                  };

                  // Render Active Input Block
                  return (
                    <div id={`support-card-${idx}`} key={idx} onClick={() => { if (!isActive && idx <= maxReachedIndex) setActiveCardIndex(idx); }} className={`w-full glass-panel border-2 ${isActive ? "border-[var(--accent)] shadow-[0_10px_40px_-10px_rgba(var(--accent-rgb),0.3)] scale-100" : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-md scale-[0.98] opacity-70 hover:opacity-100 cursor-pointer"} rounded-3xl p-8 flex flex-col shrink-0 relative group mt-2 transition-all duration-500 ${isBlockDisabled ? "opacity-30 pointer-events-none grayscale select-none" : ""}`}>

                      {/* Active Block Header */}
                      <div className="flex flex-col mb-8">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] drop-shadow-sm mb-2 flex items-center justify-between gap-2 w-full">
                          <span>{isActive ? (t("active_protocol", "Current Question") || "Active Step") : (t("completed_step", "Step Completed") || "Completed Step")}</span>
                          <span className="opacity-60">
                            {idx + 1} / {cards.length}
                          </span>
                        </span>
                        <h2 className="text-2xl font-black text-[var(--text)] leading-snug">
                          {card.label} {card.required && <span className="text-[var(--danger)]">*</span>}
                        </h2>
                      </div>

                      {/* Card Body */}
                      <div className="flex-1 flex flex-col justify-center">
                        {card.type === 'CLASSIFICATION' && (
                          <CustomDropdown disableTint={true}
                            value={activeTab}
                            options={categories.map(c => ({ id: c.category_code, label: c.category_name }))}
                            onChange={(val: string[]) => setActiveTab(val[0])}
                            allowMultiSelect={false}
                          />
                        )}

                        {card.type === 'TARGET_MOD' && (
                          <div className="flex flex-col gap-4 relative z-[60]">
                            <ModSearchDropdown
                              modList={modList}
                              placeholder={t("support_placeholder_mod_uuid", "{Mod} UUID...") || "Select Mod..."}
                              selectedItem={modList.find((m: any) => m.id === targetModId || m.hash === targetModId) || (targetModId ? { displayName: targetModId } : null)}
                              onSelect={(m: any) => setTargetModId(m.id || m.hash)}
                              onClear={() => setTargetModId("")}
                            />
                            {matchedSupporterPass && (
                              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-start gap-3.5 animate-in fade-in duration-300">
                                <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--success)] shrink-0">
                                  <span className="material-symbols-outlined !text-[20px]">{t("icon_bolt", "bolt")}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-[var(--success)] flex items-center gap-1.5">
                                    {t("supporter_ticket_expedited_banner", "Verified {Mason} Supporter — Expedited Support Routing Active")}
                                  </span>
                                  <p className="text-[11px] font-semibold text-[var(--subtext)] leading-relaxed">
                                    {t("supporter_ticket_expedited_desc", "Your local SQLite Supporter Pass was verified for this {mason}. This ticket will be flagged for Priority Queue routing without exposing your global subscription list.")}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {card.type === 'TARGET_USER' && (
                          <UniversalInput
                            value={targetUserId}
                            onChange={setTargetUserId}
                            onKeyDown={handleAdvance}
                            placeholder={t("support_placeholder_user_uuid", "User UUID...") || "Enter Target UUID..."}
                            className="font-mono text-xl font-bold p-6"
                          />
                        )}

                        {card.type === 'CUSTOM' && (
                          <div className="flex flex-col w-full">
                            {card.field?.type === "TEXT INPUT" && (
                              <UniversalInput
                                value={customFieldsData[card.id] || ""}
                                onChange={(val: string) => setCustomFieldsData(prev => ({ ...prev, [card.id]: val }))}
                                onKeyDown={handleAdvance}
                                placeholder="..."
                                className="p-6 text-lg"
                              />
                            )}
                            {card.field?.type === "TEXTAREA" && (
                              <textarea
                                value={customFieldsData[card.id] || ""}
                                onChange={e => {
                                  setCustomFieldsData(prev => ({ ...prev, [card.id]: e.target.value }));
                                }}
                                onKeyDown={handleAdvance}
                                placeholder="..."
                                className="w-full glass-panel rounded-2xl px-8 py-6 text-[var(--text)] text-lg focus:outline-none focus:border-[var(--accent)] transition-all resize-y custom-scrollbar border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner min-h-[200px]"
                              />
                            )}
                            {card.field?.type === "DROPDOWN" && (
                              <div className="relative z-[50]">
                                <CustomDropdown disableTint={true}
                                  value={customFieldsData[card.id] || (card.field.allow_multi_select ? [] : "")}
                                  options={card.field.options?.map((opt: string) => ({ id: opt, label: opt })) || []}
                                  onChange={(val: any) => setCustomFieldsData(prev => ({ ...prev, [card.id]: card.field.allow_multi_select ? val : val[0] }))}
                                  allowMultiSelect={card.field.allow_multi_select}
                                />
                              </div>
                            )}
                            {card.field?.type === "CHECKBOX" && (
                              (!card.field.options || card.field.options.length === 0) ? (
                                <UniversalToggle
                                  checked={customFieldsData[card.id] === "true"}
                                  onChange={(val: boolean) => setCustomFieldsData(prev => ({ ...prev, [card.id]: val ? "true" : "" }))}
                                  label={t("label_yes", "Yes") || "Yes"}
                                />
                              ) : (
                                <div className="flex flex-col gap-2.5">
                                  {card.field.options.map((opt: string) => {
                                    const isChecked = card.field.allow_multi_select ? (customFieldsData[card.id] || []).includes(opt) : customFieldsData[card.id] === opt;
                                    return (
                                      <SidePanelPillToggle
                                        key={opt}
                                        checked={isChecked}
                                        label={opt}
                                        onChange={() => {
                                          setCustomFieldsData(prev => {
                                            if (card.field.allow_multi_select) {
                                              const arr = (Array.isArray(prev[card.id]) ? prev[card.id] : []) as string[];
                                              if (arr.includes(opt)) return { ...prev, [card.id]: arr.filter((x: string) => x !== opt) };
                                              else return { ...prev, [card.id]: [...arr, opt] };
                                            } else {
                                              return { ...prev, [card.id]: isChecked ? "" : opt };
                                            }
                                          });
                                        }}
                                      />
                                    );
                                  })}
                                </div>
                              )
                            )}
                          </div>
                        )}

                        {card.type === 'DESCRIPTION' && (
                          <div className="flex flex-col gap-6 w-full">
                            {(String(activeCategory?.show_title_box) !== "false") && (
                              <div className="flex flex-col gap-2">
                                <label className="text-xs font-black uppercase tracking-widest text-[var(--subtext)] ml-2">{t("support_dossier_title_placeholder", "Enter Ticket Title...") || "Dossier Title"}</label>
                                <input
                                  value={title}
                                  onChange={e => setTitle(e.target.value)}
                                  onKeyDown={handleAdvance}
                                  placeholder={t("support_dossier_title_placeholder", "Enter Ticket Title...") || "Enter Dossier Title..."}
                                  className="w-full glass-panel rounded-2xl px-6 py-4 text-[var(--text)] text-xl font-bold focus:outline-none focus:border-[var(--accent)] transition-all border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner"
                                />
                              </div>
                            )}
                            <div className="flex flex-col gap-2">
                              <label className="text-xs font-black uppercase tracking-widest text-[var(--subtext)] ml-2">{t("support_step_desc", "Incident Description") || "Incident Description"}</label>
                              <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                onKeyDown={handleAdvance}
                                placeholder={t("support_dossier_desc_placeholder", "Describe the issue in detail...") || "Describe the issue..."}
                                className="w-full glass-panel rounded-2xl px-6 py-6 text-[var(--text)] text-lg focus:outline-none focus:border-[var(--accent)] transition-all resize-none custom-scrollbar border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[inset_0_2px_15px_rgba(0,0,0,0.2)] placeholder:opacity-30 leading-relaxed min-h-[300px]"
                              />
                            </div>
                          </div>
                        )}

                        {card.type === 'TELEMETRY' && (
                          <div className="flex flex-col gap-8">
                            {activeCategory?.telemetry_config?.sources && activeCategory.telemetry_config.sources.length > 0 && (
                              <div className="flex flex-col gap-2">
                                {activeCategory.telemetry_config.sources.map((sourceId: string) => {
                                  const source = telemetrySources.find(s => s.id === sourceId);
                                  if (!source) return null;
                                  const isOptedOut = optedOutSources.includes(sourceId);
                                  return (
                                    <div key={sourceId} onClick={() => {
                                      if (!isOptedOut) setOptedOutSources(prev => [...prev, sourceId]);
                                      else setOptedOutSources(prev => prev.filter(id => id !== sourceId));
                                    }} className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all border shadow-sm ${!isOptedOut ? 'glass-panel border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)]' : 'glass-panel border-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-60 hover:opacity-100'}`}>
                                      <div className="flex flex-col">
                                        <span className={`text-[11px] font-black tracking-widest uppercase flex items-center gap-3 ${!isOptedOut ? 'text-[var(--text)]' : 'text-[var(--subtext)]'}`}>
                                          <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">{source.type === 'OS' ? t("icon_memory", "memory") : t("icon_folder", "folder")}</span>
                                          {source.label}
                                        </span>
                                        <span className="text-[9px] font-bold text-[var(--subtext)] opacity-70 mt-0.5">{!isOptedOut ? t("data_included", "Data Included") : t("excluded_from_report", "Excluded from report")}</span>
                                      </div>
                                      <div className={`sa-glass-toggle ${!isOptedOut ? 'is-on' : ''}`}>
                                        <div className="sa-glass-toggle-thumb" />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {String(activeCategory?.show_logs_box) !== "false" && (
                              <div className="w-full glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-1 min-h-[200px] flex flex-col relative group">
                                <div className="absolute top-0 left-0 right-0 h-14 flex items-center justify-end px-4 z-10 pointer-events-none">
                                  <button onClick={(e) => { e.stopPropagation(); attachLog(); }} className="pointer-events-auto text-[10px] px-4 py-2 rounded-xl glass-surface text-[var(--text)] hover:text-[var(--accent)] transition-all font-black uppercase flex items-center gap-2 shadow-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] group/btn">
                                    <span className="material-symbols-outlined !text-[14px] group-hover/btn:-translate-y-0.5 transition-transform">{t("icon_upload", "upload")}</span> {t("attach_logs", "Attach Logs")}
                                  </button>
                                </div>
                                {logs ? (
                                  <textarea
                                    value={logs}
                                    onChange={(e) => setLogs(e.target.value)}
                                    className="w-full glass-surface text-[var(--text)] text-[11px] font-mono focus:outline-none resize-none custom-scrollbar h-[200px] p-6 pt-16 relative z-0 rounded-[14px]"
                                    placeholder={t("support_placeholder_logs", "No logs attached.")}
                                  />
                                ) : (
                                  <div onClick={attachLog} className="flex-1 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] m-3 rounded-xl cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] transition-all text-[var(--subtext)] hover:text-[var(--accent)] min-h-[160px]">
                                    <span className="material-symbols-outlined !text-4xl opacity-50 drop-shadow-sm">{t("icon_cloud_upload", "cloud_upload")}</span>
                                    <div className="flex flex-col items-center">
                                      <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] drop-shadow-md">{t("attach_logs", "Attach Logs")}</span>
                                      <span className="text-[9px] font-bold opacity-70 mt-1">{t("click_to_browse", "Click to Browse")}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {card.type === 'REVIEW' && (
                          <div className="flex flex-col items-center justify-center text-center gap-6 py-12">
                            <div className="w-24 h-24 rounded-full bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center shadow-[0_0_40px_rgba(var(--accent-rgb),0.3)] mb-4">
                              <span className="material-symbols-outlined !text-[48px] text-[var(--accent)] drop-shadow-md">{t("icon_task_alt", "task_alt")}</span>
                            </div>
                            <h3 className="text-2xl font-black tracking-widest uppercase text-[var(--text)] drop-shadow-md">{t("support_ready_to_submit", "Ready to Submit") || "Ready to Submit"}</h3>
                            <p className="text-[var(--subtext)] text-sm max-w-sm">{t("support_ready_desc", "Ensure all provided details are correct. Processing may take up to 48 hours.") || "Ensure all provided details are correct. Processing may take up to 48 hours."}</p>

                            <div className="mt-8">
                              <ActionButton
                                icon={isSubmitting || isScanning ? t("icon_sync", "sync") : t("icon_send", "send")}
                                label={isSubmitting || isScanning ? t("scanning", "Scanning...") : t("support_submit", "Submit Ticket")}
                                variant="accent"
                                disabled={isSubmitting || isScanning}
                                onClick={submitTicket}
                                className={`scale-125 origin-center ${isSubmitting || isScanning ? "animate-pulse" : ""}`}
                              />
                            </div>
                          </div>
                        )}

                      </div>

                      {/* Active Block Action Footer */}
                      {card.type !== 'REVIEW' && isActive && (
                        <div className="flex items-center justify-end mt-12 pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                          <ActionButton
                            label={t("confirm", "Confirm") || "Confirm"}
                            icon="done"
                            disabled={
                              (card.type === 'TARGET_MOD' && activeCategory?.requires_target_mod && !targetModId) ||
                              (card.type === 'TARGET_USER' && activeCategory?.requires_target_user && !targetUserId) ||
                              (card.type === 'CUSTOM' && card.field?.required && (!customFieldsData[card.id] || (Array.isArray(customFieldsData[card.id]) && customFieldsData[card.id].length === 0))) ||
                              (card.type === 'DESCRIPTION' && card.required && !description.trim()) ||
                              (card.type === 'DESCRIPTION' && String(activeCategory?.show_title_box) !== "false" && !title.trim())
                            }
                            onClick={() => setActiveCardIndex(Math.min(cards.length - 1, idx + 1))}
                            variant="accent"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

        </div>
        )}

      </SidePanel>

      <ArtifactResolutionSidePanel
        isOpen={!!resolutionType}
        onClose={() => setResolutionType(null)}
        type={resolutionType}
        offendingMods={resolutionType === 'vault' ? vaultExtremeMods : resolutionType === 'blueprint' ? activeAdultMods : []}
      />
    </>
  );
}
