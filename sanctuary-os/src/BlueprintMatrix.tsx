import { useState, useMemo, useEffect } from "react";
import { formatDisplayName, ViewHeader, SidePanel, standardButtonClass, standardAccentGlassButtonClass } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

export default function BlueprintMatrix({ isOpen, onClose, playSet, modList, onUpload }: any) {
  const { t } = useLexicon();
  const [isPublic, setIsPublic] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isMarketListed, setIsMarketListed] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    if (isOpen && playSet) {
      setGeneratedCode(playSet.code || null);
      setIsPublic(playSet.is_public ?? true);
      setIsLocked(playSet.is_locked ?? false);
      setIsMarketListed(playSet.is_market_listed ?? false);
      setUploadError("");
      setIsUploading(false);

      const fetchCloudState = async () => {
        try {
          // If we have a code, fetch by code. Otherwise fetch by name and mason_id
          let query = supabase.from('blueprints').select('code, is_public, is_locked, is_market_listed');
          if (playSet.code) {
             query = query.eq('code', playSet.code);
          } else {
             // We need mason_id, which we can get from session
             const sessionResult = await supabase.auth.getSession();
             const session = sessionResult.data?.session;
             if (!session) return;

             let { data: masonData } = await supabase.from('masons').select('id').eq('profile_id', session.user.id).maybeSingle();

             if (!masonData) {
               const username = session.user.user_metadata?.username;
               if (!username) return;
               const { data: byName } = await supabase.from('masons').select('id').ilike('name', username).maybeSingle();
               masonData = byName;
             }

             if (!masonData) return;
             query = query.eq('mason_id', masonData.id).ilike('name', playSet.name);
          }
          const { data } = await query.maybeSingle();
          if (data) {
             setGeneratedCode(data.code);
             setIsPublic(data.is_public);
             setIsLocked(data.is_locked);
             setIsMarketListed(data.is_market_listed);
          }
        } catch (e) {
          console.warn("Failed to sync matrix settings with cloud", e);
        }
      };
      fetchCloudState();
    }
  }, [isOpen, playSet]);

  const handleUpload = async () => {
    setIsUploading(true);
    setUploadError("");
    const code = await onUpload(isPublic, isLocked, allowedMods, isMarketListed);
    if (code) {
      setGeneratedCode(code);
      useStore.getState().pushStatus(t("matrix_uplink_success") || "Uplink Successful", "success");
      navigator.clipboard.writeText(code).catch(() => {});
    } else {
      setUploadError(t("matrix_uplink_failed") || "Failed to generate uplink code.");
    }
    setIsUploading(false);
  };

  const { allowedMods, blockedMods } = useMemo(() => {
    if (!playSet) return { allowedMods: [], blockedMods: [] };
    const allowed: any[] = [];
    const blocked: any[] = [];

    const rawMods = playSet.mods
      .filter((modName: string) => !modName.startsWith("FOLDER_") && !modName.startsWith("SET_") && !modName.startsWith("LOCAL_SET_"))
      .map((modName: string) => {
        const mod = modList.find((m: any) => m.name === modName);
        return { name: modName, hash: mod?.hash || "", url: mod?.url || "", author: mod?.author || "Unknown", compliance_tier: mod?.compliance_tier || 0, displayName: mod?.displayName, isVirtual: mod?.isVirtual };
      });

    rawMods.forEach((m: any) => {
      if (m.isVirtual) return;

      if (m.compliance_tier === 1 || m.compliance_tier === 2) {
        blocked.push(m);
      } else {
        const lower = m.name.toLowerCase();
        if (lower.includes("customchallenge_")) {
          allowed.push(m);
        } else if (!lower.includes("merged") && !lower.includes("simmatticly") && !lower.includes("batch fix") && !lower.includes("batch_fix")) {
          allowed.push(m);
        }
      }
    });
    return { allowedMods: allowed, blockedMods: blocked };
  }, [playSet, modList]);

  if (!isOpen || !playSet) return null;

  return createPortal(
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("matrix_title") || "Matrix"}
      subtitle={`${t("matrix_subtitle")}${playSet.name}`}
      icon="cloud_upload"
      widthClass="w-[800px]"
      footer={
        <div className="flex justify-end gap-4 w-full">
           <button onClick={onClose} className={standardButtonClass}>
              {t("shared_cancel") || "Cancel"}
           </button>
           {blockedMods.length > 0 ? (
             <button 
               onClick={handleUpload}
               disabled={isUploading}
               className={standardAccentGlassButtonClass}
             >
               <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_cloud_upload") || "cloud_upload"}</span> {isUploading ? t("status_uploading_dna") || "UPLOADING..." : (generatedCode ? (t("matrix_btn_update_clean") || "UPDATE CLEAN IN CLOUD") : (t("matrix_btn_upload_clean") || "UPLOAD CLEAN"))}
             </button>
           ) : (
             <button 
               onClick={handleUpload}
               disabled={isUploading}
               className={standardAccentGlassButtonClass}
             >
               <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_cloud_upload") || "cloud_upload"}</span> {isUploading ? t("status_uploading_dna") || "UPLOADING..." : (generatedCode ? (t("matrix_btn_update") || "UPDATE IN CLOUD") : (t("matrix_btn_upload") || "UPLOAD"))}
             </button>
           )}
        </div>
      }
    >
      <div className="flex flex-col gap-8 p-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          
          {/* Visibility Toggle */}
          <div className={`p-8 rounded-[2rem] border transition-all cursor-pointer group flex flex-col gap-4 ${isPublic ? 'theme-border-success bg-[var(--success)]/10 shadow-[0_0_30px_rgba(var(--success-rgb),0.15)]' : 'border-white/5 hover:border-white/20 theme-glass-panel'}`} onClick={() => setIsPublic(true)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${isPublic ? 'theme-text-success' : 'text-[var(--subtext)]'}`}>{t("ui_icon_public") || "public"}</span>
                <span className={`text-sm font-black uppercase tracking-widest ${isPublic ? 'theme-text-success' : 'text-[var(--text)]'}`}>{t("matrix_public")}</span>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isPublic ? 'theme-border-success' : 'border-[var(--subtext)]/50'}`}>
                {isPublic && <div className="w-3 h-3 rounded-full theme-bg-success shadow-[0_0_10px_rgba(var(--success-rgb),0.8)]" />}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-80 leading-relaxed mt-2">
              {t("matrix_public_desc")}
            </p>
          </div>

          <div className={`p-8 rounded-[2rem] border transition-all cursor-pointer group flex flex-col gap-4 ${!isPublic ? 'theme-border-accent bg-[var(--accent)]/10 shadow-[0_0_30px_rgba(var(--accent-rgb),0.15)]' : 'border-white/5 hover:border-white/20 theme-glass-panel'}`} onClick={() => setIsPublic(false)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${!isPublic ? 'theme-text-accent' : 'text-[var(--subtext)]'}`}>{t("ui_icon_visibility_off") || "visibility_off"}</span>
                <span className={`text-sm font-black uppercase tracking-widest ${!isPublic ? 'theme-text-accent' : 'text-[var(--text)]'}`}>{t("matrix_private")}</span>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${!isPublic ? 'theme-border-accent' : 'border-[var(--subtext)]/50'}`}>
                {!isPublic && <div className="w-3 h-3 rounded-full theme-bg-accent shadow-[0_0_10px_rgba(var(--accent-rgb),0.8)]" />}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-80 leading-relaxed mt-2">
              {t("matrix_private_desc")}
            </p>
          </div>

          {/* Lock Toggle */}
          <div className={`p-8 rounded-[2rem] border transition-all cursor-pointer group flex flex-col gap-4 ${isLocked ? 'theme-border-danger bg-[var(--danger)]/10 shadow-[0_0_30px_rgba(var(--danger-rgb),0.15)]' : 'border-white/5 hover:border-white/20 theme-glass-panel'}`} onClick={() => setIsLocked(true)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${isLocked ? 'theme-text-danger' : 'text-[var(--subtext)]'}`}>{t("ui_icon_lock") || "lock"}</span>
                <span className={`text-sm font-black uppercase tracking-widest ${isLocked ? 'theme-text-danger' : 'text-[var(--text)]'}`}>{t("matrix_locked")}</span>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isLocked ? 'theme-border-danger' : 'border-[var(--subtext)]/50'}`}>
                {isLocked && <div className="w-3 h-3 rounded-full theme-bg-danger shadow-[0_0_10px_rgba(var(--danger-rgb),0.8)]" />}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-80 leading-relaxed mt-2">
              {t("matrix_locked_desc")}
            </p>
          </div>

          <div className={`p-8 rounded-[2rem] border transition-all cursor-pointer group flex flex-col gap-4 ${!isLocked ? 'theme-border-success bg-[var(--success)]/10 shadow-[0_0_30px_rgba(var(--success-rgb),0.15)]' : 'border-white/5 hover:border-white/20 theme-glass-panel'}`} onClick={() => setIsLocked(false)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${!isLocked ? 'theme-text-success' : 'text-[var(--subtext)]'}`}>{t("ui_icon_lock_open") || "lock_open"}</span>
                <span className={`text-sm font-black uppercase tracking-widest ${!isLocked ? 'theme-text-success' : 'text-[var(--text)]'}`}>{t("matrix_unlocked")}</span>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${!isLocked ? 'theme-border-success' : 'border-[var(--subtext)]/50'}`}>
                {!isLocked && <div className="w-3 h-3 rounded-full theme-bg-success shadow-[0_0_10px_rgba(var(--success-rgb),0.8)]" />}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-80 leading-relaxed mt-2">
              {t("matrix_unlocked_desc")}
            </p>
          </div>

          {/* Marketplace Toggle */}
          <div className={`p-8 rounded-[2rem] border transition-all cursor-pointer group flex flex-col gap-4 ${isMarketListed ? 'theme-border-success bg-[var(--success)]/10 shadow-[0_0_30px_rgba(var(--success-rgb),0.15)]' : 'border-white/5 hover:border-white/20 theme-glass-panel'}`} onClick={() => setIsMarketListed(true)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${isMarketListed ? 'theme-text-success' : 'text-[var(--subtext)]'}`}>{t("ui_icon_store") || "storefront"}</span>
                <span className={`text-sm font-black uppercase tracking-widest ${isMarketListed ? 'theme-text-success' : 'text-[var(--text)]'}`}>{t("matrix_market")}</span>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isMarketListed ? 'theme-border-success' : 'border-[var(--subtext)]/50'}`}>
                {isMarketListed && <div className="w-3 h-3 rounded-full theme-bg-success shadow-[0_0_10px_rgba(var(--success-rgb),0.8)]" />}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-80 leading-relaxed mt-2">
              {t("matrix_market_desc")}
            </p>
          </div>

          <div className={`p-8 rounded-[2rem] border transition-all cursor-pointer group flex flex-col gap-4 ${!isMarketListed ? 'theme-border-accent bg-[var(--accent)]/10 shadow-[0_0_30px_rgba(var(--accent-rgb),0.15)]' : 'border-white/5 hover:border-white/20 theme-glass-panel'}`} onClick={() => setIsMarketListed(false)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${!isMarketListed ? 'theme-text-accent' : 'text-[var(--subtext)]'}`}>{t("ui_icon_visibility_off") || "visibility_off"}</span>
                <span className={`text-sm font-black uppercase tracking-widest ${!isMarketListed ? 'theme-text-accent' : 'text-[var(--text)]'}`}>{t("matrix_market_off")}</span>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${!isMarketListed ? 'theme-border-accent' : 'border-[var(--subtext)]/50'}`}>
                {!isMarketListed && <div className="w-3 h-3 rounded-full theme-bg-accent shadow-[0_0_10px_rgba(var(--accent-rgb),0.8)]" />}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-80 leading-relaxed mt-2">
              {t("matrix_market_off_desc")}
            </p>
          </div>

        </div>

        {blockedMods.length > 0 && (
          <div className="mt-8 p-10 theme-glass-panel border-l-4 border-l-[var(--danger)] border-[var(--danger)]/50 rounded-[2.5rem] shadow-2xl flex flex-col gap-6">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl theme-bg-danger flex items-center justify-center shadow-[0_0_20px_rgba(var(--danger-rgb),0.4)]">
                <span className="material-symbols-outlined !text-3xl text-white">{t("ui_icon_warning") || "warning"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <h4 className="text-xl font-black theme-text-danger uppercase tracking-widest">{t("matrix_tier_warning_title")}</h4>
                <p className="text-xs font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest">{t("matrix_tier_warning_desc")}</p>
              </div>
            </div>
            <div className="theme-glass-inner rounded-2xl p-6 border border-white/5 max-h-48 overflow-y-auto custom-scrollbar flex flex-col gap-2">
              {blockedMods.map((mod: any) => (
                <div key={mod.name} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 group">
                  <span className="text-sm font-bold text-[var(--text)] truncate mr-4">{formatDisplayName(mod.name)}</span>
                  <span className="text-[10px] font-black theme-text-danger bg-[var(--danger)]/10 px-4 py-2 rounded-xl shadow-inner whitespace-nowrap">TIER {mod.compliance_tier}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="theme-glass-panel p-8 rounded-[2.5rem] border border-white/10 flex flex-col gap-4 shadow-xl">
          <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest opacity-80">{t("matrix_uplink_code_label")}</span>
          <div className="flex items-center gap-3">
            <input 
              readOnly 
              value={generatedCode || ""} 
              placeholder={t("matrix_code_placeholder")}
              className="flex-1 bg-black/40 border border-white/10 rounded-xl p-4 text-[var(--text)] font-mono font-bold tracking-widest text-center focus:outline-none"
            />
            <button 
              onClick={() => {
                if (generatedCode) {
                  navigator.clipboard.writeText(generatedCode).catch(() => {});
                }
              }}
              disabled={!generatedCode}
              className={`px-6 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${generatedCode ? 'bg-white/10 hover:bg-white/20 text-[var(--text)]' : 'bg-white/5 text-[var(--subtext)] opacity-50 cursor-not-allowed'}`}
            >
              {t("matrix_btn_copy")}
            </button>
          </div>
          {uploadError && <span className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center justify-center gap-2 mt-2"><span className="material-symbols-outlined !text-[14px]">error</span> {uploadError}</span>}
        </div>
      </div>
    </SidePanel>,
    document.body
   );
 }
