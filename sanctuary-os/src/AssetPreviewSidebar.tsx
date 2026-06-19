import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import { stripMarkdown } from "./shared";
import { useTheme } from "./ThemeContext";
import { useStore } from "./store";

export default function AssetPreviewSidebar({ assetType, assetId, onClose, onFlag }: { assetType: string, assetId: string, onClose: () => void, onFlag?: (assetId: string, assetType: string) => void }) {
  const { t, importLexicon, registry } = useLexicon();
  const { importTheme, CORE_THEMES, customThemes } = useTheme();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const session = useStore((state) => state.session);

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
        } else if (assetType === "lexicon" || assetType === "chameleon") {
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
      <div className="fixed top-0 right-0 bottom-10 w-full max-w-xl theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col z-[52001] animate-in slide-in-from-right duration-500 overflow-hidden backdrop-blur-[3px]">
        <button onClick={onClose} className="absolute top-12 right-6 z-50 w-10 h-10 bg-black/40 backdrop-blur-[3px] hover:theme-bg-danger text-white/70 hover:text-white rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          <span className="material-symbols-outlined !text-[24px]">{t("ui_icon_close") || "close"}</span>
        </button>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-xs font-black uppercase tracking-widest text-[var(--subtext)] animate-pulse">{t("loading") || "Loading"}</span>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10">
            <span className="text-4xl">⚠️</span>
            <span className="text-xs font-black uppercase tracking-widest text-[var(--danger)] text-center">{error}</span>
          </div>
        ) : data ? (
          <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
            <>
              <div className="h-40 relative bg-black border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0">
                <div className="w-full h-full flex items-center justify-center opacity-40 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                  <span className="material-symbols-outlined text-white" style={{ fontSize: '120px' }}>
                    {assetType === 'chameleon' ? 'palette' : assetType === 'lexicon' ? 'translate' : assetType === 'blueprint' ? 'map' : 'extension'}
                  </span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--accent)_30%,transparent)] to-transparent" />
              </div>
              
              <div className="px-10 pt-8 pb-4 relative shrink-0">
                <h3 className="text-3xl font-black text-[var(--text)] uppercase truncate">
                  {(data.displayName || (data.name || '').split('/').pop() || "").replace(/_/g, ' ').replace(/\.package$|\.ts4script$/i, '')}
                </h3>
                <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-2">
                  {data.version_label || data.version || t("dossier_vlocal") || "V.LOCAL"} &bull; {data.author || data.master_author || t("dossier_unknown") || "UNKNOWN"}
                </p>
              </div>
              <div className="p-10 flex flex-col gap-6 shrink-0 relative z-10">
                <div className="text-sm text-[var(--text)] leading-relaxed font-medium theme-glass-inner p-6 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
                  {data.description ? stripMarkdown(data.description) : t("dossier_no_desc_sub") || "No specific local description provided for this sub-artifact."}
                </div>
              </div>
            </>
              
            <div className="px-10 pb-10 mt-auto flex flex-col gap-3 shrink-0">
              {assetType === 'blueprint' ? (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(data.json_data?.code || '').catch(() => {});
                    useStore.getState().pushStatus("Copied Uplink Code: " + (data.json_data?.code || ''));
                  }}
                  className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg transition-all hover:scale-[1.02] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
                >
                  {t("market_btn_download_install") || "Download & Install"}
                </button>
              ) : assetType === 'lexicon' || assetType === 'chameleon' ? (
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
                    }
                    await supabase.rpc('increment_asset_downloads', { asset_id: data.id });
                  }}
                  className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg transition-all hover:scale-[1.02] ${isInstalled(data) ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]'}`}
                >
                  {isInstalled(data) ? (t("market_btn_reinstall") || "REINSTALL") : (t("market_btn_download_install") || "Download & Install")}
                </button>
              ) : null}

              {onFlag && session?.user?.user_metadata?.username !== data.author && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onFlag(assetId, assetType); }}
                  className="w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
                >
                  {t("market_btn_report") || "FLAG"}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </>,
    document.body
  );
}
