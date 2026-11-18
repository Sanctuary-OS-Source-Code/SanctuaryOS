import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  SidePanel,
  PanelHeaderButton,
  DashboardStatTile,
  SidePanelFilterBar,
  EmptyState,
  VAULT_CHIP_CLASS,
  HoverTooltip,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import { useStore } from "../store";
import { getActiveGameClient } from "../supabase";
import { isDesktop, isLinuxDesktop } from "../utils/envUtils";
import { scrollToLandingSection } from "../utils/routingUtils";
import {
  GlobalCommandPaletteProps,
  CommandCategory,
  CommandHotkeyMap,
  ControllerBindingMap,
  DEFAULT_HOTKEYS,
  DEFAULT_CONTROLLER_BINDINGS,
  HOTKEYS_STORAGE_KEY,
  GAMEPAD_STORAGE_KEY,
  AUTO_KEYBOARD_STORAGE_KEY,
  getAutoOpenKeyboardPref,
  getCommandHotkeys,
  getControllerBindings,
  formatGamepadCombo,
  formatKeyboardEventCombo,
  matchesKeyboardCombo,
  isEditableElementFocused,
  scrollActiveViewport,
  CommandItem,
  scoreFuzzyMatch,
} from "./command-palette/hotkeysAndSpatialNav";
export * from "./command-palette/hotkeysAndSpatialNav";

import { useCommandPaletteItems } from "./command-palette/useCommandPaletteItems";
import { useCommandPaletteGamepad } from "./command-palette/useCommandPaletteGamepad";
export function GlobalCommandPalette({
  onInspectMod,
  onToggleModInBlueprint,
  onEquipBlueprint,
  onQuickLaunch,
  onRunRadarSweep,
  onOpenDropzone,
  onTriggerFullBackup,
  onTriggerPrePatchSnapshot,
  onOpenNotifications,
  onOpenMasonProfile,
  onOpenDefcon,
  onTriggerShelter,
  onOpenCitizenTickets,
}: GlobalCommandPaletteProps) {
  const { t, activeLang, setActiveLang, lexiconMeta } = useLexicon();
  const { activeThemeId, setActiveThemeId, CORE_THEMES, customThemes, gameThemes } = useTheme();

  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);
  const modList = useStore((state) => state.modList);
  const playSets = useStore((state) => state.playSets);
  const activeSetName = useStore((state) => state.activeSetName);
  const vaultPath = useStore((state) => state.vaultPath);
  const shelterActive = useStore((state) => state.shelterActive);
  const userRole = useStore((state) => state.userRole);
  const osRole = useStore((state) => state.osRole);
  const isConfigured = useStore((state) => state.isConfigured);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const marketTab = useStore((state) => state.marketTab);
  const setMarketTab = useStore((state) => state.setMarketTab);
  const cwMainTab = useStore((state) => state.cwMainTab);
  const setCwMainTab = useStore((state) => state.setCwMainTab);
  const setCwSelectedFile = useStore((state) => state.setCwSelectedFile);
  const masonActiveTab = useStore((state) => state.masonActiveTab);
  const setMasonActiveTab = useStore((state) => state.setMasonActiveTab);
  const architectActiveTab = useStore((state) => state.architectActiveTab);
  const setArchitectActiveTab = useStore((state) => state.setArchitectActiveTab);
  const oversightActiveTab = useStore((state) => state.oversightActiveTab);
  const setOversightActiveTab = useStore((state) => state.setOversightActiveTab);
  const wayfinderActiveTab = useStore((state) => state.wayfinderActiveTab);
  const setWayfinderActiveTab = useStore((state) => state.setWayfinderActiveTab);
  const keepersActiveTab = useStore((state) => state.keepersActiveTab);
  const setKeepersActiveTab = useStore((state) => state.setKeepersActiveTab);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<CommandCategory>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [autoOpenKeyboard, setAutoOpenKeyboard] = useState<boolean>(() =>
    getAutoOpenKeyboardPref()
  );

  // Hotkeys & Controller / Steam Deck Bindings
  const [hotkeys, setHotkeys] = useState<CommandHotkeyMap>(() => getCommandHotkeys());
  const [controllerBindings, setControllerBindings] = useState<ControllerBindingMap>(() =>
    getControllerBindings()
  );
  const [recordingHotkeyField, setRecordingHotkeyField] = useState<keyof CommandHotkeyMap | null>(
    null
  );
  const [recordingPadField, setRecordingPadField] = useState<keyof ControllerBindingMap | null>(
    null
  );
  const [connectedGamepadName, setConnectedGamepadName] = useState<string | null>(null);

  // Cloud / Local Masons & Workbench Config Files
  const [masonsRegistry, setMasonsRegistry] = useState<any[]>([]);
  const [workbenchPaths, setWorkbenchPaths] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const lastDomWheelAtRef = useRef<number>(0);
  const lastTouchAtRef = useRef<number>(0);

  const toggleAutoOpenKeyboard = useCallback((nextVal?: boolean) => {
    setAutoOpenKeyboard((prev) => {
      const next = typeof nextVal === "boolean" ? nextVal : !prev;
      try {
        localStorage.setItem(AUTO_KEYBOARD_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  const triggerSteamOsk = useCallback(() => {
    if (isLinuxDesktop()) {
      invoke("open_steam_osk").catch(() => {});
    }
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
  }, []);

  const updateHotkeys = useCallback((next: CommandHotkeyMap) => {
    setHotkeys(next);
    try {
      localStorage.setItem(HOTKEYS_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("sanctuary-hotkeys-updated", { detail: next }));
    } catch {}
  }, []);

  const updateControllerBindings = useCallback((next: ControllerBindingMap) => {
    setControllerBindings(next);
    try {
      localStorage.setItem(GAMEPAD_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const openPalette = useCallback((initialTab?: CommandCategory, openControls?: boolean) => {
    if (initialTab) setActiveTab(initialTab);
    setIsControlsOpen(Boolean(openControls));
    setIsOpen(true);
    setSelectedIndex(0);
    if (getAutoOpenKeyboardPref() && !openControls && isLinuxDesktop()) {
      invoke("open_steam_osk").catch(() => {});
    }
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);
  }, []);

  const closePalette = useCallback(() => {
    setIsOpen(false);
    setIsControlsOpen(false);
    setRecordingHotkeyField(null);
    setRecordingPadField(null);
  }, []);

  // Load Masons & Workbench files when palette opens
  useEffect(() => {
    if (!isOpen) return;

    const client = getActiveGameClient();
    if (client) {
      client
        .from("masons")
        .select("id, name, bio, is_verified, followers_count")
        .limit(200)
        .then(
          ({ data }) => {
            if (Array.isArray(data)) {
              setMasonsRegistry(data);
            }
          },
          () => {}
        );
    }

    if (isDesktop() && vaultPath && vaultPath !== "web") {
      invoke<string[]>("get_workbench_files", { vaultPath })
        .then((files) => {
          if (Array.isArray(files)) {
            setWorkbenchPaths(files);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, vaultPath]);

  // Keyboard listener for recording or executing global hotkeys & Steam Deck Desktop Mode bindings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (recordingPadField) {
        e.preventDefault();
        e.stopPropagation();
        const combo = formatKeyboardEventCombo(e, true);
        if (combo) {
          updateControllerBindings({
            ...controllerBindings,
            [recordingPadField]: `KEY:${combo}`,
          });
          setConnectedGamepadName((prev) => prev || "Steam Deck Controller");
          setRecordingPadField(null);
        }
        return;
      }

      if (recordingHotkeyField) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          setRecordingHotkeyField(null);
          return;
        }
        const combo = formatKeyboardEventCombo(e);
        if (combo) {
          updateHotkeys({ ...hotkeys, [recordingHotkeyField]: combo });
          setRecordingHotkeyField(null);
        }
        return;
      }

      const matchesToggleKey =
        matchesKeyboardCombo(e, hotkeys.togglePalette) ||
        (controllerBindings.togglePalette.startsWith("KEY:") &&
          matchesKeyboardCombo(e, controllerBindings.togglePalette, true));

      if (matchesToggleKey) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen((prev) => {
          const next = !prev;
          if (next) {
            setSelectedIndex(0);
            if (getAutoOpenKeyboardPref() && isLinuxDesktop()) {
              invoke("open_steam_osk").catch(() => {});
            }
            window.setTimeout(() => {
              inputRef.current?.focus();
              inputRef.current?.select();
            }, 40);
          } else {
            setIsControlsOpen(false);
          }
          return next;
        });
        return;
      }

      const st = padStateRef.current;
      if (st.isOpen && !isEditableElementFocused()) {
        if (
          st.controllerBindings.openKeyboard?.startsWith("KEY:") &&
          matchesKeyboardCombo(e, st.controllerBindings.openKeyboard, true)
        ) {
          e.preventDefault();
          e.stopPropagation();
          triggerSteamOsk();
          return;
        }
        if (
          st.controllerBindings.closePalette.startsWith("KEY:") &&
          matchesKeyboardCombo(e, st.controllerBindings.closePalette, true)
        ) {
          e.preventDefault();
          e.stopPropagation();
          if (st.isControlsOpen) {
            setIsControlsOpen(false);
          } else {
            st.closePalette();
          }
          return;
        }
        if (
          st.controllerBindings.nextTab.startsWith("KEY:") &&
          matchesKeyboardCombo(e, st.controllerBindings.nextTab, true)
        ) {
          e.preventDefault();
          e.stopPropagation();
          const order: CommandCategory[] = ["all", "views", "vault", "actions"];
          setActiveTab((prev) => order[(order.indexOf(prev) + 1) % order.length]);
          return;
        }
        if (
          st.controllerBindings.prevTab.startsWith("KEY:") &&
          matchesKeyboardCombo(e, st.controllerBindings.prevTab, true)
        ) {
          e.preventDefault();
          e.stopPropagation();
          const order: CommandCategory[] = ["all", "views", "vault", "actions"];
          setActiveTab((prev) => order[(order.indexOf(prev) - 1 + order.length) % order.length]);
          return;
        }
        if (
          !st.isControlsOpen &&
          st.controllerBindings.executeItem.startsWith("KEY:") &&
          matchesKeyboardCombo(e, st.controllerBindings.executeItem, true)
        ) {
          e.preventDefault();
          e.stopPropagation();
          const target = st.filteredItems[st.selectedIndex];
          if (target) target.onSelect();
          return;
        }
        if (
          !st.isControlsOpen &&
          st.controllerBindings.secondaryAction.startsWith("KEY:") &&
          matchesKeyboardCombo(e, st.controllerBindings.secondaryAction, true)
        ) {
          e.preventDefault();
          e.stopPropagation();
          const target = st.filteredItems[st.selectedIndex];
          if (target?.secondaryAction) {
            target.secondaryAction.onClick({ stopPropagation: () => {} } as React.MouseEvent);
          }
          return;
        }
      }

      if (!st.isOpen && !isEditableElementFocused()) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "PageDown" || e.key === "PageUp") {
          const delta =
            e.key === "ArrowDown"
              ? 110
              : e.key === "ArrowUp"
              ? -110
              : e.key === "PageDown"
              ? 420
              : -420;
          if (scrollActiveViewport(delta)) {
            e.preventDefault();
            return;
          }
        }
      }

      if (isDesktop()) {
        if (matchesKeyboardCombo(e, hotkeys.quickLaunch)) {
          e.preventDefault();
          e.stopPropagation();
          onQuickLaunch();
          return;
        }
        if (matchesKeyboardCombo(e, hotkeys.radarSweep)) {
          e.preventDefault();
          e.stopPropagation();
          onRunRadarSweep();
          return;
        }
        if (matchesKeyboardCombo(e, hotkeys.openDropzone)) {
          e.preventDefault();
          e.stopPropagation();
          onOpenDropzone();
          return;
        }
      }
    };

    const handleCustomOpen = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const requestedTab = detail?.tab as CommandCategory | undefined;
      const openControls = Boolean(detail?.openControls);
      openPalette(requestedTab, openControls);
    };

    const handleCustomClose = () => {
      closePalette();
    };

    const handleGlobalTouch = () => {
      lastTouchAtRef.current = Date.now();
    };

    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.defaultPrevented) return;
      lastDomWheelAtRef.current = Date.now();

      // Never intercept or alter wheel events synthesized during or immediately after a touchscreen gesture
      if (Date.now() - lastTouchAtRef.current < 450) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const modeScale = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 360 : 1;
      const dx = e.deltaX * modeScale;
      const dy = e.deltaY * modeScale;

      // Let horizontally scrollable carousels handle horizontal wheel events natively
      const horizEl = target.closest<HTMLElement>(".sa-stat-tile-carousel");
      if (horizEl && horizEl.scrollWidth > horizEl.clientWidth + 2 && Math.abs(dx) > Math.abs(dy)) {
        return;
      }

      // Only convert pure horizontal wheel events (e.g. SteamOS Desktop Mode horizontal wheel binding)
      const effectiveDelta = dy !== 0 ? dy : dx;
      if (effectiveDelta === 0) return;

      // Walk up from target to find the closest vertically scrollable container
      let curr: HTMLElement | null = target;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        if (curr.scrollHeight > curr.clientHeight + 2) {
          const style = window.getComputedStyle(curr);
          if (style.overflowY === "auto" || style.overflowY === "scroll") {
            const canScrollUp = effectiveDelta < 0 && curr.scrollTop > 0;
            const canScrollDown =
              effectiveDelta > 0 && curr.scrollTop + curr.clientHeight < curr.scrollHeight - 1;

            if (canScrollUp || canScrollDown) {
              // When e.deltaY !== 0, let the browser's native smooth scroll handle it untouched;
              // only manually apply scrollTop when converting a pure horizontal wheel event (e.deltaY === 0)
              if (e.deltaY === 0 && e.deltaX !== 0) {
                curr.scrollTop += effectiveDelta;
                e.preventDefault();
              }
              return;
            }
          }
        }
        curr = curr.parentElement;
      }

      // Fallback only when cursor is over non-scrolling chrome (Sidebar, TitleBar, margins)
      if (scrollActiveViewport(effectiveDelta)) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("touchstart", handleGlobalTouch, { passive: true });
    window.addEventListener("touchmove", handleGlobalTouch, { passive: true });
    window.addEventListener("touchend", handleGlobalTouch, { passive: true });
    window.addEventListener("wheel", handleGlobalWheel, { passive: false });
    window.addEventListener("sanctuary-open-command-palette", handleCustomOpen);
    window.addEventListener("sanctuary-close-command-palette", handleCustomClose);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("touchstart", handleGlobalTouch);
      window.removeEventListener("touchmove", handleGlobalTouch);
      window.removeEventListener("touchend", handleGlobalTouch);
      window.removeEventListener("wheel", handleGlobalWheel);
      window.removeEventListener("sanctuary-open-command-palette", handleCustomOpen);
      window.removeEventListener("sanctuary-close-command-palette", handleCustomClose);
    };
  }, [
    hotkeys,
    controllerBindings,
    recordingHotkeyField,
    recordingPadField,
    updateHotkeys,
    updateControllerBindings,
    openPalette,
    closePalette,
    onQuickLaunch,
    onRunRadarSweep,
    onOpenDropzone,
  ]);

  const activeBlueprintModsSet = useMemo(() => {
    const set = new Set<string>();
    if (!isOpen) return set;
    const currentSet = (playSets || []).find(
      (ps: any) => String(ps?.name || "").toLowerCase() === String(activeSetName || "").toLowerCase()
    );
    if (currentSet && Array.isArray(currentSet.mods)) {
      for (const m of currentSet.mods) {
        const raw = typeof m === "string" ? m : m?.name || m?.path || "";
        const clean = (raw.split(/[\\/]/).pop() || raw).toLowerCase();
        if (clean) set.add(clean);
      }
    }
    return set;
  }, [isOpen, playSets, activeSetName]);

  const navigateToLandingTab = useCallback(
    (tabId: string) => {
      setView("landing");
      window.setTimeout(() => scrollToLandingSection(tabId), 50);
      closePalette();
    },
    [setView, closePalette]
  );

  const navigateToView = useCallback(
    (targetView: string) => {
      setView(targetView);
      closePalette();
    },
    [setView, closePalette]
  );

  const navigateToSettingsTab = useCallback(
    (tabId: string) => {
      try {
        localStorage.setItem("sanctuary_settings_tab", tabId);
      } catch {}
      setView("settings");
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("navigateSettings", { detail: { tab: tabId } }));
      }, 40);
      closePalette();
    },
    [setView, closePalette]
  );

  const navigateToVaultSubTab = useCallback(
    (equipFilterId: string) => {
      setView("vault");
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("sanctuary-vault-navigate", {
            detail: { equipFilter: equipFilterId },
          })
        );
      }, 40);
      closePalette();
    },
    [setView, closePalette]
  );

  const openConfigInWorkbench = useCallback(
    (rawFileOrPath: string, fallbackDisplayName?: string) => {
      const normalizedRaw = String(rawFileOrPath || "").replace(/\\/g, "/");
      const baseFileName = normalizedRaw.split("/").pop() || fallbackDisplayName || normalizedRaw;
      const lowerBase = baseFileName.toLowerCase();

      let resolvedFullPath = rawFileOrPath;
      const matchedWbPath = workbenchPaths.find((wb) => {
        const wbNorm = String(wb || "").replace(/\\/g, "/").toLowerCase();
        return wbNorm.endsWith(`/${lowerBase}`) || wbNorm === lowerBase;
      });

      if (matchedWbPath) {
        resolvedFullPath = matchedWbPath;
      } else if (
        vaultPath &&
        vaultPath !== "web" &&
        !normalizedRaw.includes(":") &&
        !normalizedRaw.startsWith("/")
      ) {
        const sep = vaultPath.includes("\\") ? "\\" : "/";
        const cleanVault = vaultPath.replace(/[\\/]+$/, "");
        const cleanRel = rawFileOrPath.replace(/^[\\/]+/, "").replace(/[\\/]/g, sep);
        resolvedFullPath = `${cleanVault}${sep}Mods${sep}${cleanRel}`;
      }

      const isJsonTemplate = lowerBase.endsWith(".json");
      setCwMainTab(isJsonTemplate ? "TEMPLATES" : "CONFIGS");
      setCwSelectedFile({
        name: baseFileName,
        path: resolvedFullPath,
      });
      setView("CitizensWorkbench");
      closePalette();
    },
    [workbenchPaths, vaultPath, setCwMainTab, setCwSelectedFile, setView, closePalette]
  );

  const { allItems } = useCommandPaletteItems({
    onInspectMod,
    onToggleModInBlueprint,
    onEquipBlueprint,
    onQuickLaunch,
    onRunRadarSweep,
    onOpenDropzone,
    onTriggerFullBackup,
    onTriggerPrePatchSnapshot,
    onOpenNotifications,
    onOpenMasonProfile,
    onOpenDefcon,
    onTriggerShelter,
    onOpenCitizenTickets,
    t,
    lexiconMeta,
    activeLang,
    setActiveLang,
    CORE_THEMES,
    gameThemes,
    customThemes,
    activeThemeId,
    setActiveThemeId,
    view,
    setView,
    modList,
    playSets,
    activeSetName,
    shelterActive,
    userRole,
    osRole,
    isConfigured,
    activeGameSchema,
    marketTab,
    setMarketTab,
    cwMainTab,
    setCwMainTab,
    masonActiveTab,
    setMasonActiveTab,
    architectActiveTab,
    setArchitectActiveTab,
    oversightActiveTab,
    setOversightActiveTab,
    wayfinderActiveTab,
    setWayfinderActiveTab,
    keepersActiveTab,
    setKeepersActiveTab,
    isOpen,
    setIsControlsOpen,
    masonsRegistry,
    workbenchPaths,
    closePalette,
    activeBlueprintModsSet,
    navigateToLandingTab,
    navigateToView,
    navigateToSettingsTab,
    navigateToVaultSubTab,
    openConfigInWorkbench,
  });

  const filteredItems = useMemo(() => {
    const trimmed = query.trim();
    const categoryFiltered =
      activeTab === "all" ? allItems : allItems.filter((item) => item.category === activeTab);

    if (!trimmed) {
      if (activeTab === "all") {
        const viewsSlice = categoryFiltered.filter((i) => i.category === "views").slice(0, 24);
        const actionsSlice = categoryFiltered.filter((i) => i.category === "actions").slice(0, 12);
        const vaultSlice = categoryFiltered.filter((i) => i.category === "vault").slice(0, 14);
        return [...viewsSlice, ...actionsSlice, ...vaultSlice];
      }
      return categoryFiltered.slice(0, 60);
    }

    const scored: { item: CommandItem; score: number }[] = [];
    for (const item of categoryFiltered) {
      const best = scoreFuzzyMatch(trimmed, item.title, item.subtitle, item.keywords);
      if (best > 0) {
        scored.push({ item, score: best + (item.isActive ? 15 : 0) });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 60).map((s) => s.item);
  }, [allItems, activeTab, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeTab]);

  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) {
      el.scrollIntoView({
        block: "nearest",
        behavior: isLinuxDesktop() ? "auto" : "smooth",
      });
    }
  }, [selectedIndex]);

  // Web Gamepad API + Native Linux / Steam Deck Full-OS Navigation Engine
  const {
    isPointerVisible,
    pointerPosRef,
    cursorElRef,
    padStateRef,
    navigateGridByKey,
  } = useCommandPaletteGamepad({
    isOpen,
    setIsOpen,
    activeTab,
    setActiveTab,
    selectedIndex,
    setSelectedIndex,
    isControlsOpen,
    setIsControlsOpen,
    controllerBindings,
    recordingPadField,
    setRecordingPadField,
    connectedGamepadName,
    setConnectedGamepadName,
    inputRef,
    lastDomWheelAtRef,
    lastTouchAtRef,
    updateControllerBindings,
    openPalette,
    closePalette,
    filteredItems,
  });
  useEffect(() => {
    if (!isOpen) return;
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (padStateRef.current.recordingPadField || recordingHotkeyField) return;
      const targetEl = e.target as HTMLElement | null;
      const isSearchInput = targetEl === inputRef.current;
      // When typing in search input with non-empty query, allow ArrowLeft/ArrowRight to move text caret
      if (
        isSearchInput &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        inputRef.current &&
        inputRef.current.value.length > 0
      ) {
        return;
      }
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowLeft" ||
        e.key === "Enter" ||
        e.key === "Tab" ||
        e.key === "PageDown" ||
        e.key === "PageUp" ||
        e.key === "Escape"
      ) {
        if (navigateGridByKey(e.key, e.shiftKey)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [isOpen, recordingHotkeyField, navigateGridByKey]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
      e.currentTarget.value.length > 0
    ) {
      return;
    }
    if (
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowLeft" ||
      e.key === "Enter" ||
      e.key === "Tab" ||
      e.key === "PageDown" ||
      e.key === "PageUp" ||
      e.key === "Escape"
    ) {
      if (navigateGridByKey(e.key, e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  };

  const hotkeyRows: { key: keyof CommandHotkeyMap; label: string; icon: string }[] = [
    {
      key: "togglePalette",
      label: t("cmd_palette_hk_toggle", "Toggle Command Palette"),
      icon: t("icon_terminal", "terminal"),
    },
    {
      key: "quickLaunch",
      label: t("cmd_palette_hk_launch", "Quick Launch Game"),
      icon: t("icon_rocket_launch", "rocket_launch"),
    },
    {
      key: "radarSweep",
      label: t("cmd_palette_hk_radar", "Run Conflict Radar Sweep"),
      icon: t("icon_radar", "radar"),
    },
    {
      key: "openDropzone",
      label: t("cmd_palette_hk_dropzone", "Open {Vault} Dropzone"),
      icon: t("icon_upload_file", "upload_file"),
    },
  ];

  const controllerRows: { key: keyof ControllerBindingMap; label: string; icon: string }[] = [
    {
      key: "togglePalette",
      label: t("cmd_palette_pad_toggle", "Toggle Command Palette (Chord / Button)"),
      icon: t("icon_sports_esports", "sports_esports"),
    },
    {
      key: "executeItem",
      label: t("cmd_palette_pad_execute", "Execute / Select Item"),
      icon: t("icon_keyboard_return", "keyboard_return"),
    },
    {
      key: "secondaryAction",
      label: t("cmd_palette_pad_secondary", "Secondary Action (Toggle in {Blueprint})"),
      icon: t("icon_add_circle", "add_circle"),
    },
    {
      key: "openKeyboard",
      label: t("cmd_palette_pad_keyboard", "Summon On-Screen Keyboard"),
      icon: t("icon_keyboard", "keyboard"),
    },
    {
      key: "nextTab",
      label: t("cmd_palette_pad_tab_next", "Next Filter Tab"),
      icon: t("icon_chevron_right", "chevron_right"),
    },
    {
      key: "prevTab",
      label: t("cmd_palette_pad_tab_prev", "Previous Filter Tab"),
      icon: t("icon_chevron_left", "chevron_left"),
    },
    {
      key: "closePalette",
      label: t("cmd_palette_pad_close", "Close Command Palette"),
      icon: t("icon_close", "close"),
    },
  ];

  return (
    <>
    <SidePanel
      isOpen={isOpen}
      onClose={closePalette}
      title={t("cmd_palette_title", "Command Palette")}
      subtitle={t(
        "cmd_palette_subtitle",
        "Instant Fuzzy Search Across {Vault} {Mods}, {Blueprints}, OS Views & Quick Actions"
      )}
      icon={t("icon_terminal", "terminal")}
      widthClass="w-[92vw] md:w-[680px] lg:w-[760px] max-w-4xl"
      backdropZ="z-[100040]"
      panelZ="z-[100041]"
      headerActions={
        <PanelHeaderButton
          icon={t("icon_sports_esports", "sports_esports")}
          tooltip={t("cmd_palette_controls_title", "Hotkeys & Controller Mapping")}
          isActive={isControlsOpen}
          onClick={() => setIsControlsOpen((prev) => !prev)}
        />
      }
    >
      <div className="flex flex-col gap-4 pb-8">
        {/* Search Input Box */}
        <div className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-col gap-2.5">
          <div className="relative flex items-center w-full h-11 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus-within:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-all">
            <span className="material-symbols-outlined !text-[20px] text-[var(--accent)] absolute left-3.5 pointer-events-none">
              {t("icon_search", "search")}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (isControlsOpen) setIsControlsOpen(false);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder={t(
                "cmd_palette_placeholder",
                "Search {mods}, {blueprints}, views, themes, or type a command..."
              )}
              className="w-full h-full pl-11 pr-36 bg-transparent border-none text-xs sm:text-sm font-bold text-[var(--text)] placeholder:text-[var(--subtext)] placeholder:opacity-60 outline-none"
            />
            <div className="absolute right-2.5 flex items-center gap-1.5">
              {query.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="relative w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_close", "close")}
                  </span>
                  <HoverTooltip
                    title={t("clear", "Clear")}
                    icon={t("icon_close", "close")}
                    vAlign="bottom"
                  />
                </button>
              )}
              {isLinuxDesktop() && (
                <button
                  type="button"
                  onClick={triggerSteamOsk}
                  className={`relative ${VAULT_CHIP_CLASS} cursor-pointer transition-all hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]`}
                >
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {t("icon_keyboard", "keyboard")}
                  </span>
                  <span className="hidden sm:inline">
                    {formatGamepadCombo(controllerBindings.openKeyboard || "3")}
                  </span>
                  <HoverTooltip
                    title={t("cmd_palette_pad_keyboard", "Summon On-Screen Keyboard")}
                    subtitle={t(
                      "cmd_palette_osk_tooltip_sub",
                      "Open Steam Deck OS Keyboard"
                    )}
                    icon={t("icon_keyboard", "keyboard")}
                    vAlign="bottom"
                    align="right"
                  />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsControlsOpen((prev) => !prev)}
                className={`relative ${VAULT_CHIP_CLASS} cursor-pointer transition-all hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] ${
                  isControlsOpen ? "border-[var(--accent)] text-[var(--accent)]" : ""
                }`}
              >
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {connectedGamepadName
                    ? t("icon_sports_esports", "sports_esports")
                    : t("icon_keyboard_command_key", "keyboard_command_key")}
                </span>
                <span>{hotkeys.togglePalette}</span>
                <HoverTooltip
                  title={t("cmd_palette_controls_title", "Hotkeys & Controller Mapping")}
                  subtitle={t(
                    "cmd_palette_controls_sub",
                    "Customize Keyboard Shortcuts & Gamepad / Steam Deck Input Bindings"
                  )}
                  icon={t("icon_sports_esports", "sports_esports")}
                  vAlign="bottom"
                  align="right"
                />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between px-1 text-[10px] font-bold text-[var(--subtext)] opacity-75">
            <span>
              {t("cmd_palette_hint_nav", "↑↓ Navigate • Enter Run • Tab Filter • Esc Close")}
            </span>
            <span className="tabular-nums">
              {filteredItems.length} {t("results", "Results")}
            </span>
          </div>
        </div>

        {/* Inline Hotkeys & Controller / Steam Deck Configurator */}
        {isControlsOpen && (
          <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 pb-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                    {t("icon_sports_esports", "sports_esports")}
                  </span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs sm:text-sm font-black text-[var(--text)]">
                    {t("cmd_palette_controls_title", "Hotkeys & Controller Mapping")}
                  </span>
                  <span className="text-[11px] font-medium text-[var(--subtext)] opacity-80">
                    {t(
                      "cmd_palette_controls_sub",
                      "Customize Keyboard Shortcuts & Gamepad / Steam Deck Input Bindings"
                    )}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  updateHotkeys(DEFAULT_HOTKEYS);
                  updateControllerBindings(DEFAULT_CONTROLLER_BINDINGS);
                  setRecordingHotkeyField(null);
                  setRecordingPadField(null);
                }}
                className="relative h-8 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[11px] font-black text-[var(--text)] hover:text-[var(--accent)] flex items-center gap-1.5 shrink-0 cursor-pointer transition-all"
              >
                <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                  {t("icon_restart_alt", "restart_alt")}
                </span>
                <span>{t("cmd_palette_reset_controls", "Reset Controls to Default")}</span>
              </button>
            </div>

            {/* Keyboard Shortcuts Section */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-black text-[var(--accent)] tracking-wide">
                <span className="material-symbols-outlined !text-[14px]">
                  {t("icon_keyboard", "keyboard")}
                </span>
                <span>{t("cmd_palette_keyboard_hotkeys", "Keyboard Shortcuts")}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {hotkeyRows.map((row) => {
                  const isRecording = recordingHotkeyField === row.key;
                  return (
                    <div
                      key={row.key}
                      onClick={() => {
                        setRecordingPadField(null);
                        setRecordingHotkeyField(isRecording ? null : row.key);
                      }}
                      className={`glass-surface rounded-xl p-2.5 border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                        isRecording
                          ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                          {row.icon}
                        </span>
                        <span className="text-xs font-bold text-[var(--text)] leading-snug break-words">
                          {row.label}
                        </span>
                      </div>
                      <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                        <span className="text-[10px] font-black text-[var(--accent)]">
                          {isRecording
                            ? t("cmd_palette_press_key", "Press Key Combo...")
                            : hotkeys[row.key]}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Controller & Steam Deck Mapping Section */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-black text-[var(--accent)] tracking-wide">
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_sports_esports", "sports_esports")}
                  </span>
                  <span>
                    {t("cmd_palette_controller_mapping", "Controller & Steam Deck Inputs")}
                  </span>
                </div>
                <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                  <span
                    className="material-symbols-outlined !text-[12px]"
                    style={{
                      color: connectedGamepadName ? "var(--success)" : "var(--subtext)",
                    }}
                  >
                    {connectedGamepadName
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_sensors_off", "sensors_off")}
                  </span>
                  <span className="whitespace-nowrap">
                    {connectedGamepadName
                      ? t("cmd_palette_controller_connected", "Controller Connected")
                      : t("cmd_palette_controller_none", "No Controller Detected")}
                  </span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {controllerRows.map((row) => {
                  const isRecording = recordingPadField === row.key;
                  return (
                    <div
                      key={row.key}
                      onClick={() => {
                        setRecordingHotkeyField(null);
                        setRecordingPadField(isRecording ? null : row.key);
                      }}
                      className={`glass-surface rounded-xl p-2.5 border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                        isRecording
                          ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                          {row.icon}
                        </span>
                        <span className="text-xs font-bold text-[var(--text)] leading-snug break-words">
                          {row.label}
                        </span>
                      </div>
                      <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                        <span className="text-[10px] font-black text-[var(--accent)]">
                          {isRecording
                            ? t("cmd_palette_press_button", "Press Controller Button...")
                            : formatGamepadCombo(controllerBindings[row.key])}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>

              <div
                onClick={() => toggleAutoOpenKeyboard()}
                className={`mt-1 glass-surface rounded-xl p-2.5 border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                  autoOpenKeyboard
                    ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)]"
                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`material-symbols-outlined !text-[16px] shrink-0 ${
                      autoOpenKeyboard ? "text-[var(--success)]" : "text-[var(--accent)]"
                    }`}
                  >
                    {t("icon_keyboard", "keyboard")}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-[var(--text)] leading-snug">
                      {t(
                        "cmd_palette_auto_osk_label",
                        "Auto-Open On-Screen Keyboard When Command Matrix Opens"
                      )}
                    </span>
                    <span className="text-[10px] font-medium text-[var(--subtext)] opacity-80">
                      {t(
                        "cmd_palette_auto_osk_desc",
                        "Automatically opens the quick keyboard (and Steam Deck OSK on SteamOS) when summoned"
                      )}
                    </span>
                  </div>
                </div>
                <span
                  className={`${VAULT_CHIP_CLASS} shrink-0 ${
                    autoOpenKeyboard
                      ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                      : ""
                  }`}
                >
                  <span className="material-symbols-outlined !text-[12px]">
                    {autoOpenKeyboard
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_radio_button_unchecked", "radio_button_unchecked")}
                  </span>
                  <span>
                    {autoOpenKeyboard
                      ? t("enabled", "Enabled")
                      : t("disabled", "Disabled")}
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 2x2 Category Filter Tiles (Full-Width Labels — Never Cut Off) */}
        <SidePanelFilterBar className="grid-cols-2 gap-3">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_apps", "apps")}
            label={t("all", "All")}
            active={activeTab === "all"}
            onClick={() => {
              setActiveTab("all");
              inputRef.current?.focus();
            }}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_dashboard", "dashboard")}
            label={t("cmd_palette_tab_views", "Views & Hubs")}
            active={activeTab === "views"}
            onClick={() => {
              setActiveTab("views");
              inputRef.current?.focus();
            }}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_account_balance", "account_balance")}
            label={t("cmd_palette_tab_vault", "{Vault} & {Blueprints}")}
            active={activeTab === "vault"}
            onClick={() => {
              setActiveTab("vault");
              inputRef.current?.focus();
            }}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_bolt", "bolt")}
            label={t("cmd_palette_tab_actions", "Commands & {Settings}")}
            active={activeTab === "actions"}
            onClick={() => {
              setActiveTab("actions");
              inputRef.current?.focus();
            }}
          />
        </SidePanelFilterBar>

        {/* Results Grid */}
        {filteredItems.length === 0 ? (
          <EmptyState
            icon={t("icon_search_off", "search_off")}
            title={t("cmd_palette_empty_title", "No Matching Commands or {Mods}")}
            subtitle={t(
              "cmd_palette_empty_desc",
              "Try searching for a {mod} name, {blueprint}, OS view, Chameleon theme, or system action."
            )}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={item.onSelect}
                  className={`glass-panel rounded-2xl p-3.5 border transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 group/card ${
                    isSelected
                      ? "sa-cmd-card-selected opacity-100 z-10 -translate-y-0.5"
                      : "opacity-80 hover:opacity-100 border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,rgba(255,255,255,0.3))]"
                  }`}
                >
                  {/* Top Row: Icon + Full-Width Title & Subtitle */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 glass-surface border transition-all duration-300 group-hover/card:scale-105 ${
                        isSelected
                          ? "!border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                          : "border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)]"
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined !text-[20px] ${
                          item.iconColorClass || "text-[var(--accent)]"
                        }`}
                      >
                        {item.icon}
                      </span>
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <span
                        className={`text-xs sm:text-sm font-black tracking-tight leading-snug break-words transition-colors ${
                          isSelected
                            ? "text-[var(--accent)]"
                            : "text-[var(--text)] group-hover/card:text-[var(--accent)]"
                        }`}
                      >
                        {item.title}
                      </span>
                      <span
                        className={`text-[11px] font-medium leading-snug break-words mt-0.5 transition-opacity ${
                          isSelected
                            ? "text-[var(--text)] opacity-90"
                            : "text-[var(--subtext)] opacity-80"
                        }`}
                      >
                        {item.subtitle}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Footer Row: Left Neutral Badge + Right Action Controls */}
                  <div
                    className={`flex items-center justify-between gap-2 pt-2 border-t ${
                      isSelected
                        ? "border-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                    }`}
                  >
                    <span className={VAULT_CHIP_CLASS}>
                      <span
                        className="material-symbols-outlined !text-[12px]"
                        style={{ color: item.badgeColorVar || "var(--accent)" }}
                      >
                        {item.badgeIcon}
                      </span>
                      <span>{item.badgeLabel}</span>
                    </span>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.secondaryAction && (
                        <button
                          type="button"
                          onClick={item.secondaryAction.onClick}
                          className="relative h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[10px] font-black text-[var(--text)] hover:text-[var(--accent)] flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <span
                            className="material-symbols-outlined !text-[13px]"
                            style={{
                              color: item.secondaryAction.isActive
                                ? "var(--success)"
                                : "var(--accent)",
                            }}
                          >
                            {item.secondaryAction.icon}
                          </span>
                          <span className="hidden sm:inline">
                            {item.secondaryAction.label}
                          </span>
                          <HoverTooltip
                            title={item.secondaryAction.label}
                            icon={item.secondaryAction.icon}
                            vAlign="top"
                          />
                        </button>
                      )}

                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                          isSelected
                            ? "text-[var(--accent)] opacity-100"
                            : "text-[var(--text)] opacity-65 group-hover/card:text-[var(--accent)] group-hover/card:opacity-100"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[14px]">
                          {t("icon_keyboard_return", "keyboard_return")}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SidePanel>
    {isPointerVisible &&
      typeof document !== "undefined" &&
      createPortal(
        <div
          id="sa-gamepad-cursor"
          ref={cursorElRef}
          className="sa-gamepad-cursor"
          style={{
            transform: `translate3d(${pointerPosRef.current.x}px, ${pointerPosRef.current.y}px, 0)`,
          }}
        />,
        document.getElementById("sa-portals") || document.body
      )}
    </>
  );
}

