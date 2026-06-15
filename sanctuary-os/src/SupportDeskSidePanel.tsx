import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { CustomDropdown, ModSearchDropdown, SidePanel, standardButtonClass, standardAccentGlassButtonClass } from "./shared";
import { useStore } from "./store";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";


export default function SupportDeskSidePanel({ isOpen, onClose, preselectedType }: { isOpen: boolean; onClose: () => void; preselectedType?: string }) {
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
  const [loadingCats, setLoadingCats] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const fetchCats = async () => {
      setLoadingCats(true);
      const { data } = await supabase.from('sanctuary_support_categories').select('*').eq('is_active', true).order('category_name', { ascending: true });
      if (data && data.length > 0) {
        setCategories(data);
        if (!preselectedType) setType(data[0].category_code);
        setCustomFieldsData({});
      }
      setLoadingCats(false);
    };
    fetchCats();
  }, [isOpen, preselectedType]);

  const activeCategory = categories.find(c => c.category_code === type);

  const submitTicket = async () => {
    if (String(activeCategory?.show_title_box) !== "false" && !title) return setError(t("sa_support_error_fields") || "Please fill out all required fields.");
    if (String(activeCategory?.show_description_box) !== "false" && !description) return setError(t("sa_support_error_fields") || "Please fill out all required fields.");

    if (activeCategory?.custom_fields) {
      for (const field of activeCategory.custom_fields) {
        if (field.required) {
          const val = customFieldsData[field.id];
          if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
            return setError(t("sa_support_error_fields") || "Please fill out all required fields.");
          }
        }
      }
    }
    setIsSubmitting(true);
    setError("");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Must be logged in to submit a ticket.");
      }

      const { error } = await supabase.from('sanctuary_tickets').insert([{
        author_id: user.id,
        ticket_type: type,
        title: title || (activeCategory?.category_name || "Support Ticket"),
        description: description || "No description provided.",
        status: "open",
        metadata: {
          target_mod_id: targetModId || null,
          target_user_id: targetUserId || null,
          logs: logs || null,
          custom_fields: customFieldsData
        }
      }]);

      if (error) throw error;
      
      useStore.getState().pushStatus(t("sa_support_success") || "Ticket Submitted: Your request has been logged.", "success");
      onClose();
    } catch (e: any) {
      setError(e.message);
      useStore.getState().pushStatus(e.message, "error");
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
      useStore.getState().pushStatus(t("sa_support_err_read_log") || "Failed to read log", "error");
    }
  };

  if (!isOpen) return null;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("sa_support_title") || "Support & Reporting"}
      subtitle={t("sa_support_subtitle") || "Submit a ticket to the Sanctuary team"}
      icon={t("ui_icon_support") || "contact_support"}
      widthClass="w-[600px]"
      backdropZ="z-[50000]"
      panelZ="z-[50001]"
      footer={
        <div className="flex justify-end gap-4">
          <button onClick={onClose} className={standardButtonClass}>
            {t("shared_cancel") || "Cancel"}
          </button>
          <button onClick={submitTicket} disabled={isSubmitting} className={standardAccentGlassButtonClass}>
            {isSubmitting ? "..." : t("sa_support_submit") || "Submit"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 relative">
        {error && <div className="theme-bg-danger text-[var(--bg)] px-4 py-3 rounded-xl text-xs font-bold">{error}</div>}

          <div className="flex flex-col gap-2 relative z-[70]">
            <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("sa_support_category") || "Category"}</label>
            <CustomDropdown disableTint={true}  
              value={type}
              options={categories.map(c => ({ id: c.category_code, label: c.category_name }))}
              onChange={(v: string[]) => setType(v[0])}
            />
          </div>

          {String(activeCategory?.show_title_box) !== "false" && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("sa_support_ticket_title") || "Title"}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                placeholder={t("sa_support_placeholder_title") || "Brief summary..."}
              />
            </div>
          )}

          {activeCategory?.requires_target_mod && (
            <div className="flex flex-col gap-2 relative z-[60]">
              <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("support_target_mod_label") || "Target Mod"}</label>
              <ModSearchDropdown
                modList={modList}
                placeholder={t("sa_support_placeholder_mod_uuid") || "Mod UUID..."}
                selectedItem={modList.find((m: any) => m.id === targetModId || m.hash === targetModId) || (targetModId ? { displayName: targetModId } : null)}
                onSelect={(m: any) => setTargetModId(m.id || m.hash)}
                onClear={() => setTargetModId("")}
              />
            </div>
          )}

          {activeCategory?.requires_target_user && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("support_target_user_label") || "Target User ID"}</label>
              <input
                type="text"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                placeholder={t("sa_support_placeholder_user_uuid") || "User UUID..."}
              />
            </div>
          )}

          {String(activeCategory?.show_description_box) !== "false" && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex justify-between">
                <span>{t("sa_support_desc") || "Description"}</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all h-32 resize-none custom-scrollbar"
                placeholder={t("sa_support_placeholder_desc") || "Provide detailed information..."}
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
                  className={`w-12 h-6 rounded-full transition-all flex items-center px-1 ${customFieldsData[field.id] === "true" ? 'theme-bg-success' : 'bg-black/40 border border-white/10'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow-md transition-all ${customFieldsData[field.id] === "true" ? 'translate-x-6' : 'translate-x-0'}`} />
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
                      <label key={opt} className={`flex items-center gap-3 cursor-pointer group theme-glass-inner rounded-xl px-4 py-3 transition-all border ${isChecked ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-transparent hover:border-white/10'}`}>
                         <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all shrink-0 ${isChecked ? 'theme-bg-accent border-[var(--accent)] shadow-[0_0_10px_rgba(var(--accent-rgb),0.5)]' : 'bg-black/40 border-white/10 group-hover:border-white/30'}`}>
                           {isChecked && <span className="material-symbols-outlined !text-[14px] text-[var(--bg)] font-black">check</span>}
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

          {String(activeCategory?.show_logs_box) !== "false" && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex justify-between items-center">
                <span>{t("sa_support_logs") || "Logs (Optional)"}</span>
                <button onClick={attachLog} className="text-[var(--accent)] hover:opacity-80 transition-opacity flex items-center gap-1">
                  <span>+ {t("sa_support_attach_log") || "Attach File"}</span>
                </button>
              </label>
              <textarea
                value={logs}
                onChange={(e) => setLogs(e.target.value)}
                className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-[10px] font-mono focus:outline-none focus:theme-border-accent transition-all h-24 resize-none custom-scrollbar whitespace-pre-wrap"
                placeholder={t("sa_support_placeholder_logs") || "Paste logs or use attach button..."}
              />
            </div>
          )}
      </div>
    </SidePanel>
  );
}
