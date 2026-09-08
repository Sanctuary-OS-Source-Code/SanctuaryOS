import React, { useState, useEffect, useMemo } from "react";
import { supabaseServices } from "../lib/supabase-services";
import { useLexicon } from "../LexiconContext";
import { standardPrimaryButtonClass, standardButtonClass, standardSuccessButtonClass, SidePanel, CustomDropdown, EmptyState, ActionButton, ScreenUtilityBar, FilterPopover } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { ElevatedHubLayout } from "../components/layouts/ElevatedHubLayout";
import TemplatePreviewer from "../TemplatePreviewer";
import { supabase } from "../supabase";
import { exists, mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { useStore } from "../store";

export default function ArchitectTemplateOversight() {
    const { t } = useLexicon();
    const vaultPath = useStore(state => state.vaultPath);
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
        console.log("Set Default Result:", res);
        if (res.error) {
            console.error("Failed to set default:", res.error);
            alert("Failed to set default: " + res.error.message);
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

    const tabs = [
        {
            id: "overview",
            label: t("landing_overview") || "Overview",
            icon: "dashboard",
        },
        {
            id: "active",
            label: t("status_active"),
            icon: "description",
            number: trackedFiles.length,
        },
        {
            id: "flagged",
            label: t("oversight_tab_flagged"),
            icon: "flag",
            number: trackedFiles.filter(f => {
                const fileTemplates = templates.filter(t => t.targetFile === f.file_name);
                return fileTemplates.some(t => flaggedTemplateIds.includes(t.id));
            }).length,
        }
    ];

    const renderTrackedFileCard = (tf: any) => {
        const groupTemplates = templates.filter(t => t.targetFile === tf.file_name);
        const defaultTmpl = groupTemplates.find(t => t.is_community_default);

        return (
            <UniversalCard
                key={tf.id}
                onClick={() => { setSelectedFileGroup(tf.file_name); setSelectedTemplateForPreview(null); }}
                layout="vertical"
                icon="description"
                title={tf.file_name}
                subtitle={`${groupTemplates.length} ${groupTemplates.length === 1 ? 'Template' : 'Templates'} Available`}
                statusColor={defaultTmpl ? "border-emerald-500" : undefined}
                badges={defaultTmpl ? [
                    <span key="verified" className="material-symbols-outlined text-emerald-400 opacity-80 !text-[16px]" title="Has Community Default">{t("template_icon_verified")}</span>
                ] : undefined}
            />
        );
    };

    const renderLanding = () => {
        const activeFiles = trackedFiles;
        const flaggedFiles = trackedFiles.filter(f => {
            const fileTemplates = templates.filter(t => t.targetFile === f.file_name);
            return fileTemplates.some(t => flaggedTemplateIds.includes(t.id));
        });

        return (
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
                        <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase flex items-center gap-2">
                            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">description</span>
                            {t("recent_active_files") || "Recent Active"}
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                        {activeFiles.slice(0, 10).map(renderTrackedFileCard)}
                        {activeFiles.length === 0 && <EmptyState icon="description" title="No Active Files" className="py-8" />}
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
                        <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase flex items-center gap-2">
                            <span className="material-symbols-outlined !text-[18px] text-[var(--warning)]">flag</span>
                            {t("recent_flagged_files") || "Recent Flagged"}
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                        {flaggedFiles.slice(0, 10).map(renderTrackedFileCard)}
                        {flaggedFiles.length === 0 && <EmptyState icon="flag" title="No Flagged Files" className="py-8" />}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <ElevatedHubLayout
            headerTitle={t("architect_templates") || "Template Oversight"}
            headerSubtitle={t("architect_templates_desc") || "Manage and review configuration templates."}
            headerIcon="description"
            headerIconColorClass="theme-text-accent"
            search={fileSearch}
            onSearchChange={setFileSearch}
            searchPlaceholder={t("template_search_files") as string}
            tabs={tabs}
            activeTab={activeFilterTab}
            onTabChange={(tabId) => setActiveFilterTab(tabId as any)}
            headerActions={
                <div className="flex items-center gap-2">
                    <FilterPopover icon="tune" label="" className="shrink-0">
                        <div className="flex flex-col gap-2 p-4">
                            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-1">{t("template_sort_files") || "Sort Files"}</label>
                            <CustomDropdown
                                disableTint={true}
                                value={fileSort}
                                options={[{ id: "date", label: t("template_sort_date") }, { id: "name", label: t("sort_name") }]}
                                onChange={(val: string[]) => setFileSort(val[0])}
                            />
                        </div>
                    </FilterPopover>
                    <ActionButton
                        iconOnly={true}
                        onClick={() => setIsAddPanelOpen(true)}
                        icon={t("icon_add")}
                        label={t("btn_add")}
                    />
                </div>
            }
        >
            {activeFilterTab === 'overview' ? renderLanding() : (
                <div className="flex flex-col gap-4">
                    {isLoading ? (
                        <div className="h-full flex items-center justify-center theme-text-accent font-black tracking-widest text-xs capitalize animate-pulse">{t("intercepting")}</div>
                    ) : processedFiles.length === 0 ? (
                        <EmptyState icon={t("icon_architecture")} title={t("no_tracked_files")} className="col-span-full py-16" />
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                            {processedFiles.map(renderTrackedFileCard)}
                        </div>
                    )}
                </div>
            )}

            <SidePanel
                isOpen={isAddPanelOpen}
                onClose={() => setIsAddPanelOpen(false)}
                title="Add Target File"
                subtitle="Track a new configuration file"
                icon="add"
                iconColorClass="text-[var(--accent)]"
                actions={
                    <>
                        <button onClick={() => setIsAddPanelOpen(false)} className={standardButtonClass}>
                            {t("nav_cancel")}
                        </button>
                        <button onClick={handleAddSubmit} disabled={!newFileName.trim()} className={standardSuccessButtonClass}>
                            Save File
                        </button>
                    </>
                }
            >
                <div className="p-6 flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-black capitalize tracking-widest text-[var(--subtext)]">{t("label_file_name")}</label>
                        <input
                            type="text"
                            placeholder="e.g. mc_settings.cfg"
                            value={newFileName}
                            onChange={(e) => setNewFileName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddSubmit()}
                            className="h-12 w-full px-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-colors bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-sm font-bold text-[var(--text)] placeholder:text-[var(--subtext)] outline-none"
                            autoFocus
                        />
                        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60">{t("desc_file_name")}</span>
                    </div>
                </div>
            </SidePanel>

            <SidePanel
                isOpen={!!selectedFileGroup}
                onClose={() => setSelectedFileGroup(null)}
                title={t("ui_template_config")}
                subtitle="Manage community defaults"
                icon="description"
                iconColorClass="text-[var(--accent)]"
                isResizable={false}
                widthClass="w-[900px]"
            >
                <div className="flex flex-col gap-8 p-6 overflow-y-auto custom-scrollbar h-full">
                    <div className="flex flex-col gap-3 shrink-0">
                        <h2 className="text-3xl font-black text-[var(--text)] leading-tight capitalize tracking-widest truncate">
                            {selectedFileGroup}
                        </h2>
                    </div>

                    {processedTemplates.find(t => t.is_community_default) && (
                        <div className="flex flex-col gap-3">
                            <h3 className="text-xs font-black capitalize tracking-widest text-[var(--success)] flex items-center gap-2">
                                <span className="material-symbols-outlined !text-[16px]">{t("template_icon_verified")}</span>
                                Active Sanctuary Default
                            </h3>
                            {(() => {
                                const defaultTmpl = processedTemplates.find(t => t.is_community_default)!;
                                return (
                                    <UniversalCard
                                        onClick={() => setSelectedTemplateForPreview(defaultTmpl)}
                                        layout="vertical"
                                        icon="data_object"
                                        title={defaultTmpl.name || defaultTmpl.targetFile}
                                        statusColor="border-emerald-500"
                                        badges={[
                                            <span key="author" className="flex items-center gap-1.5"><span className="material-symbols-outlined !text-[12px]">{t("icon_person")}</span> {defaultTmpl.author || (t("vlocal"))}</span>
                                        ]}
                                    >
                                        <span className="text-xs text-[var(--subtext)] line-clamp-2 leading-relaxed">{defaultTmpl.description || "No description provided."}</span>
                                    </UniversalCard>
                                );
                            })()}
                        </div>
                    )}

                    <div className="flex flex-col gap-4 mt-2">
                        <h3 className="text-xs font-black capitalize tracking-widest text-[var(--subtext)]">{t("available")}</h3>

                        <div className="flex items-center gap-4">
                            <div className="flex-1 relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--subtext)] !text-[16px]">search</span>
                                <input
                                    type="text"
                                    placeholder={t("search_tmpl")}
                                    value={tmplSearch}
                                    onChange={(e) => setTmplSearch(e.target.value)}
                                    className="w-full h-12 pl-10 pr-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-colors bg-black/20 text-[12px] font-bold text-[var(--text)] placeholder:text-[var(--subtext)] outline-none"
                                />
                            </div>
                            <div className="shrink-0 flex items-center gap-2 w-max min-w-[192px] max-w-xs">
                                <CustomDropdown
                                    disableTint={true}
                                    value={tmplSort}
                                    options={[
                                        { id: "date", label: t("template_sort_newest") },
                                        { id: "name", label: t("sort_name") },
                                        { id: "downloads", label: t("sort_downloads") }
                                    ]}
                                    onChange={(val: string[]) => setTmplSort(val[0])}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pb-12">
                            {processedTemplates.filter(t => !t.is_community_default).length === 0 ? (
                                <EmptyState icon={t("icon_folder_open")} title={t("no_additional")} className="col-span-2 py-8" />
                            ) : processedTemplates.filter(t => !t.is_community_default).map((tmpl) => (
                                <UniversalCard
                                    key={tmpl.id}
                                    onClick={() => setSelectedTemplateForPreview(tmpl)}
                                    layout="vertical"
                                    icon="data_object"
                                    title={tmpl.name || tmpl.targetFile}
                                    footer={
                                        <div className="flex flex-col gap-2 text-[9px] font-bold text-[var(--subtext)] capitalize tracking-widest opacity-80 mt-1">
                                            <span className="flex items-center gap-1.5 truncate"><span className="material-symbols-outlined !text-[12px]">{t("icon_person")}</span> {tmpl.author || (t("vlocal"))}</span>
                                            <span className="flex items-center gap-1.5 shrink-0"><span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today")}</span> {new Date(tmpl.created_at).toLocaleDateString()}</span>
                                        </div>
                                    }
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </SidePanel>

            <SidePanel
                isOpen={!!selectedTemplateForPreview}
                onClose={() => setSelectedTemplateForPreview(null)}
                title={selectedTemplateForPreview?.name || selectedTemplateForPreview?.targetFile || t("preview_title")}
                subtitle={t("preview_subtitle")}
                icon="visibility"
                iconColorClass="text-[var(--accent)]"
                isResizable={false}
                widthClass="w-[850px]"
                backdropZ="z-[45000]"
                panelZ="z-[45001]"
                noBackdropDim={true}
                actions={
                    selectedTemplateForPreview ? (
                        <>
                            <button onClick={() => setSelectedTemplateForPreview(null)} className={standardButtonClass}>
                                {t("nav_cancel")}
                            </button>
                            {selectedTemplateForPreview.is_community_default ? (
                                <button disabled={true} className="px-8 py-4 rounded-2xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] text-xs font-black capitalize tracking-[0.2em] flex items-center justify-center gap-2 opacity-50 cursor-not-allowed">
                                    <span className="material-symbols-outlined !text-[18px]">{t("template_icon_verified")}</span>
                                    {t("active_default")}</button>
                            ) : (
                                <button
                                    onClick={() => handleSetDefault(selectedTemplateForPreview)}
                                    disabled={isSettingDefault === selectedTemplateForPreview.id}
                                    className={standardSuccessButtonClass}
                                >
                                    {isSettingDefault === selectedTemplateForPreview.id ? '' + (t("setting")) + '' : '' + (t("set_default")) + ''}
                                </button>
                            )}
                        </>
                    ) : null
                }
            >
                {selectedTemplateForPreview && (
                    <div className="flex flex-col h-full w-full overflow-hidden">
                        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar h-full">

                            {selectedTemplateForPreview.is_community_default && (
                                <div className="px-4 py-3 rounded-xl border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)] text-xs font-black capitalize tracking-widest flex items-center gap-3 shrink-0">
                                    <span className="material-symbols-outlined !text-[18px]">{t("template_icon_verified")}</span>
                                    {t("active_default_msg")}
                                </div>
                            )}

                            <div className="flex-1 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-black/10 p-6 overflow-y-auto custom-scrollbar min-h-[400px]">
                                <TemplatePreviewer templateData={selectedTemplateForPreview.parsedData} />
                            </div>
                        </div>
                    </div>
                )}
            </SidePanel>
        </ElevatedHubLayout>
    );
}



