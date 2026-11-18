import React from "react";
import { ModData } from "../../shared";
import { isLinuxDesktop } from "../../utils/envUtils";

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

export type CommandCategory = "all" | "views" | "vault" | "actions";

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
  openKeyboard: string;
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
  openKeyboard: "3", // Y / Triangle
  nextTab: "5", // R1 / RB
  prevTab: "4", // L1 / LB
  closePalette: "1", // B / Circle
};

export const HOTKEYS_STORAGE_KEY = "sanctuary_cmd_hotkeys_v1";
export const GAMEPAD_STORAGE_KEY = "sanctuary_cmd_gamepad_v1";
export const AUTO_KEYBOARD_STORAGE_KEY = "sanctuary_cmd_auto_keyboard_v1";

export function getAutoOpenKeyboardPref(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_KEYBOARD_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {}
  return isLinuxDesktop();
}

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

export const GAMEPAD_BUTTON_NAMES: Record<number, string> = {
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

export const SINGLE_KEY_BINDABLE = new Set([
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

export function formatKeyboardEventCombo(
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

export function matchesKeyboardCombo(
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

export function getOpenPopovers(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  return Array.from(document.querySelectorAll<HTMLElement>(".sa-dropdown-popover")).filter(
    (el) => {
      const style = window.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      ) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 8 && rect.height > 8;
    }
  );
}

export function getOpenSidePanels(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      ".sa-side-panel-wrapper.sa-panel-open .sa-side-panel-window"
    )
  ).filter((panel) => {
    const style = window.getComputedStyle(panel);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = panel.getBoundingClientRect();
    return rect.width > 16 && rect.height > 16;
  });
}

export function getTopmostOpenSidePanel(): HTMLElement | null {
  const panels = getOpenSidePanels();
  if (panels.length === 0) return null;
  let best = panels[panels.length - 1];
  let bestZ = parseInt(window.getComputedStyle(best).zIndex || "0", 10) || 0;
  for (const p of panels) {
    const z = parseInt(window.getComputedStyle(p).zIndex || "0", 10) || 0;
    if (z >= bestZ) {
      best = p;
      bestZ = z;
    }
  }
  return best;
}

export function clearGamepadFocus(): void {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll<HTMLElement>('[data-sa-gamepad-focus="true"]')
    .forEach((el) => el.removeAttribute("data-sa-gamepad-focus"));
}

export const INTERACTIVE_SELECTOR =
  'button:not(:disabled), a[href], input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [role="button"]:not([aria-disabled="true"]), [data-sa-clickable="true"], .sa-glass-toggle, .sa-dropdown-item';

export function scrollActiveViewport(
  deltaY: number,
  deltaX = 0,
  originEl?: Element | null
): boolean {
  if (typeof document === "undefined" || (deltaY === 0 && deltaX === 0)) return false;

  // 1. Scroll the nearest scrollable ancestor under the Virtual Pointer or focused element first
  let cur: HTMLElement | null =
    originEl instanceof HTMLElement ? originEl : (originEl?.parentElement ?? null);
  let handledY = deltaY === 0;
  let handledX = deltaX === 0;
  while (cur && cur !== document.body && (!handledY || !handledX)) {
    const style = window.getComputedStyle(cur);
    if (!handledY && cur.scrollHeight > cur.clientHeight + 2) {
      const oy = style.overflowY;
      if (oy === "auto" || oy === "scroll" || oy === "overlay") {
        const before = cur.scrollTop;
        cur.scrollTop += deltaY;
        if (cur.scrollTop !== before) {
          handledY = true;
        }
      }
    }
    if (!handledX && cur.scrollWidth > cur.clientWidth + 2) {
      const ox = style.overflowX;
      if (
        ox === "auto" ||
        ox === "scroll" ||
        ox === "overlay" ||
        cur.classList.contains("sa-stat-tile-carousel")
      ) {
        const before = cur.scrollLeft;
        cur.scrollLeft += deltaX;
        if (cur.scrollLeft !== before) {
          handledX = true;
        }
      }
    }
    cur = cur.parentElement;
  }
  if (handledY && handledX) return true;

  // 2. Scroll inside open popovers / context menus
  const popovers = getOpenPopovers();
  for (let i = popovers.length - 1; i >= 0; i--) {
    const pop = popovers[i];
    const scrollers = [
      pop,
      ...Array.from(pop.querySelectorAll<HTMLElement>(".overflow-y-auto, .custom-scrollbar")),
    ];
    for (const scroller of scrollers) {
      if (deltaY !== 0 && scroller.scrollHeight > scroller.clientHeight + 2) {
        scroller.scrollTop += deltaY;
        return true;
      }
    }
  }

  // 3. Scroll inside topmost open SidePanel
  const panels = getOpenSidePanels();
  for (let i = panels.length - 1; i >= 0; i--) {
    const panel = panels[i];
    const scrollers = Array.from(
      panel.querySelectorAll<HTMLElement>(
        ".overflow-y-auto, .custom-scrollbar, .sa-stat-tile-carousel"
      )
    );
    for (const scroller of scrollers) {
      if (!handledY && deltaY !== 0 && scroller.scrollHeight > scroller.clientHeight + 2) {
        scroller.scrollTop += deltaY;
        return true;
      }
      if (!handledX && deltaX !== 0 && scroller.scrollWidth > scroller.clientWidth + 2) {
        scroller.scrollLeft += deltaX;
        return true;
      }
    }
  }

  // 4. Scroll main OS viewport & carousels
  const mainScroll = document.getElementById("sanctuary-main-scroll");
  if (mainScroll) {
    if (!handledX && deltaX !== 0) {
      const carousels = Array.from(
        mainScroll.querySelectorAll<HTMLElement>(".sa-stat-tile-carousel, .overflow-x-auto")
      );
      for (const c of carousels) {
        if (c.scrollWidth > c.clientWidth + 2) {
          c.scrollLeft += deltaX;
          handledX = true;
          break;
        }
      }
    }
    if (!handledY && deltaY !== 0) {
      if (mainScroll.scrollHeight > mainScroll.clientHeight + 2) {
        mainScroll.scrollTop += deltaY;
        return true;
      }
      const innerScrollers = Array.from(
        mainScroll.querySelectorAll<HTMLElement>(".overflow-y-auto, .custom-scrollbar")
      );
      for (const scroller of innerScrollers) {
        if (scroller.scrollHeight > scroller.clientHeight + 2) {
          scroller.scrollTop += deltaY;
          return true;
        }
      }
    }
  }
  return handledX || handledY;
}

export function stepRangeInput(input: HTMLInputElement, dir: -1 | 1): boolean {
  const min = input.min !== "" ? Number(input.min) : 0;
  const max = input.max !== "" ? Number(input.max) : 100;
  const rawStep = input.step && input.step !== "any" ? Number(input.step) : (max - min) / 20;
  const step = Number.isFinite(rawStep) && rawStep > 0 ? rawStep : 1;
  const curr = Number(input.value) || 0;
  const next = Math.min(max, Math.max(min, Number((curr + dir * step).toFixed(4))));
  if (next === curr) return true;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (setter) {
    setter.call(input, String(next));
  } else {
    input.value = String(next);
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

export function moveSpatialFocus(
  dir: "up" | "down" | "left" | "right",
  pointerAnchor?: { x: number; y: number } | null
): HTMLElement | null {
  if (typeof document === "undefined") return null;

  const currFocused = document.querySelector<HTMLElement>('[data-sa-gamepad-focus="true"]');
  if (
    currFocused &&
    currFocused.tagName === "INPUT" &&
    (currFocused as HTMLInputElement).type === "range" &&
    (dir === "left" || dir === "right")
  ) {
    stepRangeInput(currFocused as HTMLInputElement, dir === "right" ? 1 : -1);
    return currFocused;
  }

  const openPopovers = getOpenPopovers();
  const topPopover = openPopovers.length > 0 ? openPopovers[openPopovers.length - 1] : null;
  const topPanel = !topPopover ? getTopmostOpenSidePanel() : null;
  const scope: HTMLElement =
    topPopover ||
    topPanel ||
    document.getElementById("sanctuary-os-shell") ||
    document.body;
  const isMainShellScope = !topPopover && !topPanel;

  const rawCandidates = Array.from(scope.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR));
  const candidates: { el: HTMLElement; rect: DOMRect }[] = [];

  for (const el of rawCandidates) {
    if (isMainShellScope && el.closest(".sa-side-panel-wrapper")) continue;
    const closedPanel = el.closest(".sa-side-panel-wrapper:not(.sa-panel-open)");
    if (closedPanel) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) continue;
    if (
      rect.bottom < -240 ||
      rect.top > window.innerHeight + 320 ||
      rect.right < -120 ||
      rect.left > window.innerWidth + 120
    ) {
      continue;
    }
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.pointerEvents === "none" ||
      Number(style.opacity) < 0.05
    ) {
      continue;
    }
    candidates.push({ el, rect });
  }

  if (candidates.length === 0) {
    if (dir === "up" || dir === "down") {
      scrollActiveViewport(dir === "down" ? 140 : -140);
    }
    return null;
  }

  const activeInScope =
    currFocused && scope.contains(currFocused)
      ? candidates.find((c) => c.el === currFocused) || null
      : null;

  if (!activeInScope) {
    clearGamepadFocus();
    let initial = candidates[0];
    if (pointerAnchor) {
      let bestDist = Infinity;
      for (const c of candidates) {
        const cx = c.rect.left + c.rect.width * 0.5;
        const cy = c.rect.top + c.rect.height * 0.5;
        const d = Math.hypot(cx - pointerAnchor.x, cy - pointerAnchor.y);
        if (d < bestDist) {
          bestDist = d;
          initial = c;
        }
      }
    } else {
      const activeTile = candidates.find(
        (c) =>
          c.el.getAttribute("data-sa-active") === "true" &&
          c.rect.top >= 0 &&
          c.rect.bottom <= window.innerHeight
      );
      const firstVisible = candidates.find(
        (c) =>
          c.rect.top >= 0 &&
          c.rect.left >= 0 &&
          c.rect.bottom <= window.innerHeight &&
          c.rect.right <= window.innerWidth
      );
      initial = activeTile || firstVisible || candidates[0];
    }
    initial.el.setAttribute("data-sa-gamepad-focus", "true");
    initial.el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    return initial.el;
  }

  const currRect = activeInScope.rect;
  const cx = currRect.left + currRect.width * 0.5;
  const cy = currRect.top + currRect.height * 0.5;

  let bestCandidate: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const { el, rect } of candidates) {
    if (el === activeInScope.el || el.contains(activeInScope.el)) continue;
    const tx = rect.left + rect.width * 0.5;
    const ty = rect.top + rect.height * 0.5;

    if (dir === "down" && (ty <= cy + 4 || rect.top < currRect.top + 2)) continue;
    if (dir === "up" && (ty >= cy - 4 || rect.bottom > currRect.bottom - 2)) continue;
    if (dir === "right" && (tx <= cx + 4 || rect.left < currRect.left + 2)) continue;
    if (dir === "left" && (tx >= cx - 4 || rect.right > currRect.right - 2)) continue;

    const childPenalty = activeInScope.el.contains(el) ? 28 : 0;
    let score = 0;

    if (dir === "down" || dir === "up") {
      const edgeGap =
        dir === "down"
          ? Math.max(0, rect.top - currRect.bottom)
          : Math.max(0, currRect.top - rect.bottom);
      const primary = edgeGap > 0 ? edgeGap : Math.abs(ty - cy) * 0.45;
      const overlapX = Math.max(
        0,
        Math.min(currRect.right, rect.right) - Math.max(currRect.left, rect.left)
      );
      const perp =
        overlapX > 4 ? Math.abs(tx - cx) * 0.28 : Math.abs(tx - cx) * 2.35 + 36;
      score = primary + perp + childPenalty;
    } else {
      const edgeGap =
        dir === "right"
          ? Math.max(0, rect.left - currRect.right)
          : Math.max(0, currRect.left - rect.right);
      const primary = edgeGap > 0 ? edgeGap : Math.abs(tx - cx) * 0.45;
      const overlapY = Math.max(
        0,
        Math.min(currRect.bottom, rect.bottom) - Math.max(currRect.top, rect.top)
      );
      const perp =
        overlapY > 4 ? Math.abs(ty - cy) * 0.28 : Math.abs(ty - cy) * 2.55 + 36;
      score = primary + perp + childPenalty;
    }

    if (score < bestScore) {
      bestScore = score;
      bestCandidate = el;
    }
  }

  if (bestCandidate) {
    clearGamepadFocus();
    bestCandidate.setAttribute("data-sa-gamepad-focus", "true");
    bestCandidate.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    return bestCandidate;
  }

  if (dir === "up" || dir === "down") {
    scrollActiveViewport(dir === "down" ? 140 : -140, 0, activeInScope.el);
  }
  return activeInScope.el;
}

export function cycleActiveViewTab(dir: -1 | 1): boolean {
  if (typeof document === "undefined") return false;
  const topPanel = getTopmostOpenSidePanel();
  if (topPanel) {
    const panelTiles = Array.from(
      topPanel.querySelectorAll<HTMLElement>(
        '[data-sa-stat-tile="tab"][data-sa-clickable="true"], [data-sa-stat-tile="filter"][data-sa-clickable="true"]'
      )
    ).filter((el) => el.getClientRects().length > 0);
    if (panelTiles.length >= 2) {
      const currIdx = panelTiles.findIndex((el) => el.getAttribute("data-sa-active") === "true");
      const baseIdx = currIdx >= 0 ? currIdx : 0;
      const nextTile = panelTiles[(baseIdx + dir + panelTiles.length) % panelTiles.length];
      if (nextTile) {
        nextTile.click();
        return true;
      }
    }
    return false;
  }

  const shell = document.getElementById("sanctuary-os-shell") || document.body;
  const mainTiles = Array.from(
    shell.querySelectorAll<HTMLElement>(
      '.sa-stat-tile-carousel [data-sa-stat-tile][data-sa-clickable="true"]'
    )
  ).filter((el) => !el.closest(".sa-side-panel-wrapper") && el.getClientRects().length > 0);

  if (mainTiles.length >= 2) {
    const currIdx = mainTiles.findIndex((el) => el.getAttribute("data-sa-active") === "true");
    const baseIdx = currIdx >= 0 ? currIdx : 0;
    const nextTile = mainTiles[(baseIdx + dir + mainTiles.length) % mainTiles.length];
    if (nextTile) {
      nextTile.click();
      return true;
    }
  }
  return false;
}

export interface CommandItem {
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

export function isSubsequenceOfInitials(queryToken: string, words: string[]): boolean {
  if (queryToken.length < 2 || queryToken.length > words.length) return false;
  let qi = 0;
  for (let wi = 0; wi < words.length && qi < queryToken.length; wi++) {
    if (words[wi].startsWith(queryToken[qi])) {
      qi++;
    }
  }
  return qi === queryToken.length;
}

export function scoreSingleToken(token: string, fieldLower: string, words: string[]): number {
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

export function scoreFuzzyMatch(query: string, title: string, subtitle: string, keywords: string): number {
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

export const cleanNavLabel = (raw: any, fallback: string): string => {
  const s = String(raw || fallback || "").replace(/^[^\w{]*/, "").trim();
  return s || fallback;
};

export const CONFIG_EXTENSIONS_REGEX = /\.(cfg|ini|json|txt|xml|toml|yaml|yml)$/i;

