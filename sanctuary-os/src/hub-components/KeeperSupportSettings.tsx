import { useStore } from "../store";
import React, { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { supabaseAuth } from "../supabase";
import { ViewHeader, SidePanel, CustomDropdown, standardButtonClass, standardDangerButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass, EmptyState, ActionButton } from "../shared";

interface CustomField {
    id: string;
    label: string;
    type: string;
    required: boolean;
    options?: string[];
    allow_multi_select?: boolean;
}

interface SupportCategory {
    id?: number;
    category_code: string;
    category_name: string;
    description: string;
    is_active: boolean;
    ticket_destination: 'mod_author' | 'architect' | 'oversight' | 'wayfinder';
    escalation_path: 'none' | 'standard' | 'urgent';
    requires_target_mod: boolean;
    requires_target_user: boolean;
    show_title_box: boolean;
    show_description_box: boolean;
    show_logs_box: boolean;
    attach_blueprints: boolean;
    custom_fields: CustomField[];
}

export default function KeeperSupportSettings() {
    const { t } = useLexicon();
    const [categories, setCategories] = useState<SupportCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [filter, setFilter] = useState("ALL");
    const [editingCat, setEditingCat] = useState<SupportCategory | null>(null);

    const fetchData = async () => {
        setLoading(true);
        const { data: cats } = await supabaseAuth.from('keeper_support_categories').select('*').order('category_name');
        if (cats) setCategories(cats);
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const openEditor = (cat?: SupportCategory) => {
        if (cat) {
            setEditingCat({ ...cat });
        } else {
            setEditingCat({
                category_code: "",
                category_name: "",
                description: "",
                is_active: true,
                ticket_destination: 'wayfinder',
                escalation_path: 'standard',
                requires_target_mod: false,
                requires_target_user: false,
                show_title_box: true,
                show_description_box: true,
                show_logs_box: true,
                attach_blueprints: false,
                custom_fields: []
            });
        }
    };

    const filteredCategories = categories.filter(c => {
        if (filter === "ACTIVE" && !c.is_active) return false;
        if (filter === "INACTIVE" && c.is_active) return false;
        if (searchQuery && !c.category_name.toLowerCase().includes(searchQuery.toLowerCase()) && !c.category_code.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    return (
        <div className="flex flex-col gap-6 w-full relative min-h-[500px] animate-in fade-in pb-20 mt-4">
            <div className="flex items-center justify-between w-full shrink-0 border-b border-white/5 pb-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_support_agent")}</span>
                        </div>
                        <span className="truncate">{t("tab_support")}</span>
                    </h2>
                </div>

                <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
                    <div className="relative flex-1 max-w-[300px]">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder={t("support_search")}
                            className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
                        />
                    </div>
                    <div className="w-max min-w-[192px] max-w-xs z-[20] shrink-0">
                        <CustomDropdown disableTint={true}
                            value={filter}
                            onChange={(v: string[]) => setFilter(v[0])}
                            options={[
                                { id: "ALL", label: t("all_classes") },
                                { id: "ACTIVE", label: t("support_active_only") },
                                { id: "INACTIVE", label: t("support_inactive_only") }
                            ]}
                        />
                    </div>
                    <ActionButton
                        onClick={() => openEditor()}
                        className="shrink-0 h-12 px-6 font-black uppercase tracking-widest text-[10px]"
                        icon={t("icon_add")}
                        label={t("support_add_cat")}
                    />
                </div>
            </div>

            <div className="flex flex-col gap-4">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                        {filteredCategories.map(cat => (
                            <button key={cat.id || cat.category_code} onClick={() => openEditor(cat)} className="theme-glass-panel rounded-[var(--radius)] flex flex-col group cursor-pointer border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.15)] transition-all duration-500 hover:-translate-y-1.5 relative overflow-hidden bg-gradient-to-br from-white/5 to-transparent min-h-[220px] text-left">
                                <div className={`absolute inset-0 transition-opacity duration-500 pointer-events-none opacity-0 group-hover:opacity-100 ${cat.is_active ? 'bg-gradient-to-br from-[var(--accent)]/5 to-transparent' : 'bg-gradient-to-br from-red-500/5 to-transparent'}`} />

                                <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-500
                      ${cat.is_active ? 'bg-[var(--accent)]/50 group-hover:bg-[var(--accent)] group-hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.5)]' : 'bg-red-500/50 group-hover:bg-red-500 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.5)]'}
                  `} />

                                <div className="p-6 flex flex-col gap-4 flex-1 relative z-10 w-full">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] ${cat.is_active ? 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[var(--accent)]/30' : 'border-red-500/30 group-hover:border-red-500/50'}`}>
                                            <span className={`material-symbols-outlined !text-[24px] transition-colors duration-500 opacity-50 group-hover:opacity-100 ${cat.is_active ? 'text-[var(--text)] group-hover:text-[var(--accent)]' : 'text-red-400'}`}>
                                                {cat.is_active ? (t("icon_category")) : (t("icon_block"))}
                                            </span>
                                        </div>
                                        <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors
                              ${cat.is_active ? 'bg-[var(--accent)]/10 theme-text-accent border-[var(--accent)]/20 group-hover:bg-[var(--accent)]/20' : 'bg-red-500/10 text-red-400 border-red-500/20 group-hover:bg-red-500/20'}
                          `}>
                                            {cat.is_active ? (t("status_active")) : (t("status_inactive"))}
                                        </span>
                                    </div>

                                    <div className="flex flex-col gap-1 mt-2">
                                        <h3 className="font-black text-xl leading-tight text-[var(--text)] group-hover:text-[var(--accent)] transition-colors uppercase tracking-widest line-clamp-2">
                                            {cat.category_name}
                                        </h3>
                                        <span className="text-[10px] font-mono opacity-50 uppercase tracking-widest">{cat.category_code}</span>
                                    </div>

                                    {cat.description && (
                                        <p className="text-xs text-[var(--subtext)] line-clamp-3 leading-relaxed font-bold opacity-70 group-hover:opacity-100 transition-opacity flex-1 mt-1">
                                            {cat.description}
                                        </p>
                                    )}

                                    <div className="flex justify-between items-center mt-auto pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] gap-4">
                                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                                            <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 border border-emerald-500/30 text-emerald-400 rounded-full bg-emerald-500/10 shadow-[inset_0_0_10px_rgba(16,185,129,0.1)]">{cat.ticket_destination?.replace('_', ' ') || 'ARCHITECT'}</span>
                                            <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 border border-orange-500/30 text-orange-400 rounded-full bg-orange-500/10 shadow-[inset_0_0_10px_rgba(249,115,22,0.1)]">{cat.escalation_path || 'STANDARD'}</span>
                                            {(cat.requires_target_mod || cat.requires_target_user) && (
                                                <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 border border-indigo-500/30 text-indigo-400 rounded-full bg-indigo-500/10 shadow-[inset_0_0_10px_rgba(99,102,241,0.1)]">
                                                    {cat.requires_target_mod && cat.requires_target_user ? "MOD+USER" : cat.requires_target_mod ? "MOD" : "USER"}
                                                </span>
                                            )}
                                            {cat.custom_fields && cat.custom_fields.length > 0 && (
                                                <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 border border-white/20 text-[var(--subtext)] rounded-full bg-white/5 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]">
                                                    {cat.custom_fields.length} {t("support_custom_fields_count")}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                    {!loading && filteredCategories.length === 0 && (
                        <EmptyState icon={t("icon_inventory_2") || "inventory"} title={t("support_no_cats")} className="py-8" />
                    )}
                </div>



            <CategoryEditorPanel
                cat={editingCat}
                isOpen={!!editingCat}
                onClose={() => setEditingCat(null)}
                onSaved={fetchData}
            />
        </div>
    );
}

function CategoryEditorPanel({ cat, isOpen, onClose, onSaved }: { cat: SupportCategory | null, isOpen: boolean, onClose: () => void, onSaved: () => void }) {
    const { t } = useLexicon();
    const [draft, setDraft] = useState<SupportCategory | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setDraft(cat);
    }, [cat]);

    if (!isOpen || !draft) return null;

    const save = async () => {
        setIsSaving(true);
        try {
            if (draft.id) {
                const { error } = await supabaseAuth.from('keeper_support_categories').update(draft).eq('id', draft.id);
                if (error) throw error;
            } else {
                const { error } = await supabaseAuth.from('keeper_support_categories').insert([draft]);
                if (error) throw error;
            }
            useStore.getState().pushStatus(t("support_saved_msg"), "success");
            onSaved();
            onClose();
        } catch (e: any) {
            useStore.getState().pushStatus(e.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!draft.id) return;
        setIsSaving(true);
        try {
            const { error } = await supabaseAuth.from('keeper_support_categories').delete().eq('id', draft.id);
            if (error) throw error;
            useStore.getState().pushStatus(t("auto_category_deleted_successfully_34"), "success");
            onSaved();
            onClose();
        } catch (e: any) {
            useStore.getState().pushStatus(e.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const addField = () => {
        setDraft({
            ...draft,
            custom_fields: [...(draft.custom_fields || []), { id: `field_${Date.now()}`, label: t("support_new_field"), type: "TEXT INPUT", required: false }]
        });
    };

    const updateField = (index: number, updates: Partial<CustomField>) => {
        const newFields = [...draft.custom_fields];
        newFields[index] = { ...newFields[index], ...updates };
        setDraft({ ...draft, custom_fields: newFields });
    };

    const removeField = (index: number) => {
        const newFields = draft.custom_fields.filter((_, i) => i !== index);
        setDraft({ ...draft, custom_fields: newFields });
    };

    return (
        <SidePanel
            isOpen={isOpen}
            onClose={onClose}
            title={draft.id ? (t("support_edit_cat")) : (t("support_new_cat"))}
            subtitle={t("support_sidepanel_subtitle")}
            icon="category"
            widthClass="w-[600px]"
            backdropZ="z-[100]"
            panelZ="z-[105]"
            footer={
                <div className="flex flex-col gap-4 w-full">
                    <div className="flex justify-center items-center gap-4 w-full">
                        {draft.id && (
                            <ActionButton onClick={handleDelete} disabled={isSaving} label={t("purge")}>
                                
                            </ActionButton>
                        )}
                        <ActionButton onClick={save} disabled={isSaving || !draft.category_code || !draft.category_name} label={isSaving ? "..." : (t("save"))}>
                            
                        </ActionButton>
                    </div>
                </div>
            }
        >
            <div className="flex flex-col gap-6">

                <div className="flex items-center justify-between theme-glass-panel p-4 rounded-xl border-white/5">
                    <span className="text-xs font-black uppercase tracking-widest">{t("support_active_status")}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} />
                        <div className="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-[var(--accent)] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                    </label>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("support_system_code")}</label>
                    <input
                        type="text"
                        value={draft.category_code}
                        onChange={e => setDraft({ ...draft, category_code: e.target.value })}
                        className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all font-mono"
                        placeholder={t("support_code_ph")}
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("registry_label_name")}</label>
                    <input
                        type="text"
                        value={draft.category_name}
                        onChange={e => setDraft({ ...draft, category_name: e.target.value })}
                        className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                        placeholder={t("support_name_ph")}
                    />
                </div>

                <div className="flex gap-4 w-full">
                    <div className="flex flex-col gap-2 flex-1 relative z-20">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("support_destination")}</label>
                        <div className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--subtext)] text-sm font-bold font-mono uppercase opacity-50 select-none">
                            WAYFINDER
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 flex-1 relative z-20">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("support_escalation")}</label>
                        <CustomDropdown disableTint={true}
                            value={draft.escalation_path || 'standard'}
                            onChange={(val: string[]) => setDraft({ ...draft, escalation_path: val[0] as any })}
                            options={[
                                { id: "none", label: "None (Never Escalate)" },
                                { id: "standard", label: "Standard (72 Hours)" },
                                { id: "urgent", label: "Urgent (24 Hours)" }
                            ]}
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("upload_desc")}</label>
                    <textarea
                        value={draft.description}
                        onChange={e => setDraft({ ...draft, description: e.target.value })}
                        className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all h-24 resize-none"
                        placeholder={t("support_desc_ph")}
                    />
                </div>

                <div className="flex flex-col gap-4 mt-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("support_custom_fields")}</span>
                        <button onClick={addField} className="text-[9px] font-black uppercase tracking-widest text-[var(--accent)] hover:opacity-80">+ {t("support_add_field")}</button>
                    </div>

                    <div className="flex flex-col gap-4">
                        {draft.custom_fields?.map((field, idx) => (
                            <div key={idx} className="theme-glass-panel border border-white/5 p-4 rounded-2xl flex flex-col gap-4">
                                <div className="flex items-center gap-3">
                                    <span className="text-[9px] font-black opacity-40">{(idx + 1).toString().padStart(2, '0')}</span>
                                    <input
                                        type="text"
                                        value={field.label}
                                        onChange={e => updateField(idx, { label: e.target.value })}
                                        className="flex-1 bg-transparent border-b border-white/10 focus:border-[var(--accent)] outline-none text-sm font-bold py-1"
                                        placeholder={t("support_field_label_ph")}
                                    />
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <CustomDropdown disableTint={true}
                                            value={field.type}
                                            onChange={(val: string[]) => updateField(idx, { type: val[0] as any })}
                                            options={[
                                                { id: "TEXT INPUT", label: t("color_text") },
                                                { id: "TEXTAREA", label: t("support_type_textarea") },
                                                { id: "DROPDOWN", label: t("support_type_dropdown") },
                                                { id: "CHECKBOX", label: t("support_type_checkbox") }
                                            ]}
                                        />
                                    </div>
                                    <button onClick={() => updateField(idx, { required: !field.required })} className={`px-4 py-2 rounded-lg text-[9px] font-black transition-all border ${field.required ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[inset_0_0_10px_color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'bg-transparent border-white/10 text-[var(--subtext)] hover:border-white/30'}`}>{t("req_short")}</button>
                                    <button onClick={() => removeField(idx)} className="text-red-500/70 hover:text-red-500 font-bold p-2 hover:bg-red-500/10 rounded-lg transition-all"><span className='material-symbols-outlined !text-[12px]'>{t("icon_close")}</span></button>
                                </div>
                                {(field.type === "CHECKBOX" || field.type === "DROPDOWN") && (
                                    <div className="flex flex-col gap-2 pl-6 border-l border-white/10 mt-2">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("support_options")}</span>
                                        {(field.options || []).map((opt, oIdx) => (
                                            <div key={oIdx} className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={opt}
                                                    onChange={e => {
                                                        const newOpts = [...(field.options || [])];
                                                        newOpts[oIdx] = e.target.value;
                                                        updateField(idx, { options: newOpts });
                                                    }}
                                                    className="flex-1 theme-glass-inner rounded-md px-3 py-1.5 text-xs outline-none"
                                                    placeholder={t("support_option_ph")}
                                                />
                                                <button onClick={() => {
                                                    const newOpts = (field.options || []).filter((_, i) => i !== oIdx);
                                                    updateField(idx, { options: newOpts });
                                                }} className="text-red-500/50 hover:text-red-500 p-1"><span className='material-symbols-outlined !text-[12px]'>{t("icon_close")}</span></button>
                                            </div>
                                        ))}
                                        <button onClick={() => updateField(idx, { options: [...(field.options || []), ""] })} className="w-full theme-glass-inner rounded-md py-1.5 text-[9px] font-black text-center opacity-60 hover:opacity-100 uppercase tracking-widest mt-1">{t("support_add_option")}</button>

                                        <div className="flex items-center justify-between mt-2 pr-2">
                                            <span className="text-[8px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("support_allow_multi")}</span>
                                            <label className="relative inline-flex items-center cursor-pointer scale-75">
                                                <input type="checkbox" className="sr-only peer" checked={field.allow_multi_select || false} onChange={e => updateField(idx, { allow_multi_select: e.target.checked })} />
                                                <div className="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-[var(--accent)] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-3 mt-6 pt-6 border-t border-white/10">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white/40" /> {t("support_req_target_mod")}</span>
                        <label className="relative inline-flex items-center cursor-pointer scale-75 origin-right">
                            <input type="checkbox" className="sr-only peer" checked={draft.requires_target_mod} onChange={e => setDraft({ ...draft, requires_target_mod: e.target.checked })} />
                            <div className="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-[var(--accent)] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                        </label>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white/40" /> {t("support_req_target_user")}</span>
                        <label className="relative inline-flex items-center cursor-pointer scale-75 origin-right">
                            <input type="checkbox" className="sr-only peer" checked={draft.requires_target_user} onChange={e => setDraft({ ...draft, requires_target_user: e.target.checked })} />
                            <div className="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-[var(--accent)] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                        </label>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white/40" /> {t("support_show_title")}</span>
                        <label className="relative inline-flex items-center cursor-pointer scale-75 origin-right">
                            <input type="checkbox" className="sr-only peer" checked={draft.show_title_box} onChange={e => setDraft({ ...draft, show_title_box: e.target.checked })} />
                            <div className="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-[var(--accent)] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                        </label>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white/40" /> {t("support_show_desc")}</span>
                        <label className="relative inline-flex items-center cursor-pointer scale-75 origin-right">
                            <input type="checkbox" className="sr-only peer" checked={draft.show_description_box} onChange={e => setDraft({ ...draft, show_description_box: e.target.checked })} />
                            <div className="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-[var(--accent)] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                        </label>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white/40" /> {t("support_show_logs")}</span>
                        <label className="relative inline-flex items-center cursor-pointer scale-75 origin-right">
                            <input type="checkbox" className="sr-only peer" checked={draft.show_logs_box} onChange={e => setDraft({ ...draft, show_logs_box: e.target.checked })} />
                            <div className="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-[var(--accent)] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                        </label>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white/40" /> {t("support_attach_blueprints") || "ATTACH BLUEPRINTS"}</span>
                        <label className="relative inline-flex items-center cursor-pointer scale-75 origin-right">
                            <input type="checkbox" className="sr-only peer" checked={draft.attach_blueprints} onChange={e => setDraft({ ...draft, attach_blueprints: e.target.checked })} />
                            <div className="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-[var(--accent)] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                        </label>
                    </div>
                </div>
            </div>
        </SidePanel>
    );
}

