import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import {
  HoverTooltip,
  cleanSearchName,
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  ActionButton,
  handleOpenUrl,
  getModFallbackUrl,
  getModFallbackAuthor,
} from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { VAULT_CHIP_CLASS } from "../Cards";
import { useStore } from "../store";
import { supabase } from "../supabase";

export function GhostStringsModal({
  setName,
  ghosts,
  onClose,
  onIgnore,
  onPurge,
}: any) {
  const { t } = useLexicon();
  const [ghostsMeta, setGhostsMeta] = useState<
    Record<string, { is_paid?: boolean; is_early_access?: boolean }>
  >({});

  useEffect(() => {
    if (!ghosts || ghosts.length === 0) return;
    const fetchMeta = async () => {
      const schema = useStore.getState().activeGameSchema;
      const newMeta: Record<string, any> = {};

      for (const ghost of ghosts) {
        if (ghostsMeta[ghost]) continue;
        const words = ghost.match(/[a-zA-Z0-9]+/g) || [];
        const longestWord = words.reduce(
          (a: string, b: string) => (a.length > b.length ? a : b),
          ""
        );
        const baseQuery = longestWord.length >= 4 ? longestWord : "";

        if (baseQuery.length > 0) {
          const { data, error } = await supabase
            .from("mods")
            .select("id, name, is_paid, is_early_access")
            .ilike("name", `%${baseQuery}%`)
            .limit(30);
          if (!error && data && data.length > 0) {
            const cleanMissingName = cleanSearchName(ghost, schema);
            const cleanMissingNameLower = cleanMissingName.toLowerCase();
            let dbMatch = data.find(
              (dm: any) =>
                cleanSearchName(dm.name || "", schema).toLowerCase() ===
                cleanMissingNameLower
            );
            if (!dbMatch) {
              dbMatch = data.find((dm: any) => {
                const cleanLLower = cleanSearchName(
                  dm.name || "",
                  schema
                ).toLowerCase();
                const str1 = cleanLLower.replace(/\s+/g, "");
                const str2 = cleanMissingNameLower.replace(/\s+/g, "");
                return (
                  cleanLLower.length > 10 &&
                  (str1.includes(str2) || str2.includes(str1))
                );
              });
            }
            if (dbMatch) {
              newMeta[ghost] = {
                is_paid: dbMatch.is_paid,
                is_early_access: dbMatch.is_early_access,
              };
            }
          }
        }
      }
      if (Object.keys(newMeta).length > 0) {
        setGhostsMeta((prev) => ({ ...prev, ...newMeta }));
      }
    };
    fetchMeta();
  }, [ghosts]);

  const premiumGhosts = ghosts.filter(
    (mod: string) => ghostsMeta[mod]?.is_paid || ghostsMeta[mod]?.is_early_access
  );
  const standardGhosts = ghosts.filter(
    (mod: string) =>
      !ghostsMeta[mod]?.is_paid && !ghostsMeta[mod]?.is_early_access
  );

  const renderGhostList = (modList: string[]) => (
    <div className="flex flex-col gap-2.5">
      {modList.map((mod: string, idx: number) => {
        const meta = ghostsMeta[mod] || {};
        const playSet = useStore
          .getState()
          .playSets.find((s: any) => s.name === setName);
        const modHash = playSet?.modHashes?.[mod];
        const blueprintMeta = playSet?.modMeta?.[mod];
        const activeSchema = useStore.getState().activeGameSchema;
        const targetUrl = getModFallbackUrl(
          mod,
          modHash,
          activeSchema,
          blueprintMeta
        );
        const customAuthor = getModFallbackAuthor(
          modHash,
          blueprintMeta,
          mod,
          activeSchema
        );

        return (
          <UniversalCard
            key={idx}
            layout="vertical-compact"
            icon={t("icon_extension", "extension")}
            title={cleanSearchName(mod, activeSchema)}
            subtitle={
              customAuthor ? `${customAuthor}` : mod.split("/").pop() || mod
            }
            badges={
              (meta.is_paid || meta.is_early_access) && (
                <>
                  {meta.is_early_access && (
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                        {t("icon_science", "science")}
                      </span>
                      {t("badge_early_access", "Early Access")}
                    </span>
                  )}
                  {meta.is_paid && (
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--warning)]">
                        {t("icon_monetization_on", "monetization_on")}
                      </span>
                      {t("badge_paid", "Paid")}
                    </span>
                  )}
                </>
              )
            }
            actions={
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleOpenUrl(targetUrl)}
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all text-[var(--subtext)] group/btn relative cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[15px]">
                    {t("icon_search", "search")}
                  </span>
                  <HoverTooltip
                    title={t("btn_search_network", "Search Web")}
                    variant="default"
                    className="group-hover/btn:flex z-[200]"
                  />
                </button>
                <button
                  onClick={() => onIgnore(mod)}
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--warning)] hover:text-[var(--warning)] transition-all text-[var(--subtext)] group/btn relative cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[15px]">
                    {t("icon_visibility_off", "visibility_off")}
                  </span>
                  <HoverTooltip
                    title={t("btn_ignore_alert", "Ignore")}
                    variant="default"
                    className="group-hover/btn:flex z-[200]"
                  />
                </button>
                <button
                  onClick={() => onPurge(mod)}
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-[var(--danger)] text-[var(--danger)] transition-all group/btn relative cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[15px]">
                    {t("icon_delete", "delete")}
                  </span>
                  <HoverTooltip
                    title={t("btn_purge_string", "{Delete} String")}
                    variant="danger"
                    className="group-hover/btn:flex z-[200]"
                  />
                </button>
              </div>
            }
          />
        );
      })}
    </div>
  );

  return (
    <SidePanel
      isOpen={true}
      onClose={onClose}
      title={t("missing_artifacts", "Missing {Mods}")}
      subtitle={`${ghosts.length} ${t("vault_missing_artifacts", "Missing {Mods}:")} • ${setName}`}
      icon={t("icon_cleaning_services", "cleaning_services")}
      iconColorClass="text-[var(--danger)]"
      widthClass="w-[580px] max-w-[100vw]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_cleaning_services", "cleaning_services")}
          overline={t("missing_artifacts", "Missing {Mods}")}
          title={setName}
          description={`${ghosts.length} ${t("vault_missing_artifacts", "Missing {Mods}:")}`}
          badge={String(ghosts.length)}
          badgeIcon={t("icon_warning", "warning")}
          variant="danger"
        />

        {premiumGhosts.length > 0 && (
          <UniversalGroup
            title={`${t("premium_detected", "Premium {Mods} Detected")} (${premiumGhosts.length})`}
            icon={t("icon_auto_fix_high", "auto_fix_high")}
            headerAction={
              <div className="flex items-center gap-2">
                <ActionButton
                  variant="glass"
                  icon={t("icon_visibility_off", "visibility_off")}
                  label={t("btn_ignore", "Ignore All")}
                  onClick={() =>
                    premiumGhosts.forEach((mod: string) => onIgnore(mod))
                  }
                />
                <ActionButton
                  variant="glass"
                  icon={t("icon_delete", "delete")}
                  label={t("purge", "Purge All")}
                  onClick={() =>
                    premiumGhosts.forEach((mod: string) => onPurge(mod))
                  }
                  className="!text-[var(--danger)] !border-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
                />
              </div>
            }
          >
            {renderGhostList(premiumGhosts)}
          </UniversalGroup>
        )}

        {standardGhosts.length > 0 && (
          <UniversalGroup
            title={`${t("standard_artifacts", "Standard {Mods}")} (${standardGhosts.length})`}
            icon={t("icon_inventory_2", "inventory_2")}
          >
            {renderGhostList(standardGhosts)}
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
