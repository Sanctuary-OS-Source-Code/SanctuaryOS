import { useState, useEffect } from "react";
import { supabase, supabaseAuth } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import { SidePanel, standardButtonClass, standardDangerButtonClass, ActionButton } from "../shared";

interface NotificationSidebarProps {
  onClose: () => void;
  onOpenPost?: (post: any) => void;
}

export default function NotificationSidebar({ onClose, onOpenPost }: NotificationSidebarProps) {
  const { t } = useLexicon();
  const { currentTheme } = useTheme();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
      }
    });
  }, []);

  useEffect(() => {
    if (userId) {
      fetchNotifications();
    }
  }, [userId]);

  const fetchNotifications = async () => {
    setLoading(true);

    // Fetch from Game DB
    const { data: gameData } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    // Fetch from OS DB
    const { data: osData } = await supabaseAuth
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    let allData: any[] = [];
    if (gameData) allData = [...allData, ...gameData.map(n => ({ ...n, _db: 'game' }))];
    if (osData) allData = [...allData, ...osData.map(n => ({ ...n, _db: 'os' }))];

    allData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    allData = allData.slice(0, 50);

    if (allData.length > 0) {
      let validNotifications = allData;
      if (localStorage.getItem("sanctuary_notify_replies") === "false") {
        validNotifications = validNotifications.filter((n: any) => n.type !== 'reply');
      }
      if (localStorage.getItem("sanctuary_notify_support") === "false") {
        validNotifications = validNotifications.filter((n: any) => n.type !== 'support_reply');
      }
      if (localStorage.getItem("sanctuary_notify_new_posts") === "false") {
        validNotifications = validNotifications.filter((n: any) => n.type !== 'new_post');
      }
      if (localStorage.getItem("sanctuary_notify_system_dispatch") === "false") {
        validNotifications = validNotifications.filter((n: any) => n.type !== 'system_broadcast');
      }
      setNotifications(validNotifications);
    } else {
      setNotifications([]);
    }
    setLoading(false);
  };

  const notifyUpdate = () => {
    window.dispatchEvent(new Event('refresh_notifications'));
  };

  const markAllRead = async () => {
    if (!userId) return;
    const gameHasUnread = notifications.some(n => !n.is_read && n._db === 'game');
    const osHasUnread = notifications.some(n => !n.is_read && n._db === 'os');

    const updates = [];
    if (gameHasUnread) updates.push(supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false));
    if (osHasUnread) updates.push(supabaseAuth.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false));

    await Promise.all(updates);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    notifyUpdate();
  };

  const clearAll = async () => {
    if (!userId) return;
    await Promise.all([
      supabase.from("notifications").delete().eq("user_id", userId),
      supabaseAuth.from("notifications").delete().eq("user_id", userId)
    ]);
    setNotifications([]);
    notifyUpdate();
  };

  const handleNotificationClick = async (notif: any) => {
    if (!notif.is_read) {
      const targetDb = notif._db === 'os' ? supabaseAuth : supabase;
      await targetDb.from("notifications").update({ is_read: true }).eq("id", notif.id);
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)));
      notifyUpdate();
    }

    if (onOpenPost && notif.reference_id) {
      const targetDb = notif._db === 'os' ? supabaseAuth : supabase;
      let { data } = await targetDb.from("mason_posts").select("*").eq("id", notif.reference_id).single();
      if (!data) {
        const { data: sysData } = await targetDb.from("system_broadcasts").select("*").eq("id", notif.reference_id).single();
        if (sysData) {
          data = { ...sysData, content: sysData.message || sysData.content, mason_id: 'system', views: 0, likes: 0, replies: 0 };
        }
      }
      if (data) {
        onOpenPost(data);
      }
    }
  };

  const clearNotification = async (e: React.MouseEvent, id: string, db: string) => {
    e.stopPropagation();
    if (!userId) return;
    const targetDb = db === 'os' ? supabaseAuth : supabase;
    await targetDb.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    notifyUpdate();
  };

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SidePanel
      isOpen={true}
      onClose={onClose}
      title={t("tab_notifs")}
      icon={t("icon_notifications")}
      backdropZ="z-[15000]"
      panelZ="z-[15001]"
      footer={
        <div className="flex justify-center items-center gap-4 w-full">
          {!notifications.some(n => !n.is_read) && (
            <ActionButton type="button" onClick={onClose} label={t("nav_cancel")}>
              
            </ActionButton>
          )}
          {notifications.some(n => !n.is_read) && (
            <ActionButton
              onClick={markAllRead} label={t("notif_mark_read")}
            >
              
            </ActionButton>
          )}
          {notifications.length > 0 && (
            <ActionButton
              onClick={clearAll} label={t("notif_clear_all")}
            >
              
            </ActionButton>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {
          loading ? (
            <div className="p-12 text-center text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-50 glass-panel rounded-2xl">
              {t("loading")}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-50 glass-panel rounded-2xl">
              {t("notif_empty")}
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`p-5 rounded-2xl cursor-pointer transition-all border group relative shadow-lg ${n.is_read
                  ? "bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] border-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-70 hover:opacity-100 hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)]"
                  : "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[var(--accent)]"
                  }`}
              >
                <div className="flex justify-start items-start mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-black capitalize tracking-widest ${n.is_read ? 'text-[var(--text)] opacity-80' : 'theme-text-accent'}`}>
                      {n.type === "reply" ? (t("ui_btn_reply")) : n.type === "support_reply" ? (t("notif_type_support")) : n.type === "new_post" ? (t("post_broadcast")) : (t("category_system"))}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest">
                      {formatTime(n.created_at)}
                    </span>
                    <button
                      onClick={(e) => clearNotification(e, n.id, n._db)}
                      className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:text-red-500 text-[var(--subtext)]"
                    >
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_close")}</span>
                    </button>
                  </div>
                </div>
                <p className="text-sm text-[var(--text)] font-bold leading-relaxed line-clamp-3">
                  {n.message}
                </p>
              </div>
            ))
          )
        }
      </div >
    </SidePanel >
  );
}

