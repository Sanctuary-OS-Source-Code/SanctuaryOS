import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { SidePanel, standardButtonClass, standardDangerButtonClass, CustomDropdown, CustomComplianceDropdown } from "./shared";
import { useStore } from './store';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';

export default function ComplianceManualFlagSidePanel({ isOpen, onClose, initialQuery = "", initialHeuristicEdit = null, sourceHub = "Oversight", onSuccess }: any) {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState<"registry" | "heuristic">("registry");
  
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [manualSearchResults, setManualSearchResults] = useState<any[]>([]);
  const [manualSelectedMod, setManualSelectedMod] = useState<any>(null);
  const [manualTier, setManualTier] = useState<number>(3);
  const [registryReason, setRegistryReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Heuristics state
  const [signatures, setSignatures] = useState<any[]>([]);
  const [newSig, setNewSig] = useState("");
  const [matchType, setMatchType] = useState("archive_entry_exact");
  const [severity, setSeverity] = useState("malware");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadSignatures = async () => {
    try {
      const config = await invoke<any>('get_saved_coordinates');
      const vaultPath = config.vault_path;
      const sigs = await invoke<any[]>('get_heuristic_signatures', { vaultPath });
      setSignatures(sigs);
      
      const { data } = await supabase.from('heuristic_signatures').select('*');
      if (data && data.length > 0) {
        const mergedMap = new Map<string, any>();
        sigs.forEach(s => mergedMap.set(s.id, s));
        data.forEach(s => mergedMap.set(s.id, s));
        const merged = Array.from(mergedMap.values());
        
        await invoke('save_heuristic_signatures', { vaultPath, signatures: merged });
        setSignatures(merged);
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
  };

  useEffect(() => {
    if (isOpen) {
      setManualSearchQuery(initialQuery);
      setManualSelectedMod(null);
      setManualTier(3);
      loadSignatures();
      
      if (initialHeuristicEdit) {
        setActiveTab("heuristic");
        startEditHeuristic(initialHeuristicEdit);
      } else if (!initialQuery) {
        setActiveTab("registry");
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
      useStore.getState().pushStatus(t("sa_comp_manual_alert_req"));
      return;
    }
    setIsSubmitting(true);
    try {
      let targetId = null;
      let targetName = null;

      if (manualSelectedMod) {
        const { error } = await supabase.from('mods').update({ compliance_tier: manualTier }).eq('id', manualSelectedMod.id);
        if (error) throw error;
        targetId = manualSelectedMod.id;
        targetName = manualSelectedMod.name;
      } else {
        const q = manualSearchQuery.trim();
        const isHash = /^[0-9a-f]{64}$/i.test(q);
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);

        if (isUUID) {
          const { error } = await supabase.from('mods').upsert({ id: q, name: 'Manual Flag (Unknown)', compliance_tier: manualTier });
          if (error) throw error;
          targetId = q;
          targetName = q;
        } else if (isHash) {
          const { data: newMod, error: modErr } = await supabase.from('mods').insert({ name: 'Manual Flag (Hash)', compliance_tier: manualTier }).select('id').single();
          if (modErr) throw modErr;
          const { error: verErr } = await supabase.from('mod_versions').upsert({ mod_id: newMod.id, dna_hash: q, version_label: 'unknown' }, { onConflict: 'dna_hash' });
          if (verErr) throw verErr;
          targetId = newMod.id;
          targetName = q;
        } else {
          const { data: newMod, error: modErr } = await supabase.from('mods').insert({ name: q, compliance_tier: manualTier }).select('id').single();
          if (modErr) throw modErr;
          targetId = newMod.id;
          targetName = q;
        }
      }
      
      const userRes = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
         action: `Manually flagged with tier ${manualTier}`,
         target_table: 'mods',
         target_name: targetName || targetId,
         actor_id: userRes.data.user?.id,
         reason: registryReason.trim()
      });

      useStore.getState().pushStatus(t("sa_comp_manual_alert_success"));
      onClose();
      if (onSuccess) onSuccess();
      if (manualTier === 3) {
         window.dispatchEvent(new CustomEvent('force-radar-sweep'));
      }
    } catch (err: any) {
      useStore.getState().pushStatus((t("sa_comp_manual_alert_fail")) + " " + err.message);
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

      const { error } = await supabase.from('heuristic_signatures').upsert(newObj);
      if (error && error.code !== '23505') throw error;
      
      await supabase.from('audit_logs').insert({
         action: editingId ? `Updated heuristic signature: ${id}` : `Added heuristic signature: ${id}`,
         target_table: 'heuristic_signatures',
         target_name: id,
         actor_id: userRes.data?.user?.id,
         reason: "Manual addition/edit via Oversight"
      });

      const updated = editingId 
        ? signatures.map(s => s.id === id ? newObj : s)
        : [...signatures.filter(s => s.id !== id), newObj];
        
      const config = await invoke<any>('get_saved_coordinates');
      const vaultPath = config.vault_path;
      await invoke('save_heuristic_signatures', { vaultPath, signatures: updated });
      setSignatures(updated);
      
      resetHeuristicForm();
      useStore.getState().pushStatus(t("auto_heuristic_signature_saved"));
      window.dispatchEvent(new CustomEvent('force-heuristics-refresh'));
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
    setRegistryReason("");
    setManualSearchQuery("");
    setManualSelectedMod(null);
  };

  const handleRemoveHeuristic = async (id: string) => {
    try {
      await supabase.from('heuristic_signatures').delete().eq('id', id);
      
      const userRes = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
         action: `Removed heuristic signature: ${id}`,
         target_table: 'heuristic_signatures',
         target_name: id,
         actor_id: userRes.data?.user?.id,
         reason: "Manual removal via Oversight"
      });

      const updated = signatures.filter(s => s.id !== id);
      const config = await invoke<any>('get_saved_coordinates');
      const vaultPath = config.vault_path;
      await invoke('save_heuristic_signatures', { vaultPath, signatures: updated });
      setSignatures(updated);
      window.dispatchEvent(new CustomEvent('force-heuristics-refresh'));
    } catch (e: any) {
      console.error(e);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("sa_comp_manual_title")}
      subtitle={t("sa_comp_manual_subtitle")}
      icon={t("ui_icon_flag")}
      iconColorClass="text-[var(--danger)] border-[var(--danger)]/30"
      footer={
        <div className="flex justify-center items-center gap-4 w-full">
            <button onClick={onClose} className={standardButtonClass}>
              {t("sa_comp_manual_btn_cancel")}
            </button>
          <button 
            onClick={activeTab === 'registry' ? handleManualFlag : handleAddHeuristic} 
            disabled={isSubmitting || (activeTab === 'registry' && ((!manualSelectedMod && !manualSearchQuery.trim()) || !registryReason.trim())) || (activeTab === 'heuristic' && (!newSig.trim() || !notes.trim()))} 
            className={standardDangerButtonClass}
          >
            {isSubmitting ? (t("sa_comp_manual_btn_transmitting")) : (t("sa_comp_manual_btn_insert"))}
          </button>
        </div>
      }
    >
      <div className="p-6 flex flex-col h-full gap-8">
        <div className="flex gap-4 border-b border-white/5 pb-4">
           <button onClick={() => setActiveTab('registry')} className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all ${activeTab === 'registry' ? 'bg-[var(--danger)]/20 text-[var(--danger)]' : 'text-[var(--subtext)] hover:text-[var(--text)]'}`}>
             {t("auto_global_registry")}
           </button>
           <button onClick={() => setActiveTab('heuristic')} className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all ${activeTab === 'heuristic' ? 'bg-[var(--danger)]/20 text-[var(--danger)]' : 'text-[var(--subtext)] hover:text-[var(--text)]'}`}>
             {t("sa_heuristics_tab")}
           </button>
        </div>

        {activeTab === 'registry' ? (
          <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--danger)]/5 to-transparent pointer-events-none rounded-2xl" />
            <h4 className="text-[10px] font-black text-[var(--danger)] uppercase tracking-widest flex items-center gap-2 border-b border-[var(--danger)]/20 pb-4 mb-2">
              <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_flag")}</span>
              {t("sa_comp_manual_title")}
            </h4>
            
            <div className="flex flex-col gap-2 relative z-[60]">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_comp_manual_search_label")}</label>
              <div className="relative">
                <input 
                  ref={inputRef}
                  value={manualSelectedMod ? manualSelectedMod.name : manualSearchQuery} 
                  onChange={e => setManualSearchQuery(e.target.value)} 
                  readOnly={!!manualSelectedMod}
                  onFocus={() => { if (!manualSelectedMod) setIsDropdownOpen(true); }}
                  className="w-full theme-glass-panel rounded-2xl pl-5 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40" 
                  placeholder={t("sa_comp_manual_search_placeholder")} 
                />
                {manualSelectedMod && (
                  <button onClick={() => { setManualSelectedMod(null); setManualSearchQuery(""); inputRef.current?.focus(); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--danger)] font-black text-[10px] bg-red-500/10 px-2 py-1 rounded-md">{t("emote_close")} {t("sa_comp_manual_clear")}</button>
                )}
              </div>

              {isDropdownOpen && !manualSelectedMod && manualSearchResults.length > 0 && createPortal(
                <>
                  <div className="fixed inset-0 z-[50000]" onClick={() => setIsDropdownOpen(false)} />
                  <div className="fixed mt-2 theme-glass-panel border-white/10 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden z-[50001] animate-in fade-in slide-in-from-top-2 flex flex-col max-h-60 overflow-y-auto custom-scrollbar" style={{
                    top: inputRef.current?.getBoundingClientRect().bottom,
                    left: inputRef.current?.getBoundingClientRect().left,
                    width: inputRef.current?.getBoundingClientRect().width,
                  }}>
                    {manualSearchResults.map(m => (
                      <button key={m.id} onClick={() => { setManualSelectedMod(m); setIsDropdownOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex flex-col group transition-all">
                        <span className="text-[11px] font-black uppercase text-[var(--text)] group-hover:theme-text-accent truncate">{m.name}</span>
                        <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">{m.master_author || t("sa_comp_manual_unknown_author") || "Unknown"}</span>
                      </button>
                    ))}
                  </div>
                </>,
                document.body
              )}
            </div>

            <div className="flex flex-col gap-2 relative z-40 mt-4">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_comp_manual_tier_label")}</label>
              <CustomComplianceDropdown value={manualTier} onChange={setManualTier} includeTier3={true} />
            </div>

            <div className="flex flex-col gap-2 relative z-30 mt-4">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_comp_reason")}</label>
              <textarea 
                  value={registryReason}
                  onChange={e => setRegistryReason(e.target.value)}
                  className="w-full theme-glass-panel rounded-2xl p-5 min-h-[80px] text-sm font-medium focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40 custom-scrollbar" 
                  placeholder={t("sa_comp_reason_ph")}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--danger)]/5 to-transparent pointer-events-none rounded-2xl" />
            <h4 className="text-[10px] font-black text-[var(--danger)] uppercase tracking-widest flex items-center gap-2 border-b border-[var(--danger)]/20 pb-4 mb-2">
              <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_flag")}</span>
              {t("sa_heuristics_tab")}
            </h4>
            
            <div className="flex flex-col gap-4 relative z-[60]">
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("auto_file_signature")}</label>
                <input 
                  value={newSig}
                  onChange={e => setNewSig(e.target.value)}
                  className="w-full theme-glass-panel rounded-2xl pl-5 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40" 
                  placeholder={t("sa_heuristics_placeholder")}
                />
              </div>

              <div className="flex flex-col gap-4 z-[90] relative">
                <div className="flex flex-col gap-2 relative">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_comp_match_type")}</label>
                  <CustomDropdown
                    value={matchType}
                    options={[
                      { id: "archive_entry_exact", label: t("sa_comp_match_type_archive_exact") },
                      { id: "archive_entry_contains", label: t("sa_comp_match_type_archive_contains") },
                      { id: "file_name_exact", label: t("sa_comp_match_type_file_exact") },
                      { id: "file_name_contains", label: t("sa_comp_match_type_file_contains") }
                    ]}
                    onChange={(v: string[]) => setMatchType(v[0])}
                    disableTint={true}
                  />
                </div>
                
                <div className="flex flex-col gap-2 relative">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_comp_severity")}</label>
                  <CustomDropdown
                    value={severity}
                    options={[
                      { id: "malware", label: t("sa_comp_severity_malware")},
                      { id: "explicit", label: t("sa_comp_severity_explicit") },
                      { id: "suspicious", label: t("sa_comp_severity_suspicious") }
                    ]}
                    onChange={(v: string[]) => setSeverity(v[0])}
                    disableTint={true}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_comp_reason")}</label>
                <textarea 
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full theme-glass-panel rounded-2xl p-5 min-h-[80px] text-sm font-medium focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40 custom-scrollbar" 
                  placeholder={t("sa_comp_reason_ph")}
                />
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => setEnabled(!enabled)}
                  className={`w-14 h-7 rounded-full transition-colors flex items-center px-1 border ${enabled ? 'bg-[var(--accent)]/20 border-[var(--accent)]' : 'bg-white/5 border-white/10'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-[var(--text)] transition-transform ${enabled ? 'translate-x-7 bg-[var(--accent)]' : 'translate-x-0 opacity-50'}`} />
                </button>
                <span className="text-xs font-bold uppercase tracking-widest text-[var(--subtext)]">
                  {enabled ? (t("sa_comp_enabled")) : (t("sa_comp_disabled"))}
                </span>
                
                {editingId && (
                  <button onClick={resetHeuristicForm} className="ml-auto text-[10px] font-black uppercase text-[var(--subtext)] hover:text-white px-3 py-1 rounded-lg border border-white/5 hover:bg-white/5 transition-all">
                    {t("auto_cancel")}
                  </button>
                )}
              </div>
            </div>

            {signatures.length > 0 && (
              <div className="flex flex-col gap-2 mt-4 max-h-60 overflow-y-auto custom-scrollbar pr-2 border-t border-white/5 pt-4">
                {signatures.map(sig => (
                  <div key={sig.id} className={`theme-glass-panel rounded-xl p-3 flex items-center justify-between group border border-white/5 hover:border-[var(--accent)]/30 transition-all cursor-pointer ${!sig.enabled ? 'opacity-50' : ''}`} onClick={() => startEditHeuristic(sig)}>
                    <div className="flex flex-col gap-1 overflow-hidden">
                      <span className={`font-mono text-xs font-bold truncate ${sig.severity === 'malware' ? 'text-red-400' : sig.severity === 'explicit' ? 'text-yellow-400' : 'text-blue-400'}`}>{sig.signature}</span>
                      <span className="text-[9px] uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">{sig.match_type} &middot; {sig.severity}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleRemoveHeuristic(sig.id); }} className="text-[var(--subtext)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all material-symbols-outlined !text-[16px] p-2 rounded-lg hover:bg-red-500/10">
                      {t("auto_delete")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </SidePanel>
  );
}
