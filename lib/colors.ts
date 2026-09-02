// Palette per CLAUDE.md visual design language.
// `colors` is the legacy direct-import escape hatch — it always points at the
// light palette. New code (and progressive refactors) should use the theme
// context (`useColors()` from `@/lib/themeContext`) so the app responds to
// the user's theme choice (light / dark / system).

export type Palette = {
  parchment: string;
  parchmentSoft: string;
  parchmentDark: string;
  ink: string;
  inkSoft: string;
  inkMuted: string;
  divider: string;
  accent: string;
};

// Font-family tokens swap with the theme. Key names are slot-based ("display"
// = page titles + section heads, "italic" = editorial flourishes, "body" =
// paragraph text and UI labels). Each slot maps to a real font family that
// the theme's preset uses.
export type FontSet = {
  display: string;
  displayMedium: string;
  displaySemiBold: string;
  italic: string;
  body: string;
  bodyMedium: string;
};

// Editorial: Playfair serif headings + system sans body. Default, matches
// CLAUDE.md spec ("Serif (Georgia or similar) for titles ... System sans-
// serif for labels"). Playfair is loaded in app/_layout.tsx via useFonts.
export const editorialFonts: FontSet = {
  display: 'PlayfairDisplay_400Regular',
  displayMedium: 'PlayfairDisplay_500Medium',
  displaySemiBold: 'PlayfairDisplay_600SemiBold',
  italic: 'PlayfairDisplay_400Regular_Italic',
  body: 'System',
  bodyMedium: 'System',
};

// Modern: pure system sans throughout. Cleaner, less editorial.
export const modernFonts: FontSet = {
  display: 'System',
  displayMedium: 'System',
  displaySemiBold: 'System',
  italic: 'System',
  body: 'System',
  bodyMedium: 'System',
};

// Mono: monospace headings (typewriter feel) + serif body. A bit punk.
export const monoFonts: FontSet = {
  display: 'monospace',
  displayMedium: 'monospace',
  displaySemiBold: 'monospace',
  italic: 'PlayfairDisplay_400Regular_Italic',
  body: 'serif',
  bodyMedium: 'serif',
};

export const lightPalette: Palette = {
  parchment: '#EFEEEA',
  parchmentSoft: '#E5E2DA',
  parchmentDark: '#1F1E1B',
  ink: '#2C2A26',
  inkSoft: '#3A3733',
  inkMuted: '#585551',
  divider: '#C9C5BC',
  accent: '#9B6B4A',
};

// Dark palette per CLAUDE.md "Dark variant for dark theme: TBD".
// First pass: invert ink/parchment, soften the contrast on dividers, keep
// the warm accent + status/urgency hues so the editorial vibe survives.
export const darkPalette: Palette = {
  parchment: '#1F1E1B',
  parchmentSoft: '#26241F',
  parchmentDark: '#EFEEEA',
  ink: '#EBE9E2',
  inkSoft: '#D6D3CB',
  inkMuted: '#9B968E',
  divider: '#3A3733',
  accent: '#C8916A',
};

// Active theme state — mutated by ThemeProvider on theme change. Components
// that import `colors` / `fonts` directly read through these proxies so
// they always see the current values without converting to a hook.
// ThemeProvider re-keys the navigator on change so all StyleSheets rebuild
// against the new tokens.
let activePalette: Palette = lightPalette;
let activeFonts: FontSet = editorialFonts;

export const setActivePalette = (p: Palette) => {
  activePalette = p;
};
export const setActiveFonts = (f: FontSet) => {
  activeFonts = f;
};

const PALETTE_KEYS: (keyof Palette)[] = [
  'parchment',
  'parchmentSoft',
  'parchmentDark',
  'ink',
  'inkSoft',
  'inkMuted',
  'divider',
  'accent',
];

const FONT_KEYS: (keyof FontSet)[] = [
  'display',
  'displayMedium',
  'displaySemiBold',
  'italic',
  'body',
  'bodyMedium',
];

const colorTarget = {} as Palette;
for (const k of PALETTE_KEYS) {
  Object.defineProperty(colorTarget, k, {
    enumerable: true,
    get() {
      return activePalette[k];
    },
  });
}
export const colors = colorTarget as Palette;

const fontTarget = {} as FontSet;
for (const k of FONT_KEYS) {
  Object.defineProperty(fontTarget, k, {
    enumerable: true,
    get() {
      return activeFonts[k];
    },
  });
}
export const fonts = fontTarget as FontSet;

// Default (editorial) status palette — left side of top edge gradient.
const defaultStatusColors: Record<string, string> = {
  ready: '#7A8B5C', // olive
  supplies: '#B5704A', // terracotta
  in_progress: '#9B7A8B', // dusty mauve
  research: '#6B7C85', // faded slate
  done: 'transparent',
};

// Default (editorial) urgency palette — right side of top edge gradient
// (warm temperature scale, hotter = more urgent).
const defaultUrgencyColors: Record<string, string> = {
  overdue: '#A93226', // deep red — past deadline
  today: '#C0392B', // warm red
  expires_soon: '#C0392B',
  this_week: '#D87538', // warm orange
  this_month: '#C9A14B', // warm gold
  this_season: '#C9A14B',
  this_year: '#B5A485', // faded warm
  someday: '#B5A485',
};

// Colour-blind safe status palette — Wong (Nature, 2011) palette adapted
// for status meaning. Distinguishable under protanopia / deuteranopia /
// tritanopia. Replaces red/green collisions with vermillion/blue/yellow.
const colorBlindStatusColors: Record<string, string> = {
  ready: '#009E73',       // bluish green
  supplies: '#D55E00',    // vermillion
  in_progress: '#CC79A7', // reddish purple
  research: '#56B4E9',    // sky blue
  done: 'transparent',
};

// Colour-blind safe urgency palette — Wong palette ordered hot→cool.
// Vermillion (today) → orange (this week) → yellow (this month) →
// blue (this year / someday) so urgency reads as a temperature ramp
// distinguishable for all common color-vision deficiencies.
const colorBlindUrgencyColors: Record<string, string> = {
  overdue: '#882255', // deep purple — distinct from all urgency colors
  today: '#D55E00',        // vermillion
  expires_soon: '#D55E00',
  this_week: '#E69F00',    // orange
  this_month: '#F0E442',   // yellow
  this_season: '#F0E442',
  this_year: '#0072B2',    // blue (cool = distant)
  someday: '#0072B2',
};

// Active runtime status / urgency tables — swapped by ThemeProvider when
// the user picks a colour-blind variant. Proxied so module-scope
// `import { statusColors }` callers always see the active table.
let activeStatusColors: Record<string, string> = defaultStatusColors;
let activeUrgencyColors: Record<string, string> = defaultUrgencyColors;

export const setActiveStatusColors = (next: Record<string, string>) => {
  activeStatusColors = next;
};
export const setActiveUrgencyColors = (next: Record<string, string>) => {
  activeUrgencyColors = next;
};

export const STATUS_PALETTES = {
  default: defaultStatusColors,
  colorBlind: colorBlindStatusColors,
};
export const URGENCY_PALETTES = {
  default: defaultUrgencyColors,
  colorBlind: colorBlindUrgencyColors,
};

const STATUS_KEYS = ['ready', 'supplies', 'in_progress', 'research', 'done'];
const URGENCY_KEYS = [
  'overdue', 'today', 'expires_soon', 'this_week', 'this_month', 'this_season', 'this_year', 'someday',
];

const statusTarget: Record<string, string> = {};
for (const k of STATUS_KEYS) {
  Object.defineProperty(statusTarget, k, {
    enumerable: true,
    get() {
      return activeStatusColors[k];
    },
  });
}
const urgencyTarget: Record<string, string> = {};
for (const k of URGENCY_KEYS) {
  Object.defineProperty(urgencyTarget, k, {
    enumerable: true,
    get() {
      return activeUrgencyColors[k];
    },
  });
}
export const statusColors: Record<string, string> = statusTarget;
export const urgencyColors: Record<string, string> = urgencyTarget;
