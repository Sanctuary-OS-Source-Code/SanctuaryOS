import {
  ActionButton,
  CustomDropdown,
  HoverTooltip,
} from "../../shared";
import { UniversalGroup } from "../../components/universal/UniversalLayout";
import { GlassNumberInput, StringListBuilder, TwinExtensionGroupsBuilder, KeyValueMapBuilder, SchemaToggleRow } from "./SchemaStudioPrimitives";

export function SchemaIdentityAndRoutingTabs({
  t,
  activeTab,
  parsedSchema,
  commitSchema,
  updateField,
  updateNestedField,
  pathsObj,
  extObj,
  constraintsObj,
  versionExtObj,
  externalToolsArr,
  routesArr,
}: any) {
  return (
    <>
      {activeTab === "identity_paths" && (
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
          <UniversalGroup
            title={t("schema_studio_sec_identity", "Identity & Core")}
            icon={t("icon_badge", "badge")}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full">
              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_id", "Schema ID")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.id ?? ""}
                  onChange={(e) => updateField("id", e.target.value)}
                  placeholder={t("ph_schema_id", "e.g. custom_engine")}
                  className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_game_id", "Game ID")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.game_id ?? ""}
                  onChange={(e) => updateField("game_id", e.target.value)}
                  placeholder={t("ph_schema_id", "e.g. custom_engine")}
                  className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_display_name", "Display Title")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.display_name ?? parsedSchema.name ?? ""}
                  onChange={(e) => {
                    const next: Record<string, any> = {
                      ...parsedSchema,
                      display_name: e.target.value,
                    };
                    delete next.name;
                    commitSchema(next);
                  }}
                  placeholder={t("ph_game_name", "e.g. My Community Game")}
                  className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_default_lexicon", "Default {Lexicon} Pack")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.default_lexicon ?? "en-default"}
                  onChange={(e) => updateField("default_lexicon", e.target.value)}
                  placeholder="en-default"
                  className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_version", "Schema Version")}
                </label>
                <GlassNumberInput
                  value={parsedSchema.schema_version ?? 2}
                  min={1}
                  onChange={(val) => updateField("schema_version", val)}
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_steam_app_id", "Steam AppID (Proton / SteamOS)")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.steam_app_id ?? ""}
                  onChange={(e) => updateField("steam_app_id", e.target.value || null)}
                  placeholder={t("schema_studio_ph_steam_app_id", "e.g. 100000")}
                  className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_min_scout", "Min Scout Submissions")}
                </label>
                <GlassNumberInput
                  value={parsedSchema.min_scout_submissions ?? 3}
                  min={1}
                  onChange={(val) => updateField("min_scout_submissions", val)}
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0 @[780px]:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_install_folders", "Storefront Install Folder Names")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(parsedSchema.install_folder_names)
                      ? parsedSchema.install_folder_names
                      : []
                  }
                  onChange={(next) => updateField("install_folder_names", next)}
                  placeholder={t("schema_studio_ph_install_folders", "e.g. Game Title Directory")}
                  addButtonLabel={t("add", "Add")}
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_gog_app_ids", "GOG Galaxy App IDs")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(parsedSchema.gog_app_ids)
                      ? parsedSchema.gog_app_ids
                      : []
                  }
                  onChange={(next) => updateField("gog_app_ids", next)}
                  placeholder={t("schema_studio_ph_gog_app_ids", "e.g. 1456460669")}
                  addButtonLabel={t("add", "Add")}
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_epic_app_names", "Epic / Heroic App Names")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(parsedSchema.epic_app_names)
                      ? parsedSchema.epic_app_names
                      : []
                  }
                  onChange={(next) => updateField("epic_app_names", next)}
                  placeholder={t("schema_studio_ph_epic_app_names", "e.g. AppName or CatalogItemId")}
                  addButtonLabel={t("add", "Add")}
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_ea_content_ids", "EA App Content IDs")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(parsedSchema.ea_content_ids)
                      ? parsedSchema.ea_content_ids
                      : []
                  }
                  onChange={(next) => updateField("ea_content_ids", next)}
                  placeholder={t("schema_studio_ph_ea_content_ids", "e.g. OFB-EAST:109552299")}
                  addButtonLabel={t("add", "Add")}
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_xbox_store_ids", "Xbox / MS Store IDs")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(parsedSchema.xbox_store_ids)
                      ? parsedSchema.xbox_store_ids
                      : []
                  }
                  onChange={(next) => updateField("xbox_store_ids", next)}
                  placeholder={t("schema_studio_ph_xbox_store_ids", "e.g. 9N...StoreId")}
                  addButtonLabel={t("add", "Add")}
                />
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("schema_studio_sec_paths", "Executables & Paths")}
            icon={t("icon_folder_open", "folder_open")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_exe_list", "Game Executables")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(parsedSchema.executable_names)
                      ? parsedSchema.executable_names
                      : []
                  }
                  onChange={(next) => updateField("executable_names", next)}
                  placeholder={t(
                    "schema_studio_ph_exe_names",
                    "e.g. GameLauncher.exe / ExampleGame.app"
                  )}
                  addButtonLabel={t("add", "Add")}
                />
              </div>

              <div className="grid grid-cols-1 @[780px]:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_exe_subdir", "Executable Subfolder")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.executable_subdir ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "executable_subdir", e.target.value)
                    }
                    placeholder={t("schema_studio_ph_exe_subdir", "e.g. bin/x64 (Blank = Root)")}
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_manifest_file", "Engine Manifest File")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.manifest_file ?? ""}
                    onChange={(e) => updateNestedField("paths", "manifest_file", e.target.value)}
                    placeholder={t(
                      "schema_studio_ph_manifest_file",
                      "load_manifest.cfg / loadorder.txt / (Blank = None)"
                    )}
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_win_mod_dir", "Default Windows {Mods} Directory")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.default_mod_dir_windows ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "default_mod_dir_windows", e.target.value)
                    }
                    placeholder="%USERPROFILE%/Documents/..."
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_mac_mod_dir", "Default macOS {Mods} Directory")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.default_mod_dir_mac ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "default_mod_dir_mac", e.target.value)
                    }
                    placeholder="~/Documents/..."
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_linux_mod_dir", "Default Linux / Proton {Mods} Directory")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.default_mod_dir_linux ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "default_mod_dir_linux", e.target.value)
                    }
                    placeholder="%USERPROFILE%/Documents/... or ~/.steam/steam/..."
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_user_data_win", "Windows Saves & Data Folder")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.user_data_dir_windows ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "user_data_dir_windows", e.target.value)
                    }
                    placeholder="%USERPROFILE%/Documents/My Games/..."
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_user_data_mac", "macOS Saves & Data Folder")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.user_data_dir_mac ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "user_data_dir_mac", e.target.value)
                    }
                    placeholder="~/Documents/..."
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_user_data_linux", "Linux / Proton User Data / Saves Root")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.user_data_dir_linux ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "user_data_dir_linux", e.target.value)
                    }
                    placeholder="%USERPROFILE%/Documents/... (Auto-maps to Proton pfx)"
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 @[920px]:grid-cols-3 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_auto_scan_win", "Windows Auto-Discovery Paths")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(pathsObj.auto_scan_paths_windows)
                        ? pathsObj.auto_scan_paths_windows
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("paths", "auto_scan_paths_windows", next)
                    }
                    placeholder="C:/Program Files (x86)/Steam/steamapps/common/..."
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_auto_scan_mac", "macOS Auto-Discovery Paths")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(pathsObj.auto_scan_paths_mac)
                        ? pathsObj.auto_scan_paths_mac
                        : []
                    }
                    onChange={(next) => updateNestedField("paths", "auto_scan_paths_mac", next)}
                    placeholder="/Applications/..."
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_auto_scan_linux", "Linux / SteamOS Auto-Discovery Paths")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(pathsObj.auto_scan_paths_linux)
                        ? pathsObj.auto_scan_paths_linux
                        : []
                    }
                    onChange={(next) => updateNestedField("paths", "auto_scan_paths_linux", next)}
                    placeholder="~/.steam/steam/steamapps/common/..."
                    addButtonLabel={t("add", "Add")}
                  />
                </div>
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={`${t(
              "schema_studio_sec_external_tools",
              "External Launchers & Script Extenders"
            )} (${externalToolsArr.length})`}
            icon={t("icon_rocket_launch", "rocket_launch")}
            headerAction={
              <ActionButton
                variant="accent"
                icon={t("icon_add", "add")}
                onClick={() => {
                  const nextTool = {
                    id: `extender_${externalToolsArr.length + 1}`,
                    label: t("schema_studio_default_tool_label", "Script Extender Loader"),
                    role: "script_extender",
                    executable: "",
                    args: [],
                    auto_launch: true,
                  };
                  updateField("external_tools", [...externalToolsArr, nextTool]);
                }}
                className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("schema_studio_add_external_tool", "Add External Tool")}
              </ActionButton>
            }
          >
            <div className="flex flex-col gap-3.5 w-full">
              <p className="text-xs font-medium text-[var(--subtext)] opacity-85 leading-relaxed">
                {t(
                  "schema_studio_external_tools_desc",
                  "Register optional script extenders or companion utilities (relative to the game root). When Auto-Launch is enabled and the executable is detected on disk, Sanctuary OS boots the game through it automatically."
                )}
              </p>

              {externalToolsArr.length > 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
                  {externalToolsArr.map((tool: any, idx: any) => (
                    <div
                      key={`${tool.id || idx}-${idx}`}
                      className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-[var(--accent)] font-mono truncate">
                          {`#${idx + 1} • ${tool.id || "tool"}`}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateField(
                              "external_tools",
                              externalToolsArr.filter((_: any, i: any) => i !== idx)
                            )
                          }
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0"
                        >
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_delete", "delete")}
                          </span>
                          <HoverTooltip title={t("delete", "Delete")} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="flex flex-col gap-1 min-w-0">
                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t("schema_studio_tool_id", "Tool ID")}
                          </label>
                          <input
                            type="text"
                            value={tool.id ?? ""}
                            onChange={(e) => {
                              const next = [...externalToolsArr];
                              next[idx] = { ...tool, id: e.target.value };
                              updateField("external_tools", next);
                            }}
                            placeholder="script_extender"
                            className="h-9 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                          />
                        </div>

                        <div className="flex flex-col gap-1 min-w-0">
                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t("schema_studio_cat_label", "Display Label")}
                          </label>
                          <input
                            type="text"
                            value={tool.label ?? tool.name ?? ""}
                            onChange={(e) => {
                              const next = [...externalToolsArr];
                              next[idx] = { ...tool, label: e.target.value };
                              updateField("external_tools", next);
                            }}
                            placeholder="Script Extender Loader"
                            className="h-9 min-w-0 glass-panel rounded-xl px-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                          />
                        </div>

                        <div className="flex flex-col gap-1 min-w-0">
                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t("role", "Role")}
                          </label>
                          <CustomDropdown
                            disableTint={true}
                            value={tool.role || tool.type || "script_extender"}
                            onChange={(v: string[]) => {
                              const next = [...externalToolsArr];
                              next[idx] = { ...tool, role: v[0] || "script_extender" };
                              updateField("external_tools", next);
                            }}
                            options={[
                              {
                                id: "script_extender",
                                label: t(
                                  "schema_studio_tool_role_extender",
                                  "Script Extender / Hook Launcher"
                                ),
                              },
                              {
                                id: "utility",
                                label: t(
                                  "schema_studio_tool_role_utility",
                                  "Companion Modding Utility"
                                ),
                              },
                            ]}
                          />
                        </div>

                        <div className="flex flex-col gap-1 min-w-0">
                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t("schema_studio_tool_exe", "Executable Relative Path")}
                          </label>
                          <input
                            type="text"
                            value={tool.executable ?? tool.exe ?? tool.path ?? ""}
                            onChange={(e) => {
                              const next = [...externalToolsArr];
                              next[idx] = { ...tool, executable: e.target.value };
                              updateField("external_tools", next);
                            }}
                            placeholder="e.g. extender_loader.exe"
                            className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t("schema_studio_tool_args", "Launch Arguments (Optional)")}
                        </label>
                        <StringListBuilder
                          items={
                            Array.isArray(tool.args)
                              ? tool.args
                              : typeof tool.args === "string" && tool.args.trim()
                                ? tool.args.trim().split(/\s+/)
                                : []
                          }
                          onChange={(nextArgs) => {
                            const next = [...externalToolsArr];
                            next[idx] = { ...tool, args: nextArgs };
                            updateField("external_tools", next);
                          }}
                          placeholder="e.g. --skip-intro"
                          addButtonLabel={t("add", "Add")}
                        />
                      </div>

                      <SchemaToggleRow
                        label={t(
                          "schema_studio_tool_auto_launch",
                          "Use as Primary Game Launcher When Present"
                        )}
                        checked={Boolean(
                          tool.auto_launch ?? tool.use_as_launcher ?? tool.is_script_extender
                        )}
                        onChange={(val) => {
                          const next = [...externalToolsArr];
                          next[idx] = { ...tool, auto_launch: val };
                          updateField("external_tools", next);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("schema_studio_sec_constraints", "Engine Safeguards & Vanilla Safety")}
            icon={t("icon_shield", "shield")}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
              <SchemaToggleRow
                label={t(
                  "schema_studio_shared_vanilla",
                  "{Mods} Folder Shared With Vanilla Files"
                )}
                description={t(
                  "schema_studio_shared_vanilla_clean_desc",
                  "Protects untouched vanilla game files when deploying directly into shared engine or root directories."
                )}
                checked={Boolean(constraintsObj.mods_dir_is_shared_with_vanilla)}
                onChange={(val) =>
                  updateNestedField("constraints", "mods_dir_is_shared_with_vanilla", val)
                }
              />

              <SchemaToggleRow
                label={t("schema_studio_preserve_folders", "Preserve Archive Subfolders")}
                description={t(
                  "schema_studio_preserve_folders_clean_desc",
                  "Keeps internal archive paths (such as meshes/, textures/, plugins/, or scripts/) intact on import."
                )}
                checked={Boolean(constraintsObj.preserve_archive_folder_structure)}
                onChange={(val) =>
                  updateNestedField("constraints", "preserve_archive_folder_structure", val)
                }
              />

              <SchemaToggleRow
                label={t("schema_studio_wrap_loose", "Auto-Folder Loose {Mod} Files")}
                description={t(
                  "schema_studio_wrap_loose_desc",
                  "Organizes loose files in the {Vault} root into named folders."
                )}
                checked={Boolean(constraintsObj.wrap_loose_files_in_folders)}
                onChange={(val) =>
                  updateNestedField("constraints", "wrap_loose_files_in_folders", val)
                }
              />

              <SchemaToggleRow
                label={t("schema_studio_script_unzip", "Check Nested Script Archives")}
                description={t(
                  "schema_studio_script_unzip_desc",
                  "Flags nested script archives that must be extracted to load in-engine."
                )}
                checked={Boolean(constraintsObj.requires_script_unzipping)}
                onChange={(val) =>
                  updateNestedField("constraints", "requires_script_unzipping", val)
                }
              />

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:col-span-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_max_depth", "Max Subfolder Depth")}
                  </label>
                  <span className="text-[10px] font-medium text-[var(--subtext)] opacity-75">
                    {t(
                      "schema_studio_max_depth_hint",
                      "Set 0 for unlimited subfolder recursion, or specify a maximum folder depth limit."
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <GlassNumberInput
                    value={constraintsObj.max_folder_depth ?? 0}
                    min={0}
                    max={32}
                    onChange={(val) =>
                      updateNestedField(
                        "constraints",
                        "max_folder_depth",
                        val <= 0 ? null : val
                      )
                    }
                    className="w-[160px]"
                  />
                  {constraintsObj.max_folder_depth == null && (
                    <span className="px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--accent)]">
                      {t("schema_studio_unlimited", "Unlimited")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("schema_studio_sec_version_dlc", "Version & DLC Detection")}
            icon={t("icon_verified", "verified")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ver_method", "Version Source")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={versionExtObj.method ?? "none"}
                    onChange={(v: string[]) => {
                      const picked = v[0] || "none";
                      updateNestedField(
                        "version_extraction",
                        "method",
                        picked === "none" ? null : picked
                      );
                    }}
                    options={[
                      {
                        id: "none",
                        label: t("none", "None"),
                      },
                      {
                        id: "pe_header",
                        label: t(
                          "schema_studio_ver_method_pe",
                          "Executable Header + Text Fallback"
                        ),
                      },
                      {
                        id: "ini_key",
                        label: t("schema_studio_ver_method_ini", "INI / Config Key"),
                      },
                      {
                        id: "json_key",
                        label: t("schema_studio_ver_method_json", "JSON Property Key"),
                      },
                      {
                        id: "plain_text",
                        label: t("schema_studio_ver_method_text", "Plain Text / Version File"),
                      },
                      {
                        id: "xml_tag",
                        label: t("schema_studio_ver_method_xml", "XML / Plist Tag"),
                      },
                      {
                        id: "regex",
                        label: t("schema_studio_ver_method_regex", "Regex Capture Pattern"),
                      },
                    ]}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ver_rel_path", "Version File Path")}
                  </label>
                  <input
                    type="text"
                    value={versionExtObj.relative_path ?? ""}
                    onChange={(e) =>
                      updateNestedField("version_extraction", "relative_path", e.target.value)
                    }
                    placeholder={t("schema_studio_ph_ver_rel_path", "e.g. bin/x64/EngineVersion.ini")}
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ver_line_prefix", "Version Key Prefix")}
                  </label>
                  <input
                    type="text"
                    value={versionExtObj.line_prefix ?? ""}
                    onChange={(e) =>
                      updateNestedField("version_extraction", "line_prefix", e.target.value)
                    }
                    placeholder={t("schema_studio_ph_ver_line_prefix", "e.g. gameversion")}
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ver_json_key", "Version JSON Key Path")}
                  </label>
                  <input
                    type="text"
                    value={versionExtObj.json_key ?? ""}
                    onChange={(e) =>
                      updateNestedField(
                        "version_extraction",
                        "json_key",
                        e.target.value ? e.target.value : null
                      )
                    }
                    placeholder={t("schema_studio_ph_ver_json_key", "e.g. build.version")}
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>

                {versionExtObj.method === "xml_tag" && (
                  <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("schema_studio_ver_xml_tag", "XML / Plist Tag Name")}
                    </label>
                    <input
                      type="text"
                      value={versionExtObj.xml_tag ?? ""}
                      onChange={(e) =>
                        updateNestedField(
                          "version_extraction",
                          "xml_tag",
                          e.target.value ? e.target.value : null
                        )
                      }
                      placeholder={t("schema_studio_ph_ver_xml_tag", "e.g. AppVersion")}
                      className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                    />
                  </div>
                )}

                {versionExtObj.method === "regex" && (
                  <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("schema_studio_ver_regex", "Version Regex Pattern")}
                    </label>
                    <input
                      type="text"
                      value={versionExtObj.regex_pattern ?? ""}
                      onChange={(e) =>
                        updateNestedField(
                          "version_extraction",
                          "regex_pattern",
                          e.target.value ? e.target.value : null
                        )
                      }
                      placeholder={t("schema_studio_ph_ver_regex", "e.g. build\\s+([0-9.]+)")}
                      className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                    />
                  </div>
                )}

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0 lg:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_dlc_mask_tpl", "DLC Mask Launch Argument")}
                  </label>
                  <input
                    type="text"
                    value={parsedSchema.launch_args_dlc_mask_template ?? ""}
                    onChange={(e) =>
                      updateField(
                        "launch_args_dlc_mask_template",
                        e.target.value ? e.target.value : null
                      )
                    }
                    placeholder={t("schema_studio_ph_dlc_mask", "e.g. -disablepacks:{packs}")}
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>
              </div>

              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_ver_fallback_paths", "Fallback Version File Paths")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(versionExtObj.fallback_paths)
                      ? versionExtObj.fallback_paths
                      : []
                  }
                  onChange={(next) =>
                    updateNestedField("version_extraction", "fallback_paths", next)
                  }
                  placeholder={t(
                    "schema_studio_ph_ver_fallback",
                    "e.g. version.json or Build/Build.version"
                  )}
                  addButtonLabel={t("schema_studio_add_fallback_path", "Add Fallback Path")}
                  layout="paths"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_dlc_prefixes", "DLC Folder Prefixes")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(parsedSchema.dlc_folder_prefixes)
                        ? parsedSchema.dlc_folder_prefixes
                        : []
                    }
                    onChange={(next) => updateField("dlc_folder_prefixes", next)}
                    placeholder={t("schema_studio_ph_dlc_prefixes", "DLC_ / Expansion_")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_dlc_subdirs", "DLC Search Folders")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(parsedSchema.dlc_subdirs) ? parsedSchema.dlc_subdirs : []
                    }
                    onChange={(next) => updateField("dlc_subdirs", next)}
                    placeholder={t("schema_studio_ph_dlc_subdirs", "Data / addons / dlc")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_dlc_exts", "DLC File Extensions")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(parsedSchema.dlc_file_extensions)
                        ? parsedSchema.dlc_file_extensions
                        : []
                    }
                    onChange={(next) => updateField("dlc_file_extensions", next)}
                    placeholder={t("schema_studio_ph_dlc_exts", ".dlc / .dat")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>
              </div>
            </div>
          </UniversalGroup>
        </div>
      )}

      {/* =====================================================================
          TAB 2: EXTENSIONS, PARSERS, INSTALL ROUTES & TAXONOMY
         ===================================================================== */}
      {activeTab === "routing_ext" && (
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
          <UniversalGroup
            title={t("schema_studio_sec_extensions", "Extensions & Parsers")}
            icon={t("icon_extension", "extension")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_supported_ext", "Supported {Mod} Extensions")}
                  </label>
                  <StringListBuilder
                    items={Array.isArray(extObj.supported) ? extObj.supported : []}
                    onChange={(next) => updateNestedField("extensions", "supported", next)}
                    placeholder={t(
                      "schema_studio_ph_supported_ext",
                      ".bin / .dat / .dll / .lua / .ini"
                    )}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_vault_visible_ext", "{Vault} Visible Extensions")}
                  </label>
                  <StringListBuilder
                    items={Array.isArray(extObj.vault_visible) ? extObj.vault_visible : []}
                    onChange={(next) => updateNestedField("extensions", "vault_visible", next)}
                    placeholder={t("schema_studio_ph_vault_ext", ".bin / .dll / .ini / .json")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ext_script", "Script / Executable {Mod} Extensions")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(extObj.script_extensions) ? extObj.script_extensions : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "script_extensions", next)
                    }
                    placeholder={t("schema_studio_ph_script_exts", ".dll / .so / .lua / .py")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_archive_exts", "Archive Container Formats")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(extObj.archive_containers) ? extObj.archive_containers : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "archive_containers", next)
                    }
                    placeholder=".zip / .7z / .rar"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_config_ext", "Editable Config Extensions")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(extObj.config_extensions) ? extObj.config_extensions : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "config_extensions", next)
                    }
                    placeholder=".ini / .cfg / .json / .toml / .yaml"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t(
                      "schema_studio_editable_cfg_formats",
                      "Workbench Editable Text Formats"
                    )}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(extObj.editable_config_formats)
                        ? extObj.editable_config_formats
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "editable_config_formats", next)
                    }
                    placeholder=".cfg / .ini / .json / .toml / .yaml / .xml"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ignore_unid_ext", "Ignored Extensions")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(extObj.ignore_unidentified)
                        ? extObj.ignore_unidentified
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "ignore_unidentified", next)
                    }
                    placeholder=".txt / .md / .jpg / .png"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_root_anchors", "Archive Relative Root Anchors")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(extObj.relative_root_anchors)
                        ? extObj.relative_root_anchors
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "relative_root_anchors", next)
                    }
                    placeholder={t("schema_studio_ph_root_anchors", "Data / plugins / scripts")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>
              </div>

              <SchemaToggleRow
                label={t(
                  "schema_studio_preserve_aux_assets",
                  "Preserve Auxiliary Companion Assets"
                )}
                description={t(
                  "schema_studio_preserve_aux_assets_desc",
                  "Keeps sidecar meshes, textures, sounds, and data files bundled alongside primary {Mod} files during intake and deployment."
                )}
                checked={extObj.preserve_auxiliary_assets !== false}
                onChange={(val) =>
                  updateNestedField("extensions", "preserve_auxiliary_assets", val)
                }
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_cache_files", "Purgeable Cache Files")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={Array.isArray(extObj.cache_files) ? extObj.cache_files : []}
                    onChange={(next) => updateNestedField("extensions", "cache_files", next)}
                    placeholder={t("schema_studio_ph_cache_files", "shader_cache.bin")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_twin_exts", "Paired Twin File Extensions")}
                  </label>
                  <TwinExtensionGroupsBuilder
                    groups={
                      Array.isArray(extObj.twin_extensions) ? extObj.twin_extensions : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "twin_extensions", next)
                    }
                  />
                </div>
              </div>

              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_ext_labels", "Extension Badge Labels")}
                </label>
                <KeyValueMapBuilder
                  record={extObj.labels || {}}
                  onChange={(next) => updateNestedField("extensions", "labels", next)}
                  keyPlaceholder={t("schema_studio_ph_ext_key", ".bin / .dll")}
                  valPlaceholder={t("schema_studio_ph_ext_val", "MODULE / PLUGIN")}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_magic_bytes", "Extension Magic Byte Signatures (Hex)")}
                  </label>
                  <KeyValueMapBuilder
                    record={extObj.magic_bytes || {}}
                    onChange={(next) => updateNestedField("extensions", "magic_bytes", next)}
                    keyPlaceholder={t("schema_studio_ph_ext_key", ".bin / .dll")}
                    valPlaceholder="504B0304"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ext_parsers", "Extension Parser Bindings")}
                  </label>
                  <KeyValueMapBuilder
                    record={extObj.parsers || {}}
                    onChange={(next) => updateNestedField("extensions", "parsers", next)}
                    keyPlaceholder={t("schema_studio_ph_ext_key", ".bin / .dll")}
                    valPlaceholder="binary_chunk_index"
                  />
                </div>
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={`${t("schema_studio_sec_routes", "Install Routes")} (${routesArr.length})`}
            icon={t("icon_alt_route", "alt_route")}
            headerAction={
              <ActionButton
                variant="accent"
                icon={t("icon_add", "add")}
                onClick={() => {
                  const defaultExt = (extObj.supported && extObj.supported[0]) || ".bin";
                  const nextRoute = {
                    id: `route_${routesArr.length + 1}`,
                    label: t("schema_studio_default_route_label", "Custom Install Route"),
                    extensions: [defaultExt],
                    folder_match: "",
                    target_root: "live_path",
                    target_subdir: "",
                    preserve_vanilla: true,
                  };
                  updateField("install_routes", [...routesArr, nextRoute]);
                }}
                className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("schema_studio_add_route", "Add Install Route")}
              </ActionButton>
            }
          >
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
              {routesArr.map((route: any, idx: any) => (
                <div
                  key={`${route.id || idx}-${idx}`}
                  className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3.5 min-w-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-[var(--accent)] font-mono truncate">
                      {`#${idx + 1} • ${route.id || "route"}`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateField(
                          "install_routes",
                          routesArr.filter((_: any, i: any) => i !== idx)
                        )
                      }
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_delete", "delete")}
                      </span>
                      <HoverTooltip title={t("delete", "Delete")} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_route_id", "Route ID")}
                      </label>
                      <input
                        type="text"
                        value={route.id ?? ""}
                        onChange={(e) => {
                          const next = [...routesArr];
                          next[idx] = { ...route, id: e.target.value };
                          updateField("install_routes", next);
                        }}
                        className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_route_label", "Route Label")}
                      </label>
                      <input
                        type="text"
                        value={route.label ?? ""}
                        onChange={(e) => {
                          const next = [...routesArr];
                          next[idx] = { ...route, label: e.target.value };
                          updateField("install_routes", next);
                        }}
                        className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_route_target_root", "Target Root")}
                      </label>
                      <CustomDropdown
                        disableTint={true}
                        value={route.target_root ?? "live_path"}
                        onChange={(v: string[]) => {
                          const next = [...routesArr];
                          next[idx] = { ...route, target_root: v[0] || "live_path" };
                          updateField("install_routes", next);
                        }}
                        options={[
                          {
                            id: "live_path",
                            label: t("schema_studio_route_root_live", "Game Install Root"),
                          },
                          {
                            id: "mods_path",
                            label: t("schema_studio_route_root_mods", "Active {Mods} Folder"),
                          },
                          {
                            id: "docs_path",
                            label: t("schema_studio_route_root_docs", "User Saves & Data Root"),
                          },
                        ]}
                      />
                    </div>

                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_route_target_subdir", "Target Subfolder")}
                      </label>
                      <input
                        type="text"
                        value={route.target_subdir ?? ""}
                        onChange={(e) => {
                          const next = [...routesArr];
                          next[idx] = { ...route, target_subdir: e.target.value };
                          updateField("install_routes", next);
                        }}
                        placeholder="e.g. scripts or bin/x64/plugins (Blank = Root)"
                        className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 min-w-0">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("schema_studio_route_folder_match", "Source Folder Match")}
                    </label>
                    <input
                      type="text"
                      value={route.folder_match ?? ""}
                      onChange={(e) => {
                        const next = [...routesArr];
                        next[idx] = { ...route, folder_match: e.target.value };
                        updateField("install_routes", next);
                      }}
                      placeholder={t("schema_studio_ph_folder_match", "e.g. scripts / plugins / movies")}
                      className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 min-w-0">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("schema_studio_route_extensions", "Routed Extensions")}
                    </label>
                    <StringListBuilder
                      items={Array.isArray(route.extensions) ? route.extensions : []}
                      onChange={(nextExts) => {
                        const next = [...routesArr];
                        next[idx] = { ...route, extensions: nextExts };
                        updateField("install_routes", next);
                      }}
                      placeholder={t("schema_studio_ph_route_ext_clean", ".dll / .so / .bin / .lua")}
                      addButtonLabel={t("add", "Add")}
                    />
                  </div>

                  <SchemaToggleRow
                    label={t(
                      "schema_studio_route_preserve_vanilla",
                      "Backup & Preserve Vanilla Files"
                    )}
                    checked={route.preserve_vanilla !== false}
                    onChange={(val) => {
                      const next = [...routesArr];
                      next[idx] = { ...route, preserve_vanilla: val };
                      updateField("install_routes", next);
                    }}
                  />
                </div>
              ))}
            </div>
          </UniversalGroup>
        </div>
      )}
    </>
  );
}
