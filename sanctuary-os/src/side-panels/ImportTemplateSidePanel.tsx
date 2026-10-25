import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { SidePanel, SidePanelHeroCard, UniversalGroup } from "../shared";
import WORKBENCH_TEMPLATES from "../data/workbench_templates.json";

export function ImportTemplateSidePanel({
  isOpen,
  onClose,
  onSelectTemplate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateContent: string) => void;
}) {
  const { t } = useLexicon();
  const [searchQuery, setSearchQuery] = useState("");
  const [fetchedTemplates, setFetchedTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchTemplates = async () => {
        setIsLoading(true);
        try {
          const { data, error } = await supabase
            .from("nexus_assets")
            .select("*")
            .eq("asset_type", "workbench_template");
          if (!error && data) {
            const parsed = data
              .map((d) => {
                try {
                  return JSON.parse(d.json_data);
                } catch {
                  return null;
                }
              })
              .filter(Boolean);
            setFetchedTemplates(parsed);
          }
        } catch (e) {
          console.error("Failed to fetch templates", e);
        } finally {
          setIsLoading(false);
        }
      };
      fetchTemplates();
    }
  }, [isOpen]);

  const allTemplates = [WORKBENCH_TEMPLATES, ...fetchedTemplates];

  const filteredTemplates = allTemplates.filter((template: any) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (template.template_id &&
        template.template_id.toLowerCase().includes(searchLower)) ||
      (template.mod_author &&
        template.mod_author.toLowerCase().includes(searchLower)) ||
      (template.target_file &&
        template.target_file.toLowerCase().includes(searchLower))
    );
  });

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("template_title", "Workbench Templates")}
      subtitle={t("ql_templates_desc", "Import Pre-Configured Settings Templates")}
      icon={t("icon_drive_folder_upload", "drive_folder_upload")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[580px] max-w-[100vw]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_drive_folder_upload", "drive_folder_upload")}
          overline={t("template_title", "Workbench Templates")}
          title={t("ql_templates_desc", "Select a Template to Import")}
          badge={String(filteredTemplates.length)}
          badgeIcon={t("icon_data_object", "data_object")}
          variant="accent"
        >
          <div className="relative flex items-center glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus-within:border-[var(--accent)] rounded-xl px-3.5 h-11 transition-all">
            <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)] mr-2.5">
              {t("icon_search", "search")}
            </span>
            <input
              type="text"
              placeholder={t("search_tmpl", "Search templates...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-none text-xs font-bold text-[var(--text)] focus:outline-none placeholder:text-[var(--subtext)] placeholder:opacity-50"
            />
          </div>
        </SidePanelHeroCard>

        <UniversalGroup
          title={`${t("template_title", "Templates")} (${filteredTemplates.length})`}
          icon={t("icon_data_object", "data_object")}
        >
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-2 glass-surface rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
              <span className="material-symbols-outlined !text-[28px] text-[var(--accent)] animate-spin">
                {t("icon_sync", "sync")}
              </span>
              <p className="text-xs font-black text-[var(--subtext)] uppercase tracking-wider">
                {t("ui_loading", "Loading...")}
              </p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-2 glass-surface rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
              <span className="material-symbols-outlined !text-[28px] text-[var(--subtext)] opacity-40">
                {t("icon_search_off", "search_off")}
              </span>
              <p className="text-xs font-black text-[var(--subtext)] uppercase tracking-wider">
                {t("empty_title_templates", "No Templates Found")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredTemplates.map((template: any, i: number) => (
                <button
                  key={i}
                  onClick={() =>
                    onSelectTemplate(JSON.stringify(template, null, 2))
                  }
                  className="flex flex-col gap-2.5 p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all text-left group w-full cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-3 w-full">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                        <span className="material-symbols-outlined !text-[18px]">
                          {t("icon_data_object", "data_object")}
                        </span>
                      </div>
                      <span className="font-black text-xs text-[var(--text)] truncate group-hover:text-[var(--accent)] transition-colors">
                        {template.template_id}
                      </span>
                    </div>
                    {template.target_file && (
                      <span className="px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--accent)] shrink-0">
                        {template.target_file}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between w-full pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <div className="flex items-center gap-4">
                      {template.mod_author && (
                        <span className="text-[10px] font-bold text-[var(--subtext)] flex items-center gap-1">
                          <span className="material-symbols-outlined !text-[12px]">
                            {t("icon_person", "person")}
                          </span>
                          {template.mod_author}
                        </span>
                      )}
                      {template.template_version && (
                        <span className="text-[10px] font-bold text-[var(--subtext)] flex items-center gap-1">
                          <span className="material-symbols-outlined !text-[12px]">
                            {t("icon_tag", "tag")}
                          </span>
                          {template.template_version}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1">
                      {t("btn_import", "Import")}
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_arrow_forward", "arrow_forward")}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
