import React, { useState } from "react";
import { isDesktop } from "../utils/envUtils";
import { useStore } from "../store";
import { getFileLabel, getModIcon, HoverTooltip, getModFallbackUrl, handleOpenUrl, VAULT_CHIP_CLASS, isScriptExtension, isModBinaryExtension } from "../shared";
import { formatCleanModTitle } from "../side-panels/CommandIncompatiblePanel";
import { pickFirstValidAuthor } from "./dossierHelpersAndFetch";

export const DossierModuleCard = React.memo(function DossierModuleCard({
  item,
  activeMods,
  isModNameEquipped,
  isNexusView,
  activeGameSchema,
  showImages,
  t,
  onInspect,
  onToggleGroup,
  onToggleSingle,
  isSingleItemStaged,
  handleStageTargetToPc,
}: any) {
  const [isExpanded, setIsExpanded] = useState(false);

  const groupedMods: any[] =
    Array.isArray(item._groupedMods) && item._groupedMods.length > 0
      ? item._groupedMods
      : [item];
  const isInstalled = item.isInstalled !== false;
  const relationType: "manifest" | "requirement" | "twin" =
    item.relationType || "manifest";

  const checkEquipped = (n: string): boolean =>
    typeof isModNameEquipped === "function"
      ? isModNameEquipped(n)
      : Array.isArray(activeMods) && activeMods.includes(n);

  const equippableNames = groupedMods
    .map((gm: any) => gm?.name)
    .filter(
      (n: any) =>
        n &&
        typeof n === "string" &&
        !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(n)
    );
  const isEquipped =
    isInstalled &&
    equippableNames.length > 0 &&
    equippableNames.some((n: string) => checkEquipped(n));

  const rawTitle =
    item._groupedTitle ||
    (item.displayName &&
      !/^(FOLDER_|SET_|LOCAL_SET_)/i.test(String(item.displayName))
      ? item.displayName
      : (item.name || "")
        .replace(/^(FOLDER_|SET_|LOCAL_SET_)/i, "")
        .split(/[/\\]/)
        .pop() || "");
  const title =
    formatCleanModTitle(
      String(rawTitle).replace(/_/g, " ").replace(/\.[^/.]+$/, "")
    ) || String(rawTitle);

  const validCreator = pickFirstValidAuthor(t, item, ...groupedMods);

  const activeSchemaRef = useStore.getState().activeGameSchema;
  const hasScriptFile = groupedMods.some((gm: any) =>
    isScriptExtension(
      String(gm?.name || gm?.file_extension || gm?._originalSetName || ""),
      activeSchemaRef
    )
  );
  const hasPackageFile = groupedMods.some((gm: any) => {
    const rawTarget = String(gm?.name || gm?.file_extension || gm?._originalSetName || "");
    return !isScriptExtension(rawTarget, activeSchemaRef) && isModBinaryExtension(rawTarget, activeSchemaRef);
  });

  const typeLabel = hasScriptFile
    ? t("type_script", "Script")
    : hasPackageFile
      ? t("type_package", "Module")
      : item.category_override || item.type || t("type_package", "Module");

  const rawVer =
    item.mod_versions?.[0]?.version_label ||
    item.version ||
    groupedMods.find(
      (gm: any) =>
        gm?.mod_versions?.[0]?.version_label ||
        (gm?.version && !/^(v\.?local|local|unknown)$/i.test(String(gm.version)))
    )?.version ||
    "";
  const hasRealVersion = Boolean(
    rawVer && !/^(v\.?local|local|unknown)$/i.test(String(rawVer).trim())
  );
  const cleanVer = hasRealVersion
    ? String(rawVer).replace(/^v\.?/i, "").trim()
    : null;

  const image =
    showImages &&
      (item.image_url || item.imageUrl) &&
      String(item.image_url || item.imageUrl) !== "null" &&
      String(item.image_url || item.imageUrl).trim() !== ""
      ? item.image_url || item.imageUrl
      : undefined;

  const modIcon = !isInstalled
    ? t("icon_error", "error")
    : getModIcon(item, activeGameSchema, t);

  const statusRaw = String(item.status || "")
    .toLowerCase()
    .replace(/[\[\]]/g, "");
  const isBroken = statusRaw === "broken" || statusRaw === "corrupted";
  const isWarn = statusRaw === "unstable" || statusRaw === "paid";

  const iconColorClass = !isInstalled || isBroken
    ? "text-[var(--danger)]"
    : isWarn
      ? "text-[var(--warning)]"
      : "text-[var(--accent)]";

  const searchOrDownloadUrl =
    item.url ||
    getModFallbackUrl(title || item.name || "", item.hash, activeGameSchema, {
      url: item.url,
    });

  return (
    <div
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 108px" }}
      onClick={() => {
        if (isInstalled || item.dbId || (item._groupedIds && item._groupedIds.length > 0)) {
          onInspect(item);
        } else {
          handleOpenUrl(searchOrDownloadUrl);
        }
      }}
      className={`glass-panel rounded-2xl p-3.5 border flex flex-col justify-between gap-3 transition-all duration-200 cursor-pointer relative ${isExpanded && groupedMods.length > 1 ? "sm:col-span-2" : ""
        } ${!isInstalled
          ? "border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
          : isEquipped
            ? "border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)]"
            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
        }`}
    >
      {/* Top Tier: Icon Well + Title & Subtitle */}
      <div className="flex items-center gap-3 min-w-0 w-full">
        {image ? (
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
            <img src={image} alt={title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div
            className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${iconColorClass}`}
          >
            <span className="material-symbols-outlined !text-[20px]">
              {modIcon}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="relative group/modtitle flex items-center min-w-0 w-fit max-w-full">
            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
              {title}
            </span>
            <HoverTooltip className="z-[100]" title={title} icon={modIcon} />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
            {validCreator && (
              <>
                <span className="truncate opacity-85">
                  {formatCleanModTitle(validCreator)}
                </span>
                <span className="opacity-40 shrink-0">•</span>
              </>
            )}
            <span className="opacity-85 shrink-0">{typeLabel}</span>
            {groupedMods.length > 1 && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="opacity-85 shrink-0">
                  {groupedMods.length} {t("badge_modules_count", "Modules")}
                </span>
              </>
            )}
            {cleanVer && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="font-mono text-[10px] font-bold text-[var(--subtext)] opacity-85 shrink-0">
                  v{cleanVer}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Status & Action Bar */}
      <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {relationType === "requirement" ? (
            <span className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] shrink-0 ${isInstalled ? "text-[var(--accent)]" : "text-[var(--danger)]"
                  }`}
              >
                {isInstalled
                  ? t("icon_extension", "extension")
                  : t("icon_error", "error")}
              </span>
              <span>
                {isInstalled
                  ? t("requirement_essential", "Requirement")
                  : t("status_missing", "Missing")}
              </span>
            </span>
          ) : relationType === "twin" ? (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                {t("icon_account_tree", "account_tree")}
              </span>
              <span>{t("identity_twin", "Twin")}</span>
            </span>
          ) : !isInstalled ? (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--danger)]">
                {t("icon_error", "error")}
              </span>
              <span>{t("status_missing", "Missing")}</span>
            </span>
          ) : (
            <span className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] shrink-0 ${isBroken
                  ? "text-[var(--danger)]"
                  : isWarn
                    ? "text-[var(--warning)]"
                    : statusRaw === "stable" ||
                      statusRaw === t("status_stable", "stable").toLowerCase()
                      ? "text-[var(--success)]"
                      : "text-[var(--subtext)]"
                  }`}
              >
                {isBroken
                  ? t("icon_pest_control", "pest_control")
                  : isWarn
                    ? t("icon_warning", "warning")
                    : statusRaw === "stable" ||
                      statusRaw === t("status_stable", "stable").toLowerCase()
                      ? t("icon_verified_user", "verified_user")
                      : t("icon_label", "label")}
              </span>
              <span className="truncate">
                {isBroken
                  ? t("status_corrupted", "Broken")
                  : statusRaw === "stable" ||
                    statusRaw === t("status_stable", "stable").toLowerCase()
                    ? t("status_stable", "Stable")
                    : statusRaw
                      ? statusRaw.replace(/_/g, " ")
                      : t("badge_local", "Unlinked")}
              </span>
            </span>
          )}
        </div>

        {/* Bottom-Right Compact Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {groupedMods.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              className={`relative group/actionbtn w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer shrink-0 ${isExpanded
                ? "border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--accent)]"
                : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)]"
                }`}
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_account_tree", "account_tree")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={`${groupedMods.length} ${t("badge_modules_count", "Modules")}`}
                icon={t("icon_account_tree", "account_tree")}
              />
            </button>
          )}

          {(relationType === "requirement" || relationType === "twin" || !isInstalled) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenUrl(searchOrDownloadUrl);
              }}
              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {!isDesktop()
                  ? t("icon_open_in_new", "open_in_new")
                  : item.url
                    ? t("icon_download", "download")
                    : t("icon_open_in_new", "open_in_new")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={
                  !isDesktop()
                    ? item.url
                      ? t("btn_view", "View")
                      : t("btn_search_web", "Search Web")
                    : item.url
                      ? t("btn_download", "Download")
                      : t("btn_search_web", "Search Web")
                }
                icon={
                  !isDesktop()
                    ? t("icon_open_in_new", "open_in_new")
                    : item.url
                      ? t("icon_download", "download")
                      : t("icon_open_in_new", "open_in_new")
                }
              />
            </button>
          )}

          {isInstalled && !isNexusView && equippableNames.length > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleGroup(item);
              }}
              className={`relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-center transition-all cursor-pointer shrink-0 ${isEquipped
                ? "text-[var(--danger)]"
                : "text-[var(--success)]"
                }`}
            >
              <span className="material-symbols-outlined !text-[15px]">
                {isEquipped ? t("icon_close", "close") : t("icon_add", "add")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={
                  isEquipped
                    ? t("btn_unequip", "Unequip {Mod}")
                    : t("btn_equip", "Equip {Mod}")
                }
                icon={
                  isEquipped ? t("icon_close", "close") : t("icon_add", "add")
                }
                variant={isEquipped ? "danger" : "default"}
              />
            </button>
          ) : isInstalled && isNexusView && !isDesktop() ? (
            (() => {
              const kidStaged = isSingleItemStaged(item);
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStageTargetToPc(
                      { ...item, _stageSingle: true },
                      kidStaged
                    );
                  }}
                  className={`relative group/actionbtn w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer shrink-0 ${kidStaged
                    ? "text-[var(--accent)] border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                    : "text-[var(--subtext)] hover:text-[var(--accent)] border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                    }`}
                >
                  <span className="material-symbols-outlined !text-[15px]">
                    {kidStaged
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_phonelink", "phonelink")}
                  </span>
                </button>
              );
            })()
          ) : null}
        </div>
      </div>

      {/* Expandable Child Modules Drawer */}
      {isExpanded && groupedMods.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-1.5"
        >
          {groupedMods.map((gm: any, idx: number) => {
            const rawChildFile =
              (gm?.name || "").split(/[/\\]/).pop() ||
              gm?.displayName ||
              title;
            const childExt = rawChildFile.includes(".")
              ? `.${rawChildFile.split(".").pop()?.toUpperCase()}`
              : getFileLabel(gm?.name || "", activeGameSchema);
            const childClean =
              formatCleanModTitle(
                rawChildFile.replace(/_/g, " ").replace(/\.[^/.]+$/, "")
              ) || rawChildFile;
            const childEquipped = Boolean(gm?.name && checkEquipped(gm.name));
            const isChildScript = isScriptExtension(rawChildFile, activeGameSchema);

            return (
              <div
                key={gm?.hash || gm?.name || idx}
                onClick={() => onInspect(gm)}
                className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                    {isChildScript
                      ? t("icon_terminal", "terminal")
                      : t("icon_deployed_code", "deployed_code")}
                  </span>
                  <span className="text-xs font-bold text-[var(--text)] truncate">
                    {childClean}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={VAULT_CHIP_CLASS}>{childExt}</span>
                  {!isNexusView &&
                    gm?.name &&
                    !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(String(gm.name)) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSingle(gm.name);
                        }}
                        className={`w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-center transition-all cursor-pointer ${childEquipped
                          ? "text-[var(--danger)]"
                          : "text-[var(--success)]"
                          }`}
                      >
                        <span className="material-symbols-outlined !text-[14px]">
                          {childEquipped
                            ? t("icon_close", "close")
                            : t("icon_add", "add")}
                        </span>
                      </button>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}, function areDossierModuleCardsEqual(prevProps: any, nextProps: any) {
  if (prevProps.item !== nextProps.item) return false;
  if (prevProps.isNexusView !== nextProps.isNexusView) return false;
  if (prevProps.showImages !== nextProps.showImages) return false;
  if (prevProps.activeGameSchema !== nextProps.activeGameSchema) return false;

  const getEquippedMask = (props: any) => {
    const it = props.item;
    if (!it || it.isInstalled === false) return "0";
    const gMods =
      Array.isArray(it._groupedMods) && it._groupedMods.length > 0
        ? it._groupedMods
        : [it];
    const check =
      typeof props.isModNameEquipped === "function"
        ? props.isModNameEquipped
        : (n: string) =>
          Array.isArray(props.activeMods) && props.activeMods.includes(n);
    let mask = "";
    for (let i = 0; i < gMods.length; i++) {
      const n = gMods[i]?.name;
      if (
        n &&
        typeof n === "string" &&
        !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(n)
      ) {
        mask += check(n) ? "1" : "0";
      }
    }
    return mask;
  };

  if (getEquippedMask(prevProps) !== getEquippedMask(nextProps)) return false;

  if (nextProps.isNexusView) {
    const prevStaged = Boolean(prevProps.isSingleItemStaged?.(prevProps.item));
    const nextStaged = Boolean(nextProps.isSingleItemStaged?.(nextProps.item));
    if (prevStaged !== nextStaged) return false;
  }

  return true;
});

