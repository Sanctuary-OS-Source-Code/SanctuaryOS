import { useState, useEffect, useMemo } from "react";
import { supabase, supabaseAuth, isStandaloneFork } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection } from "../components/layouts/ElevatedHubLayout";
import { LiquidGlassAlertCard } from "../components/BlueprintPatchReadiness";
import { UniversalCard } from "../components/universal/UniversalCard";
import { openSanctuaryContextMenu } from "../shared-components/ContextMenu";
import { UniversalGroup, UniversalTextArea, SidePanelHeroCard, SidePanelTitleInput, SidePanelPillToggle } from "../components/universal/UniversalLayout";
import { SidePanel, PanelHeaderGroup, PanelHeaderButton, CustomDropdown, EmptyState, ActionButton, StatBox, VAULT_CHIP_CLASS } from "../shared";
import { formatHeuristicMatchType, formatHeuristicSeverity } from "./HeuristicsReadOnlyList";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../utils/envUtils";
import { logArchitectAction } from "../lib/audit";

const GENERIC_SIGNATURE_LABELS = new Set([
  "",
  "N/A",
  "NO SIGNATURE MATCH",
  "MALWARE DNA MATCH",
  "KNOWN MALWARE HASH MATCH",
  "RADAR SWEEP DETECTION",
  "PERSISTENT QUARANTINE ARTIFACT",
]);

export default function KeepersHeuristicsOversight() {
  const { t } = useLexicon();
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("LANDING");
  const [search, setSearch] = useState("");

  // Ecosystem Malware Manifests pulled from Partner Spokes
  const [ecosystemManifests, setEcosystemManifests] = useState<any[]>([]);
  const [reportingSpokes, setReportingSpokes] = useState<any[]>([]);
  const [manifestsLoading, setManifestsLoading] = useState(true);
  const [manifestsError, setManifestsError] = useState("");
  const [manifestSpokeFilter, setManifestSpokeFilter] = useState("ALL");
  const [manifestStatusFilter, setManifestStatusFilter] = useState("ALL");
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newSig, setNewSig] = useState("");
  const [matchType, setMatchType] = useState("file_content_contains");
  const [severity, setSeverity] = useState("malware");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  const syncLocalDisk = async (coreSigs: any[]) => {
    if (!isDesktop()) return;
    try {
      const [{ data: spokeData }, config] = await Promise.all([
        supabase.from("heuristic_signatures").select("*"),
        invoke<any>("get_saved_coordinates")
      ]);
      const vaultPath = config?.vault_path;
      if (!vaultPath) return;

      const mergedMap = new Map<string, any>();
      coreSigs.forEach((s) => mergedMap.set(`core_${s.id}`, { ...s, tier_scope: "core_os" }));
      if (spokeData) {
        spokeData.forEach((s: any) => mergedMap.set(`spoke_${s.id}`, { ...s, tier_scope: "spoke" }));
      }
      await invoke("save_heuristic_signatures", {
        vaultPath,
        signatures: Array.from(mergedMap.values())
      });
    } catch (e) {
      console.error("Failed to sync heuristic signatures to local disk:", e);
    }
  };

  const fetchSignatures = async () => {
    setLoading(true);
    const { data } = await supabaseAuth
      .from("keeper_heuristic_signatures")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setSignatures(data);
      window.setTimeout(() => {
        void syncLocalDisk(data);
      }, 300);
    }
    setLoading(false);
  };

  const fetchEcosystemManifests = async () => {
    setManifestsLoading(true);
    setManifestsError("");
    try {
      if (isStandaloneFork) {
        const { data, error } = await supabase
          .from("malware_reports")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(250);
        if (error) throw error;
        const list = (data || []).map((row: any) => ({
          ...row,
          spoke_name: t("spoke_badge", "Spoke"),
          spoke_schema_id: "standalone",
        }));
        setEcosystemManifests(list);
        setReportingSpokes([
          {
            game_id: "standalone",
            schema_id: "standalone",
            name: t("spoke_badge", "Spoke"),
            count: list.length,
            status: "ok",
          },
        ]);
      } else {
        const { data: games, error: gamesErr } = await supabaseAuth
          .from("sanctuary_games")
          .select("id, name, schema_id, supabase_url, is_active, is_keepers_only")
          .eq("is_active", true)
          .order("name", { ascending: true });
        if (gamesErr) throw gamesErr;

        const allGames = Array.isArray(games) ? games : [];
        const spokeSummaries: any[] = [];
        const allManifests: any[] = [];

        await Promise.all(
          allGames.map(async (g: any) => {
            if (!g?.supabase_url) {
              spokeSummaries.push({
                game_id: g.id,
                schema_id: g.schema_id,
                name: g.name,
                count: 0,
                status: "unlinked",
              });
              return;
            }
            try {
              const res: any = await supabaseAuth.functions.invoke("game-gateway", {
                body: {
                  game_id: g.id,
                  action: "spoke_query",
                  payload: {
                    table: "malware_reports",
                    op: "select",
                    selectColumns: "*",
                    filters: [],
                    orders: [{ column: "created_at", options: { ascending: false } }],
                    limit: 250,
                    singleMode: null,
                  },
                },
              });
              const rawPayload = res?.data;
              const errMsg = res?.error?.message || rawPayload?.error;
              const rows = rawPayload?.__spoke_query_v1
                ? rawPayload.data
                : Array.isArray(rawPayload)
                  ? rawPayload
                  : null;
              if (!errMsg && Array.isArray(rows)) {
                rows.forEach((row: any) => {
                  allManifests.push({
                    ...row,
                    spoke_game_id: g.id,
                    spoke_schema_id: g.schema_id,
                    spoke_name: g.name,
                  });
                });
                spokeSummaries.push({
                  game_id: g.id,
                  schema_id: g.schema_id,
                  name: g.name,
                  count: rows.length,
                  status: "ok",
                });
              } else {
                spokeSummaries.push({
                  game_id: g.id,
                  schema_id: g.schema_id,
                  name: g.name,
                  count: 0,
                  status: "error",
                });
              }
            } catch {
              spokeSummaries.push({
                game_id: g.id,
                schema_id: g.schema_id,
                name: g.name,
                count: 0,
                status: "error",
              });
            }
          })
        );

        allManifests.sort(
          (a: any, b: any) =>
            new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
        );
        spokeSummaries.sort((a: any, b: any) =>
          String(a?.name || "").localeCompare(String(b?.name || ""))
        );
        setEcosystemManifests(allManifests);
        setReportingSpokes(spokeSummaries);
      }
    } catch (e: any) {
      console.error("Failed to pull ecosystem malware manifests:", e);
      setManifestsError(
        String(
          e?.message ||
            t("keepers_manifests_pull_error", "Unable to pull Spoke malware manifests")
        )
      );
    } finally {
      setManifestsLoading(false);
    }
  };

  useEffect(() => {
    fetchSignatures();
    fetchEcosystemManifests();
    const handleRefresh = () => {
      fetchSignatures();
      fetchEcosystemManifests();
    };
    window.addEventListener("force-heuristics-refresh", handleRefresh);
    return () => window.removeEventListener("force-heuristics-refresh", handleRefresh);
  }, []);

  const openNewEditor = () => {
    setEditingId(null);
    setNewSig("");
    setMatchType("file_content_contains");
    setSeverity("malware");
    setNotes("");
    setEnabled(true);
    setConfirmDelete(false);
    setIsEditorOpen(true);
  };

  const openEditEditor = (sig: any) => {
    setEditingId(sig.id);
    setNewSig(sig.signature || "");
    setMatchType(sig.match_type || "file_content_contains");
    setSeverity(sig.severity || "malware");
    setNotes(sig.notes || "");
    setEnabled(sig.enabled !== false);
    setConfirmDelete(false);
    setIsEditorOpen(true);
  };

  const handlePromoteToCoreHeuristic = (item: any) => {
    if (!item) return;
    setSelectedItem(null);
    setSelectedGroup(null);

    const rawSig = String(item.signature || "").trim();
    const hasSpecificSig =
      Boolean(rawSig) && !GENERIC_SIGNATURE_LABELS.has(rawSig.toUpperCase());

    if (item.matched_entry) {
      setNewSig(String(item.matched_entry));
      setMatchType("archive_entry_exact");
    } else if (hasSpecificSig) {
      setNewSig(rawSig);
      setMatchType(
        item.detection_type === "file_name_exact"
          ? "file_name_exact"
          : "file_content_contains"
      );
    } else {
      setNewSig(String(item.artifact_name || ""));
      setMatchType("file_name_exact");
    }

    setEditingId(null);
    setSeverity("malware");
    setEnabled(true);
    setConfirmDelete(false);
    setNotes(
      `${t("keepers_promoted_from_spoke", "Promoted from Spoke manifest")} (${
        item.spoke_name || t("spoke_badge", "Spoke")
      } • ${t("malware_hash_short_label", "SHA-256")}: ${
        item.detected_hash || t("none", "None")
      })`
    );
    setIsEditorOpen(true);
  };

  const handleSave = async () => {
    if (!newSig.trim() || !notes.trim()) return;
    setIsSubmitting(true);
    const id = editingId || `core_${newSig.trim().toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")}`;

    try {
      const payload = {
        id,
        signature: newSig.trim(),
        match_type: matchType,
        severity,
        source: "keepers_core",
        enabled,
        created_by: "Keepers Core",
        created_at: new Date().toISOString(),
        notes: notes.trim()
      };

      const { error } = await supabaseAuth
        .from("keeper_heuristic_signatures")
        .upsert(payload, { onConflict: "id" });

      if (error) throw error;

      const prevSig = editingId ? signatures.find((s) => s.id === editingId) : null;
      await logArchitectAction(
        editingId ? `Updated Core OS heuristic signature: ${id}` : `Added Core OS heuristic signature: ${id}`,
        "keeper_heuristic_signatures",
        id,
        notes.trim() || "Keepers Core Heuristics",
        "Keepers Core",
        true,
        {
          signature: { from: prevSig?.signature, to: newSig.trim() },
          match_type: { from: prevSig?.match_type, to: matchType },
          severity: { from: prevSig?.severity, to: severity },
          enabled: { from: prevSig?.enabled, to: enabled },
        }
      );

      useStore.getState().pushStatus(t("auto_heuristic_signature_saved", "Core Heuristic Signature Saved"));
      setIsEditorOpen(false);
      await fetchSignatures();
      window.dispatchEvent(new CustomEvent("force-heuristics-refresh"));
    } catch (e: any) {
      useStore.getState().pushStatus(`Error: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    setIsSubmitting(true);
    try {
      const prevSig = signatures.find((s) => s.id === editingId);
      const { error } = await supabaseAuth
        .from("keeper_heuristic_signatures")
        .delete()
        .eq("id", editingId);

      if (error) throw error;

      await logArchitectAction(
        `Deleted Core OS heuristic signature: ${editingId}`,
        "keeper_heuristic_signatures",
        editingId,
        "Removed via Keepers Core",
        "Keepers Core",
        true,
        {
          id: { from: editingId, to: null },
          signature: { from: prevSig?.signature, to: null },
        }
      );

      useStore.getState().pushStatus(t("btn_delete", "{Delete}"));
      setIsEditorOpen(false);
      await fetchSignatures();
      window.dispatchEvent(new CustomEvent("force-heuristics-refresh"));
    } catch (e: any) {
      useStore.getState().pushStatus(`Error: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = signatures.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.signature?.toLowerCase().includes(q) ||
      s.notes?.toLowerCase().includes(q) ||
      s.match_type?.toLowerCase().includes(q) ||
      s.id?.toLowerCase().includes(q)
    );
  });

  const activeSigs = filtered.filter((s) => s.enabled !== false);
  const disabledSigs = filtered.filter((s) => s.enabled === false);

  const availableSpokeNames = useMemo(() => {
    const names = new Set<string>();
    reportingSpokes.forEach((sp) => {
      if (sp?.name) names.add(String(sp.name));
    });
    ecosystemManifests.forEach((m) => {
      if (m?.spoke_name) names.add(String(m.spoke_name));
    });
    return Array.from(names);
  }, [reportingSpokes, ecosystemManifests]);

  const groupedManifests = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredManifests = ecosystemManifests.filter((m) => {
      if (manifestSpokeFilter !== "ALL" && m.spoke_name !== manifestSpokeFilter) {
        return false;
      }
      const normStatus = String(m.status || "pending").toLowerCase();
      if (manifestStatusFilter !== "ALL" && normStatus !== manifestStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        String(m.artifact_name || "").toLowerCase().includes(q) ||
        String(m.detected_hash || "").toLowerCase().includes(q) ||
        String(m.signature || "").toLowerCase().includes(q) ||
        String(m.matched_entry || "").toLowerCase().includes(q) ||
        String(m.spoke_name || "").toLowerCase().includes(q) ||
        String(m.detection_type || "").toLowerCase().includes(q)
      );
    });

    const groups = new Map<string, any>();
    filteredManifests.forEach((item) => {
      const hashKey =
        item.detected_hash && item.detected_hash !== "unknown-hash"
          ? String(item.detected_hash)
          : String(item.artifact_name || item.id);
      const itemTime = new Date(
        item.detected_at || item.created_at || Date.now()
      ).getTime();
      const itemStatus = String(item.status || "pending").toLowerCase();
      const existing = groups.get(hashKey);

      if (!existing) {
        groups.set(hashKey, {
          id: hashKey,
          artifact_name: item.artifact_name || t("unknown_mod", "Unknown {Mod}"),
          detected_hash: item.detected_hash || "",
          signature: item.signature || "",
          items: [item],
          count: 1,
          spokes: item.spoke_name ? [String(item.spoke_name)] : [],
          created_at: item.detected_at || item.created_at || new Date().toISOString(),
          _latestTs: itemTime,
          status:
            itemStatus === "resolved" || itemStatus === "dismissed"
              ? itemStatus
              : "pending",
        });
      } else {
        existing.items.push(item);
        existing.count += 1;
        if (item.spoke_name && !existing.spokes.includes(String(item.spoke_name))) {
          existing.spokes.push(String(item.spoke_name));
        }
        if (itemTime > existing._latestTs) {
          existing._latestTs = itemTime;
          existing.created_at = item.detected_at || item.created_at || existing.created_at;
        }
        if (itemStatus === "pending" || (existing.status !== "pending" && itemStatus === "resolved")) {
          if (itemStatus === "pending" || existing.status === "dismissed") {
            existing.status = itemStatus;
          }
        }
      }
    });

    return Array.from(groups.values()).sort((a, b) => b._latestTs - a._latestTs);
  }, [ecosystemManifests, manifestSpokeFilter, manifestStatusFilter, search, t]);

  const hasManifestFilters =
    manifestSpokeFilter !== "ALL" || manifestStatusFilter !== "ALL";

  const renderCard = (s: any) => {
    const isEnabled = s.enabled !== false;
    const matchTypeLabel = formatHeuristicMatchType(s.match_type, t);
    const severityLabel = formatHeuristicSeverity(s.severity, t);
    return (
      <UniversalCard
        key={s.id}
        layout="vertical"
        icon={t("icon_shield_lock", "shield_lock")}
        title={<span className="font-mono normal-case">{s.signature}</span>}
        subtitle={s.notes || "---"}
        bannerTopLabel={t("core_os_badge", "Core OS")}
        bannerBottomLabel={matchTypeLabel}
        isGhosted={!isEnabled}
        statusColor={isEnabled ? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)]" : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"}
        onClick={() => openEditEditor(s)}
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("edit", "Edit"),
              icon: t("icon_edit", "edit"),
              onClick: () => openEditEditor(s),
            },
            {
              divider: true,
              label: t("copy_title", "Copy Title"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: () => navigator.clipboard?.writeText(s.signature || ""),
            },
          ]);
        }}
        imageOverlay={
          <div className="absolute top-2.5 left-3 flex flex-nowrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span className={`material-symbols-outlined !text-[12px] ${isEnabled ? "text-[var(--danger)]" : "text-[var(--subtext)]"}`}>
                {isEnabled ? t("icon_shield_lock", "shield_lock") : t("icon_science", "science")}
              </span>
              <span>{isEnabled ? t("comp_enabled", "Enabled") : t("comp_disabled", "Disabled")}</span>
            </div>
          </div>
        }
        badges={
          <>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                {t("icon_shield_lock", "shield_lock")}
              </span>
              <span>{t("core_os_badge", "Core OS")}</span>
            </div>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                {t("icon_terminal", "terminal")}
              </span>
              <span>{matchTypeLabel}</span>
            </div>
          </>
        }
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
              {severityLabel}
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
              {t("edit", "Edit")} <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      />
    );
  };

  const renderManifestCard = (group: any) => {
    const isResolved = group.status === "resolved";
    const isDismissed = group.status === "dismissed";
    const statusText = isResolved
      ? t("malware_status_quarantined", "Quarantined")
      : isDismissed
        ? t("malware_status_cleared", "Cleared")
        : t("malware_status_pending", "Pending Threat");
    const themeColor = isResolved
      ? "text-[var(--success)]"
      : isDismissed
        ? "text-[var(--subtext)]"
        : "text-[var(--danger)]";
    const statusIcon = isResolved
      ? t("icon_gpp_good", "gpp_good")
      : isDismissed
        ? t("icon_remove_moderator", "remove_moderator")
        : t("icon_gpp_maybe", "gpp_maybe");

    return (
      <UniversalCard
        key={`eco-manifest-${group.id}`}
        layout="vertical"
        onClick={() => setSelectedGroup(group)}
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("btn_inspect_manifest", "Inspect"),
              icon: t("icon_threat_intelligence", "threat_intelligence"),
              onClick: () => setSelectedGroup(group),
            },
            {
              label: t("keepers_promote_core_heuristic", "Promote to Core Heuristic"),
              icon: t("icon_shield_lock", "shield_lock"),
              onClick: () => handlePromoteToCoreHeuristic(group.items[0]),
            },
            {
              divider: true,
              label: t("copy_title", "Copy Title"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: () => navigator.clipboard?.writeText(group.artifact_name || ""),
            },
          ]);
        }}
        icon={statusIcon}
        title={group.artifact_name || t("unknown_mod", "Unknown {Mod}")}
        subtitle={
          group.signature && !GENERIC_SIGNATURE_LABELS.has(String(group.signature).toUpperCase())
            ? `${t("malware_sig_label", "Sig")}: ${group.signature}`
            : t("malware_hash_match", "Hash Match")
        }
        imageOverlay={
          <div className="absolute inset-x-3 top-2.5 flex items-center justify-between gap-2 z-30 pointer-events-none">
            <div className="flex items-center gap-1.5 min-w-0 shrink">
              <div className={VAULT_CHIP_CLASS}>
                <span className={`material-symbols-outlined !text-[12px] ${themeColor}`}>
                  {statusIcon}
                </span>
                <span>{statusText}</span>
              </div>
            </div>
            {group.spokes.length > 0 && (
              <div className="flex items-center gap-1 shrink-0 ml-auto">
                <div className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                    {t("icon_dns", "dns")}
                  </span>
                  <span className="truncate max-w-[120px]">{group.spokes[0]}</span>
                </div>
                {group.spokes.length > 1 && (
                  <div className={VAULT_CHIP_CLASS}>
                    <span>+{group.spokes.length - 1}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        }
        badges={
          <>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                {t("icon_fingerprint", "fingerprint")}
              </span>
              <span className="font-mono">
                {group.detected_hash?.substring(0, 8) || t("no_hash_short", "NO-HASH")}
              </span>
            </div>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                {t("icon_schedule", "schedule")}
              </span>
              <span>{new Date(group.created_at || Date.now()).toLocaleDateString()}</span>
            </div>
          </>
        }
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
              <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                {t("icon_threat_intelligence", "threat_intelligence")}
              </span>
              {group.count} {t("reports_plural", "Reports")}
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 shrink-0">
              {t("btn_inspect_manifest", "Inspect")}{" "}
              <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      />
    );
  };

  const renderAddHeuristicLeadCard = () => (
    <LiquidGlassAlertCard
      isAlertCard={false}
      icon={t("icon_add_circle", "add_circle")}
      accentVar="var(--danger)"
      iconColorClass="text-[var(--danger)]"
      badgeIcon={t("icon_shield_lock", "shield_lock")}
      badgeLabel={t("core_os_badge", "Core OS")}
      overline={t("core_heuristics_tab", "Core Heuristics")}
      title={t("btn_add_heuristic", "Add Heuristic")}
      description={t(
        "heuristic_core_lead_desc",
        "Register a global Core OS bytecode or archive heuristic signature."
      )}
      actionLabel={t("btn_add_heuristic", "Add Heuristic")}
      actionIcon={t("icon_add", "add")}
      actionVariant="glass"
      onAction={openNewEditor}
      onClick={openNewEditor}
    />
  );

  const renderLanding = () => (
    <HubOverviewLanding>
      <HubOverviewSection
        title={t("recent_core_heuristics", "Active Core Heuristics")}
        icon={t("icon_shield_lock", "shield_lock")}
        iconColorClass="text-[var(--danger)]"
        isEmpty={false}
        emptyIcon={t("icon_shield_lock", "shield_lock")}
        emptyTitle={t("comp_no_alerts", "No Active Signatures")}
        gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        {renderAddHeuristicLeadCard()}
        {activeSigs.slice(0, 3).map(renderCard)}
      </HubOverviewSection>

      <HubOverviewSection
        title={t("keepers_ecosystem_manifests", "Ecosystem Threat Manifests")}
        icon={t("icon_threat_intelligence", "threat_intelligence")}
        iconColorClass="text-[var(--warning)]"
        isEmpty={groupedManifests.length === 0}
        emptyIcon={manifestsLoading ? t("icon_sync", "sync") : t("icon_verified_user", "verified_user")}
        emptyTitle={
          manifestsLoading
            ? t("malware_scanning_reports", "Scanning Threat Reports...")
            : manifestsError || t("malware_empty_state", "No Malware Reports Found.")
        }
        gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        {groupedManifests.slice(0, 6).map(renderManifestCard)}
      </HubOverviewSection>
    </HubOverviewLanding>
  );

  const renderGrid = (items: any[], showLead = false) => (
    <>
      {loading ? (
        <EmptyState
          icon={t("icon_sync", "sync")}
          title={t("comp_scanning", "Scanning...")}
        />
      ) : items.length > 0 || showLead ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {showLead && renderAddHeuristicLeadCard()}
          {items.map(renderCard)}
        </div>
      ) : (
        <EmptyState icon={t("icon_shield_lock", "shield_lock")} title={t("comp_no_alerts", "No Signatures Found")} className="py-16" />
      )}
    </>
  );

  const renderManifests = () => (
    <div className="flex flex-col gap-6 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {manifestsLoading ? (
        <EmptyState
          icon={t("icon_sync", "sync")}
          title={t("malware_scanning_reports", "Scanning Threat Reports...")}
        />
      ) : groupedManifests.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {groupedManifests.map(renderManifestCard)}
        </div>
      ) : (
        <EmptyState
          icon={manifestsError ? t("icon_warning", "warning") : t("icon_verified_user", "verified_user")}
          title={manifestsError || t("malware_empty_state", "No Malware Reports Found.")}
          className="py-16"
        />
      )}
    </div>
  );

  return (
    <>
      <ElevatedHubLayout
        headerTitle={t("keepers_malware_heuristics_title", "Core Heuristics & Manifests")}
        headerSubtitle={t("keepers_malware_heuristics_sub", "Global Core OS threat heuristics and ecosystem-wide Spoke malware manifests")}
        headerIcon={t("icon_shield_lock", "shield_lock")}
        headerIconColorClass="text-[var(--danger)]"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("search_ph", "Search {mods}...")}
        hideSearch={false}
        primaryPopover={
          activeTab === "manifests"
            ? {
                icon: t("icon_tune", "tune"),
                label: t("filters", "Filters"),
                isActive: hasManifestFilters,
                content: (
                  <div className="flex flex-col w-[340px] p-4 max-w-[calc(100vw-40px)] gap-4">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                        {t("filters", "Filters")}
                      </span>
                      {hasManifestFilters && (
                        <button
                          type="button"
                          onClick={() => {
                            setManifestSpokeFilter("ALL");
                            setManifestStatusFilter("ALL");
                          }}
                          className="sa-dropdown-action-chip px-2.5 h-6 text-[9px] font-bold uppercase tracking-wider cursor-pointer shrink-0"
                        >
                          {t("reset", "Reset")}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("keepers_tab_partner_spokes", "Partner Spokes")}
                      </span>
                      <CustomDropdown
                        disableTint={true}
                        value={manifestSpokeFilter}
                        onChange={(v: string[]) => setManifestSpokeFilter(v[0] || "ALL")}
                        options={[
                          { id: "ALL", label: t("all", "All") },
                          ...(reportingSpokes.length > 0
                            ? reportingSpokes.map((sp: any) => ({
                                id: String(sp.name),
                                label: `${sp.name} (${sp.count ?? 0})`,
                              }))
                            : availableSpokeNames.map((name) => ({ id: name, label: name }))),
                        ]}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("status", "Status")}
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { id: "ALL", label: t("all", "All") },
                          { id: "pending", label: t("pending", "Pending") },
                          { id: "resolved", label: t("malware_status_quarantined", "Quarantined") },
                          { id: "dismissed", label: t("malware_status_cleared", "Cleared") },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setManifestStatusFilter(opt.id)}
                            className={`sa-dropdown-filter-tab px-3 h-8 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer ${
                              manifestStatusFilter === opt.id ? "is-active" : ""
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ),
              }
            : undefined
        }
        actions={[
          {
            id: "refresh_heuristics_manifests",
            icon: t("icon_refresh", "refresh"),
            label: t("refresh", "Refresh"),
            onClick: () => {
              fetchSignatures();
              fetchEcosystemManifests();
            },
          },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          {
            id: "LANDING",
            label: t("overview", "Overview"),
            icon: t("icon_dashboard", "dashboard"),
            number: (signatures.length + groupedManifests.length).toString(),
            colorClass: "text-[var(--accent)]",
          },
          {
            id: "active",
            label: t("comp_enabled", "Enabled"),
            icon: t("icon_shield_lock", "shield_lock"),
            number: activeSigs.length.toString(),
            colorClass: "text-[var(--danger)]",
          },
          {
            id: "disabled",
            label: t("comp_disabled", "Disabled"),
            icon: t("icon_science", "science"),
            number: disabledSigs.length.toString(),
            colorClass: "text-[var(--subtext)]",
          },
          {
            id: "manifests",
            label: t("tab_malware_logs", "Manifests"),
            icon: t("icon_threat_intelligence", "threat_intelligence"),
            number: groupedManifests.length.toString(),
            colorClass: "text-[var(--warning)]",
          },
        ]}
      >
        {activeTab === "LANDING" && renderLanding()}
        {activeTab === "active" && renderGrid(activeSigs, !search.trim())}
        {activeTab === "disabled" && renderGrid(disabledSigs)}
        {activeTab === "manifests" && renderManifests()}
      </ElevatedHubLayout>

      {/* SIDE PANEL 1: Core Heuristic Editor */}
      <SidePanel
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        title={editingId ? t("edit_core_heuristic", "Edit Core Heuristic") : t("btn_add_heuristic", "Add Heuristic")}
        subtitle={t("core_os_badge", "Core OS")}
        icon={t("icon_shield_lock", "shield_lock")}
        iconColorClass="text-[var(--danger)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            {editingId && (
              <PanelHeaderButton
                icon={confirmDelete ? t("icon_warning", "warning") : t("icon_delete", "delete")}
                tooltip={confirmDelete ? t("btn_confirm_delete", "Confirm {Delete}") : t("btn_delete", "{Delete}")}
                variant="danger"
                disabled={isSubmitting}
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  handleDelete();
                }}
              />
            )}
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              tooltip={isSubmitting ? t("btn_submitting", "Submitting...") : t("comp_manual_btn_insert", "Save")}
              disabled={isSubmitting || !newSig.trim() || !notes.trim()}
              onClick={handleSave}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_shield_lock", "shield_lock")}
            overline={t("core_os_badge", "Core OS")}
            title={newSig || (editingId ? t("edit_core_heuristic", "Edit Core Heuristic") : t("btn_add_heuristic", "Add Heuristic"))}
            description={t("keepers_heuristics_subtitle", "System-Wide Elevated Threat Definitions")}
            badge={enabled ? t("comp_enabled", "Enabled") : t("comp_disabled", "Disabled")}
            badgeIcon={enabled ? t("icon_shield_lock", "shield_lock") : t("icon_science", "science")}
            variant={enabled ? "danger" : "warning"}
          />

          <SidePanelTitleInput
            value={newSig}
            onChange={setNewSig}
            label={t("auto_file_signature", "File Signature")}
            placeholder={t("heuristics_placeholder", "e.g. os.system( or discord.com/api/webhooks")}
            subtitle={editingId ? `ID: ${editingId}` : undefined}
          />

          <UniversalGroup
            title={t("core_heuristics_tab", "Core Heuristics")}
            icon={t("icon_shield_lock", "shield_lock")}
          >
            <div className="flex flex-col gap-3.5 relative z-[60]">
              <div className="flex flex-col gap-1.5 z-[90] relative">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("comp_match_type", "Match Type")}
                </label>
                <CustomDropdown
                  value={matchType}
                  options={[
                    { id: "file_content_contains", label: t("comp_match_type_content_contains", "File Content (Contains)") },
                    { id: "archive_entry_exact", label: t("comp_match_type_archive_exact", "Archive Entry (Exact)") },
                    { id: "archive_entry_contains", label: t("comp_match_type_archive_contains", "Archive Entry (Contains)") },
                    { id: "file_name_exact", label: t("comp_match_type_file_exact", "File Name (Exact)") },
                    { id: "file_name_contains", label: t("comp_match_type_file_contains", "File Name (Contains)") }
                  ]}
                  onChange={(v: string[]) => setMatchType(v[0])}
                  disableTint={true}
                />
              </div>

              <UniversalTextArea
                label={t("reason", "Reason")}
                value={notes}
                onChange={setNotes}
                className="min-h-[88px]"
                placeholder={t("comp_reason_ph", "Describe the system-wide threat vector...")}
              />

              <SidePanelPillToggle
                label={enabled ? t("comp_enabled", "Enabled") : t("comp_disabled", "Disabled")}
                checked={enabled}
                onChange={setEnabled}
                icon={enabled ? t("icon_shield_lock", "shield_lock") : t("icon_science", "science")}
                variant={enabled ? "danger" : "warning"}
              />
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      {/* SIDE PANEL 2: Grouped Ecosystem Threat Reports */}
      <SidePanel
        isOpen={!!selectedGroup && !selectedItem}
        onClose={() => setSelectedGroup(null)}
        title={t("grouped_reports_title", "Grouped Threat Reports")}
        icon={t("icon_folder_special", "folder_special")}
        iconColorClass="text-[var(--danger)]"
        subtitle={selectedGroup?.artifact_name}
        widthClass="w-[92vw] md:w-[760px]"
        headerActions={
          selectedGroup?.items?.[0] ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_shield_lock", "shield_lock")}
                variant="error"
                tooltip={t("keepers_promote_core_heuristic", "Promote to Core Heuristic")}
                onClick={() => handlePromoteToCoreHeuristic(selectedGroup.items[0])}
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        {selectedGroup && (
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_folder_special", "folder_special")}
              overline={t("tab_malware_logs", "Manifests")}
              title={selectedGroup.artifact_name || t("unknown_mod", "Unknown {Mod}")}
              description={
                selectedGroup.signature &&
                !GENERIC_SIGNATURE_LABELS.has(String(selectedGroup.signature).toUpperCase())
                  ? selectedGroup.signature
                  : t("malware_hash_match", "Hash Match")
              }
              badge={`${selectedGroup.count} ${t("reports_plural", "Reports")}`}
              variant="warning"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <StatBox
                  label={t("keepers_tab_partner_spokes", "Partner Spokes")}
                  value={selectedGroup.spokes.join(", ") || t("spoke_badge", "Spoke")}
                  icon={t("icon_dns", "dns")}
                  iconColorClass="text-[var(--subtext)]"
                />
                <StatBox
                  label={t("malware_hash_label", "SHA-256")}
                  value={
                    selectedGroup.detected_hash
                      ? `${String(selectedGroup.detected_hash).slice(0, 12)}...${String(selectedGroup.detected_hash).slice(-6)}`
                      : t("none", "None")
                  }
                  icon={t("icon_fingerprint", "fingerprint")}
                  iconColorClass="text-[var(--subtext)]"
                />
              </div>
              {selectedGroup.items?.[0] && (
                <div className="flex items-center justify-end pt-1">
                  <ActionButton
                    variant="glass"
                    icon={t("icon_shield_lock", "shield_lock")}
                    label={t("keepers_promote_core_heuristic", "Promote to Core Heuristic")}
                    onClick={() => handlePromoteToCoreHeuristic(selectedGroup.items[0])}
                  />
                </div>
              )}
            </SidePanelHeroCard>

            <UniversalGroup
              title={t("grouped_reports_title", "Grouped Threat Reports")}
              count={selectedGroup.items.length}
              icon={t("icon_threat_intelligence", "threat_intelligence")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedGroup.items.map((item: any, idx: number) => {
                  const itemStatus = String(item.status || "pending").toLowerCase();
                  const isItemResolved = itemStatus === "resolved";
                  const isItemDismissed = itemStatus === "dismissed";
                  const itemIcon = isItemResolved
                    ? t("icon_gpp_good", "gpp_good")
                    : isItemDismissed
                      ? t("icon_remove_moderator", "remove_moderator")
                      : t("icon_gpp_maybe", "gpp_maybe");
                  const itemIconColor = isItemResolved
                    ? "text-[var(--success)]"
                    : isItemDismissed
                      ? "text-[var(--subtext)]"
                      : "text-[var(--danger)]";
                  const itemStatusLabel = isItemResolved
                    ? t("malware_status_quarantined", "Quarantined")
                    : isItemDismissed
                      ? t("malware_status_cleared", "Cleared")
                      : t("pending", "Pending");
                  const itemSigTitle =
                    item.signature &&
                    !GENERIC_SIGNATURE_LABELS.has(String(item.signature).toUpperCase())
                      ? item.signature
                      : t("malware_hash_match", "Hash Match");

                  return (
                    <UniversalCard
                      key={`${item.id}-${idx}`}
                      layout="vertical"
                      headerStyle="inline"
                      onClick={() => {
                        setCopiedHash(false);
                        setSelectedItem(item);
                      }}
                      icon={itemIcon}
                      imageOverlay={
                        <div className={VAULT_CHIP_CLASS}>
                          <span className={`material-symbols-outlined !text-[12px] ${itemIconColor}`}>
                            {itemIcon}
                          </span>
                          <span>{itemStatusLabel}</span>
                        </div>
                      }
                      title={itemSigTitle}
                      subtitle={new Date(item.created_at || item.detected_at || Date.now()).toLocaleString()}
                      badges={
                        <>
                          <div className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                              {t("icon_dns", "dns")}
                            </span>
                            <span className="truncate max-w-[120px]">{item.spoke_name || t("spoke_badge", "Spoke")}</span>
                          </div>
                          {item.detection_type && (
                            <div className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                {t("icon_policy", "policy")}
                              </span>
                              <span>{formatHeuristicMatchType(item.detection_type, t)}</span>
                            </div>
                          )}
                        </>
                      }
                      footer={
                        <div className="flex justify-between items-center w-full">
                          <span className="text-[10px] font-mono text-[var(--subtext)] opacity-75 truncate pr-2">
                            {t("landing_id_prefix", "ID:")} {String(item.id || "").slice(0, 8)}
                          </span>
                          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 shrink-0">
                            {t("btn_inspect_manifest", "Inspect")} <span className="text-base leading-none">&rarr;</span>
                          </span>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            </UniversalGroup>
          </div>
        )}
      </SidePanel>

      {/* SIDE PANEL 3: Individual Ecosystem Threat Manifest Dossier */}
      <SidePanel
        isOpen={!!selectedItem}
        onClose={() => {
          setCopiedHash(false);
          setSelectedItem(null);
        }}
        title={t("malware_dossier_title", "Threat Manifest Dossier")}
        icon={t("icon_gpp_maybe", "gpp_maybe")}
        iconColorClass="text-[var(--danger)]"
        subtitle={
          selectedItem
            ? `${selectedItem.spoke_name || t("spoke_badge", "Spoke")} • ${String(selectedItem.id || "").substring(0, 12)}`
            : ""
        }
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          selectedItem ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_shield_lock", "shield_lock")}
                variant="error"
                tooltip={t("keepers_promote_core_heuristic", "Promote to Core Heuristic")}
                onClick={() => handlePromoteToCoreHeuristic(selectedItem)}
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        {selectedItem && (
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={
                selectedItem.status === "resolved"
                  ? "gpp_good"
                  : selectedItem.status === "dismissed"
                    ? "remove_moderator"
                    : "gpp_maybe"
              }
              overline={selectedItem.spoke_name || t("spoke_badge", "Spoke")}
              title={selectedItem.artifact_name || t("unknown_mod", "Unknown {Mod}")}
              description={
                selectedItem.signature &&
                !GENERIC_SIGNATURE_LABELS.has(String(selectedItem.signature).toUpperCase())
                  ? `${t("malware_sig_label", "Sig")}: ${selectedItem.signature}`
                  : t("malware_hash_match", "Hash Match")
              }
              badge={
                selectedItem.status === "resolved"
                  ? t("malware_status_quarantined", "Quarantined")
                  : selectedItem.status === "dismissed"
                    ? t("malware_status_cleared", "Cleared")
                    : t("malware_status_pending", "Pending Threat")
              }
              variant={
                selectedItem.status === "resolved"
                  ? "success"
                  : selectedItem.status === "dismissed"
                    ? "default"
                    : "danger"
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <StatBox
                  label={t("keepers_tab_partner_spokes", "Partner Spoke")}
                  value={selectedItem.spoke_name || t("spoke_badge", "Spoke")}
                  icon={t("icon_dns", "dns")}
                  iconColorClass="text-[var(--subtext)]"
                />
                <StatBox
                  label={t("malware_incident_count_label", "Network Sightings")}
                  value={selectedGroup?.count || 1}
                  icon={t("icon_layers", "layers")}
                  iconColorClass="text-[var(--warning)]"
                />
              </div>
              <div className="flex items-center justify-end pt-1">
                <ActionButton
                  variant="glass"
                  icon={t("icon_shield_lock", "shield_lock")}
                  label={t("keepers_promote_core_heuristic", "Promote to Core Heuristic")}
                  onClick={() => handlePromoteToCoreHeuristic(selectedItem)}
                />
              </div>
            </SidePanelHeroCard>

            <SidePanelTitleInput
              label={t("malware_intercepted_mod", "Intercepted {Mod}")}
              value={selectedItem.artifact_name || t("unknown_mod", "Unknown {Mod}")}
              readOnly
            />

            <UniversalGroup
              title={t("malware_vector_section_title", "Threat Vector & Rule Intelligence")}
              icon={t("icon_radar", "radar")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <StatBox
                  label={t("malware_match_scope", "Match Scope")}
                  value={formatHeuristicMatchType(selectedItem.detection_type, t)}
                  icon={t("icon_policy", "policy")}
                  iconColorClass="text-[var(--subtext)]"
                />
                <StatBox
                  label={t("auto_file_signature", "File Signature")}
                  value={selectedItem.signature || t("malware_hash_match", "Hash Match")}
                  icon={t("icon_terminal", "terminal")}
                  iconColorClass="text-[var(--danger)]"
                />
              </div>

              {selectedItem.matched_entry && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("malware_matched_entry", "Matched Internal Entry")}
                  </span>
                  <code className="text-xs font-mono text-[var(--text)] glass-surface px-3.5 py-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] break-all">
                    {selectedItem.matched_entry}
                  </code>
                </div>
              )}
            </UniversalGroup>

            <UniversalGroup
              title={t("malware_artifact_telemetry_title", "{Mod} Diagnostic Telemetry")}
              icon={t("icon_analytics", "analytics")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <StatBox
                  label={t("malware_file_format_label", "Container Format")}
                  value={selectedItem.file_extension || t("not_applicable", "N/A")}
                  icon={t("icon_deployed_code", "deployed_code")}
                  iconColorClass="text-[var(--subtext)]"
                />
                <StatBox
                  label={t("malware_os_platform_label", "Platform Family")}
                  value={selectedItem.os_platform || t("not_applicable", "N/A")}
                  icon={t("icon_devices", "devices")}
                  iconColorClass="text-[var(--subtext)]"
                />
                {typeof selectedItem.file_size_bytes === "number" && (
                  <StatBox
                    label={t("malware_file_size_label", "Payload Size")}
                    value={`${selectedItem.file_size_bytes.toLocaleString()} B`}
                    icon={t("icon_storage", "storage")}
                    iconColorClass="text-[var(--subtext)]"
                  />
                )}
                <StatBox
                  label={t("malware_detection_timestamp", "Detection Timestamp")}
                  value={new Date(
                    selectedItem.detected_at || selectedItem.created_at || Date.now()
                  ).toLocaleString()}
                  icon={t("icon_schedule", "schedule")}
                  iconColorClass="text-[var(--subtext)]"
                />
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("malware_telemetry_title", "Cryptographic Telemetry")}
              icon={t("icon_fingerprint", "fingerprint")}
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("malware_detected_sha256", "Detected SHA-256 Hash")}
                </span>
                <div className="glass-surface px-3.5 py-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-2.5">
                  <code className="text-xs font-mono text-[var(--text)] break-all select-all min-w-0">
                    {selectedItem.detected_hash || t("not_applicable", "N/A")}
                  </code>
                  {selectedItem.detected_hash && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(selectedItem.detected_hash);
                        setCopiedHash(true);
                        window.setTimeout(() => setCopiedHash(false), 1500);
                      }}
                      aria-label={t("copy", "Copy")}
                      className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] shrink-0 cursor-pointer transition-colors"
                    >
                      <span className={`material-symbols-outlined !text-[14px] ${copiedHash ? "text-[var(--success)]" : ""}`}>
                        {copiedHash ? t("icon_check", "check") : t("icon_content_copy", "content_copy")}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </UniversalGroup>
          </div>
        )}
      </SidePanel>
    </>
  );
}
