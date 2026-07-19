import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { SidePanel, CustomDropdown, standardButtonClass, standardAccentGlassButtonClass } from '../shared';

export function PushTemplateSidePanel({ 
  isOpen, 
  onClose, 
  templateContent, 
  onChange,
  onPushSuccess,
  initialName = "" 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  templateContent: string;
  onChange?: (newContent: string) => void;
  onPushSuccess?: (newName: string, newJson: string) => void;
  initialName?: string;
}) {
  const { t } = useLexicon();
  const pushStatus = useStore(state => state.pushStatus);
  const session = useStore(state => state.session);
  const modList = useStore((state) => state.modList) || [];
  const [isUploading, setIsUploading] = useState(false);
  
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [attachedMod, setAttachedMod] = useState("");
  const [targetFile, setTargetFile] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [language, setLanguage] = useState("English");
  const [existingTemplates, setExistingTemplates] = useState<any[]>([]);
  const [selectedUpdateId, setSelectedUpdateId] = useState<string>("new");

  React.useEffect(() => {
     if (isOpen) {
       try {
          const parsed = JSON.parse(templateContent);
          if (parsed.target_file) setTargetFile(parsed.target_file);
          if (parsed.version || parsed.template_version) setVersion(parsed.version || parsed.template_version);
          if (parsed.language) setLanguage(parsed.language);
          if (parsed.name && !initialName) setName(parsed.name);
       } catch(e) {}
     }
  }, [isOpen]);

  React.useEffect(() => {
      const fetchTemplates = async () => {
         if (!session?.user?.id) return;
         if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;
         let authorName = session.user.user_metadata?.username || 'Citizen';
         let fallbackName = session.user.user_metadata?.username || 'Citizen';
         const { data: mData } = await supabase.from('masons').select('name').eq('profile_id', session.user.id).single();
         if (mData && mData.name) authorName = mData.name;
         
         const { data } = await supabase
            .from('nexus_assets')
            .select('*')
            .or(`author.ilike.%${authorName}%,author.ilike.%Citizen%,author.ilike.%Sanctuary%,author.ilike.%${fallbackName}%`)
            .eq('asset_type', 'workbench_template');
         if (data) {
            setExistingTemplates(data);
            
            let parsedName = initialName;
            let parsedTemplateId = "";
            try {
               const parsed = JSON.parse(templateContent);
               if (parsed.name) parsedName = parsed.name;
               if (parsed.template_id) parsedTemplateId = parsed.template_id;
            } catch(e) {}
            const match = data.find(t => {
               if (parsedTemplateId && t.json_data) {
                  try {
                     const tParsed = typeof t.json_data === 'string' ? JSON.parse(t.json_data) : t.json_data;
                     const tId = tParsed.template_id || (Array.isArray(tParsed) ? tParsed[0]?.template_id : undefined);
                     if (tId === parsedTemplateId) return true;
                  } catch(e) {}
               }
               return t.name === parsedName || t.name === initialName;
            });
            if (match) {
                setSelectedUpdateId(match.id);
                setName(match.name || "");
                setDescription(match.description || "");
                setReleaseNotes(match.release_notes || "");
                if (match.language) setLanguage(match.language);
            }
         }
      };
      fetchTemplates();
  }, [session]);

  const handleSelectUpdate = (val: string[]) => {
      const id = val[0];
      setSelectedUpdateId(id);
      if (id === "new") {
          setName(initialName);
          setDescription("");
          setReleaseNotes("");
      } else {
          const tmpl = existingTemplates.find(t => t.id === id);
          if (tmpl) {
              setName(tmpl.name || "");
              setDescription(tmpl.description || "");
              setReleaseNotes(tmpl.release_notes || "");
              if (tmpl.language) setLanguage(tmpl.language);
          }
      }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) return;

    setIsUploading(true);
    try {
      let finalJson = templateContent;
      try {
        const parsed = JSON.parse(templateContent);
        if (attachedMod) {
          parsed.target_mod = attachedMod;
        }
        if (targetFile.trim()) {
          parsed.target_file = targetFile.trim();
        }
        parsed.version = version.trim();
        parsed.language = language;
        parsed.name = name.trim();
        finalJson = JSON.stringify(parsed, null, 2);
      } catch (err) {
        throw new Error(t("upload_invalid_json"));
      }

      let authorName = session?.user?.user_metadata?.username || 'Citizen';
      if (session?.user?.id) {
         const { data: mData } = await supabase.from('masons').select('name').eq('profile_id', session.user.id).single();
         if (mData && mData.name) {
            authorName = mData.name;
         }
      }

      const payload = {
        asset_type: 'workbench_template',
        name: name.trim(),
        author: authorName,
        description: description.trim() || "A custom workbench template.",
        release_notes: releaseNotes.trim(),
        json_data: finalJson,
        language: language,
      };

      const { data: existingList, error: checkError } = await supabase
        .from('nexus_assets')
        .select('id')
        .eq('name', payload.name)
        .eq('author', payload.author)
        .eq('asset_type', payload.asset_type);

      if (checkError) throw checkError;

      if (existingList && existingList.length > 0) {
        const { error } = await supabase
          .from('nexus_assets')
          .update(payload)
          .eq('id', existingList[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('nexus_assets').insert([payload]);
        if (error) throw error;
      }
      
      pushStatus("Template successfully published to the Nexus!", "success");
      if (onChange) onChange(finalJson);
      if (onPushSuccess) onPushSuccess(name.trim(), finalJson);
      onClose();
    } catch (e: any) {
      pushStatus(e.message || "Failed to push template.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  const actions = (
    <div className="flex gap-3">
      <button 
        type="button"
        onClick={onClose}
        className={standardButtonClass}
      >
        {t("nav_cancel")}
      </button>
      <button 
        onClick={() => handleSubmit()}
        disabled={!name.trim() || isUploading}
        className={standardAccentGlassButtonClass}
      >
        {isUploading ? (
          <span className="material-symbols-outlined !text-[18px] animate-spin">{t("icon_refresh")}</span>
        ) : (
          <span className="material-symbols-outlined !text-[18px]">{t("icon_publish")}</span>
        )}
        {t("market_upload_btn")}
      </button>
    </div>
  );

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("author_push")}
      subtitle={t("upload_push_subtitle")}
      icon="cloud_upload"
      iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      widthClass="w-[500px]"
      actions={actions}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 p-4 h-full min-h-0 relative">
        
        <div className="flex flex-col gap-3 mt-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] pl-2 flex items-center gap-2">
            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">{t("icon_sync")}</span>
            {t("upload_update_existing")}
          </label>
            <CustomDropdown
              disableTint={true}
              value={selectedUpdateId}
              onChange={handleSelectUpdate}
              options={[
                { id: "new", label: "Create New Template" },
                ...existingTemplates.map(t => ({ id: t.id, label: t.name }))
              ]}
            />
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] pl-2 flex items-center gap-2">
            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">{t("icon_data_object")}</span>
            {t("upload_template_name")}
          </label>
          <div className="relative group">
            <div className="absolute inset-0 bg-[var(--accent)]/5 rounded-2xl blur-md group-focus-within:bg-[var(--accent)]/10 transition-colors pointer-events-none"></div>
            <input 
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t("upload_template_name_placeholder")}
              className="w-full relative bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-sm font-black focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] transition-all text-[var(--text)] shadow-inner placeholder-[var(--subtext)] placeholder:opacity-50"
              autoFocus
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] pl-2 flex items-center gap-2">
            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">{t("icon_settings")}</span>
            {t("upload_target_file")}
          </label>
          <div className="relative group">
            <div className="absolute inset-0 bg-[var(--accent)]/5 rounded-2xl blur-md group-focus-within:bg-[var(--accent)]/10 transition-colors pointer-events-none"></div>
            <input 
              type="text" 
              value={targetFile}
              onChange={e => setTargetFile(e.target.value)}
              placeholder={t("auto_e_g_mc_24")}
              className="w-full relative bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-3 text-sm font-black focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] transition-all text-[var(--text)] shadow-inner placeholder-[var(--subtext)] placeholder:opacity-50"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] pl-2 flex items-center gap-2">
              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">{t("icon_translate") || "translate"}</span>
              {t("tab_lexicons") || "Language"}
            </label>
            <CustomDropdown
              disableTint={true}
              value={language}
              onChange={(val: string[]) => setLanguage(val[0])}
              options={[
                { id: "English", label: "English" },
                { id: "Spanish", label: "Spanish" },
                { id: "French", label: "French" },
                { id: "German", label: "German" },
                { id: "Italian", label: "Italian" },
                { id: "Portuguese", label: "Portuguese" },
                { id: "Russian", label: "Russian" },
                { id: "Japanese", label: "Japanese" },
                { id: "Korean", label: "Korean" },
                { id: "Chinese", label: "Chinese" }
              ]}
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] pl-2 flex items-center gap-2">
              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">tag</span>
              {t("update_version") || "Version"}
            </label>
            <div className="relative group">
              <div className="absolute inset-0 bg-[var(--accent)]/5 rounded-2xl blur-md group-focus-within:bg-[var(--accent)]/10 transition-colors pointer-events-none"></div>
              <input 
                type="text" 
                value={version}
                onChange={e => {
                  const newVersion = e.target.value;
                  setVersion(newVersion);
                  if (onChange) {
                    try {
                      const parsed = JSON.parse(templateContent);
                      if (parsed.template_version !== undefined) {
                        parsed.template_version = newVersion;
                      } else {
                        parsed.version = newVersion;
                      }
                      onChange(JSON.stringify(parsed, null, 2));
                    } catch(err) {}
                  }
                }}
                placeholder="e.g. 1.0.0"
                className="w-full relative bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-3 text-sm font-black focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] transition-all text-[var(--text)] shadow-inner placeholder-[var(--subtext)] placeholder:opacity-50"
              />
            </div>
          </div>
        </div>
        
        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] pl-2 flex items-center gap-2">
            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">{t("icon_description")}</span>
            {t("upload_desc")}
          </label>
          <div className="relative group">
             <div className="absolute inset-0 bg-[var(--accent)]/5 rounded-2xl blur-md group-focus-within:bg-[var(--accent)]/10 transition-colors pointer-events-none"></div>
             <textarea 
               value={description}
               onChange={e => setDescription(e.target.value)}
               placeholder={t("upload_desc_placeholder")}
               className="w-full relative bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] transition-all min-h-[120px] text-[var(--text)] resize-none shadow-inner placeholder-[var(--subtext)] placeholder:opacity-50"
             />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] pl-2 flex items-center gap-2">
            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">campaign</span>
            {t("whats_new")}
          </label>
          <div className="relative group">
             <div className="absolute inset-0 bg-[var(--accent)]/5 rounded-2xl blur-md group-focus-within:bg-[var(--accent)]/10 transition-colors pointer-events-none"></div>
             <textarea 
               value={releaseNotes}
               onChange={e => setReleaseNotes(e.target.value)}
               placeholder={t("update_panel_no_notes")}
               className="w-full relative bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] transition-all min-h-[100px] text-[var(--text)] resize-none shadow-inner placeholder-[var(--subtext)] placeholder:opacity-50"
             />
          </div>
        </div>

        {templateContent && (() => {
           let parsed: any = null;
           try {
             parsed = typeof templateContent === 'string' ? JSON.parse(templateContent) : templateContent;
             if (Array.isArray(parsed)) parsed = parsed[0];
           } catch(e) {}
           if (!parsed) return null;
           return (
             <div className="flex flex-col gap-4 p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-2 mb-1">
                   <span className="material-symbols-outlined !text-[14px]">{t("icon_info")}</span>
                   {t("auto_detected_architecture")}
                </h4>
                <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-[10px] font-mono">
                   {parsed.template_id && (
                     <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">{t("auto_template_id")}</span>
                        <span className="text-[var(--text)] font-black truncate">{parsed.template_id}</span>
                     </div>
                   )}
                   {parsed.schema_version && (
                     <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">{t("auto_schema")}</span>
                        <span className="text-[var(--text)] font-black">{t("auto_v")}{parsed.schema_version}</span>
                     </div>
                   )}
                   {parsed.template_version && (
                     <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">{t("update_version")}</span>
                        <span className="text-[var(--text)] font-black">{parsed.template_version}</span>
                     </div>
                   )}
                   {parsed.mod_author && (
                     <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">{t("auto_mod_author")}</span>
                        <span className="text-[var(--text)] font-black truncate">{parsed.mod_author}</span>
                     </div>
                   )}
                   {parsed.parser_type && (
                     <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">{t("auto_parser")}</span>
                        <span className="text-[var(--text)] font-black uppercase">{parsed.parser_type}</span>
                     </div>
                   )}
                   {parsed.write_scope && (
                     <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">{t("auto_write_scope")}</span>
                        <span className="text-[var(--text)] font-black uppercase truncate">{parsed.write_scope}</span>
                     </div>
                   )}
                </div>
                {parsed.supported_mod_versions && Array.isArray(parsed.supported_mod_versions) && parsed.supported_mod_versions.length > 0 && (
                  <div className="flex flex-col gap-2 mt-1 pt-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                     <span className="text-[var(--subtext)] opacity-60 text-[9px] font-mono">{t("auto_supported_versions")}</span>
                     <div className="flex flex-wrap gap-2">
                       {parsed.supported_mod_versions.map((v: string) => (
                         <span key={v} className="px-2 py-1 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-md text-[9px] font-black text-[var(--text)]">{v}</span>
                       ))}
                     </div>
                  </div>
                )}
             </div>
           );
        })()}

        <div className="flex flex-col gap-3 relative z-[60]">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] pl-2 flex items-center gap-2">
            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">{t("auto_extension")}</span>
            {t("upload_attach_mod")}
          </label>
            <CustomDropdown
              disableTint={true}
              value={attachedMod}
              onChange={(val: any) => setAttachedMod(val[0] || "")}
              options={[
                { id: "", label: t("upload_attach_mod_none") },
                ...modList.filter((m: any) => !m.isVirtual && !m.name?.startsWith('FOLDER_') && !m.name?.startsWith('SET_') && !m.name?.startsWith('LOCAL_SET_')).map((mod: any) => ({
                  id: mod.name || mod.id,
                  label: mod.displayName || mod.name || "Unknown Mod"
                }))
              ]}
              placeholder={t("auto_select_a_mod")}
              searchable={true}
            />
        </div>
      </form>
    </SidePanel>
  );
}
