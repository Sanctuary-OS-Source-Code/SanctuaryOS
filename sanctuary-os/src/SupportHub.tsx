import React, { useState, useEffect, useCallback } from "react";
import { supabase, supabaseAuth, getActiveGameClient } from "./supabase";
import { useLexicon } from "./LexiconContext";
import {
  CustomDropdown,
  ModSearchDropdown,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelPillToggle,
  getExtensionRegex,
  LoadingScreen,
  SidePanel,
  SidePanelFilterBar,
  DashboardStatTile,
  VAULT_CHIP_CLASS,
} from "./shared";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import ArtifactResolutionSidePanel from "./side-panels/ArtifactResolutionSidePanel";
import TicketLogViewer from "./side-panels/TicketLogViewer";
import { UniversalInput, UniversalTextArea, UniversalToggle, SidePanelHeroCard, StatBox } from "./components/universal/UniversalLayout";
import {
  getSupporterState,
  findLocalMasonSupporterPass,
  findAnyActiveMasonSupporterPasses,
  isFoundryPatron,
  isSpokeSupporter,
  LocalMasonSupporter,
  LocalSpokeSupporter,
} from "./utils/supporterManager";
import { scrubLogUserData } from "./utils/logScrubber";
import { isLocalModKnownTier0, verifyKnownTier0CloudHashes } from "./components/LabVerificationGate";
import { isDesktop } from "./utils/envUtils";
import { isRootDomain } from "./utils/routingUtils";
import {
  getCachedComplianceHashTiers,
  resolveComplianceHashTiers,
  collectComplianceLookupHashes,
  normalizeComplianceHash,
  resolveEffectiveModComplianceTier,
} from "./utils/complianceHashTiers";

function findDirtyLogTraces(text: string, modList: any[], activeGameSchema: any): string[] {
  if (!text || !Array.isArray(modList) || modList.length === 0) return [];
  const extRegex = getExtensionRegex(activeGameSchema);
  const restrictedOrUnknown = modList.filter((ml: any) => !ml?.isVirtual && !isLocalModKnownTier0(ml));
  if (restrictedOrUnknown.length === 0) return [];
  const dirtyTraces: string[] = [];
  const lowerText = text.toLowerCase();
  for (const am of restrictedOrUnknown) {
    const baseName = am.name?.split(/[\\/]/).pop()?.replace(extRegex, "").toLowerCase();
    if (baseName && baseName.length >= 4 && lowerText.includes(baseName)) {
      dirtyTraces.push(am.displayName || am.name);
    }
  }
  return [...new Set(dirtyTraces)];
}

export default function SupportHub() {
  const activeGameSchema = useStore(state => state.activeGameSchema);
  const { t } = useLexicon();
  const modList = useStore((state) => state.modList);
  const activeSet = useStore(state => state.playSets[state.activePlaySetIndex]);
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const availableWorkspaces = useStore((state) => state.workspaces);
  const isScanning = useModalStore((state: any) => state.isScanning || state.isSilentScanning);

  const isOpen = useModalStore((state: any) => state.isSupportPanelOpen);
  const onClose = () => useModalStore.getState().setIsSupportPanelOpen(false);

  const isWebHub = !isDesktop() && isRootDomain();
  const hasLoadedSpoke = Boolean(
    activeWorkspaceId &&
      activeWorkspaceId !== "default_workspace" &&
      activeWorkspaceId !== "web" &&
      !isWebHub &&
      getActiveGameClient()
  );
  const [supportStream, setSupportStream] = useState<"community" | "os_bug">(() =>
    hasLoadedSpoke ? "community" : "os_bug"
  );
  const [osPlatform, setOsPlatform] = useState<"Desktop App" | "Website" | "Mobile PWA">(() =>
    isDesktop()
      ? "Desktop App"
      : typeof window !== "undefined" &&
          window.matchMedia?.("(display-mode: standalone)")?.matches
        ? "Mobile PWA"
        : "Website"
  );

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
  const [isResolutionOpen, setIsResolutionOpen] = useState(false);
  const [localSupporters, setLocalSupporters] = useState<LocalMasonSupporter[]>([]);
  const [activeMasonSupporters, setActiveMasonSupporters] = useState<LocalMasonSupporter[]>([]);
  const [spokeSupporterPass, setSpokeSupporterPass] = useState<LocalSpokeSupporter | null>(null);
  const [isPatronUser, setIsPatronUser] = useState(false);
  const [patronMonths, setPatronMonths] = useState(0);
  const [hashTierMap, setHashTierMap] = useState<Map<string, number>>(() =>
    getCachedComplianceHashTiers()
  );

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const syncTiers = async (forceRefresh = false) => {
      const lookupHashes = collectComplianceLookupHashes({ modList, playSet: activeSet });
      if (lookupHashes.length === 0) return;
      const client = getActiveGameClient() || supabase;
      const nextMap = await resolveComplianceHashTiers(client, lookupHashes, { forceRefresh });
      if (!cancelled) setHashTierMap(nextMap);
    };
    syncTiers(false);
    const onComplianceUpdated = () => syncTiers(true);
    window.addEventListener("sanctuary-compliance-updated", onComplianceUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("sanctuary-compliance-updated", onComplianceUpdated);
    };
  }, [isOpen, modList, activeSet]);

  useEffect(() => {
    if (!hasLoadedSpoke && supportStream === "community") {
      setSupportStream("os_bug");
    }
  }, [hasLoadedSpoke, supportStream]);

  useEffect(() => {
    if (!isOpen) return;
    getSupporterState().then(state => {
      setLocalSupporters(state.supporters || []);
      setActiveMasonSupporters(findAnyActiveMasonSupporterPasses(state));
      setSpokeSupporterPass(
        isSpokeSupporter(state, activeWorkspaceId) ||
          isSpokeSupporter(state, activeGameSchema?.display_name || activeGameSchema?.name)
      );
      setIsPatronUser(isFoundryPatron(state));
      setPatronMonths(state.dev_build?.total_months_unlocked || 0);
    }).catch(() => {});
  }, [isOpen, activeWorkspaceId, activeGameSchema?.display_name, activeGameSchema?.name]);

  const matchedSupporterPass = React.useMemo(() => {
    if (supportStream !== "community" || !targetModId || localSupporters.length === 0) return null;
    const targetMod = modList.find((m: any) => m.id === targetModId || m.hash === targetModId);
    if (!targetMod) return null;
    return findLocalMasonSupporterPass(
      localSupporters,
      targetMod.mason_id,
      targetMod.author || targetMod.master_author
    );
  }, [supportStream, targetModId, localSupporters, modList]);

  const effectiveMasonPass = matchedSupporterPass || activeMasonSupporters[0] || null;

  const supporterPerkChips =
    effectiveMasonPass || spokeSupporterPass || isPatronUser ? (
      <>
        {effectiveMasonPass && (
          <span className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
              {t("icon_bolt", "bolt")}
            </span>
            <span>{t("ticket_badge_mason_priority", "Priority • {Mason} Supporter")}</span>
          </span>
        )}
        {spokeSupporterPass && (
          <span className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_favorite", "favorite")}
            </span>
            <span>{t("ticket_badge_spoke_supporter", "Spoke Supporter")}</span>
          </span>
        )}
        {isPatronUser && (
          <span className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_workspace_premium", "workspace_premium")}
            </span>
            <span>{t("supporter_patron_badge_label", "Foundry Supporter")}</span>
          </span>
        )}
      </>
    ) : null;

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
        if (parsed.activeCardIndex > 0 || parsed.title || parsed.description || parsed.targetModId || parsed.targetUserId || Object.keys(parsed.customFieldsData || {}).length > 0) {
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
      supportStream,
      osPlatform,
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
  }, [isOpen, showDraftPrompt, supportStream, osPlatform, activeTab, activeCardIndex, maxReachedIndex, title, description, targetModId, targetUserId, logs, customFieldsData, optedOutSources]);

  const loadDraft = () => {
    if (draftData) {
      if (draftData.supportStream === "os_bug" || (draftData.supportStream === "community" && hasLoadedSpoke)) {
        setSupportStream(draftData.supportStream);
      }
      if (draftData.osPlatform) setOsPlatform(draftData.osPlatform);
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
        if (supportStream === "community") {
          const store = useStore.getState();
          const dirtyTraces = findDirtyLogTraces(text, store.modList, store.activeGameSchema);
          if (dirtyTraces.length > 0) {
            setPolicyViolations(dirtyTraces);
            const traceStr = `${dirtyTraces.slice(0, 3).join(", ")}${dirtyTraces.length > 3 ? "..." : ""}`;
            const errStr = (
              t(
                "support_err_dirty_logs",
                "Restricted or unverified {mods} were found in your logs: {0}. Please clear your logs or relaunch without them before attaching logs."
              ) || "Restricted or unverified items found in logs: {0}."
            ).replace("{0}", traceStr);
            setError(errStr);
            useStore.getState().pushStatus(errStr, "error");
            return;
          }
        }
        const scrubbedText = scrubLogUserData(text);
        const block = `--- TELEMETRY: Manual Attachment (${fileName}) ---\n${scrubbedText}`;
        setLogs(prev => prev ? `${prev}\n\n${block}` : block);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const activeSupportLockMods = React.useMemo(() => {
    if (!activeSet?.mods || activeSet.mods.length === 0) return [];
    const extRegex = getExtensionRegex(activeGameSchema);
    const exactLookup = new Map<string, any>();
    const baseLookup = new Map<string, any>();

    const indexMod = (ml: any) => {
      if (!ml) return;
      if (ml?.name) exactLookup.set(String(ml.name), ml);
      if (ml?.displayName) exactLookup.set(String(ml.displayName), ml);
      const mBase = String(ml?.name || "").split(/[\\/]/).pop()?.replace(extRegex, "").toLowerCase();
      if (mBase && !baseLookup.has(mBase)) baseLookup.set(mBase, ml);
    };

    for (const ml of modList) {
      indexMod(ml);
      if (Array.isArray(ml?.flavors)) {
        for (const fl of ml.flavors) indexMod(fl);
      }
    }

    const blocked: any[] = [];
    const seen = new Set<string>();
    for (const rawMod of activeSet.mods) {
      const modName = typeof rawMod === 'string' ? rawMod : String(rawMod?.name || rawMod?.path || '');
      if (!modName) continue;
      const base = modName.split(/[\\/]/).pop()?.replace(extRegex, '').toLowerCase();
      const resolvedMod = exactLookup.get(modName) || (base ? baseLookup.get(base) : undefined);
      const rawObjHash = typeof rawMod === 'object' ? (rawMod?.hash || rawMod?.dna_hash) : '';
      const fallbackHash = String(
        resolvedMod?.hash ||
        activeSet?.modHashes?.[modName] ||
        (base ? activeSet?.modHashes?.[base] : '') ||
        rawObjHash ||
        ''
      ).trim();
      const effectiveTier = resolveEffectiveModComplianceTier(resolvedMod, hashTierMap, fallbackHash);
      if (!resolvedMod || !isLocalModKnownTier0(resolvedMod) || effectiveTier >= 1) {
        const displayName = String(resolvedMod?.displayName || resolvedMod?.name || modName);
        if (!seen.has(displayName)) {
          seen.add(displayName);
          const resolvedHash = normalizeComplianceHash(fallbackHash) || resolvedMod?.hash;
          const resolvedTier = effectiveTier > 0 ? effectiveTier : 0;
          blocked.push({
            ...(resolvedMod || {}),
            ...(resolvedHash ? { hash: resolvedHash } : {}),
            origName: resolvedMod?.name || modName,
            name: displayName,
            compliance_tier: resolvedTier,
            tier: resolvedTier,
          });
        }
      }
    }
    return blocked;
  }, [activeSet?.mods, activeSet?.modHashes, modList, activeGameSchema, hashTierMap]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchData = async () => {
      if (!hasLoadedSpoke) {
        setCategories([]);
        setTelemetrySources([]);
        setLoadingCats(false);
        return;
      }
      setLoadingCats(true);
      try {
        const [{ data: cats }, { data: sources }] = await Promise.all([
          supabase.from('sanctuary_support_categories').select('*').eq('is_active', true).order('category_name', { ascending: true }),
          supabase.from('sanctuary_telemetry_sources').select('*').eq('is_active', true)
        ]);
        if (session?.user?.id) {
          const { data: profile } = await supabase.from('profiles').select('is_comm_banned, comm_blacklist_reason').eq('id', session.user.id).single();
          if (profile?.is_comm_banned) {
            setIsBanned(true);
            setBanReason(profile.comm_blacklist_reason || t("support_banned_default", "You have been banned from submitting support tickets."));
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
      } catch (err) {
        console.error("Failed to fetch support categories:", err);
      } finally {
        setLoadingCats(false);
      }
    };
    fetchData();
  }, [isOpen, hasLoadedSpoke]);

  const activeCategory = categories.find(c => c.category_code === activeTab) || categories[0];

  // When changing tabs or streams, reset card step cleanly
  useEffect(() => {
    setError("");
    setPolicyViolations([]);
    setActiveCardIndex(0);
    setMaxReachedIndex(0);
  }, [activeTab, supportStream]);

  const cards = React.useMemo(() => {
    if (supportStream === "os_bug") {
      return [
        { id: "os_details", type: "OS_DETAILS", label: t("support_os_bug_details", "OS Bug Details"), required: true },
        { id: "telemetry", type: "TELEMETRY", label: t("ticket_attached_logs", "Attached Logs"), required: false },
        { id: "review", type: "REVIEW", label: t("support_ready_to_submit", "Ready to Submit"), required: false },
      ];
    }
    if (!activeCategory) return [];

    const params: any[] = [];
    params.push({ id: 'classification', type: 'CLASSIFICATION', label: t("comp_type", "Classification") || "Classification", required: true });

    if (activeCategory.requires_target_mod) {
      params.push({ id: 'target_mod', type: 'TARGET_MOD', label: t("target_artifact", "Target {Mod}") || "Target Mod", required: true });
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
      params.push({ id: 'telemetry', type: 'TELEMETRY', label: t("ticket_attached_logs", "Attached Logs") || "Attached Logs", required: false });
    }

    params.push({ id: 'review', type: 'REVIEW', label: t("support_ready_to_submit", "Ready to Submit"), required: false });

    return params;
  }, [supportStream, activeCategory, t]);

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
    if (supportStream === "os_bug") {
      return [
        {
          id: "sys_os_default",
          label: t("support_os_logs_source", "Sanctuary OS System Logs"),
          type: "OS",
        },
      ];
    }
    const configuredIds: string[] = activeCategory?.telemetry_config?.sources || [];
    const matched = telemetrySources.filter((s) => configuredIds.includes(s.id));
    const hasOs = matched.some((s) => s.type === "OS");
    if (!hasOs && String(activeCategory?.show_logs_box) !== "false") {
      return [
        {
          id: "sys_os_default",
          label: t("support_os_logs_source", "Sanctuary OS System Logs"),
          type: "OS",
        },
        ...matched,
      ];
    }
    return matched;
  }, [supportStream, activeCategory, telemetrySources, t]);

  const buildLiveTelemetryBundle = useCallback(async () => {
    if (!isOpen || (supportStream === "community" && !activeCategory)) return "";
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
          const osLabel = source.label.endsWith("(OS)")
            ? source.label
            : `${source.label} (OS)`;

          if (supportStream === "os_bug") {
            const osDiagnostics = `\nPlatform: ${osPlatform}\nDisplay Resolution: ${window.innerWidth}x${window.innerHeight}\nCaptured At: ${new Date().toLocaleString()}\n`;
            bundle += `\n--- TELEMETRY: ${osLabel} ---\n${scrubLogUserData(sysInfo)}${osDiagnostics}\n`;
          } else {
            const netUpdates = storeState.networkUpdates;
            const totalUpdates =
              (netUpdates?.broken?.length || 0) +
              (netUpdates?.obsolete?.length || 0) +
              (netUpdates?.updated?.length || 0);
            const diagnostics = `\nDisplay Resolution: ${window.innerWidth}x${window.innerHeight}\nMods Path: ${scrubLogUserData(storeState.modsPath || "N/A")}\nActive Blueprint: ${currentSet?.name || "None"}\nActive Mods: ${currentSet?.mods?.length || 0}\nPending Network Updates: ${totalUpdates}\nCaptured At: ${new Date().toLocaleString()}\nDiagnostic Bundle Version: 1.0.0\n`;
            bundle += `\n--- TELEMETRY: ${osLabel} ---\n${scrubLogUserData(sysInfo)}${diagnostics}\n`;

            if (currentSet) {
              const bpPayload = scrubLogUserData(
                JSON.stringify({ sanctuary_profile: true, ...currentSet }, null, 2)
              );
              bundle += `\n--- TELEMETRY: Attached Blueprint ---\n${bpPayload}\n`;
            }
          }

          const systemLogHistory = (storeState.statusLog || [])
            .map((entry: any) => {
              return `[${new Date(entry.timestamp).toISOString()}] [${String(entry.type || "info").toUpperCase()}] ${scrubLogUserData(entry.message)}`;
            })
            .join("\n");
          bundle += `\n--- TELEMETRY: System Log History ---\n${systemLogHistory || "No system logs available."}\n`;
        } else if (supportStream === "community" && modsPath && source.search_path && source.file_pattern) {
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
  }, [isOpen, supportStream, osPlatform, activeCategory, effectiveTelemetrySources, optedOutSources, logs]);

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
    if (supportStream === "os_bug") {
      if (!title.trim() || !description.trim()) {
        return setError(t("support_error_fields", "Please fill out all required fields."));
      }
      setIsSubmitting(true);
      setError("");
      setPolicyViolations([]);

      try {
        const [{ data: authData }, { data: spokeUserData }] = await Promise.all([
          supabaseAuth.auth.getUser(),
          supabase.auth.getUser(),
        ]);
        const user = authData?.user || spokeUserData?.user || session?.user;
        if (!user) {
          throw new Error(t("auto_guest_mode_active_45", "Guest Mode Active"));
        }

        const builtLogs = previewTelemetryLogs || (await buildLiveTelemetryBundle());
        const combinedLogs = builtLogs ? scrubLogUserData(builtLogs) : null;

        const { error: insertErr } = await supabaseAuth.from("keeper_tickets").insert([
          {
            author_id: user.id,
            ticket_type: "Bug Report",
            title: `[Core Bug • ${osPlatform}] ${scrubLogUserData(title.trim())}`,
            description: scrubLogUserData(description.trim()),
            status: "NEW",
            metadata: {
              logs: combinedLogs,
              feedback_meta: {
                platform: osPlatform,
                stream: "Core Bug Report",
                sentiment: "Bug Report",
                auto_captured: true,
                author_label:
                  user.user_metadata?.username ||
                  user.email?.split("@")[0] ||
                  t("term_citizen", "Citizen"),
              },
              ...(activeMasonSupporters[0]
                ? {
                    expedited_support: true,
                    priority_ticket: true,
                    priority_level: "mason_supporter",
                    is_mason_supporter: true,
                    mason_supporter_id: activeMasonSupporters[0].mason_id,
                    mason_supporter_name: activeMasonSupporters[0].mason_name,
                    supporter_tier: activeMasonSupporters[0].tier_name,
                    supporter_provider: activeMasonSupporters[0].provider,
                  }
                : {}),
              ...(spokeSupporterPass
                ? {
                    is_spoke_supporter: true,
                    spoke_supporter_id: spokeSupporterPass.spoke_id,
                    spoke_supporter_name: spokeSupporterPass.spoke_name,
                  }
                : {}),
              ...(isPatronUser
                ? {
                    is_foundry_patron: true,
                    patron_months: patronMonths,
                  }
                : {}),
            },
          },
        ]);

        if (insertErr) throw insertErr;

        window.dispatchEvent(new CustomEvent("sanctuary-tickets-updated"));
        useStore.getState().pushStatus(t("ss_support_success", "Ticket sent successfully"), "success");
        localStorage.removeItem("support_draft");
        setTitle("");
        setDescription("");
        setTargetModId("");
        setLogs("");
        onClose();
      } catch (e: any) {
        setError(e.message);
        useStore.getState().pushStatus(e.message, "error");
        invoke("write_os_log", {
          message: "OS bug ticket submission failed: " + e.message,
          level: "ERROR",
        }).catch(console.error);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

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
      const currentSet = storeState.playSets[storeState.activePlaySetIndex];

      let hasViolations = false;
      const violations: string[] = [];
      let resolvedCloudTargetModId: string | null = null;
      const hashesToVerifyInCloud: string[] = [];

      if (activeCategory?.requires_target_mod || targetModId) {
        const m = storeState.modList.find(
          (ml: any) => ml.dbId === targetModId || ml.id === targetModId || ml.hash === targetModId
        );
        if (!m || !isLocalModKnownTier0(m)) {
          hasViolations = true;
          violations.push(m?.displayName || m?.name || targetModId);
        } else {
          const tHash = String(m.hash || (m as any).dna_hash || "").trim();
          if (tHash) hashesToVerifyInCloud.push(tHash);
          resolvedCloudTargetModId = String(m.dbId || m.id || "").trim() || null;
        }
      }

      if (currentSet && currentSet.mods) {
        const extRegex = getExtensionRegex(activeGameSchema);
        currentSet.mods.forEach((rawModEntry: any) => {
          const modName =
            typeof rawModEntry === "string"
              ? rawModEntry
              : String(rawModEntry?.name || rawModEntry?.path || "");
          if (!modName) return;
          const exactMatch = storeState.modList.find(
            (ml: any) => ml.name === modName || ml.displayName === modName
          );
          const resolvedMod =
            exactMatch ||
            storeState.modList.find((ml: any) => {
              const mBase = ml.name?.split(/[\\/]/).pop()?.replace(extRegex, "");
              const targetBase = modName.split(/[\\/]/).pop()?.replace(extRegex, "");
              return mBase && targetBase && mBase === targetBase;
            });

          if (!resolvedMod || !isLocalModKnownTier0(resolvedMod)) {
            hasViolations = true;
            violations.push(resolvedMod?.displayName || resolvedMod?.name || modName);
          } else {
            const rHash = String(resolvedMod.hash || (resolvedMod as any).dna_hash || "").trim();
            if (rHash) hashesToVerifyInCloud.push(rHash);
          }
        });
      }

      if (hasViolations) {
        const uniqueViolations = [...new Set(violations.filter(Boolean))];
        setPolicyViolations(uniqueViolations);
        invoke("write_os_log", {
          message: "Blocked support ticket with non-Tier-0 or unknown items: " + uniqueViolations.join(", "),
          level: "WARNING",
        }).catch(console.error);
        throw new Error(
          t(
            "support_err_known_tier0_required",
            "Community support tickets only accept verified safe (Tier 0) {mods}. Please unequip restricted or unverified {mods} from your active {blueprint}, or switch to OS Bug Report."
          )
        );
      }

      if (hashesToVerifyInCloud.length > 0) {
        const cloudCheck = await verifyKnownTier0CloudHashes(hashesToVerifyInCloud);
        if (!cloudCheck.allowed) {
          throw new Error(
            t(
              "support_err_known_tier0_required",
              "Community support tickets only accept verified safe (Tier 0) {mods}. Please unequip restricted or unverified {mods} from your active {blueprint}, or switch to OS Bug Report."
            )
          );
        }
        const selectedTargetMod = storeState.modList.find(
          (ml: any) => ml.dbId === targetModId || ml.id === targetModId || ml.hash === targetModId
        );
        const selHash = String(selectedTargetMod?.hash || (selectedTargetMod as any)?.dna_hash || "").trim();
        if (selHash && cloudCheck.verifiedMap[selHash]?.modId) {
          resolvedCloudTargetModId = cloudCheck.verifiedMap[selHash].modId;
        }
      }

      let finalLogs = "";
      if (logs && logs.trim()) {
        const manualDirtyTraces = findDirtyLogTraces(logs, storeState.modList, activeGameSchema);
        if (manualDirtyTraces.length > 0) {
          setPolicyViolations(manualDirtyTraces);
          const traceStr = `${manualDirtyTraces.slice(0, 3).join(", ")}${manualDirtyTraces.length > 3 ? "..." : ""}`;
          throw new Error(
            (
              t(
                "support_err_dirty_logs",
                "Restricted or unverified {mods} were found in your logs: {0}. Please clear your logs or relaunch without them before submitting."
              ) || "Restricted or unverified items found in logs: {0}."
            ).replace("{0}", traceStr)
          );
        }
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
          if (source.type === 'OS') {
            try {
              let sysInfo = "";
              try {
                sysInfo = await invoke<string>("get_system_info");
              } catch {
                sysInfo = `OS: ${typeof navigator !== "undefined" ? navigator.platform || "Web" : "Desktop"}\nUser Agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "Sanctuary OS"}`;
              }
              const netUpdates = storeState.networkUpdates;
              const totalUpdates = (netUpdates?.broken?.length || 0) + (netUpdates?.obsolete?.length || 0) + (netUpdates?.updated?.length || 0);
              const diagnostics = `\nDisplay Resolution: ${window.innerWidth}x${window.innerHeight}\nMods Path: ${scrubLogUserData(storeState.modsPath)}\nActive Blueprint: ${currentSet?.name || "None"}\nActive Mods: ${currentSet?.mods?.length || 0}\nPending Network Updates: ${totalUpdates}\nCaptured At: ${new Date().toLocaleString()}\nDiagnostic Bundle Version: 1.0.0\n`;
              const osLabel = source.label.endsWith("(OS)") ? source.label : `${source.label} (OS)`;
              finalLogs += `\n--- TELEMETRY: ${osLabel} ---\n` + scrubLogUserData(sysInfo) + diagnostics + "\n";

              if (currentSet) {
                const bpPayload = scrubLogUserData(JSON.stringify({ sanctuary_profile: true, ...currentSet }, null, 2));
                finalLogs += `\n--- TELEMETRY: Attached Blueprint ---\n${bpPayload}\n`;
              }

              const systemLogHistory = storeState.statusLog.map(entry => {
                return `[${new Date(entry.timestamp).toISOString()}] [${entry.type.toUpperCase()}] ${scrubLogUserData(entry.message)}`;
              }).join('\n');
              finalLogs += `\n--- TELEMETRY: System Log History ---\n${systemLogHistory || "No system logs available."}\n`;
            } catch {
              // Optional OS probe unavailable
            }
          } else if (modsPath && source.search_path && source.file_pattern) {
            let text = "";
            try {
              const docDirMatch = modsPath.match(/(.*)[\\/]+(?:mods|data|_mods)[\\/]*$/i);
              const docDir = docDirMatch
                ? docDirMatch[1]
                : modsPath.replace(/[\\/]+[^\\/]+[\\/]*$/, "") || modsPath;
              const searchPath = source.search_path.replace('%MODS_DIR%', modsPath).replace('%DOC_DIR%', docDir);
              let fullPath = searchPath;
              if (!fullPath.endsWith('\\') && !fullPath.endsWith('/')) fullPath += '/';
              fullPath += source.file_pattern;
              text = await readTextFile(fullPath);
            } catch {
              // Optional log file absent on disk
            }
            if (text) {
              const dirtyTraces = findDirtyLogTraces(text, storeState.modList, storeState.activeGameSchema);
              if (dirtyTraces.length > 0) {
                setPolicyViolations(dirtyTraces);
                const traceStr = `${dirtyTraces.slice(0, 3).join(', ')}${dirtyTraces.length > 3 ? '...' : ''}`;
                throw new Error(
                  (
                    t(
                      "support_err_dirty_logs",
                      "Restricted or unverified {mods} were found in your logs: {0}. Please clear your logs or relaunch without them before submitting."
                    ) || "Restricted or unverified items found in logs: {0}."
                  ).replace("{0}", traceStr)
                );
              }
              const scrubbedTelemetry = scrubLogUserData(text.substring(0, 20000));
              finalLogs += `\n--- TELEMETRY: ${source.label} ---\n` + scrubbedTelemetry + "\n";
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
        throw new Error(`Communications Ban: ${profile.comm_blacklist_reason || t("support_banned_default", "You have been banned from submitting support tickets.")}`);
      }

      if (currentSet && activeTab.toLowerCase().includes('bug') && !finalLogs.includes('--- TELEMETRY: Attached Blueprint ---')) {
        const bpPayload = JSON.stringify({ sanctuary_profile: true, ...currentSet }, null, 2);
        finalLogs += `\n--- TELEMETRY: Attached Blueprint ---\n${bpPayload}\n`;
      }

      const scrubbedFinalLogs = finalLogs ? scrubLogUserData(finalLogs) : null;
      const scrubbedCustomFields: Record<string, string> = {};
      for (const [k, v] of Object.entries(customFieldsData || {})) {
        scrubbedCustomFields[k] = scrubLogUserData(String(v || ""));
      }

      const selectedTargetLocal =
        activeCategory?.requires_target_mod && targetModId
          ? storeState.modList.find(
              (ml: any) => ml.dbId === targetModId || ml.id === targetModId || ml.hash === targetModId
            )
          : null;
      let resolvedTargetModName: string | null = selectedTargetLocal
        ? String(selectedTargetLocal.displayName || selectedTargetLocal.name || "").trim() || null
        : null;
      let targetMasonId: string | undefined = selectedTargetLocal?.mason_id || undefined;
      let targetMasonName: string | undefined =
        selectedTargetLocal?.author || selectedTargetLocal?.master_author || undefined;

      if (
        activeCategory?.requires_target_mod &&
        resolvedCloudTargetModId &&
        (!targetMasonId || !resolvedTargetModName)
      ) {
        try {
          const { data: cloudMod } = await supabase
            .from("mods")
            .select("name, mason_id, author_name")
            .eq("id", resolvedCloudTargetModId)
            .maybeSingle();
          if (cloudMod) {
            if (!resolvedTargetModName && cloudMod.name) {
              resolvedTargetModName = String(cloudMod.name).trim() || null;
            }
            if (!targetMasonId && cloudMod.mason_id) {
              targetMasonId = String(cloudMod.mason_id);
            }
            if (!targetMasonName && cloudMod.author_name) {
              targetMasonName = String(cloudMod.author_name);
            }
          }
        } catch {
          // Best-effort target mod Mason enrichment
        }
      }

      const targetMatchedMasonPass =
        activeCategory?.requires_target_mod &&
        localSupporters.length > 0 &&
        (targetMasonId || targetMasonName)
          ? findLocalMasonSupporterPass(localSupporters, targetMasonId, targetMasonName)
          : null;
      const primaryMasonPass =
        targetMatchedMasonPass || matchedSupporterPass || activeMasonSupporters[0] || null;

      const { error: insertErr } = await supabase.from('sanctuary_tickets').insert([{
        author_id: user.id,
        ticket_type: activeTab,
        title: scrubLogUserData(title) || (activeCategory?.category_name || t("support_ticket", "Support Ticket")),
        description: scrubLogUserData(description || t("no_description_provided", "No description provided.")),
        status: "open",
        metadata: {
          target_mod_id: activeCategory?.requires_target_mod ? (resolvedCloudTargetModId || null) : null,
          ...(activeCategory?.requires_target_mod && resolvedTargetModName
            ? { target_mod_name: resolvedTargetModName }
            : {}),
          target_user_id: activeCategory?.requires_target_user ? (targetUserId || null) : null,
          logs: scrubbedFinalLogs,
          custom_fields: scrubbedCustomFields,
          ...(primaryMasonPass ? {
            expedited_support: true,
            priority_ticket: true,
            priority_level: "mason_supporter",
            is_mason_supporter: true,
            mason_supporter_id: primaryMasonPass.mason_id,
            mason_supporter_name: primaryMasonPass.mason_name,
            supporter_tier: primaryMasonPass.tier_name,
            supporter_provider: primaryMasonPass.provider,
            supporter_pass_hash: primaryMasonPass.cryptographic_pass,
          } : {}),
          ...(spokeSupporterPass ? {
            is_spoke_supporter: true,
            spoke_supporter_id: spokeSupporterPass.spoke_id,
            spoke_supporter_name: spokeSupporterPass.spoke_name,
          } : {}),
          ...(isPatronUser ? {
            is_foundry_patron: true,
            patron_months: patronMonths,
          } : {}),
        }
      }]);

      if (insertErr) throw insertErr;

      window.dispatchEvent(new CustomEvent("sanctuary-tickets-updated"));
      useStore.getState().pushStatus(t("ss_support_success", "Ticket sent successfully"), "success");
      localStorage.removeItem("support_draft");

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

  if (loadingCats && supportStream === "community" && hasLoadedSpoke) {
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
          <LoadingScreen title={t("support_loading_cats", "Connecting to Support Network")} subtitle={t("loading", "Loading...")} icon="wifi_tethering" />
        </div>
      </SidePanel>
    );
  }

  const activeWorkspaceObj = Array.isArray(availableWorkspaces)
    ? availableWorkspaces.find(
        (w: any) =>
          String(w?.id || "").toLowerCase() === String(activeWorkspaceId || "").toLowerCase() ||
          String(w?.schema_id || "").toLowerCase() === String(activeWorkspaceId || "").toLowerCase()
      )
    : null;
  const activeSpokeName =
    activeGameSchema?.display_name ||
    activeGameSchema?.name ||
    activeWorkspaceObj?.name ||
    t("support_stream_community", "Community Support");

  const isFormDisabled = supportStream === "community" && activeSupportLockMods.length > 0;
  const currentCard = cards[activeCardIndex];
  const isCurrentCardInvalid = Boolean(
    currentCard && (
      (currentCard.type === 'OS_DETAILS' && (!title.trim() || !description.trim())) ||
      (currentCard.type === 'TARGET_MOD' && activeCategory?.requires_target_mod && !targetModId) ||
      (currentCard.type === 'TARGET_USER' && activeCategory?.requires_target_user && !targetUserId) ||
      (currentCard.type === 'CUSTOM' && currentCard.field?.required && (!customFieldsData[currentCard.id] || (Array.isArray(customFieldsData[currentCard.id]) && customFieldsData[currentCard.id].length === 0))) ||
      (currentCard.type === 'DESCRIPTION' && currentCard.required && !description.trim()) ||
      (currentCard.type === 'DESCRIPTION' && String(activeCategory?.show_title_box) !== "false" && !title.trim())
    )
  );

  const eligibleTargetMods = modList.filter((m: any) => isLocalModKnownTier0(m));
  const selectedModItem = eligibleTargetMods.find(
    (m: any) => m.dbId === targetModId || m.id === targetModId || m.hash === targetModId
  );

  const getStepSummary = (card: any): string => {
    if (card.type === "OS_DETAILS") {
      if (title.trim()) return `${osPlatform} • ${title.trim()}`;
      return osPlatform;
    }
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
      return `${activeCount} ${t("ticket_attached_logs", "Attached Logs")}`;
    }
    return "";
  };

  const getStepIcon = (card: any): string => {
    if (card.type === "OS_DETAILS") return t("icon_bug_report", "bug_report");
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
                  tooltip={isSubmitting || isScanning ? t("scanning", "Submitting...") : t("support_submit", "Submit Ticket")}
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
              overline={t("support_title", "Submit A Ticket")}
              title={t("draft_detected", "Draft Detected")}
              description={t("draft_detected_desc", "An unfinished support ticket draft was found locally. Would you like to resume where you left off?")}
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
            icon={supportStream === "os_bug" ? t("icon_bug_report", "bug_report") : t("icon_support_agent", "support_agent")}
            overline={supportStream === "os_bug" ? t("keepers_title", "Keepers Core") : t("sidebar_support", "Support & Feedback")}
            title={
              supportStream === "os_bug"
                ? t("support_stream_os_bug", "OS Bug Report")
                : activeCategory?.category_name || t("support_title", "Submit A Ticket")
            }
            description={
              supportStream === "os_bug"
                ? t("support_os_bug_subtitle", "Report an issue with the Sanctuary OS app directly to Keepers Core without attaching any game or {mod} data.")
                : activeCategory?.description || t("support_wizard_subtitle", "Select a support channel and complete each step below to submit your ticket.")
            }
            badge={`${activeCardIndex + 1} / ${cards.length}`}
            badgeIcon={t("icon_checklist", "checklist")}
            variant={isFormDisabled ? "warning" : "accent"}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatBox
                label={t("support_category", "Category")}
                value={
                  supportStream === "os_bug"
                    ? t("support_stream_os_bug", "OS Bug Report")
                    : activeCategory?.category_name || activeTab
                }
                icon={supportStream === "os_bug" ? t("icon_bug_report", "bug_report") : t("icon_category", "category")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("wizard_progress_label", "Progress")}
                value={`${activeCardIndex + 1} / ${cards.length}`}
                icon={t("icon_checklist", "checklist")}
                iconColorClass="text-[var(--success)]"
              />
            </div>
          </SidePanelHeroCard>

          {hasLoadedSpoke && (
            <SidePanelFilterBar className="sm:grid-cols-2 gap-3">
              <DashboardStatTile
                variant="filter"
                icon={t("icon_local_activity", "local_activity")}
                label={activeSpokeName}
                value={t("support_stream_community", "Community Support")}
                isActive={supportStream === "community"}
                onClick={() => setSupportStream("community")}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_bug_report", "bug_report")}
                label={t("keepers_title", "Keepers Core")}
                value={t("support_stream_os_bug", "OS Bug Report")}
                colorClass="text-[var(--warning)]"
                isActive={supportStream === "os_bug"}
                onClick={() => setSupportStream("os_bug")}
              />
            </SidePanelFilterBar>
          )}

          <div className="flex flex-col w-full gap-4">

            {error && (
              <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-2xl flex flex-col relative shadow-md group">
                <div className="flex items-start gap-4 p-5 relative z-10">
                  <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--danger)]">
                    <span className="material-symbols-outlined !text-[20px]">{t("icon_warning", "warning")}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 pt-0.5 w-full pr-8">
                    <span className="text-sm font-black text-[var(--danger)] tracking-wide">{t("support_err_failed", "Submission Failed")}</span>
                    <span className="text-xs font-medium text-[var(--subtext)] leading-relaxed pr-4">{error}</span>
                  </div>
                  <button
                    onClick={() => { setError(""); setPolicyViolations([]); }}
                    className="absolute top-4 right-4 w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-center transition-all shrink-0 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[15px]">{t("icon_close", "close")}</span>
                  </button>
                </div>
                {policyViolations.length > 0 && (
                  <div className="glass-surface p-4 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 max-h-32 overflow-y-auto custom-scrollbar relative z-10">
                    <span className="text-[9px] font-black tracking-widest text-[var(--subtext)] capitalize">{t("auto_restricted_artifacts_detected_34", "Restricted {mods}")}</span>
                    <div className="flex flex-wrap gap-2">
                      {policyViolations.map((mod, i) => (
                        <div key={i} className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">{t("auto_extension", "extension")}</span>
                          <span className="truncate">{mod.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').replace(/[-_]/g, ' ') || mod.replace(/[-_]/g, ' ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {supportStream === "community" && activeSupportLockMods.length > 0 && (
              <SidePanelHeroCard
                icon={t("icon_lock", "lock")}
                overline={t("support_blueprint_lock", "{Blueprint} Support Lock")}
                title={t("support_blueprint_lock_title", "{Blueprint} Support Lock Active")}
                description={t(
                  "support_blueprint_lock_desc",
                  "Community tickets only allow verified safe (Tier 0) {mods}. Unequip restricted or unknown {mods} from your active {blueprint} to continue — your files stay untouched — or switch to OS Bug Report to report a Sanctuary OS issue."
                )}
                badge={`${activeSupportLockMods.length}`}
                badgeIcon={t("icon_warning", "warning")}
                variant="warning"
              >
                <div className="flex flex-wrap items-center justify-end gap-2 w-full pt-1">
                  <ActionButton
                    variant="glass"
                    icon={t("icon_bug_report", "bug_report")}
                    label={t("support_switch_os_bug", "Report OS Bug Instead")}
                    onClick={() => setSupportStream("os_bug")}
                  />
                  <ActionButton
                    variant="warning"
                    icon={t("icon_playlist_remove", "playlist_remove")}
                    label={t("support_review_locked_mods", "Review & Unequip")}
                    onClick={() => setIsResolutionOpen(true)}
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
                        className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-3 cursor-pointer group hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all shrink-0 w-full"
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
                        <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-center shrink-0 text-[var(--subtext)] group-hover:text-[var(--accent)] transition-all">
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
                        (card.type === 'OS_DETAILS' && (!title.trim() || !description.trim())) ||
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
                      className={`w-full glass-panel border border-[color-mix(in_srgb,var(--text)_16%,transparent)] rounded-3xl p-6 md:p-7 flex flex-col gap-5 shrink-0 relative animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.35)] ${
                        isBlockDisabled ? "opacity-35 pointer-events-none grayscale select-none" : ""
                      }`}
                    >
                      {/* Active Step Header */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
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
                        {card.type === 'OS_DETAILS' && (
                          <div className="flex flex-col gap-4 w-full">
                            <div className="flex flex-col gap-1.5 relative z-[60]">
                              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                                {t("landing_feedback_form_platform", "Target Platform")}
                              </span>
                              <CustomDropdown
                                disableTint={true}
                                value={osPlatform}
                                options={[
                                  { id: "Desktop App", label: t("landing_fb_desktop_title", "Desktop App") },
                                  { id: "Website", label: t("landing_fb_web_title", "Website") },
                                  { id: "Mobile PWA", label: t("landing_fb_pwa_title", "Mobile PWA") },
                                ]}
                                onChange={(val: string[]) =>
                                  setOsPlatform((val[0] as "Desktop App" | "Website" | "Mobile PWA") || "Desktop App")
                                }
                                allowMultiSelect={false}
                              />
                            </div>
                            <UniversalInput
                              label={`${t("ticket_subject_label", "Ticket Subject")} *`}
                              value={title}
                              onChange={setTitle}
                              onKeyDown={handleAdvance}
                              placeholder={t("support_placeholder_title", "Enter a concise title...")}
                            />
                            <UniversalTextArea
                              label={`${t("support_step_desc", "Issue Description")} *`}
                              value={description}
                              onChange={setDescription}
                              placeholder={t("support_placeholder_desc", "Describe your issue and reproduction steps...")}
                              className="min-h-[180px] sm:min-h-[220px]"
                            />
                          </div>
                        )}

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
                                      {activeCategory.description || t("support_wizard_subtitle", "Select a support channel and complete each step below to submit your ticket.")}
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
                                      <span>{t("ticket_attached_logs", "Attached Logs")}</span>
                                    </span>
                                  )}
                                  <span className={VAULT_CHIP_CLASS}>
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                                      {t("icon_checklist", "checklist")}
                                    </span>
                                    <span>{`${cards.length} ${t("steps", "Steps")}`}</span>
                                  </span>
                                  {supporterPerkChips}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {card.type === 'TARGET_MOD' && (
                          <div className="flex flex-col gap-4 relative z-[60]">
                            <ModSearchDropdown
                              modList={eligibleTargetMods}
                              placeholder={t("support_placeholder_mod_uuid", "{Mod} UUID...") || "Select Mod..."}
                              selectedItem={selectedModItem || (targetModId ? { displayName: targetModId } : null)}
                              onSelect={(m: any) => setTargetModId(m.dbId || m.id || m.hash)}
                              onClear={() => setTargetModId("")}
                            />
                            {matchedSupporterPass && (
                              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-start gap-3.5 animate-in fade-in duration-300">
                                <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--success)] shrink-0">
                                  <span className="material-symbols-outlined !text-[20px]">{t("icon_bolt", "bolt")}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-[var(--success)] flex items-center gap-1.5">
                                    {t("supporter_ticket_expedited_banner", "Verified {Mason} Supporter — Priority Support Active")}
                                  </span>
                                  <p className="text-[11px] font-semibold text-[var(--subtext)] leading-relaxed">
                                    {t("supporter_ticket_expedited_desc", "Your local Supporter Pass was verified for this {mason}. This ticket will be flagged for Priority Queue routing without exposing your subscription list.")}
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
                                label={`${t("ticket_subject_label", "Ticket Subject")} *`}
                                value={title}
                                onChange={setTitle}
                                onKeyDown={handleAdvance}
                                placeholder={t("support_placeholder_title", "Enter a concise title...")}
                              />
                            )}
                            <UniversalTextArea
                              label={`${t("support_step_desc", "Issue Description")} *`}
                              value={description}
                              onChange={setDescription}
                              placeholder={t("support_placeholder_desc", "Describe your issue in detail...")}
                              className="min-h-[180px] sm:min-h-[220px]"
                            />
                          </div>
                        )}

                        {card.type === 'TELEMETRY' && (
                          <div className="flex flex-col gap-4">
                            <div className="glass-surface p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-3.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                                    <span className="material-symbols-outlined !text-[18px]">
                                      {t("icon_terminal", "terminal")}
                                    </span>
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-black text-[var(--text)] truncate">
                                      {t("ticket_attached_logs", "Attached Logs")}
                                    </span>
                                    <span className="text-[10px] font-mono text-[var(--subtext)] truncate">
                                      {t("support_telemetry_opt", "Automatic Diagnostics")}
                                    </span>
                                  </div>
                                </div>

                                {(supportStream === "os_bug" || String(activeCategory?.show_logs_box) !== "false") && (
                                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        attachLog();
                                      }}
                                      className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 cursor-pointer transition-all"
                                    >
                                      <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                                        {t("icon_upload_file", "upload_file")}
                                      </span>
                                      <span>{t("attach_logs", "Attach Logs")}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setIsEditingRawTelemetry((prev) => !prev)}
                                      className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1 cursor-pointer transition-all"
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

                              {isEditingRawTelemetry && (supportStream === "os_bug" || String(activeCategory?.show_logs_box) !== "false") && (
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
                                value={
                                  supportStream === "os_bug"
                                    ? `${t("support_stream_os_bug", "OS Bug Report")} (${osPlatform})`
                                    : activeCategory?.category_name || activeTab
                                }
                                icon={supportStream === "os_bug" ? t("icon_bug_report", "bug_report") : t("icon_category", "category")}
                                iconColorClass="text-[var(--accent)]"
                              />
                              <StatBox
                                label={t("ticket_subject_label", "Ticket Subject")}
                                value={title || activeCategory?.category_name || t("support_title", "Support Ticket")}
                                icon={t("icon_receipt_long", "receipt_long")}
                                iconColorClass="text-[var(--accent)]"
                              />
                              {supportStream === "community" && activeCategory?.requires_target_mod && (
                                <StatBox
                                  label={t("target_artifact", "Target {Mod}")}
                                  value={selectedModItem?.displayName || selectedModItem?.name || targetModId || t("none", "None")}
                                  icon={t("icon_extension", "extension")}
                                  iconColorClass="text-[var(--accent)]"
                                />
                              )}
                              {supportStream === "community" && activeCategory?.requires_target_user && (
                                <StatBox
                                  label={t("support_target_user_label", "Target User ID")}
                                  value={targetUserId || t("none", "None")}
                                  icon={t("icon_person", "person")}
                                  iconColorClass="text-[var(--accent)]"
                                />
                              )}
                            </div>

                            {supporterPerkChips && (
                              <div className="flex flex-wrap items-center gap-2">
                                {supporterPerkChips}
                              </div>
                            )}

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
                                  {t("ticket_attached_logs", "Attached Logs")}
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
                                label={isSubmitting || isScanning ? t("scanning", "Submitting...") : t("support_submit", "Submit Ticket")}
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
                              (card.type === 'OS_DETAILS' && (!title.trim() || !description.trim())) ||
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
        isOpen={isResolutionOpen}
        onClose={() => setIsResolutionOpen(false)}
        type="support_lock"
        offendingMods={activeSupportLockMods}
      />
    </>
  );
}
