import React, { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { SidePanel } from "../shared";

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
      title={t("ui_btn_notepad") || "Mason Notepad"}
      icon={t("icon_description") || "description"}
      widthClass="w-[520px]"
      noPadding={false}
    >
      <div className="flex flex-col flex-1 min-h-[calc(100dvh-160px)] w-full">
        <textarea
          value={content}
          onChange={handleChange}
          placeholder={t("notepad_placeholder") || "Jot down quick notes, mod ideas, hashes, or snippets..."}
          className="flex-1 w-full h-full min-h-[calc(100dvh-180px)] glass-surface rounded-2xl p-6 text-sm font-mono text-[var(--text)] placeholder:text-[var(--subtext)] placeholder:opacity-40 focus:outline-none focus:theme-border-accent transition-all resize-none custom-scrollbar"
        />
      </div>
    </SidePanel>
  );
}
