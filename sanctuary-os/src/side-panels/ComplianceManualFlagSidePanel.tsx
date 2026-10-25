import React, { useState, useEffect } from "react";
import { supabase, supabaseAuth, getActiveGameClient } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { SidePanel, standardButtonClass, standardDangerButtonClass, CustomDropdown, CustomComplianceDropdown, ActionButton, PanelHeaderGroup, PanelHeaderButton, DashboardStatTile, SidePanelHeroCard, SidePanelPillToggle } from "../shared";
import { UniversalGroup, UniversalInput, UniversalTextArea, UniversalToggle } from '../components/universal/UniversalLayout';
import { useStore } from '../store';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from '../utils/envUtils';

export default function ComplianceManualFlagSidePanel({ isOpen, onClose, initialQuery = "", initialHeuristicEdit = null, sourceHub = "Oversight", isMalwareOnly = false, onSuccess }: any) {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState<"registry" | "heuristic">("registry");
  
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [manualSearchResults, setManualSearchResults] = useState<any[]>([]);
  const [manualSelectedMod, setManualSelectedMod] = useState<any>(null);
  const [manualTier, setManualTier] = useState<number>(5);
  const [registryReason, setRegistryReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [signatures, setSignatures] = useState<any[]>([]);
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
      setManualTier(isMalwareOnly ? 5 : 5);
      setConfirmDelete(false);
      loadSignatures();
      
      if (initialHeuristicEdit) {
        setActiveTab("heuristic");
        startEditHeuristic(initialHeuristicEdit);
      } else if (!initialQuery) {
        setActiveTab("registry");
        setEditingId(null);
      }
    }
  }, [isOpen, initialQuery, initialHeuristicEdit]);

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
        const { data: verData } = await supabase
          .from('mod_versions')
          .select('*, mods(id, name, master_author, compliance_tier)')
          .eq('dna_hash', q)
          .maybeSingle();
        
        if (verData && verData.mods) {
          setManualSearchResults([verData.mods as any]);
        } else {
          setManualSearchResults([]);
        }
      } else {
        const orCondition = isValidUUID 
          ? `name.ilike.%${q}%,id.eq.${q}`
          : `name.ilike.%${q}%`;

        const { data } = await supabase
          .from('mods')
          .select('id, name, master_author, compliance_tier')
          .or(orCondition)
          .limit(10);
        if (data) setManualSearchResults(data);
      }
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [manualSearchQuery, manualSelectedMod, isOpen, activeTab]);

  const handleManualFlag = async () => {
    if ((!manualSelectedMod && !manualSearchQuery.trim()) || !registryReason.trim()) {
      useStore.getState().pushStatus(t("comp_manual_alert_req", "Required fields missing"));
      return;
    }
    setIsSubmitting(true);
    try {
      let targetId = null;
      let targetName = null;

      if (manualSelectedMod) {
        const { error } = await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'mods', p_payload: { id: manualSelectedMod.id, compliance_tier: manualTier } });
        if (error) throw error;
        targetId = manualSelectedMod.id;
        targetName = manualSelectedMod.name;
      } else {
        const q = manualSearchQuery.trim();
        const isHash = /^[0-9a-f]{64}$/i.test(q);
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);

        if (isUUID) {
          const { error } = await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'mods', p_payload: { id: q, name: 'Manual Flag (Unknown)', compliance_tier: manualTier } });
          if (error) throw error;
          targetId = q;
          targetName = q;
        } else if (isHash) {
          const newId = crypto.randomUUID();
          const { error: modErr } = await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'mods', p_payload: { id: newId, name: 'Manual Flag (Hash)', compliance_tier: manualTier } });
          if (modErr) throw modErr;
          const { error: verErr } = await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'mod_versions', p_payload: { mod_id: newId, dna_hash: q, version_label: 'vlocal' } });
          if (verErr) throw verErr;
          targetId = newId;
          targetName = q;
        } else {
          const newId = crypto.randomUUID();
          const { error: modErr } = await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'mods', p_payload: { id: newId, name: q, compliance_tier: manualTier } });
          if (modErr) throw modErr;
          targetId = newId;
          targetName = q;
        }
      }
      
      const userRes = await supabase.auth.getUser();
      await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'audit_logs', p_payload: {
         action: `Manually flagged with tier ${manualTier}`,
         target_table: 'mods',
         target_name: targetName || targetId,
         actor_id: userRes.data.user?.id,
         reason: registryReason.trim()
      }});

      useStore.getState().pushStatus(t("comp_manual_alert_success", "Flagged successfully"));
      onClose();
      if (onSuccess) onSuccess();
      if (manualTier === 5) {
         window.dispatchEvent(new CustomEvent('force-radar-sweep'));
      }
    } catch (err: any) {
      useStore.getState().pushStatus(t("comp_manual_alert_fail", "Failed:") + " " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddHeuristic = async () => {
    if (!newSig.trim() || !notes.trim()) return;
    setIsSubmitting(true);
    
    const id = editingId || newSig.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    try {
      const userRes = await supabase.auth.getUser();
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
      
      await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'audit_logs', p_payload: {
         action: editingId ? `Updated heuristic signature: ${id}` : `Added heuristic signature: ${id}`,
         target_table: 'heuristic_signatures',
         target_name: id,
         actor_id: userRes.data?.user?.id,
         reason: "Manual addition/edit via Oversight"
      }});

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
      
      const userRes = await supabase.auth.getUser();
      await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'audit_logs', p_payload: {
         action: `Removed heuristic signature: ${id}`,
         target_table: 'heuristic_signatures',
         target_name: id,
         actor_id: userRes.data?.user?.id,
         reason: "Manual removal via Oversight"
      }});

      await loadSignatures();
      resetHeuristicForm();
      useStore.getState().pushStatus(t("btn_delete", "Deleted"));
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
              tooltip={confirmDelete ? t("btn_confirm_delete", "Confirm Delete") : t("btn_delete", "Delete")}
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
          <div className="grid grid-cols-2 gap-3 w-full">
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
          </div>
        )}

        {activeTab === 'registry' ? (
          <UniversalGroup 
            title={t("comp_manual_title", "Manual Flag")} 
            icon={t("icon_flag", "flag")} 
            headerColorClass={isMalwareOnly ? "text-[var(--danger)]" : "theme-text-accent"} 
          >
            <div className="flex flex-col gap-2 relative z-[60]">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("comp_manual_search_label", "Target Artifact")}</label>
              <div className="relative">
                <input 
                  ref={inputRef}
                  value={manualSelectedMod ? manualSelectedMod.name : manualSearchQuery} 
                  onChange={e => setManualSearchQuery(e.target.value)} 
                  readOnly={!!manualSelectedMod}
                  onFocus={() => { if (!manualSelectedMod) setIsDropdownOpen(true); }}
                  className="w-full glass-surface rounded-2xl pl-5 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:opacity-40" 
                  placeholder={t("comp_manual_search_placeholder", "Search mod name, UUID, or SHA-256 hash...")} 
                />
                {manualSelectedMod && (
                  <button onClick={() => { setManualSelectedMod(null); setManualSearchQuery(""); inputRef.current?.focus(); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--danger)] font-black text-[10px] bg-transparent border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] px-2 py-1 rounded-md">{t("clear", "Clear")}</button>
                )}
              </div>

              {isDropdownOpen && !manualSelectedMod && manualSearchResults.length > 0 && createPortal(
                <>
                  <div className="fixed inset-0 z-[50000]" onClick={() => setIsDropdownOpen(false)} />
                  <div className="fixed mt-2 glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl shadow-md z-[50001] animate-in fade-in slide-in-from-top-2 flex flex-col max-h-60 overflow-y-auto custom-scrollbar" style={{
                    top: inputRef.current?.getBoundingClientRect().bottom,
                    left: inputRef.current?.getBoundingClientRect().left,
                    width: inputRef.current?.getBoundingClientRect().width,
                  }}>
                    {manualSearchResults.map(m => (
                      <button key={m.id} onClick={() => { setManualSelectedMod(m); setIsDropdownOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex flex-col group transition-all">
                        <span className="text-[11px] font-black capitalize text-[var(--text)] group-hover:theme-text-accent truncate">{m.name}</span>
                        <span className="text-[9px] font-bold capitalize tracking-widest opacity-60">{m.master_author || t("vlocal", "Local")}</span>
                      </button>
                    ))}
                  </div>
                </>, document.body
              )}
            </div>

            {!isMalwareOnly && (
              <div className="flex flex-col gap-2 relative z-40 mt-4">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("Vault_stat_tier", "Compliance Tier")}</label>
                <CustomComplianceDropdown value={manualTier} onChange={setManualTier} maxTier={5} />
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
                label={t("comp_enabled", "Heuristic Active")}
                description={enabled ? t("comp_enabled", "Enabled") : t("comp_disabled", "Disabled")}
                icon={t("icon_shield", "shield")}
                checked={enabled}
                onChange={setEnabled}
              />
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
