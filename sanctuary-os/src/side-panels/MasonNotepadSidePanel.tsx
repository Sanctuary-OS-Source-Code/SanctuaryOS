import React, { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { SidePanel, SidePanelHeroCard, UniversalGroup } from "../shared";

interface MasonNotepadSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MasonNotepadSidePanel({ isOpen, onClose }: MasonNotepadSidePanelProps) {
  const { t } = useLexicon();
  const [content, setContent] = useState("");

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem("mason_notepad");
      if (saved) {
        setContent(saved);
      }
    }
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    localStorage.setItem("mason_notepad", val);
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("ui_btn_notepad", "Mason Notepad")}
      subtitle={t("notepad_placeholder", "Jot down quick notes, mod ideas, hashes, or snippets...")}
      icon={t("icon_description", "description")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_description", "description")}
          overline={t("ui_btn_notepad", "Mason Notepad")}
          title={t("ui_btn_notepad", "Mason Notepad")}
          description={t("notepad_placeholder", "Jot down quick notes, mod ideas, hashes, or snippets...")}
          badge={`${content.length}`}
          badgeIcon={t("icon_edit_note", "edit_note")}
          variant="accent"
        />

        <UniversalGroup
          title={t("ui_btn_notepad", "Scratchpad")}
          icon={t("icon_edit_note", "edit_note")}
        >
          <textarea
            value={content}
            onChange={handleChange}
            placeholder={t("notepad_placeholder", "Jot down quick notes, mod ideas, hashes, or snippets...")}
            className="w-full min-h-[calc(100dvh-340px)] glass-surface rounded-xl px-4 py-3 text-sm font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] placeholder:text-[var(--subtext)] placeholder:opacity-40 focus:outline-none focus:border-[var(--accent)] transition-all resize-y custom-scrollbar"
          />
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
