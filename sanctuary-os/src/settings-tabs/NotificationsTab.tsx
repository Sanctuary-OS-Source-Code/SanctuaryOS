import { useState, useEffect } from 'react';
import { useLexicon } from '../LexiconContext';
import { TabContainer } from './shared';
import { SidePanel } from '../shared';
import { supabase } from '../supabase';

const standardButtonClass = "px-6 py-3 rounded-2xl theme-glass-inner text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all shadow-lg hover:theme-border-accent hover:scale-105 active:scale-95 border border-white/10 backdrop-blur-xl flex items-center justify-center gap-3 hover:bg-white/5";

export default function NotificationsTab() {
  const { t } = useLexicon();
  
  const [notifyReplies, setNotifyReplies] = useState(localStorage.getItem("sanctuary_notify_replies") !== "false");
  const [notifyNewPosts, setNotifyNewPosts] = useState(localStorage.getItem("sanctuary_notify_new_posts") !== "false");
  const [notifySystemDispatch, setNotifySystemDispatch] = useState(localStorage.getItem("sanctuary_notify_system_dispatch") !== "false");
  const [notifyAlertBanner, setNotifyAlertBanner] = useState(localStorage.getItem("sanctuary_notify_alert_banner") !== "false");
  const [notifySupport, setNotifySupport] = useState(localStorage.getItem("sanctuary_notify_support") !== "false");
  const [notifyAuthorOnly, setNotifyAuthorOnly] = useState(localStorage.getItem("sanctuary_notify_author_only") === "true");

  const [showMasonPanel, setShowMasonPanel] = useState(false);

  const [masonAlerts, setMasonAlerts] = useState<Record<string, boolean>>(() => JSON.parse(localStorage.getItem("sanctuary_mason_alerts") || "{}"));
  const [followedMasons, setFollowedMasons] = useState<any[]>([]);

  useEffect(() => {
    async function fetchFollows() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const { data } = await supabase.from('mason_followers').select('masons(id, name, profile_id)').eq('user_id', session.user.id);
      if (data) {
        setFollowedMasons(data.map((row: any) => ({
          id: row.masons.id,
          name: row.masons.name,
          handle: `@${row.masons.profile_id || 'vlocal'}`
        })));
      }
    }
    if (showMasonPanel) fetchFollows();
  }, [showMasonPanel]);

  const toggleMasonAlert = (id: string) => {
    const newVal = { ...masonAlerts, [id]: !masonAlerts[id] };
    setMasonAlerts(newVal);
    localStorage.setItem("sanctuary_mason_alerts", JSON.stringify(newVal));
  };

  const toggleNotifyReplies = () => {
    const newVal = !notifyReplies;
    setNotifyReplies(newVal);
    localStorage.setItem("sanctuary_notify_replies", newVal.toString());
  };

  const toggleNotifyNewPosts = () => {
    const newVal = !notifyNewPosts;
    setNotifyNewPosts(newVal);
    localStorage.setItem("sanctuary_notify_new_posts", newVal.toString());
  };

  const toggleNotifySystemDispatch = () => {
    const newVal = !notifySystemDispatch;
    setNotifySystemDispatch(newVal);
    localStorage.setItem("sanctuary_notify_system_dispatch", newVal.toString());
  };

  const toggleNotifyAlertBanner = () => {
    const newVal = !notifyAlertBanner;
    setNotifyAlertBanner(newVal);
    localStorage.setItem("sanctuary_notify_alert_banner", newVal.toString());
  };

  const toggleNotifySupport = () => {
    const newVal = !notifySupport;
    setNotifySupport(newVal);
    localStorage.setItem("sanctuary_notify_support", newVal.toString());
  };

  const toggleNotifyAuthorOnly = () => {
    const newVal = !notifyAuthorOnly;
    setNotifyAuthorOnly(newVal);
    localStorage.setItem("sanctuary_notify_author_only", newVal.toString());
  };

  return (
    <>
      <TabContainer
        title={t("tab_notifs")}
        icon="notifications"
        actions={
          <button onClick={() => setShowMasonPanel(true)} className={standardButtonClass}>
            <span className="material-symbols-outlined lowercase theme-text-accent text-lg">{t("icon_notifications")}</span> {t("notif_per_mason")}
          </button>
        }
      >
      <div className="grid xl:grid-cols-2 gap-8">
        <div className="flex items-center justify-between p-8 rounded-[var(--radius)] theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={toggleNotifyReplies}>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("ui.replies")}</span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("notify_replies_desc")}</span>
          </div>
          <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${notifyReplies ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${notifyReplies ? 'translate-x-8' : 'translate-x-0'}`} />
          </div>
        </div>

        <div className="flex items-center justify-between p-8 rounded-[var(--radius)] theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={toggleNotifySupport}>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("notify_support")}</span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("notify_support_desc")}</span>
          </div>
          <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${notifySupport ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${notifySupport ? 'translate-x-8' : 'translate-x-0'}`} />
          </div>
        </div>

        <div className="flex items-center justify-between p-8 rounded-[var(--radius)] theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={toggleNotifyNewPosts}>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("notify_new_posts")}</span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("notify_new_posts_desc")}</span>
          </div>
          <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${notifyNewPosts ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${notifyNewPosts ? 'translate-x-8' : 'translate-x-0'}`} />
          </div>
        </div>

        <div className="flex items-center justify-between p-8 rounded-[var(--radius)] theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={toggleNotifyAuthorOnly}>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("notify_author_only")}</span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("notify_author_only_desc")}</span>
          </div>
          <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${notifyAuthorOnly ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${notifyAuthorOnly ? 'translate-x-8' : 'translate-x-0'}`} />
          </div>
        </div>

        <div className="flex items-center justify-between p-8 rounded-[var(--radius)] theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={toggleNotifySystemDispatch}>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("notify_system_dispatch") || "System Dispatch"}</span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("notify_system_dispatch_desc") || "Receive notifications for system broadcasts and urgent alerts"}</span>
          </div>
          <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${notifySystemDispatch ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${notifySystemDispatch ? 'translate-x-8' : 'translate-x-0'}`} />
          </div>
        </div>

        <div className="flex items-center justify-between p-8 rounded-[var(--radius)] theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={toggleNotifyAlertBanner}>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("notify_alert_banner") || "Alert Banners"}</span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("notify_alert_banner_desc") || "Show urgent alert banners prominently on your dashboard."}</span>
          </div>
          <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${notifyAlertBanner ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${notifyAlertBanner ? 'translate-x-8' : 'translate-x-0'}`} />
          </div>
        </div>
        </div>
      </TabContainer>

      <SidePanel
        isOpen={showMasonPanel}
        onClose={() => setShowMasonPanel(false)}
        title={t("notif_per_mason")}
        subtitle={t("notif_per_mason_desc")}
        icon={t("icon_notifications")}
        iconColorClass="theme-text-accent"
      >
        <div className="flex flex-col space-y-4 relative z-10 w-full h-full p-4">
          {followedMasons.length === 0 && <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-50 text-center mt-12 p-8 theme-glass-inner border border-dashed border-white/10 rounded-[var(--radius)]">{t("settings_no_masons")}</div>}
          {followedMasons.map(m => (
            <div key={m.id} className="flex items-center justify-between p-6 rounded-[var(--radius)] theme-glass-inner border border-white/10 hover:border-white/30 hover:-translate-y-1 backdrop-blur-xl transition-all group cursor-pointer shadow-lg hover:shadow-2xl" onClick={() => toggleMasonAlert(m.id)}>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-black uppercase tracking-widest text-[var(--text)] group-hover:theme-text-accent transition-colors">{m.name}</span>
                <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 tracking-widest">{m.handle}</span>
              </div>
              <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${masonAlerts[m.id] ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
                <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 shadow-[0_0_10px_rgba(0,0,0,0.5)] ${masonAlerts[m.id] ? 'translate-x-8' : 'translate-x-0'}`} />
              </div>
            </div>
          ))}
        </div>
      </SidePanel>
    </>
  );
}
