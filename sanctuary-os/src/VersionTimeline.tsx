import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DiffEditor } from '@monaco-editor/react';
import { useLexicon } from './LexiconContext';
import { SidePanel, SidePanelHeroCard, DashboardStatTile, ActionPill, HoverTooltip, PanelHeaderGroup, PanelHeaderButton, VAULT_CHIP_CLASS, EmptyState } from './shared';
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
  const [isDiffPanelOpen, setIsDiffPanelOpen] = useState<boolean>(false);
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'ingame' | 'pinned'>('all');
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

  const isInGameSnapshot = useCallback((entry?: { name?: string } | null) => {
    return Boolean(entry?.name && entry.name.includes('In-Game Engine Edit'));
  }, []);

  const isBaselineSnapshot = useCallback((entry?: { name?: string } | null) => {
    return Boolean(
      entry?.name &&
        (entry.name.includes('Pre-Game Baseline') || entry.name.includes('Initial Baseline'))
    );
  }, []);

  const getSnapshotDisplayTitle = useCallback(
    (entry?: { name?: string } | null) => {
      if (!entry) return t('cw_workbench_save', 'Workbench Save');
      if (isInGameSnapshot(entry)) return t('cw_in_game_engine_edit', 'In-Game Engine Edit');
      if (isBaselineSnapshot(entry)) return t('cw_pre_game_baseline', 'Pre-Game Baseline');
      if (entry.name && entry.name.trim()) return entry.name.trim();
      return t('cw_workbench_save', 'Workbench Save');
    },
    [isInGameSnapshot, isBaselineSnapshot, t]
  );

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

  const fetchHistory = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res: any = await invoke('get_file_history', { path: filePath });
        const list = res || [];
        setHistory(list);
        if (!silent) {
          if (list.length > 0) {
            setSelectedEntry(list[0]);
            if (initialSelection !== 'unsaved' && !hasUnsavedChanges) {
              setSelectedMode('snapshot');
            }
          } else if (savedContent !== undefined) {
            setSelectedMode('unsaved');
          }
        } else if (list.length > 0 && !selectedEntry) {
          setSelectedEntry(list[0]);
        }
      } catch (err) {
        console.error('Failed to load history:', err);
      }
      if (!silent) setLoading(false);
    },
    [filePath, initialSelection, hasUnsavedChanges, savedContent, selectedEntry]
  );

  useEffect(() => {
    fetchHistory(false);
  }, [filePath]);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    listen<any>('workbench_config_intercepted', (event) => {
      const payload = event.payload;
      if (!payload) return;
      const targetName = (filePath.split(/[\\/]/).pop() || '').toLowerCase();
      const interceptedName = String(payload.file_name || payload.path?.split(/[\\/]/).pop() || '').toLowerCase();
      if (!targetName || !interceptedName || targetName === interceptedName) {
        fetchHistory(true);
      }
    }).then((fn) => {
      unlistenFn = fn;
    });
    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, [filePath, fetchHistory]);

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
    if (lower.endsWith('.toml')) return 'ini';
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

  const inGameSnapshotCount = useMemo(
    () => history.filter((h) => isInGameSnapshot(h)).length,
    [history, isInGameSnapshot]
  );

  const pinnedSnapshotCount = useMemo(
    () => history.filter((h) => Boolean(h.pinned)).length,
    [history]
  );

  const countQuickDiffChanges = useCallback(
    (otherContent: string) => {
      if ((otherContent || '') === (currentContent || '')) return 0;
      const aParsed = parseConfigContent(otherContent || '', filePath);
      const bParsed = parseConfigContent(currentContent || '', filePath);
      if (aParsed && bParsed && typeof aParsed === 'object' && typeof bParsed === 'object') {
        const flatten = (obj: any, prefix = '', out: Record<string, string> = {}) => {
          if (!obj || typeof obj !== 'object') return out;
          for (const k of Object.keys(obj)) {
            const p = prefix ? `${prefix}.${k}` : k;
            const v = obj[k];
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              flatten(v, p, out);
            } else {
              out[p] = JSON.stringify(v);
            }
          }
          return out;
        };
        const flatA = flatten(aParsed);
        const flatB = flatten(bParsed);
        const keys = new Set([...Object.keys(flatA), ...Object.keys(flatB)]);
        let diff = 0;
        for (const k of keys) {
          if (flatA[k] !== flatB[k]) diff++;
        }
        return Math.max(1, diff);
      }
      const linesA = (otherContent || '').split(/\r?\n/);
      const linesB = (currentContent || '').split(/\r?\n/);
      const maxLen = Math.max(linesA.length, linesB.length);
      let lineDiffs = 0;
      for (let i = 0; i < maxLen; i++) {
        if (linesA[i] !== linesB[i]) lineDiffs++;
      }
      return Math.max(1, lineDiffs);
    },
    [currentContent, filePath]
  );

  const unsavedChangeCount = useMemo(() => {
    if (!hasUnsavedChanges || savedContent === undefined) return 0;
    return countQuickDiffChanges(savedContent);
  }, [hasUnsavedChanges, savedContent, countQuickDiffChanges]);

  const snapshotChangeCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const entry of history) {
      map.set(entry.timestamp, countQuickDiffChanges(entry.content));
    }
    return map;
  }, [history, countQuickDiffChanges]);

  const filteredHistory = useMemo(() => {
    return history.filter((entry) => {
      if (timelineFilter === 'ingame' && !isInGameSnapshot(entry)) return false;
      if (timelineFilter === 'pinned' && !entry.pinned) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const d = new Date(entry.timestamp * 1000);
      const nameStr = (entry.name || '').toLowerCase();
      const displayTitle = getSnapshotDisplayTitle(entry).toLowerCase();
      return (
        nameStr.includes(q) ||
        displayTitle.includes(q) ||
        d.toLocaleDateString().toLowerCase().includes(q) ||
        d.toLocaleTimeString().toLowerCase().includes(q)
      );
    });
  }, [history, timelineFilter, searchQuery, isInGameSnapshot, getSnapshotDisplayTitle]);

  const isRawIdentical = (baseContent || '') === (currentContent || '');
  const shortFileName = filePath.split(/[\\/]/).pop() || filePath;

  const openUnsavedDiff = () => {
    setSelectedMode('unsaved');
    setIsDiffPanelOpen(true);
  };

  const openSnapshotDiff = (entry: { timestamp: number; content: string; pinned?: boolean; name?: string }) => {
    setSelectedEntry(entry);
    setSelectedMode('snapshot');
    setIsDiffPanelOpen(true);
  };

  return (
    <>
      <SidePanel
        isOpen={true}
        title={t('btn_timeline', 'Version Timeline')}
        subtitle={shortFileName}
        onClose={onClose}
        icon={t('icon_history', 'history')}
        iconColorClass="theme-text-accent"
        isResizable={true}
        defaultWidth={880}
        noBackdropDim={true}
        backdropZ="z-[70000]"
        panelZ="z-[70001]"
      >
        <div
          className="flex flex-col gap-4 w-full h-full min-h-0 relative z-10 p-2 overflow-y-auto custom-scrollbar pr-2 pb-8"
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
            title={shortFileName}
            description={t(
              'cw_timeline_card_desc',
              'Select any snapshot card to inspect differences or restore configuration state.'
            )}
            badge={`${history.length} ${t('tc_snapshots', 'Snapshots')}`}
            badgeIcon={t('icon_history', 'history')}
            variant={hasUnsavedChanges ? 'warning' : 'accent'}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 shrink-0">
            <DashboardStatTile
              variant="filter"
              icon={t('icon_history', 'history')}
              label={t('cw_all_snapshots_filter', 'All Snapshots')}
              value={history.length}
              isActive={timelineFilter === 'all'}
              onClick={() => setTimelineFilter('all')}
              colorClass="text-[var(--accent)]"
            />
            <DashboardStatTile
              variant="filter"
              icon={t('icon_sports_esports', 'sports_esports')}
              label={t('cw_in_game_edits_filter', 'In-Game Edits')}
              value={inGameSnapshotCount}
              isActive={timelineFilter === 'ingame'}
              onClick={() => setTimelineFilter(timelineFilter === 'ingame' ? 'all' : 'ingame')}
              colorClass="text-[var(--warning)]"
            />
            <DashboardStatTile
              variant="filter"
              icon={t('icon_push_pin', 'push_pin')}
              label={t('cw_pinned_snapshots_filter', 'Pinned')}
              value={pinnedSnapshotCount}
              isActive={timelineFilter === 'pinned'}
              onClick={() => setTimelineFilter(timelineFilter === 'pinned' ? 'all' : 'pinned')}
              colorClass="text-[var(--accent)]"
            />
          </div>

          <div className="shrink-0">
            <ActionPill
              className="w-full"
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchPlaceholder={t('timeline_search', 'Search snapshots...')}
            />
          </div>

          <div className="flex flex-col min-h-0">
            {loading && (
              <div className="flex flex-col items-center justify-center h-48 opacity-50 gap-3">
                <span className="material-symbols-outlined animate-spin">{t('icon_sync', 'sync')}</span>
                <div className="text-[10px] capitalize font-black tracking-widest">
                  {t('timeline_loading', 'Loading history...')}
                </div>
              </div>
            )}

            {!loading && history.length === 0 && savedContent === undefined && (
              <EmptyState
                icon={t('icon_history_toggle_off', 'history_toggle_off')}
                title={t('timeline_empty', 'No saved snapshots yet')}
                minHeightClass="min-h-[220px]"
                className="py-8"
              />
            )}

            {!loading && history.length > 0 && filteredHistory.length === 0 && timelineFilter !== 'all' && (
              <EmptyState
                icon={t('icon_search_off', 'search_off')}
                title={t('search_empty', 'No matching snapshots')}
                minHeightClass="min-h-[220px]"
                className="py-8"
              />
            )}

            {!loading && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
                {/* Card 0: Live Working State vs. Saved File Card */}
                {savedContent !== undefined && timelineFilter === 'all' && (
                  <div
                    onClick={openUnsavedDiff}
                    className={`group relative overflow-hidden p-4 rounded-2xl border flex flex-col justify-between gap-3 transition-all cursor-pointer ${
                      isDiffPanelOpen && selectedMode === 'unsaved'
                        ? 'glass-panel !border-[color-mix(in_srgb,var(--accent)_55%,transparent)]'
                        : 'glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                            hasUnsavedChanges ? 'text-[var(--warning)]' : 'text-[var(--success)]'
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[20px]">
                            {hasUnsavedChanges
                              ? t('icon_edit_note', 'edit_note')
                              : t('icon_check_circle', 'check_circle')}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="text-[13px] font-black tracking-normal text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate pr-1">
                            {t('diff_unsaved_vs_saved_title', 'Current Edits vs. Saved')}
                          </span>
                          <span className="text-[10.5px] text-[var(--subtext)] opacity-75 line-clamp-1">
                            {t(
                              'diff_unsaved_vs_saved_sub',
                              'Compare current unsaved edits against the last saved file'
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className={VAULT_CHIP_CLASS}>
                          <span
                            className={`material-symbols-rounded !text-[12px] shrink-0 ${
                              hasUnsavedChanges ? 'text-[var(--warning)]' : 'text-[var(--success)]'
                            }`}
                          >
                            {hasUnsavedChanges
                              ? t('icon_edit_note', 'edit_note')
                              : t('icon_check_circle', 'check_circle')}
                          </span>
                          <span>
                            {hasUnsavedChanges ? t('unsaved', 'Unsaved') : t('diff_in_sync', 'In Sync')}
                          </span>
                        </span>
                        {unsavedChangeCount > 0 && (
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                              {t('icon_track_changes', 'track_changes')}
                            </span>
                            <span className="tabular-nums">
                              {unsavedChangeCount} {t('diff_status_modified', 'Changed')}
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasUnsavedChanges && onUndoAllUnsaved && (
                          <div className="relative flex">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onUndoAllUnsaved();
                              }}
                              className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--warning)] flex items-center justify-center transition-all cursor-pointer"
                            >
                              <span className="material-symbols-outlined !text-[14px]">{t('icon_undo', 'undo')}</span>
                            </button>
                            <HoverTooltip title={t('workbench_undo_all_unsaved', 'Revert Edits')} />
                          </div>
                        )}
                        <div className="relative flex">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openUnsavedDiff();
                            }}
                            className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] group-hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              {t('icon_difference', 'difference')}
                            </span>
                          </button>
                          <HoverTooltip title={t('cw_inspect_diff', 'Inspect Diff')} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Historical Snapshot Cards */}
                {filteredHistory.map((entry) => {
                  const isSelected =
                    isDiffPanelOpen && selectedMode === 'snapshot' && selectedEntry?.timestamp === entry.timestamp;
                  const isInGame = isInGameSnapshot(entry);
                  const isBaseline = isBaselineSnapshot(entry);
                  const displayTitle = getSnapshotDisplayTitle(entry);
                  const changeCount = snapshotChangeCounts.get(entry.timestamp) || 0;
                  const isEntryIdentical = (entry.content || '') === (currentContent || '');
                  const dateObj = new Date(entry.timestamp * 1000);

                  return (
                    <div
                      key={entry.timestamp}
                      onClick={() => openSnapshotDiff(entry)}
                      className={`group relative overflow-hidden p-4 rounded-2xl border flex flex-col justify-between gap-3 transition-all cursor-pointer ${
                        isSelected
                          ? 'glass-panel !border-[color-mix(in_srgb,var(--accent)_60%,transparent)]'
                          : 'glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                      }`}
                    >
                      {/* Top Row: Icon Well + Title/Timestamp */}
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                              isInGame
                                ? 'text-[var(--warning)]'
                                : isBaseline
                                  ? 'text-[var(--info)]'
                                  : 'text-[var(--accent)]'
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[20px]">
                              {isInGame
                                ? t('icon_sports_esports', 'sports_esports')
                                : isBaseline
                                  ? t('icon_shield', 'shield')
                                  : t('icon_history', 'history')}
                            </span>
                          </div>

                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
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
                                  className="bg-transparent border-b border-[var(--accent)] text-[13px] font-black tracking-tight outline-none text-[var(--text)] w-full placeholder:opacity-30"
                                  placeholder={t('rename_snapshot', 'Rename snapshot...')}
                                />
                              ) : (
                                <span
                                  className="text-[13px] font-black tracking-normal text-[var(--text)] group-hover:text-[var(--accent)] transition-colors flex items-center gap-1.5 min-w-0 flex-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTimestamp(entry.timestamp);
                                    setEditNameValue(entry.name || '');
                                  }}
                                >
                                  <span className="truncate block pr-1">{displayTitle}</span>
                                  <span className="material-symbols-outlined !text-[13px] text-[var(--subtext)] opacity-0 group-hover:opacity-65 transition-opacity shrink-0">
                                    {t('icon_edit', 'edit')}
                                  </span>
                                </span>
                              )}
                            </div>

                            <span className="text-[10.5px] font-mono font-bold tracking-wider text-[var(--subtext)] opacity-70 flex items-center gap-1.5">
                              <span>{dateObj.toLocaleDateString()}</span>
                              <span>&bull;</span>
                              <span>{dateObj.toLocaleTimeString()}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Row: Concise Status Badge + Compact Icon Actions */}
                      <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className={VAULT_CHIP_CLASS}>
                            <span
                              className={`material-symbols-rounded !text-[12px] shrink-0 ${
                                changeCount > 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]'
                              }`}
                            >
                              {changeCount > 0
                                ? t('icon_track_changes', 'track_changes')
                                : t('icon_check_circle', 'check_circle')}
                            </span>
                            <span className="tabular-nums">
                              {changeCount > 0
                                ? `${changeCount} ${t('diff_status_modified', 'Changed')}`
                                : t('diff_in_sync', 'In Sync')}
                            </span>
                          </span>

                          {isInGame && (
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--warning)]">
                                {t('icon_sports_esports', 'sports_esports')}
                              </span>
                              <span>{t('cw_in_game_badge', 'In-Game Edit')}</span>
                            </span>
                          )}

                          {entry.timestamp === currentActiveTs && (
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                                {t('icon_schedule', 'schedule')}
                              </span>
                              <span>{t('latest_version_badge', 'Latest')}</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {!isEntryIdentical &&
                            (confirmRestore === entry.timestamp ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRestore(null)}
                                  className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t('icon_close', 'close')}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onRestore(entry.content, entry.timestamp);
                                    setConfirmRestore(null);
                                    onClose();
                                  }}
                                  className="w-7 h-7 rounded-lg glass-surface border !border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)] flex items-center justify-center cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t('icon_check', 'check')}
                                  </span>
                                </button>
                              </div>
                            ) : (
                              <div className="relative flex">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmRestore(entry.timestamp);
                                  }}
                                  className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t('icon_restore', 'restore')}
                                  </span>
                                </button>
                                <HoverTooltip title={t('restore_btn', 'Restore Snapshot')} />
                              </div>
                            ))}

                          <div className="relative flex">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePin(entry.timestamp, !entry.pinned);
                              }}
                              className={`w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer ${
                                entry.pinned
                                  ? 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]'
                                  : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[14px]">
                                {t('icon_push_pin', 'push_pin')}
                              </span>
                            </button>
                            <HoverTooltip title={t('pin', 'Pin Snapshot')} />
                          </div>

                          {!entry.pinned &&
                            (confirmDelete === entry.timestamp ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(null)}
                                  className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t('icon_close', 'close')}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteVersion(entry.timestamp)}
                                  className="w-7 h-7 rounded-lg glass-surface border !border-[color-mix(in_srgb,var(--danger)_45%,transparent)] flex items-center justify-center text-[var(--danger)] cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t('icon_delete', 'delete')}
                                  </span>
                                </button>
                              </div>
                            ) : (
                              <div className="relative flex">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDelete(entry.timestamp);
                                  }}
                                  className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-all cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t('icon_delete', 'delete')}
                                  </span>
                                </button>
                                <HoverTooltip title={t('delete', 'Delete')} />
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </SidePanel>

      {/* Stacked Snapshot Diff Inspector SidePanel */}
      <SidePanel
        isOpen={isDiffPanelOpen}
        title={
          selectedMode === 'unsaved'
            ? t('diff_unsaved_vs_saved_title', 'Current Edits vs. Saved')
            : getSnapshotDisplayTitle(selectedEntry)
        }
        subtitle={`${shortFileName}${
          selectedMode === 'snapshot' && selectedEntry
            ? ` • ${new Date(selectedEntry.timestamp * 1000).toLocaleString()}`
            : ''
        }`}
        onClose={() => setIsDiffPanelOpen(false)}
        icon={
          selectedMode === 'unsaved'
            ? t('icon_edit_note', 'edit_note')
            : isInGameSnapshot(selectedEntry)
              ? t('icon_sports_esports', 'sports_esports')
              : t('icon_difference', 'difference')
        }
        iconColorClass="theme-text-accent"
        isResizable={true}
        defaultWidth={980}
        noBackdropDim={true}
        backdropZ="z-[70002]"
        panelZ="z-[70003]"
        headerActions={
          <div className="flex items-center gap-2">
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

            {selectedMode === 'unsaved' && hasUnsavedChanges && onUndoAllUnsaved && (
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t('icon_undo', 'undo')}
                  tooltip={t('workbench_undo_all_unsaved', 'Revert Edits')}
                  onClick={() => onUndoAllUnsaved()}
                />
              </PanelHeaderGroup>
            )}

            {selectedMode === 'snapshot' && selectedEntry && !isRawIdentical && (
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t('icon_restore', 'restore')}
                  tooltip={t('restore_btn', 'Restore Snapshot')}
                  isActive={confirmRestore === selectedEntry.timestamp}
                  onClick={() => {
                    if (confirmRestore === selectedEntry.timestamp) {
                      onRestore(selectedEntry.content, selectedEntry.timestamp);
                      setConfirmRestore(null);
                      setIsDiffPanelOpen(false);
                      onClose();
                    } else {
                      setConfirmRestore(selectedEntry.timestamp);
                    }
                  }}
                />
              </PanelHeaderGroup>
            )}
          </div>
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
            icon={
              selectedMode === 'unsaved'
                ? t('icon_edit_note', 'edit_note')
                : isInGameSnapshot(selectedEntry)
                  ? t('icon_sports_esports', 'sports_esports')
                  : t('icon_difference', 'difference')
            }
            overline={t('cw_diff_inspector_title', 'Snapshot Diff Inspector')}
            title={
              selectedMode === 'unsaved'
                ? t('diff_unsaved_vs_saved_title', 'Current Edits vs. Saved')
                : getSnapshotDisplayTitle(selectedEntry)
            }
            description={
              selectedMode === 'unsaved'
                ? t('timeline_unsaved_desc', 'Comparing live unsaved buffer against saved disk baseline.')
                : t(
                    'cw_diff_inspector_sub',
                    'Comparing selected snapshot against current active workbench buffer'
                  )
            }
            badge={`${changedItemsCount} ${t('diff_status_modified', 'Changed')}`}
            badgeIcon={t('icon_track_changes', 'track_changes')}
            variant={
              selectedMode === 'snapshot' && isInGameSnapshot(selectedEntry)
                ? 'warning'
                : changedItemsCount > 0
                  ? 'accent'
                  : 'success'
            }
          />

          {diffViewMode === 'visual' && (
            <div className="grid grid-cols-2 gap-2.5 shrink-0">
              <DashboardStatTile
                variant="filter"
                icon={t('icon_track_changes', 'track_changes')}
                label={t('diff_changed_only', 'Changed Only')}
                value={changedItemsCount}
                isActive={diffOnlyChanged}
                onClick={() => setDiffOnlyChanged(true)}
                colorClass="text-[var(--warning)]"
              />
              <DashboardStatTile
                variant="filter"
                icon={t('icon_grid_view', 'grid_view')}
                label={t('cat_all', 'All Settings')}
                value={visualDiffItems.length}
                isActive={!diffOnlyChanged}
                onClick={() => setDiffOnlyChanged(false)}
                colorClass="text-[var(--accent)]"
              />
            </div>
          )}

          <div className="shrink-0">
            <ActionPill
              className="w-full"
              searchQuery={diffSearchQuery}
              setSearchQuery={setDiffSearchQuery}
              searchPlaceholder={t('diff_search_settings', 'Search settings...')}
              rightContent={
                diffViewMode === 'raw' && !isRawIdentical ? (
                  <div className="flex items-center gap-1.5 px-3 h-full py-2">
                    {rawDiffCount > 0 && (
                      <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                        <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                          {t('icon_difference', 'difference')}
                        </span>
                        {rawDiffIndex + 1}/{rawDiffCount}
                      </span>
                    )}
                    <div className="relative flex">
                      <button
                        type="button"
                        onClick={() => jumpToRawDiff('prev')}
                        className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer"
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
                      className="h-8 px-3 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[10px] font-bold text-[var(--text)] flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <span>{t('diff_next_change', 'Next Change')}</span>
                      <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                        {t('icon_keyboard_arrow_down', 'keyboard_arrow_down')}
                      </span>
                    </button>
                  </div>
                ) : undefined
              }
            />
          </div>

          {/* VISUAL DIFF MODE */}
          {diffViewMode === 'visual' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2.5 min-h-0 pb-6">
              {filteredDiffItems.length === 0 ? (
                <EmptyState
                  icon={t('icon_check_circle', 'check_circle')}
                  title={t('diff_no_changes_title', 'No Differences Detected')}
                  subtitle={t(
                    'diff_no_changes_desc',
                    'The selected version is identical to your current editor content.'
                  )}
                />
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
                                <span className={VAULT_CHIP_CLASS}>
                                  <span
                                    className={`material-symbols-rounded !text-[12px] shrink-0 ${
                                      item.status === 'added'
                                        ? 'text-[var(--success)]'
                                        : item.status === 'removed'
                                          ? 'text-[var(--danger)]'
                                          : 'text-[var(--warning)]'
                                    }`}
                                  >
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
                                  className={`w-8 h-8 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer ${
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
      </SidePanel>
    </>
  );
}
