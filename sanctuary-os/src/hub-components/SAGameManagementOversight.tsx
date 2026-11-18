import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel, CustomDropdown, EmptyState, loadDLCMap, PanelHeaderGroup, PanelHeaderButton, VAULT_CHIP_CLASS
} from "../shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection } from "../components/layouts/ElevatedHubLayout";
import { UniversalGroup, UniversalTextArea, SidePanelHeroCard } from "../components/universal/UniversalLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
import { LiquidGlassAlertCard } from "../components/BlueprintPatchReadiness";
import { openSanctuaryContextMenu } from "../ContextMenu";
import { logArchitectAction } from "../lib/audit";
import { resolvePresetForGameId } from "../utils/gameArchitecturePresets";
import {
  ModCategoryDescriptor,
  normalizeTaxonomyRows,
  loadModCategories,
} from "../utils/categoryRegistry";

export function GameManagementOversight() {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const [activeTab, setActiveTab] = useState<'overview' | 'versions' | 'dlc' | 'categories'>('overview');

  const [versions, setVersions] = useState<any[]>([]);
  const [versionSearch, setVersionSearch] = useState("");
  const [dlcs, setDlcs] = useState<any[]>([]);
  const [dlcSearch, setDlcSearch] = useState("");
  const [dlcTypeFilter, setDlcTypeFilter] = useState("ALL");
  const [categories, setCategories] = useState<ModCategoryDescriptor[]>([]);
  const [categorySearch, setCategorySearch] = useState("");

  const [sidePanelMode, setSidePanelMode] = useState<
    | "add_version"
    | "edit_version"
    | "delete_version"
    | "add_dlc"
    | "edit_dlc"
    | "delete_dlc"
    | "add_category"
    | "edit_category"
    | null
  >(null);
  const [panelTarget, setPanelTarget] = useState<any>(null);
  const [panelInput1, setPanelInput1] = useState("");
  const [panelInput2, setPanelInput2] = useState("");
  const [panelInput3, setPanelInput3] = useState("EP");
  const [panelInput4, setPanelInput4] = useState("");
  const [panelLexKey, setPanelLexKey] = useState("");
  const [panelSubcatsText, setPanelSubcatsText] = useState("");
  const [panelReason, setPanelReason] = useState("");
  const [isPanelSubmitting, setIsPanelSubmitting] = useState(false);

  const fetchVersions = async () => {
    const { data } = await supabase.from('game_versions').select('*').order('version', { ascending: false });
    if (data) setVersions(data);
  };

  const fetchDlcs = async () => {
    const { data } = await supabase.from('dlc_registry').select('*').order('id', { ascending: true });
    if (data) setDlcs(data);
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from('taxonomy').select('*').order('category', { ascending: true });
    if (data) {
      setCategories(normalizeTaxonomyRows(data));
      loadModCategories(supabase).catch(() => {});
    }
  };

  useEffect(() => {
    fetchVersions();
    fetchDlcs();
    fetchCategories();
  }, []);

  const openPanel = (mode: string, target: any = null) => {
    setSidePanelMode(mode as any);
    setPanelTarget(target);
    setPanelReason("");
    if (mode === 'add_version') {
      setPanelInput1("");
    } else if (mode === 'edit_version') {
      setPanelInput1(target);
    } else if (mode === 'add_dlc') {
      setPanelInput1("");
      setPanelInput2("");
      setPanelInput3("EP");
    } else if (mode === 'edit_dlc') {
      setPanelInput1(target.id);
      setPanelInput2(target.name);
      setPanelInput3(target.type || "EP");
    } else if (mode === 'add_category') {
      setPanelInput1("");
      setPanelInput2("");
      setPanelInput3("category");
      setPanelInput4(String(categories.length));
      setPanelLexKey("");
      setPanelSubcatsText("");
    } else if (mode === 'edit_category' && target) {
      setPanelInput1(target.id || "");
      setPanelInput2(target.label || target.id || "");
      setPanelInput3(target.icon || "category");
      setPanelInput4(String(target.sort_order ?? 0));
      setPanelLexKey(target.lexicon_key || "");
      const subText = Array.isArray(target.subcategories)
        ? target.subcategories
            .map((s: any) => s?.label || s?.id || "")
            .filter(Boolean)
            .join(", ")
        : "";
      setPanelSubcatsText(subText);
    }
  };

  const handleSeedStarterCategories = async () => {
    setIsPanelSubmitting(true);
    try {
      const schemaKey = activeGameSchema?.game_id || activeGameSchema?.id || "universal";
      const preset = resolvePresetForGameId(schemaKey);
      const starter = Array.isArray(preset?.mod_categories) ? preset.mod_categories : [];
      if (starter.length === 0) {
        useStore
          .getState()
          .pushStatus(t("no_starter_categories", "No starter category preset defined for this game."), "info");
        return;
      }
      const rows = starter.map((cat: any, idx: number) => ({
        category: String(cat.id || cat.label || `Category${idx + 1}`).trim(),
        type: String(cat.label || cat.id || `Category${idx + 1}`).trim(),
        taxonomy_attributes: {
          label: String(cat.label || cat.id || `Category${idx + 1}`).trim(),
          icon: String(cat.icon || "category").trim(),
          icon_key: cat.icon_key || null,
          lexicon_key: cat.lexicon_key || null,
          sort_order: typeof cat.sort_order === "number" ? cat.sort_order : idx,
          subcategories: Array.isArray(cat.subcategories) ? cat.subcategories : [],
        },
      }));
      await supabase.rpc('secure_upsert_cloud_file', {
        p_token: useStore.getState().session?.access_token || '',
        p_target: 'taxonomy',
        p_payload: rows,
      });
      await logArchitectAction(
        `Seeded ${rows.length} starter categories`,
        'taxonomy',
        schemaKey,
        'Seeded starter category preset',
        'Oversight Game Management',
        false,
        { count: { from: 0, to: rows.length } }
      );
      useStore
        .getState()
        .pushStatus(t("categories_seeded", "Starter categories synced to database."), "success");
      await fetchCategories();
    } finally {
      setIsPanelSubmitting(false);
    }
  };

  const handlePanelCommit = async (isDelete: boolean = false) => {
    setIsPanelSubmitting(true);
    const resolvedType = panelInput3 === "CUSTOM" ? panelInput4 : panelInput3;

    if (isDelete) {
      if (sidePanelMode === 'edit_version') {
        await supabase.rpc('secure_delete_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'game_versions', p_id: panelTarget });
        await logArchitectAction(
          `Deleted Game Version ${panelTarget}`,
          'game_versions',
          String(panelTarget),
          panelReason,
          'Oversight Game Management',
          false,
          { version: { from: panelTarget, to: null } }
        );
        useStore.getState().pushStatus(`Deleted Game Version ${panelTarget}`, "success");
        fetchVersions();
      } else if (sidePanelMode === 'edit_dlc') {
        await supabase.rpc('secure_delete_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'dlc_registry', p_id: panelTarget.id });
        await loadDLCMap();
        await logArchitectAction(
          `Deleted DLC Pack ${panelTarget.id}`,
          'dlc_registry',
          String(panelTarget.id),
          panelReason,
          'Oversight Game Management',
          false,
          { id: { from: panelTarget.id, to: null }, name: { from: panelTarget.name, to: null }, type: { from: panelTarget.type, to: null } }
        );
        useStore.getState().pushStatus(`Deleted DLC Pack ${panelTarget.id}`, "success");
        fetchDlcs();
      } else if (sidePanelMode === 'edit_category' && panelTarget?._db_id) {
        await supabase.rpc('secure_delete_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'taxonomy', p_id: panelTarget._db_id });
        await logArchitectAction(
          `Deleted Category ${panelTarget.id}`,
          'taxonomy',
          String(panelTarget.id),
          panelReason,
          'Oversight Game Management',
          false,
          { category: { from: panelTarget.id, to: null } }
        );
        useStore.getState().pushStatus(`${t("deleted_category", "Deleted Category")}: ${panelTarget.id}`, "success");
        await fetchCategories();
      }
    } else {
      if (sidePanelMode === 'add_version') {
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'game_versions', p_payload: { version: panelInput1 } });
        await logArchitectAction(
          `Added Game Version ${panelInput1}`,
          'game_versions',
          panelInput1,
          panelReason,
          'Oversight Game Management',
          false,
          { version: { to: panelInput1 } }
        );
        useStore.getState().pushStatus(`Added Game Version ${panelInput1}`, "success");
        fetchVersions();
      } else if (sidePanelMode === 'edit_version') {
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'game_versions', p_payload: { version: panelInput1 } });
        await logArchitectAction(
          `Edited Game Version ${panelTarget} -> ${panelInput1}`,
          'game_versions',
          panelInput1,
          panelReason,
          'Oversight Game Management',
          false,
          { version: { from: panelTarget, to: panelInput1 } }
        );
        useStore.getState().pushStatus(`Edited Game Version ${panelTarget} -> ${panelInput1}`, "success");
        fetchVersions();
      } else if (sidePanelMode === 'add_dlc') {
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'dlc_registry', p_payload: { id: panelInput1.toUpperCase(), name: panelInput2, type: resolvedType } });
        await loadDLCMap();
        await logArchitectAction(
          `Added DLC Pack [${panelInput1.toUpperCase()}] ${panelInput2}`,
          'dlc_registry',
          panelInput1.toUpperCase(),
          panelReason,
          'Oversight Game Management',
          false,
          { id: { to: panelInput1.toUpperCase() }, name: { to: panelInput2 }, type: { to: resolvedType } }
        );
        useStore.getState().pushStatus(`Added DLC Pack [${panelInput1.toUpperCase()}] ${panelInput2}`, "success");
        fetchDlcs();
      } else if (sidePanelMode === 'edit_dlc') {
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'dlc_registry', p_payload: { id: panelInput1.toUpperCase(), name: panelInput2, type: resolvedType } });
        await loadDLCMap();
        await logArchitectAction(
          `Edited DLC Pack [${panelTarget.id}] -> [${panelInput1.toUpperCase()}] ${panelInput2}`,
          'dlc_registry',
          panelInput1.toUpperCase(),
          panelReason,
          'Oversight Game Management',
          false,
          {
            id: { from: panelTarget.id, to: panelInput1.toUpperCase() },
            name: { from: panelTarget.name, to: panelInput2 },
            type: { from: panelTarget.type, to: resolvedType }
          }
        );
        useStore.getState().pushStatus(`Edited DLC Pack [${panelTarget.id}]`, "success");
        fetchDlcs();
      } else if (sidePanelMode === 'add_category' || sidePanelMode === 'edit_category') {
        const cleanCatId = panelInput1.trim();
        const cleanLabel = panelInput2.trim() || cleanCatId;
        const slug = cleanCatId.toLowerCase().replace(/[^a-z0-9]/g, "_");
        const cleanIcon = panelInput3.trim() || "category";
        const parsedOrder = Number.isFinite(Number(panelInput4)) ? Math.max(0, Math.round(Number(panelInput4))) : 0;
        const resolvedLexKey = panelLexKey.trim() || `class_dd_${slug}`;
        const parsedSubs = panelSubcatsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((labelOrId) => {
            const existingSub = Array.isArray(panelTarget?.subcategories)
              ? panelTarget.subcategories.find(
                  (es: any) =>
                    String(es?.label || "").toLowerCase() === labelOrId.toLowerCase() ||
                    String(es?.id || "").toLowerCase() === labelOrId.toLowerCase()
                )
              : null;
            if (existingSub) return existingSub;
            const subId = labelOrId.replace(/\s+/g, "");
            const subSlug = labelOrId.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
            return {
              id: subId || labelOrId,
              label: labelOrId,
              icon: cleanIcon,
              icon_key: `ui_icon_${subSlug}`,
              lexicon_key: `vault_sub_${subSlug}`,
            };
          });
        const taxonomyPayload: Record<string, any> = {
          ...(sidePanelMode === 'edit_category' && panelTarget?._db_id ? { id: panelTarget._db_id } : {}),
          category: cleanCatId,
          type: cleanLabel,
          taxonomy_attributes: {
            label: cleanLabel,
            icon: cleanIcon,
            icon_key: panelTarget?.icon_key || `ui_icon_${slug}`,
            lexicon_key: resolvedLexKey,
            sort_order: parsedOrder,
            subcategories: parsedSubs,
          },
        };
        await supabase.rpc('secure_upsert_cloud_file', {
          p_token: useStore.getState().session?.access_token || '',
          p_target: 'taxonomy',
          p_payload: taxonomyPayload,
        });
        await logArchitectAction(
          `${sidePanelMode === 'add_category' ? 'Added' : 'Edited'} Category ${cleanCatId}`,
          'taxonomy',
          cleanCatId,
          panelReason,
          'Oversight Game Management',
          false,
          {
            category: { from: panelTarget?.id || null, to: cleanCatId },
            label: { from: panelTarget?.label || null, to: cleanLabel },
            sort_order: { from: panelTarget?.sort_order ?? null, to: parsedOrder },
          }
        );
        useStore.getState().pushStatus(`${t("saved", "Saved")}: ${cleanLabel}`, "success");
        await fetchCategories();
      }
    }

    setIsPanelSubmitting(false);
    setSidePanelMode(null);
  };

  const filteredDlcs = dlcs.filter(d =>
    (dlcTypeFilter === "ALL" || d.type === dlcTypeFilter) &&
    (!dlcSearch ||
      d.id.toLowerCase().includes(dlcSearch.toLowerCase()) ||
      d.name.toLowerCase().includes(dlcSearch.toLowerCase()))
  );

  const filteredVersions = versions.filter(v =>
    !versionSearch || v.version.toLowerCase().includes(versionSearch.toLowerCase())
  );

  const filteredCategories = categories.filter(c =>
    !categorySearch ||
    c.id.toLowerCase().includes(categorySearch.toLowerCase()) ||
    c.label.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const isCommitDisabled =
    isPanelSubmitting ||
    !panelReason.trim() ||
    ((sidePanelMode === 'add_version' || sidePanelMode === 'edit_version') && !panelInput1.trim()) ||
    ((sidePanelMode === 'add_dlc' || sidePanelMode === 'edit_dlc') && (!panelInput1.trim() || !panelInput2.trim())) ||
    ((sidePanelMode === 'add_category' || sidePanelMode === 'edit_category') && !panelInput1.trim());

  const renderVersionLeadCard = () => (
    <LiquidGlassAlertCard
      isAlertCard={false}
      icon={t("icon_add_circle", "add_circle")}
      accentVar="var(--accent)"
      iconColorClass="text-[var(--accent)]"
      badgeIcon={t("icon_gamepad", "gamepad")}
      badgeLabel={t("sa_game_versions", "Game Versions")}
      overline={t("sa_game_versions", "Game Versions")}
      title={t("btn_register_patch_naked", "Register Patch")}
      description={t(
        "version_lead_card_desc",
        "Register a new game version or build identifier in the catalog."
      )}
      actionLabel={t("btn_register_patch_naked", "Register Patch")}
      actionIcon={t("icon_add", "add")}
      actionVariant="glass"
      onAction={() => openPanel("add_version")}
      onClick={() => openPanel("add_version")}
    />
  );

  const renderDlcLeadCard = () => (
    <LiquidGlassAlertCard
      isAlertCard={false}
      icon={t("icon_add_circle", "add_circle")}
      accentVar="var(--success)"
      iconColorClass="text-[var(--success)]"
      badgeIcon={t("icon_extension", "extension")}
      badgeLabel={t("dlc_registry", "DLC Registry")}
      overline={t("dlc_registry", "DLC Registry")}
      title={t("panel_add_dlc", "Register DLC")}
      description={t(
        "dlc_lead_card_desc",
        "Register an expansion pack or downloadable content identifier."
      )}
      actionLabel={t("panel_add_dlc", "Register DLC")}
      actionIcon={t("icon_add", "add")}
      actionVariant="glass"
      onAction={() => openPanel("add_dlc")}
      onClick={() => openPanel("add_dlc")}
    />
  );

  const renderCategoryLeadCard = () => (
    <LiquidGlassAlertCard
      isAlertCard={false}
      icon={t("icon_add_circle", "add_circle")}
      accentVar="var(--accent)"
      iconColorClass="text-[var(--accent)]"
      badgeIcon={t("icon_category", "category")}
      badgeLabel={t("categories", "Categories")}
      overline={t("categories", "Categories")}
      title={t("btn_add_category", "Register Category")}
      description={t(
        "category_lead_card_desc",
        "Create a database-backed {Mod} classification and optional subcategories for this game."
      )}
      actionLabel={t("btn_add_category", "Register Category")}
      actionIcon={t("icon_add", "add")}
      actionVariant="glass"
      onAction={() => openPanel("add_category")}
      onClick={() => openPanel("add_category")}
    />
  );

  const renderSeedCategoriesCard = () => (
    <LiquidGlassAlertCard
      isAlertCard={false}
      icon={t("icon_auto_fix_high", "auto_fix_high")}
      accentVar="var(--warning)"
      iconColorClass="text-[var(--warning)]"
      badgeIcon={t("icon_category", "category")}
      badgeLabel={t("categories", "Categories")}
      overline={t("categories", "Categories")}
      title={t("seed_starter_categories", "Seed Starter Categories")}
      description={t(
        "seed_starter_categories_desc",
        "Populate public taxonomy with the starter category catalog for this game preset."
      )}
      actionLabel={t("seed_starter_categories", "Seed Starter Categories")}
      actionIcon={t("icon_auto_fix_high", "auto_fix_high")}
      actionVariant="glass"
      onAction={handleSeedStarterCategories}
      onClick={handleSeedStarterCategories}
    />
  );

  const renderCategoryCard = (cat: ModCategoryDescriptor) => (
    <UniversalCard
      key={cat.id}
      onClick={() => openPanel("edit_category", cat)}
      onContextMenu={(e) => {
        openSanctuaryContextMenu(e, [
          {
            label: t("edit", "Edit"),
            icon: t("icon_edit", "edit"),
            onClick: () => openPanel("edit_category", cat),
          },
          {
            divider: true,
            label: t("copy_title", "Copy ID"),
            icon: t("icon_content_copy", "content_copy"),
            onClick: () => navigator.clipboard?.writeText(cat.id || ""),
          },
        ]);
      }}
      layout="vertical"
      icon={cat.icon ? t(`icon_${cat.icon}`, cat.icon) : t("icon_category", "category")}
      title={cat.lexicon_key ? t(cat.lexicon_key, cat.label || cat.id) : cat.label || cat.id}
      subtitle={cat.id}
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_sort", "sort")}
            </span>
            <span>#{cat.sort_order ?? 0}</span>
          </div>
        </div>
      }
      badges={
        <div className={VAULT_CHIP_CLASS}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
            {t("icon_account_tree", "account_tree")}
          </span>
          <span>
            {cat.subcategories?.length || 0} {t("subcategories", "Subcategories")}
          </span>
        </div>
      }
      footer={
        <div className="flex justify-between items-center w-full">
          <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
            {cat.lexicon_key || cat.id}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("btn_view", "View")} <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    />
  );

  const renderVersionCard = (v: any) => (
    <UniversalCard
      key={v.version}
      onClick={() => openPanel('edit_version', v.version)}
      onContextMenu={(e) => {
        openSanctuaryContextMenu(e, [
          {
            label: t("edit", "Edit"),
            icon: t("icon_edit", "edit"),
            onClick: () => openPanel('edit_version', v.version),
          },
          {
            divider: true,
            label: t("copy_title", "Copy Title"),
            icon: t("icon_content_copy", "content_copy"),
            onClick: () => navigator.clipboard?.writeText(v.version || ""),
          },
        ]);
      }}
      layout="vertical"
      icon={t("icon_gamepad", "gamepad")}
      title={v.version}
      subtitle={t("patch_release", "Patch Release")}
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_verified", "verified")}
            </span>
            <span>{t("patch_release", "Patch Release")}</span>
          </div>
        </div>
      }
      badges={
        <div className={VAULT_CHIP_CLASS}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
            {t("icon_calendar_today", "calendar_today")}
          </span>
          <span>
            {v.release_date ? new Date(v.release_date).toLocaleDateString() : (v.created_at ? new Date(v.created_at).toLocaleDateString() : t("status_active", "Active"))}
          </span>
        </div>
      }
      footer={
        <div className="flex justify-between items-center w-full">
          <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
            {v.version}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("btn_view", "View")} <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    />
  );

  const renderDlcCard = (d: any) => (
    <UniversalCard
      key={d.id}
      onClick={() => openPanel('edit_dlc', d)}
      onContextMenu={(e) => {
        openSanctuaryContextMenu(e, [
          {
            label: t("edit", "Edit"),
            icon: t("icon_edit", "edit"),
            onClick: () => openPanel('edit_dlc', d),
          },
          {
            divider: true,
            label: t("copy_title", "Copy Title"),
            icon: t("icon_content_copy", "content_copy"),
            onClick: () => navigator.clipboard?.writeText(`${d.id} - ${d.name}`),
          },
        ]);
      }}
      layout="vertical"
      icon={t("icon_extension", "extension")}
      title={d.name}
      subtitle={d.type ? t(`dlc_type_${d.type.toLowerCase().replace(/ /g, '_')}`, `${d.type} PACK`) : t("unknown", "UNKNOWN")}
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_extension", "extension")}
            </span>
            <span>{d.type || t("dlc_registry", "DLC")}</span>
          </div>
        </div>
      }
      badges={
        <div className={VAULT_CHIP_CLASS}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
            {t("icon_fingerprint", "fingerprint")}
          </span>
          <span>{d.id}</span>
        </div>
      }
      footer={
        <div className="flex justify-between items-center w-full">
          <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
            <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_calendar_today", "calendar_today")}</span>
            {d.release_date ? new Date(d.release_date).toLocaleDateString() : d.id}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("btn_view", "View")} <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    />
  );

  return (
    <ElevatedHubLayout
      headerTitle={t("tab_game_versions", "Game Versions")}
      headerSubtitle={t("game_management_subtitle", "Manage patches, versions, and DLCs")}
      headerIcon={t("icon_settings", "settings")}
      headerIconColorClass="theme-text-accent"
      search={activeTab === 'versions' ? versionSearch : activeTab === 'categories' ? categorySearch : dlcSearch}
      onSearchChange={(e: string) =>
        activeTab === 'versions'
          ? setVersionSearch(e)
          : activeTab === 'categories'
            ? setCategorySearch(e)
            : setDlcSearch(e)
      }
      searchPlaceholder={t("search_ph", "Search {mods}...")}
      hideSearch={activeTab === 'overview'}
      tabs={[
        { id: 'overview', label: t("overview", "Overview"), icon: t("icon_dashboard", "dashboard"), number: (versions.length + dlcs.length + categories.length).toString() },
        { id: 'versions', label: t("sa_game_versions", "Game Versions"), icon: t("icon_gamepad", "gamepad"), number: versions.length.toString() },
        { id: 'dlc', label: t("dlc_registry", "DLC Registry"), icon: t("icon_extension", "extension"), number: dlcs.length.toString() },
        { id: 'categories', label: t("categories", "Categories"), icon: t("icon_category", "category"), number: categories.length.toString() }
      ]}
      activeTab={activeTab}
      onTabChange={setActiveTab as any}
      primaryPopover={
        activeTab === 'dlc' ? {
          icon: t("icon_tune", "tune"),
          label: t("filters", "Filters"),
          content: (
            <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("category", "DLC Type")}</span>
                <CustomDropdown
                  flat={true}
                  variant="pill"
                  disableTint={true}
                  value={dlcTypeFilter}
                  onChange={(v: string[]) => setDlcTypeFilter(v[0])}
                  options={["ALL", ...new Set(dlcs.map(d => d.type))].filter(Boolean).map(x => ({ id: x, label: x === "ALL" ? t("all_types", "All Types") : x }))}
                />
              </div>
            </div>
          )
        } : undefined
      }
    >
      <div className="flex flex-col gap-8">

        {activeTab === 'overview' && (
          <HubOverviewLanding>
            <HubOverviewSection
              icon={t("icon_gamepad", "gamepad")}
              iconColorClass="text-[var(--accent)]"
              title={t("sa_game_versions", "Game Versions")}
              isEmpty={false}
            >
              {renderVersionLeadCard()}
              {versions.slice(0, 3).map(renderVersionCard)}
            </HubOverviewSection>
            <HubOverviewSection
              icon={t("icon_extension", "extension")}
              iconColorClass="text-[var(--success)]"
              title={t("dlc_registry", "DLC Registry")}
              isEmpty={false}
            >
              {renderDlcLeadCard()}
              {dlcs.slice(0, 3).map(renderDlcCard)}
            </HubOverviewSection>
            <HubOverviewSection
              icon={t("icon_category", "category")}
              iconColorClass="text-[var(--accent)]"
              title={t("categories", "Categories")}
              isEmpty={false}
            >
              {renderCategoryLeadCard()}
              {categories.length === 0 && renderSeedCategoriesCard()}
              {categories.slice(0, 3).map(renderCategoryCard)}
            </HubOverviewSection>
          </HubOverviewLanding>
        )}

        {activeTab === 'versions' && (
          !versionSearch.trim() || filteredVersions.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 w-full">
              {!versionSearch.trim() && renderVersionLeadCard()}
              {filteredVersions.map(renderVersionCard)}
            </div>
          ) : (
            <EmptyState icon={t("icon_gamepad", "gamepad")} title={t("no_versions", "No Game Versions")} className="col-span-full py-16" />
          )
        )}

        {activeTab === 'dlc' && (
          (!dlcSearch.trim() && dlcTypeFilter === 'ALL') || filteredDlcs.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 w-full">
              {!dlcSearch.trim() && dlcTypeFilter === 'ALL' && renderDlcLeadCard()}
              {filteredDlcs.map(renderDlcCard)}
            </div>
          ) : (
            <EmptyState icon={t("icon_extension_off", "extension_off")} title={t("no_dlc", "No DLC Packs")} className="col-span-full py-16" />
          )
        )}

        {activeTab === 'categories' && (
          !categorySearch.trim() || filteredCategories.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 w-full">
              {!categorySearch.trim() && renderCategoryLeadCard()}
              {!categorySearch.trim() && categories.length === 0 && renderSeedCategoriesCard()}
              {filteredCategories.map(renderCategoryCard)}
            </div>
          ) : (
            <EmptyState icon={t("icon_category", "category")} title={t("no_categories", "No Categories")} className="col-span-full py-16" />
          )
        )}

      </div>

      <SidePanel
        isOpen={!!sidePanelMode}
        onClose={() => setSidePanelMode(null)}
        title={
          sidePanelMode === 'add_version' ? t("btn_register_patch_naked", "Register Patch") :
            sidePanelMode === 'edit_version' ? t("panel_edit_patch", "Edit Patch") :
              sidePanelMode === 'edit_dlc' ? t("panel_edit_dlc", "Edit DLC Pack") :
                sidePanelMode === 'add_category' ? t("btn_add_category", "Register Category") :
                  sidePanelMode === 'edit_category' ? t("panel_edit_category", "Edit Category") :
                    t("panel_add_dlc", "Register DLC")
        }
        subtitle={
          sidePanelMode?.includes('version')
            ? t("panel_sub_version", "Game Version Registry")
            : sidePanelMode?.includes('category')
              ? t("categories", "Categories")
              : t("dlc_registry", "DLC Registry")
        }
        icon={
          sidePanelMode?.includes('version')
            ? t("icon_gamepad", "gamepad")
            : sidePanelMode?.includes('category')
              ? t("icon_category", "category")
              : t("icon_extension", "extension")
        }
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            {(sidePanelMode === 'edit_version' || sidePanelMode === 'edit_dlc' || sidePanelMode === 'edit_category') && (
              <PanelHeaderButton
                icon={t("icon_delete", "delete")}
                variant="danger"
                tooltip={isPanelSubmitting ? t("ui_btn_processing", "Processing...") : t("purge", "Purge")}
                disabled={!panelReason.trim() || isPanelSubmitting}
                onClick={() => handlePanelCommit(true)}
              />
            )}
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              variant="accent"
              tooltip={isPanelSubmitting ? t("ui_btn_processing", "Processing...") : t("ui_btn_commit", "Commit")}
              disabled={isCommitDisabled}
              onClick={() => handlePanelCommit(false)}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={
              sidePanelMode?.includes('version')
                ? t("icon_gamepad", "gamepad")
                : sidePanelMode?.includes('category')
                  ? t("icon_category", "category")
                  : t("icon_extension", "extension")
            }
            overline={
              sidePanelMode?.includes('version')
                ? t("sa_game_versions", "Game Versions")
                : sidePanelMode?.includes('category')
                  ? t("categories", "Categories")
                  : t("dlc_registry", "DLC Registry")
            }
            title={
              (sidePanelMode === 'edit_version' || sidePanelMode === 'edit_dlc' || sidePanelMode === 'edit_category') && panelTarget
                ? (panelTarget?.label || panelTarget?.name || panelTarget)
                : sidePanelMode === 'add_version'
                  ? t("btn_register_patch_naked", "Register Patch")
                  : sidePanelMode === 'add_category'
                    ? t("btn_add_category", "Register Category")
                    : t("panel_add_dlc", "Register DLC")
            }
            description={t("game_management_subtitle", "Manage patches, versions, and DLCs")}
            badge={sidePanelMode?.includes('edit') ? t("ql_targeting", "Editing") : t("ql_add", "New Entry")}
            badgeIcon={sidePanelMode?.includes('edit') ? t("icon_edit", "edit") : t("icon_add", "add")}
            variant="accent"
          />

          {(sidePanelMode === 'add_version' || sidePanelMode === 'edit_version') && (
            <UniversalGroup title={t("sa_game_versions", "Version Details")} icon={t("icon_gamepad", "gamepad")}>
              <div className="flex flex-col gap-1.5 relative z-10">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("game_version", "Game Version")}</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 !text-[18px]">{t("icon_gamepad", "gamepad")}</span>
                  <input
                    value={panelInput1}
                    onChange={e => setPanelInput1(e.target.value)}
                    placeholder={t("ph_game_version", "e.g. 1.2.0")}
                    className="w-full glass-surface rounded-xl pl-10 pr-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all"
                  />
                </div>
              </div>
            </UniversalGroup>
          )}

          {(sidePanelMode === 'add_dlc' || sidePanelMode === 'edit_dlc') && (
            <UniversalGroup title={t("dlc_registry", "DLC Pack Configuration")} icon={t("icon_extension", "extension")}>
              <div className="flex flex-col gap-1.5 relative z-50">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("dlc_id_code", "DLC Pack Code")}</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 !text-[18px]">{t("icon_fingerprint", "fingerprint")}</span>
                  <input
                    value={panelInput1}
                    onChange={e => setPanelInput1(e.target.value)}
                    placeholder={t("ph_pack_code", "e.g. DLC01")}
                    className="w-full glass-surface rounded-xl pl-10 pr-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all uppercase"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 relative z-40">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("pack_type", "Pack Type")}</label>
                <CustomDropdown disableTint={true}
                  value={panelInput3}
                  onChange={(v: string[]) => setPanelInput3(v[0])}
                  options={[
                    ...[...new Set(dlcs.map(d => d.type))].filter(Boolean).map(x => ({ id: x, label: t(`dlc_type_${x.toLowerCase().replace(/ /g, '_')}`, `${x} PACK`) })),
                    { id: "CUSTOM", label: t("auto_new_pack_type", "+ CUSTOM TYPE") }
                  ]}
                  placeholder={t("auto_select_type", "Select Type")}
                />
              </div>

              {panelInput3 === "CUSTOM" && (
                <div className="flex flex-col gap-1.5 relative z-30 animate-in fade-in slide-in-from-top-2">
                  <label className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-1 flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_edit", "edit")}</span>
                    {t("auto_new_pack_type", "New Pack Type")}
                  </label>
                  <input
                    value={panelInput4}
                    onChange={e => setPanelInput4(e.target.value.toUpperCase())}
                    placeholder={t("ph_pack_type", "e.g. EXPANSION")}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all uppercase"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5 relative z-20">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("pack_name", "Pack Name")}</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 !text-[18px]">{t("icon_badge", "badge")}</span>
                  <input
                    value={panelInput2}
                    onChange={e => setPanelInput2(e.target.value)}
                    placeholder={t("ph_pack_name", "e.g. Expansion Pack 1")}
                    className="w-full glass-surface rounded-xl pl-10 pr-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all"
                  />
                </div>
              </div>
            </UniversalGroup>
          )}

          {(sidePanelMode === 'add_category' || sidePanelMode === 'edit_category') && (
            <UniversalGroup title={t("categories", "Category Configuration")} icon={t("icon_category", "category")}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("schema_studio_cat_id", "Category ID")}
                  </label>
                  <input
                    value={panelInput1}
                    onChange={(e) => setPanelInput1(e.target.value)}
                    placeholder={t("ph_cat_id", "e.g. Gameplay")}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-mono font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("schema_studio_cat_label", "Display Label")}
                  </label>
                  <input
                    value={panelInput2}
                    onChange={(e) => setPanelInput2(e.target.value)}
                    placeholder={t("ph_cat_label", "e.g. Gameplay Systems")}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("schema_studio_cat_icon", "Icon Glyph")}
                  </label>
                  <input
                    value={panelInput3}
                    onChange={(e) => setPanelInput3(e.target.value)}
                    placeholder={t("ph_cat_icon", "e.g. memory / tune / category")}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-mono font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("sort_order", "Sort Order")}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={panelInput4}
                    onChange={(e) => setPanelInput4(e.target.value)}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-mono font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("schema_studio_cat_lex_key", "{Lexicon} Key")}
                </label>
                <input
                  value={panelLexKey}
                  onChange={(e) => setPanelLexKey(e.target.value)}
                  placeholder={t("ph_cat_lex_key", "Optional class_dd_* key")}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-xs font-mono font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("subcategories_csv", "Subcategories (comma-separated)")}
                </label>
                <input
                  value={panelSubcatsText}
                  onChange={(e) => setPanelSubcatsText(e.target.value)}
                  placeholder={t("ph_subcategories_csv", "e.g. Lighting, Audio, Presets")}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-xs font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </UniversalGroup>
          )}

          <UniversalGroup
            title={t("audit_reason_req", "Audit Reason Required")}
            icon={t("icon_gavel", "gavel")}
            headerColorClass="text-[var(--danger)]"
          >
            <UniversalTextArea
              label={`${t("audit_reason_req", "Audit Reason Required")} *`}
              value={panelReason}
              onChange={setPanelReason}
              placeholder={t("mutation_reason", "Enter reason for mutation...")}
            />
          </UniversalGroup>
        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}
