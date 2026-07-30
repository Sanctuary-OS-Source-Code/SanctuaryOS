import React, { useState, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import { stripMarkdown, getFileLabel, isSupportedExtension, formatDisplayName, compareVersions } from "./shared";
import { useTheme } from "./ThemeContext";
import { useStore } from "./store";
import { readTextFile, writeTextFile, mkdir, exists, readDir } from "@tauri-apps/plugin-fs";
import { appDataDir } from "@tauri-apps/api/path";

export default function AssetPreviewSidebar({ assetType, assetId, onClose, onFlag }: { assetType: string, assetId: string, onClose: () => void, onFlag?: (assetId: string, assetType: string) => void }) {
  const { t, importLexicon, registry } = useLexicon();
  const { importTheme, CORE_THEMES, customThemes } = useTheme();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [installedTemplates, setInstalledTemplates] = useState<Record<string, string>>({});
  const session = useStore((state) => state.session);
  const vaultPath = useStore((state) => state.vaultPath);

  useEffect(() => {
    const fetchLocalTemplates = async () => {
      try {
        if (!vaultPath) return;
        const templatesDir = `${vaultPath}\\Data\\Templates`;
        if (await exists(templatesDir)) {
          const files = await readDir(templatesDir);
          const map: Record<string, string> = {};
          for (const file of files) {
            if (file.name?.endsWith('_template.json')) {
              try {
                const content = await readTextFile(`${templatesDir}\\${file.name}`);
                const parsed = JSON.parse(content);
                const d = Array.isArray(parsed) ? parsed[0] : parsed;
                if (d.name) {
                  map[d.name] = d.version || '1.0.0';
                }
              } catch { }
            }
          }
          setInstalledTemplates(map);
        }
      } catch { }
    };
    fetchLocalTemplates();
  }, [vaultPath]);

  const isInstalled = (asset: any) => {
    if (!asset) return false;
    if (assetType === 'chameleon') {
      return Object.values({ ...CORE_THEMES, ...customThemes }).some((th: any) => th.name === asset.name);
    } else if (assetType === 'workbench_template') {
      return !!installedTemplates[asset.name];
    } else if (assetType === 'lexicon') {
      return !!registry?.[asset.name];
    }
    return false;
  };

  const getLocalVersion = (asset: any) => {
    if (!asset) return null;
    if (assetType === 'chameleon') {
      const theme = Object.values({ ...CORE_THEMES, ...customThemes }).find((th: any) => th.name === asset.name) as any;
      return theme?.version || '1.0.0';
    } else if (assetType === 'workbench_template') {
      return installedTemplates[asset.name];
    } else if (assetType === 'lexicon') {
      const lex = registry?.[asset.name];
      return lex?._meta_version || '1.0.0';
    }
    return null;
  };

  const getAssetDisplayVersion = (asset: any) => {
    let version = asset.version || '1.0.0';
    if (assetType === 'workbench_template' && asset.json_data) {
      try {
        const parsedRaw = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
        const parsed = Array.isArray(parsedRaw) ? parsedRaw[0] : parsedRaw;
        if (parsed && parsed.template_version) {
          version = parsed.template_version;
        }
      } catch (e) {}
    }
    return version;
  };

  const isOutdated = (asset: any) => {
    if (!isInstalled(asset)) return false;
    const localVersion = getLocalVersion(asset);
    return compareVersions(getAssetDisplayVersion(asset), localVersion) > 0;
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        if (assetType === "mod") {
          const { data: mData, error: mErr } = await supabase.from('mods').select('*').eq('id', assetId).single();
          if (mErr) throw mErr;
          setData(mData);
        } else if (assetType === "blueprint") {
          const { data: bData, error: bErr } = await supabase.from('blueprints').select('*').eq('id', assetId).single();
          if (bErr) throw bErr;
          setData(bData);
        } else if (assetType === "lexicon" || assetType === "chameleon" || assetType === "workbench_template") {
          const { data: mData, error: mErr } = await supabase.from('nexus_assets').select('*').eq('id', assetId).single();
          if (mErr) throw mErr;
          setData(mData);
        } else {
          setError(`Unsupported asset type: ${assetType}`);
        }
      } catch (err: any) {
        setError(err.message);
      }
      setLoading(false);
    }
    fetchData();
  }, [assetType, assetId]);

  return createPortal(
    <>
      <div className="fixed top-[50px] bottom-[40px] left-0 right-0 z-[52000] bg-black/0 backdrop-blur-[3px] animate-in fade-in duration-300" onClick={onClose} />
      <div className="fixed top-[50px] right-0 bottom-[40px] w-full max-w-xl theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col z-[52001] animate-in slide-in-from-right duration-500 overflow-hidden backdrop-blur-[3px] !rounded-l-[3rem] !rounded-r-none">
        <button onClick={onClose} className="group absolute top-8 right-8 z-50 w-10 h-10 theme-glass-panel hover:theme-bg-danger text-[var(--text)] hover:text-white rounded-full flex items-center justify-center transition-all duration-300 shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:scale-110 active:scale-95">
          <span className="material-symbols-outlined !text-[24px] transition-transform duration-300 group-hover:rotate-90">{t("icon_close")}</span>
        </button>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-xs font-black uppercase tracking-widest text-[var(--subtext)] animate-pulse">{t("loading")}</span>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10">
            <span className="text-4xl">⚠️</span>
            <span className="text-xs font-black uppercase tracking-widest text-[var(--danger)] text-center">{error}</span>
          </div>
        ) : data ? (
          <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
            <>
              <div className="relative border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 overflow-hidden bg-gradient-to-b from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent pt-6 pb-2 px-10">
                <div className="absolute inset-0 bg-[var(--accent)]/5 blur-[50px] pointer-events-none rounded-full transform scale-150 -translate-y-1/2"></div>
                <div className="flex items-start gap-6 relative z-10 w-full pr-12">
                  <div className="w-20 h-20 shrink-0 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-inner flex items-center justify-center">
                    <span className="material-symbols-outlined text-[var(--accent)] drop-shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]" style={{ fontSize: '40px' }}>
                      {assetType === 'chameleon' ? 'palette' : assetType === 'lexicon' ? 'translate' : assetType === 'blueprint' ? 'map' : assetType === 'workbench_template' ? 'edit' : 'extension'}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1 pt-1">
                    <div className="flex justify-between items-start gap-4">
                      <h3 className="text-3xl font-black text-[var(--text)] uppercase truncate leading-tight pb-1">
                        {(data.displayName || (data.name || '').split('/').pop() || "").replace(/_/g, ' ').replace(/\.[^/.]+$/, "")}
                      </h3>
                      {(data.is_paid || data.is_early_access) && (
                        <div className="flex gap-2 shrink-0 flex-col items-end">
                          {data.is_early_access && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[color-mix(in_srgb,#a855f7_15%,transparent)] border border-[color-mix(in_srgb,#a855f7_30%,transparent)] rounded-lg backdrop-blur-md shadow-lg">
                              <span className="material-symbols-outlined !text-[12px] text-[#d8b4fe]">science</span>
                              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#d8b4fe]">{t("badge_early_access") || "Early Access"}</span>
                            </div>
                          )}
                          {data.is_paid && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[color-mix(in_srgb,#eab308_15%,transparent)] border border-[color-mix(in_srgb,#eab308_30%,transparent)] rounded-lg backdrop-blur-md shadow-lg">
                              <span className="material-symbols-outlined !text-[12px] text-[#fef08a]">monetization_on</span>
                              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#fef08a]">{t("badge_paid") || "Paid"}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-6 mt-4">
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 mb-1">{t("update_version") || "VERSION"}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[12px] text-[var(--text)] opacity-50">commit</span>
                          <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest">
                            {(() => {
                              let versionText = data.version_label || data.version || t("vlocal") || "V.LOCAL";
                              if (assetType === 'workbench_template' && data.json_data) {
                                const parsedRaw = typeof data.json_data === 'string' ? JSON.parse(data.json_data) : data.json_data;
                                const parsed = Array.isArray(parsedRaw) ? parsedRaw[0] : parsedRaw;
                                if (parsed && parsed.template_version) {
                                  versionText = `v${parsed.template_version}`;
                                }
                              }
                              return versionText;
                            })()}
                          </span>
                        </div>
                      </div>
                      <div className="w-[1px] h-6 bg-gradient-to-b from-transparent via-[color-mix(in_srgb,var(--text)_20%,transparent)] to-transparent hidden sm:block"></div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 mb-1">{t("blueprint_author_label") || "AUTHOR"}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[12px] text-[var(--text)] opacity-50">person</span>
                          <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest">{data.author || data.master_author || t("vlocal") || "UNKNOWN"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-10 py-6 flex flex-col gap-8 shrink-0 relative z-10">
                <div className="flex flex-col gap-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("upload_desc") || "DESCRIPTION"}</h4>
                  <div className="text-sm text-[var(--text)] leading-relaxed font-medium theme-glass-inner p-6 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
                    {data.description ? stripMarkdown(data.description) : t("no_desc_sub")}
                  </div>
                </div>

                {assetType === 'workbench_template' && data.json_data && (() => {
                  const parsedRaw = typeof data.json_data === 'string' ? JSON.parse(data.json_data) : data.json_data;
                  const parsed = Array.isArray(parsedRaw) ? parsedRaw[0] : parsedRaw;
                  return (
                    <div className="flex flex-col gap-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("auto_template_architecture")}</h4>
                      <div className="flex flex-wrap gap-4">
                        {parsed.template_id && (
                          <div className="flex flex-col gap-1 theme-glass-inner p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm flex-1 min-w-[200px]">
                            <span className="text-xs font-bold text-[var(--subtext)]">{t("auto_template_id")}</span>
                            <span className="text-sm font-medium text-[var(--text)]">{parsed.template_id}</span>
                          </div>
                        )}
                        {parsed.target_file && (
                          <div className="flex flex-col gap-1 theme-glass-inner p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm flex-1 min-w-[200px]">
                            <span className="text-xs font-bold text-[var(--subtext)]">{t("upload_target_file")}</span>
                            <span className="text-sm font-medium text-[var(--text)]">{parsed.target_file}</span>
                          </div>
                        )}
                        {parsed.schema_version && (
                          <div className="flex flex-col gap-1 theme-glass-inner p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm flex-1 min-w-[200px]">
                            <span className="text-xs font-bold text-[var(--subtext)]">{t("auto_schema")}</span>
                            <span className="text-sm font-medium text-[var(--text)]">{t("auto_v")}{parsed.schema_version}</span>
                          </div>
                        )}
                        {parsed.template_version && (
                          <div className="flex flex-col gap-1 theme-glass-inner p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm flex-1 min-w-[200px]">
                            <span className="text-xs font-bold text-[var(--subtext)]">{t("update_version")}</span>
                            <span className="text-sm font-medium text-[var(--text)]">{parsed.template_version}</span>
                          </div>
                        )}
                        {parsed.mod_author && (
                          <div className="flex flex-col gap-1 theme-glass-inner p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm flex-1 min-w-[200px]">
                            <span className="text-xs font-bold text-[var(--subtext)]">{t("auto_mod_author")}</span>
                            <span className="text-sm font-medium text-[var(--text)]">{parsed.mod_author}</span>
                          </div>
                        )}
                        {parsed.parser_type && (
                          <div className="flex flex-col gap-1 theme-glass-inner p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm flex-1 min-w-[200px]">
                            <span className="text-xs font-bold text-[var(--subtext)]">{t("auto_parser")}</span>
                            <span className="text-sm font-medium text-[var(--text)] uppercase">{parsed.parser_type}</span>
                          </div>
                        )}
                        {parsed.supported_mod_versions && Array.isArray(parsed.supported_mod_versions) && parsed.supported_mod_versions.length > 0 && (
                          <div className="flex flex-col gap-1 theme-glass-inner p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm flex-1 min-w-[200px]">
                            <span className="text-xs font-bold text-[var(--subtext)]">{t("auto_supported_versions")}</span>
                            <span className="text-sm font-medium text-[var(--text)]">{parsed.supported_mod_versions.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {assetType !== 'workbench_template' && (
                  <div className="flex flex-col gap-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("asset_details") || "ASSET DETAILS"}</h4>
                    <div className="flex flex-wrap gap-4">
                      {data.version && (
                        <div className="flex flex-col gap-1 theme-glass-inner p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm flex-1 min-w-[120px]">
                          <span className="text-xs font-bold text-[var(--subtext)] uppercase">{t("update_version") || "VERSION"}</span>
                          <span className="text-sm font-medium text-[var(--text)]">{data.version}</span>
                        </div>
                      )}
                      {data.downloads !== undefined && (
                        <div className="flex flex-col gap-1 theme-glass-inner p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm flex-1 min-w-[120px]">
                          <span className="text-xs font-bold text-[var(--subtext)] uppercase">{t("downloads_count") || "DOWNLOADS"}</span>
                          <span className="text-sm font-medium text-[var(--text)]">{data.downloads?.toLocaleString() || "0"}</span>
                        </div>
                      )}
                      {data.created_at && (
                        <div className="flex flex-col gap-1 theme-glass-inner p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm flex-1 min-w-[120px]">
                          <span className="text-xs font-bold text-[var(--subtext)] uppercase">{t("created_date") || "PUBLISHED"}</span>
                          <span className="text-sm font-medium text-[var(--text)]">{new Date(data.created_at).toLocaleDateString()}</span>
                        </div>
                      )}
                      {data.updated_at && data.updated_at !== data.created_at && (
                        <div className="flex flex-col gap-1 theme-glass-inner p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm flex-1 min-w-[120px]">
                          <span className="text-xs font-bold text-[var(--subtext)] uppercase">{t("updated_date") || "UPDATED"}</span>
                          <span className="text-sm font-medium text-[var(--text)]">{new Date(data.updated_at).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(data.changelog || data.release_notes || (data.json_data && (data.json_data.changelog || data.json_data.release_notes))) && (
                  <div className="flex flex-col gap-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("whats_new")}</h4>
                    <div className="text-sm text-[var(--text)] leading-relaxed font-medium theme-glass-inner p-6 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
                      {stripMarkdown(data.changelog || data.release_notes || (data.json_data?.changelog) || (data.json_data?.release_notes))}
                    </div>
                  </div>
                )}
              </div>
            </>

            <div className="p-8 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] backdrop-blur-xl flex flex-row items-center justify-center gap-4 w-full relative z-50 shrink-0 mt-auto">

              {session?.user?.user_metadata?.username === data.author ? (
                <button
                  onClick={onClose}
                  className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all border backdrop-blur-md text-xs hover:scale-[1.02] active:scale-95 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_5px_20px_rgba(0,0,0,0.2)]"
                >
                  <span className="material-symbols-outlined !text-[18px]">{t("icon_close")}</span>
                  {t("nav_cancel")}
                </button>
              ) : onFlag ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onFlag(assetId, assetType); }}
                  className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all border backdrop-blur-md text-xs hover:scale-[1.02] active:scale-95 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[0_5px_20px_rgba(var(--danger-rgb),0.2)]"
                >
                  <span className="material-symbols-outlined !text-[18px]">{t("icon_flag")}</span>
                  {t("feed_btn_flag")}
                </button>
              ) : null}

              {assetType === 'blueprint' ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(data.json_data?.code || '').catch(() => { });
                    useStore.getState().pushStatus("Copied Uplink Code: " + (data.json_data?.code || ''));
                  }}
                  className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all border backdrop-blur-md text-xs hover:scale-[1.02] active:scale-95 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-[0_5px_20px_rgba(var(--accent-rgb),0.2)]"
                >
                  <span className="material-symbols-outlined !text-[18px]">{t("icon_download")}</span>
                  {t("update_panel_install")}
                </button>
              ) : assetType === 'lexicon' || assetType === 'chameleon' || assetType === 'workbench_template' ? (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (assetType === 'lexicon') {
                      const parsedData = typeof data.json_data === 'string' ? JSON.parse(data.json_data) : data.json_data;
                      importLexicon({ ...parsedData, _meta_language: data.language || "Custom", _meta_version: data.version || '1.0.0' }, data.name);
                      useStore.getState().pushStatus(`Successfully Installed Lexicon: ${data.name}`);
                    } else if (assetType === 'chameleon') {
                      importTheme(data.json_data);
                      useStore.getState().pushStatus(`Successfully Installed Chameleon: ${data.name}`);
                    } else if (assetType === 'workbench_template') {
                      try {
                        if (!vaultPath) throw new Error("Vault path not configured.");

                        let parsed = typeof data.json_data === 'string' ? JSON.parse(data.json_data) : data.json_data;
                        const displayData = Array.isArray(parsed) ? parsed[0] : parsed;
                        const templateId = displayData?.template_id || "vlocal";

                        const templatesDir = `${vaultPath}\\Data\\Templates`;
                        if (!(await exists(templatesDir))) {
                          await mkdir(templatesDir, { recursive: true });
                        }

                        await writeTextFile(`${templatesDir}\\${templateId}_template.json`, JSON.stringify(parsed, null, 2));
                        useStore.getState().pushStatus(`Successfully Installed Template: ${data.name}`);
                      } catch (err: any) {
                        useStore.getState().pushStatus(`Failed to install template: ${err.message}`);
                      }
                    }

                    try {
                      await supabase.rpc('increment_asset_downloads', { asset_id: assetId });
                    } catch (e) { console.error("Could not increment downloads", e); }
                  }}
                  className={`flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all shadow-lg text-xs hover:scale-[1.02] active:scale-95 ${isInstalled(data)
                      ? isOutdated(data)
                        ? 'bg-[color-mix(in_srgb,#3b82f6_15%,transparent)] border border-[color-mix(in_srgb,#3b82f6_30%,transparent)] text-[#3b82f6] hover:bg-[color-mix(in_srgb,#3b82f6_20%,transparent)] shadow-[0_5px_20px_rgba(59,130,246,0.2)]'
                        : 'bg-[color-mix(in_srgb,var(--subtext)_10%,transparent)] border border-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--subtext)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--subtext)_15%,transparent)] backdrop-blur-md'
                      : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] shadow-[0_5px_20px_rgba(var(--success-rgb),0.2)]'
                    }`}
                >
                  <span className="material-symbols-outlined !text-[18px]">{isInstalled(data) ? (isOutdated(data) ? "update" : "check_circle") : "download"}</span>
                  {isInstalled(data) ? (isOutdated(data) ? "UPDATE" : t("btn_reinstall")) : (t("update_panel_install"))}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </>,
    document.body
  );
}
