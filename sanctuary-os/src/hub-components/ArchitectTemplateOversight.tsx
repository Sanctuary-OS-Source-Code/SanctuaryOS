import React, { useState, useEffect, useMemo } from "react";
import { supabaseServices } from "../lib/supabase-services";
import { useLexicon } from "../LexiconContext";
import { SidePanel, CustomDropdown, EmptyState, PanelHeaderGroup, PanelHeaderButton, StatBox } from "../shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelHeroCard, SidePanelTitleInput, UniversalGroup } from "../components/layouts/ElevatedHubLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
import { DynamicTemplatePreviewBanner } from "../chameleon-components/ThemeCard";
import TemplatePreviewer from "../TemplatePreviewer";

const VAULT_CHIP_CLASS =
    "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";
import { supabase } from "../supabase";
import { useStore } from "../store";

export default function ArchitectTemplateOversight() {
    const { t } = useLexicon();
    const incrementCommunityDefaultsRefreshTrigger = useStore(state => state.incrementCommunityDefaultsRefreshTrigger);
    const [trackedFiles, setTrackedFiles] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [selectedFileGroup, setSelectedFileGroup] = useState<string | null>(null);
    const [selectedTemplateForPreview, setSelectedTemplateForPreview] = useState<any | null>(null);

    const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
    const [newFileName, setNewFileName] = useState("");

    const [isSettingDefault, setIsSettingDefault] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [fileSearch, setFileSearch] = useState("");
    const [fileSort, setFileSort] = useState<string>("date");

    const [tmplSearch, setTmplSearch] = useState("");
    const [tmplSort, setTmplSort] = useState<string>("date");

    const [activeFilterTab, setActiveFilterTab] = useState<"overview" | "active" | "flagged">("overview");
    const [flaggedTemplateIds, setFlaggedTemplateIds] = useState<string[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            const [trackedRes, tmplRes, ticketsRes] = await Promise.all([
                supabaseServices.getTrackedTemplateFiles(),
                supabaseServices.getWorkbenchTemplates(),
                supabase.from('sanctuary_tickets').select('metadata').eq('ticket_type', 'TEMPLATE_FLAG').not('status', 'in', '("closed","resolved")')
            ]);

            if (!trackedRes.error && trackedRes.data) {
                setTrackedFiles(trackedRes.data);
            }
            if (!tmplRes.error && tmplRes.data) {
                setTemplates(tmplRes.data.map((tmpl: any) => {
                    let parsedJson: any = {};
                    try { parsedJson = JSON.parse(tmpl.json_data); } catch (e) { }
                    return {
                        ...tmpl,
                        parsedData: parsedJson,
                        targetFile: parsedJson.target_file || tmpl.name
                    };
                }));
            }
            if (ticketsRes && ticketsRes.data) {
                const ids = ticketsRes.data.map((t: any) => t.metadata?.target_mod_id).filter(Boolean);
                setFlaggedTemplateIds(ids);
            }
            setIsLoading(false);
        };
        fetchData();
    }, [refreshTrigger]);

    const handleAddSubmit = async () => {
        if (newFileName && newFileName.trim()) {
            const { data: { session } } = await supabase.auth.getSession();
            await supabaseServices.addTrackedTemplateFile(newFileName.trim(), session?.user?.id || "");
            setNewFileName("");
            setIsAddPanelOpen(false);
            setRefreshTrigger(prev => prev + 1);
        }
    };

    const handleSetDefault = async (tmpl: any) => {
        setIsSettingDefault(tmpl.id);
        const res = await supabaseServices.setCommunityDefaultTemplate(tmpl.id, tmpl.targetFile);
        if (res.error) {
            console.error("Failed to set default:", res.error);
            alert((t("identities_failed_prefix", "Failed to set default:")) + " " + res.error.message);
        } else {
            incrementCommunityDefaultsRefreshTrigger();
        }
        setIsSettingDefault(null);
        setSelectedTemplateForPreview(null);
        setRefreshTrigger(prev => prev + 1);
    };

    const processedFiles = useMemo(() => {
        let filtered = trackedFiles;
        if (activeFilterTab === "flagged") {
            filtered = filtered.filter(f => {
                const fileTemplates = templates.filter(t => t.targetFile === f.file_name);
                return fileTemplates.some(t => flaggedTemplateIds.includes(t.id));
            });
        }
        if (fileSearch) {
            filtered = filtered.filter(f => f.file_name.toLowerCase().includes(fileSearch.toLowerCase()));
        }
        return filtered.sort((a, b) => {
            if (fileSort === "name") return a.file_name.localeCompare(b.file_name);
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    }, [trackedFiles, fileSearch, fileSort, activeFilterTab, templates, flaggedTemplateIds]);

    const processedTemplates = useMemo(() => {
        if (!selectedFileGroup) return [];
        let filtered = templates.filter(t => t.targetFile === selectedFileGroup && t.is_public !== false);
        if (activeFilterTab === "flagged") {
            filtered = filtered.filter(t => flaggedTemplateIds.includes(t.id));
        }
        if (tmplSearch) {
            filtered = filtered.filter(t =>
                (t.name || "").toLowerCase().includes(tmplSearch.toLowerCase()) ||
                (t.author || "").toLowerCase().includes(tmplSearch.toLowerCase())
            );
        }
        return filtered.sort((a, b) => {
            if (tmplSort === "name") return (a.name || "").localeCompare(b.name || "");
            if (tmplSort === "downloads") return (b.downloads || 0) - (a.downloads || 0);
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    }, [templates, selectedFileGroup, tmplSearch, tmplSort, activeFilterTab, flaggedTemplateIds]);

    const flaggedFiles = trackedFiles.filter(f => {
        const fileTemplates = templates.filter(t => t.targetFile === f.file_name);
        return fileTemplates.some(t => flaggedTemplateIds.includes(t.id));
    });

    const tabs = [
        {
            id: "overview",
            label: t("overview", "Overview"),
            icon: t("icon_dashboard", "dashboard"),
            number: trackedFiles.length.toString(),
        },
        {
            id: "active",
            label: t("status_active", "Active"),
            icon: t("icon_description", "description"),
            number: trackedFiles.length.toString(),
        },
        {
            id: "flagged",
            label: t("flagged", "Flagged"),
            icon: t("icon_flag", "flag"),
            number: flaggedFiles.length.toString(),
        }
    ];

    const renderTrackedFileCard = (tf: any) => {
        const groupTemplates = templates.filter(t => t.targetFile === tf.file_name);
        const defaultTmpl = groupTemplates.find(t => t.is_community_default);
        const hasFlagged = groupTemplates.some(t => flaggedTemplateIds.includes(t.id));

        const statusLabel = hasFlagged
            ? t("flagged", "Flagged")
            : defaultTmpl
                ? t("active_default", "Default")
                : t("status_active", "Active");
        const statusIcon = hasFlagged
            ? t("icon_flag", "flag")
            : defaultTmpl
                ? t("icon_verified", "verified")
                : t("icon_description", "description");
        const statusIconColor = hasFlagged
            ? "text-[var(--warning)]"
            : defaultTmpl
                ? "text-[var(--success)]"
                : "text-[var(--accent)]";

        return (
            <UniversalCard
                key={tf.id}
                onClick={() => { setSelectedFileGroup(tf.file_name); setSelectedTemplateForPreview(null); }}
                layout="vertical"
                icon={t("icon_description", "description")}
                customIcon={
                    <DynamicTemplatePreviewBanner
                        data={defaultTmpl || groupTemplates[0] || { name: tf.file_name, target_file: tf.file_name }}
                        heightClass="h-full"
                    />
                }
                title={tf.file_name}
                subtitle={
                    defaultTmpl
                        ? `${t("active_default", "Default")}: ${defaultTmpl.name}`
                        : `${groupTemplates.length} ${groupTemplates.length === 1 ? t("workbench_template", "Template") : t("ql_templates", "Templates")} ${t("available", "Available")}`
                }
                statusColor={defaultTmpl ? "border-[var(--success)]" : undefined}
                imageOverlay={
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                        <div className={VAULT_CHIP_CLASS}>
                            <span className={`material-symbols-outlined !text-[12px] ${statusIconColor}`}>
                                {statusIcon}
                            </span>
                            <span>{statusLabel}</span>
                        </div>
                    </div>
                }
                badges={
                    <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                            {t("icon_data_object", "data_object")}
                        </span>
                        <span>
                            {groupTemplates.length} {groupTemplates.length === 1 ? t("workbench_template", "Template") : t("ql_templates", "Templates")}
                        </span>
                    </div>
                }
                footer={
                    <div className="flex justify-between items-center w-full">
                        <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
                            {tf.created_at ? new Date(tf.created_at).toLocaleDateString() : t("status_active", "Active")}
                        </span>
                        <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
                            {t("btn_view", "View")} <span className="text-base leading-none">&rarr;</span>
                        </span>
                    </div>
                }
            />
        );
    };

    const renderLanding = () => (
        <HubOverviewLanding>
            <HubOverviewSection
                icon="description"
                iconColorClass="text-[var(--accent)]"
                title={t("recent_active_files", "Recent Active")}
                isEmpty={trackedFiles.length === 0}
                emptyIcon="description"
                emptyTitle={t("no_tracked_files", "No Active Files")}
            >
                {trackedFiles.slice(0, 4).map(renderTrackedFileCard)}
            </HubOverviewSection>

            <HubOverviewSection
                icon="flag"
                iconColorClass="text-[var(--warning)]"
                title={t("recent_flagged_files", "Recent Flagged")}
                isEmpty={flaggedFiles.length === 0}
                emptyIcon="flag"
                emptyTitle={t("no_issues", "No Flagged Files")}
            >
                {flaggedFiles.slice(0, 4).map(renderTrackedFileCard)}
            </HubOverviewSection>
        </HubOverviewLanding>
    );

    return (
        <>
            <ElevatedHubLayout
                headerTitle={t("architect_templates", "Template Oversight")}
                headerSubtitle={t("architect_templates_desc", "Manage and review configuration templates.")}
                headerIcon="description"
                headerIconColorClass="theme-text-accent"
                search={fileSearch}
                onSearchChange={setFileSearch}
                searchPlaceholder={(t("template_search_files", "Search tracked files...")) as string}
                tabs={tabs}
                activeTab={activeFilterTab}
                onTabChange={(tabId: string) => setActiveFilterTab(tabId as any)}
                hideSearch={activeFilterTab === 'overview'}
                primaryPopover={activeFilterTab !== 'overview' ? {
                    icon: "tune",
                    label: t("filters", "Filters"),
                    content: (
                        <div className="flex flex-col w-[300px] p-4 text-left">
                            <div className="flex flex-col mb-5 w-full">
                                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
                                    {t("sort_by", "SORT BY")}
                                </div>
                                <CustomDropdown
                                    flat={true}
                                    variant="pill"
                                    disableTint={true}
                                    value={fileSort}
                                    options={[{ id: "date", label: t("template_sort_date", "Date") }, { id: "name", label: t("sort_name", "Name") }]}
                                    onChange={(val: string[]) => setFileSort(val[0])}
                                />
                            </div>
                        </div>
                    )
                } : undefined}
                actions={activeFilterTab !== 'overview' ? [
                    {
                        id: "add",
                        icon: "add",
                        label: t("auto_create", "Add"),
                        onClick: () => setIsAddPanelOpen(true)
                    }
                ] : undefined}
            >
                {activeFilterTab === 'overview' ? renderLanding() : (
                    <div className="flex flex-col gap-4 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {isLoading ? (
                            <div className="h-full flex items-center justify-center theme-text-accent font-black tracking-widest text-xs capitalize animate-pulse">{t("intercepting", "Intercepting {Dispatches}...")}</div>
                        ) : processedFiles.length === 0 ? (
                            <EmptyState icon={t("icon_architecture", "architecture")} title={t("no_tracked_files", "No tracked files")} className="col-span-full py-16" />
                        ) : (
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                {processedFiles.map(renderTrackedFileCard)}
                            </div>
                        )}
                    </div>
                )}
            </ElevatedHubLayout>

            <SidePanel
                isOpen={isAddPanelOpen}
                onClose={() => setIsAddPanelOpen(false)}
                title={t("add_target_file", "Add Target File")}
                subtitle={t("desc_file_name", "Track a new configuration file")}
                icon="add"
                iconColorClass="text-[var(--accent)]"
                headerActions={
                    <PanelHeaderGroup>
                        <PanelHeaderButton
                            icon="check"
                            variant="success"
                            tooltip={t("save_meta", "Save File")}
                            disabled={!newFileName.trim()}
                            onClick={handleAddSubmit}
                        />
                    </PanelHeaderGroup>
                }
            >
                <div className="flex flex-col h-full gap-6">
                    <SidePanelHeroCard
                        title={newFileName.trim() || t("add_target_file", "Add Target File")}
                        subtitle={t("desc_file_name", "Specify the exact configuration filename to track.")}
                        label={t("architect_templates", "Template Oversight")}
                        icon="description"
                        variant="accent"
                    />
                    <SidePanelTitleInput
                        value={newFileName}
                        onChange={setNewFileName}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSubmit()}
                        placeholder={t("ph_file_name", "e.g. mc_settings.cfg")}
                        subtitle={t("author_filename", "Target File Name")}
                        autoFocus
                    />
                </div>
            </SidePanel>

            <SidePanel
                isOpen={!!selectedFileGroup}
                onClose={() => setSelectedFileGroup(null)}
                title={t("ui_template_config", "Template Configuration")}
                subtitle={t("manage_community_defaults", "Manage community defaults")}
                icon="description"
                iconColorClass="text-[var(--accent)]"
                isResizable={false}
                widthClass="w-[900px]"
            >
                <div className="flex flex-col gap-6 h-full">
                    <SidePanelHeroCard
                        title={selectedFileGroup || t("ui_template_config", "Template Configuration")}
                        subtitle={t("manage_community_defaults", "Manage community defaults")}
                        label={t("architect_templates", "Template Oversight")}
                        icon="description"
                        variant="accent"
                    >
                        <div className="grid grid-cols-2 gap-3 w-full">
                            <StatBox
                                label={t("available", "Available Templates")}
                                value={processedTemplates.length}
                                icon={t("icon_data_object", "data_object")}
                                iconColorClass="text-[var(--accent)]"
                            />
                            <StatBox
                                label={t("active_default", "Active Sanctuary Default")}
                                value={processedTemplates.find(t => t.is_community_default)?.name || "--"}
                                icon={t("icon_verified", "verified")}
                                iconColorClass="text-[var(--success)]"
                            />
                        </div>
                    </SidePanelHeroCard>

                    <SidePanelTitleInput
                        value={selectedFileGroup || ""}
                        readOnly
                    />

                    {processedTemplates.find(t => t.is_community_default) && (
                        <UniversalGroup
                            title={t("active_default", "Active Sanctuary Default")}
                            icon={t("icon_verified", "verified")}
                        >
                            {(() => {
                                const defaultTmpl = processedTemplates.find(t => t.is_community_default)!;
                                return (
                                    <UniversalCard
                                        onClick={() => setSelectedTemplateForPreview(defaultTmpl)}
                                        layout="vertical"
                                        icon={t("icon_data_object", "data_object")}
                                        customIcon={<DynamicTemplatePreviewBanner data={defaultTmpl} heightClass="h-full" />}
                                        title={defaultTmpl.name || defaultTmpl.targetFile}
                                        subtitle={defaultTmpl.description || t("no_desc", "No description provided.")}
                                        statusColor="border-[var(--success)]"
                                        imageOverlay={
                                            <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                                                <div className={VAULT_CHIP_CLASS}>
                                                    <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                                                        {t("icon_verified", "verified")}
                                                    </span>
                                                    <span>{t("active_default", "Default")}</span>
                                                </div>
                                            </div>
                                        }
                                        badges={
                                            <div className={VAULT_CHIP_CLASS}>
                                                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                    {t("icon_person", "person")}
                                                </span>
                                                <span>{defaultTmpl.author || t("unknown", "Unknown")}</span>
                                            </div>
                                        }
                                        footer={
                                            <div className="flex justify-between items-center w-full">
                                                <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
                                                    <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_calendar_today", "calendar_today")}</span>
                                                    {new Date(defaultTmpl.created_at).toLocaleDateString()}
                                                </span>
                                                <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
                                                    {t("preview_title", "Preview")} <span className="text-base leading-none">&rarr;</span>
                                                </span>
                                            </div>
                                        }
                                    />
                                );
                            })()}
                        </UniversalGroup>
                    )}

                    <UniversalGroup
                        title={t("available", "Available Templates")}
                        icon={t("icon_folder_open", "folder_open")}
                    >
                        <div className="flex items-center gap-4">
                            <div className="flex-1 relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--subtext)] !text-[16px]">{t("icon_search", "search")}</span>
                                <input
                                    type="text"
                                    placeholder={t("search_tmpl", "Search templates...")}
                                    value={tmplSearch}
                                    onChange={(e) => setTmplSearch(e.target.value)}
                                    className="w-full h-12 pl-10 pr-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-colors bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[12px] font-bold text-[var(--text)] placeholder:text-[var(--subtext)] outline-none"
                                />
                            </div>
                            <div className="shrink-0 flex items-center gap-2 w-max min-w-[192px] max-w-xs">
                                <CustomDropdown
                                    disableTint={true}
                                    value={tmplSort}
                                    options={[
                                        { id: "date", label: t("sort_newest", "Newest") },
                                        { id: "name", label: t("sort_name", "Name") },
                                        { id: "downloads", label: t("sort_downloads", "Downloads") }
                                    ]}
                                    onChange={(val: string[]) => setTmplSort(val[0])}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pb-6">
                            {processedTemplates.filter(t => !t.is_community_default).length === 0 ? (
                                <EmptyState icon={t("icon_folder_open", "folder_open")} title={t("no_additional", "No additional templates")} className="col-span-2 py-8" />
                            ) : processedTemplates.filter(t => !t.is_community_default).map((tmpl) => {
                                const isFlagged = flaggedTemplateIds.includes(tmpl.id);
                                return (
                                    <UniversalCard
                                        key={tmpl.id}
                                        onClick={() => setSelectedTemplateForPreview(tmpl)}
                                        layout="vertical"
                                        icon={t("icon_data_object", "data_object")}
                                        customIcon={<DynamicTemplatePreviewBanner data={tmpl} heightClass="h-full" />}
                                        title={tmpl.name || tmpl.targetFile}
                                        subtitle={tmpl.description || t("no_desc", "No description provided.")}
                                        imageOverlay={
                                            <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                                                <div className={VAULT_CHIP_CLASS}>
                                                    <span className={`material-symbols-outlined !text-[12px] ${isFlagged ? "text-[var(--warning)]" : "text-[var(--accent)]"}`}>
                                                        {isFlagged ? t("icon_flag", "flag") : t("icon_data_object", "data_object")}
                                                    </span>
                                                    <span>{isFlagged ? t("flagged", "Flagged") : t("status_active", "Active")}</span>
                                                </div>
                                            </div>
                                        }
                                        badges={
                                            <div className={VAULT_CHIP_CLASS}>
                                                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                    {t("icon_person", "person")}
                                                </span>
                                                <span>{tmpl.author || t("unknown", "Unknown")}</span>
                                            </div>
                                        }
                                        footer={
                                            <div className="flex justify-between items-center w-full">
                                                <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
                                                    <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_calendar_today", "calendar_today")}</span>
                                                    {new Date(tmpl.created_at).toLocaleDateString()}
                                                </span>
                                                <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
                                                    {t("preview_title", "Preview")} <span className="text-base leading-none">&rarr;</span>
                                                </span>
                                            </div>
                                        }
                                    />
                                );
                            })}
                        </div>
                    </UniversalGroup>
                </div>
            </SidePanel>

            <SidePanel
                isOpen={!!selectedTemplateForPreview}
                onClose={() => setSelectedTemplateForPreview(null)}
                title={selectedTemplateForPreview?.name || selectedTemplateForPreview?.targetFile || t("preview_title", "Preview")}
                subtitle={t("preview_subtitle", "Template Preview")}
                icon="visibility"
                iconColorClass="text-[var(--accent)]"
                isResizable={false}
                widthClass="w-[850px]"
                backdropZ="z-[45000]"
                panelZ="z-[45001]"
                noBackdropDim={true}
                headerActions={
                    selectedTemplateForPreview ? (
                        <PanelHeaderGroup>
                            {selectedTemplateForPreview.is_community_default ? (
                                <PanelHeaderButton icon="verified" variant="success" tooltip={t("active_default", "Active Default")} disabled={true} />
                            ) : (
                                <PanelHeaderButton icon="check" variant="success" tooltip={isSettingDefault === selectedTemplateForPreview.id ? t("setting", "Setting...") : t("set_default", "Set Default")} disabled={isSettingDefault === selectedTemplateForPreview.id} onClick={() => handleSetDefault(selectedTemplateForPreview)} />
                            )}
                        </PanelHeaderGroup>
                    ) : null
                }
            >
                {selectedTemplateForPreview && (
                    <div className="flex flex-col h-full w-full gap-6">
                        <SidePanelHeroCard
                            title={selectedTemplateForPreview.name || selectedTemplateForPreview.targetFile || t("preview_title", "Preview")}
                            subtitle={selectedTemplateForPreview.description || t("preview_subtitle", "Template Preview")}
                            label={selectedTemplateForPreview.targetFile || t("ui_template_config", "Template Configuration")}
                            icon="visibility"
                            variant={selectedTemplateForPreview.is_community_default ? "success" : "accent"}
                            badges={selectedTemplateForPreview.is_community_default ? [
                                {
                                    icon: t("icon_verified", "verified"),
                                    label: t("active_default", "Active Sanctuary Default"),
                                    colorClass: "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_35%,transparent)]"
                                }
                            ] : undefined}
                        />

                        <SidePanelTitleInput
                            value={selectedTemplateForPreview.name || selectedTemplateForPreview.targetFile || ""}
                            readOnly
                        />

                        <UniversalGroup
                            title={t("preview_subtitle", "Template Preview")}
                            icon="visibility"
                        >
                            <div className="flex-1 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] p-5 overflow-y-auto custom-scrollbar min-h-[400px]">
                                <TemplatePreviewer templateData={selectedTemplateForPreview.parsedData} />
                            </div>
                        </UniversalGroup>
                    </div>
                )}
            </SidePanel>
        </>
    );
}
