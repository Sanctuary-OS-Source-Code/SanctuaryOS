import { useState, useEffect, useRef, useMemo } from "react";
import { supabase, supabaseAuth, getActiveGameClient } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore, getSafeSchema } from "../store";
import {
  CustomDropdown,
  EmptyState,
  VAULT_CHIP_CLASS,
} from "../shared";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
} from "../components/layouts/ElevatedHubLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
import { LiquidGlassAlertCard } from "../components/BlueprintPatchReadiness";
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
import { type ForkTabId } from "../components/InteractiveForkingGuideView";
import { useStableReleaseMeta } from "../components/release-notes/ReleaseMarkdownViewer";
import { AuditLogViewer } from "../side-panels/SAAuditLogViewer";
import { isCoreOnlyAuditRow, logArchitectAction } from "../lib/audit";
import WayfinderKeeperTickets from "./WayfinderKeeperTickets";
import { postDevCoreAssetSync } from "../utils/devAssetSync";

import { useWayfinderOverviewCards } from "./wayfinder-schemas/useWayfinderOverviewCards";
import { WayfinderSchemasSidePanels } from "./wayfinder-schemas/WayfinderSchemasSidePanels";
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

  const {
    renderSpokeSetupCard,
    renderSpokeSeverCard,
    renderForkingHelpCard,
    renderDonationsCard,
    renderSqlSchemasCard,
    renderPartnersAgreementCard,
    renderComplianceProtocolCard,
    renderSchemaFileCard,
    renderOverviewTicketCard,
  } = useWayfinderOverviewCards({
    t,
    td,
    activeWorkspaceId,
    activeWs,
    setActiveSpokePanel,
    uplinkUrl,
    processor,
    donationUrl,
    setForkTab,
    setIsCovenantPanelOpen,
    setCovenantDocTab,
    stableVersion,
    setSelectedTicket,
    syncedForkingSchema,
    renamingFile,
    setRenamingFile,
    renameInput,
    setRenameInput,
    renameExt,
    setRenameExt,
    deleteConfirmPath,
    setDeleteConfirmPath,
    openFiles,
    openFile,
    handleDeleteFile,
    handleRenameSubmit,
    handleCopyUplinkBundle,
    handleCopySpokeSql,
  });

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
      <WayfinderSchemasSidePanels
        t={t}
        td={td}
        pushStatus={pushStatus}
        canManageSpokeDonations={canManageSpokeDonations}
        activeWorkspaceId={activeWorkspaceId}
        activeWs={activeWs}
        activeSpokePanel={activeSpokePanel}
        setActiveSpokePanel={setActiveSpokePanel}
        uplinkUrl={uplinkUrl}
        setUplinkUrl={setUplinkUrl}
        uplinkAnonKey={uplinkAnonKey}
        setUplinkAnonKey={setUplinkAnonKey}
        uplinkServiceKey={uplinkServiceKey}
        setUplinkServiceKey={setUplinkServiceKey}
        updatingKeys={updatingKeys}
        credentialStatus={credentialStatus}
        rotatingToken={rotatingToken}
        severReason={severReason}
        setSeverReason={setSeverReason}
        setSeverConfirmText={setSeverConfirmText}
        severConfirmText={severConfirmText}
        setConfirmSever={setConfirmSever}
        confirmSever={confirmSever}
        isSevering={isSevering}
        isSeverPhraseValid={isSeverPhraseValid}
        forkTab={forkTab}
        setForkTab={setForkTab}
        forkModeIdx={forkModeIdx}
        setForkModeIdx={setForkModeIdx}
        sqlSchemaTab={sqlSchemaTab}
        setSqlSchemaTab={setSqlSchemaTab}
        setForkViewMode={setForkViewMode}
        forkViewMode={forkViewMode}
        setIsCovenantPanelOpen={setIsCovenantPanelOpen}
        isCovenantPanelOpen={isCovenantPanelOpen}
        setCovenantDocTab={setCovenantDocTab}
        covenantDocTab={covenantDocTab}
        setCovenantViewMode={setCovenantViewMode}
        covenantViewMode={covenantViewMode}
        stableVersion={stableVersion}
        selectedTicket={selectedTicket}
        setSelectedTicket={setSelectedTicket}
        isCreateSupportOpen={isCreateSupportOpen}
        setIsCreateSupportOpen={setIsCreateSupportOpen}
        syncedPartnersMd={syncedPartnersMd}
        syncedComplianceMd={syncedComplianceMd}
        syncedPartnersTitle={syncedPartnersTitle}
        syncedComplianceTitle={syncedComplianceTitle}
        syncedPartnersUpdatedAt={syncedPartnersUpdatedAt}
        syncedComplianceUpdatedAt={syncedComplianceUpdatedAt}
        syncedForkingSchema={syncedForkingSchema}
        cleanForkingReferenceMd={cleanForkingReferenceMd}
        mason={mason}
        showTimeline={showTimeline}
        setShowTimeline={setShowTimeline}
        problemsList={problemsList}
        setProblemsList={setProblemsList}
        activeVersionTimestamp={activeVersionTimestamp}
        setActiveVersionTimestamp={setActiveVersionTimestamp}
        editorRef={editorRef}
        setEditorRef={setEditorRef}
        isCreatePanelOpen={isCreatePanelOpen}
        setIsCreatePanelOpen={setIsCreatePanelOpen}
        createFileName={createFileName}
        setCreateFileName={setCreateFileName}
        createFileExt={createFileExt}
        setCreateFileExt={setCreateFileExt}
        showReference={showReference}
        setShowReference={setShowReference}
        referenceData={referenceData}
        referenceLabel={referenceLabel}
        splitRatio={splitRatio}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
        openFiles={openFiles}
        setOpenFiles={setOpenFiles}
        activeFileIndex={activeFileIndex}
        setActiveFileIndex={setActiveFileIndex}
        validateContent={validateContent}
        closeFile={closeFile}
        handleEditorChange={handleEditorChange}
        handleCreateSubmit={handleCreateSubmit}
        isResizing={isResizing}
        isLight={isLight}
        handleEditorWillMount={handleEditorWillMount}
        loadDonationConfig={loadDonationConfig}
        handleCopyUplinkBundle={handleCopyUplinkBundle}
        handleCopySpokeSql={handleCopySpokeSql}
        handleUpdateKeys={handleUpdateKeys}
        handleRotateGatewayToken={handleRotateGatewayToken}
        handleCutTheCord={handleCutTheCord}
        saveFile={saveFile}
        activeFile={activeFile}
        isDirty={isDirty}
        validationStats={validationStats}
        addMissingStrings={addMissingStrings}
        purgeDeprecatedStrings={purgeDeprecatedStrings}
        jumpToNextEmpty={jumpToNextEmpty}
      />
    </ElevatedHubLayout>
  );
}
