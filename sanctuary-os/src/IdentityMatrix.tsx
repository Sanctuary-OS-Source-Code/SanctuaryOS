import { UniversalGroup, UniversalInput, UniversalTextArea, UniversalToggle } from './components/universal/UniversalLayout';
import { SearchBar } from "./shared";
import React, { useState, useEffect } from 'react';
import { supabase, supabaseAuth } from './supabase';
import { useLexicon } from './LexiconContext';
import { CustomDropdown, SidePanel, standardDangerButtonClass, standardSuccessButtonClass, standardButtonClass, EmptyState, ActionButton } from './shared';
import { UniversalCard } from './components/universal/UniversalCard';
import { useStore } from './store';
import { logArchitectAction } from './lib/audit';

export const ROLES = ['citizen', 'mason', 'architect', 'oversight', 'wayfinder'];

const getRoleBadgeStyle = (role: string) => {
  const base = "text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border shadow-inner transition-colors duration-500 shrink-0";
  const r = (role || 'citizen').toLowerCase();
  
  if (r === 'admin') {
    return `${base} bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] group-hover:text-white`;
  }
  if (r === 'keeper') {
    return `${base} bg-cyan-500/5 text-cyan-500/70 border-cyan-500/10 group-hover:bg-cyan-500/10 group-hover:border-cyan-500/30 group-hover:text-cyan-400`;
  }
  if (r === 'wayfinder' || r === 'oversight') {
    return `${base} bg-amber-500/5 text-amber-500/70 border-amber-500/10 group-hover:bg-amber-500/10 group-hover:border-amber-500/30 group-hover:text-amber-400`;
  }
  if (r === 'architect') {
    return `${base} bg-purple-500/5 text-purple-500/70 border-purple-500/10 group-hover:bg-purple-500/10 group-hover:border-purple-500/30 group-hover:text-purple-400`;
  }
  if (r === 'mason') {
    return `${base} bg-emerald-500/5 text-emerald-500/70 border-emerald-500/10 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/30 group-hover:text-emerald-400`;
  }
  if (r === 'core_dev') {
    return `${base} bg-blue-500/5 text-blue-500/70 border-blue-500/10 group-hover:bg-blue-500/10 group-hover:border-blue-500/30 group-hover:text-blue-400`;
  }
  // citizen
  return `${base} bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] opacity-70 border-[color-mix(in_srgb,var(--text)_5%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:opacity-100`;
};


export function CustomRoleSelect({ value, onChange, roles, isBlacklisted }: any) {
  const options = roles.map((r: string) => ({ id: r, label: r.replace(/_/g, ' ').toUpperCase() }));
  return (
    <div className={`w-full ${isBlacklisted ? '[&_button]:!bg-red-500/10 [&_button]:!border-red-500/30 [&_button]:!text-red-500' : ''}`}>
      <CustomDropdown disableTint={true}
        value={value}
        options={options}
        onChange={(v: string[]) => onChange(v[0])}
        placeholder="Select Role"
      />
    </div>
  );
}

export function SharedIdentityEditor({ profile, onClose, onUpdated, isWayfinder = false, isSkinny = false, isKeepers = false }: { profile: any, onClose: () => void, onUpdated: () => void, isWayfinder?: boolean, isSkinny?: boolean, isKeepers?: boolean }) {
  const { t } = useLexicon();
  const [editRole, setEditRole] = useState("citizen");
  const [isBanned, setIsBanned] = useState(false);
  const [isCommBanned, setIsCommBanned] = useState(false);
  const [editReason, setEditReason] = useState("");
  const [editCommReason, setEditCommReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState("");

  const currentUser = useStore(state => state.session?.user);
  const isEditingSelf = currentUser?.id === profile?.id;

  useEffect(() => {
    if (profile) {
      setEditRole(profile.role || "citizen");
      setIsBanned(profile.is_banned || false);
      setIsCommBanned(profile.is_comm_banned || false);
      setEditReason(profile.blacklist_reason || "");
      setEditCommReason(profile.comm_blacklist_reason || "");
      setStatus("");
    }
  }, [profile]);

  const handleUpdateRole = async () => {
    if (!profile) return;
    if (isEditingSelf && editRole !== profile.role) {
      setStatus("Action denied: You cannot modify your own role.");
      return;
    }
    if (isBanned && !editReason.trim()) {
      setStatus("Reason is required for upload ban.");
      return;
    }
    if (isCommBanned && !editCommReason.trim()) {
      setStatus("Reason is required for comms ban.");
      return;
    }

    setIsSubmitting(true);
    setStatus(t("identities_updating"));

    const { getActiveGameClient } = await import('./supabase');
    const client = isKeepers ? supabaseAuth : getActiveGameClient();

    const { data, error } = await client.from('profiles').update({
      role: editRole,
      is_banned: isBanned,
      is_comm_banned: isCommBanned,
      blacklist_reason: isBanned ? editReason : null,
      comm_blacklist_reason: isCommBanned ? editCommReason : null
    }).eq('id', profile.id).select();

    if (error || !data || data.length === 0) {
      setStatus(t("identities_failed_prefix") || "FAILED:" + " " + (error?.message || "Permission Denied."));
    } else {
      const userRes = await supabase.auth.getUser();
      const myId = userRes.data.user?.id;

      let auditReason = "Role Update";
      let auditAction = `Updated role to ${editRole}`;
      if (isBanned || isCommBanned) {
        auditAction = `Banned User (${isBanned ? 'Upload ' : ''}${isCommBanned ? 'Comms' : ''})`;
        auditReason = `Upload: ${editReason} | Comms: ${editCommReason}`;
      }

      await logArchitectAction(
        auditAction,
        'profiles',
        profile.username || profile.id,
        auditReason,
        "Identity Matrix",
        isKeepers
      );

      setStatus(t("identities_updated"));
      onUpdated();
      setTimeout(() => {
        onClose();
        setIsSubmitting(false);
      }, 1500);
    }
    if (error || !data || data.length === 0) {
      setIsSubmitting(false);
    }
  };

  return (
    <SidePanel
      isOpen={!!profile}
      onClose={onClose}
      title={t("edit_identity")}
      icon={t("icon_group")}
      subtitle={profile ? `UUID: ${profile.id}` : undefined}
      widthClass={isSkinny ? "w-[90vw] max-w-[475px]" : undefined}
      footer={
        <div className="flex flex-col gap-4 w-full">
          {status && (
            <div className="text-center bg-black/20 p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full">
              <p className={`text-[10px] font-black uppercase tracking-widest ${status.toLowerCase().includes('failed') || status.toLowerCase().includes('required') ? 'text-red-400' : 'theme-text-accent'}`}>{status}</p>
            </div>
          )}
          <div className="flex justify-center items-center gap-4 w-full">
            <ActionButton type="button" onClick={onClose} disabled={isSubmitting} label={t("nav_cancel")}>
              
            </ActionButton>
            <ActionButton
              onClick={handleUpdateRole}
              disabled={isSubmitting || (isBanned && !editReason.trim()) || (isCommBanned && !editCommReason.trim()) || (!isWayfinder && profile?.role === 'wayfinder')} label={isSubmitting ? t("identities_updating") : t("ui_btn_commit")}
            >
              
            </ActionButton>
          </div>
        </div>
      }
    >
      <div className="p-6 flex flex-col h-full gap-8">

        <div className="flex flex-col gap-3 shrink-0">
          <h2 className="text-3xl font-black text-[var(--text)] leading-tight uppercase tracking-widest truncate">
            {profile?.username || t("vlocal") || "UNKNOWN"}
          </h2>
        </div>

        <UniversalGroup title={t("identities_role_label")} icon={t("icon_settings")}>
          {(!isWayfinder && profile?.role === 'wayfinder') ? (
            <div className="flex flex-col gap-2 relative z-50 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 w-full">
              <p className="text-xs font-bold text-amber-500">{t("identities_wayfinder_locked")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 relative z-50 w-full">
              <CustomRoleSelect
                value={editRole}
                roles={isWayfinder ? ROLES : ['citizen', 'keeper', 'admin']}
                onChange={(newRole: string) => setEditRole(newRole)}
                isBlacklisted={isBanned}
              />
            </div>
          )}
        </UniversalGroup>

        {(!isWayfinder && profile?.role === 'wayfinder') ? null : (
          <div className="flex flex-col gap-6">
            <UniversalGroup 
              title={isWayfinder ? (t("identities_punitive_upload") || "UPLOAD & NEXUS BAN") : (t("ui_network_blacklist") || "NETWORK BLACKLIST")} 
              icon={t("icon_gavel")} 
              headerColorClass={isBanned ? 'text-red-400' : undefined}
            >
              <div className="relative z-10 w-full mb-2 mt-2">
                <UniversalToggle
                  label={t("identities_ban")}
                  checked={isBanned}
                  onChange={setIsBanned}
                  layout="horizontal-reverse"
                />
              </div>

              {isBanned && (
                <div className="animate-in fade-in slide-in-from-top-2 relative z-10 w-full mt-2">
                  <UniversalTextArea
                    label={t("ban_reason_req")}
                    value={editReason}
                    onChange={setEditReason}
                    placeholder={t("id_reason_ban")}
                    className="h-32 border-red-500/30 bg-red-500/5 focus:border-red-500/60 shadow-[inset_0_0_20px_rgba(255,0,0,0.1)] w-full text-red-100"
                  />
                </div>
              )}
            </UniversalGroup>

            {isWayfinder && (
              <div className={`flex flex-col gap-6 p-6 glass-surface rounded-2xl border ${isCommBanned ? 'border-red-500/30' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)]'} relative`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${isCommBanned ? 'from-red-500/10' : 'from-red-500/5'} to-transparent pointer-events-none rounded-2xl transition-colors`} />
                <h4 className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border-b ${isCommBanned ? 'border-red-500/20 text-red-400' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] opacity-80'} pb-4 mb-2 transition-colors`}>
                  <span className="material-symbols-outlined !text-[14px]">{t("icon_gavel")}</span>
                  {t("identities_punitive_comm")}
                </h4>
                <div className="flex items-center justify-start relative z-10">
                  <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-2">
                    {t("identities_ban")}
                  </label>
                  <button
                    onClick={() => setIsCommBanned(!isCommBanned)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isCommBanned ? 'bg-red-500' : 'bg-gray-600'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isCommBanned ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {isCommBanned && (
                  <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 relative z-10 mt-2">
                    <label className="text-[9px] font-black text-red-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                      {t("ban_reason_req")}
                    </label>
                    <textarea
                      value={editCommReason}
                      onChange={e => setEditCommReason(e.target.value)}
                      placeholder={t("id_reason_comm_ban")}
                      className="glass-surface rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold h-32 resize-none focus:outline-none border border-red-500/30 bg-red-500/5 focus:border-red-500/60 shadow-[inset_0_0_20px_rgba(255,0,0,0.1)]"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </SidePanel>
  );
}

export function IdentityMatrix({ isWayfinder = false, isKeepers = false, initialFilterRole = "all" }: { isWayfinder?: boolean, isKeepers?: boolean, initialFilterRole?: string }) {
  const { t } = useLexicon();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [blacklistedProfiles, setBlacklistedProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState(initialFilterRole);

  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const { getActiveGameClient } = await import('./supabase');
    const client = isKeepers ? supabaseAuth : getActiveGameClient();
    const { data } = await client.from('profiles').select('*').order('username');
    if (data) {
      setProfiles(data.filter((p: any) => !p.is_banned && !p.is_comm_banned));
      setBlacklistedProfiles(data.filter((p: any) => p.is_banned || p.is_comm_banned));
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleOpenPanel = (p: any) => {
    if (!isWayfinder && p.role === 'wayfinder') {
      useStore.getState().pushStatus(t("auto_you_cannot_edit_45"));
      return;
    }
    setSelectedProfile(p);
  };

  const filteredProfiles = profiles.filter(p => {
    const matchesSearch = p.username?.toLowerCase().includes(search.toLowerCase()) || p.id?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = filterRole === "all" || p.role === filterRole || (!p.role && filterRole === 'citizen');
    return matchesSearch && matchesRole;
  });

  return (
    <div className="flex flex-col w-full relative h-full">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full">
        <div className="flex items-center gap-3 relative flex-1 w-full justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder={t("identities_search")}
              className="h-12 w-full rounded-2xl"
            />
          </div>

          <div className="w-max min-w-[192px] max-w-xs z-40">
            <CustomDropdown disableTint={true}
              value={filterRole}
              onChange={(v: string[]) => setFilterRole(v[0])}
              options={[
                { id: "all", label: "ALL ROLES" },
                ...ROLES.filter(r => {
                  if (isKeepers) return r === 'citizen';
                  return isWayfinder || r !== 'wayfinder';
                }).map(r => ({ id: r, label: r.replace(/_/g, ' ').toUpperCase() })),
                ...(isKeepers ? [{ id: 'admin', label: 'DEV' }] : [])
              ]}
              placeholder={t("auto_filter_role")}
            />
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-8">
        {loading ? (
          <div className="glass-panel p-8 rounded-[var(--radius)] text-center text-sm font-bold text-[var(--subtext)] uppercase tracking-widest animate-pulse">{t("audit_fetching")}</div>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                {filteredProfiles.length === 0 && <EmptyState icon={t("ui_icon_person_off") || "person_off"} title={t("no_profiles")} className="col-span-full py-16" />}
                {filteredProfiles.map((p: any) => (
                  <UniversalCard
                    key={p.id}
                    onClick={() => handleOpenPanel(p)}
                    className={(!isWayfinder && p.role === 'wayfinder') ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                    layout="horizontal"
                    icon="person"
                    title={p.username || t("vlocal") || "UNKNOWN"}
                    subtitle={`${t("auto_id")} ${p.id.substring(0, 8)}`}
                    badges={[
                      <span key="role" className={getRoleBadgeStyle(p.role)}>
                        {t(`role_${(p.role || "citizen").toLowerCase()}`) || p.role || "CITIZEN"}
                      </span>
                    ]}
                  />
                ))}
              </div>
            </div>

            {blacklistedProfiles.length > 0 && !search && filterRole === 'all' && (
              <div className="flex flex-col gap-4">
                <h4 className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_var(--danger)]"></span>
                  {(t("banned_identities")).replace("{count}", blacklistedProfiles.length.toString())}
                </h4>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                  {blacklistedProfiles.map((p: any) => (
                    <UniversalCard
                      key={p.id}
                      onClick={() => handleOpenPanel(p)}
                      layout="horizontal"
                      icon="block"
                      statusColor="border-red-500/20 group-hover:border-red-500/50"
                      className="!bg-red-500/5 hover:!bg-red-500/10"
                      title={
                        <span className="text-red-400 group-hover:text-red-300 transition-colors">
                          {p.username || t("vlocal") || "UNKNOWN"}
                        </span>
                      }
                      subtitle={
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-mono text-red-400 opacity-60">{t("auto_id")} {p.id.substring(0, 8)}</span>
                          {p.is_banned && p.blacklist_reason && <span className="text-xs font-bold text-red-400/80 leading-tight line-clamp-2 mt-2 italic flex-1">{t("auto_upload")}{p.blacklist_reason}"</span>}
                          {p.is_comm_banned && p.comm_blacklist_reason && <span className="text-xs font-bold text-red-400/80 leading-tight line-clamp-2 mt-2 italic flex-1">{t("auto_comms")}{p.comm_blacklist_reason}"</span>}
                        </div>
                      }
                      badges={[
                        p.is_banned && (
                          <span key="upload" className="px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors bg-red-500/10 text-red-400 border-red-500/20 group-hover:bg-red-500/20">
                            {t("banned_upload")}
                          </span>
                        ),
                        p.is_comm_banned && (
                          <span key="comm" className="px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors bg-red-500/10 text-red-400 border-red-500/20 group-hover:bg-red-500/20">
                            {t("banned_comm")}
                          </span>
                        )
                      ]}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <SharedIdentityEditor profile={selectedProfile} onClose={() => setSelectedProfile(null)} onUpdated={fetchData} isWayfinder={isWayfinder} isKeepers={isKeepers} />
    </div>
  );
}
