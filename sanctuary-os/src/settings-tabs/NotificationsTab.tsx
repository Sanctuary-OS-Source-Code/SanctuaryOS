import { useState, useEffect } from 'react';
import { useLexicon } from '../LexiconContext';
import { SettingsToggle, TabContainer, SettingsGrid } from './shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { ActionButton } from '../shared';
import { SidePanel } from '../shared';
import { supabase } from '../supabase';

const standardButtonClass = "px-6 py-3 rounded-2xl glass-surface text-[var(--text)] text-[10px] font-black capitalize tracking-widest transition-all shadow-lg hover:theme-border-accent hover:scale-105 active:scale-95 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] backdrop-blur-xl flex items-center justify-center gap-3 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]";

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
          <ActionButton 
            variant="glass"
            icon={t("icon_notifications")}
            label={t("notif_per_mason")}
            onClick={() => setShowMasonPanel(true)}
          />
        }
      >
        <SettingsGrid>
          <UniversalCard 
            title={t("ui.replies")} 
            subtitle={t("notify_replies_desc")} 
            icon="chat_bubble"
            onClick={toggleNotifyReplies}
            actions={<SettingsToggle checked={notifyReplies} />}
          />
          <UniversalCard 
            title={t("btn_new_posts")} 
            subtitle={t("notify_new_posts_desc")} 
            icon="post_add"
            onClick={toggleNotifyNewPosts}
            actions={<SettingsToggle checked={notifyNewPosts} />}
          />
          <UniversalCard 
            title={t("notify_system_dispatch")} 
            subtitle={t("notify_system_dispatch_desc")} 
            icon="admin_panel_settings"
            onClick={toggleNotifySystemDispatch}
            actions={<SettingsToggle checked={notifySystemDispatch} />}
          />
          <UniversalCard 
            title={t("notify_alert_banner")} 
            subtitle={t("notify_alert_banner_desc")} 
            icon="warning"
            onClick={toggleNotifyAlertBanner}
            actions={<SettingsToggle checked={notifyAlertBanner} />}
          />
          <UniversalCard 
            title={t("notify_support")} 
            subtitle={t("notify_support_desc")} 
            icon="contact_support"
            onClick={toggleNotifySupport}
            actions={<SettingsToggle checked={notifySupport} />}
          />
          <UniversalCard 
            title={t("notify_author_only")} 
            subtitle={t("notify_author_only_desc")} 
            icon="person"
            onClick={toggleNotifyAuthorOnly}
            actions={<SettingsToggle checked={notifyAuthorOnly} />}
          />
        </SettingsGrid>
      </TabContainer>

      <SidePanel
        isOpen={showMasonPanel}
        onClose={() => setShowMasonPanel(false)}
        title={t("notif_per_mason")}
        subtitle={t("notif_per_mason_desc")}
        icon={t("icon_notifications")}
        iconColorClass="theme-text-accent"
      >
        <div className="flex flex-col space-y-4 relative z-10 w-full h-full p-4 overflow-y-auto accent-scrollbar">
          {followedMasons.length === 0 && <div className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-50 text-center mt-12 p-8 glass-surface border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[var(--radius)]">{t("settings_no_masons")}</div>}
          <SettingsGrid>
            {followedMasons.map(m => (
              <UniversalCard 
                key={m.id} 
                title={m.name} 
                subtitle={m.handle} 
                icon="person"
                onClick={() => toggleMasonAlert(m.id)}
                actions={<SettingsToggle checked={masonAlerts[m.id]} />}
              />
            ))}
          </SettingsGrid>
        </div>
      </SidePanel>
    </>
  );
}
