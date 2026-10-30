import { useEffect, useRef, useState } from "react";
import { SidePanel, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import { ChameleonControlDashboard } from "../chameleon-components/ChameleonControlDashboard";
import { ChameleonSandboxPreview } from "../chameleon-components/ChameleonSandboxPreview";
import {
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
  const [livePreview, setLivePreview] = useState(false);
  const initialSnapshotRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      setLivePreview(false);
      initialSnapshotRef.current = currentTheme
        ? JSON.parse(JSON.stringify(currentTheme))
        : null;
    }
  }, [isOpen]);

  const handleUpdateTheme = (updates: any) => {
    updateActiveTheme(updates);
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={() => {
        setLivePreview(false);
        onClose();
      }}
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
            icon={
              livePreview
                ? t("icon_visibility", "visibility")
                : t("icon_visibility_off", "visibility_off")
            }
            tooltip={
              livePreview
                ? t("ui_os_preview_on", "Live Preview On")
                : t("ui_os_preview_off", "Live Preview Off")
            }
            variant={livePreview ? "success" : "default"}
            onClick={() => setLivePreview((prev) => !prev)}
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
          <PanelHeaderButton
            icon={t("icon_content_copy", "content_copy")}
            tooltip={t("forge_btn_copy_json", "Copy JSON")}
            onClick={() => {
              try {
                navigator.clipboard.writeText(JSON.stringify(currentTheme, null, 2));
                pushStatus?.(
                  t("forge_status_copied_json", "{Chameleon} JSON copied to clipboard.")
                );
              } catch {
                // ignore clipboard errors
              }
            }}
          />
          <PanelHeaderButton
            icon={t("icon_restart_alt", "restart_alt")}
            tooltip={t("btn_reset", "Reset")}
            onClick={() => {
              if (initialSnapshotRef.current) {
                handleUpdateTheme(initialSnapshotRef.current);
                pushStatus?.(t("ui_theme_reset", "Theme Reset"));
              }
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
          livePreview={livePreview}
          onToggleLivePreview={() => setLivePreview((prev) => !prev)}
          isActiveOnOs={true}
          themeBadge={t("ui_system_theme", "System Theme")}
        />
        <ChameleonSandboxPreview currentTheme={currentTheme} />
      </div>
    </SidePanel>
  );
}
