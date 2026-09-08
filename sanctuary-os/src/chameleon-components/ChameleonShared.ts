export const HexToRGB = (hex: string) => {
  const cleanHex = (hex || '#000000').replace('#', '').padEnd(6, '0').slice(0, 6);
  const r = parseInt(cleanHex.slice(0, 2), 16) || 0;
  const g = parseInt(cleanHex.slice(2, 4), 16) || 0;
  const b = parseInt(cleanHex.slice(4, 6), 16) || 0;
  return { r, g, b };
}

export const RGBToHex = (r: number, g: number, b: number) => {
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase()}`;
}

export const PRESET_COLORS = [
  '#000000', '#1a1a1a', '#2a2a2a', '#3a3a3a', '#555555', '#888888',
  '#f5f5f5', '#e0e0e0', '#cccccc', '#ffffff', '#ffcc00', '#4cd964',
  '#5ac8fa', '#007aff', '#5856d6', '#ff2d55', '#ff3b30', '#ff9500',
  '#ff4444', '#00c851', '#33b5e5', '#ffbb33', '#00ffff', '#ff00ff'
];

export const SEMANTIC_SHADES: Record<string, string[]> = {
  success: [
    '#052e16', '#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac',
    '#022c22', '#064e3b', '#065f46', '#047857', '#059669', '#10b981', '#34d399', '#6ee7b7'
  ],
  warning: [
    '#451a03', '#713f12', '#854d0e', '#a16207', '#ca8a04', '#eab308', '#facc15', '#fde047',
    '#422006', '#78350f', '#92400e', '#b45309', '#d97706', '#f59e0b', '#fbbf24', '#fcd34d'
  ],
  danger: [
    '#450a0a', '#7f1d1d', '#991b1b', '#b91c1c', '#dc2626', '#ef4444', '#f87171', '#fca5a5',
    '#4c0519', '#881337', '#9f1239', '#be123c', '#e11d48', '#f43f5e', '#fb7185', '#fda4af'
  ]
};

export const themeKeys = ['bg', 'sidebar', 'sidebartext', 'accent', 'text', 'subtext', 'panelTint', 'headerText', 'success', 'warning', 'danger'];
