import React from "react";
import { getModIcon } from "../../shared";
import { useStore } from "../../store";
import { isDesktop } from "../../utils/envUtils";
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from "../../shared-components/ContextMenu";

export function useNexusContextMenus({
  cleanModName,
  onOpenDossier,
  onSetStatus,
  onOpenMasonProfile,
  t,
  importLexicon,
  previewLexiconId,
  startLexiconPreview,
  stopLexiconPreview,
  importTheme,
  previewThemeId,
  startThemePreview,
  stopThemePreview,
  setSelectedBlueprint,
  setPreviewAsset,
  toggleModInStagingDraft,
  stageBlueprintToDraft,
  stagedModKeys,
  setInstalledTemplates,
  masonMap,
  setReportState,
  expandedFolder,
  setExpandedFolder,
  isInstalled,
  getAssetDisplayVersion,
  isOutdated,
  importTemplate,
}: any) {
  const handleNexusModContextMenu = (
    e: React.MouseEvent,
    mod: any,
    mainKey?: string,
    isFolder?: boolean
  ) => {
    const cleanedTitle = cleanModName(mod.name || mod.title || mod.id).name;
    const authorName = mod.master_author || mod.author || t("unknown_mason", "Unknown {Mason}");
    const isModOrSuiteStaged =
      isFolder && Array.isArray(mod.flavors) && mod.flavors.length > 0
        ? mod.flavors.every(
            (f: any) =>
              stagedModKeys.has(String(f.id)) || (f.hash && stagedModKeys.has(String(f.hash)))
          )
        : stagedModKeys.has(String(mod.id)) || (mod.hash && stagedModKeys.has(String(mod.hash)));

    const items: SanctuaryContextMenuItem[] = [
      {
        id: "inspect",
        label: t("btn_inspect", "Inspect {Mod}"),
        icon: t("icon_open_in_new", "open_in_new"),
        variant: "accent",
        onClick: () => onOpenDossier && onOpenDossier({ ...mod, isNexusView: true }),
      },
    ];

    if (isFolder && mainKey) {
      const isExpanded = expandedFolder === mainKey;
      const modCount = mod.familyCount || (mod.flavors?.length || 0);
      items.push({
        id: "explore",
        label: isExpanded
          ? t("btn_close", "Close")
          : `${t("nav_exploring", "Exploring")} (${modCount})`,
        icon: t("icon_account_tree", "account_tree"),
        onClick: () =>
          setExpandedFolder((prev: string | null) => (prev === mainKey ? null : mainKey)),
      });
    }

    if (!isDesktop()) {
      items.push({
        id: "stage",
        label: isModOrSuiteStaged
          ? t("staging_btn_unstage_mod", "Remove from Staging")
          : isFolder
            ? t("staging_btn_stage_suite", "Stage Suite")
            : t("nexus_btn_stage_compact", "Stage to Desktop"),
        icon: isModOrSuiteStaged
          ? t("icon_playlist_add_check", "playlist_add_check")
          : t("icon_playlist_add", "playlist_add"),
        variant: isModOrSuiteStaged ? "warning" : "success",
        onClick: () => {
          toggleModInStagingDraft(mod);
          onSetStatus(
            isModOrSuiteStaged
              ? t("status_staging_item_removed", "Removed from Remote Staging Queue.")
              : t("status_staging_item_added", "Added to Remote Staging Queue.")
          );
        },
      });
    }

    const resolvedMasonId = mod.mason_id || masonMap[String(authorName).toLowerCase()];
    if (resolvedMasonId && onOpenMasonProfile) {
      items.push({
        id: "profile",
        label: t("btn_view_profile", "View Profile"),
        icon: t("icon_person", "person"),
        dividerBefore: true,
        onClick: () => onOpenMasonProfile(resolvedMasonId),
      });
    }

    items.push({
      id: "report",
      label: t("report_title", "Report Asset"),
      icon: t("icon_flag", "flag"),
      variant: "danger",
      dividerBefore: true,
      onClick: () => {
        const rawId = String(mod.id || "");
        const isCol = Boolean(mod.isCollection || rawId.startsWith("collection_"));
        setReportState({
          isOpen: true,
          assetId: isCol ? rawId.replace(/^collection_/, "") : mod.id,
          assetType: isCol ? "collection" : "mod",
          reason: "",
          complianceTier: 1,
        });
      },
    });

    openSanctuaryContextMenu(e, {
      title: cleanedTitle,
      subtitle: authorName,
      statusLabel: mod.latest_version || mod.version || undefined,
      icon: getModIcon(mod, useStore.getState().activeGameSchema, t),
      items,
    });
  };

  const handleNexusAssetContextMenu = (
    e: React.MouseEvent,
    asset: any,
    resolvedTab: string
  ) => {
    const tabUpper = resolvedTab.toUpperCase();
    const isBp = tabUpper === "BLUEPRINTS" || tabUpper === "BLUEPRINT";
    const isLex = tabUpper === "LEXICONS" || tabUpper === "LEXICON";
    const isCham = tabUpper === "CHAMELEONS" || tabUpper === "CHAMELEON";
    const isTmpl = tabUpper === "TEMPLATES" || tabUpper === "TEMPLATE" || tabUpper === "WORKBENCH_TEMPLATE";
    const authorName = asset.author || asset.master_author || t("unknown_mason", "Unknown {Mason}");

    const items: SanctuaryContextMenuItem[] = [
      {
        id: "inspect",
        label: t("btn_view", "View"),
        icon: t("icon_open_in_new", "open_in_new"),
        variant: "accent",
        onClick: () => {
          if (isBp) setSelectedBlueprint(asset);
          else if (isLex) setPreviewAsset({ id: asset.id, type: "lexicon" });
          else if (isCham) setPreviewAsset({ id: asset.id, type: "chameleon" });
          else if (isTmpl) setPreviewAsset({ id: asset.id, type: "workbench_template" });
          else if (onOpenDossier) onOpenDossier({ ...asset, isNexusView: true });
        },
      },
    ];

    if (isCham || isLex) {
      const previewKey = `nexus_${isCham ? "CHAMELEONS" : "LEXICONS"}_${asset.id}`;
      const isPreviewingThis = isCham
        ? previewThemeId === previewKey
        : previewLexiconId === previewKey;
      items.push({
        id: "preview",
        label: isPreviewingThis
          ? t("btn_stop_preview", "Stop Preview")
          : t("preview", "Preview"),
        icon: isPreviewingThis
          ? t("icon_visibility_off", "visibility_off")
          : t("icon_visibility", "visibility"),
        onClick: () => {
          if (isPreviewingThis) {
            if (isCham) stopThemePreview();
            else stopLexiconPreview();
            onSetStatus(t("status_preview_stopped", "Preview ended — restored active settings."));
          } else {
            const parsedData =
              typeof asset.json_data === "string"
                ? JSON.parse(asset.json_data)
                : asset.json_data || {};
            if (isCham) {
              startThemePreview(previewKey, {
                ...parsedData,
                name: asset.name || parsedData.name || "Chameleon",
              });
            } else {
              startLexiconPreview(
                previewKey,
                parsedData,
                asset.name || parsedData._meta_name || "Lexicon"
              );
            }
            onSetStatus(
              t(
                "status_previewing_asset",
                "Previewing {0} — click Stop Preview or Install when done."
              ).replace("{0}", asset.name || "")
            );
          }
        },
      });
    }

    if (isBp) {
      if (!isDesktop()) {
        items.push({
          id: "stage_bp",
          label: t("nexus_btn_stage_compact", "Stage to Desktop"),
          icon: t("icon_phonelink", "phonelink"),
          variant: "success",
          onClick: () => {
            stageBlueprintToDraft(asset);
            onSetStatus(
              t("status_staging_blueprint_loaded", "Blueprint loaded into Payload Editor.")
            );
            useStore.getState().setView("playsets");
          },
        });
      }
    } else if (isCham || isLex || isTmpl) {
      const assetTypeKey = isLex ? "lexicon" : isCham ? "chameleon" : "workbench_template";
      items.push({
        id: "install",
        label: isInstalled(asset)
          ? isOutdated(asset)
            ? t("btn_update", "Update")
            : t("btn_reinstall", "Reinstall")
          : t("update_panel_install", "Install"),
        icon: isInstalled(asset)
          ? isOutdated(asset)
            ? t("icon_update", "update")
            : t("icon_refresh", "refresh")
          : t("icon_download", "download"),
        variant: "success",
        onClick: async () => {
          const parsedData =
            typeof asset.json_data === "string"
              ? JSON.parse(asset.json_data)
              : asset.json_data || {};
          if (isCham) {
            importTheme({
              ...parsedData,
              name: asset.name || parsedData.name || "Chameleon",
              version: asset.version || parsedData.version || "1.0.0",
              author: asset.author || parsedData.author || "Citizen",
              _meta_version: asset.version || parsedData._meta_version || "1.0.0",
            });
          } else if (isTmpl) {
            const versionToSave = getAssetDisplayVersion(asset);
            await importTemplate({ ...parsedData, version: versionToSave });
            setInstalledTemplates((prev: any) => ({ ...prev, [asset.name]: versionToSave }));
          } else {
            importLexicon(
              {
                ...parsedData,
                _meta_language: asset.language || "Custom",
                _meta_version: asset.version || "1.0.0",
              },
              asset.name
            );
          }
          if (!isDesktop()) {
            toggleModInStagingDraft({
              ...asset,
              asset_type: assetTypeKey,
              asset_id: asset.id,
            });
          }
          onSetStatus(`${t("update_panel_install", "Install")}: ${asset.name}`);
        },
      });
    }

    const resolvedMasonId = asset.mason_id || masonMap[String(authorName).toLowerCase()];
    if (resolvedMasonId && onOpenMasonProfile) {
      items.push({
        id: "profile",
        label: t("btn_view_profile", "View Profile"),
        icon: t("icon_person", "person"),
        dividerBefore: true,
        onClick: () => onOpenMasonProfile(resolvedMasonId),
      });
    }

    items.push({
      id: "report",
      label: t("report_title", "Report Asset"),
      icon: t("icon_flag", "flag"),
      variant: "danger",
      dividerBefore: true,
      onClick: () =>
        setReportState({
          isOpen: true,
          assetId: asset.id,
          assetType: isBp
            ? "blueprint"
            : isLex
              ? "lexicon"
              : isCham
                ? "chameleon"
                : "workbench_template",
          reason: "",
        }),
    });

    openSanctuaryContextMenu(e, {
      title: asset.name || asset.title || t("unknown", "Unknown"),
      subtitle: authorName,
      statusLabel: `v${String(getAssetDisplayVersion(asset) || "1.0.0").replace(/^v/i, "")}`,
      icon: isBp
        ? t("icon_map", "map")
        : isLex
          ? t("icon_translate", "translate")
          : isTmpl
            ? t("icon_draw", "draw")
            : t("icon_palette", "palette"),
      items,
    });
  };

  return {
    handleNexusModContextMenu,
    handleNexusAssetContextMenu,
  };
}
