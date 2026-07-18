import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, StatTile,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  fetchAllPaginated, CustomTierDropdown } from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CustomClassificationDropdown } from "../hub-components/SharedRegistry";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import MarkdownRenderer from "../MarkdownRenderer";



export function WayfinderComms() {
  const { t } = useLexicon();
  const [commsInput, setCommsInput] = useState("");
  const [commsMessages, setCommsMessages] = useState<any[]>([]);
  const [editingCommId, setEditingCommId] = useState<number | string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();

    const fetchComms = async () => {
      const { data, error } = await supabase.from('wf_comms_title').select('*').order('created_at', { ascending: false }).limit(50);
      if (data) {
        const senderIds = Array.from(new Set(data.map(m => m.sender_id).filter(id => id)));
        if (senderIds.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', senderIds);
          const profileMap: any = {};
          profiles?.forEach((p: any) => profileMap[p.id] = p.username || p.id.substring(0, 8));

          const enriched = data.map(m => ({
            ...m,
            sender_name: profileMap[m.sender_id] || m.sender_id.substring(0, 8)
          }));
          setCommsMessages(enriched.reverse());
        } else {
          setCommsMessages(data.reverse());
        }
      }
    };
    let commsSub: any = null;
    if (navigator.onLine && localStorage.getItem("sanctuary_local_only") !== "true") {
      fetchComms();

      commsSub = supabase.channel('wayfinder-comms')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wf_comms_title' }, (payload: any) => {
          if (payload.eventType === 'INSERT') {
            const fetchSender = async () => {
              const { data: profile } = await supabase.from('profiles').select('username').eq('id', payload.new.sender_id).single();
              const name = profile?.username || payload.new.sender_id.substring(0, 8);
              setCommsMessages(prev => [...prev, { ...payload.new, sender_name: name }]);
            };
            fetchSender();
          }
          if (payload.eventType === 'UPDATE') setCommsMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
          if (payload.eventType === 'DELETE') setCommsMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }).subscribe();
    }

    return () => { if (commsSub) supabase.removeChannel(commsSub); };
  }, []);

  const sendComm = async () => {
    if (!commsInput.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editingCommId) {
      const { error } = await supabase.from('wf_comms_title').update({ message: commsInput.trim() }).eq('id', editingCommId);
      if (error) useStore.getState().pushStatus(t("comms_update_error") || "Update Error:" + " " + error.message);
      setEditingCommId(null);
    } else {
      const { error } = await supabase.from('wf_comms_title').insert({
        sender_id: user.id,
        message: commsInput.trim()
      });
      if (error) useStore.getState().pushStatus(t("comms_insert_error") || "Insert Error:" + " " + error.message);
    }
    setCommsInput("");
  };

  const deleteComm = async (id: number | string) => {
    const { error } = await supabase.from('wf_comms_title').delete().eq('id', id);
    if (error) useStore.getState().pushStatus(t("comms_delete_error") || "Delete Error:" + " " + error.message);
  };

  return (
    <div className="flex-1 flex flex-col h-full w-full relative overflow-hidden">
      <div className="absolute top-[-100px] left-[-100px] w-96 h-96 theme-bg-accent opacity-10 blur-[100px] rounded-full pointer-events-none z-0" />

      <div className="flex-1 bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border border-white/5 rounded-[var(--radius)] flex flex-col mb-6 overflow-y-auto p-8 gap-5 custom-scrollbar shadow-inner relative z-10 backdrop-blur-[3px]">
        {commsMessages.length === 0 ? (
          <EmptyState icon={t("icon_cell_tower") || "cell_tower"} title={t("comms_offline")} subtitle={t("comms_handshake")} className="col-span-full py-16" />
        ) : (
          commsMessages.map((msg, i) => (
            <div key={msg.id || i} className="flex flex-col gap-3 text-left theme-glass-inner p-6 rounded-[var(--radius)] animate-in fade-in slide-in-from-bottom-4 border border-white/5 hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all shadow-lg group relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-1 w-1 theme-bg-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex justify-between items-center opacity-70 mb-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] theme-text-accent drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)] flex items-center gap-2">
                  <span className="w-4 h-4 rounded flex items-center justify-center bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[8px]">{(msg.sender_name || msg.sender_id)?.charAt(0)}</span>
                  {msg.sender_name || msg.sender_id?.substring(0, 8)}
                </span>
                <div className="flex gap-4 items-center">
                  {currentUserId === msg.sender_id && (
                    <div className="flex gap-3 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingCommId(msg.id); setCommsInput(msg.message); }} className="text-[9px] uppercase font-black tracking-widest hover:theme-text-accent transition-colors hover:scale-110">{t("emote_edit")}</button>
                      <button onClick={() => deleteComm(msg.id)} className="text-[9px] uppercase font-black tracking-widest hover:theme-text-danger transition-colors hover:scale-110">{t("_")}</button>
                    </div>
                  )}


                  <span className="text-[9px] font-black tracking-widest text-[var(--subtext)] opacity-60">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              <p className="text-sm font-medium text-[var(--text)] leading-relaxed opacity-90 pl-1">{msg.message}</p>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-3 relative z-10 bg-black/20 p-2.5 rounded-[var(--radius)] border border-white/5 backdrop-blur-md shadow-2xl">
        <input
          type="text"
          value={commsInput}
          onChange={(e) => setCommsInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendComm()}
          className="flex-1 bg-transparent rounded-2xl px-6 py-3 text-[var(--text)] text-sm font-bold focus:outline-none transition-all placeholder-[color-mix(in_srgb,var(--subtext)_50%,transparent)]"
          placeholder={t("sa_comms_placeholder")}
        />
        <button
          onClick={sendComm}
          disabled={!commsInput.trim()}
          className="px-10 py-4 theme-bg-accent text-[var(--bg)] rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] shrink-0"
        >
          {editingCommId ? t("comms_btn_update") : t("btn_send")}
        </button>
      </div>
    </div>
  );
}

