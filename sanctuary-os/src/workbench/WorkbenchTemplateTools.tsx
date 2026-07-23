import React from 'react';
import { CustomDropdown, HoverTooltip } from '../shared';

interface WorkbenchTemplateToolsProps {
   parsedData: any;
   rawText: string;
   setRawText: (val: string) => void;
   files: any[];
   t: (k: string) => string;
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
      <div className="flex items-center flex-wrap gap-6 shrink-0">
         {parsedData && (
            <div className="flex items-center gap-2 pl-2">
               <span className="opacity-50 uppercase tracking-widest text-[9px] font-black pointer-events-none">TARGET:</span>
               <div className="min-w-[200px] w-fit max-w-[400px]">
                  <CustomDropdown
                     value={parsedData.target_file ? [parsedData.target_file] : []}
                     onChange={(val: string[]) => {
                        try {
                           const parsed = JSON.parse(rawText || '{}');
                           parsed.target_file = val[0];
                           setRawText(JSON.stringify(parsed, null, 2));
                        } catch (e) { alert(t("err_invalid_json") || "Invalid JSON"); }
                     }}
                     options={[
                        ...files.filter((f: any) => !f.name.toLowerCase().endsWith('.json')).map((f: any) => ({ id: f.path.split(/[\\/]/).pop() || f.name, label: f.path.split(/[\\/]/).pop() || f.name })),
                        ...(parsedData.target_file && !files.find((f: any) => f.name.toLowerCase() === parsedData.target_file.toLowerCase()) 
                              ? [{ id: parsedData.target_file, label: parsedData.target_file }] 
                              : [])
                     ]}
                     placeholder={t("ui_placeholder_target_file") || "Select Target"}
                     disableTint={true}
                  />
               </div>
            </div>
         )}
         <div className="flex items-center gap-1">
            {handleAutoMap && (
               <div className="relative group flex mr-2 border-r border-white/10 pr-3">
                  <button onClick={handleAutoMap} className="w-8 h-8 rounded-full flex items-center justify-center transition-all bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)]">
                     <span className="material-symbols-outlined !text-[16px]">auto_fix_high</span>
                  </button>
                  <HoverTooltip title="Auto-Map from Target File" variant="info" className="mb-2" />
               </div>
            )}
            <span className="text-[10px] font-black uppercase tracking-widest opacity-50 mr-2 ml-2">Insert:</span>
            <div className="relative group flex">
               <button onClick={() => {
                  try {
                     const parsed = JSON.parse(rawText || '{}');
                     if (!parsed.categories) parsed.categories = [];
                     parsed.categories.push({ id: "new_category", name_key: "New Category", icon_key: "folder" });
                     setRawText(JSON.stringify(parsed, null, 2));
                  } catch (e) { alert(t("err_invalid_json") || "Invalid JSON"); }
               }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-[var(--text)] opacity-50 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <span className="material-symbols-outlined !text-[16px]">folder</span>
               </button>
               <HoverTooltip title="Category" variant="info" className="mb-2" />
            </div>
            <div className="relative group flex">
               <button onClick={() => {
                  handleInsertSnippet(`{\n  "key": "New_Group",\n  "path": "New_Group",\n  "type": "group",\n  "label_key": "Group Setting",\n  "desc_key": "Group of nested settings",\n  "category": "general",\n  "settings": []\n}`);
               }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-[var(--text)] opacity-50 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <span className="material-symbols-outlined !text-[16px]">account_tree</span>
               </button>
               <HoverTooltip title="Group" variant="info" className="mb-2" />
            </div>
            <div className="relative group flex">
               <button onClick={() => {
                  handleInsertSnippet(`{\n  "key": "New_Boolean",\n  "path": "New_Boolean",\n  "type": "boolean",\n  "label_key": "Boolean Setting",\n  "desc_key": "True or False",\n  "category": "general",\n  "default": false\n}`);
               }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-[var(--text)] opacity-50 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <span className="material-symbols-outlined !text-[16px]">toggle_on</span>
               </button>
               <HoverTooltip title="Boolean" variant="info" className="mb-2" />
            </div>
            <div className="relative group flex">
               <button onClick={() => {
                  handleInsertSnippet(`{\n  "key": "New_Number",\n  "path": "New_Number",\n  "type": "number",\n  "label_key": "Number Setting",\n  "desc_key": "Description",\n  "category": "general",\n  "allow_decimals": false,\n  "min": 0,\n  "max": 100,\n  "default": 50\n}`);
               }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-[var(--text)] opacity-50 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <span className="material-symbols-outlined !text-[16px]">123</span>
               </button>
               <HoverTooltip title="Number" variant="info" className="mb-2" />
            </div>
            <div className="relative group flex">
               <button onClick={() => {
                  handleInsertSnippet(`{\n  "key": "New_String",\n  "path": "New_String",\n  "type": "string",\n  "label_key": "String Setting",\n  "desc_key": "Description",\n  "category": "general",\n  "default": ""\n}`);
               }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-[var(--text)] opacity-50 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <span className="material-symbols-outlined !text-[16px]">title</span>
               </button>
               <HoverTooltip title="String" variant="info" className="mb-2" />
            </div>
            <div className="relative group flex">
               <button onClick={() => {
                  handleInsertSnippet(`{\n  "key": "New_Dropdown",\n  "path": "New_Dropdown",\n  "type": "dropdown",\n  "label_key": "Dropdown Setting",\n  "desc_key": "Description",\n  "category": "general",\n  "options": [\n    {\n      "value": "opt1",\n      "label_key": "Option 1"\n    }\n  ],\n  "default": "opt1"\n}`);
               }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-[var(--text)] opacity-50 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <span className="material-symbols-outlined !text-[16px]">arrow_drop_down_circle</span>
               </button>
               <HoverTooltip title="Dropdown" variant="info" className="mb-2" />
            </div>
         </div>
      </div>
   );
};
