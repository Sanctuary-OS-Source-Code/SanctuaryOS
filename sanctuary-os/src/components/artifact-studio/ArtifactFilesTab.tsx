import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import {
  CustomDropdown,
  HoverTooltip,
  ModSearchDropdown,
  openModDossier,
  isScriptExtension,
  VAULT_CHIP_CLASS,
} from "../../shared";
import ModStructureBuilder, { StructureNode } from "../../ModStructureBuilder";

function getFamilyStatusMeta(status: any, t: (k: string, f: string) => string) {
  const s = String(status || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .trim();
  if (!s || s === "stable" || s === "verified" || s === "approved") return null;
  if (s === "corrupted" || s === "broken") {
    return {
      label: t("status_corrupted", "Corrupted"),
      icon: t("icon_error", "error"),
      iconColor: "text-[var(--danger)]",
    };
  }
  if (s === "unstable") {
    return {
      label: t("label_unstable", "Unstable"),
      icon: t("icon_warning", "warning"),
      iconColor: "text-[var(--warning)]",
    };
  }
  if (s === "under review" || s === "pending") {
    return {
      label: s === "pending" ? t("pending", "Pending") : t("status_dd_review", "Under Review"),
      icon: t("icon_schedule", "schedule"),
      iconColor: "text-[var(--accent)]",
    };
  }
  return null;
}

function FamilyModuleCard({
  item,
  displayName,
  roleValue,
  onInspect,
  onChangeRole,
  onUnlink,
  leadingBadge,
}: {
  item: any;
  displayName: string;
  roleValue: string;
  onInspect: () => void;
  onChangeRole: (newRole: "twin" | "addon" | "flavor" | "beta") => void;
  onUnlink: () => void;
  leadingBadge?: string;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const ext = item?.file_extension
    ? String(item.file_extension).replace(/^\./, "").toLowerCase()
    : "";
  const isScript = isScriptExtension(
    displayName || (ext ? `.${ext}` : ""),
    activeGameSchema
  );
  const joinedAuthor = Array.isArray(item?.masons)
    ? item.masons[0]?.name
    : item?.masons?.name;
  const rawAuthor = String(joinedAuthor || item?.master_author || item?.author || "").trim();
  const cleanAuthor =
    rawAuthor && !rawAuthor.toLowerCase().includes("unknown") ? rawAuthor : "";
  const rawCat = String(item?.category_override || "").trim();
  const cleanCat = rawCat && rawCat.toLowerCase() !== "unknown" ? rawCat : "";
  const rawVer = String(item?.latest_version || "").trim();
  const cleanVer =
    rawVer && !/^(v?\.?local|unknown)$/i.test(rawVer)
      ? rawVer.startsWith("v")
        ? rawVer
        : `v${rawVer}`
      : "";
  const statusMeta = getFamilyStatusMeta(item?.status, t);
  const subtitleParts = [
    leadingBadge || "",
    cleanAuthor ? `${t("by_prefix", "By")} ${cleanAuthor}` : "",
    cleanCat,
    cleanVer,
  ].filter(Boolean);

  return (
    <div className="p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] flex items-center justify-between gap-2.5 transition-all">
      <button
        type="button"
        onClick={onInspect}
        className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer group/famcard"
      >
        <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
            {leadingBadge
              ? t("icon_account_tree", "account_tree")
              : isScript
                ? t("icon_terminal", "terminal")
                : t("icon_deployed_code", "deployed_code")}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <span className="text-xs font-bold text-[var(--text)] group-hover/famcard:text-[var(--accent)] leading-snug break-words line-clamp-2 transition-colors">
            {displayName}
          </span>
          {subtitleParts.length > 0 && (
            <span className="text-[11px] font-medium text-[var(--subtext)] opacity-80 truncate">
              {subtitleParts.join(" • ")}
            </span>
          )}
        </div>
      </button>

      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        {statusMeta && (
          <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5 !text-[10px]`}>
            <span className={`material-symbols-outlined !text-[11px] ${statusMeta.iconColor}`}>
              {statusMeta.icon}
            </span>
            <span>{statusMeta.label}</span>
          </span>
        )}
        <div className="w-28 min-w-0">
          <CustomDropdown
            disableTint={true}
            className="h-7"
            buttonClassName="!h-7 !px-2 !text-[10px] !rounded-lg"
            value={roleValue || "addon"}
            onChange={(val: string[]) => {
              if (val[0]) onChangeRole(val[0] as any);
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
          onClick={onUnlink}
          className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer shrink-0 relative group/btn"
        >
          <span className="material-symbols-outlined !text-[15px]">
            {t("icon_link_off", "link_off")}
          </span>
          <HoverTooltip title={t("nav_unlink", "Unlink")} variant="danger" />
        </button>
      </div>
    </div>
  );
}

export function ArtifactFilesTab({
  mode = "sandbox",
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
  onSwitchMod: _onSwitchMod,
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
  mode?: "sandbox" | "registry";
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
    const role = String(rel.relationship_type || "addon").toLowerCase();
    if (familyRoleFilter !== "ALL" && role !== familyRoleFilter) return false;
    if (familySearchFilter.trim()) {
      const q = familySearchFilter.toLowerCase();
      return (
        (rel.mod?.name || "").toLowerCase().includes(q) ||
        (rel.mod?.master_author || "").toLowerCase().includes(q) ||
        (rel.mod?.category_override || "").toLowerCase().includes(q)
      );
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
                { id: "ALL", label: t("all", "All"), count: childRels.length },
                {
                  id: "twin",
                  label: t("editor_twin", "Twin"),
                  count: childRels.filter((r) => String(r.relationship_type || "").toLowerCase() === "twin").length,
                },
                {
                  id: "addon",
                  label: t("editor_addon", "Add-on"),
                  count: childRels.filter((r) => String(r.relationship_type || "addon").toLowerCase() === "addon").length,
                },
                {
                  id: "flavor",
                  label: t("studio_badge_flavor", "Flavor"),
                  count: childRels.filter((r) => String(r.relationship_type || "").toLowerCase() === "flavor").length,
                },
                {
                  id: "beta",
                  label: t("badge_beta", "Beta"),
                  count: childRels.filter((r) => String(r.relationship_type || "").toLowerCase() === "beta").length,
                },
              ] as const
            ).map((pill) => {
              const active = familyRoleFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setFamilyRoleFilter(pill.id)}
                  className={`h-7 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${active
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
        {parentRel && (() => {
          const pMod = parentRel.mod || (parentRel.parent_id ? { id: parentRel.parent_id } : null);
          return (
            <FamilyModuleCard
              item={parentRel.mod || pMod}
              displayName={parentRel.mod?.name || parentRel.parent_id}
              roleValue={parentRel.relationship_type || "addon"}
              leadingBadge={t("studio_parent_mod_title", "Parent / Main {Mod}")}
              onInspect={() => {
                if (pMod) openModDossier({ ...pMod, isNexusView: true });
              }}
              onChangeRole={(newRole) => onChangeParentRole(newRole)}
              onUnlink={onUnlinkParentMod}
            />
          );
        })()}

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
                onClear={() => { }}
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
              onClear={() => { }}
              placeholder={t("studio_family_search_ph", "Search your {mods} to link to this family...")}
            />
          </div>
        </div>

        {/* Bounded 2-Column Family List */}
        {filteredFamily.length === 0 ? (
          <div className="h-11 px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
            {t("studio_standalone_section_desc", "{Mods} without linked addons, twins, or flavors.")}
          </div>
        ) : (
          <div className="md:max-h-[280px] md:overflow-y-auto custom-scrollbar p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 md:grid-cols-2 gap-2.5 content-start">
            {filteredFamily.map((rel) => {
              const target = rel.mod || (rel.child_id ? { id: rel.child_id } : null);
              return (
                <FamilyModuleCard
                  key={rel.id}
                  item={rel.mod || target}
                  displayName={(rel.mod?.name || t("module", "Module")).split(/[\\/]/).pop() || ""}
                  roleValue={rel.relationship_type || "addon"}
                  onInspect={() => {
                    if (target) openModDossier({ ...target, isNexusView: true });
                  }}
                  onChangeRole={(newRole) => onChangeChildRole(rel, newRole)}
                  onUnlink={() => onUnlinkChildModule(rel)}
                />
              );
            })}
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

            {isCloudMod && mode !== "registry" && (
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
              className="h-11 glass-surface rounded-xl px-4 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex-1 min-w-[180px] outline-none focus:border-[var(--accent)]"
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
              className="h-11 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
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

