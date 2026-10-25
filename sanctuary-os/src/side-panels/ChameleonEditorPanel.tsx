import React from "react";
import { SidePanel, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import { ChameleonControlDashboard } from "../chameleon-components/ChameleonControlDashboard";
import { ChameleonSandboxPreview } from "../chameleon-components/ChameleonSandboxPreview";
import {
  autoHarmonizeThemeColors,
  exportThemeWithAssets,
  importThemeWithAssets,
} from "../chameleon-components/ChameleonShared";
import { useStore } from "../store";

export function ChameleonEditorPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useLexicon();
  const { currentTheme, activeThemeId, updateActiveTheme, renameTheme } = useTheme();
  const pushStatus = useStore((state) => state.pushStatus);

  const handleUpdateTheme = (updates: any) => {
    updateActiveTheme(updates);
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("ui_theme_editor", "Chameleon Editor")}
      subtitle={t("ui_system_theme", "Live Liquid Glass Theme Forge")}
      icon={t("icon_palette", "palette")}
      iconColorClass="theme-text-accent"
      isResizable={true}
      defaultWidth={1400}
      noPadding={true}
      noScroll={true}
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_contrast", "contrast")}
            tooltip={t("forge_btn_auto_contrast", "Auto-Harmonize")}
            onClick={() => {
              const harmonized = autoHarmonizeThemeColors(currentTheme);
              handleUpdateTheme(harmonized);
              pushStatus?.(
                t(
                  "forge_status_harmonized",
                  "Text & surface contrast automatically harmonized."
                )
              );
            }}
          />
          <PanelHeaderButton
            icon={t("icon_download", "download")}
            tooltip={t("btn_import", "Import")}
            onClick={async () => {
              const res = await importThemeWithAssets({ t, pushStatus });
              if (res?.theme) {
                handleUpdateTheme(res.theme);
              } else if (res?.imageOnlyDataUrl) {
                handleUpdateTheme({ bgImage: res.imageOnlyDataUrl });
              }
            }}
          />
          <PanelHeaderButton
            icon={t("icon_upload", "upload")}
            tooltip={t("btn_export", "Export")}
            onClick={() => {
              exportThemeWithAssets(currentTheme, {
                t,
                pushStatus,
              });
            }}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex-1 flex flex-col lg:flex-row w-full h-full min-h-0 overflow-hidden">
        <ChameleonControlDashboard
          currentTheme={currentTheme}
          handleUpdateTheme={handleUpdateTheme}
          editingThemeId={activeThemeId}
          renameTheme={renameTheme}
        />
        <ChameleonSandboxPreview currentTheme={currentTheme} />
      </div>
    </SidePanel>
  );
}
