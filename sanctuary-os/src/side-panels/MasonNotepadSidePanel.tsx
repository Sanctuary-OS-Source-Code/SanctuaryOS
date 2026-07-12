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
      title={t("ui_btn_notepad")}
      icon={t("icon_description")}
      noPadding={true}
    >
      <div className="flex flex-col h-full w-full">
        <textarea
          value={content}
          onChange={handleChange}
          placeholder={t("notepad_placeholder")}
          className="flex-1 w-full h-full bg-transparent p-8 text-sm font-mono text-[var(--text)] focus:outline-none focus:bg-white/5 transition-colors resize-none custom-scrollbar"
        />
      </div>
    </SidePanel>
  );
}
