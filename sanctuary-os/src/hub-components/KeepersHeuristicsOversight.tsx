import React, { useState, useEffect } from "react";
import { supabase, supabaseAuth } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { ElevatedHubLayout } from "../components/layouts/ElevatedHubLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
import { UniversalGroup, UniversalTextArea, SidePanelHeroCard, SidePanelTitleInput, SidePanelPillToggle } from "../components/universal/UniversalLayout";
import { SidePanel, PanelHeaderGroup, PanelHeaderButton, CustomDropdown, EmptyState } from "../shared";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../utils/envUtils";

export default function KeepersHeuristicsOversight() {
  const { t } = useLexicon();
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("LANDING");
  const [search, setSearch] = useState("");

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newSig, setNewSig] = useState("");
  const [matchType, setMatchType] = useState("file_content_contains");
  const [severity, setSeverity] = useState("malware");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      syncLocalDisk(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSignatures();
    const handleRefresh = () => fetchSignatures();
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

  const handleSave = async () => {
    if (!newSig.trim() || !notes.trim()) return;
    setIsSubmitting(true);
    const id = editingId || `core_${newSig.trim().toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")}`;

    try {
      const userRes = await supabaseAuth.auth.getUser();
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

      await supabaseAuth.from("audit_logs").insert({
        action: editingId ? `Updated Core OS heuristic signature: ${id}` : `Added Core OS heuristic signature: ${id}`,
        target_table: "keeper_heuristic_signatures",
        target_name: id,
        actor_id: userRes.data?.user?.id,
        reason: notes.trim()
      });

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
      const { error } = await supabaseAuth
        .from("keeper_heuristic_signatures")
        .delete()
        .eq("id", editingId);

      if (error) throw error;

      const userRes = await supabaseAuth.auth.getUser();
      await supabaseAuth.from("audit_logs").insert({
        action: `Deleted Core OS heuristic signature: ${editingId}`,
        target_table: "keeper_heuristic_signatures",
        target_name: editingId,
        actor_id: userRes.data?.user?.id,
        reason: "Removed via Keepers Core"
      });

      useStore.getState().pushStatus(t("btn_delete", "Deleted"));
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

  const renderCard = (s: any) => (
    <UniversalCard
      key={s.id}
      layout="vertical"
      icon={t("icon_shield_lock", "shield_lock")}
      title={s.signature}
      statusColor={s.enabled !== false ? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)]" : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] opacity-50"}
      onClick={() => openEditEditor(s)}
      badges={
        <div className="w-full flex flex-wrap items-center gap-1.5">
          <div className="px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--danger)] flex items-center gap-1.5 shrink-0">
            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
              {t("icon_shield_lock", "shield_lock")}
            </span>
            <span>{t("core_os_badge", "Core OS")}</span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] flex items-center gap-1.5 shrink-0">
            <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
              {t("icon_terminal", "terminal")}
            </span>
            <span>{s.match_type}</span>
          </div>
        </div>
      }
    >
      <div className="flex flex-col items-center justify-center gap-1 mt-1 text-center">
        <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest truncate max-w-full px-2">
          {s.notes || "---"}
        </span>
      </div>
    </UniversalCard>
  );

  const renderLanding = () => (
    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
          <h3 className="text-sm font-black text-[var(--text)] capitalize tracking-[0.2em] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[24px] text-[var(--danger)] opacity-90 drop-shadow-lg">
                {t("icon_shield_lock", "shield_lock")}
              </span>
            </div>
            {t("recent_core_heuristics", "Active Core Heuristics")}
          </h3>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
          {activeSigs.slice(0, 8).length > 0 ? (
            activeSigs.slice(0, 8).map(renderCard)
          ) : (
            <EmptyState icon={t("icon_shield_lock", "shield_lock")} title={t("comp_no_alerts", "No Active Signatures")} className="py-8" />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
          <h3 className="text-sm font-black text-[var(--text)] capitalize tracking-[0.2em] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[24px] text-[var(--subtext)] opacity-90 drop-shadow-lg">
                {t("icon_science", "science")}
              </span>
            </div>
            {t("disabled_core_heuristics", "Disabled Core Heuristics")}
          </h3>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
          {disabledSigs.length > 0 ? (
            disabledSigs.map(renderCard)
          ) : (
            <EmptyState icon={t("icon_science", "science")} title={t("comp_no_alerts", "No Disabled Signatures")} className="py-8" />
          )}
        </div>
      </div>
    </div>
  );

  const renderGrid = (items: any[]) => (
    <>
      {loading ? (
        <div className="glass-panel p-8 rounded-2xl text-center text-sm font-bold text-[var(--subtext)] capitalize tracking-widest animate-pulse">
          {t("comp_scanning", "Scanning...")}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {items.map(renderCard)}
        </div>
      ) : (
        <EmptyState icon={t("icon_shield_lock", "shield_lock")} title={t("comp_no_alerts", "No Signatures Found")} className="py-16" />
      )}
    </>
  );

  return (
    <>
      <ElevatedHubLayout
        headerTitle={t("keepers_heuristics_title", "Core Heuristics")}
        headerSubtitle={t("keepers_heuristics_subtitle", "System-Wide Elevated Threat Definitions")}
        headerIcon={t("icon_shield_lock", "shield_lock")}
        headerIconColorClass="text-[var(--danger)]"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("search_ph", "Search...")}
        hideSearch={false}
        actions={[
          {
            id: "add_core_heuristic",
            icon: t("icon_add", "add"),
            label: t("btn_add_heuristic", "Add Heuristic"),
            onClick: openNewEditor
          }
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          {
            id: "LANDING",
            label: t("overview_tab", "Overview"),
            icon: t("icon_dashboard", "dashboard"),
            number: signatures.length.toString(),
            colorClass: "text-[var(--accent)]"
          },
          {
            id: "active",
            label: t("comp_enabled", "Enabled"),
            icon: t("icon_shield_lock", "shield_lock"),
            number: activeSigs.length.toString(),
            colorClass: "text-[var(--danger)]"
          },
          {
            id: "disabled",
            label: t("comp_disabled", "Disabled"),
            icon: t("icon_science", "science"),
            number: disabledSigs.length.toString(),
            colorClass: "text-[var(--subtext)]"
          }
        ]}
      >
        {activeTab === "LANDING" && renderLanding()}
        {activeTab === "active" && renderGrid(activeSigs)}
        {activeTab === "disabled" && renderGrid(disabledSigs)}
      </ElevatedHubLayout>

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
                tooltip={confirmDelete ? t("btn_confirm_delete", "Confirm Delete") : t("btn_delete", "Delete")}
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
            badgeIcon={enabled ? "shield_lock" : "science"}
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
            title={t("keepers_heuristics_title", "Core Heuristics")}
            icon={t("icon_shield_lock", "shield_lock")}
            headerColorClass="text-[var(--danger)]"
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
                icon={enabled ? "shield_lock" : "science"}
                variant={enabled ? "danger" : "warning"}
              />
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>
    </>
  );
}
