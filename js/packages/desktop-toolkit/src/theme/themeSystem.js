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

export function resolveEdgeMeltVariables(colors /* options reserved */) {
  // Continuous-surface model. The app reads as one warm material with
  // raised panels on top, not as a sidebar+workspace rectangle split.
  // Shell, sidebar, topbar share the darkest level; content-bg sits
  // just barely above shell; panels lift to surface-level. The chrome→
  // workspace transition is handled by a single mechanism: the workspace
  // blend (two 4-stop linear fades on workspace background). No bridge
  // seams, no corner anchor, no accent radials.

  // ── Semantic surface hierarchy ────────────────────────────────────
  // These are the tokens consumer apps should consume. The raw palette
  // tokens (--ch-bg, --ch-surface) remain available but consumer pages
  // should prefer these semantic ones for forward-compatibility.
  const shellBg = colors.bg;
  const sidebarBg = colors.bg;
  const topbarBg = colors.bg;
  // Content is ~12% of the way from bg to surface — connected to shell,
  // not dramatically lighter. Workspace reads as a continuation of the
  // chrome rather than a separate rectangle.
  const contentBg = mixHex(colors.bg, colors.surface, 0.12);
  // Panels lift toward surface (~85% mix), giving cards/widgets clear
  // elevation against the content background.
  const panelBg = mixHex(colors.bg, colors.surface, 0.85);
  const panelBorder = withAlpha(colors.accent, 0.16);
  const borderSoft = withAlpha(colors.border, 0.42);
  const accentMuted = withAlpha(colors.accent, 0.16);

  // ── Semantic typography tokens ────────────────────────────────────
  // Three semantic font roles. Match the shell's current fonts exactly
  // — no visual change. These exist as tokens so a future independent
  // typography axis (planned: `[data-font-style="default|technical|lofi"]`)
  // can override font choice per mood without touching the color palette.
  // See preview's "How to keep this living" section for the planned axis.
  const fontDisplay = "'Instrument Serif', Georgia, serif";
  const fontUi = "'DM Sans', system-ui, sans-serif";
  const fontMono = "'JetBrains Mono', ui-monospace, monospace";

  // ── Seam / active tokens ──────────────────────────────────────────
  const seamSoft = borderSoft;
  const seamWarm = withAlpha(colors.accent, 0.14);
  const activeFill = withAlpha(colors.border, 0.46);
  const activeFillSoft = withAlpha(colors.border, 0.18);

  // Active item background: structured 3-stop gradient. Warm accent
  // wash on the left, border-fill in the body, lighter border-fill on
  // the right edge. Stays a defined rounded rectangle.
  const activeBgCss =
    `linear-gradient(90deg, ${seamWarm} 0%, ` +
    `${activeFill} 12%, ${activeFillSoft} 100%)`;

  // ── Divider variants ──────────────────────────────────────────────
  // Content divider: soft full-width accent line. Optional visual pause
  // for workspace content; should never dominate. Consumer pages opt
  // in by applying .ch-content-divider — never forced globally.
  const contentDividerCss =
    `linear-gradient(90deg, transparent, ` +
    `${withAlpha(colors.accent, 0.22)}, transparent)`;

  // Section title accent: short trailing accent line beside a heading.
  // Used as the PRIMARY rhythm for content sections (via section
  // heading ::after), with hard dividers reserved for occasional use.
  const sectionTitleAccentCss =
    `linear-gradient(90deg, ` +
    `${withAlpha(colors.accent, 0.22)}, transparent)`;

  // ── Workspace corner blend ────────────────────────────────────────
  // Two 4-stop linear gradients painted on the workspace background.
  // Stop alphas mirror a color-mix mental model — at x=0 the workspace
  // is effectively 70% sidebar-bg / 30% content-bg (seam nearly
  // invisible), gradually transitioning to 100% content-bg over 420px.
  // Topbar mirrors with its own 4-stop fade over 320px.
  //
  // Both gradients stay at chrome RGB throughout, varying alpha only.
  // Final stop is chrome-at-zero-alpha (NOT the "transparent" keyword,
  // which resolves to rgba(0,0,0,0) and would darken interpolation
  // toward black). With content-bg as the underlying background-color,
  // both gradients composite cleanly — each contributes chrome warmth
  // at its respective edge, and they overlap at the L-corner without
  // creating a hot spot.
  //
  // Apps with different sidebarBg / topbarBg / contentBg automatically
  // get a clean blend bridge — change any palette token and the gradient
  // re-derives. No assumption that sidebar and topbar share a color.
  const workspaceBlendCss =
    `linear-gradient(90deg, ` +
    `${withAlpha(sidebarBg, 0.70)} 0px, ` +
    `${withAlpha(sidebarBg, 0.38)} 140px, ` +
    `${withAlpha(sidebarBg, 0.16)} 280px, ` +
    `${withAlpha(sidebarBg, 0)} 420px), ` +
    `linear-gradient(180deg, ` +
    `${withAlpha(topbarBg, 0.65)} 0px, ` +
    `${withAlpha(topbarBg, 0.32)} 120px, ` +
    `${withAlpha(topbarBg, 0.12)} 240px, ` +
    `${withAlpha(topbarBg, 0)} 320px)`;

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
