export interface DropdownViewportCoords {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  isRight: boolean;
  isDropUp: boolean;
}

export function computeDropdownViewportCoords(
  rect: DOMRect,
  opts: {
    preferredHeight?: number;
    minWidth?: number;
    alignRight?: boolean;
    forceDropUp?: boolean;
    gap?: number;
    margin?: number;
  } = {},
): DropdownViewportCoords {
  const margin = opts.margin ?? 12;
  const gap = opts.gap ?? 6;
  const preferredHeight = opts.preferredHeight ?? 300;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const spaceBelow = Math.max(0, vh - rect.bottom - margin - gap);
  const spaceAbove = Math.max(0, rect.top - margin - gap);
  const shouldDropUp =
    opts.forceDropUp !== undefined
      ? opts.forceDropUp
      : spaceBelow < preferredHeight && spaceAbove > spaceBelow;

  const availableVertical = shouldDropUp ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(120, Math.min(preferredHeight, availableVertical));

  const minW = opts.minWidth ?? 220;
  const menuWidth = Math.min(Math.max(rect.width, minW), Math.max(160, vw - margin * 2));
  const wouldOverflowRight = rect.left + menuWidth > vw - margin;
  const preferredLeft =
    (opts.alignRight || wouldOverflowRight) && rect.right - menuWidth >= margin
      ? rect.right - menuWidth
      : rect.left;
  const clampedLeft = Math.max(margin, Math.min(preferredLeft, vw - menuWidth - margin));

  return {
    top: shouldDropUp ? rect.top - gap : rect.bottom + gap,
    left: clampedLeft,
    width: menuWidth,
    maxHeight,
    isRight: false,
    isDropUp: shouldDropUp,
  };
}

