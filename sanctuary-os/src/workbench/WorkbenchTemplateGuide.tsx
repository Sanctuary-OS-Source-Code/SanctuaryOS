import React from 'react';
import { useLexicon } from '../LexiconContext';
import { SidePanel } from '../shared';
import { useStore } from '../store';

interface WorkbenchTemplateGuideProps {
   isOpen: boolean;
   onClose: () => void;
}

export const WorkbenchTemplateGuide: React.FC<WorkbenchTemplateGuideProps> = ({ isOpen, onClose }) => {
   const { t } = useLexicon();
   const pushStatus = useStore(state => state.pushStatus);

   return (
      <SidePanel
         isOpen={isOpen}
         onClose={onClose}
         title={t("guide_title") || "Template Guide"}
         subtitle={t("guide_subtitle") || "Workbench"}
         icon="help"
         iconColorClass="theme-text-accent"
         defaultWidth={800}
         backdropZ="z-[50000]"
         panelZ="z-[50001]"
      >
         <div className="p-8 flex flex-col gap-6 text-[var(--text)] h-full overflow-y-auto custom-scrollbar">
            <div className="theme-glass-panel p-6 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] relative overflow-hidden shrink-0">

               <h3 className="text-md font-black uppercase tracking-widest text-[var(--accent)] mb-2">{t("author_guide_intro")}</h3>
               <p className="text-[12px] opacity-80 leading-relaxed font-mono whitespace-pre-wrap">
                  {t("author_guide_fields_desc")}
                  <br /><br />
                  <span className="text-[var(--accent)]">{t("auto_supported_types")}</span> {t("auto_boolean_number_string")}, group
                  <br />
                  <span className="text-[var(--accent)]">{t("auto_organization")}</span> {t("auto_create_items_in_the_categories_array_to")}
               </p>
            </div>

            <div className="flex flex-col gap-4">
               <h4 className="text-sm font-black uppercase tracking-widest opacity-60 ml-2">{t("auto_example_blueprint")}</h4>
               <div className="theme-glass-panel rounded-2xl p-4 overflow-x-auto border border-white/10 font-mono text-[12px] leading-relaxed custom-scrollbar bg-black/20 group relative">
                  <button
                     onClick={() => {
                        navigator.clipboard.writeText(`{
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
      "desc_key": "Perdefinded Number Range",
      "category": "general",
      "min": 0,
      "max": 100,
      "default": 50
    },
    {
      "key": "My_String_Setting",
      "path": "My_String_Setting",
      "type": "string",
      "label_key": "String Settings",
      "desc_key": "Freeform Text Field",
      "category": "general",
      "default": "Sanctuary OS is pretty rad"
    },
    {
      "key": "My_Dropdown_Setting",
      "path": "My_Dropdown_Setting",
      "type": "dropdown",
      "label_key": "Dropdown Setting",
      "desc_key": "Select an Option",
      "category": "general",
      "options": [
        { "value": "opt1", "label_key": "Option 1" },
        { "value": "opt2", "label_key": "Option 2" }
      ],
      "default": "opt1"
    }
  ]
}`);
                        pushStatus(t("alert_copied") || "COPIED", "success");
                     }}
                     className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity h-8 px-3 rounded-lg bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 border border-[var(--accent)]/30 text-[var(--accent)] text-[10px] font-black uppercase tracking-widest flex items-center gap-2 backdrop-blur-md shadow-lg"
                  >
                     <span className="material-symbols-outlined !text-[14px]">{t("icon_content_copy")}</span>
                     {t("matrix_btn_copy") || "COPY"}
                  </button>
                  <pre className="text-[var(--text)]">
                     {`{
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
      "desc_key": "Perdefinded Number Range",
      "category": "general",
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
    }
  ]
}`}
                  </pre>
               </div>
            </div>
         </div>
      </SidePanel>
   );
};
