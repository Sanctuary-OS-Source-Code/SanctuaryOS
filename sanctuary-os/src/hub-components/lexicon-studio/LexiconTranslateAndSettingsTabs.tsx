import { SUPPORTED_LEXICON_LANGUAGES } from "../../utils/translationEngine";
import IconPicker, { ICON_CATEGORIES } from "../../shared-components/IconPicker";
import {
  ActionButton,
  CustomDropdown,
  DashboardStatTile,
  HoverTooltip,
  SidePanelFilterBar,
} from "../../shared";
import { UniversalGroup } from "../../components/universal/UniversalLayout";
import { humanizeKey } from "./lexiconStudioHelpers";

export function LexiconTranslateAndSettingsTabs({
  fileName,
  t,
  activeTab,
  setActiveTab,
  setStatusFilter,
  findText,
  setFindText,
  replaceText,
  setReplaceText,
  setMatchCase,
  matchCase,
  setWholeWord,
  wholeWord,
  setReplaceCustomizedOnly,
  replaceCustomizedOnly,
  autoTranslateLang,
  setAutoTranslateLang,
  autoTranslateScope,
  setAutoTranslateScope,
  isTranslating,
  translateProgress,
  translateStatusMsg,
  newKeyName,
  setNewKeyName,
  newKeyValue,
  setNewKeyValue,
  setActiveIconPickerKey,
  activeIconPickerKey,
  selectedIconTarget,
  setSelectedIconTarget,
  setSelectedIconReplacement,
  selectedIconReplacement,
  selectedIconCategory,
  setSelectedIconCategory,
  iconSearchQuery,
  setIconSearchQuery,
  customMetaLangInput,
  setCustomMetaLangInput,
  isBuiltinFullLexicon,
  parsedDict,
  emptyOrDeprecatedBloatCount,
  handleCompactJson,
  handleUpdateKey,
  handleResetKey,
  customizedUiCount,
  totalCustomizedCount,
  overriddenIcons,
  scopeCounts,
  batchPreview,
  executeBatchReplace,
  handleAddCustomKey,
  stopBatchAutoTranslate,
  executeBatchAutoTranslate,
  metaLangDropdownOptions,
  currentMetaLangSelectValue,
  inheritedDefaultCount,
}: any) {
  return (
    <>
      {activeTab === "translate" && (
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
          {!isBuiltinFullLexicon && (
            <UniversalGroup
              title={t("lex_studio_auto_translate_clean_title", "1-Click Language Auto-Translate")}
              icon={t("icon_translate", "translate")}
            >
              <div className="flex flex-col gap-4 w-full">
                <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed">
                  {t(
                    "lex_studio_auto_translate_desc",
                    "Translates {Lexicon} strings into your target language while keeping {Mod}, {Vault}, {Blueprint}, and variable tokens intact."
                  )}
                </p>

                {/* Step 1: Pick Target Language */}
                <div className="flex flex-col gap-1.5 w-full">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {t("lex_studio_target_lang_lbl", "Target Language")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    searchable={true}
                    value={autoTranslateLang}
                    options={SUPPORTED_LEXICON_LANGUAGES.map((lang) => ({
                      id: lang.id,
                      label: `${lang.label} (${lang.nativeLabel})`,
                      searchText: `${lang.label} ${lang.nativeLabel} ${lang.id}`,
                      icon: t("icon_language", "language"),
                    }))}
                    onChange={(val: string[]) => {
                      const chosen = val[0] || "es";
                      setAutoTranslateLang(chosen);
                      const meta = SUPPORTED_LEXICON_LANGUAGES.find((l) => l.id === chosen);
                      if (meta) {
                        handleUpdateKey("_meta_lang", meta.label);
                      }
                    }}
                  />
                </div>

                {/* Step 2: Pick Scope via Clear Visual Tiles with Live Counts */}
                <div className="flex flex-col gap-2 w-full">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {t("lex_studio_translate_scope_lbl", "Translation Scope")}
                  </label>
                  <SidePanelFilterBar className="@[760px]:grid-cols-3 gap-3">
                    <DashboardStatTile
                      variant="filter"
                      icon={t("icon_bolt", "bolt")}
                      label={t(
                        "lex_studio_scope_essential_short",
                        "Core Terms, Nav & Common Buttons"
                      )}
                      value={`${t("lex_studio_starter_lbl", "Starter")} (${scopeCounts.essential.toLocaleString()})`}
                      isActive={autoTranslateScope === "essential"}
                      onClick={() => setAutoTranslateScope("essential")}
                    />
                    <DashboardStatTile
                      variant="filter"
                      icon={t("icon_auto_fix_high", "auto_fix_high")}
                      label={t(
                        "lex_studio_scope_untranslated_short",
                        "Keeps Existing Custom Edits Safe"
                      )}
                      value={`${t("lex_studio_remaining_lbl", "Remaining")} (${scopeCounts.untranslated.toLocaleString()})`}
                      isActive={autoTranslateScope === "untranslated"}
                      onClick={() => setAutoTranslateScope("untranslated")}
                    />
                    <DashboardStatTile
                      variant="filter"
                      icon={t("icon_public", "public")}
                      label={t(
                        "lex_studio_scope_all_short",
                        "Overwrites All Interface Strings"
                      )}
                      value={`${t("all", "All")} (${scopeCounts.all.toLocaleString()})`}
                      isActive={autoTranslateScope === "all"}
                      onClick={() => setAutoTranslateScope("all")}
                    />
                  </SidePanelFilterBar>
                </div>

                {/* Action & Live Progress Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <span className="text-[11px] font-medium text-[var(--subtext)]">
                    {t(
                      "lex_studio_translate_safe_note",
                      "You can pause anytime—completed batches are saved immediately to your draft."
                    )}
                  </span>

                  <div className="flex items-center gap-2">
                    {customizedUiCount > 0 && !isTranslating && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_visibility", "visibility")}
                        onClick={() => {
                          setStatusFilter("customized");
                          setActiveTab("strings");
                        }}
                        className="!h-10 !px-4 !text-xs !rounded-xl"
                      >
                        {t("lex_studio_review_translated_btn", "Review Strings")}
                      </ActionButton>
                    )}

                    {isTranslating ? (
                      <ActionButton
                        variant="danger"
                        icon={t("icon_stop_circle", "stop_circle")}
                        onClick={stopBatchAutoTranslate}
                        className="!h-10 !px-5 !text-xs !rounded-xl"
                      >
                        {t("cancel", "Cancel")}
                      </ActionButton>
                    ) : (
                      <ActionButton
                        variant="accent"
                        icon={t("icon_translate", "translate")}
                        onClick={executeBatchAutoTranslate}
                        className="!h-10 !px-5 !text-xs !rounded-xl"
                      >
                        {`${t("lex_studio_start_translate_btn", "Translate")} (${scopeCounts[
                          autoTranslateScope
                        ].toLocaleString()})`}
                      </ActionButton>
                    )}
                  </div>
                </div>

                {(isTranslating || translateProgress || translateStatusMsg) && (
                  <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 text-xs font-bold">
                      <span className="text-[var(--text)] truncate">
                        {isTranslating
                          ? t("lex_studio_translating_status", "Translating strings...")
                          : translateStatusMsg ||
                          t("lex_studio_translate_done", "Auto-translation complete")}
                      </span>
                      {translateProgress && (
                        <span className="font-mono tabular-nums text-[var(--accent)] shrink-0">
                          {`${translateProgress.completed.toLocaleString()} / ${translateProgress.total.toLocaleString()}`}
                        </span>
                      )}
                    </div>
                    {translateProgress && translateProgress.total > 0 && (
                      <div className="w-full h-2.5 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-all duration-200"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (translateProgress.completed / translateProgress.total) * 100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </UniversalGroup>
          )}

          {/* Card 2: Batch Find & Replace with Safe Live Preview */}
          <UniversalGroup
            title={t("lex_studio_batch_btn", "Batch Find & Replace")}
            icon={t("icon_find_replace", "find_replace")}
          >
            <div className="flex flex-col gap-3.5 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("lex_studio_find_lbl", "Find Text")}
                  </label>
                  <input
                    type="text"
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                    placeholder={t("lex_studio_find_ph", "Find word or phrase...") as string}
                    className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("lex_studio_replace_with_lbl", "Replace With")}
                  </label>
                  <input
                    type="text"
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    placeholder={t("lex_studio_replace_ph", "Replace with...") as string}
                    className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setWholeWord(!wholeWord)}
                    className="h-10 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center gap-2.5 cursor-pointer transition-all"
                  >
                    <span className="text-xs font-bold text-[var(--text)]">
                      {t("lex_studio_whole_word", "Whole word")}
                    </span>
                    <div
                      className={`sa-glass-toggle shrink-0 ${wholeWord ? "is-on" : ""}`}
                      aria-checked={wholeWord}
                    >
                      <div className="sa-glass-toggle-thumb" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMatchCase(!matchCase)}
                    className="h-10 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center gap-2.5 cursor-pointer transition-all"
                  >
                    <span className="text-xs font-bold text-[var(--text)]">
                      {t("lex_studio_match_case", "Match case")}
                    </span>
                    <div
                      className={`sa-glass-toggle shrink-0 ${matchCase ? "is-on" : ""}`}
                      aria-checked={matchCase}
                    >
                      <div className="sa-glass-toggle-thumb" />
                    </div>
                  </button>

                  {!isBuiltinFullLexicon && (
                    <button
                      type="button"
                      onClick={() => setReplaceCustomizedOnly(!replaceCustomizedOnly)}
                      className="h-10 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center gap-2.5 cursor-pointer transition-all"
                    >
                      <span className="text-xs font-bold text-[var(--text)]">
                        {t("lex_studio_replace_custom_only", "Customized strings only")}
                      </span>
                      <div
                        className={`sa-glass-toggle shrink-0 ${replaceCustomizedOnly ? "is-on" : ""
                          }`}
                        aria-checked={replaceCustomizedOnly}
                      >
                        <div className="sa-glass-toggle-thumb" />
                      </div>
                    </button>
                  )}
                </div>

                <ActionButton
                  variant="accent"
                  icon={t("icon_find_replace", "find_replace")}
                  disabled={!findText || batchPreview.total === 0}
                  onClick={executeBatchReplace}
                  className="!h-10 !px-4 !text-xs !rounded-xl"
                >
                  {`${t("lex_studio_replace_all_btn", "Replace")} (${batchPreview.total.toLocaleString()})`}
                </ActionButton>
              </div>

              {/* Live Diff Preview Before Replacing */}
              {findText && batchPreview.samples.length > 0 && (
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("lex_studio_replace_preview_lbl", "Preview Changes")}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {batchPreview.samples.map((s: any) => (
                      <div
                        key={s.key}
                        className="px-3 py-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-1 text-xs"
                      >
                        <span className="text-[10px] font-mono text-[var(--subtext)] opacity-70">
                          {s.key}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[var(--subtext)] line-through opacity-80">
                            {s.before}
                          </span>
                          <span className="text-[var(--accent)] font-black">→</span>
                          <span className="text-[var(--success)] font-bold">{s.after}</span>
                        </div>
                      </div>
                    ))}
                    {batchPreview.total > batchPreview.samples.length && (
                      <span className="text-[11px] font-semibold text-[var(--subtext)] px-1 pt-0.5">
                        {t("lex_studio_and_more_matches", "...and {count} more matching strings").replace(
                          "{count}",
                          (batchPreview.total - batchPreview.samples.length).toLocaleString()
                        )}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </UniversalGroup>
        </div>
      )}

      {/* =====================================================================
          TAB 4: PACK METADATA, STORAGE HEALTH & ICON OVERRIDES
         ===================================================================== */}
      {activeTab === "settings" && (
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
          {/* Card 1: Pack Identity & Sparse Storage */}
          <UniversalGroup
            title={t("lex_studio_meta_btn", "Pack Metadata")}
            icon={t("icon_badge", "badge")}
            headerAction={
              emptyOrDeprecatedBloatCount > 0 ? (
                <ActionButton
                  variant="accent"
                  icon={t("icon_cleaning_services", "cleaning_services")}
                  onClick={handleCompactJson}
                  className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
                >
                  {t("lex_studio_clean_redundant_btn", "Remove {count} Redundant Keys").replace(
                    "{count}",
                    String(emptyOrDeprecatedBloatCount)
                  )}
                </ActionButton>
              ) : undefined
            }
          >
            <div className="flex flex-col gap-3.5 w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 w-full">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("name", "Name")}
                  </label>
                  <input
                    type="text"
                    value={parsedDict._meta_name ?? ""}
                    placeholder={fileName.replace(/\.json$/i, "")}
                    onChange={(e) => handleUpdateKey("_meta_name", e.target.value)}
                    className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("language", "Language")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    searchable={true}
                    value={currentMetaLangSelectValue}
                    options={metaLangDropdownOptions}
                    onChange={(val: string[]) => {
                      const picked = val[0] || "en";
                      handleUpdateKey("_meta_lang", picked);
                    }}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("author", "Author")}
                  </label>
                  <input
                    type="text"
                    value={parsedDict._meta_author ?? ""}
                    placeholder="Creator"
                    onChange={(e) => handleUpdateKey("_meta_author", e.target.value)}
                    className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("version", "Version")}
                  </label>
                  <input
                    type="text"
                    value={parsedDict._meta_version ?? "1"}
                    placeholder="1"
                    onChange={(e) => {
                      const num = Number(e.target.value);
                      handleUpdateKey(
                        "_meta_version",
                        !Number.isNaN(num) && e.target.value.trim() !== ""
                          ? num
                          : e.target.value
                      );
                    }}
                    className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                  />
                </div>
              </div>

              {/* Optional Custom Dialect / Constructed Language Input */}
              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-black text-[var(--text)]">
                    {isBuiltinFullLexicon
                      ? t("lex_studio_baseline_summary_title", "Master Standard English Baseline")
                      : t("lex_studio_sparse_summary_title", "Sparse Delta Storage")}
                  </span>
                  <span className="text-[11px] font-medium text-[var(--subtext)]">
                    {isBuiltinFullLexicon
                      ? t(
                        "lex_studio_baseline_summary_desc",
                        "Every other {Lexicon} pack automatically inherits missing strings from this file."
                      )
                      : t(
                        "lex_studio_sparse_summary_desc",
                        "Stores {custom} custom entries and automatically inherits {inherited} default strings from en-default.json."
                      )
                        .replace("{custom}", totalCustomizedCount.toLocaleString())
                        .replace("{inherited}", inheritedDefaultCount.toLocaleString())}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="text"
                    value={customMetaLangInput}
                    onChange={(e) => setCustomMetaLangInput(e.target.value)}
                    placeholder={t("lex_studio_custom_dialect_ph", "Custom language name...") as string}
                    className="w-44 h-9 glass-panel rounded-xl px-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                  />
                  <ActionButton
                    variant="glass"
                    disabled={!customMetaLangInput.trim()}
                    onClick={() => {
                      handleUpdateKey("_meta_lang", customMetaLangInput.trim());
                      setCustomMetaLangInput("");
                    }}
                    className="!h-9 !px-3 !text-xs !rounded-xl"
                  >
                    {t("lex_studio_set_lang_btn", "Set Language")}
                  </ActionButton>
                </div>
              </div>
            </div>
          </UniversalGroup>

          {/* Card 2: Material Icon Overrides */}
          <UniversalGroup
            title={t("lex_studio_icon_overrides_title", "Icon Overrides")}
            icon={t("icon_interests", "interests")}
          >
            {(() => {
              const coreOsIcons = [
                "inventory_2",
                "hub",
                "map",
                "science",
                "history",
                "design_services",
                "construction",
                "shield",
                "rocket_launch",
                "bug_report",
                "palette",
                "translate",
                "tune",
                "delete",
                "search",
                "settings",
                "verified",
                "check_circle",
                "warning",
                "error",
                "folder_open",
                "download",
                "upload",
                "code",
                "menu_book",
                "auto_awesome",
              ];

              const allKnownIcons = Array.from(
                new Set([
                  ...coreOsIcons,
                  ...overriddenIcons.map((o: any) => o.baseGlyph),
                  ...ICON_CATEGORIES.flatMap((c) => c.icons),
                ])
              );

              const targetIconDropdownOptions = allKnownIcons.map((glyph) => ({
                id: `icon_${glyph}`,
                label: `${humanizeKey(glyph)} (icon_${glyph})`,
                searchText: `${glyph} ${humanizeKey(glyph)} icon_${glyph}`,
                icon: glyph,
              }));

              const categoryDropdownOptions = [
                {
                  id: "core_os",
                  label: t("lex_studio_icon_cat_core", "Core OS & Customized Icons"),
                  icon: t("icon_auto_awesome", "auto_awesome"),
                },
                ...ICON_CATEGORIES.map((cat) => ({
                  id: cat.name,
                  label: cat.name,
                  icon: cat.icons[0] || "apps",
                })),
              ];

              const baseCategoryIcons =
                selectedIconCategory === "core_os"
                  ? Array.from(new Set([...overriddenIcons.map((o: any) => o.baseGlyph), ...coreOsIcons]))
                  : ICON_CATEGORIES.find((c) => c.name === selectedIconCategory)?.icons ||
                  coreOsIcons;

              const visibleIcons = iconSearchQuery.trim()
                ? allKnownIcons.filter((ic) =>
                  ic.toLowerCase().includes(iconSearchQuery.trim().toLowerCase())
                )
                : baseCategoryIcons;

              return (
                <div className="flex flex-col gap-4 w-full">
                  {/* Active Icon Overrides Strip */}
                  {overriddenIcons.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {overriddenIcons.map((ic: any) => (
                        <div
                          key={ic.key}
                          className="px-3 py-1.5 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center gap-2 text-xs"
                        >
                          <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)]">
                            {ic.baseGlyph}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--subtext)]">→</span>
                          <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                            {ic.overrideGlyph}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-[var(--text)]">
                            {ic.baseGlyph}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleResetKey(ic.key)}
                            className="text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer flex items-center ml-0.5"
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              {t("icon_close", "close")}
                            </span>
                            <HoverTooltip title={t("reset", "Reset")} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-[var(--subtext)]">
                      {t(
                        "lex_studio_no_icon_overrides",
                        "No custom icon overrides set—all interface icons currently use standard Material Symbols."
                      )}
                    </p>
                  )}

                  {/* Guided Icon Override Builder */}
                  <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
                    <div className="grid grid-cols-1 @[780px]:grid-cols-[1fr_240px_auto] gap-3 items-end">
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t("lex_studio_icon_target_lbl", "1. Select OS Icon to Override")}
                        </label>
                        <CustomDropdown
                          disableTint={true}
                          searchable={true}
                          value={selectedIconTarget}
                          options={targetIconDropdownOptions}
                          onChange={(val: string[]) => {
                            const chosen = val[0] || "icon_delete";
                            setSelectedIconTarget(chosen);
                            const rawGlyph = chosen.replace(/^icon_/, "");
                            setSelectedIconReplacement(parsedDict[chosen] || rawGlyph);
                          }}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5 min-w-0 relative">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t("lex_studio_icon_replacement_lbl", "2. Choose Replacement Icon")}
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveIconPickerKey(
                              activeIconPickerKey === "__builder__" ? null : "__builder__"
                            )
                          }
                          className="h-10 w-full glass-panel rounded-xl px-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-between gap-2 cursor-pointer transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
                              {selectedIconReplacement}
                            </span>
                            <span className="text-xs font-mono font-bold text-[var(--text)] truncate">
                              {selectedIconReplacement}
                            </span>
                          </div>
                          <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] shrink-0">
                            {t("icon_apps", "apps")}
                          </span>
                        </button>

                        {activeIconPickerKey === "__builder__" && (
                          <div className="absolute right-0 top-12 z-[200]">
                            <IconPicker
                              onSelect={(newGlyph: string) => {
                                setSelectedIconReplacement(newGlyph);
                                setActiveIconPickerKey(null);
                              }}
                              onClose={() => setActiveIconPickerKey(null)}
                            />
                          </div>
                        )}
                      </div>

                      <ActionButton
                        variant="accent"
                        icon={t("icon_check", "check")}
                        onClick={() =>
                          handleUpdateKey(selectedIconTarget, selectedIconReplacement)
                        }
                        className="!h-10 !px-4 !text-xs !rounded-xl shrink-0"
                      >
                        {t("apply", "Apply")}
                      </ActionButton>
                    </div>
                  </div>

                  {/* Browse Icons Grid */}
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 @[680px]:grid-cols-[260px_1fr] gap-3 items-center">
                      <CustomDropdown
                        disableTint={true}
                        searchable={true}
                        value={selectedIconCategory}
                        options={categoryDropdownOptions}
                        onChange={(val: string[]) =>
                          setSelectedIconCategory(val[0] || "core_os")
                        }
                      />
                      <input
                        type="text"
                        value={iconSearchQuery}
                        onChange={(e) => setIconSearchQuery(e.target.value)}
                        placeholder={
                          t(
                            "lex_studio_icon_search_ph",
                            "Filter icons by name (e.g. delete, folder, shield, science)..."
                          ) as string
                        }
                        className="w-full h-10 glass-surface rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {visibleIcons.slice(0, 24).map((iconName) => {
                        const iconKey = `icon_${iconName}`;
                        const currentGlyph = parsedDict[iconKey] || iconName;
                        const isOverridden =
                          Boolean(parsedDict[iconKey]) && parsedDict[iconKey] !== iconName;
                        return (
                          <div
                            key={iconKey}
                            className={`glass-surface rounded-2xl p-3 border flex items-center justify-between gap-2 relative transition-all ${isOverridden
                              ? "border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                              : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                              }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--accent)] shrink-0">
                                <span className="material-symbols-outlined !text-[18px]">
                                  {currentGlyph}
                                </span>
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold text-[var(--text)] truncate">
                                  {humanizeKey(iconName)}
                                </span>
                                <span className="text-[9px] font-mono text-[var(--subtext)] opacity-70 truncate">
                                  {isOverridden
                                    ? `${iconName} → ${currentGlyph}`
                                    : `icon_${iconName}`}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {isOverridden && (
                                <button
                                  type="button"
                                  onClick={() => handleResetKey(iconKey)}
                                  className="w-6 h-6 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[13px]">
                                    {t("icon_restart_alt", "restart_alt")}
                                  </span>
                                  <HoverTooltip title={t("reset", "Reset")} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveIconPickerKey(
                                    activeIconPickerKey === iconKey ? null : iconKey
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[9px] font-black uppercase text-[var(--text)] cursor-pointer shrink-0"
                              >
                                {t("edit", "Edit")}
                              </button>
                            </div>

                            {activeIconPickerKey === iconKey && (
                              <div className="absolute right-0 top-12 z-[200]">
                                <IconPicker
                                  onSelect={(newGlyph: string) => {
                                    handleUpdateKey(iconKey, newGlyph);
                                    setActiveIconPickerKey(null);
                                  }}
                                  onClose={() => setActiveIconPickerKey(null)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </UniversalGroup>

          {/* Card 3: Custom Schema / Domain Key */}
          <UniversalGroup
            title={t("lex_studio_custom_keys_title", "Custom Schema & Category Keys")}
            icon={t("icon_add_circle", "add_circle")}
          >
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr_auto] gap-3 items-end w-full">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("lex_studio_new_key_ph", "Custom Key ID")}
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="class_dd_custom_category"
                  className="w-full h-10 glass-surface rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("value", "Value")}
                </label>
                <input
                  type="text"
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  placeholder={
                    t(
                      "lex_studio_new_val_ph",
                      "Display text (supports {Mod}, {Vault}...)"
                    ) as string
                  }
                  className="w-full h-10 glass-surface rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                />
              </div>
              <ActionButton
                variant="accent"
                icon={t("icon_add", "add")}
                disabled={!newKeyName.trim()}
                onClick={handleAddCustomKey}
                className="!h-10 !px-4 !text-xs !rounded-xl"
              >
                {t("add", "Add")}
              </ActionButton>
            </div>
          </UniversalGroup>
        </div>
      )}
    </>
  );
}
