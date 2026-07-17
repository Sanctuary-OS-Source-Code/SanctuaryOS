import { useState, useMemo, useEffect } from "react";
import { formatDisplayName, ViewHeader, SidePanel, standardButtonClass, standardAccentGlassButtonClass, HoverTooltip } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";

export default function BlueprintMatrix({ isOpen, onClose, playSet, modList, onUpload, onUpdatePlaySet }: any) {
  const { t } = useLexicon();
  const { session, playSets, setPlaySets } = useStore();
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
          let query = supabase.from('blueprints').select('code, is_public, is_locked, is_market_listed');
          if (playSet.code) {
            query = query.eq('code', playSet.code);
          } else {
            const sessionResult = await supabase.auth.getSession();
            const session = sessionResult.data?.session;
            if (!session) return;

            let { data: masonData } = await supabase.from('masons').select("id").eq('profile_id', session.user.id).maybeSingle();

            if (!masonData) {
              const username = session.user.user_metadata?.username;
              if (!username) return;
              const { data: byName } = await supabase.from('masons').select("id").ilike('name', username).maybeSingle();
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
      useStore.getState().pushStatus(t("matrix_uplink_success"), "success");
      navigator.clipboard.writeText(code).catch(() => { });
    } else {
      setUploadError(t("matrix_uplink_failed"));
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

  const handleRemoveArtifact = (modName: string) => {
    if (!playSet || !onUpdatePlaySet) return;
    const updatedMods = playSet.mods.filter((m: string) => m !== modName);
    onUpdatePlaySet({ ...playSet, mods: updatedMods });
  };

  const handleRemoveAllViolating = () => {
    if (!playSet || !onUpdatePlaySet) return;
    const violatingNames = blockedMods.map((m: any) => m.name);
    const updatedMods = playSet.mods.filter((m: string) => !violatingNames.includes(m));
    onUpdatePlaySet({ ...playSet, mods: updatedMods });
  };

  const isGuest = !session;
  const isBanned = localStorage.getItem("sanctuary_blacklisted") === "true";
  const isUploadBlocked = isGuest || isBanned;

  return createPortal(
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("matrix_title")}
      subtitle={t("matrix_subtitle")}
      footer={
        <div className="flex justify-center items-center gap-4 w-full">
          <button onClick={onClose} className={standardButtonClass}>
            {t("nav_cancel")}
          </button>
          <div className="relative group/uplinkbtn">
            {isUploadBlocked && (
              <HoverTooltip
                variant="danger"
                title={isBanned ? t("alert_comm_banned") : t("alert_guest_mode_uploads")}
                subtitle={isBanned ? t("alert_comm_banned_desc") : t("alert_guest_mode_desc")}
                className="group-hover/uplinkbtn:flex z-[1000]"
              />
            )}
            <button
              onClick={handleUpload}
              disabled={isUploading || isUploadBlocked}
              className={`${standardAccentGlassButtonClass} ${isUploadBlocked ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
            >
              {isUploading ? (t("scanning")) : (t("matrix_btn_upload"))}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-2 gap-4">
          <div className={`p-8 rounded-[var(--radius)] border transition-all cursor-pointer group flex flex-col gap-4 ${isPublic ? 'theme-border-success bg-[var(--success)]/10 shadow-[0_0_30px_rgba(var(--success-rgb),0.15)]' : 'border-white/5 hover:border-white/20 theme-glass-panel'}`} onClick={() => setIsPublic(true)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${isPublic ? 'theme-text-success' : 'text-[var(--subtext)]'}`}>{t("icon_public")}</span>
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

          <div className={`p-8 rounded-[var(--radius)] border transition-all cursor-pointer group flex flex-col gap-4 ${!isPublic ? 'theme-border-accent bg-[var(--accent)]/10 shadow-[0_0_30px_rgba(var(--accent-rgb),0.15)]' : 'border-white/5 hover:border-white/20 theme-glass-panel'}`} onClick={() => setIsPublic(false)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${!isPublic ? 'theme-text-accent' : 'text-[var(--subtext)]'}`}>{t("icon_visibility_off")}</span>
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

          <div className={`p-8 rounded-[var(--radius)] border transition-all cursor-pointer group flex flex-col gap-4 ${isLocked ? 'theme-border-danger bg-[var(--danger)]/10 shadow-[0_0_30px_rgba(var(--danger-rgb),0.15)]' : 'border-white/5 hover:border-white/20 theme-glass-panel'}`} onClick={() => setIsLocked(true)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${isLocked ? 'theme-text-danger' : 'text-[var(--subtext)]'}`}>{t("icon_lock")}</span>
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

          <div className={`p-8 rounded-[var(--radius)] border transition-all cursor-pointer group flex flex-col gap-4 ${!isLocked ? 'theme-border-success bg-[var(--success)]/10 shadow-[0_0_30px_rgba(var(--success-rgb),0.15)]' : 'border-white/5 hover:border-white/20 theme-glass-panel'}`} onClick={() => setIsLocked(false)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${!isLocked ? 'theme-text-success' : 'text-[var(--subtext)]'}`}>{t("icon_lock_open")}</span>
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

          <div className={`p-8 rounded-[var(--radius)] border transition-all cursor-pointer group flex flex-col gap-4 ${isMarketListed ? 'theme-border-success bg-[var(--success)]/10 shadow-[0_0_30px_rgba(var(--success-rgb),0.15)]' : 'border-white/5 hover:border-white/20 theme-glass-panel'}`} onClick={() => setIsMarketListed(true)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${isMarketListed ? 'theme-text-success' : 'text-[var(--subtext)]'}`}>{t("icon_storefront")}</span>
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

          <div className={`p-8 rounded-[var(--radius)] border transition-all cursor-pointer group flex flex-col gap-4 ${!isMarketListed ? 'theme-border-accent bg-[var(--accent)]/10 shadow-[0_0_30px_rgba(var(--accent-rgb),0.15)]' : 'border-white/5 hover:border-white/20 theme-glass-panel'}`} onClick={() => setIsMarketListed(false)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${!isMarketListed ? 'theme-text-accent' : 'text-[var(--subtext)]'}`}>{t("icon_visibility_off")}</span>
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
          <div className="mt-8 p-10 theme-glass-panel rounded-[var(--radius)] border border-white/10 hover:border-white/20 flex flex-col gap-6 shadow-2xl relative overflow-hidden transition-all duration-500 animate-in fade-in zoom-in-95 group">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--danger)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="flex items-center gap-5 relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-center text-[var(--danger)] shadow-[inset_0_0_20px_rgba(var(--danger-rgb),0.1)] shrink-0">
                <span className="material-symbols-outlined !text-3xl text-[var(--danger)]">{t("icon_warning_amber")}</span>
              </div>
              <div className="flex flex-col gap-1 w-full">
                <h4 className="text-xl font-black theme-text-danger uppercase tracking-widest">{t("matrix_tier_warning_title")}</h4>
                <p className="text-xs font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest">{t("matrix_tier_warning_desc")}</p>
              </div>
            </div>
            <div className="flex justify-end relative z-10 -mt-2">
              <button onClick={handleRemoveAllViolating} className="px-4 py-2 bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 text-[var(--danger)] border border-[var(--danger)]/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm">
                {t("matrix_btn_remove_all")}
              </button>
            </div>
            <div className="theme-glass-inner rounded-2xl p-6 border border-white/5 max-h-48 overflow-y-auto custom-scrollbar flex flex-col gap-2 relative z-10">
              {blockedMods.map((mod: any) => (
                <div key={mod.name} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 group">
                  <span className="text-sm font-bold text-[var(--text)] truncate mr-4">{formatDisplayName(mod.name)}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black theme-text-danger bg-[var(--danger)]/10 px-4 py-2 rounded-xl shadow-inner whitespace-nowrap">{t("auto_tier")} {mod.compliance_tier}</span>
                    <button onClick={() => handleRemoveArtifact(mod.name)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-[var(--danger)]/20 border border-white/10 hover:border-[var(--danger)]/30 text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shrink-0">
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_delete")}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="theme-glass-panel p-8 rounded-[var(--radius)] border border-white/10 flex flex-col gap-4 shadow-xl">
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
                  navigator.clipboard.writeText(generatedCode).catch(() => { });
                }
              }}
              disabled={!generatedCode}
              className={`px-6 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${generatedCode ? 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_20%,transparent)] text-[var(--text)]' : 'bg-white/5 text-[var(--subtext)] opacity-50 cursor-not-allowed'}`}
            >
              {t("matrix_btn_copy")}
            </button>
          </div>
          {uploadError && <span className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center justify-center gap-2 mt-2"><span className="material-symbols-outlined !text-[14px]">{t("icon_error")}</span> {uploadError}</span>}
        </div>
      </div>
    </SidePanel>,
    document.body
  );
}

