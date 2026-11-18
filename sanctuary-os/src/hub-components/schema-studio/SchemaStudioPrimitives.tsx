import { useState, useMemo } from "react";
import { useLexicon } from "../../LexiconContext";
import { ActionButton, HoverTooltip } from "../../shared";

export const VK_KEY_LABELS: Record<number, string> = {
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

export function normalizeStringRecord(raw: any): Record<string, string> {
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

export function GlassNumberInput({
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

export function StringListBuilder({
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

export function NumberListBuilder({
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

export function TwinExtensionGroupsBuilder({
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

export function KeyValueMapBuilder({
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

export function TargetListBuilder({
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

export function SchemaToggleRow({
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
