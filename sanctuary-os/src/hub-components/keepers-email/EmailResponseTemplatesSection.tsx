import { useEffect, useMemo, useState, type MouseEvent, type MutableRefObject } from "react";
import { useLexicon } from "../../LexiconContext";
import {
  ActionButton,
  PanelHeaderButton,
  PanelHeaderGroup,
  SidePanel,
  VAULT_CHIP_CLASS,
} from "../../shared";
import { UniversalCard } from "../../components/universal/UniversalCard";
import { HubListGrid } from "../../components/layouts/ElevatedHubLayout";
import { CommandScreenSectionHeading } from "../SharedCommandScreenLayout";
import {
  UniversalGroup,
  UniversalInput,
  UniversalTextArea,
} from "../../components/universal/UniversalLayout";
import type { KeeperEmailResponseTemplate } from "../../utils/supporterManager";

interface EmailResponseTemplatesSectionProps {
  templates: KeeperEmailResponseTemplate[];
  isSaving: boolean;
  onSaveTemplates: (next: KeeperEmailResponseTemplate[]) => Promise<void>;
  externalSearch?: string;
  openCreateRef?: MutableRefObject<(() => void) | null>;
}

/** Direct Human Contact email response templates studio using a stacked edit drawer. */
export default function EmailResponseTemplatesSection({
  templates,
  isSaving,
  onSaveTemplates,
  externalSearch = "",
  openCreateRef,
}: EmailResponseTemplatesSectionProps) {
  const { t } = useLexicon();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");

  const resetForm = () => {
    setEditingId(null);
    setDraftName("");
    setDraftCategory("");
    setDraftSubject("");
    setDraftBody("");
    setIsEditorOpen(false);
  };

  const openCreateForm = () => {
    setEditingId(null);
    setDraftName("");
    setDraftCategory(t("keepers_email_tpl_default_cat", "Support"));
    setDraftSubject("");
    setDraftBody("");
    setIsEditorOpen(true);
  };

  useEffect(() => {
    if (openCreateRef) {
      openCreateRef.current = openCreateForm;
    }
    return () => {
      if (openCreateRef) {
        openCreateRef.current = null;
      }
    };
  });

  const filteredTemplates = useMemo(() => {
    const q = externalSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (tpl) =>
        tpl.name.toLowerCase().includes(q) ||
        String(tpl.category || "").toLowerCase().includes(q) ||
        tpl.subject.toLowerCase().includes(q) ||
        tpl.body.toLowerCase().includes(q)
    );
  }, [templates, externalSearch]);

  const openEditForm = (tpl: KeeperEmailResponseTemplate) => {
    setEditingId(tpl.id);
    setDraftName(tpl.name);
    setDraftCategory(tpl.category || t("keepers_email_tpl_default_cat", "Support"));
    setDraftSubject(tpl.subject);
    setDraftBody(tpl.body);
    setIsEditorOpen(true);
  };

  const handleSaveDraft = async () => {
    const cleanName = draftName.trim();
    const cleanSubject = draftSubject.trim();
    const cleanBody = draftBody.trim();
    if (!cleanName || !cleanSubject || !cleanBody || isSaving) return;

    const cleanCategory =
      draftCategory.trim() || t("keepers_email_tpl_default_cat", "Support");
    const nowIso = new Date().toISOString();

    const nextTemplates: KeeperEmailResponseTemplate[] = editingId
      ? templates.map((tpl) =>
          tpl.id === editingId
            ? {
                ...tpl,
                name: cleanName,
                category: cleanCategory,
                subject: cleanSubject,
                body: cleanBody,
                updated_at: nowIso,
              }
            : tpl
        )
      : [
          {
            id: `tpl_${crypto.randomUUID().slice(0, 8)}`,
            name: cleanName,
            category: cleanCategory,
            subject: cleanSubject,
            body: cleanBody,
            updated_at: nowIso,
          },
          ...templates,
        ];

    await onSaveTemplates(nextTemplates);
    resetForm();
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (isSaving) return;
    const nextTemplates = templates.filter((tpl) => tpl.id !== templateId);
    await onSaveTemplates(nextTemplates);
    if (editingId === templateId) {
      resetForm();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <CommandScreenSectionHeading
        icon={t("icon_quickreply", "quickreply")}
        iconColorClass="text-[var(--accent)]"
        title={t("keepers_email_human_tpl_title", "Direct Human Response Templates")}
        subtitle={t(
          "keepers_email_human_tpl_desc",
          "Create reusable human outreach and support replies to load into Compose or Ticket Dossiers."
        )}
        breadcrumb={`${filteredTemplates.length}`}
        actions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_add", "add")}
              tooltip={t("keepers_email_tpl_new_btn", "New Template")}
              onClick={openCreateForm}
              disabled={isSaving}
            />
          </PanelHeaderGroup>
        }
      />

      <HubListGrid
        isEmpty={filteredTemplates.length === 0}
        emptyIcon={t("icon_drafts", "drafts")}
        emptyTitle={t("keepers_email_tpl_empty", "No Response Templates Saved")}
        className="!pb-0"
      >
        {filteredTemplates.map((tpl) => {
          const catLabel = tpl.category || t("keepers_email_tpl_default_cat", "Support");
          return (
            <UniversalCard
              key={tpl.id}
              layout="vertical"
              statusColor="accent"
              icon={t("icon_quickreply", "quickreply")}
              bannerTopLabel={catLabel}
              bannerTopRightLabel={t("tab_templates", "Templates")}
              bannerBottomLabel={tpl.subject}
              title={tpl.name}
              subtitle={tpl.subject}
              description={
                <span className="line-clamp-3 text-xs text-[var(--subtext)] no-text-case">
                  {tpl.body}
                </span>
              }
              onClick={() => openEditForm(tpl)}
              imageOverlay={
                <div className="absolute top-2.5 left-3 flex flex-nowrap items-center gap-1.5 max-w-[calc(100%-6.5rem)] z-30 pointer-events-none">
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_drafts", "drafts")}
                    </span>
                    <span>{catLabel}</span>
                  </span>
                </div>
              }
              footer={
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
                    {catLabel}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <PanelHeaderGroup>
                      <PanelHeaderButton
                        icon={t("icon_delete", "delete")}
                        tooltip={t("delete", "Delete")}
                        isDestructive={true}
                        className="text-[var(--danger)]"
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation();
                          handleDeleteTemplate(tpl.id);
                        }}
                      />
                    </PanelHeaderGroup>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] group-hover/card:text-[var(--accent)] group-hover:text-[var(--accent)] transition-all flex items-center gap-1 opacity-80 group-hover/card:opacity-100 shrink-0">
                      <span>{t("keepers_email_tpl_edit_cta", "Edit Template")}</span>
                      <span className="text-sm leading-none">&rarr;</span>
                    </span>
                  </div>
                </div>
              }
            />
          );
        })}
      </HubListGrid>

      <SidePanel
        isOpen={isEditorOpen}
        onClose={resetForm}
        title={
          editingId
            ? t("keepers_email_tpl_edit_title", "Edit Response Template")
            : t("keepers_email_tpl_create_title", "Create Response Template")
        }
        subtitle={t("keepers_foundry_label", "Sanctuary Foundry")}
        icon={t("icon_quickreply", "quickreply")}
        widthClass="w-[90vw] md:w-[620px]"
        headerActions={
          <PanelHeaderGroup>
            {editingId && (
              <PanelHeaderButton
                icon={t("icon_delete", "delete")}
                tooltip={t("delete", "Delete")}
                isDestructive={true}
                onClick={() => handleDeleteTemplate(editingId)}
              />
            )}
            <PanelHeaderButton
              icon={isSaving ? t("icon_sync", "sync") : t("icon_save", "save")}
              tooltip={t("save", "Save Changes")}
              onClick={handleSaveDraft}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 pb-6">
          <UniversalGroup
            title={
              editingId
                ? t("keepers_email_tpl_edit_title", "Edit Response Template")
                : t("keepers_email_tpl_create_title", "Create Response Template")
            }
            icon={t("icon_edit_note", "edit_note")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UniversalInput
                label={t("keepers_email_tpl_name_label", "Template Name")}
                value={draftName}
                onChange={setDraftName}
                placeholder={t("keepers_email_tpl_name_ph", "Direct Keeper Follow-Up")}
              />
              <UniversalInput
                label={t("category", "Category")}
                value={draftCategory}
                onChange={setDraftCategory}
                placeholder={t("keepers_email_tpl_cat_ph", "Support / Partner Spokes")}
              />
            </div>
            <UniversalInput
              label={t("keepers_email_subject_label", "Subject Line")}
              value={draftSubject}
              onChange={setDraftSubject}
              placeholder={t(
                "keepers_email_subject_placeholder",
                "Official Sanctuary OS Correspondence"
              )}
            />
            <UniversalTextArea
              label={t("keepers_email_body_label", "Message Body")}
              value={draftBody}
              onChange={setDraftBody}
              placeholder={t(
                "keepers_email_tpl_body_ph",
                "Write the reusable human response body..."
              )}
              className="min-h-[200px] no-text-case"
            />
            <div className="flex flex-wrap gap-2 justify-between items-center pt-1">
              {editingId ? (
                <ActionButton
                  onClick={() => handleDeleteTemplate(editingId)}
                  disabled={isSaving}
                  variant="glass"
                  className="text-[var(--danger)] w-auto shrink-0"
                  icon={t("icon_delete", "delete")}
                  label={t("delete", "Delete")}
                />
              ) : (
                <span />
              )}
              <div className="flex flex-wrap gap-2 justify-end">
                <ActionButton
                  onClick={resetForm}
                  variant="glass"
                  className="w-auto shrink-0"
                  icon={t("icon_close", "close")}
                  label={t("cancel", "Cancel")}
                />
                <ActionButton
                  onClick={handleSaveDraft}
                  disabled={
                    isSaving ||
                    !draftName.trim() ||
                    !draftSubject.trim() ||
                    !draftBody.trim()
                  }
                  variant="accent"
                  className="flex-1 sm:flex-initial"
                  icon={isSaving ? t("icon_sync", "sync") : t("icon_save", "save")}
                  label={t("save", "Save Changes")}
                />
              </div>
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>
    </div>
  );
}
