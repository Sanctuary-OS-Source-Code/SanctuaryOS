import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
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
import { getLuminance } from "../chameleon-components/ChameleonShared";

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
    try {
      const defaultPath = config?.vault_path
        ? `${config.vault_path}\\Data\\Themes\\${themeObj.name}.json`
        : `${themeObj.name}.json`;
      const path = await save({
        defaultPath,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path) await writeTextFile(path, JSON.stringify(themeObj, null, 2));
    } catch (err) {
      useStore
        .getState()
        .pushStatus(`${t("alert_export_failed", "Export failed: ")}${err}`);
    }
  };

  const handleImportTheme = async () => {
    try {
      const selected = await open({
        filters: [{ name: "Theme", extensions: ["json"] }],
      });
      if (!selected) return;
      const content = await readTextFile(selected as string);
      importTheme(JSON.parse(content));
    } catch (err) {
      useStore
        .getState()
        .pushStatus(`${t("alert_import_failed", "Import failed: ")}${err}`);
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

  const activeThemeObj = allThemes[activeThemeId];

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("chameleon_title", "Themes")}
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
            tooltip={t("tab_nexus", "Marketplace")}
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
          overline={t("chameleon_title", "Active Theme")}
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
        />

        <ActionPill
          searchQuery={themeSearch}
          setSearchQuery={setThemeSearch}
          searchPlaceholder={t("ui_search_chameleons", "Search Themes...")}
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
                    className={`w-10 h-5 shrink-0 rounded-full p-0.5 flex items-center border transition-all duration-300 ${
                      useGlobalTheme
                        ? "bg-transparent border-[var(--accent)]"
                        : "bg-transparent border-[color-mix(in_srgb,var(--text)_20%,transparent)]"
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${
                        useGlobalTheme
                          ? "bg-[var(--accent)] translate-x-[18px]"
                          : "bg-[var(--subtext)] translate-x-0"
                      }`}
                    />
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

        {favoriteThemes.length > 0 && (
          <UniversalGroup
            title={t("installed_themes", "Favorite Themes")}
            icon={t("icon_keep", "keep")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {favoriteThemes
                .filter(
                  (id) =>
                    allThemes[id] &&
                    !allThemes[id].name.toLowerCase().includes("performance")
                )
                .map(renderThemeCard)}
            </div>
          </UniversalGroup>
        )}

        <UniversalGroup
          title={t("ui_library", "Library")}
          icon={t("icon_grid_view", "grid_view")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
            {allThemeIds
              .filter((id) => !favoriteThemes.includes(id))
              .filter(
                (id) =>
                  !selectedCommunity ||
                  getThemeBadge(id, allThemes[id]) === selectedCommunity
              )
              .filter(
                (id) =>
                  !selectedMode ||
                  getThemeMode(allThemes[id]) === selectedMode
              )
              .filter(
                (id) =>
                  allThemes[id].name
                    .toLowerCase()
                    .includes(themeSearch.toLowerCase()) ||
                  id.toLowerCase().includes(themeSearch.toLowerCase())
              )
              .filter(
                (id) =>
                  !allThemes[id].name.toLowerCase().includes("performance")
              )
              .map(renderThemeCard)}
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
