import React from 'react';
import { useLexicon } from '../LexiconContext';
import { SidePanel, VAULT_CHIP_CLASS } from '../shared';
import { SidePanelHeroCard, UniversalGroup } from '../components/layouts/ElevatedHubLayout';
import { useStore } from '../store';

interface WorkbenchTemplateGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WorkbenchTemplateGuide: React.FC<WorkbenchTemplateGuideProps> = ({ isOpen, onClose }) => {
  const { t } = useLexicon();
  const pushStatus = useStore(state => state.pushStatus);

  const exampleJson = `{
  "template_id": "custom_template_abcd",
  "schema_version": 2,
  "supported_mod_versions": [
    "1.0.0"
  ],
  "target_file": "my_mod_settings.cfg",
  "parser_type": "json",
  "write_scope": "active_mod_folder",
  "mod_author": "Unknown",
  "template_author": "Sanctuary OS Citizen",
  "template_version": "1.0.0",
  "categories": [
    {
      "id": "general",
      "name_key": "category_general",
      "icon_key": "icon_tune"
    }
  ],
  "settings": [
    {
      "key": "My_Group_Setting",
      "path": "My_Group_Setting",
      "type": "group",
      "label_key": "Group Setting",
      "desc_key": "A nested group of settings",
      "category": "general",
      "settings": [
        {
          "key": "My_Boolean_Setting",
          "path": "My_Boolean_Setting",
          "type": "boolean",
          "label_key": "Boolean Setting",
          "desc_key": "True or False",
          "category": "general",
          "default": false
        }
      ]
    },
    {
      "key": "My_Number_Setting",
      "path": "My_Number_Setting",
      "type": "number",
      "label_key": "Number Settings",
      "desc_key": "Predefined Number Range",
      "category": "general",
      "allow_decimals": false,
      "min": 0,
      "max": 100,
      "default": 50
    },
    {
      "key": "My_String_Setting",
      "path": "My_String_Setting",
      "type": "string",
      "label_key": "String Settings",
      "desc_key": "Custom Text Input",
      "category": "general",
      "default": "Default Text"
    },
    {
      "key": "My_Dropdown_Setting",
      "path": "My_Dropdown_Setting",
      "type": "dropdown",
      "label_key": "Dropdown Settings",
      "desc_key": "Predefined Dropdown Options",
      "category": "general",
      "options": [
        { "value": "A", "label_key": "Option A" },
        { "value": "B", "label_key": "Option B" }
      ],
      "default": "A"
    },
    {
      "key": "My_Keybinding_Setting",
      "path": "My_Keybinding_Setting",
      "type": "keybinding",
      "label_key": "Action Bind",
      "desc_key": "Press a key to bind",
      "category": "general",
      "key_format": "literal",
      "allow_multiple": false
    }
  ]
}`;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("btn_info", "Template Guide")}
      subtitle={t("guide_subtitle", "Schema v2 Reference")}
      icon={t("icon_help", "help")}
      iconColorClass="theme-text-accent"
      defaultWidth={800}
      backdropZ="z-[50000]"
      panelZ="z-[50001]"
    >
      <div className="flex flex-col gap-6 text-[var(--text)] pb-8">
        <SidePanelHeroCard
          title={t("author_guide_intro", "Workbench Template Schema")}
          subtitle={t("author_guide_fields_desc", "Define interactive visual controls for configuration files.")}
          label={t("guide_subtitle", "Schema v2 Reference")}
          badge={t("guide_subtitle", "Schema v2 Reference")}
          badgeIcon={t("icon_data_object", "data_object")}
          icon={t("icon_help", "help")}
          variant="accent"
        >
          <div className="glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2.5 text-[12px] opacity-90 leading-relaxed font-mono">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={VAULT_CHIP_CLASS}
                style={{
                  color: "var(--accent)",
                  borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))",
                }}
              >
                <span className="material-symbols-rounded !text-[12px] shrink-0">
                  {t("icon_tune", "tune")}
                </span>
                {t("auto_supported_types", "Supported Types:")}
              </span>
              <span className="text-[var(--text)]">
                boolean, number, string, dropdown, keybinding, group
              </span>
            </div>
            <div>
              <span className="text-[var(--accent)] font-bold">{t("auto_organization", "Organization:")}</span> {t("auto_create_items_in_44", "Group settings into categories for filtered tabs.")}
            </div>
            <div>
              <span className="text-[var(--accent)] font-bold">{t("author_guide_keybinds_title", "Keybindings:")}</span> {t("author_guide_keybinds_desc", "Supports literal or virtual key codes.")}
            </div>
          </div>
        </SidePanelHeroCard>

        <UniversalGroup
          title={t("auto_example_blueprint", "Example {Blueprint}")}
          icon={t("icon_data_object", "data_object")}
        >
          <div className="glass-surface rounded-2xl p-4 overflow-x-auto border border-[color-mix(in_srgb,var(--text)_10%,transparent)] font-mono text-[12px] leading-relaxed custom-scrollbar group relative">
            <button
              onClick={() => {
                navigator.clipboard.writeText(exampleJson);
                pushStatus(t("alert_copied", "Copied"), "success");
              }}
              className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity h-8 px-3 rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] text-[10px] font-black capitalize tracking-widest flex items-center gap-2 backdrop-blur-md shadow-lg cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[14px]">{t("icon_content_copy", "content_copy")}</span>
              {t("btn_copy", "Copy")}
            </button>
            <pre className="text-[var(--text)]">{exampleJson}</pre>
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
};
