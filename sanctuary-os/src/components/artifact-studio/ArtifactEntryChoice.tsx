import { useLexicon } from "../../LexiconContext";
import { CustomDropdown, ModSearchDropdown } from "../../shared";

export function ArtifactEntryChoice({
  entryLinkMode,
  setEntryLinkMode,
  entryModuleRole,
  setEntryModuleRole,
  entryTargetMod,
  setEntryTargetMod,
  myModCandidates,
  isPullingFromTarget,
  onStartNewMod,
  onPullFromExistingMod,
}: {
  entryLinkMode: "version" | "module";
  setEntryLinkMode: (mode: "version" | "module") => void;
  entryModuleRole: "twin" | "addon" | "flavor" | "beta";
  setEntryModuleRole: (role: "twin" | "addon" | "flavor" | "beta") => void;
  entryTargetMod: any | null;
  setEntryTargetMod: (mod: any | null) => void;
  myModCandidates: any[];
  isPullingFromTarget: boolean;
  onStartNewMod: () => void;
  onPullFromExistingMod: () => Promise<void>;
}) {
  const { t } = useLexicon();

  return (
    <div className="flex flex-col w-full h-full min-h-0 overflow-y-auto custom-scrollbar p-8 gap-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--accent)]">
          <span className="material-symbols-outlined !text-[24px]">{t("icon_deployed_code", "deployed_code")}</span>
        </div>
        <div className="flex flex-col">
          <h3 className="text-lg font-black tracking-wide text-[var(--text)]">
            {t("studio_entry_title", "How would you like to set up this file?")}
          </h3>
          <p className="text-xs font-semibold text-[var(--subtext)]">
            {t("studio_entry_subtitle", "Choose whether this Sandbox file is a brand-new {mod} or links to an existing {mod} in your catalog.")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Choice 1: Make a New Mod */}
        <div
          onClick={onStartNewMod}
          className="glass-surface rounded-2xl p-6 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] transition-all duration-200 cursor-pointer flex flex-col justify-between gap-5 group"
        >
          <div className="flex flex-col gap-3">
            <div className="w-11 h-11 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--accent)]">
              <span className="material-symbols-outlined !text-[24px]">{t("icon_add_box", "add_box")}</span>
            </div>
            <h4 className="text-base font-black uppercase tracking-wider text-[var(--text)]">
              {t("studio_entry_new_mod_title", "Make a New {Mod}")}
            </h4>
            <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed">
              {t("studio_entry_new_mod_desc", "Start fresh with a new {mod} entry, configure its files, folder layout, and publish or export.")}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[var(--accent)]">
            <span>{t("studio_entry_new_mod_title", "Make a New {Mod}")}</span>
            <span className="material-symbols-outlined !text-[16px]">{t("icon_arrow_forward", "arrow_forward")}</span>
          </div>
        </div>

        {/* Choice 2: Link to Existing Mod */}
        <div className="glass-surface rounded-2xl p-6 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--accent)] shrink-0">
              <span className="material-symbols-outlined !text-[24px]">{t("icon_link", "link")}</span>
            </div>
            <div className="flex flex-col">
              <h4 className="text-base font-black uppercase tracking-wider text-[var(--text)]">
                {t("studio_entry_link_title", "Link to Existing {Mod}")}
              </h4>
              <p className="text-[11px] font-semibold text-[var(--subtext)]">
                {t(
                  "studio_entry_link_desc",
                  "Push a new version (auto-pulls all previous info minus Game Version) or attach as a Script Twin, Add-on, or Flavor."
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <button
              type="button"
              onClick={() => setEntryLinkMode("version")}
              className={`py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                entryLinkMode === "version"
                  ? "glass-surface text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_18%,transparent)]"
                  : "text-[var(--subtext)] hover:text-[var(--text)] border border-transparent"
              }`}
            >
              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                {t("icon_history", "history")}
              </span>
              {t("studio_entry_link_mode_version", "New Version / Update")}
            </button>
            <button
              type="button"
              onClick={() => setEntryLinkMode("module")}
              className={`py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                entryLinkMode === "module"
                  ? "glass-surface text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_18%,transparent)]"
                  : "text-[var(--subtext)] hover:text-[var(--text)] border border-transparent"
              }`}
            >
              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                {t("icon_account_tree", "account_tree")}
              </span>
              {t("studio_entry_link_mode_module", "Attach as Companion File")}
            </button>
          </div>

          <p className="text-[11px] font-semibold text-[var(--subtext)] leading-relaxed">
            {entryLinkMode === "version"
              ? t(
                  "studio_entry_link_mode_version_desc",
                  "Auto-pulls Title, Category, Description, DLC, Dependencies, Conflicts & Folder Layout from the previous version and clears Game Version for the new patch."
                )
              : t("studio_entry_link_mode_module_desc", "Attaches this file to the selected parent {mod} as a Script Twin (.ts4script), Add-on, or Pick-One Flavor.")}
          </p>

          {entryLinkMode === "module" && (
            <CustomDropdown
              disableTint={true}
              value={entryModuleRole}
              onChange={(val: string[]) => {
                if (val[0]) setEntryModuleRole(val[0] as any);
              }}
              options={[
                { id: "twin", label: t("editor_twin", "Script Twin") },
                { id: "addon", label: t("editor_addon", "Add-on Module") },
                { id: "flavor", label: t("studio_badge_flavor", "Flavor (Pick One)") },
                { id: "beta", label: t("badge_beta", "Beta Variant") },
              ]}
            />
          )}

          <div className="w-full relative z-30">
            <ModSearchDropdown
              modList={myModCandidates}
              onSelect={(selectedMod: any) => setEntryTargetMod(selectedMod)}
              selectedItem={entryTargetMod}
              onClear={() => setEntryTargetMod(null)}
              placeholder={t("studio_entry_select_target_ph", "Search your {mods} to link...")}
            />
          </div>

          <button
            type="button"
            disabled={!entryTargetMod || isPullingFromTarget}
            onClick={onPullFromExistingMod}
            className="h-11 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_18%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] disabled:opacity-40 text-xs font-black uppercase tracking-widest text-[var(--text)] flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined !text-[17px] text-[var(--accent)]">
              {entryLinkMode === "version"
                ? t("icon_sync_saved_locally", "sync_saved_locally")
                : t("icon_link", "link")}
            </span>
            {entryLinkMode === "version"
              ? t("studio_entry_btn_pull_and_continue", "Pull Info & Continue")
              : t("studio_entry_btn_attach_module", "Attach to {Mod}")}
          </button>
        </div>
      </div>
    </div>
  );
}

