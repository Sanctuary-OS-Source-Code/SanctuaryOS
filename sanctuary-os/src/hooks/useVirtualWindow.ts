import { useState, useEffect, useRef, useCallback, useMemo } from "react";

export interface VirtualWindowOptions {
  /** Total number of items in the dataset. */
  count: number;
  /** Estimated height of a single item/row in pixels (excluding row gap). */
  estimateSize?: number;
  /** Vertical gap between rows in pixels (default: 16). */
  gap?: number;
  /** Number of extra rows to render above and below the viewport (default: 4). */
  overscan?: number;
  /** Minimum item count before virtualization engages (default: 60). */
  threshold?: number;
  /** Explicit column count, or leave undefined to auto-detect from `gridRef` CSS Grid tracks. */
  columns?: number;
  /** Optional explicit scroll container ref; auto-detected from DOM ancestors when omitted. */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

export interface VirtualWindowResult {
  /** Attach to the outer wrapper around `topPadding`, the list/grid container, and `bottomPadding`. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Attach to the inner CSS Grid or flex list element to auto-detect column count & row stride. */
  gridRef: React.RefObject<HTMLDivElement | null>;
  /** Inclusive start index into `items`. */
  startIndex: number;
  /** Exclusive end index into `items` (`items.slice(startIndex, endIndex)`). */
  endIndex: number;
  /** Spacer height in px to render above the visible slice. */
  topPadding: number;
  /** Spacer height in px to render below the visible slice. */
  bottomPadding: number;
  /** Whether windowing is currently active (`count > threshold`). */
  isVirtualized: boolean;
  /** Resolved number of columns per row. */
  columns: number;
}

function findNearestScrollableAncestor(el: HTMLElement | null): HTMLElement | Window {
  if (typeof window === "undefined" || !el) return typeof window !== "undefined" ? window : (null as any);
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY || style.overflow || "";
    if (/(auto|scroll|overlay)/i.test(overflowY) && node.clientHeight > 0) {
      return node;
    }
    node = node.parentElement;
  }
  const mainScroll = document.getElementById("sanctuary-main-scroll");
  if (mainScroll && mainScroll.contains(el)) {
    const style = window.getComputedStyle(mainScroll);
    if (/(auto|scroll|overlay)/i.test(style.overflowY || style.overflow || "")) {
      return mainScroll;
    }
  }
  return window;
}

function detectGridColumns(gridEl: HTMLElement | null, explicitColumns?: number): number {
  if (explicitColumns && explicitColumns > 0) return Math.max(1, Math.floor(explicitColumns));
  if (typeof window === "undefined" || !gridEl) return 1;
  const style = window.getComputedStyle(gridEl);
  if (!style.display || !style.display.includes("grid")) return 1;
  const template = style.gridTemplateColumns;
  if (!template || template === "none") return 1;
  const tracks = template
    .trim()
    .split(/\s+/)
    .filter((part) => part && part !== "0px");
  return Math.max(1, tracks.length);
}

export function useVirtualWindow({
  count,
  estimateSize = 220,
  gap = 16,
  overscan = 4,
  threshold = 60,
  columns: explicitColumns,
  scrollContainerRef,
}: VirtualWindowOptions): VirtualWindowResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const isVirtualized = count > threshold;
  const [resolvedColumns, setResolvedColumns] = useState<number>(() =>
    explicitColumns && explicitColumns > 0 ? Math.max(1, Math.floor(explicitColumns)) : 1
  );
  const measuredRowHeightRef = useRef<{ cols: number; stride: number } | null>(null);
  const [windowRange, setWindowRange] = useState<{ startRow: number; endRow: number }>({
    startRow: 0,
    endRow: Math.ceil(Math.min(count, threshold) / Math.max(1, explicitColumns || 1)),
  });

  const effectiveStride = useMemo(() => {
    const fallback = Math.max(32, estimateSize + gap);
    if (
      measuredRowHeightRef.current &&
      measuredRowHeightRef.current.cols === resolvedColumns &&
      measuredRowHeightRef.current.stride > 24
    ) {
      return measuredRowHeightRef.current.stride;
    }
    return fallback;
  }, [estimateSize, gap, resolvedColumns]);

  const recompute = useCallback(() => {
    if (!isVirtualized) return;
    const containerEl = containerRef.current;
    if (!containerEl || typeof window === "undefined") return;

    const cols = detectGridColumns(gridRef.current, explicitColumns);
    setResolvedColumns((prev) => (prev === cols ? prev : cols));

    const totalRows = Math.max(1, Math.ceil(count / cols));

    // Opportunistically calibrate row stride once per column-layout from rendered DOM rows
    const gridEl = gridRef.current;
    if (
      gridEl &&
      gridEl.children.length >= cols &&
      (!measuredRowHeightRef.current || measuredRowHeightRef.current.cols !== cols)
    ) {
      const firstChild = gridEl.children[0] as HTMLElement | undefined;
      if (firstChild) {
        const h = firstChild.getBoundingClientRect().height;
        if (h > 24) {
          measuredRowHeightRef.current = { cols, stride: Math.round(h + gap) };
        }
      }
    }

    const stride =
      measuredRowHeightRef.current && measuredRowHeightRef.current.cols === cols
        ? measuredRowHeightRef.current.stride
        : Math.max(32, estimateSize + gap);

    const scrollTarget: HTMLElement | Window =
      scrollContainerRef?.current || findNearestScrollableAncestor(containerEl);

    const containerRect = containerEl.getBoundingClientRect();
    let viewportTop = 0;
    let viewportHeight = window.innerHeight || 900;

    if (scrollTarget !== window && scrollTarget instanceof HTMLElement) {
      const scrollRect = scrollTarget.getBoundingClientRect();
      viewportTop = scrollRect.top;
      viewportHeight = scrollTarget.clientHeight || scrollRect.height || viewportHeight;
    }

    const visibleStartPx = Math.max(0, viewportTop - containerRect.top);
    const visibleEndPx = Math.max(0, viewportTop + viewportHeight - containerRect.top);

    const nextStartRow = Math.max(0, Math.floor(visibleStartPx / stride) - overscan);
    const nextEndRow = Math.min(
      totalRows,
      Math.max(nextStartRow + overscan * 2 + 2, Math.ceil(visibleEndPx / stride) + overscan)
    );

    setWindowRange((prev) =>
      prev.startRow === nextStartRow && prev.endRow === nextEndRow
        ? prev
        : { startRow: nextStartRow, endRow: nextEndRow }
    );
  }, [count, estimateSize, explicitColumns, gap, isVirtualized, overscan, scrollContainerRef]);

  useEffect(() => {
    if (!isVirtualized || typeof window === "undefined") return;
    const containerEl = containerRef.current;
    if (!containerEl) return;

    const scrollTarget: HTMLElement | Window =
      scrollContainerRef?.current || findNearestScrollableAncestor(containerEl);

    let rafId: number | null = null;
    const scheduleRecompute = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        recompute();
      });
    };

    recompute();

    scrollTarget.addEventListener("scroll", scheduleRecompute, { passive: true });
    window.addEventListener("resize", scheduleRecompute, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        measuredRowHeightRef.current = null;
        scheduleRecompute();
      });
      ro.observe(containerEl);
      if (gridRef.current && gridRef.current !== containerEl) {
        ro.observe(gridRef.current);
      }
      if (scrollTarget !== window && scrollTarget instanceof HTMLElement) {
        ro.observe(scrollTarget);
      }
    }

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      scrollTarget.removeEventListener("scroll", scheduleRecompute);
      window.removeEventListener("resize", scheduleRecompute);
      if (ro) ro.disconnect();
    };
  }, [isVirtualized, recompute, scrollContainerRef]);

  // Re-evaluate immediately when item count changes while virtualized
  useEffect(() => {
    if (isVirtualized) {
      recompute();
    }
  }, [count, isVirtualized, recompute]);

  if (!isVirtualized) {
    return {
      containerRef,
      gridRef,
      startIndex: 0,
      endIndex: count,
      topPadding: 0,
      bottomPadding: 0,
      isVirtualized: false,
      columns: resolvedColumns,
    };
  }

  const cols = Math.max(1, resolvedColumns);
  const totalRows = Math.max(1, Math.ceil(count / cols));
  const clampedStartRow = Math.min(windowRange.startRow, Math.max(0, totalRows - 1));
  const clampedEndRow = Math.min(totalRows, Math.max(clampedStartRow + 1, windowRange.endRow));

  const startIndex = Math.min(count, clampedStartRow * cols);
  const endIndex = Math.min(count, clampedEndRow * cols);
  const topPadding = clampedStartRow * effectiveStride;
  const bottomPadding = Math.max(0, (totalRows - clampedEndRow) * effectiveStride);

  return {
    containerRef,
    gridRef,
    startIndex,
    endIndex,
    topPadding,
    bottomPadding,
    isVirtualized: true,
    columns: cols,
  };
}
