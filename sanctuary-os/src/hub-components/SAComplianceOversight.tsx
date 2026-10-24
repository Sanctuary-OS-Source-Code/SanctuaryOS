import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { CustomDropdown, CustomComplianceDropdown, SidePanel, PanelHeaderGroup, PanelHeaderButton } from '../shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { SharedMetadataEditorSidePanel } from '../side-panels/SharedMetadataEditorSidePanel';
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, HubListGrid, SidePanelTitleInput, UniversalGroup, UniversalTextArea } from '../components/layouts/ElevatedHubLayout';

export default function SAComplianceOversight({ initialFilter, setInitialFilter, onOpenManualFlag }: any) {
  const { t } = useLexicon();
  const [mods, setMods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [masonsList, setMasonsList] = useState<any[]>([]);
  const [metadataMod, setMetadataMod] = useState<any>(null);
  const [filterTier, setFilterTier] = useState<number | null>(() => {
    if (initialFilter === "nsfw") return null;
    if (initialFilter === "explicit") return null;
    return null;
  });
  const [filterStatus, setFilterStatus] = useState<string>(() => {
    if (initialFilter === "quarantined") return "inactive";
    return "overview";
  });
  const [search, setSearch] = useState("");

  const [selectedMod, setSelectedMod] = useState<any | null>(null);
  const [editTier, setEditTier] = useState<number>(0);
  const [editReason, setEditReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState("");

  const fetchMods = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('mods')
      .select('id, name, master_author, compliance_tier, status, mason_id')
      .or('compliance_tier.in.(1,2,3,4,5),status.in.(under_review,pending,blacklisted,quarantined)')
      .order('compliance_tier', { ascending: false });

    if (data) setMods(data);
    const { data: mData } = await supabase.from('profiles').select('id, username').eq('role', 'mason');
    if (mData) setMasonsList(mData);
    setLoading(false);
  };

  const handleClearFlag = async (e: React.MouseEvent, mod: any) => {
    e.stopPropagation();
    if (!editReason.trim()) {
      setStatus(t("identities_req_reason"));
      return;
    }
    setLoading(true);
    try {
      await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'mods', p_payload: { id: mod.id, compliance_tier: 0, status: 'verified' } });
      const userRes = await supabase.auth.getUser();
      await supabase.rpc('secure_upsert_cloud_file', {
        p_token: useStore.getState().session?.access_token || '', p_target: 'audit_logs', p_payload: {
          action: `Cleared compliance flag for artifact: ${mod.name}`,
          target_table: 'mods',
          target_name: mod.id,
          actor_id: userRes.data?.user?.id,
          reason: editReason
        }
      });
      setEditReason("");
      fetchMods();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleSetFlag = async (e: React.MouseEvent, mod: any) => {
    e.stopPropagation();
    if (!editReason.trim()) {
      setStatus(t("identities_req_reason"));
      return;
    }
    setLoading(true);
    try {
      await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'mods', p_payload: { id: mod.id, compliance_tier: 2, status: 'blacklisted' } });
      const userRes = await supabase.auth.getUser();
      await supabase.rpc('secure_upsert_cloud_file', {
        p_token: useStore.getState().session?.access_token || '', p_target: 'audit_logs', p_payload: {
          action: `Set compliance flag for artifact: ${mod.name} to Tier 2`,
          target_table: 'mods',
          target_name: mod.id,
          actor_id: userRes.data?.user?.id,
          reason: editReason
        }
      });
      setEditReason("");
      fetchMods();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => { fetchMods(); }, []);

  const handleOpenPanel = (mod: any) => {
    setSelectedMod(mod);
    setEditTier(mod.compliance_tier);
    setEditReason("");
    setStatus("");
  };

  const handleSaveTier = async () => {
    if (!selectedMod) return;
    if (editTier !== selectedMod.compliance_tier && !editReason.trim()) {
      setStatus("Reason is required when changing compliance tier.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Updating...");

    try {
      const { error } = await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'mods', p_payload: { id: selectedMod.id, compliance_tier: editTier } });
      if (error) throw error;

      const userRes = await supabase.auth.getUser();
      const myId = userRes.data.user?.id;

      await supabase.rpc('secure_upsert_cloud_file', {
        p_token: useStore.getState().session?.access_token || '', p_target: 'audit_logs', p_payload: {
          action: `Changed compliance tier from ${selectedMod.compliance_tier} to ${editTier}`,
          target_table: 'mods',
          target_name: selectedMod.name || selectedMod.id,
          actor_id: myId,
          reason: editReason.trim() || "Compliance Update"
        }
      });

      setStatus("Success");
      setSelectedMod(null);
      fetchMods();
    } catch (err: any) {
      setStatus("Failed: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredMods = mods.filter(m => {
    if (m.compliance_tier === 5) return false;
    const matchesSearch = m.name?.toLowerCase().includes(search.toLowerCase());
    const matchesTier = filterTier ? m.compliance_tier === filterTier : true;

    let matchesStatus = true;
    const statusLower = m.status?.toLowerCase() || "";
    const isPending = ["under_review", "pending", "unverified"].includes(statusLower);
    const isInactive = m.compliance_tier === 5 || ["blacklisted", "quarantined"].includes(statusLower);
    const isActive = !isPending && !isInactive && m.compliance_tier >= 1 && m.compliance_tier <= 4;

    if (filterStatus === "pending") {
      matchesStatus = isPending;
    } else if (filterStatus === "active") {
      matchesStatus = isActive;
    } else if (filterStatus === "inactive") {
      matchesStatus = isInactive;
    }

    return matchesSearch && matchesTier && matchesStatus;
  });

  const getTierDetails = (tier: number) => {
    switch (tier) {
      case 1: return { label: t("tier_1_label") || "Tier 1", color: 'text-[var(--warning)]', bg: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]' };
      case 2: return { label: t("tier_2_label") || "Tier 2", color: 'text-[var(--warning)]', bg: 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)]' };
      case 3: return { label: t("tier_3_label") || "Tier 3", color: 'text-[var(--danger)]', bg: 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]' };
      case 4: return { label: t("tier_4_label") || "Tier 4", color: 'text-[var(--danger)]', bg: 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)]' };
      case 5: return { label: t("tier_5_label") || "Tier 5", color: 'text-[var(--danger)]', bg: 'bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]' };
      default: return { label: t("tier_0_label") || "Tier 0", color: 'text-[var(--success)]', bg: 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)]' };
    }
  };

  const pendingCount = mods.filter(m => m.compliance_tier !== 5 && ["under_review", "pending", "unverified"].includes(m.status?.toLowerCase() || "")).length;
  const activeCount = mods.filter(m => m.compliance_tier !== 5 && !["under_review", "pending", "unverified", "blacklisted", "quarantined"].includes(m.status?.toLowerCase() || "") && m.compliance_tier >= 1 && m.compliance_tier <= 4).length;
  const inactiveCount = mods.filter(m => m.compliance_tier === 5 || ["blacklisted", "quarantined"].includes(m.status?.toLowerCase() || "")).length;

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
      number: (pendingCount + activeCount + inactiveCount).toString(),
    },
    { id: 'pending', label: t("pending") || "Pending", icon: 'policy', number: pendingCount.toString(), colorClass: 'text-[var(--danger)]' },
    { id: 'active', label: t("status_active") || "Active", icon: 'verified', number: activeCount.toString(), colorClass: 'text-[var(--success)]' },
    { id: 'inactive', label: t("status_inactive") || "Inactive", icon: 'block', number: inactiveCount.toString(), colorClass: 'text-[var(--warning)]' }
  ];

  const renderModCard = (mod: any) => {
    const td = getTierDetails(mod.compliance_tier);
    return (
      <UniversalCard
        key={mod.id}
        onClick={() => handleOpenPanel(mod)}
        layout="vertical"
        icon="policy"
        title={mod.name}
        subtitle={
          <span className="flex gap-1.5 items-center">
            <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_person")}</span>
            {mod.master_author || t("unknown_mason")}
          </span>
        }
        badges={[
          <div key="tier" className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
            <span className={`material-symbols-outlined !text-[12px] ${td.color}`}>
              {t("icon_policy", "policy")}
            </span>
            <span>{td.label}</span>
          </div>
        ]}
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="flex items-center gap-1.5 truncate">
              <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_fingerprint")}</span>
              {mod.id.substring(0, 8)}
            </span>
            <span className="text-[10px] font-black theme-text-accent capitalize opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0">{t("btn_review")} &rarr;</span>
          </div>
        }
      />
    );
  };

  const renderLanding = () => {
    const pendingMods = mods.filter(m => m.compliance_tier !== 5 && ["under_review", "pending", "unverified"].includes(m.status?.toLowerCase() || ""));
    const activeMods = mods.filter(m => m.compliance_tier !== 5 && !["under_review", "pending", "unverified", "blacklisted", "quarantined"].includes(m.status?.toLowerCase() || "") && m.compliance_tier >= 1 && m.compliance_tier <= 4);
    const inactiveMods = mods.filter(m => m.compliance_tier === 5 || ["blacklisted", "quarantined"].includes(m.status?.toLowerCase() || ""));

    return (
      <HubOverviewLanding>
        <HubOverviewSection
          title={t("recent_pending") || "Recent Pending"}
          icon="policy"
          iconColorClass="text-[var(--danger)]"
          isEmpty={pendingMods.length === 0}
          emptyIcon="policy"
          emptyTitle={t("comp_no_alerts")}
        >
          {pendingMods.slice(0, 6).map(renderModCard)}
        </HubOverviewSection>

        <HubOverviewSection
          title={t("recent_live") || "Recent Active"}
          icon="verified"
          iconColorClass="text-[var(--success)]"
          isEmpty={activeMods.length === 0}
          emptyIcon="verified"
          emptyTitle={t("comp_no_alerts")}
        >
          {activeMods.slice(0, 6).map(renderModCard)}
        </HubOverviewSection>

        <HubOverviewSection
          title={t("recent_inactive") || "Recent Inactive"}
          icon="block"
          iconColorClass="text-[var(--warning)]"
          className="col-span-1 xl:col-span-2"
          isEmpty={inactiveMods.length === 0}
          emptyIcon="block"
          emptyTitle={t("comp_no_alerts")}
        >
          {inactiveMods.slice(0, 6).map(renderModCard)}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  return (
    <ElevatedHubLayout
      headerTitle={t("hub_compliance") || "Compliance Oversight"}
      headerSubtitle={t("hub_compliance_subtitle") || "Manage and review system compliance and artifact safety"}
      headerIcon="gavel"
      headerIconColorClass="text-[var(--danger)]"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t("search_ph")}
      hideSearch={filterStatus === 'overview'}
      activeTab={filterStatus === 'overview' ? 'overview' : filterStatus}
      onTabChange={(id) => setFilterStatus(id as any)}
      tabs={tabs}
      primaryPopover={filterStatus !== 'overview' ? {
        icon: "tune",
        label: t("filters") || "Filters",
        content: (
          <div className="flex flex-col w-[300px] p-4 text-left">
            <div className="flex flex-col mb-5 w-full">
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
                {t("filters") || "Filter"}
              </div>
              <CustomDropdown
                flat={true}
                variant="pill"
                value={filterTier === null ? "all" : filterTier}
                onChange={(v: any[]) => setFilterTier(v[0] === "all" ? null : v[0])}
                options={[
                  { id: "all", label: t("comp_filter_all_alerts") },
                  { id: 1, label: getTierDetails(1).label },
                  { id: 2, label: getTierDetails(2).label },
                  { id: 3, label: getTierDetails(3).label },
                  { id: 4, label: getTierDetails(4).label }
                ]}
              />
            </div>
          </div>
        )
      } : undefined}
      actions={
        filterStatus !== 'overview' ? [
          {
            id: "manual_flag",
            icon: (t("icon_flag") as string) || "flag",
            label: (t("comp_btn_manual_flag") as string) || "Manual Flag",
            onClick: () => onOpenManualFlag("")
          }
        ] : undefined
      }
    >
      {loading ? (
        <div className="glass-panel p-8 rounded-2xl text-center text-sm font-bold text-[var(--subtext)] capitalize tracking-widest animate-pulse">{t("comp_scanning")}</div>
      ) : filterStatus === 'overview' ? renderLanding() : (
        <HubListGrid
          isEmpty={filteredMods.length === 0}
          emptyIcon={t("icon_warning_amber")}
          emptyTitle={t("comp_no_alerts")}
        >
          {filteredMods.map(renderModCard)}
        </HubListGrid>
      )}

      <SidePanel
        isOpen={!!selectedMod}
        onClose={() => setSelectedMod(null)}
        title={t("comp_edit_tier")}
        icon={t("icon_policy")}
        subtitle={selectedMod ? `UUID: ${selectedMod.id}` : undefined}
        widthClass="w-[800px]"
        headerActions={
          <PanelHeaderGroup>
            {(selectedMod?.status === 'pending' || selectedMod?.status === 'under_review') ? (
              <>
                <PanelHeaderButton
                  icon="check_circle"
                  tooltip={t("btn_clear_flag")}
                  variant="success"
                  disabled={isSubmitting || !editReason.trim()}
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); handleClearFlag(e, selectedMod); setSelectedMod(null); }}
                />
                <PanelHeaderButton
                  icon="flag"
                  tooltip={t("btn_set_flag")}
                  variant="error"
                  disabled={isSubmitting || !editReason.trim()}
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); handleSetFlag(e, selectedMod); setSelectedMod(null); }}
                />
              </>
            ) : (
              <PanelHeaderButton
                icon="save"
                tooltip={isSubmitting ? t("identities_updating") : t("ui_btn_commit")}
                variant="accent"
                disabled={isSubmitting || !editReason.trim()}
                onClick={handleSaveTier}
              />
            )}
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col h-full gap-6">
          {status && (
            <div className="text-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] w-full">
              <p className={`text-[10px] font-black capitalize tracking-widest ${status.includes('Failed') || status.includes('required') ? 'text-[var(--danger)]' : 'theme-text-accent'}`}>{status}</p>
            </div>
          )}

          <div className="flex flex-col gap-3 shrink-0">
            <SidePanelTitleInput
              value={selectedMod?.name || ""}
              readOnly
              subtitle={`UUID: ${selectedMod?.id || ""}`}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMetadataMod(selectedMod)}
                className="text-[10px] font-black capitalize tracking-widest theme-text-accent hover:text-[var(--text)] transition-colors flex items-center gap-1 w-max bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-2 py-1 rounded"
              >
                <span className="material-symbols-outlined !text-[12px]">{t("icon_edit")}</span>
                {t("ui_edit_metadata")}
              </button>
            </div>
          </div>

          <UniversalGroup title={t("comp_enforcement")} icon={t("icon_policy")}>
            <div className="flex flex-col gap-2 relative z-50">
              <label className="text-[10px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("assign_tier")}</label>
              <CustomComplianceDropdown
                value={editTier}
                onChange={setEditTier}
                maxTier={5}
              />
            </div>

            <div className="flex flex-col gap-2 relative z-40 mt-2">
              <UniversalTextArea
                label={`${t("tier_reason_req")} *`}
                value={editReason}
                onChange={setEditReason}
                placeholder={t("comp_reason_placeholder")}
              />
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      <SharedMetadataEditorSidePanel
        isOpen={!!metadataMod}
        onClose={() => setMetadataMod(null)}
        activeMod={metadataMod}
        masonsList={masonsList}
        onModUpdated={fetchMods}
      />
    </ElevatedHubLayout>
  );
}
