import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { SidePanel } from "./shared";
import { CustomComplianceDropdown } from "./shared";
import { useStore } from './store';

export default function ComplianceManualFlagSidePanel({ isOpen, onClose, initialQuery = "", onSuccess }: any) {
  const { t } = useLexicon();
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [manualSearchResults, setManualSearchResults] = useState<any[]>([]);
  const [manualSelectedMod, setManualSelectedMod] = useState<any>(null);
  const [manualTier, setManualTier] = useState<number>(3);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setManualSearchQuery(initialQuery);
      setManualSelectedMod(null);
      setManualTier(3);
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (!manualSearchQuery.trim() || manualSelectedMod || !isOpen) {
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
  }, [manualSearchQuery, manualSelectedMod, isOpen]);

  const handleManualFlag = async () => {
    if (!manualSelectedMod) {
      useStore.getState().pushStatus(t("sa_comp_manual_alert_select") || "Please select a mod from the registry.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('mods').update({ compliance_tier: manualTier }).eq('id', manualSelectedMod.id);
      if (error) throw error;
      
      const userRes = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
         action: `Manually flagged with tier ${manualTier}`,
         target_table: 'mods',
         target_name: manualSelectedMod.name || manualSelectedMod.id,
         actor_id: userRes.data.user?.id,
         reason: "Manual Flag via Oversight"
      });

      useStore.getState().pushStatus(t("sa_comp_manual_alert_success") || "Mod flagged manually successfully.");
      onClose();
      if (onSuccess) onSuccess();
      if (manualTier === 3) {
         window.dispatchEvent(new CustomEvent('force-radar-sweep'));
      }
    } catch (err: any) {
      useStore.getState().pushStatus(t("sa_comp_manual_alert_fail") || "Failed to manual flag:" + " " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const standardButtonClass = "px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all border shadow-lg border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] hover:shadow-xl";
  const standardDangerButtonClass = "px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all border shadow-[0_0_20px_rgba(255,0,0,0.1)] hover:shadow-[0_0_30px_rgba(255,0,0,0.2)] border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:border-red-500/50";

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("sa_comp_manual_title") || "Manual Threat Flag"}
      subtitle={t("sa_comp_manual_subtitle") || "Direct insertion into Global Registry"}
      icon={t("ui_icon_flag") || "flag"}
      iconColorClass="text-[var(--danger)] border-[var(--danger)]/30"
      footer={
        <div className="flex justify-center items-center gap-4 w-full">
            <button onClick={onClose} className={standardButtonClass}>
              {t("sa_comp_manual_btn_cancel") || "CANCEL"}
            </button>
          <button onClick={handleManualFlag} disabled={isSubmitting} className={standardDangerButtonClass}>
            {isSubmitting ? t("sa_comp_manual_btn_transmitting") || "TRANSMITTING..." : t("sa_comp_manual_btn_insert") || "INSERT RECORD"}
          </button>
        </div>
      }
    >
      <div className="p-6 flex flex-col h-full gap-8">
        <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--danger)]/5 to-transparent pointer-events-none rounded-2xl" />
          <h4 className="text-[10px] font-black text-[var(--danger)] uppercase tracking-widest flex items-center gap-2 border-b border-[var(--danger)]/20 pb-4 mb-2">
            <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_flag") || "flag"}</span>
            {t("sa_comp_manual_title") || "Manual Threat Flag"}
          </h4>
          
          <div className="flex flex-col gap-2 relative">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_comp_manual_search_label") || "Search Global Registry"}</label>
            <input 
              value={manualSelectedMod ? manualSelectedMod.name : manualSearchQuery} 
              onChange={e => setManualSearchQuery(e.target.value)} 
              readOnly={!!manualSelectedMod}
              className="w-full theme-glass-panel rounded-2xl pl-5 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40" 
              placeholder={t("sa_comp_manual_search_placeholder") || "Type to search registry..."} 
            />
            {manualSelectedMod && (
              <button onClick={() => { setManualSelectedMod(null); setManualSearchQuery(""); }} className="absolute right-4 top-9 text-[var(--danger)] font-black text-[10px] bg-red-500/10 px-2 py-1 rounded-md">{t("emote_close")} {t("sa_comp_manual_clear") || "CLEAR"}</button>
            )}
            {manualSearchResults.length > 0 && !manualSelectedMod && (
              <div className="absolute top-full left-0 right-0 mt-2 theme-glass-panel border border-white/10 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] z-[50000] overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                {manualSearchResults.map(m => (
                  <button key={m.id} onClick={() => setManualSelectedMod(m)} className="w-full text-left px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-b border-white/5 last:border-0 flex flex-col group transition-all">
                    <span className="text-[11px] font-black uppercase text-[var(--text)] group-hover:theme-text-accent truncate">{m.name}</span>
                    <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">{m.master_author || t("sa_comp_manual_unknown_author") || "Unknown"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 relative z-40 mt-4">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_comp_manual_tier_label") || "Compliance Tier"}</label>
            <CustomComplianceDropdown value={manualTier} onChange={setManualTier} includeTier3={true} />
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
