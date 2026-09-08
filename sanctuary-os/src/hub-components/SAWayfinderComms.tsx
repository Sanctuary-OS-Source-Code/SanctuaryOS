import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass, ActionButton,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  fetchAllPaginated, CustomTierDropdown
} from "../shared";
import { ElevatedHubLayout } from "../components/layouts/ElevatedHubLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
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
              const { data: profile } = await supabase.from('profiles').select('username').eq('id', payload.new.sender_id).maybeSingle();
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
      const { error } = await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'wf_comms_title', p_payload: { id: editingCommId, message: commsInput.trim() } });
      if (error) useStore.getState().pushStatus(t("comms_update_error") + " " + error.message);
      setEditingCommId(null);
    } else {
      const { error } = await supabase.rpc('secure_upsert_cloud_file', {
        p_token: useStore.getState().session?.access_token || '', p_target: 'wf_comms_title', p_payload: {
          id: crypto.randomUUID(),
          sender_id: user.id,
          message: commsInput.trim()
        }
      });
      if (error) useStore.getState().pushStatus(t("comms_insert_error") + " " + error.message);
    }
    setCommsInput("");
  };

  const deleteComm = async (id: number | string) => {
    const { error } = await supabase.rpc('secure_delete_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'wf_comms_title', p_id: id });
    if (error) useStore.getState().pushStatus(t("comms_delete_error") + " " + error.message);
  };

  return (
    <ElevatedHubLayout
      headerTitle={t("wayfinder_comms") || "Wayfinder Comms"}
      headerSubtitle={t("comms_handshake") || "Secure communication channel"}
      headerIcon="cell_tower"
      headerIconColorClass="theme-text-accent"
    >
      <div className="flex-1 flex flex-col w-full relative h-full min-h-[500px]">
        <div className="absolute top-[-100px] left-[-100px] w-96 h-96 theme-bg-accent opacity-10 blur-[100px] rounded-full pointer-events-none z-0" />

        <div className="flex-1 flex flex-col gap-5 relative z-10">
          {commsMessages.length === 0 ? (
            <EmptyState icon={t("icon_cell_tower")} title={t("comms_offline")} subtitle={t("comms_handshake")} className="col-span-full py-16" />
          ) : (
            commsMessages.map((msg, i) => (
              <UniversalCard
                key={msg.id || i}
                layout="horizontal"
                icon="person"
                title={
                  <span className="text-[10px] font-black capitalize tracking-[0.2em] theme-text-accent drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">
                    {msg.sender_name || msg.sender_id?.substring(0, 8)}
                  </span>
                }
                subtitle={<span className="text-[9px] font-black tracking-widest text-[var(--subtext)] opacity-60">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                actions={currentUserId === msg.sender_id ? (
                  <div className="flex gap-2">
                    <ActionButton onClick={() => { setEditingCommId(msg.id); setCommsInput(msg.message); }} iconOnly={true} icon="edit" label={t("emote_edit")} />
                    <ActionButton onClick={() => deleteComm(msg.id)} iconOnly={true} icon="delete" label={t("_")} variant="danger" />
                  </div>
                ) : null}
                className="animate-in fade-in slide-in-from-bottom-4"
              >
                <p className="text-sm font-medium text-[var(--text)] leading-relaxed opacity-90 pl-1 mt-2">{msg.message}</p>
              </UniversalCard>
            ))
          )}
        </div>

        <div className="sticky bottom-0 z-50 flex gap-3 bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] p-2.5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] backdrop-blur-md shadow-2xl mt-auto translate-y-4">
          <input
            type="text"
            value={commsInput}
            onChange={(e) => setCommsInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendComm()}
            className="flex-1 bg-transparent rounded-2xl px-6 py-3 text-[var(--text)] text-sm font-bold focus:outline-none transition-all placeholder-[color-mix(in_srgb,var(--subtext)_50%,transparent)]"
            placeholder={t("sa_comms_placeholder")}
          />
          <ActionButton
            onClick={sendComm}
            disabled={!commsInput.trim()}
            className="shrink-0 h-14"
            label={editingCommId ? t("comms_btn_update") : t("btn_send")}
          />
        </div>
      </div>
    </ElevatedHubLayout>
  );
}



