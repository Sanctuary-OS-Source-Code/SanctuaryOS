import React, { useState, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import { stripMarkdown, getFileLabel, isSupportedExtension, formatDisplayName, compareVersions, SidePanel, PanelHeaderGroup, PanelHeaderButton } from "./shared";
import { useTheme } from "./ThemeContext";
import { useStore } from "./store";
import { readTextFile, writeTextFile, mkdir, exists, readDir } from "@tauri-apps/plugin-fs";
import { appDataDir } from "@tauri-apps/api/path";
import { UniversalCard } from "./components/universal/UniversalCard";

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
      } catch (e) { }
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

  return (
    <SidePanel
      isOpen={true}
      onClose={onClose}
      title={assetType === 'chameleon' ? (t("chameleon_inspector") || "Chameleon Inspector") : assetType === 'lexicon' ? (t("lexicon_inspector") || "Lexicon Inspector") : assetType === 'workbench_template' ? (t("template_inspector") || "Template Inspector") : (t("asset_inspector") || "Asset Inspector")}
      subtitle={assetType === 'chameleon' ? (t("chameleon_desc") || "Community Theme") : assetType === 'lexicon' ? (t("lexicon_desc") || "Community Language Pack") : assetType === 'workbench_template' ? (t("template_desc") || "Community Template") : (t("asset_desc") || "Community Asset")}
      icon={assetType === 'chameleon' ? 'palette' : assetType === 'lexicon' ? 'translate' : assetType === 'blueprint' ? 'map' : assetType === 'workbench_template' ? 'edit' : 'extension'}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[600px]"
      backdropZ="z-[70000]"
      panelZ="z-[70001]"
      coverImage={data?.image_url || data?.thumbnail_url}
      headerActions={
        data ? (
          <PanelHeaderGroup>
            {session?.user && session?.user?.user_metadata?.username !== data.author && onFlag && (
              <PanelHeaderButton
                icon="flag"
                tooltip={t("feed_btn_flag")}
                onClick={() => onFlag(assetId, assetType)}
                variant="danger"
              />
            )}
            <PanelHeaderButton
              icon={assetType === 'blueprint' ? "download" : (isInstalled(data) ? (isOutdated(data) ? "update" : "check_circle") : "download")}
              tooltip={assetType === 'blueprint' ? (t("update_panel_install")) : (isInstalled(data) ? (isOutdated(data) ? "UPDATE" : t("btn_reinstall")) : (t("update_panel_install")))}
              onClick={async (e?: React.MouseEvent) => {
                e?.stopPropagation();
                if (assetType === 'blueprint') {
                  navigator.clipboard.writeText(data.json_data?.code || '').catch(() => { });
                  useStore.getState().pushStatus("Copied Uplink Code: " + (data.json_data?.code || ''));
                } else if (assetType === 'lexicon' || assetType === 'chameleon' || assetType === 'workbench_template') {
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
                }
              }}
              variant={assetType === 'blueprint' ? (isInstalled(data) ? "primary" : "success") : (isInstalled(data) ? (isOutdated(data) ? "primary" : "glass") : "success")}
            />
          </PanelHeaderGroup>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs font-black capitalize tracking-widest text-[var(--subtext)] animate-pulse">{t("loading")}</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10">
          <span className="text-4xl">⚠️</span>
          <span className="text-xs font-black capitalize tracking-widest text-[var(--danger)] text-center">{error}</span>
        </div>
      ) : data ? (
        <div className="flex flex-col relative z-10 w-full pb-10 break-words">
          <div className="flex flex-col gap-8 pb-8 px-6 shrink-0 relative border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
            <div className="absolute top-0 right-0 opacity-[0.03] pointer-events-none" style={{ transform: 'translate(20%, -20%)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '300px' }}>{assetType === 'chameleon' ? 'palette' : assetType === 'lexicon' ? 'translate' : assetType === 'blueprint' ? 'map' : assetType === 'workbench_template' ? 'edit' : 'extension'}</span>
            </div>
            <div className="flex items-start justify-between gap-6 relative z-10 w-full mt-6">
              <div className="flex flex-col gap-2 flex-1 min-w-0 max-w-full">
                <h1 className="text-4xl font-black capitalize tracking-tight text-[var(--text)] drop-shadow-md break-words break-all" style={{ overflowWrap: 'anywhere' }}>
                  {(data.displayName || (data.name || '').split('/').pop() || "").replace(/_/g, ' ').replace(/\.[^/.]+$/, "")}
                </h1>
                <div className="flex items-center gap-3 flex-wrap mt-2">
                  <span className="px-4 py-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-xs font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2 shadow-sm backdrop-blur-sm truncate max-w-full">
                    <span className="material-symbols-outlined !text-[16px] shrink-0">draft</span>
                    <span className="truncate">{assetType === 'workbench_template' ? 'template' : assetType}</span>
                  </span>
                  {data.is_early_access && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[color-mix(in_srgb,#a855f7_15%,transparent)] border border-[color-mix(in_srgb,#a855f7_30%,transparent)] rounded-lg backdrop-blur-[2px] shadow-lg">
                      <span className="material-symbols-outlined !text-[12px] text-[#d8b4fe]">science</span>
                      <span className="text-[9px] font-black capitalize tracking-[0.2em] text-[#d8b4fe]">{t("badge_early_access")}</span>
                    </div>
                  )}
                  {data.is_paid && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[color-mix(in_srgb,#eab308_15%,transparent)] border border-[color-mix(in_srgb,#eab308_30%,transparent)] rounded-lg backdrop-blur-[2px] shadow-lg">
                      <span className="material-symbols-outlined !text-[12px] text-[#fef08a]">monetization_on</span>
                      <span className="text-[9px] font-black capitalize tracking-[0.2em] text-[#fef08a]">{t("badge_paid")}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 relative z-10 w-full flex-wrap">
              <div className="flex-[1.5] min-w-[200px] flex flex-col gap-1 items-start px-5 py-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm backdrop-blur-md transition-transform hover:-translate-y-1 hover:shadow-lg">
                <span className="text-[10px] uppercase font-black tracking-widest opacity-50">{t("author") || "Author"}</span>
                <span className="text-lg font-black flex items-center gap-2 max-w-full"><span className="material-symbols-outlined !text-[20px] theme-text-accent shrink-0">person</span> <span className="truncate" title={data.author || data.master_author || "Citizen"}>{data.author || data.master_author || "Citizen"}</span></span>
              </div>
              <div className="flex-1 min-w-[140px] flex flex-col gap-1 items-start px-5 py-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm backdrop-blur-md transition-transform hover:-translate-y-1 hover:shadow-lg">
                <span className="text-[10px] uppercase font-black tracking-widest opacity-50">{t("update_version") || "Version"}</span>
                <span className="text-lg font-black flex items-center gap-2"><span className="material-symbols-outlined !text-[20px] theme-text-accent">new_releases</span> {getAssetDisplayVersion(data) || "1.0.0"}</span>
              </div>
              <div className="flex-1 min-w-[140px] flex flex-col gap-1 items-start px-5 py-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm backdrop-blur-md transition-transform hover:-translate-y-1 hover:shadow-lg">
                <span className="text-[10px] uppercase font-black tracking-widest opacity-50">{t("downloads_count") || "Downloads"}</span>
                <span className="text-lg font-black flex items-center gap-2"><span className="material-symbols-outlined !text-[20px] theme-text-accent">download</span> {data.downloads?.toLocaleString() || "0"}</span>
              </div>
              {data.created_at && (
                <div className="flex-1 min-w-[140px] flex flex-col gap-1 items-start px-5 py-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm backdrop-blur-md transition-transform hover:-translate-y-1 hover:shadow-lg">
                  <span className="text-[10px] uppercase font-black tracking-widest opacity-50">{t("created_date") || "Published"}</span>
                  <span className="text-lg font-black flex items-center gap-2"><span className="material-symbols-outlined !text-[20px] theme-text-accent">calendar_today</span> {new Date(data.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 flex flex-col gap-8 flex-1">
            <div className="flex flex-col gap-4">
              <h4 className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("upload_desc")}</h4>
              <div className="text-sm text-[var(--text)] leading-relaxed font-medium glass-panel p-6 rounded-3xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-xl relative group">
                <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_3%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                <div className="relative z-10">
                  {data.description ? stripMarkdown(data.description) : t("no_desc_sub")}
                </div>
              </div>
            </div>

            {assetType === 'workbench_template' && data.json_data && (() => {
              const parsedRaw = typeof data.json_data === 'string' ? JSON.parse(data.json_data) : data.json_data;
              const parsed = Array.isArray(parsedRaw) ? parsedRaw[0] : parsedRaw;
              return (
                <div className="flex flex-col gap-4">
                  <h4 className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("auto_template_architecture")}</h4>
                  <div className="flex flex-wrap gap-4">
                    {parsed.template_id && (
                      <UniversalCard layout="stat" className="flex-1 min-w-[200px]" title={t("auto_template_id")} subtitle={parsed.template_id} />
                    )}
                    {parsed.target_file && (
                      <UniversalCard layout="stat" className="flex-1 min-w-[200px]" title={t("upload_target_file")} subtitle={parsed.target_file} />
                    )}
                    {parsed.schema_version && (
                      <UniversalCard layout="stat" className="flex-1 min-w-[200px]" title={t("auto_schema")} subtitle={`${t("auto_v")}${parsed.schema_version}`} />
                    )}
                    {parsed.template_version && (
                      <UniversalCard layout="stat" className="flex-1 min-w-[200px]" title={t("update_version")} subtitle={parsed.template_version} />
                    )}
                    {parsed.mod_author && (
                      <UniversalCard layout="stat" className="flex-1 min-w-[200px]" title={t("auto_mod_author")} subtitle={parsed.mod_author} />
                    )}
                    {parsed.parser_type && (
                      <UniversalCard layout="stat" className="flex-1 min-w-[200px]" title={t("auto_parser")} subtitle={parsed.parser_type} />
                    )}
                    {parsed.supported_mod_versions && Array.isArray(parsed.supported_mod_versions) && parsed.supported_mod_versions.length > 0 && (
                      <UniversalCard layout="stat" className="flex-1 min-w-[200px]" title={t("auto_supported_versions")} subtitle={parsed.supported_mod_versions.join(', ')} />
                    )}
                  </div>
                </div>
              );
            })()}



            {(data.changelog || data.release_notes || (data.json_data && (data.json_data.changelog || data.json_data.release_notes))) && (
              <div className="flex flex-col gap-4">
                <h4 className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("whats_new")}</h4>
                <div className="text-sm text-[var(--text)] leading-relaxed font-medium glass-panel p-6 rounded-3xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-xl relative group">
                  <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_3%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                  <div className="relative z-10">
                    {stripMarkdown(data.changelog || data.release_notes || (data.json_data?.changelog) || (data.json_data?.release_notes))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </SidePanel>
  );
}



