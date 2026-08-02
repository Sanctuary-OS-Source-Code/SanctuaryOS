import React, { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../LexiconContext";
import { SidePanel, FilterTabs, FilterTabButton, SearchBar } from "../shared";

export function TimeCapsuleSidePanel({ isOpen, onClose, selectedBackup, config }: { isOpen: boolean, onClose: () => void, selectedBackup: string | null, config: any }) {
  const { t } = useLexicon();
  const [activeSubTab, setActiveSubTab] = useState("INSPECTOR");
  const [backupFiles, setBackupFiles] = useState<any[]>([]);
  const [logicalSize, setLogicalSize] = useState<number>(0);
  const [diffSize, setDiffSize] = useState<number>(0);
  const [location, setLocation] = useState<string>("");
  const [diffEntries, setDiffEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);

  // New states for search and limits
  const [extractSearch, setExtractSearch] = useState("");
  const [diffSearch, setDiffSearch] = useState("");
  const [extractLimit, setExtractLimit] = useState(100);
  const [diffLimit, setDiffLimit] = useState(100);

  const docsPath = useMemo(() => {
    if (config?.mods_path) {
      return config.mods_path.replace(/[\\/]Mods[\\/]?$/i, "");
    }
    return "";
  }, [config]);

  // Reset limits when tab changes
  useEffect(() => {
    setExtractLimit(100);
    setDiffLimit(100);
    setExtractSearch("");
    setDiffSearch("");
  }, [activeSubTab]);

  useEffect(() => {
    if (isOpen && selectedBackup) {
      if (activeSubTab === "INSPECTOR" || activeSubTab === "EXTRACT") {
        setIsLoading(true);
        invoke("get_backup_contents", {
          vaultPath: config?.vault_path,
          backupName: selectedBackup
        }).then((res: any) => {
          setBackupFiles(res?.files || []);
          setLogicalSize(res?.logical_size_bytes || 0);
          setDiffSize(res?.diff_size_bytes || 0);
          setLocation(res?.location || "");
        }).catch(console.error).finally(() => setIsLoading(false));
      } else if (activeSubTab === "DIFF") {
        setIsLoading(true);
        invoke("diff_backup", {
          vaultPath: config?.vault_path,
          docsPath: docsPath,
          backupName: selectedBackup
        }).then((res: any) => {
          setDiffEntries(res || []);
        }).catch(console.error).finally(() => setIsLoading(false));
      }
    }
  }, [isOpen, selectedBackup, activeSubTab, config, docsPath]);

  const handleExtract = async (filePath: string) => {
    if (!selectedBackup) return;
    setExtracting(filePath);
    try {
      await invoke("extract_backup_file", {
        vaultPath: config?.vault_path,
        docsPath: docsPath,
        backupName: selectedBackup,
        filePath: filePath
      });
      setTimeout(() => setExtracting(null), 1000);
    } catch (e) {
      console.error(e);
      setExtracting(null);
    }
  };

  const isEngine = selectedBackup?.toLowerCase().includes("engine");
  const title = isEngine ? t("engine_full") || "Engine Core" : t("world_state") || "World State";
  const icon = isEngine ? "settings" : "public";
  const themeColor = isEngine ? 'text-rose-500' : 'text-indigo-500';
  const themeBgColor = isEngine ? 'bg-rose-500/10' : 'bg-indigo-500/10';

  const totalSize = useMemo(() => backupFiles.reduce((acc, f) => acc + f.size_mb, 0), [backupFiles]);
  const saveFiles = backupFiles.filter(f => f.path.toLowerCase().endsWith(".save"));
  const trayFiles = backupFiles.filter(f => f.path.toLowerCase().endsWith(".trayitem") || f.path.toLowerCase().endsWith(".blueprint") || f.path.toLowerCase().endsWith(".bpi"));
  const hasSettings = backupFiles.some(f => f.path.toLowerCase().includes("options.ini"));

  const filteredExtract = useMemo(() => {
    if (!extractSearch) return backupFiles;
    return backupFiles.filter(f => f.path.toLowerCase().includes(extractSearch.toLowerCase()));
  }, [backupFiles, extractSearch]);

  const filteredDiff = useMemo(() => {
    const changes = diffEntries.filter(d => d.status !== 'Identical');
    if (!diffSearch) return changes;
    return changes.filter(d => d.path.toLowerCase().includes(diffSearch.toLowerCase()));
  }, [diffEntries, diffSearch]);

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("timecapsule_operations_title") || "CAPSULE OPERATIONS"}
      subtitle={t("timecapsule_operations_subtitle") || "ADVANCED CHRONOGRAM MANAGEMENT"}
      icon="science"
      iconColorClass="text-emerald-500 border-emerald-500/30"
      widthClass="w-[700px]"
    >
      {!selectedBackup ? (
        <div className="text-[var(--subtext)] text-xs p-6 text-center">
          {t("no_backup_selected") || "No backup selected."}
        </div>
      ) : (
        <div className="flex flex-col gap-6 h-full pb-4">
          <FilterTabs className="shrink-0">
            <FilterTabButton
              id="INSPECTOR"
              label={t("tab_inspector") || "Inspector"}
              activeTab={activeSubTab}
              setTab={setActiveSubTab}
            />
            <FilterTabButton
              id="EXTRACT"
              label={t("tab_extract") || "Extract"}
              activeTab={activeSubTab}
              setTab={setActiveSubTab}
            />
            <FilterTabButton
              id="DIFF"
              label={t("tab_diff") || "Diff"}
              activeTab={activeSubTab}
              setTab={setActiveSubTab}
            />
          </FilterTabs>

          {activeSubTab === "INSPECTOR" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col gap-4 flex-1 min-h-0 relative">
              <div className="flex items-start gap-4 mb-4 relative z-10 shrink-0">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 shadow-inner text-emerald-500 shrink-0">
                  <span className="material-symbols-outlined !text-[24px]">{t("icon_inspector") || "troubleshoot"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-black uppercase tracking-[0.15em] text-[var(--text)] drop-shadow-md">{t("inspector_title") || "Chronogram Inspector"}</h3>
                  <p className="text-[10px] text-[var(--subtext)] leading-relaxed font-black uppercase tracking-widest">
                    {t("inspector_desc") || "Select a Chronogram to deeply inspect its contents without restoring it."}
                  </p>
                </div>
              </div>

              {isLoading ? (
                <div className="text-center text-xs text-[var(--subtext)] animate-pulse relative z-10">{t("loading_contents") || "Loading contents..."}</div>
              ) : (
                <div className="flex flex-col gap-2 relative z-10 overflow-y-auto custom-scrollbar flex-1 pr-2 pb-6">
                  <div className="p-4 border border-white/5 bg-white/5 rounded-2xl flex items-center gap-3 shrink-0">
                    <span className={`material-symbols-outlined !text-[18px] ${themeColor}`}>{icon}</span>
                    <div>
                      <div className="text-sm font-black uppercase tracking-widest text-[var(--text)] truncate">{selectedBackup}</div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">{totalSize.toFixed(2)} MB</div>
                    </div>
                  </div>

                  {!isEngine && (
                    <div className="p-4 flex flex-col gap-3 border border-white/5 bg-white/5 rounded-2xl shrink-0">
                      <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest">
                        <span className="text-[var(--subtext)] flex items-center gap-2"><span className="material-symbols-outlined !text-[16px]">{t("icon_saves") || "save"}</span> {t("label_saves") || "Saves"}</span>
                        <span className="text-emerald-500">{saveFiles.length} {t("label_files") || "Files"}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest">
                        <span className="text-[var(--subtext)] flex items-center gap-2"><span className="material-symbols-outlined !text-[16px]">{t("icon_tray_files") || "group"}</span> {t("label_tray_files") || "Tray Files"}</span>
                        <span className="text-emerald-500">{trayFiles.length} {t("label_files") || "Files"}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest">
                        <span className="text-[var(--subtext)] flex items-center gap-2"><span className="material-symbols-outlined !text-[16px]">{t("icon_settings") || "settings"}</span> {t("label_settings_config") || "Settings Config"}</span>
                        <span className={hasSettings ? "text-emerald-500" : "text-[var(--subtext)]"}>{hasSettings ? (t("label_detected") || "Detected") : (t("label_none") || "None")}</span>
                      </div>
                    </div>
                  )}

                  {isEngine && (
                    <div className="p-4 flex flex-col gap-2 border border-white/5 bg-white/5 rounded-2xl shrink-0">
                      <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest">
                        <span className="text-[var(--subtext)] flex items-center gap-2"><span className="material-symbols-outlined !text-[16px]">{t("icon_folder") || "folder"}</span> {t("total_files") || "Total Files"}</span>
                        <span className="text-emerald-500">{backupFiles.length}</span>
                      </div>
                    </div>
                  )}

                  {/* Storage Info Details */}
                  <div className="p-4 border border-white/5 bg-white/5 rounded-2xl flex flex-col gap-3 shrink-0">
                    <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest">
                      <span className="text-[var(--subtext)] flex items-center gap-2"><span className="material-symbols-outlined !text-[16px]">{t("icon_hard_drive") || "hard_drive"}</span> {t("logical_size") || "Logical Size"}</span>
                      <span className="text-[var(--text)]">{(logicalSize / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest">
                      <span className="text-[var(--subtext)] flex items-center gap-2"><span className="material-symbols-outlined !text-[16px]">{t("icon_data_usage") || "data_usage"}</span> {t("new_disk_used") || "New Disk Used"}</span>
                      <span className="text-amber-500">{(diffSize / 1024 / 1024 / 1024).toFixed(4)} GB</span>
                    </div>
                    <div className="mt-2 pt-3 border-t border-white/5 text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex flex-col gap-2">
                      <span className="flex items-center gap-1 opacity-70"><span className="material-symbols-outlined !text-[14px]">{t("icon_location") || "location_on"}</span> {t("stored_location") || "Stored Location"}</span>
                      <span className="bg-black/20 p-3 rounded-xl font-mono text-[11px] font-black uppercase tracking-widest break-all border border-white/5 leading-relaxed">
                        {location.replace(/c:\\users\\[^\\]+/i, 'C:\\USERS\\***')}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSubTab === "EXTRACT" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col gap-4 flex-1 min-h-0 relative">
              <div className="flex items-start gap-4 mb-4 relative z-10 shrink-0">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 shadow-inner text-amber-500 shrink-0">
                  <span className="material-symbols-outlined !text-[24px]">{t("icon_extract") || "content_cut"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-black uppercase tracking-[0.15em] text-[var(--text)] drop-shadow-md">{t("surgical_extraction_title") || "Surgical Extraction"}</h3>
                  <p className="text-[10px] text-[var(--subtext)] leading-relaxed font-black uppercase tracking-widest">
                    {isEngine
                      ? (t("engine_extract_desc") || "Pull specific files out of an Engine Core backup and inject them into your active Engine Core.")
                      : (t("surgical_extraction_desc") || "Pull specific files out of a Time Capsule and inject them into your active World State.")}
                  </p>
                </div>
              </div>

              <div className="mb-4 mt-2 relative z-10 shrink-0">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 !text-[18px] text-[var(--subtext)]">{t("icon_search") || "search"}</span>
                  <input
                    type="text"
                    value={extractSearch}
                    onChange={e => setExtractSearch(e.target.value)}
                    placeholder={t("search_files") || "Search files..."}
                    className="w-full bg-white/5 border border-white/5 rounded-xl py-3 pl-12 pr-4 text-xs font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                </div>
              </div>

              {isLoading ? (
                <div className="text-center text-xs text-[var(--subtext)] animate-pulse relative z-10">{t("loading_contents") || "Loading contents..."}</div>
              ) : (
                <div className="flex flex-col gap-2 relative z-10 overflow-y-auto pr-2 custom-scrollbar flex-1 pb-6">
                  {filteredExtract.slice(0, extractLimit).map((file, i) => (
                    <div key={i} className="bg-white/5 border border-transparent p-4 rounded-xl flex items-center justify-between group hover:bg-white/10 hover:border-amber-500/30 transition-all shrink-0">
                      <div className="flex items-center gap-3 text-xs font-black uppercase tracking-widest truncate flex-1 mr-4">
                        <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)] group-hover:text-amber-500 shrink-0 transition-colors">
                          {file.path.toLowerCase().endsWith('.save') ? (t("icon_saves") || 'save') : file.path.toLowerCase().includes('.trayitem') ? (t("icon_tray_files") || 'group') : (t("icon_file") || 'description')}
                        </span>
                        <span className="truncate" title={file.path}>{file.path.split('/').pop()}</span>
                      </div>
                      <button
                        onClick={() => handleExtract(file.path)}
                        disabled={extracting === file.path}
                        className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors shrink-0 disabled:opacity-50"
                      >
                        {extracting === file.path ? (t("extracting") || 'Extracting...') : (t("btn_extract") || 'Extract')}
                      </button>
                    </div>
                  ))}
                  {filteredExtract.length > extractLimit && (
                    <div className="flex flex-col items-center gap-3 mt-4 mb-2">
                      <div className="text-center text-[10px] text-[var(--subtext)] uppercase tracking-widest">
                        {t("showing_files")?.replace("{0}", extractLimit.toString()) || `Showing first ${extractLimit} files of ${filteredExtract.length}`}
                      </div>
                      <button onClick={() => setExtractLimit(l => l + 100)} className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-widest border border-white/5 transition-colors">
                        {t("load_more") || "Load More"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeSubTab === "DIFF" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col gap-4 flex-1 min-h-0 relative">
              <div className="flex items-start gap-4 mb-4 relative z-10 shrink-0">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 shadow-inner text-indigo-500 shrink-0">
                  <span className="material-symbols-outlined !text-[24px]">{t("icon_diff") || "difference"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-black uppercase tracking-[0.15em] text-[var(--text)] drop-shadow-md">{t("temporal_diff_title") || "Temporal Diff"}</h3>
                  <p className="text-[10px] text-[var(--subtext)] leading-relaxed font-black uppercase tracking-widest">
                    {isEngine
                      ? (t("engine_diff_desc") || "Compare an Engine Core backup against your current Engine Core to see exactly what changed.")
                      : (t("temporal_diff_desc") || "Compare a Capsule against your current active state to see exactly what changed.")}
                  </p>
                </div>
              </div>

              <div className="mb-4 mt-2 relative z-10 shrink-0">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 !text-[18px] text-[var(--subtext)]">{t("icon_search") || "search"}</span>
                  <input
                    type="text"
                    value={diffSearch}
                    onChange={e => setDiffSearch(e.target.value)}
                    placeholder={t("search_files") || "Search files..."}
                    className="w-full bg-white/5 border border-white/5 rounded-xl py-3 pl-12 pr-4 text-xs font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                </div>
              </div>

              {isLoading ? (
                <div className="text-center text-xs text-[var(--subtext)] animate-pulse relative z-10">{t("calculating_diff") || "Calculating diff..."}</div>
              ) : (
                <div className="flex flex-col gap-2 relative z-10 flex-1 min-h-0 pb-6">
                  <div className="flex items-center justify-between shrink-0 mb-4 px-4 py-3 bg-white/5 rounded-xl border border-white/5 shadow-inner">
                    <div className="text-xs font-black uppercase tracking-widest text-[var(--subtext)]">{t("current_state") || "Current State"}</div>
                    <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)] opacity-50">arrow_right_alt</span>
                    <div className={`text-xs font-black uppercase tracking-widest ${themeColor}`}>{t("selected_backup") || "Selected Backup"}</div>
                  </div>
                  <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-2 flex-1">
                    {filteredDiff.slice(0, diffLimit).map((diff, i) => (
                      <div key={i} className="flex items-center justify-between bg-white/5 hover:bg-white/10 transition-colors p-4 rounded-xl border border-transparent shrink-0">
                        <span className="text-xs font-black uppercase tracking-widest text-[var(--text)] truncate max-w-[60%]" title={diff.path}>{diff.path.split('/').pop()}</span>
                        <span className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shrink-0 ${diff.status === 'Modified' ? 'text-amber-500 bg-amber-500/10' :
                          diff.status === 'Missing in Current' ? 'text-rose-500 bg-rose-500/10' :
                            'text-emerald-500 bg-emerald-500/10'
                          }`}>
                          {diff.status === 'Modified' ? (t("modified") || 'Modified') :
                            diff.status === 'Missing in Current' ? (t("missing_in_current") || 'Missing in Current') :
                              (t("identical") || 'Identical')}
                        </span>
                      </div>
                    ))}
                    {filteredDiff.length === 0 && (
                      <div className="text-center text-[10px] text-emerald-500 py-8 uppercase tracking-widest">
                        {t("everything_identical") || "Everything is identical!"}
                      </div>
                    )}
                    {filteredDiff.length > diffLimit && (
                      <div className="flex flex-col items-center gap-3 mt-4 mb-2">
                        <div className="text-center text-[10px] text-[var(--subtext)] uppercase tracking-widest">
                          {t("showing_files")?.replace("{0}", diffLimit.toString()) || `Showing first ${diffLimit} files of ${filteredDiff.length}`}
                        </div>
                        <button onClick={() => setDiffLimit(l => l + 100)} className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-widest border border-white/5 transition-colors">
                          {t("load_more") || "Load More"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </SidePanel>
  );
}
