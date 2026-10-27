import React, { useState } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  CustomDropdown,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "../shared";

export function PushTemplateSidePanel({
  isOpen,
  onClose,
  templateContent,
  onChange,
  onPushSuccess,
  initialName = "",
}: {
  isOpen: boolean;
  onClose: () => void;
  templateContent: string;
  onChange?: (newContent: string) => void;
  onPushSuccess?: (newName: string, newJson: string) => void;
  initialName?: string;
}) {
  const { t } = useLexicon();
  const pushStatus = useStore((state) => state.pushStatus);
  const session = useStore((state) => state.session);
  const modList = useStore((state) => state.modList) || [];
  const [isUploading, setIsUploading] = useState(false);

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [attachedMod, setAttachedMod] = useState("");
  const [targetFile, setTargetFile] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [language, setLanguage] = useState("English");
  const [existingTemplates, setExistingTemplates] = useState<any[]>([]);
  const [selectedUpdateId, setSelectedUpdateId] = useState<string>("new");

  React.useEffect(() => {
    if (isOpen) {
      try {
        const parsed = JSON.parse(templateContent);
        if (parsed.target_file) setTargetFile(parsed.target_file);
        if (parsed.version || parsed.template_version)
          setVersion(parsed.version || parsed.template_version);
        if (parsed.language) setLanguage(parsed.language);
        if (parsed.name && !initialName) setName(parsed.name);
      } catch (e) {}
    }
  }, [isOpen]);

  React.useEffect(() => {
    const fetchTemplates = async () => {
      if (!session?.user?.id) return;
      if (
        !navigator.onLine ||
        localStorage.getItem("sanctuary_local_only") === "true"
      )
        return;
      let authorName = session.user.user_metadata?.username || "Citizen";
      const fallbackName = session.user.user_metadata?.username || "Citizen";
      const { data: mData } = await supabase
        .from("masons")
        .select("name")
        .eq("profile_id", session.user.id)
        .single();
      if (mData && mData.name) authorName = mData.name;

      const { data } = await supabase
        .from("nexus_assets")
        .select("*")
        .or(
          `author.ilike.%${authorName}%,author.ilike.%Citizen%,author.ilike.%Sanctuary%,author.ilike.%${fallbackName}%`
        )
        .eq("asset_type", "workbench_template");
      if (data) {
        setExistingTemplates(data);

        let parsedName = initialName;
        let parsedTemplateId = "";
        try {
          const parsed = JSON.parse(templateContent);
          if (parsed.name) parsedName = parsed.name;
          if (parsed.template_id) parsedTemplateId = parsed.template_id;
        } catch (e) {}
        const match = data.find((tItem) => {
          if (parsedTemplateId && tItem.json_data) {
            try {
              const tParsed =
                typeof tItem.json_data === "string"
                  ? JSON.parse(tItem.json_data)
                  : tItem.json_data;
              const tId =
                tParsed.template_id ||
                (Array.isArray(tParsed) ? tParsed[0]?.template_id : undefined);
              if (tId === parsedTemplateId) return true;
            } catch (e) {}
          }
          return tItem.name === parsedName || tItem.name === initialName;
        });
        if (match) {
          setSelectedUpdateId(match.id);
          setName(match.name || "");
          setDescription(match.description || "");
          setReleaseNotes(match.release_notes || "");
          if (match.language) setLanguage(match.language);
        }
      }
    };
    fetchTemplates();
  }, [session]);

  const handleSelectUpdate = (val: string[]) => {
    const id = val[0];
    setSelectedUpdateId(id);
    if (id === "new") {
      setName(initialName);
      setDescription("");
      setReleaseNotes("");
    } else {
      const tmpl = existingTemplates.find((tItem) => tItem.id === id);
      if (tmpl) {
        setName(tmpl.name || "");
        setDescription(tmpl.description || "");
        setReleaseNotes(tmpl.release_notes || "");
        if (tmpl.language) setLanguage(tmpl.language);
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) return;

    setIsUploading(true);
    try {
      let finalJson = templateContent;
      try {
        const parsed = JSON.parse(templateContent);
        if (attachedMod) {
          parsed.target_mod = attachedMod;
        }
        if (targetFile.trim()) {
          parsed.target_file = targetFile.trim();
        }
        parsed.version = version.trim();
        parsed.language = language;
        parsed.name = name.trim();
        finalJson = JSON.stringify(parsed, null, 2);
      } catch (err) {
        throw new Error(t("upload_invalid_json", "Invalid JSON template."));
      }

      let authorName = session?.user?.user_metadata?.username || "Citizen";
      if (session?.user?.id) {
        const { data: mData } = await supabase
          .from("masons")
          .select("name")
          .eq("profile_id", session.user.id)
          .single();
        if (mData && mData.name) {
          authorName = mData.name;
        }
      }

      const payload = {
        asset_type: "workbench_template",
        name: name.trim(),
        author: authorName,
        author_id: session?.user?.id,
        description: description.trim() || "A custom workbench template.",
        release_notes: releaseNotes.trim(),
        json_data: finalJson,
        language: language,
      };

      const { data: existingList, error: checkError } = await supabase
        .from("nexus_assets")
        .select("id")
        .eq("name", payload.name)
        .or(`author_id.eq.${session?.user?.id},author.eq.${payload.author}`)
        .eq("asset_type", payload.asset_type);

      if (checkError) throw checkError;

      if (existingList && existingList.length > 0) {
        const { error } = await supabase
          .from("nexus_assets")
          .update(payload)
          .eq("id", existingList[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("nexus_assets")
          .insert([payload]);
        if (error) throw error;
      }

      pushStatus(
        t("status_template_published", "Template successfully published to the Nexus!"),
        "success"
      );
      if (onChange) onChange(finalJson);
      if (onPushSuccess) onPushSuccess(name.trim(), finalJson);
      onClose();
    } catch (e: any) {
      pushStatus(
        e.message || t("status_template_push_failed", "Failed to push template."),
        "error"
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("author_push", "Push To {Nexus}")}
      subtitle={t("upload_push_subtitle", "Publish your template to the global {Nexus} to share it with the community.")}
      icon={t("icon_cloud_upload", "cloud_upload")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[540px] max-w-[100vw]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_publish", "publish")}
            variant="success"
            tooltip={
              isUploading
                ? t("uploading", "Uploading...")
                : t("market_upload_btn", "Publish To {Nexus}")
            }
            onClick={() => handleSubmit()}
            disabled={!name.trim() || isUploading}
          />
        </PanelHeaderGroup>
      }
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8"
      >
        <SidePanelHeroCard
          icon={t("icon_cloud_upload", "cloud_upload")}
          overline={t("author_push", "Push To {Nexus}")}
          title={name.trim() || t("upload_template_name", "Workbench Template")}
          description={t("upload_push_subtitle", "Publish your template to the global {Nexus} to share it with the community.")}
          badge={`v${version}`}
          badgeIcon={t("icon_tag", "tag")}
          variant="accent"
        />

        <UniversalGroup
          title={t("upload_template_name", "Template Configuration")}
          icon={t("icon_data_object", "data_object")}
        >
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                {t("upload_update_existing", "Target Slot")}
              </label>
              <CustomDropdown
                disableTint={true}
                value={selectedUpdateId}
                onChange={handleSelectUpdate}
                options={[
                  {
                    id: "new",
                    label: t("label_create_new_template", "Create New Template"),
                  },
                  ...existingTemplates.map((tmpl) => ({
                    id: tmpl.id,
                    label: tmpl.name,
                  })),
                ]}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                {t("upload_template_name", "Template Name")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t(
                  "upload_template_name_placeholder",
                  "Enter template name..."
                )}
                className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-black text-[var(--text)] focus:outline-none transition-all"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                {t("upload_target_file", "Target Config File")}
              </label>
              <input
                type="text"
                value={targetFile}
                onChange={(e) => setTargetFile(e.target.value)}
                placeholder={t("auto_e_g_mc_24", "e.g. mc_settings.cfg")}
                className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-mono text-[var(--text)] focus:outline-none transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                  {t("tab_lexicons", "Language")}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={language}
                  onChange={(val: string[]) => setLanguage(val[0])}
                  options={[
                    { id: "English", label: "English" },
                    { id: "Spanish", label: "Spanish" },
                    { id: "French", label: "French" },
                    { id: "German", label: "German" },
                    { id: "Italian", label: "Italian" },
                    { id: "Portuguese", label: "Portuguese" },
                    { id: "Russian", label: "Russian" },
                    { id: "Japanese", label: "Japanese" },
                    { id: "Korean", label: "Korean" },
                    { id: "Chinese", label: "Chinese" },
                  ]}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                  {t("label_version", "Version")}
                </label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => {
                    const newVersion = e.target.value;
                    setVersion(newVersion);
                    if (onChange) {
                      try {
                        const parsed = JSON.parse(templateContent);
                        if (parsed.template_version !== undefined) {
                          parsed.template_version = newVersion;
                        } else {
                          parsed.version = newVersion;
                        }
                        onChange(JSON.stringify(parsed, null, 2));
                      } catch (err) {}
                    }
                  }}
                  placeholder="1.0.0"
                  className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-black text-[var(--text)] focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                {t("upload_attach_mod", "Attach To {Mod} (Optional)")}
              </label>
              <CustomDropdown
                disableTint={true}
                value={attachedMod}
                onChange={(val: any) => setAttachedMod(val[0] || "")}
                options={[
                  { id: "", label: t("upload_attach_mod_none", "None") },
                  ...modList
                    .filter(
                      (m: any) =>
                        !m.isVirtual &&
                        !m.name?.startsWith("FOLDER_") &&
                        !m.name?.startsWith("SET_") &&
                        !m.name?.startsWith("LOCAL_SET_") &&
                        Boolean(m.isSynced && m.dbId) &&
                        Number(m.compliance_tier || 0) === 0 &&
                        String(m.status || "").toLowerCase() !== "unverified"
                    )
                    .map((mod: any) => ({
                      id: mod.name || mod.id,
                      label: mod.displayName || mod.name || "Unknown Mod",
                    })),
                ]}
                placeholder={t("auto_select_a_mod", "Select a {Mod}")}
                searchable={true}
              />
            </div>
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={t("upload_desc", "Documentation & Release Notes")}
          icon={t("icon_description", "description")}
        >
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                {t("upload_desc", "Description")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t(
                  "upload_desc_placeholder",
                  "Describe this template..."
                )}
                className="w-full h-28 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl p-3.5 text-xs font-medium text-[var(--text)] resize-none focus:outline-none transition-all custom-scrollbar"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                {t("whats_new", "What's New")}
              </label>
              <textarea
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                placeholder={t("update_panel_no_notes", "Release notes...")}
                className="w-full h-24 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl p-3.5 text-xs font-medium text-[var(--text)] resize-none focus:outline-none transition-all custom-scrollbar"
              />
            </div>
          </div>
        </UniversalGroup>

        {templateContent &&
          (() => {
            let parsed: any = null;
            try {
              parsed =
                typeof templateContent === "string"
                  ? JSON.parse(templateContent)
                  : templateContent;
              if (Array.isArray(parsed)) parsed = parsed[0];
            } catch (e) {}
            if (!parsed) return null;
            return (
              <UniversalGroup
                title={t("auto_detected_architecture", "Detected Architecture")}
                icon={t("icon_info", "info")}
              >
                <div className="grid grid-cols-2 gap-3">
                  {parsed.template_id && (
                    <StatBox
                      label={t("auto_template_id", "Template ID")}
                      value={parsed.template_id}
                      icon={t("icon_fingerprint", "fingerprint")}
                    />
                  )}
                  {parsed.parser_type && (
                    <StatBox
                      label={t("auto_parser", "Parser")}
                      value={parsed.parser_type}
                      icon={t("icon_code", "code")}
                    />
                  )}
                  {parsed.mod_author && (
                    <StatBox
                      label={t("auto_mod_author", "{Mod} Author")}
                      value={parsed.mod_author}
                      icon={t("icon_person", "person")}
                    />
                  )}
                  {parsed.write_scope && (
                    <StatBox
                      label={t("workbench_write_scope", "Write Scope")}
                      value={parsed.write_scope}
                      icon={t("icon_folder", "folder")}
                    />
                  )}
                </div>
              </UniversalGroup>
            );
          })()}
      </form>
    </SidePanel>
  );
}
