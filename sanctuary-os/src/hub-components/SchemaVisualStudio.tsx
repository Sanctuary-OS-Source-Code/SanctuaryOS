import { useState, useMemo, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { getSafeSchema } from "../store";
import {
  GAME_ARCHITECTURE_PRESETS,
  resolvePresetForGameId,
} from "../utils/gameArchitecturePresets";
import { getCachedOrBundledDefaultSchema } from "../utils/bundledSchemas";
import { deepAddMissing } from "../lib/MasonValidation";
import {
  ActionButton,
  CustomDropdown,
  DashboardStatTile,
  HoverTooltip,
  SidePanelFilterBar,
} from "../shared";
import { UniversalGroup } from "../components/universal/UniversalLayout";

type SchemaMainTab = "identity_paths" | "routing_ext" | "load_lab" | "rules_capsule";

export interface SchemaVisualStudioProps {
  content: string;
  onChange: (newContent: string) => void;
  fileName?: string;
  isKeepers?: boolean;
  onOpenGuide?: () => void;
}

const VK_KEY_LABELS: Record<number, string> = {
  19: "Pause",
  27: "Esc",
  32: "Space",
  48: "0",
  49: "1",
  50: "2",
  51: "3",
  52: "4",
  80: "P",
  96: "Num0",
  97: "Num1",
  98: "Num2",
  99: "Num3",
  112: "F1",
  113: "F2",
  114: "F3",
  115: "F4",
  192: "~",
};

function normalizeStringRecord(raw: any): Record<string, string> {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const mapped: Record<string, string> = {};
    for (const entry of raw) {
      if (typeof entry === "string" && entry.trim()) {
        mapped[entry.trim()] = entry.trim();
      } else if (entry && typeof entry === "object") {
        const k = String(entry.ext ?? entry.key ?? entry.code ?? entry.id ?? "").trim();
        if (k) {
          mapped[k] = String(
            entry.label ?? entry.value ?? entry.name ?? entry.title ?? k
          );
        }
      }
    }
    return mapped;
  }
  if (typeof raw === "object") {
    const mapped: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string") {
        mapped[k] = v;
      } else if (typeof v === "number" || typeof v === "boolean") {
        mapped[k] = String(v);
      } else if (v && typeof v === "object") {
        const objVal = v as Record<string, any>;
        mapped[k] = String(
          objVal.name ?? objVal.label ?? objVal.title ?? objVal.value ?? ""
        );
      }
    }
    return mapped;
  }
  return {};
}

function GlassNumberInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  className = "",
  accentText = false,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  accentText?: boolean;
}) {
  const { t } = useLexicon();
  const numericVal = Number.isFinite(Number(value)) ? Number(value) : min;
  const [draft, setDraft] = useState<string | null>(null);

  const clampVal = (raw: number) => {
    let next = raw;
    if (typeof min === "number") next = Math.max(min, next);
    if (typeof max === "number") next = Math.min(max, next);
    return next;
  };

  const applyDelta = (delta: number) => {
    setDraft(null);
    onChange(clampVal(numericVal + delta));
  };

  const commitDraft = () => {
    if (draft === null) return;
    const trimmed = draft.trim();
    const parsed = trimmed === "" ? Number.NaN : Number(trimmed);
    setDraft(null);
    if (Number.isNaN(parsed)) {
      onChange(numericVal);
      return;
    }
    onChange(clampVal(parsed));
  };

  return (
    <div
      className={`h-10 glass-panel rounded-xl px-1.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-1 ${className}`}
    >
      <button
        type="button"
        onClick={() => applyDelta(-step)}
        disabled={typeof min === "number" && numericVal <= min}
        className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0 disabled:opacity-35 disabled:pointer-events-none"
      >
        <span className="material-symbols-outlined !text-[15px]">
          {t("icon_remove", "remove")}
        </span>
        <HoverTooltip title={t("decrease", "Decrease")} />
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={draft !== null ? draft : String(numericVal)}
        onFocus={() => setDraft(String(numericVal))}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9.-]/g, "");
          setDraft(cleaned);
          if (cleaned !== "" && cleaned !== "-" && !cleaned.endsWith(".")) {
            const parsed = Number(cleaned);
            if (
              !Number.isNaN(parsed) &&
              (typeof min !== "number" || parsed >= min) &&
              (typeof max !== "number" || parsed <= max)
            ) {
              onChange(parsed);
            }
          }
        }}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft();
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className={`flex-1 min-w-0 w-full bg-transparent border-none text-center text-xs tabular-nums font-bold focus:outline-none px-1 ${
          accentText ? "text-[var(--accent)]" : "text-[var(--text)]"
        }`}
      />
      <button
        type="button"
        onClick={() => applyDelta(step)}
        disabled={typeof max === "number" && numericVal >= max}
        className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0 disabled:opacity-35 disabled:pointer-events-none"
      >
        <span className="material-symbols-outlined !text-[15px]">
          {t("icon_add", "add")}
        </span>
        <HoverTooltip title={t("increase", "Increase")} />
      </button>
    </div>
  );
}

function StringListBuilder({
  items = [],
  onChange,
  placeholder,
  addButtonLabel,
  mono = true,
  layout = "chips",
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  addButtonLabel: string;
  mono?: boolean;
  layout?: "chips" | "paths";
}) {
  const { t } = useLexicon();
  const [draft, setDraft] = useState("");

  const cleanItems = useMemo(
    () =>
      (Array.isArray(items) ? items : []).filter(
        (it) => typeof it === "string" && it.trim().length > 0
      ),
    [items]
  );

  const handleAdd = () => {
    const val = draft.trim();
    if (!val) return;
    if (!cleanItems.includes(val)) {
      onChange([...cleanItems, val]);
    }
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {cleanItems.length > 0 &&
        (layout === "paths" ? (
          <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
            {cleanItems.map((item, idx) => (
              <div
                key={`${item}-${idx}`}
                className="h-10 min-h-[40px] shrink-0 glass-panel rounded-xl px-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-xs font-bold text-[var(--text)] flex items-center justify-between gap-2.5 min-w-0"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)] opacity-75 shrink-0">
                    {t("icon_folder", "folder")}
                  </span>
                  <span
                    className={`truncate min-w-0 flex-1 ${
                      mono ? "font-mono text-[var(--accent)]" : ""
                    }`}
                  >
                    {item}
                    <HoverTooltip title={item} onlyWhenTruncated />
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(cleanItems.filter((_, i) => i !== idx))}
                  className="w-7 h-7 rounded-lg text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer flex items-center justify-center shrink-0"
                >
                  <span className="material-symbols-outlined !text-[15px]">
                    {t("icon_delete", "delete")}
                  </span>
                  <HoverTooltip title={t("delete", "Delete")} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {cleanItems.map((item, idx) => (
              <div
                key={`${item}-${idx}`}
                className="h-9 min-h-[36px] shrink-0 glass-panel rounded-xl px-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-xs font-bold text-[var(--text)] flex items-center gap-2 max-w-full"
              >
                <span
                  className={`truncate ${mono ? "font-mono text-[var(--accent)]" : ""}`}
                >
                  {item}
                  <HoverTooltip title={item} onlyWhenTruncated />
                </span>
                <button
                  type="button"
                  onClick={() => onChange(cleanItems.filter((_, i) => i !== idx))}
                  className="text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer flex items-center shrink-0"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_delete", "delete")}
                  </span>
                  <HoverTooltip title={t("delete", "Delete")} />
                </button>
              </div>
            ))}
          </div>
        ))}
      <div className="flex items-center gap-2 min-w-0">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          className={`flex-1 min-w-0 h-10 glass-surface rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] ${
            mono ? "font-mono" : ""
          }`}
        />
        <ActionButton
          variant="accent"
          icon={t("icon_add", "add")}
          disabled={!draft.trim()}
          onClick={handleAdd}
          className="!h-10 !px-3.5 !text-xs !rounded-xl shrink-0"
        >
          {addButtonLabel}
        </ActionButton>
      </div>
    </div>
  );
}

function NumberListBuilder({
  items = [],
  onChange,
  placeholder,
  quickPresets = [],
}: {
  items: number[];
  onChange: (next: number[]) => void;
  placeholder: string;
  quickPresets?: { code: number; label: string }[];
}) {
  const { t } = useLexicon();
  const [draft, setDraft] = useState("");

  const cleanItems = useMemo(
    () =>
      (Array.isArray(items) ? items : [])
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 512),
    [items]
  );

  const addCode = (code: number) => {
    if (!Number.isInteger(code) || code < 0 || code > 512) return;
    if (!cleanItems.includes(code)) {
      onChange([...cleanItems, code]);
    }
  };

  const handleAddDraft = () => {
    const parsed = Number.parseInt(draft.trim(), 10);
    if (Number.isNaN(parsed)) return;
    addCode(parsed);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {cleanItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cleanItems.map((code, idx) => {
            const keyName = VK_KEY_LABELS[code];
            return (
              <div
                key={`${code}-${idx}`}
                className="h-9 min-h-[36px] shrink-0 glass-panel rounded-xl px-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-xs font-bold text-[var(--text)] flex items-center gap-2"
              >
                <span className="font-mono text-[var(--accent)]">{code}</span>
                {keyName && (
                  <span className="px-1.5 py-0.5 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[10px] font-mono text-[var(--subtext)]">
                    {keyName}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onChange(cleanItems.filter((_, i) => i !== idx))}
                  className="text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer flex items-center shrink-0"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_delete", "delete")}
                  </span>
                  <HoverTooltip title={t("delete", "Delete")} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {quickPresets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {quickPresets.map((preset) => {
            const exists = cleanItems.includes(preset.code);
            return (
              <button
                key={preset.code}
                type="button"
                disabled={exists}
                onClick={() => addCode(preset.code)}
                className="h-7 px-2.5 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[10px] font-mono font-bold text-[var(--subtext)] hover:text-[var(--accent)] transition-all cursor-pointer disabled:opacity-35 disabled:pointer-events-none"
              >
                {`+${preset.code} (${preset.label})`}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2 min-w-0">
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddDraft();
            }
          }}
          className="flex-1 min-w-0 h-10 glass-surface rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
        />
        <ActionButton
          variant="accent"
          icon={t("icon_add", "add")}
          disabled={!draft.trim()}
          onClick={handleAddDraft}
          className="!h-10 !px-3.5 !text-xs !rounded-xl shrink-0"
        >
          {t("add", "Add")}
        </ActionButton>
      </div>
    </div>
  );
}

function TwinExtensionGroupsBuilder({
  groups = [],
  onChange,
}: {
  groups: string[][];
  onChange: (next: string[][]) => void;
}) {
  const { t } = useLexicon();
  const [extA, setExtA] = useState("");
  const [extB, setExtB] = useState("");

  const cleanGroups = useMemo(
    () =>
      (Array.isArray(groups) ? groups : [])
        .filter((g) => Array.isArray(g))
        .map((g) =>
          g
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        )
        .filter((g) => g.length >= 2),
    [groups]
  );

  const handleAddPair = () => {
    const a = extA.trim();
    const b = extB.trim();
    if (!a || !b || a.toLowerCase() === b.toLowerCase()) return;
    const normA = a.startsWith(".") ? a : `.${a}`;
    const normB = b.startsWith(".") ? b : `.${b}`;
    onChange([...cleanGroups, [normA, normB]]);
    setExtA("");
    setExtB("");
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {cleanGroups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cleanGroups.map((grp, idx) => (
            <div
              key={`${grp.join("+")}-${idx}`}
              className="h-9 min-h-[36px] glass-panel rounded-xl px-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-xs font-mono font-bold text-[var(--accent)] flex items-center gap-2"
            >
              <span>{grp.join(" ↔ ")}</span>
              <button
                type="button"
                onClick={() => onChange(cleanGroups.filter((_, i) => i !== idx))}
                className="text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer flex items-center shrink-0"
              >
                <span className="material-symbols-outlined !text-[14px]">
                  {t("icon_delete", "delete")}
                </span>
                <HoverTooltip title={t("delete", "Delete")} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center min-w-0">
        <input
          type="text"
          value={extA}
          onChange={(e) => setExtA(e.target.value)}
          placeholder={t("schema_studio_ph_twin_ext_a", "Primary ext (e.g. .bin)")}
          className="h-10 min-w-0 w-full glass-surface rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
        />
        <input
          type="text"
          value={extB}
          onChange={(e) => setExtB(e.target.value)}
          placeholder={t("schema_studio_ph_twin_ext_b", "Companion ext (e.g. .dll)")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddPair();
            }
          }}
          className="h-10 min-w-0 w-full glass-surface rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
        />
        <ActionButton
          variant="accent"
          icon={t("icon_add", "add")}
          disabled={!extA.trim() || !extB.trim()}
          onClick={handleAddPair}
          className="!h-10 !px-3.5 !text-xs !rounded-xl shrink-0"
        >
          {t("schema_studio_add_twin_pair", "Pair Extensions")}
        </ActionButton>
      </div>
    </div>
  );
}

function KeyValueMapBuilder({
  record = {},
  onChange,
  keyPlaceholder,
  valPlaceholder,
}: {
  record: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  keyPlaceholder: string;
  valPlaceholder: string;
}) {
  const { t } = useLexicon();
  const [newK, setNewK] = useState("");
  const [newV, setNewV] = useState("");

  const safeRecord = useMemo(() => normalizeStringRecord(record), [record]);
  const entries = Object.entries(safeRecord);

  const handleAdd = () => {
    const k = newK.trim();
    const v = newV.trim();
    if (!k) return;
    onChange({ ...safeRecord, [k]: v });
    setNewK("");
    setNewV("");
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {entries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {entries.map(([k, v]) => (
            <div
              key={k}
              className="grid grid-cols-[minmax(95px,135px)_minmax(0,1fr)_auto] gap-2 items-center min-w-0"
            >
              <div className="h-10 glass-surface rounded-xl px-3.5 flex items-center text-xs font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] truncate min-w-0">
                <span className="truncate min-w-0">
                  {k}
                  <HoverTooltip title={k} onlyWhenTruncated />
                </span>
              </div>
              <input
                type="text"
                value={v}
                onChange={(e) => onChange({ ...safeRecord, [k]: e.target.value })}
                className="h-10 min-w-0 w-full glass-surface rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => {
                  const next = { ...safeRecord };
                  delete next[k];
                  onChange(next);
                }}
                className="w-10 h-10 shrink-0 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--danger)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer transition-all"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_delete", "delete")}
                </span>
                <HoverTooltip title={t("delete", "Delete")} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[minmax(110px,160px)_minmax(0,1fr)_auto] gap-2 items-center pt-1 min-w-0">
        <input
          type="text"
          value={newK}
          onChange={(e) => setNewK(e.target.value)}
          placeholder={keyPlaceholder}
          className="h-10 min-w-0 w-full glass-surface rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
        />
        <input
          type="text"
          value={newV}
          onChange={(e) => setNewV(e.target.value)}
          placeholder={valPlaceholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          className="h-10 min-w-0 w-full glass-surface rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
        />
        <ActionButton
          variant="accent"
          icon={t("icon_add", "add")}
          disabled={!newK.trim()}
          onClick={handleAdd}
          className="!h-10 !px-3.5 !text-xs !rounded-xl shrink-0"
        >
          {t("add", "Add")}
        </ActionButton>
      </div>
    </div>
  );
}

function TargetListBuilder({
  targets = [],
  onChange,
  namePlaceholder = "User Saves",
  pathPlaceholder = "saves",
}: {
  targets: { name: string; path: string }[];
  onChange: (next: { name: string; path: string }[]) => void;
  namePlaceholder?: string;
  pathPlaceholder?: string;
}) {
  const { t } = useLexicon();
  const [draftName, setDraftName] = useState("");
  const [draftPath, setDraftPath] = useState("");

  const handleAdd = () => {
    const n = draftName.trim();
    const p = draftPath.trim();
    if (!n) return;
    onChange([...targets, { name: n, path: p }]);
    setDraftName("");
    setDraftPath("");
  };

  return (
    <div className="flex flex-col gap-2.5 min-w-0">
      {targets.map((tgt, idx) => (
        <div
          key={`${tgt.name}-${idx}`}
          className="grid grid-cols-[minmax(100px,140px)_minmax(0,1fr)_auto] gap-2 items-center min-w-0"
        >
          <input
            type="text"
            value={tgt.name ?? ""}
            onChange={(e) => {
              const next = [...targets];
              next[idx] = { ...tgt, name: e.target.value };
              onChange(next);
            }}
            className="h-10 min-w-0 w-full glass-panel rounded-xl px-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
          />
          <input
            type="text"
            value={tgt.path ?? ""}
            onChange={(e) => {
              const next = [...targets];
              next[idx] = { ...tgt, path: e.target.value };
              onChange(next);
            }}
            className="h-10 min-w-0 w-full glass-surface rounded-xl px-3 text-xs font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
          />
          <button
            type="button"
            onClick={() => onChange(targets.filter((_, i) => i !== idx))}
            className="w-10 h-10 shrink-0 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--danger)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer transition-all"
          >
            <span className="material-symbols-outlined !text-[16px]">
              {t("icon_delete", "delete")}
            </span>
            <HoverTooltip title={t("delete", "Delete")} />
          </button>
        </div>
      ))}
      <div className="grid grid-cols-[minmax(100px,140px)_minmax(0,1fr)_auto] gap-2 items-center pt-1 min-w-0">
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder={namePlaceholder}
          className="h-10 min-w-0 w-full glass-surface rounded-xl px-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
        />
        <input
          type="text"
          value={draftPath}
          onChange={(e) => setDraftPath(e.target.value)}
          placeholder={pathPlaceholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          className="h-10 min-w-0 w-full glass-surface rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!draftName.trim()}
          className="w-10 h-10 shrink-0 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--accent)] flex items-center justify-center cursor-pointer disabled:opacity-40"
        >
          <span className="material-symbols-outlined !text-[16px]">{t("icon_add", "add")}</span>
          <HoverTooltip title={t("add", "Add")} />
        </button>
      </div>
    </div>
  );
}

function SchemaToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-between gap-3 text-left transition-all cursor-pointer w-full"
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-black text-[var(--text)]">{label}</span>
        {description && (
          <span className="text-[10px] font-medium text-[var(--subtext)] opacity-75 leading-relaxed">
            {description}
          </span>
        )}
      </div>
      <div
        className={`sa-glass-toggle shrink-0 ${checked ? "is-on" : ""}`}
        aria-checked={checked}
      >
        <div className="sa-glass-toggle-thumb" />
      </div>
    </button>
  );
}

export default function SchemaVisualStudio({
  content,
  onChange,
  fileName = "",
  onOpenGuide,
}: SchemaVisualStudioProps) {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState<SchemaMainTab>("identity_paths");

  const { parsedSchema, parseError } = useMemo(() => {
    try {
      const parsed = JSON.parse(content || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { parsedSchema: parsed as Record<string, any>, parseError: null };
      }
      return {
        parsedSchema: {} as Record<string, any>,
        parseError: "Root JSON must be an object",
      };
    } catch (e: any) {
      return {
        parsedSchema: {} as Record<string, any>,
        parseError: e?.message || "Invalid JSON",
      };
    }
  }, [content]);

  const fileStem = fileName.replace(/\.json$/i, "") || "universal";
  const isDefaultTemplateFile = fileStem.trim().toLowerCase() === "default";
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    if (isDefaultTemplateFile) return "universal";
    const initialPreset = resolvePresetForGameId(
      parsedSchema.game_id || parsedSchema.id || fileStem
    );
    return initialPreset.id || "universal";
  });

  useEffect(() => {
    if (isDefaultTemplateFile) {
      setSelectedPresetId("universal");
      return;
    }
    const nextPreset = resolvePresetForGameId(
      parsedSchema.game_id || parsedSchema.id || fileStem
    );
    setSelectedPresetId(nextPreset.id || "universal");
  }, [fileName, isDefaultTemplateFile]);

  const commitSchema = (nextSchema: Record<string, any>) => {
    const cleaned = { ...nextSchema };
    delete cleaned.dlc_catalog;
    delete cleaned.exception_rules;
    onChange(JSON.stringify(cleaned, null, 2));
  };

  const updateField = (key: string, value: any) => {
    commitSchema({ ...parsedSchema, [key]: value });
  };

  const updateNestedField = (parentKey: string, childKey: string, value: any) => {
    const parentObj =
      parsedSchema[parentKey] && typeof parsedSchema[parentKey] === "object"
        ? parsedSchema[parentKey]
        : {};
    commitSchema({
      ...parsedSchema,
      [parentKey]: {
        ...parentObj,
        [childKey]: value,
      },
    });
  };

  const updateDeepLabSignatureField = (childKey: string, value: any) => {
    const curLab =
      parsedSchema.lab_verification && typeof parsedSchema.lab_verification === "object"
        ? parsedSchema.lab_verification
        : {};
    const curSig =
      curLab.world_load_signature && typeof curLab.world_load_signature === "object"
        ? curLab.world_load_signature
        : {};
    commitSchema({
      ...parsedSchema,
      lab_verification: {
        ...curLab,
        world_load_signature: {
          ...curSig,
          [childKey]: value,
        },
      },
    });
  };

  const handleSeedDefaults = () => {
    const baseline = getCachedOrBundledDefaultSchema();
    if (isDefaultTemplateFile) {
      const mergedDefault = deepAddMissing(
        baseline,
        {
          ...parsedSchema,
          id: "default",
          game_id: "default",
          display_name: parsedSchema.display_name || "Default Master Schema",
        },
        false
      );
      delete mergedDefault.name;
      delete mergedDefault.archive_containers;
      delete mergedDefault.mod_categories;
      delete mergedDefault.taxonomy;
      commitSchema(mergedDefault);
      return;
    }
    const fallbackId = parsedSchema.id || fileStem || "universal";
    const seeded = getSafeSchema(parsedSchema, fallbackId);
    delete seeded.name;
    delete seeded.archive_containers;
    delete seeded.mod_categories;
    delete seeded.taxonomy;
    const aligned = deepAddMissing(baseline, seeded, false);
    commitSchema(aligned);
  };

  const handleApplyArchitecturePreset = (presetKey: string) => {
    const baseline = getCachedOrBundledDefaultSchema();
    const preset = GAME_ARCHITECTURE_PRESETS[presetKey] || GAME_ARCHITECTURE_PRESETS.universal;
    const preserveId = isDefaultTemplateFile
      ? "default"
      : parsedSchema.id || fileStem || preset.id;
    const preserveGameId = isDefaultTemplateFile
      ? "default"
      : parsedSchema.game_id || preset.game_id || preserveId;
    const existingTitle = parsedSchema.display_name || parsedSchema.name;
    const preserveDisplayName = isDefaultTemplateFile
      ? "Default Master Schema"
      : existingTitle &&
          existingTitle !== "Universal Game Schema" &&
          existingTitle !== "Default Master Schema"
        ? existingTitle
        : preset.display_name;
    const next = JSON.parse(JSON.stringify(preset));
    next.id = preserveId;
    next.game_id = preserveGameId;
    next.display_name = preserveDisplayName;
    delete next.name;
    delete next.archive_containers;
    delete next.dlc_catalog;
    delete next.exception_rules;
    delete next.mod_categories;
    delete next.taxonomy;
    const aligned = deepAddMissing(baseline, next, false);
    commitSchema(aligned);
  };

  if (parseError) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full">
        <div className="glass-panel rounded-3xl p-8 border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] max-w-xl w-full text-center flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--danger)]">
            <span className="material-symbols-outlined !text-3xl">{t("icon_error", "error")}</span>
          </div>
          <h3 className="text-lg font-black text-[var(--text)] tracking-wide">
            {t("publish_disabled_errors_desc", "Fix syntax errors before saving")}
          </h3>
          <p className="text-xs font-mono text-[var(--danger)] opacity-85 px-4 py-2.5 rounded-xl border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] w-full break-all">
            {parseError}
          </p>
        </div>
      </div>
    );
  }

  const pathsObj = parsedSchema.paths || {};
  const extObj = parsedSchema.extensions || {};
  const constraintsObj = parsedSchema.constraints || {};
  const versionExtObj = parsedSchema.version_extraction || {};
  const externalToolsArr: any[] = Array.isArray(parsedSchema.external_tools)
    ? parsedSchema.external_tools
    : [];

  const routesArr: any[] = Array.isArray(parsedSchema.install_routes)
    ? parsedSchema.install_routes
    : [];
  const loadOrderObj = parsedSchema.load_order || {};
  const priorityTiers: any[] = Array.isArray(loadOrderObj.priority_tiers)
    ? loadOrderObj.priority_tiers
    : [];
  const conflictAnalyzersArr: any[] = Array.isArray(parsedSchema.conflict_analyzers)
    ? parsedSchema.conflict_analyzers
    : [];
  const labObj = parsedSchema.lab_verification || {};
  const worldSigObj = labObj.world_load_signature || {};
  const exceptionLogs: any[] = Array.isArray(parsedSchema.exception_logs)
    ? parsedSchema.exception_logs
    : [];
  const capsuleObj = parsedSchema.time_capsule || {};

  const presetOptions = [
    {
      id: "universal",
      label: t("schema_studio_preset_universal", "Universal Game Engine (Agnostic)"),
    },
    {
      id: "sims4",
      label: t("schema_studio_preset_sims4", "Life Simulation Engine (Binary Index + Script)"),
    },
    {
      id: "gtav",
      label: t("schema_studio_preset_gtav", "Open-World Action Engine (Container / Native Plugin)"),
    },
    {
      id: "wwe2k",
      label: t("schema_studio_preset_wwe2k", "Sports Simulation Engine (Baked Container)"),
    },
    {
      id: "skyrim",
      label: t("schema_studio_preset_skyrim", "Creation RPG Engine (Plugin Load Order + Extender)"),
    },
    {
      id: "cyberpunk2077",
      label: t(
        "schema_studio_preset_cyberpunk",
        "Cyberpunk Action Engine (Archive Container + Script)"
      ),
    },
    {
      id: "bg3",
      label: t("schema_studio_preset_bg3", "Isometric CRPG Engine (Container + Script Extender)"),
    },
    {
      id: "stardew",
      label: t("schema_studio_preset_stardew", "Indie Simulation Engine (Folder Manifests)"),
    },
  ];

  return (
    <div className="@container flex flex-col h-full min-h-0 w-full overflow-y-auto custom-scrollbar px-5 pt-4 pb-36 gap-4 select-none">
      {/* 1. Sleek Header Bar + Architecture Preset Loader + 1x4 DashboardStatTile Filter Grid */}
      <div className="flex flex-col gap-3.5 pb-1 shrink-0">
        <div className="flex flex-col @[860px]:flex-row @[860px]:items-center justify-between gap-3">
          <div className="flex-1 flex flex-col justify-start min-w-0">
            <input
              type="text"
              value={
                parsedSchema.display_name || parsedSchema.name || fileName.replace(/\.json$/i, "")
              }
              onChange={(e) => updateField("display_name", e.target.value)}
              className="w-full bg-transparent border-b border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:theme-border-accent outline-none text-xl md:text-2xl font-black text-[var(--text)] tracking-tight transition-colors py-0.5 truncate"
              placeholder={t("schema_studio_display_name", "Display Title")}
            />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-65 mt-0.5 truncate">
              {`${fileName || "schema.json"} • v${parsedSchema.schema_version ?? 1} • ${
                (extObj.supported || []).length
              } ${t("extensions", "Extensions")} • ${routesArr.length} ${t(
                "schema_studio_sec_routes",
                "Install Routes"
              )} • ${conflictAnalyzersArr.length} ${t(
                "schema_studio_tile_analyzers",
                "Radar Analyzers"
              )}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="w-[290px] max-w-full">
              <CustomDropdown
                disableTint={true}
                value={selectedPresetId}
                onChange={(v: string[]) => {
                  const chosen = v[0] || "universal";
                  setSelectedPresetId(chosen);
                }}
                options={presetOptions}
              />
            </div>
            <ActionButton
              variant="accent"
              icon={t("icon_architecture", "architecture")}
              onClick={() => handleApplyArchitecturePreset(selectedPresetId)}
              className="!h-10 !px-3.5 !text-xs !rounded-xl"
            >
              {t("schema_studio_apply_preset", "Apply Preset")}
            </ActionButton>
            <ActionButton
              variant="glass"
              icon={t("icon_auto_fix_high", "auto_fix_high")}
              onClick={handleSeedDefaults}
              className="!h-10 !px-3.5 !text-xs !rounded-xl"
            >
              {t("schema_studio_reset_defaults", "Populate Safe Defaults")}
            </ActionButton>
            {onOpenGuide && (
              <ActionButton
                variant="glass"
                icon={t("icon_menu_book", "menu_book")}
                onClick={onOpenGuide}
                className="!h-10 !px-3.5 !text-xs !rounded-xl"
              >
                {t("schema_guide_btn", "Schema Guide")}
              </ActionButton>
            )}
          </div>
        </div>

        <SidePanelFilterBar className="grid-cols-2 @[820px]:grid-cols-4 gap-3">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_badge", "badge")}
            label={t("schema_studio_tab_identity", "Identity & Paths")}
            value={`${(parsedSchema.executable_names || []).length} ${t(
              "schema_studio_tile_binaries",
              "Binaries"
            )} • ${externalToolsArr.length} ${t("schema_studio_tile_tools", "Tools")}`}
            isActive={activeTab === "identity_paths"}
            onClick={() => setActiveTab("identity_paths")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_alt_route", "alt_route")}
            label={t("schema_studio_tab_routes", "Extensions & Routes")}
            value={`${(extObj.supported || []).length} ${t(
              "extensions",
              "Extensions"
            )} • ${routesArr.length} ${t("schema_studio_tile_routes", "Routes")}`}
            isActive={activeTab === "routing_ext"}
            onClick={() => setActiveTab("routing_ext")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_low_priority", "low_priority")}
            label={t("schema_studio_tab_load_lab", "Load Order, Radar & {Lab}")}
            value={`${priorityTiers.length} ${t(
              "schema_studio_tile_tiers",
              "Tiers"
            )} • ${conflictAnalyzersArr.length} ${t("schema_studio_tile_analyzers", "Radar Analyzers")}`}
            isActive={activeTab === "load_lab"}
            onClick={() => setActiveTab("load_lab")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_history", "history")}
            label={t("schema_studio_tab_logs_backups", "Logs & {Backups}")}
            value={`${exceptionLogs.length} ${t(
              "schema_studio_tile_log_matchers",
              "Log Matchers"
            )}`}
            isActive={activeTab === "rules_capsule"}
            onClick={() => setActiveTab("rules_capsule")}
          />
        </SidePanelFilterBar>
      </div>

      {/* =====================================================================
          TAB 1: IDENTITY, PATHS, LAUNCHERS, CONSTRAINTS & VERSION/DLC
         ===================================================================== */}
      {activeTab === "identity_paths" && (
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
          <UniversalGroup
            title={t("schema_studio_sec_identity", "Identity & Core")}
            icon={t("icon_badge", "badge")}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full">
              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_id", "Schema ID")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.id ?? ""}
                  onChange={(e) => updateField("id", e.target.value)}
                  placeholder={t("ph_schema_id", "e.g. custom_engine")}
                  className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_game_id", "Game ID")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.game_id ?? ""}
                  onChange={(e) => updateField("game_id", e.target.value)}
                  placeholder={t("ph_schema_id", "e.g. custom_engine")}
                  className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_display_name", "Display Title")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.display_name ?? parsedSchema.name ?? ""}
                  onChange={(e) => {
                    const next: Record<string, any> = {
                      ...parsedSchema,
                      display_name: e.target.value,
                    };
                    delete next.name;
                    commitSchema(next);
                  }}
                  placeholder={t("ph_game_name", "e.g. My Community Game")}
                  className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_default_lexicon", "Default {Lexicon} Pack")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.default_lexicon ?? "en-default"}
                  onChange={(e) => updateField("default_lexicon", e.target.value)}
                  placeholder="en-default"
                  className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_version", "Schema Version")}
                </label>
                <GlassNumberInput
                  value={parsedSchema.schema_version ?? 2}
                  min={1}
                  onChange={(val) => updateField("schema_version", val)}
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_steam_app_id", "Steam AppID (Proton / SteamOS)")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.steam_app_id ?? ""}
                  onChange={(e) => updateField("steam_app_id", e.target.value || null)}
                  placeholder={t("schema_studio_ph_steam_app_id", "e.g. 100000")}
                  className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_min_scout", "Min Scout Submissions")}
                </label>
                <GlassNumberInput
                  value={parsedSchema.min_scout_submissions ?? 3}
                  min={1}
                  onChange={(val) => updateField("min_scout_submissions", val)}
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0 @[780px]:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_install_folders", "Storefront Install Folder Names")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(parsedSchema.install_folder_names)
                      ? parsedSchema.install_folder_names
                      : []
                  }
                  onChange={(next) => updateField("install_folder_names", next)}
                  placeholder={t("schema_studio_ph_install_folders", "e.g. Game Title Directory")}
                  addButtonLabel={t("add", "Add")}
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_gog_app_ids", "GOG Galaxy App IDs")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(parsedSchema.gog_app_ids)
                      ? parsedSchema.gog_app_ids
                      : []
                  }
                  onChange={(next) => updateField("gog_app_ids", next)}
                  placeholder={t("schema_studio_ph_gog_app_ids", "e.g. 1456460669")}
                  addButtonLabel={t("add", "Add")}
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_epic_app_names", "Epic / Heroic App Names")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(parsedSchema.epic_app_names)
                      ? parsedSchema.epic_app_names
                      : []
                  }
                  onChange={(next) => updateField("epic_app_names", next)}
                  placeholder={t("schema_studio_ph_epic_app_names", "e.g. AppName or CatalogItemId")}
                  addButtonLabel={t("add", "Add")}
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_ea_content_ids", "EA App Content IDs")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(parsedSchema.ea_content_ids)
                      ? parsedSchema.ea_content_ids
                      : []
                  }
                  onChange={(next) => updateField("ea_content_ids", next)}
                  placeholder={t("schema_studio_ph_ea_content_ids", "e.g. OFB-EAST:109552299")}
                  addButtonLabel={t("add", "Add")}
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_xbox_store_ids", "Xbox / MS Store IDs")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(parsedSchema.xbox_store_ids)
                      ? parsedSchema.xbox_store_ids
                      : []
                  }
                  onChange={(next) => updateField("xbox_store_ids", next)}
                  placeholder={t("schema_studio_ph_xbox_store_ids", "e.g. 9N...StoreId")}
                  addButtonLabel={t("add", "Add")}
                />
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("schema_studio_sec_paths", "Executables & Paths")}
            icon={t("icon_folder_open", "folder_open")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_exe_list", "Game Executables")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(parsedSchema.executable_names)
                      ? parsedSchema.executable_names
                      : []
                  }
                  onChange={(next) => updateField("executable_names", next)}
                  placeholder={t(
                    "schema_studio_ph_exe_names",
                    "e.g. GameLauncher.exe / ExampleGame.app"
                  )}
                  addButtonLabel={t("add", "Add")}
                />
              </div>

              <div className="grid grid-cols-1 @[780px]:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_exe_subdir", "Executable Subfolder")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.executable_subdir ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "executable_subdir", e.target.value)
                    }
                    placeholder={t("schema_studio_ph_exe_subdir", "e.g. bin/x64 (Blank = Root)")}
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_manifest_file", "Engine Manifest File")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.manifest_file ?? ""}
                    onChange={(e) => updateNestedField("paths", "manifest_file", e.target.value)}
                    placeholder={t(
                      "schema_studio_ph_manifest_file",
                      "load_manifest.cfg / loadorder.txt / (Blank = None)"
                    )}
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_win_mod_dir", "Default Windows {Mods} Directory")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.default_mod_dir_windows ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "default_mod_dir_windows", e.target.value)
                    }
                    placeholder="%USERPROFILE%/Documents/..."
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_mac_mod_dir", "Default macOS {Mods} Directory")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.default_mod_dir_mac ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "default_mod_dir_mac", e.target.value)
                    }
                    placeholder="~/Documents/..."
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_linux_mod_dir", "Default Linux / Proton {Mods} Directory")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.default_mod_dir_linux ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "default_mod_dir_linux", e.target.value)
                    }
                    placeholder="%USERPROFILE%/Documents/... or ~/.steam/steam/..."
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_user_data_win", "Windows Saves & Data Folder")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.user_data_dir_windows ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "user_data_dir_windows", e.target.value)
                    }
                    placeholder="%USERPROFILE%/Documents/My Games/..."
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_user_data_mac", "macOS Saves & Data Folder")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.user_data_dir_mac ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "user_data_dir_mac", e.target.value)
                    }
                    placeholder="~/Documents/..."
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_user_data_linux", "Linux / Proton User Data / Saves Root")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.user_data_dir_linux ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "user_data_dir_linux", e.target.value)
                    }
                    placeholder="%USERPROFILE%/Documents/... (Auto-maps to Proton pfx)"
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 @[920px]:grid-cols-3 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_auto_scan_win", "Windows Auto-Discovery Paths")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(pathsObj.auto_scan_paths_windows)
                        ? pathsObj.auto_scan_paths_windows
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("paths", "auto_scan_paths_windows", next)
                    }
                    placeholder="C:/Program Files (x86)/Steam/steamapps/common/..."
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_auto_scan_mac", "macOS Auto-Discovery Paths")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(pathsObj.auto_scan_paths_mac)
                        ? pathsObj.auto_scan_paths_mac
                        : []
                    }
                    onChange={(next) => updateNestedField("paths", "auto_scan_paths_mac", next)}
                    placeholder="/Applications/..."
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_auto_scan_linux", "Linux / SteamOS Auto-Discovery Paths")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(pathsObj.auto_scan_paths_linux)
                        ? pathsObj.auto_scan_paths_linux
                        : []
                    }
                    onChange={(next) => updateNestedField("paths", "auto_scan_paths_linux", next)}
                    placeholder="~/.steam/steam/steamapps/common/..."
                    addButtonLabel={t("add", "Add")}
                  />
                </div>
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={`${t(
              "schema_studio_sec_external_tools",
              "External Launchers & Script Extenders"
            )} (${externalToolsArr.length})`}
            icon={t("icon_rocket_launch", "rocket_launch")}
            headerAction={
              <ActionButton
                variant="accent"
                icon={t("icon_add", "add")}
                onClick={() => {
                  const nextTool = {
                    id: `extender_${externalToolsArr.length + 1}`,
                    label: t("schema_studio_default_tool_label", "Script Extender Loader"),
                    role: "script_extender",
                    executable: "",
                    args: [],
                    auto_launch: true,
                  };
                  updateField("external_tools", [...externalToolsArr, nextTool]);
                }}
                className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("schema_studio_add_external_tool", "Add External Tool")}
              </ActionButton>
            }
          >
            <div className="flex flex-col gap-3.5 w-full">
              <p className="text-xs font-medium text-[var(--subtext)] opacity-85 leading-relaxed">
                {t(
                  "schema_studio_external_tools_desc",
                  "Register optional script extenders or companion utilities (relative to the game root). When Auto-Launch is enabled and the executable is detected on disk, Sanctuary OS boots the game through it automatically."
                )}
              </p>

              {externalToolsArr.length > 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
                  {externalToolsArr.map((tool, idx) => (
                    <div
                      key={`${tool.id || idx}-${idx}`}
                      className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-[var(--accent)] font-mono truncate">
                          {`#${idx + 1} • ${tool.id || "tool"}`}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateField(
                              "external_tools",
                              externalToolsArr.filter((_, i) => i !== idx)
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

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="flex flex-col gap-1 min-w-0">
                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t("schema_studio_tool_id", "Tool ID")}
                          </label>
                          <input
                            type="text"
                            value={tool.id ?? ""}
                            onChange={(e) => {
                              const next = [...externalToolsArr];
                              next[idx] = { ...tool, id: e.target.value };
                              updateField("external_tools", next);
                            }}
                            placeholder="script_extender"
                            className="h-9 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                          />
                        </div>

                        <div className="flex flex-col gap-1 min-w-0">
                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t("schema_studio_cat_label", "Display Label")}
                          </label>
                          <input
                            type="text"
                            value={tool.label ?? tool.name ?? ""}
                            onChange={(e) => {
                              const next = [...externalToolsArr];
                              next[idx] = { ...tool, label: e.target.value };
                              updateField("external_tools", next);
                            }}
                            placeholder="Script Extender Loader"
                            className="h-9 min-w-0 glass-panel rounded-xl px-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                          />
                        </div>

                        <div className="flex flex-col gap-1 min-w-0">
                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t("role", "Role")}
                          </label>
                          <CustomDropdown
                            disableTint={true}
                            value={tool.role || tool.type || "script_extender"}
                            onChange={(v: string[]) => {
                              const next = [...externalToolsArr];
                              next[idx] = { ...tool, role: v[0] || "script_extender" };
                              updateField("external_tools", next);
                            }}
                            options={[
                              {
                                id: "script_extender",
                                label: t(
                                  "schema_studio_tool_role_extender",
                                  "Script Extender / Hook Launcher"
                                ),
                              },
                              {
                                id: "utility",
                                label: t(
                                  "schema_studio_tool_role_utility",
                                  "Companion Modding Utility"
                                ),
                              },
                            ]}
                          />
                        </div>

                        <div className="flex flex-col gap-1 min-w-0">
                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t("schema_studio_tool_exe", "Executable Relative Path")}
                          </label>
                          <input
                            type="text"
                            value={tool.executable ?? tool.exe ?? tool.path ?? ""}
                            onChange={(e) => {
                              const next = [...externalToolsArr];
                              next[idx] = { ...tool, executable: e.target.value };
                              updateField("external_tools", next);
                            }}
                            placeholder="e.g. extender_loader.exe"
                            className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t("schema_studio_tool_args", "Launch Arguments (Optional)")}
                        </label>
                        <StringListBuilder
                          items={
                            Array.isArray(tool.args)
                              ? tool.args
                              : typeof tool.args === "string" && tool.args.trim()
                                ? tool.args.trim().split(/\s+/)
                                : []
                          }
                          onChange={(nextArgs) => {
                            const next = [...externalToolsArr];
                            next[idx] = { ...tool, args: nextArgs };
                            updateField("external_tools", next);
                          }}
                          placeholder="e.g. --skip-intro"
                          addButtonLabel={t("add", "Add")}
                        />
                      </div>

                      <SchemaToggleRow
                        label={t(
                          "schema_studio_tool_auto_launch",
                          "Use as Primary Game Launcher When Present"
                        )}
                        checked={Boolean(
                          tool.auto_launch ?? tool.use_as_launcher ?? tool.is_script_extender
                        )}
                        onChange={(val) => {
                          const next = [...externalToolsArr];
                          next[idx] = { ...tool, auto_launch: val };
                          updateField("external_tools", next);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("schema_studio_sec_constraints", "Engine Safeguards & Vanilla Safety")}
            icon={t("icon_shield", "shield")}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
              <SchemaToggleRow
                label={t(
                  "schema_studio_shared_vanilla",
                  "{Mods} Folder Shared With Vanilla Files"
                )}
                description={t(
                  "schema_studio_shared_vanilla_clean_desc",
                  "Protects untouched vanilla game files when deploying directly into shared engine or root directories."
                )}
                checked={Boolean(constraintsObj.mods_dir_is_shared_with_vanilla)}
                onChange={(val) =>
                  updateNestedField("constraints", "mods_dir_is_shared_with_vanilla", val)
                }
              />

              <SchemaToggleRow
                label={t("schema_studio_preserve_folders", "Preserve Archive Subfolders")}
                description={t(
                  "schema_studio_preserve_folders_clean_desc",
                  "Keeps internal archive paths (such as meshes/, textures/, plugins/, or scripts/) intact on import."
                )}
                checked={Boolean(constraintsObj.preserve_archive_folder_structure)}
                onChange={(val) =>
                  updateNestedField("constraints", "preserve_archive_folder_structure", val)
                }
              />

              <SchemaToggleRow
                label={t("schema_studio_wrap_loose", "Auto-Folder Loose {Mod} Files")}
                description={t(
                  "schema_studio_wrap_loose_desc",
                  "Organizes loose files in the {Vault} root into named folders."
                )}
                checked={Boolean(constraintsObj.wrap_loose_files_in_folders)}
                onChange={(val) =>
                  updateNestedField("constraints", "wrap_loose_files_in_folders", val)
                }
              />

              <SchemaToggleRow
                label={t("schema_studio_script_unzip", "Check Nested Script Archives")}
                description={t(
                  "schema_studio_script_unzip_desc",
                  "Flags nested script archives that must be extracted to load in-engine."
                )}
                checked={Boolean(constraintsObj.requires_script_unzipping)}
                onChange={(val) =>
                  updateNestedField("constraints", "requires_script_unzipping", val)
                }
              />

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:col-span-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_max_depth", "Max Subfolder Depth")}
                  </label>
                  <span className="text-[10px] font-medium text-[var(--subtext)] opacity-75">
                    {t(
                      "schema_studio_max_depth_hint",
                      "Set 0 for unlimited subfolder recursion, or specify a maximum folder depth limit."
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <GlassNumberInput
                    value={constraintsObj.max_folder_depth ?? 0}
                    min={0}
                    max={32}
                    onChange={(val) =>
                      updateNestedField(
                        "constraints",
                        "max_folder_depth",
                        val <= 0 ? null : val
                      )
                    }
                    className="w-[160px]"
                  />
                  {constraintsObj.max_folder_depth == null && (
                    <span className="px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--accent)]">
                      {t("schema_studio_unlimited", "Unlimited")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("schema_studio_sec_version_dlc", "Version & DLC Detection")}
            icon={t("icon_verified", "verified")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ver_method", "Version Source")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={versionExtObj.method ?? "none"}
                    onChange={(v: string[]) => {
                      const picked = v[0] || "none";
                      updateNestedField(
                        "version_extraction",
                        "method",
                        picked === "none" ? null : picked
                      );
                    }}
                    options={[
                      {
                        id: "none",
                        label: t("none", "None"),
                      },
                      {
                        id: "pe_header",
                        label: t(
                          "schema_studio_ver_method_pe",
                          "Executable Header + Text Fallback"
                        ),
                      },
                      {
                        id: "ini_key",
                        label: t("schema_studio_ver_method_ini", "INI / Config Key"),
                      },
                      {
                        id: "json_key",
                        label: t("schema_studio_ver_method_json", "JSON Property Key"),
                      },
                      {
                        id: "plain_text",
                        label: t("schema_studio_ver_method_text", "Plain Text / Version File"),
                      },
                      {
                        id: "xml_tag",
                        label: t("schema_studio_ver_method_xml", "XML / Plist Tag"),
                      },
                      {
                        id: "regex",
                        label: t("schema_studio_ver_method_regex", "Regex Capture Pattern"),
                      },
                    ]}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ver_rel_path", "Version File Path")}
                  </label>
                  <input
                    type="text"
                    value={versionExtObj.relative_path ?? ""}
                    onChange={(e) =>
                      updateNestedField("version_extraction", "relative_path", e.target.value)
                    }
                    placeholder={t("schema_studio_ph_ver_rel_path", "e.g. bin/x64/EngineVersion.ini")}
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ver_line_prefix", "Version Key Prefix")}
                  </label>
                  <input
                    type="text"
                    value={versionExtObj.line_prefix ?? ""}
                    onChange={(e) =>
                      updateNestedField("version_extraction", "line_prefix", e.target.value)
                    }
                    placeholder={t("schema_studio_ph_ver_line_prefix", "e.g. gameversion")}
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ver_json_key", "Version JSON Key Path")}
                  </label>
                  <input
                    type="text"
                    value={versionExtObj.json_key ?? ""}
                    onChange={(e) =>
                      updateNestedField(
                        "version_extraction",
                        "json_key",
                        e.target.value ? e.target.value : null
                      )
                    }
                    placeholder={t("schema_studio_ph_ver_json_key", "e.g. build.version")}
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>

                {versionExtObj.method === "xml_tag" && (
                  <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("schema_studio_ver_xml_tag", "XML / Plist Tag Name")}
                    </label>
                    <input
                      type="text"
                      value={versionExtObj.xml_tag ?? ""}
                      onChange={(e) =>
                        updateNestedField(
                          "version_extraction",
                          "xml_tag",
                          e.target.value ? e.target.value : null
                        )
                      }
                      placeholder={t("schema_studio_ph_ver_xml_tag", "e.g. AppVersion")}
                      className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                    />
                  </div>
                )}

                {versionExtObj.method === "regex" && (
                  <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("schema_studio_ver_regex", "Version Regex Pattern")}
                    </label>
                    <input
                      type="text"
                      value={versionExtObj.regex_pattern ?? ""}
                      onChange={(e) =>
                        updateNestedField(
                          "version_extraction",
                          "regex_pattern",
                          e.target.value ? e.target.value : null
                        )
                      }
                      placeholder={t("schema_studio_ph_ver_regex", "e.g. build\\s+([0-9.]+)")}
                      className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                    />
                  </div>
                )}

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0 lg:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_dlc_mask_tpl", "DLC Mask Launch Argument")}
                  </label>
                  <input
                    type="text"
                    value={parsedSchema.launch_args_dlc_mask_template ?? ""}
                    onChange={(e) =>
                      updateField(
                        "launch_args_dlc_mask_template",
                        e.target.value ? e.target.value : null
                      )
                    }
                    placeholder={t("schema_studio_ph_dlc_mask", "e.g. -disablepacks:{packs}")}
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>
              </div>

              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_ver_fallback_paths", "Fallback Version File Paths")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(versionExtObj.fallback_paths)
                      ? versionExtObj.fallback_paths
                      : []
                  }
                  onChange={(next) =>
                    updateNestedField("version_extraction", "fallback_paths", next)
                  }
                  placeholder={t(
                    "schema_studio_ph_ver_fallback",
                    "e.g. version.json or Build/Build.version"
                  )}
                  addButtonLabel={t("schema_studio_add_fallback_path", "Add Fallback Path")}
                  layout="paths"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_dlc_prefixes", "DLC Folder Prefixes")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(parsedSchema.dlc_folder_prefixes)
                        ? parsedSchema.dlc_folder_prefixes
                        : []
                    }
                    onChange={(next) => updateField("dlc_folder_prefixes", next)}
                    placeholder={t("schema_studio_ph_dlc_prefixes", "DLC_ / Expansion_")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_dlc_subdirs", "DLC Search Folders")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(parsedSchema.dlc_subdirs) ? parsedSchema.dlc_subdirs : []
                    }
                    onChange={(next) => updateField("dlc_subdirs", next)}
                    placeholder={t("schema_studio_ph_dlc_subdirs", "Data / addons / dlc")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_dlc_exts", "DLC File Extensions")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(parsedSchema.dlc_file_extensions)
                        ? parsedSchema.dlc_file_extensions
                        : []
                    }
                    onChange={(next) => updateField("dlc_file_extensions", next)}
                    placeholder={t("schema_studio_ph_dlc_exts", ".dlc / .dat")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>
              </div>
            </div>
          </UniversalGroup>
        </div>
      )}

      {/* =====================================================================
          TAB 2: EXTENSIONS, PARSERS, INSTALL ROUTES & TAXONOMY
         ===================================================================== */}
      {activeTab === "routing_ext" && (
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
          <UniversalGroup
            title={t("schema_studio_sec_extensions", "Extensions & Parsers")}
            icon={t("icon_extension", "extension")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_supported_ext", "Supported {Mod} Extensions")}
                  </label>
                  <StringListBuilder
                    items={Array.isArray(extObj.supported) ? extObj.supported : []}
                    onChange={(next) => updateNestedField("extensions", "supported", next)}
                    placeholder={t(
                      "schema_studio_ph_supported_ext",
                      ".bin / .dat / .dll / .lua / .ini"
                    )}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_vault_visible_ext", "{Vault} Visible Extensions")}
                  </label>
                  <StringListBuilder
                    items={Array.isArray(extObj.vault_visible) ? extObj.vault_visible : []}
                    onChange={(next) => updateNestedField("extensions", "vault_visible", next)}
                    placeholder={t("schema_studio_ph_vault_ext", ".bin / .dll / .ini / .json")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ext_script", "Script / Executable {Mod} Extensions")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(extObj.script_extensions) ? extObj.script_extensions : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "script_extensions", next)
                    }
                    placeholder={t("schema_studio_ph_script_exts", ".dll / .so / .lua / .py")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_archive_exts", "Archive Container Formats")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(extObj.archive_containers) ? extObj.archive_containers : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "archive_containers", next)
                    }
                    placeholder=".zip / .7z / .rar"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_config_ext", "Editable Config Extensions")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(extObj.config_extensions) ? extObj.config_extensions : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "config_extensions", next)
                    }
                    placeholder=".ini / .cfg / .json / .toml / .yaml"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t(
                      "schema_studio_editable_cfg_formats",
                      "Workbench Editable Text Formats"
                    )}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(extObj.editable_config_formats)
                        ? extObj.editable_config_formats
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "editable_config_formats", next)
                    }
                    placeholder=".cfg / .ini / .json / .toml / .yaml / .xml"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ignore_unid_ext", "Ignored Extensions")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(extObj.ignore_unidentified)
                        ? extObj.ignore_unidentified
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "ignore_unidentified", next)
                    }
                    placeholder=".txt / .md / .jpg / .png"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_root_anchors", "Archive Relative Root Anchors")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(extObj.relative_root_anchors)
                        ? extObj.relative_root_anchors
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "relative_root_anchors", next)
                    }
                    placeholder={t("schema_studio_ph_root_anchors", "Data / plugins / scripts")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>
              </div>

              <SchemaToggleRow
                label={t(
                  "schema_studio_preserve_aux_assets",
                  "Preserve Auxiliary Companion Assets"
                )}
                description={t(
                  "schema_studio_preserve_aux_assets_desc",
                  "Keeps sidecar meshes, textures, sounds, and data files bundled alongside primary {Mod} files during intake and deployment."
                )}
                checked={extObj.preserve_auxiliary_assets !== false}
                onChange={(val) =>
                  updateNestedField("extensions", "preserve_auxiliary_assets", val)
                }
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_cache_files", "Purgeable Cache Files")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={Array.isArray(extObj.cache_files) ? extObj.cache_files : []}
                    onChange={(next) => updateNestedField("extensions", "cache_files", next)}
                    placeholder={t("schema_studio_ph_cache_files", "shader_cache.bin")}
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_twin_exts", "Paired Twin File Extensions")}
                  </label>
                  <TwinExtensionGroupsBuilder
                    groups={
                      Array.isArray(extObj.twin_extensions) ? extObj.twin_extensions : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "twin_extensions", next)
                    }
                  />
                </div>
              </div>

              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_ext_labels", "Extension Badge Labels")}
                </label>
                <KeyValueMapBuilder
                  record={extObj.labels || {}}
                  onChange={(next) => updateNestedField("extensions", "labels", next)}
                  keyPlaceholder={t("schema_studio_ph_ext_key", ".bin / .dll")}
                  valPlaceholder={t("schema_studio_ph_ext_val", "MODULE / PLUGIN")}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_magic_bytes", "Extension Magic Byte Signatures (Hex)")}
                  </label>
                  <KeyValueMapBuilder
                    record={extObj.magic_bytes || {}}
                    onChange={(next) => updateNestedField("extensions", "magic_bytes", next)}
                    keyPlaceholder={t("schema_studio_ph_ext_key", ".bin / .dll")}
                    valPlaceholder="504B0304"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ext_parsers", "Extension Parser Bindings")}
                  </label>
                  <KeyValueMapBuilder
                    record={extObj.parsers || {}}
                    onChange={(next) => updateNestedField("extensions", "parsers", next)}
                    keyPlaceholder={t("schema_studio_ph_ext_key", ".bin / .dll")}
                    valPlaceholder="binary_chunk_index"
                  />
                </div>
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={`${t("schema_studio_sec_routes", "Install Routes")} (${routesArr.length})`}
            icon={t("icon_alt_route", "alt_route")}
            headerAction={
              <ActionButton
                variant="accent"
                icon={t("icon_add", "add")}
                onClick={() => {
                  const defaultExt = (extObj.supported && extObj.supported[0]) || ".bin";
                  const nextRoute = {
                    id: `route_${routesArr.length + 1}`,
                    label: t("schema_studio_default_route_label", "Custom Install Route"),
                    extensions: [defaultExt],
                    folder_match: "",
                    target_root: "live_path",
                    target_subdir: "",
                    preserve_vanilla: true,
                  };
                  updateField("install_routes", [...routesArr, nextRoute]);
                }}
                className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("schema_studio_add_route", "Add Install Route")}
              </ActionButton>
            }
          >
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
              {routesArr.map((route, idx) => (
                <div
                  key={`${route.id || idx}-${idx}`}
                  className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3.5 min-w-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-[var(--accent)] font-mono truncate">
                      {`#${idx + 1} • ${route.id || "route"}`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateField(
                          "install_routes",
                          routesArr.filter((_, i) => i !== idx)
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
                        {t("schema_studio_route_id", "Route ID")}
                      </label>
                      <input
                        type="text"
                        value={route.id ?? ""}
                        onChange={(e) => {
                          const next = [...routesArr];
                          next[idx] = { ...route, id: e.target.value };
                          updateField("install_routes", next);
                        }}
                        className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_route_label", "Route Label")}
                      </label>
                      <input
                        type="text"
                        value={route.label ?? ""}
                        onChange={(e) => {
                          const next = [...routesArr];
                          next[idx] = { ...route, label: e.target.value };
                          updateField("install_routes", next);
                        }}
                        className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_route_target_root", "Target Root")}
                      </label>
                      <CustomDropdown
                        disableTint={true}
                        value={route.target_root ?? "live_path"}
                        onChange={(v: string[]) => {
                          const next = [...routesArr];
                          next[idx] = { ...route, target_root: v[0] || "live_path" };
                          updateField("install_routes", next);
                        }}
                        options={[
                          {
                            id: "live_path",
                            label: t("schema_studio_route_root_live", "Game Install Root"),
                          },
                          {
                            id: "mods_path",
                            label: t("schema_studio_route_root_mods", "Active {Mods} Folder"),
                          },
                          {
                            id: "docs_path",
                            label: t("schema_studio_route_root_docs", "User Saves & Data Root"),
                          },
                        ]}
                      />
                    </div>

                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_route_target_subdir", "Target Subfolder")}
                      </label>
                      <input
                        type="text"
                        value={route.target_subdir ?? ""}
                        onChange={(e) => {
                          const next = [...routesArr];
                          next[idx] = { ...route, target_subdir: e.target.value };
                          updateField("install_routes", next);
                        }}
                        placeholder="e.g. scripts or bin/x64/plugins (Blank = Root)"
                        className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 min-w-0">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("schema_studio_route_folder_match", "Source Folder Match")}
                    </label>
                    <input
                      type="text"
                      value={route.folder_match ?? ""}
                      onChange={(e) => {
                        const next = [...routesArr];
                        next[idx] = { ...route, folder_match: e.target.value };
                        updateField("install_routes", next);
                      }}
                      placeholder={t("schema_studio_ph_folder_match", "e.g. scripts / plugins / movies")}
                      className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 min-w-0">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("schema_studio_route_extensions", "Routed Extensions")}
                    </label>
                    <StringListBuilder
                      items={Array.isArray(route.extensions) ? route.extensions : []}
                      onChange={(nextExts) => {
                        const next = [...routesArr];
                        next[idx] = { ...route, extensions: nextExts };
                        updateField("install_routes", next);
                      }}
                      placeholder={t("schema_studio_ph_route_ext_clean", ".dll / .so / .bin / .lua")}
                      addButtonLabel={t("add", "Add")}
                    />
                  </div>

                  <SchemaToggleRow
                    label={t(
                      "schema_studio_route_preserve_vanilla",
                      "Backup & Preserve Vanilla Files"
                    )}
                    checked={route.preserve_vanilla !== false}
                    onChange={(val) => {
                      const next = [...routesArr];
                      next[idx] = { ...route, preserve_vanilla: val };
                      updateField("install_routes", next);
                    }}
                  />
                </div>
              ))}
            </div>
          </UniversalGroup>
        </div>
      )}

      {/* =====================================================================
          TAB 3: LOAD ORDER, CONFLICT RADAR & LAB VERIFICATION
         ===================================================================== */}
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
              </div>

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
                {priorityTiers.map((tier, idx) => (
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
                          priorityTiers.filter((_, i) => i !== idx)
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
                  {conflictAnalyzersArr.map((analyzer, idx) => {
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
                                conflictAnalyzersArr.filter((_, i) => i !== idx)
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
              {exceptionLogs.map((matcher, idx) => {
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
                          exceptionLogs.filter((_, i) => i !== idx)
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
    </div>
  );
}
