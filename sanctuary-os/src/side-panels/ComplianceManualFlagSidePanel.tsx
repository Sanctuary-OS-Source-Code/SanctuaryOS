import React, { useState, useEffect } from "react";
import { supabase, supabaseAuth, spokeOversightFrom } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { SidePanel, ActionButton, CustomDropdown, CustomComplianceDropdown, PanelHeaderGroup, PanelHeaderButton, DashboardStatTile, SidePanelFilterBar, SidePanelHeroCard, SidePanelPillToggle, VAULT_CHIP_CLASS } from "../shared";
import { UniversalGroup, UniversalInput, UniversalTextArea } from '../components/universal/UniversalLayout';
import { useStore } from '../store';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from '../utils/envUtils';
import { logArchitectAction } from '../lib/audit';

export default function ComplianceManualFlagSidePanel({ isOpen, onClose, initialQuery = "", initialHeuristicEdit = null, sourceHub = "Oversight", isMalwareOnly = false, onSuccess }: any) {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState<"registry" | "heuristic">("registry");
  
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [manualSearchResults, setManualSearchResults] = useState<any[]>([]);
  const [manualSelectedMod, setManualSelectedMod] = useState<any>(null);
  const [manualTier, setManualTier] = useState<number>(isMalwareOnly ? 6 : 1);
  const [registryReason, setRegistryReason] = useState("");
  const [customModName, setCustomModName] = useState("");
  const [customAuthor, setCustomAuthor] = useState("");
  const [extraHashes, setExtraHashes] = useState<Array<{ dna_hash: string; version_label: string }>>([]);
  const [newHashInput, setNewHashInput] = useState("");
  const [newHashLabel, setNewHashLabel] = useState("");
  const [familySearchQuery, setFamilySearchQuery] = useState("");
  const [familySearchResults, setFamilySearchResults] = useState<any[]>([]);
  const [linkedFamilyMods, setLinkedFamilyMods] = useState<Array<{ id: string; name: string; relType: "twin" | "addon" | "flavor" | "beta" }>>([]);
  const [selectedFamilyRelType, setSelectedFamilyRelType] = useState<"twin" | "addon" | "flavor" | "beta">("addon");
  const [cascadeFamilyTier, setCascadeFamilyTier] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [, setSignatures] = useState<any[]>([]);
  const [newSig, setNewSig] = useState("");
  const [matchType, setMatchType] = useState("archive_entry_exact");
  const [severity, setSeverity] = useState("malware");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadSignatures = async () => {
    try {
      const [{ data: coreData }, { data: spokeData }] = await Promise.all([
        supabaseAuth.from('keeper_heuristic_signatures').select('*'),
        supabase.from('heuristic_signatures').select('*')
      ]);

      const mergedMap = new Map<string, any>();
      if (coreData) {
        coreData.forEach(s => mergedMap.set(`core_${s.id}`, { ...s, tier_scope: 'core_os' }));
      }
      if (spokeData) {
        spokeData.forEach(s => mergedMap.set(`spoke_${s.id}`, { ...s, tier_scope: 'spoke' }));
      }
      const merged = Array.from(mergedMap.values());
      setSignatures(merged);

      if (isDesktop() && merged.length > 0) {
        const config = await invoke<any>('get_saved_coordinates');
        const vaultPath = config.vault_path;
        if (vaultPath) {
          await invoke('save_heuristic_signatures', { vaultPath, signatures: merged });
        }
      }
    } catch (e: any) {
      console.error("Failed to load signatures:", e);
    }
  };

  const startEditHeuristic = (sigObj: any) => {
    setNewSig(sigObj.signature);
    setMatchType(sigObj.match_type);
    setSeverity(sigObj.severity);
    setNotes(sigObj.notes || "");
    setEnabled(sigObj.enabled);
    setEditingId(sigObj.id);
    setConfirmDelete(false);
  };

  useEffect(() => {
    if (isOpen) {
      setManualSearchQuery(initialQuery);
      setManualSelectedMod(null);
      setManualTier(isMalwareOnly ? 6 : 1);
      setCustomModName("");
      setCustomAuthor("");
      setExtraHashes([]);
      setNewHashInput("");
      setNewHashLabel("");
      setFamilySearchQuery("");
      setFamilySearchResults([]);
      setLinkedFamilyMods([]);
      setSelectedFamilyRelType("addon");
      setCascadeFamilyTier(true);
      setConfirmDelete(false);
      loadSignatures();
      
      if (initialHeuristicEdit?.__newHeuristic) {
        setActiveTab("heuristic");
        setEditingId(null);
        setNewSig("");
        setMatchType("archive_entry_exact");
        setSeverity("malware");
        setNotes("");
        setEnabled(true);
        setConfirmDelete(false);
      } else if (initialHeuristicEdit) {
        setActiveTab("heuristic");
        startEditHeuristic(initialHeuristicEdit);
      } else if (!initialQuery) {
        setActiveTab("registry");
        setEditingId(null);
      }
    }
  }, [isOpen, initialQuery, initialHeuristicEdit, isMalwareOnly]);

  useEffect(() => {
    if (!manualSearchQuery.trim() || manualSelectedMod || !isOpen || activeTab !== 'registry') {
      setManualSearchResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      const q = manualSearchQuery.trim();
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);
      const isHash = /^[0-9a-f]{64}$/i.test(q);

      if (isHash) {
        const { data: verData } = await spokeOversightFrom('mod_versions')
          .select('*, mods(id, name, master_author, compliance_tier, status)')
          .eq('dna_hash', q.toLowerCase())
          .maybeSingle();
        
        if (verData && verData.mods) {
          const modObj = Array.isArray(verData.mods) ? verData.mods[0] : verData.mods;
          setManualSearchResults(modObj ? [modObj] : []);
        } else {
          setManualSearchResults([]);
        }
      } else {
        const { escapePostgrestFilterValue } = await import('../utils/postgrestUtils');
        const safeQ = escapePostgrestFilterValue(q);
        if (!safeQ) {
          setManualSearchResults([]);
          return;
        }
        const orCondition = isValidUUID 
          ? `name.ilike.%${safeQ}%,id.eq.${safeQ}`
          : `name.ilike.%${safeQ}%`;

        const { data } = await spokeOversightFrom('mods')
          .select('id, name, master_author, compliance_tier, status')
          .or(orCondition)
          .limit(10);
        if (data) setManualSearchResults(data);
      }
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [manualSearchQuery, manualSelectedMod, isOpen, activeTab]);

  useEffect(() => {
    const q = familySearchQuery.trim();
    if (!q || !isOpen || activeTab !== 'registry') {
      setFamilySearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const isHash = /^[0-9a-f]{64}$/i.test(q);
      if (isHash) {
        const { data: verData } = await spokeOversightFrom('mod_versions')
          .select('mod_id, mods(id, name, master_author, compliance_tier)')
          .eq('dna_hash', q.toLowerCase())
          .maybeSingle();
        const modObj = verData?.mods ? (Array.isArray(verData.mods) ? verData.mods[0] : verData.mods) : null;
        setFamilySearchResults(modObj && modObj.id !== manualSelectedMod?.id ? [modObj] : []);
      } else {
        const { escapePostgrestFilterValue } = await import('../utils/postgrestUtils');
        const safeQ = escapePostgrestFilterValue(q);
        if (!safeQ) {
          setFamilySearchResults([]);
          return;
        }
        const { data } = await spokeOversightFrom('mods')
          .select('id, name, master_author, compliance_tier')
          .ilike('name', `%${safeQ}%`)
          .limit(8);
        setFamilySearchResults((data || []).filter((m: any) => m.id !== manualSelectedMod?.id));
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [familySearchQuery, isOpen, activeTab, manualSelectedMod?.id]);

  const handleManualFlag = async () => {
    if ((!manualSelectedMod && !manualSearchQuery.trim()) || !registryReason.trim()) {
      useStore.getState().pushStatus(t("comp_manual_alert_req", "Required fields missing"));
      return;
    }
    setIsSubmitting(true);
    try {
      let targetId: string | null = null;
      let targetName: string | null = null;
      const accessToken = useStore.getState().session?.access_token || '';

      // Oversight manual flags skip Pending and transition directly to Active ('verified' or 'blacklisted')
      const manualStatus = manualTier === 6 ? 'blacklisted' : 'verified';
      const cleanManualReason = registryReason.trim();
      const trimmedName = customModName.trim();
      const trimmedAuthor = customAuthor.trim();

      if (manualSelectedMod) {
        const { error } = await supabase.rpc('secure_upsert_cloud_file', {
          p_token: accessToken,
          p_target: 'mods',
          p_payload: {
            id: manualSelectedMod.id,
            ...(trimmedName ? { name: trimmedName } : {}),
            ...(trimmedAuthor ? { master_author: trimmedAuthor } : {}),
            compliance_tier: manualTier,
            status: manualStatus,
            status_reason: cleanManualReason,
          },
        });
        if (error) throw error;
        targetId = manualSelectedMod.id;
        targetName = trimmedName || manualSelectedMod.name;
      } else {
        const q = manualSearchQuery.trim();
        const isHash = /^[0-9a-f]{64}$/i.test(q);
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);

        if (isUUID) {
          const { data: existingMod } = await spokeOversightFrom('mods')
            .select('id, name')
            .eq('id', q)
            .maybeSingle();
          const { error } = await supabase.rpc('secure_upsert_cloud_file', {
            p_token: accessToken,
            p_target: 'mods',
            p_payload: {
              id: q,
              name: trimmedName || existingMod?.name || t("manual_flag_unindexed_label", "Flagged Unindexed Artifact"),
              ...(trimmedAuthor ? { master_author: trimmedAuthor } : {}),
              compliance_tier: manualTier,
              status: manualStatus,
              status_reason: cleanManualReason,
            },
          });
          if (error) throw error;
          targetId = q;
          targetName = trimmedName || existingMod?.name || q;
        } else if (isHash) {
          const normalizedHash = q.toLowerCase();
          const { data: existingVer } = await spokeOversightFrom('mod_versions')
            .select('id, mod_id, mods(id, name)')
            .eq('dna_hash', normalizedHash)
            .maybeSingle();
          const existingModRef = existingVer?.mods
            ? (Array.isArray(existingVer.mods) ? existingVer.mods[0] : existingVer.mods)
            : null;
          const resolvedId = existingVer?.mod_id || existingModRef?.id || crypto.randomUUID();
          const resolvedName = trimmedName || existingModRef?.name || `Manual Flag (${normalizedHash.slice(0, 10)})`;

          const { error: modErr } = await supabase.rpc('secure_upsert_cloud_file', {
            p_token: accessToken,
            p_target: 'mods',
            p_payload: {
              id: resolvedId,
              name: resolvedName,
              ...(trimmedAuthor ? { master_author: trimmedAuthor } : {}),
              compliance_tier: manualTier,
              status: manualStatus,
              status_reason: cleanManualReason,
            },
          });
          if (modErr) throw modErr;
          if (!existingVer?.id) {
            const { error: verErr } = await supabase.rpc('secure_upsert_cloud_file', {
              p_token: accessToken,
              p_target: 'mod_versions',
              p_payload: { mod_id: resolvedId, dna_hash: normalizedHash, version_label: '1.0' },
            });
            if (verErr) throw verErr;
          }
          targetId = resolvedId;
          targetName = resolvedName;
        } else {
          const newId = crypto.randomUUID();
          const resolvedName = trimmedName || q;
          const { error: modErr } = await supabase.rpc('secure_upsert_cloud_file', {
            p_token: accessToken,
            p_target: 'mods',
            p_payload: {
              id: newId,
              name: resolvedName,
              ...(trimmedAuthor ? { master_author: trimmedAuthor } : {}),
              compliance_tier: manualTier,
              status: manualStatus,
              status_reason: cleanManualReason,
            },
          });
          if (modErr) throw modErr;
          targetId = newId;
          targetName = resolvedName;
        }
      }

      if (targetId && extraHashes.length > 0) {
        for (const eh of extraHashes) {
          const cleanH = eh.dna_hash.trim().toLowerCase();
          if (!/^[0-9a-f]{64}$/i.test(cleanH)) continue;
          const { data: existingVer } = await spokeOversightFrom('mod_versions')
            .select('id')
            .eq('dna_hash', cleanH)
            .maybeSingle();
          await supabase.rpc('secure_upsert_cloud_file', {
            p_token: accessToken,
            p_target: 'mod_versions',
            p_payload: {
              ...(existingVer?.id ? { id: existingVer.id } : {}),
              mod_id: targetId,
              dna_hash: cleanH,
              version_label: eh.version_label.trim() || 'companion',
            },
          });
        }
      }

      if (targetId && linkedFamilyMods.length > 0) {
        for (const fam of linkedFamilyMods) {
          if (!fam.id || fam.id === targetId) continue;
          await supabase
            .from('mod_relationships')
            .upsert(
              { parent_id: targetId, child_id: fam.id, relationship_type: fam.relType },
              { onConflict: 'parent_id,child_id' }
            );
          if (cascadeFamilyTier) {
            await supabase.rpc('secure_upsert_cloud_file', {
              p_token: accessToken,
              p_target: 'mods',
              p_payload: {
                id: fam.id,
                compliance_tier: manualTier,
                status: manualStatus,
                status_reason: cleanManualReason,
              },
            });
          }
        }
      }
      
      await logArchitectAction(
        `Manually flagged with tier ${manualTier} (${manualStatus})`,
        'mods',
        targetName || targetId || manualSearchQuery.trim(),
        registryReason.trim(),
        sourceHub || 'Oversight',
        false,
        {
          compliance_tier: {
            from: manualSelectedMod?.compliance_tier ?? 0,
            to: manualTier,
          },
          status: { to: manualStatus },
          target: { to: targetName || targetId },
          linked_hashes_added: { to: extraHashes.length },
          linked_family_count: { to: linkedFamilyMods.length },
        }
      );

      useStore.getState().pushStatus(t("comp_manual_alert_success", "{Mod} flagged manually successfully."), "success");
      window.dispatchEvent(new CustomEvent('sanctuary-compliance-updated'));
      onClose();
      if (onSuccess) onSuccess();
      if (manualTier === 6) {
         window.dispatchEvent(new CustomEvent('force-radar-sweep'));
      }
    } catch (err: any) {
      useStore.getState().pushStatus(t("comp_manual_alert_fail", "Failed:") + " " + err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddHeuristic = async () => {
    if (!newSig.trim() || !notes.trim()) return;
    setIsSubmitting(true);
    
    const id = editingId || newSig.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    try {
      const newObj = {
        id,
        signature: newSig.trim(),
        match_type: matchType,
        severity,
        source: "oversight_manual",
        enabled,
        created_by: sourceHub,
        created_at: new Date().toISOString(),
        notes
      };

      const { error } = await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'heuristic_signatures', p_payload: newObj });
      if (error && error.code !== '23505') throw error;
      
      await logArchitectAction(
        editingId ? `Updated heuristic signature: ${id}` : `Added heuristic signature: ${id}`,
        'heuristic_signatures',
        id,
        notes.trim() || 'Manual addition/edit via Oversight',
        sourceHub || 'Oversight',
        false,
        {
          signature: { to: newSig.trim() },
          match_type: { to: matchType },
          severity: { to: severity },
          enabled: { to: enabled },
        }
      );

      await loadSignatures();
      
      resetHeuristicForm();
      useStore.getState().pushStatus(t("auto_heuristic_signature_saved", "Heuristic signature saved"));
      window.dispatchEvent(new CustomEvent('force-heuristics-refresh'));
      onClose();
      if (onSuccess) onSuccess();
    } catch (e: any) {
      useStore.getState().pushStatus("Error: " + e.message);
    }
    setIsSubmitting(false);
  };

  const resetHeuristicForm = () => {
    setNewSig("");
    setMatchType("archive_entry_exact");
    setSeverity("malware");
    setNotes("");
    setEnabled(true);
    setEditingId(null);
    setConfirmDelete(false);
    setRegistryReason("");
    setManualSearchQuery("");
    setManualSelectedMod(null);
  };

  const handleRemoveHeuristic = async (id: string) => {
    setIsSubmitting(true);
    try {
      await supabase.rpc('secure_delete_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'heuristic_signatures', p_id: id });
      
      await logArchitectAction(
        `Removed heuristic signature: ${id}`,
        'heuristic_signatures',
        id,
        'Manual removal via Oversight',
        sourceHub || 'Oversight',
        false,
        { id: { from: id, to: null } }
      );

      await loadSignatures();
      resetHeuristicForm();
      useStore.getState().pushStatus(t("btn_delete", "{Delete}"));
      window.dispatchEvent(new CustomEvent('force-heuristics-refresh'));
      onClose();
      if (onSuccess) onSuccess();
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("comp_manual_title", "Manual Flag")}
      subtitle={t("comp_manual_subtitle", "Oversight Intervention")}
      icon={t("icon_flag", "flag")}
      iconColorClass={isMalwareOnly ? "text-[var(--danger)]" : "text-[var(--accent)]"}
      widthClass="w-[90vw] md:w-[680px]"
      headerActions={
        <PanelHeaderGroup>
          {activeTab === 'heuristic' && editingId && (
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
                handleRemoveHeuristic(editingId);
              }}
            />
          )}
          <PanelHeaderButton
            icon={t("icon_flag", "flag")}
            tooltip={isSubmitting ? t("btn_submitting", "Submitting...") : t("comp_manual_btn_insert", "Save")}
            variant={isMalwareOnly ? "danger" : "accent"}
            disabled={isSubmitting || (activeTab === 'registry' && ((!manualSelectedMod && !manualSearchQuery.trim()) || !registryReason.trim())) || (activeTab === 'heuristic' && (!newSig.trim() || !notes.trim()))}
            onClick={activeTab === 'registry' ? handleManualFlag : handleAddHeuristic}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_flag", "flag")}
          overline={t("comp_manual_subtitle", "Oversight Intervention")}
          title={t("comp_manual_title", "Manual Flag")}
          description={isMalwareOnly ? t("malware_subtitle", "Flag malicious artifacts or inject heuristic signatures") : t("comp_manual_search_placeholder", "Search or enter artifact identifier to enforce compliance tier")}
          badge={activeTab === 'heuristic' ? t("heuristics_tab", "Heuristics") : t("auto_global_registry", "Registry")}
          variant={isMalwareOnly ? "danger" : "accent"}
        />

        {isMalwareOnly && (
          <SidePanelFilterBar className="grid-cols-2 gap-3">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_assignment", "assignment")}
              label={t("auto_global_registry", "Global Registry")}
              isActive={activeTab === 'registry'}
              onClick={() => setActiveTab('registry')}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_science", "science")}
              label={t("heuristics_tab", "Heuristics")}
              isActive={activeTab === 'heuristic'}
              onClick={() => setActiveTab('heuristic')}
            />
          </SidePanelFilterBar>
        )}

        {activeTab === 'registry' ? (
          <>
          <UniversalGroup 
            title={t("comp_manual_title", "Manual Flag")} 
            icon={t("icon_flag", "flag")} 
            headerColorClass={isMalwareOnly ? "text-[var(--danger)]" : "theme-text-accent"} 
          >
            <div className="flex flex-col gap-2 relative z-[60]">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("comp_manual_search_label", "Search {Mod} Registry")}</label>
              <div className="relative">
                <input 
                  ref={inputRef}
                  value={manualSelectedMod ? manualSelectedMod.name : manualSearchQuery} 
                  onChange={e => setManualSearchQuery(e.target.value)} 
                  readOnly={!!manualSelectedMod}
                  onFocus={() => { if (!manualSelectedMod) setIsDropdownOpen(true); }}
                  className="w-full glass-surface rounded-2xl pl-5 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--text)_32%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] placeholder:opacity-40" 
                  placeholder={t("comp_manual_search_placeholder", "Search mod name, UUID, or SHA-256 hash...")} 
                />
                {manualSelectedMod && (
                  <button onClick={() => { setManualSelectedMod(null); setManualSearchQuery(""); inputRef.current?.focus(); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--danger)] font-black text-[10px] bg-transparent border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] px-2 py-1 rounded-md">{t("clear", "Clear")}</button>
                )}
              </div>

              {isDropdownOpen && !manualSelectedMod && manualSearchResults.length > 0 && createPortal(
                <>
                  <div className="fixed inset-0 z-[200000]" onClick={() => setIsDropdownOpen(false)} />
                  <div className="fixed mt-2 glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl z-[200001] animate-in fade-in slide-in-from-top-2 flex flex-col max-h-60 overflow-hidden" style={{
                    top: inputRef.current?.getBoundingClientRect().bottom,
                    left: inputRef.current?.getBoundingClientRect().left,
                    width: inputRef.current?.getBoundingClientRect().width,
                  }}>
                    <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar flex flex-col p-1.5 gap-1">
                      {manualSearchResults.map(m => (
                        <button key={m.id} onClick={() => { setManualSelectedMod(m); setIsDropdownOpen(false); }} className="sa-dropdown-item w-full text-left px-3 py-2 flex flex-col group transition-all cursor-pointer">
                          <span className="text-[11px] font-black capitalize text-[var(--text)] group-hover:theme-text-accent truncate">{m.name}</span>
                          <span className="text-[9px] font-bold capitalize tracking-widest opacity-60">{m.master_author || t("unknown", "Local")}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>, document.getElementById("sa-portals") || document.body
              )}
            </div>

            {!manualSelectedMod && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-50 mt-4">
                <UniversalInput
                  label={t("comp_manual_custom_name", "{Mod} Name (Optional)")}
                  value={customModName}
                  onChange={setCustomModName}
                  placeholder={t("comp_manual_custom_name_ph", "Display title if hash is unindexed...")}
                />
                <UniversalInput
                  label={t("comp_manual_custom_author", "{Mason} / Author (Optional)")}
                  value={customAuthor}
                  onChange={setCustomAuthor}
                  placeholder={t("author", "Author")}
                />
              </div>
            )}

            {!isMalwareOnly && (
              <div className="flex flex-col gap-2 relative z-40 mt-4">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("Vault_stat_tier", "Compliance Tier")}</label>
                <CustomComplianceDropdown
                  value={manualTier}
                  onChange={setManualTier}
                  maxTier={sourceHub === "Architect" ? 5 : 6}
                />
              </div>
            )}

            <div className="relative z-30 mt-4">
              <UniversalTextArea 
                  label={t("reason", "Reason")}
                  value={registryReason}
                  onChange={setRegistryReason}
                  className="min-h-[80px]" 
                  placeholder={t("comp_reason_ph", "Enter enforcement reason...")}
              />
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("comp_tracked_hashes_count", "Tracked DNA Hashes")}
            icon={t("icon_fingerprint", "fingerprint")}
            count={extraHashes.length}
          >
            {extraHashes.length > 0 && (
              <div className="flex flex-col gap-1.5 w-full">
                {extraHashes.map((eh) => {
                  const hashPreview = eh.dna_hash.length > 28
                    ? `${eh.dna_hash.slice(0, 16)}...${eh.dna_hash.slice(-8)}`
                    : eh.dna_hash;
                  return (
                    <div
                      key={eh.dna_hash}
                      className="glass-surface rounded-xl px-3 py-2 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-2.5 min-w-0"
                    >
                      <span className="text-[11px] font-mono text-[var(--text)] truncate min-w-0">
                        {hashPreview}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="text-[var(--accent)]">{eh.version_label}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setExtraHashes(extraHashes.filter((h) => h.dna_hash !== eh.dna_hash))}
                          aria-label={t("remove", "Remove")}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <UniversalInput
              label={t("comp_companion_hash_label", "Companion SHA-256 Hash")}
              value={newHashInput}
              onChange={setNewHashInput}
              placeholder={t("comp_companion_hash_ph", "64-character SHA-256 hash...")}
              className="font-mono"
            />

            <div className="flex items-end gap-2.5 w-full">
              <UniversalInput
                wrapperClassName="flex-1 min-w-0"
                label={t("version", "Version")}
                value={newHashLabel}
                onChange={setNewHashLabel}
                placeholder={t("comp_companion_ver_ph", "1.0 / addon")}
              />
              <ActionButton
                variant="glass"
                icon={t("icon_add", "add")}
                label={t("add", "Add")}
                className="!h-11 !px-4 shrink-0"
                disabled={!/^[0-9a-f]{64}$/i.test(newHashInput.trim())}
                onClick={() => {
                  const cleanH = newHashInput.trim().toLowerCase();
                  if (!/^[0-9a-f]{64}$/i.test(cleanH)) return;
                  if (!extraHashes.some((h) => h.dna_hash === cleanH)) {
                    setExtraHashes([...extraHashes, { dna_hash: cleanH, version_label: newHashLabel.trim() || "companion" }]);
                  }
                  setNewHashInput("");
                  setNewHashLabel("");
                }}
              />
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("comp_linked_family_count", "Linked Family")}
            icon={t("icon_account_tree", "account_tree")}
            count={linkedFamilyMods.length}
          >
            {linkedFamilyMods.length > 0 && (
              <div className="flex flex-col gap-1.5 w-full">
                {linkedFamilyMods.map((fm) => (
                  <div
                    key={fm.id}
                    className="glass-surface rounded-xl px-3 py-2 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-2.5 min-w-0"
                  >
                    <span className="text-xs font-bold text-[var(--text)] truncate min-w-0">
                      {fm.name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="text-[var(--accent)]">{fm.relType}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setLinkedFamilyMods(linkedFamilyMods.filter((x) => x.id !== fm.id))}
                        aria-label={t("remove", "Remove")}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-start">
              <div className="sm:col-span-4 flex flex-col gap-1.5 relative z-40">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1 leading-tight">
                  {t("comp_family_rel_type", "Relationship")}
                </label>
                <CustomDropdown
                  value={selectedFamilyRelType}
                  options={[
                    { id: "addon", label: t("rel_addon", "Addon") },
                    { id: "twin", label: t("rel_twin", "Twin") },
                    { id: "flavor", label: t("rel_flavor", "Flavor") },
                    { id: "beta", label: t("rel_beta", "Beta") },
                  ]}
                  onChange={(v: any) => {
                    const val = Array.isArray(v) ? v[0] : v;
                    if (val) setSelectedFamilyRelType(val as any);
                  }}
                  disableTint={true}
                />
              </div>
              <div className="sm:col-span-8 relative">
                <UniversalInput
                  label={t("comp_family_search_label", "Link Family {Mod} (Name or SHA-256)")}
                  value={familySearchQuery}
                  onChange={setFamilySearchQuery}
                  placeholder={t("search_ph", "Search {mods}...")}
                />
                {familySearchResults.length > 0 && (
                  <div className="mt-1 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_15%,transparent)] max-h-40 overflow-y-auto custom-scrollbar flex flex-col p-1 gap-0.5">
                    {familySearchResults.map((fm) => (
                      <button
                        key={fm.id}
                        type="button"
                        onClick={() => {
                          if (!linkedFamilyMods.some((x) => x.id === fm.id)) {
                            setLinkedFamilyMods([
                              ...linkedFamilyMods,
                              { id: fm.id, name: fm.name || fm.id, relType: selectedFamilyRelType },
                            ]);
                          }
                          setFamilySearchQuery("");
                          setFamilySearchResults([]);
                        }}
                        className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] flex items-center justify-between gap-2 text-xs text-[var(--text)] cursor-pointer"
                      >
                        <span className="font-bold truncate">{fm.name}</span>
                        <span className="text-[10px] font-black text-[var(--accent)] shrink-0">
                          + {selectedFamilyRelType.toUpperCase()}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {linkedFamilyMods.length > 0 && (
              <SidePanelPillToggle
                label={t("comp_cascade_family_tier", "Cascade Tier & Active Enforcement to Linked Family")}
                icon={t("icon_hub", "hub")}
                checked={cascadeFamilyTier}
                onChange={setCascadeFamilyTier}
              />
            )}
          </UniversalGroup>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1 w-full">
            <ActionButton
              variant="glass"
              label={t("cancel", "Cancel")}
              onClick={onClose}
              disabled={isSubmitting}
            />
            <ActionButton
              variant={isMalwareOnly || manualTier === 6 ? "danger" : "primary"}
              icon={t("icon_flag", "flag")}
              label={isSubmitting ? t("btn_submitting", "Submitting...") : t("comp_manual_btn_activate", "Enforce Active Flag")}
              disabled={isSubmitting || ((!manualSelectedMod && !manualSearchQuery.trim()) || !registryReason.trim())}
              onClick={handleManualFlag}
            />
          </div>
          </>
        ) : (
          <UniversalGroup 
            title={t("heuristics_tab", "Heuristics")} 
            icon={t("icon_flag", "flag")} 
            headerColorClass="text-[var(--danger)]" 
          >
            <div className="flex flex-col gap-4 relative z-[60]">
              <UniversalInput 
                label={t("auto_file_signature", "File Signature")}
                value={newSig}
                onChange={setNewSig}
                placeholder={t("heuristics_placeholder", "Enter signature pattern...")}
              />

              <div className="flex flex-col gap-4 z-[90] relative">
                <div className="flex flex-col gap-2 relative">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("comp_match_type", "Match Type")}</label>
                  <CustomDropdown
                    value={matchType}
                    options={[
                      { id: "archive_entry_exact", label: t("comp_match_type_archive_exact", "Archive Entry Exact") },
                      { id: "archive_entry_contains", label: t("comp_match_type_archive_contains", "Archive Entry Contains") },
                      { id: "file_name_exact", label: t("comp_match_type_file_exact", "File Name Exact") },
                      { id: "file_name_contains", label: t("comp_match_type_file_contains", "File Name Contains") },
                      { id: "file_content_contains", label: t("comp_match_type_content_contains", "File Content Contains") }
                    ]}
                    onChange={(v: string[]) => setMatchType(v[0])}
                    disableTint={true}
                  />
                </div>
              </div>

              <UniversalTextArea 
                label={t("reason", "Reason")}
                value={notes}
                onChange={setNotes}
                className="min-h-[80px]" 
                placeholder={t("comp_reason_ph", "Enter heuristic notes...")}
              />

              <SidePanelPillToggle
                label={enabled ? t("comp_enabled", "Enabled") : t("comp_disabled", "Disabled")}
                icon={t("icon_shield", "shield")}
                checked={enabled}
                onChange={setEnabled}
              />

              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 w-full">
                {editingId ? (
                  <ActionButton
                    variant="danger"
                    icon={confirmDelete ? t("icon_warning", "warning") : t("icon_delete", "delete")}
                    label={confirmDelete ? t("btn_confirm_delete", "Confirm {Delete}") : t("btn_delete", "{Delete}")}
                    disabled={isSubmitting}
                    onClick={() => {
                      if (!confirmDelete) {
                        setConfirmDelete(true);
                        return;
                      }
                      handleRemoveHeuristic(editingId);
                    }}
                  />
                ) : <div />}
                <div className="flex flex-wrap items-center gap-3">
                  <ActionButton
                    variant="glass"
                    label={t("cancel", "Cancel")}
                    onClick={onClose}
                    disabled={isSubmitting}
                  />
                  <ActionButton
                    variant="danger"
                    icon={t("icon_save", "save")}
                    label={isSubmitting ? t("btn_submitting", "Submitting...") : t("save", "Save")}
                    disabled={isSubmitting || !newSig.trim() || !notes.trim()}
                    onClick={handleAddHeuristic}
                  />
                </div>
              </div>
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
