import { create } from 'zustand';
import React from 'react';

export interface TooltipData {
  title: string;
  subtitle?: string;
  variant?: 'danger' | 'info' | 'accent' | 'warning' | 'default';
  className?: string;
  noIcon?: boolean;
  icon?: string;
  normalFont?: boolean;
  x: number;
  y: number;
  align?: 'center' | 'left' | 'right';
  vAlign?: 'top' | 'bottom';
  content?: React.ReactNode;
}

interface TooltipState {
  tooltip: TooltipData | null;
  setTooltip: (tooltip: TooltipData | null) => void;
  clearTooltip: () => void;
}

let globalTimeoutId: any;

export const useTooltipStore = create<TooltipState>((set) => ({
  tooltip: null,
  setTooltip: (tooltip) => {
    clearTimeout(globalTimeoutId);
    set({ tooltip });
  },
  clearTooltip: () => {
    clearTimeout(globalTimeoutId);
    globalTimeoutId = setTimeout(() => {
      set({ tooltip: null });
    }, 50);
  }
}));
