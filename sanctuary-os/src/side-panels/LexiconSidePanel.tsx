import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { supabase } from "../supabase";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  CustomDropdown,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionPill,
  VAULT_CHIP_CLASS,
  HoverTooltip,
} from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { DynamicLexiconPreviewBanner } from "../chameleon-components/ThemeCard";

export default function LexiconSidePanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const {
    t,
    registry,
    activeLang,
    setActiveLang,
    importLexicon,
    deleteLexicon,
    lexiconMeta,
    useGlobalLexicon,
    setUseGlobalLexicon,
    autoTranslateDynamic,
    setAutoTranslateDynamic,
  } = useLexicon();
  const setView = useStore((state) => state.setView);
  const setMarketTab = useStore((state) => state.setMarketTab);

  const [dbLanguages, setDbLanguages] = useState<Record<string, string>>({});
  const [lexiconSearch, setLexiconSearch] = useState("");
  const [selectedLibraryLang, setSelectedLibraryLang] = useState<string | null>(
    null
  );
  const [selectedLibraryCommunity, setSelectedLibraryCommunity] = useState<
    string | null
  >(null);
  const [favoriteLexicons, setFavoriteLexicons] = useState<string[]>(() =>
    JSON.parse(
      localStorage.getItem("sanctuary_favorite_lexicons") ||
        '["en-sanctuary", "en-default"]'
    )
  );
  const [confirmDelete, setConfirmDelete] = useState<string | false>(false);

  useEffect(() => {
    async function fetchLanguages() {
      try {
        const { data } = await supabase
          .from("nexus_assets")
          .select("name, language")
          .eq("asset_type", "lexicon");
        if (data) {
          const map = data.reduce((acc: any, curr: any) => {
            if (curr.name && curr.language) acc[curr.name] = curr.language;
            return acc;
          }, {});
          setDbLanguages(map);
        }
      } catch (e) {}
    }
    fetchLanguages();
  }, []);

  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const isSimsGame = `${activeGameSchema?.id || ""} ${
    activeGameSchema?.name || ""
  } ${activeGameSchema?.display_name || ""}`
    .toLowerCase()
    .includes("sims");

  const getLexiconMetadata = (code: string) => {
    const cleanName = (val: string) =>
      val.includes(":") ? val.split(":")[1].trim() : val;

    if (code === "en-sanctuary")
      return {
        community: "Sanctuary",
        language: "English",
        name: cleanName(t("lang_sanctuary", "Sanctuary")),
      };
    if (code === "en-default")
      return {
        community: "Sanctuary",
        language: "English",
        name: cleanName(t("lang_standard", "Standard English")),
      };
    if (code === "en-sims" || code === "Simlish") {
      const simsMeta = lexiconMeta?.find((m: any) => m.id === code);
      return {
        community:
          simsMeta?.badge && simsMeta.badge !== "Sanctuary"
            ? simsMeta.badge
            : activeGameSchema?.display_name || "The Sims 4",
        language: simsMeta?.lang || "English",
        name: simsMeta?.name || cleanName(t("lang_sims", "Simlish")),
      };
    }

    const meta = lexiconMeta?.find((m: any) => m.id === code);
    if (meta) {
      let badge = meta.badge || "Community";
      const state = useStore.getState();

      if (
        badge === "Sanctuary" &&
        (state.activeGameSchema?.display_name || state.activeGameSchema?.name)
      ) {
        badge =
          state.activeGameSchema.display_name || state.activeGameSchema.name;
      }
      return {
        community: badge,
        language: meta.lang || "English",
        name: meta.name || registry?.[code]?._meta_name || code,
      };
    }

    return {
      community:
        registry?.[code]?._meta_badge ||
        activeGameSchema?.display_name ||
        "Custom",
      language: registry?.[code]?._meta_lang || dbLanguages[code] || "English",
      name: registry?.[code]?._meta_name || code,
    };
  };

  const coreCodes = isSimsGame
    ? ["en-sanctuary", "en-default", "en-sims"]
    : ["en-sanctuary", "en-default"];
  const dbCodes =
    lexiconMeta && lexiconMeta.length > 0
      ? lexiconMeta.map((m: any) => m.id)
      : [];
  const allLexiconCodes = Array.from(
    new Set([...coreCodes, ...dbCodes, ...Object.keys(registry || {})])
  ).filter(
    (code) =>
      isSimsGame ||
      activeLang === code ||
      (code !== "en-sims" && code !== "Simlish")
  );
  const uniqueLanguages = Array.from(
    new Set(allLexiconCodes.map((code) => getLexiconMetadata(code).language))
  );
  const uniqueCommunities = Array.from(
    new Set(allLexiconCodes.map((code) => getLexiconMetadata(code).community))
  );

  const toggleFavoriteLexicon = (code: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    let updated;
    if (favoriteLexicons.includes(code)) {
      updated = favoriteLexicons.filter((c: string) => c !== code);
    } else {
      updated = [...favoriteLexicons, code];
    }
    setFavoriteLexicons(updated);
    localStorage.setItem(
      "sanctuary_favorite_lexicons",
      JSON.stringify(updated)
    );
  };

  const handleImportLexicon = async () => {
    try {
      const selected = await open({
        filters: [{ name: "Lexicon", extensions: ["json"] }],
      });
      if (!selected) return;
      const content = await readTextFile(selected as string);
      const langCode = prompt(t("prompt_lang_code", "Language code:")) || "custom";
      importLexicon(JSON.parse(content), langCode);
    } catch (err) {
      useStore
        .getState()
        .pushStatus(`${t("alert_lexicon_failed", "{Lexicon} Import Failed:")}${err}`);
    }
  };

  const renderLexiconCard = (code: string) => {
    const meta = getLexiconMetadata(code);
    const isActive = activeLang === code;
    const isFav = favoriteLexicons.includes(code);
    const canDelete =
      lexiconMeta &&
      lexiconMeta.find((m: any) => m.id === code) === undefined &&
      !["en-sanctuary", "en-default", "en-sims", "Simlish"].includes(code);

    return (
      <UniversalCard
        key={code}
        layout="vertical"
        isActive={isActive}
        onClick={() => setActiveLang(code)}
        title={
          <span className={isActive ? "text-[var(--accent)]" : ""}>
            {meta.name}
          </span>
        }
        subtitle={`${meta.community} • ${meta.language}`}
        customIcon={
          <DynamicLexiconPreviewBanner
            data={{
              id: code,
              name: meta.name,
              language: meta.language,
              badge: meta.community,
              json_data: registry?.[code],
            }}
            heightClass="h-full"
          />
        }
        imageOverlay={
          <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between gap-2 z-20">
            <div className="flex items-center gap-1.5">
              {isActive && (
                <span className={`${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--accent)_45%,transparent)]`}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {t("icon_check_circle", "check_circle")}
                  </span>
                  <span>{t("selected", "Selected")}</span>
                </span>
              )}
            </div>
            <div
              className="flex items-center gap-1 opacity-90 group-hover/card:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavoriteLexicon(code, e);
                }}
                className={`relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_35%,transparent)] cursor-pointer shadow-sm ${
                  isFav
                    ? "text-[var(--accent)] border-[var(--accent)]"
                    : "text-[var(--subtext)] hover:text-[var(--text)]"
                }`}
              >
                <span
                  className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0",
                  }}
                >
                  {t("icon_star", "star")}
                </span>
                <HoverTooltip title={t("favorite", "Favorite")} variant="accent" vAlign="bottom" />
              </button>

              {canDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirmDelete === code) {
                      deleteLexicon(code);
                      setConfirmDelete(false);
                    } else {
                      setConfirmDelete(code);
                    }
                  }}
                  onMouseLeave={() => setConfirmDelete(false)}
                  className={`relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] cursor-pointer shadow-sm ${
                    confirmDelete === code
                      ? "border-[var(--danger)] text-[var(--danger)] scale-105"
                      : "hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] theme-text-danger"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    {confirmDelete === code
                      ? t("icon_warning", "warning")
                      : t("icon_delete", "delete")}
                  </span>
                  <HoverTooltip title={t("delete", "Delete")} variant="danger" vAlign="bottom" />
                </button>
              )}
            </div>
          </div>
        }
        badges={
          <>
            {isActive && (
              <div className="px-2.5 py-1 rounded-lg bg-transparent border border-[var(--accent)] text-[9px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5 shrink-0">
                <span
                  className="material-symbols-outlined !text-[12px] text-[var(--accent)]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {t("icon_check_circle", "check_circle")}
                </span>
                <span>{t("selected", "Selected")}</span>
              </div>
            )}
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_public", "public")}
              </span>
              <span>{meta.community}</span>
            </div>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                {t("icon_language", "language")}
              </span>
              <span>{meta.language}</span>
            </div>
          </>
        }
      />
    );
  };

  const activeMeta = getLexiconMetadata(activeLang);

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("lexicon_title", "{Lexicon} Library")}
      subtitle={t(
        "lexicon_desc",
        "Select your interface language and thematic terminology."
      )}
      icon={t("icon_language", "language")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-full md:w-[820px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_explore", "explore")}
            tooltip={t("tab_nexus", "{Nexus}")}
            onClick={() => {
              setMarketTab("LEXICONS");
              setView("nexus");
              onClose();
            }}
          />
          <PanelHeaderButton
            icon={t("icon_download", "download")}
            tooltip={t("btn_import", "Import")}
            onClick={handleImportLexicon}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_language", "language")}
          overline={t("lexicon_title", "{Lexicon} Library")}
          title={activeMeta.name}
          description={t(
            "lexicon_desc",
            "Select your interface language and thematic terminology."
          )}
          badge={activeMeta.community}
          badgeIcon={t("icon_translate", "translate")}
          variant="accent"
        />

        <ActionPill
          searchQuery={lexiconSearch}
          setSearchQuery={setLexiconSearch}
          searchPlaceholder={t("ui_search_lexicons", "Search {Lexicons}...")}
          primaryPopover={{
            icon: t("icon_tune", "tune"),
            label: t("filters", "Filters"),
            content: (
              <div className="flex flex-col gap-4 w-[280px] p-2">
                <div
                  onClick={() => setUseGlobalLexicon(!useGlobalLexicon)}
                  className="flex items-center justify-between px-4 glass-surface h-12 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] cursor-pointer transition-all w-full group"
                >
                  <div className="flex flex-col gap-1 pr-2">
                    <span className="text-[10px] font-black tracking-widest uppercase text-[var(--text)]">
                      {useGlobalLexicon
                        ? t("scope_global", "Global Network")
                        : t("scope_workspace", "Local Workspace")}
                    </span>
                    <span className="text-[8px] text-[var(--subtext)] opacity-70 leading-tight">
                      {useGlobalLexicon
                        ? t(
                            "scope_global_desc",
                            "Search all connected communities"
                          )
                        : t("scope_workspace_desc_lexicon", "This {lexicon} is bound only to the active environment.")}
                    </span>
                  </div>
                  <div
                    className={`sa-glass-toggle shrink-0 ${
                      useGlobalLexicon ? "is-on" : ""
                    }`}
                  >
                    <div className="sa-glass-toggle-thumb" />
                  </div>
                </div>

                <div
                  onClick={() => setAutoTranslateDynamic(!autoTranslateDynamic)}
                  className="flex items-center justify-between px-4 glass-surface h-12 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] cursor-pointer transition-all w-full group"
                >
                  <div className="flex flex-col gap-1 pr-2">
                    <span className="text-[10px] font-black tracking-widest uppercase text-[var(--text)]">
                      {t("lex_dynamic_translate_title", "Dynamic {Dispatch} Translation")}
                    </span>
                    <span className="text-[8px] text-[var(--subtext)] opacity-70 leading-tight">
                      {t("lex_dynamic_translate_desc", "Auto-translate database {dispatches}, comments, and {mod} descriptions.")}
                    </span>
                  </div>
                  <div
                    className={`sa-glass-toggle shrink-0 ${
                      autoTranslateDynamic ? "is-on" : ""
                    }`}
                  >
                    <div className="sa-glass-toggle-thumb" />
                  </div>
                </div>

                <div className="w-full h-10">
                  <CustomDropdown
                    className="h-full w-full text-xs"
                    value={selectedLibraryLang}
                    options={[
                      {
                        id: null,
                        label: t("all_languages", "All Languages") as string,
                      },
                      ...uniqueLanguages.map((lang) => ({
                        id: lang,
                        label: lang,
                      })),
                    ]}
                    onChange={(val: any) =>
                      setSelectedLibraryLang(val?.[0] ?? null)
                    }
                    placeholder={t("all_languages", "All Languages") as string}
                  />
                </div>

                <div className="w-full h-10">
                  <CustomDropdown
                    className="h-full w-full text-xs"
                    value={selectedLibraryCommunity}
                    options={[
                      { id: null, label: t("filter_all", "All") },
                      ...uniqueCommunities.map((community) => ({
                        id: community,
                        label:
                          typeof community === "string"
                            ? community.toUpperCase()
                            : community,
                      })),
                    ]}
                    onChange={(val: any) =>
                      setSelectedLibraryCommunity(val?.[0] ?? null)
                    }
                    placeholder={t("filter_all", "All")}
                  />
                </div>
              </div>
            ),
          }}
        />

        {favoriteLexicons.length > 0 && (
          <UniversalGroup
            title={t("installed_lexicons", "Favorite Lexicons")}
            icon={t("icon_keep", "keep")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {favoriteLexicons.map(renderLexiconCard)}
            </div>
          </UniversalGroup>
        )}

        <UniversalGroup
          title={t("tab_vault", "{Vault}")}
          icon={t("icon_grid_view", "grid_view")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            {allLexiconCodes
              .filter((code) => !favoriteLexicons.includes(code))
              .filter(
                (code) =>
                  !selectedLibraryLang ||
                  getLexiconMetadata(code).language === selectedLibraryLang
              )
              .filter(
                (code) =>
                  !selectedLibraryCommunity ||
                  getLexiconMetadata(code).community ===
                    selectedLibraryCommunity
              )
              .filter(
                (code) =>
                  getLexiconMetadata(code)
                    .name.toLowerCase()
                    .includes(lexiconSearch.toLowerCase()) ||
                  code.toLowerCase().includes(lexiconSearch.toLowerCase())
              )
              .map(renderLexiconCard)}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
