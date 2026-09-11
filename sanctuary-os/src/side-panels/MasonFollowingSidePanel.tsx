import React, { useState, useEffect } from "react";
import { SidePanel } from "../shared";
import { useLexicon } from "../LexiconContext";
import { supabase } from "../supabase";

export default function MasonFollowingSidePanel({ 
  isOpen, 
  onClose,
  userId,
  onOpenMasonProfile
}: { 
  isOpen: boolean; 
  onClose: () => void;
  userId: string | null;
  onOpenMasonProfile: (masonId: string) => void;
}) {
  const { t } = useLexicon();
  const [loading, setLoading] = useState(false);
  const [masons, setMasons] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && userId) {
      const fetchFollowing = async () => {
        setLoading(true);
        const { data, error } = await supabase
          .from('mason_followers')
          .select('mason_id, masons(*)')
          .eq('user_id', userId);
        
        if (error) {
          console.error("Failed to fetch followed masons:", error);
        } else if (data) {
          const fetchedMasons = data.map(d => d.masons).filter(Boolean);
          setMasons(fetchedMasons);
        }
        setLoading(false);
      };
      fetchFollowing();
    } else {
      setMasons([]);
    }
  }, [isOpen, userId]);

  return (
    <SidePanel 
        isOpen={isOpen} 
        onClose={onClose} 
        title={t("feed_stat_network") || "Your Network"}
        subtitle={t("network_subtitle") || "Masons you are following"}
        icon="group"
        widthClass="w-[600px]"
    >
        <div className="flex flex-col gap-6 w-full pb-8">
            <div className="w-full flex flex-col gap-4">
                {loading ? (
                    <div className="text-center py-12 opacity-50 text-xs font-black capitalize tracking-widest">{t("loading")}</div>
                ) : masons.length === 0 ? (
                    <div className="flex flex-col justify-center items-center h-64 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-xl group col-span-2">
                        <span className="material-symbols-outlined text-6xl mb-4 grayscale opacity-30 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-12">groups</span>
                        <span className="text-sm font-black text-[var(--subtext)] capitalize tracking-widest text-center px-8 leading-relaxed">
                            {t("no_masons_followed") || "You aren't following anyone yet."}
                        </span>
                    </div>
                ) : (
                    masons.map((mason, index) => (
                        <div 
                          key={mason.id} 
                          onClick={() => {
                            onClose();
                            onOpenMasonProfile(mason.id);
                          }}
                          className="flex items-center gap-4 p-4 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] cursor-pointer transition-all hover:scale-[1.02]"
                        >
                          <div className="w-12 h-12 rounded-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center">
                            {mason.avatar_url ? (
                              <img src={mason.avatar_url} alt={mason.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="material-symbols-outlined !text-xl opacity-50">person</span>
                            )}
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-sm font-black text-[var(--text)] truncate">{mason.name || mason.username || "Unknown"}</span>
                            {mason.tagline && (
                              <span className="text-[10px] font-bold text-[var(--subtext)] opacity-70 truncate">{mason.tagline}</span>
                            )}
                          </div>
                          <span className="material-symbols-outlined text-[var(--subtext)] opacity-30">chevron_right</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    </SidePanel>
  );
}
