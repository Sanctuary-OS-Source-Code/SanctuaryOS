import { useState, useEffect, useRef } from "react";
import { supabase, supabaseAuth } from "../supabase";
import { useStore, syncGameDatabases, getSafeSchema } from "../store";
import { useModalStore } from "../store/modalStore";
import {
  EmptyState,
  CustomDropdown,
  HoverTooltip,
  VAULT_CHIP_CLASS,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { logArchitectAction } from "../lib/audit";
import { UniversalCard } from "../components/universal/UniversalCard";
import { LiquidGlassAlertCard } from "../components/BlueprintPatchReadiness";
import { openSanctuaryContextMenu } from "../shared-components/ContextMenu";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
} from "../components/layouts/ElevatedHubLayout";
import MasonFileBrowser from "./MasonFileBrowser";
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
import { AuditLogViewer } from "../side-panels/SAAuditLogViewer";
import { DEFAULT_SCHEMA_CACHE_KEY } from "../utils/bundledSchemas";
import { postDevCoreAssetSync } from "../utils/devAssetSync";
import { maskEmailsInText } from "../utils/sanctuaryEmailTemplates";

import { ActiveGamesSidePanels } from "./active-games/ActiveGamesSidePanels";
const MINT_SPOKE_TOKEN_SQL = "SELECT public.mint_spoke_gateway_token();";

export default function KeepersActiveGames({
  initialTab = "overview",
}: {
  initialTab?: "overview" | "workspaces" | "applications" | "schemas" | "audit_logs";
} = {}) {
  const { t } = useLexicon();
  const pushStatus = useStore((state: any) => state.pushStatus);
  const [games, setGames] = useState<any[]>([]);
  const [overdueDmcaBySpoke, setOverdueDmcaBySpoke] = useState<Record<string, number>>({});
  const [partnerApps, setPartnerApps] = useState<any[]>([]);
  const [selectedPartnerApp, setSelectedPartnerApp] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [auditLogsCount, setAuditLogsCount] = useState<number>(0);

  const [activeTab, setActiveTab] = useState<
    "overview" | "workspaces" | "applications" | "schemas" | "audit_logs"
  >(initialTab);
  const [workspaceStatusFilter, setWorkspaceStatusFilter] = useState<
    "all" | "active" | "inactive" | "keepers_only"
  >("all");
  const [auditFilterAction, setAuditFilterAction] = useState("ALL");
  const [auditScopeFilter, setAuditScopeFilter] = useState("ALL");
  const [auditTimeRange, setAuditTimeRange] = useState("ALL");
  const openAuditRetentionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const [sidePanelMode, setSidePanelMode] = useState<"add" | "edit" | null>(null);
  const [severTargetGame, setSeverTargetGame] = useState<any | null>(null);
  const [severReason, setSeverReason] = useState("");
  const [severConfirmText, setSeverConfirmText] = useState("");
  const [confirmSever, setConfirmSever] = useState(false);
  const [isSevering, setIsSevering] = useState(false);
  const severArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    schema_id: "",
    supabase_url: "",
    supabase_anon_key: "",
    spoke_gateway_token: "",
    icon: "",
    is_active: true,
    is_keepers_only: false,
    founder_identifier: "",
  });
  const [bundleInput, setBundleInput] = useState("");
  const [verifyingHandshake, setVerifyingHandshake] = useState(false);
  const [rotatingToken, setRotatingToken] = useState(false);
  const [handshakeStatus, setHandshakeStatus] = useState<{
    ok: boolean;
    message: string;
    latency?: number;
    wayfinder?: string | null;
  } | null>(null);

  // Master Schemas Cloud Hook (Keepers Mode)
  const mason = useMasonFiles({
    isCloudMode: true,
    cloudTarget: "sanctuary_schemas",
    isKeepers: true,
  });

  const {
    files: rawSchemaFiles,
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
  } = mason;

  const schemaFiles = (rawSchemaFiles || []).filter(
    (f: any) =>
      String(f?.name || f?.path || "")
        .replace(/\.json$/i, "")
        .toLowerCase() === "default"
  );

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
    fetchGames();
    supabaseAuth
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => {
        if (count !== null) setAuditLogsCount(count);
      });
    return () => {
      if (severArmTimerRef.current) clearTimeout(severArmTimerRef.current);
    };
  }, []);

  const fetchGames = async () => {
    setLoading(true);
    const [{ data, error }, { data: appsData }, credsMetaRes, dmcaMetaRes] = await Promise.all([
      supabaseAuth
        .from("sanctuary_games")
        .select(
          "id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, is_keepers_only"
        )
        .order("created_at", { ascending: false }),
      supabaseAuth
        .from("keeper_tickets")
        .select("*")
        .eq("ticket_type", "Partner Spoke Application")
        .order("created_at", { ascending: false }),
      supabaseAuth.functions
        .invoke("game-gateway", { body: { action: "keeper_list_spoke_credentials_meta" } })
        .catch(() => ({ data: null, error: null })),
      supabaseAuth.functions
        .invoke("game-gateway", { body: { action: "list_spoke_dmca_notices", payload: {} } })
        .catch(() => ({ data: null, error: null })),
    ]);
    const credMap: Record<string, any> = credsMetaRes?.data?.credentials || {};
    if (dmcaMetaRes?.data?.overdue_spoke_counts) {
      setOverdueDmcaBySpoke(dmcaMetaRes.data.overdue_spoke_counts);
    }
    if (!error && data) {
      setGames(
        data.map((g: any) => ({
          ...g,
          ...(credMap[g.id] || {}),
        }))
      );
    }
    if (appsData) {
      setPartnerApps(appsData);
    }
    setLoading(false);
  };

  const handleParseBundle = (raw: string) => {
    setBundleInput(raw);
    const trimmed = raw.trim();
    if (!trimmed) return;

    try {
      let jsonStr = trimmed;
      if (trimmed.startsWith("SANCTUARY-UPLINK://")) {
        jsonStr = atob(trimmed.replace("SANCTUARY-UPLINK://", "").trim());
      }
      if (jsonStr.startsWith("{")) {
        const parsed = JSON.parse(jsonStr);
        setFormData((prev) => ({
          ...prev,
          name: parsed.name || prev.name,
          schema_id: (parsed.schema_id || prev.schema_id || "").toUpperCase(),
          supabase_url: parsed.supabase_url || prev.supabase_url,
          supabase_anon_key: parsed.supabase_anon_key || prev.supabase_anon_key,
          spoke_gateway_token:
            parsed.spoke_gateway_token ||
            parsed.supabase_service_key ||
            prev.spoke_gateway_token,
          founder_identifier: parsed.founder_identifier || prev.founder_identifier,
        }));
        setBundleInput("");
        setHandshakeStatus(null);
        useStore
          .getState()
          .pushStatus(
            t("spoke_bundle_parsed_toast", "Uplink bundle parsed and fields populated."),
            "success"
          );
        return;
      }
    } catch {}

    // Fallback: extract URL, Anon/Publishable keys, and Spoke Gateway Tokens from raw text
    const urlMatch = trimmed.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
    const gwMatch = trimmed.match(/\bspk_gw_[0-9a-f]{64}\b/i);
    const keys =
      trimmed.match(
        /(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_(?:publishable|secret)_[A-Za-z0-9_-]+)/g
      ) || [];
    if (urlMatch || gwMatch || keys.length > 0) {
      setFormData((prev) => ({
        ...prev,
        supabase_url: urlMatch ? urlMatch[0] : prev.supabase_url,
        supabase_anon_key: keys[0] || prev.supabase_anon_key,
        spoke_gateway_token:
          (gwMatch ? gwMatch[0].toLowerCase() : keys[1]) || prev.spoke_gateway_token,
      }));
      setBundleInput("");
      setHandshakeStatus(null);
      useStore
        .getState()
        .pushStatus(
          t("spoke_bundle_parsed_toast", "Uplink bundle parsed and fields populated."),
          "success"
        );
    }
  };

  const handleCopyUplinkBundle = (source?: any) => {
    const target = source && typeof source === "object" && "schema_id" in source ? source : formData;
    const payload = {
      name: target.name,
      schema_id: target.schema_id,
      supabase_url: target.supabase_url,
      supabase_anon_key: target.supabase_anon_key,
      founder_identifier: target.founder_identifier || undefined,
    };
    const token = "SANCTUARY-UPLINK://" + btoa(JSON.stringify(payload));
    navigator.clipboard.writeText(token);
    useStore
      .getState()
      .pushStatus(
        t("spoke_uplink_bundle_copied", "Spoke Uplink Bundle copied to clipboard!"),
        "success"
      );
  };

  const handleVerifyHandshake = async () => {
    if (!formData.supabase_url || (!formData.supabase_anon_key && !formData.spoke_gateway_token && !formData.id)) {
      alert(t("fill_required_fields", "Please fill all required fields"));
      return null;
    }
    setVerifyingHandshake(true);
    setHandshakeStatus(null);
    try {
      const handshakePayload = {
        game_id: formData.id || undefined,
        supabase_url: formData.supabase_url.trim(),
        supabase_anon_key: formData.supabase_anon_key.trim(),
        spoke_gateway_token: formData.spoke_gateway_token?.trim() || "",
        founder_identifier: formData.founder_identifier?.trim() || "",
      };
      const res: any = await supabaseAuth.functions.invoke("game-gateway", {
        body: {
          action: "keeper_verify_spoke_handshake",
          payload: handshakePayload,
          ...handshakePayload,
        },
      });
      const data = res?.data;
      if (res?.error || data?.error) {
        const errMsg = res?.error?.message || data?.error;
        setHandshakeStatus({ ok: false, message: errMsg });
        return { ok: false };
      }
      if (data?.missing_tables && data.missing_tables.length > 0) {
        setHandshakeStatus({
          ok: false,
          message: `${t(
            "spoke_handshake_missing_tables",
            "Missing tables (run schema.sql on Spoke): "
          )}${data.missing_tables.join(", ")}`,
          latency: data.latency_ms,
        });
        return { ok: false };
      }
      setHandshakeStatus({
        ok: true,
        message: t("spoke_handshake_ok", "Spoke Schema Verified & Ready"),
        latency: data?.latency_ms,
        wayfinder: data?.wayfinder_provisioned,
      });
      return { ok: true, data };
    } catch (err: any) {
      setHandshakeStatus({ ok: false, message: err.message });
      return { ok: false };
    } finally {
      setVerifyingHandshake(false);
    }
  };

  const handleSaveGame = async () => {
    if (
      !formData.name ||
      !formData.schema_id ||
      !formData.supabase_url ||
      !formData.supabase_anon_key
    ) {
      alert(t("fill_required_fields", "Please fill all required fields"));
      return;
    }

    if (formData.spoke_gateway_token) {
      await handleVerifyHandshake();
    }

    const prevGame = sidePanelMode === "edit" ? games.find((g) => g.id === formData.id) : undefined;
    const upsertPayload = {
      id: sidePanelMode === "edit" ? formData.id : undefined,
      name: formData.name.trim(),
      schema_id: formData.schema_id.trim().toUpperCase(),
      supabase_url: formData.supabase_url.trim(),
      supabase_anon_key: formData.supabase_anon_key.trim(),
      spoke_gateway_token: formData.spoke_gateway_token?.trim() || undefined,
      icon: formData.icon,
      is_active: formData.is_active,
      is_keepers_only: Boolean(formData.is_keepers_only),
    };

    const result: any = await supabaseAuth.functions.invoke("game-gateway", {
      body: {
        action: "keeper_upsert_game",
        payload: upsertPayload,
      },
    });

    const invokeError = result?.error || (result?.data?.error ? { message: result.data.error } : null);

    if (!invokeError) {
      if (sidePanelMode === "add") {
        logArchitectAction(
          `Registered Game Database: ${formData.name}`,
          "sanctuary_games",
          formData.name,
          undefined,
          "Keeper Hub",
          true,
          {
            name: { to: formData.name.trim() },
            schema_id: { to: formData.schema_id.trim().toUpperCase() },
            supabase_url: { to: formData.supabase_url.trim() },
            is_active: { to: formData.is_active },
            is_keepers_only: { to: Boolean(formData.is_keepers_only) },
          }
        );
      } else if (sidePanelMode === "edit") {
        logArchitectAction(
          `Updated Game Database: ${formData.name}`,
          "sanctuary_games",
          formData.name,
          undefined,
          "Keeper Hub",
          true,
          {
            name: { from: prevGame?.name, to: formData.name.trim() },
            schema_id: { from: prevGame?.schema_id, to: formData.schema_id.trim().toUpperCase() },
            supabase_url: { from: prevGame?.supabase_url, to: formData.supabase_url.trim() },
            is_active: { from: prevGame?.is_active, to: formData.is_active },
            is_keepers_only: {
              from: Boolean(prevGame?.is_keepers_only),
              to: Boolean(formData.is_keepers_only),
            },
          }
        );
      }
      setSidePanelMode(null);
      setHandshakeStatus(null);
      setFormData({
        id: "",
        name: "",
        schema_id: "",
        supabase_url: "",
        supabase_anon_key: "",
        spoke_gateway_token: "",
        icon: "",
        is_active: true,
        is_keepers_only: false,
        founder_identifier: "",
      });
      await fetchGames();
      await syncGameDatabases();
    } else {
      alert(`${t("identities_failed_prefix", "Error saving game:")} ${invokeError.message}`);
    }
  };

  const handleRotateGatewayToken = async (gameId: string) => {
    if (!gameId) return;
    setRotatingToken(true);
    try {
      const res: any = await supabaseAuth.functions.invoke("game-gateway", {
        body: {
          action: "rotate_spoke_gateway_token",
          game_id: gameId,
        },
      });
      const errMsg = res?.error?.message || res?.data?.error;
      if (errMsg) {
        throw new Error(errMsg);
      }
      const fp = res?.data?.key_fingerprint || "spk_gw_...";
      pushStatus(
        `${t("spoke_token_rotated_toast", "Spoke Gateway Token rotated and sealed:")} ${fp}`,
        "success"
      );
      await fetchGames();
    } catch (err: any) {
      pushStatus(
        err?.message || t("spoke_token_rotate_failed", "Failed to rotate Spoke Gateway Token"),
        "error"
      );
    } finally {
      setRotatingToken(false);
    }
  };

  const handleDeleteGame = (id: string, name: string) => {
    useModalStore.getState().setConfirmDialog({
      title: t("deprecate_game_title", "Deprecate Game Database?"),
      badgeLabel: t("keepers_hub", "Keepers Hub"),
      icon: t("icon_delete_forever", "delete_forever"),
      variant: "danger",
      message: t("ui_confirm_deprecate_game", "Deprecate and remove this Game Database?"),
      confirmText: t("delete", "{Delete}"),
      confirmIcon: t("icon_delete", "delete"),
      cancelText: t("cancel", "Cancel"),
      action: async () => {
        const { error } = await supabaseAuth.from("sanctuary_games").delete().eq("id", id);
        if (!error) {
          logArchitectAction(
            `Deprecated Game Database`,
            "sanctuary_games",
            name,
            undefined,
            "Keeper Hub",
            true,
            { id: { from: id, to: null }, name: { from: name, to: null } }
          );
        }
        await fetchGames();
        await syncGameDatabases();
      },
    });
  };

  const handleToggleActive = async (id: string, name: string, currentStatus: boolean) => {
    const { error } = await supabaseAuth
      .from("sanctuary_games")
      .update({ is_active: !currentStatus })
      .eq("id", id);
    if (!error) {
      logArchitectAction(
        `${!currentStatus ? "Activated" : "Deactivated"} Game Database`,
        "sanctuary_games",
        name,
        undefined,
        "Keeper Hub",
        true,
        { is_active: { from: currentStatus, to: !currentStatus } }
      );
    }
    await fetchGames();
    await syncGameDatabases();
  };

  const handleToggleKeepersOnly = async (id: string, name: string, currentStatus: boolean) => {
    const nextVal = !Boolean(currentStatus);
    const { error } = await supabaseAuth
      .from("sanctuary_games")
      .update({ is_keepers_only: nextVal })
      .eq("id", id);
    if (!error) {
      logArchitectAction(
        `${nextVal ? "Cloaked (Keepers-Only)" : "Uncloaked (Public)"} Game Database`,
        "sanctuary_games",
        name,
        undefined,
        "Keeper Hub",
        true,
        { is_keepers_only: { from: Boolean(currentStatus), to: nextVal } }
      );
      useStore
        .getState()
        .pushStatus(
          nextVal
            ? t(
                "spoke_keepers_only_enabled_toast",
                "Spoke hidden from public — visible to Keepers Core only."
              )
            : t(
                "spoke_keepers_only_disabled_toast",
                "Spoke visibility restored to public network."
              ),
          "info"
        );
    }
    await fetchGames();
    await syncGameDatabases();
  };

  const openSeverSpokePanel = (game: any, prefilledReason?: string) => {
    if (severArmTimerRef.current) clearTimeout(severArmTimerRef.current);
    setConfirmSever(false);
    setSeverConfirmText("");
    setSeverReason(prefilledReason || "");
    setSeverTargetGame(game);
  };

  const isSeverPhraseValid = severConfirmText.trim().toUpperCase() === "CUT THE CORD";

  const handleExecuteSeverCord = async () => {
    if (!severTargetGame || !isSeverPhraseValid) return;
    if (!confirmSever) {
      setConfirmSever(true);
      if (severArmTimerRef.current) clearTimeout(severArmTimerRef.current);
      severArmTimerRef.current = setTimeout(() => setConfirmSever(false), 6000);
      return;
    }

    setIsSevering(true);
    try {
      const targetId = severTargetGame.id || severTargetGame.schema_id;
      const reasonText =
        severReason.trim() || "Keeper Executed Severance Protocol (Cut the Cord)";
      const res: any = await supabase.rpc("secure_sever_spoke_cord", {
        p_game_id: targetId,
        p_payload: { reason: reasonText },
      });
      if (res?.error || res?.data?.error) {
        throw new Error(res?.error?.message || res?.data?.error);
      }

      logArchitectAction(
        `Severed Spoke Uplink (Cut the Cord)`,
        "sanctuary_games",
        severTargetGame.name || severTargetGame.schema_id,
        reasonText,
        "Keeper Hub",
        true,
        {
          is_active: { from: Boolean(severTargetGame.is_active !== false), to: false },
          uplink_status: { from: "Connected", to: "Severed" },
        }
      );

      useStore.getState().pushStatus(t("ui_fdw_severed", "Spoke uplink severed."), "info");
      setConfirmSever(false);
      setSeverConfirmText("");
      setSeverReason("");
      setSeverTargetGame(null);
      await fetchGames();
      await syncGameDatabases();
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(
          `${t("identities_failed_prefix", "Error:")} ${err?.message || "Failed to sever uplink"}`,
          "error"
        );
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
      const fileId = file.name.replace(/\.json$/i, "");
      if (fileId.toLowerCase() === "default") {
        parsed.id = "default";
        parsed.game_id = "default";
        parsed.display_name = parsed.display_name || "Default Master Schema";
      }
      delete parsed.name;
      delete parsed.archive_containers;
      if (!parsed.schema_version || typeof parsed.schema_version !== "number")
        parsed.schema_version = 0;
      parsed.schema_version++;

      const updatedContent = JSON.stringify(parsed, null, 2);

      const payload = {
        id: fileId,
        name:
          parsed.display_name ||
          parsed.manifest_name ||
          (fileId.toLowerCase() === "default" ? "Default Master Schema" : fileId),
        schema_data: parsed,
        version: parsed.schema_version || 1,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabaseAuth.from("sanctuary_schemas").upsert(payload as any);
      if (error) throw error;

      clearIdeCachedDraft(file.path);

      if (fileId.toLowerCase() === "default") {
        try {
          localStorage.setItem(DEFAULT_SCHEMA_CACHE_KEY, JSON.stringify(parsed));
        } catch {}
        if (import.meta.env.DEV) {
          await postDevCoreAssetSync({
            kind: "default_schema",
            content: parsed,
          });
        }
      }

      if (fileId === useStore.getState().activeGameSchema?.id) {
        useStore
          .getState()
          .setActiveGameSchema(getSafeSchema(parsed, parsed.id || "default"));
      }

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
  const isEditingDefaultBaseline = activeFile?.name.toLowerCase() === "default.json";
  if (
    activeFile &&
    !isEditingDefaultBaseline &&
    referenceData &&
    Object.keys(referenceData).length > 0
  ) {
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

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: t("icon_dashboard", "dashboard"),
      number: String(games.length + (schemaFiles?.length || 0)),
    },
    {
      id: "workspaces",
      label: t("keepers_tab_partner_spokes", "Partner Spokes"),
      icon: t("icon_dns", "dns"),
      number: games.length.toString(),
    },
    {
      id: "applications",
      label: t("keepers_tab_partner_apps", "Partner Applications"),
      icon: t("icon_handshake", "handshake"),
      number: partnerApps.length.toString(),
    },
    {
      id: "schemas",
      label: t("tab_schemas", "Master Schemas"),
      icon: t("icon_data_object", "data_object"),
      number: String(schemaFiles?.length || 0),
    },
    {
      id: "audit_logs",
      label: t("audit_logs", "Audit Logs"),
      icon: t("icon_history", "history"),
      number: String(auditLogsCount),
    },
  ];

  const filteredGames = games.filter((g) => {
    if (workspaceStatusFilter === "active" && g.is_active === false) return false;
    if (workspaceStatusFilter === "inactive" && g.is_active !== false) return false;
    if (workspaceStatusFilter === "keepers_only" && g.is_keepers_only !== true) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(g.name?.toLowerCase().includes(q) || g.schema_id?.toLowerCase().includes(q)))
        return false;
    }
    return true;
  });

  const renderGameCard = (game: any) => {
    const isActive = game.is_active !== false;
    const isKeepersOnly = game.is_keepers_only === true;
    const isLivePartnerSpoke = !isKeepersOnly && isActive && Boolean(game.supabase_url);
    const openEditGame = () => {
      setHandshakeStatus(null);
      setFormData({
        id: game.id,
        name: game.name || "",
        schema_id: game.schema_id || "",
        supabase_url: game.supabase_url || "",
        supabase_anon_key: game.supabase_anon_key || "",
        spoke_gateway_token: "",
        icon: game.icon || "",
        is_active: game.is_active !== false,
        is_keepers_only: Boolean(game.is_keepers_only),
        founder_identifier: "",
      });
      setSidePanelMode("edit");
    };
    return (
      <UniversalCard
        key={game.id}
        onClick={() => {
          if (isLivePartnerSpoke) {
            openSeverSpokePanel(game);
          } else {
            openEditGame();
          }
        }}
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            ...(!isLivePartnerSpoke
              ? [
                  {
                    label: t("edit", "Edit"),
                    icon: t("icon_edit", "edit"),
                    onClick: openEditGame,
                  },
                ]
              : []),
            {
              label: t("spoke_keepers_only_toggle", "Keepers-Only Spoke (Dev / Test Server)"),
              icon: isKeepersOnly
                ? t("icon_visibility", "visibility")
                : t("icon_visibility_off", "visibility_off"),
              onClick: () => handleToggleKeepersOnly(game.id, game.name, isKeepersOnly),
            },
            ...(isLivePartnerSpoke
              ? []
              : [
                  {
                    label: isActive
                      ? t("filter_inactive", "Inactive")
                      : t("filter_active", "Active"),
                    icon: isActive
                      ? t("icon_pause_circle", "pause_circle")
                      : t("icon_play_circle", "play_circle"),
                    onClick: () => handleToggleActive(game.id, game.name, game.is_active),
                  },
                ]),
            {
              label: t("wf_card_spoke_sever_title", "Spoke Sever (Cut the Cord)"),
              icon: t("icon_link_off", "link_off"),
              onClick: () => openSeverSpokePanel(game),
            },
            ...(!isLivePartnerSpoke
              ? [
                  {
                    label: t("btn_delete", "{Delete}"),
                    icon: t("icon_delete", "delete"),
                    variant: "danger" as const,
                    onClick: () => handleDeleteGame(game.id, game.name),
                  },
                ]
              : []),
            {
              divider: true,
              label: t("copy_title", "Copy Title"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: () => navigator.clipboard?.writeText(game.name || ""),
            },
          ]);
        }}
        layout="vertical"
        isGhosted={!isActive}
        image={game.icon || undefined}
        icon={game.icon ? undefined : t("icon_dns", "dns")}
        title={game.name}
        subtitle={
          game.supabase_url ? (
            <span className="no-text-case font-mono text-[11px]">{game.supabase_url}</span>
          ) : (
            game.schema_id
          )
        }
        imageOverlay={
          <div className="absolute top-2.5 left-3 flex flex-nowrap items-center gap-1.5 max-w-[calc(100%-6.5rem)] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  isActive ? "text-[var(--success)]" : "text-[var(--warning)]"
                }`}
              >
                {isActive
                  ? t("icon_check_circle", "check_circle")
                  : t("icon_pause_circle", "pause_circle")}
              </span>
              <span>
                {isActive ? t("filter_active", "Active") : t("filter_inactive", "Inactive")}
              </span>
            </div>
          </div>
        }
        badges={
          <>
            {isKeepersOnly && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_visibility_off", "visibility_off")}
                </span>
                <span>{t("lex_studio_keepers_only_short", "Keepers Only")}</span>
              </div>
            )}
            {game.schema_id && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_fingerprint", "fingerprint")}
                </span>
                <span>{game.schema_id}</span>
              </div>
            )}
            {game.has_credential && (
              <div className={VAULT_CHIP_CLASS}>
                <span
                  className={`material-symbols-outlined !text-[12px] ${
                    game.credential_kind === "spoke_gateway"
                      ? "text-[var(--success)]"
                      : "text-[var(--warning)]"
                  }`}
                >
                  {t("icon_encrypted", "encrypted")}
                </span>
                <span>
                  {game.key_fingerprint ||
                    t("spoke_cred_vault_sealed", "Envelope + Vault Sealed")}
                </span>
              </div>
            )}
            {Number(overdueDmcaBySpoke[String(game.id)] || 0) > 0 && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                  {t("icon_gavel", "gavel")}
                </span>
                <span className="text-[var(--danger)]">
                  {`${overdueDmcaBySpoke[String(game.id)]} ${t("dmca_sla_overdue_chip", "48h DMCA SLA Overdue")}`}
                </span>
              </div>
            )}
          </>
        }
        actions={
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleKeepersOnly(game.id, game.name, isKeepersOnly);
              }}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border hover:scale-110 ${
                isKeepersOnly
                  ? "border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--warning)]"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--warning)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[14px]">
                {isKeepersOnly
                  ? t("icon_visibility_off", "visibility_off")
                  : t("icon_visibility", "visibility")}
              </span>
              <HoverTooltip
                title={t(
                  "spoke_keepers_only_toggle",
                  "Keepers-Only Spoke (Dev / Test Server)"
                )}
              />
            </button>
            {isLivePartnerSpoke ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const isOverdue = Number(overdueDmcaBySpoke[String(game.id)] || 0) > 0;
                  openSeverSpokePanel(
                    game,
                    isOverdue
                      ? t(
                          "dmca_sever_prefill_reason",
                          "Unresolved Partner Spoke DMCA Takedown > 48h SLA — Gateway Token Review"
                        )
                      : ""
                  );
                }}
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border hover:scale-110 ${
                  Number(overdueDmcaBySpoke[String(game.id)] || 0) > 0
                    ? "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)]"
                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--warning)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                }`}
              >
                <span className="material-symbols-outlined !text-[14px]">
                  {Number(overdueDmcaBySpoke[String(game.id)] || 0) > 0
                    ? t("icon_gavel", "gavel")
                    : t("icon_link_off", "link_off")}
                </span>
                <HoverTooltip
                  title={
                    Number(overdueDmcaBySpoke[String(game.id)] || 0) > 0
                      ? t(
                          "dmca_sla_overdue_tooltip",
                          "48h DMCA SLA Overdue — Review Gateway Token / Cut the Cord"
                        )
                      : t("wf_card_spoke_sever_title", "Spoke Sever (Cut the Cord)")
                  }
                />
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleActive(game.id, game.name, game.is_active);
                }}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:scale-110"
              >
                <span className="material-symbols-outlined !text-[14px]">
                  {game.is_active === false
                    ? t("icon_toggle_off", "toggle_off")
                    : t("icon_toggle_on", "toggle_on")}
                </span>
                <HoverTooltip
                  title={
                    isActive
                      ? t("filter_active", "Active")
                      : t("filter_inactive", "Inactive")
                  }
                />
              </button>
            )}
          </div>
        }
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
              <span className="material-symbols-outlined !text-[12px] opacity-70">
                {t("icon_key", "key")}
              </span>
              {game.supabase_anon_key
                ? `${game.supabase_anon_key.substring(0, 16)}...`
                : t("oversight_na", "N/A")}
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
              {isLivePartnerSpoke
                ? t("wf_card_spoke_sever_short", "Compliance")
                : t("icon_edit", "Edit")}{" "}
              <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      />
    );
  };

  const auditFilterOptions = [
    { id: "ALL", label: t("all_logs", "All Logs") },
    { id: "MALWARE", label: t("filter_malware_edits", "Malware Edits") },
    { id: "sanctuary_games", label: t("ui_active_games", "Game Databases") },
    { id: "keeper_system_broadcasts", label: t("wf_tab_dispatch", "Dispatch") },
    { id: "keeper_tickets", label: t("support_tickets", "Support Tickets") },
    { id: "profiles", label: t("citizen_oversight", "{Citizen} Management") },
  ];

  const openRegisterGamePanel = () => {
    setHandshakeStatus(null);
    setFormData({
      id: "",
      name: "",
      schema_id: "",
      supabase_url: "",
      supabase_anon_key: "",
      spoke_gateway_token: "",
      icon: "",
      is_active: true,
      is_keepers_only: false,
      founder_identifier: "",
    });
    setSidePanelMode("add");
  };

  const renderRegisterGameLeadCard = () => (
    <LiquidGlassAlertCard
      isAlertCard={false}
      icon={t("icon_add_circle", "add_circle")}
      accentVar="var(--accent)"
      iconColorClass="text-[var(--accent)]"
      badgeIcon={t("icon_dns", "dns")}
      badgeLabel={t("ui_add_network_node", "Add Network Node")}
      overline={t("keepers_tab_partner_spokes", "Partner Spokes")}
      title={t("ui_register_game_db", "Register New Game DB")}
      description={t(
        "ui_active_games_subtitle",
        "Manage Sanctuary game databases and FDW connections."
      )}
      actionLabel={t("ui_register_game_db", "Register New Game DB")}
      actionIcon={t("icon_add", "add")}
      actionVariant="glass"
      onAction={openRegisterGamePanel}
      onClick={openRegisterGamePanel}
    />
  );

  const getHeaderActions = () => {
    if (activeTab === "schemas") {
      return undefined;
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
    return undefined;
  };

  const getPrimaryPopover = () => {
    if (activeTab === "workspaces") {
      return {
        icon: t("icon_tune", "tune"),
        label: t("filters", "Filters"),
        content: (
          <div className="flex flex-col w-[260px] p-4 max-w-[calc(100vw-40px)] gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              {t("status", "Status")}
            </span>
            <CustomDropdown
              flat={true}
              disableTint={true}
              variant="pill"
              value={workspaceStatusFilter}
              onChange={(v: string[]) => setWorkspaceStatusFilter((v[0] as any) || "all")}
              options={[
                { id: "all", label: t("filter_all", "All") },
                { id: "active", label: t("filter_active", "Active") },
                { id: "inactive", label: t("filter_inactive", "Inactive") },
                { id: "keepers_only", label: t("lex_studio_keepers_only_short", "Keepers Only") },
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
              {t("audit_scope_label", "Log Scope")}
            </span>
            <CustomDropdown
              flat={true}
              disableTint={true}
              variant="pill"
              value={auditScopeFilter}
              onChange={(v: string[]) => setAuditScopeFilter(v[0] || "ALL")}
              options={[
                { id: "ALL", label: t("all", "All") },
                { id: "CORE_OS", label: t("audit_scope_core", "Core OS") },
                { id: "SPOKES_ONLY", label: t("audit_scope_spokes", "Partner Spokes") },
                ...games
                  .filter((g) => g?.name && g.is_keepers_only !== true)
                  .map((g) => ({
                    id: String(g.name),
                    label: String(g.name),
                  })),
              ]}
            />
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mt-1">
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
                { id: "24h", label: t("audit_time_24h", "Last 24 Hours") },
                { id: "7d", label: t("audit_time_7d", "Last 7 Days") },
                { id: "30d", label: t("audit_time_30d", "Last 30 Days") },
                { id: "90d", label: t("audit_time_90d", "Last 90 Days") },
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
      headerTitle={t("keepers_tab_partner_spokes", "Partner Spokes")}
      headerSubtitle={t(
        "ui_active_games_subtitle",
        "Manage Sanctuary game databases and FDW connections."
      )}
      headerIcon={t("icon_dns", "dns")}
      headerIconColorClass="text-[var(--accent)]"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      hideSearch={activeTab === "overview"}
      searchPlaceholder={
        activeTab === "audit_logs"
          ? (t("search_logs", "Search logs...") as string)
          : activeTab === "schemas"
            ? (t("search_files", "Search files...") as string)
            : (t("search_ph", "Search {mods}...") as string)
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(v) => setActiveTab(v as any)}
      actions={getHeaderActions()}
      primaryPopover={getPrimaryPopover()}
    >

      {activeTab === "overview" ? (
        <HubOverviewLanding>
          <HubOverviewSection
            icon={t("icon_schedule", "schedule")}
            iconColorClass="text-[var(--accent)]"
            title={t("chameleons_overview_recent", "Recent")}
            isEmpty={false}
            gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {renderRegisterGameLeadCard()}
            {games.slice(0, 2).map(renderGameCard)}
            {[...(schemaFiles || [])]
              .sort((a: any, b: any) => {
                const tA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
                const tB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
                return tB - tA;
              })
              .slice(0, games.length === 0 ? 3 : games.length === 1 ? 2 : 1)
              .map((file: any) => {
                const updatedDateStr = file.updated_at
                  ? new Date(file.updated_at).toLocaleDateString()
                  : undefined;
                return (
                  <UniversalCard
                    key={file.path}
                    layout="vertical"
                    onClick={() => openFile(file)}
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
                          onClick: () => navigator.clipboard?.writeText(file.displayTitle || file.name || ""),
                        },
                      ]);
                    }}
                    icon={t("icon_data_object", "data_object")}
                    title={file.displayTitle || file.name.replace(/\.json$/i, "")}
                    subtitle={
                      updatedDateStr
                        ? `${t("wf_recent_last_updated", "Last Updated")}: ${updatedDateStr}`
                        : `${t("author", "Author")}: ${file.author || "Sanctuary Core"}`
                    }
                    imageOverlay={
                      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                        <div className={VAULT_CHIP_CLASS}>
                          <span
                            className={`material-symbols-outlined !text-[12px] ${
                              file.hasUnsavedDraft
                                ? "text-[var(--warning)]"
                                : "text-[var(--accent)]"
                            }`}
                          >
                            {file.hasUnsavedDraft
                              ? t("icon_warning", "warning")
                              : t("icon_cloud_done", "cloud_done")}
                          </span>
                          <span>
                            {file.hasUnsavedDraft
                              ? t("unsaved_changes", "Unsaved")
                              : t("synced", "Synced")}
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
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-60 truncate">
                          {file.name}
                        </span>
                        <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
                          {t("icon_edit", "Edit")}{" "}
                          <span className="text-base leading-none">&rarr;</span>
                        </span>
                      </div>
                    }
                  />
                );
              })}
          </HubOverviewSection>

          <HubOverviewSection
            icon={t("icon_handshake", "handshake")}
            iconColorClass="text-[var(--success)]"
            title={t("keepers_tab_partner_apps", "Partner Applications")}
            isEmpty={partnerApps.length === 0 && !loading}
            emptyIcon={t("icon_handshake", "handshake")}
            emptyTitle={t("keepers_no_partner_apps", "No Partner Spoke Applications Yet")}
            gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {partnerApps.slice(0, 4).map((app) => {
              const meta = app.metadata?.partner_application || {};
              const statusUpper = String(app.status || "NEW").toUpperCase();
              const isResolved = statusUpper === "RESOLVED";
              return (
                <UniversalCard
                  key={app.id}
                  layout="vertical"
                  onClick={() => setSelectedPartnerApp(app)}
                  onContextMenu={(e) => {
                    openSanctuaryContextMenu(e, [
                      {
                        label: t("dossier_subtitle", "Ticket Dossier"),
                        icon: t("icon_handshake", "handshake"),
                        onClick: () => setSelectedPartnerApp(app),
                      },
                      {
                        divider: true,
                        label: t("copy_title", "Copy Title"),
                        icon: t("icon_content_copy", "content_copy"),
                        onClick: () => navigator.clipboard?.writeText(meta.game_title || app.title || ""),
                      },
                    ]);
                  }}
                  icon={t("icon_handshake", "handshake")}
                  title={meta.game_title || app.title || "Partner Spoke Application"}
                  subtitle={
                    meta.lead_contact
                      ? maskEmailsInText(meta.lead_contact)
                      : new Date(app.created_at).toLocaleDateString()
                  }
                  badges={
                    <>
                      <div className={VAULT_CHIP_CLASS}>
                        <span
                          className={`material-symbols-outlined !text-[12px] ${
                            isResolved ? "text-[var(--success)]" : "text-[var(--accent)]"
                          }`}
                        >
                          {isResolved
                            ? t("icon_check_circle", "check_circle")
                            : t("icon_schedule", "schedule")}
                        </span>
                        <span>{statusUpper}</span>
                      </div>
                      {meta.primary_extensions && (
                        <div className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                            {t("icon_extension", "extension")}
                          </span>
                          <span>{meta.primary_extensions}</span>
                        </div>
                      )}
                      {meta.team_size && (
                        <div className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                            {t("icon_groups", "groups")}
                          </span>
                          <span>{meta.team_size}</span>
                        </div>
                      )}
                    </>
                  }
                  footer={
                    <div className="flex justify-between items-center w-full">
                      <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 truncate">
                        {meta.infra_readiness || new Date(app.created_at).toLocaleDateString()}
                      </span>
                      <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1 shrink-0">
                        {t("dossier_subtitle", "Ticket Dossier")} &rarr;
                      </span>
                    </div>
                  }
                >
                  <p className="text-[11px] text-[var(--subtext)] opacity-85 line-clamp-2 leading-relaxed mt-1">
                    {meta.vision_summary || app.description}
                  </p>
                </UniversalCard>
              );
            })}
          </HubOverviewSection>

          <HubOverviewSection
            icon={t("icon_warning", "warning")}
            iconColorClass="text-[var(--warning)]"
            title={t("chameleons_overview_anomalies", "Anomalies")}
            isEmpty={
              games.filter(
                (g) => g.is_active === false || !g.supabase_url
              ).length === 0 &&
              (schemaFiles || []).filter((f: any) => f.hasUnsavedDraft).length === 0 &&
              !loading
            }
            emptyIcon={t("icon_check_circle", "check_circle")}
            emptyTitle={t("no_issues", "No issues detected")}
            gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {games
              .filter((g) => g.is_active === false || !g.supabase_url)
              .slice(0, 4)
              .map(renderGameCard)}
            {(schemaFiles || [])
              .filter((f: any) => f.hasUnsavedDraft)
              .slice(0, 2)
              .map((file: any) => (
                <UniversalCard
                  key={`anomaly_${file.path}`}
                  layout="vertical"
                  onClick={() => openFile(file)}
                  icon={t("icon_data_object", "data_object")}
                  title={file.displayTitle || file.name.replace(/\.json$/i, "")}
                  subtitle={file.name}
                  statusColor="border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
                  imageOverlay={
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                          {t("icon_warning", "warning")}
                        </span>
                        <span>{t("unsaved_changes", "Unsaved")}</span>
                      </div>
                    </div>
                  }
                  badges={
                    <div className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t("icon_data_object", "data_object")}
                      </span>
                      <span>{t("tab_schemas", "Master Schemas")}</span>
                    </div>
                  }
                  footer={
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-60 truncate">
                        {file.name}
                      </span>
                      <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--warning)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
                        {t("icon_edit", "Edit")}{" "}
                        <span className="text-base leading-none">&rarr;</span>
                      </span>
                    </div>
                  }
                />
              ))}
          </HubOverviewSection>
        </HubOverviewLanding>
      ) : activeTab === "workspaces" ? (
        <div className="flex flex-col gap-4 pb-16">
          {loading ? (
            <EmptyState
              icon={t("icon_sync", "sync")}
              title={t("ui_fetching_nodes", "Fetching Nodes...")}
            />
          ) : (
            (() => {
              const showRegisterLead =
                !searchQuery.trim() && workspaceStatusFilter === "all";
              if (!showRegisterLead && filteredGames.length === 0 && sidePanelMode === null) {
                return (
                  <EmptyState
                    icon={t("icon_dns", "dns")}
                    title={t("ui_no_games_registered", "No Active Schema Engines")}
                    className="col-span-full py-16"
                  />
                );
              }
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {showRegisterLead && renderRegisterGameLeadCard()}
                  {filteredGames.map(renderGameCard)}
                </div>
              );
            })()
          )}
        </div>
      ) : activeTab === "applications" ? (
        <div className="flex flex-col gap-4 pb-16">
          {loading ? (
            <div className="p-12 font-black animate-pulse capitalize tracking-widest text-[var(--accent)]">
              {t("ui_fetching_nodes", "Fetching Nodes...")}
            </div>
          ) : partnerApps.length === 0 ? (
            <EmptyState
              icon={t("icon_handshake", "handshake")}
              title={t("keepers_no_partner_apps", "No Partner Spoke Applications Yet")}
              className="py-16"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {partnerApps
                .filter((app) => {
                  if (!searchQuery.trim()) return true;
                  const q = searchQuery.toLowerCase();
                  return (
                    app.title?.toLowerCase().includes(q) ||
                    app.description?.toLowerCase().includes(q) ||
                    app.metadata?.partner_application?.game_title?.toLowerCase().includes(q) ||
                    app.metadata?.partner_application?.lead_contact?.toLowerCase().includes(q)
                  );
                })
                .map((app) => {
                  const meta = app.metadata?.partner_application || {};
                  const statusUpper = String(app.status || "NEW").toUpperCase();
                  const isResolved = statusUpper === "RESOLVED";
                  return (
                    <UniversalCard
                      key={app.id}
                      layout="vertical"
                      onClick={() => setSelectedPartnerApp(app)}
                      onContextMenu={(e) => {
                        openSanctuaryContextMenu(e, [
                          {
                            label: t("dossier_subtitle", "Ticket Dossier"),
                            icon: t("icon_handshake", "handshake"),
                            onClick: () => setSelectedPartnerApp(app),
                          },
                          {
                            divider: true,
                            label: t("copy_title", "Copy Title"),
                            icon: t("icon_content_copy", "content_copy"),
                            onClick: () => navigator.clipboard?.writeText(meta.game_title || app.title || ""),
                          },
                        ]);
                      }}
                      icon={t("icon_handshake", "handshake")}
                      title={meta.game_title || app.title || "Partner Spoke Application"}
                      subtitle={
                        meta.lead_contact
                          ? maskEmailsInText(meta.lead_contact)
                          : new Date(app.created_at).toLocaleDateString()
                      }
                      badges={
                        <>
                          <div className={VAULT_CHIP_CLASS}>
                            <span
                              className={`material-symbols-outlined !text-[12px] ${
                                isResolved ? "text-[var(--success)]" : "text-[var(--accent)]"
                              }`}
                            >
                              {isResolved
                                ? t("icon_check_circle", "check_circle")
                                : t("icon_schedule", "schedule")}
                            </span>
                            <span>{statusUpper}</span>
                          </div>
                          {meta.primary_extensions && (
                            <div className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_extension", "extension")}
                              </span>
                              <span>{meta.primary_extensions}</span>
                            </div>
                          )}
                          {meta.team_size && (
                            <div className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                                {t("icon_groups", "groups")}
                              </span>
                              <span>{meta.team_size}</span>
                            </div>
                          )}
                        </>
                      }
                      actions={
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rawGameTitle = String(meta.game_title || app.title || "")
                              .replace(/^\[Partner Spoke\]\s*/i, "")
                              .trim();
                            const cleanSchemaId = rawGameTitle
                              .toUpperCase()
                              .replace(/[^A-Z0-9]+/g, "_")
                              .replace(/^_+|_+$/g, "")
                              .slice(0, 20);
                            setHandshakeStatus(null);
                            setFormData({
                              id: "",
                              name: rawGameTitle,
                              schema_id: cleanSchemaId,
                              supabase_url: "",
                              supabase_anon_key: "",
                              spoke_gateway_token: "",
                              icon: "",
                              is_active: true,
                              is_keepers_only: false,
                              founder_identifier: meta.lead_contact || "",
                            });
                            setSidePanelMode("add");
                          }}
                          className="relative w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-center hover:scale-110 transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined !text-[15px]">
                            {t("icon_rocket_launch", "rocket_launch")}
                          </span>
                          <HoverTooltip
                            title={t(
                              "keepers_provision_from_app",
                              "Provision Spoke from Application"
                            )}
                          />
                        </button>
                      }
                      footer={
                        <div className="flex justify-between items-center w-full">
                          <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 truncate">
                            {meta.infra_readiness || new Date(app.created_at).toLocaleDateString()}
                          </span>
                          <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1 shrink-0">
                            {t("dossier_subtitle", "Ticket Dossier")} &rarr;
                          </span>
                        </div>
                      }
                    >
                      <p className="text-[11px] text-[var(--subtext)] opacity-85 line-clamp-2 leading-relaxed mt-1">
                        {meta.vision_summary || app.description}
                      </p>
                    </UniversalCard>
                  );
                })}
            </div>
          )}
        </div>
      ) : activeTab === "schemas" ? (
        <MasonFileBrowser
          t={t}
          isCloudMode={true}
          internalCloudTarget="sanctuary_schemas"
          files={schemaFiles}
          searchQuery={searchQuery}
          fileTypeFilter="all"
          fetchError={mason.fetchError}
          openFile={openFile}
          renamingFile={renamingFile}
          setRenamingFile={setRenamingFile}
          renameInput={renameInput}
          setRenameInput={setRenameInput}
          renameExt={renameExt}
          setRenameExt={setRenameExt}
          handleRenameSubmit={handleRenameSubmit}
          deleteConfirmPath={deleteConfirmPath}
          setDeleteConfirmPath={setDeleteConfirmPath}
          handleDeleteFile={handleDeleteFile}
          openFiles={openFiles}
        />
      ) : (
        <AuditLogViewer
          isKeepers={true}
          embedded={true}
          externalSearch={searchQuery}
          externalFilterAction={auditFilterAction}
          externalScopeFilter={auditScopeFilter}
          externalTimeRange={auditTimeRange}
          openRetentionRef={openAuditRetentionRef}
          onCountChange={setAuditLogsCount}
        />
      )}

      {/* Master Schema Editor Panel */}
      <MasonEditorPanel
        t={t}
        isCloudMode={true}
        isKeepers={true}
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
      <ActiveGamesSidePanels
        MINT_SPOKE_TOKEN_SQL={MINT_SPOKE_TOKEN_SQL}
        t={t}
        pushStatus={pushStatus}
        games={games}
        selectedPartnerApp={selectedPartnerApp}
        setSelectedPartnerApp={setSelectedPartnerApp}
        sidePanelMode={sidePanelMode}
        setSidePanelMode={setSidePanelMode}
        severTargetGame={severTargetGame}
        setSeverTargetGame={setSeverTargetGame}
        setSeverReason={setSeverReason}
        severReason={severReason}
        setSeverConfirmText={setSeverConfirmText}
        severConfirmText={severConfirmText}
        setConfirmSever={setConfirmSever}
        confirmSever={confirmSever}
        isSevering={isSevering}
        severArmTimerRef={severArmTimerRef}
        formData={formData}
        setFormData={setFormData}
        bundleInput={bundleInput}
        verifyingHandshake={verifyingHandshake}
        rotatingToken={rotatingToken}
        handshakeStatus={handshakeStatus}
        isCreatePanelOpen={isCreatePanelOpen}
        setIsCreatePanelOpen={setIsCreatePanelOpen}
        createFileName={createFileName}
        setCreateFileName={setCreateFileName}
        createFileExt={createFileExt}
        setCreateFileExt={setCreateFileExt}
        handleCreateSubmit={handleCreateSubmit}
        fetchGames={fetchGames}
        handleParseBundle={handleParseBundle}
        handleCopyUplinkBundle={handleCopyUplinkBundle}
        handleVerifyHandshake={handleVerifyHandshake}
        handleSaveGame={handleSaveGame}
        handleRotateGatewayToken={handleRotateGatewayToken}
        isSeverPhraseValid={isSeverPhraseValid}
        handleExecuteSeverCord={handleExecuteSeverCord}
      />
    </ElevatedHubLayout>
  );
}
