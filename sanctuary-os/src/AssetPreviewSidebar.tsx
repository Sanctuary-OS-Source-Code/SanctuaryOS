import React, { useState, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import { stripMarkdown, getFileLabel, isSupportedExtension, formatDisplayName, compareVersions, SidePanel, SidePanelActionFooter } from "./shared";
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

  return (
    <SidePanel
      isOpen={true}
      onClose={onClose}
      title={data ? (data.displayName || (data.name || '').split('/').pop() || "").replace(/_/g, ' ').replace(/\.[^/.]+$/, "") : t("loading")}
      subtitle={data ? (data.author || data.master_author || t("vlocal") || "UNKNOWN") : undefined}
      icon={assetType === 'chameleon' ? 'palette' : assetType === 'lexicon' ? 'translate' : assetType === 'blueprint' ? 'map' : assetType === 'workbench_template' ? 'edit' : 'extension'}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[500px]"
      coverImage={data?.image_url || data?.thumbnail_url}
      headerActions={
        data && (data.is_paid || data.is_early_access) ? (
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
        ) : undefined
      }
      footer={
        data && (
          <SidePanelActionFooter
            hideCancel={session?.user?.user_metadata?.username !== data.author && !onFlag}
            onCancel={session?.user?.user_metadata?.username === data.author ? onClose : undefined}
            onDanger={session?.user?.user_metadata?.username !== data.author && onFlag ? () => { onFlag(assetId, assetType); } : undefined}
            dangerLabel={t("feed_btn_flag")}
            dangerIcon="flag"
            
            onAction={async (e?: React.MouseEvent) => {
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
            actionLabel={assetType === 'blueprint' ? (t("update_panel_install")) : (isInstalled(data) ? (isOutdated(data) ? "UPDATE" : t("btn_reinstall")) : (t("update_panel_install")))}
            actionIcon={assetType === 'blueprint' ? "download" : (isInstalled(data) ? (isOutdated(data) ? "update" : "check_circle") : "download")}
            actionVariant={assetType !== 'blueprint' && isInstalled(data) && !isOutdated(data) ? "glass" : "accent"}
          />
        )
      }
    >
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
        <div className="flex flex-col gap-8 shrink-0 relative z-10 w-full">
          <div className="flex flex-col gap-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("upload_desc") || "DESCRIPTION"}</h4>
            <div className="text-sm text-[var(--text)] leading-relaxed font-medium glass-panel p-6 rounded-3xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/[3%] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
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
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("auto_template_architecture")}</h4>
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

          {assetType !== 'workbench_template' && (
            <div className="flex flex-col gap-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("asset_details") || "ASSET DETAILS"}</h4>
              <div className="flex flex-wrap gap-4">
                {data.version && (
                  <UniversalCard layout="stat" className="flex-1 min-w-[120px]" title={t("update_version") || "VERSION"} subtitle={data.version} />
                )}
                {data.downloads !== undefined && (
                  <UniversalCard layout="stat" className="flex-1 min-w-[120px]" title={t("downloads_count") || "DOWNLOADS"} subtitle={data.downloads?.toLocaleString() || "0"} />
                )}
                {data.created_at && (
                  <UniversalCard layout="stat" className="flex-1 min-w-[120px]" title={t("created_date") || "PUBLISHED"} subtitle={new Date(data.created_at).toLocaleDateString()} />
                )}
                {data.updated_at && data.updated_at !== data.created_at && (
                  <UniversalCard layout="stat" className="flex-1 min-w-[120px]" title={t("updated_date") || "UPDATED"} subtitle={new Date(data.updated_at).toLocaleDateString()} />
                )}
              </div>
            </div>
          )}

          {(data.changelog || data.release_notes || (data.json_data && (data.json_data.changelog || data.json_data.release_notes))) && (
            <div className="flex flex-col gap-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("whats_new")}</h4>
              <div className="text-sm text-[var(--text)] leading-relaxed font-medium glass-panel p-6 rounded-3xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/[3%] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                <div className="relative z-10">
                  {stripMarkdown(data.changelog || data.release_notes || (data.json_data?.changelog) || (data.json_data?.release_notes))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </SidePanel>
  );
}
