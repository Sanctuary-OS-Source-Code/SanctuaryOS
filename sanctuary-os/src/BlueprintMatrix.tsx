import { useState, useMemo, useEffect } from "react";
import { formatDisplayName, ViewHeader, SidePanel, standardButtonClass, standardAccentGlassButtonClass, HoverTooltip, ActionButton, getNormalizedArtifactName } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { useModalStore } from "./store/modalStore";

export default function BlueprintMatrix({ isOpen, onClose, playSet, modList, onUpload, onUpdatePlaySet }: any) {
  const { t } = useLexicon();
  const { session, playSets, setPlaySets } = useStore();
  const [isPublic, setIsPublic] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isMarketListed, setIsMarketListed] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (isOpen && playSet) {
      setGeneratedCode(playSet.code || null);
      setIsPublic(playSet.is_public ?? true);
      setIsLocked(playSet.is_locked ?? false);
      setIsMarketListed(playSet.is_market_listed ?? false);
      setUploadError("");
      setUploadSuccess(false);
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
    setUploadSuccess(false);
    const code = await onUpload(isPublic, isLocked, allowedMods, isMarketListed);
    if (code) {
      setGeneratedCode(code);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
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

    const seenNames = new Set<string>();
    const rawMods = playSet.mods
      .map((m: any) => typeof m === 'string' ? m : (m?.name || ''))
      .filter((modName: string) => modName && !modName.startsWith("FOLDER_") && !modName.startsWith("SET_") && !modName.startsWith("LOCAL_SET_"))
      .reduce((acc: any[], modName: string) => {
        const norm = getNormalizedArtifactName(modName);
        if (!seenNames.has(norm)) {
          seenNames.add(norm);
          const mod = modList.find((m: any) => m.name === modName || getNormalizedArtifactName(m.name) === norm);
          acc.push({ name: modName, hash: mod?.hash || "", url: mod?.url || "", author: mod?.author || "Unknown", compliance_tier: mod?.compliance_tier || 0, displayName: mod?.displayName, isVirtual: mod?.isVirtual });
        }
        return acc;
      }, []);

    rawMods.forEach((m: any) => {
      if (m.isVirtual) return;

      if (m.compliance_tier >= 1 && m.compliance_tier <= 5) {
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
    const targetNorm = getNormalizedArtifactName(modName);
    const updatedMods = playSet.mods.filter((m: string) => getNormalizedArtifactName(m) !== targetNorm);
    onUpdatePlaySet({ ...playSet, mods: updatedMods });
  };

  const handleRemoveAllViolating = () => {
    if (!playSet || !onUpdatePlaySet) return;
    const violatingNorms = blockedMods.map((m: any) => getNormalizedArtifactName(m.name));
    const updatedMods = playSet.mods.filter((m: string) => !violatingNorms.includes(getNormalizedArtifactName(m)));
    onUpdatePlaySet({ ...playSet, mods: updatedMods });
  };

  const isGuest = !session;
  const isBanned = localStorage.getItem("sanctuary_blacklisted") === "true";
  const hasViolations = blockedMods.length > 0;
  const showDefconAlert = useModalStore((state: any) => state.showDefconAlert);
  const isUploadBlocked = isGuest || isBanned || hasViolations || showDefconAlert;

  return createPortal(
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("matrix_title")}
      subtitle={t("matrix_subtitle")}
      headerActions={
        <div className="flex items-center gap-1 mr-1">
          <div className="relative group/uplinkbtn flex items-center">
            {isUploadBlocked ? (
              <HoverTooltip
                variant="danger"
                title={isBanned ? t("alert_comm_banned") : showDefconAlert ? t("alert_defcon_blocked") || "Alert Active" : hasViolations ? t("tooltip_uplink_blocked_title") : t("alert_guest_mode_uploads")}
                subtitle={isBanned ? t("alert_comm_banned_desc") : showDefconAlert ? t("alert_defcon_blocked_desc") || "Please resolve security alerts before uplinking." : hasViolations ? t("tooltip_uplink_blocked_desc") : t("alert_guest_mode_desc")}
                className="group-hover/uplinkbtn:flex z-[1000]"
                vAlign="bottom"
              />
            ) : (
              <HoverTooltip
                title={isUploading ? t("scanning") : t("matrix_btn_upload")}
                className="group-hover/uplinkbtn:flex z-[1000]"
                vAlign="bottom"
              />
            )}
            <button
              onClick={handleUpload}
              disabled={isUploading || isUploadBlocked}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isUploading || isUploadBlocked ? 'text-[var(--subtext)] opacity-50' : 'text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:text-[var(--accent)]'}`}
            >
              <span className={`material-symbols-outlined !text-[18px] ${isUploading ? 'animate-spin' : ''}`}>{isUploading ? 'sync' : 'cloud_upload'}</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-2 gap-4">
          <div className={`p-8 rounded-[2rem] border transition-all duration-500 cursor-pointer group flex flex-col gap-4 relative overflow-hidden ${isPublic ? 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-gradient-to-br from-[color-mix(in_srgb,var(--success)_15%,transparent)] to-[color-mix(in_srgb,var(--success)_5%,transparent)] shadow-[0_10px_40px_-10px_rgba(var(--success-rgb),0.3)] scale-[1.02] glass-panel' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:scale-[1.01] hover:shadow-lg glass-surface opacity-70 hover:opacity-100'}`} onClick={() => setIsPublic(true)}>
            {isPublic && <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--success)] opacity-10 blur-[50px] pointer-events-none rounded-full transform translate-x-1/2 -translate-y-1/2" />}
            <div className="flex items-center justify-between w-full relative z-10">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${isPublic ? 'theme-text-success' : 'text-[var(--subtext)]'}`}>{t("icon_public")}</span>
                <span className={`text-sm font-black capitalize tracking-widest ${isPublic ? 'theme-text-success' : 'text-[var(--text)]'}`}>{t("matrix_public")}</span>
              </div>
              <div className={`w-6 h-6 rounded-full border border-2 flex items-center justify-center transition-colors ${isPublic ? 'border-[color-mix(in_srgb,var(--success)_50%,transparent)]' : 'border-[color-mix(in_srgb,var(--subtext)_30%,transparent)]'}`}>
                {isPublic && <div className="w-3 h-3 rounded-full theme-bg-success shadow-[0_0_10px_rgba(var(--success-rgb),0.8)]" />}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-widest opacity-80 leading-relaxed mt-2 relative z-10">
              {t("matrix_public_desc")}
            </p>
          </div>

          <div className={`p-8 rounded-[2rem] border transition-all duration-500 cursor-pointer group flex flex-col gap-4 relative overflow-hidden ${!isPublic ? 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_15%,transparent)] to-[color-mix(in_srgb,var(--accent)_5%,transparent)] shadow-[0_10px_40px_-10px_rgba(var(--accent-rgb),0.3)] scale-[1.02] glass-panel' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:scale-[1.01] hover:shadow-lg glass-surface opacity-70 hover:opacity-100'}`} onClick={() => setIsPublic(false)}>
            {!isPublic && <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)] opacity-10 blur-[50px] pointer-events-none rounded-full transform translate-x-1/2 -translate-y-1/2" />}
            <div className="flex items-center justify-between w-full relative z-10">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${!isPublic ? 'theme-text-accent' : 'text-[var(--subtext)]'}`}>{t("icon_visibility_off")}</span>
                <span className={`text-sm font-black capitalize tracking-widest ${!isPublic ? 'theme-text-accent' : 'text-[var(--text)]'}`}>{t("matrix_private")}</span>
              </div>
              <div className={`w-6 h-6 rounded-full border border-2 flex items-center justify-center transition-colors ${!isPublic ? 'border-[color-mix(in_srgb,var(--accent)_50%,transparent)]' : 'border-[color-mix(in_srgb,var(--subtext)_30%,transparent)]'}`}>
                {!isPublic && <div className="w-3 h-3 rounded-full theme-bg-accent shadow-[0_0_10px_rgba(var(--accent-rgb),0.8)]" />}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-widest opacity-80 leading-relaxed mt-2 relative z-10">
              {t("matrix_private_desc")}
            </p>
          </div>

          <div className={`p-8 rounded-[2rem] border transition-all duration-500 cursor-pointer group flex flex-col gap-4 relative overflow-hidden ${isLocked ? 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-gradient-to-br from-[color-mix(in_srgb,var(--danger)_15%,transparent)] to-[color-mix(in_srgb,var(--danger)_5%,transparent)] shadow-[0_10px_40px_-10px_rgba(var(--danger-rgb),0.3)] scale-[1.02] glass-panel' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:scale-[1.01] hover:shadow-lg glass-surface opacity-70 hover:opacity-100'}`} onClick={() => setIsLocked(true)}>
            {isLocked && <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--danger)] opacity-10 blur-[50px] pointer-events-none rounded-full transform translate-x-1/2 -translate-y-1/2" />}
            <div className="flex items-center justify-between w-full relative z-10">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${isLocked ? 'theme-text-danger' : 'text-[var(--subtext)]'}`}>{t("icon_lock")}</span>
                <span className={`text-sm font-black capitalize tracking-widest ${isLocked ? 'theme-text-danger' : 'text-[var(--text)]'}`}>{t("matrix_locked")}</span>
              </div>
              <div className={`w-6 h-6 rounded-full border border-2 flex items-center justify-center transition-colors ${isLocked ? 'border-[color-mix(in_srgb,var(--danger)_50%,transparent)]' : 'border-[color-mix(in_srgb,var(--subtext)_30%,transparent)]'}`}>
                {isLocked && <div className="w-3 h-3 rounded-full theme-bg-danger shadow-[0_0_10px_rgba(var(--danger-rgb),0.8)]" />}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-widest opacity-80 leading-relaxed mt-2 relative z-10">
              {t("matrix_locked_desc")}
            </p>
          </div>

          <div className={`p-8 rounded-[2rem] border transition-all duration-500 cursor-pointer group flex flex-col gap-4 relative overflow-hidden ${!isLocked ? 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-gradient-to-br from-[color-mix(in_srgb,var(--success)_15%,transparent)] to-[color-mix(in_srgb,var(--success)_5%,transparent)] shadow-[0_10px_40px_-10px_rgba(var(--success-rgb),0.3)] scale-[1.02] glass-panel' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:scale-[1.01] hover:shadow-lg glass-surface opacity-70 hover:opacity-100'}`} onClick={() => setIsLocked(false)}>
            {!isLocked && <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--success)] opacity-10 blur-[50px] pointer-events-none rounded-full transform translate-x-1/2 -translate-y-1/2" />}
            <div className="flex items-center justify-between w-full relative z-10">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${!isLocked ? 'theme-text-success' : 'text-[var(--subtext)]'}`}>{t("icon_lock_open")}</span>
                <span className={`text-sm font-black capitalize tracking-widest ${!isLocked ? 'theme-text-success' : 'text-[var(--text)]'}`}>{t("matrix_unlocked")}</span>
              </div>
              <div className={`w-6 h-6 rounded-full border border-2 flex items-center justify-center transition-colors ${!isLocked ? 'border-[color-mix(in_srgb,var(--success)_50%,transparent)]' : 'border-[color-mix(in_srgb,var(--subtext)_30%,transparent)]'}`}>
                {!isLocked && <div className="w-3 h-3 rounded-full theme-bg-success shadow-[0_0_10px_rgba(var(--success-rgb),0.8)]" />}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-widest opacity-80 leading-relaxed mt-2 relative z-10">
              {t("matrix_unlocked_desc")}
            </p>
          </div>

          <div className={`p-8 rounded-[2rem] border transition-all duration-500 cursor-pointer group flex flex-col gap-4 relative overflow-hidden ${isMarketListed ? 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-gradient-to-br from-[color-mix(in_srgb,var(--success)_15%,transparent)] to-[color-mix(in_srgb,var(--success)_5%,transparent)] shadow-[0_10px_40px_-10px_rgba(var(--success-rgb),0.3)] scale-[1.02] glass-panel' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:scale-[1.01] hover:shadow-lg glass-surface opacity-70 hover:opacity-100'}`} onClick={() => setIsMarketListed(true)}>
            {isMarketListed && <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--success)] opacity-10 blur-[50px] pointer-events-none rounded-full transform translate-x-1/2 -translate-y-1/2" />}
            <div className="flex items-center justify-between w-full relative z-10">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${isMarketListed ? 'theme-text-success' : 'text-[var(--subtext)]'}`}>{t("icon_storefront")}</span>
                <span className={`text-sm font-black capitalize tracking-widest ${isMarketListed ? 'theme-text-success' : 'text-[var(--text)]'}`}>{t("matrix_market")}</span>
              </div>
              <div className={`w-6 h-6 rounded-full border border-2 flex items-center justify-center transition-colors ${isMarketListed ? 'border-[color-mix(in_srgb,var(--success)_50%,transparent)]' : 'border-[color-mix(in_srgb,var(--subtext)_30%,transparent)]'}`}>
                {isMarketListed && <div className="w-3 h-3 rounded-full theme-bg-success shadow-[0_0_10px_rgba(var(--success-rgb),0.8)]" />}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-widest opacity-80 leading-relaxed mt-2 relative z-10">
              {t("matrix_market_desc")}
            </p>
          </div>

          <div className={`p-8 rounded-[2rem] border transition-all duration-500 cursor-pointer group flex flex-col gap-4 relative overflow-hidden ${!isMarketListed ? 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_15%,transparent)] to-[color-mix(in_srgb,var(--accent)_5%,transparent)] shadow-[0_10px_40px_-10px_rgba(var(--accent-rgb),0.3)] scale-[1.02] glass-panel' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:scale-[1.01] hover:shadow-lg glass-surface opacity-70 hover:opacity-100'}`} onClick={() => setIsMarketListed(false)}>
            {!isMarketListed && <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)] opacity-10 blur-[50px] pointer-events-none rounded-full transform translate-x-1/2 -translate-y-1/2" />}
            <div className="flex items-center justify-between w-full relative z-10">
              <div className="flex items-center gap-4">
                <span className={`material-symbols-outlined !text-3xl ${!isMarketListed ? 'theme-text-accent' : 'text-[var(--subtext)]'}`}>{t("icon_visibility_off")}</span>
                <span className={`text-sm font-black capitalize tracking-widest ${!isMarketListed ? 'theme-text-accent' : 'text-[var(--text)]'}`}>{t("matrix_market_off")}</span>
              </div>
              <div className={`w-6 h-6 rounded-full border border-2 flex items-center justify-center transition-colors ${!isMarketListed ? 'border-[color-mix(in_srgb,var(--accent)_50%,transparent)]' : 'border-[color-mix(in_srgb,var(--subtext)_30%,transparent)]'}`}>
                {!isMarketListed && <div className="w-3 h-3 rounded-full theme-bg-accent shadow-[0_0_10px_rgba(var(--accent-rgb),0.8)]" />}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-widest opacity-80 leading-relaxed mt-2 relative z-10">
              {t("matrix_market_off_desc")}
            </p>
          </div>

        </div>

        {blockedMods.length > 0 && (
          <div className="mt-4 p-4 glass-panel rounded-xl border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex flex-col gap-3 shadow-[0_0_15px_rgba(var(--danger-rgb),0.1)] relative transition-all duration-300 animate-in fade-in zoom-in-95 group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--danger)_5%,transparent)] to-transparent opacity-30 group-hover:opacity-60 transition-opacity duration-300 pointer-events-none" />
            
            <div className="flex items-center justify-between gap-3 relative z-10">
              <div className="flex items-center gap-2">
                 <span className="material-symbols-outlined !text-lg text-[var(--danger)]">{t("icon_warning_amber")}</span>
                 <div className="flex flex-col">
                   <h4 className="text-xs font-black theme-text-danger capitalize tracking-widest">{t("matrix_tier_warning_title")}</h4>
                   <p className="text-[9px] font-bold text-[var(--danger)] opacity-70 tracking-wide">
                     {t("matrix_tier_warning_desc")}
                   </p>
                 </div>
              </div>
              <button onClick={handleRemoveAllViolating} className="px-3 py-1.5 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-md text-[9px] font-black uppercase tracking-widest transition-all shadow-sm shrink-0 flex items-center gap-1 hover:scale-105 active:scale-95">
                <span className="material-symbols-outlined !text-[14px]">{t("icon_delete")}</span>
                {t("matrix_btn_remove_all")}
              </button>
            </div>
            
            <div className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_15%,transparent)] max-h-32 overflow-y-auto custom-scrollbar flex flex-col relative z-10 glass-surface shadow-inner divide-y divide-[color-mix(in_srgb,var(--danger)_10%,transparent)]">
              {blockedMods.map((mod: any) => (
                <div key={mod.name} className="flex justify-between items-center px-3 py-2 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] transition-all group/item">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-[10px] font-bold text-[var(--text)] truncate opacity-90">{formatDisplayName(mod.name)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded glass-panel bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_20%,transparent)]">
                       <span className="w-1.5 h-1.5 rounded-full theme-bg-danger animate-pulse" />
                       <span className="text-[8px] font-black theme-text-danger whitespace-nowrap tracking-wider">T{mod.compliance_tier}</span>
                    </div>
                    <button onClick={() => handleRemoveArtifact(mod.name)} className="w-6 h-6 rounded glass-panel bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] flex items-center justify-center transition-all opacity-0 group-hover/item:opacity-100 hover:scale-110 active:scale-95">
                      <span className="material-symbols-outlined !text-[14px]">{t("icon_delete")}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="glass-panel p-8 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4 shadow-xl">
          <span className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest opacity-80">{t("sidebar_uplink")}</span>
          <div className="flex items-center gap-3">
            <input
              readOnly
              value={generatedCode || ""}
              placeholder={t("matrix_code_placeholder")}
              className="flex-1 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-4 text-[var(--text)] font-mono font-bold tracking-widest text-center focus:outline-none"
            />
            <button
              onClick={() => {
                if (generatedCode) {
                  navigator.clipboard.writeText(generatedCode).then(() => {
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
                  }).catch(() => { });
                }
              }}
              disabled={!generatedCode || isCopied}
              className={`px-6 py-4 rounded-xl font-black text-[10px] capitalize tracking-widest transition-all w-28 text-center ${isCopied ? 'bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)]' : generatedCode ? 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_20%,transparent)] text-[var(--text)]' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] opacity-50 cursor-not-allowed'}`}
            >
              {isCopied ? (t("btn_copied")) : t("ctx_copy")}
            </button>
          </div>
        </div>

        {uploadError && <span className="text-[10px] font-black text-red-400 capitalize tracking-widest flex items-center justify-center gap-2"><span className="material-symbols-outlined !text-[14px]">{t("icon_error")}</span> {uploadError}</span>}
        {uploadSuccess && (
          <div className="flex justify-center -mt-2">
            <div className="px-4 py-2 rounded-full bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] shadow-[0_0_20px_rgba(var(--success-rgb),0.2)] flex items-center gap-2 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300 backdrop-blur-md">
              <div className="w-5 h-5 rounded-full bg-[color-mix(in_srgb,var(--success)_20%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--success)_40%,transparent)] shadow-inner">
                <span className="material-symbols-outlined !text-[12px] theme-text-success">{t("icon_check_circle")}</span>
              </div>
              <span className="text-[10px] font-black theme-text-success capitalize tracking-widest">{t("matrix_uplink_success")}</span>
            </div>
          </div>
        )}
      </div>
    </SidePanel>, document.body
  );
}




