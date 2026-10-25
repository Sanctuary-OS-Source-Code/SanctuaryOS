import React from "react";
import { useLexicon } from "../../LexiconContext";
import { CustomDropdown, HoverTooltip, ModSearchDropdown } from "../../shared";
import ModStructureBuilder, { StructureNode } from "../../ModStructureBuilder";

export function ArtifactFilesTab({
  mod,
  modStem,
  isCloudMod,
  childRels,
  parentRel,
  myModCandidates,
  familyRoleFilter,
  setFamilyRoleFilter,
  familySearchFilter,
  setFamilySearchFilter,
  showParentLinkPicker,
  setShowParentLinkPicker,
  newFamilyRole,
  setNewFamilyRole,
  onSwitchMod,
  onLinkChildModule,
  onChangeChildRole,
  onUnlinkChildModule,
  onSetParentMod,
  onChangeParentRole,
  onUnlinkParentMod,
  structureNodes,
  onStructureChange,
  isSavingStructure,
  onSaveCloudStructure,
  showNewConfigForm,
  setShowNewConfigForm,
  newConfigNameInput,
  setNewConfigNameInput,
  newConfigExt,
  setNewConfigExt,
  onCreateAndOpenConfig,
  linkedConfigFiles,
  onOpenConfigInIde,
  onDetachConfig,
  onDeleteConfigFile,
}: {
  mod: any;
  modStem: string;
  isCloudMod: boolean;
  childRels: any[];
  parentRel: any | null;
  myModCandidates: any[];
  familyRoleFilter: "ALL" | "twin" | "addon" | "flavor" | "beta";
  setFamilyRoleFilter: (role: "ALL" | "twin" | "addon" | "flavor" | "beta") => void;
  familySearchFilter: string;
  setFamilySearchFilter: (val: string) => void;
  showParentLinkPicker: boolean;
  setShowParentLinkPicker: (val: boolean) => void;
  newFamilyRole: "twin" | "addon" | "flavor" | "beta";
  setNewFamilyRole: (role: "twin" | "addon" | "flavor" | "beta") => void;
  onSwitchMod?: (targetMod: any) => void;
  onLinkChildModule: (childMod: any, role: "twin" | "addon" | "flavor" | "beta") => Promise<void>;
  onChangeChildRole: (rel: any, newRole: "twin" | "addon" | "flavor" | "beta") => Promise<void>;
  onUnlinkChildModule: (rel: any) => Promise<void>;
  onSetParentMod: (parentCandidate: any, role: "twin" | "addon" | "flavor" | "beta") => Promise<void>;
  onChangeParentRole: (newRole: "twin" | "addon" | "flavor" | "beta") => Promise<void>;
  onUnlinkParentMod: () => Promise<void>;
  structureNodes: StructureNode[];
  onStructureChange: (nodes: StructureNode[]) => void;
  isSavingStructure: boolean;
  onSaveCloudStructure: () => Promise<void>;
  showNewConfigForm: boolean;
  setShowNewConfigForm: (val: boolean) => void;
  newConfigNameInput: string;
  setNewConfigNameInput: (val: string) => void;
  newConfigExt: string;
  setNewConfigExt: (val: string) => void;
  onCreateAndOpenConfig: () => Promise<void>;
  linkedConfigFiles: Array<{ name: string; path: string }>;
  onOpenConfigInIde: (cfg: { name: string; path: string }) => void;
  onDetachConfig: (fileName: string) => void;
  onDeleteConfigFile: (cfg: { name: string; path?: string }) => Promise<void>;
}) {
  const { t } = useLexicon();

  const filteredFamily = childRels.filter((rel) => {
    if (familyRoleFilter !== "ALL" && rel.relationship_type !== familyRoleFilter) return false;
    if (familySearchFilter.trim()) {
      const q = familySearchFilter.toLowerCase();
      return (rel.mod?.name || "").toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col gap-5 pb-8">
      {/* =========================================================
          CARD 1: MOD FAMILY (TWINS / ADD-ONS / FLAVORS / BETA)
          Always visible — never hidden behind a button or inside Mods/
         ========================================================= */}
      <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
              {t("icon_account_tree", "account_tree")}
            </span>
            <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
              {t("studio_family_links_title", "Family Modules (Twins, Addons, Flavors)")} ({childRels.length})
            </h4>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {childRels.length > 4 && (
              <div className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                <span className="material-symbols-outlined !text-[14px] text-[var(--subtext)]">
                  {t("icon_search", "search")}
                </span>
                <input
                  value={familySearchFilter}
                  onChange={(e) => setFamilySearchFilter(e.target.value)}
                  placeholder={t("filters", "Filter...")}
                  className="bg-transparent border-none outline-none text-[11px] font-bold text-[var(--text)] w-28 placeholder:text-[var(--subtext)]/60"
                />
              </div>
            )}

            {(
              [
                { id: "ALL", label: t("radar_tab_all", "All"), count: childRels.length },
                {
                  id: "twin",
                  label: t("editor_twin", "Twin"),
                  count: childRels.filter((r) => r.relationship_type === "twin").length,
                },
                {
                  id: "addon",
                  label: t("editor_addon", "Add-on"),
                  count: childRels.filter((r) => r.relationship_type === "addon").length,
                },
                {
                  id: "flavor",
                  label: t("studio_badge_flavor", "Flavor"),
                  count: childRels.filter((r) => r.relationship_type === "flavor").length,
                },
                {
                  id: "beta",
                  label: t("badge_beta", "Beta"),
                  count: childRels.filter((r) => r.relationship_type === "beta").length,
                },
              ] as const
            ).map((pill) => {
              const active = familyRoleFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setFamilyRoleFilter(pill.id)}
                  className={`h-7 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                    active
                      ? "glass-surface border border-[color-mix(in_srgb,var(--text)_22%,transparent)] text-[var(--text)]"
                      : "text-[var(--subtext)] hover:text-[var(--text)] border border-transparent"
                  }`}
                >
                  <span>{pill.label}</span>
                  <span className="opacity-60">({pill.count})</span>
                </button>
              );
            })}

            {!parentRel && (
              <button
                type="button"
                onClick={() => setShowParentLinkPicker(!showParentLinkPicker)}
                className="h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] text-[10px] font-bold text-[var(--subtext)] hover:text-[var(--text)] transition-all cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                  {t("icon_link", "link")}
                </span>
                <span>{t("studio_parent_mod_title", "Parent / Main {Mod}")}</span>
              </button>
            )}
          </div>
        </div>

        {/* Parent / Core Mod Banner */}
        {parentRel && (
          <div className="px-3.5 py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="px-2 py-0.5 rounded-md glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--accent)] shrink-0">
                {t("studio_parent_mod_title", "Parent / Main {Mod}")}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (onSwitchMod && parentRel.mod) onSwitchMod(parentRel.mod);
                }}
                className="text-xs font-bold text-[var(--text)] hover:text-[var(--accent)] truncate transition-colors cursor-pointer text-left flex items-center gap-2"
              >
                <span className="truncate">{parentRel.mod?.name || parentRel.parent_id}</span>
                {parentRel.mod?.file_extension && (
                  <span className="px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--text)_6%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[9px] font-mono font-bold text-[var(--subtext)] shrink-0">
                    {String(parentRel.mod.file_extension).startsWith(".")
                      ? String(parentRel.mod.file_extension).toLowerCase()
                      : `.${String(parentRel.mod.file_extension).toLowerCase()}`}
                  </span>
                )}
              </button>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-36">
                <CustomDropdown
                  disableTint={true}
                  className="h-8"
                  buttonClassName="!h-8 !px-2.5 !text-[11px] !rounded-lg"
                  value={parentRel.relationship_type || "addon"}
                  onChange={(val: string[]) => {
                    if (val[0]) onChangeParentRole(val[0] as any);
                  }}
                  options={[
                    { id: "twin", label: t("editor_twin", "Twin") },
                    { id: "addon", label: t("editor_addon", "Add-on") },
                    { id: "flavor", label: t("studio_badge_flavor", "Flavor") },
                    { id: "beta", label: t("badge_beta", "Beta") },
                  ]}
                />
              </div>
              <button
                type="button"
                onClick={onUnlinkParentMod}
                className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer relative group/btn"
              >
                <span className="material-symbols-outlined !text-[15px]">{t("icon_link_off", "link_off")}</span>
                <HoverTooltip title={t("nav_unlink", "Unlink")} variant="danger" />
              </button>
            </div>
          </div>
        )}

        {!parentRel && showParentLinkPicker && (
          <div className="p-3 rounded-xl bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] grid grid-cols-1 md:grid-cols-3 gap-2.5 items-center">
            <CustomDropdown
              disableTint={true}
              value={newFamilyRole}
              onChange={(val: string[]) => {
                if (val[0]) setNewFamilyRole(val[0] as any);
              }}
              options={[
                { id: "twin", label: t("editor_twin", "Script Twin") },
                { id: "addon", label: t("editor_addon", "Add-on") },
                { id: "flavor", label: t("studio_badge_flavor", "Flavor") },
                { id: "beta", label: t("badge_beta", "Beta") },
              ]}
            />
            <div className="md:col-span-2 relative z-40">
              <ModSearchDropdown
                modList={myModCandidates}
                onSelect={(selectedParent: any) => {
                  if (selectedParent) onSetParentMod(selectedParent, newFamilyRole);
                }}
                selectedItem={null}
                onClear={() => {}}
                placeholder={t("studio_select_parent_ph", "Select Parent / Main {Mod}...")}
              />
            </div>
          </div>
        )}

        {/* Always-Visible Add / Link Family Module Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 items-center relative z-30">
          <CustomDropdown
            disableTint={true}
            value={newFamilyRole}
            onChange={(val: string[]) => {
              if (val[0]) setNewFamilyRole(val[0] as any);
            }}
            options={[
              { id: "twin", label: t("editor_twin", "Script Twin") },
              { id: "addon", label: t("editor_addon", "Add-on") },
              { id: "flavor", label: t("studio_badge_flavor", "Flavor") },
              { id: "beta", label: t("badge_beta", "Beta") },
            ]}
          />
          <div className="md:col-span-2">
            <ModSearchDropdown
              modList={myModCandidates.filter(
                (m) => !childRels.some((cr) => (cr.mod?.id || cr.mod?.hash) === (m.id || m.hash))
              )}
              onSelect={(selectedMod: any) => {
                if (selectedMod) {
                  onLinkChildModule(selectedMod, newFamilyRole);
                }
              }}
              selectedItem={null}
              onClear={() => {}}
              placeholder={t("studio_family_search_ph", "Search your {mods} to link to this family...")}
            />
          </div>
        </div>

        {/* Bounded 2-Column Family List (4 full rows fit cleanly without slicing items) */}
        {filteredFamily.length === 0 ? (
          <div className="h-11 px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
            {t("studio_standalone_section_desc", "{Mods} without linked addons, twins, or flavors.")}
          </div>
        ) : (
          <div className="max-h-[204px] overflow-y-auto custom-scrollbar p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 md:grid-cols-2 gap-2 content-start">
            {filteredFamily.map((rel) => (
              <div
                key={rel.id}
                className="h-10 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-2"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (onSwitchMod && rel.mod) onSwitchMod(rel.mod);
                  }}
                  className="text-xs font-bold text-[var(--text)] hover:text-[var(--accent)] truncate transition-colors text-left flex-1 min-w-0 cursor-pointer flex items-center gap-1.5"
                >
                  <span className="truncate">
                    {(rel.mod?.name || "Module").split(/[\\/]/).pop()}
                  </span>
                  {rel.mod?.file_extension && (
                    <span className="px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--text)_6%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[9px] font-mono font-bold text-[var(--subtext)] shrink-0">
                      {String(rel.mod.file_extension).startsWith(".")
                        ? String(rel.mod.file_extension).toLowerCase()
                        : `.${String(rel.mod.file_extension).toLowerCase()}`}
                    </span>
                  )}
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-28">
                    <CustomDropdown
                      disableTint={true}
                      className="h-7"
                      buttonClassName="!h-7 !px-2 !text-[10px] !rounded-lg"
                      value={rel.relationship_type || "addon"}
                      onChange={(val: string[]) => {
                        if (val[0]) onChangeChildRole(rel, val[0] as any);
                      }}
                      options={[
                        { id: "twin", label: t("editor_twin", "Twin") },
                        { id: "addon", label: t("editor_addon", "Add-on") },
                        { id: "flavor", label: t("studio_badge_flavor", "Flavor") },
                        { id: "beta", label: t("badge_beta", "Beta") },
                      ]}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onUnlinkChildModule(rel)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0 relative group/btn"
                  >
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_link_off", "link_off")}
                    </span>
                    <HoverTooltip title={t("nav_unlink", "Unlink")} variant="danger" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =========================================================
          CARD 2: FOLDER STRUCTURE (Mods/) & CONFIG FILES (IDE)
          Pure Folder Structure & Configs — No Family Logic Mixed In
         ========================================================= */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--text)]">
            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
              {t("icon_folder_open", "folder_open")}
            </span>
            <span>{t("studio_structure_section_title", "Install Folder Layout ({Mods}/)")}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNewConfigForm(!showNewConfigForm)}
              className="h-9 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                {showNewConfigForm ? t("icon_close", "close") : t("icon_code", "code")}
              </span>
              {showNewConfigForm
                ? t("btn_cancel", "Cancel")
                : t("studio_configs_btn_new", "New Config File")}
            </button>

            {isCloudMod && (
              <button
                type="button"
                disabled={isSavingStructure}
                onClick={onSaveCloudStructure}
                className="h-9 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] disabled:opacity-40 text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                  {t("icon_save", "save")}
                </span>
                {t("hub_save", "Save")}
              </button>
            )}
          </div>
        </div>

        {showNewConfigForm && (
          <div className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-wrap items-center gap-3">
            <input
              autoFocus
              value={newConfigNameInput}
              onChange={(e) => setNewConfigNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onCreateAndOpenConfig()}
              placeholder={modStem || "mod_settings"}
              className="h-12 glass-surface rounded-[var(--radius)] px-4 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex-1 min-w-[180px] outline-none focus:border-[var(--accent)]"
            />
            <div className="w-32">
              <CustomDropdown
                disableTint={true}
                value={newConfigExt}
                onChange={(val: string[]) => {
                  if (val[0]) setNewConfigExt(val[0]);
                }}
                options={[
                  { id: ".cfg", label: ".cfg" },
                  { id: ".ini", label: ".ini" },
                  { id: ".json", label: ".json" },
                  { id: ".xml", label: ".xml" },
                  { id: ".txt", label: ".txt" },
                ]}
              />
            </div>
            <button
              type="button"
              onClick={onCreateAndOpenConfig}
              className="h-12 px-4 rounded-[var(--radius)] glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                {t("icon_code", "code")}
              </span>
              {t("studio_configs_btn_open_ide", "Edit in IDE")}
            </button>
          </div>
        )}

        <ModStructureBuilder
          structure={structureNodes}
          onChange={onStructureChange}
          targetMod={mod}
          parentRel={parentRel}
          childRels={childRels}
          configFiles={linkedConfigFiles}
          onOpenConfigInIde={onOpenConfigInIde}
          onDetachConfig={onDetachConfig}
          onDeleteConfigFile={onDeleteConfigFile}
        />
      </div>
    </div>
  );
}

