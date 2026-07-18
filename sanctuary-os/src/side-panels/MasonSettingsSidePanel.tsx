import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect, 
  CustomComplianceDropdown, CustomDatePicker, StatTile, 
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass, 
  standardDangerButtonClass, standardAccentGlassButtonClass, 
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion } from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";

import MasonPostViewer from "./MasonPostViewer";


export function MasonSettingsSidePanel({ isOpen, onClose, profile, onUpdate }: { isOpen: boolean, onClose: () => void, profile: any, onUpdate: (p: any) => void }) {
  const { t } = useLexicon();
  const [formData, setFormData] = useState({
    name: profile.name || "",
    bio: profile.bio || "",
    avatar_url: profile.avatar_url || "",
    patreon_url: profile.patreon_url || "",
    website_url: profile.website_url || "",
    discord_url: profile.discord_url || ""
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: profile.name || "",
        bio: profile.bio || "",
        avatar_url: profile.avatar_url || "",
        patreon_url: profile.patreon_url || "",
        website_url: profile.website_url || "",
        discord_url: profile.discord_url || ""
      });
    }
  }, [isOpen, profile]);

  const handleSave = async () => {
    setIsSaving(true);
    const { data, error } = await supabase.from('masons').update(formData).eq('id', profile.id).select().single();
    if (!error && data) {
       onUpdate(data);
       useStore.getState().pushStatus(t("auto_profile_settings_saved_40"), 'success');
       onClose();
    }
    setIsSaving(false);
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("masonhub_settings_title")}
      icon={t("icon_settings")}
      widthClass="w-[500px]"
      footer={
        <div className="flex justify-center items-center gap-4 w-full">
          <button onClick={onClose} className={standardButtonClass}>
             {t("nav_cancel")}
          </button>
          <button onClick={handleSave} disabled={isSaving} className={standardAccentGlassButtonClass}>
            {isSaving ? t("saving_settings") : t("save_configuration")}
          </button>
        </div>
      }
    >
    <div className="w-full flex flex-col gap-6">
       <h2 className="text-sm font-black theme-text-accent uppercase tracking-widest mb-2">{t("creator_identity")}</h2>
       
       <div className="flex flex-col gap-2">
         <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("public_name")}</label>
         <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
       </div>
       
       <div className="flex flex-col gap-2">
         <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("avatar_url")}</label>
         <input value={formData.avatar_url} onChange={e => setFormData({...formData, avatar_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
       </div>
       
       <div className="flex flex-col gap-2">
         <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("biography")}</label>
         <textarea value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono h-24 resize-none focus:outline-none focus:theme-border-accent custom-scrollbar overflow-y-auto" />
       </div>
       
       <div className="flex flex-col gap-4">
         <div className="flex flex-col gap-2">
           <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("patreon_url")}</label>
           <input value={formData.patreon_url} onChange={e => setFormData({...formData, patreon_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
         </div>
         <div className="flex flex-col gap-2">
           <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("personal_website")}</label>
           <input value={formData.website_url} onChange={e => setFormData({...formData, website_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
         </div>
        </div>

       <div className="flex flex-col gap-2">
         <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("discord_url")}</label>
         <input value={formData.discord_url} onChange={e => setFormData({...formData, discord_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
       </div>
       
    </div>
    </SidePanel>
  );
}
