import { useState, useEffect, useRef, useMemo } from "react";
import { supabase, supabaseAuth, getActiveGameClient } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore, getSafeSchema } from "../store";
import {
  SidePanel,
  SidePanelFilterBar,
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
  VAULT_CHIP_CLASS,
} from "../shared";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
  SidePanelTitleInput,
} from "../components/layouts/ElevatedHubLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
import { LiquidGlassAlertCard } from "../components/BlueprintPatchReadiness";
import { openSanctuaryContextMenu } from "../ContextMenu";
import MasonEditorPanel from "./MasonEditorPanel";
import { useMasonFiles, clearIdeCachedDraft } from "../hooks/useMasonFiles";
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
  COMPLIANCE_PROTOCOL_MD,
  PARTNERS_AGREEMENT_MD,
  fetchSyncedLegalAndCovenants,
  syncDirectivesBidirectional,
  type SystemDirectiveRecord,
} from "../utils/directivesSync";
import {
  extractDirectiveBuilderSchema,
  getDefaultDirectiveBuilderSchema,
  stripDirectiveBuilderComment,
} from "../utils/directivesBuilderSchema";
import {
  InteractiveForkingGuideView,
  type ForkTabId,
} from "../components/InteractiveForkingGuideView";
import MarkdownRenderer from "../MarkdownRenderer";
import {
  StructuredReleaseNotesView,
  LegalDocVersionInfoBlock,
  useStableReleaseMeta,
} from "../components/release-notes/ReleaseMarkdownViewer";
import { cleanPostBodyForViewer } from "../components/release-notes/releaseMarkdownParser";
import { AuditLogViewer } from "../side-panels/SAAuditLogViewer";
import { isCoreOnlyAuditRow, logArchitectAction } from "../lib/audit";
import WayfinderKeeperTickets from "../WayfinderKeeperTickets";
import TicketDossierSidePanel from "../side-panels/TicketDossierSidePanel";
import WayfinderSupportSidePanel from "../side-panels/WayfinderSupportSidePanel";
import { WayfinderDonationSetupSidePanel } from "../side-panels/WayfinderSidePanels";
import { postDevCoreAssetSync } from "../utils/devAssetSync";

export default function WayfinderMasterSchemas({
  initialTab = "overview",
}: {
  initialTab?: string;
}) {
  const { t, td } = useLexicon();
  const session = useStore((state: any) => state.session);
  const pushStatus = useStore((state: any) => state.pushStatus);
  const userRole = useStore((state: any) => state.userRole);
  const canManageSpokeDonations = userRole === "wayfinder";
  const workspaces = useStore((state: any) => state.workspaces);
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const activeWs = (workspaces || []).find((w: any) => w.id === activeWorkspaceId);

  const resolveInitialTab = (tab: string) => {
    if (tab === "audit_logs") return "audit_logs";
    if (tab === "keepers_support") return "keepers_support";
    if (tab === "guides_legal" || tab === "forking_help") return "guides_legal";
    if (
      tab === "spoke_setup" ||
      tab === "spoke_sever" ||
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
    if (initialTab === "donations" && canManageSpokeDonations) return "donations";
    return null;
  });

  useEffect(() => {
    if (!initialTab) return;
    setActiveTab(resolveInitialTab(initialTab));
    if (initialTab === "spoke_sever") setActiveSpokePanel("sever");
    else if (initialTab === "forking_help") setActiveSpokePanel("forking");
    else if (initialTab === "donations" && canManageSpokeDonations) setActiveSpokePanel("donations");
  }, [initialTab, canManageSpokeDonations]);

  // Spoke Setup & Uplink State
  const [uplinkUrl, setUplinkUrl] = useState("");
  const [uplinkAnonKey, setUplinkAnonKey] = useState("");
  const [uplinkServiceKey, setUplinkServiceKey] = useState("");
  const [updatingKeys, setUpdatingKeys] = useState(false);
  const [credentialStatus, setCredentialStatus] = useState<{
    has_credential?: boolean;
    credential_kind?: string;
    key_version?: string;
    key_fingerprint?: string;
    rotated_at?: string | null;
  } | null>(null);
  const [rotatingToken, setRotatingToken] = useState(false);

  // Spoke Sever State
  const [severReason, setSeverReason] = useState("");
  const [severConfirmText, setSeverConfirmText] = useState("");
  const [confirmSever, setConfirmSever] = useState(false);
  const [isSevering, setIsSevering] = useState(false);
  const isSeverPhraseValid =
    severConfirmText.trim().toUpperCase() === "CUT THE CORD";

  // Donations State
  const [processor, setProcessor] = useState("STRIPE");
  const [donationUrl, setDonationUrl] = useState("");

  // Interactive Forking Guide SidePanel State
  const [forkTab, setForkTab] = useState<ForkTabId>("spoke");
  const [forkModeIdx, setForkModeIdx] = useState<number>(0);
  const [sqlSchemaTab, setSqlSchemaTab] = useState<"spoke" | "hub">("spoke");
  const [forkViewMode, setForkViewMode] = useState<"ui" | "normal">("ui");

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
  const [syncedPartnersTitle, setSyncedPartnersTitle] = useState<string>("");
  const [syncedComplianceTitle, setSyncedComplianceTitle] = useState<string>("");
  const [syncedPartnersUpdatedAt, setSyncedPartnersUpdatedAt] = useState<string>("");
  const [syncedComplianceUpdatedAt, setSyncedComplianceUpdatedAt] = useState<string>("");
  const [syncedForkingRecord, setSyncedForkingRecord] =
    useState<SystemDirectiveRecord | null>(null);

  useEffect(() => {
    const loadSyncedDirectivesAndCovenants = async () => {
      try {
        const [covenantsMap, directives] = await Promise.all([
          fetchSyncedLegalAndCovenants(),
          syncDirectivesBidirectional({ canWriteHub: false }),
        ]);
        if (covenantsMap.PartnersAgreement) {
          const p = covenantsMap.PartnersAgreement;
          if (p.content) setSyncedPartnersMd(p.content);
          if (p.title) setSyncedPartnersTitle(p.title);
          if (p.updated_at) setSyncedPartnersUpdatedAt(p.updated_at);
        }
        if (covenantsMap.ComplianceProtocol) {
          const c = covenantsMap.ComplianceProtocol;
          if (c.content) setSyncedComplianceMd(c.content);
          if (c.title) setSyncedComplianceTitle(c.title);
          if (c.updated_at) setSyncedComplianceUpdatedAt(c.updated_at);
        }
        const forkDoc = directives.find((d) => d.slug === "forking_guide");
        if (forkDoc) setSyncedForkingRecord(forkDoc);
      } catch (err) {
        console.error("Failed to sync covenants/directives:", err);
      }
    };
    loadSyncedDirectivesAndCovenants();
    window.addEventListener(
      "sanctuary_directives_updated",
      loadSyncedDirectivesAndCovenants
    );
    window.addEventListener("focus", loadSyncedDirectivesAndCovenants);
    return () => {
      window.removeEventListener(
        "sanctuary_directives_updated",
        loadSyncedDirectivesAndCovenants
      );
      window.removeEventListener("focus", loadSyncedDirectivesAndCovenants);
    };
  }, []);

  const rawForkingMarkdown =
    syncedForkingRecord?.published_content ||
    syncedForkingRecord?.content ||
    CANONICAL_DIRECTIVES.forking_guide.bundledContent;

  const syncedForkingSchema = useMemo(
    () =>
      extractDirectiveBuilderSchema(
        rawForkingMarkdown,
        "forking_guide",
        t
      ) || getDefaultDirectiveBuilderSchema("forking_guide", t),
    [rawForkingMarkdown, t]
  );

  const cleanForkingReferenceMd = useMemo(
    () => stripDirectiveBuilderComment(rawForkingMarkdown),
    [rawForkingMarkdown]
  );

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
      const targetGameId = activeWs.game_id || activeWs.schema_id || activeWorkspaceId;
      if (targetGameId) {
        (supabase as any)
          .rpc("secure_get_spoke_credential_status", {
            p_game_id: targetGameId,
            p_payload: {},
          })
          .then((res: any) => {
            if (!res?.error && res?.data) {
              setCredentialStatus(res.data);
            }
          })
          .catch(() => {});
      }
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
          const { data: lData, count: exactCount } = await targetClient
            .from("audit_logs")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false })
            .limit(25);
          if (lData) {
            const spokeLogs = lData.filter((r: any) => !isCoreOnlyAuditRow(r));
            setAuditLogsCount(exactCount !== null ? exactCount : spokeLogs.length);
            setOverviewAuditLogs(spokeLogs);
          }
        }
      } catch {}
    };
    preloadTelemetry();
  }, [session?.user?.id, activeWorkspaceId, isCreateSupportOpen]);

  const loadDonationConfig = async () => {
    const { getLocalPartnerDonationOverride } = await import(
      "../utils/supporterManager"
    );
    const localOverride =
      getLocalPartnerDonationOverride(activeWs?.schema_id) ||
      getLocalPartnerDonationOverride(activeWorkspaceId);
    if (localOverride) {
      setDonationUrl(localOverride.donation_url || "");
      const proc = (localOverride.payment_processor || "STRIPE").toUpperCase();
      setProcessor(proc === "SANDBOX" ? "STRIPE" : proc);
    } else if (activeWs) {
      setDonationUrl(activeWs.donation_url || "");
      const proc = (activeWs.payment_processor || "STRIPE").toUpperCase();
      setProcessor(proc === "SANDBOX" ? "STRIPE" : proc);
    }
    if (activeWs?.schema_id) {
      const { data } = await supabaseAuth
        .from("sanctuary_games")
        .select("id, donation_url, payment_processor")
        .ilike("schema_id", activeWs.schema_id)
        .maybeSingle();
      if (data) {
        if (
          data.donation_url !== undefined &&
          data.donation_url !== null &&
          !String(data.donation_url).toLowerCase().startsWith("sandbox://")
        ) {
          setDonationUrl(data.donation_url);
        }
        if (data.payment_processor) {
          const proc = String(data.payment_processor).toUpperCase();
          setProcessor(proc === "SANDBOX" ? "STRIPE" : proc);
        }
      }
    }
  };

  useEffect(() => {
    loadDonationConfig();
  }, [activeWorkspaceId, activeWs?.schema_id]);

  const handleCopyUplinkBundle = () => {
    const payload = {
      name: activeWs?.name || activeWs?.schema_id || "Community Spoke",
      schema_id: (activeWs?.schema_id || activeWs?.id || "").toUpperCase(),
      supabase_url: uplinkUrl.trim(),
      supabase_anon_key: uplinkAnonKey.trim(),
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

  const handleUpdateKeys = async () => {
    if (!uplinkUrl.trim() || !uplinkAnonKey.trim() || !uplinkServiceKey.trim()) {
      pushStatus(t("fill_required_fields", "Please fill all required fields"), "error");
      return;
    }
    setUpdatingKeys(true);
    try {
      const targetGameId = activeWs?.game_id || activeWs?.schema_id || activeWorkspaceId;
      const res: any = await (supabase as any).rpc("secure_update_spoke_uplink", {
        p_game_id: targetGameId,
        p_payload: {
          supabase_url: uplinkUrl.trim(),
          supabase_anon_key: uplinkAnonKey.trim(),
          spoke_gateway_token: uplinkServiceKey.trim(),
        },
      });
      if (res?.error || res?.data?.error) {
        throw new Error(res?.error?.message || res?.data?.error);
      }
      const { syncGameDatabases } = await import("../store");
      await syncGameDatabases();
      setUplinkServiceKey("");
      if (targetGameId) {
        try {
          const credRes: any = await (supabase as any).rpc("secure_get_spoke_credential_status", {
            p_game_id: targetGameId,
            p_payload: {},
          });
          if (!credRes?.error && credRes?.data) {
            setCredentialStatus(credRes.data);
          }
        } catch {}
      }
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

  const handleRotateGatewayToken = async () => {
    const targetGameId = activeWs?.game_id || activeWs?.schema_id || activeWorkspaceId;
    if (!targetGameId) return;
    setRotatingToken(true);
    try {
      const res: any = await (supabase as any).rpc("secure_rotate_spoke_gateway_token", {
        p_game_id: targetGameId,
        p_payload: {},
      });
      const errMsg = res?.error?.message || res?.data?.error;
      if (errMsg) {
        throw new Error(errMsg);
      }
      setCredentialStatus({
        has_credential: true,
        credential_kind: res?.data?.credential_kind || "spoke_gateway",
        key_version: res?.data?.key_version || "v1:master",
        key_fingerprint: res?.data?.key_fingerprint || "",
        rotated_at: res?.data?.rotated_at || new Date().toISOString(),
      });
      pushStatus(
        `${t("spoke_token_rotated_toast", "Spoke Gateway Token rotated and sealed:")} ${res?.data?.key_fingerprint || "spk_gw_..."}`,
        "success"
      );
    } catch (err: any) {
      pushStatus(
        err?.message || t("spoke_token_rotate_failed", "Failed to rotate Spoke Gateway Token"),
        "error"
      );
    } finally {
      setRotatingToken(false);
    }
  };

  const handleCutTheCord = async () => {
    if (!isSeverPhraseValid) return;
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
          "Uplink severed. Your Spoke database is now independent, its Spoke Gateway Tokens have been revoked, and its Hub Vault credential has been purged."
        ),
        "info"
      );
      setConfirmSever(false);
      setSeverConfirmText("");
      setActiveSpokePanel(null);
    } catch (err: any) {
      pushStatus(err.message, "error");
    } finally {
      setIsSevering(false);
    }
  };

  // Schema Editor Save & Validation
  const saveFile = async () => {
    if (activeFileIndex < 0) return;
    const file = openFiles[activeFileIndex];
    try {
      const parsed = JSON.parse(file.content);
      delete parsed.name;
      delete parsed.archive_containers;
      delete parsed.dlc_catalog;
      delete parsed.exception_rules;
      if (!parsed.schema_version || typeof parsed.schema_version !== "number")
        parsed.schema_version = 0;
      parsed.schema_version++;

      const updatedContent = JSON.stringify(parsed, null, 2);
      const fileId = file.name.replace(/\.json$/i, "");

      const payload = {
        id: fileId,
        name:
          parsed.display_name ||
          parsed.manifest_name ||
          activeWs?.name ||
          fileId,
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

      try {
        localStorage.setItem(`sanctuary_master_schema_${fileId}`, JSON.stringify(parsed));
        localStorage.setItem(
          `sanctuary_master_schema_${fileId.toLowerCase()}`,
          JSON.stringify(parsed)
        );
      } catch {}

      if (import.meta.env.DEV && fileId.toLowerCase() !== "default") {
        await postDevCoreAssetSync({
          kind: "spoke_schema_snapshot",
          id: fileId.toLowerCase(),
          content: parsed,
        });
      }

      if (
        String(fileId).toLowerCase() ===
        String(useStore.getState().activeGameSchema?.id || "").toLowerCase()
      ) {
        useStore
          .getState()
          .setActiveGameSchema(getSafeSchema(parsed, parsed.id || fileId));
      }

      await logArchitectAction(
        "Updated Master Schema",
        "sanctuary_schemas",
        payload.name,
        "Automated from Spoke Control",
        "Wayfinder Operations",
        false,
        {
          name: { to: payload.name },
          version: { from: Math.max(0, (payload.version || 1) - 1), to: payload.version },
        }
      );

      clearIdeCachedDraft(file.path);

      const newFiles = [...openFiles];
      newFiles[activeFileIndex].content = updatedContent;
      newFiles[activeFileIndex].originalContent = updatedContent;
      setOpenFiles(newFiles);
      setActiveVersionTimestamp(null);
      mason.fetchFiles();
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

  const spokeAndSchemaCount = (canManageSpokeDonations ? 3 : 2) + (schemaFiles?.length || 0);
  const guidesAndLegalCount = 4;
  const totalOverviewItems =
    spokeAndSchemaCount + guidesAndLegalCount + ticketsCount;

  // 5 Top StatTileCarousel Tabs — every single tile has a live number value & zero horizontal overflow
  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: t("icon_dashboard", "dashboard"),
      number: String(totalOverviewItems),
    },
    {
      id: "spoke_setup",
      label: t("wf_tab_spoke_schemas", "Spoke & Schemas"),
      icon: t("icon_settings_ethernet", "settings_ethernet"),
      number: String(spokeAndSchemaCount),
    },
    {
      id: "guides_legal",
      label: t("wf_tab_guides_legal", "Guides & Legal"),
      icon: t("icon_menu_book", "menu_book"),
      number: String(guidesAndLegalCount),
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
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("configure", "Configure"),
              icon: t("icon_router", "router"),
              onClick: () => setActiveSpokePanel("setup"),
            },
            {
              label: t("spoke_copy_uplink_bundle", "Copy Uplink Bundle"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: handleCopyUplinkBundle,
            },
          ]);
        }}
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
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:scale-110"
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
            "Inspect Spoke node telemetry, rotate Spoke Gateway Tokens and Anon keys, verify Hub handshake status, and copy a secret-free SANCTUARY-UPLINK:// bundle."
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
      onContextMenu={(e) => {
        openSanctuaryContextMenu(e, [
          {
            label: t("btn_inspect", "Inspect"),
            icon: t("icon_link_off", "link_off"),
            danger: true,
            onClick: () => setActiveSpokePanel("sever"),
          },
        ]);
      }}
      icon={t("icon_link_off", "link_off")}
      title={t("wf_card_spoke_sever_title", "Spoke Sever (Cut the Cord)")}
      subtitle={t("wf_badge_sovereign", "Bilateral Sovereignty")}
      statusColor="border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
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
            <span>{t("wf_sever_key_custody_val", "Revoked & Purged on Sever")}</span>
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
          "Unilaterally sever this community's Spoke database from the Sanctuary OS Hub. This immediately deactivates the workspace on the global network, revokes all active Spoke Gateway Tokens, and purges its sealed Vault credential from Keepers Core while leaving 100% of the Spoke database intact."
        )}
      </p>
    </UniversalCard>
  );

  const renderForkingHelpCard = () => (
    <UniversalCard
      key="spoke_op_forking"
      layout="vertical"
      onClick={() => setActiveSpokePanel("forking")}
      onContextMenu={(e) => {
        openSanctuaryContextMenu(e, [
          {
            label: t("open", "Open"),
            icon: t("icon_menu_book", "menu_book"),
            onClick: () => setActiveSpokePanel("forking"),
          },
          {
            label: t("wf_btn_copy_spoke_sql", "Copy schema.sql"),
            icon: t("icon_database", "database"),
            onClick: handleCopySpokeSql,
          },
        ]);
      }}
      icon={t("icon_menu_book", "menu_book")}
      title={t("wf_tab_forking_help", "Forking Help & Walkthrough")}
      subtitle={td(syncedForkingSchema.title)}
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
            <span>{t("dir_fork_sql_spoke_val", "schema.sql (52 Tables)")}</span>
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
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:scale-110"
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
        {td(syncedForkingSchema.summary)}
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
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("configure", "Configure"),
              icon: t("icon_volunteer_activism", "volunteer_activism"),
              onClick: () => setActiveSpokePanel("donations"),
            },
          ]);
        }}
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

  const renderSqlSchemasCard = () => (
    <UniversalCard
      key="spoke_op_sql_schemas"
      layout="vertical"
      onClick={() => {
        setForkTab("sql");
        setActiveSpokePanel("forking");
      }}
      icon={t("icon_database", "database")}
      title={t(
        "wf_card_sql_schemas_title",
        "Spoke & Hub SQL Schemas (schema.sql)"
      )}
      subtitle={t("dir_fork_sql_spoke_val", "schema.sql (52 Tables)")}
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_storage", "storage")}
            </span>
            <span>{t("dir_fork_sql_spoke_val", "schema.sql (52 Tables)")}</span>
          </div>
        </div>
      }
      badges={
        <>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_hub", "hub")}
            </span>
            <span>{t("dir_fork_sql_hub_val", "schema_os.sql (22 Tables)")}</span>
          </div>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_passkey", "passkey")}
            </span>
            <span>{t("wf_badge_100_data", "100% Data Retained")}</span>
          </div>
        </>
      }
      actions={
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopySpokeSql();
          }}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:scale-110"
        >
          <span className="material-symbols-outlined !text-[14px]">
            {t("icon_content_copy", "content_copy")}
          </span>
          <HoverTooltip title={t("wf_btn_copy_spoke_sql", "Copy schema.sql")} />
        </button>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
            <span className="material-symbols-outlined !text-[12px] opacity-70">
              {t("icon_database", "database")}
            </span>
            {t("wf_btn_copy_spoke_sql", "Copy schema.sql")}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("btn_inspect", "Inspect")}{" "}
            <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    >
      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
        {t(
          "wf_card_sql_schemas_desc",
          "Inspect and copy the complete PostgreSQL database schemas for Community Spokes (schema.sql) and Central Federation Hubs (schema_os.sql)."
        )}
      </p>
    </UniversalCard>
  );

  const renderPartnersAgreementCard = () => (
    <UniversalCard
      key="spoke_op_partners_agreement"
      layout="vertical"
      onClick={() => {
        setCovenantDocTab("partners_agreement");
        setIsCovenantPanelOpen(true);
      }}
      icon={t("icon_handshake", "handshake")}
      title={t("partner_agreement_title", "Partners Agreement")}
      subtitle={`V${stableVersion} • ${t("partner_agreement_badge", "Spoke Charter")}`}
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_handshake", "handshake")}
            </span>
            <span>{`V${stableVersion} • ${t("partner_agreement_badge", "Spoke Charter")}`}</span>
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
              {t("icon_link_off", "link_off")}
            </span>
            <span>{t("wf_badge_sovereign", "Bilateral Sovereignty")}</span>
          </div>
        </>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
            <span className="material-symbols-outlined !text-[12px] opacity-70">
              {t("icon_gavel", "gavel")}
            </span>
            {t("partner_agreement_badge", "Spoke Charter")}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("btn_inspect", "Inspect")}{" "}
            <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    >
      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
        {t(
          "partner_agreement_desc",
          "Bilateral Sovereignty (Cut the Cord), 0% non-custodial donations, Spoke maintenance duties, and brand boundaries."
        )}
      </p>
    </UniversalCard>
  );

  const renderComplianceProtocolCard = () => (
    <UniversalCard
      key="spoke_op_compliance_protocol"
      layout="vertical"
      onClick={() => {
        setCovenantDocTab("compliance_protocol");
        setIsCovenantPanelOpen(true);
      }}
      icon={t("icon_shield", "shield")}
      title={t("compliance_protocol_title", "Compliance Protocol")}
      subtitle={`V${stableVersion} • ${t("compliance_protocol_badge", "Safety & Privacy")}`}
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_shield", "shield")}
            </span>
            <span>{`V${stableVersion} • ${t("compliance_protocol_badge", "Safety & Privacy")}`}</span>
          </div>
        </div>
      }
      badges={
        <>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_security", "security")}
            </span>
            <span>{t("compliance_protocol_badge", "Safety & Privacy")}</span>
          </div>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_gavel", "gavel")}
            </span>
            <span>{t("partner_covenants_title", "Partners Agreement & Compliance Protocol")}</span>
          </div>
        </>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
            <span className="material-symbols-outlined !text-[12px] opacity-70">
              {t("icon_shield", "shield")}
            </span>
            {t("compliance_protocol_badge", "Safety & Privacy")}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("btn_inspect", "Inspect")}{" "}
            <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    >
      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
        {t(
          "compliance_protocol_desc",
          "Zero-malware enforcement, SHA-256 {mod} verification, DMCA takedown compliance, and GDPR/CCPA privacy standards."
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
            ? "border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
            : isOpen
              ? "border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
              : undefined
        }
        onClick={() => {
          if (renamingFile !== file.path) openFile(file);
        }}
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("open_editor", "Open in Editor"),
              icon: t("icon_code", "code"),
              onClick: () => openFile(file),
            },
            {
              divider: true,
              label: t("copy_title", "Copy Title"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: () => navigator.clipboard?.writeText(displayTitle || file.name || ""),
            },
          ]);
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
                  className="p-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--success)] bg-transparent hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] flex items-center justify-center cursor-pointer"
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
                    className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--danger)] bg-transparent hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] flex items-center justify-center transition-all cursor-pointer"
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
                    className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] bg-transparent flex items-center justify-center transition-all cursor-pointer"
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
                    className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] bg-transparent flex items-center justify-center transition-all cursor-pointer"
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
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("view_ticket", "View Ticket"),
              icon: t("icon_confirmation_number", "confirmation_number"),
              onClick: () => setSelectedTicket(ticket),
            },
            {
              divider: true,
              label: t("copy_title", "Copy Title"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: () => navigator.clipboard?.writeText(ticket.title || ""),
            },
          ]);
        }}
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

  const missingDonationLink = canManageSpokeDonations && !donationUrl.trim();
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
            {canManageSpokeDonations && Boolean(donationUrl.trim()) && renderDonationsCard()}
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
                statusColor="border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
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
                  statusColor="border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
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
                statusColor="border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
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
                statusColor="border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
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

      {/* 2. SPOKE & SCHEMAS TAB (Spoke Setup, Cut the Cord, Donations, and Master Schema Files) */}
      {activeTab === "spoke_setup" && (
        <div className="flex flex-col gap-6 w-full pb-16 animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full">
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

            {canManageSpokeDonations &&
              showSpokeOps &&
              matchesQuery(
                `${t("wf_donation_panel_title", "Non-Custodial Community Donations")} ${processor}`
              ) &&
              renderDonationsCard()}

            {!searchQuery.trim() && showSchemas && (
              <LiquidGlassAlertCard
                isAlertCard={false}
                icon={t("icon_add_circle", "add_circle")}
                accentVar="var(--accent)"
                iconColorClass="text-[var(--accent)]"
                badgeIcon={t("icon_data_object", "data_object")}
                badgeLabel={t("tab_schemas", "Master Schemas")}
                overline={t("tab_schemas", "Master Schemas")}
                title={t("schema_create_lead_title", "New Master Schema")}
                description={t(
                  "schema_create_lead_desc",
                  "Create a new game schema configuration or import a JSON schema file."
                )}
                actionLabel={t("auto_create_file", "Create")}
                actionIcon={t("icon_add", "add")}
                actionVariant="glass"
                onAction={() => setIsCreatePanelOpen(true)}
                secondaryActionLabel={t("import_file", "Import")}
                secondaryActionIcon={t("icon_upload", "upload")}
                onSecondaryAction={handleImport}
                onClick={() => setIsCreatePanelOpen(true)}
              />
            )}

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

      {/* 3. GUIDES & LEGAL TAB (Forking Walkthrough, SQL Schemas, Partners Agreement, Compliance Protocol) */}
      {activeTab === "guides_legal" && (
        <div className="flex flex-col gap-6 w-full pb-16 animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full">
            {matchesQuery(
              `${t("wf_tab_forking_help", "Forking Help & Walkthrough")} ${
                syncedForkingSchema.title
              }`
            ) && renderForkingHelpCard()}

            {matchesQuery(
              `${t("wf_card_sql_schemas_title", "Spoke & Hub SQL Schemas (schema.sql)")} ${t(
                "dir_fork_sql_spoke_val",
                "schema.sql (52 Tables)"
              )} ${t("dir_fork_sql_hub_val", "schema_os.sql (22 Tables)")}`
            ) && renderSqlSchemasCard()}

            {matchesQuery(
              `${t("partner_agreement_title", "Partners Agreement")} ${t(
                "partner_agreement_badge",
                "Spoke Charter"
              )}`
            ) && renderPartnersAgreementCard()}

            {matchesQuery(
              `${t("compliance_protocol_title", "Compliance Protocol")} ${t(
                "compliance_protocol_badge",
                "Safety & Privacy"
              )}`
            ) && renderComplianceProtocolCard()}
          </div>
        </div>
      )}

      {/* 3. AUDIT LOGS TAB */}
      {activeTab === "audit_logs" && (
        <AuditLogViewer
          embedded={true}
          viewerScope="wayfinder"
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
              "Inspect Spoke node telemetry, rotate Spoke Gateway Tokens and Anon keys, verify Hub handshake status, and copy a secret-free SANCTUARY-UPLINK:// bundle."
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
                  "Rotate your Spoke Gateway Token (spk_gw_*), update Supabase credentials, or copy a secret-free Uplink Bundle for Keepers Core."
                )}
              </p>
              <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2.5">
                <div className="flex items-center gap-2 text-[var(--accent)]">
                  <span className="material-symbols-outlined !text-[16px]">
                    {t("icon_terminal", "terminal")}
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider">
                    {t("spoke_workflow_guide_title", "How to Link or Mint a Spoke Gateway Token")}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                  <p className="m-0">
                    {t(
                      "spoke_workflow_step_1",
                      "1. Run schema.sql in the Spoke's Supabase SQL Editor to initialize all 52 tables and gateway auth."
                    )}
                  </p>
                  <p className="m-0">
                    {t(
                      "spoke_workflow_step_2",
                      "2. Run SELECT public.mint_spoke_gateway_token(); in the Spoke's SQL Editor and copy the one-time spk_gw_... token:"
                    )}
                  </p>
                  <div className="flex items-center justify-between gap-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-3 py-1.5 my-0.5">
                    <code className="text-[11px] font-mono font-bold text-[var(--accent)] break-all select-all">
                      {"SELECT public.mint_spoke_gateway_token();"}
                    </code>
                    <ActionButton
                      variant="glass"
                      icon={t("icon_content_copy", "content_copy")}
                      onClick={() => {
                        navigator.clipboard.writeText("SELECT public.mint_spoke_gateway_token();");
                        pushStatus(
                          t("spoke_mint_sql_copied", "Mint Gateway Token SQL copied to clipboard!"),
                          "success"
                        );
                      }}
                      className="!px-2.5 !py-1 shrink-0"
                    >
                      {t("spoke_btn_copy_mint_sql", "Copy SQL")}
                    </ActionButton>
                  </div>
                  <p className="m-0">
                    {t(
                      "spoke_workflow_step_3_wayfinder",
                      "3. Once linked, click Rotate Gateway Token above for 1-click zero-downtime rotation (no SQL needed). Only paste a manual spk_gw_... token below when linking for the first time, updating keys, or reconnecting after severing."
                    )}
                  </p>
                </div>
              </div>
              {credentialStatus && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div
                    className={`${VAULT_CHIP_CLASS} ${
                      !credentialStatus.has_credential
                        ? "!text-[var(--danger)] !border-[var(--danger)]/30"
                        : credentialStatus.credential_kind !== "spoke_gateway"
                          ? "!text-[var(--warning)] !border-[var(--warning)]/30"
                          : "!text-[var(--success)] !border-[var(--success)]/30"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[12px]">
                      {credentialStatus.has_credential
                        ? t("icon_encrypted", "encrypted")
                        : t("icon_warning", "warning")}
                    </span>
                    <span>
                      {credentialStatus.has_credential
                        ? credentialStatus.credential_kind === "spoke_gateway"
                          ? t("spoke_cred_vault_sealed", "Envelope + Vault Sealed")
                          : t("spoke_cred_legacy_sealed", "Legacy Key Sealed")
                        : t("spoke_cred_missing", "No Uplink Token Sealed")}
                    </span>
                    {credentialStatus.key_fingerprint && (
                      <span className="font-mono opacity-80">
                        ({credentialStatus.key_fingerprint})
                      </span>
                    )}
                  </div>
                  {credentialStatus.has_credential && (
                    <ActionButton
                      variant="glass"
                      icon={
                        rotatingToken
                          ? t("icon_sync", "sync")
                          : t("icon_autorenew", "autorenew")
                      }
                      onClick={handleRotateGatewayToken}
                      disabled={rotatingToken}
                      className="!px-3 !py-1.5"
                    >
                      {rotatingToken
                        ? t("spoke_rotating_token", "Rotating Token...")
                        : t("spoke_btn_rotate_token", "Rotate Gateway Token")}
                    </ActionButton>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 ml-1">
                  {t("ui_supabase_url", "Supabase Project URL")}
                </label>
                <input
                  type="text"
                  value={uplinkUrl}
                  onChange={(e) => setUplinkUrl(e.target.value)}
                  placeholder={t("ui_supabase_url", "Supabase Project URL")}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 ml-1">
                  {t("ui_supabase_key", "Supabase Anon Key")}
                </label>
                <input
                  type="text"
                  value={uplinkAnonKey}
                  onChange={(e) => setUplinkAnonKey(e.target.value)}
                  placeholder={t("ui_supabase_key", "Supabase Anon Key")}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 ml-1">
                  {t("spoke_gateway_token_label", "Spoke Gateway Token")}
                </label>
                <input
                  type="password"
                  value={uplinkServiceKey}
                  onChange={(e) => setUplinkServiceKey(e.target.value)}
                  placeholder={t(
                    "spoke_gateway_token_ph",
                    "spk_gw_... (scoped HMAC token, or leave blank to keep sealed credential)"
                  )}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
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
                  className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-left flex flex-col gap-2 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                        {t("icon_handshake", "handshake")}
                      </span>
                      {t("partner_agreement_title", "Partners Agreement")}
                    </span>
                    <span className="px-2 py-0.5 rounded-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[9px] font-mono font-bold text-[var(--accent)] uppercase">
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
                  className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-left flex flex-col gap-2 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--success)]">
                        {t("icon_shield", "shield")}
                      </span>
                      {t("compliance_protocol_title", "Compliance Protocol")}
                    </span>
                    <span className="px-2 py-0.5 rounded-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[9px] font-mono font-bold text-[var(--success)] uppercase">
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
            ? syncedPartnersTitle
              ? td(syncedPartnersTitle)
              : t("partner_agreement_title", "Partners Agreement")
            : syncedComplianceTitle
              ? td(syncedComplianceTitle)
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
          <SidePanelFilterBar className="sm:grid-cols-2 gap-3">
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
          </SidePanelFilterBar>

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
                ? syncedPartnersTitle
                  ? td(syncedPartnersTitle)
                  : t("partner_agreement_title", "Partners Agreement")
                : syncedComplianceTitle
                  ? td(syncedComplianceTitle)
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
            <LegalDocVersionInfoBlock
              content={
                covenantDocTab === "partners_agreement"
                  ? syncedPartnersMd
                  : syncedComplianceMd
              }
              updatedAt={
                covenantDocTab === "partners_agreement"
                  ? syncedPartnersUpdatedAt
                  : syncedComplianceUpdatedAt
              }
            />
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
                  ? syncedPartnersTitle
                    ? td(syncedPartnersTitle)
                    : t("partner_agreement_title", "Partners Agreement")
                  : syncedComplianceTitle
                    ? td(syncedComplianceTitle)
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
          setSeverConfirmText("");
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
              "Unilaterally sever this community's Spoke database from the Sanctuary OS Hub. This immediately deactivates the workspace on the global network, revokes all active Spoke Gateway Tokens, and purges its sealed Vault credential from Keepers Core while leaving 100% of the Spoke database intact."
            )}
            badge={activeWs?.schema_id || activeWorkspaceId || "SPOKE"}
            variant="danger"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("wf_sever_key_custody_lbl", "Gateway Token Custody")}
                value={t("wf_sever_key_custody_val", "Revoked & Purged on Sever")}
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
                  "Copy your secret-free SANCTUARY-UPLINK:// bundle (Project URL + Anon Key) before severing if you plan to paste your connection metadata into a standalone fork or reconnect later with a newly minted Gateway Token."
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
              <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[var(--danger)]">
                  <span className="material-symbols-outlined !text-[16px]">
                    {t("icon_warning", "warning")}
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider">
                    {t(
                      "wf_sever_warning_title",
                      "Permanent Network Severance & Auth Architecture Warning"
                    )}
                  </span>
                </div>
                <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                  {t(
                    "wf_sever_warning_desc",
                    "Cutting the cord immediately deactivates the Spoke on the Sanctuary OS Hub, revokes all active Spoke Gateway Tokens, and permanently purges its sealed Vault credential from Keepers Core. 100% of the Spoke database tables remain intact in the community's own Supabase project."
                  )}
                </p>
              </div>

              <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[var(--accent)]">
                  <span className="material-symbols-outlined !text-[16px]">
                    {t("icon_passkey", "passkey")}
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider">
                    {t(
                      "wf_sever_identity_arch_title",
                      "How Accounts Work After Severing (Hub Auth vs. Spoke Profiles)"
                    )}
                  </span>
                </div>
                <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                  {t(
                    "wf_sever_identity_arch_desc",
                    "In federated mode, login credentials (auth.users) live in the Core Hub database while your Spoke stores public.profiles and zero-PII SHA-256 relink commitments. If you transition your severed Spoke into a Standalone Fork pointed solely at your Spoke Supabase URL, {Citizens} and {Masons} register a local login on your Spoke Auth and supply their Spoke Relink Token (SRK1.<uuid>.<secret>) at sign-up or in {Settings} -> System ID to cryptographically reclaim their Spoke profile, {Mason} studio, and {Blueprints} without username hijacking. The first local signup automatically promotes to Founding Wayfinder."
                  )}
                </p>
              </div>

              <input
                type="text"
                value={severReason}
                onChange={(e) => setSeverReason(e.target.value)}
                placeholder={t(
                  "wf_cut_cord_reason_ph",
                  "Optional reason for severing the uplink (logged to Audit Trail)..."
                )}
                className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--danger)]"
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)] ml-1">
                  {t(
                    "wf_sever_type_confirm_label",
                    'Type "CUT THE CORD" to unlock severance'
                  )}
                </label>
                <input
                  type="text"
                  value={severConfirmText}
                  onChange={(e) => {
                    setSeverConfirmText(e.target.value);
                    setConfirmSever(false);
                  }}
                  placeholder={t("wf_sever_type_confirm_ph", "CUT THE CORD")}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono font-black uppercase tracking-wider text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--danger)]"
                />
              </div>

              <ActionButton
                variant="danger"
                icon={t("icon_link_off", "link_off")}
                onClick={handleCutTheCord}
                disabled={isSevering || !isSeverPhraseValid}
                className={`w-full justify-center !py-3.5 ${confirmSever ? "animate-pulse" : ""}`}
              >
                {!isSeverPhraseValid
                  ? t(
                      "wf_sever_btn_locked",
                      'Type "CUT THE CORD" Above to Unlock'
                    )
                  : confirmSever
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
        subtitle={td(syncedForkingSchema.title)}
        icon={t("icon_menu_book", "menu_book")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[820px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_dashboard", "dashboard")}
              tooltip={t("tab_visual", "Visual")}
              onClick={() => setForkViewMode("ui")}
              variant={forkViewMode === "ui" ? "accent" : "default"}
            />
            <PanelHeaderButton
              icon={t("icon_menu_book", "menu_book")}
              tooltip={t("btn_post", "Post")}
              onClick={() => setForkViewMode("normal")}
              variant={forkViewMode === "normal" ? "accent" : "default"}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-5 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_menu_book", "menu_book")}
            overline={t("wf_tab_forking_help", "Forking Help & Walkthrough")}
            title={td(syncedForkingSchema.title)}
            description={td(syncedForkingSchema.summary)}
            badge={CANONICAL_DIRECTIVES.forking_guide.category}
            variant="accent"
          >
            <div className="flex flex-wrap items-center justify-end gap-2 ml-auto pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] w-full">
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

          {forkViewMode === "ui" ? (
            <InteractiveForkingGuideView
              schema={syncedForkingSchema}
              forkTab={forkTab}
              setForkTab={setForkTab}
              forkModeIdx={forkModeIdx}
              setForkModeIdx={setForkModeIdx}
              sqlSchemaTab={sqlSchemaTab}
              setSqlSchemaTab={setSqlSchemaTab}
              onInspectCovenants={() => {
                setCovenantDocTab("partners_agreement");
                setIsCovenantPanelOpen(true);
              }}
            />
          ) : (
            <UniversalGroup
              title={td(syncedForkingSchema.title)}
              icon={t("icon_menu_book", "menu_book")}
            >
              <StructuredReleaseNotesView content={cleanForkingReferenceMd} />
            </UniversalGroup>
          )}
        </div>
      </SidePanel>

      {/* SidePanel 4: Partner Community Donations (Reworked with Cost & Spending Report + Processor & Checkout Sub-Tabs) */}
      {canManageSpokeDonations && (
        <WayfinderDonationSetupSidePanel
          isOpen={activeSpokePanel === "donations"}
          onClose={() => {
            setActiveSpokePanel(null);
            loadDonationConfig();
          }}
        />
      )}

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
        discardChanges={mason.discardChanges}
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
                  placeholder={t("ph_schema_id", "e.g. custom_engine")}
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
