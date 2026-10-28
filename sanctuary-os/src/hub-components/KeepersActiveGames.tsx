import { useState, useEffect, useRef } from "react";
import { supabase, supabaseAuth } from "../supabase";
import { useStore, syncGameDatabases, getSafeSchema } from "../store";
import {
  SidePanel,
  ActionButton,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
  CustomDropdown,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { logArchitectAction } from "../lib/audit";
import { UniversalCard } from "../components/universal/UniversalCard";
import {
  UniversalGroup,
  UniversalInput,
  SidePanelHeroCard,
  StatBox,
} from "../components/universal/UniversalLayout";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
  SidePanelTitleInput,
  SidePanelPillToggle,
} from "../components/layouts/ElevatedHubLayout";
import MasonFileBrowser from "./MasonFileBrowser";
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
import { AuditLogViewer } from "../side-panels/SAAuditLogViewer";
import TicketDossierSidePanel from "../side-panels/TicketDossierSidePanel";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export default function KeepersActiveGames({
  initialTab = "overview",
}: {
  initialTab?: "overview" | "workspaces" | "applications" | "schemas" | "audit_logs";
} = {}) {
  const { t } = useLexicon();
  const pushStatus = useStore((state: any) => state.pushStatus);
  const [games, setGames] = useState<any[]>([]);
  const [partnerApps, setPartnerApps] = useState<any[]>([]);
  const [selectedPartnerApp, setSelectedPartnerApp] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [auditLogsCount, setAuditLogsCount] = useState<number>(0);

  const [activeTab, setActiveTab] = useState<
    "overview" | "workspaces" | "applications" | "schemas" | "audit_logs"
  >(initialTab);
  const [workspaceStatusFilter, setWorkspaceStatusFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [auditFilterAction, setAuditFilterAction] = useState("ALL");
  const [auditScopeFilter, setAuditScopeFilter] = useState("ALL");
  const [auditTimeRange, setAuditTimeRange] = useState("ALL");
  const openAuditRetentionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const [sidePanelMode, setSidePanelMode] = useState<"add" | "edit" | null>(null);
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    schema_id: "",
    supabase_url: "",
    supabase_anon_key: "",
    supabase_service_key: "",
    icon: "",
    is_active: true,
    founder_identifier: "",
    donation_url: "",
    payment_processor: "STRIPE",
  });
  const [bundleInput, setBundleInput] = useState("");
  const [verifyingHandshake, setVerifyingHandshake] = useState(false);
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
    fetchGames();
    supabaseAuth
      .from("audit_logs")
      .select("id")
      .limit(30)
      .then(({ data }) => {
        if (data) setAuditLogsCount(data.length);
      });
  }, []);

  const fetchGames = async () => {
    setLoading(true);
    const [{ data, error }, { data: appsData }] = await Promise.all([
      supabase
        .from("sanctuary_games")
        .select(
          "id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, donation_url, payment_processor"
        )
        .order("created_at", { ascending: false }),
      supabaseAuth
        .from("keeper_tickets")
        .select("*")
        .eq("ticket_type", "Partner Spoke Application")
        .order("created_at", { ascending: false }),
    ]);
    if (!error && data) {
      setGames(data);
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
          supabase_service_key: parsed.supabase_service_key || prev.supabase_service_key,
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

    // Fallback: extract URL and keys from raw text / .env paste
    const urlMatch = trimmed.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
    const keys =
      trimmed.match(
        /(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_(?:publishable|secret)_[A-Za-z0-9_-]+)/g
      ) || [];
    if (urlMatch || keys.length > 0) {
      setFormData((prev) => ({
        ...prev,
        supabase_url: urlMatch ? urlMatch[0] : prev.supabase_url,
        supabase_anon_key: keys[0] || prev.supabase_anon_key,
        supabase_service_key: keys[1] || prev.supabase_service_key,
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

  const handleCopyUplinkBundle = () => {
    const payload = {
      name: formData.name,
      schema_id: formData.schema_id,
      supabase_url: formData.supabase_url,
      supabase_anon_key: formData.supabase_anon_key,
      supabase_service_key: formData.supabase_service_key,
      founder_identifier: formData.founder_identifier || undefined,
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
    if (!formData.supabase_url || (!formData.supabase_anon_key && !formData.supabase_service_key)) {
      alert(t("fill_required_fields", "Please fill all required fields"));
      return null;
    }
    setVerifyingHandshake(true);
    setHandshakeStatus(null);
    try {
      const res: any = await supabase.rpc("secure_verify_and_bootstrap_spoke", {
        p_payload: {
          supabase_url: formData.supabase_url.trim(),
          supabase_anon_key: formData.supabase_anon_key.trim(),
          supabase_service_key: formData.supabase_service_key?.trim() || "",
          founder_identifier: formData.founder_identifier?.trim() || "",
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

    if (formData.supabase_service_key) {
      await handleVerifyHandshake();
    }

    let result;
    if (sidePanelMode === "add") {
      result = await supabase.from("sanctuary_games").insert([
        {
          name: formData.name.trim(),
          schema_id: formData.schema_id.trim().toUpperCase(),
          supabase_url: formData.supabase_url.trim(),
          supabase_anon_key: formData.supabase_anon_key.trim(),
          ...(formData.supabase_service_key?.trim()
            ? { supabase_service_key: formData.supabase_service_key.trim() }
            : {}),
          icon: formData.icon,
          is_active: formData.is_active,
        },
      ]);
      if (!result?.error) {
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
          }
        );
      }
    } else if (sidePanelMode === "edit") {
      const prevGame = games.find((g) => g.id === formData.id);
      result = await supabase
        .from("sanctuary_games")
        .update({
          name: formData.name.trim(),
          schema_id: formData.schema_id.trim().toUpperCase(),
          supabase_url: formData.supabase_url.trim(),
          supabase_anon_key: formData.supabase_anon_key.trim(),
          ...(formData.supabase_service_key?.trim()
            ? { supabase_service_key: formData.supabase_service_key.trim() }
            : {}),
          icon: formData.icon,
          is_active: formData.is_active,
        })
        .eq("id", formData.id);
      if (!result?.error) {
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
          }
        );
      }
    }

    if (!result?.error) {
      try {
        const { savePartnerCommunityDonationConfig } = await import("../utils/supporterManager");
        await savePartnerCommunityDonationConfig({
          gameId: formData.id || undefined,
          schemaId: formData.schema_id.trim().toUpperCase(),
          donationUrl: formData.donation_url,
          paymentProcessor: formData.payment_processor,
        });
      } catch {}
      setSidePanelMode(null);
      setHandshakeStatus(null);
      setFormData({
        id: "",
        name: "",
        schema_id: "",
        supabase_url: "",
        supabase_anon_key: "",
        supabase_service_key: "",
        icon: "",
        is_active: true,
        founder_identifier: "",
        donation_url: "",
        payment_processor: "STRIPE",
      });
      await fetchGames();
      await syncGameDatabases();
    } else {
      alert(`${t("identities_failed_prefix", "Error saving game:")} ${result.error.message}`);
    }
  };

  const handleDeleteGame = async (id: string, name: string) => {
    if (!window.confirm(t("ui_confirm_deprecate_game", "Deprecate and remove this Game Database?")))
      return;
    const { error } = await supabase.from("sanctuary_games").delete().eq("id", id);
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
  };

  const handleToggleActive = async (id: string, name: string, currentStatus: boolean) => {
    const { error } = await supabase
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

  const handleSeverFDW = async (schema_id: string, name: string, id: string) => {
    if (
      !window.confirm(
        t(
          "ui_confirm_sever_fdw",
          "Cut the cord and sever this Spoke connection? This deactivates the workspace and scrubs its service key from the Hub."
        )
      )
    )
      return;
    try {
      await supabase.rpc("secure_sever_spoke_cord", {
        p_game_id: id || schema_id,
        p_payload: { reason: "Keeper Executed Severance Protocol" },
      });
      await supabase
        .from("sanctuary_games")
        .update({ is_active: false, supabase_service_key: null })
        .eq("id", id);
      logArchitectAction(
        `Severed Spoke Uplink (Cut the Cord)`,
        "sanctuary_games",
        name,
        undefined,
        "Keeper Hub",
        true,
        {
          is_active: { from: true, to: false },
          uplink_status: { from: "Connected", to: "Severed" },
        }
      );
      useStore.getState().pushStatus(t("ui_fdw_severed", "Spoke uplink severed."), "info");
    } catch {}
    await fetchGames();
    await syncGameDatabases();
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

      const { error } = await supabaseAuth.from("sanctuary_schemas").upsert(payload as any);
      if (error) throw error;

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
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(g.name?.toLowerCase().includes(q) || g.schema_id?.toLowerCase().includes(q)))
        return false;
    }
    return true;
  });

  const renderGameCard = (game: any) => {
    const isActive = game.is_active !== false;
    return (
      <UniversalCard
        key={game.id}
        onClick={() => {
          setHandshakeStatus(null);
          setFormData({
            id: game.id,
            name: game.name || "",
            schema_id: game.schema_id || "",
            supabase_url: game.supabase_url || "",
            supabase_anon_key: game.supabase_anon_key || "",
            supabase_service_key: game.supabase_service_key || "",
            icon: game.icon || "",
            is_active: game.is_active !== false,
            founder_identifier: "",
            donation_url: game.donation_url || "",
            payment_processor: (game.payment_processor || "STRIPE").toUpperCase(),
          });
          setSidePanelMode("edit");
        }}
        layout="vertical"
        isGhosted={!isActive}
        image={game.icon || undefined}
        icon={game.icon ? undefined : t("icon_dns", "dns")}
        title={game.name}
        subtitle={game.supabase_url || game.schema_id}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
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
            {game.schema_id && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_fingerprint", "fingerprint")}
                </span>
                <span>{game.schema_id}</span>
              </div>
            )}
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                {t("icon_volunteer_activism", "volunteer_activism")}
              </span>
              <span>{(game.payment_processor || "STRIPE").toUpperCase()}</span>
            </div>
          </>
        }
        actions={
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleActive(game.id, game.name, game.is_active);
              }}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:scale-110 group"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {game.is_active === false
                  ? t("icon_toggle_off", "toggle_off")
                  : t("icon_toggle_on", "toggle_on")}
              </span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSeverFDW(game.schema_id, game.name, game.id);
              }}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--warning)] hover:border-[color-mix(in_srgb,var(--warning)_40%,transparent)] hover:scale-110 group"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_link_off", "link_off")}
              </span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteGame(game.id, game.name);
              }}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:scale-110 group"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_delete", "delete")}
              </span>
            </button>
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
              {t("icon_edit", "Edit")} <span className="text-base leading-none">&rarr;</span>
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

  const getHeaderActions = () => {
    if (activeTab === "workspaces") {
      return [
        {
          id: "add",
          icon: t("icon_add", "add"),
          label: t("ui_register_game_db", "Register Game Database"),
          onClick: () => {
            setHandshakeStatus(null);
            setFormData({
              id: "",
              name: "",
              schema_id: "",
              supabase_url: "",
              supabase_anon_key: "",
              supabase_service_key: "",
              icon: "",
              is_active: true,
              founder_identifier: "",
              donation_url: "",
              payment_processor: "STRIPE",
            });
            setSidePanelMode("add");
          },
        },
      ];
    }
    if (activeTab === "schemas") {
      return [
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
              {t("audit_log_scope", "Log Scope")}
            </span>
            <CustomDropdown
              flat={true}
              disableTint={true}
              variant="pill"
              value={auditScopeFilter}
              onChange={(v: string[]) => setAuditScopeFilter(v[0] || "ALL")}
              options={[
                { id: "ALL", label: t("audit_scope_all", "All Logs (Core + Spokes)") },
                { id: "CORE", label: t("audit_scope_core", "Keepers Core Only") },
                { id: "SPOKES", label: t("audit_scope_spokes", "Community Spokes Only") },
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
      <SidePanel
        isOpen={sidePanelMode !== null}
        onClose={() => setSidePanelMode(null)}
        title={
          sidePanelMode === "edit"
            ? t("edit_db_node", "Edit Database Node")
            : t("ui_register_game_db", "Register Game Database")
        }
        subtitle={
          sidePanelMode === "edit"
            ? t("update_config", "Update Configuration")
            : t("ui_add_network_node", "Add Network Node")
        }
        icon={t("icon_dns", "dns")}
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
              icon={t("icon_network_check", "network_check")}
              tooltip={t("spoke_btn_verify_handshake", "Test Handshake & Verify Schema")}
              onClick={handleVerifyHandshake}
            />
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              variant="accent"
              tooltip={t("btn_save", "Save")}
              onClick={handleSaveGame}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_dns", "dns")}
            overline={t("ui_active_games", "Game Databases")}
            title={
              formData.name ||
              (sidePanelMode === "edit"
                ? t("edit_db_node", "Edit Database Node")
                : t("ui_register_game_db", "Register Game Database"))
            }
            description={t(
              "ui_active_games_subtitle",
              "Manage Sanctuary game databases and FDW connections."
            )}
            badge={
              formData.is_active !== false
                ? t("filter_active", "Active")
                : t("filter_inactive", "Inactive")
            }
            badgeIcon={
              formData.is_active !== false
                ? t("icon_toggle_on", "toggle_on")
                : t("icon_toggle_off", "toggle_off")
            }
            variant={formData.is_active !== false ? "success" : "warning"}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("ui_schema_id", "Schema ID")}
                value={formData.schema_id || t("oversight_na", "N/A")}
                icon={t("icon_fingerprint", "fingerprint")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("wf_donation_processor_label", "Payment Processor")}
                value={formData.payment_processor || "STRIPE"}
                icon={t("icon_volunteer_activism", "volunteer_activism")}
                iconColorClass="text-[var(--success)]"
              />
            </div>
          </SidePanelHeroCard>

          {handshakeStatus && (
            <div
              className={`glass-panel rounded-2xl p-4 border flex items-center justify-between gap-3 ${
                handshakeStatus.ok
                  ? "border-[color-mix(in_srgb,var(--success)_40%,transparent)]"
                  : "border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`material-symbols-outlined !text-[20px] ${
                    handshakeStatus.ok ? "text-[var(--success)]" : "text-[var(--danger)]"
                  }`}
                >
                  {handshakeStatus.ok
                    ? t("icon_verified", "verified")
                    : t("icon_error", "error")}
                </span>
                <div className="flex flex-col min-w-0">
                  <span
                    className={`text-xs font-black tracking-wide ${
                      handshakeStatus.ok ? "text-[var(--success)]" : "text-[var(--danger)]"
                    }`}
                  >
                    {handshakeStatus.message}
                  </span>
                  {handshakeStatus.wayfinder && (
                    <span className="text-[10px] font-bold text-[var(--subtext)]">
                      {t("spoke_wayfinder_provisioned", "Wayfinder role provisioned for: ")}
                      {handshakeStatus.wayfinder}
                    </span>
                  )}
                </div>
              </div>
              {handshakeStatus.latency !== undefined && (
                <span className="text-[10px] font-mono font-black text-[var(--subtext)] shrink-0">
                  {handshakeStatus.latency} {t("icon_ms", "ms")}
                </span>
              )}
            </div>
          )}

          <SidePanelTitleInput
            value={formData.name}
            onChange={(val) => setFormData({ ...formData, name: val })}
            label={t("ui_game_name", "Game Workspace Name")}
            placeholder={t("ui_game_name", "e.g. The Sims 4")}
            subtitle={
              formData.schema_id
                ? `${t("ui_schema_id", "SCHEMA")}: ${formData.schema_id}`
                : undefined
            }
          />

          <UniversalGroup
            title={t("spoke_quick_bundle_label", "Quick-Paste Uplink Bundle / Credentials")}
            icon={t("icon_bolt", "bolt")}
          >
            <UniversalInput
              type="text"
              value={bundleInput}
              onChange={handleParseBundle}
              placeholder={t(
                "spoke_quick_bundle_ph",
                "Paste a SANCTUARY-UPLINK:// token, JSON bundle, or raw Supabase URL & keys..."
              )}
            />
            <SidePanelPillToggle
              checked={formData.is_active !== false}
              onChange={(checked) => setFormData({ ...formData, is_active: checked })}
              label={t("filter_active", "Active Schema Engine")}
              icon={t("icon_dns", "dns")}
              variant="success"
            />
          </UniversalGroup>

          <UniversalGroup
            title={t("ui_supabase_url", "Spoke Database & Handshake Credentials")}
            icon={t("icon_dns", "dns")}
          >
            <UniversalInput
              label={t("ui_schema_id", "Schema ID")}
              type="text"
              value={formData.schema_id}
              onChange={(val) => setFormData({ ...formData, schema_id: val })}
              placeholder={t("ui_schema_id", "e.g. SIMS4")}
            />
            <UniversalInput
              label={t("ui_supabase_url", "Supabase Project URL")}
              type="text"
              value={formData.supabase_url}
              onChange={(val) => setFormData({ ...formData, supabase_url: val })}
              placeholder={t("ui_supabase_url", "https://xyz.supabase.co")}
            />
            <UniversalInput
              label={t("ui_supabase_key", "Supabase Anon Key")}
              type="text"
              value={formData.supabase_anon_key}
              onChange={(val) => setFormData({ ...formData, supabase_anon_key: val })}
              placeholder={t("ui_supabase_key", "ey...")}
            />
            <UniversalInput
              label={t("ui_supabase_service_key", "Supabase Service Key")}
              type="password"
              value={formData.supabase_service_key || ""}
              onChange={(val) => setFormData({ ...formData, supabase_service_key: val })}
              placeholder={t("ui_supabase_service_key", "secret...")}
            />
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <ActionButton
                variant="glass"
                icon={t("icon_content_copy", "content_copy")}
                label={t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
                onClick={handleCopyUplinkBundle}
              />
              <ActionButton
                variant="glass"
                icon={
                  verifyingHandshake
                    ? t("icon_sync", "sync")
                    : t("icon_network_check", "network_check")
                }
                label={
                  verifyingHandshake
                    ? t("spoke_verifying_handshake", "Testing Spoke Handshake...")
                    : t("spoke_btn_verify_handshake", "Test Handshake & Verify Schema")
                }
                disabled={verifyingHandshake}
                onClick={handleVerifyHandshake}
              />
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("spoke_founder_label", "Founding Community & Non-Custodial Donations")}
            icon={t("icon_volunteer_activism", "volunteer_activism")}
          >
            <UniversalInput
              label={t("spoke_founder_label", "Founding Community Manager (Username or UUID)")}
              type="text"
              value={formData.founder_identifier}
              onChange={(val) => setFormData({ ...formData, founder_identifier: val })}
              placeholder={t(
                "spoke_founder_ph",
                "Optional: Hub username or UUID to auto-promote to Wayfinder"
              )}
            />
            <UniversalInput
              label={t("wf_donation_processor_label", "Community Payment Processor")}
              type="text"
              value={formData.payment_processor}
              onChange={(val) => setFormData({ ...formData, payment_processor: val })}
              placeholder={t(
                "wf_donation_processor_label",
                "STRIPE / KO-FI / PATREON / PAYPAL"
              )}
            />
            <UniversalInput
              label={t(
                "wf_donation_url_label",
                "Donation / Checkout URL (Leave blank to hide from directory)"
              )}
              type="text"
              value={formData.donation_url}
              onChange={(val) => setFormData({ ...formData, donation_url: val })}
              placeholder={t(
                "wf_donation_url_ph",
                "https://donate.stripe.com/... or https://ko-fi.com/..."
              )}
            />
          </UniversalGroup>
        </div>
      </SidePanel>

      {activeTab === "overview" ? (
        <HubOverviewLanding>
          <HubOverviewSection
            icon={t("icon_schedule", "schedule")}
            iconColorClass="text-[var(--accent)]"
            title={t("chameleons_overview_recent", "Recent")}
            isEmpty={games.length === 0 && (schemaFiles?.length || 0) === 0 && !loading}
            emptyIcon={t("icon_dns", "dns")}
            emptyTitle={t("ui_no_games_registered", "No Active Schema Engines")}
            gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {games.slice(0, 2).map(renderGameCard)}
            {[...(schemaFiles || [])]
              .sort((a: any, b: any) => {
                const tA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
                const tB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
                return tB - tA;
              })
              .slice(0, 2)
              .map((file: any) => {
                const updatedDateStr = file.updated_at
                  ? new Date(file.updated_at).toLocaleDateString()
                  : undefined;
                return (
                  <UniversalCard
                    key={file.path}
                    layout="vertical"
                    onClick={() => openFile(file)}
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
                          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                            {t("icon_cloud_done", "cloud_done")}
                          </span>
                          <span>{t("synced", "Synced")}</span>
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
                  icon={t("icon_handshake", "handshake")}
                  title={meta.game_title || app.title || "Partner Spoke Application"}
                  subtitle={
                    meta.lead_contact ||
                    new Date(app.created_at).toLocaleDateString()
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
                (g) => g.is_active === false || !g.supabase_url || !g.donation_url?.trim()
              ).length === 0 &&
              (schemaFiles || []).filter((f: any) => f.hasUnsavedDraft).length === 0 &&
              !loading
            }
            emptyIcon={t("icon_check_circle", "check_circle")}
            emptyTitle={t("no_issues", "No issues detected")}
            gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {games
              .filter((g) => g.is_active === false || !g.supabase_url || !g.donation_url?.trim())
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
                  statusColor="border-[color-mix(in_srgb,var(--warning)_40%,transparent)]"
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
            <div className="p-12 font-black animate-pulse capitalize tracking-widest text-[var(--accent)]">
              {t("ui_fetching_nodes", "Fetching Nodes...")}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredGames.map(renderGameCard)}
              {filteredGames.length === 0 && sidePanelMode === null && (
                <EmptyState
                  icon={t("icon_dns", "dns")}
                  title={t("ui_no_games_registered", "No Active Schema Engines")}
                  className="col-span-full py-16"
                />
              )}
            </div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                      icon={t("icon_handshake", "handshake")}
                      title={meta.game_title || app.title || "Partner Spoke Application"}
                      subtitle={
                        meta.lead_contact ||
                        new Date(app.created_at).toLocaleDateString()
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
                              supabase_service_key: "",
                              icon: "",
                              is_active: true,
                              founder_identifier: meta.lead_contact || "",
                              donation_url: "",
                              payment_processor: "STRIPE",
                            });
                            setSidePanelMode("add");
                          }}
                          className="h-8 px-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined !text-[13px]">
                            {t("icon_add_link", "add_link")}
                          </span>
                          <span>
                            {t("keepers_provision_from_app", "Provision Spoke from Application")}
                          </span>
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

      <TicketDossierSidePanel
        isOpen={!!selectedPartnerApp}
        onClose={() => setSelectedPartnerApp(null)}
        ticket={selectedPartnerApp}
        tableName="keeper_tickets"
        isReadOnly={false}
        canReply={true}
        availableActions={["RESOLVED", "REJECTED", "ESCALATED", "PENDING"]}
        onTakeAction={async (actionType, reason) => {
          if (!selectedPartnerApp) return;
          const nextMeta = {
            ...(selectedPartnerApp.metadata || {}),
            resolution_reason: reason,
          };
          const { error } = await supabaseAuth
            .from("keeper_tickets")
            .update({ status: actionType, metadata: nextMeta })
            .eq("id", selectedPartnerApp.id);
          if (!error) {
            pushStatus(t("alert_saved", "Saved"), "success");
            setSelectedPartnerApp(null);
            fetchGames();
          }
        }}
        onReplyAdded={() => {
          fetchGames();
        }}
      />
    </ElevatedHubLayout>
  );
}
