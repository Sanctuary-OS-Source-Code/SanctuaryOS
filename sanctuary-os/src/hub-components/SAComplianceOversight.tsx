import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { CustomDropdown, CustomComplianceDropdown, SidePanel, PanelHeaderGroup, PanelHeaderButton, ActionButton, SidePanelHeroCard, StatBox } from '../shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { DynamicArtifactPreviewBanner } from '../chameleon-components/ThemeCard';
import { SharedMetadataEditorSidePanel } from '../side-panels/SharedMetadataEditorSidePanel';
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, HubListGrid, SidePanelTitleInput, UniversalGroup, UniversalTextArea } from '../components/layouts/ElevatedHubLayout';
import { logArchitectAction } from '../lib/audit';

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

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
      setStatus(t("identities_req_reason", "Reason is required."));
      return;
    }
    setLoading(true);
    try {
      await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'mods', p_payload: { id: mod.id, compliance_tier: 0, status: 'verified' } });
      await logArchitectAction(
        `Cleared compliance flag for artifact: ${mod.name}`,
        'mods',
        mod.name || mod.id,
        editReason,
        'Oversight Compliance',
        false,
        {
          compliance_tier: { from: mod.compliance_tier, to: 0 },
          status: { from: mod.status || 'flagged', to: 'verified' }
        }
      );
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
      setStatus(t("identities_req_reason", "Reason is required."));
      return;
    }
    setLoading(true);
    try {
      await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'mods', p_payload: { id: mod.id, compliance_tier: 2, status: 'blacklisted' } });
      await logArchitectAction(
        `Set compliance flag for artifact: ${mod.name} to Tier 2`,
        'mods',
        mod.name || mod.id,
        editReason,
        'Oversight Compliance',
        false,
        {
          compliance_tier: { from: mod.compliance_tier, to: 2 },
          status: { from: mod.status || 'verified', to: 'blacklisted' }
        }
      );
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
      setStatus(t("identities_req_reason", "Reason is required when changing compliance tier."));
      return;
    }

    setIsSubmitting(true);
    setStatus(t("identities_updating", "Updating..."));

    try {
      const { error } = await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'mods', p_payload: { id: selectedMod.id, compliance_tier: editTier } });
      if (error) throw error;

      await logArchitectAction(
        `Changed compliance tier from ${selectedMod.compliance_tier} to ${editTier}`,
        'mods',
        selectedMod.name || selectedMod.id,
        editReason.trim() || "Compliance Update",
        'Oversight Compliance',
        false,
        {
          compliance_tier: { from: selectedMod.compliance_tier, to: editTier }
        }
      );

      setStatus(t("identities_updated", "Success"));
      setSelectedMod(null);
      fetchMods();
    } catch (err: any) {
      setStatus(`${t("identities_failed_prefix", "Failed:")} ${err.message}`);
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
      case 1: return { label: t("tier_1_label", "Tier 1"), color: 'text-[var(--warning)]', border: 'border-[color-mix(in_srgb,var(--warning)_40%,transparent)]' };
      case 2: return { label: t("tier_2_label", "Tier 2"), color: 'text-[var(--warning)]', border: 'border-[color-mix(in_srgb,var(--warning)_40%,transparent)]' };
      case 3: return { label: t("tier_3_label", "Tier 3"), color: 'text-[var(--danger)]', border: 'border-[color-mix(in_srgb,var(--danger)_40%,transparent)]' };
      case 4: return { label: t("tier_4_label", "Tier 4"), color: 'text-[var(--danger)]', border: 'border-[color-mix(in_srgb,var(--danger)_40%,transparent)]' };
      case 5: return { label: t("tier_5_label", "Tier 5"), color: 'text-[var(--danger)]', border: 'border-[color-mix(in_srgb,var(--danger)_40%,transparent)]' };
      default: return { label: t("tier_0_label", "Tier 0"), color: 'text-[var(--success)]', border: 'border-[color-mix(in_srgb,var(--success)_40%,transparent)]' };
    }
  };

  const pendingCount = mods.filter(m => m.compliance_tier !== 5 && ["under_review", "pending", "unverified"].includes(m.status?.toLowerCase() || "")).length;
  const activeCount = mods.filter(m => m.compliance_tier !== 5 && !["under_review", "pending", "unverified", "blacklisted", "quarantined"].includes(m.status?.toLowerCase() || "") && m.compliance_tier >= 1 && m.compliance_tier <= 4).length;
  const inactiveCount = mods.filter(m => m.compliance_tier === 5 || ["blacklisted", "quarantined"].includes(m.status?.toLowerCase() || "")).length;

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: "dashboard",
      number: (pendingCount + activeCount + inactiveCount).toString(),
    },
    { id: 'pending', label: t("pending", "Pending"), icon: 'policy', number: pendingCount.toString(), colorClass: 'text-[var(--danger)]' },
    { id: 'active', label: t("status_active", "Active"), icon: 'verified', number: activeCount.toString(), colorClass: 'text-[var(--success)]' },
    { id: 'inactive', label: t("tab_inactive", "Inactive"), icon: 'block', number: inactiveCount.toString(), colorClass: 'text-[var(--warning)]' }
  ];

  const renderModCard = (mod: any) => {
    const td = getTierDetails(mod.compliance_tier);
    const statusLower = (mod.status || "").toLowerCase();
    const isPending = ["under_review", "pending", "unverified"].includes(statusLower);
    const isInactive = mod.compliance_tier === 5 || ["blacklisted", "quarantined"].includes(statusLower);
    const statusLabel = isPending ? t("pending", "Pending") : isInactive ? t("tab_inactive", "Inactive") : t("status_active", "Active");
    const statusIcon = isPending ? t("icon_schedule", "schedule") : isInactive ? t("icon_block", "block") : t("icon_verified", "verified");
    const statusIconColor = isPending ? "text-[var(--warning)]" : isInactive ? "text-[var(--danger)]" : "text-[var(--success)]";

    return (
      <UniversalCard
        key={mod.id}
        onClick={() => handleOpenPanel(mod)}
        layout="vertical"
        icon={t("icon_policy", "policy")}
        customIcon={<DynamicArtifactPreviewBanner data={mod} icon={t("icon_policy", "policy")} heightClass="h-full" />}
        title={mod.name}
        subtitle={`${t("by_prefix", "By")} ${mod.master_author || t("unknown_mason", "Unknown {Mason}")}`}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span className={`material-symbols-outlined !text-[12px] ${td.color}`}>
                {t("icon_policy", "policy")}
              </span>
              <span>{td.label}</span>
            </div>
          </div>
        }
        badges={
          <>
            <div className={VAULT_CHIP_CLASS}>
              <span className={`material-symbols-outlined !text-[12px] ${statusIconColor}`}>
                {statusIcon}
              </span>
              <span>{statusLabel}</span>
            </div>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                {t("icon_fingerprint", "fingerprint")}
              </span>
              <span>{mod.id.substring(0, 8)}</span>
            </div>
          </>
        }
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
              {td.label}
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
              {t("btn_review", "Review")} <span className="text-base leading-none">&rarr;</span>
            </span>
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
          title={t("recent_pending", "Recent Pending")}
          icon={t("icon_policy", "policy")}
          iconColorClass="text-[var(--danger)]"
          isEmpty={pendingMods.length === 0}
          emptyIcon={t("icon_policy", "policy")}
          emptyTitle={t("comp_no_alerts", "No Alerts")}
        >
          {pendingMods.slice(0, 6).map(renderModCard)}
        </HubOverviewSection>

        <HubOverviewSection
          title={t("recent_live", "Recent Active")}
          icon={t("icon_verified", "verified")}
          iconColorClass="text-[var(--success)]"
          isEmpty={activeMods.length === 0}
          emptyIcon={t("icon_verified", "verified")}
          emptyTitle={t("comp_no_alerts", "No Alerts")}
        >
          {activeMods.slice(0, 6).map(renderModCard)}
        </HubOverviewSection>

        <HubOverviewSection
          title={t("recent_inactive", "Recent Inactive")}
          icon={t("icon_block", "block")}
          iconColorClass="text-[var(--warning)]"
          className="col-span-1 xl:col-span-2"
          isEmpty={inactiveMods.length === 0}
          emptyIcon={t("icon_block", "block")}
          emptyTitle={t("comp_no_alerts", "No Alerts")}
        >
          {inactiveMods.slice(0, 6).map(renderModCard)}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  return (
    <ElevatedHubLayout
      headerTitle={t("hub_compliance", "Compliance Oversight")}
      headerSubtitle={t("hub_compliance_subtitle", "Manage and review system compliance and {mod} safety")}
      headerIcon="gavel"
      headerIconColorClass="text-[var(--danger)]"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t("search_ph", "Search {mods}...")}
      hideSearch={filterStatus === 'overview'}
      activeTab={filterStatus === 'overview' ? 'overview' : filterStatus}
      onTabChange={(id) => setFilterStatus(id as any)}
      tabs={tabs}
      primaryPopover={filterStatus !== 'overview' ? {
        icon: "tune",
        label: t("filters", "Filters"),
        content: (
          <div className="flex flex-col w-[300px] p-4 text-left">
            <div className="flex flex-col mb-5 w-full">
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
                {t("filters", "Filter")}
              </div>
              <CustomDropdown
                flat={true}
                variant="pill"
                value={filterTier === null ? "all" : filterTier}
                onChange={(v: any[]) => setFilterTier(v[0] === "all" ? null : v[0])}
                options={[
                  { id: "all", label: t("comp_filter_all_alerts", "All Alerts") },
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
            icon: t("icon_flag", "flag") as string,
            label: t("comp_btn_manual_flag", "Manual Flag") as string,
            onClick: () => onOpenManualFlag("")
          }
        ] : undefined
      }
    >
      {loading ? (
        <div className="glass-panel p-8 rounded-2xl text-center text-sm font-bold text-[var(--subtext)] capitalize tracking-widest animate-pulse">{t("comp_scanning", "Scanning...")}</div>
      ) : filterStatus === 'overview' ? renderLanding() : (
        <HubListGrid
          isEmpty={filteredMods.length === 0}
          emptyIcon={t("icon_warning_amber", "warning_amber")}
          emptyTitle={t("comp_no_alerts", "No Alerts")}
        >
          {filteredMods.map(renderModCard)}
        </HubListGrid>
      )}

      <SidePanel
        isOpen={!!selectedMod}
        onClose={() => setSelectedMod(null)}
        title={t("comp_edit_tier", "Compliance Enforcement")}
        icon={t("icon_policy", "policy")}
        iconColorClass="text-[var(--danger)]"
        subtitle={selectedMod ? `${t("lbl_uuid", "UUID")}: ${selectedMod.id}` : t("hub_compliance_subtitle", "Manage and review system compliance and {mod} safety")}
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            {(selectedMod?.status === 'pending' || selectedMod?.status === 'under_review') ? (
              <>
                <PanelHeaderButton
                  icon="check_circle"
                  tooltip={t("btn_clear_flag", "Clear Flag")}
                  variant="success"
                  disabled={isSubmitting || !editReason.trim()}
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); handleClearFlag(e, selectedMod); setSelectedMod(null); }}
                />
                <PanelHeaderButton
                  icon="flag"
                  tooltip={t("btn_set_flag", "Set Flag")}
                  variant="error"
                  disabled={isSubmitting || !editReason.trim()}
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); handleSetFlag(e, selectedMod); setSelectedMod(null); }}
                />
              </>
            ) : (
              <PanelHeaderButton
                icon="save"
                tooltip={isSubmitting ? t("identities_updating", "Updating...") : t("ui_btn_commit", "Commit")}
                variant="accent"
                disabled={isSubmitting || !editReason.trim()}
                onClick={handleSaveTier}
              />
            )}
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_policy", "policy")}
            overline={t("hub_compliance", "Compliance Oversight")}
            title={selectedMod?.name || t("comp_edit_tier", "Compliance Enforcement")}
            description={t("hub_compliance_subtitle", "Manage and review system compliance and {mod} safety")}
            badge={getTierDetails(editTier).label}
            badgeIcon="policy"
            variant={editTier >= 3 ? "danger" : editTier >= 1 ? "warning" : "success"}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("mason", "{Mason}")}
                value={selectedMod?.master_author || t("unknown_mason", "Unknown {Mason}")}
                icon="person"
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("status", "Status")}
                value={(selectedMod?.status || t("pending", "Pending")).replace(/_/g, " ")}
                icon="verified_user"
                iconColorClass="text-[var(--warning)]"
              />
            </div>
            <div className="flex items-center justify-end pt-1">
              <ActionButton
                variant="glass"
                icon={t("icon_edit", "edit")}
                label={t("ui_edit_metadata", "Edit Metadata")}
                onClick={() => setMetadataMod(selectedMod)}
              />
            </div>
          </SidePanelHeroCard>

          {status && (
            <div className="glass-panel p-3.5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-center w-full">
              <p className={`text-[10px] font-black uppercase tracking-widest m-0 ${status.includes('Failed') || status.includes('required') ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}`}>{status}</p>
            </div>
          )}

          <SidePanelTitleInput
            value={selectedMod?.name || ""}
            readOnly
            label={t("label_modname", "{Mod} Name")}
            subtitle={`${t("lbl_uuid", "UUID")}: ${selectedMod?.id || ""}`}
          />

          <UniversalGroup title={t("comp_enforcement", "Compliance Enforcement")} icon={t("icon_policy", "policy")}>
            <div className="flex flex-col gap-1.5 relative z-50">
              <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("assign_tier", "Assign Compliance Tier")}</label>
              <CustomComplianceDropdown
                value={editTier}
                onChange={setEditTier}
                maxTier={5}
              />
            </div>

            <div className="flex flex-col gap-1.5 relative z-40">
              <UniversalTextArea
                label={`${t("tier_reason_req", "Reason")} *`}
                value={editReason}
                onChange={setEditReason}
                placeholder={t("comp_reason_placeholder", "Enter audit reason...")}
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
