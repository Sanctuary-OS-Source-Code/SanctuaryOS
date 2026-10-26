import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DiffEditor } from '@monaco-editor/react';
import { useLexicon } from './LexiconContext';
import { SidePanel, SidePanelHeroCard, ActionPill, HoverTooltip, PanelHeaderGroup, PanelHeaderButton, VAULT_CHIP_CLASS } from './shared';
import { useTheme } from './ThemeContext';
import { defineSanctuaryMonacoThemes, useSanctuaryMonacoTheme } from './utils/monacoTheme';
import { parseConfigContent } from './workbench/hooks/useWorkbenchEditor';
import { humanizeConfigLabel } from './workbench/WorkbenchVisualEditor';

export interface VersionTimelineProps {
  filePath: string;
  onRestore: (content: string, timestamp: number) => void;
  onClose: () => void;
  hasUnsavedChanges?: boolean;
  activeVersionTimestamp?: number | null;
  currentContent?: string;
  savedContent?: string;
  visualTemplate?: any;
  onApplySettingValue?: (dataPath: string, value: any) => void;
  onUndoAllUnsaved?: () => void;
  initialSelection?: 'unsaved' | 'latest';
}

interface VisualDiffItem {
  dataPath: string;
  key: string;
  label: string;
  categoryLabel?: string;
  defaultVal?: any;
  baseVal: any;
  currentVal: any;
  status: 'modified' | 'added' | 'removed' | 'unchanged';
  isChanged: boolean;
  canApply?: boolean;
}

const DIFF_PAGE_BATCH = 60;

const formatDisplayValue = (val: any): string => {
  if (val === undefined) return '—';
  if (val === null) return 'null';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  const str = String(val);
  return str === '' ? '""' : str;
};

export default function VersionTimeline({
  filePath,
  onRestore,
  onClose,
  hasUnsavedChanges = false,
  activeVersionTimestamp,
  currentContent = '',
  savedContent,
  visualTemplate,
  onApplySettingValue,
  onUndoAllUnsaved,
  initialSelection = 'latest',
}: VersionTimelineProps) {
  const { t } = useLexicon();
  const { currentTheme } = useTheme();
  const isLight = currentTheme.mode === 'light';
  useSanctuaryMonacoTheme(currentTheme, isLight);

  const [history, setHistory] = useState<{ timestamp: number; content: string; pinned?: boolean; name?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<'unsaved' | 'snapshot'>(
    initialSelection === 'unsaved' || (hasUnsavedChanges && savedContent !== undefined) ? 'unsaved' : 'snapshot'
  );
  const [selectedEntry, setSelectedEntry] = useState<{ timestamp: number; content: string; pinned?: boolean; name?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [editingTimestamp, setEditingTimestamp] = useState<number | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  // Diff Workspace state
  const [diffViewMode, setDiffViewMode] = useState<'visual' | 'raw'>('visual');
  const [diffOnlyChanged, setDiffOnlyChanged] = useState(true);
  const [diffSearchQuery, setDiffSearchQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(DIFF_PAGE_BATCH);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Raw Diff Editor ref & hunk navigation state
  const diffEditorRef = useRef<any>(null);
  const [rawDiffCount, setRawDiffCount] = useState(0);
  const [rawDiffIndex, setRawDiffIndex] = useState(0);

  const resolveText = (k?: string, fallback?: string) => {
    if (!k) return fallback || '';
    const tr = t(k, k);
    if (tr === `[${k}]`) return k;
    return tr;
  };

  async function togglePin(timestamp: number, pinned: boolean) {
    try {
      await invoke('toggle_pin_version', { path: filePath, timestamp, pinned });
      setHistory((prev) => {
        const next = prev.map((h) => (h.timestamp === timestamp ? { ...h, pinned } : h));
        return next.sort((a, b) => {
          const aPinned = a.pinned || false;
          const bPinned = b.pinned || false;
          if (aPinned !== bPinned) return aPinned ? -1 : 1;
          return b.timestamp - a.timestamp;
        });
      });
    } catch (e) {
      console.error('Failed to toggle pin', e);
    }
  }

  async function saveName(timestamp: number) {
    if (editingTimestamp !== timestamp) return;
    try {
      await invoke('rename_version', { path: filePath, timestamp, name: editNameValue });
      setHistory((prev) => prev.map((h) => (h.timestamp === timestamp ? { ...h, name: editNameValue } : h)));
      setSelectedEntry((prev) => (prev && prev.timestamp === timestamp ? { ...prev, name: editNameValue } : prev));
    } catch (e) {
      console.error('Failed to rename version', e);
    }
    setEditingTimestamp(null);
  }

  async function deleteVersion(timestamp: number) {
    try {
      await invoke('delete_version', { path: filePath, timestamp });
      setHistory((prev) => {
        const remaining = prev.filter((h) => h.timestamp !== timestamp);
        if (selectedEntry?.timestamp === timestamp) {
          setSelectedEntry(remaining[0] || null);
        }
        return remaining;
      });
      setConfirmDelete(null);
    } catch (e) {
      console.error('Failed to delete version', e);
    }
  }

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      try {
        const res: any = await invoke('get_file_history', { path: filePath });
        const list = res || [];
        setHistory(list);
        if (list.length > 0) {
          setSelectedEntry(list[0]);
          if (initialSelection !== 'unsaved' && !hasUnsavedChanges) {
            setSelectedMode('snapshot');
          }
        } else if (savedContent !== undefined) {
          setSelectedMode('unsaved');
        }
      } catch (err) {
        console.error('Failed to load history:', err);
      }
      setLoading(false);
    }
    fetchHistory();
  }, [filePath]);

  useEffect(() => {
    if (initialSelection === 'unsaved' && savedContent !== undefined) {
      setSelectedMode('unsaved');
    }
  }, [initialSelection, savedContent]);

  useEffect(() => {
    setVisibleLimit(DIFF_PAGE_BATCH);
  }, [diffOnlyChanged, diffSearchQuery, selectedMode, selectedEntry]);

  const detectedLanguage = useMemo(() => {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.json') || (currentContent && (currentContent.trim().startsWith('{') || currentContent.trim().startsWith('[')))) {
      return 'json';
    }
    if (lower.endsWith('.xml')) return 'xml';
    return 'ini';
  }, [filePath, currentContent]);

  const baseContent = useMemo(() => {
    if (selectedMode === 'unsaved') {
      return savedContent ?? currentContent;
    }
    return selectedEntry?.content ?? savedContent ?? currentContent;
  }, [selectedMode, savedContent, selectedEntry, currentContent]);

  const visualDiffItems = useMemo<VisualDiffItem[]>(() => {
    const baseParsed = parseConfigContent(baseContent || '', filePath);
    const currentParsed = parseConfigContent(currentContent || '', filePath);

    if (!baseParsed && !currentParsed) return [];

    const items: VisualDiffItem[] = [];
    const seenPaths = new Set<string>();

    const unwrapRoot = (obj: any) => {
      if (Array.isArray(obj) && obj.length === 1 && obj[0] && typeof obj[0] === 'object') {
        return obj[0];
      }
      return obj;
    };

    const baseRoot = unwrapRoot(baseParsed);
    const currentRoot = unwrapRoot(currentParsed);

    const isTemplateDoc =
      (baseRoot && typeof baseRoot === 'object' && !Array.isArray(baseRoot) && (Array.isArray(baseRoot.settings) || Array.isArray(baseRoot.categories) || baseRoot.template_id !== undefined)) ||
      (currentRoot && typeof currentRoot === 'object' && !Array.isArray(currentRoot) && (Array.isArray(currentRoot.settings) || Array.isArray(currentRoot.categories) || currentRoot.template_id !== undefined));

    if (isTemplateDoc) {
      const metaKeys = new Set<string>();
      if (baseRoot && typeof baseRoot === 'object') {
        Object.keys(baseRoot).forEach((k) => {
          if (k !== 'categories' && k !== 'settings') metaKeys.add(k);
        });
      }
      if (currentRoot && typeof currentRoot === 'object') {
        Object.keys(currentRoot).forEach((k) => {
          if (k !== 'categories' && k !== 'settings') metaKeys.add(k);
        });
      }

      for (const k of metaKeys) {
        const bVal = baseRoot?.[k];
        const cVal = currentRoot?.[k];
        const isAdded = bVal === undefined && cVal !== undefined;
        const isRemoved = bVal !== undefined && cVal === undefined;
        const isModified = !isAdded && !isRemoved && JSON.stringify(bVal) !== JSON.stringify(cVal);
        items.push({
          dataPath: k,
          key: k,
          label: humanizeConfigLabel(k),
          categoryLabel: t('diff_template_meta', 'Template Metadata'),
          baseVal: bVal,
          currentVal: cVal,
          status: isAdded ? 'added' : isRemoved ? 'removed' : isModified ? 'modified' : 'unchanged',
          isChanged: isAdded || isRemoved || isModified,
          canApply: !Array.isArray(baseParsed) && !Array.isArray(currentParsed),
        });
      }

      const tmplCatMap = new Map<string, string>();
      const baseCats = new Map<string, any>();
      const currCats = new Map<string, any>();
      const allCatIds = new Set<string>();

      if (Array.isArray(baseRoot?.categories)) {
        for (const c of baseRoot.categories) {
          const cid = c?.id || c?.name || c?.name_key;
          if (!cid) continue;
          baseCats.set(cid, c);
          allCatIds.add(cid);
          tmplCatMap.set(cid, resolveText(c.name_key, c.name || cid));
        }
      }
      if (Array.isArray(currentRoot?.categories)) {
        for (const c of currentRoot.categories) {
          const cid = c?.id || c?.name || c?.name_key;
          if (!cid) continue;
          currCats.set(cid, c);
          allCatIds.add(cid);
          tmplCatMap.set(cid, resolveText(c.name_key, c.name || cid));
        }
      }

      const formatCategorySummary = (c: any) => {
        if (!c) return undefined;
        const name = resolveText(c.name_key, c.name || c.id || '');
        const icon = resolveText(c.icon_key, c.icon || '');
        return icon ? `${name} (${icon})` : name;
      };

      for (const cid of allCatIds) {
        const bCat = baseCats.get(cid);
        const cCat = currCats.get(cid);
        const isAdded = !bCat && !!cCat;
        const isRemoved = !!bCat && !cCat;
        const isModified = !isAdded && !isRemoved && JSON.stringify(bCat) !== JSON.stringify(cCat);
        const catTitle = resolveText((cCat || bCat)?.name_key, (cCat || bCat)?.name || cid);
        items.push({
          dataPath: `categories.${cid}`,
          key: cid,
          label: catTitle,
          categoryLabel: t('diff_template_category', 'Template Category'),
          baseVal: formatCategorySummary(bCat),
          currentVal: formatCategorySummary(cCat),
          status: isAdded ? 'added' : isRemoved ? 'removed' : isModified ? 'modified' : 'unchanged',
          isChanged: isAdded || isRemoved || isModified,
          canApply: false,
        });
      }

      const baseSettingsMap = new Map<string, { setting: any; groupPrefix: string }>();
      const currSettingsMap = new Map<string, { setting: any; groupPrefix: string }>();
      const allSettingPaths = new Set<string>();

      const collectTemplateSettingDefs = (
        list: any[],
        targetMap: Map<string, { setting: any; groupPrefix: string }>,
        parentPath = '',
        groupPrefix = ''
      ) => {
        if (!Array.isArray(list)) return;
        for (const s of list) {
          const localPath = s?.path || s?.key;
          if (!localPath) continue;
          const dPath = parentPath && !localPath.startsWith(parentPath + '.') ? `${parentPath}.${localPath}` : localPath;
          const cleanLbl = humanizeConfigLabel(resolveText(s.label_key, s.key || localPath));
          if (s.type === 'group' && Array.isArray(s.settings)) {
            collectTemplateSettingDefs(s.settings, targetMap, dPath, cleanLbl);
            continue;
          }
          targetMap.set(dPath, { setting: s, groupPrefix });
          allSettingPaths.add(dPath);
        }
      };

      collectTemplateSettingDefs(baseRoot?.settings, baseSettingsMap);
      collectTemplateSettingDefs(currentRoot?.settings, currSettingsMap);

      const formatSettingDefSummary = (s: any) => {
        if (!s || typeof s !== 'object') return undefined;
        const parts: string[] = [];
        if (s.type) parts.push(String(s.type));
        if (s.default !== undefined && s.default !== '') {
          parts.push(`${t('type_default', 'Default')}: ${formatDisplayValue(s.default)}`);
        }
        if (s.category) {
          parts.push(tmplCatMap.get(s.category) || String(s.category));
        }
        if (s.min !== undefined || s.max !== undefined) {
          parts.push(`${s.min ?? '—'}..${s.max ?? '—'}`);
        }
        if (Array.isArray(s.options) && s.options.length > 0) {
          parts.push(`${s.options.length} opts`);
        }
        return parts.join(' • ') || s.key || '—';
      };

      for (const sPath of allSettingPaths) {
        const bEntry = baseSettingsMap.get(sPath);
        const cEntry = currSettingsMap.get(sPath);
        const bSet = bEntry?.setting;
        const cSet = cEntry?.setting;
        const activeSet = cSet || bSet;
        const groupPrefix = (cEntry || bEntry)?.groupPrefix || '';
        const rawLabel = resolveText(activeSet?.label_key, activeSet?.key || sPath);
        const cleanLabel = humanizeConfigLabel(rawLabel);

        const isAdded = !bSet && !!cSet;
        const isRemoved = !!bSet && !cSet;
        const isModified = !isAdded && !isRemoved && JSON.stringify(bSet) !== JSON.stringify(cSet);

        items.push({
          dataPath: `settings.${sPath}`,
          key: activeSet?.key || sPath,
          label: groupPrefix ? `${groupPrefix} › ${cleanLabel}` : cleanLabel,
          categoryLabel: activeSet?.category
            ? tmplCatMap.get(activeSet.category) || activeSet.category
            : t('diff_template_setting', 'Template Setting'),
          defaultVal: activeSet?.default,
          baseVal: formatSettingDefSummary(bSet),
          currentVal: formatSettingDefSummary(cSet),
          status: isAdded ? 'added' : isRemoved ? 'removed' : isModified ? 'modified' : 'unchanged',
          isChanged: isAdded || isRemoved || isModified,
          canApply: false,
        });
      }

      return items;
    }

    const categoryMap = new Map<string, string>();
    if (Array.isArray(visualTemplate?.categories)) {
      for (const cat of visualTemplate.categories) {
        if (cat?.id) {
          categoryMap.set(cat.id, resolveText(cat.name_key, cat.name || cat.id));
        }
      }
    }

    const walkTemplateSettings = (settingsList: any[], parentPath = '', groupPrefix = '') => {
      if (!Array.isArray(settingsList)) return;
      for (const s of settingsList) {
        const localPath = s?.path || s?.key;
        if (!localPath) continue;
        const dataPath = parentPath && !localPath.startsWith(parentPath + '.') ? `${parentPath}.${localPath}` : localPath;
        const rawLabel = resolveText(s.label_key, s.key || localPath);
        const cleanLabel = humanizeConfigLabel(rawLabel);

        if (s.type === 'group' && Array.isArray(s.settings)) {
          walkTemplateSettings(s.settings, dataPath, cleanLabel);
          continue;
        }

        seenPaths.add(dataPath);
        const baseVal = baseParsed ? dataPath.split('.').reduce((o: any, i: string) => o?.[i], baseParsed) : undefined;
        const currentVal = currentParsed ? dataPath.split('.').reduce((o: any, i: string) => o?.[i], currentParsed) : undefined;

        const isAdded = baseVal === undefined && currentVal !== undefined;
        const isRemoved = baseVal !== undefined && currentVal === undefined;
        const isModified = !isAdded && !isRemoved && JSON.stringify(baseVal) !== JSON.stringify(currentVal);
        const isChanged = isAdded || isRemoved || isModified;

        items.push({
          dataPath,
          key: s.key || localPath,
          label: groupPrefix ? `${groupPrefix} › ${cleanLabel}` : cleanLabel,
          categoryLabel: s.category ? categoryMap.get(s.category) || s.category : undefined,
          defaultVal: s.default,
          baseVal,
          currentVal,
          status: isAdded ? 'added' : isRemoved ? 'removed' : isModified ? 'modified' : 'unchanged',
          isChanged,
          canApply: true,
        });
      }
    };

    if (Array.isArray(visualTemplate?.settings)) {
      walkTemplateSettings(visualTemplate.settings);
    }

    const collectRawLeafPaths = (obj: any, prefix = '', targetSet = new Set<string>()) => {
      if (!obj || typeof obj !== 'object') return targetSet;
      if (Array.isArray(obj)) {
        if (prefix) targetSet.add(prefix);
        return targetSet;
      }
      for (const k of Object.keys(obj)) {
        const nextPath = prefix ? `${prefix}.${k}` : k;
        const val = obj[k];
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
          collectRawLeafPaths(val, nextPath, targetSet);
        } else {
          targetSet.add(nextPath);
        }
      }
      return targetSet;
    };

    const allRawPaths = new Set<string>();
    collectRawLeafPaths(baseParsed, '', allRawPaths);
    collectRawLeafPaths(currentParsed, '', allRawPaths);

    for (const dataPath of allRawPaths) {
      if (seenPaths.has(dataPath)) continue;
      seenPaths.add(dataPath);

      const baseVal = baseParsed ? dataPath.split('.').reduce((o: any, i: string) => o?.[i], baseParsed) : undefined;
      const currentVal = currentParsed ? dataPath.split('.').reduce((o: any, i: string) => o?.[i], currentParsed) : undefined;

      const isAdded = baseVal === undefined && currentVal !== undefined;
      const isRemoved = baseVal !== undefined && currentVal === undefined;
      const isModified = !isAdded && !isRemoved && JSON.stringify(baseVal) !== JSON.stringify(currentVal);
      const isChanged = isAdded || isRemoved || isModified;

      const lastKey = dataPath.split('.').pop() || dataPath;
      items.push({
        dataPath,
        key: lastKey,
        label: humanizeConfigLabel(lastKey),
        categoryLabel: dataPath.includes('.') ? dataPath.substring(0, dataPath.lastIndexOf('.')) : undefined,
        baseVal,
        currentVal,
        status: isAdded ? 'added' : isRemoved ? 'removed' : isModified ? 'modified' : 'unchanged',
        isChanged,
        canApply: true,
      });
    }

    return items;
  }, [baseContent, currentContent, filePath, visualTemplate, t]);

  const changedItemsCount = useMemo(
    () => visualDiffItems.filter((item) => item.isChanged).length,
    [visualDiffItems]
  );

  const filteredDiffItems = useMemo(() => {
    let list = visualDiffItems;
    if (diffOnlyChanged) {
      list = list.filter((i) => i.isChanged);
    }
    if (diffSearchQuery.trim()) {
      const q = diffSearchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          i.dataPath.toLowerCase().includes(q) ||
          (i.categoryLabel && i.categoryLabel.toLowerCase().includes(q)) ||
          formatDisplayValue(i.baseVal).toLowerCase().includes(q) ||
          formatDisplayValue(i.currentVal).toLowerCase().includes(q)
      );
    }
    return list;
  }, [visualDiffItems, diffOnlyChanged, diffSearchQuery]);

  const visibleDiffItems = useMemo(
    () => filteredDiffItems.slice(0, visibleLimit),
    [filteredDiffItems, visibleLimit]
  );

  useEffect(() => {
    if (visibleLimit >= filteredDiffItems.length) return;
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleLimit((prev) => Math.min(filteredDiffItems.length, prev + DIFF_PAGE_BATCH));
        }
      },
      { rootMargin: '320px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleLimit, filteredDiffItems.length]);

  const jumpToRawDiff = useCallback((direction: 'next' | 'prev') => {
    const diffEd = diffEditorRef.current;
    if (!diffEd) return;
    const changes: any[] = diffEd.getLineChanges?.() || [];
    if (changes.length === 0) return;

    setRawDiffCount(changes.length);
    setRawDiffIndex((prevIdx) => {
      const nextIdx =
        direction === 'next'
          ? (prevIdx + 1) % changes.length
          : (prevIdx - 1 + changes.length) % changes.length;
      const targetChange = changes[nextIdx];
      const modEd = diffEd.getModifiedEditor?.();
      if (modEd && targetChange) {
        const line =
          targetChange.modifiedStartLineNumber > 0
            ? targetChange.modifiedStartLineNumber
            : Math.max(1, targetChange.originalStartLineNumber || 1);
        modEd.revealLineInCenter(line);
        modEd.setPosition({ lineNumber: line, column: 1 });
        modEd.focus();
      }
      return nextIdx;
    });
  }, []);

  const latestTimestamp = history.length > 0 ? Math.max(...history.map((h) => h.timestamp)) : 0;
  const currentActiveTs = activeVersionTimestamp || latestTimestamp;

  const filteredHistory = useMemo(() => {
    return history.filter((entry) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const d = new Date(entry.timestamp * 1000);
      const nameStr = (entry.name || '').toLowerCase();
      return (
        nameStr.includes(q) ||
        d.toLocaleDateString().toLowerCase().includes(q) ||
        d.toLocaleTimeString().toLowerCase().includes(q)
      );
    });
  }, [history, searchQuery]);

  const isRawIdentical = (baseContent || '') === (currentContent || '');

  return (
    <SidePanel
      isOpen={true}
      title={t('btn_timeline', 'Version Timeline')}
      subtitle={filePath.split(/[\\/]/).pop() || filePath}
      onClose={onClose}
      icon={t('icon_history', 'history')}
      iconColorClass="theme-text-accent"
      isResizable={true}
      defaultWidth={1180}
      noBackdropDim={true}
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t('icon_tune', 'tune')}
            tooltip={t('diff_mode_visual', 'Visual Diff')}
            isActive={diffViewMode === 'visual'}
            onClick={() => setDiffViewMode('visual')}
          />
          <PanelHeaderButton
            icon={t('icon_code', 'code')}
            tooltip={t('diff_mode_raw', 'Raw Code Diff')}
            isActive={diffViewMode === 'raw'}
            onClick={() => setDiffViewMode('raw')}
          />
        </PanelHeaderGroup>
      }
    >
      <div
        className="flex flex-col gap-4 w-full h-full min-h-0 relative z-10 p-2"
        style={
          {
            color: currentTheme.text,
            '--glass-outer-shadow': '0 0 #0000',
            '--glass-nested-shadow': '0 0 #0000',
            '--glass-surface-outer-shadow': '0 0 #0000',
          } as React.CSSProperties
        }
      >
        <SidePanelHeroCard
          icon={t('icon_history', 'history')}
          overline={t('btn_timeline', 'Version Timeline')}
          title={filePath.split(/[\\/]/).pop() || filePath}
          description={
            selectedMode === 'unsaved'
              ? t('timeline_unsaved_desc', 'Comparing live unsaved buffer against saved disk baseline.')
              : t('timeline_snapshot_desc', 'Inspecting historical snapshot differences and restore points.')
          }
          badge={`${history.length} ${t('tc_snapshots', 'Snapshots')}`}
          badgeIcon={t('icon_history', 'history')}
          variant={hasUnsavedChanges ? 'warning' : 'accent'}
        />
        <div className="flex flex-col lg:flex-row gap-4 w-full flex-1 min-h-0">
        {/* LEFT COLUMN: Working State & Snapshot Selector */}
        <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-3 min-h-0 h-full">
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t('timeline_search', 'Search snapshots...')}
          />

          <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto custom-scrollbar pr-1 pb-6 min-h-0">
            {/* Live Working State vs. Saved File Card */}
            {savedContent !== undefined && (
              <div
                onClick={() => setSelectedMode('unsaved')}
                className={`relative overflow-hidden shrink-0 p-4 rounded-2xl border flex flex-col gap-1.5 transition-all cursor-pointer ${
                  selectedMode === 'unsaved'
                    ? 'glass-panel !border-[color-mix(in_srgb,var(--accent)_60%,transparent)]'
                    : 'glass-surface border-[color-mix(in_srgb,var(--text)_8%,transparent)] opacity-65 hover:opacity-100 hover:!border-[color-mix(in_srgb,var(--text)_22%,transparent)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl glass-surface border flex items-center justify-center shrink-0 ${
                        selectedMode === 'unsaved'
                          ? 'text-[var(--accent)]'
                          : hasUnsavedChanges
                            ? 'text-[var(--warning)]'
                            : 'text-[var(--subtext)]'
                      }`}
                      style={{
                        borderColor:
                          selectedMode === 'unsaved'
                            ? 'color-mix(in srgb, var(--accent) 25%, var(--border))'
                            : hasUnsavedChanges
                              ? 'color-mix(in srgb, var(--warning) 25%, var(--border))'
                              : 'color-mix(in srgb, var(--subtext) 25%, var(--border))',
                      }}
                    >
                      <span className="material-symbols-outlined !text-[18px]">
                        {t('icon_edit_note', 'edit_note')}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-black tracking-wide truncate ${
                        selectedMode === 'unsaved' ? 'text-[var(--accent)]' : 'text-[var(--text)]'
                      }`}
                    >
                      {t('diff_unsaved_vs_saved_title', 'Current Edits vs. Saved')}
                    </span>
                  </div>
                  <span
                    className={VAULT_CHIP_CLASS}
                    style={{
                      color: hasUnsavedChanges ? 'var(--warning)' : 'var(--success)',
                      borderColor: hasUnsavedChanges
                        ? 'color-mix(in srgb, var(--warning) 35%, var(--border))'
                        : 'color-mix(in srgb, var(--success) 35%, var(--border))',
                    }}
                  >
                    <span className="material-symbols-rounded !text-[12px] shrink-0">
                      {hasUnsavedChanges
                        ? t('icon_edit_note', 'edit_note')
                        : t('icon_check_circle', 'check_circle')}
                    </span>
                    {hasUnsavedChanges
                      ? t('unsaved', 'Unsaved')
                      : t('diff_in_sync', 'In Sync')}
                  </span>
                </div>
                <span className="text-[10px] text-[var(--subtext)] opacity-75 leading-relaxed">
                  {t('diff_unsaved_vs_saved_sub', 'Compare current unsaved edits against the last saved file')}
                </span>
              </div>
            )}

            {/* Historical Snapshots List */}
            {loading && (
              <div className="shrink-0 flex flex-col items-center justify-center h-36 opacity-50 gap-3">
                <span className="material-symbols-outlined animate-spin">{t('icon_sync', 'sync')}</span>
                <div className="text-[10px] capitalize font-black tracking-widest">
                  {t('timeline_loading', 'Loading history...')}
                </div>
              </div>
            )}

            {!loading && history.length === 0 && (
              <div className="shrink-0 flex flex-col items-center justify-center h-36 opacity-40 gap-3 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] p-4">
                <span className="material-symbols-outlined">{t('icon_history_toggle_off', 'history_toggle_off')}</span>
                <div className="text-[10px] capitalize font-black tracking-widest max-w-[200px] text-center">
                  {t('timeline_empty', 'No saved snapshots yet')}
                </div>
              </div>
            )}

            {!loading && history.length > 0 && filteredHistory.length === 0 && (
              <div className="shrink-0 flex flex-col items-center justify-center h-36 opacity-40 gap-3">
                <span className="material-symbols-outlined">{t('icon_search_off', 'search_off')}</span>
                <div className="text-[10px] capitalize font-black tracking-widest max-w-[200px] text-center">
                  {t('search_empty', 'No matching snapshots')}
                </div>
              </div>
            )}

            {!loading &&
              filteredHistory.map((entry) => {
                const isSelected = selectedMode === 'snapshot' && selectedEntry?.timestamp === entry.timestamp;
                return (
                  <div
                    key={entry.timestamp}
                    onClick={() => {
                      setSelectedEntry(entry);
                      setSelectedMode('snapshot');
                    }}
                    className={`relative overflow-hidden shrink-0 p-4 rounded-2xl border flex flex-col gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'glass-panel !border-[color-mix(in_srgb,var(--accent)_60%,transparent)]'
                        : 'glass-surface border-[color-mix(in_srgb,var(--text)_8%,transparent)] opacity-65 hover:opacity-100 hover:!border-[color-mix(in_srgb,var(--text)_22%,transparent)]'
                    }`}
                  >
                    <div className="flex justify-between items-center w-full gap-2">
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {entry.pinned && (
                            <span className="material-symbols-outlined !text-[13px] text-[var(--accent)] shrink-0">
                              {t('icon_push_pin', 'push_pin')}
                            </span>
                          )}
                          {editingTimestamp === entry.timestamp ? (
                            <input
                              autoFocus
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              onBlur={() => saveName(entry.timestamp)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveName(entry.timestamp);
                                else if (e.key === 'Escape') setEditingTimestamp(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="bg-transparent border-b border-[var(--accent)] text-xs font-black tracking-wider outline-none text-[var(--text)] w-full placeholder:opacity-30"
                              placeholder={t('rename_snapshot', 'Rename snapshot...')}
                            />
                          ) : (
                            <span
                              className={`text-xs font-black tracking-wide cursor-text hover:opacity-100 flex items-center gap-1.5 group min-w-0 ${
                                isSelected ? 'text-[var(--accent)]' : 'text-[var(--text)]'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTimestamp(entry.timestamp);
                                setEditNameValue(entry.name || '');
                              }}
                            >
                              <span className="truncate block">
                                {entry.name || t('unnamed_snapshot', 'Unnamed Snapshot')}
                              </span>
                              <span className="material-symbols-outlined !text-[13px] opacity-0 group-hover:opacity-60 transition-opacity">
                                {t('icon_edit', 'edit')}
                              </span>
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-bold font-mono tracking-wider text-[var(--subtext)] opacity-65 flex items-center gap-2">
                          <span>{new Date(entry.timestamp * 1000).toLocaleDateString()}</span>
                          <span>{new Date(entry.timestamp * 1000).toLocaleTimeString()}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {entry.timestamp === currentActiveTs && !searchQuery && (
                          <span
                            className={VAULT_CHIP_CLASS}
                            style={{
                              color: 'var(--accent)',
                              borderColor: 'color-mix(in srgb, var(--accent) 35%, var(--border))',
                            }}
                          >
                            <span className="material-symbols-rounded !text-[12px] shrink-0">
                              {t('icon_schedule', 'schedule')}
                            </span>
                            {t('active', 'Latest')}
                          </span>
                        )}
                        <div className="flex items-center glass-surface !rounded-full p-0.5 gap-0.5">
                          {!entry.pinned &&
                            (confirmDelete === entry.timestamp ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDelete(null);
                                  }}
                                  className="w-6.5 h-6.5 rounded-full flex items-center justify-center text-[var(--text)] opacity-75 hover:opacity-100 cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[13px]">
                                    {t('icon_close', 'close')}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteVersion(entry.timestamp);
                                  }}
                                  className="w-6.5 h-6.5 rounded-full flex items-center justify-center text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[13px]">
                                    {t('icon_delete', 'delete')}
                                  </span>
                                </button>
                              </>
                            ) : (
                              <div className="relative flex">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDelete(entry.timestamp);
                                  }}
                                  className="w-6.5 h-6.5 rounded-full flex items-center justify-center text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] transition-all cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t('icon_delete', 'delete')}
                                  </span>
                                </button>
                                <HoverTooltip title={t('delete', 'Delete')} />
                              </div>
                            ))}
                          <div className="relative flex">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePin(entry.timestamp, !entry.pinned);
                              }}
                              className={`w-6.5 h-6.5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                entry.pinned
                                  ? 'text-[var(--accent)] opacity-100'
                                  : 'text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[14px]">
                                {t('icon_push_pin', 'push_pin')}
                              </span>
                            </button>
                            <HoverTooltip title={t('pin', 'Pin Snapshot')} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* RIGHT COLUMN: Unified ActionPill Filter Bar + Diff View */}
        <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0 h-full overflow-hidden">
          <div className="shrink-0">
            <ActionPill
              className="w-full"
              searchQuery={diffSearchQuery}
              setSearchQuery={setDiffSearchQuery}
              searchPlaceholder={t('diff_search_settings', 'Search settings...')}
              rightContent={
                <div className="flex items-center gap-2 px-3 h-full py-2">
                  {diffViewMode === 'visual' ? (
                    <div className="relative flex">
                      <button
                        type="button"
                        onClick={() => setDiffOnlyChanged(!diffOnlyChanged)}
                        className={`h-8 px-3 rounded-full text-[10px] font-bold tracking-wider glass-surface border transition-all flex items-center gap-1.5 cursor-pointer ${
                          diffOnlyChanged
                            ? '!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]'
                            : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]'
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[14px]">
                          {t('icon_track_changes', 'track_changes')}
                        </span>
                        <span>
                          {diffOnlyChanged
                            ? `${changedItemsCount} ${t('diff_status_modified', 'Changed')}`
                            : t('cat_all', 'All Settings')}
                        </span>
                      </button>
                      <HoverTooltip
                        title={
                          diffOnlyChanged
                            ? t('cat_all', 'All Settings')
                            : t('diff_changed_only', 'Changed Only')
                        }
                      />
                    </div>
                  ) : (
                    !isRawIdentical && (
                      <div className="flex items-center gap-1.5">
                        {rawDiffCount > 0 && (
                          <span
                            className={`${VAULT_CHIP_CLASS} font-mono`}
                            style={{
                              color: 'var(--accent)',
                              borderColor: 'color-mix(in srgb, var(--accent) 35%, var(--border))',
                            }}
                          >
                            <span className="material-symbols-rounded !text-[12px] shrink-0">
                              {t('icon_difference', 'difference')}
                            </span>
                            {rawDiffIndex + 1}/{rawDiffCount}
                          </span>
                        )}
                        <div className="relative flex">
                          <button
                            type="button"
                            onClick={() => jumpToRawDiff('prev')}
                            className="w-8 h-8 rounded-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              {t('icon_keyboard_arrow_up', 'keyboard_arrow_up')}
                            </span>
                          </button>
                          <HoverTooltip title={t('diff_prev_change', 'Previous Change')} />
                        </div>
                        <button
                          type="button"
                          onClick={() => jumpToRawDiff('next')}
                          className="h-8 px-3 rounded-full glass-surface border !border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_65%,transparent)] text-[10px] font-bold text-[var(--accent)] flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <span>{t('diff_next_change', 'Next Change')}</span>
                          <span className="material-symbols-outlined !text-[15px]">
                            {t('icon_keyboard_arrow_down', 'keyboard_arrow_down')}
                          </span>
                        </button>
                      </div>
                    )
                  )}

                  {/* Clean Liquid Glass Revert / Restore Action */}
                  {selectedMode === 'unsaved' && hasUnsavedChanges && onUndoAllUnsaved && (
                    <div className="relative flex">
                      <button
                        type="button"
                        onClick={() => onUndoAllUnsaved()}
                        className="h-8 px-3 rounded-full glass-surface border !border-[color-mix(in_srgb,var(--warning)_42%,transparent)] hover:!border-[color-mix(in_srgb,var(--warning)_65%,transparent)] text-[10px] font-bold text-[var(--warning)] flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[14px]">{t('icon_undo', 'undo')}</span>
                        <span>{t('workbench_undo_all_unsaved', 'Revert Edits')}</span>
                      </button>
                    </div>
                  )}

                  {selectedMode === 'snapshot' && selectedEntry && !isRawIdentical && (
                    confirmRestore === selectedEntry.timestamp ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmRestore(null)}
                          className="h-8 px-3 rounded-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-bold text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
                        >
                          {t('cancel', 'Cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onRestore(selectedEntry.content, selectedEntry.timestamp);
                            setConfirmRestore(null);
                            onClose();
                          }}
                          className="h-8 px-3.5 rounded-full glass-surface border !border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)] text-[10px] font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <span className="material-symbols-outlined !text-[14px]">{t('icon_check', 'check')}</span>
                          <span>{t('confirm_restore', 'Confirm Restore')}</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRestore(selectedEntry.timestamp)}
                        className="h-8 px-3.5 rounded-full glass-surface border !border-[color-mix(in_srgb,var(--accent)_42%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_65%,transparent)] text-[var(--accent)] text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[14px]">{t('icon_restore', 'restore')}</span>
                        <span>{t('restore_btn', 'Restore Snapshot')}</span>
                      </button>
                    )
                  )}
                </div>
              }
            />
          </div>

          {/* VISUAL DIFF MODE */}
          {diffViewMode === 'visual' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2.5 min-h-0 pb-6">
              {filteredDiffItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-8 opacity-60 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <span className="material-symbols-outlined !text-4xl text-[var(--text)] opacity-80">
                    {t('icon_check_circle', 'check_circle')}
                  </span>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black tracking-wide text-[var(--text)]">
                      {t('diff_no_changes_title', 'No Differences Detected')}
                    </span>
                    <span className="text-[11px] text-[var(--subtext)] max-w-[360px]">
                      {t('diff_no_changes_desc', 'The selected version is identical to your current editor content.')}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  {visibleDiffItems.map((item) => {
                    const baseLabel =
                      selectedMode === 'unsaved'
                        ? t('btn_saved', 'Saved')
                        : t('diff_snapshot_label', 'Snapshot');
                    const baseStr = formatDisplayValue(item.baseVal);
                    const currStr = formatDisplayValue(item.currentVal);
                    const isLongValue =
                      baseStr.length > 28 ||
                      currStr.length > 28 ||
                      baseStr.length + currStr.length > 44 ||
                      baseStr.includes('\n') ||
                      currStr.includes('\n');
                    const showApplyButton =
                      item.canApply !== false &&
                      item.isChanged &&
                      item.baseVal !== undefined &&
                      Boolean(onApplySettingValue);

                    return (
                      <div
                        key={item.dataPath}
                        className={`shrink-0 rounded-2xl border px-4 py-3 flex flex-col gap-2.5 transition-colors overflow-hidden ${
                          item.isChanged
                            ? 'glass-panel border-[color-mix(in_srgb,var(--text)_16%,transparent)]'
                            : 'glass-surface border-[color-mix(in_srgb,var(--text)_8%,transparent)] opacity-75'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 w-full min-w-0">
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="text-xs font-black text-[var(--text)] break-words leading-snug">
                                {item.label}
                                <HoverTooltip title={item.label} />
                              </span>
                              {item.isChanged && (
                                <span
                                  className={VAULT_CHIP_CLASS}
                                  style={{
                                    color:
                                      item.status === 'added'
                                        ? 'var(--success)'
                                        : item.status === 'removed'
                                          ? 'var(--danger)'
                                          : 'var(--warning)',
                                    borderColor:
                                      item.status === 'added'
                                        ? 'color-mix(in srgb, var(--success) 35%, var(--border))'
                                        : item.status === 'removed'
                                          ? 'color-mix(in srgb, var(--danger) 35%, var(--border))'
                                          : 'color-mix(in srgb, var(--warning) 35%, var(--border))',
                                  }}
                                >
                                  <span className="material-symbols-rounded !text-[12px] shrink-0">
                                    {item.status === 'added'
                                      ? t('icon_add_circle', 'add_circle')
                                      : item.status === 'removed'
                                        ? t('icon_remove_circle', 'remove_circle')
                                        : t('icon_edit_note', 'edit_note')}
                                  </span>
                                  {item.status === 'added'
                                    ? t('staging_btn_added', 'Added')
                                    : item.status === 'removed'
                                      ? t('diff_status_removed', 'Removed')
                                      : t('diff_status_modified', 'Changed')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-[10px] font-semibold text-[var(--subtext)] opacity-75">
                              {item.categoryLabel && <span className="break-words">{item.categoryLabel}</span>}
                              {item.categoryLabel && item.defaultVal !== undefined && <span>&bull;</span>}
                              {item.defaultVal !== undefined && (
                                <span className="font-mono break-all">
                                  {t('type_default', 'Default')}: {formatDisplayValue(item.defaultVal)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 max-w-[58%] min-w-0">
                            {!isLongValue && (
                              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] min-w-0 max-w-full">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-75 shrink-0">
                                    {baseLabel}:
                                  </span>
                                  <span className="text-xs font-mono font-bold text-[var(--subtext)] break-all">
                                    {baseStr}
                                  </span>
                                </div>
                                <span className="text-xs text-[var(--subtext)] opacity-50 shrink-0">&rarr;</span>
                                <span className="text-xs font-mono font-black text-[var(--text)] break-all">
                                  {currStr}
                                </span>
                              </div>
                            )}

                            {/* Per-Setting Apply / Undo Button */}
                            {showApplyButton && (
                              <div className="relative flex shrink-0">
                                <button
                                  type="button"
                                  onClick={() => onApplySettingValue!(item.dataPath, item.baseVal)}
                                  className={`w-8 h-8 rounded-full glass-surface border flex items-center justify-center transition-all cursor-pointer ${
                                    selectedMode === 'unsaved'
                                      ? '!border-[color-mix(in_srgb,var(--warning)_42%,transparent)] hover:!border-[color-mix(in_srgb,var(--warning)_65%,transparent)] text-[var(--warning)]'
                                      : '!border-[color-mix(in_srgb,var(--accent)_42%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_65%,transparent)] text-[var(--accent)]'
                                  }`}
                                >
                                  <span className="material-symbols-outlined !text-[15px]">
                                    {selectedMode === 'unsaved'
                                      ? t('icon_undo', 'undo')
                                      : t('icon_restore', 'restore')}
                                  </span>
                                </button>
                                <HoverTooltip
                                  title={`${
                                    selectedMode === 'unsaved'
                                      ? t('diff_undo_value', 'Undo to Saved')
                                      : t('diff_apply_value', 'Restore This Value')
                                  }: ${baseStr.length > 60 ? baseStr.slice(0, 57) + '...' : baseStr}`}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {isLongValue && (
                          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-2 px-3.5 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] w-full min-w-0">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-70">
                                {baseLabel}
                              </span>
                              <span className="text-[11px] font-mono font-bold text-[var(--subtext)] [overflow-wrap:anywhere] leading-relaxed">
                                {baseStr}
                              </span>
                            </div>
                            <span className="text-xs text-[var(--subtext)] opacity-50 hidden md:inline shrink-0">
                              &rarr;
                            </span>
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent)] opacity-85">
                                {t('diff_current_label', 'Current')}
                              </span>
                              <span className="text-[11px] font-mono font-black text-[var(--text)] [overflow-wrap:anywhere] leading-relaxed">
                                {currStr}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {visibleLimit < filteredDiffItems.length && (
                    <div ref={loadMoreRef} className="shrink-0 h-8 w-full" />
                  )}
                </>
              )}
            </div>
          )}

          {/* RAW CODE DIFF MODE */}
          {diffViewMode === 'raw' && (
            <div className="monaco-wrapper flex-1 min-h-0 w-full rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <DiffEditor
                height="100%"
                language={detectedLanguage}
                theme={isLight ? 'sanctuary-glass-light' : 'sanctuary-glass-dark'}
                beforeMount={(monaco) => defineSanctuaryMonacoThemes(monaco, currentTheme)}
                onMount={(editor, monaco) => {
                  diffEditorRef.current = editor;
                  (window as any).monaco = monaco;
                  defineSanctuaryMonacoThemes(monaco, currentTheme);
                  const updateChanges = () => {
                    const changes = editor.getLineChanges?.() || [];
                    setRawDiffCount(changes.length);
                    setRawDiffIndex(0);
                  };
                  editor.onDidUpdateDiff?.(updateChanges);
                  setTimeout(updateChanges, 150);
                }}
                original={baseContent || ''}
                modified={currentContent || ''}
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  useInlineViewWhenSpaceIsLimited: false,
                  automaticLayout: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: 'var(--font-mono), Consolas, monospace',
                  padding: { top: 16, bottom: 16 },
                  scrollBeyondLastLine: false,
                  renderOverviewRuler: true,
                  hover: { enabled: 'on' as const, above: false },
                  contextmenu: false,
                }}
              />
            </div>
          )}
        </div>
        </div>
      </div>
    </SidePanel>
  );
}
