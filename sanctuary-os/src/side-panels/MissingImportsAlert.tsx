import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useStore } from '../store';
import { useModalStore } from '../store/modalStore';
import { useLexicon } from "../LexiconContext";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { createPortal } from "react-dom";
import { SidePanel, getFileLabel, standardButtonClass, standardSuccessButtonClass, HoverTooltip, cleanSearchName, ActionButton, PanelHeaderGroup, PanelHeaderButton, getModFallbackUrl, getModFallbackAuthor } from "../shared";

export function MissingImportsAlert({ missingImportMods, setMissingImportMods, pendingImportSet, setPendingImportSet, finalizeImport, setIsDropzoneOpen }: any) {
  const { t } = useLexicon();
  const { useInternalBrowser, setIsSideBrowserOpen, setSideBrowserUrl } = useModalStore();
  const [hasFetchedHashes, setHasFetchedHashes] = useState(false);

  useEffect(() => {
    if (hasFetchedHashes || !missingImportMods || missingImportMods.length === 0) return;
    
    let updated = false;
    const nextMods = [...missingImportMods];
    const localMods = useStore.getState().modList;
    const schema = useStore.getState().activeGameSchema;

    nextMods.forEach((m, idx) => {
      let trueHash = m.hash;
      if (!trueHash && m.name) {
        const cleanMissingName = cleanSearchName(m.name, schema);
        let localMatch = localMods.find((lm: any) => cleanSearchName(lm.name || lm.displayName || '', schema) === cleanMissingName);
        if (!localMatch && cleanMissingName.length > 10) {
            localMatch = localMods.find((lm: any) => {
                const cleanL = cleanSearchName(lm.name || lm.displayName || '', schema);
                return cleanL.length > 10 && (cleanL.includes(cleanMissingName) || cleanMissingName.includes(cleanL));
            });
        }
        if (localMatch && localMatch.hash) {
            nextMods[idx] = { ...nextMods[idx], hash: localMatch.hash };
            updated = true;
        }
      }
    });

    const hashesToFetch = nextMods.filter((m: any) => m.hash && typeof m.is_paid === 'undefined').map((m: any) => m.hash);
    
    const fetchMetadata = async () => {
      try {
        if (hashesToFetch.length > 0) {
          const { data, error } = await supabase.from('mod_versions').select('dna_hash, mods(id, is_paid, is_early_access, url, master_author)').in('dna_hash', hashesToFetch);
          if (error) {
            console.error("Error fetching missing mod metadata:", error);
          } else if (data && data.length > 0) {
            data.forEach((dbMod: any) => {
               const targetIdx = nextMods.findIndex((m: any) => m.hash === dbMod.dna_hash);
               const modRef = Array.isArray(dbMod.mods) ? dbMod.mods[0] : dbMod.mods;
               if (targetIdx >= 0 && typeof nextMods[targetIdx].is_paid === 'undefined' && modRef) {
                  nextMods[targetIdx] = { 
                      ...nextMods[targetIdx], 
                      is_paid: modRef.is_paid, 
                      is_early_access: modRef.is_early_access,
                      url: nextMods[targetIdx].url || modRef.url,
                      author: nextMods[targetIdx].author || modRef.master_author
                  };
                  updated = true;
               }
            });
          }
        }

        // Secondary Global Fuzzy Search for unresolved items
        const unresolved = nextMods.filter((m: any) => typeof m.is_paid === 'undefined' && (m.name || typeof m === 'string'));
        for (const uMod of unresolved) {
            const uName = typeof uMod === 'string' ? uMod : uMod.name;
            const baseQuery = uName.replace(/^[^a-zA-Z0-9]+/, '').substring(0, 15);
            if (baseQuery.length > 5) {
                const { data, error } = await supabase.from('mods').select('id, name, is_paid, is_early_access, url, master_author, mod_versions(dna_hash)').ilike('name', `%${baseQuery}%`).limit(10);
                if (!error && data && data.length > 0) {
                    const cleanMissingName = cleanSearchName(uMod.name, schema);
                    let dbMatch = data.find((dm: any) => cleanSearchName(dm.name || '', schema) === cleanMissingName);
                    if (!dbMatch) {
                        const superCleanTarget = cleanMissingName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                        dbMatch = data.find((dm: any) => {
                            const cleanL = cleanSearchName(dm.name || '', schema);
                            const superCleanL = cleanL.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                            return superCleanL.length > 10 && (superCleanL.includes(superCleanTarget) || superCleanTarget.includes(superCleanL));
                        });
                    }
                    if (dbMatch) {
                        const targetIdx = nextMods.findIndex((m: any) => (typeof m === 'string' ? m : m.name) === uName);
                        if (targetIdx >= 0) {
                            const foundHash = (dbMatch.mod_versions && dbMatch.mod_versions.length > 0) ? dbMatch.mod_versions[0].dna_hash : undefined;
                            const currentMod = nextMods[targetIdx];
                            const baseMod = typeof currentMod === 'string' ? { name: currentMod, hash: foundHash } : currentMod;
                            nextMods[targetIdx] = { 
                                ...baseMod, 
                                hash: foundHash || baseMod.hash, 
                                is_paid: dbMatch.is_paid, 
                                is_early_access: dbMatch.is_early_access,
                                url: baseMod.url || dbMatch.url,
                                author: baseMod.author || dbMatch.master_author
                            };
                            updated = true;
                        }
                    }
                }
            }
        }
      } catch (err) {
        console.error("Fetch metadata error:", err);
      } finally {
        if (updated) {
          setMissingImportMods(nextMods);
        }
        setHasFetchedHashes(true);
      }
    };
    fetchMetadata();
  }, [missingImportMods, hasFetchedHashes, setMissingImportMods]);

  return createPortal(
    <SidePanel
      isOpen={true}
      onClose={() => { setMissingImportMods(null); setPendingImportSet(null); }}
      title={t("import_title")}
      subtitle={<>{t("import_desc1")} <span className="theme-text-accent font-black text-sm">{missingImportMods.length}</span> {t("import_desc2")}</>}
      icon="warning"
      widthClass="w-full max-w-3xl"
      backdropZ="z-[100000]"
      panelZ="z-[100001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon="close"
            tooltip={t("btn_abort")}
            variant="error"
            onClick={() => { setMissingImportMods(null); setPendingImportSet(null); }}
          />
          <PanelHeaderButton
            icon="check"
            tooltip={t("btn_confirm")}
            variant="success"
            onClick={() => finalizeImport(pendingImportSet)}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-3">
        {(() => {
          const premiumMods = missingImportMods.filter((m: any) => m.is_paid || m.is_early_access);
          const standardMods = missingImportMods.filter((m: any) => !m.is_paid && !m.is_early_access);

          const renderModList = (mods: any[]) => mods.slice(0, 100).map((mod: any, idx: number) => {
            const activeSchema = useStore.getState().activeGameSchema;
            const blueprintMeta = { url: mod.url, author: mod.author };
            const targetUrl = getModFallbackUrl(mod.name, mod.hash, activeSchema, blueprintMeta);
            const customAuthor = getModFallbackAuthor(mod.hash, blueprintMeta, mod.name, activeSchema);
            
            return (
              <div key={idx} className="flex justify-start items-center glass-surface border border-[color-mix(in_srgb,var(--text)_5%,transparent)] p-4 rounded-2xl hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] transition-all group shadow-md flex-wrap sm:flex-nowrap">
                <div className="flex flex-col min-w-0 pr-4 flex-1">
                  <span className="text-xs font-black text-[var(--text)] capitalize truncate group-hover:theme-text-accent transition-colors">{cleanSearchName(mod.name, activeSchema)}</span>
                  <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest mt-1">{customAuthor || t("unknown_mason")}</span>
                  {(mod.is_paid || mod.is_early_access) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {mod.is_early_access && (
                        <div className="px-2 py-1 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-lg flex items-center gap-1 shadow-md">
                          <span className="material-symbols-outlined !text-[10px] text-purple-500">science</span>
                          <span className="text-[8px] font-black capitalize tracking-[0.1em] text-purple-500">{t("badge_early_access")}</span>
                        </div>
                      )}
                      {mod.is_paid && (
                        <div className="px-2 py-1 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] rounded-lg flex items-center gap-1 shadow-md">
                          <span className="material-symbols-outlined !text-[10px] text-yellow-500">monetization_on</span>
                          <span className="text-[8px] font-black capitalize tracking-[0.1em] text-yellow-500">{t("badge_paid")}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const next = missingImportMods.filter((m: any) => m.name !== mod.name);
                      const standardLeft = next.filter((m: any) => !m.is_paid && !m.is_early_access);
                      if (standardLeft.length === 0) {
                        finalizeImport(pendingImportSet);
                        setMissingImportMods(null);
                      } else {
                        setMissingImportMods(next);
                      }
                    }}
                    className="w-10 h-10 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-danger hover:text-[var(--bg)] rounded-xl transition-all text-[var(--text)] group/btn relative"
                  >
                    <span className="material-symbols-outlined !text-[18px]">close</span>
                    <HoverTooltip title={t("defcon_btn_skip")} variant="danger" className="group-hover/btn:flex z-[200]" />
                  </button>
                  <button
                    onClick={() => {
                      if (useInternalBrowser) {
                        setSideBrowserUrl(targetUrl);
                        setIsSideBrowserOpen(true);
                      } else {
                        openUrl(targetUrl);
                      }
                    }}
                    className="w-10 h-10 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-accent hover:text-[var(--bg)] rounded-xl transition-all text-[var(--text)] group/btn relative"
                  >
                    <span className="material-symbols-outlined !text-[18px]">open_in_new</span>
                    <HoverTooltip title={t("import_intel")} variant="default" className="group-hover/btn:flex z-[200]" />
                  </button>
                </div>
              </div>
            );
          });

          return (
            <>
              {premiumMods.length > 0 && (
                <div className="flex flex-col gap-3 mb-4">
                  <div className="flex items-center gap-3 p-4 glass-panel border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] rounded-2xl bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] shadow-md">
                    <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-yellow-500">
                      <span className="material-symbols-outlined !text-[20px]">auto_fix_high</span>
                    </div>
                    <div className="flex flex-col flex-1">
                      <span className="text-xs font-black text-yellow-500 capitalize tracking-widest">{t("premium_detected")}</span>
                      <span className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-wider opacity-80">
                        {premiumMods.filter((m: any) => m.is_paid).length} Paid, {premiumMods.filter((m: any) => m.is_early_access).length} Early Access
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const next = missingImportMods.filter((m: any) => !m.is_paid && !m.is_early_access);
                        if (next.length === 0) {
                          finalizeImport(pendingImportSet);
                          setMissingImportMods(null);
                        } else {
                          setMissingImportMods(next);
                        }
                      }}
                      className="px-3 py-1.5 flex items-center gap-2 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-yellow-500 border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] rounded-xl transition-all"
                    >
                      <span className="material-symbols-outlined !text-[14px]">skip_next</span>
                      <span className="text-[10px] font-black capitalize tracking-widest">{t("btn_skip_premium")}</span>
                    </button>
                  </div>
                  {renderModList(premiumMods)}
                </div>
              )}

              {standardMods.length > 0 && (
                <div className="flex flex-col gap-3">
                  {premiumMods.length > 0 && (
                    <div className="flex items-center gap-4 mt-2 mb-2">
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
                      <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest opacity-60">{t("standard_artifacts")}</span>
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] via-transparent to-transparent" />
                    </div>
                  )}
                  {renderModList(standardMods)}
                </div>
              )}
            </>
          );
        })()}
        {missingImportMods.length > 100 && (
          <div className="flex items-center justify-center p-6 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] border-dashed">
            <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)]">
              + {missingImportMods.length - 100} More Artifacts (Resolve visible artifacts to load more)
            </span>
          </div>
        )}
      </div>
    </SidePanel>, document.body
  );
}


