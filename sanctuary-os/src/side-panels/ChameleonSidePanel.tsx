import { useState } from "react";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import { useStore } from "../store";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  CustomDropdown,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionPill,
} from "../shared";
import { ChameleonEditorPanel } from "../side-panels/ChameleonEditorPanel";
import { ThemeCard } from "../chameleon-components/ThemeCard";
import {
  getLuminance,
  exportThemeWithAssets,
  importThemeWithAssets,
} from "../chameleon-components/ChameleonShared";

export default function ChameleonSidePanel({ config, isOpen, onClose }: any) {
  const { t } = useLexicon();
  const {
    activeThemeId,
    setActiveThemeId,
    CORE_THEMES,
    customThemes,
    gameThemes,
    renameTheme,
    createNewTheme,
    importTheme,
    updateActiveTheme,
    deleteTheme,
    useGlobalTheme,
    setUseGlobalTheme,
  } = useTheme();
  const setView = useStore((state) => state.setView);
  const setMarketTab = useStore((state) => state.setMarketTab);

  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | false>(false);
  const [newThemeName, setNewThemeName] = useState("");

  const [themeSearch, setThemeSearch] = useState("");
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(
    null
  );
  const [selectedMode, setSelectedMode] = useState<string | null>(null);

  const [favoriteThemes, setFavoriteThemes] = useState<string[]>(() =>
    JSON.parse(
      localStorage.getItem("sanctuary_favorite_themes") ||
        '["architect", "sims4", "radiant"]'
    )
  );

  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const toggleFavoriteTheme = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    let updated;
    if (favoriteThemes.includes(id)) {
      updated = favoriteThemes.filter((c: string) => c !== id);
    } else {
      updated = [...favoriteThemes, id];
    }
    setFavoriteThemes(updated);
    localStorage.setItem("sanctuary_favorite_themes", JSON.stringify(updated));
  };

  const handleExportTheme = async (e: React.MouseEvent, themeObj: any) => {
    e.stopPropagation();
    await exportThemeWithAssets(themeObj, {
      vaultPath: config?.vault_path,
      t,
      pushStatus: useStore.getState().pushStatus,
    });
  };

  const handleImportTheme = async () => {
    const res = await importThemeWithAssets({
      t,
      pushStatus: useStore.getState().pushStatus,
    });
    if (res?.theme) {
      importTheme(res.theme);
    } else if (res?.imageOnlyDataUrl) {
      updateActiveTheme({ bgImage: res.imageOnlyDataUrl });
    }
  };

  const getThemeBadge = (id: string, data: any) => {
    if (data.badgeKey) {
      return t(data.badgeKey, "Community");
    }
    if (data.badge) {
      return data.badge;
    }
    if (CORE_THEMES[id]) {
      return t("badge_sanctuary", "Sanctuary");
    }
    return t("badge_custom", "Custom");
  };

  const getThemeMode = (data: any) => {
    return getLuminance(data.bg) < 0.5
      ? t("mode_dark", "Dark")
      : t("mode_light", "Light");
  };

  const handleEditClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setActiveThemeId(id);
    setIsEditorOpen(true);
  };

  const allThemes: Record<string, any> = {
    ...CORE_THEMES,
    ...(gameThemes || {}),
    ...customThemes,
  };
  const allThemeIds = Object.keys(allThemes);

  const uniqueCommunities = Array.from(
    new Set(allThemeIds.map((id) => getThemeBadge(id, allThemes[id])))
  );
  const uniqueModes = [t("mode_dark", "Dark"), t("mode_light", "Light")];

  const renderThemeCard = (id: string) => {
    const data = allThemes[id];
    if (!data) return null;
    const isFav = favoriteThemes.includes(id);

    return (
      <ThemeCard
        key={id}
        id={id}
        data={data}
        isDev={false}
        isFav={isFav}
        activeThemeId={activeThemeId}
        setActiveThemeId={setActiveThemeId}
        CORE_THEMES={CORE_THEMES}
        handleOpenThemeEditor={handleEditClick}
        toggleFavoriteTheme={toggleFavoriteTheme}
        handleExportTheme={handleExportTheme}
        setNewThemeName={setNewThemeName}
        setEditingThemeId={setEditingThemeId}
        editingThemeId={editingThemeId}
        newThemeName={newThemeName}
        renameTheme={renameTheme}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        deleteTheme={deleteTheme}
      />
    );
  };

  const matchesThemeFilters = (id: string) => {
    const themeData = allThemes[id];
    if (!themeData) return false;
    if (String(themeData.name || "").toLowerCase().includes("performance")) return false;
    if (selectedCommunity && getThemeBadge(id, themeData) !== selectedCommunity) return false;
    if (selectedMode && getThemeMode(themeData) !== selectedMode) return false;
    if (themeSearch.trim()) {
      const q = themeSearch.toLowerCase().trim();
      const nameMatch = String(themeData.name || "").toLowerCase().includes(q);
      const idMatch = id.toLowerCase().includes(q);
      if (!nameMatch && !idMatch) return false;
    }
    return true;
  };

  const filteredFavoriteIds = favoriteThemes.filter(matchesThemeFilters);
  const filteredVaultIds = allThemeIds
    .filter((id) => !favoriteThemes.includes(id))
    .filter(matchesThemeFilters);

  const activeThemeObj = allThemes[activeThemeId];

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("chameleon_title", "{Chameleon} Library")}
      subtitle={t(
        "chameleon_desc",
        "Customize the visual theme and color palette."
      )}
      icon={t("icon_palette", "palette")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-full md:w-[820px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_tune", "tune")}
            tooltip={t("btn_open_theme_forge", "Open Theme Forge")}
            variant="accent"
            onClick={() => setIsEditorOpen(true)}
          />
          <PanelHeaderButton
            icon={t("icon_explore", "explore")}
            tooltip={t("tab_nexus", "{Nexus}")}
            onClick={() => {
              setMarketTab("CHAMELEONS");
              setView("nexus");
              onClose();
            }}
          />
          <PanelHeaderButton
            icon={t("icon_download", "download")}
            tooltip={t("btn_import", "Import")}
            onClick={handleImportTheme}
          />
          <PanelHeaderButton
            icon={t("icon_add", "add")}
            tooltip={t("btn_create_theme", "Create Theme")}
            onClick={() => {
              createNewTheme();
              setIsEditorOpen(true);
            }}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_palette", "palette")}
          overline={t("chameleon_title", "{Chameleon} Library")}
          title={activeThemeObj?.name || activeThemeId}
          description={t(
            "chameleon_desc",
            "Customize the visual theme and color palette."
          )}
          badge={
            activeThemeObj
              ? getThemeMode(activeThemeObj)
              : t("mode_dark", "Dark")
          }
          badgeIcon={t("icon_auto_awesome", "auto_awesome")}
          variant="accent"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <div className="flex items-center gap-1.5">
              {[
                activeThemeObj?.bg || "#000000",
                activeThemeObj?.sidebar || "#050914",
                activeThemeObj?.accent || "#38bdf8",
                activeThemeObj?.text || "#f8fafc",
                activeThemeObj?.success || "#10b981",
              ].map((hex, idx) => (
                <span
                  key={idx}
                  className="w-3.5 h-3.5 rounded-full border border-white/30 shadow-xs"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditorOpen(true)}
                className="px-3 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[14px]">
                  {t("icon_tune", "tune")}
                </span>
                <span>{t("btn_open_theme_forge", "Open Theme Forge")}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  createNewTheme();
                  setIsEditorOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_35%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                  {t("icon_add", "add")}
                </span>
                <span>{t("btn_create_theme", "Create Theme")}</span>
              </button>
            </div>
          </div>
        </SidePanelHeroCard>

        <ActionPill
          searchQuery={themeSearch}
          setSearchQuery={setThemeSearch}
          searchPlaceholder={t("ui_search_chameleons", "Search {Chameleons}...")}
          primaryPopover={{
            icon: t("icon_tune", "tune"),
            label: t("filters", "Filters"),
            content: (
              <div className="flex flex-col gap-4 w-[280px] p-2">
                <div
                  onClick={() => setUseGlobalTheme(!useGlobalTheme)}
                  className="flex items-center justify-between px-4 glass-surface h-12 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] cursor-pointer transition-all w-full group"
                >
                  <div className="flex flex-col gap-1 pr-2">
                    <span className="text-[10px] font-black tracking-widest uppercase text-[var(--text)]">
                      {useGlobalTheme
                        ? t("scope_global", "Global Network")
                        : t("scope_workspace", "Local Workspace")}
                    </span>
                    <span className="text-[8px] text-[var(--subtext)] opacity-70 leading-tight">
                      {useGlobalTheme
                        ? t(
                            "scope_global_desc",
                            "Search all connected communities"
                          )
                        : t(
                            "scope_workspace_desc_theme",
                            "Bound to the active workspace"
                          )}
                    </span>
                  </div>
                  <div
                    className={`sa-glass-toggle ${useGlobalTheme ? "is-on" : ""}`}
                  >
                    <div className="sa-glass-toggle-thumb" />
                  </div>
                </div>

                <div className="w-full h-10">
                  <CustomDropdown
                    className="h-full w-full text-xs"
                    value={selectedCommunity}
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
                      setSelectedCommunity(val?.[0] ?? null)
                    }
                    placeholder={t("filter_all", "All")}
                  />
                </div>

                <div className="w-full h-10">
                  <CustomDropdown
                    className="h-full w-full text-xs"
                    value={selectedMode}
                    options={[
                      { id: null, label: t("filter_all", "All") },
                      ...uniqueModes.map((mode) => ({
                        id: mode,
                        label:
                          typeof mode === "string" ? mode.toUpperCase() : mode,
                      })),
                    ]}
                    onChange={(val: any) => setSelectedMode(val?.[0] ?? null)}
                    placeholder={t("filter_all", "All")}
                  />
                </div>
              </div>
            ),
          }}
        />

        {filteredFavoriteIds.length > 0 && (
          <UniversalGroup
            title={t("installed_themes", "Installed {Chameleons}")}
            icon={t("icon_keep", "keep")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredFavoriteIds.map(renderThemeCard)}
            </div>
          </UniversalGroup>
        )}

        <UniversalGroup
          title={t("tab_vault", "{Vault}")}
          icon={t("icon_grid_view", "grid_view")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
            {filteredVaultIds.map(renderThemeCard)}
          </div>
        </UniversalGroup>

        <ChameleonEditorPanel
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
        />
      </div>
    </SidePanel>
  );
}
