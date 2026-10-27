import { UniversalGroup, UniversalInput, UniversalTextArea, UniversalToggle, SidePanelHeroCard, SidePanelTitleInput, SidePanelPillToggle, StatBox } from '../components/universal/UniversalLayout';
import { useStore } from "../store";
import React, { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { supabase } from "../supabase";
import { SidePanel, CustomDropdown, EmptyState, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, HubListGrid } from "../components/layouts/ElevatedHubLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
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

interface TelemetrySource {
    id: string;
    label: string;
    type: string;
    file_pattern: string;
    search_path: string;
    description: string;
    is_active: boolean;
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
    custom_fields: CustomField[];
    telemetry_config?: {
        sources: string[];
    };
}

export interface SASupportSettingsProps {
    embedded?: boolean;
    externalSearch?: string;
    typeFilter?: "all" | "categories" | "log_sources";
    statusFilter?: "all" | "active" | "inactive";
    openCatRef?: React.MutableRefObject<(() => void) | null>;
    openSourceRef?: React.MutableRefObject<(() => void) | null>;
    onCountsChange?: (count: number) => void;
}

export default function SASupportSettings({
    embedded = false,
    externalSearch = "",
    typeFilter = "all",
    statusFilter = "all",
    openCatRef,
    openSourceRef,
    onCountsChange
}: SASupportSettingsProps = {}) {
    const { t } = useLexicon();
    const [categories, setCategories] = useState<SupportCategory[]>([]);
    const [telemetrySources, setTelemetrySources] = useState<TelemetrySource[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState<"overview" | "active_categories" | "active_log_sources" | "inactive_categories" | "inactive_log_sources">("overview");
    const [editingCat, setEditingCat] = useState<SupportCategory | null>(null);
    const [editingSource, setEditingSource] = useState<TelemetrySource | null>(null);

    const fetchData = async () => {
        setLoading(true);
        const [{ data: cats }, { data: sources }] = await Promise.all([
            supabase.from('sanctuary_support_categories').select('*').order('category_name'),
            supabase.from('sanctuary_telemetry_sources').select('*').order('label')
        ]);
        if (cats) setCategories(cats);
        if (sources) setTelemetrySources(sources);
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (openCatRef) openCatRef.current = () => openEditor();
        if (openSourceRef) openSourceRef.current = () => openSourceEditor();
    });

    useEffect(() => {
        if (onCountsChange) {
            onCountsChange(categories.length + telemetrySources.length);
        }
    }, [categories.length, telemetrySources.length]);

    const openEditor = (cat?: SupportCategory) => {
        if (cat) {
            setEditingCat({ ...cat });
        } else {
            setEditingCat({
                category_code: "",
                category_name: "",
                description: "",
                is_active: true,
                ticket_destination: 'architect',
                escalation_path: 'standard',
                requires_target_mod: false,
                requires_target_user: false,
                show_title_box: true,
                show_description_box: true,
                show_logs_box: true,
                custom_fields: [],
                telemetry_config: { sources: [] }
            });
        }
    };

    const openSourceEditor = (source?: TelemetrySource) => {
        if (source) {
            setEditingSource({ ...source });
        } else {
            setEditingSource({
                id: "",
                label: "",
                type: "MOD",
                file_pattern: "",
                search_path: "%MODS_DIR%",
                description: "",
                is_active: true
            });
        }
    };

    const effectiveSearch = embedded ? externalSearch : searchQuery;

    const filteredCategories = categories
        .filter(c => {
            if (embedded) {
                if (statusFilter === "active" && !c.is_active) return false;
                if (statusFilter === "inactive" && c.is_active) return false;
            } else {
                if (activeTab === "active_categories" && !c.is_active) return false;
                if (activeTab === "inactive_categories" && c.is_active) return false;
            }
            if (effectiveSearch && !c.category_name.toLowerCase().includes(effectiveSearch.toLowerCase()) && !c.category_code.toLowerCase().includes(effectiveSearch.toLowerCase())) return false;
            return true;
        })
        .sort((a, b) => {
            if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
            return (a.category_name || "").localeCompare(b.category_name || "");
        });

    const filteredSources = telemetrySources
        .filter(s => {
            if (embedded) {
                if (statusFilter === "active" && !s.is_active) return false;
                if (statusFilter === "inactive" && s.is_active) return false;
            } else {
                if (activeTab === "active_log_sources" && !s.is_active) return false;
                if (activeTab === "inactive_log_sources" && s.is_active) return false;
            }
            if (effectiveSearch && !s.label.toLowerCase().includes(effectiveSearch.toLowerCase())) return false;
            return true;
        })
        .sort((a, b) => {
            if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
            return (a.label || "").localeCompare(b.label || "");
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
                        <span>{cat.ticket_destination?.replace(/_/g, " ") || t("role_architect", "Architect")}</span>
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

    const renderSourceCard = (source: TelemetrySource) => (
        <UniversalCard
            key={source.id}
            onClick={() => openSourceEditor(source)}
            layout="vertical"
            isGhosted={!source.is_active}
            icon={source.type === 'OS' ? t("icon_memory", "memory") : t("icon_description", "description")}
            title={source.label}
            subtitle={source.type}
            statusColor={source.is_active ? undefined : "border-[color-mix(in_srgb,var(--danger)_50%,transparent)]"}
            imageOverlay={
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                    <div className={VAULT_CHIP_CLASS}>
                        <span className={`material-symbols-outlined !text-[12px] ${source.is_active ? "text-[var(--success)]" : "text-[var(--subtext)]"}`}>
                            {source.is_active ? t("icon_check_circle", "check_circle") : t("icon_cancel", "cancel")}
                        </span>
                        <span>{source.is_active ? t("status_active", "Active") : t("tab_inactive", "Inactive")}</span>
                    </div>
                </div>
            }
            badges={
                source.type === 'OS' ? (
                    <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                            {t("icon_monitoring", "monitoring")}
                        </span>
                        <span>{t("auto_built_in_telemetry", "Built-in Analytics")}</span>
                    </div>
                ) : (
                    <>
                        <div className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_folder", "folder")}
                            </span>
                            <span className="truncate max-w-[140px]">
                                {source.search_path === '%MODS_DIR%'
                                    ? t("mods_folder", "{Mods} Folder")
                                    : source.search_path === '%DOC_DIR%'
                                      ? t("docs_folder", "Sims 4 Documents")
                                      : source.search_path}
                            </span>
                        </div>
                        {source.file_pattern && (
                            <div className={VAULT_CHIP_CLASS}>
                                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                    {t("icon_description", "description")}
                                </span>
                                <span className="truncate max-w-[140px] font-mono">{source.file_pattern}</span>
                            </div>
                        )}
                    </>
                )
            }
            footer={
                <div className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    <span className="flex items-center gap-1.5 truncate pr-2">
                        <span className="material-symbols-outlined !text-[12px] opacity-70">
                            {source.type === 'OS' ? t("icon_memory", "memory") : t("icon_description", "description")}
                        </span>
                        {source.type}
                    </span>
                    <span className="text-[var(--text)] group-hover:text-[var(--accent)] transition-all flex items-center gap-1 shrink-0">
                        {t("edit", "Edit")} <span className="text-base leading-none">&rarr;</span>
                    </span>
                </div>
            }
        >
            {(source.description || source.file_pattern) && (
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2">
                    {source.description || source.file_pattern}
                </p>
            )}
        </UniversalCard>
    );

    if (embedded) {
        return (
            <>
                {typeFilter === "categories" ? (
                    <HubListGrid
                        isEmpty={!loading && filteredCategories.length === 0}
                        emptyIcon={t("icon_category", "category")}
                        emptyTitle={t("support_no_cats", "No categories found")}
                    >
                        {filteredCategories.map(renderCategoryCard)}
                    </HubListGrid>
                ) : typeFilter === "log_sources" ? (
                    <HubListGrid
                        isEmpty={!loading && filteredSources.length === 0}
                        emptyIcon={t("icon_description", "description")}
                        emptyTitle={t("telemetry_no_sources", "No log sources found")}
                    >
                        {filteredSources.map(renderSourceCard)}
                    </HubListGrid>
                ) : (
                    <HubOverviewLanding>
                        <HubOverviewSection
                            icon={t("icon_category", "category")}
                            iconColorClass="text-[var(--accent)]"
                            title={t("active_categories", "Active Categories") || "Categories"}
                            isEmpty={!loading && filteredCategories.length === 0}
                            emptyIcon={t("icon_category", "category")}
                            emptyTitle={t("support_no_cats", "No categories found")}
                        >
                            {filteredCategories.map(renderCategoryCard)}
                        </HubOverviewSection>
                        <HubOverviewSection
                            icon={t("icon_description", "description")}
                            iconColorClass="text-[var(--success)]"
                            title={t("active_log_sources", "Active Log Sources") || "Log Sources"}
                            isEmpty={!loading && filteredSources.length === 0}
                            emptyIcon={t("icon_description", "description")}
                            emptyTitle={t("telemetry_no_sources", "No log sources found")}
                        >
                            {filteredSources.map(renderSourceCard)}
                        </HubOverviewSection>
                    </HubOverviewLanding>
                )}

                <CategoryEditorPanel
                    cat={editingCat}
                    isOpen={!!editingCat}
                    onClose={() => setEditingCat(null)}
                    onSaved={fetchData}
                    telemetrySources={telemetrySources}
                />

                <TelemetrySourceEditorPanel
                    source={editingSource}
                    isOpen={!!editingSource}
                    onClose={() => setEditingSource(null)}
                    onSaved={fetchData}
                />
            </>
        );
    }

    return (
        <ElevatedHubLayout
            headerTitle={t("tab_support", "Support Settings") || "Support Settings"}
            headerSubtitle={t("support_subtitle", "Configure support categories and telemetry") || "Configure support categories and telemetry"}
            headerIcon="support_agent"
            headerIconColorClass="theme-text-accent"
            search={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("support_search", "Search categories...") as string}
            hideSearch={activeTab === 'overview'}
            activeTab={activeTab}
            onTabChange={setActiveTab as any}
            tabs={[
                { id: 'overview', label: t("overview", "Overview") || "Overview", icon: "dashboard", number: (categories.length + telemetrySources.length).toString() },
                { id: 'active_categories', label: t("active_categories", "Active Categories") || "Active Categories", icon: "category", number: categories.filter(c => c.is_active).length.toString() },
                { id: 'active_log_sources', label: t("active_log_sources", "Active Log Sources") || "Active Log Sources", icon: "description", number: telemetrySources.filter(s => s.is_active).length.toString() },
                { id: 'inactive_categories', label: t("inactive_categories", "Inactive Categories") || "Inactive Categories", icon: "block", number: categories.filter(c => !c.is_active).length.toString() },
                { id: 'inactive_log_sources', label: t("inactive_log_sources", "Inactive Log Sources") || "Inactive Log Sources", icon: "cancel", number: telemetrySources.filter(s => !s.is_active).length.toString() }
            ]}
            actions={
                activeTab !== 'overview' ? [
                    {
                        id: "add",
                        icon: t("icon_add", "add") || "add",
                        label: activeTab.includes('categories') ? (t("support_add_cat", "Add Category") || "Add Category") : (t("telemetry_add_source", "Add Source") || "Add Source"),
                        onClick: () => activeTab.includes('categories') ? openEditor() : openSourceEditor()
                    }
                ] : undefined
            }
        >
            {activeTab === 'overview' && (
                <HubOverviewLanding>
                    <HubOverviewSection
                        icon="category"
                        iconColorClass="text-[var(--accent)]"
                        title={t("active_categories", "Active Categories") || "Active Categories"}
                        isEmpty={categories.filter(c => c.is_active).length === 0}
                        emptyIcon="category"
                        emptyTitle={t("support_no_cats", "No categories found") || "No Active Categories"}
                    >
                        {categories.filter(c => c.is_active).slice(0, 4).map(renderCategoryCard)}
                    </HubOverviewSection>
                    <HubOverviewSection
                        icon="description"
                        iconColorClass="text-[var(--success)]"
                        title={t("active_log_sources", "Active Log Sources") || "Active Log Sources"}
                        isEmpty={telemetrySources.filter(s => s.is_active).length === 0}
                        emptyIcon="description"
                        emptyTitle={t("telemetry_no_sources", "No log sources found") || "No Active Log Sources"}
                    >
                        {telemetrySources.filter(s => s.is_active).slice(0, 4).map(renderSourceCard)}
                    </HubOverviewSection>
                </HubOverviewLanding>
            )}

            {activeTab.includes('categories') && (
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                        {filteredCategories.map(renderCategoryCard)}
                    </div>
                    {!loading && filteredCategories.length === 0 && (
                        <EmptyState icon={t("icon_inventory_2", "inventory_2")} title={t("support_no_cats", "No categories found")} className="py-8" />
                    )}
                </div>
            )}

            {activeTab.includes('log_sources') && (
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 auto-rows-fr">
                        {filteredSources.map(renderSourceCard)}
                    </div>
                    {!loading && filteredSources.length === 0 && (
                        <EmptyState icon={t("icon_inventory_2", "inventory_2")} title={t("telemetry_no_sources", "No log sources found")} className="py-8" />
                    )}
                </div>
            )}

            <CategoryEditorPanel
                cat={editingCat}
                isOpen={!!editingCat}
                onClose={() => setEditingCat(null)}
                onSaved={fetchData}
                telemetrySources={telemetrySources}
            />

            <TelemetrySourceEditorPanel
                source={editingSource}
                isOpen={!!editingSource}
                onClose={() => setEditingSource(null)}
                onSaved={fetchData}
            />
        </ElevatedHubLayout>
    );
}

function CategoryEditorPanel({ cat, isOpen, onClose, onSaved, telemetrySources }: { cat: SupportCategory | null, isOpen: boolean, onClose: () => void, onSaved: () => void, telemetrySources: TelemetrySource[] }) {
    const { t } = useLexicon();
    const [draft, setDraft] = useState<SupportCategory | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [actionReason, setActionReason] = useState("");

    useEffect(() => {
        setDraft(cat);
        setActionReason("");
    }, [cat]);

    if (!isOpen || !draft) return null;

    const save = async () => {
        if (!actionReason.trim()) {
            useStore.getState().pushStatus(t("reason_required", "Reason required for Audit Logs."), "error");
            return;
        }
        setIsSaving(true);
        try {
            if (draft.id) {
                const { error } = await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'sanctuary_support_categories', p_payload: draft });
                if (error) throw error;
                await logArchitectAction("Updated Support Category", "sanctuary_support_categories", draft.category_name, actionReason, "Oversight Command", false, computeAuditDiff(cat, draft));
            } else {
                const { error } = await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'sanctuary_support_categories', p_payload: draft });
                if (error) throw error;
                await logArchitectAction("Created Support Category", "sanctuary_support_categories", draft.category_name, actionReason, "Oversight Command", false, computeAuditDiff(null, draft));
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
        if (!actionReason.trim()) {
            useStore.getState().pushStatus(t("reason_required", "Reason required for Audit Logs."), "error");
            return;
        }
        if (!draft.id) return;
        setIsSaving(true);
        try {
            const { error } = await supabase.rpc('secure_delete_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'sanctuary_support_categories', p_id: draft.id });
            if (error) throw error;
            await logArchitectAction("Deleted Support Category", "sanctuary_support_categories", draft.category_name, actionReason, "Oversight Command", false, computeAuditDiff(draft, null));
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
                        <PanelHeaderButton icon="delete" variant="danger" tooltip={t("purge", "Delete")} onClick={handleDelete} disabled={isSaving || !actionReason} />
                    )}
                    <PanelHeaderButton icon="check" variant="success" tooltip={isSaving ? "..." : t("save", "Save")} onClick={save} disabled={isSaving || !draft.category_code || !draft.category_name || !actionReason} />
                </PanelHeaderGroup>
            }
        >
            <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
                <SidePanelHeroCard
                    icon={t("icon_category", "category")}
                    overline={t("tab_support", "Support Category")}
                    title={draft.category_name || (draft.id ? t("support_edit_cat", "Edit Category") : t("support_new_cat", "New Category"))}
                    description={t("support_sidepanel_subtitle", "Configure escalation routing, custom fields, and telemetry rules.")}
                    badge={draft.is_active ? t("status_active", "Active") : t("tab_inactive", "Inactive")}
                    variant={draft.is_active ? "accent" : "warning"}
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <StatBox
                            label={t("support_destination", "Destination")}
                            value={String(draft.ticket_destination || "architect").toUpperCase()}
                            icon={t("icon_hub", "hub")}
                        />
                        <StatBox
                            label={t("support_escalation", "Escalation")}
                            value={String(draft.escalation_path || "standard").toUpperCase()}
                            icon={t("icon_schedule", "schedule")}
                        />
                    </div>
                </SidePanelHeroCard>

                <UniversalGroup title={t("audit_reason_req", "Audit Reason Required")} icon={t("icon_history", "history")} headerColorClass="text-[var(--warning)]">
                    <input
                        type="text"
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder={t("describe_change", "Describe the reason for this change...")}
                        className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--warning)] transition-all font-mono border border-[color-mix(in_srgb,var(--warning)_35%,transparent)]"
                    />
                </UniversalGroup>

                <SidePanelTitleInput
                    label={t("registry_label_name", "Category Name")}
                    value={draft.category_name}
                    onChange={val => setDraft({ ...draft, category_name: val })}
                    placeholder={t("support_name_ph", "Category Name...")}
                />

                <SidePanelPillToggle
                    label={t("support_active_status", "Category Active")}
                    icon="category"
                    checked={draft.is_active}
                    onChange={val => setDraft({ ...draft, is_active: val })}
                />

                <div className="flex flex-col gap-2 w-full">
                    <label className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("support_system_code", "System Code")}</label>
                    <input
                        type="text"
                        value={draft.category_code}
                        onChange={e => setDraft({ ...draft, category_code: e.target.value })}
                        className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all font-mono"
                        placeholder={t("support_code_ph", "e.g. BUG_REPORT")}
                    />
                </div>

                <div className="flex gap-4 w-full">
                    <div className="flex flex-col gap-2 flex-1 relative z-20">
                        <label className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("support_destination", "Destination")}</label>
                        <CustomDropdown disableTint={true}
                            value={draft.ticket_destination || 'architect'}
                            onChange={(val: string[]) => setDraft({ ...draft, ticket_destination: val[0] as any })}
                            options={[
                                { id: "mod_author", label: "Mod Author" },
                                { id: "architect", label: "Architect" },
                                { id: "oversight", label: "Oversight" },
                                { id: "wayfinder", label: "Wayfinder" }
                            ]}
                        />
                    </div>
                    <div className="flex flex-col gap-2 flex-1 relative z-20">
                        <label className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("support_escalation", "Escalation")}</label>
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

                <div className="flex flex-col gap-2 w-full">
                    <label className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("upload_desc", "Description")}</label>
                    <textarea
                        value={draft.description}
                        onChange={e => setDraft({ ...draft, description: e.target.value })}
                        className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all h-24 resize-none"
                        placeholder={t("support_desc_ph", "Please complete this intake form...")}
                    />
                </div>

                <div className="flex flex-col gap-4 mt-4">
                    <div className="flex items-center justify-start border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-2">
                        <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("support_custom_fields", "Custom Fields (Json)")}</span>
                        <button onClick={addField} className="text-[9px] font-black capitalize tracking-widest text-[var(--accent)] hover:opacity-80">+ {t("support_add_field", "Add Field")}</button>
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
                                <div className="flex items-center gap-4">
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
                                    <button onClick={() => updateField(idx, { required: !field.required })} className={`px-4 py-2 rounded-lg text-[9px] font-black transition-all border ${field.required ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-md' : 'bg-transparent border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'}`}>{t("req_short", "REQ")}</button>
                                    <button onClick={() => removeField(idx)} className="text-[color-mix(in_srgb,var(--danger)_70%,transparent)] hover:text-red-500 font-bold p-2 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] rounded-lg transition-all"><span className='material-symbols-outlined !text-[12px]'>{t("icon_close", "close")}</span></button>
                                </div>
                                {(field.type === "CHECKBOX" || field.type === "DROPDOWN") && (
                                    <div className="flex flex-col gap-2 pl-6 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] mt-2">
                                        <span className="text-[8px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("support_options", "Options")}</span>
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
                                                    className="flex-1 glass-surface rounded-md px-3 py-1.5 text-xs outline-none"
                                                    placeholder={t("support_option_ph", "Option text...")}
                                                />
                                                <button onClick={() => {
                                                    const newOpts = (field.options || []).filter((_, i) => i !== oIdx);
                                                    updateField(idx, { options: newOpts });
                                                }} className="text-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:text-red-500 p-1"><span className='material-symbols-outlined !text-[12px]'>{t("icon_close", "close")}</span></button>
                                            </div>
                                        ))}
                                        <button onClick={() => updateField(idx, { options: [...(field.options || []), ""] })} className="w-full glass-surface rounded-md py-1.5 text-[9px] font-black text-center opacity-60 hover:opacity-100 capitalize tracking-widest mt-1">{t("support_add_option", "Add Option")}</button>

                                        <div className="flex items-center justify-start mt-2 pr-2">
                                            <span className="text-[8px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("support_allow_multi", "Allow Multi-select")}</span>
                                            <label className="relative inline-flex items-center cursor-pointer scale-75">
                                                <input type="checkbox" className="sr-only peer" checked={field.allow_multi_select || false} onChange={e => updateField(idx, { allow_multi_select: e.target.checked })} />
                                                <div className="w-11 h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full peer peer-checked:bg-[var(--accent)] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <div className="flex items-center justify-between p-4 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group">
                        <span className={`text-[9px] font-black capitalize tracking-widest transition-colors flex items-center gap-2 ${draft.requires_target_mod ? 'theme-text-accent' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                            <span className="material-symbols-outlined !text-[14px]">extension</span>
                            {t("support_req_target_mod", "Requires Target {Mod} Uuid")}
                        </span>
                        <UniversalToggle checked={draft.requires_target_mod || false} onChange={val => setDraft({...draft, requires_target_mod: val})} />
                    </div>

                    <div className="flex items-center justify-between p-4 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group">
                        <span className={`text-[9px] font-black capitalize tracking-widest transition-colors flex items-center gap-2 ${draft.requires_target_user ? 'theme-text-accent' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                            <span className="material-symbols-outlined !text-[14px]">person</span>
                            {t("support_req_target_user", "Requires Target User Uuid")}
                        </span>
                        <UniversalToggle checked={draft.requires_target_user || false} onChange={val => setDraft({...draft, requires_target_user: val})} />
                    </div>

                    <div className="flex items-center justify-between p-4 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group">
                        <span className={`text-[9px] font-black capitalize tracking-widest transition-colors flex items-center gap-2 ${draft.show_title_box ? 'theme-text-accent' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                            <span className="material-symbols-outlined !text-[14px]">title</span>
                            {t("support_show_title", "Show Title Box")}
                        </span>
                        <UniversalToggle checked={draft.show_title_box || false} onChange={val => setDraft({...draft, show_title_box: val})} />
                    </div>

                    <div className="flex items-center justify-between p-4 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group">
                        <span className={`text-[9px] font-black capitalize tracking-widest transition-colors flex items-center gap-2 ${draft.show_description_box ? 'theme-text-accent' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                            <span className="material-symbols-outlined !text-[14px]">description</span>
                            {t("support_show_desc", "Show Description Box")}
                        </span>
                        <UniversalToggle checked={draft.show_description_box || false} onChange={val => setDraft({...draft, show_description_box: val})} />
                    </div>

                    <div className="flex items-center justify-between p-4 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group">
                        <span className={`text-[9px] font-black capitalize tracking-widest transition-colors flex items-center gap-2 ${draft.show_logs_box ? 'theme-text-accent' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                            <span className="material-symbols-outlined !text-[14px]">history</span>
                            {t("support_show_logs", "Show Logs")}
                        </span>
                        <UniversalToggle checked={draft.show_logs_box || false} onChange={val => setDraft({...draft, show_logs_box: val})} />
                    </div>
                </div>

                <div className="flex flex-col gap-4 mt-6 pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("tab_support", "Support Settings")}</span>
                        <span className="text-[9px] font-bold capitalize tracking-widest opacity-50">{t("support_telemetry_desc", "Automatically request logs from the {citizen} when this category is selected")}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-3 p-4 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                            <span className="text-[9px] font-black capitalize tracking-widest theme-text-accent flex items-center gap-2 mb-2"><span className="material-symbols-outlined !text-[14px]">{t("icon_bug_report", "bug_report")}</span> {t("support_mod_reports", "{Mod} Bug Reports")}</span>
                            {telemetrySources.filter(s => s.type === 'MOD' && s.is_active).map(source => (
                                <div key={source.id} className="flex items-center justify-between group py-1">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-bold capitalize tracking-widest text-[var(--subtext)]">{source.label}</span>
                                        <span className="text-[8px] font-bold capitalize tracking-widest opacity-40">{source.description || source.file_pattern}</span>
                                    </div>
                                    <UniversalToggle 
                                        checked={draft.telemetry_config?.sources?.includes(source.id) || false} 
                                        onChange={val => {
                                            const currentSources = draft.telemetry_config?.sources || [];
                                            const newSources = val ? [...currentSources, source.id] : currentSources.filter((id: string) => id !== source.id);
                                            setDraft({ ...draft, telemetry_config: { sources: newSources } });
                                        }} 
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col gap-3 p-4 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                            <span className="text-[9px] font-black capitalize tracking-widest opacity-60 flex items-center gap-2 mb-2"><span className="material-symbols-outlined !text-[14px]">{t("icon_memory", "memory")}</span> {t("support_os_reports", "Sanctuary OS Bug Reports")}</span>
                            {telemetrySources.filter(s => s.type === 'OS' && s.is_active).map(source => (
                                <div key={source.id} className="flex items-center justify-between group py-1">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-bold capitalize tracking-widest text-[var(--subtext)]">{source.label}</span>
                                        <span className="text-[8px] font-bold capitalize tracking-widest opacity-40">{source.description || source.file_pattern}</span>
                                    </div>
                                    <UniversalToggle 
                                        checked={draft.telemetry_config?.sources?.includes(source.id) || false} 
                                        onChange={val => {
                                            const currentSources = draft.telemetry_config?.sources || [];
                                            const newSources = val ? [...currentSources, source.id] : currentSources.filter((id: string) => id !== source.id);
                                            setDraft({ ...draft, telemetry_config: { sources: newSources } });
                                        }} 
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </SidePanel>
    );
}

function TelemetrySourceEditorPanel({ source, isOpen, onClose, onSaved }: { source: TelemetrySource | null, isOpen: boolean, onClose: () => void, onSaved: () => void }) {
    const { t } = useLexicon();
    const [draft, setDraft] = useState<TelemetrySource | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [actionReason, setActionReason] = useState("");

    useEffect(() => {
        if (isOpen && source) {
            setDraft(JSON.parse(JSON.stringify(source)));
            setActionReason("");
        }
    }, [isOpen, source]);

    if (!isOpen || !draft) return null;

    const save = async () => {
        if (!actionReason.trim()) {
            useStore.getState().pushStatus(t("reason_required", "Reason required for Audit Logs."), "error");
            return;
        }
        if (!draft.label || (draft.type !== 'OS' && (!draft.file_pattern || !draft.search_path))) {
            useStore.getState().pushStatus(t("support_error_fields", "Please fill out all required fields."), "error");
            return;
        }

        setIsSaving(true);
        try {
            if (draft.id) {
                const { error } = await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'sanctuary_telemetry_sources', p_payload: draft });
                if (error) throw error;
                await logArchitectAction("Updated Log Source", "sanctuary_telemetry_sources", draft.label, actionReason, "Oversight Command", false, computeAuditDiff(source, draft));
            } else {
                const { id, ...insertData } = draft;
                const { error } = await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'sanctuary_telemetry_sources', p_payload: insertData });
                if (error) throw error;
                await logArchitectAction("Created Log Source", "sanctuary_telemetry_sources", draft.label, actionReason, "Oversight Command", false, computeAuditDiff(null, insertData));
            }
            useStore.getState().pushStatus(t("auto_log_source_saved_34", "Log source saved."), "success");
            onSaved();
            onClose();
        } catch (e: any) {
            useStore.getState().pushStatus(e.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const deleteSource = async () => {
        if (!actionReason.trim()) {
            useStore.getState().pushStatus(t("reason_required", "Reason required for Audit Logs."), "error");
            return;
        }
        if (!draft.id) return;
        setIsSaving(true);
        try {
            const { error } = await supabase.rpc('secure_delete_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'sanctuary_telemetry_sources', p_id: draft.id });
            if (error) throw error;
            await logArchitectAction("Deleted Log Source", "sanctuary_telemetry_sources", draft.label, actionReason, "Oversight Command", false, computeAuditDiff(draft, null));
            useStore.getState().pushStatus(t("auto_log_source_deleted_36", "Log source deleted."), "success");
            onSaved();
            onClose();
        } catch (e: any) {
            useStore.getState().pushStatus(e.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SidePanel
            isOpen={isOpen}
            onClose={onClose}
            title={draft.id ? t("telemetry_edit_source", "Edit Log Source") : t("telemetry_new_source", "New Log Source")}
            subtitle={t("telemetry_subtitle", "Configure diagnostic log source paths & patterns")}
            icon={t("icon_data_object", "data_object")}
            iconColorClass="text-[var(--accent)]"
            widthClass="w-[90vw] md:w-[640px]"
            backdropZ="z-[100]"
            panelZ="z-[105]"
            headerActions={
                <PanelHeaderGroup>
                    {draft.id && (
                        <PanelHeaderButton icon="delete" variant="danger" tooltip={t("purge", "Delete")} onClick={deleteSource} disabled={isSaving} />
                    )}
                    <PanelHeaderButton icon="check" variant="success" tooltip={isSaving ? t("btn_saving", "Saving...") : t("save", "Save")} onClick={save} disabled={isSaving} />
                </PanelHeaderGroup>
            }
        >
            <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
                <SidePanelHeroCard
                    icon={t("icon_data_object", "data_object")}
                    overline={t("telemetry_subtitle", "Diagnostic Log Source")}
                    title={draft.label || (draft.id ? t("telemetry_edit_source", "Edit Log Source") : t("telemetry_new_source", "New Log Source"))}
                    description={draft.file_pattern || t("telemetry_subtitle", "Configure automated log collection for support tickets.")}
                    badge={draft.type}
                    variant={draft.is_active ? "accent" : "warning"}
                />

                <UniversalGroup title={t("telemetry_reason", "Audit Reason Required")} icon={t("icon_history", "history")} headerColorClass="text-[var(--warning)]">
                    <input
                        type="text"
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder={t("describe_change", "Describe the reason for this change...")}
                        className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-xs font-bold focus:outline-none focus:border-[var(--warning)] transition-all border border-[color-mix(in_srgb,var(--warning)_35%,transparent)]"
                    />
                </UniversalGroup>
                <UniversalGroup title="SOURCE DETAILS" icon="info" headerColorClass="theme-text-accent">
                    <UniversalInput 
                        label={t("telemetry_label", "Source Label")} 
                        value={draft.label} 
                        onChange={val => setDraft({ ...draft, label: val })} 
                        placeholder={t("telemetry_label_ph", "e.g. MCCC Exception Logs")} 
                    />

                    <div className="flex flex-col gap-2 relative z-50">
                        <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("telemetry_type", "Category Type")}</label>
                        <CustomDropdown disableTint={true} value={draft.type} onChange={(v: string[]) => setDraft({ ...draft, type: v[0] as any })} options={[{ id: 'MOD', label: 'MOD' }, { id: 'OS', label: 'OS' }]} />
                    </div>

                    {draft.type !== 'OS' && (
                        <>
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-col gap-2 relative z-40">
                                    <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center justify-start">
                                        <span>{t("telemetry_prefix", "File Path Prefix")}</span>
                                    </label>
                                    <CustomDropdown disableTint={true}
                                        value={['%MODS_DIR%', '%DOC_DIR%'].includes(draft.search_path) ? draft.search_path : 'CUSTOM'}
                                        onChange={(v: string[]) => setDraft({ ...draft, search_path: v[0] === 'CUSTOM' ? '' : v[0] })}
                                        options={[
                                            { id: '%MODS_DIR%', label: 'Mods Folder' },
                                            { id: '%DOC_DIR%', label: 'Sims 4 Documents Folder' },
                                            { id: 'CUSTOM', label: 'Custom Path...' }
                                        ]}
                                    />
                                </div>
                                {!['%MODS_DIR%', '%DOC_DIR%'].includes(draft.search_path) && (
                                    <UniversalInput 
                                        label={t("auto_custom_path", "Custom Path")} 
                                        value={draft.search_path} 
                                        onChange={val => setDraft({ ...draft, search_path: val })} 
                                        placeholder={t("auto_e_g_c_17", "e.g. %DOC_DIR%\\Logs")} 
                                        className="font-mono"
                                        wrapperClassName="pl-4 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] mt-1"
                                    />
                                )}
                            </div>

                            <UniversalInput 
                                label={t("telemetry_pattern", "File Pattern")} 
                                value={draft.file_pattern} 
                                onChange={val => setDraft({ ...draft, file_pattern: val })} 
                                placeholder={t("telemetry_pattern_ph", "e.g. lastexception*.txt; MCCC/mc_lastexception.html")} 
                                className="font-mono"
                            />
                        </>
                    )}

                    <UniversalTextArea 
                        label={t("upload_desc", "Description")} 
                        value={draft.description} 
                        onChange={val => setDraft({ ...draft, description: val })} 
                        placeholder={t("telemetry_desc_ph", "Brief explanation...")} 
                        className="min-h-[80px]"
                    />

                    <UniversalToggle 
                        label={t("telemetry_is_active", "Is Active")} 
                        checked={draft.is_active} 
                        onChange={val => setDraft({ ...draft, is_active: val })} 
                        layout="horizontal-reverse" 
                    />
                </UniversalGroup>
            </div>
        </SidePanel>
    );
}




