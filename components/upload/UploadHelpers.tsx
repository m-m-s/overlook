import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BATCH_OPTIONS } from '@/lib/useUploadFlow';
import type { FontSet, Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';

export const PageHeader = ({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  return (
    <View style={styles.pageHeader}>
      <Pressable onPress={onBack} hitSlop={12} style={({ pressed }) => [{ padding: 4 }, pressed && { opacity: 0.75 }]}>
        <Ionicons name="arrow-back" size={22} color={c.ink} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.h1}>{title}</Text>
        {subtitle ? <Text style={styles.reviewSub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
};

export const BatchSlider = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) => {
  const idx = Math.max(0, BATCH_OPTIONS.indexOf(value as typeof BATCH_OPTIONS[number]));
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  return (
    <View style={styles.sliderWrap}>
      <View style={styles.sliderTrack} />
      <View style={[styles.sliderFill, { width: `${(idx / (BATCH_OPTIONS.length - 1)) * 100}%` }]} />
      <View style={styles.sliderDots}>
        {BATCH_OPTIONS.map((n, i) => {
          const selected = i === idx;
          return (
            <Pressable key={n} onPress={() => onChange(n)} hitSlop={16} style={({ pressed }) => [styles.sliderDotHit, pressed && { opacity: 0.75 }]}>
              <View style={[styles.sliderDot, selected && styles.sliderDotOn]} />
              <Text style={[styles.sliderDotLabel, selected && styles.sliderDotLabelOn]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

export const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    center: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.parchment },

    h1: { fontFamily: f.displayMedium, fontSize: 26, color: c.ink, letterSpacing: -0.4 },
    body: { fontSize: 14, color: c.ink, marginTop: 12, textAlign: 'center' },
    subtle: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: c.inkMuted, marginTop: 6 },
    subtleSmall: { fontSize: 11, color: c.inkMuted, marginTop: 24, fontStyle: 'italic' },
    batteryHint: { fontSize: 11, color: c.inkMuted, marginTop: 28, fontStyle: 'italic', textAlign: 'center' },

    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      width: '100%',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderStyle: 'dashed',
      borderColor: c.ink,
      marginTop: 18,
    },
    statLabel: { fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: c.inkMuted },
    statValue: { fontFamily: f.displayMedium, fontSize: 28, color: c.ink },

    pageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 56,
      paddingBottom: 12,
      gap: 14,
      backgroundColor: c.parchment,
    },

    sliderWrap: { height: 56, width: '100%', marginTop: 16, justifyContent: 'center' },
    sliderTrack: { position: 'absolute', left: 8, right: 8, top: 18, height: 2, backgroundColor: c.divider },
    sliderFill: { position: 'absolute', left: 8, top: 18, height: 2, backgroundColor: c.ink },
    sliderDots: { flexDirection: 'row', justifyContent: 'space-between' },
    sliderDotHit: { width: 36, alignItems: 'center', paddingVertical: 8 },
    sliderDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.parchment },
    sliderDotOn: { backgroundColor: c.ink, transform: [{ scale: 1.3 }] },
    sliderDotLabel: { marginTop: 6, fontSize: 11, color: c.inkMuted },
    sliderDotLabelOn: { color: c.ink, fontWeight: '600' },

    btn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 4 },
    btnPrimary: { backgroundColor: c.ink },
    btnPrimaryText: { color: c.parchment, fontSize: 15, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: '600' },
    btnSecondary: { borderWidth: 1, borderColor: c.ink },
    btnSecondaryText: { color: c.ink, fontSize: 15, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: '600' },
    btnGhost: { paddingVertical: 14, alignItems: 'center' },
    btnGhostText: { color: c.inkMuted, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', textDecorationLine: 'underline' },
    cancelLink: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: c.inkMuted, textDecorationLine: 'underline' },
    doneBtn: { flex: 0, alignSelf: 'center', marginTop: 14, paddingHorizontal: 32, minWidth: 220 },

    reviewSub: { fontFamily: f.italic, fontSize: 13, color: c.inkMuted, marginTop: 6, marginBottom: 8 },

    batchBox: {
      marginTop: 28, marginBottom: 12, paddingVertical: 16, paddingHorizontal: 18,
      borderWidth: 1, borderColor: c.ink, borderRadius: 12, alignItems: 'center',
    },
    batchTitle: { fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: c.inkMuted },
    batchValue: { fontFamily: f.displayMedium, fontSize: 32, color: c.ink, marginTop: 2 },
    batchSub: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: c.inkMuted, marginBottom: 10 },

    reviewCell: { flex: 1 / 4, aspectRatio: 4 / 5, backgroundColor: c.divider },
    reviewImg: { width: '100%', height: '100%' },
    reviewOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
    },

    reviewFooter: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: c.parchment, paddingTop: 12, paddingHorizontal: 20,
      borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.divider,
    },
    selectAllRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
    selectAllLink: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: c.inkMuted, textDecorationLine: 'underline' },
    selectAllSep: { color: c.divider, fontSize: 11 },
    footerCount: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: c.inkMuted, marginBottom: 10, textAlign: 'center' },
    footerBtnRow: { flexDirection: 'row', gap: 10 },

    progressTrack: { marginTop: 24, width: '100%', maxWidth: 320, height: 4, backgroundColor: c.divider, borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: c.ink },

    pauseBtn: {
      marginTop: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 36, paddingVertical: 14, borderRadius: 4, borderWidth: 1.5, borderColor: c.ink, minWidth: 200,
    },
    pauseBtnResume: { backgroundColor: c.ink },
    pauseBtnText: { color: c.ink, fontSize: 16, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: '700' },
    pauseBtnTextOn: { color: c.parchment },
    stopLink: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: '#C0392B', textDecorationLine: 'underline' },
  });
