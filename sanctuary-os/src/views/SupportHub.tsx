import React, { useState, useEffect, useCallback } from "react";
import { supabase, supabaseAuth, getActiveGameClient } from "../supabase";
import { useLexicon } from "../LexiconContext";
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
  UniversalGroup,
  VAULT_CHIP_CLASS,
} from "../shared";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import ArtifactResolutionSidePanel from "../side-panels/ArtifactResolutionSidePanel";
import TicketLogViewer from "../side-panels/TicketLogViewer";
import { UniversalInput, UniversalTextArea, UniversalToggle, SidePanelHeroCard, StatBox } from "../components/universal/UniversalLayout";
import {
  getSupporterState,
  findLocalMasonSupporterPass,
  findAnyActiveMasonSupporterPasses,
  isFoundryPatron,
  isSpokeSupporter,
  LocalMasonSupporter,
  LocalSpokeSupporter,
} from "../utils/supporterManager";
import { scrubLogUserData } from "../utils/logScrubber";
import { isLocalModKnownTier0, verifyKnownTier0CloudHashes } from "../components/LabVerificationGate";
import { isDesktop } from "../utils/envUtils";
import { isRootDomain } from "../utils/routingUtils";
import {
  getCachedComplianceHashTiers,
  resolveComplianceHashTiers,
  collectComplianceLookupHashes,
  normalizeComplianceHash,
  resolveEffectiveModComplianceTier,
} from "../utils/complianceHashTiers";

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

export default function SupportHub({
  onOpenModDossier,
}: { onOpenModDossier?: (mod: any) => void } = {}) {
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
  const [policyViolations, setPolicyViolations] = useState<string[]>([]);
  const [optedOutSources, setOptedOutSources] = useState<string[]>([]);
  const [submitAnonymously, setSubmitAnonymously] = useState(false);
  const [includeLoadoutDiagnostics, setIncludeLoadoutDiagnostics] = useState(false);
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

  // Load Draft Logic (stored in volatile sessionStorage; migrate/clear any legacy localStorage draft)
  useEffect(() => {
    if (!isOpen) return;
    let draft = sessionStorage.getItem('support_draft');
    if (!draft) {
      const legacy = localStorage.getItem('support_draft');
      if (legacy) {
        draft = legacy;
        try {
          sessionStorage.setItem('support_draft', legacy);
        } catch {}
        localStorage.removeItem('support_draft');
      }
    }
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.title || parsed.description || parsed.targetModId || parsed.targetUserId || Object.keys(parsed.customFieldsData || {}).length > 0) {
          setDraftData(parsed);
          setShowDraftPrompt(true);
        }
      } catch(e) {}
    }
  }, [isOpen]);

  // Save Draft Logic (scrub PII/paths and keep only in volatile sessionStorage)
  useEffect(() => {
    if (!isOpen || showDraftPrompt) return;
    const scrubbedCustomFields: Record<string, any> = {};
    for (const [k, v] of Object.entries(customFieldsData || {})) {
      scrubbedCustomFields[k] = typeof v === "string" ? scrubLogUserData(v) : v;
    }
    const data = {
      supportStream,
      osPlatform,
      activeTab,
      title: scrubLogUserData(title || ""),
      description: scrubLogUserData(description || ""),
      targetModId,
      targetUserId,
      logs: scrubLogUserData(logs || ""),
      customFieldsData: scrubbedCustomFields,
      optedOutSources
    };
    try {
      sessionStorage.setItem('support_draft', JSON.stringify(data));
      localStorage.removeItem('support_draft');
    } catch {}
  }, [isOpen, showDraftPrompt, supportStream, osPlatform, activeTab, title, description, targetModId, targetUserId, logs, customFieldsData, optedOutSources]);

  const loadDraft = () => {
    if (draftData) {
      if (draftData.supportStream === "os_bug" || (draftData.supportStream === "community" && hasLoadedSpoke)) {
        setSupportStream(draftData.supportStream);
      }
      if (draftData.osPlatform) setOsPlatform(draftData.osPlatform);
      setActiveTab(draftData.activeTab || "BUG_MOD");
      setTitle(scrubLogUserData(draftData.title || ""));
      setDescription(scrubLogUserData(draftData.description || ""));
      setTargetModId(draftData.targetModId || "");
      setTargetUserId(draftData.targetUserId || "");
      setLogs(scrubLogUserData(draftData.logs || ""));
      setCustomFieldsData(draftData.customFieldsData || {});
      setOptedOutSources(draftData.optedOutSources || []);
    }
    setShowDraftPrompt(false);
  };

  const clearDraft = () => {
    sessionStorage.removeItem('support_draft');
    localStorage.removeItem('support_draft');
    setDraftData(null);
    setShowDraftPrompt(false);
    setTitle("");
    setDescription("");
    setTargetModId("");
    setTargetUserId("");
    setLogs("");
    setCustomFieldsData({});
  };

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

  // Clear error notices when switching category tabs or streams
  useEffect(() => {
    setError("");
    setPolicyViolations([]);
  }, [activeTab, supportStream]);

  useEffect(() => {
    if (!isOpen) {
      setCustomFieldsData({});
      setTitle("");
      setDescription("");
      setFiles([]);
      setError("");
      setIsEditingRawTelemetry(false);
      setSubmitAnonymously(false);
      setIncludeLoadoutDiagnostics(false);
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
          if (!includeLoadoutDiagnostics) continue;
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
        } else if (supportStream === "community" && isDesktop() && modsPath && source.search_path && source.file_pattern) {
          const text = await invoke<string | null>("read_workspace_telemetry_log", {
            sourceRoot: source.search_path,
            relativePattern: source.file_pattern,
          });
          if (text) {
            bundle += `\n--- TELEMETRY: ${source.label} ---\n${scrubLogUserData(text.substring(0, 20000))}\n`;
          }
        }
      } catch {
        // Ignore unavailable optional files during preview
      }
    }

    return scrubLogUserData(bundle.trim());
  }, [isOpen, supportStream, osPlatform, activeCategory, effectiveTelemetrySources, optedOutSources, logs, includeLoadoutDiagnostics]);

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
            author_id: submitAnonymously ? null : user.id,
            ticket_type: "Bug Report",
            title: `[Core Bug • ${osPlatform}] ${scrubLogUserData(title.trim())}`,
            description: scrubLogUserData(description.trim()),
            status: "NEW",
            metadata: {
              logs: combinedLogs,
              is_anonymous: submitAnonymously,
              feedback_meta: {
                platform: osPlatform,
                stream: "Core Bug Report",
                sentiment: "Bug Report",
                auto_captured: includeLoadoutDiagnostics,
                is_anonymous: submitAnonymously,
                author_label: submitAnonymously
                  ? t("anonymous", "Anonymous")
                  : (user.user_metadata?.username || t("term_citizen", "Citizen")),
              },
              ...(!submitAnonymously && activeMasonSupporters[0]
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
        sessionStorage.removeItem("support_draft");
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
            if (!includeLoadoutDiagnostics) continue;
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
          } else if (isDesktop() && modsPath && source.search_path && source.file_pattern) {
            let text = "";
            try {
              const fetched = await invoke<string | null>("read_workspace_telemetry_log", {
                sourceRoot: source.search_path,
                relativePattern: source.file_pattern,
              });
              if (fetched) text = fetched;
            } catch {
              // Optional log file absent or blocked on disk
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

      if (includeLoadoutDiagnostics && currentSet && activeTab.toLowerCase().includes('bug') && !finalLogs.includes('--- TELEMETRY: Attached Blueprint ---')) {
        const bpPayload = scrubLogUserData(JSON.stringify({ sanctuary_profile: true, ...currentSet }, null, 2));
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
        author_id: submitAnonymously ? null : user.id,
        ticket_type: activeTab,
        title: scrubLogUserData(title) || (activeCategory?.category_name || t("support_ticket", "Support Ticket")),
        description: scrubLogUserData(description || t("no_description_provided", "No description provided.")),
        status: "open",
        metadata: {
          is_anonymous: submitAnonymously,
          ...(submitAnonymously
            ? { feedback_meta: { author_label: t("anonymous", "Anonymous") } }
            : {}),
          target_mod_id: activeCategory?.requires_target_mod ? (resolvedCloudTargetModId || null) : null,
          ...(activeCategory?.requires_target_mod && resolvedTargetModName
            ? { target_mod_name: resolvedTargetModName }
            : {}),
          target_user_id: activeCategory?.requires_target_user ? (targetUserId || null) : null,
          logs: scrubbedFinalLogs,
          custom_fields: scrubbedCustomFields,
          ...(!submitAnonymously && primaryMasonPass ? {
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
          ...(!submitAnonymously && spokeSupporterPass ? {
            is_spoke_supporter: true,
            spoke_supporter_id: spokeSupporterPass.spoke_id,
            spoke_supporter_name: spokeSupporterPass.spoke_name,
          } : {}),
          ...(!submitAnonymously && isPatronUser ? {
            is_foundry_patron: true,
            patron_months: patronMonths,
          } : {}),
        }
      }]);

      if (insertErr) throw insertErr;

      window.dispatchEvent(new CustomEvent("sanctuary-tickets-updated"));
      useStore.getState().pushStatus(t("ss_support_success", "Ticket sent successfully"), "success");
      sessionStorage.removeItem("support_draft");
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
  const eligibleTargetMods = modList.filter((m: any) => isLocalModKnownTier0(m));
  const selectedModItem = eligibleTargetMods.find(
    (m: any) => m.dbId === targetModId || m.id === targetModId || m.hash === targetModId
  );
  const resolvedSelectedModItem =
    selectedModItem ||
    (targetModId
      ? modList.find(
          (m: any) => m.dbId === targetModId || m.id === targetModId || m.hash === targetModId
        )
      : null);

  const supportMissingReasons: string[] = [];
  if (isFormDisabled) {
    supportMissingReasons.push(
      t(
        "support_blueprint_lock_short",
        "Unequip non-Tier-0 {mods} from active {blueprint} (or switch to OS Bug Report)"
      )
    );
  } else if (supportStream === "os_bug") {
    if (!title.trim()) {
      supportMissingReasons.push(t("ticket_subject_label", "Ticket Subject"));
    }
    if (!description.trim()) {
      supportMissingReasons.push(t("support_step_desc", "Issue Description"));
    }
  } else {
    if (activeCategory?.requires_target_mod && !targetModId) {
      supportMissingReasons.push(t("target_artifact", "Target {Mod}"));
    }
    if (activeCategory?.requires_target_user && !targetUserId.trim()) {
      supportMissingReasons.push(t("support_target_user_label", "Target User ID"));
    }
    if (Array.isArray(activeCategory?.custom_fields)) {
      for (const field of activeCategory.custom_fields) {
        if (field.required) {
          const val = customFieldsData[field.id];
          if (
            val === undefined ||
            val === null ||
            val === "" ||
            (Array.isArray(val) && val.length === 0)
          ) {
            supportMissingReasons.push(String(field.label || field.id));
          }
        }
      }
    }
    if (String(activeCategory?.show_title_box) !== "false" && !title.trim()) {
      supportMissingReasons.push(t("ticket_subject_label", "Ticket Subject"));
    }
    if (String(activeCategory?.show_description_box) !== "false" && !description.trim()) {
      supportMissingReasons.push(t("support_step_desc", "Issue Description"));
    }
  }

  const isSubmitDisabled = isSubmitting || isScanning || supportMissingReasons.length > 0;
  const supportSubmitTooltipTitle =
    isSubmitting || isScanning
      ? t("scanning", "Submitting...")
      : supportMissingReasons.length > 0
        ? t("form_incomplete_tooltip_title", "Complete Required Fields to Submit")
        : t("support_submit", "Submit Ticket");
  const supportSubmitTooltipSub =
    !(isSubmitting || isScanning) && supportMissingReasons.length > 0
      ? `${t("form_missing_prefix", "Missing:")} ${supportMissingReasons.slice(0, 4).join(" • ")}${
          supportMissingReasons.length > 4
            ? ` (+${supportMissingReasons.length - 4})`
            : ""
        }`
      : undefined;

  const showTelemetrySection =
    supportStream === "os_bug" ||
    Boolean(activeCategory?.telemetry_config?.sources?.length > 0) ||
    String(activeCategory?.show_logs_box) !== "false";

  const selectedModTitle =
    resolvedSelectedModItem?.displayName ||
    resolvedSelectedModItem?.name ||
    targetModId;
  const selectedModAuthor =
    resolvedSelectedModItem?.author ||
    resolvedSelectedModItem?.master_author ||
    t("label_unknown_author", "Unknown Author");
  const selectedModVersion =
    resolvedSelectedModItem?.version || resolvedSelectedModItem?.version_label || "";

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("support_title", "Submit A Ticket")}
        subtitle={t("sidebar_support", "Support & Feedback")}
        icon={t("icon_support_agent", "support_agent")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[92vw] md:w-[760px]"
        headerActions={
          !showDraftPrompt ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_restart_alt", "restart_alt")}
                tooltip={t("reset", "Reset")}
                onClick={clearDraft}
              />
              <PanelHeaderButton
                icon={isSubmitting || isScanning ? t("icon_sync", "sync") : t("icon_send", "send")}
                tooltip={supportSubmitTooltipTitle}
                tooltipSubtitle={supportSubmitTooltipSub}
                variant="accent"
                disabled={isSubmitDisabled}
                onClick={submitTicket}
              />
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
            variant={isFormDisabled ? "warning" : "accent"}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
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
                label={
                  supportStream === "os_bug"
                    ? t("landing_feedback_form_platform", "Target Platform")
                    : activeCategory?.requires_target_mod
                      ? t("target_artifact", "Target {Mod}")
                      : t("tab_workspace", "Workspace")
                }
                value={
                  supportStream === "os_bug"
                    ? osPlatform
                    : activeCategory?.requires_target_mod
                      ? (targetModId ? selectedModTitle : t("none", "None"))
                      : activeSpokeName
                }
                icon={
                  supportStream === "os_bug"
                    ? t("icon_desktop_windows", "desktop_windows")
                    : activeCategory?.requires_target_mod
                      ? t("icon_extension", "extension")
                      : t("icon_hub", "hub")
                }
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

          {supportStream === "os_bug" ? (
            <UniversalGroup
              title={t("support_os_bug_details", "OS Bug Details")}
              icon={t("icon_bug_report", "bug_report")}
            >
              <div className="flex flex-col gap-1.5 relative z-[60]">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 px-1 leading-tight">
                  {t("landing_feedback_form_platform", "Target Platform")}
                </label>
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
                placeholder={t("support_placeholder_title", "Enter a concise title...")}
              />
              <UniversalTextArea
                label={`${t("support_step_desc", "Issue Description")} *`}
                value={description}
                onChange={setDescription}
                placeholder={t("support_placeholder_desc", "Describe your issue and reproduction steps...")}
                className="min-h-[170px] sm:min-h-[200px]"
              />
            </UniversalGroup>
          ) : (
            <>
              <UniversalGroup
                title={t("support_category", "Category")}
                icon={t("icon_category", "category")}
              >
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
                        <p className="text-xs text-[var(--subtext)] leading-relaxed m-0">
                          {activeCategory.description || t("support_wizard_subtitle", "Select a support channel and complete each step below to submit your ticket.")}
                        </p>
                      </div>
                    </div>
                    {(activeCategory.requires_target_mod ||
                      activeCategory.requires_target_user ||
                      activeCategory.telemetry_config?.sources?.length > 0 ||
                      String(activeCategory.show_logs_box) !== "false" ||
                      supporterPerkChips) && (
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
                        {supporterPerkChips}
                      </div>
                    )}
                  </div>
                )}
              </UniversalGroup>

              <div className={isFormDisabled ? "flex flex-col gap-4 opacity-40 pointer-events-none select-none" : "flex flex-col gap-4"}>
                {(activeCategory?.requires_target_mod || activeCategory?.requires_target_user) && (
                  <UniversalGroup
                    title={t("support_group_target", "Target Selection")}
                    icon={t("icon_extension", "extension")}
                  >
                    {activeCategory?.requires_target_mod && (
                      <div className="flex flex-col gap-3 relative z-[60]">
                        {!targetModId ? (
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 px-1 leading-tight">
                              {`${t("target_artifact", "Target {Mod}")} *`}
                            </label>
                            <ModSearchDropdown
                              modList={eligibleTargetMods}
                              placeholder={t("support_placeholder_mod_uuid", "{Mod} UUID...") || "Select Mod..."}
                              selectedItem={null}
                              onSelect={(m: any) => setTargetModId(m.dbId || m.id || m.hash)}
                              onClear={() => setTargetModId("")}
                              onPreviewItem={onOpenModDossier}
                            />
                          </div>
                        ) : (
                          <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                                <span className="material-symbols-outlined !text-[18px]">
                                  {t("icon_extension", "extension")}
                                </span>
                              </div>
                              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                <span className="text-sm font-black text-[var(--text)] truncate">
                                  {selectedModTitle}
                                </span>
                                <span className="text-xs text-[var(--subtext)] truncate">
                                  {`${selectedModAuthor}${selectedModVersion ? ` • ${selectedModVersion}` : ""} • #${String(targetModId).slice(0, 8)}`}
                                </span>
                              </div>
                            </div>

                            <div className="ml-auto flex items-center gap-2 shrink-0">
                              {resolvedSelectedModItem && onOpenModDossier && (
                                <button
                                  type="button"
                                  onClick={() => onOpenModDossier(resolvedSelectedModItem)}
                                  className="px-3 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[11px] font-black text-[var(--text)] flex items-center gap-1.5 cursor-pointer transition-all"
                                >
                                  <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                                    {t("icon_menu_book", "menu_book")}
                                  </span>
                                  <span>{t("view_dossier", "View Dossier")}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                aria-label={t("btn_remove", "{Remove}")}
                                onClick={() => setTargetModId("")}
                                className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--danger)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer transition-all shrink-0"
                              >
                                <span className="material-symbols-outlined !text-[15px]">
                                  {t("icon_close", "close")}
                                </span>
                              </button>
                            </div>
                          </div>
                        )}

                        {matchedSupporterPass && (
                          <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-start gap-3.5 animate-in fade-in duration-300">
                            <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--success)] shrink-0">
                              <span className="material-symbols-outlined !text-[20px]">{t("icon_bolt", "bolt")}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-black uppercase tracking-widest text-[var(--success)] flex items-center gap-1.5">
                                {t("supporter_ticket_expedited_banner", "Verified {Mason} Supporter — Priority Support Active")}
                              </span>
                              <p className="text-[11px] font-semibold text-[var(--subtext)] leading-relaxed m-0">
                                {t("supporter_ticket_expedited_desc", "Your local Supporter Pass was verified for this {mason}. This ticket will be flagged for Priority Queue routing without exposing your subscription list.")}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeCategory?.requires_target_user && (
                      <UniversalInput
                        label={`${t("support_target_user_label", "Target User ID")} *`}
                        value={targetUserId}
                        onChange={setTargetUserId}
                        placeholder={t("support_placeholder_user_uuid", "User UUID...")}
                        className="font-mono"
                      />
                    )}
                  </UniversalGroup>
                )}

                {activeCategory?.custom_fields?.length > 0 && (
                  <UniversalGroup
                    title={t("support_group_additional", "Additional Details")}
                    icon={t("icon_tune", "tune")}
                  >
                    {activeCategory.custom_fields.map((field: any) => (
                      <div key={field.id} className="flex flex-col gap-1.5 w-full">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 px-1 leading-tight">
                          {`${field.label}${field.required ? " *" : ""}`}
                        </label>
                        {field.type === "TEXT INPUT" && (
                          <UniversalInput
                            value={customFieldsData[field.id] || ""}
                            onChange={(val: string) => setCustomFieldsData(prev => ({ ...prev, [field.id]: val }))}
                            placeholder={field.label}
                          />
                        )}
                        {field.type === "TEXTAREA" && (
                          <UniversalTextArea
                            value={customFieldsData[field.id] || ""}
                            onChange={(val: string) => setCustomFieldsData(prev => ({ ...prev, [field.id]: val }))}
                            placeholder={field.label}
                            className="min-h-[140px]"
                          />
                        )}
                        {field.type === "DROPDOWN" && (
                          <div className="relative z-[50]">
                            <CustomDropdown
                              disableTint={true}
                              value={customFieldsData[field.id] || (field.allow_multi_select ? [] : "")}
                              options={field.options?.map((opt: string) => ({ id: opt, label: opt })) || []}
                              onChange={(val: any) => setCustomFieldsData(prev => ({ ...prev, [field.id]: field.allow_multi_select ? val : val[0] }))}
                              allowMultiSelect={field.allow_multi_select}
                            />
                          </div>
                        )}
                        {field.type === "CHECKBOX" && (
                          (!field.options || field.options.length === 0) ? (
                            <UniversalToggle
                              checked={customFieldsData[field.id] === "true"}
                              onChange={(val: boolean) => setCustomFieldsData(prev => ({ ...prev, [field.id]: val ? "true" : "" }))}
                              label={t("label_yes", "Yes") || "Yes"}
                            />
                          ) : (
                            <div className="flex flex-col gap-2">
                              {field.options.map((opt: string) => {
                                const isChecked = field.allow_multi_select
                                  ? (customFieldsData[field.id] || []).includes(opt)
                                  : customFieldsData[field.id] === opt;
                                return (
                                  <SidePanelPillToggle
                                    key={opt}
                                    checked={isChecked}
                                    label={opt}
                                    onChange={() => {
                                      setCustomFieldsData(prev => {
                                        if (field.allow_multi_select) {
                                          const arr = (Array.isArray(prev[field.id]) ? prev[field.id] : []) as string[];
                                          if (arr.includes(opt)) return { ...prev, [field.id]: arr.filter((x: string) => x !== opt) };
                                          else return { ...prev, [field.id]: [...arr, opt] };
                                        } else {
                                          return { ...prev, [field.id]: isChecked ? "" : opt };
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
                    ))}
                  </UniversalGroup>
                )}

                {String(activeCategory?.show_description_box) !== "false" && (
                  <UniversalGroup
                    title={t("support_desc", "Ticket Description")}
                    icon={t("icon_description", "description")}
                  >
                    {String(activeCategory?.show_title_box) !== "false" && (
                      <UniversalInput
                        label={`${t("ticket_subject_label", "Ticket Subject")} *`}
                        value={title}
                        onChange={setTitle}
                        placeholder={t("support_placeholder_title", "Enter a concise title...")}
                      />
                    )}
                    <UniversalTextArea
                      label={`${t("support_step_desc", "Issue Description")} *`}
                      value={description}
                      onChange={setDescription}
                      placeholder={t("support_placeholder_desc", "Describe your issue in detail...")}
                      className="min-h-[170px] sm:min-h-[200px]"
                    />
                  </UniversalGroup>
                )}
              </div>
            </>
          )}

          {showTelemetrySection && (
            <UniversalGroup
              title={t("ticket_attached_logs", "Attached Logs")}
              icon={t("icon_terminal", "terminal")}
              className={isFormDisabled ? "opacity-40 pointer-events-none select-none" : undefined}
              headerAction={
                (supportStream === "os_bug" || String(activeCategory?.show_logs_box) !== "false") && (
                  <div className="flex flex-wrap items-center gap-2 py-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        attachLog();
                      }}
                      className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                        {t("icon_upload_file", "upload_file")}
                      </span>
                      <span>{t("attach_logs", "Attach Logs")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingRawTelemetry((prev) => !prev)}
                      className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1 cursor-pointer transition-all"
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
                )
              }
            >
              {effectiveTelemetrySources.length > 0 && (
                <div className="flex flex-col gap-2">
                  {effectiveTelemetrySources.map((source: any) => {
                    if (source.type === "OS") {
                      return (
                        <SidePanelPillToggle
                          key={source.id}
                          checked={includeLoadoutDiagnostics}
                          icon={t("icon_memory", "memory")}
                          label={t("support_include_diag_toggle", "Include Scrubbed {Vault} & System Diagnostics")}
                          description={
                            includeLoadoutDiagnostics
                              ? t("support_include_diag_on", "Scrubbed {Blueprint}, OS & session logs included")
                              : t("support_include_diag_off", "Excluded by default — zero loadout telemetry sent")
                          }
                          onChange={() => setIncludeLoadoutDiagnostics((v) => !v)}
                        />
                      );
                    }
                    const isOptedOut = optedOutSources.includes(source.id);
                    return (
                      <SidePanelPillToggle
                        key={source.id}
                        checked={!isOptedOut}
                        icon={t("icon_folder", "folder")}
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
            </UniversalGroup>
          )}

          <div className={isFormDisabled ? "flex flex-col gap-4 opacity-40 pointer-events-none select-none" : "flex flex-col gap-4"}>
            <SidePanelPillToggle
              checked={submitAnonymously}
              icon={t("icon_visibility_off", "visibility_off")}
              label={t("support_submit_anon_toggle", "Submit Ticket Anonymously")}
              description={t("support_submit_anon_desc", "Omit your account ID from this ticket submission.")}
              onChange={() => setSubmitAnonymously((v) => !v)}
            />
          </div>

          <ActionButton
            variant="primary"
            className="w-full"
            icon={isSubmitting || isScanning ? t("icon_sync", "sync") : t("icon_send", "send")}
            label={isSubmitting || isScanning ? t("scanning", "Submitting...") : t("support_submit", "Submit Ticket")}
            disabled={isSubmitDisabled}
            tooltip={supportSubmitTooltipTitle}
            tooltipSubtitle={supportSubmitTooltipSub}
            onClick={submitTicket}
          />
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
