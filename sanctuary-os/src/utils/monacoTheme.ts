import { useEffect } from 'react';

function parseColorToRgb(input: string, fallback: [number, number, number]): [number, number, number] {
  if (!input || input === 'transparent') return fallback;
  const trimmed = input.trim();

  if (trimmed.startsWith('#')) {
    const clean = trimmed.slice(1);
    if (clean.length === 3) {
      const r = parseInt(clean[0] + clean[0], 16);
      const g = parseInt(clean[1] + clean[1], 16);
      const b = parseInt(clean[2] + clean[2], 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
    } else if (clean.length >= 6) {
      const r = parseInt(clean.slice(0, 2), 16);
      const g = parseInt(clean.slice(2, 4), 16);
      const b = parseInt(clean.slice(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
    }
  }

  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i);
  if (rgbMatch) {
    return [
      Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10))),
      Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10))),
      Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10))),
    ];
  }

  return fallback;
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const to2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  weightB: number
): [number, number, number] {
  const w = Math.max(0, Math.min(1, weightB));
  return [
    a[0] * (1 - w) + b[0] * w,
    a[1] * (1 - w) + b[1] * w,
    a[2] * (1 - w) + b[2] * w,
  ];
}

function withAlpha(hex6: string, alphaHex: string): string {
  const clean = hex6.startsWith('#') ? hex6.slice(0, 7) : `#${hex6.slice(0, 6)}`;
  return `${clean}${alphaHex}`;
}

export function isThemeLight(currentTheme?: any): boolean {
  const rootStyle = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const rawBg =
    currentTheme?.bg ||
    rootStyle?.getPropertyValue('--bg').trim() ||
    '#0a0d14';
  if (!rawBg || rawBg === 'transparent') return false;
  const [r, g, b] = parseColorToRgb(rawBg, [10, 13, 20]);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128;
}

export function defineSanctuaryMonacoThemes(monaco: any, currentTheme?: any) {
  if (!monaco?.editor?.defineTheme) return;

  const rootStyle = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const getVar = (prop: string, themeKey: string, fallback: string) =>
    (currentTheme && currentTheme[themeKey]) ||
    rootStyle?.getPropertyValue(prop).trim() ||
    fallback;

  const rawBg = getVar('--bg', 'bg', '#0a0d14');
  const rawPanelTint = getVar('--panelTint', 'panelTint', '#1e293b');
  const rawText = getVar('--text', 'text', '#f8fafc');
  const rawSubtext = getVar('--subtext', 'subtext', '#94a3b8');
  const rawAccent = getVar('--accent', 'accent', '#38bdf8');
  const rawSuccess = getVar('--success', 'success', '#10b981');
  const rawWarning = getVar('--warning', 'warning', '#f59e0b');
  const rawDanger = getVar('--danger', 'danger', '#ef4444');

  const bgRgb = parseColorToRgb(rawBg === 'transparent' ? '#0f172a' : rawBg, [15, 23, 42]);
  const tintRgb = parseColorToRgb(rawPanelTint, [30, 41, 59]);
  const accentRgb = parseColorToRgb(rawAccent, [56, 189, 248]);
  const textRgb = parseColorToRgb(rawText, [248, 250, 252]);
  const subtextRgb = parseColorToRgb(rawSubtext, [148, 163, 184]);
  const successRgb = parseColorToRgb(rawSuccess, [16, 185, 129]);
  const warningRgb = parseColorToRgb(rawWarning, [245, 158, 11]);
  const dangerRgb = parseColorToRgb(rawDanger, [239, 68, 68]);

  const lightMode = isThemeLight(currentTheme);

  // Build a non-black smoked crystal surface color for dark themes so widgets never render pure #000000
  const darkBaseRgb: [number, number, number] =
    bgRgb[0] + bgRgb[1] + bgRgb[2] < 24 ? [15, 23, 42] : bgRgb;
  const tintYiq = (tintRgb[0] * 299 + tintRgb[1] * 587 + tintRgb[2] * 114) / 1000;
  const darkTintedBase = tintYiq < 160 ? mixRgb(darkBaseRgb, tintRgb, 0.35) : darkBaseRgb;
  const darkSurfaceHex = rgbToHex(mixRgb(darkTintedBase, accentRgb, 0.14));

  const lightBaseRgb: [number, number, number] =
    bgRgb[0] + bgRgb[1] + bgRgb[2] > 380 ? bgRgb : [248, 250, 252];
  const lightSurfaceHex = rgbToHex(mixRgb(lightBaseRgb, accentRgb, 0.06));

  const accentHex = rgbToHex(accentRgb);
  const successHex = rgbToHex(successRgb);
  const warningHex = rgbToHex(warningRgb);
  const dangerHex = rgbToHex(dangerRgb);

  const darkTextHex = lightMode ? '#f8fafc' : rgbToHex(textRgb);
  const darkSubtextHex = lightMode ? '#94a3b8' : rgbToHex(subtextRgb);
  const darkNumberHex = rgbToHex(mixRgb(accentRgb, [167, 139, 250], 0.55));
  const darkBooleanHex = rgbToHex(mixRgb(accentRgb, [129, 140, 248], 0.5));

  const lightTextHex = lightMode ? rgbToHex(textRgb) : '#0f172a';
  const lightSubtextHex = lightMode ? rgbToHex(subtextRgb) : '#475569';
  const lightNumberHex = rgbToHex(mixRgb(accentRgb, [124, 58, 237], 0.55));
  const lightBooleanHex = rgbToHex(mixRgb(accentRgb, [79, 70, 229], 0.5));

  monaco.editor.defineTheme('sanctuary-glass-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: darkTextHex.slice(1) },
      { token: 'string', foreground: darkTextHex.slice(1) },
      { token: 'string.key.json', foreground: accentHex.slice(1) },
      { token: 'string.value.json', foreground: darkTextHex.slice(1) },
      { token: 'keyword', foreground: accentHex.slice(1) },
      { token: 'number', foreground: darkNumberHex.slice(1) },
      { token: 'boolean', foreground: darkBooleanHex.slice(1) },
      { token: 'comment', foreground: darkSubtextHex.slice(1), fontStyle: 'italic' },
      { token: 'type', foreground: successHex.slice(1) },
      { token: 'identifier', foreground: darkTextHex.slice(1) },
    ],
    colors: {
      'editor.background': '#00000000',
      'editor.foreground': darkTextHex,
      'editor.lineHighlightBackground': withAlpha(accentHex, '12'),
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': withAlpha(accentHex, '30'),
      'editor.inactiveSelectionBackground': withAlpha(accentHex, '18'),
      'editor.findMatchBackground': withAlpha(accentHex, '38'),
      'editor.findMatchHighlightBackground': withAlpha(accentHex, '20'),
      'editor.findMatchBorder': withAlpha(accentHex, '80'),
      'editor.findMatchHighlightBorder': withAlpha(accentHex, '40'),
      'editorLineNumber.foreground': withAlpha(darkSubtextHex, '78'),
      'editorLineNumber.activeForeground': accentHex,
      'editorIndentGuide.background': withAlpha(darkTextHex, '12'),
      'editorIndentGuide.activeBackground': withAlpha(accentHex, '45'),
      'editorStickyScroll.background': withAlpha(darkSurfaceHex, '88'),
      'editorStickyScrollHover.background': withAlpha(accentHex, '22'),
      'editorStickyScroll.border': withAlpha(darkTextHex, '1a'),
      'editorStickyScroll.shadow': '#00000033',
      'editorWidget.background': withAlpha(darkSurfaceHex, '99'),
      'editorWidget.foreground': darkTextHex,
      'editorWidget.border': withAlpha(accentHex, '38'),
      'editorWidget.resizeBorder': withAlpha(accentHex, '55'),
      'editorSuggestWidget.background': withAlpha(darkSurfaceHex, 'b8'),
      'editorSuggestWidget.border': withAlpha(accentHex, '38'),
      'editorSuggestWidget.foreground': darkTextHex,
      'editorSuggestWidget.selectedBackground': withAlpha(accentHex, '2e'),
      'editorSuggestWidget.highlightForeground': accentHex,
      'editorHoverWidget.background': withAlpha(darkSurfaceHex, 'd8'),
      'editorHoverWidget.foreground': darkTextHex,
      'editorHoverWidget.border': withAlpha(accentHex, '45'),
      'editorHoverWidget.statusBarBackground': withAlpha(darkSurfaceHex, 'cc'),
      'quickInput.background': withAlpha(darkSurfaceHex, 'b8'),
      'quickInput.foreground': darkTextHex,
      'quickInputTitle.background': withAlpha(darkSurfaceHex, '66'),
      'quickInputList.focusBackground': withAlpha(accentHex, '2e'),
      'quickInputList.focusForeground': accentHex,
      'list.activeSelectionBackground': withAlpha(accentHex, '2e'),
      'list.activeSelectionForeground': accentHex,
      'list.hoverBackground': withAlpha(accentHex, '18'),
      'list.hoverForeground': darkTextHex,
      'list.focusBackground': withAlpha(accentHex, '26'),
      'input.background': withAlpha(darkTextHex, '10'),
      'input.foreground': darkTextHex,
      'input.border': withAlpha(darkTextHex, '20'),
      'input.placeholderForeground': withAlpha(darkSubtextHex, '99'),
      'inputOption.activeBackground': withAlpha(accentHex, '28'),
      'inputOption.activeBorder': withAlpha(accentHex, '66'),
      'inputOption.activeForeground': accentHex,
      'inputOption.hoverBackground': withAlpha(accentHex, '18'),
      'focusBorder': withAlpha(accentHex, '55'),
      'minimap.background': '#00000000',
      'minimap.findMatchHighlight': withAlpha(accentHex, '70'),
      'minimap.selectionHighlight': withAlpha(accentHex, '55'),
      'minimap.errorHighlight': withAlpha(dangerHex, '99'),
      'minimap.warningHighlight': withAlpha(warningHex, '99'),
      'minimapSlider.background': withAlpha(accentHex, '18'),
      'minimapSlider.hoverBackground': withAlpha(accentHex, '2e'),
      'minimapSlider.activeBackground': withAlpha(accentHex, '45'),
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': withAlpha(accentHex, '28'),
      'scrollbarSlider.hoverBackground': withAlpha(accentHex, '48'),
      'scrollbarSlider.activeBackground': withAlpha(accentHex, '68'),
      'editorOverviewRuler.background': '#00000000',
      'editorOverviewRuler.border': '#00000000',
      'editorOverviewRuler.findMatchForeground': withAlpha(accentHex, '80'),
      'editorOverviewRuler.rangeHighlightForeground': withAlpha(accentHex, '45'),
      'editorOverviewRuler.selectionHighlightForeground': withAlpha(accentHex, '55'),
      'editorOverviewRuler.wordHighlightForeground': withAlpha(accentHex, '45'),
      'editorOverviewRuler.wordHighlightStrongForeground': withAlpha(accentHex, '66'),
      'editorOverviewRuler.modifiedForeground': withAlpha(warningHex, '88'),
      'editorOverviewRuler.addedForeground': withAlpha(successHex, '88'),
      'editorOverviewRuler.deletedForeground': withAlpha(dangerHex, '88'),
      'editorOverviewRuler.errorForeground': withAlpha(dangerHex, 'cc'),
      'editorOverviewRuler.warningForeground': withAlpha(warningHex, 'cc'),
      'editorOverviewRuler.infoForeground': withAlpha(accentHex, '88'),
      'diffEditor.insertedTextBackground': withAlpha(successHex, '26'),
      'diffEditor.removedTextBackground': withAlpha(dangerHex, '26'),
      'diffEditor.insertedLineBackground': withAlpha(successHex, '14'),
      'diffEditor.removedLineBackground': withAlpha(dangerHex, '14'),
      'diffEditor.diagonalFill': withAlpha(darkTextHex, '08'),
      'diffEditorOverview.insertedForeground': withAlpha(successHex, '88'),
      'diffEditorOverview.removedForeground': withAlpha(dangerHex, '88'),
    },
  });

  monaco.editor.defineTheme('sanctuary-glass-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: lightTextHex.slice(1) },
      { token: 'string', foreground: lightSubtextHex.slice(1) },
      { token: 'string.key.json', foreground: accentHex.slice(1) },
      { token: 'string.value.json', foreground: lightTextHex.slice(1) },
      { token: 'keyword', foreground: accentHex.slice(1) },
      { token: 'number', foreground: lightNumberHex.slice(1) },
      { token: 'boolean', foreground: lightBooleanHex.slice(1) },
      { token: 'comment', foreground: lightSubtextHex.slice(1), fontStyle: 'italic' },
      { token: 'type', foreground: successHex.slice(1) },
      { token: 'identifier', foreground: lightTextHex.slice(1) },
    ],
    colors: {
      'editor.background': '#00000000',
      'editor.foreground': lightTextHex,
      'editor.lineHighlightBackground': withAlpha(accentHex, '10'),
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': withAlpha(accentHex, '28'),
      'editor.inactiveSelectionBackground': withAlpha(accentHex, '14'),
      'editor.findMatchBackground': withAlpha(accentHex, '30'),
      'editor.findMatchHighlightBackground': withAlpha(accentHex, '1a'),
      'editor.findMatchBorder': withAlpha(accentHex, '75'),
      'editor.findMatchHighlightBorder': withAlpha(accentHex, '38'),
      'editorLineNumber.foreground': withAlpha(lightSubtextHex, '78'),
      'editorLineNumber.activeForeground': accentHex,
      'editorIndentGuide.background': withAlpha(lightTextHex, '12'),
      'editorIndentGuide.activeBackground': withAlpha(accentHex, '45'),
      'editorStickyScroll.background': withAlpha(lightSurfaceHex, 'd8'),
      'editorStickyScrollHover.background': withAlpha(accentHex, '1c'),
      'editorStickyScroll.border': withAlpha(lightTextHex, '18'),
      'editorStickyScroll.shadow': '#00000014',
      'editorWidget.background': withAlpha(lightSurfaceHex, 'e6'),
      'editorWidget.foreground': lightTextHex,
      'editorWidget.border': withAlpha(accentHex, '35'),
      'editorWidget.resizeBorder': withAlpha(accentHex, '50'),
      'editorSuggestWidget.background': withAlpha(lightSurfaceHex, 'f0'),
      'editorSuggestWidget.border': withAlpha(accentHex, '35'),
      'editorSuggestWidget.foreground': lightTextHex,
      'editorSuggestWidget.selectedBackground': withAlpha(accentHex, '24'),
      'editorSuggestWidget.highlightForeground': accentHex,
      'editorHoverWidget.background': withAlpha(lightSurfaceHex, 'f2'),
      'editorHoverWidget.foreground': lightTextHex,
      'editorHoverWidget.border': withAlpha(accentHex, '40'),
      'editorHoverWidget.statusBarBackground': withAlpha(lightSurfaceHex, 'e6'),
      'quickInput.background': withAlpha(lightSurfaceHex, 'eb'),
      'quickInput.foreground': lightTextHex,
      'quickInputTitle.background': withAlpha(lightSurfaceHex, '80'),
      'quickInputList.focusBackground': withAlpha(accentHex, '24'),
      'quickInputList.focusForeground': accentHex,
      'list.activeSelectionBackground': withAlpha(accentHex, '24'),
      'list.activeSelectionForeground': accentHex,
      'list.hoverBackground': withAlpha(accentHex, '14'),
      'list.hoverForeground': lightTextHex,
      'list.focusBackground': withAlpha(accentHex, '20'),
      'input.background': withAlpha(lightTextHex, '0a'),
      'input.foreground': lightTextHex,
      'input.border': withAlpha(lightTextHex, '1c'),
      'input.placeholderForeground': withAlpha(lightSubtextHex, '99'),
      'inputOption.activeBackground': withAlpha(accentHex, '22'),
      'inputOption.activeBorder': withAlpha(accentHex, '55'),
      'inputOption.activeForeground': accentHex,
      'inputOption.hoverBackground': withAlpha(accentHex, '14'),
      'focusBorder': withAlpha(accentHex, '50'),
      'minimap.background': '#00000000',
      'minimap.findMatchHighlight': withAlpha(accentHex, '66'),
      'minimap.selectionHighlight': withAlpha(accentHex, '48'),
      'minimap.errorHighlight': withAlpha(dangerHex, '99'),
      'minimap.warningHighlight': withAlpha(warningHex, '99'),
      'minimapSlider.background': withAlpha(accentHex, '16'),
      'minimapSlider.hoverBackground': withAlpha(accentHex, '28'),
      'minimapSlider.activeBackground': withAlpha(accentHex, '3c'),
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': withAlpha(accentHex, '24'),
      'scrollbarSlider.hoverBackground': withAlpha(accentHex, '40'),
      'scrollbarSlider.activeBackground': withAlpha(accentHex, '60'),
      'editorOverviewRuler.background': '#00000000',
      'editorOverviewRuler.border': '#00000000',
      'editorOverviewRuler.findMatchForeground': withAlpha(accentHex, '75'),
      'editorOverviewRuler.rangeHighlightForeground': withAlpha(accentHex, '40'),
      'editorOverviewRuler.selectionHighlightForeground': withAlpha(accentHex, '50'),
      'editorOverviewRuler.wordHighlightForeground': withAlpha(accentHex, '40'),
      'editorOverviewRuler.wordHighlightStrongForeground': withAlpha(accentHex, '60'),
      'editorOverviewRuler.modifiedForeground': withAlpha(warningHex, '88'),
      'editorOverviewRuler.addedForeground': withAlpha(successHex, '88'),
      'editorOverviewRuler.deletedForeground': withAlpha(dangerHex, '88'),
      'editorOverviewRuler.errorForeground': withAlpha(dangerHex, 'cc'),
      'editorOverviewRuler.warningForeground': withAlpha(warningHex, 'cc'),
      'editorOverviewRuler.infoForeground': withAlpha(accentHex, '88'),
      'diffEditor.insertedTextBackground': withAlpha(successHex, '28'),
      'diffEditor.removedTextBackground': withAlpha(dangerHex, '22'),
      'diffEditor.insertedLineBackground': withAlpha(successHex, '14'),
      'diffEditor.removedLineBackground': withAlpha(dangerHex, '12'),
      'diffEditor.diagonalFill': withAlpha(lightTextHex, '08'),
      'diffEditorOverview.insertedForeground': withAlpha(successHex, '88'),
      'diffEditorOverview.removedForeground': withAlpha(dangerHex, '88'),
    },
  });
}

export function useSanctuaryMonacoTheme(currentTheme: any, isLight?: boolean) {
  useEffect(() => {
    const monaco = (window as any).monaco;
    if (!monaco?.editor?.defineTheme) return;
    defineSanctuaryMonacoThemes(monaco, currentTheme);
    const resolvedLight = isLight !== undefined ? isLight : isThemeLight(currentTheme);
    monaco.editor.setTheme(resolvedLight ? 'sanctuary-glass-light' : 'sanctuary-glass-dark');
  }, [currentTheme, isLight]);
}

