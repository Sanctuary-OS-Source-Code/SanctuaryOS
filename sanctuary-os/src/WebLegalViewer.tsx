import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import MarkdownRenderer from "./MarkdownRenderer";
import { SidePanel } from "./shared";

export default function WebLegalViewer() {
  const { t } = useLexicon();
  const [activeLegal, setActiveLegal] = useState<string | null>(null);
  const [legalContent, setLegalContent] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (['eula', 'privacy', 'terms'].includes(hash)) {
        setActiveLegal(hash);
      } else {
        setActiveLegal(null);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!activeLegal) {
      setLegalContent(null);
      return;
    }

    const fetchLegal = async () => {
      setLoading(true);

      const catMap: Record<string, string> = {
        'eula': 'EULA',
        'privacy': 'Privacy',
        'terms': 'Terms'
      };

      const { data } = await supabase
        .from('keeper_system_broadcasts')
        .select('*')
        .eq('category', catMap[activeLegal])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setLegalContent(data || { message: (t("legal_not_found") || "No {doc} document found.").replace('{doc}', t(`landing_${activeLegal}`) || catMap[activeLegal]) });
      setLoading(false);
    };

    fetchLegal();
  }, [activeLegal]);

  return (
    <SidePanel
      isOpen={!!activeLegal}
      onClose={() => window.location.hash = ''}
      icon="gavel"
      title={legalContent?.title || activeLegal?.toUpperCase() || ""}
      subtitle={t("legal_subtitle") || "Sanctuary Foundry OS"}
      widthClass="w-full md:w-[90vw] md:max-w-[800px]"
      noPadding={true}
    >
      <div className="flex flex-col min-h-full p-6 md:p-10 text-[var(--text)]">
        {loading ? (
          <div className="flex justify-center py-20">
            <span className="material-symbols-outlined animate-spin text-5xl text-[var(--accent)]">autorenew</span>
          </div>
        ) : (
          <div className="prose prose-invert max-w-none text-[var(--text)]">
            <MarkdownRenderer content={legalContent?.message || legalContent?.content || ""} />
          </div>
        )}
      </div>
    </SidePanel>
  );
}

