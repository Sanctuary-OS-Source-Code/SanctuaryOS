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
    handleHashChange(); // check on mount
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!activeLegal) {
      setLegalContent(null);
      return;
    }

    const fetchLegal = async () => {
      setLoading(true);
      // Map hash to category
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

      setLegalContent(data || { message: `No ${catMap[activeLegal]} document found.` });
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
      subtitle="Sanctuary Foundry OS"
      widthClass="w-[90vw] max-w-[800px]"
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 text-[var(--text)]">
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

