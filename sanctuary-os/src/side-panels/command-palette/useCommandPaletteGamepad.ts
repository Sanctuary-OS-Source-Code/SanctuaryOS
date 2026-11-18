import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { closeSanctuaryContextMenu } from "../../shared-components/ContextMenu";
import { isDesktop, isLinuxDesktop } from "../../utils/envUtils";
import {
  CommandCategory,
  getAutoOpenKeyboardPref,
  isEditableElementFocused,
  getOpenPopovers,
  getTopmostOpenSidePanel,
  clearGamepadFocus,
  INTERACTIVE_SELECTOR,
  scrollActiveViewport,
  moveSpatialFocus,
  cycleActiveViewTab,
} from "./hotkeysAndSpatialNav";

export function useCommandPaletteGamepad({
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
}: any) {
  const [isPointerVisible, setIsPointerVisible] = useState(false);
  const isPointerVisibleRef = useRef(false);
  const pointerPosRef = useRef<{ x: number; y: number }>({
    x: typeof window !== "undefined" ? Math.round(window.innerWidth * 0.5) : 640,
    y: typeof window !== "undefined" ? Math.round(window.innerHeight * 0.5) : 400,
  });
  const cursorElRef = useRef<HTMLDivElement | null>(null);
  const pointerHideTimerRef = useRef<number | null>(null);
  const lastRealMouseAtRef = useRef<number>(0);
  const activeStickAxesRef = useRef<{ lx: number; ly: number; rx: number; ry: number }>({
    lx: 0,
    ly: 0,
    rx: 0,
    ry: 0,
  });
  const stickRafIdRef = useRef<number | null>(null);
  const lastStickRafAtRef = useRef<number>(0);
  const dpadHoldStateRef = useRef<{ btn: number | null; startedAt: number; lastRepeatAt: number }>({
    btn: null,
    startedAt: 0,
    lastRepeatAt: 0,
  });
  const bumperSoloCandidateRef = useRef<{ btn: 4 | 5; at: number } | null>(null);
  const chordFiredDuringHoldRef = useRef<boolean>(false);

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
    openPalette,
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
      openPalette,
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
    openPalette,
  ]);

  useEffect(() => {
    chordCaptureRef.current = [];
  }, [recordingPadField]);

  useEffect(() => {
    const hideVirtualPointer = () => {
      if (pointerHideTimerRef.current !== null) {
        window.clearTimeout(pointerHideTimerRef.current);
        pointerHideTimerRef.current = null;
      }
      if (isPointerVisibleRef.current) {
        isPointerVisibleRef.current = false;
        setIsPointerVisible(false);
      }
    };

    const revealAndPositionPointer = (nextX: number, nextY: number) => {
      if (typeof window === "undefined") return;
      const clampedX = Math.max(6, Math.min(window.innerWidth - 6, nextX));
      const clampedY = Math.max(6, Math.min(window.innerHeight - 6, nextY));
      pointerPosRef.current = { x: clampedX, y: clampedY };

      if (!isPointerVisibleRef.current) {
        isPointerVisibleRef.current = true;
        setIsPointerVisible(true);
      }
      if (cursorElRef.current) {
        cursorElRef.current.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
        const hit = document.elementFromPoint(clampedX, clampedY) as HTMLElement | null;
        const isInteractive = Boolean(hit?.closest?.(INTERACTIVE_SELECTOR));
        cursorElRef.current.classList.toggle("is-interactive", isInteractive);
      }

      clearGamepadFocus();

      if (pointerHideTimerRef.current !== null) {
        window.clearTimeout(pointerHideTimerRef.current);
      }
      pointerHideTimerRef.current = window.setTimeout(() => {
        hideVirtualPointer();
      }, 3500);
    };

    const resolveGamepadTarget = (): {
      el: HTMLElement | null;
      x: number;
      y: number;
      fromPointer: boolean;
    } => {
      if (typeof document === "undefined") {
        return { el: null, x: 0, y: 0, fromPointer: false };
      }
      if (isPointerVisibleRef.current) {
        const { x, y } = pointerPosRef.current;
        const hit = document.elementFromPoint(x, y) as HTMLElement | null;
        return { el: hit, x, y, fromPointer: true };
      }
      const focused =
        document.querySelector<HTMLElement>('[data-sa-gamepad-focus="true"]') ||
        (document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
          ? document.activeElement
          : null);
      if (focused) {
        const rect = focused.getBoundingClientRect();
        return {
          el: focused,
          x: rect.left + rect.width * 0.5,
          y: rect.top + rect.height * 0.5,
          fromPointer: false,
        };
      }
      return { el: null, x: pointerPosRef.current.x, y: pointerPosRef.current.y, fromPointer: false };
    };

    const triggerPrimaryClick = () => {
      const { el, x, y, fromPointer } = resolveGamepadTarget();
      if (!el) {
        moveSpatialFocus("down", pointerPosRef.current);
        return;
      }

      if (fromPointer && cursorElRef.current) {
        cursorElRef.current.classList.add("is-pressed");
        window.setTimeout(() => {
          cursorElRef.current?.classList.remove("is-pressed");
        }, 120);
      }

      const interactive =
        el.closest<HTMLElement>(
          'button, a[href], input, select, textarea, label, [role="button"], [data-sa-clickable="true"], .sa-glass-toggle, .sa-dropdown-item'
        ) || el;

      if (
        interactive.tagName === "INPUT" &&
        (interactive as HTMLInputElement).type === "range"
      ) {
        const rangeEl = interactive as HTMLInputElement;
        if (fromPointer) {
          const rect = rangeEl.getBoundingClientRect();
          if (rect.width > 4) {
            const ratio = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
            const min = rangeEl.min !== "" ? Number(rangeEl.min) : 0;
            const max = rangeEl.max !== "" ? Number(rangeEl.max) : 100;
            const rawVal = min + ratio * (max - min);
            const stepAttr =
              rangeEl.step && rangeEl.step !== "any" ? Number(rangeEl.step) : 0;
            const snapped =
              stepAttr > 0
                ? Math.round((rawVal - min) / stepAttr) * stepAttr + min
                : rawVal;
            const clamped = Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              "value"
            )?.set;
            if (setter) setter.call(rangeEl, String(clamped));
            else rangeEl.value = String(clamped);
            rangeEl.dispatchEvent(new Event("input", { bubbles: true }));
            rangeEl.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
        clearGamepadFocus();
        rangeEl.setAttribute("data-sa-gamepad-focus", "true");
        rangeEl.focus({ preventScroll: true });
        return;
      }

      const tag = interactive.tagName;
      const inputType =
        tag === "INPUT" ? (interactive as HTMLInputElement).type?.toLowerCase() : "";
      const isTextEditable =
        tag === "TEXTAREA" ||
        interactive.isContentEditable ||
        (tag === "INPUT" &&
          inputType !== "checkbox" &&
          inputType !== "radio" &&
          inputType !== "button" &&
          inputType !== "submit" &&
          inputType !== "reset" &&
          inputType !== "file" &&
          inputType !== "color");

      if (isTextEditable) {
        interactive.focus();
        interactive.click();
        if (getAutoOpenKeyboardPref() && isLinuxDesktop()) {
          invoke("open_steam_osk").catch(() => {});
        }
        return;
      }

      const mouseInit: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: 1,
      };
      try {
        if (typeof PointerEvent !== "undefined") {
          interactive.dispatchEvent(
            new PointerEvent("pointerdown", { ...mouseInit, pointerId: 1, isPrimary: true })
          );
        }
        interactive.dispatchEvent(new MouseEvent("mousedown", mouseInit));
        if (typeof PointerEvent !== "undefined") {
          interactive.dispatchEvent(
            new PointerEvent("pointerup", {
              ...mouseInit,
              buttons: 0,
              pointerId: 1,
              isPrimary: true,
            })
          );
        }
        interactive.dispatchEvent(new MouseEvent("mouseup", { ...mouseInit, buttons: 0 }));
      } catch {}
      interactive.click();
    };

    const triggerSecondaryContextMenu = () => {
      const { el, x, y } = resolveGamepadTarget();
      if (!el) return;
      el.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 2,
          buttons: 2,
          clientX: x,
          clientY: y,
        })
      );
    };

    const triggerGamepadBack = () => {
      // 1. Close open ContextMenu / CustomDropdown / FilterPopover / overflow menus first
      if (getOpenPopovers().length > 0) {
        closeSanctuaryContextMenu();
        window.dispatchEvent(new CustomEvent("sa-close-popovers", { detail: "gamepad-back" }));
        const backdrops = document.querySelectorAll<HTMLElement>(
          'div.fixed.inset-0[style*="z-index: 200000"], div.fixed.inset-0[style*="z-index: 100000000"]'
        );
        backdrops.forEach((b) => b.click());
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        clearGamepadFocus();
        return;
      }

      // 2. Blur active text input
      if (isEditableElementFocused()) {
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }

      // 3. Click close button on topmost dismissible SidePanel (respects hideCloseButton security gates)
      const topPanel = getTopmostOpenSidePanel();
      if (topPanel) {
        const closeBtn = topPanel.querySelector<HTMLButtonElement>(
          '[data-sa-panel-close="true"] button'
        );
        if (closeBtn && !closeBtn.disabled) {
          clearGamepadFocus();
          closeBtn.click();
        }
        return;
      }

      // 4. Fallback Escape event for standard modals
      clearGamepadFocus();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    };

    const triggerQuickSearchOrOsk = () => {
      const topPanel = getTopmostOpenSidePanel();
      const scope =
        topPanel || document.getElementById("sanctuary-os-shell") || document.body;
      const inputs = Array.from(
        scope.querySelectorAll<HTMLInputElement>(
          'input[type="search"]:not(:disabled), input[type="text"]:not(:disabled), input:not([type]):not(:disabled)'
        )
      ).filter((inp) => {
        if (!topPanel && inp.closest(".sa-side-panel-wrapper")) return false;
        const rect = inp.getBoundingClientRect();
        return rect.width > 24 && rect.height > 14;
      });

      if (inputs.length > 0) {
        const target = inputs[0];
        clearGamepadFocus();
        target.setAttribute("data-sa-gamepad-focus", "true");
        target.focus();
        target.select?.();
        if (isLinuxDesktop()) {
          invoke("open_steam_osk").catch(() => {});
        }
        return;
      }

      padStateRef.current.openPalette();
    };

    const ensureStickRafRunning = () => {
      if (stickRafIdRef.current !== null || typeof window === "undefined") return;
      lastStickRafAtRef.current = performance.now();

      const stepFrame = (nowPerf: number) => {
        const dt = Math.min(48, Math.max(8, nowPerf - lastStickRafAtRef.current));
        lastStickRafAtRef.current = nowPerf;
        const dtScale = dt / 16.667;

        const st = padStateRef.current;
        const { lx, ly, rx, ry } = activeStickAxesRef.current;
        const leftMag = Math.hypot(lx, ly);
        const rightMag = Math.hypot(rx, ry);

        if (st.isOpen || (leftMag <= 0.16 && rightMag <= 0.16)) {
          stickRafIdRef.current = null;
          return;
        }

        // Left Stick -> Smooth 60 FPS Virtual Pointer
        if (leftMag > 0.16) {
          const norm = Math.min(1, (leftMag - 0.16) / 0.84);
          const speed = (norm * 4.6 + Math.pow(norm, 2.35) * 14.4) * dtScale;
          const unitX = lx / leftMag;
          const unitY = ly / leftMag;
          revealAndPositionPointer(
            pointerPosRef.current.x + unitX * speed,
            pointerPosRef.current.y + unitY * speed
          );
        }

        // Right Stick -> Smooth 60 FPS Vertical & Horizontal Scroll
        if (rightMag > 0.18) {
          const origin = resolveGamepadTarget().el;
          const dy = Math.abs(ry) > 0.18 ? ry * 17.5 * dtScale : 0;
          const dx = Math.abs(rx) > 0.22 ? rx * 15.5 * dtScale : 0;
          scrollActiveViewport(dy, dx, origin);
        }

        stickRafIdRef.current = window.requestAnimationFrame(stepFrame);
      };

      stickRafIdRef.current = window.requestAnimationFrame(stepFrame);
    };

    const onRealMouseMove = (e: MouseEvent) => {
      if (!e.isTrusted) return;
      if (Math.abs(e.movementX) < 2 && Math.abs(e.movementY) < 2) return;
      lastRealMouseAtRef.current = Date.now();
      pointerPosRef.current = { x: e.clientX, y: e.clientY };
      hideVirtualPointer();
      clearGamepadFocus();
    };

    const onRealTouchStart = (e: TouchEvent) => {
      if (!e.isTrusted) return;
      hideVirtualPointer();
      clearGamepadFocus();
    };

    window.addEventListener("mousemove", onRealMouseMove, { passive: true });
    window.addEventListener("touchstart", onRealTouchStart, { passive: true });

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
      const newlyReleasedIndices: number[] = [];
      const maxLen = Math.max(currButtons.length, prevButtons.length);

      for (let idx = 0; idx < maxLen; idx++) {
        const isDown = Boolean(currButtons[idx]);
        const wasDown = Boolean(prevButtons[idx]);
        if (isDown) {
          pressedIndices.push(idx);
          if (!wasDown) newlyPressedIndices.push(idx);
        } else if (wasDown) {
          newlyReleasedIndices.push(idx);
        }
      }

      prevPadButtonsRef.current = currButtons.slice();

      if (pressedIndices.length === 0) {
        chordFiredDuringHoldRef.current = false;
      }

      activeStickAxesRef.current = {
        lx: axes?.[0] ?? 0,
        ly: axes?.[1] ?? 0,
        rx: axes?.[2] ?? 0,
        ry: axes?.[3] ?? 0,
      };
      if (!st.isOpen) {
        ensureStickRafRunning();
      }

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

      const now = Date.now();

      // Check Toggle Palette chord/button (e.g. L1 + R1) OR Steam Deck Menu/Start button (9)
      const matchesToggleChord =
        newlyPressedIndices.length > 0 &&
        checkGamepadCombo(pressedIndices, st.controllerBindings.togglePalette);
      const matchesMenuStartButton =
        newlyPressedIndices.includes(9) && pressedIndices.length === 1;

      if (matchesToggleChord || matchesMenuStartButton) {
        chordFiredDuringHoldRef.current = true;
        bumperSoloCandidateRef.current = null;
        clearGamepadFocus();
        hideVirtualPointer();
        setIsOpen((prev: any) => {
          const next = !prev;
          if (next) {
            setSelectedIndex(0);
            if (getAutoOpenKeyboardPref() && isLinuxDesktop()) {
              invoke("open_steam_osk").catch(() => {});
            }
          } else {
            setIsControlsOpen(false);
          }
          return next;
        });
        return;
      }

      // =========================================================================
      // FULL SANCTUARY OS CONTROLLER NAVIGATION (When Command Matrix is Closed)
      // =========================================================================
      if (!st.isOpen) {
        // 1. Bumper Tab Cycling (L1 = 4, R1 = 5 on clean single release without L1+R1 chord)
        if (
          (newlyPressedIndices.includes(4) || newlyPressedIndices.includes(5)) &&
          pressedIndices.length === 1
        ) {
          const btn = newlyPressedIndices.includes(4) ? 4 : 5;
          bumperSoloCandidateRef.current = { btn, at: now };
        } else if (pressedIndices.length > 1) {
          bumperSoloCandidateRef.current = null;
        }

        const solo = bumperSoloCandidateRef.current;
        if (
          solo &&
          newlyReleasedIndices.includes(solo.btn) &&
          !chordFiredDuringHoldRef.current &&
          now - solo.at < 650
        ) {
          bumperSoloCandidateRef.current = null;
          cycleActiveViewTab(solo.btn === 5 ? 1 : -1);
          return;
        }

        // 2. D-Pad 2D Spatial Focus Navigation (Up=12, Down=13, Left=14, Right=15 + Hold Repeat)
        const dpadOrder: { idx: number; dir: "up" | "down" | "left" | "right" }[] = [
          { idx: 12, dir: "up" },
          { idx: 13, dir: "down" },
          { idx: 14, dir: "left" },
          { idx: 15, dir: "right" },
        ];
        const heldDpad = dpadOrder.find((d) => pressedIndices.includes(d.idx)) || null;
        if (heldDpad) {
          const isNewDpad = newlyPressedIndices.includes(heldDpad.idx);
          const holdState = dpadHoldStateRef.current;
          if (isNewDpad || holdState.btn !== heldDpad.idx) {
            dpadHoldStateRef.current = {
              btn: heldDpad.idx,
              startedAt: now,
              lastRepeatAt: now,
            };
            const anchor = isPointerVisibleRef.current ? pointerPosRef.current : null;
            hideVirtualPointer();
            const focused = moveSpatialFocus(heldDpad.dir, anchor);
            if (focused) {
              const r = focused.getBoundingClientRect();
              pointerPosRef.current = {
                x: r.left + r.width * 0.5,
                y: r.top + r.height * 0.5,
              };
            }
          } else if (
            now - holdState.startedAt > 310 &&
            now - holdState.lastRepeatAt > 140
          ) {
            dpadHoldStateRef.current.lastRepeatAt = now;
            const focused = moveSpatialFocus(heldDpad.dir, null);
            if (focused) {
              const r = focused.getBoundingClientRect();
              pointerPosRef.current = {
                x: r.left + r.width * 0.5,
                y: r.top + r.height * 0.5,
              };
            }
          }
        } else {
          dpadHoldStateRef.current.btn = null;
        }

        if (newlyPressedIndices.length === 0) return;

        // 3. Primary Select / Click: A (0) or R2 Trigger (7)
        if (newlyPressedIndices.includes(0) || newlyPressedIndices.includes(7)) {
          triggerPrimaryClick();
          return;
        }

        // 4. Right-Click Context Menu: L2 Trigger (6) or X (2)
        if (newlyPressedIndices.includes(6) || newlyPressedIndices.includes(2)) {
          triggerSecondaryContextMenu();
          return;
        }

        // 5. Universal Back / Close Drawer / Close Popover: B (1)
        if (newlyPressedIndices.includes(1)) {
          triggerGamepadBack();
          return;
        }

        // 6. Quick Search Focus + Steam OSK (or Summon Command Matrix): Y (3)
        if (newlyPressedIndices.includes(3)) {
          triggerQuickSearchOrOsk();
          return;
        }

        return;
      }

      // =========================================================================
      // INSIDE OPEN COMMAND MATRIX: D-Pad & Left Stick 2D Grid Navigation
      // =========================================================================
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
        setSelectedIndex((prev: any) => {
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
        setActiveTab((prev: any) => order[(order.indexOf(prev) + 1) % order.length]);
        return;
      }

      // Previous Tab
      if (checkGamepadCombo(pressedIndices, st.controllerBindings.prevTab)) {
        const order: CommandCategory[] = ["all", "views", "vault", "actions"];
        setActiveTab((prev: any) => order[(order.indexOf(prev) - 1 + order.length) % order.length]);
        return;
      }

      // Execute Item (Configured Button or R2 Trigger)
      if (
        !st.isControlsOpen &&
        (checkGamepadCombo(pressedIndices, st.controllerBindings.executeItem) ||
          newlyPressedIndices.includes(7))
      ) {
        const target = st.filteredItems[st.selectedIndex];
        if (target) target.onSelect();
        return;
      }

      // Summon On-Screen Keyboard
      if (
        !st.isControlsOpen &&
        st.controllerBindings.openKeyboard &&
        checkGamepadCombo(pressedIndices, st.controllerBindings.openKeyboard)
      ) {
        if (isLinuxDesktop()) {
          invoke("open_steam_osk").catch(() => {});
        }
        window.setTimeout(() => {
          inputRef.current?.focus();
        }, 20);
        return;
      }

      // Secondary Action (Configured Button or L2 Trigger)
      if (
        !st.isControlsOpen &&
        (checkGamepadCombo(pressedIndices, st.controllerBindings.secondaryAction) ||
          newlyPressedIndices.includes(6))
      ) {
        const target = st.filteredItems[st.selectedIndex];
        if (target?.secondaryAction) {
          target.secondaryAction.onClick({ stopPropagation: () => {} } as React.MouseEvent);
        }
      }
    };

    let unlistenNative: (() => void) | null = null;
    let unlistenNativeScroll: (() => void) | null = null;
    let unlistenNativePointer: (() => void) | null = null;

    if (isDesktop()) {
      listen<{ deltaY?: number; deltaX?: number }>("sanctuary-native-scroll", (event) => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        const now = Date.now();
        if (now - lastTouchAtRef.current < 450 || now - lastDomWheelAtRef.current < 240) return;
        const deltaY = Number(event.payload?.deltaY || 0);
        const deltaX = Number(event.payload?.deltaX || 0);
        if (Math.abs(deltaY) > 0.4 || Math.abs(deltaX) > 0.4) {
          const origin = resolveGamepadTarget().el;
          scrollActiveViewport(deltaY, deltaX, origin);
        }
      })
        .then((fn) => {
          unlistenNativeScroll = fn;
        })
        .catch(() => {});

      listen<{ dx?: number; dy?: number; click?: boolean }>(
        "sanctuary-native-pointer",
        (event) => {
          if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
          // Ignore if Steam Input is already driving the XWayland OS mouse cursor
          if (Date.now() - lastRealMouseAtRef.current < 180) return;
          const dx = Number(event.payload?.dx || 0);
          const dy = Number(event.payload?.dy || 0);
          if (Math.abs(dx) >= 0.3 || Math.abs(dy) >= 0.3) {
            revealAndPositionPointer(
              pointerPosRef.current.x + dx,
              pointerPosRef.current.y + dy
            );
          }
          if (event.payload?.click) {
            triggerPrimaryClick();
          }
        }
      )
        .then((fn) => {
          unlistenNativePointer = fn;
        })
        .catch(() => {});

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
          activeStickAxesRef.current = { lx: 0, ly: 0, rx: 0, ry: 0 };
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
          webPad =
            Array.from(pads || []).find((p): p is Gamepad => Boolean(p && p.connected)) || null;
        } catch {
          webPad = null;
        }
      }

      const nativePad = nativePadRef.current;
      const webPadHasActiveInput = Boolean(
        webPad &&
          (webPad.buttons.some((b) => Boolean(b?.pressed)) ||
            webPad.axes.some((a) => Math.abs(a) > 0.16))
      );

      // On Linux / Steam Deck, WebKitGTK can expose an idle stub Gamepad object that never updates
      // under Gamescope; never allow an idle webPad to mask an active Rust nativePad stream.
      if (webPad && (!nativePad?.connected || webPadHasActiveInput)) {
        processGamepadFrame(
          webPad.id,
          webPad.buttons.map((b) => Boolean(b?.pressed)),
          webPad.axes
        );
        return;
      }

      if (nativePad && nativePad.connected) {
        const hasHeldInput =
          (nativePad.buttons && nativePad.buttons.some(Boolean)) ||
          (nativePad.axes && nativePad.axes.some((a) => Math.abs(a) > 0.16));
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
      activeStickAxesRef.current = { lx: 0, ly: 0, rx: 0, ry: 0 };
    }, 45);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("mousemove", onRealMouseMove);
      window.removeEventListener("touchstart", onRealTouchStart);
      if (stickRafIdRef.current !== null) {
        window.cancelAnimationFrame(stickRafIdRef.current);
      }
      if (pointerHideTimerRef.current !== null) {
        window.clearTimeout(pointerHideTimerRef.current);
      }
      if (unlistenNative) unlistenNative();
      if (unlistenNativeScroll) unlistenNativeScroll();
      if (unlistenNativePointer) unlistenNativePointer();
    };
  }, []);

  const navigateGridByKey = useCallback((key: string, shiftKey = false): boolean => {
    const st = padStateRef.current;
    const total = st.filteredItems.length;
    const cols = typeof window !== "undefined" && window.innerWidth >= 768 ? 2 : 1;

    if (key === "ArrowDown") {
      if (total > 0) {
        setSelectedIndex((prev: any) => {
          const next = prev + cols;
          return next < total ? next : prev % cols;
        });
      }
      return true;
    }
    if (key === "ArrowUp") {
      if (total > 0) {
        setSelectedIndex((prev: any) => {
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
        setSelectedIndex((prev: any) => (prev + 1) % total);
      }
      return true;
    }
    if (key === "ArrowLeft") {
      if (total > 0) {
        setSelectedIndex((prev: any) => (prev - 1 + total) % total);
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


  return {
    isPointerVisible,
    pointerPosRef,
    cursorElRef,
    padStateRef,
    navigateGridByKey,
  };
}
