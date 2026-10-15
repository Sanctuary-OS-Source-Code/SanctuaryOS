import { HubOverviewLanding, HubOverviewSection, SidePanelTitleInput, SidePanelPillToggle, UniversalGroup, UniversalInput, UniversalTextArea, UniversalToggle } from './components/universal/UniversalLayout';
import React, { useState, useEffect } from 'react';
import { supabase, supabaseAuth } from './supabase';
import { useLexicon } from './LexiconContext';
import { CustomDropdown, SidePanel, standardDangerButtonClass, standardSuccessButtonClass, standardButtonClass, EmptyState, ActionButton, ActionPill, PanelHeaderGroup, PanelHeaderButton } from './shared';
import { UniversalCard } from './components/universal/UniversalCard';
import { ElevatedHubLayout } from './components/layouts/ElevatedHubLayout';
import { useStore } from './store';
import { logArchitectAction } from './lib/audit';

export const ROLES = ['citizen', 'mason', 'architect', 'oversight', 'wayfinder'];

const getRoleBadgeStyle = (role: string) => {
  const base = "text-[9px] font-black capitalize tracking-[0.2em] px-3 py-1.5 rounded-full border shadow-inner transition-colors duration-500 shrink-0";
  const r = (role || 'citizen').toLowerCase();
  
  if (r === 'admin') {
    return `${base} bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] group-hover:text-[var(--text)]`;
  }
  if (r === 'keeper') {
    return `${base} bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] text-[color-mix(in_srgb,var(--accent)_70%,transparent)] border-[color-mix(in_srgb,var(--accent)_10%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group-hover:text-[var(--accent)]`;
  }
  if (r === 'wayfinder' || r === 'oversight') {
    return `${base} bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] text-[color-mix(in_srgb,var(--warning)_70%,transparent)] border-[color-mix(in_srgb,var(--warning)_10%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)] group-hover:text-[var(--warning)]`;
  }
  if (r === 'architect') {
    return `${base} bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] text-[color-mix(in_srgb,var(--accent)_70%,transparent)] border-[color-mix(in_srgb,var(--accent)_10%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group-hover:text-[var(--accent)]`;
  }
  if (r === 'mason') {
    return `${base} bg-[color-mix(in_srgb,var(--success)_5%,transparent)] text-[color-mix(in_srgb,var(--success)_70%,transparent)] border-[color-mix(in_srgb,var(--success)_10%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)] group-hover:text-[var(--success)]`;
  }
  if (r === 'core_dev') {
    return `${base} bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] text-[color-mix(in_srgb,var(--accent)_70%,transparent)] border-[color-mix(in_srgb,var(--accent)_10%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group-hover:text-[var(--accent)]`;
  }
  // citizen
  return `${base} bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] opacity-70 border-[color-mix(in_srgb,var(--text)_5%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:opacity-100`;
};


export function CustomRoleSelect({ value, onChange, roles, isBlacklisted }: any) {
  const { t } = useLexicon();
  const options = roles.map((r: string) => ({ id: r, label: r.replace(/_/g, ' ').toUpperCase() }));
  return (
    <div className={`w-full ${isBlacklisted ? '[&_button]:!bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] [&_button]:!border-[color-mix(in_srgb,var(--danger)_30%,transparent)] [&_button]:!text-[var(--danger)]' : ''}`}>
      <CustomDropdown disableTint={true}
        value={value}
        options={options}
        onChange={(v: string[]) => onChange(v[0])}
        placeholder={t("select_role") || "Select Role"}
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
      setStatus(t("err_self_role_modify") || "Action denied: You cannot modify your own role.");
      return;
    }
    if (isBanned && !editReason.trim()) {
      setStatus(t("err_upload_ban_reason") || "Reason is required for upload ban.");
      return;
    }
    if (isCommBanned && !editCommReason.trim()) {
      setStatus(t("err_comms_ban_reason") || "Reason is required for comms ban.");
      return;
    }

    setIsSubmitting(true);
    setStatus(t("identities_updating") || "Updating...");

    let data: any = null;
    let error: any = null;

    if (isKeepers) {
      const res = await supabaseAuth.from('profiles').update({
        role: editRole,
        is_banned: isBanned,
        blacklist_reason: isBanned ? editReason : null
      }).eq('id', profile.id).select();
      data = res.data;
      error = res.error;
      if (!error && data && data.length > 0) {
        await supabase.rpc('secure_sync_hub_ban_to_spokes', {
          p_target_user_id: profile.id
        });
      }
    } else {
      const res: any = await supabase.rpc('secure_update_spoke_profile', {
        p_target_user_id: profile.id,
        p_updates: {
          role: editRole,
          is_banned: isBanned,
          is_comm_banned: isCommBanned,
          blacklist_reason: isBanned ? editReason : null,
          comm_blacklist_reason: isCommBanned ? editCommReason : null
        }
      });
      data = res.data;
      error = res.error || (res.data?.error ? new Error(res.data.error) : null);
    }

    if (error || !data || data.length === 0) {
      setStatus((t("identities_failed_prefix") || "Failed:") + " " + (error?.message || "Permission Denied."));
    } else {
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

      setStatus(t("identities_updated") || "Identity updated.");
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
      title={t("edit_identity") || "Edit Identity"}
      icon={t("icon_group") || "group"}
      subtitle={profile ? `UUID: ${profile.id}` : undefined}
      widthClass={isSkinny ? "w-[90vw] max-w-[475px]" : undefined}
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton icon="check" variant="success" tooltip={isSubmitting ? (t("identities_updating") || "Updating...") : (t("ui_btn_commit") || "Commit")} onClick={handleUpdateRole} disabled={isSubmitting || (isBanned && !editReason.trim()) || (isCommBanned && !editCommReason.trim()) || (!isWayfinder && !isKeepers && ['oversight', 'wayfinder'].includes(profile?.role))} />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col h-full gap-8">
        {status && (
          <div className="text-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full -mb-4">
            <p className={`text-[10px] font-black capitalize tracking-widest ${status.toLowerCase().includes('failed') || status.toLowerCase().includes('required') || status.toLowerCase().includes('denied') ? 'text-[var(--danger)]' : 'theme-text-accent'}`}>{status}</p>
          </div>
        )}

        <SidePanelTitleInput
          value={`@${profile?.username || (t("vlocal") || "Unknown")}`}
          readOnly
        />

        <UniversalGroup title={t("identities_role_label") || "Assigned Role"} icon={t("icon_settings") || "settings"}>
          {(!isWayfinder && !isKeepers && ['oversight', 'wayfinder'].includes(profile?.role)) ? (
            <div className="flex flex-col gap-2 relative z-50 p-4 rounded-xl bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] w-full">
              <p className="text-xs font-bold text-[var(--warning)]">{t("identities_wayfinder_locked") || "Role locked by Wayfinder oversight."}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 relative z-50 w-full">
              <CustomRoleSelect
                value={editRole}
                roles={isKeepers ? ['citizen', 'keeper'] : (isWayfinder ? ROLES : ['citizen', 'mason', 'architect'])}
                onChange={(newRole: string) => setEditRole(newRole)}
                isBlacklisted={isBanned}
              />
            </div>
          )}
        </UniversalGroup>

        {(!isWayfinder && !isKeepers && ['oversight', 'wayfinder'].includes(profile?.role)) ? null : (
          <div className="flex flex-col gap-6">
            <UniversalGroup 
              title={isWayfinder ? (t("identities_punitive_upload") || "Upload Restrictions") : (t("ui_network_blacklist") || "Network Blacklist")} 
              icon={t("icon_gavel") || "gavel"} 
              headerColorClass={isBanned ? 'text-[var(--danger)]' : undefined}
            >
              <SidePanelPillToggle
                label={t("identities_ban") || "Restrict Identity"}
                checked={isBanned}
                onChange={setIsBanned}
                icon={t("icon_gavel") || "gavel"}
                variant="danger"
              />

              {isBanned && (
                <div className="animate-in fade-in slide-in-from-top-2 relative z-10 w-full mt-2">
                  <UniversalTextArea
                    label={t("ban_reason_req") || "Restriction Reason"}
                    value={editReason}
                    onChange={setEditReason}
                    placeholder={t("id_reason_ban") || "Enter reason for restriction..."}
                    className="h-32 border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] focus:border-[color-mix(in_srgb,var(--danger)_60%,transparent)] w-full text-[var(--danger)]"
                  />
                </div>
              )}
            </UniversalGroup>

            {isWayfinder && (
              <UniversalGroup
                title={t("identities_punitive_comm") || "Communications Restriction"}
                icon={t("icon_gavel") || "gavel"}
                headerColorClass={isCommBanned ? 'text-[var(--danger)]' : undefined}
              >
                <SidePanelPillToggle
                  label={t("identities_ban") || "Restrict Communications"}
                  checked={isCommBanned}
                  onChange={setIsCommBanned}
                  icon={t("icon_gavel") || "gavel"}
                  variant="danger"
                />

                {isCommBanned && (
                  <div className="animate-in fade-in slide-in-from-top-2 relative z-10 w-full mt-2">
                    <UniversalTextArea
                      label={t("ban_reason_req") || "Restriction Reason"}
                      value={editCommReason}
                      onChange={setEditCommReason}
                      placeholder={t("id_reason_comm_ban") || "Enter reason for communications restriction..."}
                      className="h-32 border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] focus:border-[color-mix(in_srgb,var(--danger)_60%,transparent)] w-full text-[var(--danger)]"
                    />
                  </div>
                )}
              </UniversalGroup>
            )}
          </div>
        )}
      </div>
    </SidePanel>
  );
}

export function IdentityMatrix({ isWayfinder = false, isKeepers = false, initialFilterRole = "overview" }: { isWayfinder?: boolean, isKeepers?: boolean, initialFilterRole?: string }) {
  const { t } = useLexicon();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [blacklistedProfiles, setBlacklistedProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState(initialFilterRole === "all" ? "overview" : initialFilterRole);

  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const { getActiveGameClient } = await import('./supabase');
    const client = isKeepers ? supabaseAuth : getActiveGameClient();
    const { data } = await client.from('profiles').select('*').order('username');
    if (data) {
      let filteredData = data;
      if (!isKeepers && !isWayfinder) {
        filteredData = data.filter(p => !['oversight', 'wayfinder'].includes(p.role));
      }
      setProfiles(filteredData.filter((p: any) => !p.is_banned && !p.is_comm_banned));
      setBlacklistedProfiles(filteredData.filter((p: any) => p.is_banned || p.is_comm_banned));
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleOpenPanel = (p: any) => {
    if (!isWayfinder && !isKeepers && ['oversight', 'wayfinder'].includes(p.role)) {
      useStore.getState().pushStatus(t("auto_you_cannot_edit_45") || "You cannot edit this identity.");
      return;
    }
    setSelectedProfile(p);
  };

  const filteredProfiles = profiles.filter(p => {
    const matchesSearch = p.username?.toLowerCase().includes(search.toLowerCase()) || p.id?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = filterRole === "overview" || filterRole === "all" || p.role === filterRole || (!p.role && filterRole === 'citizen');
    return matchesSearch && matchesRole;
  });

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
      number: (profiles.length + blacklistedProfiles.length).toString()
    },
    ...ROLES.filter(r => {
      if (isKeepers) return r === 'citizen';
      if (!isWayfinder) return !['oversight', 'wayfinder'].includes(r);
      return true;
    }).map(r => ({ 
      id: r, 
      label: r.replace(/_/g, ' ').toUpperCase(), 
      icon: r === 'citizen' ? 'person' : r === 'mason' ? 'architecture' : r === 'architect' ? 'engineering' : 'admin_panel_settings',
      number: profiles.filter(p => p.role === r || (!p.role && r === 'citizen')).length.toString()
    })),
    ...(isKeepers ? [
      {
        id: 'keeper',
        label: t("role_keeper") || 'KEEPER',
        icon: "admin_panel_settings",
        number: profiles.filter(p => p.role === 'keeper').length.toString()
      }
    ] : [])
  ];

  const renderIdentityCard = (p: any) => (
    <UniversalCard
      key={p.id}
      onClick={() => handleOpenPanel(p)}
      className={(!isWayfinder && !isKeepers && ['oversight', 'wayfinder'].includes(p.role)) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
      layout="horizontal"
      icon="person"
      title={p.username || t("vlocal") || "Unknown"}
      subtitle={`${t("auto_id") || "ID:"} ${p.id.substring(0, 8)}`}
      badges={[
        <span key="role" className={getRoleBadgeStyle(p.role)}>
          {t(`role_${(p.role || "citizen").toLowerCase()}`) || p.role || "CITIZEN"}
        </span>
      ]}
    />
  );

  const renderBlacklistedCard = (p: any) => (
    <UniversalCard
      key={p.id}
      onClick={() => handleOpenPanel(p)}
      layout="horizontal"
      icon="block"
      statusColor="border-[color-mix(in_srgb,var(--danger)_20%,transparent)] group-hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)]"
      className="!bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
      title={
        <span className="text-[var(--danger)] transition-colors">
          {p.username || t("vlocal") || "Unknown"}
        </span>
      }
      subtitle={
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-mono text-[var(--danger)] opacity-60">{t("auto_id") || "ID:"} {p.id.substring(0, 8)}</span>
          {p.is_banned && p.blacklist_reason && <span className="text-xs font-bold text-[color-mix(in_srgb,var(--danger)_80%,transparent)] leading-tight line-clamp-2 mt-2 italic flex-1">{t("auto_upload") || "Upload: "}{p.blacklist_reason}"</span>}
          {p.is_comm_banned && p.comm_blacklist_reason && <span className="text-xs font-bold text-[color-mix(in_srgb,var(--danger)_80%,transparent)] leading-tight line-clamp-2 mt-2 italic flex-1">{t("auto_comms") || "Comms: "}{p.comm_blacklist_reason}"</span>}
        </div>
      }
      badges={[
        p.is_banned && (
          <span key="upload" className="px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner shrink-0 transition-colors bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]">
            {t("banned_upload") || "Upload Restricted"}
          </span>
        ),
        p.is_comm_banned && (
          <span key="comm" className="px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner shrink-0 transition-colors bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]">
            {t("banned_comm") || "Comms Restricted"}
          </span>
        )
      ]}
    />
  );

  const renderLanding = () => (
    <HubOverviewLanding>
      <HubOverviewSection
        icon="group"
        iconColorClass="text-[var(--accent)]"
        title={t("identities_active_title") || "Recent / Active Identities"}
        isEmpty={profiles.length === 0}
        emptyIcon={t("ui_icon_person_off") || "person_off"}
        emptyTitle={t("no_profiles") || "No active profiles"}
        gridClassName="grid grid-cols-1 gap-4"
      >
        {profiles.slice(0, 4).map((p: any) => renderIdentityCard(p))}
      </HubOverviewSection>

      <HubOverviewSection
        icon="gavel"
        iconColorClass="text-[var(--danger)]"
        title={(t("banned_identities") || "Restricted / Blacklisted ({count})").replace("{count}", blacklistedProfiles.length.toString())}
        isEmpty={blacklistedProfiles.length === 0}
        emptyIcon="verified_user"
        emptyTitle={t("no_issues") || "No restricted identities"}
        gridClassName="grid grid-cols-1 gap-4"
      >
        {blacklistedProfiles.slice(0, 4).map((p: any) => renderBlacklistedCard(p))}
      </HubOverviewSection>
    </HubOverviewLanding>
  );

  return (
    <ElevatedHubLayout
      headerTitle={t("identities_title") || "Identity Matrix"}
      headerSubtitle={t("identities_subtitle") || "Manage users, assign roles, and handle network violations."}
      headerIcon="group"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={(t("identities_search") || "Search identities...") as string}
      hideSearch={filterRole === 'overview'}
      tabs={tabs}
      activeTab={filterRole}
      onTabChange={(id) => setFilterRole(id as string)}
    >
      {loading ? (
        <div className="glass-panel p-8 rounded-2xl text-center text-sm font-bold text-[var(--subtext)] capitalize tracking-widest animate-pulse">{t("audit_fetching") || "Fetching identities..."}</div>
      ) : filterRole === 'overview' ? (
        renderLanding()
      ) : (
        <div className="flex flex-col gap-8 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
            {filteredProfiles.length === 0 && <EmptyState icon={t("ui_icon_person_off") || "person_off"} title={t("no_profiles") || "No profiles found"} className="col-span-full py-16" />}
            {filteredProfiles.map((p: any) => renderIdentityCard(p))}
          </div>
        </div>
      )}
      <SharedIdentityEditor profile={selectedProfile} onClose={() => setSelectedProfile(null)} onUpdated={fetchData} isWayfinder={isWayfinder} isKeepers={isKeepers} />
    </ElevatedHubLayout>
  );
}





