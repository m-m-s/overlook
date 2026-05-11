import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import {
  darkPalette,
  editorialFonts,
  lightPalette,
  modernFonts,
  monoFonts,
  setActiveFonts,
  setActivePalette,
  setActiveStatusColors,
  setActiveUrgencyColors,
  STATUS_PALETTES,
  URGENCY_PALETTES,
  type FontSet,
  type Palette,
} from './colors';
import { useThemeChoice, type ThemeChoice } from './settings';

type Resolved = {
  palette: Palette;
  fonts: FontSet;
  /** Which palette family the theme renders as ('light' / 'dark'). */
  shade: 'light' | 'dark';
  /** Whether the theme uses the colour-blind safe status/urgency hues. */
  colorBlind: boolean;
};

const resolve = (choice: ThemeChoice, system: 'light' | 'dark' | null): Resolved => {
  if (choice === 'system') {
    return system === 'dark'
      ? { palette: darkPalette, fonts: editorialFonts, shade: 'dark', colorBlind: false }
      : { palette: lightPalette, fonts: editorialFonts, shade: 'light', colorBlind: false };
  }
  if (choice === 'editorial-light') {
    return { palette: lightPalette, fonts: editorialFonts, shade: 'light', colorBlind: false };
  }
  if (choice === 'editorial-dark') {
    return { palette: darkPalette, fonts: editorialFonts, shade: 'dark', colorBlind: false };
  }
  if (choice === 'modern-light') {
    return { palette: lightPalette, fonts: modernFonts, shade: 'light', colorBlind: false };
  }
  if (choice === 'modern-dark') {
    return { palette: darkPalette, fonts: modernFonts, shade: 'dark', colorBlind: false };
  }
  if (choice === 'mono-light') {
    return { palette: lightPalette, fonts: monoFonts, shade: 'light', colorBlind: false };
  }
  if (choice === 'accessible-light') {
    return { palette: lightPalette, fonts: editorialFonts, shade: 'light', colorBlind: true };
  }
  if (choice === 'accessible-dark') {
    return { palette: darkPalette, fonts: editorialFonts, shade: 'dark', colorBlind: true };
  }
  return { palette: lightPalette, fonts: editorialFonts, shade: 'light', colorBlind: false };
};

type Ctx = {
  palette: Palette;
  fonts: FontSet;
  shade: 'light' | 'dark';
  choice: ThemeChoice;
  setChoice: (next: ThemeChoice) => void;
  /** Increments whenever the theme changes. Use as a `key` to force
   *  re-mount of subtrees that have StyleSheet.create snapshots. */
  themeVersion: number;
};

const ThemeCtx = createContext<Ctx | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [choice, setChoice] = useThemeChoice();
  const system = useColorScheme(); // 'light' | 'dark' | null
  const resolved = resolve(choice, system === 'dark' ? 'dark' : 'light');

  // Mirror to module-level mutables so legacy `import { colors }` /
  // `import { fonts }` / `import { statusColors }` reads see the active
  // theme too. Done in an effect so it runs on mount + every change.
  useEffect(() => {
    setActivePalette(resolved.palette);
    setActiveFonts(resolved.fonts);
    setActiveStatusColors(
      resolved.colorBlind ? STATUS_PALETTES.colorBlind : STATUS_PALETTES.default,
    );
    setActiveUrgencyColors(
      resolved.colorBlind ? URGENCY_PALETTES.colorBlind : URGENCY_PALETTES.default,
    );
  }, [resolved.palette, resolved.fonts, resolved.colorBlind]);

  // Bump an incrementing counter on each theme change so consumers can re-key
  // StyleSheet-heavy trees (the navigator wraps with this). Using a ref so the
  // factory genuinely consumes the counter and the linter doesn't flag the deps
  // as unnecessary.
  const themeVersionRef = useRef(0);
  const themeVersion = useMemo(
    () => { themeVersionRef.current += 1; return themeVersionRef.current; },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolved.palette, resolved.fonts, resolved.colorBlind],
  );

  const value: Ctx = useMemo(
    () => ({
      palette: resolved.palette,
      fonts: resolved.fonts,
      shade: resolved.shade,
      choice,
      setChoice,
      themeVersion,
    }),
    [resolved, choice, setChoice, themeVersion],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
};

export const useColors = (): Palette => {
  const ctx = useContext(ThemeCtx);
  return ctx?.palette ?? lightPalette;
};

export const useFonts = (): FontSet => {
  const ctx = useContext(ThemeCtx);
  return ctx?.fonts ?? editorialFonts;
};

export const useThemeMode = (): Ctx => {
  const ctx = useContext(ThemeCtx);
  if (!ctx) {
    return {
      palette: lightPalette,
      fonts: editorialFonts,
      shade: 'light',
      choice: 'editorial-light',
      setChoice: () => {},
      themeVersion: 0,
    };
  }
  return ctx;
};
