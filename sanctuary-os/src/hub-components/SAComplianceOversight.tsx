import { SearchBar, ScreenUtilityBar, FilterTabs, FilterTabButton } from "../shared";
import React, { useState, useEffect } from 'react';
import { supabase, getActiveGameClient } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { CustomDropdown, CustomComplianceDropdown, EmptyState, standardSuccessButtonClass, standardDangerButtonClass, SidePanel, ActionButton, PanelHeaderGroup, PanelHeaderButton } from '../shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { SharedMetadataEditorSidePanel } from '../side-panels/SharedMetadataEditorSidePanel';

export default function SAComplianceOversight({ initialFilter, setInitialFilter, onOpenManualFlag }: any) {
  const { t } = useLexicon();
  const [mods, setMods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [masonsList, setMasonsList] = useState<any[]>([]);
  const [metadataMod, setMetadataMod] = useState<any>(null);
  const [filterTier, setFilterTier] = useState<number | null>(() => {
    if (initialFilter === "nsfw") return null; // Show all compliance tiers by default when clicking the Adult/Sensitive tile
    if (initialFilter === "explicit") return null;
    return null;
  });
  const [filterStatus, setFilterStatus] = useState<string>(() => {
    if (initialFilter === "quarantined") return "verified";
    if (initialFilter === "all") return "all";
    return "pending";
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
      .or('compliance_tier.in.(1,2,3,4),status.in.(under_review,pending)')
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
    const isPending = ["under_review", "pending", "unverified"].includes(m.status?.toLowerCase() || "");
    
    if (filterStatus === "pending") {
      matchesStatus = isPending;
    } else if (filterStatus === "live") {
      matchesStatus = !isPending && m.compliance_tier >= 1 && m.compliance_tier <= 4;
    }

    return matchesSearch && matchesTier && matchesStatus;
  });

  const getTierDetails = (tier: number) => {
    switch (tier) {
      case 1: return { label: t("tier_1_label") || "Tier 1", color: 'text-amber-400', bg: 'bg-amber-400/10' };
      case 2: return { label: t("tier_2_label") || "Tier 2", color: 'text-orange-500', bg: 'bg-orange-500/10' };
      case 3: return { label: t("tier_3_label") || "Tier 3", color: 'text-red-400', bg: 'bg-red-400/10' };
      case 4: return { label: t("tier_4_label") || "Tier 4", color: 'text-red-500', bg: 'bg-red-500/10' };
      case 5: return { label: t("tier_5_label") || "Tier 5", color: 'text-rose-600', bg: 'bg-rose-600/10' };
      default: return { label: t("tier_0_label") || "Tier 0", color: 'theme-text-success', bg: 'theme-bg-success' };
    }
  };

  return (
    <div className="flex flex-col w-full relative h-full">
      <ScreenUtilityBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("search_ph")}
        className="!mb-0 !border-0 !pb-0" // matching inner layout pattern
      >
        <div className="w-max min-w-[192px] max-w-xs z-40 h-12">
          <CustomDropdown disableTint={true}
            value={filterTier === null ? "all" : filterTier}
            onChange={(v: any[]) => setFilterTier(v[0] === "all" ? null : v[0])}
            options={[
              { id: "all", label: t("comp_filter_all_alerts") },
              { id: 1, label: getTierDetails(1).label },
              { id: 2, label: getTierDetails(2).label },
              { id: 3, label: getTierDetails(3).label },
              { id: 4, label: getTierDetails(4).label }
            ]}
            placeholder={t("comp_filter_tier")}
          />
        </div>

        <FilterTabs className="h-12 z-40">
          <FilterTabButton
            id="pending"
            label={t("pending")}
            activeTab={filterStatus}
            setTab={setFilterStatus}
          />
          <FilterTabButton
            id="live"
            label={t("status_dd_live")}
            activeTab={filterStatus}
            setTab={setFilterStatus}
          />
        </FilterTabs>

        <ActionButton
          onClick={() => onOpenManualFlag("")}
          className="shrink-0 h-12 px-6 font-black capitalize tracking-widest text-[10px] !w-auto"
          icon={t("icon_flag")}
          label={t("comp_btn_manual_flag")}
        />
      </ScreenUtilityBar>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
          {loading ? (
            <div className="glass-panel p-8 rounded-2xl text-center text-sm font-bold text-[var(--subtext)] capitalize tracking-widest animate-pulse">{t("comp_scanning")}</div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
              {filteredMods.map(mod => {
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
                      <span key="tier" className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner shrink-0 transition-colors bg-[color-mix(in_srgb,var(--text)_5%,transparent)] ${td.color}`}>
                        {td.label}
                      </span>
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
              })}
              {filteredMods.length === 0 && (
                <EmptyState icon={t("icon_warning_amber")} title={t("comp_no_alerts")} className="col-span-full py-16" />
              )}
            </div>
          )}
        </div>
      </div>

      <SidePanel
        isOpen={!!selectedMod}
        onClose={() => setSelectedMod(null)}
        title={t("comp_edit_tier")}
        icon={t("icon_policy")}
        subtitle={selectedMod ? `UUID: ${selectedMod.id}` : undefined}
        widthClass="w-[800px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="close"
              tooltip={t("nav_cancel")}
              onClick={() => setSelectedMod(null)}
            />
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
        <div className="p-6 flex flex-col h-full gap-8">
          {status && (
            <div className="text-center bg-black/20 p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full">
              <p className={`text-[10px] font-black capitalize tracking-widest ${status.includes('Failed') || status.includes('required') ? 'text-red-400' : 'theme-text-accent'}`}>{status}</p>
            </div>
          )}

          <div className="flex flex-col gap-3 shrink-0">
            <h2 className="text-3xl font-black text-[var(--text)] leading-tight capitalize tracking-widest truncate">
              {selectedMod?.name}
            </h2>
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

          <div className="flex flex-col gap-6 relative">
            <h4 className="text-[10px] font-black text-[var(--text)] opacity-80 capitalize tracking-widest flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 mb-2">
              <span className="material-symbols-outlined !text-[14px]">{t("icon_policy")}</span>
              {t("comp_enforcement")}
            </h4>

            <div className="flex flex-col gap-2 relative z-50">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("assign_tier")}</label>
              <CustomComplianceDropdown
                value={editTier}
                onChange={setEditTier}
                maxTier={5}
              />
            </div>

            <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 relative z-40 mt-2">
              <label className="text-[9px] font-black text-red-400 capitalize tracking-widest ml-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-md"></span>
                {t("tier_reason_req")}
              </label>
              <textarea
                value={editReason}
                onChange={e => setEditReason(e.target.value)}
                placeholder={t("comp_reason_placeholder")}
                className="glass-surface rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold h-32 resize-none focus:outline-none border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] focus:border-[color-mix(in_srgb,var(--danger)_60%,transparent)] shadow-[inset_0_0_20px_rgba(255,0,0,0.1)]"
              />
            </div>
          </div>
        </div>
      </SidePanel>

      <SharedMetadataEditorSidePanel
        isOpen={!!metadataMod}
        onClose={() => setMetadataMod(null)}
        activeMod={metadataMod}
        masonsList={masonsList}
        onModUpdated={fetchMods}
      />
    </div>
  );
}



