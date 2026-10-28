import { useState, useEffect, useRef } from "react";
import { supabase, supabaseAuth, getActiveGameClient } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore, getSafeSchema } from "../store";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  ActionButton,
  CustomDropdown,
  PanelHeaderGroup,
  PanelHeaderButton,
  DashboardStatTile,
  EmptyState,
  HoverTooltip,
} from "../shared";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
  SidePanelTitleInput,
} from "../components/layouts/ElevatedHubLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
import MasonEditorPanel from "./MasonEditorPanel";
import { useMasonFiles } from "../hooks/useMasonFiles";
import {
  deepCountKeys,
  deepCompare,
  deepAddMissing,
  deepPurgeDeprecated,
} from "../lib/MasonValidation";
import { useTheme } from "../ThemeContext";
import { defineSanctuaryMonacoThemes, useSanctuaryMonacoTheme } from "../utils/monacoTheme";
import {
  CANONICAL_DIRECTIVES,
  SPOKE_SCHEMA_SQL,
  HUB_SCHEMA_SQL,
  COMPLIANCE_PROTOCOL_MD,
  PARTNERS_AGREEMENT_MD,
  fetchSyncedLegalAndCovenants,
} from "../utils/directivesSync";
import MarkdownRenderer from "../MarkdownRenderer";
import {
  StructuredReleaseNotesView,
  LegalDocVersionInfoBlock,
  cleanPostBodyForViewer,
  useStableReleaseMeta,
} from "../components/ReleaseNotesShowcase";
import { AuditLogViewer } from "../side-panels/SAAuditLogViewer";
import { isCoreOnlyAuditRow } from "../lib/audit";
import WayfinderKeeperTickets from "../WayfinderKeeperTickets";
import TicketDossierSidePanel from "../side-panels/TicketDossierSidePanel";
import WayfinderSupportSidePanel from "../side-panels/WayfinderSupportSidePanel";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

const STANDALONE_MANUAL_SNIPPET = `export const SANCTUARY_CONFIG = {
  uplinkBundle: "",
  mode: "standalone",
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
};`;

const HUB_AND_SPOKE_FORK_SNIPPET = `export const SANCTUARY_CONFIG = {
  uplinkBundle: "",
  mode: "hub_and_spoke",
  supabaseUrl: "https://YOUR_HUB_PROJECT_ID.supabase.co",
  supabaseAnonKey: "YOUR_HUB_SUPABASE_ANON_KEY",
};`;

export default function WayfinderMasterSchemas({
  initialTab = "overview",
}: {
  initialTab?: string;
}) {
  const { t } = useLexicon();
  const session = useStore((state: any) => state.session);
  const pushStatus = useStore((state: any) => state.pushStatus);
  const workspaces = useStore((state: any) => state.workspaces);
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const activeWs = (workspaces || []).find((w: any) => w.id === activeWorkspaceId);

  const resolveInitialTab = (tab: string) => {
    if (tab === "audit_logs") return "audit_logs";
    if (tab === "keepers_support") return "keepers_support";
    if (
      tab === "spoke_setup" ||
      tab === "spoke_sever" ||
      tab === "forking_help" ||
      tab === "donations" ||
      tab === "schemas"
    ) {
      return "spoke_setup";
    }
    return "overview";
  };

  const [activeTab, setActiveTab] = useState<string>(() => resolveInitialTab(initialTab));
  const [searchQuery, setSearchQuery] = useState("");
  const [spokeSectionFilter, setSpokeSectionFilter] = useState<"all" | "spoke_ops" | "schemas">(
    "all"
  );

  // Active Spoke Operation SidePanel ("setup" | "sever" | "forking" | "donations" | null)
  const [activeSpokePanel, setActiveSpokePanel] = useState<
    "setup" | "sever" | "forking" | "donations" | null
  >(() => {
    if (initialTab === "spoke_sever") return "sever";
    if (initialTab === "forking_help") return "forking";
    if (initialTab === "donations") return "donations";
    return null;
  });

  useEffect(() => {
    if (!initialTab) return;
    setActiveTab(resolveInitialTab(initialTab));
    if (initialTab === "spoke_sever") setActiveSpokePanel("sever");
    else if (initialTab === "forking_help") setActiveSpokePanel("forking");
    else if (initialTab === "donations") setActiveSpokePanel("donations");
  }, [initialTab]);

  // Spoke Setup & Uplink State
  const [uplinkUrl, setUplinkUrl] = useState("");
  const [uplinkAnonKey, setUplinkAnonKey] = useState("");
  const [uplinkServiceKey, setUplinkServiceKey] = useState("");
  const [updatingKeys, setUpdatingKeys] = useState(false);

  // Spoke Sever State
  const [severReason, setSeverReason] = useState("");
  const [confirmSever, setConfirmSever] = useState(false);
  const [isSevering, setIsSevering] = useState(false);

  // Donations State
  const [processor, setProcessor] = useState("STRIPE");
  const [donationUrl, setDonationUrl] = useState("");
  const [savingDonation, setSavingDonation] = useState(false);

  // Interactive Forking Guide SidePanel State
  const [forkTab, setForkTab] = useState<"spoke" | "standalone" | "sql">("spoke");
  const [forkModeIdx, setForkModeIdx] = useState<0 | 1>(0);
  const [sqlSchemaTab, setSqlSchemaTab] = useState<"spoke" | "hub">("spoke");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Partners Agreement & Compliance Protocol Viewer State
  const [isCovenantPanelOpen, setIsCovenantPanelOpen] = useState(false);
  const [covenantDocTab, setCovenantDocTab] = useState<
    "partners_agreement" | "compliance_protocol"
  >("partners_agreement");
  const [covenantViewMode, setCovenantViewMode] = useState<"ui" | "normal">("ui");
  const { stableVersion } = useStableReleaseMeta();

  // Audit Logs & Keepers Support Counts & Overview Previews
  const [auditFilterAction, setAuditFilterAction] = useState("ALL");
  const [auditTimeRange, setAuditTimeRange] = useState("ALL");
  const openAuditRetentionRef = useRef<(() => void) | null>(null);
  const [auditLogsCount, setAuditLogsCount] = useState<number>(0);
  const [overviewAuditLogs, setOverviewAuditLogs] = useState<any[]>([]);

  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [isCreateSupportOpen, setIsCreateSupportOpen] = useState(false);
  const [ticketStatusFilter, setTicketStatusFilter] = useState<
    "all" | "open" | "pending" | "closed"
  >("all");
  const [ticketsCount, setTicketsCount] = useState<number>(0);
  const [overviewTickets, setOverviewTickets] = useState<any[]>([]);
  const [syncedPartnersMd, setSyncedPartnersMd] = useState<string>(
    PARTNERS_AGREEMENT_MD
  );
  const [syncedComplianceMd, setSyncedComplianceMd] = useState<string>(
    COMPLIANCE_PROTOCOL_MD
  );

  useEffect(() => {
    const loadSyncedCovenants = async () => {
      const map = await fetchSyncedLegalAndCovenants();
      if (map.PartnersAgreement?.content) {
        setSyncedPartnersMd(map.PartnersAgreement.content);
      }
      if (map.ComplianceProtocol?.content) {
        setSyncedComplianceMd(map.ComplianceProtocol.content);
      }
    };
    loadSyncedCovenants();
    window.addEventListener("sanctuary_directives_updated", loadSyncedCovenants);
    return () =>
      window.removeEventListener(
        "sanctuary_directives_updated",
        loadSyncedCovenants
      );
  }, []);

  // Master Schemas Cloud Files Hook
  const mason = useMasonFiles({
    isCloudMode: true,
    cloudTarget: "sanctuary_schemas",
    isKeepers: false,
  });

  const {
    files: schemaFiles,
    showTimeline,
    setShowTimeline,
    problemsList,
    setProblemsList,
    activeVersionTimestamp,
    setActiveVersionTimestamp,
    editorRef,
    setEditorRef,
    renamingFile,
    setRenamingFile,
    renameInput,
    setRenameInput,
    renameExt,
    setRenameExt,
    deleteConfirmPath,
    setDeleteConfirmPath,
    isCreatePanelOpen,
    setIsCreatePanelOpen,
    createFileName,
    setCreateFileName,
    createFileExt,
    setCreateFileExt,
    showReference,
    setShowReference,
    referenceData,
    referenceLabel,
    splitRatio,
    setSplitRatio,
    isFullscreen,
    setIsFullscreen,
    openFiles,
    setOpenFiles,
    activeFileIndex,
    setActiveFileIndex,
    validateContent,
    openFile,
    closeFile,
    handleEditorChange,
    handleDeleteFile,
    handleRenameSubmit,
    handleCreateSubmit,
    handleImport,
  } = mason;

  const isResizing = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      setSplitRatio((prev: number) => {
        const containerWidth = window.innerWidth - 300;
        const deltaPct = (e.movementX / containerWidth) * 100;
        return Math.max(20, Math.min(80, prev + deltaPct));
      });
    };
    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = "default";
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim();
  const bgHex = bg.replace("#", "");
  const r = parseInt(bgHex.substring(0, 2), 16) || 0;
  const g = parseInt(bgHex.substring(2, 4), 16) || 0;
  const b = parseInt(bgHex.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const isLight = luminance > 0.5;

  const { currentTheme } = useTheme();
  useSanctuaryMonacoTheme(currentTheme, isLight);

  const handleEditorWillMount = (monaco: any) => {
    defineSanctuaryMonacoThemes(monaco, currentTheme);
  };

  useEffect(() => {
    if (activeWs) {
      setUplinkUrl(activeWs.supabase_url || "");
      setUplinkAnonKey(activeWs.supabase_anon_key || "");
      setUplinkServiceKey("");
    }
  }, [activeWs?.id]);

  // Preload Audit Logs count & Keepers Support Tickets count so top tiles are always populated
  useEffect(() => {
    const preloadTelemetry = async () => {
      try {
        if (session?.user?.id) {
          const { data: tData } = await supabaseAuth
            .from("keeper_tickets")
            .select("*")
            .eq("author_id", session.user.id)
            .order("created_at", { ascending: false });
          if (tData) {
            setTicketsCount(tData.length);
            setOverviewTickets(tData);
          }
        }
      } catch {}

      try {
        const targetClient = getActiveGameClient();
        if (targetClient) {
          const { data: lData } = await targetClient
            .from("audit_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100);
          if (lData) {
            const spokeLogs = lData.filter((r: any) => !isCoreOnlyAuditRow(r));
            setAuditLogsCount(spokeLogs.length);
            setOverviewAuditLogs(spokeLogs);
          }
        }
      } catch {}
    };
    preloadTelemetry();
  }, [session?.user?.id, activeWorkspaceId, isCreateSupportOpen]);

  useEffect(() => {
    const loadDonationConfig = async () => {
      const { getLocalPartnerDonationOverride } = await import("../utils/supporterManager");
      const localOverride =
        getLocalPartnerDonationOverride(activeWs?.schema_id) ||
        getLocalPartnerDonationOverride(activeWorkspaceId);
      if (localOverride) {
        setDonationUrl(localOverride.donation_url || "");
        setProcessor((localOverride.payment_processor || "STRIPE").toUpperCase());
      } else if (activeWs) {
        setDonationUrl(activeWs.donation_url || "");
        setProcessor((activeWs.payment_processor || "STRIPE").toUpperCase());
      }
      if (activeWs?.schema_id) {
        const { data } = await supabase
          .from("sanctuary_games")
          .select("donation_url, payment_processor")
          .ilike("schema_id", activeWs.schema_id)
          .maybeSingle();
        if (data) {
          if (data.donation_url !== undefined && data.donation_url !== null) {
            setDonationUrl(data.donation_url);
          }
          if (data.payment_processor) {
            setProcessor(String(data.payment_processor).toUpperCase());
          }
        }
      }
    };
    loadDonationConfig();
  }, [activeWorkspaceId, activeWs?.schema_id]);

  const handleCopyUplinkBundle = () => {
    const payload = {
      name: activeWs?.name || activeWs?.schema_id || "Community Spoke",
      schema_id: (activeWs?.schema_id || activeWs?.id || "").toUpperCase(),
      supabase_url: uplinkUrl.trim(),
      supabase_anon_key: uplinkAnonKey.trim(),
      supabase_service_key: uplinkServiceKey.trim() || undefined,
      founder_identifier: session?.user?.id || undefined,
    };
    const token = "SANCTUARY-UPLINK://" + btoa(JSON.stringify(payload));
    navigator.clipboard.writeText(token);
    pushStatus(
      t("spoke_uplink_bundle_copied", "Spoke Uplink Bundle copied to clipboard!"),
      "success"
    );
  };

  const handleCopySpokeSql = () => {
    navigator.clipboard.writeText(SPOKE_SCHEMA_SQL || "");
    pushStatus(t("alert_saved", "Copied to clipboard"), "success");
  };

  const handleCopyCode = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    pushStatus(t("alert_saved", "Copied to clipboard"), "success");
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 2200);
  };

  const handleUpdateKeys = async () => {
    if (!uplinkUrl.trim() || !uplinkAnonKey.trim() || !uplinkServiceKey.trim()) {
      pushStatus(t("fill_required_fields", "Please fill all required fields"), "error");
      return;
    }
    setUpdatingKeys(true);
    try {
      const res: any = await supabase.rpc("secure_update_spoke_uplink", {
        p_payload: {
          supabase_url: uplinkUrl.trim(),
          supabase_anon_key: uplinkAnonKey.trim(),
          supabase_service_key: uplinkServiceKey.trim(),
        },
      });
      if (res?.error || res?.data?.error) {
        throw new Error(res?.error?.message || res?.data?.error);
      }
      const { syncGameDatabases } = await import("../store");
      await syncGameDatabases();
      setUplinkServiceKey("");
      pushStatus(
        t("wf_uplink_keys_updated", "Spoke uplink keys verified and updated on the Hub."),
        "success"
      );
    } catch (err: any) {
      pushStatus(err.message, "error");
    } finally {
      setUpdatingKeys(false);
    }
  };

  const handleCutTheCord = async () => {
    if (!confirmSever) {
      setConfirmSever(true);
      setTimeout(() => setConfirmSever(false), 4500);
      return;
    }
    setIsSevering(true);
    try {
      const res: any = await supabase.rpc("secure_sever_spoke_cord", {
        p_payload: {
          reason:
            severReason.trim() ||
            "Community Executed Cut the Cord (Bilateral Sovereignty Severance)",
        },
      });
      if (res?.error || res?.data?.error) {
        throw new Error(res?.error?.message || res?.data?.error);
      }
      const { syncGameDatabases } = await import("../store");
      await syncGameDatabases();
      pushStatus(
        t(
          "wf_cut_cord_success",
          "Uplink severed. Your Spoke database is now independent and its service key has been scrubbed from the Hub."
        ),
        "info"
      );
      setConfirmSever(false);
      setActiveSpokePanel(null);
    } catch (err: any) {
      pushStatus(err.message, "error");
    } finally {
      setIsSevering(false);
    }
  };

  const handleSaveDonation = async () => {
    if (savingDonation) return;
    setSavingDonation(true);
    try {
      const { savePartnerCommunityDonationConfig } = await import("../utils/supporterManager");
      await savePartnerCommunityDonationConfig({
        gameId: activeWs?.id || activeWorkspaceId,
        schemaId: activeWs?.schema_id || activeWorkspaceId,
        donationUrl,
        paymentProcessor: processor,
      });
      const { syncGameDatabases } = await import("../store");
      await syncGameDatabases();
      pushStatus(
        t("wf_donation_saved_toast", "Partner Community donation settings updated!"),
        "success"
      );
      setActiveSpokePanel(null);
    } catch (err: any) {
      pushStatus(err?.message || String(err), "error");
    } finally {
      setSavingDonation(false);
    }
  };

  // Schema Editor Save & Validation
  const saveFile = async () => {
    if (activeFileIndex < 0) return;
    const file = openFiles[activeFileIndex];
    try {
      const parsed = JSON.parse(file.content);
      if (!parsed.schema_version || typeof parsed.schema_version !== "number")
        parsed.schema_version = 0;
      parsed.schema_version++;

      const updatedContent = JSON.stringify(parsed, null, 2);
      const fileId = file.name.replace(/\.json$/i, "");

      const payload = {
        id: fileId,
        name: parsed.manifest_name || fileId,
        schema_data: parsed,
        version: parsed.schema_version || 1,
        updated_at: new Date().toISOString(),
      };

      const token = useStore.getState().session?.access_token;
      if (token) {
        const { error } = await supabase.rpc("secure_upsert_cloud_file", {
          p_token: token,
          p_target: "sanctuary_schemas",
          p_payload: payload,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sanctuary_schemas").upsert(payload as any);
        if (error) throw error;
      }

      if (fileId === useStore.getState().activeGameSchema?.id) {
        useStore
          .getState()
          .setActiveGameSchema(getSafeSchema(parsed, parsed.id || "default_schema"));
      }

      const newFiles = [...openFiles];
      newFiles[activeFileIndex].content = updatedContent;
      newFiles[activeFileIndex].originalContent = updatedContent;
      setOpenFiles(newFiles);
      setActiveVersionTimestamp(null);
      pushStatus(t("alert_saved", "Saved"), "success");
    } catch {
      pushStatus(t("alert_error", "Error"), "error");
    }
  };

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;
  const isDirty = activeFile ? activeFile.content !== activeFile.originalContent : false;

  let validationStats: {
    total: number;
    missing: number;
    completelyMissing: number;
    deprecated: number;
  } | null = null;
  if (activeFile && referenceData && Object.keys(referenceData).length > 0) {
    try {
      const parsed = JSON.parse(activeFile.content);
      const total = deepCountKeys(referenceData);
      const stats = deepCompare(referenceData, parsed, false);
      validationStats = { total, ...stats };
    } catch {}
  }

  const addMissingStrings = () => {
    if (!activeFile || !referenceData || Object.keys(referenceData).length === 0) return;
    try {
      const parsed = JSON.parse(activeFile.content);
      const newObj = deepAddMissing(referenceData, parsed, false);
      const newContent = JSON.stringify(newObj, null, 2);
      if (editorRef && editorRef.getModel()) {
        const model = editorRef.getModel();
        const fullRange = model.getFullModelRange();
        editorRef.executeEdits("add-missing", [
          { range: fullRange, text: newContent, forceMoveMarkers: true },
        ]);
      } else {
        handleEditorChange(newContent);
      }
    } catch {
      pushStatus(t("alert_error", "Error"), "error");
    }
  };

  const purgeDeprecatedStrings = () => {
    if (!activeFile || !referenceData || Object.keys(referenceData).length === 0) return;
    try {
      const parsed = JSON.parse(activeFile.content);
      const newObj = deepPurgeDeprecated(referenceData, parsed, false);
      const newContent = JSON.stringify(newObj, null, 2);
      if (editorRef && editorRef.getModel()) {
        const model = editorRef.getModel();
        const fullRange = model.getFullModelRange();
        editorRef.executeEdits("purge-deprecated", [
          { range: fullRange, text: newContent, forceMoveMarkers: true },
        ]);
      } else {
        handleEditorChange(newContent);
      }
    } catch {
      pushStatus(t("alert_error", "Error"), "error");
    }
  };

  const jumpToNextEmpty = () => {
    if (!editorRef) return;
    const model = editorRef.getModel();
    if (!model) return;
    const matches = model.findMatches(
      '"[^"]+"\\s*:\\s*(""|\\[\\]|\\{\\})',
      false,
      true,
      false,
      null,
      true
    );
    if (matches && matches.length > 0) {
      const position = editorRef.getPosition();
      if (!position) return;
      let nextMatch = matches.find(
        (m: any) =>
          m.range.startLineNumber > position.lineNumber ||
          (m.range.startLineNumber === position.lineNumber &&
            m.range.startColumn > position.column)
      );
      if (!nextMatch) nextMatch = matches[0];
      editorRef.revealLineInCenter(nextMatch.range.startLineNumber);
      editorRef.setPosition({
        lineNumber: nextMatch.range.endLineNumber,
        column: nextMatch.range.endColumn - 1,
      });
      editorRef.focus();
    }
  };

  const spokeAndSchemaCount = 5 + (schemaFiles?.length || 0);
  const totalOverviewItems = spokeAndSchemaCount + ticketsCount;

  // 4 Top StatTileCarousel Tabs — every single tile has a live number value & zero horizontal overflow
  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: t("icon_dashboard", "dashboard"),
      number: String(totalOverviewItems),
    },
    {
      id: "spoke_setup",
      label: t("wf_tab_spoke_setup", "Spoke & Setup"),
      icon: t("icon_settings_ethernet", "settings_ethernet"),
      number: String(spokeAndSchemaCount),
    },
    {
      id: "audit_logs",
      label: t("audit_logs", "Audit Logs"),
      icon: t("icon_history", "history"),
      number: String(auditLogsCount),
    },
    {
      id: "keepers_support",
      label: t("wf_tab_keepers_support", "Keepers Support"),
      icon: t("icon_admin_panel_settings", "admin_panel_settings"),
      number: String(ticketsCount),
    },
  ];

  const auditFilterOptions = [
    { id: "ALL", label: t("all_logs", "All Logs") },
    { id: "MALWARE", label: t("filter_malware_edits", "Malware Edits") },
    { id: "mods", label: t("term_mods", "{Mods}") },
    { id: "profiles", label: t("tab_identities", "Identity") },
    { id: "sanctuary_tickets", label: t("support_tickets", "Support Tickets") },
    { id: "nexus_assets", label: t("tab_nexus", "{Nexus}") },
  ];

  // --- UniversalCards for Spoke Operations & Master Schemas ---

  const renderSpokeSetupCard = () => {
    const isConnected = Boolean(activeWs?.supabase_url || uplinkUrl);
    return (
      <UniversalCard
        key="spoke_op_setup"
        layout="vertical"
        onClick={() => setActiveSpokePanel("setup")}
        icon={t("icon_router", "router")}
        title={t("wf_card_spoke_setup_title", "Spoke Setup & Maintenance")}
        subtitle={
          activeWs?.supabase_url ||
          uplinkUrl ||
          t("wf_uplink_node_telemetry", "Spoke Node Telemetry")
        }
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  isConnected ? "text-[var(--success)]" : "text-[var(--warning)]"
                }`}
              >
                {isConnected
                  ? t("icon_check_circle", "check_circle")
                  : t("icon_warning", "warning")}
              </span>
              <span>
                {isConnected
                  ? t("auto_synchronized", "SYNCHRONIZED")
                  : t("status_pending", "Pending")}
              </span>
            </div>
          </div>
        }
        badges={
          <>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_fingerprint", "fingerprint")}
              </span>
              <span>{activeWs?.schema_id || activeWorkspaceId || "SPOKE"}</span>
            </div>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_vpn_key", "vpn_key")}
              </span>
              <span>{t("wf_uplink_key_rotation_title", "Key Rotation")}</span>
            </div>
          </>
        }
        actions={
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopyUplinkBundle();
            }}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:scale-110"
          >
            <span className="material-symbols-outlined !text-[14px]">
              {t("icon_content_copy", "content_copy")}
            </span>
            <HoverTooltip title={t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")} />
          </button>
        }
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
              <span className="material-symbols-outlined !text-[12px] opacity-70">
                {t("icon_settings_ethernet", "settings_ethernet")}
              </span>
              {t("spoke_copy_uplink_bundle", "SANCTUARY-UPLINK://")}
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
              {t("configure", "Configure")} <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      >
        <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
          {t(
            "wf_card_spoke_setup_desc",
            "Inspect Spoke node telemetry, rotate Supabase Anon and Service Role keys, verify Hub handshake status, and copy your SANCTUARY-UPLINK:// bundle."
          )}
        </p>
      </UniversalCard>
    );
  };

  const renderSpokeSeverCard = () => (
    <UniversalCard
      key="spoke_op_sever"
      layout="vertical"
      onClick={() => setActiveSpokePanel("sever")}
      icon={t("icon_link_off", "link_off")}
      title={t("wf_card_spoke_sever_title", "Spoke Sever (Cut the Cord)")}
      subtitle={t("wf_badge_sovereign", "Bilateral Sovereignty")}
      statusColor="border-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
              {t("icon_link_off", "link_off")}
            </span>
            <span>{t("wf_badge_sovereign", "Bilateral Sovereignty")}</span>
          </div>
        </div>
      }
      badges={
        <>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_database", "database")}
            </span>
            <span>{t("wf_badge_100_data", "100% Data Retained")}</span>
          </div>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
              {t("icon_security", "security")}
            </span>
            <span>{t("wf_sever_key_custody_val", "Scrubbed on Sever")}</span>
          </div>
        </>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
              {t("icon_shield", "shield")}
            </span>
            {t("wf_footer_double_click_guard", "Double-Click Safeguard")}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--danger)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("btn_inspect", "Inspect")} <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    >
      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
        {t(
          "wf_cut_cord_desc",
          "Unilaterally sever your community's Spoke database from the Sanctuary OS Hub. This immediately deactivates the workspace on the global network and scrubs your Service Role Key from the Hub while leaving 100% of your Spoke database intact."
        )}
      </p>
    </UniversalCard>
  );

  const renderForkingHelpCard = () => (
    <UniversalCard
      key="spoke_op_forking"
      layout="vertical"
      onClick={() => setActiveSpokePanel("forking")}
      icon={t("icon_menu_book", "menu_book")}
      title={t("wf_tab_forking_help", "Forking Help & Walkthrough")}
      subtitle={CANONICAL_DIRECTIVES.forking_guide.title}
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_call_split", "call_split")}
            </span>
            <span>{CANONICAL_DIRECTIVES.forking_guide.category}</span>
          </div>
        </div>
      }
      badges={
        <>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_storage", "storage")}
            </span>
            <span>{t("dir_fork_sql_spoke_val", "schema.sql (36 Tables)")}</span>
          </div>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_code", "code")}
            </span>
            <span>{t("dir_fk_t2_val", "Standalone & Hub")}</span>
          </div>
        </>
      }
      actions={
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopySpokeSql();
          }}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:scale-110"
        >
          <span className="material-symbols-outlined !text-[14px]">
            {t("icon_database", "database")}
          </span>
          <HoverTooltip title={t("wf_btn_copy_spoke_sql", "Copy schema.sql")} />
        </button>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
            <span className="material-symbols-outlined !text-[12px] opacity-70">
              {t("icon_terminal", "terminal")}
            </span>
            {t("wf_btn_copy_spoke_sql", "Copy schema.sql")}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("open", "Open")} <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    >
      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
        {CANONICAL_DIRECTIVES.forking_guide.summary}
      </p>
    </UniversalCard>
  );

  const renderDonationsCard = () => {
    const hasLink = Boolean(donationUrl.trim());
    return (
      <UniversalCard
        key="spoke_op_donations"
        layout="vertical"
        onClick={() => setActiveSpokePanel("donations")}
        icon={t("icon_volunteer_activism", "volunteer_activism")}
        title={t("wf_donation_panel_title", "Non-Custodial Community Donations")}
        subtitle={
          hasLink ? donationUrl : t("wf_donation_no_link", "No Checkout Link Set")
        }
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  hasLink ? "text-[var(--success)]" : "text-[var(--warning)]"
                }`}
              >
                {hasLink
                  ? t("icon_check_circle", "check_circle")
                  : t("icon_info", "info")}
              </span>
              <span>{processor}</span>
            </div>
          </div>
        }
        badges={
          <>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                {t("icon_verified", "verified")}
              </span>
              <span>{t("wf_badge_zero_cut", "0% Sanctuary Cut")}</span>
            </div>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_bolt", "bolt")}
              </span>
              <span>{hasLink ? t("status_live", "Live") : t("status_not_live", "Not Live")}</span>
            </div>
          </>
        }
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
              <span className="material-symbols-outlined !text-[12px] opacity-70">
                {t("icon_volunteer_activism", "volunteer_activism")}
              </span>
              {processor}
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
              {t("configure", "Configure")} <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      >
        <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
          {t(
            "wf_donation_notice_desc",
            "Your community receives 100% of all citizen donations directly via your own payment processor. Sanctuary OS takes a 0% cut, never touches your funds, and does not cover chargebacks."
          )}
        </p>
      </UniversalCard>
    );
  };

  const renderCovenantsCard = () => (
    <UniversalCard
      key="spoke_op_covenants"
      layout="vertical"
      onClick={() => {
        setCovenantDocTab("partners_agreement");
        setIsCovenantPanelOpen(true);
      }}
      icon={t("icon_gavel", "gavel")}
      title={t("partner_covenants_title", "Partners Agreement & Compliance Protocol")}
      subtitle={t(
        "partner_covenants_subtitle",
        "Spoke Governance, Anti-Malware & Bilateral Sovereignty Covenants"
      )}
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_verified", "verified")}
            </span>
            <span>{`V${stableVersion} • ${t("partner_agreement_badge", "Spoke Charter")}`}</span>
          </div>
        </div>
      }
      badges={
        <>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_handshake", "handshake")}
            </span>
            <span>{t("partner_agreement_title", "Partners Agreement")}</span>
          </div>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_shield", "shield")}
            </span>
            <span>{t("compliance_protocol_title", "Compliance Protocol")}</span>
          </div>
        </>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
            <span className="material-symbols-outlined !text-[12px] opacity-70">
              {t("icon_gavel", "gavel")}
            </span>
            {`V${stableVersion} • ${t("compliance_protocol_badge", "Safety & Privacy")}`}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("btn_inspect", "Inspect")} <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    >
      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
        {t(
          "partner_covenants_desc",
          "Inspect the binding Sanctuary OS Partners Agreement and Compliance Protocol governing Spoke sovereignty, 0% non-custodial donations, heuristic malware enforcement, and cryptographic {mod} integrity."
        )}
      </p>
    </UniversalCard>
  );

  const renderSchemaFileCard = (file: any) => {
    const isOpen = openFiles.some((f: any) => f.path === file.path);
    const hasUnsaved =
      Boolean(file.hasUnsavedDraft) ||
      openFiles.some((f: any) => f.path === file.path && f.content !== f.originalContent);
    const displayTitle = file.displayTitle || file.name.replace(/\.json$/i, "");
    const updatedDateStr = file.updated_at
      ? new Date(file.updated_at).toLocaleDateString()
      : undefined;

    return (
      <UniversalCard
        key={file.path}
        layout="vertical"
        statusColor={
          hasUnsaved
            ? "border-[color-mix(in_srgb,var(--warning)_40%,transparent)]"
            : isOpen
              ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
              : undefined
        }
        onClick={() => {
          if (renamingFile !== file.path) openFile(file);
        }}
        icon={t("icon_data_object", "data_object")}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  hasUnsaved
                    ? "text-[var(--warning)]"
                    : isOpen
                      ? "text-[var(--accent)]"
                      : "text-[var(--accent)]"
                }`}
              >
                {hasUnsaved
                  ? t("icon_warning", "warning")
                  : isOpen
                    ? t("icon_edit", "edit")
                    : t("icon_cloud_done", "cloud_done")}
              </span>
              <span>
                {hasUnsaved
                  ? t("unsaved_changes", "Unsaved")
                  : isOpen
                    ? t("editing", "Editing")
                    : t("synced", "Synced")}
              </span>
            </div>
          </div>
        }
        title={
          renamingFile === file.path ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex flex-col gap-2 w-full z-20"
            >
              <div className="flex items-center gap-1 w-full">
                <input
                  type="text"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit(file.path, file.name);
                    if (e.key === "Escape") setRenamingFile(null);
                  }}
                  className="glass-surface theme-border-accent rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none flex-1 min-w-0 font-mono"
                  autoFocus
                />
                <input
                  type="text"
                  value={renameExt}
                  onChange={(e) => setRenameExt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit(file.path, file.name);
                    if (e.key === "Escape") setRenamingFile(null);
                  }}
                  className="glass-surface theme-border-accent rounded px-1.5 py-1 text-xs text-[var(--subtext)] focus:outline-none w-16 font-mono text-center"
                />
              </div>
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => handleRenameSubmit(file.path, file.name)}
                  className="p-1.5 rounded-lg border border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)] bg-transparent hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] flex items-center justify-center cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_check", "check")}
                  </span>
                </button>
                <button
                  onClick={() => setRenamingFile(null)}
                  className="p-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] bg-transparent flex items-center justify-center cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_close", "close")}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            displayTitle
          )
        }
        subtitle={
          renamingFile === file.path
            ? undefined
            : updatedDateStr
              ? `${t("wf_recent_last_updated", "Last Updated")}: ${updatedDateStr}`
              : `${t("author", "Author")}: ${file.author || activeWs?.name || displayTitle}`
        }
        badges={
          <div className="flex flex-wrap items-center gap-1.5">
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_data_object", "data_object")}
              </span>
              <span>{t("tab_schemas", "Master Schemas")}</span>
            </div>
            {file.version !== undefined && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_history", "history")}
                </span>
                <span>v{file.version}</span>
              </div>
            )}
            {updatedDateStr && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                  {t("icon_schedule", "schedule")}
                </span>
                <span>{updatedDateStr}</span>
              </div>
            )}
          </div>
        }
        footer={
          renamingFile !== file.path ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-between w-full gap-2"
            >
              <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 truncate font-mono">
                {file.name}
              </span>
              {deleteConfirmPath === file.path ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(file.path);
                      setDeleteConfirmPath(null);
                    }}
                    className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] bg-transparent hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] flex items-center justify-center transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_check", "check")}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmPath(null);
                    }}
                    className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] bg-transparent flex items-center justify-center transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_close", "close")}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const dotIdx = file.name.lastIndexOf(".");
                      if (dotIdx > 0) {
                        setRenameInput(file.name.substring(0, dotIdx));
                        setRenameExt(file.name.substring(dotIdx));
                      } else {
                        setRenameInput(file.name);
                        setRenameExt("");
                      }
                      setRenamingFile(file.path);
                    }}
                    className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] bg-transparent flex items-center justify-center transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_edit", "edit")}
                    </span>
                    <HoverTooltip title={t("rename_file", "Rename")} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmPath(file.path);
                    }}
                    className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] bg-transparent flex items-center justify-center transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_delete", "delete")}
                    </span>
                    <HoverTooltip title={t("delete_file", "Delete")} variant="danger" />
                  </button>
                </div>
              )}
            </div>
          ) : undefined
        }
      />
    );
  };

  const renderOverviewTicketCard = (ticket: any) => {
    const statusLower = ticket.status?.toLowerCase() || "open";
    const isEscalated = statusLower === "escalated";
    return (
      <UniversalCard
        key={`overview_ticket_${ticket.id}`}
        layout="vertical"
        icon={t("icon_confirmation_number", "confirmation_number")}
        title={ticket.title}
        subtitle={`#${ticket.id.slice(0, 8)}`}
        onClick={() => setSelectedTicket(ticket)}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  isEscalated ? "text-[var(--danger)]" : "text-[var(--warning)]"
                }`}
              >
                {isEscalated
                  ? t("icon_priority_high", "priority_high")
                  : t("icon_confirmation_number", "confirmation_number")}
              </span>
              <span>
                {isEscalated
                  ? t("ticket_status_escalated", "Escalated")
                  : t("ticket_status_open", "Open")}
              </span>
            </div>
          </div>
        }
        badges={
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_admin_panel_settings", "admin_panel_settings")}
            </span>
            <span>{t("wf_tab_keepers_support", "Keepers Support")}</span>
          </div>
        }
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 opacity-60">
              <span className="material-symbols-outlined !text-[12px]">
                {t("icon_calendar_today", "calendar_today")}
              </span>
              {new Date(ticket.created_at).toLocaleDateString()}
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0">
              {t("view_ticket", "View Ticket")} <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      >
        <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
          {ticket.description}
        </p>
      </UniversalCard>
    );
  };

  // Interactive Forking Content inside Forking Help SidePanel
  const renderInteractiveForkingGuide = () => {
    const spokeSqlLineCount = SPOKE_SCHEMA_SQL.split(/\r?\n/).length;
    const hubSqlLineCount = HUB_SCHEMA_SQL.split(/\r?\n/).length;
    const isSpokeSqlActive = sqlSchemaTab === "spoke";
    const activeSqlCode = isSpokeSqlActive ? SPOKE_SCHEMA_SQL : HUB_SCHEMA_SQL;
    const activeSqlCopyId = isSpokeSqlActive ? "sql_spoke" : "sql_hub";

    return (
      <div className="flex flex-col gap-5 w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_hub", "hub")}
            label={t("dir_fk_t1_lbl", "STEP 1")}
            number={t("dir_fk_t1_val", "Spoke Setup")}
            colorClass="text-[var(--accent)]"
            isActive={forkTab === "spoke"}
            onClick={() => setForkTab("spoke")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_call_split", "call_split")}
            label={t("dir_fk_t2_lbl", "FORK MODES")}
            number={t("dir_fk_t2_val", "Standalone & Hub")}
            colorClass="text-[var(--accent)]"
            isActive={forkTab === "standalone"}
            onClick={() => setForkTab("standalone")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_database", "database")}
            label={t("dir_fk_t3_lbl", "STEP 3")}
            number={t("dir_fk_t3_val", "SQL Schemas")}
            colorClass="text-[var(--accent)]"
            isActive={forkTab === "sql"}
            onClick={() => setForkTab("sql")}
          />
        </div>

        {forkTab === "spoke" && (
          <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4 border border-[color-mix(in_srgb,var(--accent)_40%,transparent)]">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                {t("sd_fork_spoke_hero_badge", "OFFICIAL PARTNER NETWORK • ZERO CODE EDITS")}
              </span>
              <h3 className="text-base font-black tracking-tight text-[var(--text)] leading-snug m-0">
                {t("sd_fork_spoke_hero_title", "Connect a Sovereign Community Spoke in 3 Steps")}
              </h3>
              <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                {t(
                  "sd_fork_spoke_hero_desc",
                  "Join the official Sanctuary OS multi-game network while retaining 100% ownership of your community's Supabase PostgreSQL database. No client forking or code edits required."
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                    {t("icon_database", "database")}
                  </span>
                  <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                    {t(
                      "sd_fork_spoke_step1_title",
                      "Step 1: Initialize Your Supabase Spoke (schema.sql)"
                    )}
                  </h4>
                </div>
                <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                  {t(
                    "sd_fork_spoke_step1_desc",
                    "Create a free Supabase project, open the SQL Editor, and run schema.sql. This single script provisions all 36 community tables, RLS policies, immutable audit triggers, and role functions."
                  )}
                </p>
              </div>

              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                    {t("icon_key", "key")}
                  </span>
                  <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                    {t(
                      "sd_fork_spoke_step2_title",
                      "Step 2: Generate Your SANCTUARY-UPLINK:// Bundle"
                    )}
                  </h4>
                </div>
                <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                  {t(
                    "sd_fork_spoke_step2_desc",
                    "In Keepers Core -> Active Workspaces (or Wayfinder Hub), paste your Supabase URL, Anon Key, and Service Role Key to generate an encrypted SANCTUARY-UPLINK:// handshake bundle."
                  )}
                </p>
              </div>

              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                    {t("icon_rocket_launch", "rocket_launch")}
                  </span>
                  <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                    {t(
                      "sd_fork_spoke_step3_title",
                      "Step 3: Verify Handshake & Provision Founding Wayfinder"
                    )}
                  </h4>
                </div>
                <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                  {t(
                    "sd_fork_spoke_step3_desc",
                    "Click 'Test Handshake & Verify Schema'. The game-gateway Edge Function verifies table readiness, seeds global_network_status, and automatically promotes your founder account to Wayfinder."
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--warning)_35%,transparent)]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--warning)] shrink-0">
                    {t("icon_link_off", "link_off")}
                  </span>
                  <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                    {t(
                      "sd_fork_cord_community_title",
                      "Community-Initiated Severance (Wayfinder Hub)"
                    )}
                  </h4>
                </div>
                <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                  {t(
                    "sd_fork_cord_community_desc",
                    "A Wayfinder can double-click 'Cut the Cord' in Wayfinder Hub -> Spoke Uplink & Sovereignty at any time. This writes an immutable audit log, sets is_active = false on the Hub, and permanently scrubs (NULLs) the Spoke's supabase_service_key from the Hub while leaving 100% of the community's database intact."
                  )}
                </p>
              </div>

              <div className="glass-surface rounded-2xl p-4 flex flex-col gap-1.5 border border-[color-mix(in_srgb,var(--success)_35%,transparent)]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--success)] shrink-0">
                    {t("icon_verified", "verified")}
                  </span>
                  <h4 className="text-sm font-bold text-[var(--text)] leading-snug m-0">
                    {t("sd_fork_cord_keeper_title", "Zero Platform Tax & 100% Data Ownership")}
                  </h4>
                </div>
                <p className="text-xs font-normal text-[var(--subtext)] opacity-90 leading-relaxed m-0">
                  {t(
                    "sd_fork_cord_keeper_desc",
                    "Sanctuary OS takes 0% of {mason} Patreon/Ko-fi revenue and 0% of community donations. Export your SANCTUARY-UPLINK:// bundle before severing to paste directly into a standalone fork."
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {forkTab === "standalone" && (
          <div className="flex flex-col gap-3.5 w-full">
            <div
              role={forkModeIdx !== 0 ? "button" : undefined}
              tabIndex={forkModeIdx !== 0 ? 0 : undefined}
              onClick={forkModeIdx !== 0 ? () => setForkModeIdx(0) : undefined}
              className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
                forkModeIdx === 0
                  ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)]"
                  : "px-4 py-3.5 gap-2 opacity-60 hover:opacity-90 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] cursor-pointer"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_call_split", "call_split")}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                      {t("sd_fork_mode_standalone_badge", "MODE 1 • 1-DATABASE STANDALONE")}
                    </span>
                    <h3 className="text-sm sm:text-base font-black text-[var(--text)] m-0">
                      {t(
                        "sd_fork_mode_standalone_title",
                        "1-File Standalone Fork (Single Database)"
                      )}
                    </h3>
                  </div>
                </div>
                <span className={VAULT_CHIP_CLASS}>
                  <span>{forkModeIdx === 0 ? t("active", "Active") : t("open", "Open")}</span>
                </span>
              </div>

              {forkModeIdx === 0 && (
                <div className="flex flex-col gap-3.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <p className="text-xs text-[var(--subtext)] leading-relaxed m-0">
                    {t(
                      "sd_fork_mode_standalone_desc",
                      "Run your own independent Sanctuary OS build backed by a single Supabase project (schema.sql) and a 1-file edit in src/supabase.ts with zero Edge Functions."
                    )}
                  </p>
                  <div className="glass-surface rounded-2xl p-4 flex flex-col gap-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--accent)] font-mono">
                        sanctuary-os/src/supabase.ts
                      </span>
                      <ActionButton
                        variant="accent"
                        icon={
                          copiedId === "supabase_cfg_manual"
                            ? t("icon_check_circle", "check_circle")
                            : t("icon_content_copy", "content_copy")
                        }
                        onClick={() =>
                          handleCopyCode("supabase_cfg_manual", STANDALONE_MANUAL_SNIPPET)
                        }
                      >
                        {copiedId === "supabase_cfg_manual"
                          ? t("alert_copied", "Copied to Clipboard!")
                          : t("sd_btn_copy_snippet", "Copy Code Snippet")}
                      </ActionButton>
                    </div>
                    <pre className="text-xs font-mono text-[var(--text)] opacity-90 overflow-x-auto custom-scrollbar leading-relaxed p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--bg)_45%,transparent)] m-0">
                      <code>{STANDALONE_MANUAL_SNIPPET}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div
              role={forkModeIdx !== 1 ? "button" : undefined}
              tabIndex={forkModeIdx !== 1 ? 0 : undefined}
              onClick={forkModeIdx !== 1 ? () => setForkModeIdx(1) : undefined}
              className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
                forkModeIdx === 1
                  ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)]"
                  : "px-4 py-3.5 gap-2 opacity-60 hover:opacity-90 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] cursor-pointer"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_hub", "hub")}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                      {t("sd_fork_mode_hub_badge", "MODE 2 • FULL HUB & SPOKE FEDERATION")}
                    </span>
                    <h3 className="text-sm sm:text-base font-black text-[var(--text)] m-0">
                      {t(
                        "sd_fork_mode_hub_title",
                        "Full Hub & Spoke Multi-Game Fork (Hub + Child Spokes)"
                      )}
                    </h3>
                  </div>
                </div>
                <span className={VAULT_CHIP_CLASS}>
                  <span>{forkModeIdx === 1 ? t("active", "Active") : t("open", "Open")}</span>
                </span>
              </div>

              {forkModeIdx === 1 && (
                <div className="flex flex-col gap-3.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <p className="text-xs text-[var(--subtext)] leading-relaxed m-0">
                    {t(
                      "sd_fork_mode_hub_desc",
                      "Self-host your own central Sanctuary OS Hub (schema_os.sql + game-gateway Edge Function) that authenticates users once and routes across multiple independent community Spoke databases (schema.sql)."
                    )}
                  </p>
                  <div className="glass-surface rounded-2xl p-4 flex flex-col gap-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--accent)] font-mono">
                        sanctuary-os/src/supabase.ts
                      </span>
                      <ActionButton
                        variant="accent"
                        icon={
                          copiedId === "supabase_cfg_hub"
                            ? t("icon_check_circle", "check_circle")
                            : t("icon_content_copy", "content_copy")
                        }
                        onClick={() =>
                          handleCopyCode("supabase_cfg_hub", HUB_AND_SPOKE_FORK_SNIPPET)
                        }
                      >
                        {copiedId === "supabase_cfg_hub"
                          ? t("alert_copied", "Copied to Clipboard!")
                          : t("sd_btn_copy_snippet", "Copy Code Snippet")}
                      </ActionButton>
                    </div>
                    <pre className="text-xs font-mono text-[var(--text)] opacity-90 overflow-x-auto custom-scrollbar leading-relaxed p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--bg)_45%,transparent)] m-0">
                      <code>{HUB_AND_SPOKE_FORK_SNIPPET}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {forkTab === "sql" && (
          <div className="flex flex-col gap-3.5 w-full">
            <div
              role={!isSpokeSqlActive ? "button" : undefined}
              tabIndex={!isSpokeSqlActive ? 0 : undefined}
              onClick={!isSpokeSqlActive ? () => setSqlSchemaTab("spoke") : undefined}
              className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
                isSpokeSqlActive
                  ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)]"
                  : "px-4 py-3.5 gap-2 opacity-60 hover:opacity-90 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] cursor-pointer"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--success)] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_storage", "storage")}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--success)]">
                      {t("dir_fork_sql_spoke_sub", "SPOKE & STANDALONE DB • 36 TABLES")}
                    </span>
                    <h3 className="text-sm sm:text-base font-black text-[var(--text)] m-0">
                      {t("dir_fork_sql_spoke_val", "schema.sql (36 Tables)")}
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isSpokeSqlActive && (
                    <ActionButton
                      variant="accent"
                      icon={
                        copiedId === activeSqlCopyId
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_content_copy", "content_copy")
                      }
                      onClick={() => handleCopyCode(activeSqlCopyId, activeSqlCode)}
                    >
                      {copiedId === activeSqlCopyId
                        ? t("dir_fork_sql_copied", "SQL Copied")
                        : t("dir_fork_sql_copy_btn", "Copy Full SQL")}
                    </ActionButton>
                  )}
                  <span className={VAULT_CHIP_CLASS}>
                    <span>
                      {spokeSqlLineCount} {t("dir_fork_sql_lines", "Lines")}
                    </span>
                  </span>
                </div>
              </div>

              {isSpokeSqlActive && (
                <div className="flex flex-col gap-3 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <p className="text-xs text-[var(--subtext)] leading-relaxed m-0">
                    {t(
                      "dir_fork_sql_spoke_desc",
                      "Complete community registry schema (mods, blueprints, masons, conflicts, tickets, heuristics, RLS policies, and Founding Wayfinder trigger)."
                    )}
                  </p>
                  <pre className="text-[11px] font-mono text-[var(--text)] opacity-90 overflow-x-auto max-h-[320px] overflow-y-auto custom-scrollbar leading-relaxed p-3 rounded-xl bg-[color-mix(in_srgb,var(--bg)_45%,transparent)] m-0">
                    <code>{SPOKE_SCHEMA_SQL}</code>
                  </pre>
                </div>
              )}
            </div>

            <div
              role={isSpokeSqlActive ? "button" : undefined}
              tabIndex={isSpokeSqlActive ? 0 : undefined}
              onClick={isSpokeSqlActive ? () => setSqlSchemaTab("hub") : undefined}
              className={`relative glass-panel rounded-2xl flex flex-col border text-left transition-all duration-300 ${
                !isSpokeSqlActive
                  ? "p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)]"
                  : "px-4 py-3.5 gap-2 opacity-60 hover:opacity-90 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] cursor-pointer"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_hub", "hub")}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                      {t("dir_fork_sql_hub_sub", "CENTRAL HUB DB • 19 TABLES")}
                    </span>
                    <h3 className="text-sm sm:text-base font-black text-[var(--text)] m-0">
                      {t("dir_fork_sql_hub_val", "schema_os.sql (19 Tables)")}
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isSpokeSqlActive && (
                    <ActionButton
                      variant="accent"
                      icon={
                        copiedId === activeSqlCopyId
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_content_copy", "content_copy")
                      }
                      onClick={() => handleCopyCode(activeSqlCopyId, activeSqlCode)}
                    >
                      {copiedId === activeSqlCopyId
                        ? t("dir_fork_sql_copied", "SQL Copied")
                        : t("dir_fork_sql_copy_btn", "Copy Full SQL")}
                    </ActionButton>
                  )}
                  <span className={VAULT_CHIP_CLASS}>
                    <span>
                      {hubSqlLineCount} {t("dir_fork_sql_lines", "Lines")}
                    </span>
                  </span>
                </div>
              </div>

              {!isSpokeSqlActive && (
                <div className="flex flex-col gap-3 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <p className="text-xs text-[var(--subtext)] leading-relaxed m-0">
                    {t(
                      "dir_fork_sql_hub_desc",
                      "Central federation Hub schema (global SSO profiles, FIDO2 passkeys, sanctuary_games, sanctuary_schemas, system_directives, and heuristic signatures)."
                    )}
                  </p>
                  <pre className="text-[11px] font-mono text-[var(--text)] opacity-90 overflow-x-auto max-h-[320px] overflow-y-auto custom-scrollbar leading-relaxed p-3 rounded-xl bg-[color-mix(in_srgb,var(--bg)_45%,transparent)] m-0">
                    <code>{HUB_SCHEMA_SQL}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Filtered items for Spoke & Setup tab
  const qLower = searchQuery.toLowerCase().trim();
  const matchesQuery = (text: string) => !qLower || text.toLowerCase().includes(qLower);

  const showSpokeOps = spokeSectionFilter === "all" || spokeSectionFilter === "spoke_ops";
  const showSchemas = spokeSectionFilter === "all" || spokeSectionFilter === "schemas";

  const filteredSchemaFiles = (schemaFiles || []).filter((f: any) =>
    matchesQuery(`${f.name} ${f.displayTitle || ""} ${f.author || ""}`)
  );

  // Recent (Last Updated) & Anomalies (Issues) for Overview tab
  const recentlyUpdatedSchemas = [...(schemaFiles || [])].sort((a: any, b: any) => {
    const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
    return (Number(b.version) || 0) - (Number(a.version) || 0);
  });

  const schemaAnomalies = (schemaFiles || [])
    .map((file: any) => {
      const openEntry = openFiles.find((f: any) => f.path === file.path);
      const isDirty =
        Boolean(file.hasUnsavedDraft) ||
        Boolean(openEntry && openEntry.content !== openEntry.originalContent);
      const isFlagged = Boolean(file.isFlagged);
      let syntaxError = false;
      let missingPathsOrExt = false;
      let missingKeys = 0;
      let emptyKeys = 0;
      let deprecatedKeys = 0;

      const rawText =
        openEntry?.content ||
        file.cachedDraft ||
        (file.schema_data ? JSON.stringify(file.schema_data) : "");

      if (rawText) {
        try {
          const parsed = JSON.parse(rawText);
          if (parsed && typeof parsed === "object") {
            if (
              referenceData &&
              Object.keys(referenceData).length > 0 &&
              file.name.toLowerCase() !== "default.json"
            ) {
              const diff = deepCompare(referenceData, parsed, false);
              missingKeys = diff.completelyMissing || 0;
              emptyKeys = Math.max(0, (diff.missing || 0) - (diff.completelyMissing || 0));
              deprecatedKeys = diff.deprecated || 0;
            }
            const hasPaths = Boolean(
              parsed.paths ||
                parsed.mods_folder ||
                parsed.executable ||
                parsed.install_paths ||
                parsed.game_paths
            );
            const hasExtensions = Array.isArray(parsed.supported_extensions)
              ? parsed.supported_extensions.length > 0
              : Boolean(parsed.extensions || parsed.file_types || parsed.features);
            if (!hasPaths && !hasExtensions && Object.keys(parsed).length <= 3) {
              missingPathsOrExt = true;
            }
          } else {
            syntaxError = true;
          }
        } catch {
          syntaxError = true;
        }
      }

      const hasIssue =
        isDirty ||
        isFlagged ||
        syntaxError ||
        missingPathsOrExt ||
        missingKeys > 0 ||
        emptyKeys > 0 ||
        deprecatedKeys > 0;

      return {
        file,
        hasIssue,
        isDirty,
        isFlagged,
        syntaxError,
        missingPathsOrExt,
        missingKeys,
        emptyKeys,
        deprecatedKeys,
      };
    })
    .filter((item) => item.hasIssue);

  const openOrEscalatedTickets = overviewTickets.filter((tk) => {
    const s = (tk.status || "open").toLowerCase();
    return s === "open" || s === "new" || s === "escalated" || s === "pending";
  });

  const securityAuditLogs = overviewAuditLogs.filter((log) => {
    const a = String(log.action || "").toLowerCase();
    return (
      a.includes("sever") ||
      a.includes("malware") ||
      a.includes("ban") ||
      a.includes("delete") ||
      a.includes("revoke")
    );
  });

  const missingDonationLink = !donationUrl.trim();
  const missingSpokeUplink = !activeWs?.supabase_url && !uplinkUrl.trim();
  const hasAnyAnomalies =
    missingDonationLink ||
    missingSpokeUplink ||
    schemaAnomalies.length > 0 ||
    openOrEscalatedTickets.length > 0 ||
    securityAuditLogs.length > 0;

  const getHeaderActions = () => {
    if (activeTab === "overview" || activeTab === "spoke_setup") {
      return [
        {
          id: "copy_bundle",
          icon: (
            <span className="material-symbols-outlined !text-[20px]">
              {t("icon_content_copy", "content_copy")}
            </span>
          ),
          label: t("spoke_copy_uplink_bundle", "Copy Uplink Bundle") as string,
          onClick: handleCopyUplinkBundle,
        },
        {
          id: "create_schema",
          icon: (
            <span className="material-symbols-outlined !text-[20px]">
              {t("icon_add", "add")}
            </span>
          ),
          label: t("auto_create_file", "Create") as string,
          onClick: () => setIsCreatePanelOpen(true),
        },
        {
          id: "import_schema",
          icon: (
            <span className="material-symbols-outlined !text-[20px]">
              {t("icon_upload", "upload")}
            </span>
          ),
          label: t("import_file", "Import") as string,
          onClick: handleImport,
        },
      ];
    }
    if (activeTab === "audit_logs") {
      return [
        {
          id: "audit_retention",
          icon: (
            <span className="material-symbols-outlined !text-[20px]">
              {t("icon_database", "database")}
            </span>
          ),
          label: t("audit_storage_btn", "Storage & Retention") as string,
          onClick: () => openAuditRetentionRef.current?.(),
        },
      ];
    }
    if (activeTab === "keepers_support") {
      return [
        {
          id: "create_support",
          icon: (
            <span className="material-symbols-outlined !text-[20px]">
              {t("icon_add_circle", "add_circle")}
            </span>
          ),
          label: t("support_title", "Create Support Escalation") as string,
          onClick: () => setIsCreateSupportOpen(true),
        },
      ];
    }
    return undefined;
  };

  const getPrimaryPopover = () => {
    if (activeTab === "spoke_setup") {
      return {
        icon: t("icon_tune", "tune"),
        label: t("filters", "Filters"),
        content: (
          <div className="flex flex-col w-[260px] p-4 max-w-[calc(100vw-40px)] gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              {t("category", "Category")}
            </span>
            <CustomDropdown
              flat={true}
              disableTint={true}
              variant="pill"
              value={spokeSectionFilter}
              onChange={(v: string[]) => setSpokeSectionFilter((v[0] as any) || "all")}
              options={[
                { id: "all", label: t("filter_all", "All") },
                { id: "spoke_ops", label: t("wf_filter_spoke_ops", "Spoke Operations") },
                { id: "schemas", label: t("tab_schemas", "Master Schemas") },
              ]}
            />
          </div>
        ),
      };
    }
    if (activeTab === "audit_logs") {
      return {
        icon: t("icon_tune", "tune"),
        label: t("filters", "Filters"),
        content: (
          <div className="flex flex-col w-[280px] p-4 max-w-[calc(100vw-40px)] gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              {t("auto_filter_logs", "Action Type")}
            </span>
            <CustomDropdown
              flat={true}
              disableTint={true}
              variant="pill"
              value={auditFilterAction}
              onChange={(v: string[]) => setAuditFilterAction(v[0] || "ALL")}
              options={auditFilterOptions}
            />
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mt-1">
              {t("audit_time_window", "Time Window")}
            </span>
            <CustomDropdown
              flat={true}
              disableTint={true}
              variant="pill"
              value={auditTimeRange}
              onChange={(v: string[]) => setAuditTimeRange(v[0] || "ALL")}
              options={[
                { id: "ALL", label: t("audit_time_all", "All Time") },
                { id: "24H", label: t("audit_time_24h", "Last 24 Hours") },
                { id: "7D", label: t("audit_time_7d", "Last 7 Days") },
                { id: "30D", label: t("audit_time_30d", "Last 30 Days") },
                { id: "90D", label: t("audit_time_90d", "Last 90 Days") },
              ]}
            />
          </div>
        ),
      };
    }
    if (activeTab === "keepers_support") {
      return {
        icon: t("icon_tune", "tune"),
        label: t("filters", "Filters"),
        content: (
          <div className="flex flex-col w-[260px] p-4 max-w-[calc(100vw-40px)] gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              {t("ticket_status", "Ticket Status")}
            </span>
            <CustomDropdown
              flat={true}
              disableTint={true}
              variant="pill"
              value={ticketStatusFilter}
              onChange={(v: string[]) => setTicketStatusFilter((v[0] as any) || "all")}
              options={[
                { id: "all", label: t("filter_all", "All") },
                { id: "open", label: t("ticket_status_open", "Open") },
                { id: "pending", label: t("ticket_status_pending", "Pending") },
                { id: "closed", label: t("filter_closed", "Closed") },
              ]}
            />
          </div>
        ),
      };
    }
    return undefined;
  };

  return (
    <ElevatedHubLayout
      headerTitle={t("wf_tab_spoke_control", "Spoke Control")}
      headerSubtitle={t("wf_health_subtitle", "Spoke Node Diagnostics & Sovereignty")}
      headerIcon={t("icon_data_object", "data_object")}
      headerIconColorClass="theme-text-accent"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={
        activeTab === "audit_logs"
          ? (t("search_logs", "Search logs...") as string)
          : activeTab === "keepers_support"
            ? (t("ph_search_tickets", "Search Tickets...") as string)
            : (t("search_files", "Search files...") as string)
      }
      hideSearch={activeTab === "overview"}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      actions={getHeaderActions()}
      primaryPopover={getPrimaryPopover()}
    >
      {/* 1. OVERVIEW TAB (2-Column Recent = Last Updated & Anomalies = Issues) */}
      {activeTab === "overview" && (
        <HubOverviewLanding>
          <HubOverviewSection
            icon={t("icon_schedule", "schedule")}
            iconColorClass="text-[var(--accent)]"
            title={t("chameleons_overview_recent", "Recent")}
            isEmpty={recentlyUpdatedSchemas.length === 0 && !activeWs}
            emptyIcon={t("icon_data_object", "data_object")}
            emptyTitle={t("no_files_found", "No files found")}
            gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {recentlyUpdatedSchemas.slice(0, 2).map(renderSchemaFileCard)}
            {renderSpokeSetupCard()}
            {Boolean(donationUrl.trim()) && renderDonationsCard()}
          </HubOverviewSection>

          <HubOverviewSection
            icon={t("icon_warning", "warning")}
            iconColorClass="text-[var(--warning)]"
            title={t("chameleons_overview_anomalies", "Anomalies")}
            isEmpty={!hasAnyAnomalies}
            emptyIcon={t("icon_check_circle", "check_circle")}
            emptyTitle={t("no_issues", "No issues detected")}
            gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {missingDonationLink && (
              <UniversalCard
                key="anomaly_missing_donation"
                layout="vertical"
                onClick={() => setActiveSpokePanel("donations")}
                icon={t("icon_volunteer_activism", "volunteer_activism")}
                title={t("wf_anomaly_missing_donation", "Missing Donation Link")}
                subtitle={t("wf_donation_no_link", "No Checkout Link Set")}
                statusColor="border-[color-mix(in_srgb,var(--warning)_40%,transparent)]"
                imageOverlay={
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                    <div className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                        {t("icon_warning", "warning")}
                      </span>
                      <span>{t("status_not_live", "Not Live")}</span>
                    </div>
                  </div>
                }
                badges={
                  <>
                    <div className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t("icon_volunteer_activism", "volunteer_activism")}
                      </span>
                      <span>{t("wf_tab_donations", "Donations")}</span>
                    </div>
                    <div className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                        {t("icon_bolt", "bolt")}
                      </span>
                      <span>{processor}</span>
                    </div>
                  </>
                }
                footer={
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 truncate">
                      {t("wf_tab_donations", "Donations")}
                    </span>
                    <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--warning)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
                      {t("configure", "Configure")}{" "}
                      <span className="text-base leading-none">&rarr;</span>
                    </span>
                  </div>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                  {t(
                    "wf_anomaly_missing_donation_desc",
                    "No community donation or checkout URL is configured for this Spoke. Configure a 0% fee processor link to enable supporter contributions."
                  )}
                </p>
              </UniversalCard>
            )}

            {schemaAnomalies.map((item) => {
              const {
                file,
                isDirty,
                syntaxError,
                missingPathsOrExt,
                missingKeys,
                emptyKeys,
                deprecatedKeys,
              } = item;
              const displayTitle = file.displayTitle || file.name.replace(/\.json$/i, "");
              const isDanger = syntaxError || missingPathsOrExt;
              return (
                <UniversalCard
                  key={`anomaly_schema_${file.path}`}
                  layout="vertical"
                  onClick={() => openFile(file)}
                  icon={t("icon_data_object", "data_object")}
                  title={displayTitle}
                  subtitle={file.name}
                  statusColor={
                    isDanger
                      ? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
                      : "border-[color-mix(in_srgb,var(--warning)_40%,transparent)]"
                  }
                  imageOverlay={
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                      <div className={VAULT_CHIP_CLASS}>
                        <span
                          className={`material-symbols-outlined !text-[12px] ${
                            isDanger ? "text-[var(--danger)]" : "text-[var(--warning)]"
                          }`}
                        >
                          {syntaxError
                            ? t("icon_error", "error")
                            : t("icon_warning", "warning")}
                        </span>
                        <span>
                          {syntaxError
                            ? t("error", "Error")
                            : isDirty
                              ? t("unsaved_changes", "Unsaved")
                              : t("warning", "Warning")}
                        </span>
                      </div>
                    </div>
                  }
                  badges={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_data_object", "data_object")}
                        </span>
                        <span>{t("tab_schemas", "Master Schemas")}</span>
                      </div>
                      {syntaxError && (
                        <div className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                            {t("icon_error", "error")}
                          </span>
                          <span>
                            {t("wf_anomaly_schema_syntax_err", "Invalid JSON Syntax")}
                          </span>
                        </div>
                      )}
                      {missingPathsOrExt && (
                        <div className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                            {t("icon_folder_off", "folder_off")}
                          </span>
                          <span>
                            {t("wf_anomaly_schema_missing_paths", "Missing Game Paths / Extensions")}
                          </span>
                        </div>
                      )}
                      {missingKeys > 0 && (
                        <div className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                            {t("icon_add_circle", "add_circle")}
                          </span>
                          <span>
                            {t("missing_keys_stat", "Missing Keys")}: {missingKeys}
                          </span>
                        </div>
                      )}
                      {emptyKeys > 0 && (
                        <div className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                            {t("icon_pending", "pending")}
                          </span>
                          <span>
                            {t("empty_values_stat", "Empty Values")}: {emptyKeys}
                          </span>
                        </div>
                      )}
                      {deprecatedKeys > 0 && (
                        <div className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                            {t("icon_delete_sweep", "delete_sweep")}
                          </span>
                          <span>
                            {t("deprecated_stat", "Deprecated")}: {deprecatedKeys}
                          </span>
                        </div>
                      )}
                    </div>
                  }
                  footer={
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 truncate">
                        {file.name}
                      </span>
                      <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--warning)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
                        {t("icon_edit", "Edit")}{" "}
                        <span className="text-base leading-none">&rarr;</span>
                      </span>
                    </div>
                  }
                />
              );
            })}

            {missingSpokeUplink && (
              <UniversalCard
                key="anomaly_missing_uplink"
                layout="vertical"
                onClick={() => setActiveSpokePanel("setup")}
                icon={t("icon_dns", "dns")}
                title={t("wf_anomaly_missing_uplink", "Spoke Uplink Unconfigured")}
                subtitle={activeWs?.name || t("wf_tab_spoke_setup", "Spoke & Setup")}
                statusColor="border-[color-mix(in_srgb,var(--warning)_40%,transparent)]"
                imageOverlay={
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                    <div className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                        {t("icon_warning", "warning")}
                      </span>
                      <span>{t("status_not_live", "Not Live")}</span>
                    </div>
                  </div>
                }
                badges={
                  <div className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_settings_ethernet", "settings_ethernet")}
                    </span>
                    <span>{t("wf_tab_spoke_setup", "Spoke & Setup")}</span>
                  </div>
                }
                footer={
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 truncate">
                      {activeWs?.schema_id || "SPOKE"}
                    </span>
                    <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--warning)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
                      {t("configure", "Configure")}{" "}
                      <span className="text-base leading-none">&rarr;</span>
                    </span>
                  </div>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                  {t(
                    "wf_anomaly_missing_uplink_desc",
                    "No Supabase Spoke URL is linked to this workspace. Configure your Spoke credentials or paste an Uplink Bundle."
                  )}
                </p>
              </UniversalCard>
            )}

            {openOrEscalatedTickets.slice(0, 2).map(renderOverviewTicketCard)}
            {securityAuditLogs.slice(0, 1).map((log) => (
              <UniversalCard
                key={`overview_log_${log.id}`}
                layout="vertical"
                onClick={() => setActiveTab("audit_logs")}
                icon={t("icon_gavel", "gavel")}
                title={log.action || t("action", "Action")}
                subtitle={new Date(log.created_at).toLocaleDateString()}
                statusColor="border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
                imageOverlay={
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                    <div className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                        {t("icon_gpp_maybe", "gpp_maybe")}
                      </span>
                      <span>{t("security_alert", "Security Alert")}</span>
                    </div>
                  </div>
                }
                badges={
                  <div className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_history", "history")}
                    </span>
                    <span>{t("audit_logs", "Audit Logs")}</span>
                  </div>
                }
                footer={
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 truncate">
                      {log.target_table || "audit_logs"}
                    </span>
                    <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
                      {t("btn_inspect", "Inspect")}{" "}
                      <span className="text-base leading-none">&rarr;</span>
                    </span>
                  </div>
                }
              />
            ))}
          </HubOverviewSection>
        </HubOverviewLanding>
      )}

      {/* 2. SPOKE & SETUP TAB (UniversalCard Grid -> Clicking Opens Right-Hand SidePanel) */}
      {activeTab === "spoke_setup" && (
        <div className="flex flex-col gap-6 w-full pb-16 animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 w-full">
            {showSpokeOps &&
              matchesQuery(
                `${t("wf_card_spoke_setup_title", "Spoke Setup & Maintenance")} ${
                  activeWs?.supabase_url || ""
                }`
              ) &&
              renderSpokeSetupCard()}

            {showSpokeOps &&
              matchesQuery(
                `${t("wf_card_spoke_sever_title", "Spoke Sever (Cut the Cord)")} ${t(
                  "wf_badge_sovereign",
                  "Bilateral Sovereignty"
                )}`
              ) &&
              renderSpokeSeverCard()}

            {showSpokeOps &&
              matchesQuery(
                `${t("wf_tab_forking_help", "Forking Help & Walkthrough")} ${
                  CANONICAL_DIRECTIVES.forking_guide.title
                }`
              ) &&
              renderForkingHelpCard()}

            {showSpokeOps &&
              matchesQuery(
                `${t("wf_donation_panel_title", "Non-Custodial Community Donations")} ${processor}`
              ) &&
              renderDonationsCard()}

            {showSpokeOps &&
              matchesQuery(
                `${t("partner_covenants_title", "Partners Agreement & Compliance Protocol")} ${t(
                  "partner_agreement_title",
                  "Partners Agreement"
                )} ${t("compliance_protocol_title", "Compliance Protocol")}`
              ) &&
              renderCovenantsCard()}

            {showSchemas && filteredSchemaFiles.map(renderSchemaFileCard)}
          </div>

          {!showSpokeOps && filteredSchemaFiles.length === 0 && (
            <EmptyState
              icon={t("icon_data_object", "data_object")}
              title={t("no_files_found", "No files found")}
              className="col-span-full py-16"
            />
          )}
        </div>
      )}

      {/* 3. AUDIT LOGS TAB */}
      {activeTab === "audit_logs" && (
        <AuditLogViewer
          embedded={true}
          externalSearch={searchQuery}
          externalFilterAction={auditFilterAction}
          externalTimeRange={auditTimeRange}
          openRetentionRef={openAuditRetentionRef}
          onCountChange={setAuditLogsCount}
          onLogsLoaded={setOverviewAuditLogs}
        />
      )}

      {/* 4. KEEPERS SUPPORT TAB */}
      {activeTab === "keepers_support" && (
        <div className="flex flex-col gap-6 w-full pb-16 animate-in fade-in">
          <WayfinderKeeperTickets
            userId={session?.user?.id || ""}
            embedded={true}
            externalSearch={searchQuery}
            externalFilter={ticketStatusFilter}
            onSelectTicket={setSelectedTicket}
            onCountChange={setTicketsCount}
            onTicketsLoaded={setOverviewTickets}
          />
        </div>
      )}

      {/* ===================================================================== */}
      {/* RIGHT-HAND SIDEPANELS FOR SPOKE OPERATIONS & SUPPORT                  */}
      {/* ===================================================================== */}

      {/* SidePanel 1: Spoke Setup & Maintenance */}
      <SidePanel
        isOpen={activeSpokePanel === "setup"}
        onClose={() => setActiveSpokePanel(null)}
        title={t("wf_card_spoke_setup_title", "Spoke Setup & Maintenance")}
        subtitle={activeWs?.name || activeWs?.schema_id || "SPOKE"}
        icon={t("icon_router", "router")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_content_copy", "content_copy")}
              tooltip={t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
              onClick={handleCopyUplinkBundle}
            />
            <PanelHeaderButton
              icon={t("icon_sync_lock", "sync_lock")}
              variant="accent"
              disabled={updatingKeys || !uplinkServiceKey.trim()}
              tooltip={t("wf_uplink_btn_update_keys", "Update Active Uplink Keys")}
              onClick={handleUpdateKeys}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_router", "router")}
            overline={t("wf_uplink_node_telemetry", "Spoke Node Telemetry")}
            title={t("wf_card_spoke_setup_title", "Spoke Setup & Maintenance")}
            description={t(
              "wf_card_spoke_setup_desc",
              "Inspect Spoke node telemetry, rotate Supabase Anon and Service Role keys, verify Hub handshake status, and copy your SANCTUARY-UPLINK:// bundle."
            )}
            badge={activeWs?.schema_id || activeWorkspaceId || "SPOKE"}
            badgeIcon={t("icon_check_circle", "check_circle")}
            variant="accent"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("wf_uplink_schema_label", "Active Schema ID")}
                value={activeWs?.schema_id || activeWorkspaceId || "--"}
                icon={t("icon_fingerprint", "fingerprint")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("wf_db_sync", "Database Uplink")}
                value={t("auto_synchronized", "SYNCHRONIZED")}
                icon={t("icon_cloud_done", "cloud_done")}
                iconColorClass="text-[var(--success)]"
              />
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={t("wf_uplink_node_telemetry", "Spoke Node Telemetry")}
            icon={t("icon_dns", "dns")}
            headerActions={
              <ActionButton
                variant="glass"
                icon={t("icon_content_copy", "content_copy")}
                onClick={handleCopyUplinkBundle}
                className="!px-3 !py-1.5"
              >
                {t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
              </ActionButton>
            }
          >
            <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-widest font-black text-[var(--subtext)] opacity-60">
                {t("wf_uplink_endpoint_label", "Spoke Endpoint")}
              </span>
              <span className="text-xs font-mono font-bold text-[var(--text)] break-all">
                {activeWs?.supabase_url || uplinkUrl || "--"}
              </span>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("wf_uplink_key_rotation_title", "Uplink Handshake & Key Rotation")}
            icon={t("icon_vpn_key", "vpn_key")}
          >
            <div className="flex flex-col gap-3 w-full">
              <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "wf_uplink_key_rotation_desc",
                  "Rotate your community Supabase keys or generate an Uplink Bundle token for Keepers Core."
                )}
              </p>
              <input
                type="text"
                value={uplinkUrl}
                onChange={(e) => setUplinkUrl(e.target.value)}
                placeholder={t("ui_supabase_url", "Supabase Project URL")}
                className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
              />
              <input
                type="text"
                value={uplinkAnonKey}
                onChange={(e) => setUplinkAnonKey(e.target.value)}
                placeholder={t("ui_supabase_key", "Supabase Anon Key")}
                className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
              />
              <input
                type="password"
                value={uplinkServiceKey}
                onChange={(e) => setUplinkServiceKey(e.target.value)}
                placeholder={t("ui_supabase_service_key", "Supabase Service Key")}
                className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
              />
              <ActionButton
                variant="glass"
                icon={t("icon_sync_lock", "sync_lock")}
                onClick={handleUpdateKeys}
                disabled={updatingKeys || !uplinkServiceKey.trim()}
                className="w-full justify-center !py-3 mt-1"
              >
                {t("wf_uplink_btn_update_keys", "Update Active Uplink Keys")}
              </ActionButton>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("partner_covenants_title", "Partners Agreement & Compliance Protocol")}
            icon={t("icon_gavel", "gavel")}
          >
            <div className="flex flex-col gap-3 w-full">
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "partner_covenants_desc",
                  "Inspect the binding Sanctuary OS Partners Agreement and Compliance Protocol governing Spoke sovereignty, 0% non-custodial donations, heuristic malware enforcement, and cryptographic {mod} integrity."
                )}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCovenantDocTab("partners_agreement");
                    setIsCovenantPanelOpen(true);
                  }}
                  className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-left flex flex-col gap-2 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                        {t("icon_handshake", "handshake")}
                      </span>
                      {t("partner_agreement_title", "Partners Agreement")}
                    </span>
                    <span className="px-2 py-0.5 rounded-md border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[9px] font-mono font-bold text-[var(--accent)] uppercase">
                      {`V${stableVersion} • ${t("partner_agreement_badge", "Spoke Charter")}`}
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--subtext)] opacity-80 leading-relaxed">
                    {t(
                      "partner_agreement_desc",
                      "Bilateral Sovereignty (Cut the Cord), 0% non-custodial donations, Spoke maintenance duties, and brand boundaries."
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCovenantDocTab("compliance_protocol");
                    setIsCovenantPanelOpen(true);
                  }}
                  className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-left flex flex-col gap-2 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--success)]">
                        {t("icon_shield", "shield")}
                      </span>
                      {t("compliance_protocol_title", "Compliance Protocol")}
                    </span>
                    <span className="px-2 py-0.5 rounded-md border border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[9px] font-mono font-bold text-[var(--success)] uppercase">
                      {`V${stableVersion} • ${t("compliance_protocol_badge", "Safety & Privacy")}`}
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--subtext)] opacity-80 leading-relaxed">
                    {t(
                      "compliance_protocol_desc",
                      "Zero-malware enforcement, SHA-256 {mod} verification, DMCA takedown compliance, and GDPR/CCPA privacy standards."
                    )}
                  </span>
                </button>
              </div>
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      {/* Stacked SidePanel: Partners Agreement & Compliance Protocol Viewer */}
      <SidePanel
        isOpen={isCovenantPanelOpen}
        onClose={() => setIsCovenantPanelOpen(false)}
        backdropZ="z-[100050]"
        panelZ="z-[100051]"
        title={
          covenantDocTab === "partners_agreement"
            ? t("partner_agreement_title", "Partners Agreement")
            : t("compliance_protocol_title", "Compliance Protocol")
        }
        subtitle={t(
          "partner_covenants_subtitle",
          "Spoke Governance, Anti-Malware & Bilateral Sovereignty Covenants"
        )}
        icon={
          covenantDocTab === "partners_agreement"
            ? t("icon_handshake", "handshake")
            : t("icon_shield", "shield")
        }
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[92vw] md:w-[780px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_dashboard", "dashboard")}
              tooltip={t("tab_visual", "Visual")}
              onClick={() => setCovenantViewMode("ui")}
              variant={covenantViewMode === "ui" ? "accent" : "default"}
            />
            <PanelHeaderButton
              icon={t("icon_menu_book", "menu_book")}
              tooltip={t("btn_post", "Post")}
              onClick={() => setCovenantViewMode("normal")}
              variant={covenantViewMode === "normal" ? "accent" : "default"}
            />
            <PanelHeaderButton
              icon={t("icon_content_copy", "content_copy")}
              tooltip={t("btn_copy", "Copy")}
              onClick={() => {
                navigator.clipboard.writeText(
                  covenantDocTab === "partners_agreement"
                    ? syncedPartnersMd
                    : syncedComplianceMd
                );
                pushStatus(t("copied_to_clipboard", "Copied to clipboard"), "success");
              }}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-5 mt-2 relative z-10 w-full pb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DashboardStatTile
              variant="filter"
              icon={t("icon_handshake", "handshake")}
              label={`V${stableVersion} • ${t("partner_agreement_badge", "Spoke Charter")}`}
              number={t("partner_agreement_title", "Partners Agreement")}
              active={covenantDocTab === "partners_agreement"}
              onClick={() => setCovenantDocTab("partners_agreement")}
            />
            <DashboardStatTile
              variant="filter"
              icon={t("icon_shield", "shield")}
              label={`V${stableVersion} • ${t("compliance_protocol_badge", "Safety & Privacy")}`}
              number={t("compliance_protocol_title", "Compliance Protocol")}
              active={covenantDocTab === "compliance_protocol"}
              onClick={() => setCovenantDocTab("compliance_protocol")}
            />
          </div>

          <SidePanelHeroCard
            icon={
              covenantDocTab === "partners_agreement"
                ? t("icon_handshake", "handshake")
                : t("icon_shield", "shield")
            }
            overline={
              covenantDocTab === "partners_agreement"
                ? `V${stableVersion} • ${t("partner_agreement_badge", "Spoke Charter")}`
                : `V${stableVersion} • ${t("compliance_protocol_badge", "Safety & Privacy")}`
            }
            title={
              covenantDocTab === "partners_agreement"
                ? t("partner_agreement_title", "Partners Agreement")
                : t("compliance_protocol_title", "Compliance Protocol")
            }
            description={
              covenantDocTab === "partners_agreement"
                ? t(
                    "partner_agreement_desc",
                    "Bilateral Sovereignty (Cut the Cord), 0% non-custodial donations, Spoke maintenance duties, and brand boundaries."
                  )
                : t(
                    "compliance_protocol_desc",
                    "Zero-malware enforcement, SHA-256 {mod} verification, DMCA takedown compliance, and GDPR/CCPA privacy standards."
                  )
            }
            badge={
              covenantDocTab === "partners_agreement"
                ? `V${stableVersion} • ${t("partner_agreement_badge", "Spoke Charter")}`
                : `V${stableVersion} • ${t("compliance_protocol_badge", "Safety & Privacy")}`
            }
            variant="accent"
          >
            <LegalDocVersionInfoBlock />
          </SidePanelHeroCard>

          {covenantViewMode === "ui" ? (
            <StructuredReleaseNotesView
              content={
                covenantDocTab === "partners_agreement"
                  ? syncedPartnersMd
                  : syncedComplianceMd
              }
              hideIntro={true}
            />
          ) : (
            <UniversalGroup
              title={
                covenantDocTab === "partners_agreement"
                  ? t("partner_agreement_title", "Partners Agreement")
                  : t("compliance_protocol_title", "Compliance Protocol")
              }
              icon={t("icon_gavel", "gavel")}
            >
              <div className="text-sm text-[var(--subtext)] leading-relaxed font-medium">
                <MarkdownRenderer
                  content={cleanPostBodyForViewer(
                    covenantDocTab === "partners_agreement"
                      ? syncedPartnersMd
                      : syncedComplianceMd
                  )}
                />
              </div>
            </UniversalGroup>
          )}
        </div>
      </SidePanel>

      {/* SidePanel 2: Spoke Sever (Cut the Cord) */}
      <SidePanel
        isOpen={activeSpokePanel === "sever"}
        onClose={() => {
          setConfirmSever(false);
          setActiveSpokePanel(null);
        }}
        title={t("wf_card_spoke_sever_title", "Spoke Sever (Cut the Cord)")}
        subtitle={t("wf_badge_sovereign", "Bilateral Sovereignty")}
        icon={t("icon_link_off", "link_off")}
        iconColorClass="text-[var(--danger)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_content_copy", "content_copy")}
              tooltip={t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
              onClick={handleCopyUplinkBundle}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_link_off", "link_off")}
            overline={activeWs?.name || activeWs?.schema_id || "SPOKE"}
            title={t("wf_cut_cord_title", "Cut the Cord (Sever Sanctuary Uplink)")}
            description={t(
              "wf_cut_cord_desc",
              "Unilaterally sever your community's Spoke database from the Sanctuary OS Hub. This immediately deactivates the workspace on the global network and scrubs your Service Role Key from the Hub while leaving 100% of your Spoke database intact."
            )}
            badge={activeWs?.schema_id || activeWorkspaceId || "SPOKE"}
            variant="danger"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("wf_sever_key_custody_lbl", "Service Key Custody")}
                value={t("wf_sever_key_custody_val", "Scrubbed on Sever")}
                icon={t("icon_security", "security")}
                iconColorClass="text-[var(--danger)]"
              />
              <StatBox
                label={t("wf_sever_data_ownership_lbl", "Spoke Database")}
                value={t("wf_badge_100_data", "100% Data Retained")}
                icon={t("icon_database", "database")}
                iconColorClass="text-[var(--success)]"
              />
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={t("wf_sever_backup_title", "Pre-Severance Uplink Backup")}
            icon={t("icon_content_copy", "content_copy")}
          >
            <div className="flex flex-col gap-3 w-full">
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "wf_sever_backup_desc",
                  "Copy your SANCTUARY-UPLINK:// bundle before severing if you plan to reconnect later or paste your credentials into a standalone fork."
                )}
              </p>
              <ActionButton
                variant="glass"
                icon={t("icon_content_copy", "content_copy")}
                onClick={handleCopyUplinkBundle}
                className="w-full justify-center !py-3"
              >
                {t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
              </ActionButton>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("wf_cut_cord_title", "Cut the Cord (Sever Sanctuary Uplink)")}
            icon={t("icon_link_off", "link_off")}
            headerColorClass="text-[var(--danger)]"
          >
            <div className="flex flex-col gap-4 w-full">
              <input
                type="text"
                value={severReason}
                onChange={(e) => setSeverReason(e.target.value)}
                placeholder={t(
                  "wf_cut_cord_reason_ph",
                  "Optional reason for severing the uplink (logged to Audit Trail)..."
                )}
                className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] focus:outline-none focus:border-[var(--danger)]"
              />
              <ActionButton
                variant="danger"
                icon={t("icon_link_off", "link_off")}
                onClick={handleCutTheCord}
                disabled={isSevering}
                className={`w-full justify-center !py-3.5 ${confirmSever ? "animate-pulse" : ""}`}
              >
                {confirmSever
                  ? t(
                      "wf_cut_cord_confirm_btn",
                      "Confirm: Click Again to Permanently Sever Uplink"
                    )
                  : t("wf_cut_cord_btn", "Cut the Cord (Double-Click to Sever)")}
              </ActionButton>
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      {/* SidePanel 3: Forking Help & Walkthrough */}
      <SidePanel
        isOpen={activeSpokePanel === "forking"}
        onClose={() => setActiveSpokePanel(null)}
        title={t("wf_tab_forking_help", "Forking Help & Walkthrough")}
        subtitle={CANONICAL_DIRECTIVES.forking_guide.title}
        icon={t("icon_menu_book", "menu_book")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[820px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_database", "database")}
              tooltip={t("wf_btn_copy_spoke_sql", "Copy schema.sql")}
              onClick={handleCopySpokeSql}
            />
            <PanelHeaderButton
              icon={t("icon_content_copy", "content_copy")}
              variant="accent"
              tooltip={t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
              onClick={handleCopyUplinkBundle}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-5 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_menu_book", "menu_book")}
            overline={t("wf_tab_forking_help", "Forking Help & Walkthrough")}
            title={CANONICAL_DIRECTIVES.forking_guide.title}
            description={CANONICAL_DIRECTIVES.forking_guide.summary}
            badge={CANONICAL_DIRECTIVES.forking_guide.category}
            variant="accent"
          >
            <div className="flex flex-wrap gap-3 pt-1">
              <ActionButton
                variant="glass"
                icon={t("icon_database", "database")}
                onClick={handleCopySpokeSql}
              >
                {t("wf_btn_copy_spoke_sql", "Copy schema.sql")}
              </ActionButton>
              <ActionButton
                variant="glass"
                icon={t("icon_content_copy", "content_copy")}
                onClick={handleCopyUplinkBundle}
              >
                {t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
              </ActionButton>
            </div>
          </SidePanelHeroCard>

          {renderInteractiveForkingGuide()}
        </div>
      </SidePanel>

      {/* SidePanel 4: Partner Community Donations */}
      <SidePanel
        isOpen={activeSpokePanel === "donations"}
        onClose={() => setActiveSpokePanel(null)}
        title={t("wf_donation_panel_title", "Non-Custodial Community Donations")}
        subtitle={activeWs?.name || activeWs?.schema_id || processor}
        icon={t("icon_volunteer_activism", "volunteer_activism")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_science", "science")}
              tooltip={t(
                "supporter_sandbox_enable_btn",
                "Use Sandbox Test Processor (For Testing)"
              )}
              onClick={() => {
                setProcessor("SANDBOX");
                setDonationUrl("sandbox://checkout");
              }}
            />
            <PanelHeaderButton
              icon={savingDonation ? t("icon_sync", "sync") : t("icon_save", "save")}
              variant="accent"
              disabled={savingDonation}
              tooltip={t("wf_donation_save_btn", "Save Donation Settings")}
              onClick={handleSaveDonation}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_volunteer_activism", "volunteer_activism")}
            overline={
              activeWs?.name ||
              activeWs?.schema_id ||
              t("wf_donation_panel_title", "Partner Community")
            }
            title={t("wf_donation_panel_title", "Non-Custodial Community Donations")}
            description={t(
              "wf_donation_notice_desc",
              "Your community receives 100% of all citizen donations directly via your own payment processor. Sanctuary OS takes a 0% cut, never touches your funds, and does not cover chargebacks. Every $5 a citizen donates to your community automatically grants them +30 days of Global Daily Dev Build access."
            )}
            badge={processor}
            variant="accent"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("wf_donation_processor_label", "Payment Processor")}
                value={processor}
                icon={t("icon_volunteer_activism", "volunteer_activism")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("status", "Status")}
                value={
                  donationUrl.trim()
                    ? t("status_live", "Live")
                    : t("status_not_live", "Not Live")
                }
                icon={
                  donationUrl.trim()
                    ? t("icon_check_circle", "check_circle")
                    : t("icon_info", "info")
                }
                iconColorClass={
                  donationUrl.trim() ? "text-[var(--success)]" : "text-[var(--warning)]"
                }
              />
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={t("wf_donation_processor_label", "Payment Processor & Checkout Link")}
            icon={t("icon_volunteer_activism", "volunteer_activism")}
            headerActions={
              <ActionButton
                variant="glass"
                icon={t("icon_science", "science")}
                onClick={() => {
                  setProcessor("SANDBOX");
                  setDonationUrl("sandbox://checkout");
                }}
                className="!px-3 !py-1.5"
              >
                {t("supporter_sandbox_enable_btn", "Use Sandbox Test Processor (For Testing)")}
              </ActionButton>
            }
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
                  {t("wf_donation_processor_label", "Payment Processor")}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={processor}
                  onChange={(val: any) => setProcessor(Array.isArray(val) ? val[0] : val)}
                  options={[
                    { id: "STRIPE", label: "Stripe Checkout / Payment Link" },
                    { id: "KO-FI", label: "Ko-fi" },
                    { id: "PATREON", label: "Patreon" },
                    { id: "PAYPAL", label: "PayPal" },
                    { id: "FOURTHWALL", label: "Fourthwall" },
                    { id: "OPENCOLLECTIVE", label: "OpenCollective" },
                    { id: "SANDBOX", label: "Sandbox Test Processor (Testing)" },
                    { id: "CUSTOM", label: "Custom Direct Processor" },
                  ]}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
                  {t("wf_donation_url_label", "Donation / Checkout Link (Leave blank to hide)")}
                </label>
                <input
                  type="url"
                  value={donationUrl}
                  onChange={(e) => setDonationUrl(e.target.value)}
                  placeholder={t(
                    "wf_donation_url_ph",
                    "https://donate.stripe.com/... or https://ko-fi.com/..."
                  )}
                  className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3.5 text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <ActionButton
                variant="glass"
                icon={savingDonation ? t("icon_sync", "sync") : t("icon_check", "check")}
                onClick={handleSaveDonation}
                disabled={savingDonation}
                className="w-full justify-center !py-3.5 mt-1"
              >
                {t("wf_donation_save_btn", "Save Donation Settings")}
              </ActionButton>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("supporter_processor_setup_guide_title", "How to Connect Stripe or Ko-fi")}
            icon={t("icon_info", "info")}
          >
            <p className="text-xs font-medium text-[var(--subtext)] whitespace-pre-line leading-relaxed m-0">
              {t(
                "supporter_processor_setup_guide_desc",
                "1. Create a Stripe Payment Link (buy.stripe.com/...) or Ko-fi page.\n2. Paste the URL above. Sanctuary OS automatically attaches ?client_reference_id=<user_id> on checkout.\n3. (Optional) Point your Stripe/Ko-fi webhook to the partner-donation-webhook Edge Function to auto-credit citizens, or let citizens verify their receipt ID directly."
              )}
            </p>
          </UniversalGroup>
        </div>
      </SidePanel>

      {/* Keepers Support SidePanels (Always mounted so Overview ticket clicks also open Dossier) */}
      <TicketDossierSidePanel
        isOpen={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        ticket={selectedTicket}
        isReadOnly={false}
        canReply={true}
        availableActions={[]}
        onReplyAdded={(newMetadata) => {
          setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
        }}
      />
      <WayfinderSupportSidePanel
        isOpen={isCreateSupportOpen}
        onClose={() => setIsCreateSupportOpen(false)}
      />

      {/* Master Schema Editor Panel */}
      <MasonEditorPanel
        t={t}
        isCloudMode={true}
        isKeepers={false}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
        showReference={showReference}
        setShowReference={setShowReference}
        showTimeline={showTimeline}
        setShowTimeline={setShowTimeline}
        activeFile={activeFile}
        activeFileIndex={activeFileIndex}
        setActiveFileIndex={setActiveFileIndex}
        problemsList={problemsList}
        setProblemsList={setProblemsList}
        validationStats={validationStats}
        isDirty={isDirty}
        saveFile={saveFile}
        openFiles={openFiles}
        closeFile={closeFile}
        splitRatio={splitRatio}
        isLight={isLight}
        addMissingStrings={addMissingStrings}
        purgeDeprecatedStrings={purgeDeprecatedStrings}
        jumpToNextEmpty={jumpToNextEmpty}
        handleEditorWillMount={handleEditorWillMount}
        handleEditorChange={handleEditorChange}
        setEditorRef={setEditorRef}
        validateContent={validateContent}
        referenceLabel={referenceLabel}
        referenceData={referenceData}
        isResizing={isResizing}
        editorRef={editorRef}
        activeVersionTimestamp={activeVersionTimestamp}
        setActiveVersionTimestamp={setActiveVersionTimestamp}
        setOpenFiles={setOpenFiles}
        pushStatus={pushStatus}
      />

      {/* Create Cloud Schema SidePanel */}
      <SidePanel
        isOpen={isCreatePanelOpen}
        onClose={() => setIsCreatePanelOpen(false)}
        title={t("auto_create_file", "Create File")}
        subtitle={t("auto_create_file_sub", "Create a new file")}
        icon={t("icon_add", "add")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_add", "add")}
              variant="accent"
              onClick={handleCreateSubmit}
              disabled={!createFileName.trim() || !createFileExt.trim()}
              tooltip={t("auto_create", "Create")}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_data_object", "data_object")}
            overline={t("creating_master_schema", "CREATING MASTER SCHEMA")}
            title={t("auto_create_file", "Create File")}
            description={t(
              "auto_create_file_sub",
              "Initialize a new configuration, template, or lexicon pack inside Architect Studio."
            )}
            badge={createFileExt || ".json"}
            variant="accent"
          />

          <SidePanelTitleInput
            label={t("author_filename", "File Name")}
            value={createFileName}
            onChange={setCreateFileName}
            placeholder={t("author_filename", "File Name")}
          />

          <UniversalGroup
            title={t("auto_create_file", "File Parameters")}
            icon={t("icon_code", "code")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                  {t("author_filename", "File Name")}
                </label>
                <input
                  type="text"
                  value={createFileName}
                  onChange={(e) => setCreateFileName(e.target.value)}
                  placeholder="sims4"
                  className="glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSubmit();
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                  {t("auto_extension", "Extension")}
                </label>
                <input
                  type="text"
                  value={createFileExt}
                  onChange={(e) => setCreateFileExt(e.target.value)}
                  placeholder=".json"
                  className="glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSubmit();
                  }}
                />
              </div>
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}
