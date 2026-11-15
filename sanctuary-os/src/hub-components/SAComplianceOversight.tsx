import React, { useState, useEffect } from 'react';
import { supabase, spokeOversightFrom } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { CustomDropdown, CustomComplianceDropdown, SidePanel, SidePanelPillToggle, PanelHeaderGroup, PanelHeaderButton, ActionButton, SidePanelHeroCard, StatBox, EmptyState, VAULT_CHIP_CLASS } from '../shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { UniversalInput } from '../components/universal/UniversalLayout';
import { openSanctuaryContextMenu } from '../ContextMenu';
import { DynamicArtifactPreviewBanner } from '../chameleon-components/ThemeCard';
import { SharedMetadataEditorSidePanel } from '../side-panels/SharedMetadataEditorSidePanel';
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, HubListGrid, SidePanelTitleInput, UniversalGroup, UniversalTextArea } from '../components/layouts/ElevatedHubLayout';
import { logArchitectAction } from '../lib/audit';

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

  // Family & Tracked Hashes state inside Enforcement drawer
  const [trackedHashes, setTrackedHashes] = useState<any[]>([]);
  const [familyRelations, setFamilyRelations] = useState<any[]>([]);
  const [newTrackedHash, setNewTrackedHash] = useState("");
  const [newTrackedLabel, setNewTrackedLabel] = useState("");
  const [familyLinkSearch, setFamilyLinkSearch] = useState("");
  const [familyLinkResults, setFamilyLinkResults] = useState<any[]>([]);
  const [familyRelType, setFamilyRelType] = useState<"addon" | "twin" | "flavor" | "beta">("addon");
  const [cascadeFamily, setCascadeFamily] = useState(true);
  const [isMutatingFamily, setIsMutatingFamily] = useState(false);

  const loadFamilyAndHashes = async (modId: string) => {
    if (!modId) {
      setTrackedHashes([]);
      setFamilyRelations([]);
      return;
    }
    const [{ data: verRows }, { data: relRows }] = await Promise.all([
      spokeOversightFrom('mod_versions')
        .select('id, mod_id, dna_hash, version_label, created_at')
        .eq('mod_id', modId)
        .order('created_at', { ascending: false }),
      spokeOversightFrom('mod_relationships')
        .select('id, parent_id, child_id, relationship_type')
        .or(`parent_id.eq.${modId},child_id.eq.${modId}`),
    ]);
    setTrackedHashes(Array.isArray(verRows) ? verRows : []);

    const rows = Array.isArray(relRows) ? relRows : [];
    const peerIds = Array.from(
      new Set(
        rows
          .map((r: any) => (String(r.parent_id) === String(modId) ? r.child_id : r.parent_id))
          .filter(Boolean)
          .map(String)
      )
    );
    const peerMap = new Map<string, any>();
    if (peerIds.length > 0) {
      const { data: peerMods } = await spokeOversightFrom('mods')
        .select('id, name, master_author, compliance_tier, status')
        .in('id', peerIds);
      (peerMods || []).forEach((pm: any) => {
        if (pm?.id) peerMap.set(String(pm.id), pm);
      });
    }
    setFamilyRelations(
      rows.map((r: any) => {
        const peerId = String(r.parent_id) === String(modId) ? String(r.child_id) : String(r.parent_id);
        return {
          ...r,
          peerId,
          peer: peerMap.get(peerId) || null,
        };
      })
    );
  };

  useEffect(() => {
    const q = familyLinkSearch.trim();
    if (!q || !selectedMod?.id) {
      setFamilyLinkResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const isHash = /^[0-9a-f]{64}$/i.test(q);
      if (isHash) {
        const { data: mv } = await spokeOversightFrom('mod_versions')
          .select('mod_id, mods(id, name, master_author, compliance_tier)')
          .eq('dna_hash', q.toLowerCase())
          .maybeSingle();
        const modObj = mv?.mods ? (Array.isArray(mv.mods) ? mv.mods[0] : mv.mods) : null;
        setFamilyLinkResults(modObj && modObj.id !== selectedMod.id ? [modObj] : []);
      } else {
        const { escapePostgrestFilterValue } = await import('../utils/postgrestUtils');
        const safeQ = escapePostgrestFilterValue(q);
        if (!safeQ) {
          setFamilyLinkResults([]);
          return;
        }
        const { data } = await spokeOversightFrom('mods')
          .select('id, name, master_author, compliance_tier')
          .ilike('name', `%${safeQ}%`)
          .limit(8);
        setFamilyLinkResults((data || []).filter((m: any) => m.id !== selectedMod.id));
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [familyLinkSearch, selectedMod?.id]);

  const handleAddTrackedHash = async () => {
    if (!selectedMod?.id) return;
    const cleanH = newTrackedHash.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/i.test(cleanH)) return;
    setIsMutatingFamily(true);
    try {
      const { data: existing } = await spokeOversightFrom('mod_versions')
        .select('id')
        .eq('dna_hash', cleanH)
        .maybeSingle();
      const { error } = await supabase.rpc('secure_upsert_cloud_file', {
        p_token: useStore.getState().session?.access_token || '',
        p_target: 'mod_versions',
        p_payload: {
          ...(existing?.id ? { id: existing.id } : {}),
          mod_id: selectedMod.id,
          dna_hash: cleanH,
          version_label: newTrackedLabel.trim() || 'companion',
        },
      });
      if (error) throw error;
      setNewTrackedHash("");
      setNewTrackedLabel("");
      await loadFamilyAndHashes(selectedMod.id);
    } catch (err: any) {
      setStatus(`${t("identities_failed_prefix", "Failed:")} ${err?.message || String(err)}`);
    } finally {
      setIsMutatingFamily(false);
    }
  };

  const handleRemoveTrackedHash = async (versionId: string) => {
    if (!selectedMod?.id || !versionId) return;
    setIsMutatingFamily(true);
    try {
      await supabase.rpc('secure_delete_cloud_file', {
        p_token: useStore.getState().session?.access_token || '',
        p_target: 'mod_versions',
        p_id: versionId,
      });
      await loadFamilyAndHashes(selectedMod.id);
    } catch (err: any) {
      setStatus(`${t("identities_failed_prefix", "Failed:")} ${err?.message || String(err)}`);
    } finally {
      setIsMutatingFamily(false);
    }
  };

  const handleLinkFamilyMod = async (peerMod: any) => {
    if (!selectedMod?.id || !peerMod?.id || peerMod.id === selectedMod.id) return;
    setIsMutatingFamily(true);
    try {
      await supabase
        .from('mod_relationships')
        .upsert(
          { parent_id: selectedMod.id, child_id: peerMod.id, relationship_type: familyRelType },
          { onConflict: 'parent_id,child_id' }
        );
      setFamilyLinkSearch("");
      setFamilyLinkResults([]);
      await loadFamilyAndHashes(selectedMod.id);
    } catch (err: any) {
      setStatus(`${t("identities_failed_prefix", "Failed:")} ${err?.message || String(err)}`);
    } finally {
      setIsMutatingFamily(false);
    }
  };

  const handleUnlinkFamilyRel = async (relId: string) => {
    if (!selectedMod?.id || !relId) return;
    setIsMutatingFamily(true);
    try {
      await supabase.from('mod_relationships').delete().eq('id', relId);
      await loadFamilyAndHashes(selectedMod.id);
    } catch (err: any) {
      setStatus(`${t("identities_failed_prefix", "Failed:")} ${err?.message || String(err)}`);
    } finally {
      setIsMutatingFamily(false);
    }
  };

  const cascadeFamilyComplianceUpdate = async (tierValue: number, statusValue: string, reasonValue: string) => {
    if (!cascadeFamily || familyRelations.length === 0) return;
    const token = useStore.getState().session?.access_token || '';
    for (const rel of familyRelations) {
      if (!rel?.peerId || rel.peerId === selectedMod?.id) continue;
      await supabase.rpc('secure_upsert_cloud_file', {
        p_token: token,
        p_target: 'mods',
        p_payload: {
          id: rel.peerId,
          compliance_tier: tierValue,
          status: statusValue,
          status_reason: reasonValue,
        },
      });
    }
  };

  const fetchMods = async () => {
    setLoading(true);
    const { data } = await spokeOversightFrom('mods')
      .select('id, name, master_author, compliance_tier, status, status_reason, mason_id, image_url')
      .or('compliance_tier.in.(1,2,3,4,5),status.in.(under_review,pending,blacklisted,quarantined)')
      .order('compliance_tier', { ascending: false });

    if (data) {
      setMods(
        data.filter(
          (m: any) =>
            Number(m?.compliance_tier || 0) >= 1 ||
            ["blacklisted", "quarantined"].includes(String(m?.status || "").toLowerCase())
        )
      );
    }
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
    setIsSubmitting(true);
    setLoading(true);
    try {
      const { error } = await supabase.rpc('secure_upsert_cloud_file', {
        p_token: useStore.getState().session?.access_token || '',
        p_target: 'mods',
        p_payload: {
          id: mod.id,
          compliance_tier: 0,
          status: 'verified',
          status_reason: editReason.trim(),
        },
      });
      if (error) throw error;
      await cascadeFamilyComplianceUpdate(0, 'verified', editReason.trim());
      await logArchitectAction(
        `Cleared compliance flag for artifact: ${mod.name}`,
        'mods',
        mod.name || mod.id,
        editReason.trim(),
        'Oversight Compliance',
        false,
        {
          compliance_tier: { from: mod.compliance_tier, to: 0 },
          status: { from: mod.status || 'flagged', to: 'verified' }
        }
      );
      setEditReason("");
      setSelectedMod(null);
      fetchMods();
    } catch (err: any) {
      console.error(err);
      setStatus(`${t("identities_failed_prefix", "Failed:")} ${err?.message || String(err)}`);
      setLoading(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetFlag = async (e: React.MouseEvent, mod: any) => {
    e.stopPropagation();
    if (!editReason.trim()) {
      setStatus(t("identities_req_reason", "Reason is required."));
      return;
    }
    const confirmedTier = Math.max(1, Math.min(5, Number(editTier || mod.compliance_tier || 1)));
    const confirmedStatus = confirmedTier === 5 ? 'blacklisted' : 'verified';
    setIsSubmitting(true);
    setLoading(true);
    try {
      const { error } = await supabase.rpc('secure_upsert_cloud_file', {
        p_token: useStore.getState().session?.access_token || '',
        p_target: 'mods',
        p_payload: {
          id: mod.id,
          compliance_tier: confirmedTier,
          status: confirmedStatus,
          status_reason: editReason.trim(),
        },
      });
      if (error) throw error;
      await cascadeFamilyComplianceUpdate(confirmedTier, confirmedStatus, editReason.trim());
      await logArchitectAction(
        `Confirmed compliance classification for artifact: ${mod.name} (Tier ${confirmedTier})`,
        'mods',
        mod.name || mod.id,
        editReason.trim(),
        'Oversight Compliance',
        false,
        {
          compliance_tier: { from: mod.compliance_tier, to: confirmedTier },
          status: { from: mod.status || 'pending', to: confirmedStatus }
        }
      );
      setEditReason("");
      setSelectedMod(null);
      fetchMods();
    } catch (err: any) {
      console.error(err);
      setStatus(`${t("identities_failed_prefix", "Failed:")} ${err?.message || String(err)}`);
      setLoading(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    fetchMods();
    const onUpdated = () => { fetchMods(); };
    window.addEventListener('sanctuary-compliance-updated', onUpdated);
    return () => window.removeEventListener('sanctuary-compliance-updated', onUpdated);
  }, []);

  const handleOpenPanel = (mod: any) => {
    setSelectedMod(mod);
    setEditTier(Number(mod.compliance_tier || 1));
    setEditReason("");
    setStatus("");
    setNewTrackedHash("");
    setNewTrackedLabel("");
    setFamilyLinkSearch("");
    setFamilyLinkResults([]);
    loadFamilyAndHashes(mod.id);
  };

  const handleSaveTier = async (forceQuarantine = false) => {
    if (!selectedMod) return;
    if (!editReason.trim()) {
      setStatus(t("identities_req_reason", "Reason is required when changing compliance tier."));
      return;
    }

    setIsSubmitting(true);
    setStatus(t("identities_updating", "Updating..."));

    try {
      const nextStatus = forceQuarantine || editTier === 5 ? 'blacklisted' : 'verified';
      const { error } = await supabase.rpc('secure_upsert_cloud_file', {
        p_token: useStore.getState().session?.access_token || '',
        p_target: 'mods',
        p_payload: {
          id: selectedMod.id,
          compliance_tier: editTier,
          status: nextStatus,
          status_reason: editReason.trim(),
        },
      });
      if (error) throw error;
      await cascadeFamilyComplianceUpdate(editTier, nextStatus, editReason.trim());

      await logArchitectAction(
        `Changed compliance tier from ${selectedMod.compliance_tier} to ${editTier}`,
        'mods',
        selectedMod.name || selectedMod.id,
        editReason.trim() || "Compliance Update",
        'Oversight Compliance',
        false,
        {
          compliance_tier: { from: selectedMod.compliance_tier, to: editTier },
          status: { from: selectedMod.status, to: nextStatus },
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
    const matchesSearch = m.name?.toLowerCase().includes(search.toLowerCase());
    const matchesTier = filterTier ? m.compliance_tier === filterTier : true;

    let matchesStatus = true;
    const statusLower = m.status?.toLowerCase() || "";
    const isPending = m.compliance_tier !== 5 && ["under_review", "pending", "unverified"].includes(statusLower);
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
      icon: t("icon_dashboard", "dashboard"),
      number: (pendingCount + activeCount + inactiveCount).toString(),
    },
    { id: 'pending', label: t("pending", "Pending"), icon: t("icon_policy", "policy"), number: pendingCount.toString(), colorClass: 'text-[var(--danger)]' },
    { id: 'active', label: t("status_active", "Active"), icon: t("icon_verified", "verified"), number: activeCount.toString(), colorClass: 'text-[var(--success)]' },
    { id: 'inactive', label: t("tab_inactive", "Inactive"), icon: t("icon_block", "block"), number: inactiveCount.toString(), colorClass: 'text-[var(--warning)]' }
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
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("btn_review", "Review"),
              icon: t("icon_policy", "policy"),
              onClick: () => handleOpenPanel(mod),
            },
            {
              label: t("edit_metadata", "Edit Metadata"),
              icon: t("icon_edit", "edit"),
              onClick: () => setMetadataMod(mod),
            },
            {
              divider: true,
              label: t("copy_title", "Copy Title"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: () => navigator.clipboard?.writeText(mod.name || ""),
            },
          ]);
        }}
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
          headerAction={
            <PanelHeaderButton
              icon={t("icon_arrow_forward", "arrow_forward")}
              tooltip={t("pending", "Pending")}
              onClick={() => setFilterStatus("pending")}
            />
          }
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
          headerAction={
            <PanelHeaderButton
              icon={t("icon_arrow_forward", "arrow_forward")}
              tooltip={t("status_active", "Active")}
              onClick={() => setFilterStatus("active")}
            />
          }
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
          headerAction={
            <PanelHeaderButton
              icon={t("icon_arrow_forward", "arrow_forward")}
              tooltip={t("tab_inactive", "Inactive")}
              onClick={() => setFilterStatus("inactive")}
            />
          }
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
      headerIcon={t("icon_gavel", "gavel")}
      headerIconColorClass="text-[var(--danger)]"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t("search_ph", "Search {mods}...")}
      hideSearch={filterStatus === 'overview'}
      activeTab={filterStatus === 'overview' ? 'overview' : filterStatus}
      onTabChange={(id) => setFilterStatus(id as any)}
      tabs={tabs}
      primaryPopover={filterStatus !== 'overview' ? {
        icon: t("icon_tune", "tune"),
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
      actions={[
        {
          id: "manual_flag",
          icon: t("icon_flag", "flag") as string,
          label: t("comp_btn_manual_flag", "Manual Flag") as string,
          onClick: () => onOpenManualFlag("")
        }
      ]}
    >
      {loading ? (
        <EmptyState
          icon={t("icon_sync", "sync")}
          title={t("comp_scanning", "Scanning...")}
        />
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
            {["pending", "under_review", "unverified"].includes(String(selectedMod?.status || "").toLowerCase()) ? (
              <>
                <PanelHeaderButton
                  icon={t("icon_check_circle", "check_circle")}
                  tooltip={t("btn_clear_flag", "Clear Flag (Tier 0)")}
                  variant="success"
                  disabled={isSubmitting || !editReason.trim()}
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); handleClearFlag(e, selectedMod); }}
                />
                <PanelHeaderButton
                  icon={t("icon_verified", "verified")}
                  tooltip={t("btn_confirm_compliance", "Confirm Compliance Tier")}
                  variant="accent"
                  disabled={isSubmitting || !editReason.trim()}
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); handleSetFlag(e, selectedMod); }}
                />
              </>
            ) : (
              <PanelHeaderButton
                icon={t("icon_save", "save")}
                tooltip={isSubmitting ? t("identities_updating", "Updating...") : t("ui_btn_commit", "Commit")}
                variant="accent"
                disabled={isSubmitting || !editReason.trim()}
                onClick={() => handleSaveTier(false)}
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
            badgeIcon={t("icon_policy", "policy")}
            variant={editTier >= 3 ? "danger" : editTier >= 1 ? "warning" : "success"}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("mason", "{Mason}")}
                value={selectedMod?.master_author || t("unknown_mason", "Unknown {Mason}")}
                icon={t("icon_person", "person")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("status", "Status")}
                value={(selectedMod?.status || t("pending", "Pending")).replace(/_/g, " ")}
                icon={t("icon_verified_user", "verified_user")}
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

          {selectedMod?.status_reason && (
            <UniversalGroup
              title={t("report_reason", "Reported / Flagged Context")}
              icon={t("icon_report", "report")}
            >
              <p className="text-xs font-bold text-[var(--text)] leading-relaxed whitespace-pre-wrap break-words m-0">
                {selectedMod.status_reason}
              </p>
            </UniversalGroup>
          )}

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

            {selectedMod && (
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[var(--border)]/40 w-full">
                <ActionButton
                  variant="glass"
                  icon={t("icon_check_circle", "check_circle")}
                  label={t("btn_clear_flag", "Clear Flag")}
                  disabled={isSubmitting || !editReason.trim()}
                  onClick={(e: React.MouseEvent) => handleClearFlag(e, selectedMod)}
                />
                <div className="flex flex-wrap items-center gap-2.5">
                  <ActionButton
                    variant="danger"
                    icon={t("icon_block", "block")}
                    label={t("quarantine", "Quarantine")}
                    disabled={isSubmitting || !editReason.trim()}
                    onClick={() => handleSaveTier(true)}
                  />
                  <ActionButton
                    variant="primary"
                    icon={t("icon_verified", "verified")}
                    label={
                      ["pending", "under_review", "unverified"].includes(
                        String(selectedMod?.status || "").toLowerCase()
                      )
                        ? t("btn_confirm_compliance", "Confirm Compliance Tier")
                        : t("save", "Save")
                    }
                    disabled={isSubmitting || !editReason.trim()}
                    onClick={(e: React.MouseEvent) =>
                      ["pending", "under_review", "unverified"].includes(
                        String(selectedMod?.status || "").toLowerCase()
                      )
                        ? handleSetFlag(e, selectedMod)
                        : handleSaveTier(false)
                    }
                  />
                </div>
              </div>
            )}
          </UniversalGroup>

          {selectedMod && (
            <UniversalGroup title={t("comp_family_hashes_title", "Family & Tracked Hashes")} icon={t("icon_account_tree", "account_tree")}>
              <div className="flex flex-col gap-3 w-full">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">
                    {t("comp_tracked_hashes_count", "Tracked DNA Hashes")} ({trackedHashes.length})
                  </span>
                  <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">
                    {t("comp_linked_family_count", "Linked Family")} ({familyRelations.length})
                  </span>
                </div>

                {trackedHashes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {trackedHashes.map((ver: any) => (
                      <span
                        key={ver.id || ver.dna_hash}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[10px] font-mono text-[var(--text)]"
                      >
                        <span className="text-[var(--accent)] font-bold">{ver.version_label || "1.0"}</span>
                        <span>{String(ver.dna_hash || "").slice(0, 14)}...</span>
                        {ver.id && (
                          <button
                            type="button"
                            disabled={isMutatingFamily}
                            onClick={() => handleRemoveTrackedHash(ver.id)}
                            className="text-[var(--danger)] hover:opacity-80 cursor-pointer flex items-center disabled:opacity-40"
                          >
                            <span className="material-symbols-outlined !text-[13px]">{t("icon_close", "close")}</span>
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-6">
                    <UniversalInput
                      label={t("comp_companion_hash_label", "Companion SHA-256 Hash")}
                      value={newTrackedHash}
                      onChange={setNewTrackedHash}
                      placeholder={t("comp_companion_hash_ph", "64-character SHA-256 hash...")}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <UniversalInput
                      label={t("version", "Version")}
                      value={newTrackedLabel}
                      onChange={setNewTrackedLabel}
                      placeholder={t("comp_companion_ver_ph", "1.0 / addon")}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <ActionButton
                      variant="glass"
                      icon={t("icon_add", "add")}
                      label={t("add", "Add")}
                      className="!w-full !justify-center !h-12"
                      disabled={isMutatingFamily || !/^[0-9a-f]{64}$/i.test(newTrackedHash.trim())}
                      onClick={handleAddTrackedHash}
                    />
                  </div>
                </div>

                {familyRelations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[var(--border)]/30">
                    {familyRelations.map((rel: any) => (
                      <span
                        key={rel.id || rel.peerId}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[10px] font-bold text-[var(--text)]"
                      >
                        <span className="text-[var(--accent)] uppercase">{rel.relationship_type || "addon"}</span>
                        <span className="truncate max-w-[160px]">{rel.peer?.name || rel.peerId}</span>
                        {rel.peer?.compliance_tier !== undefined && (
                          <span className="text-[9px] font-black opacity-75">
                            ({t("stat_tier", "Tier")} {rel.peer.compliance_tier})
                          </span>
                        )}
                        {rel.id && (
                          <button
                            type="button"
                            disabled={isMutatingFamily}
                            onClick={() => handleUnlinkFamilyRel(rel.id)}
                            className="text-[var(--danger)] hover:opacity-80 cursor-pointer flex items-center disabled:opacity-40"
                          >
                            <span className="material-symbols-outlined !text-[13px]">{t("icon_close", "close")}</span>
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end pt-1">
                  <div className="sm:col-span-4 relative z-40">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 block mb-1.5">
                      {t("comp_family_rel_type", "Relationship")}
                    </label>
                    <CustomDropdown
                      value={familyRelType}
                      options={[
                        { id: "addon", label: t("rel_addon", "Addon") },
                        { id: "twin", label: t("rel_twin", "Twin") },
                        { id: "flavor", label: t("rel_flavor", "Flavor") },
                        { id: "beta", label: t("rel_beta", "Beta") },
                      ]}
                      onChange={(v: any) => {
                        const val = Array.isArray(v) ? v[0] : v;
                        if (val) setFamilyRelType(val as any);
                      }}
                      disableTint={true}
                    />
                  </div>
                  <div className="sm:col-span-8 relative">
                    <UniversalInput
                      label={t("comp_family_search_label", "Link Family {Mod} (Name or SHA-256)")}
                      value={familyLinkSearch}
                      onChange={setFamilyLinkSearch}
                      placeholder={t("search_ph", "Search {mods}...")}
                    />
                    {familyLinkResults.length > 0 && (
                      <div className="mt-1 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_15%,transparent)] max-h-40 overflow-y-auto custom-scrollbar flex flex-col p-1 gap-0.5">
                        {familyLinkResults.map((fm: any) => (
                          <button
                            key={fm.id}
                            type="button"
                            disabled={isMutatingFamily}
                            onClick={() => handleLinkFamilyMod(fm)}
                            className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] flex items-center justify-between gap-2 text-xs text-[var(--text)] cursor-pointer"
                          >
                            <span className="font-bold truncate">{fm.name}</span>
                            <span className="text-[10px] font-black text-[var(--accent)] shrink-0">
                              + {familyRelType.toUpperCase()}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {familyRelations.length > 0 && (
                  <SidePanelPillToggle
                    label={t("comp_cascade_family_tier", "Cascade Tier & Active Enforcement to Linked Family")}
                    icon={t("icon_hub", "hub")}
                    checked={cascadeFamily}
                    onChange={setCascadeFamily}
                  />
                )}
              </div>
            </UniversalGroup>
          )}
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
