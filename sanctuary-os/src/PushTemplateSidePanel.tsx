import React, { useState } from 'react';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { SidePanel, CustomDropdown, standardButtonClass, standardAccentGlassButtonClass } from './shared';

export function PushTemplateSidePanel({ 
  isOpen, 
  onClose, 
  templateContent, 
  initialName = "" 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  templateContent: string;
  initialName?: string;
}) {
  const { t } = useLexicon();
  const pushStatus = useStore(state => state.pushStatus);
  const session = useStore(state => state.session);
  const modList = useStore((state) => state.modList) || [];
  const [isUploading, setIsUploading] = useState(false);
  
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [attachedMod, setAttachedMod] = useState("");
  const [targetFile, setTargetFile] = useState("");
  const [existingTemplates, setExistingTemplates] = useState<any[]>([]);
  const [selectedUpdateId, setSelectedUpdateId] = useState<string>("new");

  React.useEffect(() => {
     try {
        const parsed = JSON.parse(templateContent);
        if (parsed.target_file) setTargetFile(parsed.target_file);
     } catch(e) {}
  }, [templateContent]);

  React.useEffect(() => {
      const fetchTemplates = async () => {
         if (!session?.user?.id) return;
         let authorName = session.user.user_metadata?.username || 'Citizen';
         let fallbackName = session.user.user_metadata?.username || 'Citizen';
         const { data: mData } = await supabase.from('masons').select('name').eq('profile_id', session.user.id).single();
         if (mData && mData.name) authorName = mData.name;
         
         const { data } = await supabase
            .from('marketplace_assets')
            .select('*')
            .or(`author.ilike.%${authorName}%,author.ilike.%Citizen%,author.ilike.%Sanctuary%,author.ilike.%${fallbackName}%`)
            .eq('asset_type', 'workbench_template');
         if (data) setExistingTemplates(data);
      };
      fetchTemplates();
  }, [session]);

  const handleSelectUpdate = (val: string[]) => {
      const id = val[0];
      setSelectedUpdateId(id);
      if (id === "new") {
          setName(initialName);
          setDescription("");
      } else {
          const tmpl = existingTemplates.find(t => t.id === id);
          if (tmpl) {
              setName(tmpl.name || "");
              setDescription(tmpl.description || "");
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
        finalJson = JSON.stringify(parsed);
      } catch (err) {
        throw new Error(t("market_upload_invalid_json") || "Invalid JSON. Please fix syntax errors before uploading.");
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
        json_data: finalJson,
      };

      const { data: existingList, error: checkError } = await supabase
        .from('marketplace_assets')
        .select('id')
        .eq('name', payload.name)
        .eq('author', payload.author)
        .eq('asset_type', payload.asset_type);

      if (checkError) throw checkError;

      if (existingList && existingList.length > 0) {
        const { error } = await supabase
          .from('marketplace_assets')
          .update(payload)
          .eq('id', existingList[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('marketplace_assets').insert([payload]);
        if (error) throw error;
      }
      
      pushStatus("Template successfully published to the Nexus!", "success");
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
        {t("market_upload_cancel") || "CANCEL"}
      </button>
      <button 
        onClick={() => handleSubmit()}
        disabled={!name.trim() || isUploading}
        className={standardAccentGlassButtonClass}
      >
        {isUploading ? (
          <span className="material-symbols-outlined !text-[18px] animate-spin">refresh</span>
        ) : (
          <span className="material-symbols-outlined !text-[18px]">publish</span>
        )}
        {t("market_upload_btn") || "PUBLISH"}
      </button>
    </div>
  );

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("market_upload_push_title") || "PUSH TO NEXUS"}
      subtitle={t("market_upload_push_subtitle") || "Publish your template to the global Nexus to share it with the community."}
      icon="cloud_upload"
      iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      widthClass="w-[500px]"
      actions={actions}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 p-4 h-full min-h-0 relative">
        
        <div className="flex flex-col gap-3 mt-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] pl-2 flex items-center gap-2">
            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">sync</span>
            {t("market_upload_update_existing") || "UPDATE EXISTING (OPTIONAL)"}
          </label>
          <div className="theme-glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner p-1">
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
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] pl-2 flex items-center gap-2">
            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">data_object</span>
            {t("market_upload_template_name") || "Template Name"}
          </label>
          <div className="relative group">
            <div className="absolute inset-0 bg-[var(--accent)]/5 rounded-2xl blur-md group-focus-within:bg-[var(--accent)]/10 transition-colors pointer-events-none"></div>
            <input 
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t("market_upload_template_name_placeholder") || "e.g. My Custom Settings Template"}
              className="w-full relative bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-sm font-black focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] transition-all text-[var(--text)] shadow-inner placeholder-[var(--subtext)] placeholder:opacity-50"
              autoFocus
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] pl-2 flex items-center gap-2">
            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">settings</span>
            {t("market_upload_target_file") || "TARGET CONFIG FILE"}
          </label>
          <div className="relative group">
            <div className="absolute inset-0 bg-[var(--accent)]/5 rounded-2xl blur-md group-focus-within:bg-[var(--accent)]/10 transition-colors pointer-events-none"></div>
            <input 
              type="text" 
              value={targetFile}
              onChange={e => setTargetFile(e.target.value)}
              placeholder="e.g. mc_settings.cfg"
              className="w-full relative bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-3 text-sm font-black focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] transition-all text-[var(--text)] shadow-inner placeholder-[var(--subtext)] placeholder:opacity-50"
            />
          </div>
        </div>
        
        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] pl-2 flex items-center gap-2">
            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">description</span>
            {t("market_upload_desc") || "Description"}
          </label>
          <div className="relative group">
             <div className="absolute inset-0 bg-[var(--accent)]/5 rounded-2xl blur-md group-focus-within:bg-[var(--accent)]/10 transition-colors pointer-events-none"></div>
             <textarea 
               value={description}
               onChange={e => setDescription(e.target.value)}
               placeholder={t("market_upload_desc_placeholder") || "Describe what this template configures..."}
               className="w-full relative bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] transition-all min-h-[120px] text-[var(--text)] resize-none shadow-inner placeholder-[var(--subtext)] placeholder:opacity-50"
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
                   <span className="material-symbols-outlined !text-[14px]">info</span>
                   Detected Architecture
                </h4>
                <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-[10px] font-mono">
                   {parsed.template_id && (
                     <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">TEMPLATE ID</span>
                        <span className="text-[var(--text)] font-black truncate">{parsed.template_id}</span>
                     </div>
                   )}
                   {parsed.schema_version && (
                     <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">SCHEMA</span>
                        <span className="text-[var(--text)] font-black">v{parsed.schema_version}</span>
                     </div>
                   )}
                   {parsed.template_version && (
                     <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">VERSION</span>
                        <span className="text-[var(--text)] font-black">{parsed.template_version}</span>
                     </div>
                   )}
                   {parsed.mod_author && (
                     <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">MOD AUTHOR</span>
                        <span className="text-[var(--text)] font-black truncate">{parsed.mod_author}</span>
                     </div>
                   )}
                   {parsed.parser_type && (
                     <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">PARSER</span>
                        <span className="text-[var(--text)] font-black uppercase">{parsed.parser_type}</span>
                     </div>
                   )}
                   {parsed.write_scope && (
                     <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">WRITE SCOPE</span>
                        <span className="text-[var(--text)] font-black uppercase truncate">{parsed.write_scope}</span>
                     </div>
                   )}
                </div>
                {parsed.supported_mod_versions && Array.isArray(parsed.supported_mod_versions) && parsed.supported_mod_versions.length > 0 && (
                  <div className="flex flex-col gap-2 mt-1 pt-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                     <span className="text-[var(--subtext)] opacity-60 text-[9px] font-mono">SUPPORTED VERSIONS</span>
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
            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">extension</span>
            {t("market_upload_attach_mod") || "ATTACH TO ARTIFACT (OPTIONAL)"}
          </label>
          <div className="theme-glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner p-1">
            <CustomDropdown
              disableTint={true}
              value={attachedMod}
              onChange={(val: any) => setAttachedMod(val[0] || "")}
              options={[
                { id: "", label: t("market_upload_attach_mod_none") || "None" },
                ...modList.filter((m: any) => !m.isVirtual && !m.name?.startsWith('FOLDER_') && !m.name?.startsWith('SET_') && !m.name?.startsWith('LOCAL_SET_')).map((mod: any) => ({
                  id: mod.name || mod.id,
                  label: mod.displayName || mod.name || "Unknown Mod"
                }))
              ]}
              placeholder="Select a Mod"
              searchable={true}
            />
          </div>
        </div>
      </form>
    </SidePanel>
  );
}
