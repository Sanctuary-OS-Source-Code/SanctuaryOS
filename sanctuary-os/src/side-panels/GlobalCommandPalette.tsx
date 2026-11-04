import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  SidePanel,
  PanelHeaderButton,
  DashboardStatTile,
  EmptyState,
  VAULT_CHIP_CLASS,
  ModData,
  getModIcon,
  HoverTooltip,
  countBlueprintArtifacts,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { getActiveGameClient } from "../supabase";
import { isDesktop, isLinuxDesktop } from "../utils/envUtils";
import { isRootDomain, scrollToLandingSection } from "../utils/routingUtils";

export interface GlobalCommandPaletteProps {
  onInspectMod: (mod: ModData) => void;
  onToggleModInBlueprint: (mod: ModData) => void;
  onEquipBlueprint: (setName: string) => void;
  onQuickLaunch: () => void;
  onRunRadarSweep: () => void;
  onOpenDropzone: () => void;
  onTriggerFullBackup: () => void;
  onTriggerPrePatchSnapshot: () => void;
  onOpenNotifications: () => void;
  onOpenMasonProfile?: (masonId: string, postId?: string) => void;
  onOpenDefcon?: () => void;
  onTriggerShelter?: (enable: boolean) => void;
  onOpenCitizenTickets?: () => void;
}

type CommandCategory = "all" | "views" | "vault" | "actions";

export interface CommandHotkeyMap {
  togglePalette: string;
  quickLaunch: string;
  radarSweep: string;
  openDropzone: string;
}

export interface ControllerBindingMap {
  togglePalette: string;
  executeItem: string;
  secondaryAction: string;
  nextTab: string;
  prevTab: string;
  closePalette: string;
}

export const DEFAULT_HOTKEYS: CommandHotkeyMap = {
  togglePalette: "Ctrl+K",
  quickLaunch: "Ctrl+Shift+L",
  radarSweep: "Ctrl+Shift+R",
  openDropzone: "Ctrl+Shift+D",
};

export const DEFAULT_CONTROLLER_BINDINGS: ControllerBindingMap = {
  togglePalette: "4+5", // L1 + R1 (LB + RB)
  executeItem: "0", // A / Cross
  secondaryAction: "2", // X / Square
  nextTab: "5", // R1 / RB
  prevTab: "4", // L1 / LB
  closePalette: "1", // B / Circle
};

const HOTKEYS_STORAGE_KEY = "sanctuary_cmd_hotkeys_v1";
const GAMEPAD_STORAGE_KEY = "sanctuary_cmd_gamepad_v1";

export function getCommandHotkeys(): CommandHotkeyMap {
  try {
    const raw = localStorage.getItem(HOTKEYS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_HOTKEYS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_HOTKEYS };
}

export function getControllerBindings(): ControllerBindingMap {
  try {
    const raw = localStorage.getItem(GAMEPAD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONTROLLER_BINDINGS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_CONTROLLER_BINDINGS };
}

const GAMEPAD_BUTTON_NAMES: Record<number, string> = {
  0: "A",
  1: "B",
  2: "X",
  3: "Y",
  4: "L1",
  5: "R1",
  6: "L2",
  7: "R2",
  8: "Select",
  9: "Start",
  10: "L3",
  11: "R3",
  12: "D-Pad Up",
  13: "D-Pad Down",
  14: "D-Pad Left",
  15: "D-Pad Right",
  16: "Steam",
};

export function formatGamepadCombo(combo: string): string {
  if (!combo) return "—";
  if (combo.startsWith("KEY:")) {
    return combo.slice(4) || "—";
  }
  const parts = combo
    .split("+")
    .map((p) => Number(p.trim()))
    .filter((n) => !Number.isNaN(n));
  if (parts.length === 0) return combo;
  return parts.map((idx) => GAMEPAD_BUTTON_NAMES[idx] || `#${idx}`).join(" + ");
}

const SINGLE_KEY_BINDABLE = new Set([
  "Enter",
  "Escape",
  "Backspace",
  "Tab",
  "Space",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "Insert",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

function formatKeyboardEventCombo(
  e: KeyboardEvent,
  allowAnyNonModifierKey = false
): string | null {
  const key = e.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  let normalizedKey = key.length === 1 ? key.toUpperCase() : key;
  if (normalizedKey === " ") normalizedKey = "Space";

  const isFunctionKey = /^F([1-9]|1[0-2])$/i.test(normalizedKey);
  const isBindableActionKey = SINGLE_KEY_BINDABLE.has(normalizedKey);
  if (
    parts.length === 0 &&
    !isFunctionKey &&
    !isBindableActionKey &&
    !allowAnyNonModifierKey
  ) {
    return null;
  }
  parts.push(normalizedKey);
  return parts.join("+");
}

function matchesKeyboardCombo(
  e: KeyboardEvent,
  targetCombo: string,
  allowAnyNonModifierKey = false
): boolean {
  if (!targetCombo) return false;
  const cleanTarget = targetCombo.startsWith("KEY:")
    ? targetCombo.slice(4)
    : targetCombo;
  if (!cleanTarget) return false;
  const pressed = formatKeyboardEventCombo(e, allowAnyNonModifierKey);
  if (!pressed) return false;
  return pressed.toLowerCase() === cleanTarget.toLowerCase();
}

export function isEditableElementFocused(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return Boolean(el.isContentEditable);
}

export function scrollActiveViewport(deltaY: number): boolean {
  if (typeof document === "undefined" || deltaY === 0) return false;
  const panels = Array.from(
    document.querySelectorAll<HTMLElement>(".sa-side-panel-window")
  );
  for (let i = panels.length - 1; i >= 0; i--) {
    const panel = panels[i];
    if (panel.offsetParent !== null || panel.getClientRects().length > 0) {
      const scroller = panel.querySelector<HTMLElement>(".overflow-y-auto");
      if (scroller && scroller.scrollHeight > scroller.clientHeight) {
        scroller.scrollTop += deltaY;
        return true;
      }
    }
  }
  const mainScroll = document.getElementById("sanctuary-main-scroll");
  if (mainScroll && mainScroll.scrollHeight > mainScroll.clientHeight) {
    mainScroll.scrollTop += deltaY;
    return true;
  }
  return false;
}

interface CommandItem {
  id: string;
  category: Exclude<CommandCategory, "all">;
  title: string;
  subtitle: string;
  badgeLabel: string;
  badgeIcon: string;
  badgeColorVar?: string;
  icon: string;
  iconColorClass?: string;
  keywords: string;
  isActive?: boolean;
  onSelect: () => void;
  secondaryAction?: {
    label: string;
    icon: string;
    isActive?: boolean;
    onClick: (e: React.MouseEvent) => void;
  };
}

function isSubsequenceOfInitials(queryToken: string, words: string[]): boolean {
  if (queryToken.length < 2 || queryToken.length > words.length) return false;
  let qi = 0;
  for (let wi = 0; wi < words.length && qi < queryToken.length; wi++) {
    if (words[wi].startsWith(queryToken[qi])) {
      qi++;
    }
  }
  return qi === queryToken.length;
}

function scoreSingleToken(token: string, fieldLower: string, words: string[]): number {
  if (!token || !fieldLower) return 0;

  // 1. Exact full field match
  if (fieldLower === token) return 1200;

  // 2. Exact word match
  for (let i = 0; i < words.length; i++) {
    if (words[i] === token) {
      return 1000 - Math.min(i * 15, 120);
    }
  }

  // 3. Word prefix match (e.g. "part" -> "partner", "keep" -> "keepers")
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith(token)) {
      return 850 - Math.min(i * 15, 120);
    }
  }

  // 4. Contiguous substring match inside a word or phrase (require >= 2 chars)
  if (token.length >= 2) {
    const idx = fieldLower.indexOf(token);
    if (idx !== -1) {
      return 650 - Math.min(idx * 2, 150);
    }
  }

  // 5. Word-initial acronym match (e.g. "kc" -> "Keepers Core", "ps" -> "Partner Spokes")
  if (isSubsequenceOfInitials(token, words)) {
    return 520;
  }

  return 0;
}

function scoreFuzzyMatch(query: string, title: string, subtitle: string, keywords: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 1;

  const titleLower = title.toLowerCase();
  const subLower = subtitle.toLowerCase();
  const kwLower = keywords.toLowerCase();

  // Direct phrase match boost
  if (titleLower === q) return 2500;
  if (titleLower.startsWith(q)) return 2000;
  if (titleLower.includes(q)) return 1600 - Math.min(titleLower.indexOf(q) * 2, 200);

  const queryTokens = q.split(/[\s>_/-]+/).filter(Boolean);
  if (queryTokens.length === 0) return 1;

  const titleWords = titleLower.split(/[^a-z0-9]+/).filter(Boolean);
  const subWords = subLower.split(/[^a-z0-9]+/).filter(Boolean);
  const kwWords = kwLower.split(/[^a-z0-9]+/).filter(Boolean);

  let totalScore = 0;
  for (const tok of queryTokens) {
    const tScore = scoreSingleToken(tok, titleLower, titleWords) * 1.5;
    const sScore = scoreSingleToken(tok, subLower, subWords) * 0.85;
    const kScore = scoreSingleToken(tok, kwLower, kwWords) * 0.9;
    const bestForToken = Math.max(tScore, sScore, kScore);

    // Every token in the user's query must genuinely match at least one field
    if (bestForToken <= 0) {
      return 0;
    }
    totalScore += bestForToken;
  }

  return totalScore / queryTokens.length;
}

const cleanNavLabel = (raw: any, fallback: string): string => {
  const s = String(raw || fallback || "").replace(/^[^\w{]*/, "").trim();
  return s || fallback;
};

const CONFIG_EXTENSIONS_REGEX = /\.(cfg|ini|json|txt|xml|toml|yaml|yml)$/i;

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

    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Let horizontally scrollable carousels handle their own wheel events
      const horizEl = target.closest<HTMLElement>(".sa-stat-tile-carousel, .overflow-x-auto");
      if (horizEl && horizEl.scrollWidth > horizEl.clientWidth + 2) {
        return;
      }

      // Check if target is already inside a vertically scrollable element that can scroll in this direction
      let curr: HTMLElement | null = target;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        if (curr.scrollHeight > curr.clientHeight + 2) {
          const style = window.getComputedStyle(curr);
          if (style.overflowY === "auto" || style.overflowY === "scroll") {
            // SteamOS Desktop Mode Left Trackpad often emits horizontal wheel events (deltaX != 0, deltaY == 0)
            // for vertical trackpad swipes. Convert horizontal-only wheel events into vertical scroll!
            if (e.deltaY === 0 && e.deltaX !== 0) {
              curr.scrollTop += e.deltaX;
              e.preventDefault();
            }
            return;
          }
        }
        curr = curr.parentElement;
      }

      // If cursor is over a non-scrolling region (Sidebar, TitleBar, margins) or deltaX-only trackpad scroll:
      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      if (delta !== 0 && scrollActiveViewport(delta)) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("wheel", handleGlobalWheel, { passive: false });
    window.addEventListener("sanctuary-open-command-palette", handleCustomOpen);
    window.addEventListener("sanctuary-close-command-palette", handleCustomClose);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
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

  const allItems = useMemo<CommandItem[]>(() => {
    if (!isOpen) return [];
    const items: CommandItem[] = [];
    const schemaFeatures = activeGameSchema?.features || { has_cc: true, has_saves: true };
    const isWebRootOnly = !isDesktop() && isRootDomain() && !isConfigured;
    const viewsBadge = t("cmd_palette_tab_views", "Views & Hubs");
    const actionsBadge = t("cmd_palette_tab_actions", "Commands & {Settings}");
    const subsectionDescTemplate = t("cmd_palette_subsection_desc", "Open {0} subsection");
    const makeSubDesc = (parentTitle: string, childTitle: string) =>
      subsectionDescTemplate.replace("{0}", `${parentTitle} › ${childTitle}`);

    // 1. OS Views, Hubs & Subsections
    if (!isWebRootOnly) {
      const cmdCenterTitle = t("center_title", "Command Center");
      const vaultTitle = t("vault_title", "Your {Vault}");
      const nexusTitle = t("market_title", "The {Nexus}");
      const blueprintsTitle = t("playsets_title", "{Blueprints}");
      const feedTitle = t("feed_title", "Comm-Link Feed");
      const radarTitle = t("radar_title", "Conflict Radar");
      const labTitle = t("term_lab", "Homestead {Lab}");
      const workbenchTitle = t("title_sidebar", "{Citizen}'s Workbench");
      const backupsTitle = t("term_backups", "{Backups}");
      const masonHubTitle = `${t("mason", "{Mason}")} ${t("sidebar_mason_hub", "Workshop")}`;
      const architectTitle = `${t("tab_architect", "Architect")} ${t("sidebar_architect_hub", "Console")}`;
      const oversightTitle = `${t("stat_oversight", "Oversight")} ${t("wf_tab_command", "Command")}`;
      const wayfinderTitle = `${t("sidebar_wayfinder_tools", "Wayfinder")} ${t("ui_btn_operations", "Operations")}`;

      items.push(
        {
          id: "view_dashboard",
          category: "views",
          title: cmdCenterTitle,
          subtitle: t("center_subtitle", "System Overview, Active Alerts & Workspace Telemetry"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_desktop_windows", "desktop_windows"),
          icon: t("icon_desktop_windows", "desktop_windows"),
          keywords: "dashboard command center home overview status alerts",
          isActive: view === "dashboard",
          onSelect: () => navigateToView("dashboard"),
        },
        {
          id: "view_vault",
          category: "views",
          title: vaultTitle,
          subtitle: t("bunker_subtitle", "Local {Vault}, Secured Assets & Installed {Mods}"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_account_balance", "account_balance"),
          icon: t("icon_account_balance", "account_balance"),
          keywords: "vault library mods packages files installed artifacts",
          isActive: view === "vault",
          onSelect: () => navigateToView("vault"),
        }
      );

      // Your Vault Sub-Tabs
      const vaultSubsections: { id: string; label: string; icon: string; kw: string }[] = [
        {
          id: "OVERVIEW",
          label: t("tab_overview", "Overview"),
          icon: t("icon_space_dashboard", "space_dashboard"),
          kw: "overview recent injections updates vault summary",
        },
        {
          id: "ALL",
          label: t("filter_all_vault", "Main"),
          icon: t("icon_inventory_2", "inventory_2"),
          kw: "main all mods artifacts installed vault",
        },
        {
          id: "EQUIPPED",
          label: t("filter_equipped", "In {Blueprint}"),
          icon: t("icon_check_circle", "check_circle"),
          kw: "equipped active in blueprint playset enabled",
        },
        {
          id: "UNEQUIPPED",
          label: t("filter_unequipped", "Not Equipped"),
          icon: t("icon_cancel", "cancel"),
          kw: "unequipped disabled inactive spare",
        },
        {
          id: "DEV",
          label: t("filter_dev", "Sandbox"),
          icon: t("icon_code", "code"),
          kw: "sandbox dev testing local development",
        },
        {
          id: "ARCHIVES",
          label: t("filter_archives", "Archives"),
          icon: t("icon_archive", "archive"),
          kw: "archives legacy incompatible older versions",
        },
      ];
      for (const sub of vaultSubsections) {
        items.push({
          id: `sub_vault_${sub.id}`,
          category: "views",
          title: `${vaultTitle} > ${sub.label}`,
          subtitle: makeSubDesc(vaultTitle, sub.label),
          badgeLabel: vaultTitle,
          badgeIcon: t("icon_account_balance", "account_balance"),
          icon: sub.icon,
          keywords: `${vaultTitle} ${sub.label} ${sub.kw}`,
          onSelect: () => navigateToVaultSubTab(sub.id),
        });
      }

      items.push({
        id: "view_nexus",
        category: "views",
        title: nexusTitle,
        subtitle: t("nexus_subtitle", "Verified Community {Mods}, {Masons} & {Blueprints}"),
        badgeLabel: viewsBadge,
        badgeIcon: t("icon_hub", "hub"),
        icon: t("icon_hub", "hub"),
        keywords: "nexus market browse discover download creators masons",
        isActive: view === "nexus",
        onSelect: () => navigateToView("nexus"),
      });

      // The Nexus Subsections
      const nexusSubsections: { id: string; label: string; icon: string; kw: string }[] = [
        { id: "HOME", label: t("overview", "Overview"), icon: t("icon_dashboard", "dashboard"), kw: "overview home featured" },
        { id: "MODS", label: t("term_mods", "{Mods}"), icon: t("icon_inventory_2", "inventory_2"), kw: "mods artifacts browse download" },
        { id: "BLUEPRINTS", label: t("term_blueprints", "{Blueprints}"), icon: t("icon_map", "map"), kw: "blueprints playsets modpacks" },
        { id: "MASONS", label: t("term_masons", "{Masons}"), icon: t("icon_engineering", "engineering"), kw: "masons creators authors" },
        { id: "AESTHETICS", label: t("tab_aesthetics", "Aesthetics"), icon: t("icon_palette", "palette"), kw: "aesthetics chameleons themes lexicons" },
      ];
      for (const sub of nexusSubsections) {
        items.push({
          id: `sub_nexus_${sub.id}`,
          category: "views",
          title: `${nexusTitle} > ${sub.label}`,
          subtitle: makeSubDesc(nexusTitle, sub.label),
          badgeLabel: nexusTitle,
          badgeIcon: t("icon_hub", "hub"),
          icon: sub.icon,
          keywords: `${nexusTitle} ${sub.label} ${sub.kw}`,
          isActive: view === "nexus" && marketTab === sub.id,
          onSelect: () => {
            setMarketTab(sub.id);
            navigateToView("nexus");
          },
        });
      }

      if (schemaFeatures.has_cc) {
        items.push({
          id: "view_blueprints",
          category: "views",
          title: blueprintsTitle,
          subtitle: t("playsets_subtitle", "Load Orders, Profiles & Curated {Blueprint} Manifests"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_map", "map"),
          icon: t("icon_map", "map"),
          keywords: "blueprints playsets modpacks load order profiles",
          isActive: view === "playsets",
          onSelect: () => navigateToView("playsets"),
        });
      }

      items.push(
        {
          id: "view_feed",
          category: "views",
          title: feedTitle,
          subtitle: t("feed_subtitle", "Creator Dispatches, Polls & Patch Announcements"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_satellite_alt", "satellite_alt"),
          icon: t("icon_satellite_alt", "satellite_alt"),
          keywords: "comm-link feed posts news updates social",
          isActive: view === "GlobalFeed",
          onSelect: () => navigateToView("GlobalFeed"),
        },
        {
          id: "view_radar",
          category: "views",
          title: radarTitle,
          subtitle: t("scout_subtitle", "Resource Overlaps, Duplicate Files & Load-Order Winners"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_track_changes", "track_changes"),
          icon: t("icon_track_changes", "track_changes"),
          keywords: "conflict radar duplicates collisions dbpf scout scanner",
          isActive: view === "DbpfScout",
          onSelect: () => navigateToView("DbpfScout"),
        },
        {
          id: "view_lab",
          category: "views",
          title: labTitle,
          subtitle: t("lab_subtitle", "Save-Airgapped {Mod} Testing & Exception Diagnostics"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_science", "science"),
          icon: t("icon_science", "science"),
          keywords: "homestead lab sandbox test save airgap crash exception",
          isActive: view === "lab",
          onSelect: () => navigateToView("lab"),
        },
        {
          id: "view_workbench",
          category: "views",
          title: workbenchTitle,
          subtitle: t("workbench_subtitle", "Visual Config Sliders, Monaco Diff & Version Timeline"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_design_services", "design_services"),
          icon: t("icon_design_services", "design_services"),
          keywords: "workbench config ini json cfg editor monaco diff settings",
          isActive: view === "CitizensWorkbench",
          onSelect: () => navigateToView("CitizensWorkbench"),
        }
      );

      // Citizen's Workbench Subsections
      const cwSubsections: { id: "COMMAND" | "CONFIGS" | "TEMPLATES"; label: string; icon: string; kw: string }[] = [
        { id: "COMMAND", label: cleanNavLabel(t("wf_tab_command", "Command"), "Command"), icon: t("icon_desktop_windows", "desktop_windows"), kw: "command overview workbench" },
        { id: "CONFIGS", label: t("cw_tab_configs", "Configs"), icon: t("icon_tune", "tune"), kw: "configs settings sliders ini json cfg" },
        { id: "TEMPLATES", label: cleanNavLabel(t("ql_templates", "Templates"), "Templates"), icon: t("icon_data_object", "data_object"), kw: "templates presets defaults json" },
      ];
      for (const sub of cwSubsections) {
        items.push({
          id: `sub_cw_${sub.id}`,
          category: "views",
          title: `${workbenchTitle} > ${sub.label}`,
          subtitle: makeSubDesc(workbenchTitle, sub.label),
          badgeLabel: workbenchTitle,
          badgeIcon: t("icon_design_services", "design_services"),
          icon: sub.icon,
          keywords: `${workbenchTitle} ${sub.label} ${sub.kw}`,
          isActive: view === "CitizensWorkbench" && cwMainTab === sub.id,
          onSelect: () => {
            setCwMainTab(sub.id);
            navigateToView("CitizensWorkbench");
          },
        });
      }

      if (schemaFeatures.has_saves) {
        items.push({
          id: "view_time_capsule",
          category: "views",
          title: backupsTitle,
          subtitle: t("backups_subtitle", "Zstd Snapshots, Save Rollbacks & Pre-Patch Archives"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_history", "history"),
          icon: t("icon_history", "history"),
          keywords: "time capsule backups saves restore snapshot archive",
          isActive: view === "backups",
          onSelect: () => navigateToView("backups"),
        });
      }

      // Mason Workshop & Subsections
      items.push({
        id: "view_mason_hub",
        category: "views",
        title: masonHubTitle,
        subtitle: t("mason_hub_subtitle", "Package Releases, Static Edge Auto-Push & Creator Tools"),
        badgeLabel: t("term_mason", "{Mason}"),
        badgeIcon: t("icon_construction", "construction"),
        icon: t("icon_construction", "construction"),
        keywords: "mason workshop creator studio publish sandbox static edge",
        isActive: view === "MasonHub",
        onSelect: () => navigateToView("MasonHub"),
      });

      const masonSubsections: { id: string; label: string; icon: string; kw: string }[] = [
        { id: "command_center", label: cleanNavLabel(t("wf_tab_command", "Command"), "Command"), icon: t("icon_desktop_windows", "desktop_windows"), kw: "command center overview" },
        { id: "sandbox", label: cleanNavLabel(t("term_mods", "{Mods}"), "Mods"), icon: t("icon_deployed_code", "deployed_code"), kw: "sandbox mods artifacts release publish" },
        { id: "nexus", label: cleanNavLabel(t("tab_nexus", "{Nexus}"), "Nexus"), icon: t("icon_hub", "hub"), kw: "nexus marketplace listings" },
        { id: "chameleons", label: cleanNavLabel(t("tab_aesthetics", "Aesthetics"), "Aesthetics"), icon: t("icon_palette", "palette"), kw: "aesthetics chameleons themes lexicons" },
        { id: "collections", label: cleanNavLabel(t("tab_cc", "Collections"), "Collections"), icon: t("icon_collections_bookmark", "collections_bookmark"), kw: "collections sets bundles" },
        { id: "posts", label: cleanNavLabel(t("tab_posts", "{Dispatches}"), "Dispatches"), icon: t("icon_edit_document", "edit_document"), kw: "posts dispatches transmissions blog" },
        { id: "bug_reports", label: cleanNavLabel(t("stat_bugs", "Reports"), "Reports"), icon: t("icon_bug_report", "bug_report"), kw: "bug reports issues feedback" },
      ];
      for (const sub of masonSubsections) {
        items.push({
          id: `sub_mason_${sub.id}`,
          category: "views",
          title: `${masonHubTitle} > ${sub.label}`,
          subtitle: makeSubDesc(masonHubTitle, sub.label),
          badgeLabel: masonHubTitle,
          badgeIcon: t("icon_construction", "construction"),
          icon: sub.icon,
          keywords: `${masonHubTitle} ${sub.label} ${sub.kw}`,
          isActive: view === "MasonHub" && masonActiveTab === sub.id,
          onSelect: () => {
            setMasonActiveTab(sub.id);
            navigateToView("MasonHub");
          },
        });
      }

      // Architect Console & Subsections
      if (["architect", "senior_architect", "oversight", "wayfinder", "admin"].includes(userRole)) {
        items.push({
          id: "view_architect_hub",
          category: "views",
          title: architectTitle,
          subtitle: t("architect_hub_subtitle", "{Mod} Registry, Scout Queue & Compatibility Triage"),
          badgeLabel: t("tab_architect", "Architect"),
          badgeIcon: t("icon_analytics", "analytics"),
          icon: t("icon_analytics", "analytics"),
          keywords: "architect console moderation registry scout queue mass update",
          isActive: view === "ArchitectHub",
          onSelect: () => navigateToView("ArchitectHub"),
        });

        const architectSubsections: { id: string; label: string; icon: string; kw: string }[] = [
          { id: "command_center", label: cleanNavLabel(t("wf_tab_command", "Command"), "Command"), icon: t("icon_desktop_windows", "desktop_windows"), kw: "command center overview" },
          { id: "registry", label: cleanNavLabel(t("term_mods", "{Mods}"), "Mods"), icon: t("icon_inventory_2", "inventory_2"), kw: "registry mods artifacts database" },
          { id: "queue", label: cleanNavLabel(t("tab_queue", "Scanner"), "Scanner"), icon: t("icon_search", "search"), kw: "scanner scout queue triage" },
          { id: "lab", label: cleanNavLabel(t("tab_diagnostics", "Diagnostics"), "Diagnostics"), icon: t("icon_monitor_heart", "monitor_heart"), kw: "diagnostics lab logs" },
          { id: "collections", label: cleanNavLabel(t("tab_cc", "Collections"), "Collections"), icon: t("icon_collections_bookmark", "collections_bookmark"), kw: "collections sets" },
          { id: "mason_queue", label: cleanNavLabel(t("mason", "{Mason}"), "Mason"), icon: t("icon_construction", "construction"), kw: "mason queue verification" },
          { id: "template_oversight", label: cleanNavLabel(t("ql_templates", "Templates"), "Templates"), icon: t("icon_data_object", "data_object"), kw: "templates config oversight" },
          { id: "nexus_reports", label: cleanNavLabel(t("stat_bugs", "Reports"), "Reports"), icon: t("icon_flag", "flag"), kw: "reports flags moderation" },
          { id: "support_tickets", label: cleanNavLabel(t("wf_tab_tickets", "Support"), "Support"), icon: t("icon_local_activity", "local_activity"), kw: "support tickets help" },
        ];
        for (const sub of architectSubsections) {
          items.push({
            id: `sub_architect_${sub.id}`,
            category: "views",
            title: `${architectTitle} > ${sub.label}`,
            subtitle: makeSubDesc(architectTitle, sub.label),
            badgeLabel: architectTitle,
            badgeIcon: t("icon_analytics", "analytics"),
            icon: sub.icon,
            keywords: `${architectTitle} ${sub.label} ${sub.kw}`,
            isActive: view === "ArchitectHub" && architectActiveTab === sub.id,
            onSelect: () => {
              setArchitectActiveTab(sub.id);
              navigateToView("ArchitectHub");
            },
          });
        }
      }

      // Oversight Command & Subsections
      if (["oversight", "wayfinder", "admin"].includes(userRole)) {
        items.push({
          id: "view_oversight",
          category: "views",
          title: oversightTitle,
          subtitle: t("oversight_subtitle", "Security Audits, Heuristic Signatures & Quarantine Review"),
          badgeLabel: t("stat_oversight", "Oversight"),
          badgeIcon: t("icon_security", "security"),
          icon: t("icon_security", "security"),
          keywords: "oversight command security malware heuristics audit",
          isActive: view === "Oversight",
          onSelect: () => navigateToView("Oversight"),
        });

        const oversightSubsections: { id: string; label: string; icon: string; kw: string }[] = [
          { id: "command_center", label: cleanNavLabel(t("wf_tab_command", "Command"), "Command"), icon: t("icon_desktop_windows", "desktop_windows"), kw: "command center overview" },
          { id: "oversight_comms", label: cleanNavLabel(t("wf_tab_dispatch", "Dispatch"), "Dispatch"), icon: t("icon_satellite_alt", "satellite_alt"), kw: "dispatch broadcasts announcements" },
          { id: "identities", label: cleanNavLabel(t("tab_identities", "Identity"), "Identity"), icon: t("icon_group", "group"), kw: "identity users roles citizens" },
          { id: "compliance", label: cleanNavLabel(t("tab_compliance", "Compliance"), "Compliance"), icon: t("icon_policy", "policy"), kw: "compliance policy rules" },
          { id: "malware_oversight", label: cleanNavLabel(t("rating_malware", "Malware"), "Malware"), icon: t("icon_coronavirus", "coronavirus"), kw: "malware threats quarantine signatures" },
          { id: "sanctuary_tickets", label: cleanNavLabel(t("wf_tab_tickets", "Support"), "Support"), icon: t("icon_local_activity", "local_activity"), kw: "support tickets help" },
          { id: "mass_update", label: cleanNavLabel(t("tab_mass_update", "Mass Update"), "Mass Update"), icon: t("icon_dynamic_feed", "dynamic_feed"), kw: "mass update batch patch" },
          { id: "game_versions", label: cleanNavLabel(t("tab_game_versions", "Management"), "Management"), icon: t("icon_settings", "settings"), kw: "game versions management" },
          { id: "audit_logs", label: cleanNavLabel(t("tab_audit", "Logs"), "Logs"), icon: t("icon_history", "history"), kw: "audit logs history" },
        ];
        for (const sub of oversightSubsections) {
          items.push({
            id: `sub_oversight_${sub.id}`,
            category: "views",
            title: `${oversightTitle} > ${sub.label}`,
            subtitle: makeSubDesc(oversightTitle, sub.label),
            badgeLabel: oversightTitle,
            badgeIcon: t("icon_security", "security"),
            icon: sub.icon,
            keywords: `${oversightTitle} ${sub.label} ${sub.kw}`,
            isActive: view === "Oversight" && oversightActiveTab === sub.id,
            onSelect: () => {
              setOversightActiveTab(sub.id);
              navigateToView("Oversight");
            },
          });
        }
      }

      // Wayfinder Operations & Subsections
      if (["wayfinder", "admin"].includes(userRole)) {
        items.push({
          id: "view_wayfinder",
          category: "views",
          title: wayfinderTitle,
          subtitle: t("wayfinder_subtitle", "Spoke Control, Master Schemas & Community Governance"),
          badgeLabel: t("sidebar_wayfinder_tools", "Wayfinder"),
          badgeIcon: t("icon_terminal", "terminal"),
          icon: t("icon_terminal", "terminal"),
          keywords: "wayfinder operations spoke control master schema lexicon",
          isActive: view === "WayfinderHub",
          onSelect: () => navigateToView("WayfinderHub"),
        });

        const wayfinderSubsections: { id: string; label: string; icon: string; kw: string }[] = [
          { id: "command_center", label: cleanNavLabel(t("wf_tab_command", "Command"), "Command"), icon: t("icon_desktop_windows", "desktop_windows"), kw: "command center overview" },
          { id: "wf_comms_title", label: cleanNavLabel(t("wf_tab_dispatch", "Dispatch"), "Dispatch"), icon: t("icon_satellite_alt", "satellite_alt"), kw: "dispatch broadcasts comms" },
          { id: "sanctuary_tickets", label: cleanNavLabel(t("wf_tab_tickets", "Support"), "Support"), icon: t("icon_local_activity", "local_activity"), kw: "support tickets queue" },
          { id: "identities", label: cleanNavLabel(t("tab_identities", "Identity"), "Identity"), icon: t("icon_group", "group"), kw: "identity roles citizens masons" },
          { id: "compliance", label: cleanNavLabel(t("tab_compliance", "Compliance"), "Compliance"), icon: t("icon_policy", "policy"), kw: "compliance rules moderation" },
          { id: "malware_oversight", label: cleanNavLabel(t("rating_malware", "Malware"), "Malware"), icon: t("icon_coronavirus", "coronavirus"), kw: "malware security quarantine" },
          { id: "reports", label: cleanNavLabel(t("stat_bugs", "Reports"), "Reports"), icon: t("icon_flag", "flag"), kw: "reports flags issues" },
          { id: "ide", label: cleanNavLabel(t("wf_tab_spoke_control", "Spoke Control"), "Spoke Control"), icon: t("icon_data_object", "data_object"), kw: "spoke control schema ide database" },
          { id: "chameleons", label: cleanNavLabel(t("wf_tab_spoke_aesthetics", "Spoke Aesthetics"), "Spoke Aesthetics"), icon: t("icon_palette", "palette"), kw: "spoke aesthetics chameleons themes lexicons" },
        ];
        for (const sub of wayfinderSubsections) {
          items.push({
            id: `sub_wayfinder_${sub.id}`,
            category: "views",
            title: `${wayfinderTitle} > ${sub.label}`,
            subtitle: makeSubDesc(wayfinderTitle, sub.label),
            badgeLabel: wayfinderTitle,
            badgeIcon: t("icon_terminal", "terminal"),
            icon: sub.icon,
            keywords: `${wayfinderTitle} ${sub.label} ${sub.kw}`,
            isActive: view === "WayfinderHub" && wayfinderActiveTab === sub.id,
            onSelect: () => {
              setWayfinderActiveTab(sub.id);
              navigateToView("WayfinderHub");
            },
          });
        }
      }
    }

    // Keepers Core & Subsections
    if (["core_dev", "admin", "keeper"].includes(osRole)) {
      const keepersTitle = t("sidebar_keepers_core", "Keepers Core");
      items.push({
        id: "view_keepers_core",
        category: "views",
        title: keepersTitle,
        subtitle: t("keepers_core_subtitle", "Core OS Oversight, Partner Spokes & Global Heuristics"),
        badgeLabel: keepersTitle,
        badgeIcon: t("icon_admin_panel_settings", "admin_panel_settings"),
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        keywords: "keepers core foundry global dispatch partner spokes tickets",
        isActive: view === "KeepersCore",
        onSelect: () => navigateToView("KeepersCore"),
      });

      const keepersSubsections: { id: string; label: string; icon: string; kw: string }[] = [
        { id: "command_center", label: cleanNavLabel(t("wf_tab_command", "Command"), "Command"), icon: t("icon_desktop_windows", "desktop_windows"), kw: "command center overview" },
        { id: "keepers_comms", label: cleanNavLabel(t("wf_tab_dispatch", "Dispatch"), "Dispatch"), icon: t("icon_satellite_alt", "satellite_alt"), kw: "dispatch broadcasts release notes" },
        { id: "web_directives", label: cleanNavLabel(t("keepers_tab_web_landing", "Web Landing"), "Web Landing"), icon: t("icon_public", "public"), kw: "web landing directives news legal eula" },
        { id: "active_games", label: cleanNavLabel(t("keepers_tab_partner_spokes", "Partner Spokes"), "Partner Spokes"), icon: t("icon_dns", "dns"), kw: "partner spokes games schemas audit logs applications" },
        { id: "identities", label: cleanNavLabel(t("citizen_oversight", "Citizen Oversight"), "Citizen Oversight"), icon: t("icon_group", "group"), kw: "citizen oversight identities users roles" },
        { id: "heuristics", label: cleanNavLabel(t("core_heuristics_tab", "Core Heuristics"), "Core Heuristics"), icon: t("icon_shield_lock", "shield_lock"), kw: "core heuristics malware signatures security" },
        { id: "support", label: cleanNavLabel(t("wf_tab_tickets", "Support"), "Support"), icon: t("icon_support_agent", "support_agent"), kw: "support tickets feedback applications" },
        { id: "chameleons", label: cleanNavLabel(t("keepers_tab_core_aesthetics", "Core Aesthetics"), "Core Aesthetics"), icon: t("icon_palette", "palette"), kw: "core aesthetics chameleons themes lexicons title area" },
      ];
      for (const sub of keepersSubsections) {
        items.push({
          id: `sub_keepers_${sub.id}`,
          category: "views",
          title: `${keepersTitle} > ${sub.label}`,
          subtitle: makeSubDesc(keepersTitle, sub.label),
          badgeLabel: keepersTitle,
          badgeIcon: t("icon_admin_panel_settings", "admin_panel_settings"),
          icon: sub.icon,
          keywords: `${keepersTitle} ${sub.label} ${sub.kw}`,
          isActive: view === "KeepersCore" && keepersActiveTab === sub.id,
          onSelect: () => {
            setKeepersActiveTab(sub.id);
            navigateToView("KeepersCore");
          },
        });
      }
    }

    // Sanctuary OS Public Hub Sections
    const appTitle = t("sidebar_app_title", "Sanctuary OS");
    const landingSections: { id: string; label: string; subtitle: string; icon: string; kw: string }[] = [
      {
        id: "overview",
        label: t("overview", "Overview"),
        subtitle: t("landing_subtitle", "Sanctuary OS Hub Overview & Pinned Workspaces"),
        icon: t("icon_dashboard", "dashboard"),
        kw: "landing hub overview home welcome",
      },
      {
        id: "workspaces",
        label: t("landing_workspaces", "Active Workspaces"),
        subtitle: t("workspace_section_active_setup", "Switch or Configure Game Workspaces"),
        icon: t("icon_public", "public"),
        kw: "workspaces games switch spoke sims gta skyrim cyberpunk bg3 stardew",
      },
      {
        id: "news",
        label: t("landing_news", "Sanctuary Foundry News"),
        subtitle: t("feed_subtitle", "Creator Dispatches, Polls & Patch Announcements"),
        icon: t("icon_newspaper", "newspaper"),
        kw: "news foundry announcements press release notes",
      },
      {
        id: "directives",
        label: t("web_directives", "System Directives"),
        subtitle: t("cmd_palette_directives_sub", "Phase Roadmap, {Citizen} Guide & Master Architecture"),
        icon: t("icon_folder_special", "folder_special"),
        kw: "system directives roadmap citizen guide documentation protocols compliance eula",
      },
      {
        id: "support",
        label: t("landing_nav_feedback", "Feedback & Support"),
        subtitle: t("cmd_palette_support_sub", "Platform Feedback, Bug Reports & Apply to Sanctuary Foundry"),
        icon: t("icon_support_agent", "support_agent"),
        kw: "feedback support bug report ticket contact apply foundry",
      },
      {
        id: "partners",
        label: t("landing_partners_tab", "Partner Spokes"),
        subtitle: t("keepers_core_subtitle", "Core OS Oversight, Partner Spokes & Global Heuristics"),
        icon: t("icon_handshake", "handshake"),
        kw: "partner spokes community apply spoke",
      },
      {
        id: "legal",
        label: t("landing_legal_tab", "Legal"),
        subtitle: t("web_directives", "System Directives"),
        icon: t("icon_gavel", "gavel"),
        kw: "legal eula terms privacy policy",
      },
      {
        id: "donations",
        label: t("wf_tab_donations", "Donations"),
        subtitle: t("tab_supporter", "Supporter & Perks"),
        icon: t("icon_volunteer_activism", "volunteer_activism"),
        kw: "donations supporter perks contribute",
      },
    ];
    for (const sec of landingSections) {
      items.push({
        id: `landing_${sec.id}`,
        category: "views",
        title: `${appTitle} > ${sec.label}`,
        subtitle: sec.subtitle,
        badgeLabel: appTitle,
        badgeIcon: sec.icon,
        icon: sec.icon,
        keywords: `${appTitle} ${sec.label} ${sec.kw}`,
        onSelect: () => navigateToLandingTab(sec.id),
      });
    }

    // Settings / System Preferences & Deep-Link Cards
    const settingsTitle = t("settings", "{Settings}");
    items.push({
      id: "view_settings",
      category: "views",
      title: settingsTitle,
      subtitle: t(
        "cmd_palette_settings_sub",
        "Chameleon Themes, {Lexicons}, Supporter Perks & Engine Coordinates"
      ),
      badgeLabel: settingsTitle,
      badgeIcon: t("icon_settings", "settings"),
      icon: t("icon_settings", "settings"),
      keywords: "settings preferences options theme lexicon paths configuration",
      isActive: view === "settings",
      onSelect: () => navigateToView("settings"),
    });

    const settingsSubsections: { id: string; label: string; icon: string; kw: string; desktopOnly?: boolean }[] = [
      { id: "CORE", label: t("tab_core", "Core"), icon: t("icon_account_circle", "account_circle"), kw: "core account profile paths coordinates vault passkey 2fa webauthn" },
      { id: "SUPPORTER", label: t("tab_supporter", "Supporter & Perks"), icon: t("icon_volunteer_activism", "volunteer_activism"), kw: "supporter perks dev builds donations" },
      { id: "TICKETS", label: t("support_tickets", "Support Tickets"), icon: t("icon_confirmation_number", "confirmation_number"), kw: "support tickets feedback core spoke my tickets" },
      { id: "ENGINE", label: t("tab_engine", "Engine"), icon: t("icon_history", "history"), kw: "engine retention backups cycles defcon emergency agency", desktopOnly: true },
      { id: "CLIENT", label: t("tab_preferences", "Preferences"), icon: t("icon_tune", "tune"), kw: "client preferences interface behavior date format browser version history", desktopOnly: false },
      { id: "NOTIFICATIONS", label: t("tab_notifs", "Notifications"), icon: t("icon_notifications", "notifications"), kw: "notifications alerts sounds defcon lockdown", desktopOnly: false },
      { id: "AESTHETICS", label: t("tab_aesthetics", "Aesthetics"), icon: t("icon_format_paint", "format_paint"), kw: "aesthetics chameleons themes lexicons fonts glass", desktopOnly: false },
      { id: "LOGIC", label: t("tab_logic", "Logic Integrity"), icon: t("icon_flag", "flag"), kw: "logic integrity anarchy highlander rules conflicts", desktopOnly: true },
    ];
    for (const sub of settingsSubsections) {
      if (sub.desktopOnly && !isDesktop()) continue;
      items.push({
        id: `sub_settings_${sub.id}`,
        category: "views",
        title: `${settingsTitle} > ${sub.label}`,
        subtitle: makeSubDesc(settingsTitle, sub.label),
        badgeLabel: settingsTitle,
        badgeIcon: t("icon_settings", "settings"),
        icon: sub.icon,
        keywords: `${settingsTitle} ${sub.label} ${sub.kw}`,
        onSelect: () => navigateToSettingsTab(sub.id),
      });
    }

    // Individual Settings Deep-Link Cards (including DEFCON Protocol, Retention, Version History, etc.)
    const deepSettingsCards: {
      id: string;
      tab: string;
      title: string;
      subtitle: string;
      icon: string;
      kw: string;
      desktopOnly?: boolean;
    }[] = [
      {
        id: "setting_defcon_protocol",
        tab: "ENGINE",
        title: t("cmd_palette_defcon_protocol_title", "Emergency Backup Protocol (DEFCON)"),
        subtitle: t(
          "cmd_palette_defcon_protocol_sub",
          "Configure Automatic Pre-Patch Backup Scope & Emergency Agency Level"
        ),
        icon: t("icon_shield", "shield"),
        kw: "defcon emergency backup target level protocol pre-patch snapshot lockdown engine agency",
        desktopOnly: true,
      },
      {
        id: "setting_engine_agency",
        tab: "ENGINE",
        title: t("engine_agency", "Emergency Level"),
        subtitle: t("agency_full_desc", "Automatic backups & protection."),
        icon: t("icon_tune", "tune"),
        kw: "defcon level emergency agency full auto semi manual backup protection",
        desktopOnly: true,
      },
      {
        id: "setting_backup_retention",
        tab: "ENGINE",
        title: `${t("vault_capacity", "{Backups} Limit")} & ${t("game_retention", "Game Files Retention")}`,
        subtitle: t("version_storage_limit", "Version Storage Limit"),
        icon: t("icon_storage", "storage"),
        kw: "backups limit retention saves storage capacity version copies days",
        desktopOnly: true,
      },
      {
        id: "setting_version_history",
        tab: "CLIENT",
        title: t("version_pool_auto_archive", "Version History System"),
        subtitle: t(
          "version_pool_auto_archive_desc",
          "When enabled, keeps multiple {mod} versions for rollback and auto-swapping. When disabled, keeps only one version."
        ),
        icon: t("icon_history", "history"),
        kw: "version history system archive legacy versions rollback auto swap",
        desktopOnly: true,
      },
      {
        id: "setting_ingest_mode",
        tab: "CLIENT",
        title: t("settings_ingest_file_mode_title", "Drag & Drop File Behavior"),
        subtitle: t(
          "settings_ingest_file_mode_desc",
          "Choose whether dragged and dropped {mod} files and archives are copied into your {Vault} or moved."
        ),
        icon: t("icon_drive_file_move", "drive_file_move"),
        kw: "drag drop file behavior payload intake copy move import",
      },
      {
        id: "setting_date_format",
        tab: "CLIENT",
        title: t("settings_date_format_title", "Date Format"),
        subtitle: t(
          "settings_date_format_desc",
          "Choose how dates are displayed on Comm-Link posts, dispatches, release notes, and records across the OS."
        ),
        icon: t("icon_calendar_month", "calendar_month"),
        kw: "date format calendar mm dd yyyy iso",
      },
      {
        id: "setting_internal_browser",
        tab: "CLIENT",
        title: t("settings_use_internal_browser", "Use the Sanctuary Browser"),
        subtitle: t(
          "use_internal_browser_desc",
          "Use Sanctuary's built-in web browser for supported {Mod} download pages."
        ),
        icon: t("icon_language", "language"),
        kw: "sanctuary browser internal web download external",
        desktopOnly: true,
      },
      {
        id: "setting_local_only",
        tab: "CLIENT",
        title: t("local_only", "Local Network Only"),
        subtitle: t("local_only_desc", "Block external uploads/downloads. Strict offline mode."),
        icon: t("icon_wifi_off", "wifi_off"),
        kw: "local network only offline mode privacy block external",
      },
      {
        id: "setting_malware_share",
        tab: "CLIENT",
        title: t("malware_share_title", "Share Malware Reports"),
        subtitle: t(
          "malware_share_desc",
          "Send your local quarantine manifests to the Admins for analysis and malware activity updates."
        ),
        icon: t("icon_security", "security"),
        kw: "share malware reports quarantine security telemetry",
      },
      {
        id: "setting_defcon_notifs",
        tab: "NOTIFICATIONS",
        title: t("notify_defcon_title", "DEFCON Lockdown Alerts"),
        subtitle: t("tab_notifs", "Notifications"),
        icon: t("icon_notifications_active", "notifications_active"),
        kw: "defcon lockdown alerts notifications patch detected emergency",
      },
      {
        id: "setting_anarchy_highlander",
        tab: "LOGIC",
        title: t("tab_logic", "Logic Integrity"),
        subtitle: makeSubDesc(settingsTitle, t("tab_logic", "Logic Integrity")),
        icon: t("icon_flag", "flag"),
        kw: "anarchy highlander logic integrity conflict rules override",
        desktopOnly: true,
      },
    ];

    for (const card of deepSettingsCards) {
      if (card.desktopOnly && !isDesktop()) continue;
      items.push({
        id: card.id,
        category: "actions",
        title: card.title,
        subtitle: card.subtitle,
        badgeLabel: settingsTitle,
        badgeIcon: t("icon_settings", "settings"),
        icon: card.icon,
        keywords: `${settingsTitle} ${card.title} ${card.kw}`,
        onSelect: () => navigateToSettingsTab(card.tab),
      });
    }

    // 2. Verified & Local Masons (Profile Viewing)
    const seenMasonIds = new Set<string>();
    const seenMasonNames = new Set<string>();
    const combinedMasons: { id: string; name: string; bio?: string; isVerified?: boolean }[] = [];

    for (const m of masonsRegistry) {
      const mId = String(m?.id || "").trim();
      const mName = String(m?.name || "").trim();
      if (!mId || !mName || seenMasonIds.has(mId)) continue;
      seenMasonIds.add(mId);
      seenMasonNames.add(mName.toLowerCase());
      combinedMasons.push({
        id: mId,
        name: mName,
        bio: String(m?.bio || ""),
        isVerified: Boolean(m?.is_verified),
      });
    }

    // Also discover any mason_id + author pairs from modList
    for (const mod of modList || []) {
      const mId = String((mod as any)?.mason_id || "").trim();
      const authorName = String(mod?.author || "").trim();
      if (
        mId &&
        authorName &&
        authorName.toLowerCase() !== "unknown" &&
        !seenMasonIds.has(mId) &&
        !seenMasonNames.has(authorName.toLowerCase())
      ) {
        seenMasonIds.add(mId);
        seenMasonNames.add(authorName.toLowerCase());
        combinedMasons.push({
          id: mId,
          name: authorName,
          isVerified: true,
        });
      }
    }

    for (const mason of combinedMasons) {
      items.push({
        id: `mason_profile_${mason.id}`,
        category: "vault",
        title: `${mason.name} — ${t("term_mason", "{Mason}")}`,
        subtitle:
          mason.bio && mason.bio.trim().length > 0
            ? mason.bio
            : t("cmd_palette_mason_profile_sub", "Verified {Mason} Profile, Published {Mods} & {Blueprints}"),
        badgeLabel: t("term_mason", "{Mason}"),
        badgeIcon: t("icon_verified", "verified"),
        badgeColorVar: "var(--accent)",
        icon: t("icon_engineering", "engineering"),
        keywords: `mason creator author profile ${mason.name}`,
        onSelect: () => {
          if (onOpenMasonProfile) {
            onOpenMasonProfile(mason.id);
          } else {
            setMarketTab("MASONS");
            setView("nexus");
          }
          closePalette();
        },
      });
    }

    // 3. Blueprints & Vault Mods (Including Suites, Collections & Config Files Routed to Workbench)
    const seenBlueprintNames = new Set<string>();
    for (const ps of playSets || []) {
      const setName = String(ps?.name || "").trim();
      if (!setName) continue;
      const lowerSet = setName.toLowerCase();
      if (seenBlueprintNames.has(lowerSet)) continue;
      seenBlueprintNames.add(lowerSet);

      const isCurrent = lowerSet === String(activeSetName || "").toLowerCase();
      const modCount = Array.isArray(ps?.mods)
        ? countBlueprintArtifacts(ps.mods, activeGameSchema)
        : Array.isArray(ps?.items)
          ? countBlueprintArtifacts(ps.items, activeGameSchema)
          : 0;
      items.push({
        id: `blueprint_${setName}`,
        category: "vault",
        title: setName,
        subtitle: `${modCount} ${t("term_mods", "{Mods}")} • ${
          isCurrent ? t("active", "Active") : t("cmd_palette_activate_blueprint", "Activate {Blueprint}")
        }`,
        badgeLabel: t("term_blueprint", "{Blueprint}"),
        badgeIcon: isCurrent ? t("icon_check_circle", "check_circle") : t("icon_map", "map"),
        badgeColorVar: isCurrent ? "var(--success)" : "var(--accent)",
        icon: t("icon_map", "map"),
        iconColorClass: isCurrent ? "text-[var(--success)]" : "text-[var(--accent)]",
        keywords: `blueprint playset ${setName} activate deploy load`,
        isActive: isCurrent,
        onSelect: () => {
          onEquipBlueprint(setName);
          closePalette();
        },
      });
    }

    const seenConfigFiles = new Set<string>();
    const seenModKeys = new Set<string>();

    for (const mod of modList || []) {
      if (!mod) continue;
      const rawName = String(mod?.name || "").trim();
      if (
        !rawName ||
        rawName.startsWith("LOCAL_SET_") ||
        String(mod?.hash || "").startsWith("local_set_")
      ) {
        continue;
      }

      const displayName = String(
        mod?.displayName || (mod as any)?.meta_name || rawName.split(/[\\/]/).pop() || rawName
      ).trim();
      if (!displayName || seenBlueprintNames.has(displayName.toLowerCase())) continue;

      const cleanFile = (rawName.split(/[\\/]/).pop() || rawName).toLowerCase();
      const cleanBaseName = cleanFile.replace(/\.[^.]+$/, "");
      const author = String(mod?.author || t("unknown", "Unknown"));
      const category = String(mod?.category || mod?.type || t("term_mod", "{Mod}"));

      // Check if this entry is a Settings / Config / Template file that belongs in Citizen's Workbench
      const isConfigFile =
        CONFIG_EXTENSIONS_REGEX.test(rawName) ||
        CONFIG_EXTENSIONS_REGEX.test(String(mod?.type || "")) ||
        category.toLowerCase() === "configuration" ||
        /^mc[\s_]*settings$/i.test(displayName);

      if (isConfigFile) {
        seenConfigFiles.add(cleanFile);
        const dedupeCfgKey = `cfg__${displayName.toLowerCase()}`;
        if (seenModKeys.has(dedupeCfgKey)) continue;
        seenModKeys.add(dedupeCfgKey);

        items.push({
          id: `cfg_mod_${mod.hash || rawName}`,
          category: "vault",
          title: displayName,
          subtitle: `${t("cmd_palette_open_in_workbench", "Open in {Citizen}'s Workbench")} • ${cleanFile}`,
          badgeLabel: t("cw_tab_configs", "Configs"),
          badgeIcon: t("icon_tune", "tune"),
          badgeColorVar: "var(--accent)",
          icon: t("icon_design_services", "design_services"),
          keywords: `${displayName} ${cleanFile} ${cleanBaseName} config settings workbench ini cfg json`,
          onSelect: () => {
            openConfigInWorkbench((mod as any)?.physical_path || rawName, displayName);
          },
        });
        continue;
      }

      const dedupeKey = `${displayName.toLowerCase()}__${author.toLowerCase()}__${Boolean(
        mod.isVirtual || mod.isCollection
      )}`;
      if (seenModKeys.has(dedupeKey)) continue;
      seenModKeys.add(dedupeKey);

      const inBlueprint = activeBlueprintModsSet.has(cleanFile);
      const modIcon = getModIcon(mod, activeGameSchema, t);
      const rawVer = String(mod?.version || "").trim();
      const isPlaceholderVer =
        !rawVer ||
        /^(v?\.?local|vv\.?local|local node|unknown|v\.?unknown)$/i.test(rawVer);
      const formattedVer = !isPlaceholderVer
        ? ` • ${/^v/i.test(rawVer) ? rawVer : `v${rawVer}`}`
        : ` • ${t("unknown", "Unknown")}`;

      const isSuiteOrCollection = Boolean(mod.isVirtual || mod.isCollection);
      const matchedMason = combinedMasons.find(
        (m) =>
          (mod as any)?.mason_id === m.id ||
          (author && m.name.toLowerCase() === author.toLowerCase())
      );

      items.push({
        id: `mod_${mod.hash || rawName}`,
        category: "vault",
        title: displayName,
        subtitle: `${author} • ${isSuiteOrCollection ? t("tab_cc", "Collections") : category}${formattedVer}`,
        badgeLabel: inBlueprint
          ? t("in_set", "In {Blueprint}")
          : isSuiteOrCollection
            ? t("tab_cc", "Collections")
            : t("term_mod", "{Mod}"),
        badgeIcon: inBlueprint ? t("icon_check_circle", "check_circle") : modIcon,
        badgeColorVar: inBlueprint ? "var(--success)" : "var(--accent)",
        icon: modIcon,
        keywords: `${displayName} ${cleanBaseName} ${author} ${category}`,
        isActive: inBlueprint,
        onSelect: () => {
          onInspectMod(mod);
          closePalette();
        },
        secondaryAction: matchedMason && onOpenMasonProfile
          ? {
              label: t("cmd_palette_view_mason_profile", "View {Mason} Profile"),
              icon: t("icon_verified", "verified"),
              isActive: false,
              onClick: (e) => {
                e.stopPropagation();
                onOpenMasonProfile(matchedMason.id);
                closePalette();
              },
            }
          : {
              label: t("cmd_palette_toggle_in_blueprint", "Toggle in {Blueprint}"),
              icon: inBlueprint
                ? t("icon_check_circle", "check_circle")
                : t("icon_add_circle", "add_circle"),
              isActive: inBlueprint,
              onClick: (e) => {
                e.stopPropagation();
                onToggleModInBlueprint(mod);
              },
            },
      });
    }

    // Also index any additional Workbench config/template files discovered on disk
    for (const wbPath of workbenchPaths) {
      const norm = String(wbPath || "").replace(/\\/g, "/");
      const fileName = norm.split("/").pop() || norm;
      const lowerFile = fileName.toLowerCase();
      if (!fileName || seenConfigFiles.has(lowerFile)) continue;
      seenConfigFiles.add(lowerFile);

      const prettyTitle = fileName
        .replace(/\.[^.]+$/, "")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      items.push({
        id: `wb_file_${norm}`,
        category: "vault",
        title: prettyTitle,
        subtitle: `${t("cmd_palette_open_in_workbench", "Open in {Citizen}'s Workbench")} • ${fileName}`,
        badgeLabel: lowerFile.endsWith(".json")
          ? cleanNavLabel(t("ql_templates", "Templates"), "Templates")
          : t("cw_tab_configs", "Configs"),
        badgeIcon: t("icon_tune", "tune"),
        badgeColorVar: "var(--accent)",
        icon: t("icon_design_services", "design_services"),
        keywords: `${prettyTitle} ${fileName} config settings workbench ini cfg json`,
        onSelect: () => {
          openConfigInWorkbench(wbPath, prettyTitle);
        },
      });
    }

    // 4. Quick Actions, DEFCON Lockdown, Version History, Hotkeys & Controller Mapping
    items.push({
      id: "action_controls_mapping",
      category: "actions",
      title: t("cmd_palette_controls_title", "Hotkeys & Controller Mapping"),
      subtitle: t(
        "cmd_palette_controls_sub",
        "Customize Keyboard Shortcuts & Gamepad / Steam Deck Input Bindings"
      ),
      badgeLabel: actionsBadge,
      badgeIcon: t("icon_sports_esports", "sports_esports"),
      icon: t("icon_sports_esports", "sports_esports"),
      keywords: "hotkeys shortcuts keybinds controller gamepad steam deck input mapping buttons",
      onSelect: () => {
        setIsControlsOpen(true);
      },
    });

    if (isDesktop()) {
      items.push(
        {
          id: "action_quick_launch",
          category: "actions",
          title: t("quick_launch", "Quick Launch"),
          subtitle: t(
            "cmd_palette_quick_launch_sub",
            "Deploy Active {Blueprint} & Launch Game Executable"
          ),
          badgeLabel: actionsBadge,
          badgeIcon: t("icon_rocket_launch", "rocket_launch"),
          badgeColorVar: "var(--success)",
          icon: t("icon_rocket_launch", "rocket_launch"),
          iconColorClass: "text-[var(--success)]",
          keywords: "launch play start game execute ignition",
          onSelect: () => {
            onQuickLaunch();
            closePalette();
          },
        },
        {
          id: "action_lockdown_vault",
          category: "actions",
          title: shelterActive
            ? cleanNavLabel(t("btn_reclaim", "Reclaim {Vault}"), "Reclaim {Vault}")
            : cleanNavLabel(t("btn_lockdown", "Lockdown {Vault}"), "Lockdown {Vault}"),
          subtitle: shelterActive
            ? t("btn_bunker_unlock_desc", "Disable Defensive Process")
            : t(
                "cmd_palette_lockdown_vault_sub",
                "Remove All Symlinks & Clean Game Folder (Safe Mode Shelter)"
              ),
          badgeLabel: actionsBadge,
          badgeIcon: shelterActive
            ? t("icon_lock", "lock")
            : t("icon_lock_open", "lock_open"),
          badgeColorVar: shelterActive ? "var(--warning)" : "var(--accent)",
          icon: shelterActive
            ? t("icon_lock", "lock")
            : t("icon_lock_open", "lock_open"),
          keywords:
            "lockdown vault reclaim shelter remove all symlinks clean game folder unequip defensive process bunker safe mode",
          isActive: Boolean(shelterActive),
          onSelect: () => {
            if (onTriggerShelter) {
              onTriggerShelter(!shelterActive);
            }
            closePalette();
          },
        },
        {
          id: "action_defcon_alert",
          category: "actions",
          title: t("cmd_palette_defcon_alert_title", "Emergency Lockdown & Malware Shield (DEFCON)"),
          subtitle: t(
            "cmd_palette_defcon_alert_sub",
            "Inspect Active Security Alerts, Patch Lockdown & Quarantine Shield"
          ),
          badgeLabel: actionsBadge,
          badgeIcon: t("icon_gpp_maybe", "gpp_maybe"),
          badgeColorVar: "var(--danger)",
          icon: t("icon_gpp_maybe", "gpp_maybe"),
          iconColorClass: "text-[var(--danger)]",
          keywords: "defcon lockdown alert malware security emergency patch shield quarantine",
          onSelect: () => {
            if (onOpenDefcon) {
              onOpenDefcon();
            } else {
              useModalStore.getState().setShowDefconAlert(true);
            }
            closePalette();
          },
        },
        {
          id: "action_version_history_drawer",
          category: "actions",
          title: t("cmd_palette_version_history_title", "{Mod} Version History"),
          subtitle: t(
            "cmd_palette_version_history_sub",
            "Manage Stored {Mod} Versions, Rollbacks & Automatic Version Routing"
          ),
          badgeLabel: actionsBadge,
          badgeIcon: t("icon_history", "history"),
          icon: t("icon_history", "history"),
          keywords: "mod version history rollback archive legacy versions auto swap revisions",
          onSelect: () => {
            setView("vault");
            window.setTimeout(() => {
              window.dispatchEvent(new CustomEvent("sanctuary-open-version-pool"));
            }, 50);
            closePalette();
          },
        },
        {
          id: "action_radar_sweep",
          category: "actions",
          title: t("cmd_palette_radar_sweep_title", "Scan {Vault} & Run Conflict Radar Sweep"),
          subtitle: t(
            "cmd_palette_radar_sweep_sub",
            "Verify SHA-256 DNA Hashes, Check Updates & Refresh {Vault}"
          ),
          badgeLabel: actionsBadge,
          badgeIcon: t("icon_radar", "radar"),
          icon: t("icon_radar", "radar"),
          keywords: "scan radar sweep refresh vault check updates hashes",
          onSelect: () => {
            onRunRadarSweep();
            closePalette();
          },
        },
        {
          id: "action_open_dropzone",
          category: "actions",
          title: t("cmd_palette_open_dropzone_title", "Open {Vault} Dropzone"),
          subtitle: t(
            "cmd_palette_open_dropzone_sub",
            "Ingest & Scan Archives (.zip, .rar, .7z) or {Mod} Files"
          ),
          badgeLabel: actionsBadge,
          badgeIcon: t("icon_upload_file", "upload_file"),
          icon: t("icon_upload_file", "upload_file"),
          keywords: "dropzone import add install mod zip archive",
          onSelect: () => {
            onOpenDropzone();
            closePalette();
          },
        },
        {
          id: "action_full_backup",
          category: "actions",
          title: t("cmd_palette_full_backup_title", "Create Full {Backups} Snapshot"),
          subtitle: t(
            "cmd_palette_full_backup_sub",
            "Compress Saves & {Mods} into a Zstd {Backups} Archive"
          ),
          badgeLabel: t("term_backups", "{Backups}"),
          badgeIcon: t("icon_backup", "backup"),
          icon: t("icon_backup", "backup"),
          keywords: "backup snapshot time capsule save archive zstd",
          onSelect: () => {
            onTriggerFullBackup();
            closePalette();
          },
        },
        {
          id: "action_pre_patch_snapshot",
          category: "actions",
          title: t("cmd_palette_pre_patch_title", "Create Pre-Patch Snapshot"),
          subtitle: t(
            "cmd_palette_pre_patch_sub",
            "Emergency Pre-Update Save & {Vault} State Snapshot"
          ),
          badgeLabel: t("term_backups", "{Backups}"),
          badgeIcon: t("icon_history", "history"),
          icon: t("icon_history", "history"),
          keywords: "pre-patch snapshot backup update emergency defcon",
          onSelect: () => {
            onTriggerPrePatchSnapshot();
            closePalette();
          },
        }
      );
    }

    const panelBadge = t("cmd_palette_panel_badge", "Side Panel");
    const openCcPanel = (panelName: string) => {
      setView("dashboard");
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("sanctuary-open-cc-panel", { detail: { panel: panelName } })
        );
      }, 45);
      closePalette();
    };

    items.push(
      {
        id: "panel_critical_failures",
        category: "actions",
        title: cleanNavLabel(t("crit_fail", "Critical Failures"), "Critical Failures"),
        subtitle: t(
          "cmd_palette_panel_critical_sub",
          "Open Critical Failures & Fatal Conflicts Diagnostic Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_gpp_bad", "gpp_bad"),
        badgeColorVar: "var(--danger)",
        icon: t("icon_gpp_bad", "gpp_bad"),
        iconColorClass: "text-[var(--danger)]",
        keywords: "critical failures fatal conflicts broken mods command center panel drawer",
        onSelect: () => openCcPanel("critical"),
      },
      {
        id: "panel_system_alerts",
        category: "actions",
        title: t("system_alerts_title", "System Alerts"),
        subtitle: t(
          "cmd_palette_panel_alerts_sub",
          "Open System Alerts & Tuning Overlaps Diagnostic Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_warning_amber", "warning_amber"),
        badgeColorVar: "var(--warning)",
        icon: t("icon_warning_amber", "warning_amber"),
        iconColorClass: "text-[var(--warning)]",
        keywords: "system alerts tuning conflicts unstable mods command center panel drawer",
        onSelect: () => openCcPanel("alert"),
      },
      {
        id: "panel_updates_available",
        category: "actions",
        title: t("updates_avail", "Updates Available"),
        subtitle: t(
          "cmd_palette_panel_updates_sub",
          "Open Available {Mod} Updates & Guided Batch Updater Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_update", "update"),
        badgeColorVar: "var(--accent)",
        icon: t("icon_update", "update"),
        keywords: "updates available mod updates guided batch updater panel drawer",
        onSelect: () => {
          useModalStore.getState().setShowUpdatesModal(true);
          closePalette();
        },
      },
      {
        id: "panel_conflict_radar",
        category: "actions",
        title: `${t("radar_title", "Conflict Radar")} — ${panelBadge}`,
        subtitle: t(
          "cmd_palette_panel_radar_sub",
          "Open Active {Blueprint} Conflict Radar Summary Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_track_changes", "track_changes"),
        icon: t("icon_track_changes", "track_changes"),
        keywords: "conflict radar panel summary collisions overlaps command center drawer",
        onSelect: () => {
          useModalStore.getState().setIsConflictRadarOpen(true);
          closePalette();
        },
      },
      {
        id: "panel_quarantine_malware",
        category: "actions",
        title: t("quarantine_title", "Malware & Quarantine"),
        subtitle: t(
          "cmd_palette_panel_quarantine_sub",
          "Open Malware Quarantine & Security Isolation Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_coronavirus", "coronavirus"),
        badgeColorVar: "var(--danger)",
        icon: t("icon_coronavirus", "coronavirus"),
        iconColorClass: "text-[var(--danger)]",
        keywords: "malware alert quarantine panel threats isolation security drawer",
        onSelect: () => {
          useModalStore.getState().setShowQuarantineModal(true);
          closePalette();
        },
      },
      {
        id: "panel_broken_mods",
        category: "actions",
        title: t("incompatible_mods", "Incompatible & Broken {Mods}"),
        subtitle: t(
          "cmd_palette_panel_broken_sub",
          "Open Broken, Corrupted & Incompatible {Mods} Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_broken_image", "broken_image"),
        badgeColorVar: "var(--danger)",
        icon: t("icon_broken_image", "broken_image"),
        keywords: "broken incompatible obsolete corrupted mods panel drawer",
        onSelect: () => {
          useModalStore.getState().setShowBrokenModal(true);
          closePalette();
        },
      },
      {
        id: "panel_blueprint_swap",
        category: "actions",
        title: `${t("playsets_title", "{Blueprints}")} — ${panelBadge}`,
        subtitle: t(
          "cmd_palette_panel_blueprints_sub",
          "Open Quick {Blueprint} Switcher & Deployment Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_map", "map"),
        icon: t("icon_map", "map"),
        keywords: "blueprints playsets swap switch quick selector panel drawer",
        onSelect: () => {
          useModalStore.getState().setIsBlueprintSwapOpen(true);
          closePalette();
        },
      },
      {
        id: "panel_active_workspaces",
        category: "actions",
        title: `${t("landing_workspaces", "Active Workspaces")} — ${panelBadge}`,
        subtitle: t(
          "cmd_palette_panel_workspaces_sub",
          "Open Active Game Workspaces & Spoke Switcher Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_public", "public"),
        icon: t("icon_public", "public"),
        keywords: "active workspaces game switcher spoke panel drawer",
        onSelect: () => {
          window.dispatchEvent(
            new CustomEvent("sanctuary-tour-workspace-panel", { detail: { open: true } })
          );
          closePalette();
        },
      },
      {
        id: "panel_sanctuary_broadcasts",
        category: "actions",
        title: t("title_sanctuary_alerts", "Sanctuary Alerts"),
        subtitle: t(
          "cmd_palette_panel_broadcasts_sub",
          "Open Official Sanctuary Broadcasts & Urgent Alerts Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_campaign", "campaign"),
        badgeColorVar: "var(--warning)",
        icon: t("icon_campaign", "campaign"),
        keywords: "sanctuary alerts broadcasts urgent announcements command center panel drawer",
        onSelect: () => openCcPanel("broadcasts"),
      },
      {
        id: "panel_audit_logs",
        category: "actions",
        title: t("audit_logs", "Audit Logs"),
        subtitle: t("audit_logs_desc", "System modification history"),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_history", "history"),
        icon: t("icon_history", "history"),
        keywords: "audit logs history modification command center panel drawer",
        onSelect: () => openCcPanel("audit_logs"),
      },
      {
        id: "panel_support_perks",
        category: "actions",
        title: t("cmd_quick_support_title", "Support & Perks (0% Fee)"),
        subtitle: t(
          "cmd_quick_support_desc",
          "Support this community & unlock Global Daily Dev Builds"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_volunteer_activism", "volunteer_activism"),
        badgeColorVar: "var(--success)",
        icon: t("icon_volunteer_activism", "volunteer_activism"),
        keywords: "support perks donations dev builds panel drawer",
        onSelect: () => openCcPanel("support_perks"),
      },
      {
        id: "panel_submit_ticket",
        category: "actions",
        title: t("support_title", "Submit A Ticket"),
        subtitle: t("btn_submit_ticket_desc", "Open Sanctuary Support System"),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_local_activity", "local_activity"),
        icon: t("icon_local_activity", "local_activity"),
        keywords: "submit ticket support help report issue panel drawer",
        onSelect: () => {
          useModalStore.getState().setIsSupportPanelOpen(true);
          closePalette();
        },
      },
      {
        id: "panel_my_tickets",
        category: "actions",
        title: t("support_tickets", "Support Tickets"),
        subtitle: t("sidebar_support", "Sanctuary Support"),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_confirmation_number", "confirmation_number"),
        icon: t("icon_confirmation_number", "confirmation_number"),
        keywords: "my support tickets inbox replies citizen tickets panel drawer",
        onSelect: () => {
          if (onOpenCitizenTickets) {
            onOpenCitizenTickets();
          } else {
            useModalStore.getState().setIsSupportPanelOpen(true);
          }
          closePalette();
        },
      },
      {
        id: "action_notifications",
        category: "actions",
        title: t("notifications", "Notifications"),
        subtitle: t(
          "cmd_palette_notifications_sub",
          "Open System Alerts, {Mod} Updates & Broadcast Drawer"
        ),
        badgeLabel: actionsBadge,
        badgeIcon: t("icon_notifications", "notifications"),
        icon: t("icon_notifications", "notifications"),
        keywords: "notifications alerts inbox updates messages",
        onSelect: () => {
          onOpenNotifications();
          closePalette();
        },
      },
      {
        id: "action_system_queues",
        category: "actions",
        title: t("system_queues_title", "System Queues & Updates"),
        subtitle: t(
          "system_queues_subtitle",
          "Pending updates, file verification queues, and quick system utilities."
        ),
        badgeLabel: actionsBadge,
        badgeIcon: t("icon_layers", "layers"),
        icon: t("icon_layers", "layers"),
        keywords: "queues updates scout signature dna malware quarantine pending",
        onSelect: () => {
          useModalStore.getState().setIsQueuesPanelOpen(true);
          closePalette();
        },
      },
      {
        id: "action_system_logs",
        category: "actions",
        title: t("sys_log_history", "System Log History"),
        subtitle: t("audit_logs", "Audit Logs"),
        badgeLabel: actionsBadge,
        badgeIcon: t("icon_terminal", "terminal"),
        icon: t("icon_terminal", "terminal"),
        keywords: "logs terminal console history audit status",
        onSelect: () => {
          useModalStore.getState().setIsLogExpanded(true);
          closePalette();
        },
      },
      {
        id: "action_screenshot_tour",
        category: "actions",
        title: t("landing_tour_btn", "Interactive Tour"),
        subtitle: t("landing_subtitle", "Sanctuary OS Hub Overview & Pinned Workspaces"),
        badgeLabel: actionsBadge,
        badgeIcon: t("icon_photo_camera", "photo_camera"),
        icon: t("icon_photo_camera", "photo_camera"),
        keywords: "tour screenshots walkthrough optical capture preview",
        onSelect: () => {
          navigateToLandingTab("overview");
        },
      }
    );

    if (isDesktop()) {
      items.push({
        id: "action_system_status",
        category: "actions",
        title: t("system_status", "System Status"),
        subtitle: t("sys_panel_desc", "Hardware & Environment Telemetry"),
        badgeLabel: actionsBadge,
        badgeIcon: t("icon_memory", "memory"),
        icon: t("icon_memory", "memory"),
        keywords: "system status hardware telemetry ram cpu disk version update",
        onSelect: () => {
          useModalStore.getState().setIsSystemStatusOpen(true);
          closePalette();
        },
      });
    }

    // Chameleon Themes
    const mergedThemes: Record<string, any> = {
      ...(CORE_THEMES || {}),
      ...(gameThemes || {}),
      ...(customThemes || {}),
    };
    for (const [themeKey, themeObj] of Object.entries(mergedThemes)) {
      const themeName = String((themeObj as any)?.name || themeKey);
      const isCurrent = activeThemeId === themeKey;
      items.push({
        id: `theme_${themeKey}`,
        category: "actions",
        title: `${t("ui_btn_apply", "Apply")} ${t("term_chameleon", "Chameleon")}: ${themeName}`,
        subtitle: `${t("term_chameleon", "Chameleon")} • ${
          isCurrent ? t("active", "Active") : t("cmd_palette_click_activate", "Click to activate")
        }`,
        badgeLabel: t("term_chameleon", "Chameleon"),
        badgeIcon: isCurrent ? t("icon_check_circle", "check_circle") : t("icon_palette", "palette"),
        badgeColorVar: isCurrent ? "var(--success)" : "var(--accent)",
        icon: t("icon_palette", "palette"),
        keywords: `theme chameleon appearance dark light glass ${themeName} ${themeKey}`,
        isActive: isCurrent,
        onSelect: () => {
          setActiveThemeId(themeKey);
          closePalette();
        },
      });
    }

    // Lexicons
    const builtinLexList = [
      { id: "en-sanctuary", name: "Sanctuary (Sci-Fi)" },
      { id: "en-default", name: "Standard English" },
      { id: "en-sims", name: "The Sims Friendly" },
      { id: "Simlish", name: "Simlish" },
    ];
    const seenLexIds = new Set<string>();
    const combinedLexicons = [...builtinLexList, ...(Array.isArray(lexiconMeta) ? lexiconMeta : [])];
    for (const lex of combinedLexicons) {
      const lexId = String(lex?.id || "").trim();
      if (!lexId || seenLexIds.has(lexId)) continue;
      seenLexIds.add(lexId);
      const lexName = String(lex?.name || lexId);
      const isCurrent = activeLang === lexId;
      items.push({
        id: `lexicon_${lexId}`,
        category: "actions",
        title: `${t("cmd_palette_switch_lexicon", "Switch {Lexicon}")}: ${lexName}`,
        subtitle: `${t("cmd_palette_lexicon_pack_sub", "{Lexicon} Vocabulary Pack")} • ${
          isCurrent ? t("active", "Active") : t("cmd_palette_click_activate", "Click to activate")
        }`,
        badgeLabel: t("term_lexicon", "{Lexicon}"),
        badgeIcon: isCurrent ? t("icon_check_circle", "check_circle") : t("icon_translate", "translate"),
        badgeColorVar: isCurrent ? "var(--success)" : "var(--accent)",
        icon: t("icon_translate", "translate"),
        keywords: `lexicon language vocabulary words translation ${lexName} ${lexId}`,
        isActive: isCurrent,
        onSelect: () => {
          setActiveLang(lexId);
          closePalette();
        },
      });
    }

    return items;
  }, [
    isOpen,
    t,
    view,
    modList,
    playSets,
    activeSetName,
    activeBlueprintModsSet,
    masonsRegistry,
    workbenchPaths,
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
    CORE_THEMES,
    gameThemes,
    customThemes,
    activeThemeId,
    setActiveThemeId,
    lexiconMeta,
    activeLang,
    setActiveLang,
    navigateToView,
    navigateToLandingTab,
    navigateToSettingsTab,
    navigateToVaultSubTab,
    openConfigInWorkbench,
    onEquipBlueprint,
    onInspectMod,
    onToggleModInBlueprint,
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
    shelterActive,
    setView,
    closePalette,
  ]);

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

  // Web Gamepad API + Native Linux / Steam Deck Input Polling
  const prevPadButtonsRef = useRef<boolean[]>([]);
  const lastStickMoveRef = useRef<number>(0);
  const chordCaptureRef = useRef<number[]>([]);
  const nativePadRef = useRef<{
    connected: boolean;
    id: string;
    buttons: boolean[];
    axes: number[];
    seq: number;
  } | null>(null);

  const padStateRef = useRef({
    isOpen,
    isControlsOpen,
    connectedGamepadName,
    recordingPadField,
    controllerBindings,
    updateControllerBindings,
    filteredItems,
    selectedIndex,
    activeTab,
    closePalette,
  });

  useEffect(() => {
    padStateRef.current = {
      isOpen,
      isControlsOpen,
      connectedGamepadName,
      recordingPadField,
      controllerBindings,
      updateControllerBindings,
      filteredItems,
      selectedIndex,
      activeTab,
      closePalette,
    };
  }, [
    isOpen,
    isControlsOpen,
    connectedGamepadName,
    recordingPadField,
    controllerBindings,
    updateControllerBindings,
    filteredItems,
    selectedIndex,
    activeTab,
    closePalette,
  ]);

  useEffect(() => {
    chordCaptureRef.current = [];
  }, [recordingPadField]);

  useEffect(() => {
    const checkGamepadCombo = (pressedIndices: number[], targetCombo: string): boolean => {
      if (!targetCombo || targetCombo.startsWith("KEY:")) return false;
      const required = targetCombo
        .split("+")
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n));
      if (required.length === 0) return false;
      return required.every((idx) => pressedIndices.includes(idx));
    };

    const processGamepadFrame = (
      padId: string,
      currButtons: boolean[],
      axes: readonly number[]
    ) => {
      const st = padStateRef.current;
      if (st.connectedGamepadName !== padId) {
        setConnectedGamepadName(padId);
      }

      const prevButtons = prevPadButtonsRef.current;
      const pressedIndices: number[] = [];
      const newlyPressedIndices: number[] = [];

      currButtons.forEach((isDown, idx) => {
        if (isDown) {
          pressedIndices.push(idx);
          if (!prevButtons[idx]) {
            newlyPressedIndices.push(idx);
          }
        }
      });

      prevPadButtonsRef.current = currButtons;

      // Recording controller button/chord (supports both single buttons and 2-button chords like L1+R1)
      if (st.recordingPadField) {
        if (pressedIndices.length > 0) {
          for (const idx of pressedIndices) {
            if (!chordCaptureRef.current.includes(idx) && chordCaptureRef.current.length < 2) {
              chordCaptureRef.current.push(idx);
            }
          }
          if (chordCaptureRef.current.length >= 2) {
            const comboStr = [...chordCaptureRef.current].sort((a, b) => a - b).join("+");
            chordCaptureRef.current = [];
            st.updateControllerBindings({
              ...st.controllerBindings,
              [st.recordingPadField]: comboStr,
            });
            setRecordingPadField(null);
          }
        } else if (chordCaptureRef.current.length > 0) {
          const comboStr = [...chordCaptureRef.current].sort((a, b) => a - b).join("+");
          chordCaptureRef.current = [];
          st.updateControllerBindings({
            ...st.controllerBindings,
            [st.recordingPadField]: comboStr,
          });
          setRecordingPadField(null);
        }
        return;
      }

      // Check Toggle Palette chord/button when at least one button in the combo is newly pressed
      if (
        newlyPressedIndices.length > 0 &&
        checkGamepadCombo(pressedIndices, st.controllerBindings.togglePalette)
      ) {
        setIsOpen((prev) => {
          const next = !prev;
          if (next) {
            setSelectedIndex(0);
          } else {
            setIsControlsOpen(false);
          }
          return next;
        });
        return;
      }

      if (!st.isOpen) {
        const rightY = axes?.[3] ?? 0;
        const leftY = axes?.[1] ?? 0;
        const scrollAxis = Math.abs(rightY) > Math.abs(leftY) ? rightY : leftY;
        if (Math.abs(scrollAxis) > 0.35) {
          scrollActiveViewport(scrollAxis * 34);
        } else if (pressedIndices.includes(13)) {
          scrollActiveViewport(28);
        } else if (pressedIndices.includes(12)) {
          scrollActiveViewport(-28);
        }
        return;
      }

      // Inside open Command Matrix: D-Pad & Left Stick 2D grid navigation
      const now = Date.now();
      const stickY = axes?.[1] ?? 0;
      const stickX = axes?.[0] ?? 0;

      const moveDown =
        newlyPressedIndices.includes(13) ||
        (stickY > 0.55 && now - lastStickMoveRef.current > 180);
      const moveUp =
        newlyPressedIndices.includes(12) ||
        (stickY < -0.55 && now - lastStickMoveRef.current > 180);
      const moveRight =
        newlyPressedIndices.includes(15) ||
        (stickX > 0.55 && now - lastStickMoveRef.current > 180);
      const moveLeft =
        newlyPressedIndices.includes(14) ||
        (stickX < -0.55 && now - lastStickMoveRef.current > 180);

      const total = st.filteredItems.length;
      if ((moveDown || moveUp || moveRight || moveLeft) && total > 0) {
        lastStickMoveRef.current = now;
        const cols = typeof window !== "undefined" && window.innerWidth >= 768 ? 2 : 1;
        setSelectedIndex((prev) => {
          if (moveRight) return (prev + 1) % total;
          if (moveLeft) return (prev - 1 + total) % total;
          if (moveDown) {
            const next = prev + cols;
            return next < total ? next : prev % cols;
          }
          const next = prev - cols;
          if (next >= 0) return next;
          const col = prev % cols;
          const lastRowStart = Math.floor((total - 1) / cols) * cols;
          return Math.min(total - 1, lastRowStart + col);
        });
        return;
      }

      if (newlyPressedIndices.length === 0) return;

      // Close / Back
      if (checkGamepadCombo(pressedIndices, st.controllerBindings.closePalette)) {
        if (st.isControlsOpen) {
          setIsControlsOpen(false);
        } else {
          st.closePalette();
        }
        return;
      }

      // Next Tab
      if (checkGamepadCombo(pressedIndices, st.controllerBindings.nextTab)) {
        const order: CommandCategory[] = ["all", "views", "vault", "actions"];
        setActiveTab((prev) => order[(order.indexOf(prev) + 1) % order.length]);
        return;
      }

      // Previous Tab
      if (checkGamepadCombo(pressedIndices, st.controllerBindings.prevTab)) {
        const order: CommandCategory[] = ["all", "views", "vault", "actions"];
        setActiveTab((prev) => order[(order.indexOf(prev) - 1 + order.length) % order.length]);
        return;
      }

      // Execute Item
      if (!st.isControlsOpen && checkGamepadCombo(pressedIndices, st.controllerBindings.executeItem)) {
        const target = st.filteredItems[st.selectedIndex];
        if (target) target.onSelect();
        return;
      }

      // Secondary Action
      if (
        !st.isControlsOpen &&
        checkGamepadCombo(pressedIndices, st.controllerBindings.secondaryAction)
      ) {
        const target = st.filteredItems[st.selectedIndex];
        if (target?.secondaryAction) {
          target.secondaryAction.onClick({ stopPropagation: () => {} } as React.MouseEvent);
        }
      }
    };

    let unlistenNative: (() => void) | null = null;

    if (isDesktop()) {
      invoke<{
        connected: boolean;
        id: string;
        buttons: boolean[];
        axes: number[];
        seq: number;
      }>("get_native_gamepad_state")
        .then((snap) => {
          if (snap && snap.connected) {
            nativePadRef.current = snap;
            setConnectedGamepadName(snap.id || "Steam Deck Controller");
          } else if (isLinuxDesktop()) {
            setConnectedGamepadName("Steam Deck Controller");
          }
        })
        .catch(() => {
          if (isLinuxDesktop()) {
            setConnectedGamepadName("Steam Deck Controller");
          }
        });

      listen<{
        connected: boolean;
        id: string;
        buttons: boolean[];
        axes: number[];
        seq: number;
      }>("sanctuary-native-gamepad", (event) => {
        const snap = event.payload;
        nativePadRef.current = snap;
        if (snap && snap.connected) {
          processGamepadFrame(
            snap.id || "Steam Deck Controller",
            snap.buttons || [],
            snap.axes || [0, 0, 0, 0]
          );
        } else if (!isLinuxDesktop() && padStateRef.current.connectedGamepadName !== null) {
          setConnectedGamepadName(null);
          prevPadButtonsRef.current = [];
        }
      })
        .then((fn) => {
          unlistenNative = fn;
        })
        .catch(() => {});
    }

    const interval = window.setInterval(() => {
      let webPad: Gamepad | null = null;
      if (typeof navigator !== "undefined" && typeof navigator.getGamepads === "function") {
        try {
          const pads = navigator.getGamepads();
          webPad = Array.from(pads || []).find((p): p is Gamepad => Boolean(p && p.connected)) || null;
        } catch {
          webPad = null;
        }
      }

      if (webPad) {
        processGamepadFrame(
          webPad.id,
          webPad.buttons.map((b) => Boolean(b?.pressed)),
          webPad.axes
        );
        return;
      }

      const nativePad = nativePadRef.current;
      if (nativePad && nativePad.connected) {
        const hasHeldInput =
          (nativePad.buttons && nativePad.buttons.some(Boolean)) ||
          (nativePad.axes && nativePad.axes.some((a) => Math.abs(a) > 0.25));
        if (hasHeldInput) {
          processGamepadFrame(
            nativePad.id || "Steam Deck Controller",
            nativePad.buttons || [],
            nativePad.axes || [0, 0, 0, 0]
          );
        }
        return;
      }

      if (!isLinuxDesktop() && padStateRef.current.connectedGamepadName !== null) {
        setConnectedGamepadName(null);
      }
      prevPadButtonsRef.current = [];
    }, 50);

    return () => {
      window.clearInterval(interval);
      if (unlistenNative) unlistenNative();
    };
  }, []);

  const navigateGridByKey = useCallback((key: string, shiftKey = false): boolean => {
    const st = padStateRef.current;
    const total = st.filteredItems.length;
    const cols = typeof window !== "undefined" && window.innerWidth >= 768 ? 2 : 1;

    if (key === "ArrowDown") {
      if (total > 0) {
        setSelectedIndex((prev) => {
          const next = prev + cols;
          return next < total ? next : prev % cols;
        });
      }
      return true;
    }
    if (key === "ArrowUp") {
      if (total > 0) {
        setSelectedIndex((prev) => {
          const next = prev - cols;
          if (next >= 0) return next;
          const col = prev % cols;
          const lastRowStart = Math.floor((total - 1) / cols) * cols;
          return Math.min(total - 1, lastRowStart + col);
        });
      }
      return true;
    }
    if (key === "ArrowRight") {
      if (total > 0) {
        setSelectedIndex((prev) => (prev + 1) % total);
      }
      return true;
    }
    if (key === "ArrowLeft") {
      if (total > 0) {
        setSelectedIndex((prev) => (prev - 1 + total) % total);
      }
      return true;
    }
    if (key === "Enter") {
      const target = st.filteredItems[st.selectedIndex];
      if (target) target.onSelect();
      return true;
    }
    if (key === "Tab" || key === "PageDown" || key === "PageUp") {
      const order: CommandCategory[] = ["all", "views", "vault", "actions"];
      const idx = order.indexOf(st.activeTab);
      const goPrev = key === "PageUp" || (key === "Tab" && shiftKey);
      const nextIdx = goPrev
        ? (idx - 1 + order.length) % order.length
        : (idx + 1) % order.length;
      setActiveTab(order[nextIdx]);
      return true;
    }
    if (key === "Escape") {
      if (st.isControlsOpen) {
        setIsControlsOpen(false);
      } else {
        st.closePalette();
      }
      return true;
    }
    return false;
  }, []);

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
            </div>
          </div>
        )}

        {/* 2x2 Category Filter Tiles (Full-Width Labels — Never Cut Off) */}
        <div className="grid grid-cols-2 gap-3">
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
        </div>

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
  );
}
