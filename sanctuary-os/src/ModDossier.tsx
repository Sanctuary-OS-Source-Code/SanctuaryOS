import { useState } from "react";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";

export default function ModDossier({ mod, modList, activePlaySet, onToggleInActiveSet, onShowYeetAlert, onClose, metaInputs, setMetaInputs, onSaveMetadata, onOpenMasonProfile, editMode, setEditMode, onSendToLab, onSecureShred, isCorrecting, setIsCorrecting }: any) {
  const [selectedKid, setSelectedKid] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const { t } = useLexicon();
  if (!mod) return null;

  const activeMods = activePlaySet?.mods || [];
  const kids = mod.flavors || [];
  const isCCSet = mod.isCCSet;

  const getCasualties = (targetName: string): string[] => {
    const target = (modList || []).find((m: any) => m.name === targetName);
    if (!target || !target.dbId) return [];
    
    const findDeep = (modId: string, currentSet: Set<string>, result: any[]) => {
      const currentMod = (modList || []).find((m:any) => String(m.dbId) === String(modId));
      if (!currentMod) return;
      const deps = (modList || []).filter((m: any) => 
        !m.isVirtual && 
        (m.requirements?.some((r: any) => {
          const reqId = typeof r === 'string' ? r : r.id || r.dbId;
          const reqName = typeof r === 'string' ? r : r.name;
          const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
          const isReqNumeric = !isNaN(Number(reqName));
          return (reqId && String(currentMod.dbId) === String(reqId)) ||
                 (reqId && currentMod.hash === reqId) ||
                 (!isReqNumeric && reqBaseName && currentMod.displayName && (currentMod.displayName.toUpperCase().includes(reqBaseName) || currentMod.displayName.toUpperCase().replace(/_/g, " ").includes(reqBaseName.replace(/_/g, " "))));
        }) ||
        (String(m.familyId) === String(currentMod.familyId || modId) && m.relationshipType === 'addon' && currentMod.relationshipType !== 'addon')) &&
        activeMods.includes(m.name)
      );
      for (const d of deps) {
        if (!currentSet.has(d.name)) {
          currentSet.add(d.name);
          result.push(d);
          if (d.dbId) findDeep(d.dbId, currentSet, result);
        }
      }
    };
    
    const deepDeps: any[] = [];
    findDeep(target.dbId, new Set<string>(), deepDeps);
    
    if (deepDeps.length === 0) return [];
    
    const cleanTarget = (target.displayName || (target.name || "").split('/').pop() || "").replace(/_/g, ' ').replace(/\.package$|\.ts4script$/i, '');
    const cleanDeps = deepDeps.map((d: any) => (d.displayName || (d.name || "").split('/').pop() || "").replace(/_/g, ' ').replace(/\.package$|\.ts4script$/i, ''));
    
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
          allDeps.push((k.displayName || k.name.split('/').pop() || "").replace(/_/g, ' ').replace(/\.package$|\.ts4script$/i, ''));
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
    await onSaveMetadata();
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
      alert("Cannot flag local-only mods.");
      return;
    }

    let payload: any = {};
    if (reason === 'adult') payload = { status: 'blacklisted' };
    else if (reason === 'NSFW') payload = { compliance_tier: 1 };
    else payload = { status: 'unverified' };

    const { error } = await supabase.from('mods').update(payload).eq('id', mod.dbId);
    if (!error) {
      alert(`Mod flagged for: ${reason}. It has been updated pending review.`);
      setShowFlagModal(false);
      onClose();
    } else {
      alert(`Failed to flag mod: ${error.message}`);
    }
  };

  const handleSubmitToVault = async () => {
    setIsSaving(true);
    const { error } = await supabase.from('scout_suggestions').insert([{
      dna_hash: mod.hash,
      suggested_name: metaInputs.name,
      suggested_author: metaInputs.author,
      suggested_url: metaInputs.url,
      status: 'pending'
    }]);
    
    if (error) {
      alert(`Failed to submit to Vault: ${error.message}`);
    } else {
      alert("Successfully submitted to Vault for Architect verification!");
      setEditMode(false);
    }
    setIsSaving(false);
  };

  const requirements = mod.requirements || mod.requires || [];
  const conflicts = mod.conflicts || [];
  const twins = mod.twins || [];

  return (
    <>
      <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl animate-in fade-in duration-300 p-8">
        <div
          className="relative w-full max-w-6xl h-[92vh] theme-glass-panel border-0 rounded-[3.5rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex overflow-hidden"
          
        >
          
          <div className="w-1/3 h-full relative bg-black border-r border-white/5 shrink-0">
              <img
                src={metaInputs.image || mod.image_url || mod.imageUrl || 'https://forums.ea.com/t5/s/tghpe58374/images/bS0xMzI3ODY1MS1RNkFpREk?revision=1&image-dimensions=2000x2000&constrain-image=true'}
                className="w-full h-full object-cover opacity-80"
                alt={t("dossier_cover_alt")}
              />
              <div className="absolute inset-0 shadow-[inset_-25px_0_50px_rgba(0,0,0,0.6)] pointer-events-none" />
              {editMode && (
                <div className="absolute bottom-8 left-8 right-8">
                  <label className="text-[9px] font-black text-[var(--text)] uppercase tracking-widest drop-shadow-md">Cover Image URL</label>
                  <input value={metaInputs.image} onChange={e => setMetaInputs.image(e.target.value)} className="w-full mt-1 bg-black/60 backdrop-blur-md border border-white/20 rounded-xl px-4 py-3 text-[var(--text)] text-xs font-mono focus:outline-none focus:border-white transition-all shadow-lg" placeholder="https://..." />
                </div>
              )}
            </div>

          <div className="flex-1 h-full flex flex-col overflow-hidden">
            
            <div className="w-full p-8 border-b border-white/5 bg-black/40 flex justify-between items-center shrink-0">
              <div className="flex-1 min-w-0">
                 {editMode ? (
                    <input value={metaInputs.name} onChange={e => setMetaInputs.name(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-2xl font-black text-[var(--text)] uppercase focus:outline-none focus:theme-border-accent" />
                  ) : (
                    <h2 className="text-4xl font-black text-[var(--text)] tracking-tighter uppercase leading-tight drop-shadow-lg break-words pr-4">
                      {(mod.displayName || mod.name.split('/').pop() || "").replace(/_/g, ' ').replace(/\.package$|\.ts4script$/i, '')}
                    </h2>
                  )}
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <button onClick={() => setShowFlagModal(true)} className="h-14 px-6 bg-red-900/20 hover:bg-red-900/40 text-red-400 font-black text-[10px] tracking-widest uppercase rounded-2xl border border-red-500/20 hover:border-red-500/50 transition-all flex items-center justify-center">
                  ⚑ FLAG
                </button>
                <button
                  onClick={onClose}
                  className="w-14 h-14 bg-white/5 hover:theme-bg-danger text-[var(--subtext)] opacity-80 hover:text-[var(--text)] rounded-2xl flex items-center justify-center transition-all border border-white/10 hover:theme-border-danger shadow-xl text-xl shrink-0"
                >✕</button>
              </div>
            </div>

            <div className="flex-1 p-12 overflow-y-auto custom-scrollbar flex flex-col gap-8 pb-32">

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 border-b border-white/5 pb-10">
                
                <div className="flex flex-col gap-2">
                  <p className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-[0.2em] text-center">{t("dossier_architect")}</p>
                  <div className="flex items-center justify-center px-2 h-10 theme-glass-inner rounded-xl w-full">
                    {editMode ? (
                      <input value={metaInputs.author} onChange={e => setMetaInputs.author(e.target.value)} className="w-full bg-transparent border-none text-center text-[10px] font-black text-[var(--text)] uppercase focus:outline-none placeholder:opacity-30" placeholder="Author Name..." />
                    ) : (
                      <button
                        onClick={() => { if (mod.mason_id && onOpenMasonProfile) { onOpenMasonProfile(mod.mason_id); onClose(); } }}
                        className="text-[10px] font-black text-[var(--text)] hover:theme-text-success transition-all uppercase tracking-widest truncate"
                      >
                        {mod.author || t("dossier_unknown")}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-[0.2em] text-center">{t("dossier_revision")}</p>
                  <div className="flex items-center justify-center px-2 h-10 theme-glass-inner rounded-xl w-full">
                    <span className="text-[10px] font-mono text-[var(--text)] uppercase tracking-widest truncate">{mod.version || t("dossier_vlocal")}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-[0.2em] text-center">{t("dossier_status_label")}</p>
                  <div className="flex items-center justify-center gap-2 px-2 h-10 theme-glass-inner rounded-xl w-full">
                    <div className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ backgroundColor: mod.color || '#9ca3af' }} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] truncate">
                      {(() => {
                        const raw = (mod.status || "");
                        const cleaned = raw.replace(/[\[\]]/g, "");
                        return cleaned.includes("status_") ? t(cleaned) : (mod.status || t("status_local_only"));
                      })()}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-[0.2em] text-center">Compliance Tier</p>
                  <div className="flex items-center justify-center gap-2 px-2 h-10 theme-glass-inner rounded-xl w-full">
                    <span className={`text-[10px] font-black uppercase tracking-widest truncate ${mod.compliance_tier === 1 ? 'theme-text-warning' : 'text-[var(--text)] opacity-50'}`}>
                      {mod.compliance_tier === 1 ? "NSFW" : "CLEAN"}
                    </span>
                    {mod.compliance_tier === 1 && (
                      <button onClick={async () => {
                        if (!mod.dbId) return;
                        const { error } = await supabase.from('mods').update({ compliance_tier: 0 }).eq('id', mod.dbId);
                        if (!error) { alert('Compliance Tier cleared. Mod is now CLEAN.'); onClose(); }
                      }} className="ml-auto w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 hover:text-white">✕</button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-[0.2em] text-center">{t("dossier_signature_type")}</p>
                  <div className="flex items-center justify-center px-2 h-10 theme-glass-inner rounded-xl w-full">
                    <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] truncate">
                      {isCCSet ? t("dossier_cc_set") : mod.isFlavorFolder ? t("dossier_exclusive") : (mod.isParent ? t("dossier_folder") : (mod.category_override || mod.type || "FILE"))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end mb-4 relative z-10">
                {editMode ? (
                  <input value={metaInputs.url} onChange={e => setMetaInputs.url(e.target.value)} className="px-5 py-3 theme-glass-panel rounded-xl text-[10px] font-black text-[var(--text)] focus:outline-none focus:theme-border-accent w-full max-w-lg shadow-xl" placeholder="External URL..." />
                ) : (
                  <a href={mod.url || `https://www.google.com/search?q=${encodeURIComponent(mod.displayName || mod.name.split('/').pop() || "")}`} target="_blank" rel="noopener noreferrer" className="px-8 py-3 theme-bg-accent text-[var(--bg)] rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg flex items-center gap-3">
                    {mod.url ? "DOWNLOAD ASSET" : "SEARCH WEB"} <span className="text-sm">{mod.url ? "📥" : "🔍"}</span>
                  </a>
                )}
              </div>

              <div className="flex items-center gap-4">
                {mod.status?.includes('QUARANTINED') ? (
                  <button onClick={() => { if (onSecureShred) onSecureShred(mod.name); onClose(); }} className="flex-1 py-5 theme-bg-danger text-[var(--bg)] font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_50px_rgba(var(--danger-rgb),0.5)]">
                    SECURE SHRED
                  </button>
                ) : editMode ? (
                  <div className="flex w-full gap-4">
                    <button onClick={handleSave} disabled={isSaving} className="flex-1 py-5 theme-glass-panel hover:bg-white/10 border border-white/10 hover:theme-border-accent text-[var(--text)] font-black text-xs uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl">
                      {isSaving ? "SAVING..." : t("dossier_btn_save_local")}
                    </button>
                    {isCorrecting && (
                      <button onClick={handleSubmitToVault} disabled={isSaving} className="flex-1 py-5 theme-bg-success text-[var(--bg)] font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl">
                        {isSaving ? "SUBMITTING..." : "SUBMIT CORRECTIONS"}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <button onClick={() => setEditMode(true)} className="flex-1 py-5 theme-glass-panel hover:bg-white/10 hover:theme-border-accent text-[var(--text)] font-black text-xs uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl">
                      EDIT OVERRIDES
                    </button>
                  </>
                )}
              </div>

              <div className="flex flex-col gap-4">
                <p className="text-[9px] font-black theme-text-accent uppercase tracking-[0.3em] opacity-40 px-1">Log Manifest</p>
                {editMode ? (
                  <textarea value={metaInputs.desc} onChange={e => setMetaInputs.desc(e.target.value)} className="text-sm text-[var(--text)] font-mono bg-black/40 p-8 rounded-[2rem] border border-white/10 shadow-inner h-40 resize-none focus:outline-none focus:theme-border-accent" placeholder="Local Description..." />
                ) : (
                  <div className="text-sm text-[var(--subtext)] opacity-80 leading-relaxed font-medium bg-black/40 p-8 rounded-[2rem] border border-white/5 shadow-inner min-h-[100px]">
                    {mod.description || t("dossier_no_desc_manifest")}
                  </div>
                )}
              </div>

              {kids.length > 0 && (
                <div className="flex flex-col gap-6">
                  <div className="flex justify-between items-center px-1">
                    <h3 className="text-[10px] font-black theme-text-success uppercase tracking-[0.2em]">
                      {t("dossier_manifest")} ({kids.length})
                    </h3>
                    <button onClick={handleToggleAll} className="theme-bg-accent text-[var(--bg)] px-8 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg">
                      {allEquipped ? t("dossier_remove_all") : t("dossier_add_all")}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {kids.map((kid: any) => {
                      const isEquipped = activeMods.includes(kid.name);
                      return (
                        <div
                          key={kid.hash || kid.name}
                          onClick={() => setSelectedKid(kid)}
                          className={`group relative flex flex-col items-start p-5 rounded-2xl border transition-all cursor-pointer hover:scale-[1.02] hover:shadow-xl ${
                            isEquipped ? 'bg-white/5 border-white/20' : 'bg-black/40 border-white/5 hover:border-white/10'
                          }`}>
                          <div className="flex flex-col min-w-0 pr-14 mb-1">
                            <span className="text-[11px] font-bold text-[var(--text)] uppercase truncate group-hover:theme-text-accent transition-colors">
                              {(kid.displayName || kid.name.split('/').pop() || "").replace(/_/g, ' ').replace(/\.package$|\.ts4script$/i, '')}
                            </span>
                            <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 mt-1 uppercase tracking-widest">
                              {kid.version || t("dossier_vlocal")}
                            </span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); safeToggle(kid.name); }}
                            className={`absolute top-3 right-3 w-8 h-8 shrink-0 rounded-lg flex items-center justify-center font-black transition-all hover:scale-110 active:scale-90 border ${
                              isEquipped ? 'theme-panel-danger theme-btn-danger' : 'bg-white/5 text-[var(--text)]/40 border-white/10 hover:text-[var(--text)]'
                            }`}
                          >
                            <span className="mt-[-2px]">{isEquipped ? '✕' : '+'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(requirements.length > 0 || twins.length > 0 || conflicts.length > 0) && (
                <div className="flex flex-col gap-6">
                  <h3 className="text-[10px] font-black theme-text-warning uppercase tracking-[0.2em] px-1">Network Protocols</h3>
                  <div className="space-y-3">
                    {requirements.map((req: any, i: number) => {
                      const reqId = typeof req === 'string' ? req : req.id || req.dbId;
                      const match = modList?.find((m: any) => String(m.dbId) === String(reqId) || m.hash === reqId);
                      const displayName = match ? (match.displayName || match.name) : (typeof req === 'string' ? req : req.name);
                      return (
                        <div key={i} className="flex items-center justify-between p-4 theme-glass-inner rounded-2xl">
                          <div className="flex items-center gap-3">
                              <div className="w-1.5 h-1.5 rounded-full theme-bg-danger" style={{ boxShadow: '0 0 8px var(--danger)' }} />
                              <span className="text-xs font-bold text-[var(--text)] uppercase tracking-tight">{displayName}</span>
                          </div>
                          <span className="text-[8px] font-black theme-text-danger uppercase tracking-widest opacity-60">Requirement: Essential</span>
                        </div>
                      );
                    })}
                    {twins.map((twin: any, i: number) => {
                      const twinId = twin.id || twin.dbId || twin.name;
                      const match = modList?.find((m: any) => String(m.dbId) === String(twinId) || m.hash === twinId);
                      const displayName = match ? (match.displayName || match.name) : (twin.displayName || twin.name);
                      return (
                        <div key={i} className="flex items-center justify-between p-4 theme-glass-inner rounded-2xl">
                          <div className="flex items-center gap-3">
                              <div className="w-1.5 h-1.5 rounded-full theme-bg-accent" style={{ boxShadow: '0 0 8px var(--accent)' }} />
                              <span className="text-xs font-bold text-[var(--text)] uppercase tracking-tight">{displayName}</span>
                          </div>
                          <span className="text-[8px] font-black theme-text-accent uppercase tracking-widest opacity-60">Identity Twin: Logic Split</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {selectedKid && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl animate-in zoom-in-95 duration-200 p-8" onClick={() => setSelectedKid(null)}>
          <div
            className="relative w-full max-w-xl theme-glass-panel rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            
            <button onClick={() => setSelectedKid(null)} className="absolute top-6 right-6 z-50 w-10 h-10 bg-black/40 backdrop-blur-md hover:theme-bg-danger text-white/70 hover:text-white rounded-full flex items-center justify-center transition-all shadow-xl border border-white/10">✕</button>
            <div className="h-40 relative bg-black border-b border-white/10 shrink-0">
              <img src={selectedKid.image_url || selectedKid.imageUrl || mod.image_url || mod.imageUrl || 'https://forums.ea.com/t5/s/tghpe58374/images/bS0xMzI3ODY1MS1RNkFpREk?revision=1&image-dimensions=2000x2000&constrain-image=true'} className="w-full h-full object-cover opacity-80" alt={t("dossier_sub_cover_alt")} />
              <div className="absolute inset-0 bg-gradient-to-t from-transparent to-black/20" />
            </div>
            <div className="px-8 pt-6 pb-2 relative">
              <h3 className="text-2xl font-black text-[var(--text)] uppercase truncate">{(selectedKid.displayName || selectedKid.name.split('/').pop() || "").replace(/_/g, ' ').replace(/\.package$|\.ts4script$/i, '')}</h3>
              <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-1">{selectedKid.version || t("dossier_vlocal")} &bull; {selectedKid.author || mod.author || t("dossier_unknown")}</p>
            </div>
            <div className="p-8 flex flex-col gap-6">
              <div className="text-sm text-[var(--text)] leading-relaxed font-medium bg-black/40 p-5 rounded-2xl border border-white/5 shadow-inner max-h-40 overflow-y-auto custom-scrollbar">
                {selectedKid.description || t("dossier_no_desc_sub")}
              </div>
              <button
                onClick={() => { safeToggle(selectedKid.name); if (!activeMods.includes(selectedKid.name)) setSelectedKid(null); }}
                className={`w-full py-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg hover:scale-[1.02] active:scale-95 border ${
                  activeMods.includes(selectedKid.name)
                    ? 'theme-panel-danger theme-btn-danger'
                    : 'theme-panel-success theme-btn-success'
                }`}
              >
                {activeMods.includes(selectedKid.name) ? t("dossier_btn_unequip") : t("dossier_btn_equip")}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showFlagModal && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl animate-in zoom-in-95 duration-200 p-8" onClick={() => setShowFlagModal(false)}>
          <div
            className="relative w-full max-w-xl theme-glass-panel rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setShowFlagModal(false)} className="absolute top-6 right-6 z-50 w-10 h-10 bg-black/40 backdrop-blur-md hover:theme-bg-danger text-white/70 hover:text-white rounded-full flex items-center justify-center transition-all shadow-xl border border-white/10">✕</button>
            <div className="h-40 relative bg-black border-b border-white/10 shrink-0">
              <img src={mod.image_url || mod.imageUrl || 'https://forums.ea.com/t5/s/tghpe58374/images/bS0xMzI3ODY1MS1RNkFpREk?revision=1&image-dimensions=2000x2000&constrain-image=true'} className="w-full h-full object-cover opacity-80 grayscale mix-blend-luminosity" alt="Flag Content" />
              <div className="absolute inset-0 bg-gradient-to-t from-red-900/40 to-black/20" />
            </div>
            
            <div className="px-8 pt-6 pb-2 relative">
              <h3 className="text-2xl font-black text-[var(--text)] uppercase truncate">{t("dossier_flag_title")}</h3>
              <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-1">{t("dossier_flag_desc")}</p>
            </div>
            
            <div className="p-8 flex flex-col gap-4">
               <button onClick={() => handleFlagMod('Outdated Information')} className="w-full py-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg hover:scale-[1.02] active:scale-95 border bg-black/40 hover:bg-black/60 text-[var(--text)] border-white/10 hover:border-white/30">
                 {t("dossier_flag_outdated")}
               </button>
               <button onClick={() => handleFlagMod('Inaccurate Information')} className="w-full py-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg hover:scale-[1.02] active:scale-95 border bg-black/40 hover:bg-black/60 text-[var(--text)] border-white/10 hover:border-white/30">
                 {t("dossier_flag_inaccurate")}
               </button>
               <button onClick={() => handleFlagMod('NSFW')} className="w-full py-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg hover:scale-[1.02] active:scale-95 border theme-panel-warning theme-btn-warning !text-[var(--text)]">
                 {t("dossier_flag_nsfw")}
               </button>
               <button onClick={() => handleFlagMod('adult')} className="w-full py-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg hover:scale-[1.02] active:scale-95 border theme-panel-danger theme-btn-danger !text-[var(--text)]">
                 {t("dossier_flag_adult")}
               </button>
            </div>
          </div>
        </div>
      )}
            </>
          );
        }
