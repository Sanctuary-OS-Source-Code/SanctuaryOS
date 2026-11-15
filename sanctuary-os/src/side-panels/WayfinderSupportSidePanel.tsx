import { useState, useEffect } from "react";
import { supabase, supabaseAuth } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { CustomDropdown, SidePanel, SidePanelHeroCard, SidePanelPillToggle, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { useStore } from "../store";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { scrubLogUserData } from "../utils/logScrubber";

export default function WayfinderSupportSidePanel({
 isOpen, onClose, preselectedType }: { isOpen: boolean; onClose: () => void; preselectedType?: string }) {
  const { t } = useLexicon();
  const [type, setType] = useState(preselectedType || "BUG_MOD");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [logs, setLogs] = useState("");
  const [customFieldsData, setCustomFieldsData] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<any[]>([]);
  const [telemetrySources, setTelemetrySources] = useState<any[]>([]);
  const [, setLoadingCats] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [optedOutSources, setOptedOutSources] = useState<string[]>([]);
  const session = useStore((state) => state.session);
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState("");

  useEffect(() => {
    if (!isOpen) return;
      const fetchData = async () => {
        setLoadingCats(true);
        const [{ data: cats }, { data: sources }] = await Promise.all([
          supabaseAuth.from('keeper_support_categories').select('*').eq('is_active', true).order('category_name', { ascending: true }),
          supabase.from('sanctuary_telemetry_sources').select('*').eq('is_active', true)
        ]);
        if (session?.user?.id) {
           const { data: profile } = await supabase.from('profiles').select('is_comm_banned, comm_blacklist_reason').eq('id', session.user.id).single();
           if (profile?.is_comm_banned) {
              setIsBanned(true);
              setBanReason(profile.comm_blacklist_reason || t("support_banned_default", "You have been banned from submitting support tickets."));
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
    if (String(activeCategory?.show_title_box) !== "false" && !title) return setError(t("support_error_fields", "Please fill out all required fields."));
    if (String(activeCategory?.show_description_box) !== "false" && !description) return setError(t("support_error_fields", "Please fill out all required fields."));

    if (activeCategory?.custom_fields) {
      for (const field of activeCategory.custom_fields) {
        if (field.required) {
          const val = customFieldsData[field.id];
          if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
            return setError(t("support_error_fields", "Please fill out all required fields."));
          }
        }
      }
    }
    setIsSubmitting(true);
    setError("");

    try {
      let finalLogs = scrubLogUserData(logs);

      if (activeCategory?.telemetry_config?.sources) {
        const modsPath = useStore.getState().modsPath;
        const sourceIds = activeCategory.telemetry_config.sources;
        const activeSources = telemetrySources.filter(s => sourceIds.includes(s.id) && !optedOutSources.includes(s.id));
        
        for (const source of activeSources) {
          try {
            if (source.type === 'OS') {
                const sysInfo = scrubLogUserData(await invoke<string>("get_system_info"));
                const storeState = useStore.getState();
                const diagnostics = scrubLogUserData(`\nDisplay Resolution: ${window.innerWidth}x${window.innerHeight}\nCaptured At: ${new Date().toLocaleString()}\nDiagnostic Bundle Version: 1.0.0\n`);
                finalLogs += `\n--- TELEMETRY: ${source.label} (OS) ---\n` + sysInfo + diagnostics + "\n";

                const systemLogHistory = storeState.statusLog.map(entry => {
                    return `[${new Date(entry.timestamp).toISOString()}] [${entry.type.toUpperCase()}] ${scrubLogUserData(entry.message)}`;
                }).join('\n');
                finalLogs += `\n--- TELEMETRY: System Log History ---\n${systemLogHistory || "No system logs available."}\n`;
            } else if (modsPath && source.search_path && source.file_pattern) {
                const docDirMatch = modsPath.match(/(.*)[\\/]+(?:mods|data|_mods)[\\/]*$/i);
                const docDir = docDirMatch
                  ? docDirMatch[1]
                  : modsPath.replace(/[\\/]+[^\\/]+[\\/]*$/, "") || modsPath;
                let searchPath = source.search_path.replace('%MODS_DIR%', modsPath).replace('%DOC_DIR%', docDir);
                let fullPath = searchPath;
                if (!fullPath.endsWith('\\') && !fullPath.endsWith('/')) fullPath += '/';
                fullPath += source.file_pattern;

                const text = await readTextFile(fullPath);
                if (text) {
                   finalLogs += `\n--- TELEMETRY: ${source.label} ---\n` + scrubLogUserData(text.substring(0, 10000)) + "\n";
                }
            }
          } catch {}
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error(t("auto_guest_mode_active_45", "Guest Mode Active"));
      }

      const { data: profile } = await supabase.from('profiles').select('is_comm_banned, comm_blacklist_reason').eq('id', user.id).single();
      if (profile?.is_comm_banned) {
        throw new Error(`Communications Ban: ${profile.comm_blacklist_reason || t("support_banned_default", "You have been banned from submitting support tickets.")}`);
      }

      const scrubbedCustomFields: Record<string, string> = {};
      for (const [k, v] of Object.entries(customFieldsData || {})) {
        scrubbedCustomFields[k] = scrubLogUserData(String(v || ""));
      }

      const { error } = await supabaseAuth.from('keeper_tickets').insert([{
        author_id: user.id,
        ticket_type: type,
        title: scrubLogUserData(title) || (activeCategory?.category_name || "Support Ticket"),
        description: scrubLogUserData(description) || "No description provided.",
        status: "open",
        metadata: {
          target_user_id: activeCategory?.requires_target_user ? (targetUserId || null) : null,
          logs: scrubLogUserData(finalLogs) || null,
          custom_fields: scrubbedCustomFields,
        }
      }]);

      if (error) throw error;
      
      useStore.getState().pushStatus(t("ss_support_success", "Ticket sent successfully"), "success");
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
        const scrubbedText = scrubLogUserData(text.substring(0, 10000));
        setLogs(prev => prev + "\n--- Log Attachment ---\n" + scrubbedText);
      }
    } catch (err: any) {
      console.error(err);
      useStore.getState().pushStatus(t("support_err_read_log", "Failed to read log"), "error");
    }
  };

  if (!session || isBanned) {
    return (
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("wf_keeper_support_title", "Keeper Escalation Support")}
        subtitle={t("wf_keeper_support_subtitle", "Direct escalation channel to Sanctuary Foundry Keepers")}
        icon={t("icon_admin_panel_settings", "admin_panel_settings")}
        iconColorClass="text-[var(--danger)]"
        widthClass="w-[90vw] md:w-[680px]"
        backdropZ="z-[50000]"
        panelZ="z-[50001]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_lock", "lock")}
            overline={t("wf_keeper_support_title", "Keeper Escalation Support")}
            title={t("access_denied", "Access Denied")}
            description={isBanned ? `Communications Ban: ${banReason}` : t("auto_guest_mode_active_45", "Please sign in to submit support tickets.")}
            variant="danger"
          />
        </div>
      </SidePanel>
    );
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("wf_keeper_support_title", "Keeper Escalation Support")}
      subtitle={t("wf_keeper_support_subtitle", "Direct escalation channel to Sanctuary Foundry Keepers")}
      icon={t("icon_admin_panel_settings", "admin_panel_settings")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      backdropZ="z-[50000]"
      panelZ="z-[50001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_send", "send")}
            tooltip={isSubmitting ? t("scanning", "Submitting...") : t("support_submit", "Submit Ticket")}
            variant="accent"
            disabled={isSubmitting}
            onClick={submitTicket}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_admin_panel_settings", "admin_panel_settings")}
          overline={t("wf_keeper_support_title", "Wayfinder → Keeper Escalation")}
          title={activeCategory?.category_name || t("wf_keeper_support_title", "Keeper Support Ticket")}
          description={activeCategory?.description || t("wf_keeper_support_subtitle", "Submit a direct escalation ticket to Sanctuary Foundry Keepers.")}
          badge={type}
          variant="accent"
        />
        {error && (
            <div className="glass-panel border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-2xl flex flex-col overflow-hidden relative shadow-md group mt-2">
                <div className="flex items-start gap-4 p-5 relative z-10">
                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--danger)]">
                        <span className="material-symbols-outlined !text-[20px]">{t("icon_warning", "warning")}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 pt-0.5 w-full pr-8">
                        <span className="text-sm font-black text-[var(--danger)] tracking-wide">{t("support_err_failed", "Submission Failed")}</span>
                        <span className="text-xs font-bold text-[color-mix(in_srgb,var(--danger)_80%,transparent)] leading-relaxed pr-4">{error}</span>
                    </div>
                    <button 
                      onClick={() => setError("")} 
                      className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-all shrink-0"
                    >
                      <span className="material-symbols-outlined !text-[18px]">{t("icon_close", "close")}</span>
                    </button>
                </div>
            </div>
        )}

          <div className="flex flex-col gap-2 relative z-[70]">
            <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("support_category", "Ticket Category")}</label>
            <CustomDropdown disableTint={true}  
              value={type}
              options={categories.map(c => ({ id: c.category_code, label: c.category_name }))}
              onChange={(v: string[]) => setType(v[0])}
            />
          </div>

          {String(activeCategory?.show_title_box) !== "false" && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("ticket_subject_label", "Ticket Subject")}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                placeholder={t("support_placeholder_title", "Enter a concise title...")}
              />
            </div>
          )}

          {activeCategory?.requires_target_user && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("support_target_user_label", "Target User ID")}</label>
              <input
                type="text"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                placeholder={t("support_placeholder_user_uuid", "User UUID...")}
              />
            </div>
          )}

          {String(activeCategory?.show_description_box) !== "false" && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex justify-start">
                <span>{t("support_desc", "Ticket Description")}</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all h-32 resize-none custom-scrollbar"
                placeholder={t("support_placeholder_desc", "Describe your issue in detail...")}
              />
            </div>
          )}

          {activeCategory?.custom_fields?.map((field: any) => (
            <div key={field.id} className="flex flex-col gap-2 relative z-[50]">
              <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center gap-2">
                {field.label}
                {field.required && <span className="text-[var(--danger)]">*</span>}
              </label>
              
              {field.type === "TEXT INPUT" && (
                <input
                  type="text"
                  value={customFieldsData[field.id] || ""}
                  onChange={(e) => setCustomFieldsData(prev => ({ ...prev, [field.id]: e.target.value }))}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                />
              )}
              
              {field.type === "TEXTAREA" && (
                <textarea
                  value={customFieldsData[field.id] || ""}
                  onChange={(e) => setCustomFieldsData(prev => ({ ...prev, [field.id]: e.target.value }))}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all h-24 resize-none custom-scrollbar"
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
                  type="button"
                  onClick={() => setCustomFieldsData(prev => ({ ...prev, [field.id]: prev[field.id] === "true" ? "false" : "true" }))}
                  className={`sa-glass-toggle ${customFieldsData[field.id] === "true" ? "is-on" : ""}`}
                >
                  <div className="sa-glass-toggle-thumb" />
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
                      <SidePanelPillToggle
                        key={opt}
                        checked={isChecked}
                        label={opt}
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
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {activeCategory?.telemetry_config?.sources && activeCategory.telemetry_config.sources.length > 0 && (
             <div className="flex flex-col gap-2 relative z-[50]">
               <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("support_telemetry_opt", "Automatic Diagnostics")}</label>
               <div className="flex flex-col gap-2">
                 {activeCategory.telemetry_config.sources.map((sourceId: string) => {
                   const source = telemetrySources.find(s => s.id === sourceId);
                   if (!source) return null;
                   const isOptedOut = optedOutSources.includes(sourceId);
                   return (
                     <SidePanelPillToggle
                       key={sourceId}
                       checked={!isOptedOut}
                       label={source.label}
                       description={source.description || source.file_pattern}
                       onChange={(checked) => {
                         if (checked) {
                           setOptedOutSources(prev => prev.filter(id => id !== sourceId));
                         } else {
                           setOptedOutSources(prev => [...prev, sourceId]);
                         }
                       }}
                     />
                   );
                 })}
               </div>
             </div>
          )}

          {String(activeCategory?.show_logs_box) !== "false" && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex justify-start items-center">
                <span>{t("support_logs", "Attach Additional Logs")}</span>
                <button onClick={attachLog} className="text-[var(--accent)] hover:opacity-80 transition-opacity flex items-center gap-1">
                  <span>+ {t("support_attach_log", "Attach Log")}</span>
                </button>
              </label>
              <textarea
                value={logs}
                onChange={(e) => setLogs(e.target.value)}
                className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-[10px] font-mono focus:outline-none focus:theme-border-accent transition-all h-24 resize-none custom-scrollbar whitespace-pre-wrap"
                placeholder={t("support_placeholder_logs", "No logs attached.")}
              />
            </div>
          )}
      </div>
    </SidePanel>
  );
}



