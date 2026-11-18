import {
  ActionButton,
  CustomDropdown,
  HoverTooltip,
} from "../../shared";
import { UniversalGroup } from "../../components/universal/UniversalLayout";
import { GlassNumberInput, StringListBuilder, NumberListBuilder, TargetListBuilder, SchemaToggleRow } from "./SchemaStudioPrimitives";

export function SchemaLoadLabAndRulesTabs({
  t,
  activeTab,
  parsedSchema,
  updateField,
  updateNestedField,
  updateDeepLabSignatureField,
  extObj,
  loadOrderObj,
  priorityTiers,
  conflictAnalyzersArr,
  labObj,
  worldSigObj,
  exceptionLogs,
  capsuleObj,
}: any) {
  return (
    <>
      {activeTab === "load_lab" && (
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
          <UniversalGroup
            title={t("schema_studio_sec_load_order", "Load Order & Tiers")}
            icon={t("icon_low_priority", "low_priority")}
            headerAction={
              <ActionButton
                variant="accent"
                icon={t("icon_add", "add")}
                onClick={() => {
                  const nextTier = {
                    id: `tier_${priorityTiers.length}`,
                    label: `${t("schema_studio_tier_item", "Tier")} ${priorityTiers.length}`,
                    priority: 500 + priorityTiers.length * 500,
                    folder: `Sanctuary${priorityTiers.length || ""}`,
                  };
                  updateNestedField("load_order", "priority_tiers", [...priorityTiers, nextTier]);
                }}
                className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("schema_studio_add_tier", "Add Priority Tier")}
              </ActionButton>
            }
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_strategy", "Load Order Strategy")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={loadOrderObj.strategy ?? "none"}
                    onChange={(v: string[]) => {
                      const picked = v[0] || "none";
                      updateNestedField(
                        "load_order",
                        "strategy",
                        picked === "none" ? null : picked
                      );
                    }}
                    options={[
                      {
                        id: "folder_priority",
                        label: t(
                          "schema_studio_lo_strat_folder_clean",
                          "Folder Priority (Manifest / Tier Subfolders)"
                        ),
                      },
                      {
                        id: "manifest_list",
                        label: t(
                          "schema_studio_lo_strat_manifest_clean",
                          "Manifest List (loadorder.txt / mod_manifest)"
                        ),
                      },
                      {
                        id: "numeric_prefix",
                        label: t(
                          "schema_studio_lo_strat_prefix",
                          "Numeric Prefix ({index:03}_)"
                        ),
                      },
                      {
                        id: "timestamp",
                        label: t(
                          "schema_studio_lo_strat_timestamp",
                          "Modified Timestamp Order"
                        ),
                      },
                      {
                        id: "none",
                        label: t("schema_studio_lo_strat_none", "Direct Symlink Only"),
                      },
                    ]}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_direction", "Winner Direction")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={loadOrderObj.direction ?? "higher_wins"}
                    onChange={(v: string[]) =>
                      updateNestedField("load_order", "direction", v[0])
                    }
                    options={[
                      {
                        id: "higher_wins",
                        label: t("schema_studio_lo_dir_higher", "Higher Priority Number Wins"),
                      },
                      {
                        id: "lower_wins",
                        label: t("schema_studio_lo_dir_lower", "Lower Priority Number Wins"),
                      },
                    ]}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_manifest_file", "Engine Manifest File")}
                  </label>
                  <input
                    type="text"
                    value={loadOrderObj.manifest_file ?? ""}
                    onChange={(e) =>
                      updateNestedField(
                        "load_order",
                        "manifest_file",
                        e.target.value ? e.target.value : null
                      )
                    }
                    placeholder={t(
                      "schema_studio_ph_manifest_file",
                      "load_manifest.cfg / loadorder.txt / (Blank = None)"
                    )}
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_prefix_fmt", "Numeric Prefix Format")}
                  </label>
                  <input
                    type="text"
                    value={loadOrderObj.prefix_format ?? ""}
                    onChange={(e) =>
                      updateNestedField(
                        "load_order",
                        "prefix_format",
                        e.target.value ? e.target.value : null
                      )
                    }
                    placeholder="{index:03}_"
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_prefix_sep", "Prefix Separator")}
                  </label>
                  <input
                    type="text"
                    value={loadOrderObj.prefix_separator ?? ""}
                    onChange={(e) =>
                      updateNestedField(
                        "load_order",
                        "prefix_separator",
                        e.target.value ? e.target.value : null
                      )
                    }
                    placeholder="_"
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_line_tpl", "Manifest Line Template")}
                  </label>
                  <input
                    type="text"
                    value={loadOrderObj.line_template ?? ""}
                    onChange={(e) =>
                      updateNestedField(
                        "load_order",
                        "line_template",
                        e.target.value ? e.target.value : null
                      )
                    }
                    placeholder="{file} or *{file}"
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_asset_overwrite", "Loose Asset Overwrite Winner")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={loadOrderObj.asset_overwrite_order ?? "higher_wins"}
                    onChange={(v: string[]) =>
                      updateNestedField("load_order", "asset_overwrite_order", v[0] || "higher_wins")
                    }
                    options={[
                      {
                        id: "higher_wins",
                        label: t("schema_studio_lo_asset_last", "Last / Higher Priority Wins"),
                      },
                      {
                        id: "first_wins",
                        label: t("schema_studio_lo_asset_first", "First Deployed Wins"),
                      },
                    ]}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_timestamp_step", "Timestamp Step (Seconds)")}
                  </label>
                  <GlassNumberInput
                    value={Number(loadOrderObj.timestamp_step_secs ?? 60)}
                    min={1}
                    max={86400}
                    step={10}
                    onChange={(val) =>
                      updateNestedField("load_order", "timestamp_step_secs", val)
                    }
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_index_base", "Starting Index Base")}
                  </label>
                  <GlassNumberInput
                    value={Number(loadOrderObj.index_base ?? 0)}
                    min={0}
                    step={1}
                    onChange={(val) => updateNestedField("load_order", "index_base", val)}
                  />
                </div>
              </div>

              <SchemaToggleRow
                label={t("schema_studio_lo_tier_base", "Use Tier Priority Number As Prefix Base")}
                description={t(
                  "schema_studio_lo_tier_base_desc",
                  "Starts numeric filename prefixes from the tier priority baseline instead of index 0/1."
                )}
                checked={Boolean(loadOrderObj.use_tier_priority_as_base)}
                onChange={(val) =>
                  updateNestedField("load_order", "use_tier_priority_as_base", val)
                }
              />

              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_manifest_content", "Manifest Header Template")}
                </label>
                <textarea
                  rows={3}
                  value={parsedSchema.manifest_content ?? ""}
                  onChange={(e) =>
                    updateField("manifest_content", e.target.value ? e.target.value : null)
                  }
                  placeholder={t(
                    "schema_studio_ph_manifest_content",
                    "Optional manifest file header or base load-order template..."
                  )}
                  className="w-full glass-panel rounded-xl p-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_doc_header", "Structured Document Header Wrapper")}
                  </label>
                  <textarea
                    rows={3}
                    value={loadOrderObj.document_header ?? ""}
                    onChange={(e) =>
                      updateNestedField(
                        "load_order",
                        "document_header",
                        e.target.value ? e.target.value : null
                      )
                    }
                    placeholder={t(
                      "schema_studio_ph_doc_header",
                      "Optional XML/JSON opening wrapper written before generated manifest lines..."
                    )}
                    className="w-full glass-panel rounded-xl p-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_doc_footer", "Structured Document Footer Wrapper")}
                  </label>
                  <textarea
                    rows={3}
                    value={loadOrderObj.document_footer ?? ""}
                    onChange={(e) =>
                      updateNestedField(
                        "load_order",
                        "document_footer",
                        e.target.value ? e.target.value : null
                      )
                    }
                    placeholder={t(
                      "schema_studio_ph_doc_footer",
                      "Optional XML/JSON closing wrapper written after generated manifest lines..."
                    )}
                    className="w-full glass-panel rounded-xl p-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                {priorityTiers.map((tier: any, idx: any) => (
                  <div
                    key={`${tier.id || idx}-${idx}`}
                    className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] grid grid-cols-1 sm:grid-cols-[minmax(80px,0.85fr)_minmax(0,1.15fr)_126px_minmax(0,0.9fr)_auto] gap-2.5 items-end min-w-0"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_tier_id", "Tier ID")}
                      </label>
                      <input
                        type="text"
                        value={tier.id ?? ""}
                        onChange={(e) => {
                          const next = [...priorityTiers];
                          next[idx] = { ...tier, id: e.target.value };
                          updateNestedField("load_order", "priority_tiers", next);
                        }}
                        placeholder="tier_1"
                        className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_cat_label", "Display Label")}
                      </label>
                      <input
                        type="text"
                        value={tier.label ?? ""}
                        onChange={(e) => {
                          const next = [...priorityTiers];
                          next[idx] = { ...tier, label: e.target.value };
                          updateNestedField("load_order", "priority_tiers", next);
                        }}
                        className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_tier_priority", "Priority")}
                      </label>
                      <GlassNumberInput
                        value={tier.priority ?? 500}
                        min={0}
                        step={100}
                        accentText={true}
                        onChange={(val) => {
                          const next = [...priorityTiers];
                          next[idx] = { ...tier, priority: val };
                          updateNestedField("load_order", "priority_tiers", next);
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_tier_folder", "Folder")}
                      </label>
                      <input
                        type="text"
                        value={tier.folder ?? ""}
                        onChange={(e) => {
                          const next = [...priorityTiers];
                          next[idx] = { ...tier, folder: e.target.value };
                          updateNestedField("load_order", "priority_tiers", next);
                        }}
                        placeholder="(Base)"
                        className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateNestedField(
                          "load_order",
                          "priority_tiers",
                          priorityTiers.filter((_: any, i: any) => i !== idx)
                        )
                      }
                      className="w-10 h-10 shrink-0 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--danger)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] cursor-pointer transition-all"
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_delete", "delete")}
                      </span>
                      <HoverTooltip title={t("delete", "Delete")} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_early_master_exts", "Early Master Extensions")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(loadOrderObj.early_master_extensions)
                        ? loadOrderObj.early_master_extensions
                        : []
                    }
                    onChange={(nextExts) =>
                      updateNestedField(
                        "load_order",
                        "early_master_extensions",
                        nextExts.length > 0 ? nextExts : undefined
                      )
                    }
                    placeholder=".esm / .master"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t(
                      "schema_studio_early_master_flag",
                      "Early Master Binary Flag Mask (Optional)"
                    )}
                  </label>
                  <GlassNumberInput
                    value={Number(loadOrderObj.early_master_flag_mask || 0)}
                    min={0}
                    step={1}
                    accentText={true}
                    onChange={(val) =>
                      updateNestedField(
                        "load_order",
                        "early_master_flag_mask",
                        val > 0 ? val : undefined
                      )
                    }
                  />
                  <span className="text-[11px] font-medium text-[var(--subtext)] opacity-75">
                    {t(
                      "schema_studio_early_master_flag_desc",
                      "Modules whose binary header flag matches this bitmask always sort into the early master block (0 = disabled)."
                    )}
                  </span>
                </div>
              </div>

              {(() => {
                const slotBuckets: any[] = Array.isArray(loadOrderObj.slot_buckets)
                  ? loadOrderObj.slot_buckets
                  : [];
                return (
                  <div className="flex flex-col gap-3 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                          {t("schema_studio_slot_buckets", "Plugin / Module Slot Buckets")}
                        </span>
                        <span className="text-[11px] font-medium text-[var(--subtext)] opacity-80">
                          {t(
                            "schema_studio_slot_buckets_desc",
                            "Define hard engine slot caps per extension and header flag mask (for example 254 standard / 4096 light modules)."
                          )}
                        </span>
                      </div>
                      <ActionButton
                        variant="glass"
                        icon={t("icon_add", "add")}
                        onClick={() => {
                          const nextBucket = {
                            id: `bucket_${slotBuckets.length + 1}`,
                            label: `${t("schema_studio_slot_bucket_default", "Slot Bucket")} ${slotBuckets.length + 1}`,
                            max_slots: 254,
                            include_extensions: [],
                          };
                          updateNestedField("load_order", "slot_buckets", [
                            ...slotBuckets,
                            nextBucket,
                          ]);
                        }}
                        className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
                      >
                        {t("schema_studio_add_slot_bucket", "Add Slot Bucket")}
                      </ActionButton>
                    </div>

                    {slotBuckets.length > 0 && (
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                        {slotBuckets.map((bucket: any, bIdx: number) => {
                          const updateBucket = (patch: Record<string, any>) => {
                            const next = [...slotBuckets];
                            const merged = { ...bucket, ...patch };
                            delete merged.extensions;
                            delete merged.flag_mask;
                            delete merged.exclude_flag_mask;
                            next[bIdx] = merged;
                            updateNestedField("load_order", "slot_buckets", next);
                          };
                          const bucketExts = Array.isArray(bucket.include_extensions)
                            ? bucket.include_extensions
                            : Array.isArray(bucket.extensions)
                              ? bucket.extensions
                              : [];
                          const reqFlagVal = Number(
                            bucket.required_flag_mask ?? bucket.flag_mask ?? 0
                          );
                          const exclFlagVal = Number(
                            bucket.excluded_flag_mask ?? bucket.exclude_flag_mask ?? 0
                          );
                          return (
                            <div
                              key={`${bucket.id || bIdx}-${bIdx}`}
                              className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-black font-mono text-[var(--accent)] truncate">
                                  {`#${bIdx + 1} • ${bucket.label || bucket.id || "bucket"}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateNestedField(
                                      "load_order",
                                      "slot_buckets",
                                      slotBuckets.filter((_: any, i: number) => i !== bIdx)
                                    )
                                  }
                                  className="w-8 h-8 shrink-0 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--danger)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] cursor-pointer transition-all"
                                >
                                  <span className="material-symbols-outlined !text-[15px]">
                                    {t("icon_delete", "delete")}
                                  </span>
                                  <HoverTooltip title={t("delete", "Delete")} />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div className="flex flex-col gap-1 min-w-0">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                    {t("schema_studio_bucket_id", "Bucket ID")}
                                  </label>
                                  <input
                                    type="text"
                                    value={bucket.id ?? ""}
                                    onChange={(e) => updateBucket({ id: e.target.value })}
                                    placeholder="full_plugins"
                                    className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 min-w-0">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                    {t("schema_studio_cat_label", "Display Label")}
                                  </label>
                                  <input
                                    type="text"
                                    value={bucket.label ?? ""}
                                    onChange={(e) => updateBucket({ label: e.target.value })}
                                    placeholder="Full Modules"
                                    className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 min-w-0">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                    {t("schema_studio_bucket_max_slots", "Max Slots")}
                                  </label>
                                  <GlassNumberInput
                                    value={Number(bucket.max_slots ?? 254)}
                                    min={1}
                                    step={1}
                                    accentText={true}
                                    onChange={(val) => updateBucket({ max_slots: val })}
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div className="flex flex-col gap-1 min-w-0">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                    {t("schema_studio_bucket_req_flag", "Required Flag Mask")}
                                  </label>
                                  <GlassNumberInput
                                    value={reqFlagVal}
                                    min={0}
                                    step={1}
                                    onChange={(val) =>
                                      updateBucket({
                                        required_flag_mask: val > 0 ? val : undefined,
                                      })
                                    }
                                  />
                                </div>
                                <div className="flex flex-col gap-1 min-w-0">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                    {t("schema_studio_bucket_excl_flag", "Excluded Flag Mask")}
                                  </label>
                                  <GlassNumberInput
                                    value={exclFlagVal}
                                    min={0}
                                    step={1}
                                    onChange={(val) =>
                                      updateBucket({
                                        excluded_flag_mask: val > 0 ? val : undefined,
                                      })
                                    }
                                  />
                                </div>
                              </div>

                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                  {t("extensions", "Extensions")}
                                </label>
                                <StringListBuilder
                                  items={bucketExts}
                                  onChange={(nextExts) =>
                                    updateBucket({ include_extensions: nextExts })
                                  }
                                  placeholder=".esm / .esp / .esl"
                                  addButtonLabel={t("add", "Add")}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {(() => {
                const manifestTargets: any[] = Array.isArray(loadOrderObj.manifest_targets)
                  ? loadOrderObj.manifest_targets
                  : [];
                return (
                  <div className="flex flex-col gap-3 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                          {t("schema_studio_manifest_targets", "Declarative Output Manifest Targets")}
                        </span>
                        <span className="text-[11px] font-medium text-[var(--subtext)] opacity-80">
                          {t(
                            "schema_studio_manifest_targets_desc",
                            "Generate engine load-order manifests (text lists, JSON maps, TOML tables, INI sections, or multi-block XML templates) across game, user, or AppData roots."
                          )}
                        </span>
                      </div>
                      <ActionButton
                        variant="glass"
                        icon={t("icon_add", "add")}
                        onClick={() => {
                          const nextTarget = {
                            root_source: "docs_path",
                            relative_path: "loadorder.txt",
                            format: "plugins_asterisk",
                            include_extensions: [],
                            base_entries: [],
                          };
                          updateNestedField("load_order", "manifest_targets", [
                            ...manifestTargets,
                            nextTarget,
                          ]);
                        }}
                        className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
                      >
                        {t("schema_studio_add_manifest_target", "Add Manifest Target")}
                      </ActionButton>
                    </div>

                    {manifestTargets.length > 0 && (
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                        {manifestTargets.map((mt: any, mIdx: number) => {
                          const updateTarget = (patch: Record<string, any>) => {
                            const next = [...manifestTargets];
                            next[mIdx] = { ...mt, ...patch };
                            updateNestedField("load_order", "manifest_targets", next);
                          };
                          const baseStrings: string[] = Array.isArray(mt.base_entries)
                            ? mt.base_entries.map((b: any) =>
                                typeof b === "string"
                                  ? b
                                  : [
                                      b?.uuid || "",
                                      b?.id || b?.name || "",
                                      b?.name || "",
                                      b?.folder || "",
                                      b?.version64 || "",
                                      b?.publish_handle || "",
                                    ]
                                      .filter(Boolean)
                                      .join("|")
                              )
                            : [];
                          return (
                            <div
                              key={`mt-${mIdx}`}
                              className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-black font-mono text-[var(--accent)] truncate">
                                  {`#${mIdx + 1} • ${mt.relative_path || "manifest"}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateNestedField(
                                      "load_order",
                                      "manifest_targets",
                                      manifestTargets.filter((_: any, i: number) => i !== mIdx)
                                    )
                                  }
                                  className="w-8 h-8 shrink-0 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--danger)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] cursor-pointer transition-all"
                                >
                                  <span className="material-symbols-outlined !text-[15px]">
                                    {t("icon_delete", "delete")}
                                  </span>
                                  <HoverTooltip title={t("delete", "Delete")} />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div className="flex flex-col gap-1 min-w-0">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                    {t("schema_studio_route_target_root", "Target Root")}
                                  </label>
                                  <CustomDropdown
                                    disableTint={true}
                                    value={mt.root_source ?? "docs_path"}
                                    onChange={(v: string[]) =>
                                      updateTarget({ root_source: v[0] || "docs_path" })
                                    }
                                    options={[
                                      { id: "docs_path", label: t("schema_studio_route_root_docs", "User Saves & Data Root") },
                                      { id: "live_path", label: t("schema_studio_route_root_live", "Game Install Root") },
                                      { id: "mods_path", label: t("schema_studio_route_root_mods", "Active {Mods} Folder") },
                                      { id: "local_appdata", label: t("schema_studio_route_root_local_appdata", "Local AppData / Proton Prefix Root") },
                                    ]}
                                  />
                                </div>
                                <div className="flex flex-col gap-1 min-w-0">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                    {t("schema_studio_mt_rel_path", "Relative File Path")}
                                  </label>
                                  <input
                                    type="text"
                                    value={mt.relative_path ?? ""}
                                    onChange={(e) => updateTarget({ relative_path: e.target.value })}
                                    placeholder={t("schema_studio_ph_mt_rel_path", "e.g. loadorder.txt / mods.json")}
                                    className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 min-w-0">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                    {t("schema_studio_mt_format", "Output Format")}
                                  </label>
                                  <CustomDropdown
                                    disableTint={true}
                                    value={
                                      mt.format === "factorio_mod_list"
                                        ? "enabled_object_list"
                                        : mt.format ?? "plugins_asterisk"
                                    }
                                    onChange={(v: string[]) =>
                                      updateTarget({ format: v[0] || "plugins_asterisk" })
                                    }
                                    options={[
                                      { id: "plugins_asterisk", label: t("schema_studio_mt_fmt_asterisk", "Asterisk List (*plugin)") },
                                      { id: "declarative_template", label: t("schema_studio_mt_fmt_decl", "Declarative Multi-Block Template") },
                                      { id: "enabled_object_list", label: t("schema_studio_mt_fmt_enabled_map", "JSON Enabled Object List") },
                                      { id: "toml_array_table", label: t("schema_studio_mt_fmt_toml", "TOML Array Of Tables") },
                                      { id: "json_array", label: t("schema_studio_mt_fmt_json_arr", "JSON ID Array") },
                                      { id: "json_object_array", label: t("schema_studio_mt_fmt_json_obj", "JSON Object Array") },
                                      { id: "ini_section", label: t("schema_studio_mt_fmt_ini", "INI Section Lines") },
                                      { id: "xml_list", label: t("schema_studio_mt_fmt_xml", "XML Item List") },
                                    ]}
                                  />
                                </div>
                                <div className="flex flex-col gap-1 min-w-0">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                    {t("schema_studio_mt_entry_key", "Entry Key / INI Section")}
                                  </label>
                                  <input
                                    type="text"
                                    value={mt.entry_key ?? mt.section ?? ""}
                                    onChange={(e) =>
                                      updateTarget({
                                        entry_key: e.target.value || undefined,
                                        section: e.target.value || undefined,
                                      })
                                    }
                                    placeholder={t("schema_studio_ph_mt_entry_key", "mods / activeMods")}
                                    className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                                  />
                                </div>
                              </div>

                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                  {t("extensions", "Extensions")}
                                </label>
                                <StringListBuilder
                                  items={Array.isArray(mt.include_extensions) ? mt.include_extensions : []}
                                  onChange={(nextExts) => updateTarget({ include_extensions: nextExts })}
                                  placeholder={t("schema_studio_ph_mt_exts", ".bin / .mod / .dat")}
                                  addButtonLabel={t("add", "Add")}
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div className="flex flex-col gap-1 min-w-0">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                    {t("schema_studio_mt_entry_tpl", "Entry Template")}
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={mt.entry_template ?? mt.template ?? ""}
                                    onChange={(e) =>
                                      updateTarget({
                                        entry_template: e.target.value || undefined,
                                        template: e.target.value || undefined,
                                      })
                                    }
                                    placeholder={t("schema_studio_ph_mt_entry_tpl", "{file}")}
                                    className="w-full glass-panel rounded-xl p-2.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 min-w-0">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                    {t("schema_studio_mt_sec_tpl", "Secondary List Template")}
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={mt.secondary_list_template ?? ""}
                                    onChange={(e) =>
                                      updateTarget({
                                        secondary_list_template: e.target.value || undefined,
                                      })
                                    }
                                    placeholder={t("schema_studio_ph_mt_sec_tpl", "<item id='{xml_id}' />")}
                                    className="w-full glass-panel rounded-xl p-2.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 min-w-0">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                    {t("schema_studio_lo_doc_header", "Structured Document Header Wrapper")}
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={mt.document_header ?? mt.header ?? ""}
                                    onChange={(e) =>
                                      updateTarget({
                                        document_header: e.target.value || undefined,
                                        header: e.target.value || undefined,
                                      })
                                    }
                                    className="w-full glass-panel rounded-xl p-2.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 min-w-0">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                    {t("schema_studio_lo_doc_footer", "Structured Document Footer Wrapper")}
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={mt.document_footer ?? mt.footer ?? ""}
                                    onChange={(e) =>
                                      updateTarget({
                                        document_footer: e.target.value || undefined,
                                        footer: e.target.value || undefined,
                                      })
                                    }
                                    className="w-full glass-panel rounded-xl p-2.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                                  />
                                </div>
                              </div>

                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                  {t("schema_studio_mt_base_entries", "Pinned Base / Vanilla Entries")}
                                </label>
                                <StringListBuilder
                                  items={baseStrings}
                                  onChange={(nextBase) => updateTarget({ base_entries: nextBase })}
                                  placeholder={t("schema_studio_ph_mt_base_entries", "base or uuid|id|title|folder|version64")}
                                  addButtonLabel={t("add", "Add")}
                                />
                              </div>

                              <SchemaToggleRow
                                label={t("schema_studio_mt_req_uuid", "Require Valid UUID Per Entry")}
                                checked={Boolean(mt.require_uuid)}
                                onChange={(val) => updateTarget({ require_uuid: val })}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={`${t("schema_studio_sec_conflict_analyzers", "Conflict Radar Analyzers")} (${
              conflictAnalyzersArr.length
            })`}
            icon={t("icon_radar", "radar")}
            headerAction={
              <ActionButton
                variant="accent"
                icon={t("icon_add", "add")}
                onClick={() => {
                  const defaultExt = (extObj.supported && extObj.supported[0]) || ".bin";
                  const nextAnalyzer = {
                    id: `analyzer_${conflictAnalyzersArr.length + 1}`,
                    type: "binary_chunk_index",
                    extensions: [defaultExt],
                    magic_bytes: "",
                    header_offset: 0,
                    index_count_offset: 36,
                    index_offset_pos: 64,
                    entry_size: 32,
                    key_size: 16,
                    endian: "le",
                    bitmask_constant_header: false,
                  };
                  updateField("conflict_analyzers", [...conflictAnalyzersArr, nextAnalyzer]);
                }}
                className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("schema_studio_add_analyzer", "Add Conflict Analyzer")}
              </ActionButton>
            }
          >
            <div className="flex flex-col gap-3.5 w-full">
              <p className="text-xs font-medium text-[var(--subtext)] opacity-85 leading-relaxed">
                {t(
                  "schema_studio_conflict_analyzers_desc",
                  "Declarative binary chunk-table, archive member, virtual filesystem, and JSON key analyzers used by Conflict Radar to detect resource collisions without hardcoded format parsers."
                )}
              </p>

              {conflictAnalyzersArr.length > 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
                  {conflictAnalyzersArr.map((analyzer: any, idx: any) => {
                    const analyzerType =
                      analyzer.type || analyzer.analyzer_type || "binary_chunk_index";
                    const updateAnalyzerItem = (patch: Record<string, any>) => {
                      const next = [...conflictAnalyzersArr];
                      const updated = { ...analyzer, ...patch };
                      delete updated.analyzer_type;
                      next[idx] = updated;
                      updateField("conflict_analyzers", next);
                    };

                    return (
                      <div
                        key={`${analyzer.id || idx}-${idx}`}
                        className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3.5 min-w-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-[var(--accent)] font-mono truncate">
                            {`#${idx + 1} • ${analyzer.id || analyzerType}`}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateField(
                                "conflict_analyzers",
                                conflictAnalyzersArr.filter((_: any, i: any) => i !== idx)
                              )
                            }
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_delete", "delete")}
                            </span>
                            <HoverTooltip title={t("delete", "Delete")} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1 min-w-0">
                            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("schema_studio_analyzer_id", "Analyzer ID")}
                            </label>
                            <input
                              type="text"
                              value={analyzer.id ?? ""}
                              onChange={(e) => updateAnalyzerItem({ id: e.target.value })}
                              placeholder="binary_index_table"
                              className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                            />
                          </div>

                          <div className="flex flex-col gap-1 min-w-0">
                            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("schema_studio_analyzer_type", "Analyzer Mode")}
                            </label>
                            <CustomDropdown
                              disableTint={true}
                              value={analyzerType}
                              onChange={(v: string[]) =>
                                updateAnalyzerItem({ type: v[0] || "binary_chunk_index" })
                              }
                              options={[
                                {
                                  id: "binary_chunk_index",
                                  label: t(
                                    "schema_studio_analyzer_binary",
                                    "Binary Chunk / Resource Index Table"
                                  ),
                                },
                                {
                                  id: "container_toc",
                                  label: t(
                                    "schema_studio_analyzer_container_toc",
                                    "Archive / Binary Container TOC (BSA, BA2, LSPK, PAK, UTOC, RDAR, RPF7)"
                                  ),
                                },
                                {
                                  id: "chunked_record_stream",
                                  label: t(
                                    "schema_studio_analyzer_chunked_records",
                                    "Chunked Record FormID Stream"
                                  ),
                                },
                                {
                                  id: "selector_path",
                                  label: t(
                                    "schema_studio_analyzer_selector_path",
                                    "Structured XML / JSON Selector Path"
                                  ),
                                },
                                {
                                  id: "archive_member",
                                  label: t(
                                    "schema_studio_analyzer_archive",
                                    "Archive Container Member Paths"
                                  ),
                                },
                                {
                                  id: "virtual_fs_path",
                                  label: t(
                                    "schema_studio_analyzer_vfs",
                                    "Virtual Filesystem Relative Path"
                                  ),
                                },
                                {
                                  id: "json_xml_key",
                                  label: t(
                                    "schema_studio_analyzer_json",
                                    "Structured JSON Top-Level Keys"
                                  ),
                                },
                              ]}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5 min-w-0">
                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t("schema_studio_analyzer_exts", "Inspected File Extensions")}
                          </label>
                          <StringListBuilder
                            items={
                              Array.isArray(analyzer.extensions) ? analyzer.extensions : []
                            }
                            onChange={(nextExts) => updateAnalyzerItem({ extensions: nextExts })}
                            placeholder=".bin / .dat / .zip / .json"
                            addButtonLabel={t("add", "Add")}
                          />
                        </div>

                        {analyzerType === "container_toc" && (
                          <div className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t("schema_studio_analyzer_container_fmt", "Container Format Override")}
                            </label>
                            <CustomDropdown
                              disableTint={true}
                              value={analyzer.container_format || "auto"}
                              onChange={(v: string[]) =>
                                updateAnalyzerItem({
                                  container_format: v[0] && v[0] !== "auto" ? v[0] : undefined,
                                })
                              }
                              options={[
                                { id: "auto", label: t("schema_studio_container_auto", "Auto-Detect Magic Header") },
                                { id: "bsa", label: "BSA" },
                                { id: "ba2", label: "BA2" },
                                { id: "lspk", label: "LSPK" },
                                { id: "pak", label: "PAK" },
                                { id: "utoc", label: "UTOC" },
                                { id: "rdar", label: "RDAR" },
                                { id: "rpf7", label: "RPF7" },
                              ]}
                            />
                          </div>
                        )}

                        {(analyzerType === "selector_path" ||
                          analyzerType === "chunked_record_stream") && (
                          <div className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t(
                                "schema_studio_analyzer_selectors",
                                "Selector Keys / Record Tags"
                              )}
                            </label>
                            <StringListBuilder
                              items={
                                Array.isArray(analyzer.selectors)
                                  ? analyzer.selectors
                                  : String(analyzer.selector_path || "")
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean)
                              }
                              onChange={(nextSelectors) =>
                                updateAnalyzerItem({
                                  selector_path:
                                    nextSelectors.length > 0 ? nextSelectors.join(",") : undefined,
                                  selectors: undefined,
                                })
                              }
                              placeholder="Changes / UniqueID / WEAP"
                              addButtonLabel={t("add", "Add")}
                            />
                          </div>
                        )}

                        {analyzerType === "binary_chunk_index" && (
                          <div className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                  {t("schema_studio_analyzer_magic", "Header Magic Bytes")}
                                </label>
                                <input
                                  type="text"
                                  value={analyzer.magic_bytes ?? ""}
                                  onChange={(e) =>
                                    updateAnalyzerItem({ magic_bytes: e.target.value })
                                  }
                                  placeholder="0x44425046"
                                  className="h-10 min-w-0 glass-surface rounded-xl px-3 text-xs font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                                />
                              </div>

                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                  {t("schema_studio_analyzer_endian", "Byte Endianness")}
                                </label>
                                <CustomDropdown
                                  disableTint={true}
                                  value={analyzer.endian ?? "le"}
                                  onChange={(v: string[]) =>
                                    updateAnalyzerItem({ endian: v[0] || "le" })
                                  }
                                  options={[
                                    {
                                      id: "le",
                                      label: t(
                                        "schema_studio_endian_le",
                                        "Little-Endian (LE)"
                                      ),
                                    },
                                    {
                                      id: "be",
                                      label: t("schema_studio_endian_be", "Big-Endian (BE)"),
                                    },
                                  ]}
                                />
                              </div>

                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                  {t("schema_studio_analyzer_hdr_off", "Header Offset (Bytes)")}
                                </label>
                                <GlassNumberInput
                                  value={analyzer.header_offset ?? 0}
                                  min={0}
                                  onChange={(val) => updateAnalyzerItem({ header_offset: val })}
                                />
                              </div>

                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                  {t("schema_studio_analyzer_cnt_off", "Count Offset (Bytes)")}
                                </label>
                                <GlassNumberInput
                                  value={analyzer.index_count_offset ?? 36}
                                  min={0}
                                  onChange={(val) =>
                                    updateAnalyzerItem({ index_count_offset: val })
                                  }
                                />
                              </div>

                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                  {t(
                                    "schema_studio_analyzer_tbl_off",
                                    "Table Pointer Offset (Bytes)"
                                  )}
                                </label>
                                <GlassNumberInput
                                  value={analyzer.index_offset_pos ?? 64}
                                  min={0}
                                  onChange={(val) =>
                                    updateAnalyzerItem({ index_offset_pos: val })
                                  }
                                />
                              </div>

                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                  {t("schema_studio_analyzer_entry_sz", "Entry Stride (Bytes)")}
                                </label>
                                <GlassNumberInput
                                  value={analyzer.entry_size ?? 32}
                                  min={1}
                                  max={4096}
                                  onChange={(val) => updateAnalyzerItem({ entry_size: val })}
                                />
                              </div>

                              <div className="flex flex-col gap-1 min-w-0 sm:col-span-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                  {t("schema_studio_analyzer_key_sz", "Resource Key Size (Bytes)")}
                                </label>
                                <GlassNumberInput
                                  value={analyzer.key_size ?? 16}
                                  min={1}
                                  max={64}
                                  onChange={(val) => updateAnalyzerItem({ key_size: val })}
                                  className="max-w-[200px]"
                                />
                              </div>
                            </div>

                            <SchemaToggleRow
                              label={t(
                                "schema_studio_analyzer_bitmask",
                                "Bitmask Constant Slot Table Header"
                              )}
                              description={t(
                                "schema_studio_analyzer_bitmask_desc",
                                "Enable for binary chunk tables that prefix entries with a 32-bit constant-slot bitmask."
                              )}
                              checked={Boolean(analyzer.bitmask_constant_header)}
                              onChange={(val) =>
                                updateAnalyzerItem({ bitmask_constant_header: val })
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t(
              "schema_studio_sec_lab_verification",
              "{Lab} Verification & World-Load Telemetry"
            )}
            icon={t("icon_science", "science")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <SchemaToggleRow
                  label={t(
                    "schema_studio_lab_req_mason",
                    "Require {Lab} Verification For {Mason} Publish"
                  )}
                  description={t(
                    "schema_studio_lab_req_mason_desc",
                    "Requires creators to pass a live {Lab} proving run before publishing an {Mod} to {Nexus}."
                  )}
                  checked={Boolean(labObj.require_for_mason_publish)}
                  onChange={(val) =>
                    updateNestedField("lab_verification", "require_for_mason_publish", val)
                  }
                />

                <SchemaToggleRow
                  label={t(
                    "schema_studio_lab_req_scout",
                    "Require {Lab} Verification For Scout Approval"
                  )}
                  description={t(
                    "schema_studio_lab_req_scout_desc",
                    "Requires {Citizen} Scouts to complete a timed sandbox run before submitting verification votes."
                  )}
                  checked={Boolean(labObj.require_for_scout_approval)}
                  onChange={(val) =>
                    updateNestedField("lab_verification", "require_for_scout_approval", val)
                  }
                />

                <SchemaToggleRow
                  label={t(
                    "schema_studio_lab_req_focus",
                    "Require Active Window Focus During Countdown"
                  )}
                  description={t(
                    "schema_studio_lab_req_focus_desc",
                    "Pauses the {Lab} simulation timer automatically whenever the game window loses foreground OS focus."
                  )}
                  checked={labObj.require_focus !== false}
                  onChange={(val) =>
                    updateNestedField("lab_verification", "require_focus", val)
                  }
                />

                <SchemaToggleRow
                  label={t(
                    "schema_studio_lab_req_save",
                    "Require In-Engine Save Checkpoint"
                  )}
                  description={t(
                    "schema_studio_lab_req_save_desc",
                    "Verifies that the engine completes a clean save write at the end of testing, then rewinds the sandbox save to its airgapped baseline."
                  )}
                  checked={Boolean(labObj.require_save_checkpoint)}
                  onChange={(val) =>
                    updateNestedField("lab_verification", "require_save_checkpoint", val)
                  }
                />

                <SchemaToggleRow
                  label={t(
                    "schema_studio_lab_seed_save",
                    "Auto-Seed Sandbox Slot From Latest Save"
                  )}
                  description={t(
                    "schema_studio_lab_seed_save_desc",
                    "Automatically clones the most recent live save into the isolated {Lab} slot when unseeded."
                  )}
                  checked={Boolean(labObj.seed_sandbox_from_latest_save)}
                  onChange={(val) =>
                    updateNestedField("lab_verification", "seed_sandbox_from_latest_save", val)
                  }
                />

                <SchemaToggleRow
                  label={t(
                    "schema_studio_lab_hotkey_pause",
                    "Enable Pause / Speed Hotkey Detection"
                  )}
                  description={t(
                    "schema_studio_lab_hotkey_pause_desc",
                    "Monitors configured pause and resume virtual-key codes while the game window is focused so menu/simulation pauses hold the timer."
                  )}
                  checked={Boolean(labObj.enable_hotkey_pause_detection)}
                  onChange={(val) =>
                    updateNestedField("lab_verification", "enable_hotkey_pause_detection", val)
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t(
                      "schema_studio_lab_active_sec",
                      "Required Active Simulation Seconds"
                    )}
                  </label>
                  <GlassNumberInput
                    value={labObj.required_active_seconds ?? 120}
                    min={5}
                    max={3600}
                    step={15}
                    accentText={true}
                    onChange={(val) =>
                      updateNestedField("lab_verification", "required_active_seconds", val)
                    }
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lab_idle_sec", "Max Idle Grace Seconds")}
                  </label>
                  <GlassNumberInput
                    value={labObj.max_idle_seconds ?? 8}
                    min={0}
                    max={600}
                    step={2}
                    onChange={(val) =>
                      updateNestedField("lab_verification", "max_idle_seconds", val)
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lab_pause_keys", "Pause Virtual-Key Codes (VK)")}
                  </label>
                  <NumberListBuilder
                    items={
                      Array.isArray(labObj.pause_key_vk_codes) ? labObj.pause_key_vk_codes : []
                    }
                    onChange={(next) =>
                      updateNestedField("lab_verification", "pause_key_vk_codes", next)
                    }
                    placeholder={t("schema_studio_ph_vk_code", "Virtual-Key integer (e.g. 192)")}
                    quickPresets={[
                      { code: 192, label: "~" },
                      { code: 48, label: "0" },
                      { code: 96, label: "Num0" },
                      { code: 80, label: "P" },
                      { code: 32, label: "Space" },
                    ]}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lab_resume_keys", "Resume Virtual-Key Codes (VK)")}
                  </label>
                  <NumberListBuilder
                    items={
                      Array.isArray(labObj.resume_key_vk_codes)
                        ? labObj.resume_key_vk_codes
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("lab_verification", "resume_key_vk_codes", next)
                    }
                    placeholder={t("schema_studio_ph_vk_code", "Virtual-Key integer (e.g. 49)")}
                    quickPresets={[
                      { code: 49, label: "1" },
                      { code: 50, label: "2" },
                      { code: 51, label: "3" },
                      { code: 97, label: "Num1" },
                      { code: 98, label: "Num2" },
                      { code: 99, label: "Num3" },
                    ]}
                  />
                </div>
              </div>

              <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3.5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                    {t("icon_monitoring", "monitoring")}
                  </span>
                  <span className="text-xs font-black text-[var(--text)]">
                    {t(
                      "schema_studio_world_load_sig",
                      "World-Load Hardware Telemetry Signature"
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("schema_studio_lab_stabilize_sec", "Boot Stabilization Seconds")}
                    </label>
                    <GlassNumberInput
                      value={worldSigObj.stabilize_boot_seconds ?? 14}
                      min={1}
                      max={300}
                      onChange={(val) =>
                        updateDeepLabSignatureField("stabilize_boot_seconds", val)
                      }
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 min-w-0">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("schema_studio_lab_disk_mb", "Min Disk Read Burst (MB)")}
                    </label>
                    <GlassNumberInput
                      value={worldSigObj.min_disk_read_mb ?? 75}
                      min={0}
                      max={10000}
                      step={5}
                      onChange={(val) => updateDeepLabSignatureField("min_disk_read_mb", val)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 min-w-0">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("schema_studio_lab_ram_cold", "Min RAM Step-Up (%)")}
                    </label>
                    <GlassNumberInput
                      value={worldSigObj.min_ram_step_percent ?? 20}
                      min={0}
                      max={500}
                      step={5}
                      onChange={(val) =>
                        updateDeepLabSignatureField("min_ram_step_percent", val)
                      }
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 min-w-0">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("schema_studio_lab_ram_warm", "Warm-Cache RAM Step (%)")}
                    </label>
                    <GlassNumberInput
                      value={worldSigObj.warm_cache_ram_step_percent ?? 35}
                      min={0}
                      max={500}
                      step={5}
                      onChange={(val) =>
                        updateDeepLabSignatureField("warm_cache_ram_step_percent", val)
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 min-w-0 pt-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t(
                      "schema_studio_lab_scratch_dirs",
                      "Active World Scratch Subdirectories (Relative to User Data Root)"
                    )}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(worldSigObj.scratch_activity_subdirs)
                        ? worldSigObj.scratch_activity_subdirs
                        : []
                    }
                    onChange={(next) =>
                      updateDeepLabSignatureField("scratch_activity_subdirs", next)
                    }
                    placeholder="e.g. saves/scratch"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>
              </div>
            </div>
          </UniversalGroup>
        </div>
      )}

      {/* =====================================================================
          TAB 4: EXCEPTION LOGS, DIAGNOSTIC RULES & BACKUPS / SAVE AIRGAP
         ===================================================================== */}
      {activeTab === "rules_capsule" && (
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
          <UniversalGroup
            title={`${t("schema_studio_sec_log_matchers", "Exception Log Matchers")} (${
              exceptionLogs.length
            })`}
            icon={t("icon_description", "description")}
            headerAction={
              <ActionButton
                variant="accent"
                icon={t("icon_add", "add")}
                onClick={() => {
                  updateField("exception_logs", [
                    ...exceptionLogs,
                    { starts_with: "crash", ends_with: ".log" },
                  ]);
                }}
                className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("schema_studio_add_log_matcher", "Add Log Matcher")}
              </ActionButton>
            }
          >
            <div className="grid grid-cols-1 @[920px]:grid-cols-2 gap-3.5 w-full">
              {exceptionLogs.map((matcher: any, idx: any) => {
                const isExactMode = Boolean(
                  matcher.exact && !matcher.starts_with && !matcher.ends_with
                );
                return (
                  <div
                    key={`log-matcher-${idx}`}
                    className={`glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] grid gap-2.5 items-end min-w-0 ${
                      isExactMode
                        ? "grid-cols-1 sm:grid-cols-[minmax(0,1.05fr)_minmax(0,1.95fr)_auto]"
                        : "grid-cols-1 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]"
                    }`}
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_cfg_rule_type", "Rule Type")}
                      </label>
                      <CustomDropdown
                        disableTint={true}
                        value={isExactMode ? "exact" : "prefix"}
                        onChange={(v: string[]) => {
                          const mode = v[0] || "prefix";
                          if (mode === "exact" && !isExactMode) {
                            const fallbackExact =
                              matcher.starts_with || matcher.ends_with
                                ? `${matcher.starts_with || "crash"}${matcher.ends_with || ".log"}`
                                : "engine_crash.log";
                            const next = [...exceptionLogs];
                            next[idx] = { exact: fallbackExact };
                            updateField("exception_logs", next);
                          } else if (mode === "prefix" && isExactMode) {
                            const currentExact = String(matcher.exact || "");
                            const dotIdx = currentExact.lastIndexOf(".");
                            const nextStarts =
                              dotIdx > 0 ? currentExact.slice(0, dotIdx) : currentExact || "crash";
                            const nextEnds = dotIdx > 0 ? currentExact.slice(dotIdx) : ".log";
                            const next = [...exceptionLogs];
                            next[idx] = {
                              starts_with: nextStarts,
                              ends_with: nextEnds,
                            };
                            updateField("exception_logs", next);
                          }
                        }}
                        options={[
                          {
                            id: "prefix",
                            label: t("schema_studio_log_mode_prefix", "Prefix + Extension"),
                          },
                          {
                            id: "exact",
                            label: t("schema_studio_log_mode_exact", "Exact Filename"),
                          },
                        ]}
                      />
                    </div>

                    {isExactMode ? (
                      <div className="flex flex-col gap-1 min-w-0">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t("schema_studio_log_exact", "Exact Filename")}
                        </label>
                        <input
                          type="text"
                          value={matcher.exact ?? ""}
                          onChange={(e) => {
                            const next = [...exceptionLogs];
                            next[idx] = {
                              exact: e.target.value,
                            };
                            updateField("exception_logs", next);
                          }}
                          placeholder="engine_crash.log"
                          className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col gap-1 min-w-0">
                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t("schema_studio_log_starts", "Starts With")}
                          </label>
                          <input
                            type="text"
                            value={matcher.starts_with ?? ""}
                            onChange={(e) => {
                              const next = [...exceptionLogs];
                              next[idx] = {
                                starts_with: e.target.value || undefined,
                                ends_with: matcher.ends_with,
                              };
                              updateField("exception_logs", next);
                            }}
                            placeholder={t("schema_studio_ph_log_starts", "crash_report")}
                            className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                          />
                        </div>

                        <div className="flex flex-col gap-1 min-w-0">
                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t("schema_studio_log_ends", "Ends With")}
                          </label>
                          <input
                            type="text"
                            value={matcher.ends_with ?? ""}
                            onChange={(e) => {
                              const next = [...exceptionLogs];
                              next[idx] = {
                                starts_with: matcher.starts_with,
                                ends_with: e.target.value || undefined,
                              };
                              updateField("exception_logs", next);
                            }}
                            placeholder=".log"
                            className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                          />
                        </div>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        updateField(
                          "exception_logs",
                          exceptionLogs.filter((_: any, i: any) => i !== idx)
                        )
                      }
                      className="w-10 h-10 shrink-0 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--danger)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] cursor-pointer transition-all"
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_delete", "delete")}
                      </span>
                      <HoverTooltip title={t("delete", "Delete")} />
                    </button>
                  </div>
                );
              })}
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("schema_studio_sec_capsule", "{Backups} & Tools")}
            icon={t("icon_history", "history")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_tc_world_targets", "World State {Backups} Targets")}
                  </label>
                  <TargetListBuilder
                    targets={
                      Array.isArray(capsuleObj.world_state_targets)
                        ? capsuleObj.world_state_targets
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("time_capsule", "world_state_targets", next)
                    }
                    namePlaceholder={t("schema_studio_ph_world_name", "User Saves")}
                    pathPlaceholder="saves"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_tc_engine_targets", "Engine State {Backups} Targets")}
                  </label>
                  <TargetListBuilder
                    targets={
                      Array.isArray(capsuleObj.engine_state_targets)
                        ? capsuleObj.engine_state_targets
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("time_capsule", "engine_state_targets", next)
                    }
                    namePlaceholder="Data"
                    pathPlaceholder="Data"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_tc_airgap_targets", "Save Airgap Folders")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(capsuleObj.save_airgap_targets)
                        ? capsuleObj.save_airgap_targets
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("time_capsule", "save_airgap_targets", next)
                    }
                    placeholder={t("schema_studio_ph_airgap_dirs", "saves / profiles")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lab_save_exts", "Save File Extensions")}
                  </label>
                  <StringListBuilder
                    items={Array.isArray(labObj.save_extensions) ? labObj.save_extensions : []}
                    onChange={(next) =>
                      updateNestedField("lab_verification", "save_extensions", next)
                    }
                    placeholder={t("schema_studio_ph_save_exts", ".save / .dat / .sav")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>
              </div>
            </div>
          </UniversalGroup>
        </div>
      )}
    </>
  );
}
