import { useStore } from "../store";
import React, { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { supabase } from "../supabase";
import { ViewHeader, SidePanel, CustomDropdown, standardButtonClass, standardDangerButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass, EmptyState, ActionButton, FilterPopover } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { UniversalInput, UniversalTextArea, UniversalToggle } from "../components/universal/UniversalLayout";
import { ElevatedHubLayout } from "../components/layouts/ElevatedHubLayout";

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
        const { data: cats } = await supabase.from('keeper_support_categories').select('*').order('category_name');
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

    const tabs = [
        {
            id: "overview",
            label: t("landing_overview") || "Overview",
            icon: "dashboard",
        },
        {
            id: "ACTIVE",
            label: t("support_active_only") || "Active",
            icon: "category",
            number: categories.filter(c => c.is_active).length,
        },
        {
            id: "INACTIVE",
            label: t("support_inactive_only") || "Inactive",
            icon: "block",
            number: categories.filter(c => !c.is_active).length,
        }
    ];

    const filteredCategories = categories.filter(c => {
        if (filter === "ACTIVE" && !c.is_active) return false;
        if (filter === "INACTIVE" && c.is_active) return false;
        if (searchQuery && !c.category_name.toLowerCase().includes(searchQuery.toLowerCase()) && !c.category_code.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    const renderCategoryCard = (cat: SupportCategory) => (
        <UniversalCard
            key={cat.id || cat.category_code}
            onClick={() => openEditor(cat)}
            layout="vertical"
            icon={cat.is_active ? "category" : "block"}
            title={cat.category_name}
            subtitle={cat.category_code}
            statusColor={cat.is_active ? undefined : "border-red-500"}
            badges={[
                <span key="status" className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner shrink-0 transition-colors
                    ${cat.is_active ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] theme-text-accent border-[color-mix(in_srgb,var(--accent)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-red-400 border-[color-mix(in_srgb,var(--danger)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]'}
                `}>
                    {cat.is_active ? (t("status_active")) : (t("status_inactive"))}
                </span>
            ]}
            footer={
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                    <span className="text-[9px] font-black capitalize tracking-widest px-3 py-1.5 border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-emerald-400 rounded-full bg-[color-mix(in_srgb,var(--success)_10%,transparent)] shadow-[inset_0_0_10px_rgba(16,185,129,0.1)]">{cat.ticket_destination?.replace('_', ' ') || 'ARCHITECT'}</span>
                    <span className="text-[9px] font-black capitalize tracking-widest px-3 py-1.5 border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-orange-400 rounded-full bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] shadow-[inset_0_0_10px_rgba(249,115,22,0.1)]">{cat.escalation_path || 'STANDARD'}</span>
                    {(cat.requires_target_mod || cat.requires_target_user) && (
                        <span className="text-[9px] font-black capitalize tracking-widest px-3 py-1.5 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-indigo-400 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[inset_0_0_10px_rgba(99,102,241,0.1)]">
                            {cat.requires_target_mod && cat.requires_target_user ? "MOD+USER" : cat.requires_target_mod ? "MOD" : "USER"}
                        </span>
                    )}
                    {cat.custom_fields && cat.custom_fields.length > 0 && (
                        <span className="text-[9px] font-black capitalize tracking-widest px-3 py-1.5 border border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-[var(--subtext)] rounded-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]">
                            {cat.custom_fields.length} {t("support_custom_fields_count")}
                        </span>
                    )}
                </div>
            }
        >
            {cat.description && (
                <p className="text-xs text-[var(--subtext)] line-clamp-3 leading-relaxed font-bold opacity-70 group-hover:opacity-100 transition-opacity flex-1 mt-4">
                    {cat.description}
                </p>
            )}
        </UniversalCard>
    );

    const renderLanding = () => {
        const activeCats = categories.filter(c => c.is_active);
        const inactiveCats = categories.filter(c => !c.is_active);

        return (
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
                        <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase flex items-center gap-2">
                            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">category</span>
                            {t("recent_active_categories") || "Recent Active"}
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                        {activeCats.slice(0, 10).map(renderCategoryCard)}
                        {activeCats.length === 0 && <EmptyState icon="category" title="No Active Categories" className="py-8" />}
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
                        <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase flex items-center gap-2">
                            <span className="material-symbols-outlined !text-[18px] text-[var(--danger)]">block</span>
                            {t("recent_inactive_categories") || "Recent Inactive"}
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                        {inactiveCats.slice(0, 10).map(renderCategoryCard)}
                        {inactiveCats.length === 0 && <EmptyState icon="block" title="No Inactive Categories" className="py-8" />}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <ElevatedHubLayout
            headerTitle={t("support_settings") || "Support Settings"}
            headerSubtitle={t("support_settings_desc") || "Manage ticket categories and custom fields."}
            headerIcon="category"
            headerIconColorClass="theme-text-accent"
            search={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("support_search") as string}
            tabs={tabs}
            activeTab={filter === "ALL" ? "overview" : filter}
            onTabChange={(id) => setFilter(id === "overview" ? "ALL" : id)}
            headerActions={
                <div className="flex items-center gap-2">
                    <FilterPopover icon="tune" label="" className="shrink-0">
                        <div className="flex flex-col gap-2 p-4">
                            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-1">{t("filter_status") || "Filter Status"}</label>
                            <CustomDropdown disableTint={true}
                                value={filter === "overview" ? "ALL" : filter}
                                onChange={(v: string[]) => setFilter(v[0] === "ALL" ? "overview" : v[0])}
                                options={[
                                    { id: "ALL", label: t("all_classes") },
                                    { id: "ACTIVE", label: t("support_active_only") },
                                    { id: "INACTIVE", label: t("support_inactive_only") }
                                ]}
                            />
                        </div>
                    </FilterPopover>
                    <ActionButton
                        onClick={() => openEditor()}
                        iconOnly={true}
                        icon={t("icon_add")}
                        label={t("support_add_cat")}
                    />
                </div>
            }
        >
            {filter === 'overview' || filter === 'ALL' ? renderLanding() : (
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                        {filteredCategories.map(renderCategoryCard)}
                    </div>
                    {!loading && filteredCategories.length === 0 && (
                        <EmptyState icon={t("icon_inventory_2")} title={t("support_no_cats")} className="py-8" />
                    )}
                </div>
            )}

            <CategoryEditorPanel
                cat={editingCat}
                isOpen={!!editingCat}
                onClose={() => setEditingCat(null)}
                onSaved={fetchData}
            />
        </ElevatedHubLayout>
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
                const { error } = await supabase.from('keeper_support_categories').update(draft).eq('id', draft.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('keeper_support_categories').insert([draft]);
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
            const { error } = await supabase.from('keeper_support_categories').delete().eq('id', draft.id);
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

                <div className="flex items-center justify-start glass-panel p-4 rounded-[1.5rem] border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                    <UniversalToggle
                        checked={draft.is_active}
                        onChange={(checked) => setDraft({ ...draft, is_active: checked })}
                        label={t("support_active_status")}
                        layout="horizontal-reverse"
                    />
                </div>

                <UniversalInput
                    label={t("support_system_code")}
                    value={draft.category_code}
                    onChange={(val) => setDraft({ ...draft, category_code: val })}
                    placeholder={t("support_code_ph")}
                    className="font-mono"
                />

                <UniversalInput
                    label={t("registry_label_name")}
                    value={draft.category_name}
                    onChange={(val) => setDraft({ ...draft, category_name: val })}
                    placeholder={t("support_name_ph")}
                />

                <div className="flex gap-4 w-full">
                    <div className="flex flex-col gap-2 flex-1 relative z-20">
                        <label className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("support_destination")}</label>
                        <div className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--subtext)] text-sm font-bold font-mono capitalize opacity-50 select-none">
                            WAYFINDER
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 flex-1 relative z-20">
                        <label className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("support_escalation")}</label>
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

                <UniversalTextArea
                    label={t("upload_desc")}
                    value={draft.description}
                    onChange={(val) => setDraft({ ...draft, description: val })}
                    placeholder={t("support_desc_ph")}
                    className="h-24"
                />

                <div className="flex flex-col gap-4 mt-4">
                    <div className="flex items-center justify-start border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-2">
                        <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("support_custom_fields")}</span>
                        <button onClick={addField} className="text-[9px] font-black capitalize tracking-widest text-[var(--accent)] hover:opacity-80">+ {t("support_add_field")}</button>
                    </div>

                    <div className="flex flex-col gap-4">
                        {draft.custom_fields?.map((field, idx) => (
                            <div key={idx} className="glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] p-4 rounded-2xl flex flex-col gap-4">
                                <div className="flex items-center gap-3">
                                    <span className="text-[9px] font-black opacity-40">{(idx + 1).toString().padStart(2, '0')}</span>
                                    <input
                                        type="text"
                                        value={field.label}
                                        onChange={e => updateField(idx, { label: e.target.value })}
                                        className="flex-1 bg-transparent border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] outline-none text-sm font-bold py-1"
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
                                    <button onClick={() => updateField(idx, { required: !field.required })} className={`px-4 py-2 rounded-lg text-[9px] font-black transition-all border ${field.required ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-md' : 'bg-transparent border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'}`}>{t("req_short")}</button>
                                    <button onClick={() => removeField(idx)} className="text-[color-mix(in_srgb,var(--danger)_70%,transparent)] hover:text-red-500 font-bold p-2 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] rounded-lg transition-all"><span className='material-symbols-outlined !text-[12px]'>{t("icon_close")}</span></button>
                                </div>
                                {(field.type === "CHECKBOX" || field.type === "DROPDOWN") && (
                                    <div className="flex flex-col gap-2 pl-6 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] mt-2">
                                        <span className="text-[8px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("support_options")}</span>
                                        {(field.options || []).map((opt, oIdx) => (
                                            <div key={oIdx} className="flex items-center gap-2">
                                                <UniversalInput
                                                    value={opt}
                                                    onChange={val => {
                                                        const newOpts = [...(field.options || [])];
                                                        newOpts[oIdx] = val;
                                                        updateField(idx, { options: newOpts });
                                                    }}
                                                    placeholder={t("support_option_ph")}
                                                    wrapperClassName="flex-1"
                                                />
                                                <button onClick={() => {
                                                    const newOpts = (field.options || []).filter((_, i) => i !== oIdx);
                                                    updateField(idx, { options: newOpts });
                                                }} className="text-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:text-red-500 p-1"><span className='material-symbols-outlined !text-[12px]'>{t("icon_close")}</span></button>
                                            </div>
                                        ))}
                                        <button onClick={() => updateField(idx, { options: [...(field.options || []), ""] })} className="w-full glass-surface rounded-md py-1.5 text-[9px] font-black text-center opacity-60 hover:opacity-100 capitalize tracking-widest mt-1">{t("support_add_option")}</button>

                                        <div className="mt-2 pr-2">
                                            <UniversalToggle
                                                checked={field.allow_multi_select || false}
                                                onChange={(val) => updateField(idx, { allow_multi_select: val })}
                                                label={t("support_allow_multi")}
                                                layout="horizontal-reverse"
                                                className="scale-75 origin-right"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <label className={`w-full glass-panel rounded-2xl px-4 h-12 flex items-center justify-start cursor-pointer transition-all border shadow-inner group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] ${draft.requires_target_mod ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                      <span className={`text-[9px] font-black capitalize tracking-widest transition-colors flex items-center gap-2 truncate ${draft.requires_target_mod ? 'theme-text-accent' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                        <span className="material-symbols-outlined !text-[14px]">extension</span>
                        <span className="truncate">{t("support_req_target_mod")}</span>
                      </span>
                      <div className={`w-8 h-5 rounded-full transition-colors relative shadow-inner shrink-0 ${draft.requires_target_mod ? 'bg-[var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                        <div className={`w-3.5 h-3.5 rounded-full bg-[var(--bg)] absolute top-[3px] transition-transform shadow-md ${draft.requires_target_mod ? 'translate-x-4' : 'translate-x-[3px]'}`} />
                      </div>
                      <input type="checkbox" checked={draft.requires_target_mod || false} onChange={e => setDraft({...draft, requires_target_mod: e.target.checked})} className="hidden" />
                    </label>

                    <label className={`w-full glass-panel rounded-2xl px-4 h-12 flex items-center justify-start cursor-pointer transition-all border shadow-inner group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] ${draft.requires_target_user ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                      <span className={`text-[9px] font-black capitalize tracking-widest transition-colors flex items-center gap-2 truncate ${draft.requires_target_user ? 'theme-text-accent' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                        <span className="material-symbols-outlined !text-[14px]">person</span>
                        <span className="truncate">{t("support_req_target_user")}</span>
                      </span>
                      <div className={`w-8 h-5 rounded-full transition-colors relative shadow-inner shrink-0 ${draft.requires_target_user ? 'bg-[var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                        <div className={`w-3.5 h-3.5 rounded-full bg-[var(--bg)] absolute top-[3px] transition-transform shadow-md ${draft.requires_target_user ? 'translate-x-4' : 'translate-x-[3px]'}`} />
                      </div>
                      <input type="checkbox" checked={draft.requires_target_user || false} onChange={e => setDraft({...draft, requires_target_user: e.target.checked})} className="hidden" />
                    </label>

                    <label className={`w-full glass-panel rounded-2xl px-4 h-12 flex items-center justify-start cursor-pointer transition-all border shadow-inner group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] ${draft.show_title_box ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                      <span className={`text-[9px] font-black capitalize tracking-widest transition-colors flex items-center gap-2 truncate ${draft.show_title_box ? 'theme-text-accent' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                        <span className="material-symbols-outlined !text-[14px]">title</span>
                        <span className="truncate">{t("support_show_title")}</span>
                      </span>
                      <div className={`w-8 h-5 rounded-full transition-colors relative shadow-inner shrink-0 ${draft.show_title_box ? 'bg-[var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                        <div className={`w-3.5 h-3.5 rounded-full bg-[var(--bg)] absolute top-[3px] transition-transform shadow-md ${draft.show_title_box ? 'translate-x-4' : 'translate-x-[3px]'}`} />
                      </div>
                      <input type="checkbox" checked={draft.show_title_box || false} onChange={e => setDraft({...draft, show_title_box: e.target.checked})} className="hidden" />
                    </label>

                    <label className={`w-full glass-panel rounded-2xl px-4 h-12 flex items-center justify-start cursor-pointer transition-all border shadow-inner group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] ${draft.show_description_box ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                      <span className={`text-[9px] font-black capitalize tracking-widest transition-colors flex items-center gap-2 truncate ${draft.show_description_box ? 'theme-text-accent' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                        <span className="material-symbols-outlined !text-[14px]">description</span>
                        <span className="truncate">{t("support_show_desc")}</span>
                      </span>
                      <div className={`w-8 h-5 rounded-full transition-colors relative shadow-inner shrink-0 ${draft.show_description_box ? 'bg-[var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                        <div className={`w-3.5 h-3.5 rounded-full bg-[var(--bg)] absolute top-[3px] transition-transform shadow-md ${draft.show_description_box ? 'translate-x-4' : 'translate-x-[3px]'}`} />
                      </div>
                      <input type="checkbox" checked={draft.show_description_box || false} onChange={e => setDraft({...draft, show_description_box: e.target.checked})} className="hidden" />
                    </label>

                    <label className={`w-full glass-panel rounded-2xl px-4 h-12 flex items-center justify-start cursor-pointer transition-all border shadow-inner group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] ${draft.show_logs_box ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                      <span className={`text-[9px] font-black capitalize tracking-widest transition-colors flex items-center gap-2 truncate ${draft.show_logs_box ? 'theme-text-accent' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                        <span className="material-symbols-outlined !text-[14px]">history</span>
                        <span className="truncate">{t("support_show_logs")}</span>
                      </span>
                      <div className={`w-8 h-5 rounded-full transition-colors relative shadow-inner shrink-0 ${draft.show_logs_box ? 'bg-[var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                        <div className={`w-3.5 h-3.5 rounded-full bg-[var(--bg)] absolute top-[3px] transition-transform shadow-md ${draft.show_logs_box ? 'translate-x-4' : 'translate-x-[3px]'}`} />
                      </div>
                      <input type="checkbox" checked={draft.show_logs_box || false} onChange={e => setDraft({...draft, show_logs_box: e.target.checked})} className="hidden" />
                    </label>

                    <label className={`w-full glass-panel rounded-2xl px-4 h-12 flex items-center justify-start cursor-pointer transition-all border shadow-inner group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] ${draft.attach_blueprints ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                      <span className={`text-[9px] font-black capitalize tracking-widest transition-colors flex items-center gap-2 truncate ${draft.attach_blueprints ? 'theme-text-accent' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                        <span className="material-symbols-outlined !text-[14px]">architecture</span>
                        <span className="truncate">{t("support_attach_blueprints")}</span>
                      </span>
                      <div className={`w-8 h-5 rounded-full transition-colors relative shadow-inner shrink-0 ${draft.attach_blueprints ? 'bg-[var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                        <div className={`w-3.5 h-3.5 rounded-full bg-[var(--bg)] absolute top-[3px] transition-transform shadow-md ${draft.attach_blueprints ? 'translate-x-4' : 'translate-x-[3px]'}`} />
                      </div>
                      <input type="checkbox" checked={draft.attach_blueprints || false} onChange={e => setDraft({...draft, attach_blueprints: e.target.checked})} className="hidden" />
                    </label>
                </div>
            </div>
        </SidePanel>
    );
}




