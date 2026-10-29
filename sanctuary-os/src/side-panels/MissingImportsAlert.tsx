import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { useStore } from "../store";
import { useLexicon } from "../LexiconContext";
import { createPortal } from "react-dom";
import {
  SidePanel,
  HoverTooltip,
  cleanSearchName,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  getModFallbackUrl,
  getModFallbackAuthor,
  handleOpenUrl,
  SidePanelHeroCard,
  StatBox,
  UniversalGroup,
  openModDossier,
} from "../shared";
import { VAULT_CHIP_CLASS } from "../Cards";

export function MissingImportsAlert({
  missingImportMods,
  setMissingImportMods,
  pendingImportSet,
  setPendingImportSet,
  finalizeImport,
}: any) {
  const { t } = useLexicon();
  const [hasFetchedHashes, setHasFetchedHashes] = useState(false);

  useEffect(() => {
    if (hasFetchedHashes || !missingImportMods || missingImportMods.length === 0) return;

    let updated = false;
    const nextMods = [...missingImportMods];
    const localMods = useStore.getState().modList;
    const schema = useStore.getState().activeGameSchema;

    nextMods.forEach((m, idx) => {
      const trueHash = m.hash;
      if (!trueHash && m.name) {
        const cleanMissingName = cleanSearchName(m.name, schema);
        let localMatch = localMods.find(
          (lm: any) => cleanSearchName(lm.name || lm.displayName || "", schema) === cleanMissingName
        );
        if (!localMatch && cleanMissingName.length > 10) {
          localMatch = localMods.find((lm: any) => {
            const cleanL = cleanSearchName(lm.name || lm.displayName || "", schema);
            return (
              cleanL.length > 10 &&
              (cleanL.includes(cleanMissingName) || cleanMissingName.includes(cleanL))
            );
          });
        }
        if (localMatch && localMatch.hash) {
          nextMods[idx] = { ...nextMods[idx], hash: localMatch.hash };
          updated = true;
        }
      }
    });

    const hashesToFetch = nextMods
      .filter((m: any) => m.hash && typeof m.is_paid === "undefined")
      .map((m: any) => m.hash);

    const fetchMetadata = async () => {
      try {
        if (hashesToFetch.length > 0) {
          const { data, error } = await supabase
            .from("mod_versions")
            .select("dna_hash, mods(id, is_paid, is_early_access, url, master_author)")
            .in("dna_hash", hashesToFetch);
          if (error) {
            console.error("Error fetching missing mod metadata:", error);
          } else if (data && data.length > 0) {
            data.forEach((dbMod: any) => {
              const targetIdx = nextMods.findIndex((m: any) => m.hash === dbMod.dna_hash);
              const modRef = Array.isArray(dbMod.mods) ? dbMod.mods[0] : dbMod.mods;
              if (
                targetIdx >= 0 &&
                typeof nextMods[targetIdx].is_paid === "undefined" &&
                modRef
              ) {
                nextMods[targetIdx] = {
                  ...nextMods[targetIdx],
                  is_paid: modRef.is_paid,
                  is_early_access: modRef.is_early_access,
                  url: nextMods[targetIdx].url || modRef.url,
                  author: nextMods[targetIdx].author || modRef.master_author,
                };
                updated = true;
              }
            });
          }
        }

        // Secondary Global Fuzzy Search for unresolved items
        const unresolved = nextMods.filter(
          (m: any) => typeof m.is_paid === "undefined" && (m.name || typeof m === "string")
        );
        for (const uMod of unresolved) {
          const uName = typeof uMod === "string" ? uMod : uMod.name;
          const baseQuery = uName.replace(/^[^a-zA-Z0-9]+/, "").substring(0, 15);
          if (baseQuery.length > 5) {
            const { data, error } = await supabase
              .from("mods")
              .select(
                "id, name, is_paid, is_early_access, url, master_author, mod_versions(dna_hash)"
              )
              .ilike("name", `%${baseQuery}%`)
              .limit(10);
            if (!error && data && data.length > 0) {
              const cleanMissingName = cleanSearchName(uMod.name, schema);
              let dbMatch = data.find(
                (dm: any) => cleanSearchName(dm.name || "", schema) === cleanMissingName
              );
              if (!dbMatch) {
                const superCleanTarget = cleanMissingName
                  .replace(/[^a-zA-Z0-9]/g, "")
                  .toLowerCase();
                dbMatch = data.find((dm: any) => {
                  const cleanL = cleanSearchName(dm.name || "", schema);
                  const superCleanL = cleanL.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
                  return (
                    superCleanL.length > 10 &&
                    (superCleanL.includes(superCleanTarget) ||
                      superCleanTarget.includes(superCleanL))
                  );
                });
              }
              if (dbMatch) {
                const targetIdx = nextMods.findIndex(
                  (m: any) => (typeof m === "string" ? m : m.name) === uName
                );
                if (targetIdx >= 0) {
                  const foundHash =
                    dbMatch.mod_versions && dbMatch.mod_versions.length > 0
                      ? dbMatch.mod_versions[0].dna_hash
                      : undefined;
                  const currentMod = nextMods[targetIdx];
                  const baseMod =
                    typeof currentMod === "string"
                      ? { name: currentMod, hash: foundHash }
                      : currentMod;
                  nextMods[targetIdx] = {
                    ...baseMod,
                    hash: foundHash || baseMod.hash,
                    is_paid: dbMatch.is_paid,
                    is_early_access: dbMatch.is_early_access,
                    url: baseMod.url || dbMatch.url,
                    author: baseMod.author || dbMatch.master_author,
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

  const premiumMods = (missingImportMods || []).filter(
    (m: any) => m.is_paid || m.is_early_access
  );
  const standardMods = (missingImportMods || []).filter(
    (m: any) => !m.is_paid && !m.is_early_access
  );

  const renderModList = (mods: any[]) =>
    mods.slice(0, 100).map((mod: any, idx: number) => {
      const activeSchema = useStore.getState().activeGameSchema;
      const blueprintMeta = { url: mod.url, author: mod.author };
      const targetUrl = getModFallbackUrl(mod.name, mod.hash, activeSchema, blueprintMeta);
      const customAuthor = getModFallbackAuthor(mod.hash, blueprintMeta, mod.name, activeSchema);

      return (
        <div
          key={idx}
          onClick={() =>
            openModDossier({
              ...mod,
              author: customAuthor || mod.author,
              url: targetUrl || mod.url,
            })
          }
          className="flex justify-between items-center glass-surface rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] transition-all group gap-3 flex-wrap sm:flex-nowrap cursor-pointer"
        >
          <div className="flex items-center gap-3.5 min-w-0 pr-2 flex-1">
            <div
              className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0"
              style={{
                color: mod.is_paid || mod.is_early_access ? "var(--warning)" : "var(--accent)",
              }}
            >
              <span className="material-symbols-outlined !text-[20px]">
                {mod.is_paid
                  ? t("icon_monetization_on", "monetization_on")
                  : mod.is_early_access
                    ? t("icon_science", "science")
                    : t("icon_extension", "extension")}
              </span>
            </div>
            <div className="flex flex-col min-w-0 flex-1 gap-1">
              <span className="text-xs font-black text-[var(--text)] capitalize truncate group-hover:text-[var(--accent)] transition-colors">
                {cleanSearchName(mod.name, activeSchema)}
              </span>
              <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 capitalize tracking-wider">
                {customAuthor || t("unknown_mason", "Unknown {Mason}")}
              </span>
              {(mod.is_paid || mod.is_early_access) && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {mod.is_early_access && (
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                        {t("icon_science", "science")}
                      </span>
                      {t("badge_early_access", "Early Access")}
                    </span>
                  )}
                  {mod.is_paid && (
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--warning)]">
                        {t("icon_monetization_on", "monetization_on")}
                      </span>
                      {t("badge_paid", "Paid")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const next = missingImportMods.filter((m: any) => m.name !== mod.name);
                const standardLeft = next.filter(
                  (m: any) => !m.is_paid && !m.is_early_access
                );
                if (standardLeft.length === 0) {
                  finalizeImport(pendingImportSet);
                  setMissingImportMods(null);
                } else {
                  setMissingImportMods(next);
                }
              }}
              className="w-9 h-9 shrink-0 flex items-center justify-center glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:text-[var(--danger)] rounded-xl transition-all text-[var(--text)] group/btn relative cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[17px]">
                {t("icon_close", "close")}
              </span>
              <HoverTooltip
                title={t("defcon_btn_skip", "Skip")}
                variant="danger"
                className="group-hover/btn:flex z-[200]"
              />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenUrl(targetUrl);
              }}
              className="w-9 h-9 shrink-0 flex items-center justify-center glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] rounded-xl transition-all text-[var(--text)] group/btn relative cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[17px]">
                {t("icon_open_in_new", "open_in_new")}
              </span>
              <HoverTooltip
                title={t("import_intel", "Locate Mod")}
                variant="default"
                className="group-hover/btn:flex z-[200]"
              />
            </button>
          </div>
        </div>
      );
    });

  return createPortal(
    <SidePanel
      isOpen={true}
      onClose={() => {
        setMissingImportMods(null);
        setPendingImportSet(null);
      }}
      title={t("import_title", "Missing {Mods} Detected")}
      subtitle={
        <>
          {t("import_desc1", "This {Blueprint} requires")}{" "}
          <span className="theme-text-accent font-black text-sm">
            {missingImportMods.length}
          </span>{" "}
          {t("import_desc2", "{mods} that are not currently in your {Vault}. Please acquire them below.")}
        </>
      }
      icon={t("icon_warning", "warning")}
      iconColorClass="text-[var(--warning)]"
      widthClass="w-[90vw] md:w-[760px]"
      backdropZ="z-[100000]"
      panelZ="z-[100001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_check", "check")}
            tooltip={t("confirm", "Confirm Import")}
            variant="success"
            onClick={() => finalizeImport(pendingImportSet)}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_warning", "warning")}
          overline={t("import_title", "Missing {Mods} Detected")}
          title={pendingImportSet?.name || t("import_title", "Missing {Mods} Detected")}
          description={
            <>
              {t("import_desc1", "This {Blueprint} requires")}{" "}
              <span className="font-black text-[var(--text)]">
                {missingImportMods.length}
              </span>{" "}
              {t("import_desc2", "{mods} that are not currently in your {Vault}. Please acquire them below.")}
            </>
          }
          badge={`${missingImportMods.length} ${t("term_mods", "Items")}`}
          badgeIcon={t("icon_warning", "warning")}
          variant="warning"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <StatBox
              label={t("term_mods", "Missing")}
              value={missingImportMods.length}
              icon={t("icon_warning", "warning")}
              iconColorClass="text-[var(--warning)]"
            />
            <StatBox
              label={t("standard_artifacts", "Standard {Mods}")}
              value={standardMods.length}
              icon={t("icon_inventory_2", "inventory_2")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("premium_detected", "Premium {Mods} Detected")}
              value={premiumMods.length}
              icon={t("icon_auto_fix_high", "auto_fix_high")}
              iconColorClass="text-[var(--warning)]"
            />
          </div>

          <ActionButton
            variant="glass"
            icon={t("icon_check", "check")}
            label={t("confirm", "Confirm Import")}
            onClick={() => finalizeImport(pendingImportSet)}
            className="w-full"
          />
        </SidePanelHeroCard>

        {premiumMods.length > 0 && (
          <UniversalGroup
            title={`${t("premium_detected", "Premium {Mods} Detected")} (${premiumMods.length})`}
            icon={t("icon_auto_fix_high", "auto_fix_high")}
            headerAction={
              <ActionButton
                variant="glass"
                icon={t("icon_skip_next", "skip_next")}
                label={t("btn_skip_premium", "Skip Premium")}
                onClick={() => {
                  const next = missingImportMods.filter(
                    (m: any) => !m.is_paid && !m.is_early_access
                  );
                  if (next.length === 0) {
                    finalizeImport(pendingImportSet);
                    setMissingImportMods(null);
                  } else {
                    setMissingImportMods(next);
                  }
                }}
              />
            }
          >
            <div className="flex flex-col gap-3">{renderModList(premiumMods)}</div>
          </UniversalGroup>
        )}

        {standardMods.length > 0 && (
          <UniversalGroup
            title={`${t("standard_artifacts", "Standard {Mods}")} (${standardMods.length})`}
            icon={t("icon_inventory_2", "inventory_2")}
          >
            <div className="flex flex-col gap-3">{renderModList(standardMods)}</div>
          </UniversalGroup>
        )}

        {missingImportMods.length > 100 && (
          <div className="flex items-center justify-center p-5 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] border-dashed">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              + {missingImportMods.length - 100} {t("term_mods", "More Artifacts")}
            </span>
          </div>
        )}
      </div>
    </SidePanel>,
    document.body
  );
}
