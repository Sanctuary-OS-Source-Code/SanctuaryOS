import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import { SidePanel, standardButtonClass, standardDangerButtonClass } from "./shared";

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
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
      
    if (data) {
      let validNotifications = data;
      if (localStorage.getItem("sanctuary_notify_replies") === "false") {
        validNotifications = validNotifications.filter((n: any) => n.type !== 'reply');
      }
      if (localStorage.getItem("sanctuary_notify_support") === "false") {
        validNotifications = validNotifications.filter((n: any) => n.type !== 'support_reply');
      }
      if (localStorage.getItem("sanctuary_notify_new_posts") === "false") {
        validNotifications = validNotifications.filter((n: any) => n.type !== 'new_post');
      }
      setNotifications(validNotifications);
    }
    setLoading(false);
  };

  const notifyUpdate = () => {
    window.dispatchEvent(new Event('refresh_notifications'));
  };

  const markAllRead = async () => {
    if (!userId) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    notifyUpdate();
  };

  const clearAll = async () => {
    if (!userId) return;
    await supabase.from("notifications").delete().eq("user_id", userId);
    setNotifications([]);
    notifyUpdate();
  };

  const handleNotificationClick = async (notif: any) => {
    if (!notif.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", notif.id);
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)));
      notifyUpdate();
    }

    if (onOpenPost && notif.reference_id) {
      let { data } = await supabase.from("mason_posts").select("*").eq("id", notif.reference_id).single();
      if (!data) {
        const { data: sysData } = await supabase.from("system_broadcasts").select("*").eq("id", notif.reference_id).single();
        if (sysData) {
          data = { ...sysData, content: sysData.message || sysData.content, mason_id: 'system', views: 0, likes: 0, replies: 0 };
        }
      }
      if (data) {
        onOpenPost(data);
      }
    }
  };

  const clearNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!userId) return;
    await supabase.from("notifications").delete().eq("id", id);
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
      title={t("notif_title")}
      icon={t("emote_bell")}
      backdropZ="z-[15000]"
      panelZ="z-[15001]"
      footer={
        <div className="flex justify-center items-center gap-4 w-full">
          {!notifications.some(n => !n.is_read) && (
            <button type="button" onClick={onClose} className={standardButtonClass}>
              {t("ui_btn_cancel")}
            </button>
          )}
          {notifications.some(n => !n.is_read) && (
            <button
              onClick={markAllRead}
              className={standardButtonClass}
            >
              {t("notif_mark_read")}
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className={standardDangerButtonClass}
            >
              {t("notif_clear_all")}
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {loading ? (
           <div className="p-12 text-center text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-50 theme-glass-panel rounded-3xl">
             {t("loading")}
           </div>
        ) : notifications.length === 0 ? (
           <div className="p-12 text-center text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-50 theme-glass-panel rounded-3xl">
             {t("notif_empty")}
           </div>
        ) : (
           notifications.map((n) => (
             <div
               key={n.id}
               onClick={() => handleNotificationClick(n)}
               className={`p-5 rounded-3xl cursor-pointer transition-all border group relative shadow-lg ${
                 n.is_read
                   ? "bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] border-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-70 hover:opacity-100 hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)]"
                   : "theme-bg-accent/10 theme-border-accent hover:theme-bg-accent/20"
               }`}
             >
               <div className="flex justify-between items-start mb-3">
                 <div className="flex items-center gap-3">
                   {!n.is_read && <div className="w-2.5 h-2.5 rounded-full theme-bg-accent shadow-[0_0_10px_var(--accent)]" />}
                   <span className={`text-[10px] font-black uppercase tracking-widest ${n.is_read ? 'text-[var(--text)] opacity-80' : 'theme-text-accent'}`}>
                     {n.type === "reply" ? (t("notif_type_reply")) : n.type === "support_reply" ? (t("notif_type_support")) : n.type === "new_post" ? (t("notif_type_transmission")) : (t("notif_type_system"))}
                   </span>
                 </div>
                 <div className="flex items-center gap-4">
                   <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
                     {formatTime(n.created_at)}
                   </span>
                    <button 
                      onClick={(e) => clearNotification(e, n.id)}
                      className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/20 hover:text-red-500 text-[var(--subtext)]"
                    >
                     <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_close")}</span>
                   </button>
                 </div>
               </div>
               <p className="text-sm text-[var(--text)] font-bold leading-relaxed line-clamp-3">
                 {n.message}
               </p>
             </div>
           ))
        )}
      </div>
    </SidePanel>
  );
}
