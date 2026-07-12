import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { CustomDropdown, ModSearchDropdown, SidePanel, standardButtonClass, standardAccentGlassButtonClass , getExtensionRegex} from "../shared";
import { useStore } from "../store";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";

export default function SupportDeskSidePanel({
 isOpen, onClose, preselectedType }: { isOpen: boolean; onClose: () => void; preselectedType?: string }) {
  const activeGameSchema = useStore(state => state.activeGameSchema);
  const { t } = useLexicon();
  const modList = useStore((state) => state.modList);
  const [type, setType] = useState(preselectedType || "BUG_MOD");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetModId, setTargetModId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [logs, setLogs] = useState("");
  const [customFieldsData, setCustomFieldsData] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<any[]>([]);
  const [telemetrySources, setTelemetrySources] = useState<any[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [policyViolations, setPolicyViolations] = useState<string[]>([]);
  const [optedOutSources, setOptedOutSources] = useState<string[]>([]);
  const session = useStore((state) => state.session);
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState("");

  useEffect(() => {
    if (!isOpen) return;
      const fetchData = async () => {
        setLoadingCats(true);
        const [{ data: cats }, { data: sources }] = await Promise.all([
          supabase.from('sanctuary_support_categories').select('*').eq('is_active', true).order('category_name', { ascending: true }),
          supabase.from('sanctuary_telemetry_sources').select('*').eq('is_active', true)
        ]);
        if (session?.user?.id) {
           const { data: profile } = await supabase.from('profiles').select('is_comm_banned, comm_blacklist_reason').eq('id', session.user.id).single();
           if (profile?.is_comm_banned) {
              setIsBanned(true);
              setBanReason(profile.comm_blacklist_reason || "You have been banned from submitting support tickets.");
           }
        }
        if (cats && cats.length > 0) {
          setCategories(cats);
          if (!preselectedType) setType(cats[0].category_code);
          setCustomFieldsData({});
        }
        if (sources) {
          setTelemetrySources(sources);
        }
        setLoadingCats(false);
      };
      fetchData();
  }, [isOpen, preselectedType]);

  const activeCategory = categories.find(c => c.category_code === type);

  const submitTicket = async () => {
    if (String(activeCategory?.show_title_box) !== "false" && !title) return setError(t("support_error_fields"));
    if (String(activeCategory?.show_description_box) !== "false" && !description) return setError(t("support_error_fields"));

    if (activeCategory?.custom_fields) {
      for (const field of activeCategory.custom_fields) {
        if (field.required) {
          const val = customFieldsData[field.id];
          if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
            return setError(t("support_error_fields"));
          }
        }
      }
    }
    setIsSubmitting(true);
    setError("");
    setPolicyViolations([]);

    try {
      const storeState = useStore.getState();
      const activeSet = storeState.playSets[storeState.activePlaySetIndex];

      let hasViolations = false;
      let violations: string[] = [];
      if (activeCategory?.requires_target_mod && targetModId) {
          const m = storeState.modList.find(ml => ml.id === targetModId);
          if (m && m.compliance_tier >= 1 && m.compliance_tier <= 3) {
              hasViolations = true;
              violations.push(m.displayName || m.name);
          }
      }
      if (activeCategory?.requires_target_mod && activeSet && activeSet.mods) {
          activeSet.mods.forEach((modName: string) => {
              const exactMatch = storeState.modList.find((ml: any) => ml.name === modName || ml.displayName === modName);
              if (exactMatch && exactMatch.compliance_tier >= 1 && exactMatch.compliance_tier <= 3) {
                  hasViolations = true;
                  violations.push(exactMatch.displayName || exactMatch.name);
                  return;
              }
              
              const fallbackMatch = storeState.modList.find((ml: any) => {
                 const mBase = ml.name?.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
                 const targetBase = modName.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
                 return mBase && targetBase && mBase === targetBase;
              });
              if (fallbackMatch && fallbackMatch.compliance_tier >= 1 && fallbackMatch.compliance_tier <= 3) {
                  hasViolations = true;
                  violations.push(fallbackMatch.displayName || fallbackMatch.name);
              }
          });
      }

      if (hasViolations && activeCategory?.requires_target_mod) {
          invoke("write_os_log", { message: "Support ticket submitted with policy violations: " + violations.join(", "), level: "WARNING" }).catch(console.error);
      }

      let finalLogs = logs;

      if (activeCategory?.telemetry_config?.sources) {
        const modsPath = useStore.getState().modsPath;
        const sourceIds = activeCategory.telemetry_config.sources;
        const activeSources = telemetrySources.filter(s => sourceIds.includes(s.id) && !optedOutSources.includes(s.id));
        
        for (const source of activeSources) {
          try {
            if (source.type === 'OS') {
                const sysInfo = await invoke<string>("get_system_info");
                const storeState = useStore.getState();
                const activeSet = storeState.playSets[storeState.activePlaySetIndex];

                const netUpdates = storeState.networkUpdates;
                const totalUpdates = (netUpdates?.broken?.length || 0) + (netUpdates?.obsolete?.length || 0) + (netUpdates?.updated?.length || 0);
                
                const diagnostics = `\nDisplay Resolution: ${window.innerWidth}x${window.innerHeight}\nUser Agent: ${navigator.userAgent}\nMods Path: ${storeState.modsPath}\nActive Blueprint: ${activeSet?.name || "None"}\nActive Mods: ${activeSet?.mods?.length || 0}\nPending Network Updates: ${totalUpdates}\nCaptured At: ${new Date().toLocaleString()}\nDiagnostic Bundle Version: 1.0.0\n`;
                finalLogs += `\n--- TELEMETRY: ${source.label} (OS) ---\n` + sysInfo + diagnostics + "\n";

                if (activeSet) {
                    const bpPayload = JSON.stringify({ sanctuary_profile: true, ...activeSet }, null, 2);
                    finalLogs += `\n--- TELEMETRY: Attached Blueprint ---\n${bpPayload}\n`;
                }

                const systemLogHistory = storeState.statusLog.map(entry => {
                    return `[${new Date(entry.timestamp).toISOString()}] [${entry.type.toUpperCase()}] ${entry.message}`;
                }).join('\n');
                finalLogs += `\n--- TELEMETRY: System Log History ---\n${systemLogHistory || "No system logs available."}\n`;
            } else {
                const docDirMatch = modsPath.match(/(.*)[\\/]+mods[\\/]*$/i);
                const docDir = docDirMatch ? docDirMatch[1] : modsPath;
                let searchPath = source.search_path.replace('%MODS_DIR%', modsPath).replace('%DOC_DIR%', docDir);
                const isPatternIncludedInPath = source.file_pattern.includes('/');
                let fullPath = searchPath;
                if (!fullPath.endsWith('\\') && !fullPath.endsWith('/')) fullPath += '/';
                fullPath += source.file_pattern;

                const text = await readTextFile(fullPath);
                if (text) {
                   finalLogs += `\n--- TELEMETRY: ${source.label} ---\n` + text.substring(0, 10000) + "\n";
                }
            }
          } catch (e) {
          }
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error(t("auto_guest_mode_active_uploads_and_global_fla"));
      }

      const { data: profile } = await supabase.from('profiles').select('is_comm_banned, comm_blacklist_reason').eq('id', user.id).single();
      if (profile?.is_comm_banned) {
        throw new Error(`Communications Ban: ${profile.comm_blacklist_reason || "You have been banned from submitting support tickets."}`);
      }

      if (activeSet && type.toLowerCase().includes('bug') && !finalLogs.includes('--- TELEMETRY: Attached Blueprint ---')) {
          const bpPayload = JSON.stringify({ sanctuary_profile: true, ...activeSet }, null, 2);
          finalLogs += `\n--- TELEMETRY: Attached Blueprint ---\n${bpPayload}\n`;
      }

      const { error } = await supabase.from('sanctuary_tickets').insert([{
        author_id: user.id,
        ticket_type: type,
        title: title || (activeCategory?.category_name || "Support Ticket"),
        description: description || "No description provided.",
        status: "open",
        metadata: {
          target_mod_id: activeCategory?.requires_target_mod ? (targetModId || null) : null,
          target_user_id: activeCategory?.requires_target_user ? (targetUserId || null) : null,
          logs: finalLogs || null,
          custom_fields: customFieldsData,
          ...(hasViolations && activeCategory?.requires_target_mod ? { restricted_violations: [...new Set(violations)] } : {})
        }
      }]);

      if (error) throw error;
      
      useStore.getState().pushStatus(t("ss_support_success"), "success");
      onClose();
    } catch (e: any) {
      setError(e.message);
      useStore.getState().pushStatus(e.message, "error");
      invoke("write_os_log", { message: "Support ticket submission failed: " + e.message, level: "ERROR" }).catch(console.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const attachLog = async () => {
    try {
      const path = await open({ multiple: false, filters: [{ name: 'Log', extensions: ['txt', 'log'] }] });
      if (path && typeof path === 'string') {
        const text = await readTextFile(path);
        setLogs(prev => prev + "\n--- Log Attachment ---\n" + text.substring(0, 10000));
      }
    } catch (err: any) {
      console.error(err);
      useStore.getState().pushStatus(t("support_err_read_log"), "error");
    }
  };

  if (!isOpen) return null;

  if (!session || isBanned) {
    return (
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("support_title")}
        subtitle={t("sidebar_support")}
        icon={t("icon_support_agent")}
        widthClass="w-[600px]"
        backdropZ="z-[50000]"
        panelZ="z-[50001]"
      >
        <div className="flex flex-col gap-8 items-center justify-center py-20 text-center animate-in fade-in duration-500">
          <div className="w-24 h-24 rounded-[var(--radius)] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex items-center justify-center mb-4">
            <span className="material-symbols-outlined !text-[48px] text-[var(--text)] opacity-50">{t("icon_lock")}</span>
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tighter text-[var(--text)]">{t("access_denied")}</h2>
          <p className="text-xs font-black text-[var(--subtext)] uppercase tracking-widest">{isBanned ? `Communications Ban: ${banReason}` : t("auto_guest_mode_active_uploads_and_global_fla")}</p>
        </div>
      </SidePanel>
    );
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("support_title")}
      subtitle={t("sidebar_support")}
      icon={t("icon_support_agent")}
      widthClass="w-[600px]"
      backdropZ="z-[50000]"
      panelZ="z-[50001]"
      footer={
        <div className="flex flex-row items-center justify-center gap-4 w-full">
           <button onClick={onClose} className={standardButtonClass}>
             {t("shared_cancel")}
           </button>
           <button onClick={submitTicket} disabled={isSubmitting} className={`${standardAccentGlassButtonClass} disabled:opacity-50`}>
             {isSubmitting ? (t("scanning")) : (t("support_submit"))}
           </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 relative">
        {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl flex flex-col overflow-hidden relative shadow-[0_0_30px_rgba(244,63,94,0.15)] group mt-2">
                <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent pointer-events-none" />
                <div className="flex items-start gap-4 p-5 relative z-10">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center shrink-0 border border-rose-500/30 text-rose-400">
                        <span className="material-symbols-outlined !text-[20px]">{t("icon_warning")}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 pt-0.5 w-full pr-8">
                        <span className="text-sm font-black text-rose-400 tracking-wide">{t("support_err_failed")}</span>
                        <span className="text-xs font-bold text-rose-200/80 leading-relaxed pr-4">{error}</span>
                    </div>
                    <button 
                      onClick={() => { setError(""); setPolicyViolations([]); }} 
                      className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-rose-400/50 hover:text-rose-400 hover:bg-rose-500/20 transition-all shrink-0"
                    >
                      <span className="material-symbols-outlined !text-[18px]">{t("icon_close")}</span>
                    </button>
                </div>
                {policyViolations.length > 0 && (
                    <div className="bg-black/30 p-4 border-t border-rose-500/20 flex flex-col gap-3 max-h-32 overflow-y-auto custom-scrollbar relative z-10">
                        <span className="text-[9px] font-black tracking-widest text-rose-400/80 uppercase">{t("auto_restricted_artifacts_detected")}</span>
                        <div className="flex flex-col gap-2">
                            {policyViolations.map((mod, i) => (
                                <div key={i} className="flex items-center gap-2 text-rose-200/90 text-[10px] font-mono bg-rose-500/10 py-1.5 px-3 rounded-md border border-rose-500/20">
                                    <span className="material-symbols-outlined !text-[12px] opacity-70">{t("auto_extension")}</span>
                                    <span className="truncate">{mod.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').replace(/[-_]/g, ' ') || mod.replace(/[-_]/g, ' ')}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}

          <div className="flex flex-col gap-2 relative z-[70]">
            <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("support_category")}</label>
            <CustomDropdown disableTint={true}  
              value={type}
              options={categories.map(c => ({ id: c.category_code, label: c.category_name }))}
              onChange={(v: string[]) => setType(v[0])}
            />
          </div>

          {String(activeCategory?.show_title_box) !== "false" && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("support_ticket_title")}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                placeholder={t("support_placeholder_title")}
              />
            </div>
          )}

          {activeCategory?.requires_target_mod && (
            <div className="flex flex-col gap-2 relative z-[60]">
              <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("support_target_mod_label")}</label>
              <ModSearchDropdown
                modList={modList}
                placeholder={t("support_placeholder_mod_uuid")}
                selectedItem={modList.find((m: any) => m.id === targetModId || m.hash === targetModId) || (targetModId ? { displayName: targetModId } : null)}
                onSelect={(m: any) => setTargetModId(m.id || m.hash)}
                onClear={() => setTargetModId("")}
              />
            </div>
          )}

          {activeCategory?.requires_target_user && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("support_target_user_label")}</label>
              <input
                type="text"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                placeholder={t("support_placeholder_user_uuid")}
              />
            </div>
          )}

          {String(activeCategory?.show_description_box) !== "false" && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex justify-between">
                <span>{t("support_desc")}</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all h-32 resize-none custom-scrollbar"
                placeholder={t("support_placeholder_desc")}
              />
            </div>
          )}

          {activeCategory?.custom_fields?.map((field: any) => (
            <div key={field.id} className="flex flex-col gap-2 relative z-[50]">
              <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2">
                {field.label}
                {field.required && <span className="text-[var(--danger)]">*</span>}
              </label>
              
              {field.type === "TEXT INPUT" && (
                <input
                  type="text"
                  value={customFieldsData[field.id] || ""}
                  onChange={(e) => setCustomFieldsData(prev => ({ ...prev, [field.id]: e.target.value }))}
                  className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                />
              )}
              
              {field.type === "TEXTAREA" && (
                <textarea
                  value={customFieldsData[field.id] || ""}
                  onChange={(e) => setCustomFieldsData(prev => ({ ...prev, [field.id]: e.target.value }))}
                  className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all h-24 resize-none custom-scrollbar"
                />
              )}
              
              {field.type === "DROPDOWN" && (
                <CustomDropdown disableTint={true}  
                  value={customFieldsData[field.id] || (field.allow_multi_select ? [] : "")}
                  options={(field.options || []).map((o: string) => ({ id: o, label: o }))}
                  onChange={(v: string[]) => setCustomFieldsData(prev => ({ ...prev, [field.id]: field.allow_multi_select ? v : v[0] }))}
                  allowMultiSelect={field.allow_multi_select}
                />
              )}
              
              {field.type === "CHECKBOX" && (!field.options || field.options.length === 0) && (
                <button
                  onClick={() => setCustomFieldsData(prev => ({ ...prev, [field.id]: prev[field.id] === "true" ? "false" : "true" }))}
                  className={`w-12 h-6 rounded-full transition-all flex items-center px-1 overflow-hidden relative border ${customFieldsData[field.id] === "true" ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[inset_0_0_10px_color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'bg-black/40 border-white/10 hover:border-white/30'}`}
                >
                  <div className={`w-4 h-4 rounded-full shadow-md transition-all ${customFieldsData[field.id] === "true" ? 'translate-x-6 bg-[var(--accent)]' : 'translate-x-0 bg-white/50'}`} />
                </button>
              )}

              {field.type === "CHECKBOX" && field.options && field.options.length > 0 && (
                <div className="flex flex-col gap-2">
                  {field.options.map((opt: string) => {
                    const isMulti = field.allow_multi_select;
                    const currentValue = customFieldsData[field.id];
                    const isChecked = isMulti 
                      ? (Array.isArray(currentValue) ? currentValue : ([] as string[])).includes(opt)
                      : currentValue === opt;

                    return (
                      <label key={opt} className={`flex items-center gap-4 cursor-pointer group rounded-2xl px-5 py-4 transition-all border backdrop-blur-xl shadow-xl overflow-hidden relative ${isChecked ? 'theme-glass-panel border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(var(--accent-rgb),0.1)]' : 'theme-glass-inner border-white/5 hover:border-white/10 hover:bg-white/5'}`}>
                         <div className={`w-6 h-6 rounded-[0.4rem] flex items-center justify-center border transition-all shrink-0 backdrop-blur-md shadow-inner relative z-10 ${isChecked ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border-[var(--accent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)]' : 'bg-black/20 border-white/10 group-hover:border-white/30 group-hover:bg-black/30'}`}>
                           {isChecked && <span className="material-symbols-outlined !text-[16px] text-white font-black drop-shadow-md">{t("icon_check")}</span>}
                         </div>
                         <span className={`text-sm font-bold transition-colors ${isChecked ? 'text-[var(--text)]' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>{opt}</span>
                         <input
                           type="checkbox"
                           className="hidden"
                           checked={isChecked}
                           onChange={() => {
                             setCustomFieldsData(prev => {
                                if (isMulti) {
                                  const arr = (Array.isArray(prev[field.id]) ? prev[field.id] : []) as string[];
                                  if (arr.includes(opt)) {
                                    return { ...prev, [field.id]: arr.filter((x: string) => x !== opt) };
                                  } else {
                                    return { ...prev, [field.id]: [...arr, opt] };
                                  }
                                } else {
                                  return { ...prev, [field.id]: isChecked ? "" : opt };
                                }
                             });
                           }}
                         />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {activeCategory?.telemetry_config?.sources && activeCategory.telemetry_config.sources.length > 0 && (
             <div className="flex flex-col gap-2 relative z-[50]">
               <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("support_telemetry_opt")}</label>
               <div className="flex flex-col gap-2">
                 {activeCategory.telemetry_config.sources.map((sourceId: string) => {
                   const source = telemetrySources.find(s => s.id === sourceId);
                   if (!source) return null;
                   const isOptedOut = optedOutSources.includes(sourceId);
                   return (
                      <label key={sourceId} className={`flex items-center gap-4 cursor-pointer group rounded-2xl px-5 py-4 transition-all border backdrop-blur-xl shadow-xl overflow-hidden relative ${!isOptedOut ? 'theme-glass-panel border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(var(--accent-rgb),0.1)]' : 'theme-glass-inner border-white/5 hover:border-white/10 hover:bg-white/5'}`}>
                         <div className={`w-6 h-6 rounded-[0.4rem] flex items-center justify-center border transition-all shrink-0 backdrop-blur-md shadow-inner relative z-10 ${!isOptedOut ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border-[var(--accent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)]' : 'bg-black/20 border-white/10 group-hover:border-white/30 group-hover:bg-black/30'}`}>
                           {!isOptedOut && <span className="material-symbols-outlined !text-[16px] text-white font-black drop-shadow-md">{t("icon_check")}</span>}
                         </div>
                         <div className="flex flex-col">
                           <span className={`text-sm font-bold transition-colors ${!isOptedOut ? 'text-[var(--text)]' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>{source.label}</span>
                           <span className="text-[10px] font-bold opacity-50">{source.description || source.file_pattern}</span>
                         </div>
                         <input
                           type="checkbox"
                           className="hidden"
                           checked={!isOptedOut}
                           onChange={(e) => {
                             if (e.target.checked) {
                               setOptedOutSources(prev => prev.filter(id => id !== sourceId));
                             } else {
                               setOptedOutSources(prev => [...prev, sourceId]);
                             }
                           }}
                         />
                      </label>
                   )
                 })}
               </div>
             </div>
          )}

          {String(activeCategory?.show_logs_box) !== "false" && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex justify-between items-center">
                <span>{t("support_logs")}</span>
                <button onClick={attachLog} className="text-[var(--accent)] hover:opacity-80 transition-opacity flex items-center gap-1">
                  <span>+ {t("support_attach_log")}</span>
                </button>
              </label>
              <textarea
                value={logs}
                onChange={(e) => setLogs(e.target.value)}
                className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-[10px] font-mono focus:outline-none focus:theme-border-accent transition-all h-24 resize-none custom-scrollbar whitespace-pre-wrap"
                placeholder={t("support_placeholder_logs")}
              />
            </div>
          )}
      </div>
    </SidePanel>
  );
}
