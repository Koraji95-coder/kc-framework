const THEME_STORAGE_KEY = 'ch19.desktop-toolkit.theme.v1';

export const TOOLKIT_PALETTES = [
  {
    id: 'forge',
    name: 'Forge Classic',
    description: 'Warm industrial defaults aligned with Chamber-19 design tokens.',
    colors: {
      bg: '#1C1B19',
      surface: '#2B2926',
      text: '#EFEAE2',
      muted: '#A39A8D',
      accent: '#C4884D',
      accentText: '#1C1B19',
      border: '#4A4238',
      success: '#6B9E6B',
      warning: '#C4A24D',
      error: '#B85C5C',
      info: '#5C8EB8',
    },
  },
  {
    id: 'harbor',
    name: 'Harbor Steel',
    description: 'Cool steel blues and higher-contrast drafting accents.',
    colors: {
      bg: '#12202B',
      surface: '#1B3342',
      text: '#E9F1F5',
      muted: '#9AB2BF',
      accent: '#58A8E0',
      accentText: '#10202A',
      border: '#32566B',
      success: '#5FA88A',
      warning: '#C9A155',
      error: '#CC6E6E',
      info: '#7FB9E5',
    },
  },
  {
    id: 'kiln',
    name: 'Kiln Ember',
    description: 'Terracotta + clay tones for control-heavy workflows.',
    colors: {
      bg: '#271D18',
      surface: '#3A2A22',
      text: '#F4EEE8',
      muted: '#B7A598',
      accent: '#E06F3C',
      accentText: '#2A1B14',
      border: '#6A493A',
      success: '#7FB36C',
      warning: '#D3A14A',
      error: '#D86A62',
      info: '#73A8D9',
    },
  },
  {
    id: 'meadowline',
    name: 'Meadowline Draft',
    description: 'Graphite neutrals with green signal accents.',
    colors: {
      bg: '#1A1E1A',
      surface: '#273026',
      text: '#ECF2E9',
      muted: '#A6B6A0',
      accent: '#7DB86F',
      accentText: '#162016',
      border: '#425340',
      success: '#6CB67A',
      warning: '#CFB05B',
      error: '#C96868',
      info: '#6FA4CE',
    },
  },
];

export const TOOLKIT_THEME_FIELDS = [
  { key: 'bg', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Muted text' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentText', label: 'Accent text' },
  { key: 'border', label: 'Border' },
  { key: 'success', label: 'Success' },
  { key: 'warning', label: 'Warning' },
  { key: 'error', label: 'Error' },
  { key: 'info', label: 'Info' },
];

const DEFAULT_PALETTE = TOOLKIT_PALETTES[0];

function clonePaletteColors(paletteId) {
  const palette = TOOLKIT_PALETTES.find((item) => item.id === paletteId) || DEFAULT_PALETTE;
  return { ...palette.colors };
}

function normalizeHex(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return /^#([0-9A-Fa-f]{6})$/.test(trimmed) ? trimmed.toUpperCase() : fallback;
}

export function getDefaultToolkitThemeState() {
  return {
    paletteId: DEFAULT_PALETTE.id,
    useCustomColors: false,
    customColors: clonePaletteColors(DEFAULT_PALETTE.id),
  };
}

export function loadToolkitThemeState(storageKey = THEME_STORAGE_KEY) {
  const fallback = getDefaultToolkitThemeState();

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    const paletteId = TOOLKIT_PALETTES.some((item) => item.id === parsed?.paletteId)
      ? parsed.paletteId
      : fallback.paletteId;

    const baseColors = clonePaletteColors(paletteId);
    const customColors = { ...baseColors };

    for (const field of TOOLKIT_THEME_FIELDS) {
      customColors[field.key] = normalizeHex(parsed?.customColors?.[field.key], baseColors[field.key]);
    }

    return {
      paletteId,
      useCustomColors: Boolean(parsed?.useCustomColors),
      customColors,
    };
  } catch {
    return fallback;
  }
}

export function saveToolkitThemeState(themeState, storageKey = THEME_STORAGE_KEY) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(themeState));
  } catch {
    // Fail open when localStorage is unavailable.
  }
}

export function resolveToolkitTheme(themeState) {
  const palette = TOOLKIT_PALETTES.find((item) => item.id === themeState.paletteId) || DEFAULT_PALETTE;
  const colors = themeState.useCustomColors
    ? { ...palette.colors, ...themeState.customColors }
    : { ...palette.colors };

  return {
    palette,
    colors,
  };
}

export function applyToolkitThemeVariables(theme, target = document.documentElement) {
  if (!target || !theme?.colors) {
    return;
  }

  for (const [key, value] of Object.entries(theme.colors)) {
    target.style.setProperty(`--ch-${key}`, value);
  }

  // Derive and apply edge-melt variables from the resolved palette. These
  // give the canonical app shell its soft chrome/surface transitions —
  // bridge gradient, topbar inner glow, triple-junction corner anchor,
  // active sidebar-item bleed. Re-derived on every palette swap so the
  // chrome stays cohesive without consumer-app intervention.
  const edgeMelt = resolveEdgeMeltVariables(theme.colors);
  for (const [name, value] of Object.entries(edgeMelt)) {
    target.style.setProperty(name, value);
  }
}

// ── Edge-melt color math ─────────────────────────────────────────────
// Promoted from the standalone ch19-ui-transition-engine. All output
// flows into --ch-* variables so there is one token namespace across
// the toolkit. Consumer apps inherit edge-melt vars for free whenever
// they consume ToolkitThemeProvider.

const HEX_RE = /^#?([0-9a-f]{6})$/i;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function hexToRgb(hex) {
  const match = HEX_RE.exec(hex.trim());
  if (!match) {
    throw new Error(`Edge-melt requires 6-digit hex colors; got: ${hex}`);
  }
  const v = match[1];
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const ch = (n) =>
    Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0').toUpperCase();
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

function mixHex(from, to, amount) {
  const t = clamp01(amount);
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

function rgbChannels(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

function withAlpha(hex, alpha) {
  return `rgb(${rgbChannels(hex)} / ${clamp01(alpha)})`;
}

export function resolveEdgeMeltVariables(_colors /* reserved */, _options = {}) {
  // Derived token values are now CSS EXPRESSIONS that reference the
  // palette CSS variables (--ch-bg, --ch-accent, etc.) rather than
  // pre-computed hex strings. This means [data-app-theme="X"] selectors
  // overriding palette tokens auto-propagate through all derived tokens
  // (content-bg, panel-bg, workspace-blend, active-bg, etc.) without
  // needing to re-run applyToolkitThemeVariables. CSS does the math at
  // paint time.
  //
  // Mixing strategy:
  //   - Solid color blends:  color-mix(in srgb, var(--ch-X) N%, var(--ch-Y))
  //   - Alpha overlays:      rgb(from var(--ch-X) r g b / α)
  //
  // The alpha overlays use relative color syntax (Chromium 119+ / Firefox
  // 113+ / Safari 16.4+) to preserve the source RGB while varying alpha.
  // color-mix(... transparent) would darken through interpolation because
  // it scales both RGB and alpha; relative color syntax does not.
  //
  // The `colors` argument is accepted for backward compat with callers
  // that pass a palette object, but is unused for derived token values.
  // applyToolkitThemeVariables sets the palette tokens (--ch-bg, etc.)
  // from the palette object in JS; this function emits CSS expressions
  // that reference those tokens.

  // ── Semantic surface hierarchy ────────────────────────────────────
  // Consumer apps reference these semantic tokens rather than the raw
  // palette. Apps overriding via [data-app-theme] only need to set the
  // palette tokens (--ch-bg, --ch-surface, --ch-accent, --ch-border);
  // semantic tokens recompute automatically.
  const shellBg = `var(--ch-bg)`;
  const sidebarBg = `var(--ch-bg)`;
  const topbarBg = `var(--ch-bg)`;
  // Content is ~12% of the way from bg to surface — connected to shell,
  // not dramatically lighter.
  const contentBg = `color-mix(in srgb, var(--ch-bg) 88%, var(--ch-surface))`;
  // Panels lift toward surface (~85% mix).
  const panelBg = `color-mix(in srgb, var(--ch-bg) 15%, var(--ch-surface))`;
  const panelBorder = `rgb(from var(--ch-accent) r g b / 0.16)`;
  const borderSoft = `rgb(from var(--ch-border) r g b / 0.42)`;
  const accentMuted = `rgb(from var(--ch-accent) r g b / 0.16)`;

  // ── Semantic typography tokens ────────────────────────────────────
  // Three semantic font roles. Match the shell's current fonts exactly
  // — no visual change. These exist as tokens so a future independent
  // typography axis (planned: `[data-font-style="default|technical|lofi"]`)
  // can override font choice per mood without touching the color palette.
  const fontDisplay = "'Instrument Serif', Georgia, serif";
  const fontUi = "'DM Sans', system-ui, sans-serif";
  const fontMono = "'JetBrains Mono', ui-monospace, monospace";

  // ── Seam / active tokens ──────────────────────────────────────────
  const seamWarm = `rgb(from var(--ch-accent) r g b / 0.14)`;
  const activeFill = `rgb(from var(--ch-border) r g b / 0.46)`;
  const activeFillSoft = `rgb(from var(--ch-border) r g b / 0.18)`;

  // Active item background: 3-stop gradient using relative-color alpha
  // overlays. RGB stays at accent / border throughout — no darkening
  // toward black.
  const activeBgCss =
    `linear-gradient(90deg, ${seamWarm} 0%, ` +
    `${activeFill} 12%, ${activeFillSoft} 100%)`;

  // ── Divider variants ──────────────────────────────────────────────
  // Content divider: soft full-width accent line. Optional visual pause
  // for workspace content. Relative-color syntax preserves accent RGB
  // so fades don't darken through black.
  const contentDividerCss =
    `linear-gradient(90deg, transparent, ` +
    `rgb(from var(--ch-accent) r g b / 0.22), transparent)`;

  // Section title accent: short trailing accent line beside a heading.
  const sectionTitleAccentCss =
    `linear-gradient(90deg, ` +
    `rgb(from var(--ch-accent) r g b / 0.22), transparent)`;

  // ── Workspace corner blend ────────────────────────────────────────
  // Two 4-stop linear gradients painted on the workspace background.
  // Each stop uses relative-color syntax so the RGB tracks the live
  // value of var(--ch-bg) — when an app overrides --ch-bg via
  // [data-app-theme="X"], the entire blend re-derives in CSS without
  // any JS hook.
  //
  // Stop alphas mirror a color-mix mental model — at x=0 the workspace
  // is ~70% chrome-bg over content (seam nearly invisible), gradually
  // transitioning to 0% chrome over 420px. Topbar mirrors over 320px.
  //
  // Endpoints use alpha 0 (NOT the `transparent` keyword) so the RGB
  // stays at chrome throughout the gradient — no darkening toward black
  // at the fade-out edge.
  const workspaceBlendCss =
    `linear-gradient(90deg, ` +
    `rgb(from var(--ch-bg) r g b / 0.70) 0px, ` +
    `rgb(from var(--ch-bg) r g b / 0.38) 140px, ` +
    `rgb(from var(--ch-bg) r g b / 0.16) 280px, ` +
    `rgb(from var(--ch-bg) r g b / 0) 420px), ` +
    `linear-gradient(180deg, ` +
    `rgb(from var(--ch-bg) r g b / 0.65) 0px, ` +
    `rgb(from var(--ch-bg) r g b / 0.32) 120px, ` +
    `rgb(from var(--ch-bg) r g b / 0.12) 240px, ` +
    `rgb(from var(--ch-bg) r g b / 0) 320px)`;

  return {
    // ── Semantic surface hierarchy ─────────────────────────────────
    // Consumer apps prefer these over raw palette tokens.
    '--ch-shell-bg': shellBg,
    '--ch-sidebar-bg': sidebarBg,
    '--ch-topbar-bg': topbarBg,
    '--ch-content-bg': contentBg,
    '--ch-panel-bg': panelBg,
    '--ch-panel-border': panelBorder,
    '--ch-border-soft': borderSoft,
    '--ch-accent-muted': accentMuted,
    '--ch-workspace-blend': workspaceBlendCss,

    // ── Semantic typography tokens (font family only — weight/leading/
    //    tracking will land with the future data-font-style axis) ────
    '--ch-font-display': fontDisplay,
    '--ch-font-ui': fontUi,
    '--ch-font-mono': fontMono,

    // ── Active item ────────────────────────────────────────────────
    // `--ch-seam-*` were emitted earlier as part of the bridge model;
    // bridges are gone, so seam aliases were removed (duplicates of
    // `--ch-border-soft` / `--ch-accent-muted` for the same values).
    // The active-fill tokens are kept for apps building custom active
    // states (dropdowns, tabs, etc.).
    '--ch-active-fill': activeFill,
    '--ch-active-fill-soft': activeFillSoft,
    '--ch-active-bg': activeBgCss,

    // ── Divider variants ───────────────────────────────────────────
    '--ch-content-divider': contentDividerCss,
    '--ch-section-title-accent': sectionTitleAccentCss,
  };
}

export function createToolkitThemeFromPalette(nextPaletteId, previousState) {
  const nextBase = clonePaletteColors(nextPaletteId);
  return {
    ...previousState,
    paletteId: nextPaletteId,
    customColors: previousState.useCustomColors
      ? { ...nextBase, ...previousState.customColors }
      : nextBase,
  };
}
