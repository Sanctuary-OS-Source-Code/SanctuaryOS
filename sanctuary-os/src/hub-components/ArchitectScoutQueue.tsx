import { SearchBar, ScreenUtilityBar, FilterTabs, FilterTabButton } from "../shared";
import React, { useState, useEffect } from "react";
import { fetchAllPaginated, isSupportedExtension } from "../shared";
import { CustomClassificationDropdown } from "../hub-components/SharedRegistry";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, DashboardStatTile,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion
} from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import MarkdownRenderer from "../MarkdownRenderer";


export function ScoutQueue({ modList = [], setStatus }: { modList?: any[], setStatus?: any }) {
  const { t } = useLexicon();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState<'pending' | 'completed'>('pending');
  const [visibleCount, setVisibleCount] = useState(100);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [masonsList, setMasonsList] = useState<any[]>([]);
  const [cloudModsList, setCloudModsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeScout, setActiveScout] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lineageId, setLineageId] = useState<string>("");
  const activeGameSchema = useStore(state => state.activeGameSchema);

  const [isMasonPanelOpen, setIsMasonPanelOpen] = useState(false);
  const [newMasonName, setNewMasonName] = useState("");
  const [isCreatingMason, setIsCreatingMason] = useState(false);

  const handleCreateMason = async () => {
    if (!newMasonName.trim()) return;
    setIsCreatingMason(true);
    const newId = crypto.randomUUID();
    const { error } = await supabase.from('masons').insert([{ id: newId, name: newMasonName }]);
    if (!error) {
      const { data: mData } = await supabase.from('masons').select('id, name').order('name');
      if (mData) setMasonsList(mData);
      setEditForm({ ...editForm, mason_id: newId });
      setIsMasonPanelOpen(false);
      setNewMasonName("");
    }
    setIsCreatingMason(false);
  };

  const [editForm, setEditForm] = useState({
    name: "",
    mason_id: "",
    category_override: "",
    sub_type: "", file_extension: "",
    description: "",
    image_url: "",
    latest_version: "",
    url: "",
    compliance_tier: 0,
    compatible_versions: [] as string[],
    hash_version: ""
  });

  const fetchSubmissions = async () => {
    setLoading(true);
    const { data: mData } = await supabase.from('masons').select('*').order('name');
    if (mData) setMasonsList(mData);

    const { data: cData } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, master_author, latest_version, url, image_url, description, sub_type, file_extension, mason_id, category_override, compliance_tier, compatible_versions').order('name'));
    if (cData) setCloudModsList(cData);

    const { data, error } = await supabase
      .from('scout_suggestions')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error && data) setSubmissions(data);
    setLoading(false);
  };

  useEffect(() => { fetchSubmissions(); }, []);

  useEffect(() => { setVisibleCount(100); }, [searchTerm, filterTab]);

  useEffect(() => {
    if (activeScout) {
      setLineageId("");
      const possibleMason = masonsList.find((m: any) => m.name === activeScout.suggested_author || m.id === activeScout.suggested_mason_id);
      let st = activeScout.suggested_sub_type || "";
      let fe = "";
      if (isSupportedExtension(st, useStore.getState().activeGameSchema)) {
        fe = "." + st.toLowerCase();
        st = "";
      }

      setEditForm({
        name: (activeScout.suggested_name || "").replace(/_/g, " "),
        mason_id: possibleMason ? possibleMason.id : "",
        category_override: activeScout.suggested_type || "Script",
        sub_type: st,
        file_extension: fe,
        description: "",
        image_url: "",
        latest_version: "",
        url: activeScout.suggested_url || "",
        compliance_tier: 0,
        compatible_versions: [],
        hash_version: activeScout.suggested_version || "v.Scout"
      });
    } else {
      setEditForm({
        name: "", mason_id: "", category_override: "", sub_type: "", file_extension: "", description: "", image_url: "", latest_version: "", url: "", compliance_tier: 0, compatible_versions: [], hash_version: ""
      });
      setLineageId("");
    }
  }, [activeScout, masonsList]);

  useEffect(() => {
    if (lineageId && cloudModsList) {
      const existing = cloudModsList.find(m => m.id === lineageId);
      if (existing) {
        setEditForm(prev => ({
          ...prev,
          name: existing.name || prev.name,
          mason_id: existing.mason_id || prev.mason_id,
          category_override: existing.category_override || prev.category_override,
          sub_type: existing.sub_type || prev.sub_type,
          file_extension: existing.file_extension || prev.file_extension,
          description: existing.description || prev.description,
          image_url: existing.image_url || prev.image_url,
          url: existing.url || prev.url,
          compliance_tier: existing.compliance_tier || prev.compliance_tier,
          compatible_versions: existing.compatible_versions || prev.compatible_versions
        }));
      }
    }
  }, [lineageId, cloudModsList]);

  const handleAction = async (action: 'approved' | 'rejected') => {
    if (!activeScout) return;
    setIsProcessing(true);

    if (action === 'approved') {
      if (lineageId) {
        await supabase.from('mod_versions').upsert({
          mod_id: lineageId,
          dna_hash: activeScout.dna_hash,
          version_label: editForm.hash_version
        }, { onConflict: 'dna_hash' });

        await supabase.from('mods').update({
          name: editForm.name,
          mason_id: editForm.mason_id || null,
          category_override: editForm.category_override,
          sub_type: editForm.sub_type,
          file_extension: editForm.file_extension,
          description: editForm.description,
          image_url: editForm.image_url,
          url: editForm.url,
          compliance_tier: editForm.compliance_tier,
          compatible_versions: editForm.compatible_versions,
          status: 'verified'
        }).eq('id', lineageId);
      } else {
        const { data: modData } = await supabase.from('mods').insert({
          name: editForm.name,
          mason_id: editForm.mason_id || null,
          category_override: editForm.category_override,
          sub_type: editForm.sub_type,
          file_extension: editForm.file_extension,
          description: editForm.description,
          image_url: editForm.image_url,
          latest_version: editForm.latest_version,
          url: editForm.url,
          compliance_tier: editForm.compliance_tier,
          compatible_versions: editForm.compatible_versions,
          status: 'verified'
        }).select().single();

        if (modData) {
          await supabase.from('mod_versions').upsert({
            mod_id: modData.id,
            dna_hash: activeScout.dna_hash,
            version_label: editForm.hash_version
          }, { onConflict: 'dna_hash' });
        }
      }
      await supabase.from('scout_suggestions').update({ status: 'approved' }).eq('id', activeScout.id);
      logArchitectAction('Approved Scout Submission', 'scout_suggestions', activeScout.id);
    } else {
      await supabase.from('scout_suggestions').update({ status: 'rejected' }).eq('id', activeScout.id);
      logArchitectAction('Rejected Scout Submission', 'scout_suggestions', activeScout.id);
    }

    setActiveScout(null);
    await fetchSubmissions();
    setIsProcessing(false);
  };

  const activeSubmissions = submissions.filter((s: any) => filterTab === 'pending' ? s.status === 'pending' : s.status !== 'pending');

  // Group by hash to count occurrences
  const hashCounts = new Map<string, number>();
  submissions.forEach((s: any) => {
    if (s.dna_hash) {
      hashCounts.set(s.dna_hash, (hashCounts.get(s.dna_hash) || 0) + 1);
    }
  });

  let filteredSubmissions = activeSubmissions.filter((s: any) => {
    return s.suggested_name?.toLowerCase().includes(searchTerm.toLowerCase()) || s.id?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const seenHashes = new Set();
  filteredSubmissions = filteredSubmissions.filter((s: any) => {
    if (!s.dna_hash) return true;
    const minScoutSubmissions = activeGameSchema?.min_scout_submissions ?? 5;
    if ((hashCounts.get(s.dna_hash) || 0) < minScoutSubmissions) return false;
    if (seenHashes.has(s.dna_hash)) return false;
    seenHashes.add(s.dna_hash);
    return true;
  });

  return (
    <div className="flex flex-col w-full relative h-full">
      <ScreenUtilityBar
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t("search_queue")}
        className="!mb-0 !border-0 !pb-0" // matching inner layout pattern
      >
        <FilterTabs className="h-12 z-40">
          <FilterTabButton id="pending" label={t("pending")} activeTab={filterTab} setTab={setFilterTab} />
          <FilterTabButton id="completed" label={t("status_completed")} activeTab={filterTab} setTab={setFilterTab} />
        </FilterTabs>
      </ScreenUtilityBar>

      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="h-full flex items-center justify-center theme-text-accent font-black tracking-widest text-xs capitalize animate-pulse">{t("intercepting")}</div>
        ) : filteredSubmissions.length === 0 ? (
          <EmptyState icon={t("icon_account_balance")} title={t("no_pending_submissions")} className="col-span-full py-16" />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
              {filteredSubmissions.slice(0, visibleCount).map((mod: any) => (
                <ArtifactCard key={mod.id} mod={{ ...mod, name: mod.suggested_name, category_override: mod.suggested_type || "Scout Suggestion" }} onClick={() => setActiveScout(mod)} masonsList={masonsList} overrideActionLabel={t("btn_view")} />
              ))}
            </div>
            {filteredSubmissions.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + 100)}
                className="w-full py-4 mt-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] font-black capitalize tracking-widest transition-all"
              >
                {t("ui_btn_load_more")} ({visibleCount} / {filteredSubmissions.length})
              </button>
            )}
          </div>
        )}
      </div>

      <SidePanel
        isOpen={!!activeScout}
        onClose={() => setActiveScout(null)}
        title={t("reviewing")}
        icon={t("icon_search")}
        subtitle={`HASH: ${activeScout?.dna_hash}`}
        actions={
          <>
            <button onClick={() => handleAction('rejected')} disabled={isProcessing} className={standardDangerButtonClass}>
              {t("discard")}
            </button>
            <button onClick={() => handleAction('approved')} disabled={isProcessing} className={standardSuccessButtonClass}>
              {isProcessing ? t("btn_saving") : t("approve")}
            </button>
          </>
        }
      >
        {activeScout && (
          <div className="flex flex-col gap-6">

            <div className="flex flex-col gap-6 p-6 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
              <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent pointer-events-none rounded-2xl" />

              <div className="flex flex-col gap-2 relative z-10">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[14px]">{t("icon_account_tree")}</span>
                  {t("label_lineage")}
                </label>
                <ModSearchDropdown
                  modList={cloudModsList || []}
                  onSelect={(m: any) => setLineageId(m.id)}
                  selectedItem={cloudModsList?.find((m: any) => m.id === lineageId)}
                  onClear={() => setLineageId("")}
                  placeholder={t("ph_link_lineage")}
                />
                <p className="text-[9px] font-bold text-[var(--subtext)] opacity-60 mt-1 ml-2">
                  {t("label_lineage_desc")}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-6 p-6 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
              <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent pointer-events-none rounded-2xl" />
              <h4 className="text-[10px] font-black theme-text-accent capitalize tracking-widest flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 mb-2">
                <span className="material-symbols-outlined !text-[14px]">{t("icon_info")}</span>
                {t("btn_view")}
              </h4>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 relative z-10">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("label_modname")}</label>
                  <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="glass-surface rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent bg-black/20" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("mason")}</label>
                  <div className="flex gap-2 relative">
                    <div className="flex-1 min-w-0">
                      <CustomMasonDropdown value={editForm.mason_id} options={masonsList} onChange={(id: string) => setEditForm({ ...editForm, mason_id: id })} />
                    </div>
                    <button onClick={() => setIsMasonPanelOpen(true)} className="bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:theme-bg-accent hover:text-[var(--bg)] text-[var(--text)] px-5 rounded-xl font-black transition-colors shrink-0">
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 relative z-10">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("category")}</label>
                  <CustomClassificationDropdown value={editForm.category_override} onChange={(newType: string) => setEditForm({ ...editForm, category_override: newType })} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("label_file_ext")}</label>
                  <input value={editForm.file_extension} onChange={e => setEditForm({ ...editForm, file_extension: e.target.value })} className="glass-surface rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent bg-black/20" placeholder={t("ph_file_ext")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("registry_col_subcat")}</label>
                  <input value={editForm.sub_type} onChange={e => setEditForm({ ...editForm, sub_type: e.target.value })} className="glass-surface rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent bg-black/20" placeholder={t("auto_e_g_tuning_26")} />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6 p-6 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none rounded-2xl" />
              <h4 className="text-[10px] font-black text-emerald-400 capitalize tracking-widest flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 mb-2">
                <span className="material-symbols-outlined !text-[14px]">{t("icon_link")}</span>
                {t("label_resources")}
              </h4>

              <div className="flex flex-col gap-2 relative z-10">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("registry_label_url")}</label>
                <input value={editForm.url || ""} onChange={e => setEditForm({ ...editForm, url: e.target.value })} className="glass-surface rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--success)_50%,transparent)] bg-black/20" />
              </div>

              <div className="flex flex-col gap-2 relative z-10">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("cc_cover_url")}</label>
                <input value={editForm.image_url || ""} onChange={e => setEditForm({ ...editForm, image_url: e.target.value })} className="glass-surface rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--success)_50%,transparent)] bg-black/20" />
              </div>

              <div className="flex flex-col gap-2 relative z-10">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("upload_desc")}</label>
                <textarea value={editForm.description || ""} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold h-28 resize-none focus:outline-none focus:border-[color-mix(in_srgb,var(--success)_50%,transparent)] bg-black/20" />
              </div>
            </div>

            <div className="flex flex-col gap-6 p-6 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none rounded-2xl" />
              <h4 className="text-[10px] font-black text-purple-400 capitalize tracking-widest flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 mb-2">
                <span className="material-symbols-outlined !text-[14px]">{t("verified")}</span>
                {t("compliance_tier")}
              </h4>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 relative z-10">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("compliance_tier")}</label>
                  <CustomComplianceDropdown value={editForm.compliance_tier || 0} onChange={(val: number) => setEditForm({ ...editForm, compliance_tier: val })} includeTier3={false} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-1">
                    {t("registry_label_version")}
                  </label>
                  <input value={editForm.latest_version} onChange={e => setEditForm({ ...editForm, latest_version: e.target.value })} placeholder={t("ph_mod_version")} className="glass-surface rounded-xl px-5 h-12 text-purple-400 text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-black/20" />
                </div>
              </div>

              <div className="flex flex-col gap-2 relative z-10">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("game_versions")}</label>
                <GameVersionMultiSelect selectedVersions={editForm.compatible_versions || []} onChange={(v: string[]) => setEditForm({ ...editForm, compatible_versions: v })} />
              </div>
            </div>

          </div>
        )}
      </SidePanel>

      <SidePanel
        isOpen={isMasonPanelOpen}
        onClose={() => setIsMasonPanelOpen(false)}
        title={t("create_title")}
        icon={t("icon_person_add")}
        actions={
          <button onClick={handleCreateMason} className={standardAccentGlassButtonClass}>
            {t("create_btn_create")}
          </button>
        }
      >
        <div className="p-6">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("mason_name")}</label>
          <input value={newMasonName} onChange={e => setNewMasonName(e.target.value)} placeholder={t("create_ph_name")} className="glass-surface rounded-xl px-5 h-12 mt-2 w-full text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
        </div>
      </SidePanel>
    </div>
  )
}

