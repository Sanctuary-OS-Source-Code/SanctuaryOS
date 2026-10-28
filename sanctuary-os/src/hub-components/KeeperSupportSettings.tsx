import { useStore } from "../store";
import React, { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { supabase } from "../supabase";
import { SidePanel, CustomDropdown, EmptyState, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { UniversalGroup, UniversalInput, UniversalTextArea, UniversalToggle, SidePanelHeroCard, StatBox } from "../components/universal/UniversalLayout";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, HubListGrid, SidePanelTitleInput, SidePanelPillToggle } from "../components/layouts/ElevatedHubLayout";
import { logArchitectAction, computeAuditDiff } from "../lib/audit";

const VAULT_CHIP_CLASS =
    "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

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
    ticket_destination: 'mod_author' | 'architect' | 'oversight' | 'wayfinder' | 'keepers_core';
    escalation_path: 'none' | 'standard' | 'urgent';
    requires_target_mod: boolean;
    requires_target_user: boolean;
    show_title_box: boolean;
    show_description_box: boolean;
    show_logs_box: boolean;
    attach_blueprints: boolean;
    custom_fields: CustomField[];
}

export interface KeeperSupportSettingsProps {
    embedded?: boolean;
    externalSearch?: string;
    statusFilter?: "all" | "active" | "inactive";
    openCatRef?: React.MutableRefObject<(() => void) | null>;
    onCountsChange?: (count: number) => void;
}

export default function KeeperSupportSettings({
    embedded = false,
    externalSearch = "",
    statusFilter = "all",
    openCatRef,
    onCountsChange
}: KeeperSupportSettingsProps = {}) {
    const { t } = useLexicon();
    const [categories, setCategories] = useState<SupportCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [filter, setFilter] = useState("overview");
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

    useEffect(() => {
        if (openCatRef) openCatRef.current = () => openEditor();
    });

    useEffect(() => {
        if (onCountsChange) {
            onCountsChange(categories.length);
        }
    }, [categories.length]);

    const openEditor = (cat?: SupportCategory) => {
        if (cat) {
            setEditingCat({ ...cat, ticket_destination: 'keepers_core' });
        } else {
            setEditingCat({
                category_code: "",
                category_name: "",
                description: "",
                is_active: true,
                ticket_destination: 'keepers_core',
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
            label: t("overview", "Overview") || "Overview",
            icon: t("icon_dashboard", "dashboard"),
            number: categories.length.toString(),
        },
        {
            id: "ACTIVE",
            label: t("support_active_only", "Active Only") || "Active",
            icon: t("icon_category", "category"),
            number: categories.filter(c => c.is_active).length.toString(),
        },
        {
            id: "INACTIVE",
            label: t("support_inactive_only", "Inactive Only") || "Inactive",
            icon: t("icon_block", "block"),
            number: categories.filter(c => !c.is_active).length.toString(),
        }
    ];

    const effectiveSearch = embedded ? externalSearch : searchQuery;

    const filteredCategories = categories
        .filter(c => {
            if (embedded) {
                if (statusFilter === "active" && !c.is_active) return false;
                if (statusFilter === "inactive" && c.is_active) return false;
            } else {
                if (filter === "ACTIVE" && !c.is_active) return false;
                if (filter === "INACTIVE" && c.is_active) return false;
            }
            if (effectiveSearch && !c.category_name.toLowerCase().includes(effectiveSearch.toLowerCase()) && !c.category_code.toLowerCase().includes(effectiveSearch.toLowerCase())) return false;
            return true;
        })
        .sort((a, b) => {
            if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
            return (a.category_name || "").localeCompare(b.category_name || "");
        });

    const renderCategoryCard = (cat: SupportCategory) => (
        <UniversalCard
            key={cat.id || cat.category_code}
            onClick={() => openEditor(cat)}
            layout="vertical"
            isGhosted={!cat.is_active}
            icon={cat.is_active ? t("icon_category", "category") : t("icon_block", "block")}
            title={cat.category_name}
            subtitle={cat.category_code}
            statusColor={cat.is_active ? undefined : "border-[color-mix(in_srgb,var(--danger)_50%,transparent)]"}
            imageOverlay={
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                    <div className={VAULT_CHIP_CLASS}>
                        <span className={`material-symbols-outlined !text-[12px] ${cat.is_active ? "text-[var(--success)]" : "text-[var(--subtext)]"}`}>
                            {cat.is_active ? t("icon_check_circle", "check_circle") : t("icon_cancel", "cancel")}
                        </span>
                        <span>{cat.is_active ? t("status_active", "Active") : t("tab_inactive", "Inactive")}</span>
                    </div>
                </div>
            }
            badges={
                <>
                    <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                            {t("icon_hub", "hub")}
                        </span>
                        <span>
                            {!cat.ticket_destination || cat.ticket_destination === "wayfinder" || cat.ticket_destination === "keepers_core"
                                ? t("sidebar_keepers_core", "Keepers Core")
                                : cat.ticket_destination.replace(/_/g, " ")}
                        </span>
                    </div>
                    <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                            {t("icon_schedule", "schedule")}
                        </span>
                        <span>{cat.escalation_path || t("standard", "Standard")}</span>
                    </div>
                    {(cat.requires_target_mod || cat.requires_target_user) && (
                        <div className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                {cat.requires_target_mod ? t("icon_extension", "extension") : t("icon_person", "person")}
                            </span>
                            <span>
                                {cat.requires_target_mod && cat.requires_target_user
                                    ? `${t("term_mod", "{Mod}")} + ${t("term_citizen", "{Citizen}")}`
                                    : cat.requires_target_mod
                                      ? t("term_mod", "{Mod}")
                                      : t("term_citizen", "{Citizen}")}
                            </span>
                        </div>
                    )}
                    {cat.custom_fields && cat.custom_fields.length > 0 && (
                        <div className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                {t("icon_tune", "tune")}
                            </span>
                            <span>
                                {cat.custom_fields.length} {t("support_custom_fields_count", "Custom Fields")}
                            </span>
                        </div>
                    )}
                </>
            }
            footer={
                <div className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    <span className="flex items-center gap-1.5 truncate pr-2 font-mono">
                        <span className="material-symbols-outlined !text-[12px] opacity-70">
                            {t("icon_tag", "tag")}
                        </span>
                        {cat.category_code}
                    </span>
                    <span className="text-[var(--text)] group-hover:text-[var(--accent)] transition-all flex items-center gap-1 shrink-0">
                        {t("edit", "Edit")} <span className="text-base leading-none">&rarr;</span>
                    </span>
                </div>
            }
        >
            {cat.description && (
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2">
                    {cat.description}
                </p>
            )}
        </UniversalCard>
    );

    const renderLanding = () => {
        const activeCats = categories.filter(c => c.is_active);
        const inactiveCats = categories.filter(c => !c.is_active);

        return (
            <HubOverviewLanding>
                <HubOverviewSection
                    title={t("recent_active_categories", "Recent Active Categories") || "Recent Active"}
                    icon={t("icon_category", "category")}
                    iconColorClass="text-[var(--accent)]"
                    isEmpty={activeCats.length === 0}
                    emptyState={<EmptyState icon={t("icon_category", "category")} title={t("support_no_cats", "No categories found") || "No Active Categories"} className="py-8" />}
                >
                    {activeCats.slice(0, 4).map(renderCategoryCard)}
                </HubOverviewSection>

                <HubOverviewSection
                    title={t("recent_inactive_categories", "Recent Inactive Categories") || "Recent Inactive"}
                    icon={t("icon_block", "block")}
                    iconColorClass="text-[var(--danger)]"
                    isEmpty={inactiveCats.length === 0}
                    emptyState={<EmptyState icon={t("icon_block", "block")} title={t("support_no_cats", "No categories found") || "No Inactive Categories"} className="py-8" />}
                >
                    {inactiveCats.slice(0, 4).map(renderCategoryCard)}
                </HubOverviewSection>
            </HubOverviewLanding>
        );
    };

    if (embedded) {
        return (
            <>
                <HubListGrid
                    isEmpty={!loading && filteredCategories.length === 0}
                    emptyIcon={t("icon_category", "category")}
                    emptyTitle={t("support_no_cats", "No categories found")}
                >
                    {filteredCategories.map(renderCategoryCard)}
                </HubListGrid>

                <CategoryEditorPanel
                    cat={editingCat}
                    isOpen={!!editingCat}
                    onClose={() => setEditingCat(null)}
                    onSaved={fetchData}
                />
            </>
        );
    }

    return (
        <ElevatedHubLayout
            headerTitle={t("tab_support", "Support Settings") || "Support Settings"}
            headerSubtitle={t("support_settings_desc", "Manage ticket categories and custom fields.") || "Manage ticket categories and custom fields."}
            headerIcon={t("icon_category", "category")}
            headerIconColorClass="theme-text-accent"
            search={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("support_search", "Search categories...") as string}
            hideSearch={filter === 'overview' || filter === 'ALL'}

            tabs={tabs}

            activeTab={filter === "ALL" ? "overview" : filter}
            onTabChange={(id) => setFilter(id)}
            primaryPopover={
                filter !== 'overview' && filter !== 'ALL' ? {
                    icon: t("icon_tune", "tune"),
                    label: t("filters", "Filters") || "Filters",
                    content: (
                        <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("registry_label_status", "Global Status") || "Status"}</span>
                                <CustomDropdown
                                    flat={true}
                                    variant="pill"
                                    disableTint={true}
                                    value={filter === "overview" ? "ALL" : filter}
                                    onChange={(v: string[]) => setFilter(v[0] === "ALL" ? "overview" : v[0])}
                                    options={[
                                        { id: "ALL", label: t("all_classes", "All Categories") },
                                        { id: "ACTIVE", label: t("support_active_only", "Active Only") },
                                        { id: "INACTIVE", label: t("support_inactive_only", "Inactive Only") }
                                    ]}
                                />
                            </div>
                        </div>
                    )
                } : undefined
            }
            actions={
                filter !== 'overview' && filter !== 'ALL' ? [
                    {
                        id: "add",
                        icon: t("icon_add", "add") || "add",
                        label: t("support_add_cat", "Add Category") || "Add Category",
                        onClick: () => openEditor()
                    }
                ] : undefined
            }
        >
            {filter === 'overview' || filter === 'ALL' ? renderLanding() : (
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                        {filteredCategories.map(renderCategoryCard)}
                    </div>
                    {!loading && filteredCategories.length === 0 && (
                        <EmptyState icon={t("icon_inventory_2", "inventory_2")} title={t("support_no_cats", "No categories found")} className="py-8" />
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
                await logArchitectAction(
                    "Updated Keeper Support Category",
                    "keeper_support_categories",
                    draft.category_name,
                    "Updated via Keepers Core Support Settings",
                    "Keepers Core",
                    true,
                    computeAuditDiff(cat, draft)
                );
            } else {
                const { error } = await supabase.from('keeper_support_categories').insert([draft]);
                if (error) throw error;
                await logArchitectAction(
                    "Created Keeper Support Category",
                    "keeper_support_categories",
                    draft.category_name,
                    "Created via Keepers Core Support Settings",
                    "Keepers Core",
                    true,
                    computeAuditDiff(null, draft)
                );
            }
            useStore.getState().pushStatus(t("support_saved_msg", "Category saved successfully"), "success");
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
            await logArchitectAction(
                "Deleted Keeper Support Category",
                "keeper_support_categories",
                draft.category_name,
                "Deleted via Keepers Core Support Settings",
                "Keepers Core",
                true,
                computeAuditDiff(draft, null)
            );
            useStore.getState().pushStatus(t("auto_category_deleted_successfully_34", "Category deleted successfully."), "success");
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
            custom_fields: [...(draft.custom_fields || []), { id: `field_${Date.now()}`, label: t("support_new_field", "New Field"), type: "TEXT INPUT", required: false }]
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
            title={draft.id ? t("support_edit_cat", "Edit Category") : t("support_new_cat", "New Category")}
            subtitle={t("support_sidepanel_subtitle", "Configure support category routing & fields")}
            icon={t("icon_category", "category")}
            iconColorClass="text-[var(--accent)]"
            widthClass="w-[90vw] md:w-[680px]"
            backdropZ="z-[100]"
            panelZ="z-[105]"
            headerActions={
                <PanelHeaderGroup>
                    {draft.id && (
                        <PanelHeaderButton icon={t("icon_delete", "delete")} variant="danger" tooltip={t("purge", "Delete")} onClick={handleDelete} disabled={isSaving} />
                    )}
                    <PanelHeaderButton icon={t("icon_check", "check")} variant="success" tooltip={isSaving ? t("loading", "...") : t("save", "Save")} onClick={save} disabled={isSaving || !draft.category_code || !draft.category_name} />
                </PanelHeaderGroup>
            }
        >
            <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
                <SidePanelHeroCard
                    icon={t("icon_category", "category")}
                    overline={t("tab_support", "Keeper Support Settings")}
                    title={draft.category_name || (draft.id ? t("support_edit_cat", "Edit Category") : t("support_new_cat", "New Category"))}
                    description={t("support_sidepanel_subtitle", "Configure escalation routing, custom fields, and attachment rules.")}
                    badge={draft.is_active ? t("status_active", "Active") : t("tab_inactive", "Inactive")}
                    variant={draft.is_active ? "accent" : "warning"}
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <StatBox
                            label={t("support_destination", "Destination")}
                            value={t("sidebar_keepers_core", "Keepers Core")}
                            icon={t("icon_hub", "hub")}
                        />
                        <StatBox
                            label={t("support_escalation", "Escalation")}
                            value={String(draft.escalation_path || "standard").toUpperCase()}
                            icon={t("icon_schedule", "schedule")}
                        />
                    </div>
                </SidePanelHeroCard>

                <SidePanelTitleInput
                    label={t("registry_label_name", "Category Name")}
                    value={draft.category_name}
                    onChange={(val) => setDraft({ ...draft, category_name: val })}
                    placeholder={t("support_name_ph", "Category Name...")}
                />

                <SidePanelPillToggle
                    label={t("support_active_status", "Category Active")}
                    icon={t("icon_category", "category")}
                    checked={draft.is_active}
                    onChange={(checked) => setDraft({ ...draft, is_active: checked })}
                />

                <UniversalGroup title={t("support_destination", "Routing & Details")} icon={t("icon_route", "route")}>
                <UniversalInput
                    label={t("support_system_code", "System Code")}
                    value={draft.category_code}
                    onChange={(val) => setDraft({ ...draft, category_code: val })}
                    placeholder={t("support_code_ph", "e.g. BUG_REPORT")}
                    className="font-mono"
                />

                <div className="flex gap-4 w-full">
                    <div className="flex flex-col gap-2 flex-1 relative z-20">
                        <label className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("support_destination", "Destination")}</label>
                        <div className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--subtext)] text-sm font-bold font-mono uppercase opacity-50 select-none">
                            {t("sidebar_keepers_core", "Keepers Core")}
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 flex-1 relative z-20">
                        <label className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("support_escalation", "Escalation")}</label>
                        <CustomDropdown disableTint={true}
                            value={draft.escalation_path || 'standard'}
                            onChange={(val: string[]) => setDraft({ ...draft, escalation_path: val[0] as any })}
                            options={[
                                { id: "none", label: t("support_esc_none", "None (Never Escalate)") },
                                { id: "standard", label: t("support_esc_standard", "Standard (72 Hours)") },
                                { id: "urgent", label: t("support_esc_urgent", "Urgent (24 Hours)") }
                            ]}
                        />
                    </div>
                </div>

                <UniversalTextArea
                    label={t("upload_desc", "Description")}
                    value={draft.description}
                    onChange={(val) => setDraft({ ...draft, description: val })}
                    placeholder={t("support_desc_ph", "Describe this support category...")}
                    className="h-24"
                />
                </UniversalGroup>

                <div className="flex flex-col gap-4 mt-4">
                    <div className="flex items-center justify-between border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-2">
                        <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("support_custom_fields", "Custom Fields (Json)")}</span>
                        <button type="button" onClick={addField} className={`${VAULT_CHIP_CLASS} cursor-pointer hover:sa-glass-pill-active transition-all`}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_add", "add")}</span>
                            <span>{t("support_add_field", "Add Field")}</span>
                        </button>
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
                                        placeholder={t("support_field_label_ph", "Field Label")}
                                    />
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex-1">
                                        <CustomDropdown disableTint={true}
                                            value={field.type}
                                            onChange={(val: string[]) => updateField(idx, { type: val[0] as any })}
                                            options={[
                                                { id: "TEXT INPUT", label: t("color_text", "Primary Text") },
                                                { id: "TEXTAREA", label: t("support_type_textarea", "Textarea") },
                                                { id: "DROPDOWN", label: t("support_type_dropdown", "Dropdown") },
                                                { id: "CHECKBOX", label: t("support_type_checkbox", "Checkbox") }
                                            ]}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => updateField(idx, { required: !field.required })}
                                        className={`${VAULT_CHIP_CLASS} !px-3 !py-2 cursor-pointer transition-all ${
                                            field.required
                                                ? "sa-glass-pill-active !text-[var(--text)]"
                                                : "opacity-60 hover:opacity-100 !text-[var(--subtext)] hover:!text-[var(--text)]"
                                        }`}
                                    >
                                        <span className={`material-symbols-outlined !text-[12px] ${field.required ? "text-[var(--accent)]" : "text-[var(--subtext)]"}`}>
                                            {field.required ? t("icon_check_circle", "check_circle") : t("icon_radio_button_unchecked", "radio_button_unchecked")}
                                        </span>
                                        <span>{t("req_short", "REQ")}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => removeField(idx)}
                                        className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-all shrink-0 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                                    </button>
                                </div>
                                {(field.type === "CHECKBOX" || field.type === "DROPDOWN") && (
                                    <div className="flex flex-col gap-2 pl-6 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] mt-2">
                                        <span className="text-[8px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("support_options", "Options")}</span>
                                        {(field.options || []).map((opt, oIdx) => (
                                            <div key={oIdx} className="flex items-center gap-2">
                                                <UniversalInput
                                                    value={opt}
                                                    onChange={val => {
                                                        const newOpts = [...(field.options || [])];
                                                        newOpts[oIdx] = val;
                                                        updateField(idx, { options: newOpts });
                                                    }}
                                                    placeholder={t("support_option_ph", "Option text...")}
                                                    wrapperClassName="flex-1"
                                                />
                                                <button onClick={() => {
                                                    const newOpts = (field.options || []).filter((_, i) => i !== oIdx);
                                                    updateField(idx, { options: newOpts });
                                                }} className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-all shrink-0 cursor-pointer"><span className='material-symbols-outlined !text-[12px]'>{t("icon_close", "close")}</span></button>
                                            </div>
                                        ))}
                                        <button onClick={() => updateField(idx, { options: [...(field.options || []), ""] })} className="w-full glass-surface rounded-md py-1.5 text-[9px] font-black text-center opacity-60 hover:opacity-100 capitalize tracking-widest mt-1">{t("support_add_option", "Add Option")}</button>

                                        <div className="mt-2 pr-2">
                                            <UniversalToggle
                                                checked={field.allow_multi_select || false}
                                                onChange={(val) => updateField(idx, { allow_multi_select: val })}
                                                label={t("support_allow_multi", "Allow Multi-select")}
                                                layout="horizontal-reverse"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <SidePanelPillToggle
                        label={t("support_req_target_mod", "Requires Target {Mod} Uuid")}
                        icon={t("icon_extension", "extension")}
                        checked={draft.requires_target_mod || false}
                        onChange={val => setDraft({...draft, requires_target_mod: val})}
                    />
                    <SidePanelPillToggle
                        label={t("support_req_target_user", "Requires Target User Uuid")}
                        icon={t("icon_person", "person")}
                        checked={draft.requires_target_user || false}
                        onChange={val => setDraft({...draft, requires_target_user: val})}
                    />
                    <SidePanelPillToggle
                        label={t("support_show_title", "Show Title Box")}
                        icon={t("icon_title", "title")}
                        checked={draft.show_title_box || false}
                        onChange={val => setDraft({...draft, show_title_box: val})}
                    />
                    <SidePanelPillToggle
                        label={t("support_show_desc", "Show Description Box")}
                        icon={t("icon_description", "description")}
                        checked={draft.show_description_box || false}
                        onChange={val => setDraft({...draft, show_description_box: val})}
                    />
                    <SidePanelPillToggle
                        label={t("support_show_logs", "Show Logs")}
                        icon={t("icon_history", "history")}
                        checked={draft.show_logs_box || false}
                        onChange={val => setDraft({...draft, show_logs_box: val})}
                    />
                    <SidePanelPillToggle
                        label={t("support_attach_blueprints", "Attach {Blueprints}")}
                        icon={t("icon_architecture", "architecture")}
                        checked={draft.attach_blueprints || false}
                        onChange={val => setDraft({...draft, attach_blueprints: val})}
                    />
                </div>
            </div>
        </SidePanel>
    );
}





