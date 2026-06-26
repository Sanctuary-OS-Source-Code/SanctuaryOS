import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { SidePanel, standardButtonClass, standardAccentGlassButtonClass, GameVersionMultiSelect, CustomDatePicker, CustomComplianceDropdown, CustomClassificationDropdown } from './shared';
import { CustomStatusDropdown, CustomMasonDropdown } from './ArchitectHub';

export function SharedMetadataEditorSidePanel({
  isOpen,
  onClose,
  activeMod,
  masonsList,
  onModUpdated
}: {
  isOpen: boolean;
  onClose: () => void;
  activeMod: any;
  masonsList: any[];
  onModUpdated?: () => void;
}) {
  const { t } = useLexicon();
  const [modForm, setModForm] = useState<any>(null);
  const [isCommitting, setIsCommitting] = useState(false);

  useEffect(() => {
    if (activeMod) {
      setModForm({ ...activeMod });
    } else {
      setModForm(null);
    }
  }, [activeMod]);

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
      isOpen={isOpen && !!modForm}
      onClose={onClose}
      widthClass="w-[600px]"
      title={t("ui_edit_metadata") || "EDIT METADATA"}
      subtitle={`UUID: ${modForm?.id}`}
      icon={t("ui_icon_inventory") || "inventory_2"}
      footer={
        <div className="flex justify-center items-center gap-4 w-full">
          <button onClick={onClose} disabled={isCommitting} className={standardButtonClass}>
            {t("shared_cancel") || "CANCEL"}
          </button>
          <button onClick={handleCommitChanges} disabled={isCommitting} className={standardAccentGlassButtonClass}>
            {isCommitting ? (t("registry_committing") || "COMMITTING...") : (t("registry_commit_changes") || "Commit Changes")}
          </button>
        </div>
      }
    >
      {modForm && (
        <div className="flex flex-col gap-6 pb-8">
          <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative mb-2">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
            <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
              <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_info") || "info"}</span>
              {t("registry_meta") || "Metadata"}
            </h4>
            
            <div className="flex flex-col gap-2 relative z-10">
              <input value={modForm?.name || ""} onChange={e => setModForm({...modForm, name: e.target.value})} placeholder={t("registry_label_name") || "Artifact Name"} className="bg-transparent text-xl font-black text-[var(--text)] uppercase tracking-tighter leading-none focus:outline-none focus:theme-text-accent transition-colors placeholder:opacity-30 border-b border-transparent focus:border-[var(--accent)]/30 pb-1 w-full" />
            </div>
          </div>


          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_mason") || "MASON ENTITY (AUTHOR)"}</label>
            <div className="flex gap-2 relative">
              <div className="flex-1 min-w-0">
                <CustomMasonDropdown 
                  value={modForm.mason_id} 
                  options={masonsList} 
                  onChange={(id: string) => setModForm({...modForm, mason_id: id})} 
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_class") || "Category"}</label>
              <CustomClassificationDropdown value={modForm.category_override || "Script"} onChange={(newType: string) => setModForm({...modForm, category_override: newType})} />
            </div>
            
            <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sandbox_label_file_ext") || "File Extension"}</label>
                <input value={modForm.file_extension || ""} onChange={e => setModForm({...modForm, file_extension: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder="e.g. .package, .ts4script" />
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_subcat") || "SUB-CATEGORY"}</label>
              <input value={modForm.sub_type || ""} onChange={e => setModForm({...modForm, sub_type: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder="e.g. Tuning, Object, CAS" />
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-4">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_desc") || "Description"}</label>
              <textarea value={modForm.description || ""} onChange={e => setModForm({...modForm, description: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold h-24 resize-none focus:outline-none focus:theme-border-accent custom-scrollbar" />
          </div>

          <div className="flex flex-col gap-2 mt-4">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_image") || "Cover Image URL"}</label>
            <input value={modForm.image_url || ""} onChange={e => setModForm({...modForm, image_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder="https://..." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest ml-2 flex items-center gap-1">
                {t("registry_label_version") || "Master Version (Latest)"} 
              </label>
              <input value={modForm.latest_version || ""} onChange={e => setModForm({ ...modForm, latest_version: e.target.value })} placeholder="e.g. 1.0, 1.1, 1.2" className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--subtext)] text-sm font-bold focus:outline-none focus:theme-border-success" />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url") || "URL"}</label>
              <input value={modForm.url || ""} onChange={e => setModForm({...modForm, url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 theme-text-accent text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder="https://..." />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_status") || "Global Status"}</label>
              <CustomStatusDropdown value={modForm.status || "unverified"} onChange={(newStatus: string) => setModForm({...modForm, status: newStatus})} />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_safety") || "SAFETY RATING"}</label>
              <CustomComplianceDropdown value={modForm.compliance_tier || 0} onChange={(newTier: number) => setModForm({...modForm, compliance_tier: newTier})} includeTier3={false} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_uploaded_date") || "UPLOADED DATE"}</label>
              <div className="w-full">
                <CustomDatePicker value={modForm.created_at || null} onChange={(date: any) => setModForm({...modForm, created_at: date})} />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_updated_date") || "LAST UPDATED"}</label>
              <div className="w-full">
                <CustomDatePicker value={modForm.updated_at || null} onChange={(date: any) => setModForm({...modForm, updated_at: date})} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-4 pb-25">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_game_versions") || "GAME VERSIONS"}</label>
            <GameVersionMultiSelect selectedVersions={modForm.compatible_versions || []} onChange={(v: string[]) => setModForm({...modForm, compatible_versions: v})} />
          </div>
        </div>
      )}
    </SidePanel>
  );
}
