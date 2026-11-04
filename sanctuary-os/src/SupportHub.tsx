import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { CustomDropdown, ModSearchDropdown, ActionButton, PanelHeaderGroup, PanelHeaderButton, SidePanelPillToggle, getExtensionRegex, LoadingScreen, SidePanel, VAULT_CHIP_CLASS } from "./shared";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import ArtifactResolutionSidePanel from "./side-panels/ArtifactResolutionSidePanel";
import TicketLogViewer from "./side-panels/TicketLogViewer";
import { UniversalInput, UniversalTextArea, UniversalToggle, SidePanelHeroCard, StatBox } from "./components/universal/UniversalLayout";
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
  const [previewTelemetryLogs, setPreviewTelemetryLogs] = useState<string>("");
  const [isEditingRawTelemetry, setIsEditingRawTelemetry] = useState(false);

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
        const fileName = selected.split(/[\\/]/).pop() || "log.txt";
        const text = await readTextFile(selected);
        const scrubbedText = scrubLogUserData(text);
        const block = `--- TELEMETRY: Manual Attachment (${fileName}) ---\n${scrubbedText}`;
        setLogs(prev => prev ? `${prev}\n\n${block}` : block);
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
      setIsEditingRawTelemetry(false);
    }
  }, [isOpen]);

  const effectiveTelemetrySources = React.useMemo(() => {
    const configuredIds: string[] = activeCategory?.telemetry_config?.sources || [];
    const matched = telemetrySources.filter((s) => configuredIds.includes(s.id));
    const hasOs = matched.some((s) => s.type === "OS");
    if (!hasOs && String(activeCategory?.show_logs_box) !== "false") {
      return [
        {
          id: "sys_os_default",
          label: "Sanctuary OS Logs",
          type: "OS",
        },
        ...matched,
      ];
    }
    return matched;
  }, [activeCategory, telemetrySources]);

  const buildLiveTelemetryBundle = useCallback(async () => {
    if (!isOpen || !activeCategory) return "";
    let bundle = "";
    if (logs && logs.trim()) {
      const trimmed = scrubLogUserData(logs.trim());
      if (trimmed.includes("--- TELEMETRY:") || trimmed.includes("--- Log Attachment")) {
        bundle += `${trimmed}\n`;
      } else {
        bundle += `--- TELEMETRY: Manual Attachment ---\n${trimmed}\n`;
      }
    }

    const activeSources = effectiveTelemetrySources.filter(
      (s) => !optedOutSources.includes(s.id)
    );
    const storeState = useStore.getState();
    const modsPath = storeState.modsPath;
    const currentSet = storeState.playSets?.[storeState.activePlaySetIndex];

    for (const source of activeSources) {
      try {
        if (source.type === "OS") {
          let sysInfo = "";
          try {
            sysInfo = await invoke<string>("get_system_info");
          } catch {
            sysInfo = `OS: ${typeof navigator !== "undefined" ? navigator.platform || "Web" : "Desktop"}\nUser Agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "Sanctuary OS"}`;
          }
          const netUpdates = storeState.networkUpdates;
          const totalUpdates =
            (netUpdates?.broken?.length || 0) +
            (netUpdates?.obsolete?.length || 0) +
            (netUpdates?.updated?.length || 0);
          const diagnostics = `\nDisplay Resolution: ${window.innerWidth}x${window.innerHeight}\nMods Path: ${scrubLogUserData(storeState.modsPath || "N/A")}\nActive Blueprint: ${currentSet?.name || "None"}\nActive Mods: ${currentSet?.mods?.length || 0}\nPending Network Updates: ${totalUpdates}\nCaptured At: ${new Date().toLocaleString()}\nDiagnostic Bundle Version: 1.0.0\n`;
          const osLabel = source.label.endsWith("(OS)")
            ? source.label
            : `${source.label} (OS)`;
          bundle += `\n--- TELEMETRY: ${osLabel} ---\n${scrubLogUserData(sysInfo)}${diagnostics}\n`;

          if (currentSet) {
            const bpPayload = scrubLogUserData(
              JSON.stringify({ sanctuary_profile: true, ...currentSet }, null, 2)
            );
            bundle += `\n--- TELEMETRY: Attached Blueprint ---\n${bpPayload}\n`;
          }

          const systemLogHistory = (storeState.statusLog || [])
            .map((entry: any) => {
              return `[${new Date(entry.timestamp).toISOString()}] [${String(entry.type || "info").toUpperCase()}] ${scrubLogUserData(entry.message)}`;
            })
            .join("\n");
          bundle += `\n--- TELEMETRY: System Log History ---\n${systemLogHistory || "No system logs available."}\n`;
        } else if (modsPath && source.search_path && source.file_pattern) {
          const docDirMatch = modsPath.match(/(.*)[\\/]+(?:mods|data|_mods)[\\/]*$/i);
          const docDir = docDirMatch
            ? docDirMatch[1]
            : modsPath.replace(/[\\/]+[^\\/]+[\\/]*$/, "") || modsPath;
          const searchPath = source.search_path
            .replace("%MODS_DIR%", modsPath)
            .replace("%DOC_DIR%", docDir);
          let fullPath = searchPath;
          if (!fullPath.endsWith("\\") && !fullPath.endsWith("/")) fullPath += "/";
          fullPath += source.file_pattern;
          const text = await readTextFile(fullPath);
          if (text) {
            bundle += `\n--- TELEMETRY: ${source.label} ---\n${scrubLogUserData(text.substring(0, 20000))}\n`;
          }
        }
      } catch {
        // Ignore unavailable optional files during preview
      }
    }

    return scrubLogUserData(bundle.trim());
  }, [isOpen, activeCategory, effectiveTelemetrySources, optedOutSources, logs]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    buildLiveTelemetryBundle().then((res) => {
      if (!cancelled) setPreviewTelemetryLogs(res);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, buildLiveTelemetryBundle]);

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

      let finalLogs = "";
      if (logs && logs.trim()) {
        const trimmedLogs = scrubLogUserData(logs.trim());
        finalLogs =
          trimmedLogs.includes("--- TELEMETRY:") ||
          trimmedLogs.includes("--- Log Attachment")
            ? `${trimmedLogs}\n`
            : `--- TELEMETRY: Manual Attachment ---\n${trimmedLogs}\n`;
      }

      if (effectiveTelemetrySources.length > 0) {
        const modsPath = useStore.getState().modsPath;
        const activeSources = effectiveTelemetrySources.filter(
          (s) => !optedOutSources.includes(s.id)
        );

        for (const source of activeSources) {
          try {
            if (source.type === 'OS') {
              let sysInfo = "";
              try {
                sysInfo = await invoke<string>("get_system_info");
              } catch {
                sysInfo = `OS: ${typeof navigator !== "undefined" ? navigator.platform || "Web" : "Desktop"}\nUser Agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "Sanctuary OS"}`;
              }
              const storeState = useStore.getState();
              const activeSet = storeState.playSets[storeState.activePlaySetIndex];

              const netUpdates = storeState.networkUpdates;
              const totalUpdates = (netUpdates?.broken?.length || 0) + (netUpdates?.obsolete?.length || 0) + (netUpdates?.updated?.length || 0);

              const diagnostics = `\nDisplay Resolution: ${window.innerWidth}x${window.innerHeight}\nMods Path: ${scrubLogUserData(storeState.modsPath)}\nActive Blueprint: ${activeSet?.name || "None"}\nActive Mods: ${activeSet?.mods?.length || 0}\nPending Network Updates: ${totalUpdates}\nCaptured At: ${new Date().toLocaleString()}\nDiagnostic Bundle Version: 1.0.0\n`;
              const osLabel = source.label.endsWith("(OS)")
                ? source.label
                : `${source.label} (OS)`;
              finalLogs += `\n--- TELEMETRY: ${osLabel} ---\n` + scrubLogUserData(sysInfo) + diagnostics + "\n";

              if (activeSet) {
                const bpPayload = scrubLogUserData(JSON.stringify({ sanctuary_profile: true, ...activeSet }, null, 2));
                finalLogs += `\n--- TELEMETRY: Attached Blueprint ---\n${bpPayload}\n`;
              }

              const systemLogHistory = storeState.statusLog.map(entry => {
                return `[${new Date(entry.timestamp).toISOString()}] [${entry.type.toUpperCase()}] ${scrubLogUserData(entry.message)}`;
              }).join('\n');
              finalLogs += `\n--- TELEMETRY: System Log History ---\n${systemLogHistory || "No system logs available."}\n`;
            } else {
              const docDirMatch = modsPath.match(/(.*)[\\/]+(?:mods|data|_mods)[\\/]*$/i);
              const docDir = docDirMatch
                ? docDirMatch[1]
                : modsPath.replace(/[\\/]+[^\\/]+[\\/]*$/, "") || modsPath;
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
      const scrubbedCustomFields: Record<string, string> = {};
      for (const [k, v] of Object.entries(customFieldsData || {})) {
        scrubbedCustomFields[k] = scrubLogUserData(String(v || ""));
      }

      const { error } = await supabase.from('sanctuary_tickets').insert([{
        author_id: user.id,
        ticket_type: activeTab,
        title: scrubLogUserData(title) || (activeCategory?.category_name || "Support Ticket"),
        description: scrubLogUserData(description || "No description provided."),
        status: "open",
        metadata: {
          target_mod_id: activeCategory?.requires_target_mod ? (targetModId || null) : null,
          target_user_id: activeCategory?.requires_target_user ? (targetUserId || null) : null,
          logs: scrubbedFinalLogs,
          custom_fields: scrubbedCustomFields,
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

  const selectedModItem = modList.find(
    (m: any) => m.id === targetModId || m.hash === targetModId
  );

  const getStepSummary = (card: any): string => {
    if (card.type === "CLASSIFICATION") {
      return activeCategory?.category_name || activeTab;
    }
    if (card.type === "TARGET_MOD") {
      return selectedModItem?.displayName || selectedModItem?.name || targetModId || t("none", "None");
    }
    if (card.type === "TARGET_USER") {
      return targetUserId || t("none", "None");
    }
    if (card.type === "CUSTOM") {
      const val = customFieldsData[card.id];
      if (Array.isArray(val)) return val.join(", ") || t("none", "None");
      if (val === "true") return t("label_yes", "Yes");
      return String(val || t("none", "None"));
    }
    if (card.type === "DESCRIPTION") {
      if (title.trim() && description.trim()) {
        return `${title.trim()} • ${description.trim()}`;
      }
      return title.trim() || description.trim() || t("none", "None");
    }
    if (card.type === "TELEMETRY") {
      const activeCount = effectiveTelemetrySources.filter(
        (s) => !optedOutSources.includes(s.id)
      ).length;
      return `${activeCount} ${t("dossier_attached_logs", "Attached Telemetry")}`;
    }
    return "";
  };

  const getStepIcon = (card: any): string => {
    if (card.type === "CLASSIFICATION") return t("icon_category", "category");
    if (card.type === "TARGET_MOD") return t("icon_extension", "extension");
    if (card.type === "TARGET_USER") return t("icon_person", "person");
    if (card.type === "DESCRIPTION") return t("icon_description", "description");
    if (card.type === "TELEMETRY") return t("icon_terminal", "terminal");
    if (card.type === "REVIEW") return t("icon_task_alt", "task_alt");
    return t("icon_checklist", "checklist");
  };

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
              <PanelHeaderButton
                icon={t("icon_restart_alt", "restart_alt")}
                tooltip={t("reset", "Reset")}
                onClick={clearDraft}
              />
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
              <div className="flex flex-wrap items-center justify-end gap-2 w-full">
                <ActionButton label={t("discard_draft", "Discard & Start Over")} icon={t("icon_delete", "delete")} onClick={clearDraft} variant="glass" />
                <ActionButton label={t("continue_draft", "Continue Draft")} icon={t("icon_play_arrow", "play_arrow")} onClick={loadDraft} variant="accent" />
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
            badgeIcon={t("icon_checklist", "checklist")}
            variant={isFormDisabled ? "danger" : "accent"}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatBox
                label={t("support_category", "Category")}
                value={activeCategory?.category_name || activeTab}
                icon={t("icon_category", "category")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("status", "Step Progress")}
                value={`${activeCardIndex + 1} / ${cards.length}`}
                icon={t("icon_checklist", "checklist")}
                iconColorClass="text-[var(--success)]"
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
              <SidePanelHeroCard
                icon={t("icon_block", "block")}
                overline={t("security", "Compliance Lockout")}
                title={t("support_vault_lock_title", "{Vault} Lock Engaged")}
                description={t("support_vault_lock_desc", "Your vault contains severe {mods} (Tier 3-5). Support submissions are completely disabled until these {mods} are removed from Your {Vault}.")}
                badge={`${vaultExtremeMods.length}`}
                badgeIcon={t("icon_warning", "warning")}
                variant="danger"
              >
                <div className="flex flex-wrap items-center justify-end gap-2 w-full">
                  <ActionButton
                    variant="danger"
                    icon={t("icon_delete", "delete")}
                    label={t("resolve_issues", "Resolve Anomalies")}
                    onClick={() => setResolutionType('vault')}
                  />
                </div>
              </SidePanelHeroCard>
            )}

            {activeCategory?.requires_target_mod && activeAdultMods.length > 0 && (
              <SidePanelHeroCard
                icon={t("icon_warning", "warning")}
                overline={t("tab_blueprints", "{Blueprint} Compliance")}
                title={t("support_adult_mods_title", "{Blueprint} Lock: Explicit {Mods} Detected")}
                description={t("support_adult_mods_desc", "Your active {blueprint} contains adult/NSFW {mod}(s). If your ticket is related to one of these {mods}, please bypass Sanctuary OS and contact the original {Mason} directly. Otherwise, remove the {mods} and retest. You may submit a ticket once your logs are clean.")}
                badge={`${activeAdultMods.length}`}
                badgeIcon={t("icon_extension", "extension")}
                variant="warning"
              >
                <div className="flex flex-wrap items-center justify-end gap-2 w-full">
                  <ActionButton
                    variant="glass"
                    icon={t("icon_engineering", "engineering")}
                    label={t("resolve_issues", "Resolve Anomalies")}
                    onClick={() => setResolutionType('blueprint')}
                  />
                </div>
              </SidePanelHeroCard>
            )}

            <div className="flex flex-col w-full transition-all duration-300">
              <div className="w-full pb-24 flex flex-col gap-3.5">
                {cards.map((card, idx) => {
                  if (idx > maxReachedIndex) return null;

                  const isActive = idx === activeCardIndex;

                  if (!isActive) {
                    const summaryText = getStepSummary(card);
                    return (
                      <div
                        key={idx}
                        onClick={() => setActiveCardIndex(idx)}
                        className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between gap-3 cursor-pointer group hover:border-[var(--accent)] transition-all shrink-0 w-full"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--success)]">
                            <span className="material-symbols-outlined !text-[18px]">
                              {t("icon_check_circle", "check_circle")}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                              <span>{t("completed_step", "Step Completed")}</span>
                              <span className="opacity-60">• {idx + 1} / {cards.length}</span>
                            </span>
                            <h4 className="text-sm font-black text-[var(--text)] truncate">
                              {card.label}
                            </h4>
                            {summaryText && (
                              <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                                {summaryText}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] group-hover:border-[var(--accent)] flex items-center justify-center shrink-0 text-[var(--subtext)] group-hover:text-[var(--accent)] transition-all">
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_edit", "edit")}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  const isBlockDisabled = isFormDisabled && card.type !== 'CLASSIFICATION';

                  const handleAdvance = (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter') {
                      if (e.shiftKey) return;
                      e.preventDefault();

                      const isInvalid =
                        (card.type === 'TARGET_MOD' && activeCategory?.requires_target_mod && !targetModId) ||
                        (card.type === 'TARGET_USER' && activeCategory?.requires_target_user && !targetUserId) ||
                        (card.type === 'CUSTOM' && card.field?.required && (!customFieldsData[card.id] || (Array.isArray(customFieldsData[card.id]) && customFieldsData[card.id].length === 0))) ||
                        (card.type === 'DESCRIPTION' && card.required && !description.trim()) ||
                        (card.type === 'DESCRIPTION' && String(activeCategory?.show_title_box) !== "false" && !title.trim());

                      if (!isInvalid) {
                        setActiveCardIndex(Math.min(cards.length - 1, idx + 1));
                      }
                    }
                  };

                  return (
                    <div
                      id={`support-card-${idx}`}
                      key={idx}
                      className={`w-full glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-7 flex flex-col gap-5 shrink-0 relative animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.45)] ${
                        isBlockDisabled ? "opacity-35 pointer-events-none grayscale select-none" : ""
                      }`}
                    >
                      {/* Active Step Header */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max flex items-center gap-1.5">
                            <span className="material-symbols-outlined !text-[13px]">
                              {getStepIcon(card)}
                            </span>
                            <span>{`${t("step", "STEP")} ${idx + 1} / ${cards.length}`}</span>
                          </span>
                          {idx < maxReachedIndex && (
                            <button
                              type="button"
                              onClick={() => setActiveCardIndex(maxReachedIndex)}
                              className="text-[10px] font-black text-[var(--subtext)] hover:text-[var(--text)] uppercase tracking-widest flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <span>{t("jump_to_latest", "Jump to Latest")}</span>
                              <span className="material-symbols-outlined !text-xs">
                                {t("icon_fast_forward", "fast_forward")}
                              </span>
                            </button>
                          )}
                        </div>
                        <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-0.5">
                          {card.label} {card.required && <span className="text-[var(--danger)]">*</span>}
                        </h3>
                      </div>

                      {/* Card Body */}
                      <div className="flex flex-col gap-4">
                        {card.type === 'CLASSIFICATION' && (
                          <div className="flex flex-col gap-4">
                            <div className="relative z-[70]">
                              <CustomDropdown
                                disableTint={true}
                                value={activeTab}
                                options={categories.map(c => ({ id: c.category_code, label: c.category_name }))}
                                onChange={(val: string[]) => setActiveTab(val[0])}
                                allowMultiSelect={false}
                              />
                            </div>

                            {activeCategory && (
                              <div className="glass-surface p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-3">
                                <div className="flex items-start gap-3">
                                  <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                                    <span className="material-symbols-outlined !text-[18px]">
                                      {t("icon_info", "info")}
                                    </span>
                                  </div>
                                  <div className="flex flex-col gap-1 min-w-0">
                                    <span className="text-xs font-black text-[var(--text)]">
                                      {activeCategory.category_name}
                                    </span>
                                    <p className="text-xs text-[var(--subtext)] leading-relaxed">
                                      {activeCategory.description || t("support_subtitle", "Complete each stage below to transmit a diagnostic support dossier.")}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {activeCategory.requires_target_mod && (
                                    <span className={VAULT_CHIP_CLASS}>
                                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                        {t("icon_extension", "extension")}
                                      </span>
                                      <span>{t("target_artifact", "Target {Mod}")}</span>
                                    </span>
                                  )}
                                  {activeCategory.requires_target_user && (
                                    <span className={VAULT_CHIP_CLASS}>
                                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                        {t("icon_person", "person")}
                                      </span>
                                      <span>{t("support_target_user_label", "Target User ID")}</span>
                                    </span>
                                  )}
                                  {(activeCategory.telemetry_config?.sources?.length > 0 || String(activeCategory.show_logs_box) !== "false") && (
                                    <span className={VAULT_CHIP_CLASS}>
                                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                        {t("icon_terminal", "terminal")}
                                      </span>
                                      <span>{t("dossier_attached_logs", "Attached Telemetry")}</span>
                                    </span>
                                  )}
                                  <span className={VAULT_CHIP_CLASS}>
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                                      {t("icon_checklist", "checklist")}
                                    </span>
                                    <span>{`${cards.length} ${t("steps", "Steps")}`}</span>
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {card.type === 'TARGET_MOD' && (
                          <div className="flex flex-col gap-4 relative z-[60]">
                            <ModSearchDropdown
                              modList={modList}
                              placeholder={t("support_placeholder_mod_uuid", "{Mod} UUID...") || "Select Mod..."}
                              selectedItem={selectedModItem || (targetModId ? { displayName: targetModId } : null)}
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
                            label={t("support_target_user_label", "Target User ID")}
                            value={targetUserId}
                            onChange={setTargetUserId}
                            onKeyDown={handleAdvance}
                            placeholder={t("support_placeholder_user_uuid", "User UUID...")}
                            className="font-mono"
                          />
                        )}

                        {card.type === 'CUSTOM' && (
                          <div className="flex flex-col w-full">
                            {card.field?.type === "TEXT INPUT" && (
                              <UniversalInput
                                value={customFieldsData[card.id] || ""}
                                onChange={(val: string) => setCustomFieldsData(prev => ({ ...prev, [card.id]: val }))}
                                onKeyDown={handleAdvance}
                                placeholder={card.label}
                              />
                            )}
                            {card.field?.type === "TEXTAREA" && (
                              <UniversalTextArea
                                value={customFieldsData[card.id] || ""}
                                onChange={(val: string) => setCustomFieldsData(prev => ({ ...prev, [card.id]: val }))}
                                placeholder={card.label}
                                className="min-h-[160px]"
                              />
                            )}
                            {card.field?.type === "DROPDOWN" && (
                              <div className="relative z-[50]">
                                <CustomDropdown
                                  disableTint={true}
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
                                    const isChecked = card.field.allow_multi_select
                                      ? (customFieldsData[card.id] || []).includes(opt)
                                      : customFieldsData[card.id] === opt;
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
                          <div className="flex flex-col gap-4 w-full">
                            {String(activeCategory?.show_title_box) !== "false" && (
                              <UniversalInput
                                label={`${t("dossier_subtitle", "Ticket Subject")} *`}
                                value={title}
                                onChange={setTitle}
                                onKeyDown={handleAdvance}
                                placeholder={t("support_dossier_title_placeholder", "Enter Ticket Title...")}
                              />
                            )}
                            <UniversalTextArea
                              label={`${t("support_step_desc", "Incident Description")} *`}
                              value={description}
                              onChange={setDescription}
                              placeholder={t("support_dossier_desc_placeholder", "Describe the issue in detail...")}
                              className="min-h-[180px] sm:min-h-[220px]"
                            />
                          </div>
                        )}

                        {card.type === 'TELEMETRY' && (
                          <div className="flex flex-col gap-4">
                            <div className="glass-surface p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] flex flex-col gap-3.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                                    <span className="material-symbols-outlined !text-[18px]">
                                      {t("icon_terminal", "terminal")}
                                    </span>
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-black text-[var(--text)] truncate">
                                      {t("dossier_attached_logs", "Attached Telemetry")}
                                    </span>
                                    <span className="text-[10px] font-mono text-[var(--subtext)] truncate">
                                      {t("support_telemetry_opt", "Automatic Diagnostics")}
                                    </span>
                                  </div>
                                </div>

                                {String(activeCategory?.show_logs_box) !== "false" && (
                                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        attachLog();
                                      }}
                                      className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 cursor-pointer transition-all"
                                    >
                                      <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                                        {t("icon_upload_file", "upload_file")}
                                      </span>
                                      <span>{t("attach_logs", "Attach Logs")}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setIsEditingRawTelemetry((prev) => !prev)}
                                      className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1 cursor-pointer transition-all"
                                    >
                                      <span className="material-symbols-outlined !text-[14px]">
                                        {isEditingRawTelemetry ? t("icon_check", "check") : t("icon_edit", "edit")}
                                      </span>
                                      <span>
                                        {isEditingRawTelemetry
                                          ? t("done", "Done")
                                          : t("landing_bug_btn_edit_telemetry", "Edit Details")}
                                      </span>
                                    </button>
                                  </div>
                                )}
                              </div>

                              {effectiveTelemetrySources.length > 0 && (
                                <div className="flex flex-col gap-2">
                                  {effectiveTelemetrySources.map((source: any) => {
                                    const isOptedOut = optedOutSources.includes(source.id);
                                    return (
                                      <SidePanelPillToggle
                                        key={source.id}
                                        checked={!isOptedOut}
                                        icon={
                                          source.type === "OS"
                                            ? t("icon_memory", "memory")
                                            : t("icon_folder", "folder")
                                        }
                                        label={source.label}
                                        description={
                                          !isOptedOut
                                            ? t("data_included", "Data Included")
                                            : t("excluded_from_report", "Excluded from report")
                                        }
                                        onChange={() => {
                                          if (!isOptedOut) {
                                            setOptedOutSources((prev) => [...prev, source.id]);
                                          } else {
                                            setOptedOutSources((prev) => prev.filter((id) => id !== source.id));
                                          }
                                        }}
                                      />
                                    );
                                  })}
                                </div>
                              )}

                              {previewTelemetryLogs && (
                                <TicketLogViewer logs={previewTelemetryLogs} />
                              )}

                              {isEditingRawTelemetry && String(activeCategory?.show_logs_box) !== "false" && (
                                <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                  <UniversalTextArea
                                    label={t("support_logs", "Attach Additional Logs")}
                                    value={logs}
                                    onChange={setLogs}
                                    placeholder={t("support_placeholder_logs", "No logs attached.")}
                                    className="min-h-[140px] font-mono text-xs"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {card.type === 'REVIEW' && (
                          <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <StatBox
                                label={t("support_category", "Category")}
                                value={activeCategory?.category_name || activeTab}
                                icon={t("icon_category", "category")}
                                iconColorClass="text-[var(--accent)]"
                              />
                              <StatBox
                                label={t("dossier_subtitle", "Ticket Subject")}
                                value={title || activeCategory?.category_name || t("support_title", "Support Ticket")}
                                icon={t("icon_receipt_long", "receipt_long")}
                                iconColorClass="text-[var(--accent)]"
                              />
                              {activeCategory?.requires_target_mod && (
                                <StatBox
                                  label={t("target_artifact", "Target {Mod}")}
                                  value={selectedModItem?.displayName || selectedModItem?.name || targetModId || t("none", "None")}
                                  icon={t("icon_extension", "extension")}
                                  iconColorClass="text-[var(--accent)]"
                                />
                              )}
                              {activeCategory?.requires_target_user && (
                                <StatBox
                                  label={t("support_target_user_label", "Target User ID")}
                                  value={targetUserId || t("none", "None")}
                                  icon={t("icon_person", "person")}
                                  iconColorClass="text-[var(--accent)]"
                                />
                              )}
                            </div>

                            {description && (
                              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-1.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                  {t("upload_desc", "Description")}
                                </span>
                                <p className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-wrap">
                                  {description}
                                </p>
                              </div>
                            )}

                            {previewTelemetryLogs && (
                              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                  {t("dossier_attached_logs", "Attached Telemetry")}
                                </span>
                                <TicketLogViewer logs={previewTelemetryLogs} />
                              </div>
                            )}

                            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                              {idx > 0 && (
                                <ActionButton
                                  variant="glass"
                                  icon={t("icon_arrow_back", "arrow_back")}
                                  label={t("back", "Back")}
                                  onClick={() => setActiveCardIndex(idx - 1)}
                                />
                              )}
                              <ActionButton
                                icon={isSubmitting || isScanning ? t("icon_sync", "sync") : t("icon_send", "send")}
                                label={isSubmitting || isScanning ? t("scanning", "Scanning...") : t("support_submit", "Submit Ticket")}
                                variant="accent"
                                disabled={isSubmitting || isScanning || isFormDisabled}
                                onClick={submitTicket}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Active Step Action Footer */}
                      {card.type !== 'REVIEW' && isActive && (
                        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                          {idx > 0 && (
                            <ActionButton
                              variant="glass"
                              icon={t("icon_arrow_back", "arrow_back")}
                              label={t("back", "Back")}
                              onClick={() => setActiveCardIndex(idx - 1)}
                            />
                          )}
                          <ActionButton
                            label={t("confirm", "Confirm")}
                            icon={t("icon_done", "done")}
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
