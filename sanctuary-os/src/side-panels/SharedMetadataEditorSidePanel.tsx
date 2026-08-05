import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { SidePanel, standardButtonClass, standardAccentGlassButtonClass, GameVersionMultiSelect, CustomDatePicker, CustomComplianceDropdown, CustomClassificationDropdown, ActionButton } from '../shared';
import { CustomStatusDropdown, CustomMasonDropdown } from '../ArchitectHub';

export function SharedMetadataEditorSidePanel({
  isOpen,
  onClose,
  activeMod,
  initialModId,
  masonsList,
  onModUpdated
}: {
  isOpen: boolean;
  onClose: () => void;
  activeMod?: any;
  initialModId?: string;
  masonsList?: any[];
  onModUpdated?: () => void;
}) {
  const { t } = useLexicon();
  const [modForm, setModForm] = useState<any>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [localMasonsList, setLocalMasonsList] = useState<any[]>(masonsList || []);

  useEffect(() => {
    if (activeMod) {
      setModForm({ ...activeMod });
    } else if (initialModId && isOpen) {
      const fetchMod = async () => {
        let modId = initialModId;
        if (initialModId.length === 64) {
          const { data: mvData } = await supabase.from('mod_versions').select('mod_id').eq('dna_hash', initialModId).single();
          if (mvData && mvData.mod_id) {
            modId = mvData.mod_id;
          } else {
            setModForm({ _error: true, id: initialModId });
            return;
          }
        }
        
        const { data, error } = await supabase.from('mods').select('*').eq('id', modId).single();
        if (data) {
          setModForm(data);
        } else {
          setModForm({ _error: true, id: initialModId });
        }
      };
      fetchMod();
    } else if (!isOpen) {
      setModForm(null);
    }
  }, [activeMod, initialModId, isOpen]);

  useEffect(() => {
    if (!masonsList && isOpen) {
      supabase.from('masons').select('id, name').then(({ data }) => {
        if (data) setLocalMasonsList(data);
      });
    } else if (masonsList) {
      setLocalMasonsList(masonsList);
    }
  }, [masonsList, isOpen]);

  const handleCommitChanges = async () => {
    if (!modForm) return;
    setIsCommitting(true);
    try {
      await supabase.from('mods').update({
        name: modForm.name,
        category_override: modForm.category_override,
        sub_type: modForm.sub_type,
        file_extension: modForm.file_extension,
        status: modForm.status,
        url: modForm.url,
        image_url: modForm.image_url,
        latest_version: modForm.latest_version,
        description: modForm.description,
        compatible_versions: modForm.compatible_versions,
        family_slug: modForm.family_slug,
        mason_id: modForm.mason_id,
        compliance_tier: modForm.compliance_tier,
        folder_structure: modForm.folder_structure || [],
        is_paid: modForm.is_paid || false,
        is_early_access: modForm.is_early_access || false,
        updated_at: new Date().toISOString()
      }).eq('id', modForm.id);
      if (onModUpdated) onModUpdated();
    } catch (err) {
      console.error(err);
    }
    setIsCommitting(false);
    onClose();
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      panelZ="z-[60000]"
      backdropZ="z-[59999]"
      widthClass="w-[550px]"
      title={t("ui_edit_metadata")}
      subtitle={`UUID: ${modForm?.id}`}
      icon={t("icon_inventory_2")}
      footer={
        <div className="flex justify-center items-center gap-4 w-full px-8">
          <ActionButton 
            onClick={onClose} 
            disabled={isCommitting} 
            label={t("nav_cancel")} 
            icon="close"
            className="flex-1"
          />
          <ActionButton 
            onClick={handleCommitChanges} 
            disabled={isCommitting} 
            label={isCommitting ? (t("dossier_btn_saving") || "SAVING...") : (t("ui_btn_commit") || "SAVE METADATA")} 
            icon="save"
            className="flex-1 !theme-bg-accent/20 !theme-text-accent !border-[var(--accent)]/50"
          />
        </div>
      }
    >
      {!modForm ? (
        <div className="flex items-center justify-center h-48 opacity-50 font-black tracking-widest text-[var(--text)] text-[10px] uppercase">
          {t("ui_loading") || "Loading..."}
        </div>
      ) : modForm._error ? (
        <div className="flex flex-col items-center justify-center h-48 opacity-80 font-black tracking-widest text-red-400 text-[10px] uppercase gap-2 text-center">
          <span className="material-symbols-outlined !text-[32px] text-red-500">error</span>
          <span>Failed to load Mod Metadata.</span>
          <span className="opacity-50 text-[8px] mt-2">ID: {modForm.id || "Unknown"}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-6 pb-8">
          <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative mb-2">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
            <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
              <span className="material-symbols-outlined !text-[14px]">{t("icon_info")}</span>
              {t("metadata")}
            </h4>
            
            <div className="flex flex-col gap-2 relative z-10">
              <input value={modForm?.name || ""} onChange={e => setModForm({...modForm, name: e.target.value})} placeholder={t("registry_label_name")} className="bg-transparent text-xl font-black text-[var(--text)] uppercase tracking-tighter leading-none focus:outline-none focus:theme-text-accent transition-colors placeholder:opacity-30 border-b border-transparent focus:border-[var(--accent)]/30 pb-1 w-full" />
            </div>
          </div>


          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("mason")}</label>
            <div className="flex gap-2 relative">
              <div className="flex-1 min-w-0">
                <CustomMasonDropdown 
                  value={modForm.mason_id} 
                  onChange={(val: string) => setModForm({...modForm, mason_id: val})}
                  options={localMasonsList} 
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("category")}</label>
              <CustomClassificationDropdown value={modForm.category_override || "Script"} onChange={(newType: string) => setModForm({...modForm, category_override: newType})} />
            </div>
            
            <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("label_file_ext")}</label>
                <input value={modForm.file_extension || ""} onChange={e => setModForm({...modForm, file_extension: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder={t("ph_file_ext")} />
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_subcat")}</label>
              <input value={modForm.sub_type || ""} onChange={e => setModForm({...modForm, sub_type: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder={t("auto_e_g_tuning_26")} />
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-4">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("upload_desc")}</label>
              <textarea value={modForm.description || ""} onChange={e => setModForm({...modForm, description: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold h-24 resize-none focus:outline-none focus:theme-border-accent custom-scrollbar" />
          </div>

          <div className="flex flex-col gap-2 mt-4">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("cc_cover_url")}</label>
            <input value={modForm.image_url || ""} onChange={e => setModForm({...modForm, image_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder={t("auto_https")} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest ml-2 flex items-center gap-1">
                {t("label_mason_version") || "Mason Version"} 
              </label>
              <input value={modForm.latest_version || ""} onChange={e => setModForm({ ...modForm, latest_version: e.target.value })} placeholder={t("ph_mod_version")} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--subtext)] text-sm font-bold focus:outline-none focus:theme-border-success" />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url")}</label>
              <input value={modForm.url || ""} onChange={e => setModForm({...modForm, url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 theme-text-accent text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder={t("auto_https")} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <label className={`w-full theme-glass-panel rounded-2xl px-5 h-12 flex items-center justify-between cursor-pointer transition-all border shadow-inner group hover:border-[var(--accent)]/30 ${modForm.is_paid ? 'bg-yellow-500/10 border-yellow-500/30' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
              <span className={`text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2 ${modForm.is_paid ? 'text-yellow-500' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                <span className="material-symbols-outlined !text-[16px]">{t("icon_monetization_on") || "monetization_on"}</span>
                {t("label_is_paid")}
              </span>
              <div className={`w-10 h-6 rounded-full transition-colors relative shadow-inner shrink-0 ${modForm.is_paid ? 'bg-yellow-500' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                <div className={`w-4 h-4 rounded-full bg-[var(--bg)] absolute top-1 transition-transform shadow-md flex items-center justify-center ${modForm.is_paid ? 'translate-x-5' : 'translate-x-1'}`}>
                </div>
              </div>
              <input type="checkbox" checked={modForm.is_paid || false} onChange={e => setModForm({...modForm, is_paid: e.target.checked})} className="hidden" />
            </label>

            <label className={`w-full theme-glass-panel rounded-2xl px-5 h-12 flex items-center justify-between cursor-pointer transition-all border shadow-inner group hover:border-[var(--accent)]/30 ${modForm.is_early_access ? 'bg-purple-500/10 border-purple-500/30' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
              <span className={`text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2 ${modForm.is_early_access ? 'text-purple-500' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                <span className="material-symbols-outlined !text-[16px]">{t("icon_science") || "science"}</span>
                {t("label_is_early_access")}
              </span>
              <div className={`w-10 h-6 rounded-full transition-colors relative shadow-inner shrink-0 ${modForm.is_early_access ? 'bg-purple-500' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                <div className={`w-4 h-4 rounded-full bg-[var(--bg)] absolute top-1 transition-transform shadow-md flex items-center justify-center ${modForm.is_early_access ? 'translate-x-5' : 'translate-x-1'}`}>
                </div>
              </div>
              <input type="checkbox" checked={modForm.is_early_access || false} onChange={e => setModForm({...modForm, is_early_access: e.target.checked})} className="hidden" />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_status")}</label>
              <CustomStatusDropdown value={modForm.status || "unverified"} onChange={(newStatus: string) => setModForm({...modForm, status: newStatus})} />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_safety")}</label>
              <CustomComplianceDropdown value={modForm.compliance_tier || 0} onChange={(newTier: number) => setModForm({...modForm, compliance_tier: newTier})} includeTier3={false} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("uploaded_date")}</label>
              <div className="w-full">
                <CustomDatePicker value={modForm.created_at || null} onChange={(date: any) => setModForm({...modForm, created_at: date})} />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("updated_date")}</label>
              <div className="w-full">
                <CustomDatePicker value={modForm.updated_at || null} onChange={(date: any) => setModForm({...modForm, updated_at: date})} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-4 pb-25">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("game_versions")}</label>
            <GameVersionMultiSelect selectedVersions={modForm.compatible_versions || []} onChange={(v: string[]) => setModForm({...modForm, compatible_versions: v})} />
          </div>
        </div>
      )}
    </SidePanel>
  );
}
