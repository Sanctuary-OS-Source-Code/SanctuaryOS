import { useState, useEffect, useMemo } from "react";
import { useLexicon } from "./LexiconContext";
import { ActionPill, EmptyState } from "./shared";
import { WorkbenchCategoryBar } from "./workbench/WorkbenchSidePanel";
import {
  WorkbenchVisualEditor,
  countModifiedSettings,
} from "./workbench/WorkbenchVisualEditor";
import { writeDataPathValue } from "./workbench/workbenchFormatUtils";

interface TemplatePreviewerProps {
  templateData: any;
  compact?: boolean;
}

export default function TemplatePreviewer({
  templateData,
  compact = true,
}: TemplatePreviewerProps) {
  const { t } = useLexicon();
  const [previewCategory, setPreviewCategory] = useState<string>("ALL");
  const [previewSearchQuery, setPreviewSearchQuery] = useState<string>("");
  const [previewSandboxData, setPreviewSandboxData] = useState<any>({});

  const resolvedTemplate = useMemo(() => {
    if (!templateData) return null;
    let candidate = templateData;
    if (typeof candidate === "string") {
      try {
        candidate = JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    return Array.isArray(candidate) ? candidate[0] : candidate;
  }, [templateData]);

  const settings = useMemo(
    () => (Array.isArray(resolvedTemplate?.settings) ? resolvedTemplate.settings : []),
    [resolvedTemplate]
  );

  const categories = useMemo(
    () => (Array.isArray(resolvedTemplate?.categories) ? resolvedTemplate.categories : []),
    [resolvedTemplate]
  );

  useEffect(() => {
    setPreviewCategory("ALL");
    setPreviewSearchQuery("");
    setPreviewSandboxData({});
  }, [resolvedTemplate?.template_id, resolvedTemplate?.target_file, settings.length]);

  const resolveText = (k?: string, fallback?: string) => {
    if (!k) return fallback || "";
    const tr = t(k, fallback || k);
    if (tr === `[${k}]`) return fallback || k;
    return tr;
  };

  const sandboxModifiedCount = useMemo(() => {
    if (!settings.length) return 0;
    return countModifiedSettings(settings, previewSandboxData);
  }, [settings, previewSandboxData]);

  const handlePreviewVisualChange = (dataPath: string, value: any) => {
    setPreviewSandboxData((prev: any) => {
      const next = JSON.parse(JSON.stringify(prev || {}));
      writeDataPathValue(next, dataPath, value);
      return next;
    });
  };

  if (!settings || settings.length === 0) {
    return (
      <EmptyState
        icon={t("icon_visibility_off", "visibility_off")}
        title={t("no_visual_template", "No Visual Template Available")}
        minHeightClass="min-h-[280px]"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex flex-col gap-2.5">
        <ActionPill
          className="w-full"
          searchQuery={previewSearchQuery}
          setSearchQuery={setPreviewSearchQuery}
          searchPlaceholder={t("diff_search_settings", "Search settings...")}
          actions={
            sandboxModifiedCount > 0
              ? [
                  {
                    id: "reset_preview",
                    icon: (
                      <span className="material-symbols-outlined !text-[18px]">
                        {t("icon_restart_alt", "restart_alt")}
                      </span>
                    ),
                    label: `${t("reset_defaults", "Reset")} (${sandboxModifiedCount})`,
                    onClick: () => setPreviewSandboxData({}),
                  },
                ]
              : undefined
          }
        />
        {categories.length > 0 && (
          <WorkbenchCategoryBar
            categories={categories}
            settings={settings}
            selectedCategory={previewCategory}
            onSelectCategory={(catId) => setPreviewCategory(catId)}
            resolveText={resolveText}
            t={t}
            compact={compact}
          />
        )}
      </div>

      <WorkbenchVisualEditor
        settings={settings}
        categories={categories}
        dataSource={previewSandboxData}
        isPreview={false}
        selectedCategory={previewCategory}
        searchQuery={previewSearchQuery}
        onVisualChange={handlePreviewVisualChange}
      />
    </div>
  );
}
