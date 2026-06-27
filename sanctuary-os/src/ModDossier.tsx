import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import { useStore } from "./store";
import { GameVersionMultiSelect, deriveHumanReadableVersion, CustomDatePicker, CustomClassificationDropdown, standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass, standardDangerButtonClass, standardAccentGlassButtonClass, getHighestVersion, getLowestVersion } from "./shared";

export default function ModDossier({ mod, modList, activePlaySet, onToggleInActiveSet, onShowYeetAlert, onClose, metaInputs, setMetaInputs, onSaveMetadata, onResetMetadata, onOpenMasonProfile, editMode, setEditMode, onSendToLab, onSecureShred, isCorrecting, setIsCorrecting, onSyncToNetwork }: any) {
  const [selectedKid, setSelectedKid] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  
  const [localCreatedAt, setLocalCreatedAt] = useState<string | null>(mod?.created_at || null);
  const [localUpdatedAt, setLocalUpdatedAt] = useState<string | null>(mod?.updated_at || null);
  const showImages = useStore((state: any) => state.showImages);
  const [localCategory, setLocalCategory] = useState<string>(mod?.category_override || mod?.type || "");
  const [localCompatibleVersions, setLocalCompatibleVersions] = useState<string[]>(mod?.compatible_versions || []);

  useEffect(() => {
    if (mod) {
      setLocalCreatedAt(mod.created_at || null);
      setLocalUpdatedAt(mod.updated_at || null);
      setLocalCategory(mod.category_override || mod.type || "");
      setLocalCompatibleVersions(mod.compatible_versions || []);
    }
  }, [mod]);

  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const userRole = useStore((state: any) => state.userRole);
  if (!mod) return null;

  const activeMods = activePlaySet?.mods || [];
  const kids = mod.flavors || [];
  const isCCSet = mod.isCCSet;
  const isMarketplaceView = mod.isMarketplaceView || false;

  const localOverrides = JSON.parse(localStorage.getItem('sanctuary_local_overrides') || '{}');
  const hasOverrides = !!localOverrides[mod.hash];

  const getVersions = (target: any) => {
    const v = target.compatible_versions;
    return typeof v === 'string' ? v.split(',').map((s:string) => s.trim()) : (v || []);
  };
  
  let familyVersion = "Unknown";
  if (mod.isVirtual) {
    const highestPerFlavor = (mod.flavors || []).map((f: any) => getHighestVersion(getVersions(f)));
    familyVersion = getLowestVersion(highestPerFlavor);
  } else {
    familyVersion = getHighestVersion(getVersions(mod));
  }

  const getCasualties = (targetName: string): string[] => {
    const target = (modList || []).find((m: any) => m.name === targetName);
    if (!target) return [];
    
    let toDelete = new Set<string>();
    
    const initialMods = target.isVirtual && target.flavors ? target.flavors : [target];
    
    initialMods.forEach((mod: any) => {
        toDelete.add(mod.name);
        
        const familyAnchor = mod.familyId || mod.dbId;
        const isMaster = mod.dbId && String(mod.dbId) === String(familyAnchor);
        if (
          mod.isVirtual ||
          (isMaster ||
            mod.relationshipType === "twin" ||
            mod.relationshipType === "core" ||
            mod.relationshipType === "beta")
        ) {
          (modList || [])
            .filter(
              (m: any) =>
                (String(m.familyId) === String(familyAnchor) ||
                  String(m.dbId) === String(familyAnchor) ||
                  String(m.setId) === String(mod.dbId)) &&
                m.name &&
                !m.isVirtual
            )
            .forEach((m: any) => toDelete.add(m.name));
        }
    });

    let keepChecking = true;
    while (keepChecking) {
        keepChecking = false;
        (modList || []).forEach((m: any) => {
            if (!m.isVirtual && activeMods.includes(m.name) && !toDelete.has(m.name)) {
                const isDependent = m.requirements?.some((r: any) => {
                    const reqId = typeof r === 'string' ? r : r.id || r.dbId;
                    const reqName = typeof r === 'string' ? r : r.name;
                    const isReqNumeric = !isNaN(Number(reqName));
                    const reqBaseName = String(reqName).split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
                    
                    return Array.from(toDelete).some(delName => {
                        const delMod = modList.find((ml: any) => ml.name === delName);
                        if (!delMod) return false;
                        return (reqId && String(delMod.dbId) === String(reqId)) ||
                               (reqId && delMod.hash === reqId) ||
                               (!isReqNumeric && reqBaseName && delMod.displayName && (delMod.displayName.toUpperCase().includes(reqBaseName) || delMod.displayName.toUpperCase().replace(/_/g, " ").includes(reqBaseName.replace(/_/g, " "))));
                    });
                });
                
                if (isDependent) {
                    toDelete.add(m.name);
                    keepChecking = true;
                }
            }
        });
    }

    toDelete.delete(target.name);
    
    if (toDelete.size === 0) return [];
    
    const cleanTarget = (target.displayName || (target.name || "").split('/').pop() || "").replace(/_/g, ' ').replace(/\.package$|\.ts4script$/i, '');
    
    const cleanDeps = Array.from(toDelete).map(delName => {
        const d = modList.find((m: any) => m.name === delName);
        if (!d) return delName;
        return (d.displayName || (d.name || "").split('/').pop() || "").replace(/_/g, ' ').replace(/\.package$|\.ts4script$/i, '');
    });
    
    return [cleanTarget, ...cleanDeps];
  };

  const safeToggle = (targetName: string) => {
    const isCurrentlyEquipped = activeMods.includes(targetName);
    const doToggle = () => {
      onToggleInActiveSet(targetName);
      if (selectedKid && selectedKid.name === targetName && isCurrentlyEquipped) {
        setSelectedKid(null);
      }
    };
    
    if (isCurrentlyEquipped) {
      const c = getCasualties(targetName);
      if (c.length > 0 && onShowYeetAlert) {
        onShowYeetAlert(c, doToggle);
        return;
      }
    }
    doToggle();
  };

  const allEquipped = kids.length > 0 && kids.every((k: any) => activeMods.includes(k.name));

  const handleToggleAll = () => {
    if (allEquipped && kids.length > 0) {
      let allDeps: any[] = [];
      kids.forEach((k: any) => {
        if (activeMods.includes(k.name)) {
          allDeps.push((k.displayName || (k.name || '').split('/').pop() || "").replace(/_/g, ' ').replace(/\.package$|\.ts4script$/i, ''));
          const c = getCasualties(k.name);
          if (c.length > 0) allDeps.push(...c);
        }
      });
      const uniqueDeps = [...new Set(allDeps)];
      if (uniqueDeps.length > 0 && onShowYeetAlert) {
        onShowYeetAlert(uniqueDeps, () => onToggleInActiveSet(mod.name));
        return;
      }
    }
    onToggleInActiveSet(mod.name);
  };

  const handleSave = async () => {
    setIsSaving(true);
    if (mod.dbId) {
      await supabase.from('mods').update({
        created_at: localCreatedAt,
        updated_at: localUpdatedAt,
        category_override: localCategory,
        compatible_versions: localCompatibleVersions
      }).eq('id', mod.dbId);
    }
    await onSaveMetadata({
      created_at: localCreatedAt,
      updated_at: localUpdatedAt,
      category_override: localCategory,
      compatible_versions: localCompatibleVersions
    });
    setIsSaving(false);
    setEditMode(false);
    setIsCorrecting(false);
  };

  const handleFlagMod = async (reason: string) => {
    if (reason === 'Outdated Information' || reason === 'Inaccurate Information') {
      setShowFlagModal(false);
      setIsCorrecting(true);
      setEditMode(true);
      return;
    }

    if (!mod.dbId) {
      useStore.getState().pushStatus(t("auto_cannot_flag_local_only_mods"));
      return;
    }
    
    if (!session) {
      useStore.getState().pushStatus(t("auto_guest_mode_active_uploads_and_global_fla"));
      return;
    }

    let payload: any = {};
    if (reason === 'adult') payload = { compliance_tier: 2 };
    else if (reason === 'NSFW') payload = { compliance_tier: 1 };
    else payload = { status: 'unverified' };

    const { error } = await supabase.from('mods').update(payload).eq('id', mod.dbId);
    if (!error) {
      useStore.getState().pushStatus(`Mod flagged for: ${reason}. It has been updated pending review.`);
      setShowFlagModal(false);
      onClose();
    } else {
      useStore.getState().pushStatus(`Failed to flag mod: ${error.message}`);
    }
  };

  const handleSubmitToVault = async () => {
    if (!session) {
      useStore.getState().pushStatus(t("auto_guest_mode_active_uploads_and_global_fla"));
      return;
    }

    let bondedHash = metaInputs.lineage || null;
    if (bondedHash) {
      const parentMod = (modList || []).find((m: any) => 
        (m.displayName || (m.name || '').split(/[\\/]/).pop() || m.name) === bondedHash
      );
      if (parentMod && parentMod.hash) {
        bondedHash = parentMod.hash;
      }
    }

    setIsSaving(true);
    const { error } = await supabase.from('scout_suggestions').insert([{
      dna_hash: mod.hash,
      suggested_name: metaInputs.name,
      suggested_author: metaInputs.author,
      suggested_url: metaInputs.url,
      suggested_type: localCategory || mod.type || "FILE",
      suggested_bonded_to: bondedHash,
      suggested_version: metaInputs.version || deriveHumanReadableVersion(mod.name, mod.hash),
      suggested_sub_type: (mod.name || "").toLowerCase().endsWith('.package') ? 'Package' : ((mod.name || "").toLowerCase().endsWith('.ts4script') ? 'ts4Script' : null),
      suggested_game_versions: localCompatibleVersions.length > 0 ? localCompatibleVersions : null,
      submitter_id: session.user.id,
      description: metaInputs.desc || null,
      image_url: metaInputs.image || null,
      compliance_tier: mod.compliance_tier || 0,
      status: 'pending'
    }]);
    
    if (error) {
      useStore.getState().pushStatus(`Failed to submit to Vault: ${error.message}`);
    } else {
      useStore.getState().pushStatus(t("auto_successfully_submitted_to_vault_for_arch"));
      setEditMode(false);
    }
    setIsSaving(false);
  };

  const requirements = (mod.requirements || mod.requires || []).filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => (t.id || t) === (v.id || v)) === i);
  const conflicts = mod.conflicts || [];
  const twins = (mod.twins || []).filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => (t.id || t.name) === (v.id || v.name)) === i);

  return createPortal(
    <>
      {/* Main Sidebar */}
      <div className="fixed top-0 right-0 bottom-10 z-[51000] bg-black/0 backdrop-blur-[3px] animate-in fade-in duration-500 transition-all" style={{ left: "var(--sidebar-width, 300px)" }} onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-10 w-[900px] max-w-[100vw] theme-glass-panel border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex flex-col z-[51001] animate-in slide-in-from-right duration-500 !border-y-0 !border-r-0 backdrop-blur-3xl overflow-hidden">
        
        <button
          onClick={onClose}
          className="absolute top-14 right-6 z-50 w-12 h-12 bg-black/40 hover:theme-bg-danger text-[var(--subtext)] opacity-80 hover:text-[var(--text)] rounded-full flex items-center justify-center transition-all border border-white/10 hover:theme-border-danger shadow-xl text-xl backdrop-blur-md"
        ><span className="material-symbols-outlined !text-[28px]">{t("ui_icon_close")}</span></button>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative z-10 w-full">
          
          {/* Seamless Hero Section */}
          <div className="h-[400px] relative z-0 bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] shrink-0 flex flex-col justify-end">
            <div className="absolute inset-0 z-0">
              {((showImages || editMode) && (mod.image_url || mod.imageUrl || metaInputs.image)) ? (
                <img src={metaInputs.image || mod.image_url || mod.imageUrl} className="w-full h-full object-cover opacity-60 mix-blend-luminosity" alt={t("dossier_cover_image_url")} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-[var(--accent)] opacity-20 drop-shadow-2xl" style={{ fontSize: '240px' }}>
                    {(() => {
                      if (mod.isParent) return "folder_open";
                      const name = (mod.name || "").toLowerCase();
                      const rawType = (mod.type || mod.category_override || "").toLowerCase();
                      if (rawType.includes('cas') || name.includes('hair') || name.includes('clothes') || name.includes('tattoo')) return "checkroom";
                      if (rawType.includes('build') || name.includes('furniture') || name.includes('object')) return "chair";
                      if (rawType.includes('script') || name.endsWith('.ts4script')) return "code";
                      if (rawType.includes('anim') || name.includes('anim')) return "animation";
                      if (rawType.includes('cc') || name.includes('set')) return "folder_special";
                      return "extension";
                    })()}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[color-mix(in_srgb,var(--bg)_60%,transparent)] to-transparent z-10 pointer-events-none" />
            </div>

            {/* Overlay Title Block */}
            <div className="relative z-20 px-12 pb-18 w-full flex flex-col items-start gap-4">
              <div className="w-full">
                 {editMode ? (
                    <input value={metaInputs.name} onChange={e => setMetaInputs.name(e.target.value)} className="w-full bg-white/10 backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_20%,transparent)] rounded-2xl px-6 py-4 text-4xl font-black text-[var(--text)] uppercase focus:outline-none focus:border-[var(--accent)] focus:bg-white/20 shadow-2xl transition-all" />
                  ) : (
                    <div className="flex flex-col items-start gap-2">
                      <h2 className="text-5xl lg:text-6xl font-black text-[var(--text)] tracking-tighter uppercase leading-[1.1] drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] pr-4">
                        {(mod.displayName || (mod.name || '').split(/[/\\]/).pop() || "").replace(/_/g, ' ').replace(/\.package$|\.ts4script$/i, '')}
                      </h2>
                      {mod.name?.includes('.') && (
                        <span className="px-4 py-1.5 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full text-[10px] font-black text-[var(--text)] opacity-90 uppercase tracking-[0.2em] shadow-lg mt-2">
                          .{(mod.name || '').split('.').pop()?.toUpperCase()}
                        </span>
                      )}
                    </div>
                  )}
              </div>
              {editMode && (
                <div className="w-full mt-2">
                  <label className="text-[9px] font-black text-[var(--text)] uppercase tracking-widest drop-shadow-md">{t("dossier_cover_image_url")}</label>
                  <input value={metaInputs.image} onChange={e => setMetaInputs.image(e.target.value)} className="w-full mt-1 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4 py-2 text-[var(--text)] placeholder:text-[var(--text)] placeholder:opacity-30 text-[10px] font-mono focus:outline-none focus:border-[var(--accent)] transition-all shadow-inner" placeholder={t("auto_https")} />
                </div>
              )}
            </div>

            {/* Floating Action Bar */}
            <div className="absolute -bottom-6 w-full flex justify-center z-50 pointer-events-none">
               <div className="inline-flex theme-glass-panel backdrop-blur-3xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full p-2 shadow-[0_20px_60px_rgba(0,0,0,0.6)] items-center gap-1 flex-nowrap custom-scrollbar max-w-full pointer-events-auto">
                {editMode ? (
                  <>
                    {!isCorrecting && (
                      <>
                        <button onClick={handleSave} disabled={isSaving} className="shrink-0 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all bg-transparent hover:bg-white/10 text-[var(--text)] opacity-80 hover:opacity-100 border border-transparent">
                          <span className="material-symbols-outlined !text-[16px]">{t("auto_save")}</span>
                          {isSaving ? t("dossier_btn_saving") : t("dossier_btn_save_local")}
                        </button>
                        {hasOverrides && (
                          <>
                            <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-1" />
                            <button onClick={() => { if (onResetMetadata) onResetMetadata(mod.hash); onClose(); }} className="shrink-0 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all bg-transparent hover:bg-red-500/10 text-red-400 opacity-80 hover:opacity-100 border border-transparent hover:border-red-500/30">
                              <span className="material-symbols-outlined !text-[16px]">{t("auto_restart_alt")}</span>
                              {t("dossier_btn_reset")}
                            </button>
                          </>
                        )}
                      </>
                    )}
                    {isCorrecting && session && mod.compliance_tier !== 1 && mod.compliance_tier !== 2 && (
                      <>
                        <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-1" />
                        <button onClick={handleSubmitToVault} disabled={isSaving} className="shrink-0 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all bg-transparent hover:bg-emerald-500/10 text-emerald-400 opacity-80 hover:opacity-100 border border-transparent hover:border-emerald-500/30">
                          <span className="material-symbols-outlined !text-[16px]">{t("auto_send")}</span>
                          {isSaving ? t("dossier_btn_submitting") : t("dossier_btn_submit_corrections")}
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {(mod.hash?.startsWith('dev_sandbox_')) && (
                      <button onClick={() => { if (onSyncToNetwork) onSyncToNetwork(mod); else setEditMode(true); }} className="shrink-0 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all bg-transparent hover:bg-emerald-500/10 text-emerald-400 opacity-80 hover:opacity-100 border border-transparent hover:border-emerald-500/30">
                        <span className="material-symbols-outlined !text-[16px]">{t("auto_cloud_sync")}</span>
                        {t("dossier_btn_sync_network")}
                      </button>
                    )}
                    {mod.compliance_tier !== 1 && mod.compliance_tier !== 2 && (
                      <button onClick={() => { onClose(); onSendToLab(); }} className="shrink-0 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all bg-transparent hover:bg-cyan-500/10 text-cyan-400 opacity-80 hover:opacity-100 border border-transparent hover:border-cyan-500/30">
                        <span className="material-symbols-outlined !text-[16px]">{t("auto_science")}</span>
                        {t("dossier_btn_send_to_lab")}
                      </button>
                    )}
                    <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-1" />
                    <button onClick={() => setEditMode(true)} className="shrink-0 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all bg-transparent hover:bg-yellow-500/10 text-yellow-400 opacity-80 hover:opacity-100 border border-transparent hover:border-yellow-500/30">
                      <span className="material-symbols-outlined !text-[16px]">{t("auto_edit")}</span>
                      {isCorrecting ? t("dossier_btn_submit_corrections") : t("dossier_btn_edit")}
                    </button>
                    {userRole === 'senior_architect' && mod.compliance_tier === 3 && (
                      <>
                        <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-1" />
                        <button onClick={() => { onClose(); onSecureShred(mod.name); }} className="shrink-0 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all bg-transparent hover:bg-red-500/10 text-red-400 opacity-80 hover:opacity-100 border border-transparent hover:border-red-500/30">
                          <span className="material-symbols-outlined !text-[16px]">{t("auto_delete_forever")}</span>
                          {t("dossier_btn_secure_shred")}
                        </button>
                      </>
                    )}
                  </>
                )}
                {!editMode && mod.compliance_tier !== 1 && mod.compliance_tier !== 2 && (
                  <>
                    <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-1" />
                    <button onClick={() => setShowFlagModal(true)} className="shrink-0 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all bg-transparent hover:bg-orange-500/10 text-orange-400 opacity-80 hover:opacity-100 border border-transparent hover:border-orange-500/30">
                      <span className="material-symbols-outlined !text-[16px]">{t("auto_flag")}</span>
                      {t("dossier_btn_flag")}
                    </button>
                  </>
                )}
                {editMode ? (
                  <>
                    <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-1" />
                    <input value={metaInputs.url} onChange={e => setMetaInputs.url(e.target.value)} className="shrink-0 px-5 py-2.5 bg-transparent border border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] rounded-full text-[10px] font-black text-[var(--text)] placeholder:text-[var(--text)] placeholder:opacity-40 focus:outline-none focus:border-[var(--accent)] w-[200px] transition-all opacity-80 hover:opacity-100 focus:opacity-100" placeholder={t("dossier_external_url_placeholder")} />
                  </>
                ) : (
                  <>
                    <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-1" />
                    <a href={mod.url || `https://www.google.com/search?q=Sims+4+${encodeURIComponent(mod.displayName || (mod.name || '').split('/').pop() || "")}`} target="_blank" rel="noopener noreferrer" className="shrink-0 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all bg-transparent hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] opacity-80 hover:opacity-100 border border-transparent hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
                      <span className="material-symbols-outlined !text-[16px]">{mod.url ? t("ui_icon_import") : t("ui_icon_search")}</span>
                      {mod.url ? t("dossier_btn_download") : t("dossier_btn_search_web")}
                    </a>
                  </>
                )}
             </div>
            </div>
          </div>

          <div className="p-10 pt-14 flex flex-col gap-10 pb-32">

            {/* Primary Bento Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-min md:grid-rows-[120px_120px] gap-4 mb-0 relative z-20">
              
              {/* System Status (Hero Tile) */}
              <div className="col-span-2 md:col-span-2 md:row-span-2 flex flex-col gap-2 p-8 theme-glass-panel backdrop-blur-3xl rounded-[2rem] items-start text-left justify-center border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-[color-mix(in_srgb,var(--bg)_50%,transparent)] transition-all hover:scale-[1.01] shadow-2xl relative overflow-hidden group">
                <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:scale-110 transition-transform duration-700 pointer-events-none mix-blend-plus-lighter">
                    <span className="material-symbols-outlined" style={{fontSize: '200px'}}>{mod.status === (t("status_verified")) ? "verified" : mod.status === (t("status_unverified")) ? "warning" : "online_prediction"}</span>
                </div>
                <p className="text-[9px] font-black text-[var(--subtext)] opacity-50 uppercase tracking-[0.2em] relative z-10 mb-1">{t("dossier_status_label")}</p>
                <div className="relative z-10">
                  <div className={`backdrop-blur-xl border px-4 py-2.5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.3)] flex items-center gap-3 transition-all ${(() => {
                      const s = (mod.status || "");
                      if (s === (t("status_verified"))) return "bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)]";
                      if (s === (t("status_unverified"))) return "bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)]";
                      return "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)]";
                  })()}`} title={mod.status_reason || undefined}>
                    <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_10px_currentColor] animate-pulse ${mod.status === (t("status_verified")) ? "bg-[var(--success)]" : mod.status === (t("status_unverified")) ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`} style={mod.color && mod.status !== (t("status_verified")) && mod.status !== (t("status_unverified")) ? { backgroundColor: mod.color } : undefined} />
                    <span className={`text-xs font-black uppercase tracking-widest truncate opacity-90 ${mod.status === (t("status_verified")) ? "text-[var(--success)]" : mod.status === (t("status_unverified")) ? "text-[var(--danger)]" : "text-[var(--accent)]"}`}>
                      {(() => {
                        const raw = (mod.status || "");
                        const cleaned = raw.replace(/[\[\]]/g, "");
                        if (cleaned.toLowerCase() === 'broken') return mod.status_reason ? `BROKEN: ${mod.status_reason}` : t("status_broken");
                        const translated = cleaned.includes('status_') ? t(cleaned) : cleaned.replace(/_/g, " ");
                        return translated || t("status_local_only") || "LOCAL";
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Engine Version */}
              <div className="col-span-2 md:col-span-2 flex flex-col gap-1 p-6 theme-glass-panel backdrop-blur-xl rounded-[2rem] items-start text-left justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all hover:bg-white/5 hover:scale-[1.02] shadow-xl">
                <p className="text-[9px] font-black text-[var(--subtext)] opacity-50 uppercase tracking-[0.2em] mb-1">{t("dossier_label_game_version")}</p>
                {editMode ? (
                  <div className="w-full scale-90 origin-top-left"><GameVersionMultiSelect selectedVersions={localCompatibleVersions || []} onChange={v => setLocalCompatibleVersions(v)} /></div>
                ) : (
                  <span className="text-xs font-black text-[var(--text)] opacity-90 uppercase tracking-widest truncate max-w-full" title={familyVersion}>
                    {familyVersion === "Unknown" || familyVersion === "ALL" || familyVersion === "" ? (t("dossier_any")) : familyVersion}
                  </span>
                )}
              </div>

              {/* Compliance */}
              <div className="col-span-1 flex flex-col gap-1 p-6 theme-glass-panel backdrop-blur-xl rounded-[2rem] items-start text-left justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all hover:bg-white/5 hover:scale-[1.02] shadow-xl">
                <p className="text-[9px] font-black text-[var(--subtext)] opacity-50 uppercase tracking-[0.2em] mb-1">{t("dossier_label_compliance")}</p>
                <div className="flex items-center gap-2 justify-start max-w-full">
                  <span className={`text-xs font-black uppercase tracking-widest truncate ${mod.compliance_tier === 1 ? 'theme-text-warning' : 'text-[var(--text)] opacity-90'}`}>
                    {mod.compliance_tier === 1 ? t("tier_nsfw") : (mod.compliance_tier === 2 ? t("tier_adult") : t("tier_clean"))}
                  </span>
                  {mod.compliance_tier === 1 && (
                    <button onClick={async () => {
                      if (!mod.dbId) return;
                      const { error } = await supabase.from('mods').update({ compliance_tier: 0 }).eq('id', mod.dbId);
                      if (!error) { useStore.getState().pushStatus(t("dossier_alert_compliance_cleared")); onClose(); }
                    }} className="ml-1 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-50 hover:opacity-100"><span className="material-symbols-outlined !text-[16px]">{t("ui_icon_close")}</span></button>
                  )}
                </div>
              </div>

              {/* Category */}
              <div className="col-span-1 flex flex-col gap-1 p-6 theme-glass-panel backdrop-blur-xl rounded-[2rem] items-start text-left justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all hover:bg-white/5 hover:scale-[1.02] shadow-xl">
                <p className="text-[9px] font-black text-[var(--subtext)] opacity-50 uppercase tracking-[0.2em] mb-1">{t("dossier_label_mod_category")}</p>
                {editMode && !isCCSet && !mod.isFlavorFolder && !mod.isParent ? (
                  <div className="w-full scale-90 origin-top-left">
                    <CustomClassificationDropdown value={localCategory || "Script"} onChange={(val: string) => setLocalCategory(val)} />
                  </div>
                ) : (
                  <span className="text-xs font-black text-[var(--text)] opacity-90 uppercase tracking-widest truncate max-w-full">
                    {isCCSet ? t("dossier_cc_set") : mod.isFlavorFolder ? t("dossier_exclusive") : (mod.isParent ? t("dossier_folder") : (localCategory || t("dossier_uncategorized") || "UNCATEGORIZED"))}
                  </span>
                )}
              </div>

            </div>

            {/* Secondary Metadata Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-8">
              
              <div className="flex flex-col gap-1 p-5 theme-glass-panel backdrop-blur-md rounded-2xl items-start text-left justify-center border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all hover:bg-white/5 shadow-md">
                <p className="text-[9px] font-black text-[var(--subtext)] opacity-50 uppercase tracking-[0.2em] mb-1">{t("dossier_architect")}</p>
                {editMode ? (
                  <input value={metaInputs.author} onChange={e => setMetaInputs.author(e.target.value)} className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-2 text-[var(--text)] placeholder:text-[var(--text)] placeholder:opacity-30 text-[11px] font-black focus:outline-none focus:border-[var(--accent)] text-left uppercase transition-all shadow-inner" placeholder={t("dossier_author_placeholder")} />
                ) : (
                  <button onClick={() => { if (mod.mason_id && onOpenMasonProfile) { onOpenMasonProfile(mod.mason_id); onClose(); } }} className="text-xs font-black text-[var(--text)] opacity-90 hover:theme-text-success transition-all uppercase tracking-widest truncate max-w-full">
                    {mod.author || t("dossier_unknown") || "UNKNOWN"}
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-1 p-5 theme-glass-panel backdrop-blur-md rounded-2xl items-start text-left justify-center border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all hover:bg-white/5 shadow-md">
                <p className="text-[9px] font-black text-[var(--subtext)] opacity-50 uppercase tracking-[0.2em] mb-1">{t("dossier_revision")}</p>
                {editMode ? (
                  <input value={metaInputs.version || ""} onChange={e => setMetaInputs.version(e.target.value)} className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-2 text-[var(--text)] placeholder:text-[var(--text)] placeholder:opacity-30 text-[11px] font-black focus:outline-none focus:border-[var(--accent)] text-left uppercase transition-all shadow-inner" placeholder={t("dossier_vlocal")} />
                ) : (
                  <span className="text-xs font-black text-[var(--text)] opacity-90 uppercase tracking-widest truncate max-w-full">
                    {(() => {
                      let v = mod.mod_versions?.[0]?.version_label || mod.version;
                      if (!v && mod.isVirtual && mod.flavors) {
                        const flavorV = mod.flavors.find((f: any) => f.mod_versions?.[0]?.version_label || f.version);
                        if (flavorV) v = flavorV.mod_versions?.[0]?.version_label || flavorV.version;
                      }
                      return v || t("dossier_vlocal") || "V.LOCAL";
                    })()}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1 p-5 theme-glass-panel backdrop-blur-md rounded-2xl items-start text-left justify-center border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all hover:bg-white/5 shadow-md">
                <p className="text-[9px] font-black text-[var(--subtext)] opacity-50 uppercase tracking-[0.2em] mb-1">{t("dossier_label_uploaded")}</p>
                {editMode ? (
                  <div className="w-full scale-90 origin-top-left"><CustomDatePicker value={localCreatedAt} onChange={setLocalCreatedAt} /></div>
                ) : (
                  <span className="text-xs font-black text-[var(--text)] opacity-90 uppercase tracking-widest truncate max-w-full">
                    {(() => {
                      let dt = mod.created_at;
                      if (!dt && mod.isVirtual && mod.flavors) {
                        const dates = mod.flavors.map((f: any) => f.created_at).filter(Boolean).sort().reverse();
                        if (dates.length > 0) dt = dates[0];
                      }
                      return dt ? new Date(dt).toLocaleDateString() : t("dossier_unknown");
                    })()}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1 p-5 theme-glass-panel backdrop-blur-md rounded-2xl items-start text-left justify-center border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all hover:bg-white/5 shadow-md">
                <p className="text-[9px] font-black text-[var(--subtext)] opacity-50 uppercase tracking-[0.2em] mb-1">{t("dossier_label_last_updated")}</p>
                {editMode ? (
                  <div className="w-full scale-90 origin-top-left"><CustomDatePicker value={localUpdatedAt} onChange={setLocalUpdatedAt} /></div>
                ) : (
                  <span className="text-xs font-black text-[var(--text)] opacity-90 uppercase tracking-widest truncate max-w-full">
                    {(() => {
                      let dt = mod.updated_at;
                      if (!dt && mod.isVirtual && mod.flavors) {
                        const dates = mod.flavors.map((f: any) => f.updated_at).filter(Boolean).sort().reverse();
                        if (dates.length > 0) dt = dates[0];
                      }
                      return dt ? new Date(dt).toLocaleDateString() : t("dossier_unknown");
                    })()}
                  </span>
                )}
              </div>

            </div>



            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 px-1 ml-2">
                <span className="material-symbols-outlined !text-[18px] theme-text-accent opacity-60">{t("auto_description")}</span>
                <p className="text-xs font-black theme-text-accent uppercase tracking-[0.2em] opacity-80">{t("dossier_log_manifest")}</p>
              </div>
              {editMode ? (
                <textarea value={metaInputs.desc} onChange={e => setMetaInputs.desc(e.target.value)} className="text-sm text-[var(--text)] placeholder:text-[var(--text)] placeholder:opacity-30 font-mono bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-8 rounded-[2rem] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner h-40 resize-none focus:outline-none focus:border-[var(--accent)] transition-all" placeholder={t("dossier_local_desc_placeholder")} />
              ) : (
                <div className="text-sm text-[var(--text)] opacity-90 leading-relaxed font-medium theme-glass-panel backdrop-blur-3xl p-8 rounded-[2rem] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_10px_30px_rgba(0,0,0,0.3)] min-h-[120px] relative overflow-hidden group hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] transition-all">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-50 transition-opacity group-hover:opacity-100" />
                  {mod.description || t("dossier_no_desc_manifest") || "No local description provided for this manifest. Architects can update this locally to maintain organizational logs without breaking the global DNA signature."}
                </div>
              )}
            </div>

            {kids.length > 0 && (
              <div className="flex flex-col gap-6">
                <div className="flex justify-between items-center px-1 ml-2">
                  <h3 className="text-xs font-black theme-text-success uppercase tracking-[0.2em] opacity-90 flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[18px]">{t("auto_inventory_2")}</span>
                    {t("dossier_manifest")} <span className="opacity-60 font-mono text-[10px]">({kids.length})</span>
                  </h3>
                  {!isMarketplaceView && (
                    <button onClick={handleToggleAll} className={allEquipped ? standardDangerButtonClass : standardSuccessButtonClass}>
                      <span className="material-symbols-outlined !text-[16px]">{allEquipped ? "remove_circle_outline" : "add_circle_outline"}</span>
                      {allEquipped ? t("dossier_remove_all") : t("dossier_add_all")}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {kids.map((kid: any, kidIndex: number) => {
                    const isEquipped = activeMods.includes(kid.name);
                    return (
                      <div
                        key={kid.hash || kid.id || `${kid.name}_${kidIndex}`}
                        onClick={() => setSelectedKid(kid)}
                        className={`group relative flex flex-row items-center justify-between gap-3 p-4 px-5 rounded-[1.5rem] border transition-all cursor-pointer hover:scale-[1.01] hover:shadow-2xl backdrop-blur-2xl ${
                          isEquipped ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[0_5px_15px_rgba(var(--accent-rgb),0.2)]' : 'theme-glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-white/10 hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'
                        }`}>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm font-black text-[var(--text)] uppercase truncate group-hover:theme-text-accent transition-colors drop-shadow-sm">
                            {(kid.displayName || (kid.name || '').split('/').pop() || "").replace(/_/g, ' ').replace(/\.package$|\.ts4script$/i, '')}
                          </span>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest flex items-center gap-1.5 shrink-0 bg-black/20 px-2 py-0.5 rounded-md">
                              <span>{kid.name.toLowerCase().endsWith('.ts4script') ? 'SCRIPT' : 'PACKAGE'}</span>
                              <span className="opacity-50">•</span>
                              <span className="truncate max-w-[140px]">{kid.mod_versions?.[0]?.version_label || kid.version || t("dossier_vlocal") || "V.LOCAL"}</span>
                            </span>
                            
                            <div className={`backdrop-blur-xl border px-2 py-0.5 rounded-xl shadow-sm flex items-center gap-1.5 transition-all shrink-0 ${(() => {
                                const s = (kid.status || "");
                                if (s === (t("status_verified"))) return "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]";
                                if (s === (t("status_unverified"))) return "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]";
                                return "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]";
                            })()}`}>
                              <div className={`w-1 h-1 rounded-full shadow-[0_0_5px_currentColor] ${kid.status === (t("status_verified")) ? "bg-[var(--success)]" : kid.status === (t("status_unverified")) ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`} style={kid.color && kid.status !== (t("status_verified")) && kid.status !== (t("status_unverified")) ? { backgroundColor: kid.color } : undefined} />
                              <span className={`text-[7px] font-black uppercase tracking-widest truncate max-w-[140px] ${kid.status === (t("status_verified")) ? "text-[var(--success)]" : kid.status === (t("status_unverified")) ? "text-[var(--danger)]" : "text-[var(--accent)]"}`}>
                                {(() => {
                                  const raw = (kid.status || "");
                                  const cleaned = raw.replace(/[\[\]]/g, "");
                                  if (cleaned.toLowerCase() === 'broken') return t("status_broken");
                                  const translated = cleaned.includes('status_') ? t(cleaned) : cleaned.replace(/_/g, " ");
                                  return translated || t("status_local_only") || "LOCAL";
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>
                        {!isMarketplaceView && (
                          <button
                            onClick={(e) => { e.stopPropagation(); safeToggle(kid.name); }}
                            className={`relative w-10 h-10 shrink-0 rounded-[0.8rem] flex items-center justify-center font-black transition-all hover:scale-110 active:scale-95 shadow-lg backdrop-blur-md border ${
                              isEquipped ? 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/40 hover:text-white' : 'theme-bg-success/20 text-[var(--success)] border-[var(--success)] hover:bg-[var(--success)] hover:text-[var(--bg)]'
                            }`}
                          >
                            <span className="material-symbols-outlined mt-[-1px] !text-[20px]">{isEquipped ? t("ui_icon_close") : t("ui_icon_plus")}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(requirements.length > 0 || twins.length > 0 || conflicts.length > 0) && (
              <div className="flex flex-col mt-8">
                <div className="flex items-center justify-between px-2 mb-4">
                  <h3 className="text-xs font-black theme-text-warning uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[18px]">{t("auto_extension")}</span>
                    {t("dossier_network_protocols")}
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {requirements.map((req: any, i: number) => {
                    const reqId = typeof req === 'string' ? req : req.id || req.dbId;
                    const reqUrl = typeof req === 'string' ? null : req.url;
                    const match = modList?.find((m: any) => String(m.dbId) === String(reqId) || m.hash === reqId) || (typeof req !== 'string' ? req : null);
                    const displayName = match ? (match.displayName || match.name) : (typeof req === 'string' ? req : req.name);
                    const searchUrl = reqUrl || `https://www.google.com/search?q=Sims+4+${encodeURIComponent(displayName.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "") || displayName)}`;
                    return (
                      <div key={i} onClick={() => match ? setSelectedKid(match) : window.open(searchUrl, '_blank')} className={`group relative flex flex-row items-center justify-between gap-3 p-4 px-5 rounded-[1.5rem] border transition-all cursor-pointer hover:scale-[1.01] hover:shadow-2xl backdrop-blur-2xl theme-glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-white/10 hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] ${!match ? 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)]' : ''}`}>
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-1.5 h-1.5 rounded-full theme-bg-danger shrink-0" style={{ boxShadow: '0 0 8px var(--danger)' }} />
                            <span className={`text-sm font-black text-[var(--text)] uppercase truncate group-hover:theme-text-accent transition-colors drop-shadow-sm`}>{displayName}</span>
                        </div>
                        <span className="text-[9px] font-black theme-text-danger uppercase tracking-widest opacity-60 flex items-center gap-2 shrink-0 bg-black/20 px-2 py-0.5 rounded-md">
                          {match ? t("dossier_requirement_essential") : (
                            <>
                              {t("collection_missing_artifacts")} <span className="text-xs">{reqUrl ? (t("ui_icon_import")) : (t("ui_icon_search"))}</span>
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                  {twins.map((twin: any, i: number) => {
                    const twinId = twin.id || twin.dbId || twin.name;
                    const match = modList?.find((m: any) => String(m.dbId) === String(twinId) || m.hash === twinId) || twin;
                    const displayName = match ? (match.displayName || match.name) : (twin.displayName || twin.name);
                    return (
                      <div key={i} onClick={() => match && setSelectedKid(match)} className={`group relative flex flex-row items-center justify-between gap-3 p-4 px-5 rounded-[1.5rem] border transition-all cursor-pointer hover:scale-[1.01] hover:shadow-2xl backdrop-blur-2xl theme-glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-white/10 hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]`}>
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-1.5 h-1.5 rounded-full theme-bg-accent shrink-0" style={{ boxShadow: '0 0 8px var(--accent)' }} />
                            <span className={`text-sm font-black text-[var(--text)] uppercase truncate group-hover:theme-text-accent transition-colors drop-shadow-sm`}>{displayName}</span>
                        </div>
                        <span className="text-[9px] font-black theme-text-accent uppercase tracking-widest opacity-60 shrink-0 bg-black/20 px-2 py-0.5 rounded-md">{t("dossier_identity_twin")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected Kid (Nested Sidebar) */}
      {selectedKid && (
        <>
          <div className="fixed top-0 right-0 bottom-10 z-[55000] bg-black/0 backdrop-blur-[3px] animate-in fade-in duration-500 transition-all" style={{ left: "var(--sidebar-width, 288px)" }} onClick={() => setSelectedKid(null)} />
          <div className="fixed top-0 right-0 bottom-10 w-[700px] max-w-[100vw] theme-glass-panel border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex flex-col z-[55001] animate-in slide-in-from-right duration-500 !border-y-0 !border-r-0 backdrop-blur-3xl overflow-hidden">
            
            <button
              onClick={() => setSelectedKid(null)}
              className="absolute top-14 right-6 z-50 w-12 h-12 bg-black/40 hover:theme-bg-danger text-[var(--subtext)] opacity-80 hover:text-[var(--text)] rounded-full flex items-center justify-center transition-all border border-white/10 hover:theme-border-danger shadow-xl text-xl backdrop-blur-md"
            ><span className="material-symbols-outlined !text-[28px]">{t("ui_icon_close")}</span></button>

            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative z-10 w-full">
              <div className="h-[350px] relative bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] shrink-0 flex flex-col justify-end">
                <div className="absolute inset-0 z-0">
                  {(selectedKid.image_url || selectedKid.imageUrl || mod.image_url || mod.imageUrl) ? (
                    <img src={selectedKid.image_url || selectedKid.imageUrl || mod.image_url || mod.imageUrl} className="w-full h-full object-cover opacity-60 mix-blend-luminosity" alt={t("dossier_sub_cover_alt")} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-[var(--accent)] opacity-20 drop-shadow-2xl" style={{ fontSize: '200px' }}>
                        {(() => {
                          if (selectedKid.isParent) return "folder_open";
                          const name = (selectedKid.name || "").toLowerCase();
                          const rawType = (selectedKid.type || selectedKid.category_override || "").toLowerCase();
                          if (rawType.includes('cas') || name.includes('hair') || name.includes('clothes') || name.includes('tattoo')) return "checkroom";
                          if (rawType.includes('build') || name.includes('furniture') || name.includes('object')) return "chair";
                          if (rawType.includes('script') || name.endsWith('.ts4script')) return "code";
                          if (rawType.includes('anim') || name.includes('anim')) return "animation";
                          if (rawType.includes('cc') || name.includes('set')) return "folder_special";
                          return "extension";
                        })()}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[color-mix(in_srgb,var(--bg)_60%,transparent)] to-transparent z-10 pointer-events-none" />
                </div>
                
                <div className="relative z-20 px-10 pb-10 w-full flex flex-col items-start gap-3">
                  <h3 className="text-4xl font-black text-[var(--text)] uppercase leading-[1.1] drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]">{(selectedKid.displayName || (selectedKid.name || '').split('/').pop() || "").replace(/_/g, ' ').replace(/\.package$|\.ts4script$/i, '')}</h3>
                  <div className="flex gap-2">
                    <span className="px-4 py-1.5 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full text-[10px] font-black text-[var(--text)] opacity-90 uppercase tracking-[0.2em] shadow-lg">
                      {selectedKid.mod_versions?.[0]?.version_label || selectedKid.version || t("dossier_vlocal") || "V.LOCAL"}
                    </span>
                    <span className="px-4 py-1.5 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] rounded-full text-[10px] font-black text-[var(--accent)] opacity-90 uppercase tracking-[0.2em] shadow-lg">
                      {selectedKid.author || mod.author || t("dossier_unknown") || "UNKNOWN"}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="p-10 flex flex-col gap-6 shrink-0 relative z-30">
                
                {/* Mini Bento Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Status */}
                  <div className="flex flex-col gap-1 p-5 theme-glass-panel backdrop-blur-md rounded-2xl items-start text-left border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-md relative overflow-hidden group hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-all hover:bg-white/5">
                    <p className="text-[9px] font-black text-[var(--subtext)] opacity-50 uppercase tracking-[0.2em] mb-1 z-10">{t("dossier_status_label")}</p>
                    <div className="relative z-10 flex items-center gap-2">
                       <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor] animate-pulse ${selectedKid.status === (t("status_verified")) ? "bg-[var(--success)]" : selectedKid.status === (t("status_unverified")) ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`} style={selectedKid.color && selectedKid.status !== (t("status_verified")) && selectedKid.status !== (t("status_unverified")) ? { backgroundColor: selectedKid.color } : undefined} />
                       <span className={`text-xs font-black uppercase tracking-widest truncate ${selectedKid.status === (t("status_verified")) ? "text-[var(--success)]" : selectedKid.status === (t("status_unverified")) ? "text-[var(--danger)]" : "text-[var(--accent)]"}`}>
                          {(() => {
                            const raw = (selectedKid.status || "");
                            const cleaned = raw.replace(/[\[\]]/g, "");
                            if (cleaned.toLowerCase() === 'broken') return selectedKid.status_reason ? `BROKEN: ${selectedKid.status_reason}` : t("status_broken");
                            const translated = cleaned.includes('status_') ? t(cleaned) : cleaned.replace(/_/g, " ");
                            return translated || t("status_local_only") || "LOCAL";
                          })()}
                       </span>
                    </div>
                  </div>

                  {/* Category */}
                  <div className="flex flex-col gap-1 p-5 theme-glass-panel backdrop-blur-md rounded-2xl items-start text-left border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-md hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-all hover:bg-white/5">
                    <p className="text-[9px] font-black text-[var(--subtext)] opacity-50 uppercase tracking-[0.2em] mb-1">{t("dossier_label_mod_category")}</p>
                    <span className="text-xs font-black text-[var(--text)] opacity-90 uppercase tracking-widest truncate max-w-full">
                       {selectedKid.type || selectedKid.category_override || ((selectedKid.name || "").toLowerCase().endsWith('.ts4script') ? 'SCRIPT' : 'PACKAGE')}
                    </span>
                  </div>

                  {/* Uploaded */}
                  <div className="flex flex-col gap-1 p-5 theme-glass-panel backdrop-blur-md rounded-2xl items-start text-left border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-md hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-all hover:bg-white/5">
                    <p className="text-[9px] font-black text-[var(--subtext)] opacity-50 uppercase tracking-[0.2em] mb-1">{t("dossier_label_uploaded")}</p>
                    <span className="text-xs font-black text-[var(--text)] opacity-90 uppercase tracking-widest truncate max-w-full">
                       {selectedKid.created_at ? new Date(selectedKid.created_at).toLocaleDateString() : t("dossier_unknown")}
                    </span>
                  </div>

                  {/* Updated */}
                  <div className="flex flex-col gap-1 p-5 theme-glass-panel backdrop-blur-md rounded-2xl items-start text-left border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-md hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-all hover:bg-white/5">
                    <p className="text-[9px] font-black text-[var(--subtext)] opacity-50 uppercase tracking-[0.2em] mb-1">{t("dossier_label_last_updated")}</p>
                    <span className="text-xs font-black text-[var(--text)] opacity-90 uppercase tracking-widest truncate max-w-full">
                       {selectedKid.updated_at ? new Date(selectedKid.updated_at).toLocaleDateString() : t("dossier_unknown")}
                    </span>
                  </div>
                </div>

                <div className="text-sm text-[var(--text)] opacity-90 leading-relaxed font-medium theme-glass-panel backdrop-blur-3xl p-8 rounded-[2rem] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_10px_30px_rgba(0,0,0,0.3)] relative overflow-hidden group hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] transition-all">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-50 transition-opacity group-hover:opacity-100" />
                  {selectedKid.description || t("dossier_no_desc_sub") || "No specific local description provided for this sub-artifact."}
                </div>
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="flex-shrink-0 p-8 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] backdrop-blur-xl flex flex-row items-center justify-center gap-4 w-full relative z-50">
               <button onClick={() => setSelectedKid(null)} className={standardButtonClass}>
                  <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_close")}</span>
                  {t("ui_btn_cancel")}
               </button>
               {!isMarketplaceView && (
                  <button
                    onClick={() => { safeToggle(selectedKid.name); if (!activeMods.includes(selectedKid.name)) setSelectedKid(null); }}
                    className={activeMods.includes(selectedKid.name) ? standardDangerButtonClass : standardSuccessButtonClass}
                  >
                    <span className="material-symbols-outlined !text-[18px]">{activeMods.includes(selectedKid.name) ? (t("ui_icon_remove")) : (t("ui_icon_add"))}</span>
                    {activeMods.includes(selectedKid.name) ? t("dossier_btn_unequip") : t("dossier_btn_equip")}
                  </button>
               )}
            </div>
          </div>
        </>
      )}
      
      {/* Flag Modal */}
      {showFlagModal && (
        <>
          <div className="fixed top-0 right-0 bottom-10 z-[60000] bg-black/0 backdrop-blur-[3px] animate-in fade-in duration-300" style={{ left: 'var(--sidebar-width, 288px)' }} onClick={() => setShowFlagModal(false)} />
          <div className="fixed top-10 right-0 bottom-10 w-[500px] max-w-[100vw] theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col z-[60001] animate-in slide-in-from-right duration-500 overflow-hidden backdrop-blur-3xl rounded-tl-[3rem] rounded-bl-[3rem]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowFlagModal(false)} className="absolute top-8 right-8 z-50 w-10 h-10 theme-glass-panel hover:theme-bg-danger text-[var(--text)] hover:text-white rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <span className="material-symbols-outlined !text-[24px]">{t("ui_icon_close")}</span>
            </button>
            <div className="h-48 relative border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex flex-col items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-[var(--accent)]/5 blur-[50px] pointer-events-none rounded-full transform scale-150"></div>
              <div className="w-24 h-24 rounded-[2rem] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-inner flex items-center justify-center relative z-10">
                <span className="material-symbols-outlined text-[var(--accent)] drop-shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]" style={{ fontSize: '48px' }}>
                  {t("ui_icon_flag")}
                </span>
              </div>
            </div>
            
            <div className="px-12 pt-10 pb-2 relative flex-shrink-0">
              <h3 className="text-2xl font-black text-[var(--text)] uppercase truncate">{t("dossier_flag_title")}</h3>
              <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-1">{t("dossier_flag_desc")}</p>
            </div>
            
            <div className="p-8 flex flex-col gap-4 flex-1 overflow-y-auto custom-scrollbar relative z-10">
               <button onClick={() => handleFlagMod('Outdated Information')} className="w-full py-5 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl hover:scale-[1.02] active:scale-95 border theme-glass-panel backdrop-blur-md text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-white/5">
                 {t("dossier_flag_outdated")}
               </button>
               <button onClick={() => handleFlagMod('Inaccurate Information')} className="w-full py-5 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl hover:scale-[1.02] active:scale-95 border theme-glass-panel backdrop-blur-md text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-white/5">
                 {t("dossier_flag_inaccurate")}
               </button>
               <button onClick={() => handleFlagMod('NSFW')} className="w-full py-5 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl hover:scale-[1.02] active:scale-95 border theme-glass-panel backdrop-blur-md border-amber-500/30 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500/50">
                 {t("dossier_flag_nsfw")}
               </button>
               <button onClick={() => handleFlagMod('adult')} className="w-full py-5 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl hover:scale-[1.02] active:scale-95 border theme-glass-panel backdrop-blur-md border-orange-500/30 text-orange-500 bg-orange-500/10 hover:bg-orange-500/20 hover:border-orange-500/50">
                 {t("dossier_flag_adult")}
               </button>
            </div>
          </div>
        </>
      )}
    </>,
    document.body
  );
}
