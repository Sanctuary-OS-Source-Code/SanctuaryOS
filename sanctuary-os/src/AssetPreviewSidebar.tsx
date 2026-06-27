import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import { stripMarkdown } from "./shared";
import { useTheme } from "./ThemeContext";
import { useStore } from "./store";
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { appDataDir } from "@tauri-apps/api/path";

export default function AssetPreviewSidebar({ assetType, assetId, onClose, onFlag }: { assetType: string, assetId: string, onClose: () => void, onFlag?: (assetId: string, assetType: string) => void }) {
  const { t, importLexicon, registry } = useLexicon();
  const { importTheme, CORE_THEMES, customThemes } = useTheme();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const session = useStore((state) => state.session);
  const vaultPath = useStore((state) => state.vaultPath);

  const isInstalled = (asset: any) => {
    if (assetType === 'chameleon') {
      return Object.values({ ...CORE_THEMES, ...customThemes }).some((th: any) => th.name === asset.name);
    } else if (assetType === 'lexicon') {
      return !!registry?.[asset.name];
    }
    return false;
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
          const { data: mData, error: mErr } = await supabase.from('marketplace_assets').select('*').eq('id', assetId).single();
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
      <div className="fixed inset-0 z-[52000] bg-black/0 backdrop-blur-[3px] animate-in fade-in duration-300" onClick={onClose} />
      <div className="fixed top-10 right-0 bottom-10 w-full max-w-xl theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col z-[52001] animate-in slide-in-from-right duration-500 overflow-hidden backdrop-blur-[3px] rounded-tl-[3rem] rounded-bl-[3rem]">
        <button onClick={onClose} className="absolute top-8 right-8 z-50 w-10 h-10 theme-glass-panel hover:theme-bg-danger text-[var(--text)] hover:text-white rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          <span className="material-symbols-outlined !text-[24px]">{t("ui_icon_close")}</span>
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
              <div className="h-48 relative border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex flex-col items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[var(--accent)]/5 blur-[50px] pointer-events-none rounded-full transform scale-150"></div>
                <div className="w-24 h-24 rounded-[2rem] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-inner flex items-center justify-center relative z-10">
                  <span className="material-symbols-outlined text-[var(--accent)] drop-shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]" style={{ fontSize: '48px' }}>
                    {assetType === 'chameleon' ? 'palette' : assetType === 'lexicon' ? 'translate' : assetType === 'blueprint' ? 'map' : assetType === 'workbench_template' ? 'draw' : 'extension'}
                  </span>
                </div>
              </div>
              
              <div className="px-10 pt-8 pb-4 relative shrink-0">
                <h3 className="text-3xl font-black text-[var(--text)] uppercase truncate">
                  {(data.displayName || (data.name || '').split('/').pop() || "").replace(/_/g, ' ').replace(/\.package$|\.ts4script$/i, '')}
                </h3>
                <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-2">
                  {(() => {
                     let versionText = data.version_label || data.version || t("dossier_vlocal") || "V.LOCAL";
                     if (assetType === 'workbench_template' && data.json_data) {
                       const parsedRaw = typeof data.json_data === 'string' ? JSON.parse(data.json_data) : data.json_data;
                       const parsed = Array.isArray(parsedRaw) ? parsedRaw[0] : parsedRaw;
                       if (parsed && parsed.template_version) {
                         versionText = `v${parsed.template_version}`;
                       }
                     }
                     return versionText;
                  })()} &bull; {data.author || data.master_author || t("dossier_unknown") || "UNKNOWN"}
                </p>
              </div>
              <div className="p-10 flex flex-col gap-6 shrink-0 relative z-10">
                <div className="text-sm text-[var(--text)] leading-relaxed font-medium theme-glass-inner p-6 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
                  {data.description ? stripMarkdown(data.description) : t("dossier_no_desc_sub")}
                </div>
                {assetType === 'workbench_template' && data.json_data && (() => {
                   const parsedRaw = typeof data.json_data === 'string' ? JSON.parse(data.json_data) : data.json_data;
                   const parsed = Array.isArray(parsedRaw) ? parsedRaw[0] : parsedRaw;
                   return (
                     <div className="flex flex-col gap-4 p-6 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-2 mb-2">
                           <span className="material-symbols-outlined !text-[14px]">{t("auto_info")}</span>
                           {t("auto_template_architecture")}
                        </h4>
                        <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-[10px] font-mono">
                           {parsed.template_id && (
                             <div className="flex flex-col gap-1">
                                <span className="text-[var(--subtext)] opacity-60">{t("auto_template_id")}</span>
                                <span className="text-[var(--text)] font-black truncate">{parsed.template_id}</span>
                             </div>
                           )}
                           {parsed.target_file && (
                             <div className="flex flex-col gap-1">
                                <span className="text-[var(--subtext)] opacity-60">{t("auto_target_file")}</span>
                                <span className="text-[var(--text)] font-black truncate">{parsed.target_file}</span>
                             </div>
                           )}
                           {parsed.schema_version && (
                             <div className="flex flex-col gap-1">
                                <span className="text-[var(--subtext)] opacity-60">{t("auto_schema")}</span>
                                <span className="text-[var(--text)] font-black">{t("auto_v")}{parsed.schema_version}</span>
                             </div>
                           )}
                           {parsed.template_version && (
                             <div className="flex flex-col gap-1">
                                <span className="text-[var(--subtext)] opacity-60">{t("auto_version")}</span>
                                <span className="text-[var(--text)] font-black">{parsed.template_version}</span>
                             </div>
                           )}
                           {parsed.mod_author && (
                             <div className="flex flex-col gap-1">
                                <span className="text-[var(--subtext)] opacity-60">{t("auto_mod_author")}</span>
                                <span className="text-[var(--text)] font-black truncate">{parsed.mod_author}</span>
                             </div>
                           )}
                           {parsed.parser_type && (
                             <div className="flex flex-col gap-1">
                                <span className="text-[var(--subtext)] opacity-60">{t("auto_parser")}</span>
                                <span className="text-[var(--text)] font-black uppercase">{parsed.parser_type}</span>
                             </div>
                           )}
                        </div>
                        {parsed.supported_mod_versions && Array.isArray(parsed.supported_mod_versions) && parsed.supported_mod_versions.length > 0 && (
                          <div className="flex flex-col gap-2 mt-2 pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                             <span className="text-[var(--subtext)] opacity-60 text-[10px] font-mono">{t("auto_supported_versions")}</span>
                             <div className="flex flex-wrap gap-2">
                               {parsed.supported_mod_versions.map((v: string) => (
                                 <span key={v} className="px-2 py-1 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-md text-[9px] font-black text-[var(--text)]">{v}</span>
                               ))}
                             </div>
                          </div>
                        )}
                     </div>
                   );
                })()}
              </div>
            </>
              
            <div className="p-8 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] backdrop-blur-xl flex flex-row items-center justify-center gap-4 w-full relative z-50 shrink-0 mt-auto">
              
              {session?.user?.user_metadata?.username === data.author ? (
                <button 
                  onClick={onClose}
                  className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all border backdrop-blur-md text-xs hover:scale-[1.02] active:scale-95 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_5px_20px_rgba(0,0,0,0.2)]"
                >
                  <span className="material-symbols-outlined !text-[18px]">{t("auto_close")}</span>
                  {t("ui_btn_cancel")}
                </button>
              ) : onFlag ? (
                <button 
                  onClick={(e) => { e.stopPropagation(); onFlag(assetId, assetType); }}
                  className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all border backdrop-blur-md text-xs hover:scale-[1.02] active:scale-95 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[0_5px_20px_rgba(var(--danger-rgb),0.2)]"
                >
                  <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_flag")}</span>
                  {t("market_btn_report")}
                </button>
              ) : null}

              {assetType === 'blueprint' ? (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(data.json_data?.code || '').catch(() => {});
                    useStore.getState().pushStatus("Copied Uplink Code: " + (data.json_data?.code || ''));
                  }}
                  className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all border backdrop-blur-md text-xs hover:scale-[1.02] active:scale-95 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-[0_5px_20px_rgba(var(--accent-rgb),0.2)]"
                >
                  <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_download")}</span>
                  {t("market_btn_download_install")}
                </button>
              ) : assetType === 'lexicon' || assetType === 'chameleon' || assetType === 'workbench_template' ? (
                <button 
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (assetType === 'lexicon') {
                       const parsedData = typeof data.json_data === 'string' ? JSON.parse(data.json_data) : data.json_data;
                       importLexicon({ ...parsedData, _meta_language: data.language || "Custom" }, data.name);
                       useStore.getState().pushStatus(`Successfully Installed Lexicon: ${data.name}`);
                    } else if (assetType === 'chameleon') {
                       importTheme(data.json_data);
                       useStore.getState().pushStatus(`Successfully Installed Chameleon: ${data.name}`);
                    } else if (assetType === 'workbench_template') {
                       try {
                         if (!vaultPath) throw new Error("Vault path not configured.");
                         
                         let parsed = typeof data.json_data === 'string' ? JSON.parse(data.json_data) : data.json_data;
                         const displayData = Array.isArray(parsed) ? parsed[0] : parsed;
                         const templateId = displayData?.template_id || "unknown";
                         
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

                    await supabase.rpc('increment_asset_downloads', { asset_id: assetId });
                  }}
                  className={`flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all shadow-lg text-xs hover:scale-[1.02] active:scale-95 ${isInstalled(data) ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] shadow-[0_5px_20px_rgba(var(--success-rgb),0.2)]' : 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-[0_5px_20px_rgba(var(--accent-rgb),0.2)]'}`}
                >
                  <span className="material-symbols-outlined !text-[18px]">{isInstalled(data) ? "check_circle" : "download"}</span>
                  {isInstalled(data) ? (t("market_btn_reinstall")) : (t("market_btn_download_install"))}
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
