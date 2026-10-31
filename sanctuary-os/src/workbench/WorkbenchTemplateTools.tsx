import React from 'react';
import { CustomDropdown, HoverTooltip } from '../shared';

interface WorkbenchTemplateToolsProps {
   parsedData: any;
   rawText: string;
   setRawText: (val: string) => void;
   files: any[];
   t: (k: string, f?: string) => string;
   handleInsertSnippet: (snippet: string) => void;
   handleAutoMap?: () => void;
}

export const WorkbenchTemplateTools: React.FC<WorkbenchTemplateToolsProps> = ({
   parsedData,
   rawText,
   setRawText,
   files,
   t,
   handleInsertSnippet,
   handleAutoMap
}) => {
   return (
      <div className="flex items-center justify-between flex-wrap gap-3 shrink-0 glass-panel rounded-2xl p-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
         {parsedData && (
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
               <CustomDropdown
                  className="h-9 w-full max-w-[280px]"
                  buttonClassName="!h-9 !px-3.5 !rounded-xl glass-surface !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !text-[11px] font-bold"
                  value={parsedData.target_file ? [parsedData.target_file] : []}
                  onChange={(val: string[]) => {
                     try {
                        const parsed = JSON.parse(rawText || '{}');
                        parsed.target_file = val[0];
                        setRawText(JSON.stringify(parsed, null, 2));
                     } catch (e) { alert(t("err_invalid_json", "Invalid JSON")); }
                  }}
                  options={[
                     ...files.filter((f: any) => !f.name.toLowerCase().endsWith('.json')).map((f: any) => ({ id: f.path.split(/[\\/]/).pop() || f.name, label: f.path.split(/[\\/]/).pop() || f.name })),
                     ...(parsedData.target_file && !files.find((f: any) => f.name.toLowerCase() === parsedData.target_file.toLowerCase())
                        ? [{ id: parsedData.target_file, label: parsedData.target_file }]
                        : [])
                  ]}
                  placeholder={t("ui_placeholder_target_file", "Select target file...")}
                  disableTint={true}
               />
            </div>
         )}
         <div className="flex items-center flex-wrap gap-1.5">
            {handleAutoMap && (
               <div className="relative group flex mr-1 border-r border-[color-mix(in_srgb,var(--text)_10%,transparent)] pr-2.5">
                  <button onClick={handleAutoMap} className="w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:sa-glass-pill-active text-[var(--accent)] cursor-pointer">
                     <span className="material-symbols-outlined !text-[16px]">{t("icon_auto_fix_high", "auto_fix_high")}</span>
                  </button>
                  <HoverTooltip title={t("workbench_btn_automap", "Auto-Map Target Keys")} variant="info" className="mb-2" />
               </div>
            )}
            <div className="relative group flex">
               <button onClick={() => {
                  try {
                     const parsed = JSON.parse(rawText || '{}');
                     if (!parsed.categories) parsed.categories = [];
                     parsed.categories.push({ id: "new_category", name_key: "New Category", icon_key: "folder" });
                     setRawText(JSON.stringify(parsed, null, 2));
                  } catch (e) { alert(t("err_invalid_json", "Invalid JSON")); }
               }} className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center transition-all text-[var(--subtext)] hover:text-[var(--accent)] cursor-pointer">
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_create_new_folder", "create_new_folder")}</span>
               </button>
               <HoverTooltip title={t("category", "Category")} variant="info" className="mb-2" />
            </div>
            <div className="relative group flex">
               <button onClick={() => {
                  handleInsertSnippet(`{\n  "key": "New_Group",\n  "path": "New_Group",\n  "type": "group",\n  "label_key": "Group Setting",\n  "desc_key": "Group of nested settings",\n  "category": "general",\n  "settings": []\n}`);
               }} className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center transition-all text-[var(--subtext)] hover:text-[var(--accent)] cursor-pointer">
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_account_tree", "account_tree")}</span>
               </button>
               <HoverTooltip title={t("workbench_add_group", "Group")} variant="info" className="mb-2" />
            </div>
            <div className="relative group flex">
               <button onClick={() => {
                  handleInsertSnippet(`{\n  "key": "New_Boolean",\n  "path": "New_Boolean",\n  "type": "boolean",\n  "label_key": "Boolean Setting",\n  "desc_key": "True or False",\n  "category": "general",\n  "default": false\n}`);
               }} className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center transition-all text-[var(--subtext)] hover:text-[var(--accent)] cursor-pointer">
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_toggle_on", "toggle_on")}</span>
               </button>
               <HoverTooltip title={t("workbench_add_boolean", "Boolean")} variant="info" className="mb-2" />
            </div>
            <div className="relative group flex">
               <button onClick={() => {
                  handleInsertSnippet(`{\n  "key": "New_Number",\n  "path": "New_Number",\n  "type": "number",\n  "label_key": "Number Setting",\n  "desc_key": "Description",\n  "category": "general",\n  "allow_decimals": false,\n  "min": 0,\n  "max": 100,\n  "default": 50\n}`);
               }} className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center transition-all text-[var(--subtext)] hover:text-[var(--accent)] cursor-pointer">
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_pin", "pin")}</span>
               </button>
               <HoverTooltip title={t("workbench_add_number", "Number")} variant="info" className="mb-2" />
            </div>
            <div className="relative group flex">
               <button onClick={() => {
                  handleInsertSnippet(`{\n  "key": "New_Range",\n  "path": "New_Range",\n  "type": "tuple",\n  "label_key": "Range Setting",\n  "desc_key": "Comma-separated min/max bounds",\n  "category": "general",\n  "allow_decimals": false,\n  "min": -100,\n  "max": 100,\n  "step": 1,\n  "default": "-100,100"\n}`);
               }} className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center transition-all text-[var(--subtext)] hover:text-[var(--accent)] cursor-pointer">
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_swap_horiz", "swap_horiz")}</span>
               </button>
               <HoverTooltip title={t("workbench_add_tuple", "Range / Tuple")} variant="info" className="mb-2" />
            </div>
            <div className="relative group flex">
               <button onClick={() => {
                  handleInsertSnippet(`{\n  "key": "New_String",\n  "path": "New_String",\n  "type": "string",\n  "label_key": "String Setting",\n  "desc_key": "Description",\n  "category": "general",\n  "default": ""\n}`);
               }} className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center transition-all text-[var(--subtext)] hover:text-[var(--accent)] cursor-pointer">
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_title", "title")}</span>
               </button>
               <HoverTooltip title={t("workbench_add_string", "Text")} variant="info" className="mb-2" />
            </div>
            <div className="relative group flex">
               <button onClick={() => {
                  handleInsertSnippet(`{\n  "key": "New_Dropdown",\n  "path": "New_Dropdown",\n  "type": "dropdown",\n  "label_key": "Dropdown Setting",\n  "desc_key": "Description",\n  "category": "general",\n  "options": [\n    {\n      "value": "opt1",\n      "label_key": "Option 1"\n    }\n  ],\n  "default": "opt1"\n}`);
               }} className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center transition-all text-[var(--subtext)] hover:text-[var(--accent)] cursor-pointer">
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_dropdown", "arrow_drop_down_circle")}</span>
               </button>
               <HoverTooltip title={t("support_type_dropdown", "Dropdown")} variant="info" className="mb-2" />
            </div>
            <div className="relative group flex">
               <button onClick={() => {
                  handleInsertSnippet(`{\n  "key": "New_Keybinding",\n  "path": "New_Keybinding",\n  "type": "keybinding",\n  "label_key": "Keybinding Setting",\n  "desc_key": "Bind a key",\n  "category": "general",\n  "key_format": "literal",\n  "allow_multiple": false\n}`);
               }} className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center transition-all text-[var(--subtext)] hover:text-[var(--accent)] cursor-pointer">
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_keyboard", "keyboard")}</span>
               </button>
               <HoverTooltip title={t("workbench_add_keybinding", "Keybind")} variant="info" className="mb-2" />
            </div>
         </div>
      </div>
   );
};
