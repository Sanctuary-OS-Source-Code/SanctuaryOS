import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { CustomDropdown, SidePanel, standardDangerButtonClass, standardSuccessButtonClass } from './shared';
import { useStore } from './store';

export const ROLES = ['citizen', 'mason', 'architect', 'senior_architect', 'wayfinder'];

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

export function SharedIdentityEditor({ profile, onClose, onUpdated, isWayfinder = false, isSkinny = false }: { profile: any, onClose: () => void, onUpdated: () => void, isWayfinder?: boolean, isSkinny?: boolean }) {
  const { t } = useLexicon();
  const [editRole, setEditRole] = useState("citizen");
  const [isBanned, setIsBanned] = useState(false);
  const [editReason, setEditReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (profile) {
      setEditRole(profile.role || "citizen");
      setIsBanned(profile.is_banned || false);
      setEditReason(profile.blacklist_reason || "");
      setStatus("");
    }
  }, [profile]);

  const handleUpdateRole = async () => {
    if (!profile) return;
    if (isBanned && !editReason.trim()) {
      setStatus("Reason is required for banning.");
      return;
    }
    
    setIsSubmitting(true);
    setStatus(t("sa_identities_updating") || "UPDATING ROLE...");
    
    const { data, error } = await supabase.from('profiles').update({ 
      role: editRole,
      is_banned: isBanned,
      blacklist_reason: isBanned ? editReason : null
    }).eq('id', profile.id).select();
    
    if (error || !data || data.length === 0) {
      setStatus(t("sa_identities_failed_prefix") || "FAILED:" + " " + (error?.message || "Permission Denied."));
    } else {
      const userRes = await supabase.auth.getUser();
      const myId = userRes.data.user?.id;
      
      await supabase.from('audit_logs').insert({
         action: isBanned ? `Banned User` : `Updated role to ${editRole}`,
         target_table: 'profiles',
         target_name: profile.username || profile.id,
         actor_id: myId,
         reason: isBanned ? editReason : "Role Update"
      });
      
      setStatus(t("sa_identities_updated") || "ROLE UPDATED");
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
      title="EDIT IDENTITY"
      icon={t("ui_icon_group") || "group"}
      subtitle={profile ? `UUID: ${profile.id}` : undefined}
      widthClass={isSkinny ? "w-[90vw] max-w-[475px]" : undefined}
      actions={
        <div className="flex flex-col gap-4 w-full">
          {status && (
            <div className="text-center bg-black/20 p-3 rounded-xl border border-white/5 w-full">
              <p className={`text-[10px] font-black uppercase tracking-widest ${status.toLowerCase().includes('failed') || status.toLowerCase().includes('required') ? 'text-red-400' : 'theme-text-accent'}`}>{status}</p>
            </div>
          )}
          
          <button 
            onClick={handleUpdateRole} 
            disabled={isSubmitting || (isBanned && !editReason.trim())} 
            className={`!w-full !rounded-[2rem] !py-5 ${isBanned ? standardDangerButtonClass : standardSuccessButtonClass}`}
          >
            {isSubmitting ? t("sa_identities_updating") || "UPDATING ROLE..." : t("registry_commit_changes") || "Commit Changes"}
          </button>
        </div>
      }
    >
      <div className="p-6 flex flex-col h-full gap-8">
        
        <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
          <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
            <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_info") || "info"}</span>
            {t("mason_bug_inspect_report") || "View"}
          </h4>
          
          <div className="flex flex-col gap-2 relative z-10">
            <h3 className="text-xl font-black text-[var(--text)] uppercase tracking-tighter leading-none">{profile?.username || t("sa_identities_unknown") || "UNKNOWN"}</h3>
          </div>
        </div>

        <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
          <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent pointer-events-none rounded-2xl" />
          <h4 className="text-[10px] font-black text-[var(--text)] opacity-80 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
            <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_settings") || "settings"}</span>
            {t("sa_identities_role_label") || "ROLE:"}
          </h4>
          <div className="flex flex-col gap-2 relative z-50">
            <CustomRoleSelect 
               value={editRole} 
               roles={isWayfinder ? ROLES : ROLES.filter(r => r !== 'wayfinder')} 
               onChange={(newRole: string) => setEditRole(newRole)}
               isBlacklisted={isBanned}
            />
          </div>
        </div>

        <div className={`flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border ${isBanned ? 'border-red-500/30' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)]'} relative`}>
          <div className={`absolute inset-0 bg-gradient-to-br ${isBanned ? 'from-red-500/10' : 'from-red-500/5'} to-transparent pointer-events-none rounded-2xl transition-colors`} />
          <h4 className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border-b ${isBanned ? 'border-red-500/20 text-red-400' : 'border-white/5 text-[var(--text)] opacity-80'} pb-4 mb-2 transition-colors`}>
            <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_gavel") || "gavel"}</span>
            PUNITIVE ACTION
          </h4>
           <div className="flex items-center justify-between relative z-10">
              <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-2">
                 BAN IDENTITY
              </label>
              <button 
                onClick={() => setIsBanned(!isBanned)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isBanned ? 'bg-red-500' : 'bg-gray-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isBanned ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
           </div>

           {isBanned && (
             <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 relative z-10 mt-2">
               <label className="text-[9px] font-black text-red-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                  {t("sa_ban_reason_req") || "BAN REASON (REQUIRED)"}
               </label>
               <textarea 
                 value={editReason} 
                 onChange={e => setEditReason(e.target.value)} 
                 placeholder={t("id_reason_ban") || "Reason for quarantine / ban..."} 
                 className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold h-32 resize-none focus:outline-none border border-red-500/30 bg-red-500/5 focus:border-red-500/60 shadow-[inset_0_0_20px_rgba(255,0,0,0.1)]" 
               />
             </div>
           )}
        </div>
      </div>
    </SidePanel>
  );
}

export function IdentityMatrix({ isWayfinder = false }: { isWayfinder?: boolean }) {
  const { t } = useLexicon();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [blacklistedProfiles, setBlacklistedProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");

  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('username');
    if (data) {
      setProfiles(data.filter(p => !p.is_banned));
      setBlacklistedProfiles(data.filter(p => p.is_banned));
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleOpenPanel = (p: any) => {
    if (!isWayfinder && p.role === 'wayfinder') {
      useStore.getState().pushStatus("You cannot edit Wayfinder identities from this matrix.");
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
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_group") || "group"}</span>
          </div>
          <span className="truncate">{t("sa_title_identities") || "Identity Matrix"}</span>
        </h2>
        
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("ui_icon_search") || "search"}</span>
            <input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder={t("sa_identities_search") || "Search global registry..."} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
          </div>

          <div className="w-48 z-40">
            <CustomDropdown disableTint={true}   
              value={filterRole} 
              onChange={(v: string[]) => setFilterRole(v[0])} 
              options={[
                { id: "all", label: "ALL ROLES" },
                ...ROLES.filter(r => isWayfinder || r !== 'wayfinder').map(r => ({ id: r, label: r.replace(/_/g, ' ').toUpperCase() }))
              ]}
              placeholder="FILTER ROLE"
            />
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-8">
      {loading ? (
        <div className="theme-glass-panel p-8 rounded-3xl text-center text-sm font-bold text-[var(--subtext)] uppercase tracking-widest animate-pulse">{t("sa_identities_fetching") || "Fetching Records..."}</div>
      ) : (
        <>
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-8 h-8 rounded-xl theme-glass-panel border border-[var(--accent)]/50 flex items-center justify-center shadow-[inset_0_0_15px_rgba(var(--accent-rgb),0.2)] relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/20 to-transparent"></div>
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_10px_rgba(var(--accent-rgb),0.5)]"></span>
                  </div>
                  <h4 className="text-sm font-black text-[var(--accent)] uppercase tracking-widest drop-shadow-md">
                    {t("sa_active_citizens") || "ACTIVE CITIZENS ({count})".replace("{count}", filteredProfiles.length.toString())}
                  </h4>
                </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {filteredProfiles.map((p: any) => (
                <div 
                  key={p.id} 
                  onClick={() => handleOpenPanel(p)}
                  className={`theme-glass-panel rounded-[1.5rem] flex flex-col group border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all duration-500 relative overflow-hidden bg-gradient-to-br from-white/5 to-transparent min-h-[160px] ${(!isWayfinder && p.role === 'wayfinder') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)] hover:-translate-y-1.5'}`}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  
                  <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-500 ${p.role === 'senior_architect' || p.role === 'wayfinder' ? 'bg-amber-500/50 group-hover:bg-amber-500 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.5)]' : 'theme-bg-accent/50 group-hover:theme-bg-accent group-hover:shadow-[0_0_20px_var(--accent)]'}`} />
                  
                  <div className="p-6 flex flex-col gap-4 flex-1 relative z-10">
                    <div className="flex justify-between items-start gap-4">
                      <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
                          <span className="material-symbols-outlined !text-[24px] text-[var(--text)] opacity-50 group-hover:opacity-100 group-hover:theme-text-accent transition-colors duration-500">
                              person
                          </span>
                      </div>
                      <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors ${p.role === 'senior_architect' || p.role === 'wayfinder' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 group-hover:bg-amber-500/20' : 'theme-bg-accent/10 theme-text-accent theme-border-accent/20 group-hover:theme-bg-accent/20'}`}>
                          {p.role || "citizen"}
                      </span>
                    </div>
                    
                    <div className="flex flex-col gap-1 mt-auto">
                        <span className="text-lg font-black text-[var(--text)] uppercase tracking-tighter truncate leading-tight transition-colors group-hover:theme-text-accent">
                          {p.username || t("sa_identities_unknown") || "UNKNOWN"}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60">ID: {p.id.substring(0,8)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {blacklistedProfiles.length > 0 && !search && filterRole === 'all' && (
            <div className="flex flex-col gap-4">
              <h4 className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_var(--danger)]"></span>
                {t("sa_banned_identities") || "BANNED IDENTITIES ({count})".replace("{count}", blacklistedProfiles.length.toString())}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {blacklistedProfiles.map((p: any) => (
                  <div 
                    key={p.id} 
                    onClick={() => handleOpenPanel(p)}
                    className={`theme-glass-panel rounded-[1.5rem] flex flex-col group border border-red-500/30 transition-all duration-500 relative overflow-hidden bg-gradient-to-br from-red-500/5 to-transparent min-h-[160px] cursor-pointer hover:border-red-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.2)] hover:-translate-y-1.5`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    
                    <div className="absolute top-0 left-0 w-full h-1 bg-red-500/50 transition-all duration-500 group-hover:bg-red-500 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.8)]" />
                    
                    <div className="p-6 flex flex-col gap-4 flex-1 relative z-10">
                      <div className="flex justify-between items-start gap-4">
                        <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-red-500/20 bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] group-hover:border-red-500/50">
                            <span className="material-symbols-outlined !text-[24px] text-red-500 opacity-50 group-hover:opacity-100 transition-colors duration-500">
                                block
                            </span>
                        </div>
                        <span className="px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors bg-red-500/10 text-red-400 border-red-500/20 group-hover:bg-red-500/20">
                            {t("sa_banned") || "BANNED"}
                        </span>
                      </div>
                      
                      {p.blacklist_reason && (
                        <span className="text-xs font-bold text-red-400/80 leading-tight line-clamp-2 mt-2 italic flex-1">"{p.blacklist_reason}"</span>
                      )}

                      <div className="flex flex-col gap-1 mt-auto pt-2">
                          <span className="text-lg font-black text-red-400 uppercase tracking-tighter truncate leading-tight transition-colors group-hover:text-red-300">
                            {p.username || t("sa_identities_unknown") || "UNKNOWN"}
                          </span>
                          <span className="text-[10px] font-mono text-red-400 opacity-60">ID: {p.id.substring(0,8)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      </div>

      <SharedIdentityEditor profile={selectedProfile} onClose={() => setSelectedProfile(null)} onUpdated={fetchData} isWayfinder={isWayfinder} />
    </div>
  );
}
